// Token Radar model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// THE BOARD. A protocol is a launch candidate when the snapshot records no token for it
// (mcap_usd, gecko_id and symbol all null) and it is not a wrapped, staked or bridged product
// of a token that already trades. The product test is the snapshot field guide's own watchlist
// rule with the TVL floor removed: the category is not Bridge, Canonical Bridge, Liquid
// Staking, Liquid Restaking, Restaked BTC or CEX; the name ends in no version marker, carries
// no whole word "wrapped", "staked" or "staking", and does not begin with an exchange's name.
// That rule keeps WBTC, USDT0 and Binance staked ETH off the board for the same reason the
// house keeps them off its watchlist: each is an existing token in a wrapper, not a launch
// still to come. Every watchlist slug is on the board (the floor), and so is every other
// candidate the rule admits, at any TVL (the radar's early rows). No name is special-cased
// beyond the stated rule, and the same function scores every row.
//
// THE VALUE MODEL. The market itself prices the multiple. For every category, the protocols
// whose token already trades give a market-cap-to-TVL ratio; the category's multiple is the
// median of those ratios (four or more observations, clamped to [0.02, 2.5]), and a category
// with too few traded peers falls back to the global median over all traded protocols:
//
//   implied = tvl_usd x category_multiple x growth_multiplier x maturity_multiplier
//   growth_multiplier   = 1 + clamp(change_7d, -50, 100) / 100 x 0.6   (no report: 1.0)
//   maturity_multiplier = 0.75 + 0.35 x min(age_days, 1095) / 1095     (age unknown: 365 days)
//
// A row's implied value is a claim about what a token would be worth if the protocol's record
// stayed as it is. It is not a prediction that a token will be issued.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label, stated in the dashboard. */
export const MODEL_VERSION = 'radar-2 (category-calibrated)';

/** The growth and maturity constants of the stated model. */
export const GROWTH_WEIGHT = 0.6;
export const GROWTH_FLOOR = -50;
export const GROWTH_CAP = 100;
export const MATURITY_BASE = 0.75;
export const MATURITY_RANGE = 0.35;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;
/** A category needs at least this many traded peers before its own median is trusted. */
export const CALIBRATION_MIN_N = 4;
/** Category multiples are clamped to this band so one thin category cannot dominate the board. */
export const MULTIPLE_MIN = 0.02;
export const MULTIPLE_MAX = 2.5;

/** One category's calibration: how many traded peers priced it, and the multiple the board uses. */
export interface CalibrationRow {
  category: string;
  traded_peers: number;
  median_ratio: number;
  multiple: number;
  source: 'category median' | 'global median';
}

/** A farm step: the action as one string with its cost and time, as the gate reads it. */
export type FarmStep = string;

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    calibration: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: FarmStep[];
}

/** The dashboard's view of one board row, with everything the page renders or recomputes. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: FarmStep[];
}

/** A protocol whose token already trades: shown apart, at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: {
    growth_weight: number;
    growth_floor: number;
    growth_cap: number;
    maturity_base: number;
    maturity_range: number;
    maturity_days: number;
    calibration_min_n: number;
  };
  scanned: number;
  candidates: number;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  global_multiple: number;
  calibration: CalibrationRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clampMultiple = (n: number): number => Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether the snapshot records no token for a protocol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that are products of other tokens, or an exchange itself: never a launch candidate. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Whole words that mark a wrapped or staked product in a name. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
/** Exchange names a product of an exchange may begin with. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol is a launch candidate the board may rank (the watchlist rule, floor removed). */
export function isCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/**
 * The calibration: one multiple per category, priced by the protocols whose token already
 * trades. CEX is left out of the pricing set (an exchange token prices the exchange, not a
 * protocol of that kind); every other traded protocol with a market cap and TVL counts.
 */
export function calibrate(snapshot: Snapshot): { table: CalibrationRow[]; globalMultiple: number; byCategory: Map<string, CalibrationRow> } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    if (p.category !== null) {
      const list = ratios.get(p.category) ?? [];
      list.push(ratio);
      ratios.set(p.category, list);
    }
  }
  const globalMultiple = clampMultiple(median(all));
  const byCategory = new Map<string, CalibrationRow>();
  const categories = new Set<string>();
  for (const p of snapshot.protocols) if (p.category !== null) categories.add(p.category);
  for (const category of categories) {
    const list = ratios.get(category) ?? [];
    if (list.length >= CALIBRATION_MIN_N) {
      const med = median(list);
      byCategory.set(category, { category, traded_peers: list.length, median_ratio: round4(med), multiple: round4(clampMultiple(med)), source: 'category median' });
    } else {
      byCategory.set(category, { category, traded_peers: list.length, median_ratio: round4(list.length > 0 ? median(list) : globalMultiple), multiple: round4(globalMultiple), source: 'global median' });
    }
  }
  const table = [...byCategory.values()].sort((a, b) => b.traded_peers - a.traded_peers || (a.category < b.category ? -1 : 1));
  return { table, globalMultiple: round4(globalMultiple), byCategory };
}

/** The three multipliers and the implied value one protocol gets under the stated model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMult = MATURITY_BASE + (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS) * MATURITY_RANGE;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The board: every candidate, plus every watchlist slug whatever the rule says, ranked by implied value. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; calibration: CalibrationRow[]; globalMultiple: number; candidates: number } {
  const { table, globalMultiple, byCategory } = calibrate(snapshot);
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) if (isCandidate(p)) chosen.set(p.slug, p);
  const candidates = chosen.size;
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const cal = p.category !== null ? byCategory.get(p.category) : undefined;
    const multiple = cal?.multiple ?? globalMultiple;
    const v = impliedValue(p, snapshot.as_of, multiple);
    return { p, multiple, calibration: cal?.source ?? 'global median', ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      calibration: s.calibration,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
  return { board, calibration: table, globalMultiple, candidates };
}

/** Gas for one on-chain action, by the chain the action happens on. */
function gasProfile(chain: string): { label: string; action: number; weekly: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { label: 'Ethereum mainnet gas', action: 12, weekly: 6 };
  if (c === 'solana') return { label: 'Solana fees', action: 1, weekly: 1 };
  if (c.includes('bitcoin')) return { label: 'Bitcoin network fees', action: 6, weekly: 3 };
  if (c === 'bsc' || c === 'binance') return { label: 'BNB Chain gas', action: 1, weekly: 1 };
  return { label: `${chain} gas (a layer-2 or low-fee chain)`, action: 2, weekly: 1 };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 1000;
  if (p.tvl_usd >= 250_000_000) return 500;
  if (p.tvl_usd >= 50_000_000) return 250;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow, with the protocol's own figures in it. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow about 40% against it and re-supply the borrowed amount once, so both the supply and borrow sides of the book carry your wallet.`;
  if (c.includes('cdp')) return `Deposit $${capital} of ETH or a liquid staking token as collateral in ${n} on ${chain} and mint its stablecoin at under 50% of the maximum loan-to-value, keeping a liquidation buffer.`;
  if (c.includes('dex')) return `Swap about $${capital} of volume through ${n}'s main pairs on ${chain} across several days, then place $${Math.round(capital / 2)} into its deepest pool inside a tight range.`;
  if (c.includes('deriv') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${n} and trade small hedged positions until your cumulative volume passes $${capital * 10}, keeping leverage under 3x.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into the largest curated vault ${n} runs on ${chain} and keep the vault shares in the same wallet for the whole window.`;
  if (c.includes('rwa')) return `Subscribe $${capital} to ${n}'s tokenised treasury or credit asset on ${chain} and hold the position token past two distribution dates.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${n}'s highest-TVL vault on ${chain} and leave auto-compounding on, so the balance itself records continuous activity.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of ETH or its liquid staking token through ${n} on ${chain} and keep the receipt token unspent in the farming wallet.`;
  if (c.includes('stable') || c.includes('wrapper')) return `Mint $${capital} of ${n}'s stable asset on ${chain} with USDC and hold it, then supply half of it to the protocol's own liquidity pool.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover on a large protocol from ${n} on ${chain}; if you prefer the other side, deposit $${capital} into its underwriting pool instead.`;
  if (c.includes('basis')) return `Open a $${capital} basis position through ${n} on ${chain}: long the spot asset, short the same size on its perpetual market, and keep both legs funded.`;
  if (c.includes('payment')) return `Route $${capital} of real payments or transfers through ${n} on ${chain} over two weeks, the way a user of its payment rails would.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${chain} and use ${n}'s native apps weekly: swaps, a name or identity registration if it offers one, and one contract deployment if you can.`;
  if (c.includes('governance')) return `Acquire and stake $${capital} of ${n}'s governance or incentive position on ${chain} and vote in every proposal that opens during the window.`;
  if (c.includes('cede') || c.includes('cedefi')) return `Deposit $${capital} into ${n}'s flagship earn product on ${chain} and keep it through at least one full interest period.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its main app and keep the position open, adding one small top-up in the second week.`;
}

/** The category's second qualifying action: what separates a farmer from a one-click depositor. */
function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('collateral')) return `Once a week, adjust the position once: repay a slice or add collateral on ${chain}, so the wallet shows risk management, not a single forgotten deposit.`;
  if (c.includes('dex')) return `Claim any fee or reward the pool pays out and restake it in the same pool on ${chain}; a claim transaction is a second kind of activity most farmers skip.`;
  if (c.includes('deriv') || c.includes('perpetual')) return `Keep a trade journal of every position on ${n} and close the window flat or hedged; consistent moderate volume reads as a user, a single huge trade reads as a wash.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount back the other way through ${n} so the wallet has traffic in both directions on ${chain}.`;
  return `Use one more surface of ${n} than the deposit page: its analytics, governance, referral or rewards page on ${chain}, and make one transaction there.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, first chain, TVL tier, age) — never from a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const gas = gasProfile(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const steps = [
    `Set up a fresh wallet for ${p.name} alone and fund it on ${chain} by the cheapest route (an exchange withdrawal straight to ${chain} beats bridging). Cost: about $${gas.action} in ${gas.label}. Time: 20 minutes, once.`,
    `${coreAction(p, capital, chain)} Cost: $${capital} of capital plus about $${gas.action} in ${gas.label}. Time: 30 minutes to set up.`,
    `${secondAction(p, chain)} Cost: about $${gas.weekly} in ${gas.label} each time. Time: 10 minutes a week.`,
    `Repeat one qualifying action every week for the whole window; steady weekly activity across ${hold} days counts for more in most points systems than one large deposit. Cost: about $${gas.weekly} a week in ${gas.label}. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days so it appears in several weekly snapshots, and check ${p.name}'s own points or rewards page before withdrawing — claim only from the link the protocol itself publishes. Cost: the $${capital} stays in the position. Time: ${hold} days, 10 minutes to check.`,
    `Keep a farm log for this wallet: dates, amounts and transaction hashes for ${p.name}. If a token or points conversion is announced, the log is your proof of work and your unwind plan. Cost: nothing. Time: 5 minutes a week.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The protocols whose token already trades, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 40)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: everything the page renders, nothing it does not. */
function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration, globalMultiple, candidates } = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: {
      growth_weight: GROWTH_WEIGHT,
      growth_floor: GROWTH_FLOOR,
      growth_cap: GROWTH_CAP,
      maturity_base: MATURITY_BASE,
      maturity_range: MATURITY_RANGE,
      maturity_days: MATURITY_DAYS,
      calibration_min_n: CALIBRATION_MIN_N,
    },
    scanned: snapshot.protocols.length,
    candidates,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    global_multiple: globalMultiple,
    calibration,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
