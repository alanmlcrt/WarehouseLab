import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getActiveMetricColumns,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { paretoFront } from "../../experiments/labStats";
import { getVaryingFactors } from "./analysis";
import { Verdict } from "./Verdict";

interface ParetoChartProps {
  points: RunPoint[];
}

interface AxisColumn {
  id: string;
  label: string;
  source: "factor" | "metric";
  group: string;
}

export function ParetoChart({ points }: ParetoChartProps) {
  // Axes are restricted to the test: swept numeric parameters + its metrics.
  const columns = useMemo<AxisColumn[]>(() => {
    const factorCols = getVaryingFactors(points)
      .filter((factor) => factor.type !== "enum")
      .map((factor) => ({
        id: factor.id,
        label: factor.label,
        source: "factor" as const,
        group: "Paramètres du test",
      }));
    const metricCols = getActiveMetricColumns(points).map((metric) => ({
      id: metric.id,
      label: metric.label,
      source: "metric" as const,
      group: "Métriques du test",
    }));
    return [...factorCols, ...metricCols];
  }, [points]);

  const [x, setX] = useState({
    id: "energyPerOrder",
    source: "metric" as "factor" | "metric",
    minimize: true,
  });
  const [y, setY] = useState({
    id: "steadyThroughputPerMinute",
    source: "metric" as "factor" | "metric",
    minimize: false,
  });

  // Keep the axes pointing at columns that exist in this dataset.
  useEffect(() => {
    if (columns.length === 0) return;
    const has = (o: { id: string; source: string }) =>
      columns.some((c) => c.id === o.id && c.source === o.source);
    if (!has(x)) {
      const c =
        columns.find((col) => col.id === "energyPerOrder") ??
        columns.find((col) => col.id === "costProxy") ??
        columns[0];
      setX({ id: c.id, source: c.source, minimize: true });
    }
    if (!has(y)) {
      const c =
        columns.find((col) => col.id === "steadyThroughputPerMinute") ??
        columns.find((col) => col.id === "throughputPerMinute") ??
        columns.find((col) => col.id !== x.id) ??
        columns[columns.length - 1];
      setY({ id: c.id, source: c.source, minimize: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const data = useMemo(() => {
    return points
      .map((point) => {
        const xv = getValueFromPoint(point, x.id, x.source);
        const yv = getValueFromPoint(point, y.id, y.source);
        if (xv === undefined || yv === undefined) {
          return null;
        }
        return { id: point.id, x: xv, y: yv, point };
      })
      .filter(
        (entry): entry is {
          id: string;
          x: number;
          y: number;
          point: RunPoint;
        } => entry !== null,
      );
  }, [points, x, y]);

  const frontIndices = useMemo(
    () =>
      new Set(
        paretoFront(data, { minimizeX: x.minimize, minimizeY: y.minimize }),
      ),
    [data, x.minimize, y.minimize],
  );

  const frontPoints = data.filter((_, index) => frontIndices.has(index));
  const otherPoints = data.filter((_, index) => !frontIndices.has(index));

  const xLabel = columns.find(
    (col) => col.id === x.id && col.source === x.source,
  );
  const yLabel = columns.find(
    (col) => col.id === y.id && col.source === y.source,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {frontPoints.length > 0 ? (
        <Verdict>
          <b className="text-emerald-700">{frontPoints.length} config
          {frontPoints.length > 1 ? "s" : ""}</b> (en vert) offre
          {frontPoints.length > 1 ? "nt" : ""} le meilleur compromis : aucune
          autre ne fait mieux à la fois sur <b className="text-ink">{xLabel?.label ?? x.id}</b>{" "}
          et <b className="text-ink">{yLabel?.label ?? y.id}</b>. Les points gris
          sont battus par au moins une verte — choisis ta config sur la ligne verte
          selon le compromis voulu.
        </Verdict>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <ObjectivePicker
          columns={columns}
          label="Objectif X"
          minimize={x.minimize}
          onChange={setX}
          value={x}
        />
        <ObjectivePicker
          columns={columns}
          label="Objectif Y"
          minimize={y.minimize}
          onChange={setY}
          value={y}
        />
      </div>
      <div className="min-h-0 flex-1 rounded-md border border-line bg-white p-3 shadow-sm">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <ScatterChart margin={{ bottom: 24, left: 12, right: 16, top: 8 }}>
              <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
              <XAxis
                dataKey="x"
                label={{
                  value: `${xLabel?.label ?? x.id} (${x.minimize ? "min" : "max"})`,
                  position: "insideBottom",
                  offset: -10,
                  fill: "#475569",
                  fontSize: 12,
                }}
                name={xLabel?.label ?? x.id}
                stroke="#64748b"
                tick={{ fontSize: 12, fill: "#475569" }}
                type="number"
              />
              <YAxis
                dataKey="y"
                label={{
                  value: `${yLabel?.label ?? y.id} (${y.minimize ? "min" : "max"})`,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                }}
                name={yLabel?.label ?? y.id}
                stroke="#64748b"
                tick={{ fontSize: 12, fill: "#475569" }}
                type="number"
                width={64}
              />
              <Tooltip content={<PointTooltip />} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
              />
              <Scatter
                data={otherPoints}
                fill="#94a3b8"
                fillOpacity={0.5}
                name="Dominee"
              >
                {otherPoints.map((entry) => (
                  <Cell fill="#94a3b8" key={entry.id} />
                ))}
              </Scatter>
              <Scatter
                data={frontPoints}
                fill="#0f766e"
                fillOpacity={0.95}
                line={{ stroke: "#0f766e", strokeWidth: 2 }}
                name="Front Pareto"
              >
                {frontPoints.map((entry) => (
                  <Cell fill="#0f766e" key={entry.id} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

interface ObjectivePickerProps {
  columns: AxisColumn[];
  label: string;
  value: { id: string; source: "factor" | "metric"; minimize: boolean };
  minimize: boolean;
  onChange: (value: {
    id: string;
    source: "factor" | "metric";
    minimize: boolean;
  }) => void;
}

function ObjectivePicker({
  columns,
  label,
  value,
  onChange,
}: ObjectivePickerProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <div className="mt-1 flex gap-2">
        <select
          className="h-8 flex-1 rounded border border-line bg-white px-2 text-sm"
          onChange={(event) => {
            const [source, id] = event.target.value.split(":");
            onChange({
              ...value,
              id,
              source: source as "factor" | "metric",
            });
          }}
          value={`${value.source}:${value.id}`}
        >
          {Array.from(
            new Map(
              columns.map((column) => [column.group ?? "Autres", column.group]),
            ).entries(),
          ).map(([groupName]) => (
            <optgroup key={groupName} label={groupName}>
              {columns
                .filter((c) => (c.group ?? "Autres") === groupName)
                .map((c) => (
                  <option
                    key={`${c.source}:${c.id}`}
                    value={`${c.source}:${c.id}`}
                  >
                    {c.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select
          className="h-8 rounded border border-line bg-white px-2 text-sm"
          onChange={(event) =>
            onChange({ ...value, minimize: event.target.value === "min" })
          }
          value={value.minimize ? "min" : "max"}
        >
          <option value="max">Maximiser</option>
          <option value="min">Minimiser</option>
        </select>
      </div>
    </div>
  );
}

function PointTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0].payload as {
    id: string;
    x: number;
    y: number;
    point: RunPoint;
  };
  return (
    <div className="rounded-md border border-line bg-white p-2 text-xs shadow-md">
      <div className="font-semibold text-ink">Run {entry.point.id}</div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-slate-600">
        <span>X</span>
        <span className="text-right font-semibold">{entry.x.toFixed(3)}</span>
        <span>Y</span>
        <span className="text-right font-semibold">{entry.y.toFixed(3)}</span>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-slate-400">
      Aucun point. Lance un DOE.
    </div>
  );
}
