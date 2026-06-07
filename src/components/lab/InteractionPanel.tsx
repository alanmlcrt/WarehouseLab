import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FACTOR_REGISTRY,
  getActiveMetricColumns,
  getFactorById,
  getValueFromPoint,
  METRIC_COLUMNS,
  type RunPoint,
} from "../../experiments/labKit";
import { mean } from "../../experiments/labStats";
import { sortLevels } from "./explorer/explorerModel";
import { MetricSelect } from "./metrics";

interface InteractionPanelProps {
  points: RunPoint[];
}

const PALETTE = [
  "#0f766e",
  "#2563eb",
  "#ea580c",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#c026d3",
];

function distinctValues(points: RunPoint[], factorId: string): string[] {
  const seen = new Set<string>();
  for (const point of points) {
    const raw = point.factors[factorId];
    if (raw !== undefined) {
      seen.add(String(raw));
    }
  }
  // Sort numerically for number factors and by declared option order for enums
  // (e.g. "uniform → abc → pareto"), not alphabetically — otherwise the X axis
  // shows 10 before 6 and "abc" before "uniform".
  const factor = getFactorById(factorId);
  const isNumeric = factor ? factor.type !== "enum" : false;
  return sortLevels([...seen], isNumeric, factor?.options);
}

export function InteractionPanel({ points }: InteractionPanelProps) {
  const varyingFactors = useMemo(
    () =>
      FACTOR_REGISTRY.filter(
        (factor) => distinctValues(points, factor.id).length >= 2,
      ),
    [points],
  );

  const [factorAId, setFactorAId] = useState("");
  const [factorBId, setFactorBId] = useState("");
  const [metricId, setMetricId] = useState("steadyThroughputPerMinute");
  const activeMetrics = useMemo(() => getActiveMetricColumns(points), [points]);

  const activeA =
    factorAId && varyingFactors.some((f) => f.id === factorAId)
      ? factorAId
      : varyingFactors[0]?.id ?? "";
  const activeB =
    factorBId && factorBId !== activeA && varyingFactors.some((f) => f.id === factorBId)
      ? factorBId
      : varyingFactors.find((f) => f.id !== activeA)?.id ?? "";

  const model = useMemo(() => {
    if (!activeA || !activeB || activeA === activeB) {
      return null;
    }
    const levelsA = distinctValues(points, activeA);
    const levelsB = distinctValues(points, activeB);

    // Cell mean of the metric for each (levelA, levelB) combination.
    const cell = (a: string, b: string): number | null => {
      const values: number[] = [];
      for (const point of points) {
        if (
          String(point.factors[activeA]) === a &&
          String(point.factors[activeB]) === b
        ) {
          const value = getValueFromPoint(point, metricId, "metric");
          if (value !== undefined && Number.isFinite(value)) {
            values.push(value);
          }
        }
      }
      return values.length > 0 ? mean(values) : null;
    };

    const chartData = levelsA.map((a) => {
      const row: Record<string, number | string> = { level: a };
      for (const b of levelsB) {
        const value = cell(a, b);
        if (value !== null) {
          row[b] = value;
        }
      }
      return row;
    });

    // Interaction strength: does the A-effect (last − first level along A) depend
    // on B? Compare each B-line's A-effect; spread of those effects, normalized
    // by the overall range of cell means.
    const allValues: number[] = [];
    const aEffects: number[] = [];
    for (const b of levelsB) {
      const series = levelsA
        .map((a) => cell(a, b))
        .filter((v): v is number => v !== null);
      series.forEach((v) => allValues.push(v));
      if (series.length >= 2) {
        aEffects.push(series[series.length - 1] - series[0]);
      }
    }
    const overallRange =
      allValues.length > 0
        ? Math.max(...allValues) - Math.min(...allValues)
        : 0;
    const effectSpread =
      aEffects.length >= 2
        ? Math.max(...aEffects) - Math.min(...aEffects)
        : 0;
    const ratio = overallRange > 0 ? effectSpread / overallRange : 0;
    const verdict =
      ratio < 0.15
        ? { label: "lignes ~parallèles — peu/pas d'interaction", tone: "muted" as const }
        : ratio < 0.4
          ? { label: "interaction modérée", tone: "warn" as const }
          : { label: "lignes divergentes — interaction forte", tone: "strong" as const };

    return { levelsA, levelsB, chartData, ratio, verdict };
  }, [points, activeA, activeB, metricId]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Aucun point. Lance un DOE avec ≥2 facteurs variables.
      </div>
    );
  }
  if (varyingFactors.length < 2) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">
        Active au moins deux facteurs avec ≥2 valeurs dans le plan, puis relance le
        DOE pour étudier leur interaction.
      </div>
    );
  }

  const metricLabel =
    METRIC_COLUMNS.find((column) => column.id === metricId)?.label ?? metricId;

  // Factors that vary beyond the two being crossed: the A×B surface is averaged
  // over them, which can distort the apparent interaction.
  const otherVarying = varyingFactors.filter(
    (factor) => factor.id !== activeA && factor.id !== activeB,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
          Interaction de deux facteurs sur une métrique
        </span>
        <FactorSelect
          label="Facteur A (axe X)"
          value={activeA}
          factors={varyingFactors}
          onChange={setFactorAId}
        />
        <FactorSelect
          label="Facteur B (lignes)"
          value={activeB}
          factors={varyingFactors.filter((f) => f.id !== activeA)}
          onChange={setFactorBId}
        />
        <MetricSelect
          metrics={activeMetrics}
          onChange={setMetricId}
          value={metricId}
        />
      </div>

      {model && otherVarying.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="mr-1 text-amber-700">⚠</span>
          <span className="font-semibold">Surface moyennée :</span>{" "}
          {otherVarying.map((f) => f.label).join(", ")}{" "}
          varie{otherVarying.length > 1 ? "nt" : ""} aussi — l'interaction affichée est
          moyennée sur ces variations et peut être déformée. Pour une lecture nette,
          ne fais varier que ces deux facteurs.
        </div>
      ) : null}

      {!model ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Choisis deux facteurs distincts.
        </div>
      ) : (
        <>
          <div
            className={`rounded-md border p-2 text-xs font-medium ${
              model.verdict.tone === "strong"
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : model.verdict.tone === "warn"
                  ? "border-amber-200 bg-amber-50/60 text-amber-700"
                  : "border-line bg-slate-50 text-slate-500"
            }`}
          >
            {model.verdict.label} — indice {(model.ratio * 100).toFixed(0)} % (écart
            des effets de {getFactorById(activeA)?.label} selon{" "}
            {getFactorById(activeB)?.label})
          </div>
          <div className="min-h-0 flex-1 rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
              {metricLabel} — {getFactorById(activeA)?.label} × {getFactorById(activeB)?.label}
            </div>
            <ResponsiveContainer height="92%" width="100%">
              <LineChart
                data={model.chartData}
                margin={{ bottom: 24, left: 8, right: 16, top: 8 }}
              >
                <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
                <XAxis
                  dataKey="level"
                  label={{
                    value: getFactorById(activeA)?.label ?? activeA,
                    position: "insideBottom",
                    offset: -10,
                    fill: "#475569",
                    fontSize: 11,
                  }}
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: "#475569" }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 11, fill: "#475569" }}
                  width={48}
                />
                <Tooltip
                  formatter={(value: number, name) => [Number(value).toFixed(2), name]}
                  labelStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                {model.levelsB.map((b, index) => (
                  <Line
                    connectNulls
                    dataKey={b}
                    dot={{ r: 3 }}
                    key={b}
                    name={`${getFactorById(activeB)?.label ?? activeB} = ${b}`}
                    stroke={PALETTE[index % PALETTE.length]}
                    strokeWidth={2}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function FactorSelect({
  label,
  value,
  factors,
  onChange,
}: {
  label: string;
  value: string;
  factors: typeof FACTOR_REGISTRY;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <select
        className="h-8 rounded border border-line bg-white px-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {factors.map((factor) => (
          <option key={factor.id} value={factor.id}>
            {factor.label}
          </option>
        ))}
      </select>
    </label>
  );
}
