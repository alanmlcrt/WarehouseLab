import { useMemo, useState } from "react";
import type {
  LabPhysicalCell,
  LabPhysicalCellKind,
  RunPoint,
} from "../../experiments/labKit";
import { getFactorById } from "../../experiments/labKit";
import { formatNumber } from "./explorer/explorerModel";

interface PhysicalHeatmapPanelProps {
  points: RunPoint[];
}

type PhysicalMode = "traffic" | "wait";

const MODE_LABELS: Record<PhysicalMode, string> = {
  traffic: "Trafic",
  wait: "Attente",
};

export function PhysicalHeatmapPanel({ points }: PhysicalHeatmapPanelProps) {
  const availablePoints = useMemo(
    () => points.filter((point) => point.physicalSnapshot),
    [points],
  );
  const [pointId, setPointId] = useState("");
  const [mode, setMode] = useState<PhysicalMode>("traffic");
  const selected =
    availablePoints.find((point) => point.id === pointId) ??
    pickDefaultPoint(availablePoints);
  const snapshot = selected?.physicalSnapshot;

  if (points.length === 0) {
    return <Centered>Lance un DOE pour générer un récap physique.</Centered>;
  }
  if (!selected || !snapshot) {
    return (
      <Centered>
        Les résultats chargés ne contiennent pas encore de capture physique.
        Relance une campagne Lab pour produire cette vue.
      </Centered>
    );
  }

  const maxValue = mode === "traffic" ? snapshot.maxTraffic : snapshot.maxWait;
  const cellByKey = new Map(snapshot.cells.map((cell) => [cellKey(cell.x, cell.y), cell]));
  const hotCells = [...snapshot.cells]
    .filter((cell) => metricValue(cell, mode) > 0)
    .sort((a, b) => metricValue(b, mode) - metricValue(a, mode))
    .slice(0, 8);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <label className="flex min-w-[260px] flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Run
          </span>
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setPointId(event.target.value)}
            value={selected.id}
          >
            {availablePoints.map((point) => (
              <option key={point.id} value={point.id}>
                {runOptionLabel(point)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Couche
          </span>
          <div className="flex h-9 rounded-md border border-line bg-slate-50 p-0.5">
            {(["traffic", "wait"] as PhysicalMode[]).map((entry) => (
              <button
                className={`rounded px-3 text-sm font-semibold transition-colors ${
                  mode === entry ? "bg-ink text-white" : "text-slate-600 hover:bg-white"
                }`}
                key={entry}
                onClick={() => setMode(entry)}
                type="button"
              >
                {MODE_LABELS[entry]}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto grid grid-cols-4 gap-2">
          <Stat label="Plan" value={`${snapshot.width}x${snapshot.height}`} />
          <Stat label="Racks" value={snapshot.rackCount.toString()} />
          <Stat label="Stations" value={snapshot.stationCount.toString()} />
          <Stat label="Couloirs" value={snapshot.elevatorAisleCount.toString()} />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_190px] gap-3">
        <div className="min-h-0 overflow-auto rounded-md border border-line bg-slate-100 p-4 shadow-inner">
          <div
            className="mx-auto grid w-max gap-0.5 rounded-md border border-slate-300 bg-slate-300 p-1"
            style={{
              gridTemplateColumns: `repeat(${snapshot.width}, minmax(15px, 24px))`,
            }}
          >
            {Array.from({ length: snapshot.height }, (_, y) =>
              Array.from({ length: snapshot.width }, (_, x) => {
                const cell = cellByKey.get(cellKey(x, y));
                const value = cell ? metricValue(cell, mode) : 0;
                return (
                  <div
                    className="flex aspect-square items-center justify-center rounded-[2px] border border-white/20 text-[9px] font-bold tabular-nums"
                    key={`${x}:${y}`}
                    style={{
                      backgroundColor: physicalCellColor(cell?.type, value, maxValue),
                      color: physicalCellTextColor(cell?.type, value, maxValue),
                    }}
                    title={`${x},${y} · ${cell?.type ?? "empty"} · ${MODE_LABELS[mode]} ${formatNumber(value)}`}
                  >
                    {cellGlyph(cell)}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <div className="rounded-md border border-line bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Lecture physique
            </div>
            <p className="mt-2 leading-relaxed">
              Le plan reprend la géométrie finale du run. La couleur mesure le
              {mode === "traffic" ? " passage cumulé" : " temps d'attente cumulé"}
              {" "}par cellule.
            </p>
          </div>

          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Échelle
            </div>
            <div className="h-3 rounded-sm bg-gradient-to-r from-[#f8fafc] via-[#f59e0b] to-[#7f1d1d]" />
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
              <span>0</span>
              <span>{formatNumber(maxValue)}</span>
            </div>
          </div>

          <Legend />
          <HotCells cells={hotCells} mode={mode} />
        </aside>
      </div>
    </div>
  );
}

function pickDefaultPoint(points: RunPoint[]): RunPoint | undefined {
  const feasible = points.filter((point) => point.feasible);
  const pool = feasible.length > 0 ? feasible : points;
  return pool.reduce<RunPoint | undefined>((best, point) => {
    if (!best) {
      return point;
    }
    return (point.metrics.steadyThroughputPerMinute ?? 0) >
      (best.metrics.steadyThroughputPerMinute ?? 0)
      ? point
      : best;
  }, undefined);
}

function runOptionLabel(point: RunPoint): string {
  const throughput = point.metrics.steadyThroughputPerMinute ?? point.metrics.throughputPerMinute ?? 0;
  const factors = Object.entries(point.factors)
    .slice(0, 3)
    .map(([id, value]) => `${getFactorById(id)?.label ?? id}=${value}`)
    .join(" · ");
  return `${formatNumber(throughput)} c/min · ${factors || point.id}`;
}

function metricValue(cell: LabPhysicalCell, mode: PhysicalMode): number {
  return mode === "traffic" ? cell.traffic : cell.wait;
}

function physicalCellColor(
  type: LabPhysicalCellKind | undefined,
  value: number,
  max: number,
): string {
  if (value > 0 && max > 0) {
    const t = Math.min(1, Math.max(0, value / max));
    const start = [254, 243, 199];
    const end = [127, 29, 29];
    const rgb = start.map((channel, index) =>
      Math.round(channel + (end[index] - channel) * Math.sqrt(t)),
    );
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }
  switch (type) {
    case "rack":
      return "#1e293b";
    case "station":
      return "#10b981";
    case "charger":
      return "#fde68a";
    case "elevator":
      return "#a5f3fc";
    case "rail":
      return "#dbeafe";
    case "blocked":
      return "#94a3b8";
    default:
      return "#f8fafc";
  }
}

function physicalCellTextColor(
  type: LabPhysicalCellKind | undefined,
  value: number,
  max: number,
): string {
  if (value > 0 && max > 0) {
    return value / max > 0.38 ? "#ffffff" : "#451a03";
  }
  return type === "rack" ? "#cbd5e1" : "#334155";
}

function cellGlyph(cell?: LabPhysicalCell): string {
  switch (cell?.type) {
    case "rack":
      return "R";
    case "station":
      return "S";
    case "charger":
      return "C";
    case "elevator":
      return "E";
    default:
      return "";
  }
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[76px] rounded border border-line bg-slate-50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Repères
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
        <LegendItem color="#1e293b" label="Rack" />
        <LegendItem color="#10b981" label="Station" />
        <LegendItem color="#fde68a" label="Charge" />
        <LegendItem color="#a5f3fc" label="Ascenseur" />
        <LegendItem color="#dbeafe" label="Rail" />
        <LegendItem color="#f8fafc" label="Libre" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-3 w-3 rounded-[2px] border border-slate-300"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function HotCells({ cells, mode }: { cells: LabPhysicalCell[]; mode: PhysicalMode }) {
  if (cells.length === 0) {
    return null;
  }
  return (
    <div className="rounded-md border border-line bg-white p-3 shadow-sm">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        Zones chaudes
      </div>
      <div className="space-y-1.5 text-xs">
        {cells.map((cell) => (
          <div
            className="flex items-center justify-between gap-2 rounded border border-line bg-slate-50 px-2 py-1.5"
            key={`${cell.x}:${cell.y}`}
          >
            <span className="font-semibold text-slate-600">
              {cell.x},{cell.y}
            </span>
            <span className="tabular-nums text-ink">
              {formatNumber(metricValue(cell, mode))}
            </span>
          </div>
        ))}
      </div>
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
