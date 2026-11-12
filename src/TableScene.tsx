import { useEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';

type Hand = { cards: number[]; bet: number; done: boolean; split: boolean };
type TableProps = {
  hands: Hand[];
  dealer: number[];
  activeHand: number;
  phase: string;
};
type Snapshot = TableProps;
type Engine = { update: (state: Snapshot) => void; dispose: () => void };

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const GOLD = 0xbfa778;
const CARD_WIDTH = 1.04;
const CARD_HEIGHT = 1.49;

// The engine supplies ranks only. Suit symbols are stable decoration, never
// additional information about the physical cards remaining in the shoe.
function cardFace(value: number, index: number) {
  const number = Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
  const suit = index % 4;
  return { rank: RANKS[(number - 1) % 13], suit, red: suit === 1 || suit === 3 };
}

function describeCards(cards: number[]) {
  return cards.length
    ? cards.map((value, index) => cardFace(value, index).rank).join(', ')
    : 'no cards';
}

function displayBet(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas textures are unavailable');
  return { canvas, context };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function createEngine(host: HTMLDivElement, onUnavailable: () => void): Engine {
  let renderer: THREE.WebGLRenderer | undefined;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let frame = 0;
  let disposed = false;
  let observer: ResizeObserver | undefined;
  let removeEvents = () => {};
  const geometry = <T extends THREE.BufferGeometry,>(item: T): T => { geometries.add(item); return item; };
  const material = <T extends THREE.Material,>(item: T): T => { materials.add(item); return item; };
  const texture = (canvas: HTMLCanvasElement) => {
    const item = new THREE.CanvasTexture(canvas);
    item.colorSpace = THREE.SRGBColorSpace;
    item.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    textures.add(item);
    return item;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    removeEvents();
    geometries.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    textures.forEach(item => item.dispose());
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
  };

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    const gl = renderer;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    gl.setClearColor(0x081412, 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.18;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.domElement.setAttribute('aria-hidden', 'true');
    gl.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    host.appendChild(gl.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    const table = new THREE.Group();
    scene.add(table);
    const ambient = new THREE.HemisphereLight(0xe5eee5, 0x101d19, 2.0);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffe5bf, 3.2);
    key.position.set(-3, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 6, bottom: -6, near: 0.5, far: 25 });
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0003;
    key.shadow.radius = 3;
    scene.add(key);
    const rim = new THREE.PointLight(0xa2d8c3, 24, 18, 2);
    rim.position.set(4, 5, -4);
    scene.add(rim);

    const feltCanvas = makeCanvas(512, 512);
    feltCanvas.context.fillStyle = '#124e40';
    feltCanvas.context.fillRect(0, 0, 512, 512);
    let seed = 149;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 22000; i++) {
      feltCanvas.context.fillStyle = random() > 0.5 ? 'rgba(210,235,210,.055)' : 'rgba(0,15,9,.08)';
      feltCanvas.context.fillRect(random() * 512, random() * 512, 1, 1);
    }
    const feltTexture = texture(feltCanvas.canvas);
    feltTexture.wrapS = feltTexture.wrapT = THREE.RepeatWrapping;
    feltTexture.repeat.set(3, 2);
    const felt = material(new THREE.MeshStandardMaterial({ map: feltTexture, roughness: 0.98, color: 0xd0e2d8 }));
    const woodCanvas = makeCanvas(512, 128);
    woodCanvas.context.fillStyle = '#32241e';
    woodCanvas.context.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 160; i++) {
      woodCanvas.context.strokeStyle = `rgba(153,103,65,${0.05 + random() * 0.13})`;
      woodCanvas.context.lineWidth = 0.5 + random() * 1.2;
      woodCanvas.context.beginPath();
      const y = random() * 128;
      woodCanvas.context.moveTo(0, y);
      woodCanvas.context.bezierCurveTo(160, y + random() * 12, 360, y - random() * 12, 512, y);
      woodCanvas.context.stroke();
    }
    const wood = material(new THREE.MeshStandardMaterial({ map: texture(woodCanvas.canvas), roughness: 0.52, metalness: 0.05 }));
    const leather = material(new THREE.MeshStandardMaterial({ color: 0x17231f, roughness: 0.79, metalness: 0.03 }));
    const gold = material(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.65, roughness: 0.4 }));
    const diskGeometry = geometry(new THREE.CylinderGeometry(1, 1, 1, 128));
    const disk = (x: number, z: number, height: number, y: number, surface: THREE.Material) => {
      const mesh = new THREE.Mesh(diskGeometry, surface);
      mesh.scale.set(x, height, z);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      table.add(mesh);
      return mesh;
    };
    disk(7.18, 3.64, 0.4, -0.06, wood);
    disk(6.7, 3.15, 0.14, 0.17, felt);

    const railShape = new THREE.Shape();
    railShape.absellipse(0, 0, 6.98, 3.44, 0, Math.PI * 2, false, 0);
    const opening = new THREE.Path();
    opening.absellipse(0, 0, 6.56, 3.01, 0, Math.PI * 2, true, 0);
    railShape.holes.push(opening);
    const railGeometry = geometry(new THREE.ExtrudeGeometry(railShape, {
      depth: 0.15, steps: 1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.11, bevelSegments: 4, curveSegments: 100,
    }));
    railGeometry.rotateX(-Math.PI / 2);
    const rail = new THREE.Mesh(railGeometry, leather);
    rail.position.y = 0.22;
    rail.castShadow = rail.receiveShadow = true;
    table.add(rail);

    const lineMaterial = material(new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.47 }));
    const ellipse = (x: number, z: number, y: number, surface = lineMaterial) => {
      const points = Array.from({ length: 160 }, (_, i) => {
        const angle = i / 160 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * x, y, Math.sin(angle) * z);
      });
      return new THREE.LineLoop(geometry(new THREE.BufferGeometry().setFromPoints(points)), surface);
    };
    table.add(ellipse(6.34, 2.79, 0.25));
    table.add(ellipse(7.1, 3.57, 0.16));
    const stitchMaterial = material(new THREE.LineDashedMaterial({ color: 0x758075, transparent: true, opacity: 0.3, dashSize: 0.045, gapSize: 0.065 }));
    const stitching = ellipse(6.88, 3.34, 0.5, stitchMaterial);
    stitching.computeLineDistances();
    table.add(stitching);

    const planeGeometry = geometry(new THREE.PlaneGeometry(1, 1));
    const makeLabelMaterial = (label: string, color: string, subline?: string) => {
      const { canvas, context } = makeCanvas(1024, 192);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.font = '500 55px Georgia, serif';
      context.fillText(label, 512, subline ? 66 : 96, 970);
      if (subline) {
        context.font = '400 23px Arial, sans-serif';
        context.fillText(subline, 512, 131, 970);
      }
      return material(new THREE.MeshBasicMaterial({ map: texture(canvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    };
    const label = (surface: THREE.Material, width: number, depth: number, x: number, z: number) => {
      const mesh = new THREE.Mesh(planeGeometry, surface);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(width, depth, 1);
      mesh.position.set(x, 0.255, z);
      return mesh;
    };
    table.add(label(makeLabelMaterial('B L A C K J A C K', '#bcae82', 'EUROPEAN NO HOLE CARD  ·  ALL DEALT CARDS VISIBLE'), 5.2, 0.98, 0, -0.14));
    table.add(label(makeLabelMaterial('D E A L E R', '#9ba894'), 1.75, 0.32, 0, -2.65));

    const cardGeometry = geometry(new THREE.BoxGeometry(CARD_WIDTH, 0.018, CARD_HEIGHT));
    const cardEdge = material(new THREE.MeshStandardMaterial({ color: 0xe5e2d5, roughness: 0.9 }));
    const faceCache = new Map<string, THREE.MeshStandardMaterial>();
    const faceMaterial = (value: number, index: number) => {
      const face = cardFace(value, index);
      const cacheKey = `${face.rank}-${face.suit}`;
      const cached = faceCache.get(cacheKey);
      if (cached) return cached;
      const { canvas, context: ctx } = makeCanvas(384, 552);
      roundedRect(ctx, 2, 2, 380, 548, 22);
      ctx.fillStyle = '#faf8ef';
      ctx.fill();
      ctx.strokeStyle = '#d9d5c7';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = face.red ? '#a52c38' : '#15262a';
      const corner = () => {
        ctx.textAlign = 'center';
        ctx.font = '700 112px Arial, sans-serif';
        ctx.fillText(face.rank, 82, 126);
        ctx.font = '64px Georgia, serif';
        ctx.fillText(SUITS[face.suit], 82, 195);
      };
      corner();
      ctx.save();
      ctx.translate(384, 552);
      ctx.rotate(Math.PI);
      corner();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '126px Georgia, serif';
      ctx.fillText(SUITS[face.suit], 192, 278);
      if (['J', 'Q', 'K'].includes(face.rank)) {
        ctx.strokeStyle = face.red ? '#b3565a' : '#697c78';
        ctx.lineWidth = 2;
        roundedRect(ctx, 100, 145, 184, 263, 50);
        ctx.stroke();
        ctx.font = '25px Georgia, serif';
        ctx.fillText(face.rank === 'K' ? 'KING' : face.rank === 'Q' ? 'QUEEN' : 'JACK', 192, 373);
      }
      const surface = material(new THREE.MeshStandardMaterial({ map: texture(canvas), transparent: true, alphaTest: 0.15, roughness: 0.86, metalness: 0 }));
      faceCache.set(cacheKey, surface);
      return surface;
    };
    const dynamic = new THREE.Group();
    table.add(dynamic);
    const chipGeometry = geometry(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 40));
    const chipRingGeometry = geometry(new THREE.TorusGeometry(0.167, 0.009, 6, 36));
    chipRingGeometry.rotateX(-Math.PI / 2);
    const chipStripeGeometry = geometry(new THREE.BoxGeometry(0.073, 0.071, 0.045));
    const chipColors = [0xc6aa72, 0x963c43, 0x365e65, 0x393f49];
    const chipMaterials = chipColors.map(color => material(new THREE.MeshStandardMaterial({ color, roughness: 0.57, metalness: 0.12 })));
    const chipWhite = material(new THREE.MeshStandardMaterial({ color: 0xe5ddc7, roughness: 0.78 }));
    const activeMaterial = material(new THREE.LineBasicMaterial({ color: 0xdfc58b, transparent: true, opacity: 0.9 }));
    const inactiveMaterial = material(new THREE.LineBasicMaterial({ color: 0x9dba9e, transparent: true, opacity: 0.22 }));
    const slotGeometry = geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 80 }, (_, i) => {
      const angle = i / 80 * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 0.62, 0, Math.sin(angle) * 0.72);
    })));
    const ghostGeometry = geometry(new THREE.EdgesGeometry(cardGeometry));
    const animations: { group: THREE.Group; target: number; delay: number }[] = [];
    let transientMaterials: THREE.Material[] = [];
    let transientTextures: THREE.Texture[] = [];
    let started = 0;
    let animateUntil = 0;
    let visible = true;
    let inViewport = true;
    let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pointerX = 0;
    let pointerY = 0;
    let cameraX = 0;
    let cameraY = 0;
    let distance = 12;

    const setCamera = () => {
      camera.position.set(cameraX * 0.5, distance * (0.76 + cameraY * 0.018), distance * 0.65);
      camera.lookAt(0, 0.05, 0);
    };
    const draw = (time: number) => {
      frame = 0;
      if (disposed || !visible || !inViewport) return;
      try {
        const elapsed = time - started;
        for (const animation of animations) {
          const t = reducedMotion ? 1 : Math.min(1, Math.max(0, (elapsed - animation.delay) / 380));
          animation.group.position.y = animation.target + Math.pow(1 - t, 3) * 0.23;
        }
        cameraX += (pointerX - cameraX) * 0.14;
        cameraY += (pointerY - cameraY) * 0.14;
        setCamera();
        gl.render(scene, camera);
        if (time < animateUntil || Math.abs(pointerX - cameraX) + Math.abs(pointerY - cameraY) > 0.003) requestDraw();
      } catch {
        dispose();
        onUnavailable();
      }
    };
    const requestDraw = () => {
      if (!disposed && visible && inViewport && !frame) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      visible = !document.hidden;
      camera.aspect = width / height;
      distance = Math.max(10.8, 7.65 / (Math.tan(THREE.MathUtils.degToRad(18)) * camera.aspect));
      camera.updateProjectionMatrix();
      gl.setSize(width, height, false);
      requestDraw();
    };
    const pointerMove = (event: PointerEvent) => {
      if (reducedMotion || event.pointerType === 'touch') return;
      const bounds = host.getBoundingClientRect();
      pointerX = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1;
      pointerY = (event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1;
      requestDraw();
    };
    const pointerLeave = () => { pointerX = pointerY = 0; requestDraw(); };
    const visibilityChange = () => {
      visible = !document.hidden;
      if (!visible) { cancelAnimationFrame(frame); frame = 0; }
      else requestDraw();
    };
    const contextLost = (event: Event) => { event.preventDefault(); dispose(); onUnavailable(); };
    const motionChange = () => {
      reducedMotion = motionQuery.matches;
      if (reducedMotion) { pointerX = pointerY = cameraX = cameraY = 0; animateUntil = 0; }
      requestDraw();
    };
    host.addEventListener('pointermove', pointerMove, { passive: true });
    host.addEventListener('pointerleave', pointerLeave);
    gl.domElement.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibilityChange);
    motionQuery.addEventListener('change', motionChange);
    window.addEventListener('resize', resize);
    observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : undefined;
    observer?.observe(host);
    const intersection = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      inViewport = entries[0]?.isIntersecting ?? true;
      if (inViewport) requestDraw();
      else { cancelAnimationFrame(frame); frame = 0; }
    }) : undefined;
    intersection?.observe(host);
    removeEvents = () => {
      host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerleave', pointerLeave);
      gl.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', visibilityChange);
      motionQuery.removeEventListener('change', motionChange);
      window.removeEventListener('resize', resize);
      intersection?.disconnect();
    };
    resize();

    return {
      dispose,
      update(state) {
        if (disposed) return;
        dynamic.clear();
        animations.length = 0;
        transientMaterials.forEach(item => { item.dispose(); materials.delete(item); });
        transientTextures.forEach(item => { item.dispose(); textures.delete(item); });
        transientMaterials = [];
        transientTextures = [];
        const transientLabel = (text: string, color: string, width: number, x: number, z: number) => {
          const surface = makeLabelMaterial(text, color);
          transientMaterials.push(surface);
          if (surface.map) transientTextures.push(surface.map);
          dynamic.add(label(surface, width, 0.33, x, z));
        };
        let order = 0;
        const addCards = (cards: number[], x: number, z: number, availableWidth: number) => {
          if (!cards.length) {
            // An empty outline is a placeholder, never an extra or concealed card.
            const ghost = new THREE.LineSegments(ghostGeometry, inactiveMaterial);
            ghost.position.set(x, 0.265, z);
            dynamic.add(ghost);
            return;
          }
          // Keep the entire upper-left rank exposed. Long hands wrap instead
          // of squeezing their rank corners beneath the next card.
          const columns = Math.min(cards.length, Math.max(1, Math.floor((availableWidth - CARD_WIDTH) / 0.52) + 1));
          const rows = Math.ceil(cards.length / columns);
          const spacing = columns < 2 ? 0 : Math.min(0.82, (availableWidth - CARD_WIDTH) / (columns - 1));
          cards.forEach((value, index) => {
            const card = new THREE.Group();
            const row = Math.floor(index / columns);
            const rowLength = Math.min(columns, cards.length - row * columns);
            const center = index % columns - (rowLength - 1) / 2;
            card.position.set(x + center * spacing, 0.27 + index * 0.023, z + (row - (rows - 1) / 2) * 0.64);
            card.rotation.y = -center * 0.012;
            const body = new THREE.Mesh(cardGeometry, cardEdge);
            body.castShadow = body.receiveShadow = true;
            card.add(body);
            const face = new THREE.Mesh(planeGeometry, faceMaterial(value, index));
            face.rotation.x = -Math.PI / 2;
            face.scale.set(CARD_WIDTH + 0.005, CARD_HEIGHT + 0.005, 1);
            face.position.y = 0.011;
            face.receiveShadow = true;
            card.add(face);
            dynamic.add(card);
            animations.push({ group: card, target: card.position.y, delay: Math.min(order++ * 35, 180) });
          });
        };
        addCards(state.dealer, 0, -1.57, 6);
        const count = state.hands.length;
        const span = Math.min(8.1, Math.max(0, count - 1) * 3.2);
        const availableWidth = count > 1 ? Math.min(3.1, span / (count - 1) * 0.94) : 5.2;
        state.hands.forEach((hand, index) => {
          const x = count === 1 ? 0 : -span / 2 + index * span / (count - 1);
          const z = 1.15 - Math.pow(Math.abs(x) / 5, 2) * 0.35;
          const active = index === state.activeHand && !hand.done && !['idle', 'betting', 'settled', 'complete', 'finished', 'result', 'resolved'].includes(state.phase.toLowerCase());
          const marker = new THREE.LineLoop(slotGeometry, active ? activeMaterial : inactiveMaterial);
          marker.position.set(x, 0.258, z);
          marker.scale.set(Math.min(1.8, availableWidth / 1.3), 1, 1);
          dynamic.add(marker);
          addCards(hand.cards, x, z, availableWidth);
          const bet = Number.isFinite(hand.bet) ? Math.max(0, hand.bet) : 0;
          if (bet > 0) {
            const chipCount = Math.min(7, Math.max(1, Math.ceil(Math.log2(bet + 1))));
            for (let level = 0; level < chipCount; level++) {
              const chip = new THREE.Group();
              chip.position.set(x - 0.43, 0.285 + level * 0.074, z + 1.23);
              chip.rotation.y = level * 0.29;
              const body = new THREE.Mesh(chipGeometry, chipMaterials[Math.min(3, Math.floor(Math.log10(bet + 1)))]);
              body.castShadow = body.receiveShadow = true;
              chip.add(body);
              const ring = new THREE.Mesh(chipRingGeometry, gold);
              ring.position.y = 0.037;
              chip.add(ring);
              for (let stripe = 0; stripe < 6; stripe++) {
                const angle = stripe / 6 * Math.PI * 2;
                const mesh = new THREE.Mesh(chipStripeGeometry, chipWhite);
                mesh.position.set(Math.sin(angle) * 0.202, 0.002, Math.cos(angle) * 0.202);
                mesh.rotation.y = angle;
                chip.add(mesh);
              }
              dynamic.add(chip);
            }
          }
          transientLabel(`${displayBet(hand.bet)}  BET`, '#d3c195', 1.25, x + 0.44, z + 1.28);
          transientLabel(`HAND ${index + 1}${hand.split ? ' · SPLIT' : ''}${hand.done ? ' · DONE' : active ? ' · ACTIVE' : ''}`, active ? '#ead3a3' : '#a5b8a6', Math.min(2.25, availableWidth), x, z + 0.94);
        });
        if (!count) transientLabel('PLACE A BET TO BEGIN', '#a1b49e', 3.3, 0, 1.27);
        started = performance.now();
        animateUntil = reducedMotion ? 0 : started + 600;
        requestDraw();
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

function HtmlCards({ cards }: { cards: number[] }) {
  return <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 5, minHeight: 64 }}>
    {cards.length ? cards.map((value, index) => {
      const face = cardFace(value, index);
      return <span key={index} aria-label={`Rank ${face.rank}`} style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
        width: 42, height: 61, boxSizing: 'border-box', padding: '5px 6px', background: '#faf8ef',
        color: face.red ? '#a52c38' : '#15262a', borderRadius: 4, border: '1px solid #d9d5c7',
        font: 'bold 19px Georgia, serif', boxShadow: '0 3px 6px #0004',
      }}><span>{face.rank}</span><span aria-hidden="true">{SUITS[face.suit]}</span></span>;
    }) : <span style={{ width: 42, height: 61, border: '1px dashed #a7b8a45c', borderRadius: 4 }} aria-label="No cards" />}
  </div>;
}

export default function TableScene({ hands, dealer, activeHand, phase }: TableProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const descriptionId = useId();
  // A value signature also notices callers that mutate their existing hand arrays.
  const snapshot = JSON.stringify({ hands, dealer, activeHand, phase });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let mounted = true;
    try {
      engineRef.current = createEngine(host, () => { if (mounted) setUnavailable(true); });
    } catch {
      setUnavailable(true);
    }
    return () => {
      mounted = false;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      engineRef.current?.update(JSON.parse(snapshot) as Snapshot);
    } catch {
      engineRef.current?.dispose();
      engineRef.current = null;
      setUnavailable(true);
    }
  }, [snapshot]);

  return <div role="group" aria-label="Blackjack table, European no hole card" aria-describedby={descriptionId} style={{
    position: 'relative', width: '100%', height: '100%', minHeight: 260,
    background: 'radial-gradient(ellipse at 50% 42%, #17322b 0%, #0b1916 62%, #081310 100%)',
    borderRadius: 'inherit', isolation: 'isolate', overflow: unavailable ? 'auto' : 'hidden',
  }}>
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, visibility: unavailable ? 'hidden' : 'visible' }} />
    <div aria-hidden="true" style={{ position: 'absolute', left: 18, top: 15, color: '#aebfb3', font: '10px system-ui, sans-serif', letterSpacing: '0.17em', pointerEvents: 'none' }}>LIVE TABLE <span style={{ color: '#6f9e89', marginLeft: 7 }}>· ENHC</span></div>
    <div aria-hidden="true" style={{ position: 'absolute', right: 18, top: 16, color: '#a2b5a8', font: '9px system-ui, sans-serif', pointerEvents: 'none' }}>Ranks only · suits decorative</div>
    <p id={descriptionId} aria-live="polite" aria-atomic="true" style={visuallyHidden}>
      Phase: {phase}. Dealer: {describeCards(dealer)}. No dealer hole card. Cards contain rank-only data; suit symbols are decorative and do not represent physical suits.
      {hands.length ? hands.map((hand, index) => ` Hand ${index + 1}: ${describeCards(hand.cards)}. Bet ${displayBet(hand.bet)}.${hand.split ? ' Split hand.' : ''}${hand.done ? ' Done.' : index === activeHand ? ' Active hand.' : ''}`).join('') : ' No player hands. Place a bet to begin.'}
    </p>
    {unavailable && <div style={{ minHeight: '100%', boxSizing: 'border-box', padding: '44px 18px 20px', color: '#e0e7df', textAlign: 'center', font: '12px system-ui, sans-serif' }}>
      <div style={{ marginBottom: 10, color: '#a8bdae', letterSpacing: '0.16em', fontSize: 10 }}>DEALER</div>
      <HtmlCards cards={dealer} />
      <div style={{ margin: '17px 0', color: '#bfac7c', font: '15px Georgia, serif', letterSpacing: '0.17em' }}>BLACKJACK <span style={{ display: 'block', marginTop: 6, font: '9px system-ui, sans-serif', letterSpacing: '0.12em' }}>EUROPEAN NO HOLE CARD</span></div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
        {hands.map((hand, index) => <div key={index} style={{ padding: 10, borderRadius: 9, border: `1px solid ${index === activeHand && !hand.done ? '#c9af75' : '#ffffff18'}`, background: '#ffffff04' }}>
          <HtmlCards cards={hand.cards} />
          <div style={{ marginTop: 9, color: '#d1bd8d' }}>Hand {index + 1}{hand.split ? ' · Split' : ''}{hand.done ? ' · Done' : index === activeHand ? ' · Active' : ''}</div>
          <div style={{ marginTop: 5, color: '#a8bdae' }}>Bet {displayBet(hand.bet)}</div>
        </div>)}
        {!hands.length && <p style={{ color: '#a8bdae' }}>Place a bet to begin.</p>}
      </div>
      <div style={{ marginTop: 17, fontSize: 10, color: '#8aa193' }}>Card view · 3D rendering unavailable</div>
    </div>}
  </div>;
}
