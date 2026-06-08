import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildRobotOptimizationModel,
  formatRobotFormula,
  predictRobotsFromFormula,
  type RobotContextSummary,
} from "../../experiments/fleetOptimizer";
import type { RunPoint } from "../../experiments/labKit";

interface RobotFormulaPanelProps {
  points: RunPoint[];
}

export function RobotFormulaPanel({ points }: RobotFormulaPanelProps) {
  const model = useMemo(() => buildRobotOptimizationModel(points), [points]);
  const [selectedKey, setSelectedKey] = useState("");
  const activeContext =
    model.contexts.find((context) => context.key === selectedKey) ??
    model.contexts[0];

  if (model.contexts.length === 0) {
    return (
      <Centered>
        Fais varier `robotCount` dans le plan pour estimer la courbe de saturation.
      </Centered>
    );
  }

  const predicted =
    model.formula && activeContext
      ? predictRobotsFromFormula(model.formula, activeContext.featureValues)
      : null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-3">
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="rounded-md border border-line bg-white p-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Formule empirique
          </div>
          {model.formula ? (
            <>
              <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-ink">
                {formatRobotFormula(model.formula)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="R2" value={model.formula.rSquared.toFixed(2)} />
                <Stat
                  label="Erreur"
                  value={`± ${fmt(model.formula.rmseRobots)}`}
                />
                <Stat label="Cas" value={String(model.formula.sampleSize)} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Teste au moins trois dispositions différentes pour ajuster une loi
              globale.
            </p>
          )}
        </div>

        <div className="rounded-md border border-line bg-white p-3 shadow-sm">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Disposition analysée
            <select
              className="h-9 rounded border border-line bg-white px-2 text-sm font-normal"
              onChange={(event) => setSelectedKey(event.target.value)}
              value={activeContext.key}
            >
              {model.contexts.map((context) => (
                <option key={context.key} value={context.key}>
                  {context.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ContextSummary context={activeContext} predicted={predicted} />

        {model.warnings.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {model.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </aside>

      <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_190px] gap-3">
        <div className="min-h-0 rounded-md border border-line bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
                Débit selon le nombre de robots
              </div>
              <div className="text-sm font-semibold text-ink">
                {activeContext.label}
              </div>
            </div>
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              R* = {activeContext.recommended.robotCount}
            </div>
          </div>
          <ResponsiveContainer height="88%" width="100%">
            <LineChart
              data={chartRows(activeContext)}
              margin={{ bottom: 24, left: 8, right: 18, top: 8 }}
            >
              <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
              <XAxis
                dataKey="robotCount"
                label={{
                  value: "Robots",
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
                label={{
                  value: "Caisses/min",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                }}
                stroke="#64748b"
                tick={{ fontSize: 12, fill: "#475569" }}
                width={58}
              />
              <Tooltip
                formatter={(value: number, name) => [
                  fmt(value),
                  name === "throughput" ? "Débit" : "Congestion",
                ]}
                labelFormatter={(value) => `${value} robots`}
                labelStyle={{ fontSize: 12 }}
              />
              <ReferenceLine
                stroke="#0f766e"
                strokeDasharray="5 4"
                x={activeContext.recommended.robotCount}
              />
              <Line
                dataKey="throughput"
                dot={{ r: 3 }}
                name="Débit"
                stroke="#2563eb"
                strokeWidth={2.5}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 overflow-auto rounded-md border border-line bg-white shadow-sm">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Contexte</th>
                <th className="px-3 py-2 text-right">R* observé</th>
                <th className="px-3 py-2 text-right">Débit max</th>
                <th className="px-3 py-2 text-right">Perte après seuil</th>
                <th className="px-3 py-2 text-right">R* formule</th>
              </tr>
            </thead>
            <tbody>
              {model.contexts.map((context) => {
                const rowPrediction = model.formula
                  ? predictRobotsFromFormula(model.formula, context.featureValues)
                  : null;
                return (
                  <tr className="border-t border-line" key={context.key}>
                    <td className="max-w-[520px] px-3 py-2 text-slate-600">
                      {context.label}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {context.recommended.robotCount}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(context.bestObserved.throughput)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        context.saturationLossPct >= 5
                          ? "text-amber-700"
                          : "text-slate-500"
                      }`}
                    >
                      {context.saturationLossPct.toFixed(0)} %
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {rowPrediction ? fmt(rowPrediction) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function ContextSummary({
  context,
  predicted,
}: {
  context: RobotContextSummary;
  predicted: number | null;
}) {
  const best = context.bestObserved;
  const recommended = context.recommended;
  const message =
    context.saturationLossPct >= 5
      ? `Passé ${best.robotCount} robots, la meilleure courbe perd jusqu'à ${context.saturationLossPct.toFixed(0)} % de débit.`
      : "La courbe ne montre pas encore de chute nette dans la plage testée.";

  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
        Lecture métier
      </div>
      <p className="mt-2 text-sm font-medium text-ink">{message}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="R* retenu" value={String(recommended.robotCount)} />
        <Stat label="Débit max" value={fmt(best.throughput)} />
        <Stat label="Service" value={`${(recommended.serviceLevel * 100).toFixed(0)} %`} />
        <Stat label="R* formule" value={predicted ? fmt(predicted) : "-"} />
      </div>
    </div>
  );
}

function chartRows(context: RobotContextSummary) {
  return context.levels.map((level) => ({
    robotCount: level.robotCount,
    throughput: level.throughput,
    congestion: level.congestion,
  }));
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}

function fmt(value: number): string {
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
