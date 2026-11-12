# Blackjack MDP Lab

A local, browser-based research environment combining a Three.js blackjack table, explicit decision models, finite-shoe play, and reproducible experiments. This is the first validated foundation, not a claim that every blackjack variant or betting objective has been solved.

## Learn blackjack and its mathematics (Turkish)

Start with the self-contained [Turkish mathematical tutorial](docs/MATHEMATICS_TUTORIAL_TR.md). It assumes university-level probability but no blackjack experience, and progresses from illustrated hands to Bellman equations, counting, betting, uncertainty, and ruin. Each topic includes intuition, derivations, solved examples, exercises, and connections to the actual implementation.

The application's **Öğrenme atölyesi** tab (or `http://127.0.0.1:5173/#learn`) provides six interactive companion lessons: hand values, finite-shoe probabilities, expected payoffs, a Bellman tree, live engine comparisons, and a clearly labeled binary Kelly toy. The tutorial can also be downloaded from that tab. Reproduce the engine examples with `node scripts/tutorial-examples.mjs`.

## Run

Requires Node.js 22.14+ and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. All game state and experiments run locally in your browser. No accounts or real money. Session and experiment JSON exports are available; refreshing resets the interactive session. Fonts optionally load from Google Fonts, with system fallbacks.

```sh
npm test
npm run build
```

Browser QA: with the dev server running and Microsoft Edge installed, `node scripts/smoke.mjs`. Screenshots are written under `artifacts/`. The browser harness currently uses Edge; change its channel for another installed browser.

## Included

- Seeded finite-shoe casino: hit, stand, double, one split, split-ace restrictions, accurate cash accounting and available-action gating.
- Three.js felt table, textured cards and chips, responsive dashboard, accessible textual game state and HTML fallback if WebGL is unavailable. Suits are decorative: the engine groups all tens and does not track suits.
- Live composition-aware EVs, best available action, dealer outcome distribution, next-hit bust probability, remaining shoe, Hi-Lo running/true count, and an EV decision trace.
- Decision explorer: frozen-composition DP and bounded exact finite-shoe hit/stand/double enumeration. One-step transition tree exposes draw probabilities and next states.
- Monte Carlo worker: 20 independently seeded finite-shoe sessions, flat or heuristic Hi-Lo betting, bankroll trace, finite-horizon ruin frequency, and session-cluster uncertainty interval.
- Explicit mathematical contracts, independent validation, and a primary-source research review.

## Default casino rules

Six decks; European no hole card (ENHC); stand on soft 17; blackjack pays 3:2; double on any initial two-card hand and after splitting; at most two hands; split aces receive one card; no resplits, surrender, or insurance. A dealer natural takes all additional split/double wagers. Split 21 is not a natural. Rules controls allow H17/S17, 3:2/6:5, and DAS changes, applied by resetting the session. The game core also supports configurable deck count.

The dealer has **one visible card** while the player acts. No hidden card is removed from the shoe. Solver calls receive only visible hands, upcard, public counts, rules, and legality context, never the ordered shoe. The physical shuffled order exists only in the game state. Local exported session files include it for reproducibility, so exports are not a secure multiplayer format.

The cut card is 75% penetration and is applied between rounds. Every drawn card is exposed; if all player hands bust, the dealer does not draw further. On an original player natural the dealer draws only the second card needed to check a push. These procedures affect subsequent shoe composition and are part of the reproducible rules.

## Exactness and scope

| Result | What it means |
| --- | --- |
| Live EV / fast explorer | Exhaustive DP **within a frozen-frequency, with-replacement model**. Frequencies start from observed remaining cards, but are not depleted during lookahead. Approximation to the actual finite shoe. |
| Small-shoe exact explorer | Exhaustive finite-shoe DP, hit/stand/double only, optimal hit/stand continuation, floating-point arithmetic. No split action. Public counts are updated at every transition. |
| Split EV in fast model | Sum of two marginal hand EVs, one split, no resplitting. Shared dealer does not invalidate linearity of expectation. Additional double stakes are included; sufficient future cash is assumed. Not a bankroll-constrained or finite-shoe joint optimizer. |
| Monte Carlo | Finite-shoe sampled outcomes under a declared playing/betting policy. Statistical estimates, not exact EVs or proof of advantage. |
| Ruin | Observed fraction of 20 sessions unable to fund a 1-unit minimum bet over the configured horizon. Not infinite-horizon ruin probability. |

Net EV is in units of the active hand's original stake. A regular win is +1; a double win +2; a loss after doubling -2. Initial split EV aggregates both resulting hands and their possible doubles. Live split-hand analysis evaluates the active hand only, not the total round with other hands' outcomes. The split EV assumes later doubles can be funded: the game still enforces actual cash. This limitation is surfaced beside the recommendation.

Exact enumeration is capped at 100,000 states per solve. UI exact requests are restricted to 18 undealt cards. A budget limit or a positive-probability shoe-exhaustion branch raises an explicit error; no hidden fallback or invented reshuffle is used. Exact refers to exhaustive model transitions, not symbolic/rational arithmetic.

## Statistical experiment contract

Each experiment uses a master seed to generate 20 session seeds. Each session starts with 200 units and a fresh six-deck shoe. The playing policy selects the best legal frozen-model action using fresh-shoe frequencies minus that hand and upcard; it deliberately does **not** use current-shoe composition or count deviations. Hi-Lo affects bets only. The ramp is `min(8, max(1, 2*floor(TC)))`, capped by affordable whole units. Shuffle occurs before choosing the wager.

The estimator is net profit per **scheduled** round. If ruin stops a session, remaining scheduled rounds contribute zero profit. The approximate 95% Student-t interval uses the 20 independent session means (19 degrees of freedom), avoiding an independence assumption for correlated hands. The first session's realized bankroll is plotted. Results include the configuration, session seeds, summaries, and horizon; no fabricated curves. Twenty sessions are a modest sample, especially for rare ruin events. There is no claim of confidence coverage in extreme skewed or rare-event regimes.

## Structure

- `src/engine.ts`: pure decision solver and rank utilities; no rendering or game-order access.
- `src/game.ts`: pure seeded finite-shoe state transitions and settlements.
- `src/simulation.ts`: independently sampled session experiment and statistics.
- `src/*.worker.ts`: solver/simulation work isolated from the UI thread.
- `src/TableScene.tsx`: scene lifecycle, textures, rendering and fallback.
- `src/DecisionTree.tsx`: inspectable one-step chance transitions.
- `src/App.tsx`: table, state exploration, experiment controls and research views.
- `src/*.test.ts`: deterministic contracts, hand-enumeration oracles, game invariants, and independent sampled validation.
- [Research review](docs/RESEARCH.md): verified upstream sources, licensing, model distinctions and complexity.
- [Architecture and roadmap](docs/ARCHITECTURE.md): extension boundaries and staged work.

Original project code and documentation are available under the [MIT license](LICENSE). No upstream blackjack implementation or artwork was copied into the project. Dependencies retain their own licenses and are tracked by `package-lock.json`; investigated upstream projects and their licensing are documented in the research review.
