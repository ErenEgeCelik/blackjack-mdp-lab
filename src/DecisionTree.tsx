import { useState } from 'react';
import { handValue } from './engine';
interface Props {
  cards: number[];
  counts: number[];
  finite: boolean;
}
/** The next-draw marginal is exact for both supported ENHC models. This view
 * intentionally shows only one transition layer, not a claimed solved full tree. */
export default function DecisionTree({ cards, counts, finite }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const size = counts.reduce((a, b) => a + b, 0);
  return (
    <section className="panel padded transition-panel">
      <div className="eyebrow">ONE-STEP TRANSITION TREE</div>
      <h2>If you hit, what can happen?</h2>
      <p>
        The outgoing probabilities sum to 1. Select a rank to inspect the resulting state. Aces are
        automatically valued as 1 or 11.
      </p>
      <div className="tree-root">
        Hit from {handValue(cards).total}
        {handValue(cards).soft ? ' soft' : ' hard'} <span>Chance node</span>
      </div>
      <div className="tree-branches">
        {counts.map((count, i) => {
          const next = handValue([...cards, i + 1]);
          return (
            <button
              key={i}
              disabled={!count}
              className={`${selected === i ? 'active' : ''} ${next.total > 21 ? 'bust' : ''}`}
              onClick={() => setSelected(i)}
            >
              <small>{((100 * count) / size).toFixed(2)}%</small>
              <strong>{i === 0 ? 'A' : i + 1}</strong>
              <span>{next.total > 21 ? 'Bust' : `${next.total}${next.soft ? ' soft' : ''}`}</span>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="transition-detail">
          <strong>
            P(rank {selected === 0 ? 'A' : selected + 1}) = {counts[selected]} / {size}
          </strong>
          <p>
            {handValue([...cards, selected + 1]).total > 21
              ? 'Terminal loss: -1 unit.'
              : `Next player total: ${handValue([...cards, selected + 1]).total}. Continuation allows hit or stand; no double after a hit.`}{' '}
            {finite
              ? `Finite shoe: rank count falls to ${counts[selected] - 1}, total to ${size - 1}.`
              : 'Frozen model: all rank probabilities stay unchanged at the next decision.'}
          </p>
        </div>
      )}
    </section>
  );
}
