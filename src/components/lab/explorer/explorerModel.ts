import {
  getValueFromPoint,
  type FactorDef,
  type RunPoint,
} from "../../../experiments/labKit";
import { mean, standardDeviation } from "../../../experiments/labStats";

/** Sentinel group key used when no "compare by" factor is selected. */
export const SINGLE_GROUP = "__all__";

export const PALETTE = [
  "#0f766e",
  "#2563eb",
  "#ea580c",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#c026d3",
  "#f59e0b",
  "#475569",
];

export type ChartType = "auto" | "trend" | "bars" | "box" | "scatter";

export interface LevelStat {
  xLabel: string;
  /** Numeric x for plotting: the raw number, or the category index. */
  xValue: number;
  n: number;
  mean: number;
  std: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  values: number[];
}

export interface RawPoint {
  xValue: number;
  xLabel: string;
  y: number;
  group: string;
  point: RunPoint;
}

export interface ExplorerSeries {
  xIsNumeric: boolean;
  xLevels: string[];
  /** Color group keys, sorted. [SINGLE_GROUP] when no color factor. */
  groups: string[];
  /** Per group: one LevelStat per X level, sorted by xValue. */
  statsByGroup: Map<string, LevelStat[]>;
  raw: RawPoint[];
  yMin: number;
  yMax: number;
  count: number;
}

export function distinctValues(points: RunPoint[], factorId: string): string[] {
  const seen = new Set<string>();
  for (const point of points) {
    const raw = point.factors[factorId];
    if (raw !== undefined) {
      seen.add(String(raw));
    }
  }
  return [...seen];
}

export function sortLevels(values: string[], numeric: boolean): string[] {
  return [...values].sort((a, b) =>
    numeric ? Number(a) - Number(b) : a.localeCompare(b),
  );
}

/** Linear-interpolation quantile on an ascending-sorted array. */
export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 100 || Number.isInteger(value)) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function computeStat(
  xLabel: string,
  xValue: number,
  values: number[],
): LevelStat {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    xLabel,
    xValue,
    n: values.length,
    mean: mean(values),
    std: standardDeviation(values),
    min: sorted[0],
    q1: quantileSorted(sorted, 0.25),
    median: quantileSorted(sorted, 0.5),
    q3: quantileSorted(sorted, 0.75),
    max: sorted[sorted.length - 1],
    values,
  };
}

/** Aggregate a set of runs into everything the chart renderers need: raw points
 *  plus per-(group, X level) summary statistics. Pure — no React, no recharts. */
export function buildSeries(
  points: RunPoint[],
  xFactor: FactorDef,
  yId: string,
  colorFactor: FactorDef | null,
): ExplorerSeries {
  const xIsNumeric = xFactor.type !== "enum";
  const xLevels = sortLevels(distinctValues(points, xFactor.id), xIsNumeric);
  const xIndexOf = (raw: unknown): number =>
    xIsNumeric ? Number(raw) : xLevels.indexOf(String(raw));

  const raw: RawPoint[] = [];
  // group -> xLabel -> values
  const buckets = new Map<string, Map<string, number[]>>();

  for (const point of points) {
    const xRaw = point.factors[xFactor.id];
    if (xRaw === undefined) continue;
    const xValue = xIndexOf(xRaw);
    if (!Number.isFinite(xValue) || xValue < 0) continue;
    const y = getValueFromPoint(point, yId, "metric");
    if (y === undefined || !Number.isFinite(y)) continue;
    const group = colorFactor
      ? String(point.factors[colorFactor.id] ?? "n/a")
      : SINGLE_GROUP;
    const xLabel = String(xRaw);

    raw.push({ xValue, xLabel, y, group, point });

    let byLabel = buckets.get(group);
    if (!byLabel) {
      byLabel = new Map();
      buckets.set(group, byLabel);
    }
    const arr = byLabel.get(xLabel);
    if (arr) arr.push(y);
    else byLabel.set(xLabel, [y]);
  }

  const groups = colorFactor
    ? [...buckets.keys()].sort()
    : [SINGLE_GROUP];

  const statsByGroup = new Map<string, LevelStat[]>();
  for (const group of groups) {
    const byLabel = buckets.get(group) ?? new Map<string, number[]>();
    const stats: LevelStat[] = [];
    for (const xLabel of xLevels) {
      const values = byLabel.get(xLabel);
      if (!values || values.length === 0) continue;
      stats.push(
        computeStat(
          xLabel,
          xIsNumeric ? Number(xLabel) : xLevels.indexOf(xLabel),
          values,
        ),
      );
    }
    stats.sort((a, b) => a.xValue - b.xValue);
    statsByGroup.set(group, stats);
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const datum of raw) {
    if (datum.y < yMin) yMin = datum.y;
    if (datum.y > yMax) yMax = datum.y;
  }
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }

  return {
    xIsNumeric,
    xLevels,
    groups,
    statsByGroup,
    raw,
    yMin,
    yMax,
    count: raw.length,
  };
}

export function groupLabel(
  colorFactor: FactorDef | null,
  group: string,
): string {
  if (group === SINGLE_GROUP) return "Runs";
  return `${colorFactor?.label ?? ""} = ${group}`.trim();
}
