import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getActiveMetricColumns,
  getFactorLevels,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { olsRegression } from "../../experiments/labStats";
import { getVaryingFactors, labelForFactor } from "./analysis";
import { MetricSelect } from "./metrics";

interface RegressionPanelProps {
  points: RunPoint[];
}

/** Turn a coefficient id into plain French. Numeric factors → their label;
 *  categorical dummies "factorId=level" → "Label = level". */
function humanizeCoef(id: string): string {
  const eq = id.indexOf("=");
  if (eq === -1) {
    return labelForFactor(id);
  }
  return `${labelForFactor(id.slice(0, eq))} = ${id.slice(eq + 1)}`;
}

type EffectForce = "négligeable" | "faible" | "moyen" | "fort";

/** Qualitative band for a standardized coefficient (comparable across factors). */
function effectForce(standardized: number): EffectForce {
  const v = Math.abs(standardized);
  if (v < 0.1) return "négligeable";
  if (v < 0.3) return "faible";
  if (v < 0.5) return "moyen";
  return "fort";
}

export function RegressionPanel({ points }: RegressionPanelProps) {
  const [target, setTarget] = useState({
    id: "steadyThroughputPerMinute",
    source: "metric" as "factor" | "metric",
  });
  const [excludedFeatureIds, setExcludedFeatureIds] = useState<string[]>([]);
  const [excludedCategoricalIds, setExcludedCategoricalIds] = useState<string[]>([]);
  const [useLog, setUseLog] = useState(false);
  const activeMetrics = useMemo(() => getActiveMetricColumns(points), [points]);

  // Only the parameters actually swept in this test can be explanatory variables.
  const sweptNumeric = useMemo(
    () => getVaryingFactors(points).filter((factor) => factor.type !== "enum"),
    [points],
  );
  const sweptCategorical = useMemo(
    () => getVaryingFactors(points).filter((factor) => factor.type === "enum"),
    [points],
  );
  // Selected = all swept minus the ones the user unchecked.
  const featureIds = useMemo(
    () =>
      sweptNumeric
        .map((factor) => factor.id)
        .filter((id) => !excludedFeatureIds.includes(id)),
    [sweptNumeric, excludedFeatureIds],
  );
  const categoricalIds = useMemo(
    () =>
      sweptCategorical
        .map((factor) => factor.id)
        .filter((id) => !excludedCategoricalIds.includes(id)),
    [sweptCategorical, excludedCategoricalIds],
  );

  const fit = useMemo(() => {
    if (points.length === 0) {
      return null;
    }
    // Expand each selected categorical factor into K-1 dummy columns. The first
    // level (alphabetical) is the dropped reference, so each coefficient reads
    // as "effect vs. that reference level". Factors with <2 levels are skipped.
    const dummyDefs: Array<{ id: string; factorId: string; level: string; reference: string }> = [];
    for (const factorId of categoricalIds) {
      const levels = getFactorLevels(points, factorId);
      if (levels.length < 2) {
        continue;
      }
      for (const level of levels.slice(1)) {
        dummyDefs.push({ id: `${factorId}=${level}`, factorId, level, reference: levels[0] });
      }
    }
    // Ignore numeric features that aren't present in ANY run (e.g. a factor
    // that wasn't varied in this DOE) - otherwise they'd exclude every row and
    // kill the whole fit. Features missing on only some rows still drop those.
    const availableFeatureIds = featureIds.filter((id) =>
      points.some(
        (point) =>
          getValueFromPoint(point, id, "factor") !== undefined ||
          getValueFromPoint(point, id, "metric") !== undefined,
      ),
    );
    if (availableFeatureIds.length === 0 && dummyDefs.length === 0) {
      return null;
    }

    const targetValues: number[] = [];
    const numericColumns = availableFeatureIds.map((id) => ({ id, values: [] as number[] }));
    const dummyColumns = dummyDefs.map((d) => ({ id: d.id, values: [] as number[] }));
    const usableIndices: number[] = [];

    points.forEach((point, index) => {
      const yRaw = getValueFromPoint(point, target.id, target.source);
      if (yRaw === undefined) {
        return;
      }
      const numericValues = availableFeatureIds.map((id) =>
        getValueFromPoint(point, id, "factor") ??
        getValueFromPoint(point, id, "metric"),
      );
      if (numericValues.some((value) => value === undefined)) {
        return;
      }
      // Dummies require the categorical factor to be present for this run.
      const dummyValues = dummyDefs.map((d) => {
        const raw = point.factors[d.factorId];
        if (typeof raw !== "string") {
          return undefined;
        }
        return raw === d.level ? 1 : 0;
      });
      if (dummyValues.some((value) => value === undefined)) {
        return;
      }

      targetValues.push(useLog ? Math.log(Math.max(0.0001, yRaw)) : yRaw);
      numericValues.forEach((value, columnIndex) => {
        const numeric = value as number;
        // Log transform applies to numeric features only - never to 0/1 dummies.
        numericColumns[columnIndex].values.push(
          useLog ? Math.log(Math.max(0.0001, numeric)) : numeric,
        );
      });
      dummyValues.forEach((value, columnIndex) => {
        dummyColumns[columnIndex].values.push(value as number);
      });
      usableIndices.push(index);
    });
    if (targetValues.length === 0) {
      return null;
    }
    const result = olsRegression([...numericColumns, ...dummyColumns], targetValues);
    if (!result) {
      return null;
    }
    return {
      result,
      observed: targetValues,
      predicted: result.predicted,
      usableIndices,
    };
  }, [points, featureIds, categoricalIds, target, useLog]);

  const observedVsPredicted = useMemo(() => {
    if (!fit) {
      return [];
    }
    return fit.observed.map((value, index) => ({
      observed: value,
      predicted: fit.predicted[index],
    }));
  }, [fit]);

  const coefficientData = useMemo(() => {
    if (!fit) {
      return [];
    }
    return fit.result.coefficients
      .slice()
      .sort((a, b) => Math.abs(b.standardized) - Math.abs(a.standardized))
      .map((coefficient) => ({
        id: coefficient.id,
        label: humanizeCoef(coefficient.id),
        raw: coefficient.raw,
        standardized: coefficient.standardized,
      }));
  }, [fit]);

  // Plain-language verdict: what the regression actually says, for a reader who
  // doesn't know what R² or a standardized coefficient is.
  const reading = useMemo(() => {
    if (!fit) {
      return null;
    }
    const targetLabel =
      activeMetrics.find((metric) => metric.id === target.id)?.label ?? target.id;
    const pct = Math.round(Math.max(0, fit.result.rSquared) * 100);
    const quality =
      pct >= 80 ? "très bien" : pct >= 50 ? "correctement" : pct >= 25 ? "en partie" : "mal";
    const drivers = fit.result.coefficients
      .filter((c) => effectForce(c.standardized) !== "négligeable")
      .sort((a, b) => Math.abs(b.standardized) - Math.abs(a.standardized))
      .slice(0, 4)
      .map((c) => ({
        name: humanizeCoef(c.id),
        up: c.standardized >= 0,
        force: effectForce(c.standardized),
      }));
    return { targetLabel, pct, quality, drivers };
  }, [fit, activeMetrics, target]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {reading ? (
        <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
          <p className="text-slate-700">
            En combinant les paramètres variés, on explique{" "}
            <b className="text-ink">{reading.pct}%</b> de la variation de{" "}
            <b className="text-ink">{reading.targetLabel}</b> — ce test la décrit{" "}
            {reading.quality}.
          </p>
          {reading.drivers.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {reading.drivers.map((driver) => (
                <li className="flex items-center gap-1.5" key={driver.name}>
                  <span className={driver.up ? "text-emerald-600" : "text-red-600"}>
                    {driver.up ? "▲" : "▼"}
                  </span>
                  <span className="text-slate-700">
                    <b>{driver.name}</b> {driver.up ? "augmente" : "réduit"}{" "}
                    {reading.targetLabel}{" "}
                    <span className="text-slate-400">(effet {driver.force})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-slate-500">
              Aucun paramètre n'a d'effet marqué sur cette métrique dans ce test.
            </p>
          )}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-md border border-line bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Ce qu'on cherche à expliquer
          </span>
          <MetricSelect
            label=""
            metrics={activeMetrics}
            onChange={(id) => setTarget({ id, source: "metric" })}
            value={target.id}
          />
        </div>
        <label
          className="flex items-center gap-2 text-xs"
          title="Étudie les effets en pourcentage plutôt qu'en valeur absolue — utile pour les lois d'échelle (ex. robots → débit)."
        >
          <input
            checked={useLog}
            onChange={(event) => setUseLog(event.target.checked)}
            type="checkbox"
          />
          Effets en % (log-log)
        </label>
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Paramètres du test (numériques)
          </div>
          {sweptNumeric.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-400">
              Aucun paramètre numérique varié dans ce test.
            </p>
          ) : (
            <div className="mt-1 flex max-h-[180px] flex-col gap-1 overflow-y-auto rounded border border-line p-2">
              {sweptNumeric.map((factor) => {
                const checked = featureIds.includes(factor.id);
                return (
                  <label className="flex items-center gap-2 text-xs" key={factor.id}>
                    <input
                      checked={checked}
                      onChange={(event) =>
                        setExcludedFeatureIds((prev) =>
                          event.target.checked
                            ? prev.filter((id) => id !== factor.id)
                            : [...prev, factor.id],
                        )
                      }
                      type="checkbox"
                    />
                    {factor.label}
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {sweptCategorical.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
              Paramètres du test (catégoriels)
            </div>
            <div className="mt-1 flex max-h-[150px] flex-col gap-1 overflow-y-auto rounded border border-line p-2">
              {sweptCategorical.map((factor) => {
                const levels = getFactorLevels(points, factor.id);
                const checked = categoricalIds.includes(factor.id);
                return (
                  <label
                    className="flex items-center gap-2 text-xs"
                    key={factor.id}
                    title={`Référence : ${levels[0]} — ${levels.length} niveaux`}
                  >
                    <input
                      checked={checked}
                      onChange={(event) =>
                        setExcludedCategoricalIds((prev) =>
                          event.target.checked
                            ? prev.filter((id) => id !== factor.id)
                            : [...prev, factor.id],
                        )
                      }
                      type="checkbox"
                    />
                    <span className="flex-1">{factor.label}</span>
                    <span className="text-[10px] text-slate-400">
                      {levels.length} niv.
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="R2" value={fit ? fit.result.rSquared.toFixed(3) : "-"} />
          <Stat
            label="R2 ajusté"
            value={fit ? fit.result.adjustedRSquared.toFixed(3) : "-"}
          />
          <Stat label="RMSE" value={fit ? fit.result.rmse.toFixed(3) : "-"} />
          <Stat
            label="N"
            value={fit ? fit.result.sampleSize.toString() : "-"}
          />
          <Stat
            label="Intercept"
            value={fit ? fit.result.intercept.toFixed(3) : "-"}
          />
        </div>
      </div>
      <div className="grid min-h-0 grid-rows-2 gap-3">
        <div className="flex min-h-0 flex-col rounded-md border border-line bg-white p-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Poids de chaque paramètre
          </div>
          <p className="mb-1 text-[11px] text-slate-400">
            Barre vers la droite = augmente le résultat, vers la gauche = le diminue.
            Plus elle est longue, plus l'effet est fort.
          </p>
          <div className="min-h-0 flex-1">
          {coefficientData.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                data={coefficientData}
                layout="vertical"
                margin={{ bottom: 4, left: 12, right: 12, top: 4 }}
              >
                <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
                <XAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  type="number"
                />
                <YAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fontSize: 10, fill: "#475569" }}
                  type="category"
                  width={185}
                />
                <Tooltip
                  formatter={(value: number) => value.toFixed(3)}
                  labelStyle={{ fontSize: 12 }}
                />
                <ReferenceLine x={0} stroke="#475569" />
                <Bar dataKey="standardized">
                  {coefficientData.map((entry) => (
                    <Cell
                      fill={entry.standardized >= 0 ? "#0f766e" : "#dc2626"}
                      key={entry.id}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-md border border-line bg-white p-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Qualité des prédictions
          </div>
          <p className="mb-1 text-[11px] text-slate-400">
            Chaque point = une config. Plus les points serrent une diagonale, mieux
            le modèle prédit le résultat.
          </p>
          <div className="min-h-0 flex-1">
          {observedVsPredicted.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer height="100%" width="100%">
              <ScatterChart margin={{ bottom: 24, left: 12, right: 16, top: 8 }}>
                <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
                <XAxis
                  dataKey="observed"
                  label={{
                    value: "Observé",
                    position: "insideBottom",
                    offset: -10,
                    fill: "#475569",
                    fontSize: 12,
                  }}
                  stroke="#64748b"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  type="number"
                />
                <YAxis
                  dataKey="predicted"
                  label={{
                    value: "Prédit",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#475569",
                    fontSize: 12,
                  }}
                  stroke="#64748b"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  type="number"
                  width={64}
                />
                <Tooltip
                  formatter={(value: number) => value.toFixed(3)}
                  labelStyle={{ fontSize: 12 }}
                />
                <Scatter
                  data={observedVsPredicted}
                  fill="#2563eb"
                  fillOpacity={0.75}
                />
              </ScatterChart>
            </ResponsiveContainer>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-slate-50 p-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">
      Sélectionne des variables et lance un DOE
    </div>
  );
}
