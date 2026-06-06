import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getFactorById,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { mean, paretoFront } from "../../experiments/labStats";

interface OptimizerPanelProps {
  points: RunPoint[];
}

interface ObjectiveDef {
  id: string;
  label: string;
  dir: "max" | "min";
  unit?: string;
}

const OBJECTIVES: ObjectiveDef[] = [
  { id: "steadyThroughputPerMinute", label: "Débit steady", dir: "max", unit: "caisses/min" },
  { id: "throughputPerRobot", label: "Débit / robot", dir: "max" },
  { id: "energyPerOrder", label: "Énergie / commande", dir: "min" },
  { id: "congestionEvents", label: "Congestion", dir: "min" },
  { id: "costProxy", label: "Coût (proxy CAPEX)", dir: "min" },
  { id: "steadyBacklog", label: "Backlog steady", dir: "min" },
  { id: "averageProcessingTime", label: "Temps de traitement", dir: "min", unit: "s" },
];

const DEFAULT_WEIGHTS: Record<string, number> = {
  steadyThroughputPerMinute: 2,
  energyPerOrder: 1,
};

interface Combo {
  key: string;
  factors: Record<string, string | number>;
  values: Record<string, number>; // mean per objective id
}

export function OptimizerPanel({ points }: OptimizerPanelProps) {
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);

  const activeObjectives = OBJECTIVES.filter((o) => (weights[o.id] ?? 0) > 0);

  // Aggregate seed replicates: one row per distinct factor combination.
  const combos = useMemo<Combo[]>(() => {
    const groups = new Map<string, RunPoint[]>();
    for (const point of points) {
      const key = JSON.stringify(point.factors);
      const bucket = groups.get(key) ?? [];
      bucket.push(point);
      groups.set(key, bucket);
    }
    return [...groups.entries()].map(([key, group]) => {
      const values: Record<string, number> = {};
      for (const objective of OBJECTIVES) {
        const xs = group
          .map((p) => getValueFromPoint(p, objective.id, "metric"))
          .filter((v): v is number => v !== undefined && Number.isFinite(v));
        values[objective.id] = xs.length > 0 ? mean(xs) : NaN;
      }
      return { key, factors: group[0].factors, values };
    });
  }, [points]);

  // Min-max bounds per objective for normalization.
  const bounds = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    for (const objective of OBJECTIVES) {
      const xs = combos
        .map((c) => c.values[objective.id])
        .filter((v) => Number.isFinite(v));
      map[objective.id] = {
        min: xs.length ? Math.min(...xs) : 0,
        max: xs.length ? Math.max(...xs) : 1,
      };
    }
    return map;
  }, [combos]);

  const normalize = (objective: ObjectiveDef, value: number): number => {
    const { min, max } = bounds[objective.id];
    if (!Number.isFinite(value) || max === min) {
      return 0.5;
    }
    const unit = (value - min) / (max - min);
    return objective.dir === "max" ? unit : 1 - unit;
  };

  const ranked = useMemo(() => {
    const totalWeight = activeObjectives.reduce(
      (sum, o) => sum + (weights[o.id] ?? 0),
      0,
    );
    if (totalWeight === 0) {
      return [];
    }
    return combos
      .map((combo) => {
        let score = 0;
        for (const objective of activeObjectives) {
          score +=
            (weights[objective.id] ?? 0) * normalize(objective, combo.values[objective.id]);
        }
        return { combo, score: score / totalWeight };
      })
      .sort((a, b) => b.score - a.score);
  }, [combos, activeObjectives, weights, bounds]);

  // Pareto front + knee on the first two active objectives.
  const pareto = useMemo(() => {
    if (activeObjectives.length < 2) {
      return null;
    }
    const [ox, oy] = activeObjectives;
    const pts = combos.map((combo) => ({
      x: combo.values[ox.id],
      y: combo.values[oy.id],
      combo,
    }));
    const usable = pts.filter(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (usable.length < 2) {
      return null;
    }
    const frontIdx = paretoFront(
      usable.map((p) => ({ x: p.x, y: p.y })),
      { minimizeX: ox.dir === "min", minimizeY: oy.dir === "min" },
    );
    const frontSet = new Set(frontIdx);
    // Knee = Pareto point closest to the ideal corner in normalized space.
    let knee: (typeof usable)[number] | null = null;
    let kneeDist = Infinity;
    frontIdx.forEach((i) => {
      const nx = normalize(ox, usable[i].x);
      const ny = normalize(oy, usable[i].y);
      const dist = (1 - nx) ** 2 + (1 - ny) ** 2;
      if (dist < kneeDist) {
        kneeDist = dist;
        knee = usable[i];
      }
    });
    const data = usable.map((p, i) => ({
      x: p.x,
      y: p.y,
      onFront: frontSet.has(i),
      combo: p.combo,
    }));
    return { ox, oy, data, knee };
  }, [combos, activeObjectives, bounds]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Aucun point. Lance un DOE pour optimiser.
      </div>
    );
  }

  const recommended = ranked[0]?.combo ?? null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-md border border-line bg-white p-3 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
          Objectifs & poids
        </div>
        {OBJECTIVES.map((objective) => {
          const weight = weights[objective.id] ?? 0;
          return (
            <div className="rounded border border-line p-2" key={objective.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{objective.label}</span>
                <span className="text-[10px] uppercase text-slate-400">
                  {objective.dir === "max" ? "↑ max" : "↓ min"}
                </span>
              </div>
              <input
                className="mt-1 w-full accent-accent"
                max={3}
                min={0}
                onChange={(event) =>
                  setWeights({
                    ...weights,
                    [objective.id]: Number(event.target.value),
                  })
                }
                step={1}
                type="range"
                value={weight}
              />
              <div className="text-right text-[10px] text-slate-400">
                poids {weight}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {activeObjectives.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Donne un poids &gt; 0 à au moins un objectif.
          </div>
        ) : (
          <>
            {recommended ? (
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3">
                <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
                  Configuration recommandée — score{" "}
                  {(ranked[0].score * 100).toFixed(0)} / 100
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {Object.entries(recommended.factors).map(([key, value]) => (
                    <span key={key}>
                      <span className="text-slate-500">
                        {getFactorById(key)?.label ?? key} :
                      </span>{" "}
                      <span className="font-semibold text-ink">{String(value)}</span>
                    </span>
                  ))}
                  {Object.keys(recommended.factors).length === 0 ? (
                    <span className="text-slate-500">Configuration de référence</span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-500">
                  {activeObjectives.map((o) => (
                    <span key={o.id}>
                      {o.label}: {fmt(recommended.values[o.id])} {o.unit ?? ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {pareto ? (
              <div className="h-56 rounded-md border border-line bg-white p-3 shadow-sm">
                <div className="mb-1 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                  Pareto — {pareto.ox.label} vs {pareto.oy.label} (points pleins = front,
                  ★ = genou)
                </div>
                <ResponsiveContainer height="88%" width="100%">
                  <ScatterChart margin={{ bottom: 20, left: 8, right: 12, top: 6 }}>
                    <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="x"
                      name={pareto.ox.label}
                      stroke="#64748b"
                      tick={{ fontSize: 10, fill: "#475569" }}
                      type="number"
                    />
                    <YAxis
                      dataKey="y"
                      name={pareto.oy.label}
                      stroke="#64748b"
                      tick={{ fontSize: 10, fill: "#475569" }}
                      type="number"
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: number) => Number(value).toFixed(2)}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <Scatter
                      data={pareto.data.filter((d) => !d.onFront)}
                      fill="#cbd5e1"
                    />
                    <Scatter
                      data={pareto.data.filter((d) => d.onFront)}
                      fill="#2563eb"
                    />
                    {pareto.knee ? (
                      <Scatter
                        data={[pareto.knee]}
                        fill="#dc2626"
                        shape="star"
                      />
                    ) : null}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-md border border-line bg-slate-50 p-2 text-[11px] text-slate-500">
                Active ≥2 objectifs pour tracer le front de Pareto et son genou.
              </div>
            )}

            <div className="min-h-0 rounded-md border border-line bg-white p-3 shadow-sm">
              <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                Classement des configurations ({ranked.length})
              </div>
              <div className="overflow-auto">
                <table className="min-w-max border-collapse text-[11px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>#</Th>
                      <Th>Configuration</Th>
                      <Th className="text-right">Score</Th>
                      {activeObjectives.map((o) => (
                        <Th className="text-right" key={o.id}>
                          {o.label}
                        </Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.slice(0, 12).map((entry, index) => (
                      <tr
                        className={`border-t border-line ${
                          index === 0 ? "bg-emerald-50" : ""
                        }`}
                        key={entry.combo.key}
                      >
                        <td className="px-2 py-1 text-slate-400">{index + 1}</td>
                        <td className="px-2 py-1 font-mono text-[10px] text-slate-600">
                          {comboLabel(entry.combo.factors)}
                        </td>
                        <td className="px-2 py-1 text-right font-semibold">
                          {(entry.score * 100).toFixed(0)}
                        </td>
                        {activeObjectives.map((o) => (
                          <td className="px-2 py-1 text-right" key={o.id}>
                            {fmt(entry.combo.values[o.id])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function comboLabel(factors: Record<string, string | number>): string {
  const entries = Object.entries(factors);
  if (entries.length === 0) {
    return "base";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(" · ");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
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
