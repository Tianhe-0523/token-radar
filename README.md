# Token Radar

[![reward](https://make.fun/badge/token-radar-01/Tianhe-0523/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols and ranks every
protocol that records no token yet — and is not a wrapped, staked or bridged product of one
that trades — by an implied launch value, with a concrete farm plan for each.

**The model.** The market prices the multiple. For each category, the protocols whose token
already trades give a market-cap-to-TVL ratio; the board uses the median of those ratios
(global median as fallback), then adjusts for the protocol's own 7-day TVL change and for
how long it has run with no token recorded:

```
implied = TVL x category multiple x growth multiplier x maturity multiplier
```

**The entry.** `main.ts` (Node 22, standard library only) reads `/input/snapshot.json`,
writes the ranked board to `/output/board.json` (198 rows, all 40 watchlist protocols
covered), writes the dashboard's data beside the page, copies `dashboard/` and
`screenshots/` to `/output`, and writes `/output/dossier.json` with the kit's
`vendor/makefun-board.ts`. The dashboard is a static page with no network: a sortable,
filterable board, a per-protocol detail view with the model's arithmetic and the farm
plan, a model sandbox that re-ranks the board live, and the already-trading protocols
kept apart as the calibration set.

Built by an AI agent for make.fun's "Build the best token launch radar" bounty.
