import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, ArrowRight, RotateCcw } from 'lucide-react';
import { analyze, freshCounts, handValue, hiLo, type Analysis } from './engine';
import { naturalProbability, payoffMoments, bellmanToy, binaryLogGrowth } from './learningMath';
import './learning.css';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const fmt = (n: number, d = 4) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number) => fmt(n * 100, 2) + '%';
const rules = { hitSoft17: false, blackjackPayout: 1.5, doubleAfterSplit: true };
const hands = [
  {
    cards: [1, 6],
    title: 'A + 6: yumuşak 17',
    text: 'As 11 sayıldığında toplam 17. Ası gerektiğinde 1 yapabildiğimiz için bu el yumuşaktır. Tek kart çekişinde batamaz.',
  },
  {
    cards: [1, 6, 10],
    title: 'A + 6 + 10: sert 17',
    text: '11 + 6 + 10 = 27 olurdu. Ası 1 sayınca 17 elde ederiz. Artık 11 sayılan as kalmadığı için el serttir.',
  },
  {
    cards: [1, 1, 9],
    title: 'A + A + 9: yumuşak 21',
    text: 'Asların biri 11, diğeri 1: toplam 21. Üç kartlı olduğu için doğal blackjack değildir. 21 olmak ile doğal blackjack aynı olay değildir.',
  },
  {
    cards: [1, 10],
    title: 'A + 10: doğal blackjack',
    text: 'Bölünmemiş ilk iki kartta as ve on değerli kart: doğal blackjack. Krupiyede de doğal yoksa 3:2 net ödeme; krupiyede de varsa beraberlik.',
  },
  {
    cards: [10, 6, 8],
    title: '10 + 6 + 8: batış',
    text: 'Toplam 24; asla düzeltilemez. Oyuncu hemen kaybeder. Krupiyenin daha sonra batması bu kaybı geri almaz.',
  },
];
function Quiz({
  question,
  options,
  correct,
  explanation,
}: {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}) {
  const [answer, setAnswer] = useState<number | null>(null);
  return (
    <div className="learn-quiz">
      <strong>Önce tahmin et: {question}</strong>
      <div>
        {options.map((text, i) => (
          <button key={text} aria-pressed={answer === i} onClick={() => setAnswer(i)}>
            {text}
          </button>
        ))}
      </div>
      {answer !== null && (
        <p role="status">
          <b>{answer === correct ? 'Doğru.' : 'Bir kez daha düşünelim.'}</b> {explanation}
        </p>
      )}
    </div>
  );
}
export default function LearningLab() {
  const [chapter, setChapter] = useState(0);
  const titles = [
    'Oyunu gör',
    'Kartlar ve koşullama',
    'EV neden karar verir?',
    'Bellman ağacı',
    'Gerçek motoru karşılaştır',
    'Büyüme ve risk',
  ];
  async function downloadTutorial() {
    const text = (await import('../docs/MATHEMATICS_TUTORIAL_TR.md?raw')).default;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MATHEMATICS_TUTORIAL_TR.md';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="learning" lang="tr">
      <section className="learn-intro">
        <div>
          <span className="eyebrow">TÜRKÇE · İLK ELDEN BELLMAN DENKLEMİNE</span>
          <h2>
            Sonucu ezberleme.
            <br />
            Kararın nedenini keşfet.
          </h2>
          <p>
            Bu altı deney, kapsamlı Türkçe matematik bölümünün etkileşimli eşlikçisidir. Önce tahmin
            et, bir değişkeni değiştir, sonucu açıkla. Üniversite düzeyindeki olasılık bilgini
            gerçek oyun durumlarına bağla.
          </p>
        </div>
        <div className="learn-reading">
          <BookOpen size={24} />
          <strong>Ders kitabı bölümü</strong>
          <p>
            Oyunun kuralları, adım adım türetimler, çözümlü problemler ve uygulamanın matematiksel
            sınırları.
          </p>
          <a
            href="https://github.com/ErenEgeCelik/blackjack-mdp-lab/blob/main/docs/MATHEMATICS_TUTORIAL_TR.md"
            target="_blank"
            rel="noreferrer"
          >
            Türkçe bölümü oku <ArrowRight size={15} />
          </a>
          <button onClick={downloadTutorial}>
            <Download size={15} /> Markdown dosyasını indir
          </button>
        </div>
      </section>
      <nav className="learn-tabs" aria-label="Öğrenme deneyleri">
        {titles.map((title, i) => (
          <button
            key={title}
            aria-current={chapter === i ? 'step' : undefined}
            onClick={() => setChapter(i)}
          >
            <span>0{i + 1}</span>
            {title}
          </button>
        ))}
      </nav>
      {chapter === 0 && <HandLesson />}
      {chapter === 1 && <ShoeLesson />}
      {chapter === 2 && <EVLesson />}
      {chapter === 3 && <BellmanLesson />}
      {chapter === 4 && <EngineLesson />}
      {chapter === 5 && <RiskLesson />}
      <div className="learn-pagination">
        <span>
          {chapter + 1} / {titles.length} deney · Örnekler öğretim içindir; model etiketlerini takip
          et.
        </span>
        <button className="primary" onClick={() => setChapter((chapter + 1) % titles.length)}>
          {chapter === 5 ? 'Başa dön' : 'Sonraki deney'}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
function HandLesson() {
  const [index, setIndex] = useState(0);
  const [stake, setStake] = useState(20);
  const hand = hands[index],
    v = handValue(hand.cards);
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>01 / KURALLAR</span>
        <h2>Amaç 21 yapmak değil, krupiyeyi geçmek.</h2>
        <p>
          21'i aşmadan krupiyeden büyük ol. Eşit toplam beraberliktir; ilk iki karttaki doğal
          blackjack özel bir eldir. Oyuncu önce oynadığı için oyuncunun batışı krupiyenin sonucundan
          önce kesinleşir.
        </p>
      </div>
      <div className="learn-columns">
        <div>
          <label>
            İncelenecek el
            <select value={index} onChange={(e) => setIndex(+e.target.value)}>
              {hands.map((h, i) => (
                <option value={i} key={h.title}>
                  {h.title}
                </option>
              ))}
            </select>
          </label>
          <div
            className="learn-cards"
            aria-label={`Kartlar: ${hand.cards.map((r) => ranks[r - 1]).join(', ')}`}
          >
            {hand.cards.map((r, i) => (
              <span key={i}>
                {ranks[r - 1]}
                <small>♠</small>
              </span>
            ))}
            <strong>
              {v.total}
              <small>{v.total > 21 ? 'BATIŞ' : v.soft ? 'YUMUŞAK' : 'SERT'}</small>
            </strong>
          </div>
          <p>{hand.text}</p>
          <div className="learn-equation">
            Değer = ∑ kartların küçük değeri + 10 · I(as var ve küçük toplam ≤ 11)
          </div>
          <p>
            Buradaki I, koşul doğruysa 1, değilse 0 olur. Aynı anda en fazla bir ası 11 sayabiliriz.
          </p>
        </div>
        <div>
          <h3>20 birim koymak ile 20 birim kazanmak farklıdır.</h3>
          <label>
            Başlangıç bahsi: {stake} birim
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={stake}
              onChange={(e) => setStake(+e.target.value)}
            />
          </label>
          <table>
            <thead>
              <tr>
                <th>Sonuç</th>
                <th>Geri gelen</th>
                <th>Net kâr</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Normal galibiyet</td>
                <td>{2 * stake}</td>
                <td>+{stake}</td>
              </tr>
              <tr>
                <td>Beraberlik</td>
                <td>{stake}</td>
                <td>0</td>
              </tr>
              <tr>
                <td>Normal mağlubiyet</td>
                <td>0</td>
                <td>−{stake}</td>
              </tr>
              <tr>
                <td>Doğal blackjack (3:2)</td>
                <td>{2.5 * stake}</td>
                <td>+{1.5 * stake}</td>
              </tr>
              <tr>
                <td>Double ile galibiyet</td>
                <td>{4 * stake}</td>
                <td>+{2 * stake}</td>
              </tr>
            </tbody>
          </table>
          <p>
            Double'da toplam {2 * stake} yatırılır. 4 kat geri dönüşün yalnızca 2 katı kârdır.
            Krupiye blackjack yaparsa ENHC kurallarımızda yatırılan iki bahsin tamamı kaybedilir.
          </p>
        </div>
      </div>
      <div className="learn-flow" aria-label="Bir elin akışı">
        <span>Bahsi koy</span>
        <b>→</b>
        <span>Oyuncu · krupiye · oyuncu</span>
        <b>→</b>
        <span>Hit / stand / double / split</span>
        <b>→</b>
        <span>Krupiye tamamlar</span>
        <b>→</b>
        <span>Net ödeme</span>
      </div>
      <Quiz
        question="Bölünmüş bir elde A + 10 ne öder?"
        options={['Her zaman 3:2', 'Normal 21 olarak değerlendirilir', 'Otomatik beraberlik']}
        correct={1}
        explanation="Bölünmüş el doğal blackjack sayılmaz. Krupiye doğal blackjack yaparsa bu 21 kaybeder; sıradan bir krupiye 21'iyle berabere kalır."
      />
    </section>
  );
}
function ShoeLesson() {
  const [counts, setCounts] = useState(() => freshCounts(1));
  const n = counts.reduce((a, b) => a + b, 0),
    rc = counts.reduce((a, c, i) => a + (freshCounts(1)[i] - c) * hiLo(i + 1), 0);
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>02 / KOŞULLU OLASILIK</span>
        <h2>Görülen kart, bir sonraki çekişi değiştirir.</h2>
        <p>
          Bir desteyle başlıyoruz. Bir kart düğmesine basmak, o kartı gördüğünü ve desteden
          çıkardığını söyler. Bu deneyde gizli kart yoktur. 10 sütunu 10, J, Q ve K'nin toplamıdır;
          renk ve sembol önemli değildir.
        </p>
      </div>
      <div className="learn-counts">
        {counts.map((c, i) => (
          <button
            key={i}
            disabled={c === 0}
            onClick={() => setCounts((a) => a.map((v, j) => (j === i ? v - 1 : v)))}
            aria-label={`${ranks[i]} kartını çıkar`}
          >
            <strong>{ranks[i]}</strong>
            <span>{c} kart</span>
            <div style={{ height: 64 }}>
              <i style={{ height: `${(c / freshCounts(1)[i]) * 64}px` }} />
            </div>
            <small>{n ? pct(c / n) : '—'}</small>
          </button>
        ))}
      </div>
      <div className="learn-metrics">
        <div>
          <span>Kalan kart</span>
          <strong>{n}</strong>
        </div>
        <div>
          <span>Hi-Lo toplamı</span>
          <strong>
            {rc >= 0 ? '+' : ''}
            {rc}
          </strong>
        </div>
        <div>
          <span>True count = RC / (N/52)</span>
          <strong>{n ? fmt(rc / (n / 52), 2) : 'Tanımsız'}</strong>
        </div>
        <div>
          <span>Yeni iki kartta doğal olasılığı</span>
          <strong>{n >= 2 ? pct(naturalProbability(counts)) : 'Yeterli kart yok'}</strong>
        </div>
      </div>
      <div className="learn-columns">
        <div>
          <h3>Pay ve payda birlikte değişir.</h3>
          <div className="learn-equation">
            P(sonraki kart = r) = cᵣ / N<br />
            P(doğal) = 2cₐc₁₀ / [N(N−1)]
          </div>
          <p>
            Taze destede doğal olasılığı 2 × (4/52) × (16/51) = %4,8265. İkinci payda 51'dir: ilk
            kart geri konmaz. İki olası sıra A→10 ve 10→A'dır.
          </p>
        </div>
        <div>
          <h3>Hi-Lo bilinçli olarak bilgi kaybeder.</h3>
          <p>
            2–6 için +1, 7–9 için 0, A ve 10 için −1 sayılır. Önce desteyi sıfırla ve bir as çıkar;
            sonra sıfırla ve bir on çıkar. İki durumda RC = −1 ve N = 51, fakat doğal olasılıkları
            farklıdır: %3,7647 ile %4,7059. Aynı true count, aynı dağılım demek değildir.
          </p>
          <button className="learn-reset" onClick={() => setCounts(freshCounts(1))}>
            <RotateCcw size={15} /> Desteyi sıfırla
          </button>
        </div>
      </div>
      <Quiz
        question="Taze desteden bir 2 görünce sıradaki kartın on olasılığı?"
        options={['16/52', '16/51', '15/51']}
        correct={1}
        explanation="Onların sayısı değişmedi: 16. Toplam kart 51'e düştü. Sayım gelecekteki kartı tahmin etmekten çok koşullu dağılımı günceller."
      />
    </section>
  );
}
function EVLesson() {
  const [win, setWin] = useState(45),
    [push, setPush] = useState(5),
    [pay, setPay] = useState(1);
  const m = payoffMoments(win / 100, push / 100, pay);
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>03 / BEKLENEN NET GETİRİ</span>
        <h2>Daha sık kazanmak ile daha çok kazanmak farklıdır.</h2>
        <p>
          Bu, üç sonuçlu bir öğretim dağılımıdır; gerçek bir blackjack elinin hesaplanmış
          olasılıkları değildir. Bütün kazançların aynı ödemeye sahip olduğunu varsayıyoruz. Gerçek
          oyunda doğal, double ve split ayrı sonuçlar yaratır.
        </p>
      </div>
      <div className="learn-columns">
        <div>
          <label>
            Galibiyet olasılığı: %{win}
            <input
              type="range"
              min="0"
              max={100 - push}
              value={win}
              onChange={(e) => setWin(+e.target.value)}
            />
          </label>
          <label>
            Beraberlik olasılığı: %{push}
            <input
              type="range"
              min="0"
              max={100 - win}
              value={push}
              onChange={(e) => setPush(+e.target.value)}
            />
          </label>
          <label>
            Galibiyette net ödeme: {fmt(pay, 1)} birim
            <input
              type="range"
              min=".5"
              max="2"
              step=".1"
              value={pay}
              onChange={(e) => setPay(+e.target.value)}
            />
          </label>
          <p>
            Mağlubiyette −1 birim. Galibiyet ve beraberlik toplamı %100'ü aşamaz. Ödemeyi artırırken
            kazanma oranını sabit tutmanın etkisini gözle.
          </p>
        </div>
        <div className="learn-result" aria-live="polite">
          <span>EV = p × kazanç − q × kayıp</span>
          <strong>
            {m.mean >= 0 ? '+' : ''}
            {fmt(m.mean)} birim
          </strong>
          <p>
            {fmt(win / 100, 2)} × {fmt(pay, 1)} + {fmt(push / 100, 2)} × 0 − {fmt(m.loss, 2)} × 1
          </p>
          <p>
            1000 bağımsız tekrarda beklenen toplam: {fmt(1000 * m.mean, 1)} birim.
            <br />
            Tek tekrar standart sapması: {fmt(m.sd)} birim.
          </p>
          <div className="learn-equation">Var(X) = E[X²] − E[X]² = {fmt(m.variance)}</div>
        </div>
      </div>
      <Quiz
        question="İki eylemin EV'si −0,58 ve −0,57 ise hangisi optimal?"
        options={['−0,58', '−0,57', 'Hiçbiri optimal olamaz']}
        correct={1}
        explanation="Optimal, mevcut seçeneklerin en büyüğüdür. −0,57 daha az beklenen kayıp demektir. Optimal oynamak, her durumun ya da bütün oyunun pozitif EV'li olması demek değildir."
      />
      <p className="learn-callout">
        Bahsi el dağıtılmadan önce seçersin. Dağıtıldıktan sonra iyi bir ele sahip olmanın pozitif
        koşullu EV'si, o bahsin dağıtımdan önce avantajlı olduğunu kanıtlamaz. Bahis için bütün
        başlangıç elleri üzerinden ortalama gerekir.
      </p>
    </section>
  );
}
function BellmanLesson() {
  const [prob, setProb] = useState(50);
  const b = bellmanToy(prob / 100);
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>04 / GERİYE DOĞRU ÇÖZÜM</span>
        <h2>Şans düğümünde ortalama, karar düğümünde maksimum.</h2>
        <p>
          Aşağıdaki sayılar açıkça tanımlanmış küçük bir öğretim MDP'sine aittir; blackjack elinin
          olasılıkları değildir. Uçlardaki eylem değerleri biliniyor. Bilgisayar önce alt kararları
          çözer, sonra yukarı çıkar.
        </p>
      </div>
      <label>
        Sol duruma geçiş olasılığı p = {fmt(prob / 100, 2)}
        <input
          type="range"
          min="0"
          max="100"
          value={prob}
          onChange={(e) => setProb(+e.target.value)}
        />
      </label>
      <div className="learn-tree">
        <div className="tree-state">
          Kök karar: dur = −0,10
          <br />
          <b>çek = {fmt(b.hit, 3)}</b>
        </div>
        <div className="tree-chance">Çek → şans düğümü</div>
        <div className="tree-children">
          <div>
            <span>p = {fmt(prob / 100, 2)}</span>
            <h3>Sol durum</h3>
            <p>
              Dur: +0,20
              <br />
              Devam et: +0,50
            </p>
            <strong>V(sol) = max = +0,50</strong>
          </div>
          <div>
            <span>1−p = {fmt(1 - prob / 100, 2)}</span>
            <h3>Sağ durum</h3>
            <p>
              Dur: −0,40
              <br />
              Devam et: −0,80
            </p>
            <strong>V(sağ) = max = −0,40</strong>
          </div>
        </div>
      </div>
      <div className="learn-equation" aria-live="polite">
        Q(çek) = {fmt(prob / 100, 2)} × 0,50 + {fmt(1 - prob / 100, 2)} × (−0,40) = {fmt(b.hit, 3)}
        <br />
        V(kök) = max(−0,10; {fmt(b.hit, 3)}) = {fmt(b.value, 3)} →{' '}
        {b.best === 'hit' ? 'ÇEK' : 'DUR'}
      </div>
      <p>
        Eşik p = 1/3'tür: 0,9p−0,4 = −0,1. Şans düğümünde istediğin dalı seçemezsin; olasılıkla
        ağırlıklandırırsın. Bir kartı gördükten sonraki kararında ise o gözleme uygun en iyi eylemi
        seçebilirsin.
      </p>
      <Quiz
        question="Bilgisayar neden bütün olası krupiye gizli kartları için ayrı optimal karar bulup ortalama alamaz?"
        options={[
          'Hesaplama her zaman çok yavaştır',
          'Bu, oyuncuya bilmediği bilgiyi kullandırır',
          'Ortalama hiçbir zaman alınmaz',
        ]}
        correct={1}
        explanation="Karar, karar anındaki gözleme dayanmalıdır. Gizli kartı biliyormuş gibi her dünyada ayrı eylem seçmek haksız bilgi avantajıdır. Önce gözlenemeyen dünyalar için inancı birleştirir, sonra ortak eylemi optimize ederiz."
      />
    </section>
  );
}
function EngineLesson() {
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  const [scenario, setScenario] = useState(0),
    [exact, setExact] = useState<Analysis | null>(null),
    [status, setStatus] = useState('');
  const examples = [
    { cards: [10, 6], up: 10, label: 'Sert 16 / krupiye 10' },
    { cards: [5, 6], up: 6, label: '11 / krupiye 6' },
    { cards: [1, 7], up: 9, label: 'Yumuşak 18 / krupiye 9' },
    { cards: [8, 8], up: 6, label: '8 + 8 / krupiye 6' },
  ];
  const chosen = examples[scenario];
  const live = useMemo(() => {
    const c = freshCounts(6);
    for (const r of [...chosen.cards, chosen.up]) c[r - 1]--;
    return analyze(chosen.cards, chosen.up, c, rules);
  }, [scenario]);
  const toyCounts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 4];
  const frozen = useMemo(() => analyze([10, 6], 10, toyCounts, rules), []);
  function solveExact() {
    setStatus('Hesaplanıyor…');
    workerRef.current?.terminate();
    const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e) => {
      if (e.data.error) setStatus(e.data.error);
      else {
        setExact(e.data.result);
        setStatus('Tam sayım tamamlandı.');
      }
      w.terminate();
    };
    w.onerror = (e) => {
      setStatus(e.message);
      w.terminate();
    };
    w.postMessage({ cards: [10, 6], up: 10, counts: toyCounts, rules, exact: true });
  }
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>05 / UYGULAMANIN HESAPLADIĞI GERÇEK DEĞERLER</span>
        <h2>Aynı el, farklı model, farklı karar.</h2>
        <p>
          İlk tablo doğrudan uygulamanın <code>analyze</code> fonksiyonunu çağırır. Altı deste eksi
          oyuncu kartları ve krupiyenin açık kartı kullanılır; devamında olasılıklar sabit tutulur.
          ENHC, S17, 3:2, DAS; split için gelecekteki double'ları karşılayacak para varsayılır.
        </p>
      </div>
      <label>
        Örnek el
        <select value={scenario} onChange={(e) => setScenario(+e.target.value)}>
          {examples.map((e, i) => (
            <option key={e.label} value={i}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <div className="learn-action-values">
        {Object.entries(live.actions).map(([a, v]) => (
          <div key={a} className={a === live.best ? 'optimal' : ''}>
            <span>{a}</span>
            <strong>{fmt(v ?? 0, 6)}</strong>
            <small>{a === live.best ? 'Modelde en iyi' : 'Başlangıç bahis birimi'}</small>
          </div>
        ))}
      </div>
      <p>
        16/10 durumunda batış riski yüksek olsa da durmak daha kötü olabilir. Bilgisayar yalnızca
        batış olasılığını değil, batmadan çekilen kartlardan sonra izlenecek optimal yolu da hesaba
        katar.
      </p>
      <h3>Şimdi aynı 13 kartlık küçük desteyi iki modelle çöz.</h3>
      <p>
        Oyuncu 10+6, krupiye 10. Henüz dağıtılmamış kartlar: A–9'dan birer tane, onlardan dört tane.
        Bu örnek normal altı destelik başlangıç değildir. İki sütunda da başlangıç bilgisi aynıdır;
        yalnızca ilerideki çekişlerde eksilmenin izlenmesi değişir.
      </p>
      <button className="primary" disabled={status === 'Hesaplanıyor…'} onClick={solveExact}>
        Sonlu desteyi tam sayımla çöz
      </button>
      <p role="status">{status}</p>
      <table>
        <thead>
          <tr>
            <th>Eylem</th>
            <th>Sabit bileşim yaklaşımı</th>
            <th>Sonlu destede tam sayım</th>
          </tr>
        </thead>
        <tbody>
          {['stand', 'hit', 'double'].map((a) => (
            <tr key={a}>
              <td>{a}</td>
              <td>{fmt(frozen.actions[a as keyof Analysis['actions']]!, 6)}</td>
              <td>
                {exact
                  ? fmt(exact.actions[a as keyof Analysis['actions']]!, 6)
                  : 'Hesaplamayı başlat'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {exact && (
        <p className="learn-callout">
          Sabit model <b>{frozen.best}</b>, tam sayım <b>{exact.best}</b> seçti. Yaklaşım aynı elde
          kararı değiştirdi. “Tam”, bu modelin geçişlerinin eksiksiz sayılmasıdır; sayılar yine
          kayan noktalı aritmetik kullanır. Bu çözüm split içermez. Ziyaret edilen durum:{' '}
          {exact.nodes}.
        </p>
      )}
      <Quiz
        question="Canlı tablodaki EV sayıları sonlu deste için tam sonuç mu?"
        options={[
          'Evet; çok basamak yazıldığı için',
          'Hayır; gelecekteki eksilme sabit olasılıklarla yaklaşıklanır',
        ]}
        correct={1}
        explanation="Hesap deterministik ve kendi geri-koymalı modelinde tam olabilir; bu, gerçek sonlu deste modeline tam eşit olduğu anlamına gelmez. Sayıdaki basamak sayısı model doğruluğunu garanti etmez."
      />
    </section>
  );
}
function RiskLesson() {
  const [p, setP] = useState(55),
    [f, setF] = useState(10);
  const prob = p / 100,
    bet = f / 100,
    g = binaryLogGrowth(prob, bet),
    kelly = Math.max(0, 2 * prob - 1);
  return (
    <section className="learn-section">
      <div className="learn-heading">
        <span>06 / ORTALAMA, BÜYÜME VE İFLAS AYNI HEDEF DEĞİLDİR</span>
        <h2>Pozitif avantajı büyük bahisle yok edebilirsin.</h2>
        <p>
          Bu deney yalnızca bağımsız, beraberliksiz, +1/−1 ödemeli ikili bir oyundur. Blackjack için
          hazır bir bahis önerisi değildir. Blackjack'te doğal ödemeler ve double/split ortak sonuç
          dağılımı ayrıca hesaba katılmalıdır.
        </p>
      </div>
      <div className="learn-columns">
        <div>
          <label>
            Kazanma olasılığı: %{p}
            <input
              type="range"
              min="45"
              max="65"
              value={p}
              onChange={(e) => setP(+e.target.value)}
            />
          </label>
          <label>
            Her tur servetin bahse ayrılan payı: %{f}
            <input
              type="range"
              min="0"
              max="90"
              value={f}
              onChange={(e) => setF(+e.target.value)}
            />
          </label>
          <div className="learn-equation">
            g(f) = p ln(1+f) + (1−p) ln(1−f)
            <br />
            f* = max(0, 2p−1)
          </div>
          <p>
            f = 0 oynamamaktır. Bu ikili modelde optimal log-büyüme payı {pct(kelly)}. Bu formülü
            gerçek blackjack'e doğrudan taşımıyoruz.
          </p>
        </div>
        <div className="learn-result" aria-live="polite">
          <span>Bir turda beklenen log-büyüme</span>
          <strong>{fmt(g, 6)}</strong>
          <p>
            Bahsedilen her birim için beklenen net getiri: {fmt(2 * prob - 1, 3)}.<br />
            Seçilen servet payıyla beklenen oransal değişim: {pct(bet * (2 * prob - 1))}.
          </p>
          <p>
            {bet === 0
              ? 'Bahis sıfır: servet değişmez, log-büyüme sıfırdır ve bu modelde bahis kaynaklı kayıp olmaz.'
              : prob < 0.5
                ? 'Bu oyunda parasal avantaj da negatiftir. Pozitif bahis hem beklenen serveti hem log-büyümeyi azaltır.'
                : prob === 0.5
                  ? 'Parasal beklenti sıfırdır; fakat dalgalanma ve logaritmanın içbükeyliği log-büyümeyi negatif yapar.'
                  : g < 0
                    ? 'Parasal avantaj pozitif olsa bile aşırı büyük bahis tipik bileşik büyümeyi negatif yapar.'
                    : 'Beklenen log-büyüme pozitif; yine de sonlu bir oturumda kayıp olasılığı vardır.'}
          </p>
        </div>
      </div>
      <h3>Uygulamadaki Monte Carlo sonucunu nasıl okursun?</h3>
      <p>
        20 bağımsız oturum ayrı rastgele tohumlarla başlar. Her oturumun kârı planlanan tur sayısına
        bölünür; para biterse kalan turlar sıfır kârdır. Aynı destedeki eller bağımlı
        olabileceğinden belirsizliği tek tek ellerden değil, bu 20 oturum ortalamasından
        hesaplıyoruz.
      </p>
      <div className="learn-equation">
        Yaklaşık %95 aralık = ortalama ± 2,093 × (oturum ortalamalarının s'si / √20)
      </div>
      <p>
        “Session ruin”, seçilen ufukta en az 1 birimlik bahsi koyamayan oturumların oranıdır. Sonsuz
        ufukta iflas olasılığı değildir. 20 oturumda sıfır iflas görmek, iflas olasılığının sıfır
        olduğunu göstermez.
      </p>
      <Quiz
        question="20 oturumdan hiçbiri batmadı. Ne öğrendik?"
        options={[
          'İflas imkânsız',
          'Bu örnekte gözlenen oran sıfır; gerçek risk hâlâ pozitif olabilir',
          'Strateji kesin kârlı',
        ]}
        correct={1}
        explanation="Nadir olaylar küçük örneklemde görünmeyebilir. Belirsizlik, örneklem büyüklüğü, ufuk ve kullanılan bahis politikasıyla birlikte raporlanmalıdır."
      />
    </section>
  );
}
