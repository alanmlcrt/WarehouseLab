import { createSeededRandom } from "../utils/random";

export interface ColumnSeries {
  id: string;
  values: number[];
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function variance(values: number[], avg = mean(values)): number {
  if (values.length < 2) {
    return 0;
  }
  return (
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1)
  );
}

export function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Error function (Abramowitz & Stegun 7.1.26), max error ~1.5e-7. */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/** Standard normal CDF Φ(z). */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) {
    return 0;
  }
  const ax = mean(xs);
  const ay = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - ax;
    const b = ys[i] - ay;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) {
    return 0;
  }
  return num / Math.sqrt(dx * dy);
}

export function correlationMatrix(series: ColumnSeries[]): number[][] {
  return series.map((row) =>
    series.map((column) => pearson(row.values, column.values)),
  );
}

export interface ParetoOptions {
  minimizeX?: boolean;
  minimizeY?: boolean;
}

export function paretoFront(
  points: { x: number; y: number }[],
  options: ParetoOptions = {},
): number[] {
  const minimizeX = options.minimizeX ?? false;
  const minimizeY = options.minimizeY ?? false;
  const dominates = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const xBetterOrEqual = minimizeX ? a.x <= b.x : a.x >= b.x;
    const yBetterOrEqual = minimizeY ? a.y <= b.y : a.y >= b.y;
    const xStrictlyBetter = minimizeX ? a.x < b.x : a.x > b.x;
    const yStrictlyBetter = minimizeY ? a.y < b.y : a.y > b.y;
    return xBetterOrEqual && yBetterOrEqual && (xStrictlyBetter || yStrictlyBetter);
  };
  const result: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let dominated = false;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) {
        continue;
      }
      if (dominates(points[j], points[i])) {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      result.push(i);
    }
  }
  result.sort((a, b) => points[a].x - points[b].x);
  return result;
}

export interface RegressionFeature {
  id: string;
  values: number[];
}

export interface RegressionResult {
  intercept: number;
  coefficients: Array<{
    id: string;
    raw: number;
    standardized: number;
  }>;
  rSquared: number;
  adjustedRSquared: number;
  rmse: number;
  predicted: number[];
  residuals: number[];
  sampleSize: number;
}

export function olsRegression(
  features: RegressionFeature[],
  target: number[],
): RegressionResult | null {
  const n = target.length;
  const k = features.length;
  if (n === 0 || k === 0 || features.some((feature) => feature.values.length !== n)) {
    return null;
  }
  if (n <= k + 1) {
    return null;
  }

  const X: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const row = [1];
    for (let j = 0; j < k; j += 1) {
      row.push(features[j].values[i]);
    }
    X.push(row);
  }

  const xt = transpose(X);
  const xtx = multiply(xt, X);
  const xtxInv = invert(xtx);
  if (!xtxInv) {
    return null;
  }
  const xty = multiplyVector(xt, target);
  const beta = multiplyVector(xtxInv, xty);

  const predicted: number[] = [];
  const residuals: number[] = [];
  let ssRes = 0;
  const yMean = mean(target);
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    let value = beta[0];
    for (let j = 0; j < k; j += 1) {
      value += beta[j + 1] * features[j].values[i];
    }
    predicted.push(value);
    const residual = target[i] - value;
    residuals.push(residual);
    ssRes += residual * residual;
    ssTot += (target[i] - yMean) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const adjustedRSquared =
    n - k - 1 > 0 ? 1 - (1 - rSquared) * ((n - 1) / (n - k - 1)) : rSquared;
  const rmse = Math.sqrt(ssRes / n);
  const targetStd = standardDeviation(target);

  const coefficients = features.map((feature, index) => {
    const raw = beta[index + 1];
    const featureStd = standardDeviation(feature.values);
    const standardized = targetStd === 0 ? 0 : raw * (featureStd / targetStd);
    return { id: feature.id, raw, standardized };
  });

  return {
    intercept: beta[0],
    coefficients,
    rSquared,
    adjustedRSquared,
    rmse,
    predicted,
    residuals,
    sampleSize: n,
  };
}

// ---------------------------------------------------------------------------
// Replicate robustness — aggregate seed repeats sharing the same combination
// ---------------------------------------------------------------------------

export interface ReplicateSummary {
  key: string;
  label: string;
  n: number;
  mean: number;
  std: number;
  /** Coefficient of variation (std / |mean|); lower = more robust to seed. */
  cv: number;
  min: number;
  max: number;
}

/** Group rows by `key`, then compute mean/std/CV of `value` within each group.
 *  Decoupled from RunPoint on purpose: the caller maps points → rows. */
export function summarizeReplicates(
  rows: Array<{ key: string; label: string; value: number }>,
): ReplicateSummary[] {
  const groups = new Map<string, { label: string; values: number[] }>();
  for (const row of rows) {
    if (!Number.isFinite(row.value)) {
      continue;
    }
    const group = groups.get(row.key);
    if (group) {
      group.values.push(row.value);
    } else {
      groups.set(row.key, { label: row.label, values: [row.value] });
    }
  }

  const summaries: ReplicateSummary[] = [];
  for (const [key, group] of groups) {
    const avg = mean(group.values);
    const std = standardDeviation(group.values);
    summaries.push({
      key,
      label: group.label,
      n: group.values.length,
      mean: avg,
      std,
      cv: avg !== 0 ? std / Math.abs(avg) : 0,
      min: Math.min(...group.values),
      max: Math.max(...group.values),
    });
  }
  summaries.sort((a, b) => b.mean - a.mean);
  return summaries;
}

// ---------------------------------------------------------------------------
// Fleet scaling — log-log law throughput ≈ exp(a) · robots^b, to size R*
// ---------------------------------------------------------------------------

export interface FleetScaling {
  /** Intercept a and slope b of ln(throughput) = a + b·ln(robots). */
  intercept: number;
  slope: number;
  rSquared: number;
  sampleSize: number;
}

export function estimateFleetScaling(
  robotCounts: number[],
  throughputs: number[],
): FleetScaling | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const n = Math.min(robotCounts.length, throughputs.length);
  for (let i = 0; i < n; i += 1) {
    if (robotCounts[i] > 0 && throughputs[i] > 0) {
      xs.push(Math.log(robotCounts[i]));
      ys.push(Math.log(throughputs[i]));
    }
  }
  const fit = olsRegression([{ id: "lnRobots", values: xs }], ys);
  if (!fit) {
    return null;
  }
  return {
    intercept: fit.intercept,
    slope: fit.coefficients[0]?.raw ?? 0,
    rSquared: fit.rSquared,
    sampleSize: fit.sampleSize,
  };
}

/** Invert the scaling law to get the robot count needed to reach a target
 *  throughput (caisses/min). Returns null when sizing is meaningless: a
 *  non-positive slope means adding robots no longer raises throughput
 *  (saturation / congestion), so there is no R* to solve for. */
export function robotsForThroughput(
  scaling: FleetScaling,
  targetThroughput: number,
): number | null {
  if (targetThroughput <= 0 || scaling.slope <= 1e-6) {
    return null;
  }
  const lnRobots = (Math.log(targetThroughput) - scaling.intercept) / scaling.slope;
  const robots = Math.exp(lnRobots);
  return Number.isFinite(robots) ? robots : null;
}

export interface RStarInterval {
  point: number;
  low: number;
  high: number;
  /** Fraction of bootstrap resamples that yielded a usable (non-saturated) R*. */
  validShare: number;
}

/** Bootstrap a confidence interval for R* by resampling the (robots, throughput)
 *  observations with replacement, refitting the scaling law each time, and
 *  inverting it at the target. Seeded for reproducibility (the lab is
 *  deterministic). Returns null when the point estimate itself is undefined. */
export function bootstrapRStar(
  robotCounts: number[],
  throughputs: number[],
  targetThroughput: number,
  options: { samples?: number; quantile?: number } = {},
): RStarInterval | null {
  const n = Math.min(robotCounts.length, throughputs.length);
  if (n < 3) {
    return null;
  }
  const pointScaling = estimateFleetScaling(robotCounts, throughputs);
  const point = pointScaling
    ? robotsForThroughput(pointScaling, targetThroughput)
    : null;
  if (point === null) {
    return null;
  }

  const samples = Math.max(50, options.samples ?? 300);
  const quantile = options.quantile ?? 0.1;
  const rng = createSeededRandom(987654321);
  const estimates: number[] = [];

  for (let s = 0; s < samples; s += 1) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(rng.next() * n);
      xs.push(robotCounts[idx]);
      ys.push(throughputs[idx]);
    }
    const scaling = estimateFleetScaling(xs, ys);
    if (!scaling) {
      continue;
    }
    const rStar = robotsForThroughput(scaling, targetThroughput);
    if (rStar !== null && rStar > 0 && Number.isFinite(rStar)) {
      estimates.push(rStar);
    }
  }

  if (estimates.length < 10) {
    return { point, low: point, high: point, validShare: estimates.length / samples };
  }

  estimates.sort((a, b) => a - b);
  const at = (q: number) =>
    estimates[Math.min(estimates.length - 1, Math.max(0, Math.floor(q * (estimates.length - 1))))];

  return {
    point,
    low: at(quantile),
    high: at(1 - quantile),
    validShare: estimates.length / samples,
  };
}

// ---------------------------------------------------------------------------
// Non-parametric inference — Kruskal-Wallis H test, effect size, power
// ---------------------------------------------------------------------------

/** ln Γ(x) — Lanczos approximation (Numerical Recipes). */
function lnGamma(x: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += coefficients[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a). */
function regularizedGammaP(a: number, x: number): number {
  if (x <= 0 || a <= 0) {
    return 0;
  }
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 300; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-13) {
        break;
      }
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  return 1 - regularizedGammaQ(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a) via the
 *  Lentz continued fraction. */
function regularizedGammaQ(a: number, x: number): number {
  if (x <= 0) {
    return 1;
  }
  if (a <= 0) {
    return 0;
  }
  if (x < a + 1) {
    return 1 - regularizedGammaP(a, x);
  }
  const tiny = 1e-30;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 300; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) {
      d = tiny;
    }
    c = b + an / c;
    if (Math.abs(c) < tiny) {
      c = tiny;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-13) {
      break;
    }
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Upper-tail p-value P(χ²_df > x). */
export function chiSquarePValue(x: number, df: number): number {
  if (x <= 0 || df <= 0) {
    return 1;
  }
  return regularizedGammaQ(df / 2, x / 2);
}

function chiSquareCdf(x: number, df: number): number {
  if (x <= 0 || df <= 0) {
    return 0;
  }
  return regularizedGammaP(df / 2, x / 2);
}

/** Inverse χ² CDF via bisection — the critical value with CDF = p. */
function chiSquareQuantile(p: number, df: number): number {
  let low = 0;
  let high = df + 10 * Math.sqrt(2 * df) + 50;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (chiSquareCdf(mid, df) < p) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

/** CDF of a noncentral χ²(df, λ) via Poisson-weighted central χ² mixture. */
function noncentralChiSquareCdf(x: number, df: number, lambda: number): number {
  if (x <= 0) {
    return 0;
  }
  const halfLambda = lambda / 2;
  let term = Math.exp(-halfLambda);
  let sum = 0;
  for (let j = 0; j < 400; j += 1) {
    sum += term * regularizedGammaP(df / 2 + j, x / 2);
    term *= halfLambda / (j + 1);
    if (term < 1e-13 && j > halfLambda) {
      break;
    }
  }
  return sum;
}

export type EffectMagnitude = "négligeable" | "faible" | "moyen" | "fort";

export function interpretEpsilonSquared(value: number): EffectMagnitude {
  const v = Math.abs(value);
  if (v < 0.01) {
    return "négligeable";
  }
  if (v < 0.08) {
    return "faible";
  }
  if (v < 0.26) {
    return "moyen";
  }
  return "fort";
}

export function interpretCliffsDelta(value: number): EffectMagnitude {
  const v = Math.abs(value);
  if (v < 0.147) {
    return "négligeable";
  }
  if (v < 0.33) {
    return "faible";
  }
  if (v < 0.474) {
    return "moyen";
  }
  return "fort";
}

export interface KruskalWallisResult {
  /** Tie-corrected H statistic (≈ χ² with k−1 df under H0). */
  h: number;
  df: number;
  pValue: number;
  /** ε² effect size = H / (N − 1), in [0, 1]. */
  epsilonSquared: number;
  /** Approximate post-hoc power of the test at α = 0.05. */
  power: number;
  n: number;
  k: number;
}

interface PooledRanks {
  n: number;
  k: number;
  counts: number[];
  rankSums: number[];
  /** Σ(t³ − t) over tie groups, for the tie correction. */
  tieSum: number;
}

/** Pool all group values, assign average ranks (1-based) with tie handling, and
 *  return per-group rank sums + counts + the tie term. Shared by the
 *  Kruskal-Wallis omnibus test and Dunn's post-hoc test. */
function rankGroups(clean: number[][]): PooledRanks | null {
  const k = clean.length;
  if (k < 2) {
    return null;
  }
  const pooled: Array<{ value: number; group: number }> = [];
  clean.forEach((group, index) => {
    for (const value of group) {
      pooled.push({ value, group: index });
    }
  });
  const n = pooled.length;
  if (n <= k) {
    return null;
  }

  pooled.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(n);
  let tieSum = 0;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && pooled[j + 1].value === pooled[i].value) {
      j += 1;
    }
    const averageRank = (i + j) / 2 + 1; // ranks are 1-based
    for (let r = i; r <= j; r += 1) {
      ranks[r] = averageRank;
    }
    const t = j - i + 1;
    if (t > 1) {
      tieSum += t * t * t - t;
    }
    i = j + 1;
  }

  const rankSums = new Array<number>(k).fill(0);
  const counts = new Array<number>(k).fill(0);
  for (let idx = 0; idx < n; idx += 1) {
    rankSums[pooled[idx].group] += ranks[idx];
    counts[pooled[idx].group] += 1;
  }

  return { n, k, counts, rankSums, tieSum };
}

/** Kruskal-Wallis H test (non-parametric one-way ANOVA) across ≥2 groups,
 *  with tie correction, ε² effect size, and an approximate power estimate.
 *  Returns null when there are fewer than two non-empty groups. */
export function kruskalWallis(groups: number[][]): KruskalWallisResult | null {
  const clean = groups
    .map((group) => group.filter((value) => Number.isFinite(value)))
    .filter((group) => group.length > 0);
  const ranked = rankGroups(clean);
  if (!ranked) {
    return null;
  }
  const { n, k, counts, rankSums, tieSum } = ranked;

  let hBase = 0;
  for (let g = 0; g < k; g += 1) {
    hBase += (rankSums[g] * rankSums[g]) / counts[g];
  }
  hBase = (12 / (n * (n + 1))) * hBase - 3 * (n + 1);

  const tieCorrection = 1 - tieSum / (n * n * n - n);
  const h = tieCorrection > 0 ? hBase / tieCorrection : hBase;
  const df = k - 1;
  const pValue = chiSquarePValue(h, df);
  const epsilonSquared = Math.max(0, Math.min(1, h / (n - 1)));

  // Approximate power: derive a noncentrality λ from the observed effect and
  // sample size, then evaluate against the α = 0.05 critical value.
  const alpha = 0.05;
  const crit = chiSquareQuantile(1 - alpha, df);
  const epsClamped = Math.min(0.999, epsilonSquared);
  const lambda = (n * epsClamped) / (1 - epsClamped);
  const power = Math.max(
    alpha,
    Math.min(1, 1 - noncentralChiSquareCdf(crit, df, lambda)),
  );

  return { h, df, pValue, epsilonSquared, power, n, k };
}

/** Cliff's delta — non-parametric pairwise effect size in [−1, 1]. */
export function cliffsDelta(a: number[], b: number[]): number {
  const xs = a.filter((value) => Number.isFinite(value));
  const ys = b.filter((value) => Number.isFinite(value));
  if (xs.length === 0 || ys.length === 0) {
    return 0;
  }
  let greater = 0;
  let less = 0;
  for (const x of xs) {
    for (const y of ys) {
      if (x > y) {
        greater += 1;
      } else if (x < y) {
        less += 1;
      }
    }
  }
  return (greater - less) / (xs.length * ys.length);
}

export interface DunnComparison {
  a: string;
  b: string;
  z: number;
  p: number;
  /** Holm step-down adjusted p-value. */
  pAdjusted: number;
  significant: boolean;
}

/** Dunn's post-hoc test after Kruskal-Wallis: pairwise z-tests on mean-rank
 *  differences (shared tie-corrected variance), with Holm step-down correction
 *  for the family of k(k−1)/2 comparisons. Returns null when fewer than two
 *  non-empty groups. */
export function dunnTest(
  groups: number[][],
  labels: string[],
  alpha = 0.05,
): DunnComparison[] | null {
  const labelled = groups
    .map((group, index) => ({
      values: group.filter((value) => Number.isFinite(value)),
      label: labels[index] ?? `g${index}`,
    }))
    .filter((entry) => entry.values.length > 0);
  const ranked = rankGroups(labelled.map((entry) => entry.values));
  if (!ranked) {
    return null;
  }
  const { n, counts, rankSums, tieSum } = ranked;
  const meanRank = rankSums.map((sum, index) => sum / counts[index]);
  // Shared variance term with tie adjustment (Dunn 1964).
  const tieAdjustment = tieSum / (12 * (n - 1));
  const base = (n * (n + 1)) / 12 - tieAdjustment;

  const comparisons: DunnComparison[] = [];
  for (let i = 0; i < labelled.length; i += 1) {
    for (let j = i + 1; j < labelled.length; j += 1) {
      const se = Math.sqrt(Math.max(0, base) * (1 / counts[i] + 1 / counts[j]));
      const z = se > 0 ? (meanRank[i] - meanRank[j]) / se : 0;
      const p = 2 * (1 - normalCdf(Math.abs(z)));
      comparisons.push({
        a: labelled[i].label,
        b: labelled[j].label,
        z,
        p,
        pAdjusted: p,
        significant: false,
      });
    }
  }

  // Holm step-down: sort by raw p ascending, multiply by (m − rank), enforce
  // monotonicity, clamp to 1.
  const order = comparisons
    .map((comparison, index) => ({ index, p: comparison.p }))
    .sort((a, b) => a.p - b.p);
  const m = comparisons.length;
  let previous = 0;
  order.forEach((entry, rank) => {
    const adjusted = Math.min(1, (m - rank) * comparisons[entry.index].p);
    const monotone = Math.max(previous, adjusted);
    previous = monotone;
    comparisons[entry.index].pAdjusted = monotone;
    comparisons[entry.index].significant = monotone < alpha;
  });

  return comparisons;
}

export interface MeanInterval {
  mean: number;
  low: number;
  high: number;
}

/** Percentile bootstrap confidence interval for the mean (default 95%), seeded
 *  for reproducibility — same approach as `bootstrapRStar`. */
export function bootstrapMeanCI(
  values: number[],
  options: { samples?: number; quantile?: number } = {},
): MeanInterval {
  const finite = values.filter((value) => Number.isFinite(value));
  const pointMean = mean(finite);
  if (finite.length < 2) {
    return { mean: pointMean, low: pointMean, high: pointMean };
  }
  const samples = Math.max(50, options.samples ?? 400);
  const quantile = options.quantile ?? 0.025;
  const rng = createSeededRandom(1234567);
  const means: number[] = [];
  for (let s = 0; s < samples; s += 1) {
    let sum = 0;
    for (let i = 0; i < finite.length; i += 1) {
      sum += finite[Math.floor(rng.next() * finite.length)];
    }
    means.push(sum / finite.length);
  }
  means.sort((a, b) => a - b);
  const at = (q: number) =>
    means[Math.min(means.length - 1, Math.max(0, Math.floor(q * (means.length - 1))))];
  return { mean: pointMean, low: at(quantile), high: at(1 - quantile) };
}

function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const result: number[][] = Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      result[j][i] = matrix[i][j];
    }
  }
  return result;
}

function multiply(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let p = 0; p < inner; p += 1) {
        sum += a[i][p] * b[p][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

function multiplyVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function invert(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const augmented = matrix.map((row, index) => {
    const identityRow = new Array(n).fill(0);
    identityRow[index] = 1;
    return [...row, ...identityRow];
  });

  for (let i = 0; i < n; i += 1) {
    let pivot = augmented[i][i];
    let pivotRow = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(augmented[r][i]) > Math.abs(pivot)) {
        pivot = augmented[r][i];
        pivotRow = r;
      }
    }
    if (Math.abs(pivot) < 1e-12) {
      return null;
    }
    if (pivotRow !== i) {
      const temp = augmented[i];
      augmented[i] = augmented[pivotRow];
      augmented[pivotRow] = temp;
    }
    const pivotValue = augmented[i][i];
    for (let j = 0; j < 2 * n; j += 1) {
      augmented[i][j] /= pivotValue;
    }
    for (let r = 0; r < n; r += 1) {
      if (r === i) {
        continue;
      }
      const factor = augmented[r][i];
      if (factor === 0) {
        continue;
      }
      for (let j = 0; j < 2 * n; j += 1) {
        augmented[r][j] -= factor * augmented[i][j];
      }
    }
  }

  return augmented.map((row) => row.slice(n));
}
