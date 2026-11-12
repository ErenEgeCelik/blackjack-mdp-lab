# Validation record

Validated on 2026-11-12 in the Windows workspace using Node.js 22.14.0.

- `npm test`: **130 tests passed across four files**.
- `npm run build`: TypeScript and Vite production build passed. Vite reports a non-fatal main-bundle size advisory (Three.js is included in the initial bundle; about 221 kB gzip). Further code splitting is a performance milestone, not a mathematical correctness issue.
- `node scripts/smoke.mjs`: headless Microsoft Edge assertions passed for WebGL rendering, deterministic deal, recommended action, round settlement, next round, approximate solver, exact solver, explicit exhaustion error, transition inspection, worker simulation, JSON download, and 390px mobile layout. No page errors or horizontal document overflow.
- Dependency installation's final npm audit: **zero reported vulnerabilities** at validation time. This is time-bound, not a continuing guarantee.

## Independent mathematical checks

The independent validation file uses its own hand-value calculation, random generator, dealer play and payoff logic. It compares sampled replacement-model outcomes with analytical values, and uses an ordered-card-world oracle for finite-shoe actions. It also verifies that player decisions depend on public observations rather than a future dealer card, and that changing physical shoe order/seed without changing public counts leaves live analysis unchanged.

The test suite explicitly demonstrates the split-funding limitation: a forecast that assumes future doubles can differ from a legal cash-constrained game. This is disclosed by the application and README. It has not been falsely declared fixed or exactly optimized.

Statistical validation reconstructs the experiment's interval from raw session profits and exercises ruin-stopped sessions. Its denominator includes all scheduled rounds; the number of actually played rounds is separately reported. This validates estimator accounting, not universal confidence-interval coverage.

## Evidence limits

No numerical parity run against upstream C++/Python executables has been performed. Sampled checks validate the declared model within statistical tolerance; they do not prove arbitrary rule variants or global blackjack optimality. WebGL fallback and lifecycle were separately exercised by the 3D delegate. Screenshots from browser checks are under `artifacts/` and are excluded from source tracking.

## Turkish learning edition

The companion textbook at `docs/MATHEMATICS_TUTORIAL_TR.md` contains 15 progressive chapters and reproducible code-backed examples. The six interactive Turkish lessons are in the application's **Öğrenme atölyesi** tab.

The extended automated suite passes **143 tests across six files**, including teaching formulas and published numerical fixtures. `scripts/learning-smoke.mjs` verifies all six lessons, quiz feedback, shoe depletion, payoff changes, the Bellman threshold, exact-versus-frozen decisions, zero/negative-edge growth explanations, Markdown download, and mobile layout. The production build passes; the main JavaScript bundle is about 230 kB gzip and still has Vite's non-fatal size advisory. The textbook is loaded separately when downloaded.

Independent Sol review covered the initial five textbook chapters and the interactive formulas. Following the subagent usage limit, the principal completed chapters 6–15 and checked their numerical examples. See `docs/TUTORIAL_REVIEW.md` for the precise audit scope; no claim of full independent mathematical peer review is made.
