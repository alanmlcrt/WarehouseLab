import { useState } from "react";
import type { ExperimentResult } from "../../simulation/models/types";
import { useSimulationStore } from "../../store/simulationStore";

type Direction = "higher" | "lower" | "neutral";

interface MetricRow {
  id: string;
  label: string;
  unit?: string;
  dir: Direction;
  value: (run: ExperimentResult) => number;
}

const METRIC_ROWS: MetricRow[] = [
  {
    id: "throughputPerMinute",
    label: "Débit",
    unit: "caisses/min",
    dir: "higher",
    value: (run) => run.metrics.throughputPerMinute,
  },
  {
    id: "completedOrders",
    label: "Caisses livrées",
    dir: "higher",
    value: (run) => run.metrics.completedOrders,
  },
  {
    id: "pendingOrders",
    label: "Backlog final",
    dir: "lower",
    value: (run) => run.metrics.pendingOrders,
  },
  {
    id: "averageProcessingTime",
    label: "Temps moyen",
    unit: "s",
    dir: "lower",
    value: (run) => run.metrics.averageProcessingTime,
  },
  {
    id: "averageDistancePerOrder",
    label: "Distance / commande",
    dir: "lower",
    value: (run) => run.metrics.averageDistancePerOrder,
  },
  {
    id: "averageRobotUtilization",
    label: "Utilisation",
    unit: "%",
    dir: "higher",
    value: (run) => run.metrics.averageRobotUtilization * 100,
  },
  {
    id: "congestionEvents",
    label: "Congestion",
    dir: "lower",
    value: (run) => run.metrics.congestionEvents,
  },
  {
    id: "energyConsumed",
    label: "Énergie",
    dir: "lower",
    value: (run) => run.metrics.energyConsumed,
  },
  {
    id: "chargeSessions",
    label: "Sessions charge",
    dir: "lower",
    value: (run) => run.metrics.chargeSessions,
  },
  {
    id: "elevatorTrips",
    label: "Trajets verticaux",
    dir: "neutral",
    value: (run) => run.metrics.elevatorTrips,
  },
  {
    id: "slottingEfficiency",
    label: "Slotting",
    unit: "%",
    dir: "higher",
    value: (run) => run.metrics.slottingEfficiency * 100,
  },
];

interface ConfigRow {
  label: string;
  value: (run: ExperimentResult) => string;
}

const CONFIG_ROWS: ConfigRow[] = [
  { label: "Scénario", value: (run) => run.config.name },
  { label: "Robots", value: (run) => String(run.config.robots.robotCount) },
  { label: "Stockage", value: (run) => run.storageStrategy },
  { label: "Pathfinding", value: (run) => run.config.movement.pathfindingStrategy },
  {
    label: "Réservation",
    value: (run) =>
      run.config.movement.temporalReservation ||
      run.config.movement.pathfindingStrategy === "reservation"
        ? "oui"
        : "non",
  },
  {
    label: "Demande",
    value: (run) =>
      `${run.config.demand.ordersPerMinute}/min · ${run.demandPattern}`,
  },
  { label: "Durée", value: (run) => `${Math.round(run.durationSeconds)} s` },
];

export function RunComparison() {
  const runHistory = useSimulationStore((state) => state.runHistory);
  const removeRun = useSimulationStore((state) => state.removeRun);
  const clearRuns = useSimulationStore((state) => state.clearRuns);
  const [baselineId, setBaselineId] = useState<string | null>(null);

  if (runHistory.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">
        Aucun run sauvegardé. Dans la simulation, configure puis lance un scénario
        et clique "Sauver" pour l'ajouter ici et comparer plusieurs runs.
      </div>
    );
  }

  const baseline =
    runHistory.find((run) => run.id === baselineId) ?? runHistory[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
          Comparaison multi-run - {runHistory.length} run(s), delta % vs baseline
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Baseline</span>
            <select
              className="h-8 max-w-[220px] rounded border border-line bg-white px-2 text-sm"
              onChange={(event) => setBaselineId(event.target.value)}
              value={baseline.id}
            >
              {runHistory.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.config.name} · {run.storageStrategy}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            onClick={clearRuns}
            type="button"
          >
            Tout effacer
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white shadow-sm">
        <table className="min-w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 min-w-[180px] bg-slate-50 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Métrique
              </th>
              {runHistory.map((run) => (
                <th className="min-w-[150px] px-3 py-2 text-left" key={run.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {run.config.name}
                      {run.id === baseline.id ? (
                        <span className="ml-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent">
                          base
                        </span>
                      ) : null}
                    </span>
                    <button
                      aria-label="Retirer"
                      className="text-slate-400 hover:text-red-500"
                      onClick={() => removeRun(run.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-[10px] font-normal text-slate-400">
                    {new Date(run.createdAt).toLocaleTimeString()}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONFIG_ROWS.map((row) => (
              <tr className="border-t border-line bg-slate-50/40" key={row.label}>
                <td className="sticky left-0 z-10 bg-slate-50/40 px-3 py-1.5 font-medium text-slate-500">
                  {row.label}
                </td>
                {runHistory.map((run) => (
                  <td className="px-3 py-1.5 text-slate-600" key={run.id}>
                    {row.value(run)}
                  </td>
                ))}
              </tr>
            ))}

            {METRIC_ROWS.map((row) => {
              const values = runHistory.map((run) => row.value(run));
              const best = bestIndex(values, row.dir);
              const baseValue = row.value(baseline);
              return (
                <tr className="border-t border-line" key={row.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-ink">
                    {row.label}
                    {row.unit ? (
                      <span className="ml-1 text-[10px] text-slate-400">
                        {row.unit}
                      </span>
                    ) : null}
                  </td>
                  {runHistory.map((run, index) => {
                    const value = values[index];
                    const isBest = index === best && row.dir !== "neutral";
                    const isBaseline = run.id === baseline.id;
                    return (
                      <td
                        className={`px-3 py-1.5 ${
                          isBest
                            ? "bg-emerald-50 font-semibold text-emerald-700"
                            : "text-ink"
                        }`}
                        key={run.id}
                      >
                        <span>{fmt(value)}</span>
                        {!isBaseline ? (
                          <DeltaBadge base={baseValue} dir={row.dir} value={value} />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaBadge({
  value,
  base,
  dir,
}: {
  value: number;
  base: number;
  dir: Direction;
}) {
  if (!Number.isFinite(base) || base === 0) {
    return null;
  }
  const pct = ((value - base) / Math.abs(base)) * 100;
  if (Math.abs(pct) < 0.05) {
    return <span className="ml-2 text-[10px] text-slate-400">=</span>;
  }
  const improved =
    dir === "neutral" ? null : dir === "higher" ? pct > 0 : pct < 0;
  const tone =
    improved === null
      ? "text-slate-400"
      : improved
        ? "text-emerald-600"
        : "text-red-500";
  return (
    <span className={`ml-2 text-[10px] font-medium ${tone}`}>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function bestIndex(values: number[], dir: Direction): number {
  if (dir === "neutral" || values.length === 0) {
    return -1;
  }
  let best = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (dir === "higher" ? values[i] > values[best] : values[i] < values[best]) {
      best = i;
    }
  }
  return best;
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
}
