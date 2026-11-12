# Blackjack computation research and architecture handoff

Research date: 2026-11-12. Scope: documentation only; no engine implementation, upstream execution, or performance reproduction. Repository observations below refer to the linked default branches as accessed on this date; these URLs are mutable, and no commit hashes were verified. Equations and architecture proposals are this report's synthesis unless attributed. The workspace currently declares a TypeScript/React/Vite application, so the proposed interfaces can fit that stack without making it a computational requirement.

## Decision to carry forward

Build an auditable finite-shoe probability model in stages. Keep **rules, player-visible information, continuation policy, numerical method, and optimization objective** explicit in every result. Exact evaluation of a restricted policy is useful, but does not establish globally optimal play. A combinatorial solver can also be approximate if it discards relevant split-hand depletion or truncates recursion.

Prioritize exact dealer probabilities and unsplit hit/stand/double values; validate splitting without resplits next. Treat general resplitting, complete return distributions, and bankroll utility as separate milestones. Keep a Monte Carlo implementation for independent checks and session estimates. Do not present a timeout fallback or an infinite-shoe result as an exact finite-shoe answer.

## Primary GitHub sources

| Source | Verified role and limitations | Verified license evidence |
| --- | --- | --- |
| [possibly-wrong/blackjack](https://github.com/possibly-wrong/blackjack) | C++ combinatorial reference. Its documentation distinguishes CDZ-, CDP1, and CDP split strategies; revision history reports exact split EV through four hands for CDZ- and CDP. Distribution computation has a narrower documented scope: no resplits and CDZ-. | **GPL-3.0-or-later** explicitly granted in [readme.txt](https://github.com/possibly-wrong/blackjack/blob/master/readme.txt); accompanying [gpl.txt](https://github.com/possibly-wrong/blackjack/blob/master/gpl.txt). The README separately identifies original card artwork as LGPL 3; code licensing does not establish asset licensing. |
| [nairnj/Blackjack](https://github.com/nairnj/Blackjack) | C++ exact/approximate comparison reference and companion implementation for Nairn's paper. README reports a historical reduction from an estimated 11,000 CPU-years to 45 CPU-days for the described calculation suite. These are author-reported figures, not current latency measurements. | **MIT**, copyright 2019 John A. Nairn, verified in [LICENSE](https://github.com/nairnj/Blackjack/blob/master/LICENSE). [Documentation](https://github.com/nairnj/Blackjack/blob/master/documentation/Blackjack.html) calls the tool public domain, while source files retain older copyright notices. Preserve the explicit license and notices rather than inferring that attribution is unnecessary. |
| [AttackingOrDefending/Blackjack-Strategy-Simulator](https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator) | Python action analysis, strategy generation, and Monte Carlo evaluation. README explicitly says split evaluation considers only the first few cards of the first hand. Generation effort and sampling introduce additional approximations; this is not a general exact-split oracle. | [LICENSE](https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator/blob/main/LICENSE) contains **AGPL version 3**; [README license grant](https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator#license) explicitly allows later versions. Record **AGPL-3.0-or-later**, rather than relying solely on GitHub's badge. |
| [mhluska/blackjack-simulator](https://github.com/mhluska/blackjack-simulator) | TypeScript simulation/training reference with basic strategy, Hi-Lo deviations, table settings, bankroll, and multiple-core support. Appropriate for sampled session behavior, not a proof of exact composition-dependent optimization. | **MIT**, copyright 2020 BlackjackTrainer, verified in [LICENSE](https://github.com/mhluska/blackjack-simulator/blob/master/LICENSE). |

Additional inspected implementation evidence:

- Farmer's [blackjack.h](https://github.com/possibly-wrong/blackjack/blob/master/src/blackjack.h) supports `BJReal` as either `double` or an optional rational type. Thus combinatorial exactness and arithmetic exactness are distinct. [blackjack.cpp](https://github.com/possibly-wrong/blackjack/blob/master/src/blackjack.cpp) separates dealer calculations, action values, overall aggregation, and conditioning on no dealer blackjack.
- Nairn's [Hand.cpp](https://github.com/nairnj/Blackjack/blob/master/source/Hand.cpp) has separate approximate, recursive exact, and pre-enumerated-hand exact split paths. Its continuation routines use specified basic-strategy rules; their exact EV is not a claim to full joint-state optimization. [Deck.cpp](https://github.com/nairnj/Blackjack/blob/master/source/Deck.cpp) explicitly adjusts draw weights after a negative peek.
- AttackingOrDefending's [best_move.py](https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator/blob/main/best_move.py) uses cached recursive action evaluation and a peek-probability helper. Its [expected_value.py](https://github.com/AttackingOrDefending/Blackjack-Strategy-Simulator/blob/main/expected_value.py) shuffles shoes and samples outcomes. A function/file named “expected value” does not identify whether its result is enumerated or estimated.
- mhluska's [simulator.ts](https://github.com/mhluska/blackjack-simulator/blob/master/src/simulator.ts) collects sampled results; [shoe.ts](https://github.com/mhluska/blackjack-simulator/blob/master/src/shoe.ts) updates Hi-Lo only for visible cards. Its documented shoe-exhaustion behavior pushes hands and reshuffles. Match such edge conventions explicitly before comparing outputs.

Use these as research references and optional external comparators. No source code was copied. Licensing observations describe the checked grants, not a compatibility determination for a future combined product. Paper availability does not automatically grant the accompanying repository's license to every publication or asset.

## Exact splitting literature and evidentiary limits

**John A. Nairn, _Exact Calculation of Expected Values for Splitting Pairs in Blackjack_ (2019).** [arXiv record](https://arxiv.org/abs/1909.13710), [full paper](https://arxiv.org/pdf/1909.13710), [author-hosted version](https://www.cof.orst.edu/cof/wse/faculty/Nairn/papers/splitting.pdf). Sections 2.4–2.5 combine dealer caching and pre-enumerated player hands with multiplicities. The paper gives single-deck exact splitting tables and compares resplit approximations, identifying tens as a problematic case for older approximations. Its continuation policy is prescribed zero-memory basic strategy. Its estimated five-order speedup and single-deck results do not imply interactive arbitrary-shoe, fully adaptive optimization. The rough growth is `M^h` for `M` possible player hands and `h` split hands, not a formal universal complexity theorem. The paper's historical priority claim should be attributed, not repeated as independently established fact.

**Eric Farmer, splitting manuscript linked from _Blackjack and pair splitting_ (2011).** The [author's article](https://possiblywrong.wordpress.com/2011/07/25/blackjack-and-pair-splitting/) links [blackjack_split.pdf](https://drive.google.com/file/d/1UNkJghfrYHJqY0zBntSRB12eBEGfC1Mb/view). The article and repository documentation were inspected, but the PDF body could not be retrieved through the available access paths. Consequently, this report does not claim to have audited that manuscript's proof or bibliographic date. The verified article discusses exact resplit evaluation for different post-split policy classes and emphasizes that using all split-hand information is a different optimization problem. It also proposes a useful weighted card-removal consistency check. Publication reuse license was not verified.

**Jarek Solowiej, _Finding Blackjack's Optimal Strategy in Real-time and Player's Expected Win_.** [arXiv record, submitted 2004](https://arxiv.org/abs/math/0412311), [paper](https://arxiv.org/pdf/math/0412311). Useful for the distinction between unconditional dealer probabilities and probabilities conditioned on no blackjack, including altered player draw weights. Its split pseudocode uses a doubled one-hand recursion and its hit routine includes a depth parameter. These features require checking policy symmetry, resplit limits, and truncation before using its numerical tables as an exact reference for a different model. The accessed PDF displays a later internal date than the arXiv submission record; cite the identifier rather than guessing publication history. Reuse license not verified.

**Lucas Bordeu and Javier Castro, _Optimal Blackjack Betting Strategies Through Dynamic Programming and Expected Utility Theory_ (2025).** [record](https://arxiv.org/abs/2505.00724), [full text, especially §3.1.6](https://arxiv.org/html/2505.00724v1). This is relevant to MDPs, return mass vectors, and utility, but explicitly approximates splitting with independent identically distributed hand returns. Its exact restricted hit/stand/double solution does not make its complete split policy or split-return variance exact. Treat it as a utility-model reference, not a joint split-distribution oracle. The arXiv record explicitly links **CC BY 4.0** for this paper; that grant was checked.

For a transparent approximate alternative, the author's [bjstrat recursive split discussion](https://www.bjstrat.net/splitAlgorithm_new.html) expressly describes an approximation that retains pair-card depletion while simplifying non-pair-card effects. This is a useful taxonomy of what an approximation omits, not evidence of exact resplit evaluation. Reuse license not verified.

## What an exact result must specify

There are at least four independent dimensions:

1. **Model:** finite shoe without replacement versus an infinite shoe with fixed draw probabilities. Solving the latter exactly still approximates finite-shoe blackjack.
2. **Policy:** evaluating a fixed chart, optimizing a restricted policy class, or optimizing every legal decision from all observable information. An exact fixed-policy expectation can be lower than another policy's expectation.
3. **Search:** exhaustive recursion/dynamic programming versus pruned trees, depth limits, simplified depletion, or Monte Carlo. Caching identical sufficient states preserves exactness; merging distinct states generally does not.
4. **Arithmetic:** floating-point enumeration versus rational arithmetic. Label the former “exact enumeration, floating-point arithmetic”; report tolerances and near ties. A Monte Carlo confidence interval covers sampling uncertainty, not structural model error.

Farmer's documented nomenclature is particularly useful: **CDZ-** applies the pre-split optimized composition-dependent strategy to split hands; **CDP1** optimizes for the first split hand and reuses it; **CDP** allows changes with additional pair-card removals. None of these labels by itself means a globally optimal strategy using every previous split-hand observation. See the [strategy definitions](https://github.com/possibly-wrong/blackjack/blob/master/readme.txt).

For a visible state `s`, a fixed policy has `V_pi(s) = E[R | s, pi]`; an optimizer has `V*(s) = max_a Q*(s,a)`, with the continuation policy specified. Define `R` as **net round profit per original unit wager**: a one-unit loss is `-1`, a push `0`, and a paid 3:2 natural `+1.5`. A split or double can increase exposure. Separately report profit per total amount wagered if desired; it has a different denominator.

## Hole-card information and peek conditioning

Distinguish these states in both APIs and cache keys:

| Information/rule state | Meaning for computation |
| --- | --- |
| Hidden hole card, before peek | A real card is reserved, but the policy does not know its value. Dealer blackjack remains possible. |
| Hidden hole card, negative peek | The reserved card is restricted: not ten-valued behind an ace, or not an ace behind a ten. |
| Known hole card | Condition on its actual rank and remove it from the drawable shoe. This is a different information model. |
| No hole card dealt yet | No reserved card; dealer draws its next card after player play. Specify settlement rules for a later dealer natural. |

A simulator may know a shuffled shoe and hidden card internally. The policy must receive only observations and a belief over hidden cards. Full remaining counts that silently exclude the actual hidden rank can leak that rank when the player knows the original composition. Unseen burn cards or unobserved earlier cards require additional marginalization; do not pretend they were observed removals.

Let `n[r]` count all unseen ranks **including one reserved hidden card**, after removing visible player cards and dealer upcard; let `N = sum(n)`. After a negative peek let `F` be the forbidden hole rank and `Z = N - n[F]`. Under uniform dealing:

```text
P(H = h | negative peek) = n[h] / Z, h != F; zero otherwise.

P(next = r | observations)
    = sum_h P(H = h | observations) * (n[r] - 1[r = h]) / (N - 1).

Therefore after a negative peek:
    r = F:  n[F] / (N - 1)
    r != F: n[r] * (Z - 1) / (Z * (N - 1)).
```

Require `Z > 0` and enough drawable cards; impossible evidence must be rejected. Without any restriction on a hidden card the mixture reduces to `n[r]/N`. After every visible draw decrement its count and update the hole-card belief. Do not keep the original posterior while recursively consuming cards. These weights agree with the explicit conditioning treatments in [Solowiej](https://arxiv.org/pdf/math/0412311) and [Nairn's Deck.cpp](https://github.com/nairnj/Blackjack/blob/master/source/Deck.cpp).

**Small check, derived here:** unseen cards `{T,T,9,A}`, dealer upcard ace, negative peek. Hole is equally likely to be `9` or `A`; the next card is `T` with probability `2/3`, and `9` or `A` each with probability `1/6`. Naively using `n[r]/N` incorrectly gives `1/2` for a ten. Deleting all tens from the unseen pool is also wrong: only the hole card is forbidden to be ten.

The maximizing action must be selected at an information state:

```text
Correct current decision: max_a sum_h belief[h] * Q(s, a, h).
Not available to a hidden-card player: sum_h belief[h] * max_a Q(s, a, h).
```

Future decisions may react to future visible cards, but not the still-hidden rank. Even within the first expression, a continuation solver must preserve this information boundary instead of optimizing each latent branch separately. Known-hole results are useful as a separate mode and generally give an information advantage.

For pre-peek EV, reintroduce the natural branch by total expectation: `P(BJ)*EV_given_BJ + P(no_BJ)*EV_after_negative_peek`, with consistent insurance and natural-push settlement. Negative-peek action EV is conditional and cannot be substituted for unconditional round EV. Insurance is offered before this information and is a separate wager. A no-peek hole-card game and a European no-hole-card game also need explicit **all-bets-lost versus original-bet-only** handling; these conventions affect split/double EV and are not interchangeable flags.

## Finite-shoe complexity and splitting

For ordinary blackjack that treats all ten-valued cards alike, a ten-count vector is sufficient for the shoe; retain separate ranks if rules distinguish them. Dynamic programming can merge draw permutations only when counts, hand state, action eligibility, information, and continuation policy agree. Total and softness alone omit finite-shoe depletion and natural/split eligibility.

For an initial `d`-deck shoe, a crude upper bound on count vectors is `(4d+1)^9 * (16d+1)`. At fixed `k` removed cards, unconstrained rank multisets number `binomial(k+9,9)`, before availability restrictions. These are counting bounds derived here, not estimates of reachable solver states. Single-round nonbust hands visit a much smaller subset; cross-round policy optimization visits far more compositions and adds bankroll and horizon dimensions.

Splitting introduces an ordered queue of pending hands, completed-hand settlement information, shared capacity for resplits, and multiple wagers. All hands consume the same finite shoe and face the same dealer. Drawing on one hand changes later beliefs and probabilities. An exhaustive round traversal must defer dealer resolution appropriately and account for all removals. Specify whether both split second cards are exposed before the first decision or are dealt sequentially; the observation sequence affects adaptive policies.

Linearity gives `E[R1 + R2] = E[R1] + E[R2]` **without independence**. Under an exchangeable fixed policy with no resplits and matched dealing conventions, symmetry can justify twice a correctly computed one-hand marginal. Thus “two times one hand is always wrong” is also too strong. With adaptive policies, global resplit caps, or asymmetric observations, establish the marginal/symmetry argument before using this shortcut. Nairn's explicit [joint recursion and hand enumeration](https://github.com/nairnj/Blackjack/blob/master/source/Hand.cpp) provide a useful alternative reference.

Variance requires covariance:

```text
Var(R1 + R2) = Var(R1) + Var(R2) + 2*Cov(R1,R2).
```

Convolving independent split-hand marginals loses both the shared dealer and shoe dependence. This remains an issue even in an infinite shoe because the dealer outcome is shared. Farmer's [distribution/variance analysis](https://possiblywrong.wordpress.com/2016/10/19/distribution-and-variance-in-blackjack/) explains why full return distributions are harder than EV and restricts its demonstrated distribution algorithm to no resplits. A scalar-EV shortcut does not automatically extend to utility or tail risk.

Start with a clear recursion, then profile. Memoize dealer distributions by sufficient shoe/dealer/rule/information state; cache policy values separately. Consider canonical hand multisets with correct path multiplicities, bounded caches, and precomputed dealer transitions after correctness is established. Do not reorder pending split hands unless equivalence is proved. Measure state counts, memory, cache hits, and wall time across depleted shoes and difficult low-pair/high-upcard cases before promising browser latency.

## Bankroll utility changes the optimization problem

For fixed continuation policy `pi`, obtain the distribution of **total round** profit `X_pi`. Given current bankroll `B` and original stake `b`, a one-round utility objective is:

```text
choose feasible b to maximize sum_x P(X_pi = x | visible state) * U(B + b*x).
```

Examples are linear utility `U(w)=w`, log utility `U(w)=log(w)`, CRRA `w^(1-gamma)/(1-gamma)` for `gamma != 1`, and CARA `-exp(-alpha*w)` for `alpha > 0`. Log/CRRA require a defined positive-wealth domain and explicit boundary behavior. Kelly's [original paper](https://onlinelibrary.wiley.com/doi/abs/10.1002/j.1538-7305.1956.tb03809.x) motivates log-growth optimization; it does not say that any positive-EV blackjack opportunity should receive an unconstrained stake.

The risk-neutral action maximizing monetary EV can differ from the action maximizing utility at a given stake. If utility determines play, optimize the within-round policy against that objective and include available bankroll/committed wagers in its state. A PMF generated under EV-optimal play supports utility evaluation of that policy, not a claim to jointly optimal utility play and betting.

Feasibility includes table limits, chip increments, funds reserved for insurance/splitting/doubling, and the treatment of an unaffordable action. Four split hands each doubled can require eight original units, apart from other wagers. Use worst reachable legal exposure or enforce funds at every action; testing only whether the initial wager fits the bankroll is insufficient.

For session optimization, use a joint transition over profit **and the next observable shoe/information state**:

```text
J_t(s,B) = max_(b,pi) E[J_(t+1)(s_next, B + b*X) | s],
J_T(s,B) = U(B).
```

A profit PMF alone loses correlation with the remaining shoe. Specify horizon, penetration, reshuffle, stopping, and whether sitting out is allowed. Forcing play differs from permitting a zero wager. Mean/variance betting approximations and fractional Kelly are separate approximate policies, not generic solutions to this finite-shoe Bellman equation. Bordeu–Castro's [utility framework and explicit split approximation](https://arxiv.org/html/2505.00724v1) are helpful evidence of this distinction.

## Monte Carlo validation plan

This is a proposed validation program, not tests run during this research task.

1. **Deterministic foundation:** enumerate tiny legal shoes by an independent method, using rational probabilities where practical. Check conservation of cards and probability mass, soft-ace transitions, natural versus post-split 21, H17/S17, surrender timing, and payout units. Define shoe exhaustion rather than dividing by zero or silently inserting cards.
2. **Information tests:** include the `{T,T,9,A}` negative-peek example, known-hole mode, pre-peek mixture recovery, and posterior updates after visible draws. Two latent simulations with identical observations must produce the same policy input and decision. Validate insurance separately before peek.
3. **Split tests:** no resplits, resplits to three/four hands, split aces, DAS on/off, all-bets/original-bet-only settlement, and depleted tens-rich/tens-poor shoes. Compare exact totals and complete PMFs on small cases; compare both means and variances so independent-hand errors cannot hide behind matching EV.
4. **External comparisons:** match all rules, shoe removals, peek phase, payout denominator, and policy class before comparing Farmer/Nairn outputs. Published tables are regression candidates after this reconciliation. An approximate source is a comparator, not an oracle. No upstream executable was run here.
5. **Independent sampling:** use a separately structured dealer/settlement path and seedable random generator. Fix the tested state, force the first action, then follow the declared continuation policy. Sample hidden cards from the proper posterior and reserve them. For negative-peek tests, conditional sampling or explicit rejection is valid; accidentally sampling dealer naturals is not.
6. **Statistical reporting:** report trials, independent units, seed, mean, standard error, confidence interval, and exact-minus-sampled residual. For independent reset rounds a large-sample mean interval is approximately `mean +/- 1.96*s/sqrt(n)`. For continuous shoes or sessions, use independent shoe/session replicates or justified batch/cluster methods; round observations and split hands are not automatically independent.

For planning only, assuming a measured round standard deviation near `1.2` original units gives `n ~= (1.96*1.2/epsilon)^2`: about **5.5 million independent rounds** for half-width `0.001`, and **553 million** for `0.0001`. Actual required effort depends on the tested state and wagers. Near-tied actions need paired-difference uncertainty or much more sampling; use common random numbers only with a valid coupling despite different card consumption.

Predefine precision targets and stopping rules. Selecting the best action and evaluating it on the same noisy samples creates selection bias; hold out evaluation samples. Multiple action/state comparisons need appropriate coverage treatment. For risk of ruin, run independent full sessions and report binomial uncertainty; zero observed ruin events is not proof of zero risk (a rough 95% upper bound is `3/n` for zero events in `n` independent sessions).

As an additional deterministic check, average a fixed policy's EV over one randomly hidden removed card, keeping its observation unchanged; the result should recover the original EV by total expectation. Require enough cards to complete the round in every compared case, so removal does not change exhaustion/settlement behavior. Reoptimizing after revealing the removed rank is a different information experiment and can increase value. This qualification matters when applying Farmer's [card-removal check](https://possiblywrong.wordpress.com/2011/07/25/blackjack-and-pair-splitting/). Passing checks and confidence intervals supplies evidence; it does not prove every branch correct.

## Recommended incremental architecture

Proposed responsibilities and acceptance gates, rather than an implementation prescription:

| Stage | Responsibility | Gate before advancing |
| --- | --- | --- |
| 0. Model contract | Immutable rules; payout/settlement definitions; rank convention; visibility/peek state; legal actions; deterministic observation projection. | A written rule matrix and hand-worked information/payout fixtures. Explicitly reject unsupported variants. |
| 1. Dealer oracle | Finite-shoe dealer outcome vector including natural, bust, and 17–21; explicit handling of known/hidden/no-hole-card states. | Probability mass and tiny-shoe enumeration agree, including peek conditioning. |
| 2. Unsplit evaluator | Exact stand/hit/double and declared surrender rules; fixed-policy evaluation separate from action optimization. Infinite-shoe mode is separately labeled. | Action values match tiny-shoe enumeration and compatible primary references. |
| 3. One split | No resplits; ordered hand transitions and shared dealer; fixed-policy EV first, then declared adaptive scope. | Cross-hand depletion, observation timing, and post-split payouts agree with full tiny-shoe traversal. |
| 4. Resplit evaluator | Global hand limit, split-ace restrictions, exposure accounting, explicit CDZ-/other policy modes. Profile dealer caches and hand enumeration. | Exact small cases and matched external cases agree; finite runtime/memory envelope measured. |
| 5. Round distributions | Joint round profit PMF and optional next-state transition kernel; moments derived from that distribution. | Mass, mean, variance, and correlated split cases reconcile with evaluation and independent simulation. |
| 6. Bankroll/session layer | Fixed-policy utility first; constrained bet selection; later utility-dependent play and horizon optimization. | Funding, domain boundaries, terminal conditions, and independent session validation pass. |

Cross-cutting components should be a pure transition/settlement model, an information/belief module, a policy interface, separate exact and sampling backends, and a result/provenance envelope. The policy observes a restricted state; backend internals may carry latent truth. Pass immutable rule/policy identifiers into cache scope. Action legality and natural eligibility must travel with hand state.

Suggested result metadata: rule and policy identifiers, shoe-count convention, information model and peek phase, objective, EV units, exact/approximate/sampled method, numerical precision, split scope, any truncation/omitted-state bounds, runtime, and sampling uncertainty when applicable. A larger search budget is not an error bound. If pruning is used, retain omitted probability mass and a justified payoff bound to bound EV error; otherwise call the bias unbounded/unknown.

For the current browser-oriented stack, run expensive analysis behind an asynchronous worker boundary with progress, cancellation, and bounded caches. Keep the mathematical core independent of React and the RNG injectable in simulation. Defer WASM/native acceleration until profiling demonstrates need. Return an explicitly labeled approximation or an incomplete result when a budget expires; do not populate an “exact” field with a fallback estimate.

### Coordination notes for engine and UI work

- Agree now on the unseen-count convention, peek phase, and net-profit denominator; these decisions affect every future fixture and display.
- Declare the first release's split policy and supported rule set. General resplitting and session utility can remain separate capabilities with explicit status.
- Use the MIT projects as potential implementation references subject to notice preservation. Keep GPL/AGPL references and any future code reuse decisions traceable; no reuse decision is made by this document.
- Label finite/infinite shoe, conditional/unconditional EV, policy class, and sampled uncertainty in displayed results. Show action-value gaps and unresolved ties without claiming unwarranted precision.
- Open evidence gap: Farmer's linked manuscript body remains unread. Pin reviewed upstream revisions before producing a permanent reference dataset. None of the engines, published timings, or numerical result tables has been independently reproduced in this task.

Only `docs/RESEARCH.md` was authored for this research handoff.
