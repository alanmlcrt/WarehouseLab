import { useEffect, useMemo, useState } from "react";
import {
  getActiveMetricColumns,
  getFactorById,
  getValueFromPoint,
  type FactorDef,
  type RunPoint,
} from "../../experiments/labKit";
import { mean, standardDeviation } from "../../experiments/labStats";
import { getVaryingFactors } from "./analysis";
import { distinctValues, formatNumber, sortLevels } from "./explorer/explorerModel";
import { MetricSelect } from "./metrics";
import { Verdict } from "./Verdict";

interface LabHeatmapPanelProps {
  points: RunPoint[];
}

interface HeatmapCell {
  x: string;
  y: string;
  n: number;
  mean: number;
  std: number;
  min: number;
  max: number;
}

export function LabHeatmapPanel({ points }: LabHeatmapPanelProps) {
  const varying = useMemo(() => getVaryingFactors(points), [points]);
  const metrics = useMemo(() => getActiveMetricColumns(points), [points]);
  const [xId, setXId] = useState("");
  const [yId, setYId] = useState("");
  const [metricId, setMetricId] = useState("");

  const activeX =
    varying.find((factor) => factor.id === xId)?.id ??
    varying.find((factor) => factor.id === "robotCount")?.id ??
    varying[0]?.id ??
    "";
  const activeY =
    yId && yId !== activeX && varying.some((factor) => factor.id === yId)
      ? yId
      : varying.find((factor) => factor.id !== activeX)?.id ?? "";
  const activeMetric =
    metrics.find((metric) => metric.id === metricId)?.id ??
    metrics.find((metric) => metric.id === "steadyThroughputPerMinute")?.id ??
    metrics[0]?.id ??
    "";

  useEffect(() => {
    if (xId !== activeX) setXId(activeX);
    if (yId !== activeY) setYId(activeY);
    if (metricId !== activeMetric) setMetricId(activeMetric);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeX, activeY, activeMetric]);

  const xFactor = getFactorById(activeX);
  const yFactor = getFactorById(activeY);
  const model = useMemo(
    () =>
      xFactor && yFactor
        ? buildHeatmap(points, xFactor, yFactor, activeMetric)
        : null,
    [points, xFactor, yFactor, activeMetric],
  );

  if (points.length === 0) {
    return <Centered>Lance un DOE pour générer une heatmap de résultats.</Centered>;
  }
  if (varying.length < 2 || !xFactor || !yFactor || !model) {
    return (
      <Centered>
        Fais varier au moins deux paramètres dans le plan pour construire une
        heatmap.
      </Centered>
    );
  }

  const metricLabel =
    metrics.find((metric) => metric.id === activeMetric)?.label ?? activeMetric;
  const bestCell = model.sortedCells[0] ?? null;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      {bestCell ? (
        <Verdict>
          Meilleur résultat pour <b className="text-ink">{metricLabel}</b> :{" "}
          <b className="text-emerald-700">{formatNumber(bestCell.mean)}</b>, obtenu avec{" "}
          <b className="text-ink">{xFactor.label} = {bestCell.x}</b> et{" "}
          <b className="text-ink">{yFactor.label} = {bestCell.y}</b>. La couleur la
          plus foncée repère cette zone dans la grille.
        </Verdict>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <FactorSelect
          factors={varying}
          label="Colonnes"
          onChange={setXId}
          value={activeX}
        />
        <FactorSelect
          factors={varying.filter((factor) => factor.id !== activeX)}
          label="Lignes"
          onChange={setYId}
          value={activeY}
        />
        <MetricSelect metrics={metrics} onChange={setMetricId} value={activeMetric} />
        <div className="ml-auto grid grid-cols-3 gap-2">
          <Stat label="Cellules" value={`${model.filledCells}/${model.totalCells}`} />
          <Stat label="Min" value={formatNumber(model.min)} />
          <Stat label="Max" value={formatNumber(model.max)} />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_160px] gap-3">
        <div className="min-h-0 overflow-auto rounded-md border border-line bg-white shadow-sm">
          <table className="min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr>
                <th className="sticky left-0 z-30 min-w-[120px] border-b border-r border-line bg-slate-50 px-2 py-2 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  {yFactor.label} \ {xFactor.label}
                </th>
                {model.xLevels.map((level) => (
                  <th
                    className="min-w-[86px] border-b border-line px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500"
                    key={level}
                  >
                    {level}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.yLevels.map((yLevel) => (
                <tr key={yLevel}>
                  <th className="sticky left-0 z-10 border-r border-line bg-white px-2 py-2 text-left font-semibold text-slate-600">
                    {yLevel}
                  </th>
                  {model.xLevels.map((xLevel) => {
                    const cell = model.cells.get(cellKey(xLevel, yLevel));
                    return (
                      <td className="border-t border-line p-1" key={xLevel}>
                        {cell ? (
                          <div
                            className="flex h-14 min-w-[78px] flex-col items-center justify-center rounded-sm border border-white/30 px-1 text-center shadow-sm"
                            style={{
                              backgroundColor: cellColor(cell.mean, model.min, model.max),
                              color: cellTextColor(cell.mean, model.min, model.max),
                            }}
                            title={`${xFactor.label}=${xLevel}\n${yFactor.label}=${yLevel}\nMoyenne=${formatNumber(cell.mean)}\nEcart=${formatNumber(cell.std)}\nn=${cell.n}`}
                          >
                            <span className="text-sm font-bold tabular-nums">
                              {formatNumber(cell.mean)}
                            </span>
                            <span className="text-[10px] opacity-80">n={cell.n}</span>
                          </div>
                        ) : (
                          <div className="flex h-14 min-w-[78px] items-center justify-center rounded-sm bg-slate-100 text-[10px] text-slate-300">
                            -
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <div className="rounded-md border border-line bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Lecture
            </div>
            <p className="mt-2 leading-relaxed">
              Chaque cellule est la moyenne des runs qui partagent ces deux
              niveaux. Plus la couleur est dense, plus la valeur de la métrique
              sélectionnée est élevée.
            </p>
          </div>
          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Échelle
            </div>
            <div className="h-3 rounded-sm bg-gradient-to-r from-[#f8fafc] via-[#99d8ca] to-[#0f766e]" />
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
              <span>{formatNumber(model.min)}</span>
              <span>{formatNumber(model.max)}</span>
            </div>
          </div>
          <TopCells cells={model.sortedCells} xFactor={xFactor} yFactor={yFactor} />
        </aside>
      </div>
    </div>
  );
}

function buildHeatmap(
  points: RunPoint[],
  xFactor: FactorDef,
  yFactor: FactorDef,
  metricId: string,
) {
  const xLevels = sortLevels(
    distinctValues(points, xFactor.id),
    xFactor.type !== "enum",
    xFactor.options,
  );
  const yLevels = sortLevels(
    distinctValues(points, yFactor.id),
    yFactor.type !== "enum",
    yFactor.options,
  );
  const buckets = new Map<string, number[]>();

  for (const point of points) {
    const xRaw = point.factors[xFactor.id];
    const yRaw = point.factors[yFactor.id];
    if (xRaw === undefined || yRaw === undefined) {
      continue;
    }
    const metric = getValueFromPoint(point, metricId, "metric");
    if (metric === undefined || !Number.isFinite(metric)) {
      continue;
    }
    const key = cellKey(String(xRaw), String(yRaw));
    const values = buckets.get(key);
    if (values) {
      values.push(metric);
    } else {
      buckets.set(key, [metric]);
    }
  }

  const cells = new Map<string, HeatmapCell>();
  for (const [key, values] of buckets) {
    const [x, y] = key.split("||");
    const sorted = [...values].sort((a, b) => a - b);
    cells.set(key, {
      x,
      y,
      n: values.length,
      mean: mean(values),
      std: standardDeviation(values),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    });
  }

  const sortedCells = [...cells.values()].sort((a, b) => b.mean - a.mean);
  const means = sortedCells.map((cell) => cell.mean);
  const min = means.length > 0 ? Math.min(...means) : 0;
  const max = means.length > 0 ? Math.max(...means) : 1;

  return {
    xLevels,
    yLevels,
    cells,
    sortedCells,
    min,
    max,
    filledCells: cells.size,
    totalCells: xLevels.length * yLevels.length,
  };
}

function FactorSelect({
  label,
  value,
  factors,
  onChange,
}: {
  label: string;
  value: string;
  factors: FactorDef[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <select
        className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
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

function TopCells({
  cells,
  xFactor,
  yFactor,
}: {
  cells: HeatmapCell[];
  xFactor: FactorDef;
  yFactor: FactorDef;
}) {
  const top = cells.slice(0, 5);
  if (top.length === 0) {
    return null;
  }
  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Valeurs hautes
      </div>
      <div className="space-y-2 text-xs">
        {top.map((cell) => (
          <div
            className="rounded border border-line bg-slate-50 px-2 py-1.5"
            key={cellKey(cell.x, cell.y)}
          >
            <div className="font-semibold tabular-nums text-ink">
              {formatNumber(cell.mean)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {xFactor.label}={cell.x} · {yFactor.label}={cell.y}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[72px] rounded border border-line bg-slate-50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
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

function cellKey(x: string, y: string): string {
  return `${x}||${y}`;
}

function cellColor(value: number, min: number, max: number): string {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  const stops = [
    [248, 250, 252],
    [153, 216, 202],
    [15, 118, 110],
  ];
  const scaled = t * (stops.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(stops.length - 1, left + 1);
  const local = scaled - left;
  const rgb = stops[left].map((channel, index) =>
    Math.round(channel + (stops[right][index] - channel) * local),
  );
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function cellTextColor(value: number, min: number, max: number): string {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  return t > 0.58 ? "#ffffff" : "#0f172a";
}
