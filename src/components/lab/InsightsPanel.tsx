import { useMemo, useState } from "react";
import {
  getActiveMetricColumns,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { summarizeReplicates } from "../../experiments/labStats";
import { MetricSelect } from "./metrics";

interface InsightsPanelProps {
  points: RunPoint[];
}

/** Robustness = how much a configuration's result wobbles from one random seed
 *  to the next. Low spread → trustworthy; high spread → fragile / luck-dependent. */
export function InsightsPanel({ points }: InsightsPanelProps) {
  const activeMetrics = useMemo(() => getActiveMetricColumns(points), [points]);
  const [metricId, setMetricId] = useState("steadyThroughputPerMinute");

  const summaries = useMemo(() => {
    const rows = points
      .map((point) => {
        const value = getValueFromPoint(point, metricId, "metric");
        if (value === undefined) {
          return null;
        }
        return {
          key: JSON.stringify(point.factors),
          label: combinationLabel(point),
          value,
        };
      })
      .filter((row): row is { key: string; label: string; value: number } => row !== null);
    return summarizeReplicates(rows);
  }, [points, metricId]);

  const replicated = summaries.filter((entry) => entry.n > 1);
  const mostRobustKey =
    replicated.length > 0
      ? replicated.reduce((best, entry) => (entry.cv < best.cv ? entry : best)).key
      : null;
  const leastRobustKey =
    replicated.length > 0
      ? replicated.reduce((worst, entry) => (entry.cv > worst.cv ? entry : worst)).key
      : null;
  const maxCv = summaries.reduce((max, entry) => Math.max(max, entry.cv), 0);

  if (points.length === 0) {
    return <Centered>Lance un test pour mesurer la fiabilité des résultats.</Centered>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <MetricSelect metrics={activeMetrics} onChange={setMetricId} value={metricId} />
        <span className="text-xs text-slate-500">
          Écart des résultats d'un essai (seed) à l'autre, par configuration. Barre
          courte = résultat fiable ; barre longue = dépend de la chance.
        </span>
      </div>

      {summaries.length === 0 ? (
        <Centered>Pas de données pour cette métrique.</Centered>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white shadow-sm">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">
                <th className="px-3 py-2">Configuration</th>
                <th className="px-3 py-2 text-right">Moyenne</th>
                <th className="px-3 py-2 text-right">Variation</th>
                <th className="w-40 px-3 py-2">Fiabilité</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((entry) => {
                const tag =
                  entry.key === mostRobustKey
                    ? { text: "fiable", className: "bg-emerald-100 text-emerald-700" }
                    : entry.key === leastRobustKey
                      ? { text: "fragile", className: "bg-amber-100 text-amber-700" }
                      : null;
                const ratio = maxCv > 0 ? Math.max(0.03, entry.cv / maxCv) : 0;
                return (
                  <tr className="border-t border-line" key={entry.key}>
                    <td className="px-3 py-1.5">
                      <span className="text-slate-600">{entry.label}</span>
                      {tag ? (
                        <span
                          className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${tag.className}`}
                        >
                          {tag.text}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                      {fmt(entry.mean)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      ± {fmt(entry.std)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              entry.cv > 0.2
                                ? "bg-amber-500"
                                : entry.cv > 0.1
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right tabular-nums text-[10px] text-slate-400">
                          {(entry.cv * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function combinationLabel(point: RunPoint): string {
  const entries = Object.entries(point.factors);
  if (entries.length === 0) {
    return "base";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(" · ");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}
