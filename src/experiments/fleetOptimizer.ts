import {
  getFactorById,
  type FactorValue,
  type RunPoint,
} from "./labKit";
import { mean, olsRegression, standardDeviation } from "./labStats";

export interface RobotLevelSummary {
  robotCount: number;
  n: number;
  throughput: number;
  serviceLevel: number;
  backlog: number;
  congestion: number;
  verticalPressure: number;
  feasibleShare: number;
}

export interface RobotContextSummary {
  key: string;
  label: string;
  factors: Record<string, FactorValue>;
  levels: RobotLevelSummary[];
  bestObserved: RobotLevelSummary;
  recommended: RobotLevelSummary;
  saturationLossPct: number;
  quadraticOptimum: number | null;
  featureValues: Record<string, number>;
}

export interface RobotFormulaTerm {
  id: string;
  label: string;
  coefficient: number;
}

export interface RobotFormulaModel {
  intercept: number;
  terms: RobotFormulaTerm[];
  rSquared: number;
  adjustedRSquared: number;
  rmseRobots: number;
  sampleSize: number;
  predicted: Array<{
    key: string;
    label: string;
    observed: number;
    predicted: number;
  }>;
}

export interface RobotOptimizationModel {
  contexts: RobotContextSummary[];
  formula: RobotFormulaModel | null;
  warnings: string[];
}

const ROBOT_FACTOR_ID = "robotCount";
const THROUGHPUT_METRIC_ID = "steadyThroughputPerMinute";
const OPTIMUM_TOLERANCE = 0.98;

const FORMULA_FEATURES: Array<{
  id: string;
  label: string;
  value: (context: RobotContextSummary) => number | null;
}> = [
  {
    id: "demand",
    label: "demande",
    value: (context) => positive(context.featureValues.demandPerMinute),
  },
  {
    id: "area",
    label: "surface",
    value: (context) => positive(context.featureValues.area),
  },
  {
    id: "levels",
    label: "niveaux",
    value: (context) => positive(context.featureValues.levelCount),
  },
  {
    id: "stations",
    label: "stations",
    value: (context) => positive(context.featureValues.pickingStationCount),
  },
  {
    id: "chargers",
    label: "chargeurs",
    value: (context) => positive(context.featureValues.chargingStationCount),
  },
  {
    id: "crossAisles",
    label: "passages+1",
    value: (context) => positive((context.featureValues.crossAisleSpacing ?? 0) + 1),
  },
];

export function buildRobotOptimizationModel(
  points: RunPoint[],
): RobotOptimizationModel {
  const warnings: string[] = [];
  const usable = points.filter(
    (point) =>
      typeof point.factors[ROBOT_FACTOR_ID] === "number" &&
      Number.isFinite(point.metrics[THROUGHPUT_METRIC_ID]),
  );

  if (usable.length === 0) {
    return {
      contexts: [],
      formula: null,
      warnings: ["Le plan doit faire varier le nombre de robots."],
    };
  }

  const contexts = summarizeContexts(usable);
  if (contexts.length === 0) {
    warnings.push("Aucun contexte ne contient au moins deux niveaux de robots.");
  }
  const formula = fitRobotFormula(contexts);
  if (!formula && contexts.length > 1) {
    warnings.push(
      "Pas assez de contextes distincts pour ajuster une formule fiable.",
    );
  }

  return { contexts, formula, warnings };
}

export function predictRobotsFromFormula(
  formula: RobotFormulaModel,
  featureValues: Record<string, number>,
): number | null {
  let logValue = formula.intercept;
  for (const term of formula.terms) {
    const raw = featureValues[term.id];
    if (!Number.isFinite(raw) || raw <= 0) {
      return null;
    }
    logValue += term.coefficient * Math.log(raw);
  }
  const value = Math.exp(logValue);
  return Number.isFinite(value) ? value : null;
}

export function formatRobotFormula(formula: RobotFormulaModel): string {
  const k = Math.exp(formula.intercept);
  if (formula.terms.length === 0) {
    return `R* ~= ${formatNumber(k)}`;
  }
  const terms = formula.terms.map((term) => {
    const sign = term.coefficient >= 0 ? "" : "-";
    return `${term.label}^${sign}${Math.abs(term.coefficient).toFixed(2)}`;
  });
  return `R* ~= ${formatNumber(k)} x ${terms.join(" x ")}`;
}

function summarizeContexts(points: RunPoint[]): RobotContextSummary[] {
  const byContext = new Map<string, RunPoint[]>();
  for (const point of points) {
    const key = contextKey(point);
    const bucket = byContext.get(key) ?? [];
    bucket.push(point);
    byContext.set(key, bucket);
  }

  const summaries: RobotContextSummary[] = [];
  for (const [key, bucket] of byContext) {
    const byRobot = new Map<number, RunPoint[]>();
    for (const point of bucket) {
      const robotCount = point.factors[ROBOT_FACTOR_ID];
      if (typeof robotCount !== "number") {
        continue;
      }
      const level = byRobot.get(robotCount) ?? [];
      level.push(point);
      byRobot.set(robotCount, level);
    }
    if (byRobot.size < 2) {
      continue;
    }

    const levels = [...byRobot.entries()]
      .map(([robotCount, rows]) => summarizeRobotLevel(robotCount, rows))
      .sort((a, b) => a.robotCount - b.robotCount);
    const bestObserved = levels.reduce((best, level) =>
      level.throughput > best.throughput ? level : best,
    );
    const threshold = bestObserved.throughput * OPTIMUM_TOLERANCE;
    const recommended =
      levels.find(
        (level) =>
          level.throughput >= threshold &&
          (level.feasibleShare >= 0.5 || bestObserved.feasibleShare < 0.5),
      ) ?? bestObserved;
    const afterBest = levels.filter(
      (level) => level.robotCount > bestObserved.robotCount,
    );
    const worstAfterBest =
      afterBest.length > 0
        ? afterBest.reduce((worst, level) =>
            level.throughput < worst.throughput ? level : worst,
          )
        : bestObserved;
    const saturationLossPct =
      bestObserved.throughput > 0
        ? Math.max(
            0,
            ((bestObserved.throughput - worstAfterBest.throughput) /
              bestObserved.throughput) *
              100,
          )
        : 0;
    const first = bucket[0];

    summaries.push({
      key,
      label: contextLabel(first),
      factors: contextFactors(first),
      levels,
      bestObserved,
      recommended,
      saturationLossPct,
      quadraticOptimum: fitQuadraticOptimum(levels),
      featureValues: extractFeatureValues(first),
    });
  }

  return summaries.sort((a, b) => b.bestObserved.throughput - a.bestObserved.throughput);
}

function summarizeRobotLevel(
  robotCount: number,
  points: RunPoint[],
): RobotLevelSummary {
  const metricValues = (id: string) =>
    points
      .map((point) => point.metrics[id])
      .filter((value) => Number.isFinite(value));

  return {
    robotCount,
    n: points.length,
    throughput: mean(metricValues(THROUGHPUT_METRIC_ID)),
    serviceLevel: mean(metricValues("serviceLevel")),
    backlog: mean(metricValues("steadyBacklog")),
    congestion: mean(metricValues("congestionEvents")),
    verticalPressure: mean(metricValues("verticalPressure")),
    feasibleShare: points.filter((point) => point.feasible).length / points.length,
  };
}

function fitQuadraticOptimum(levels: RobotLevelSummary[]): number | null {
  if (levels.length < 3) {
    return null;
  }
  const xs = levels.map((level) => level.robotCount);
  const ys = levels.map((level) => level.throughput);
  const fit = olsRegression(
    [
      { id: "robots", values: xs },
      { id: "robots2", values: xs.map((value) => value * value) },
    ],
    ys,
  );
  const b = fit?.coefficients.find((coefficient) => coefficient.id === "robots")?.raw;
  const c = fit?.coefficients.find((coefficient) => coefficient.id === "robots2")?.raw;
  if (!fit || b === undefined || c === undefined || c >= 0) {
    return null;
  }
  const optimum = -b / (2 * c);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (!Number.isFinite(optimum)) {
    return null;
  }
  return Math.min(max, Math.max(min, optimum));
}

function fitRobotFormula(contexts: RobotContextSummary[]): RobotFormulaModel | null {
  if (contexts.length < 3) {
    return null;
  }

  const y = contexts.map((context) =>
    Math.log(Math.max(0.0001, context.recommended.robotCount)),
  );
  const candidates = FORMULA_FEATURES.map((feature) => {
    const rawValues = contexts.map((context) => feature.value(context));
    if (rawValues.some((value) => value === null)) {
      return null;
    }
    const values = rawValues.map((value) => Math.log(value as number));
    if (standardDeviation(values) <= 1e-9) {
      return null;
    }
    return {
      id: feature.id,
      label: feature.label,
      values,
    };
  }).filter(
    (feature): feature is { id: string; label: string; values: number[] } =>
      feature !== null,
  );

  const maxFeatures = Math.max(1, contexts.length - 2);
  const features = candidates.slice(0, maxFeatures);
  if (features.length === 0 || contexts.length <= features.length + 1) {
    return null;
  }

  const fit = olsRegression(features, y);
  if (!fit) {
    return null;
  }

  const terms = features.map((feature) => ({
    id: feature.id,
    label: feature.label,
    coefficient:
      fit.coefficients.find((coefficient) => coefficient.id === feature.id)?.raw ?? 0,
  }));
  const predicted = contexts.map((context, index) => ({
    key: context.key,
    label: context.label,
    observed: context.recommended.robotCount,
    predicted: Math.exp(fit.predicted[index]),
  }));
  const rmseRobots = Math.sqrt(
    mean(
      predicted.map((entry) => (entry.observed - entry.predicted) ** 2),
    ),
  );

  return {
    intercept: fit.intercept,
    terms,
    rSquared: fit.rSquared,
    adjustedRSquared: fit.adjustedRSquared,
    rmseRobots,
    sampleSize: fit.sampleSize,
    predicted,
  };
}

function contextKey(point: RunPoint): string {
  return JSON.stringify(contextFactors(point));
}

function contextFactors(point: RunPoint): Record<string, FactorValue> {
  return Object.fromEntries(
    Object.entries(point.factors).filter(([id]) => id !== ROBOT_FACTOR_ID),
  );
}

function contextLabel(point: RunPoint): string {
  const entries = Object.entries(contextFactors(point));
  if (entries.length === 0) {
    return "Configuration actuelle";
  }
  return entries
    .map(([id, value]) => `${getFactorById(id)?.label ?? id}=${value}`)
    .join(" · ");
}

function extractFeatureValues(point: RunPoint): Record<string, number> {
  const width = numeric(point.metrics.warehouseWidth);
  const height = numeric(point.metrics.warehouseHeight);
  return {
    demand: numeric(point.metrics.demandPerMinute),
    demandPerMinute: numeric(point.metrics.demandPerMinute),
    area: width * height,
    levels: numeric(point.factors.levelCount, 1),
    levelCount: numeric(point.factors.levelCount, 1),
    stations: numeric(point.factors.pickingStationCount, 1),
    pickingStationCount: numeric(point.factors.pickingStationCount, 1),
    chargers: numeric(point.factors.chargingStationCount, 1),
    chargingStationCount: numeric(point.factors.chargingStationCount, 1),
    crossAisles: numeric(point.factors.crossAisleSpacing, 0) + 1,
    crossAisleSpacing: numeric(point.factors.crossAisleSpacing, 0),
  };
}

function numeric(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positive(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}
