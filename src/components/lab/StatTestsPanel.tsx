import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ErrorBar,
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
import {
  bootstrapMeanCI,
  cliffsDelta,
  dunnTest,
  interpretCliffsDelta,
  interpretEpsilonSquared,
  kruskalWallis,
  mean,
  median,
} from "../../experiments/labStats";
import { MetricSelect } from "./metrics";

interface StatTestsPanelProps {
  points: RunPoint[];
}

/** Distinct values of a factor actually present in the result set. */
function distinctFactorValues(points: RunPoint[], factorId: string): string[] {
  const seen = new Set<string>();
  for (const point of points) {
    const raw = point.factors[factorId];
    if (raw !== undefined) {
      seen.add(String(raw));
    }
  }
  return [...seen];
}

export function StatTestsPanel({ points }: StatTestsPanelProps) {
  // Only factors that vary (≥2 levels) can be tested as a grouping variable.
  const groupingFactors = useMemo(
    () =>
      FACTOR_REGISTRY.filter(
        (factor) => distinctFactorValues(points, factor.id).length >= 2,
      ),
    [points],
  );

  const [factorId, setFactorId] = useState<string>("");
  const [metricId, setMetricId] = useState("steadyThroughputPerMinute");
  const activeMetrics = useMemo(() => getActiveMetricColumns(points), [points]);

  const activeFactorId =
    factorId && groupingFactors.some((factor) => factor.id === factorId)
      ? factorId
      : groupingFactors[0]?.id ?? "";

  const analysis = useMemo(() => {
    if (!activeFactorId) {
      return null;
    }
    const levels = distinctFactorValues(points, activeFactorId).sort();
    const groups = levels.map((level) => {
      const values: number[] = [];
      for (const point of points) {
        if (String(point.factors[activeFactorId]) !== level) {
          continue;
        }
        const value = getValueFromPoint(point, metricId, "metric");
        if (value !== undefined && Number.isFinite(value)) {
          values.push(value);
        }
      }
      return { level, values };
    });
    const nonEmpty = groups.filter((group) => group.values.length > 0);
    const test = kruskalWallis(nonEmpty.map((group) => group.values));
    const mainEffects = nonEmpty.map((group) => {
      const ci = bootstrapMeanCI(group.values);
      return {
        level: group.level,
        mean: ci.mean,
        low: ci.low,
        high: ci.high,
        // ErrorBar expects [downward, upward] offsets from the bar value.
        error: [ci.mean - ci.low, ci.high - ci.mean] as [number, number],
      };
    });
    const dunn =
      nonEmpty.length >= 2
        ? dunnTest(
            nonEmpty.map((group) => group.values),
            nonEmpty.map((group) => group.level),
          )
        : null;
    return { levels: nonEmpty, test, mainEffects, dunn };
  }, [points, activeFactorId, metricId]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Aucun point. Lance un DOE pour comparer des distributions.
      </div>
    );
  }

  if (groupingFactors.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">
        Active au moins un facteur avec ≥2 valeurs dans le plan, puis relance le
        DOE pour tester l'effet d'un facteur sur une métrique.
      </div>
    );
  }

  const metricLabel =
    METRIC_COLUMNS.find((column) => column.id === metricId)?.label ?? metricId;
  const test = analysis?.test ?? null;
  const epsMagnitude = test ? interpretEpsilonSquared(test.epsilonSquared) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Paramètre</span>
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setFactorId(event.target.value)}
            value={activeFactorId}
          >
            {groupingFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.label}
              </option>
            ))}
          </select>
        </label>
        <MetricSelect
          metrics={activeMetrics}
          onChange={setMetricId}
          value={metricId}
        />
      </div>

      {!test ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Pas assez de données pour ce facteur / cette métrique.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="H" value={test.h.toFixed(2)} note={`df = ${test.df}`} />
            <Stat
              label="p-value"
              value={test.pValue < 0.0001 ? "< 0.0001" : test.pValue.toFixed(4)}
              note={test.pValue < 0.05 ? "significatif (α=0.05)" : "non significatif"}
              tone={test.pValue < 0.05 ? "good" : "muted"}
            />
            <Stat
              label="Effet ε²"
              value={test.epsilonSquared.toFixed(3)}
              note={epsMagnitude ?? undefined}
            />
            <Stat label="Puissance≈" value={`${Math.round(test.power * 100)} %`} />
            <Stat label="N / groupes" value={`${test.n} / ${test.k}`} />
          </div>

          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
              Effet principal — {metricLabel} (moyenne ± IC 95% bootstrap) par niveau
            </div>
            <div className="h-44">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart
                  data={analysis?.mainEffects ?? []}
                  margin={{ bottom: 8, left: 4, right: 12, top: 8 }}
                >
                  <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="level"
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: "#475569" }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: "#475569" }}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toFixed(2), "moyenne"]}
                    labelStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="mean" fill="#2563eb" radius={[3, 3, 0, 0]}>
                    <ErrorBar
                      dataKey="error"
                      direction="y"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                      width={5}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
              {metricLabel} par niveau de {getFactorById(activeFactorId)?.label}
            </div>
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Niveau</Th>
                  <Th className="text-center">n</Th>
                  <Th className="text-right">Médiane</Th>
                  <Th className="text-right">Moyenne</Th>
                </tr>
              </thead>
              <tbody>
                {analysis?.levels.map((group) => (
                  <tr className="border-t border-line" key={group.level}>
                    <td className="px-2 py-1 font-mono text-[11px] text-slate-600">
                      {group.level}
                    </td>
                    <td className="px-2 py-1 text-center">{group.values.length}</td>
                    <td className="px-2 py-1 text-right font-semibold">
                      {fmt(median(group.values))}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-500">
                      {fmt(mean(group.values))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analysis?.dunn && analysis.dunn.length > 0 ? (
            <div className="rounded-md border border-line bg-white p-3 shadow-sm">
              <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                Post-hoc de Dunn (Holm) + taille d'effet Cliff's δ par paire
              </div>
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Paire</Th>
                    <Th className="text-right">z</Th>
                    <Th className="text-right">p (Holm)</Th>
                    <Th className="text-center">sig.</Th>
                    <Th className="text-right">δ</Th>
                    <Th>Magnitude</Th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.dunn.map((cmp) => {
                    const delta = cliffsDelta(
                      valuesForLevel(analysis.levels, cmp.a),
                      valuesForLevel(analysis.levels, cmp.b),
                    );
                    return (
                      <tr className="border-t border-line" key={`${cmp.a}|${cmp.b}`}>
                        <td className="px-2 py-1 font-mono text-[11px] text-slate-600">
                          {cmp.a} vs {cmp.b}
                        </td>
                        <td className="px-2 py-1 text-right">{cmp.z.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-semibold">
                          {cmp.pAdjusted < 0.0001
                            ? "< 0.0001"
                            : cmp.pAdjusted.toFixed(4)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          {cmp.significant ? (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                              oui
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{delta.toFixed(3)}</td>
                        <td className="px-2 py-1 text-slate-500">
                          {interpretCliffsDelta(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="rounded border border-line bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-500">
            Kruskal-Wallis ne suppose pas la normalité : il classe toutes les
            observations et teste si les rangs diffèrent entre niveaux. p &lt; 0.05
            ⇒ au moins un niveau se distingue. ε² mesure l'ampleur de l'effet, la
            puissance est une approximation (χ² non-centrale) de la probabilité de
            détecter cet effet avec l'échantillon courant.
          </p>
        </>
      )}
    </div>
  );
}

function valuesForLevel(
  levels: Array<{ level: string; values: number[] }>,
  level: string,
): number[] {
  return levels.find((entry) => entry.level === level)?.values ?? [];
}

function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "good" | "muted";
}) {
  const valueClass =
    tone === "good" ? "text-emerald-600" : tone === "muted" ? "text-slate-500" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-white p-2.5 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold ${valueClass}`}>{value}</div>
      {note ? <div className="text-[10px] text-slate-400">{note}</div> : null}
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 ${
        className ?? ""
      }`}
    >
      {children}
    </th>
  );
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(2);
  }
  return value.toFixed(2);
}
