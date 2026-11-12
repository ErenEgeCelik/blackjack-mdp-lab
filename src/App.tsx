import { useMemo, useState, useEffect, useRef } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  FlaskConical,
  Layers3,
  Play,
  RotateCcw,
  Settings2,
  Spade,
  TrendingUp,
  Download,
  Info,
} from 'lucide-react';
import { analyze, handValue, freshCounts, type Rules, type Analysis } from './engine';
import { createGame, deal, act, newShoe, legalActions } from './game';
import TableScene from './TableScene';
import DecisionTree from './DecisionTree';
import type { experiment } from './simulation';
import LearningLab from './LearningLab';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const signed = (v: number, d = 3) => (v >= 0 ? '+' : '') + v.toFixed(d);
const money = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function exportJSON(value: unknown, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function Line({ values, color = '#81d6b2' }: { values: number[]; color?: string }) {
  let min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const points = values
    .map(
      (v, i) =>
        `${(i / Math.max(1, values.length - 1)) * 600},${110 - ((v - min) / (max - min)) * 95}`,
    )
    .join(' ');
  return (
    <svg
      className="line-chart"
      viewBox="0 0 600 125"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Series of ${values.length} observations, latest ${values.at(-1)?.toFixed(2) ?? 0}`}
    >
      <path d="M0 20H600 M0 65H600 M0 110H600" stroke="#ffffff0b" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
function Distribution({ data }: { data: number[] }) {
  return (
    <div className="distribution">
      {['17', '18', '19', '20', '21', 'Bust', 'BJ'].map((label, i) => (
        <div key={label}>
          <span>{(100 * (data[i] ?? 0)).toFixed(1)}%</span>
          <div className="bar-track">
            <div
              style={{ height: `${Math.max(1, (data[i] ?? 0) * 230)}px` }}
              className={i === 5 ? 'mint' : ''}
            />
          </div>
          <b>{label}</b>
        </div>
      ))}
    </div>
  );
}
function Actions({
  analysis,
  allowed,
  onAct,
}: {
  analysis: Analysis | null;
  allowed: string[];
  onAct?: (a: string) => void;
}) {
  const best = analysis
    ? Object.entries(analysis.actions)
        .filter(([a]) => allowed.includes(a))
        .sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity))[0]?.[0]
    : null;
  return (
    <div className="action-list">
      {['stand', 'hit', 'double', 'split'].map((a, i) => {
        const value = analysis?.actions[a as keyof Analysis['actions']];
        return (
          <button
            key={a}
            className={`action-row ${best === a ? 'best' : ''}`}
            disabled={!allowed.includes(a) || !onAct}
            onClick={() => onAct?.(a)}
          >
            <span className="action-index">0{i + 1}</span>
            <span className="action-name">
              {a}
              <small>
                {a === 'hit'
                  ? 'Draw one card'
                  : a === 'stand'
                    ? 'Keep your total'
                    : a === 'double'
                      ? 'Double stake, one card'
                      : 'Play two hands'}
              </small>
            </span>
            <span className="ev-value">
              {value === undefined ? '—' : signed(value)}
              <small>{best === a ? 'BEST EV' : 'units'}</small>
            </span>
            {best === a && <ArrowUpRight size={16} />}
          </button>
        );
      })}
    </div>
  );
}
export default function App() {
  const [tab, setTab] = useState(
    typeof window !== 'undefined' && window.location.hash === '#learn' ? 'Learn' : 'Table',
  );
  const [rules, setRules] = useState<Rules>({
    hitSoft17: false,
    blackjackPayout: 1.5,
    doubleAfterSplit: true,
  });
  const [game, setGame] = useState(() => createGame(42, 6, 1000, rules));
  const [bet, setBet] = useState(25);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState('');
  const [evHistory, setEvHistory] = useState<number[]>([]);
  const hand = game.playerHands[game.activeHand];
  const remaining = game.counts.reduce((a, b) => a + b, 0);
  const allowed = legalActions(game);
  const analysis = useMemo(
    () =>
      game.phase === 'playing' && hand
        ? analyze(hand.cards, game.dealer[0], game.counts, game.rules, {
            split: hand.split,
            canDouble: allowed.includes('double'),
            canSplit: allowed.includes('split'),
          })
        : null,
    [game],
  );
  const legalBest = analysis
    ? Object.entries(analysis.actions)
        .filter(([a]) => allowed.includes(a))
        .sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity))[0]
    : null;
  const run = (f: () => void) => {
    try {
      setError('');
      f();
    } catch (e) {
      setError(String(e));
    }
  };
  function action(a: string) {
    run(() => {
      if (legalBest) setEvHistory((v) => [...v, legalBest[1] ?? 0].slice(-60));
      setGame((g) => act(g, a as 'hit' | 'stand' | 'double' | 'split'));
    });
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab('Table');
          }}
        >
          <div className="brand-icon">
            <Spade size={25} fill="currentColor" />
          </div>
          <span>
            BLACKJACK<small>MDP LAB</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            { name: 'Table', icon: Spade, label: 'Live table' },
            { name: 'Solver', icon: Layers3, label: 'Decision explorer' },
            { name: 'Simulation', icon: BarChart3, label: 'Monte Carlo lab' },
            { name: 'Theory', icon: BookOpen, label: 'Research notes' },
            { name: 'Learn', icon: BookOpen, label: 'Öğrenme atölyesi' },
          ].map(({ name, icon: Icon, label }) => (
            <button
              className={tab === name ? 'selected' : ''}
              key={name}
              onClick={() => {
                setTab(name);
                history.replaceState(null, '', name === 'Learn' ? '#learn' : location.pathname);
              }}
            >
              <Icon size={18} />
              {label}
              {tab === name && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="lab-mark">
            <FlaskConical size={18} />
            <span>
              Built for curiosity.<small>Grounded in probability.</small>
            </span>
          </div>
          <span className="version">
            <i /> RESEARCH PREVIEW <b>v0.1</b>
          </span>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />{' '}
            <span>
              {tab === 'Table'
                ? 'Live table'
                : tab === 'Solver'
                  ? 'Decision explorer'
                  : tab === 'Simulation'
                    ? 'Monte Carlo lab'
                    : tab === 'Learn'
                      ? 'Öğrenme atölyesi'
                      : 'Research notes'}
            </span>
          </div>
          <div className="header-right">
            <span className="local-dot" /> Local research environment{' '}
            <button aria-label="Settings" onClick={() => setSettings(!settings)}>
              <Settings2 size={17} />
            </button>
          </div>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">THE BLACKJACK RESEARCH ENVIRONMENT</div>
              <h1>
                {tab === 'Table'
                  ? 'Play the hand. Understand the decision.'
                  : tab === 'Solver'
                    ? 'Every decision has a value.'
                    : tab === 'Simulation'
                      ? 'From single hands to long horizons.'
                      : tab === 'Learn'
                        ? 'Blackjack’i ilk ilkelerden öğren.'
                        : 'The mathematics behind the table.'}
              </h1>
              <p>
                {tab === 'Table'
                  ? 'A live casino table, with the mathematics in plain sight.'
                  : tab === 'Solver'
                    ? 'Inspect action values and compare modeling assumptions.'
                    : tab === 'Simulation'
                      ? 'Reproducible experiments. Explicit policies. Measured uncertainty.'
                      : tab === 'Learn'
                        ? 'Oyunu tanı. Olasılığı kur. Kararı türet. Modelin sınırlarını gör.'
                        : 'Definitions, assumptions, and a path toward exact decision optimization.'}
              </p>
            </div>
            <span className="pill">
              <i /> {tab === 'Table' ? 'LIVE ANALYSIS' : 'RESEARCH LAB'}
            </span>
          </div>
          {settings && (
            <section className="panel settings">
              <h3>Table rules</h3>
              <label>
                <input
                  type="checkbox"
                  checked={rules.hitSoft17}
                  onChange={(e) => setRules({ ...rules, hitSoft17: e.target.checked })}
                />{' '}
                Dealer hits soft 17
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={rules.doubleAfterSplit}
                  onChange={(e) => setRules({ ...rules, doubleAfterSplit: e.target.checked })}
                />{' '}
                Double after split
              </label>
              <label>
                Blackjack payout{' '}
                <select
                  value={rules.blackjackPayout}
                  onChange={(e) => setRules({ ...rules, blackjackPayout: +e.target.value })}
                >
                  <option value={1.5}>3:2</option>
                  <option value={1.2}>6:5</option>
                </select>
              </label>
              <button
                className="primary"
                onClick={() => {
                  setGame(createGame(42, 6, 1000, rules));
                  setEvHistory([]);
                  setSettings(false);
                }}
              >
                Apply & reset session
              </button>
              <p>
                6 decks · European no hole card · Dealer blackjack takes all bets · One split ·
                Split aces receive one card · No surrender or insurance.
              </p>
            </section>
          )}
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {tab === 'Table' && (
            <>
              <div className="stats">
                <Metric
                  label="BANKROLL"
                  value={money(game.bankroll)}
                  sub="Available research credits"
                />
                <Metric
                  label="SESSION PROFIT"
                  value={signed(
                    game.history.reduce((s, h) => s + h.profit, 0),
                    0,
                  )}
                  sub={`${game.history.length} completed rounds`}
                  mint
                />
                <Metric
                  label="HI-LO RUNNING COUNT"
                  value={signed(game.runningCount, 0)}
                  sub="Exposed cards only"
                />
                <Metric
                  label="TRUE COUNT"
                  value={signed(game.runningCount / Math.max(remaining / 52, 0.01), 2)}
                  sub={`${(remaining / 52).toFixed(2)} decks remaining`}
                  mint
                />
              </div>
              <div className="play-grid">
                <section className="panel table-panel">
                  <div className="panel-head">
                    <h2>
                      <Spade size={16} /> The research table
                    </h2>
                    <span className="tag">
                      6D · {game.rules.hitSoft17 ? 'H17' : 'S17'} ·{' '}
                      {game.rules.blackjackPayout === 1.5 ? '3:2' : '6:5'} · ENHC
                    </span>
                  </div>
                  <div className="table-stage">
                    <div className="table-caption">
                      <span>
                        BLACKJACK PAYS {game.rules.blackjackPayout === 1.5 ? '3 TO 2' : '6 TO 5'}
                      </span>
                      <small>
                        Dealer {game.rules.hitSoft17 ? 'hits' : 'stands on'} soft 17 · No hole card
                      </small>
                    </div>
                    <TableScene
                      hands={game.playerHands}
                      dealer={game.dealer}
                      activeHand={game.activeHand}
                      phase={game.phase}
                    />
                    <div className="table-status" aria-live="polite">
                      {game.message || 'Your next discovery starts with a hand.'}
                    </div>
                  </div>
                  <div className="table-controls">
                    <div>
                      <span className="micro">WAGER</span>
                      <div className="bet-options">
                        {[10, 25, 50, 100].map((v) => (
                          <button
                            key={v}
                            disabled={game.phase === 'playing'}
                            className={bet === v ? 'active' : ''}
                            onClick={() => setBet(v)}
                          >
                            ${v}
                          </button>
                        ))}
                      </div>
                    </div>
                    {game.phase === 'playing' ? (
                      <div className="hand-total">
                        <span className="micro">YOUR HAND</span>
                        <strong>
                          {hand ? handValue(hand.cards).total : '—'}{' '}
                          <small>{hand && handValue(hand.cards).soft ? 'soft' : 'hard'}</small>
                        </strong>
                      </div>
                    ) : (
                      <button
                        className="primary deal"
                        disabled={game.bankroll < bet}
                        onClick={() => run(() => setGame((g) => deal(g, bet)))}
                      >
                        <Play size={15} fill="currentColor" />{' '}
                        {game.round ? 'Deal next hand' : 'Deal a hand'}
                      </button>
                    )}
                    <button
                      className="icon-button"
                      title="Shuffle shoe"
                      aria-label="Shuffle shoe"
                      disabled={game.phase === 'playing'}
                      onClick={() => run(() => setGame((g) => newShoe(g)))}
                    >
                      <RotateCcw size={17} />
                    </button>
                  </div>
                </section>
                <section className="panel decision-panel">
                  <div className="panel-head">
                    <h2>
                      <Activity size={16} /> Decision engine
                    </h2>
                    <span className="live-led" />
                  </div>
                  <div className="decision-intro">
                    <span className="micro">EXPECTED NET RETURN / INITIAL UNIT</span>
                    <h3>
                      {legalBest ? (
                        <>
                          <span className="mint-text">
                            {legalBest[0][0].toUpperCase() + legalBest[0].slice(1)}
                          </span>{' '}
                          is the best available action.
                        </>
                      ) : (
                        'Your next move, explained.'
                      )}
                    </h3>
                    <p>
                      {analysis
                        ? 'Optimal continuation within the model. Additional stakes are included.'
                        : 'Deal a hand to compare the expected value of each legal action.'}
                    </p>
                  </div>
                  <Actions analysis={analysis} allowed={allowed} onAct={action} />
                  <div className="model-note">
                    <Info size={15} />
                    <span>
                      <b>Composition-aware approximation</b>Observed frequencies held fixed during
                      lookahead. Split EV assumes funds for later doubles; finite-shoe depletion is
                      not modeled.
                    </span>
                  </div>
                </section>
              </div>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-head">
                    <h2>Remaining shoe</h2>
                    <span className="tag">{remaining} CARDS</span>
                  </div>
                  <div className="shoe-bars">
                    {game.counts.map((n, i) => (
                      <div key={i}>
                        <span>{n}</span>
                        <div>
                          <i style={{ height: `${(n / freshCounts(6)[i]) * 64}px` }} />
                        </div>
                        <b>{ranks[i]}</b>
                      </div>
                    ))}
                  </div>
                  <div className="panel-foot">
                    All ten-valued ranks grouped as 10{' '}
                    <span>{(100 * (1 - remaining / 312)).toFixed(1)}% dealt</span>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Dealer outcome distribution</h2>
                    <span className="tag">MODEL</span>
                  </div>
                  {analysis ? (
                    <Distribution data={analysis.dealer} />
                  ) : (
                    <div className="empty">Deal a hand to reveal the probability landscape.</div>
                  )}
                  <div className="panel-foot">
                    If standing now; 21 excludes blackjack{' '}
                    <span>
                      {analysis
                        ? `${(analysis.bustProbability * 100).toFixed(1)}% hit bust`
                        : 'Awaiting hand'}
                    </span>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2>Decision EV trace</h2>
                    <TrendingUp size={16} />
                  </div>
                  {evHistory.length > 1 ? (
                    <Line values={evHistory} />
                  ) : (
                    <div className="empty">Your decision values will appear as you play.</div>
                  )}
                  <div className="panel-foot">
                    Best available EV before each action <span>{evHistory.length} decisions</span>
                  </div>
                </section>
              </div>
              <div className="footer-note">
                <span>
                  <i /> Player-visible information only
                </span>
                <span>Seed 42 · No real money · EV is not a guaranteed result</span>
                <button
                  onClick={() =>
                    exportJSON({ version: 1, game, evHistory }, 'blackjack-session.json')
                  }
                >
                  <Download size={13} /> Export session
                </button>
              </div>
            </>
          )}
          {tab === 'Solver' && <Explorer rules={rules} />}
          {tab === 'Simulation' && <Simulation rules={rules} />}
          {tab === 'Theory' && <Theory />}
          {tab === 'Learn' && <LearningLab />}
        </div>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  sub,
  mint = false,
}: {
  label: string;
  value: string;
  sub: string;
  mint?: boolean;
}) {
  return (
    <section className="metric">
      <span className="micro">{label}</span>
      <strong className={mint ? 'mint-text' : ''}>{value}</strong>
      <small>{sub}</small>
    </section>
  );
}
function Explorer({ rules }: { rules: Rules }) {
  const [cards, setCards] = useState('10,6');
  const [up, setUp] = useState(10);
  const [exact, setExact] = useState(false);
  const [counts, setCounts] = useState('1,1,1,1,1,1,1,1,1,4');
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState<{
    cards: number[];
    counts: number[];
    finite: boolean;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    worker.current?.terminate();
    setBusy(false);
    setResult(null);
    setError('');
  }, [cards, up, exact, counts, rules]);
  function calculate() {
    setError('');
    setResult(null);
    const c = cards.split(',').map((x) => (x.trim().toUpperCase() === 'A' ? 1 : Number(x)));
    const n = exact ? counts.split(',').map(Number) : freshCounts(6);
    if (c.length < 2 || c.some((v) => !Number.isInteger(v) || v < 1 || v > 10)) {
      setError('Enter at least two ranks, using A or 1 through 10.');
      return;
    }
    if (
      exact &&
      (n.length !== 10 ||
        n.some((v) => !Number.isInteger(v) || v < 0) ||
        n.reduce((a, b) => a + b, 0) > 18)
    ) {
      setError(
        'Enter 10 nonnegative counts with at most 18 remaining cards for exact enumeration.',
      );
      return;
    }
    if (!exact) {
      for (const r of [...c, up]) n[r - 1]--;
      if (n.some((v) => v < 0)) {
        setError('Hand exceeds the shoe.');
        return;
      }
    }
    setSolved({ cards: c, counts: n, finite: exact });
    setBusy(true);
    worker.current?.terminate();
    worker.current = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.current.onmessage = (e) => {
      setBusy(false);
      e.data.error ? setError(e.data.error) : setResult(e.data.result);
      worker.current?.terminate();
    };
    worker.current.onerror = (e) => {
      setBusy(false);
      setError(e.message);
    };
    worker.current.postMessage({ cards: c, up, counts: n, rules, exact });
  }
  return (
    <>
      <div className="explorer-grid">
        <section className="panel padded">
          <div className="eyebrow">STATE CONFIGURATION</div>
          <h2>Ask the Bellman equation.</h2>
          <p className="muted">
            ENHC &middot; {rules.hitSoft17 ? 'H17' : 'S17'} &middot;{' '}
            {rules.blackjackPayout === 1.5 ? '3:2' : '6:5'} &middot;{' '}
            {rules.doubleAfterSplit ? 'DAS' : 'No DAS'}
          </p>
          <label>
            Player ranks
            <input value={cards} onChange={(e) => setCards(e.target.value)} placeholder="10,6" />
          </label>
          <label>
            Dealer upcard
            <select value={up} onChange={(e) => setUp(+e.target.value)}>
              {ranks.map((r, i) => (
                <option key={r} value={i + 1}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Computation model
            <select
              value={exact ? 'exact' : 'fast'}
              onChange={(e) => setExact(e.target.value === 'exact')}
            >
              <option value="fast">Frozen composition · approximate finite shoe</option>
              <option value="exact">Finite shoe · exact enumeration (small states)</option>
            </select>
          </label>
          {exact && (
            <label>
              Undealt counts: A, 2, …, 10
              <input value={counts} onChange={(e) => setCounts(e.target.value)} />
              <small>
                Exclude player cards and dealer upcard. Maximum 18 cards. Split excluded.
              </small>
            </label>
          )}
          <button className="primary" onClick={calculate} disabled={busy}>
            {busy ? 'Enumerating states…' : 'Evaluate state'}
            <ArrowUpRight size={16} />
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="muted">
            {exact
              ? 'A bounded solver fails explicitly if it exhausts its computational budget or cannot finish the hand.'
              : 'Uses six decks minus the visible hand and upcard. Future draws hold those frequencies fixed.'}
          </p>
        </section>
        <section className="panel padded">
          <div className="eyebrow">ACTION VALUES</div>
          <h2>{result ? `Model optimum: ${result.best}` : 'Configure a state to begin.'}</h2>
          <Actions analysis={result} allowed={result ? Object.keys(result.actions) : []} />
          {result && (
            <>
              <p className="muted">
                {result.model} · {result.nodes.toLocaleString()} evaluated states
              </p>
              <Distribution data={result.dealer} />
            </>
          )}
        </section>
      </div>
      {result && solved && (
        <DecisionTree cards={solved.cards} counts={solved.counts} finite={solved.finite} />
      )}
      <section className="panel padded math-note">
        <h2>The recursion</h2>
        <div className="formula">
          V(s) = max<sub>a ∈ A(s)</sub> Q(s, a)
        </div>
        <div className="formula">
          Q(s, hit) = ∑<sub>r</sub> P(r | s) V(s ⊕ r)
        </div>
        <p>
          A busted hand has value -1. Standing compares the hand with the dealer distribution.
          Doubling stakes two units and draws exactly one card. The finite-shoe model removes each
          drawn rank from the state; the fast model holds its probabilities fixed. All values are
          net returns per initial stake, with no discounting.
        </p>
      </section>
    </>
  );
}
function Simulation({ rules }: { rules: Rules }) {
  const [rounds, setRounds] = useState(1000);
  const [seed, setSeed] = useState(42);
  const [policy, setPolicy] = useState<'flat' | 'hilo'>('flat');
  const [result, setResult] = useState<ReturnType<typeof experiment> | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  function start() {
    setError('');
    setResult(null);
    setProgress(0);
    worker.current?.terminate();
    worker.current = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current.onmessage = (e) => {
      if (e.data.error) {
        setError(e.data.error);
        setProgress(null);
      } else if (e.data.result) {
        setResult(e.data.result);
        setProgress(null);
      } else setProgress(e.data.progress);
    };
    worker.current.onerror = (e) => {
      setError(e.message);
      setProgress(null);
    };
    worker.current.postMessage({ rounds, seed, policy, rules });
  }
  return (
    <>
      <div className="explorer-grid">
        <section className="panel padded">
          <div className="eyebrow">REPRODUCIBLE EXPERIMENT</div>
          <h2>Simulate a finite shoe.</h2>
          <p className="muted">
            ENHC &middot; {rules.hitSoft17 ? 'H17' : 'S17'} &middot;{' '}
            {rules.blackjackPayout === 1.5 ? '3:2' : '6:5'} &middot;{' '}
            {rules.doubleAfterSplit ? 'DAS' : 'No DAS'}
          </p>
          <label>
            Rounds per session
            <select value={rounds} onChange={(e) => setRounds(+e.target.value)}>
              {[100, 1000, 5000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Random seed
            <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} />
          </label>
          <label>
            Betting policy
            <select value={policy} onChange={(e) => setPolicy(e.target.value as 'flat' | 'hilo')}>
              <option value="flat">Flat · 1 unit</option>
              <option value="hilo">Hi-Lo ramp · 1–8 units</option>
            </select>
          </label>
          <p className="muted">
            20 independent sessions · 200-unit starting bankroll · 6 decks · 75% penetration.
            Playing policy: best legal action from fresh-shoe frozen-composition DP. The Hi-Lo ramp
            is a heuristic, not an optimized betting policy.
          </p>
          <button className="primary" disabled={progress !== null} onClick={start}>
            <Play size={15} />{' '}
            {progress === null ? 'Run experiment' : `Simulating · ${Math.round(progress * 100)}%`}
          </button>
          {progress !== null && (
            <button
              className="text-button"
              onClick={() => {
                worker.current?.terminate();
                setProgress(null);
              }}
            >
              Cancel experiment
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </section>
        <section className="panel padded">
          <div className="eyebrow">EXPERIMENT RESULTS</div>
          <h2>{result ? 'Observed outcomes' : 'Let the evidence accumulate.'}</h2>
          {result ? (
            <>
              <div className="stats compact">
                <Metric
                  label="MEAN PROFIT / SCHEDULED ROUND"
                  value={signed(result.mean, 4)}
                  sub={`95% session-cluster t interval: ${signed(result.low, 4)} to ${signed(result.high, 4)}`}
                  mint
                />
                <Metric
                  label="SESSION RUIN"
                  value={`${(100 * result.ruinRate).toFixed(1)}%`}
                  sub={`${result.ruined} / 20 sessions unable to fund minimum bet`}
                />
              </div>
              <Line values={result.trace} />
              <p className="muted">
                First session bankroll, in units · {result.played.toLocaleString()} completed rounds
                across sessions. Ruin is finite-horizon and empirical. Small samples cannot
                establish long-term profitability.
              </p>
              <button
                className="text-button"
                onClick={() => exportJSON(result, 'blackjack-experiment.json')}
              >
                <Download size={15} /> Export results & configuration
              </button>
            </>
          ) : (
            <div className="empty large">
              <BarChart3 size={38} />
              <p>
                Results appear here after a simulation.
                <br />
                No synthetic performance curves.
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="panel padded">
        <h2>Bet size is an objective, not a magic number.</h2>
        <p>
          Maximizing expected dollars, maximizing expected log wealth, and minimizing the
          probability of ruin are different optimization problems. A positive count can signal
          favorable composition; it does not prove positive EV under every ruleset. This lab
          measures the chosen policy instead of presenting a count-to-edge shortcut as an exact
          answer.
        </p>
      </section>
    </>
  );
}
function Theory() {
  return (
    <div className="theory-grid">
      <section className="panel padded">
        <div className="eyebrow">01 / INFORMATION</div>
        <h2>A state the player can actually observe.</h2>
        <p>
          Our first casino uses European no-hole-card rules. The dealer has only an upcard during
          player decisions. Every dealt card is visible. Undealt rank counts therefore form an
          observable sufficient statistic together with hands, stakes, rules, and available actions.
        </p>
        <p>
          An American hole-card game requires a belief over the hidden card. A failed blackjack peek
          changes that belief and the probability of the next player draw. Optimizing separately for
          each possible hidden card and then averaging would incorrectly give the player private
          information.
        </p>
      </section>
      <section className="panel padded">
        <div className="eyebrow">02 / EXACTNESS</div>
        <h2>Exact for which model?</h2>
        <p>
          The live engine solves a with-replacement surrogate by dynamic programming. It uses
          current observed rank frequencies, then freezes them during lookahead. Its Bellman
          calculation is deterministic, but its values approximate the finite-shoe casino.
        </p>
        <p>
          The decision explorer also supports bounded finite-shoe enumeration for hit, stand, and
          double. It retains remaining composition at each branch and uses floating-point
          arithmetic. Exact means exhaustive transitions, not arbitrary-precision arithmetic.
          Multi-hand finite-shoe splitting remains a separate research milestone.
        </p>
      </section>
      <section className="panel padded">
        <div className="eyebrow">03 / COUNTING</div>
        <h2>Composition changes opportunity.</h2>
        <p>
          Hi-Lo assigns +1 to ranks 2–6, 0 to 7–9, and -1 to aces and tens. The true count divides
          the running count by decks remaining. It compresses a ten-dimensional composition vector
          into a scalar, so two shoes with the same count can have different optimal decisions.
        </p>
        <p>
          High-card-rich shoes can increase natural-blackjack payouts and alter doubling and dealer
          outcomes. Favorable opportunities depend on the full rules and composition. Bet spreads
          exploit estimated advantage but also increase variance.
        </p>
      </section>
      <section className="panel padded">
        <div className="eyebrow">04 / RESEARCH LINEAGE</div>
        <h2>Built on investigated methods.</h2>
        <p>
          We reviewed these open-source projects before choosing the architecture. This
          implementation is original; these are references, not bundled engines.
        </p>
        <ul>
          <li>
            <a href="https://github.com/possibly-wrong/blackjack" target="_blank" rel="noreferrer">
              possibly-wrong / blackjack ↗
            </a>{' '}
            — composition-dependent expected values.
          </li>
          <li>
            <a href="https://github.com/nairnj/Blackjack" target="_blank" rel="noreferrer">
              nairnj / Blackjack ↗
            </a>{' '}
            — exact pair-splitting research.
          </li>
          <li>
            <a
              href="https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator"
              target="_blank"
              rel="noreferrer"
            >
              Blackjack Strategy Simulator ↗
            </a>{' '}
            — configurable simulation and policies.
          </li>
          <li>
            <a
              href="https://github.com/mhluska/blackjack-simulator"
              target="_blank"
              rel="noreferrer"
            >
              mhluska / blackjack-simulator ↗
            </a>{' '}
            — event-oriented simulator design.
          </li>
        </ul>
      </section>
    </div>
  );
}
