import { useMemo, useState } from "react";
import {
  FACTOR_REGISTRY,
  METRIC_COLUMNS,
  type RunPoint,
} from "../../experiments/labKit";

interface DataTableProps {
  points: RunPoint[];
}

type SortDirection = "asc" | "desc";

export function DataTable({ points }: DataTableProps) {
  const [sortKey, setSortKey] = useState<{
    id: string;
    source: "factor" | "metric";
  } | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [feasibleOnly, setFeasibleOnly] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPoints = useMemo(() => {
    return points.filter((point) => {
      if (feasibleOnly && !point.feasible) {
        return false;
      }
      if (search.trim().length === 0) {
        return true;
      }
      const needle = search.trim().toLowerCase();
      return (
        point.id.toLowerCase().includes(needle) ||
        Object.values(point.factors).some((value) =>
          String(value).toLowerCase().includes(needle),
        )
      );
    });
  }, [points, feasibleOnly, search]);

  const sortedPoints = useMemo(() => {
    if (!sortKey) {
      return filteredPoints;
    }
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredPoints].sort((a, b) => {
      const va =
        sortKey.source === "factor"
          ? a.factors[sortKey.id]
          : a.metrics[sortKey.id];
      const vb =
        sortKey.source === "factor"
          ? b.factors[sortKey.id]
          : b.metrics[sortKey.id];
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * direction;
      }
      return String(va ?? "").localeCompare(String(vb ?? "")) * direction;
    });
  }, [filteredPoints, sortKey, sortDirection]);

  const toggleSort = (id: string, source: "factor" | "metric") => {
    if (sortKey?.id === id && sortKey.source === source) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey({ id, source });
      setSortDirection("desc");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-2 text-xs">
        <input
          className="h-8 w-60 rounded border border-line bg-white px-2 text-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filtrer (run id ou valeur)"
          type="text"
          value={search}
        />
        <label className="flex items-center gap-2">
          <input
            checked={feasibleOnly}
            onChange={(event) => setFeasibleOnly(event.target.checked)}
            type="checkbox"
          />
          Faisables uniquement
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-slate-500">
            {sortedPoints.length} / {points.length} lignes
          </span>
          <button
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={sortedPoints.length === 0}
            onClick={() => downloadCsv(sortedPoints)}
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white shadow-sm">
        <table className="min-w-max border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <Th
                active={false}
                direction={sortDirection}
                onClick={() => undefined}
                width={150}
              >
                Run
              </Th>
              <Th
                active={false}
                direction={sortDirection}
                onClick={() => undefined}
              >
                Seed
              </Th>
              {FACTOR_REGISTRY.map((factor) => (
                <Th
                  active={sortKey?.id === factor.id && sortKey.source === "factor"}
                  direction={sortDirection}
                  key={`f-${factor.id}`}
                  onClick={() => toggleSort(factor.id, "factor")}
                >
                  {factor.label}
                </Th>
              ))}
              {METRIC_COLUMNS.map((column) => (
                <Th
                  active={sortKey?.id === column.id && sortKey.source === "metric"}
                  direction={sortDirection}
                  key={`m-${column.id}`}
                  onClick={() => toggleSort(column.id, "metric")}
                >
                  {column.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPoints.map((point) => (
              <tr
                className={`border-t border-line ${
                  point.feasible ? "" : "bg-red-50/50"
                }`}
                key={point.id}
              >
                <td className="px-2 py-1 font-mono text-[10px] text-slate-500">
                  {point.id}
                </td>
                <td className="px-2 py-1 text-center">{point.seedIndex + 1}</td>
                {FACTOR_REGISTRY.map((factor) => (
                  <td className="px-2 py-1 text-right" key={`f-${factor.id}`}>
                    {formatValue(point.factors[factor.id])}
                  </td>
                ))}
                {METRIC_COLUMNS.map((column) => (
                  <td className="px-2 py-1 text-right" key={`m-${column.id}`}>
                    {formatValue(point.metrics[column.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedPoints.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Aucun resultat
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  direction,
  width,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
  width?: number;
}) {
  return (
    <th
      className={`cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] ${
        active ? "bg-accent/10 text-ink" : "text-slate-500"
      }`}
      onClick={onClick}
      style={{ minWidth: width ?? 90 }}
    >
      {children}
      {active ? (direction === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );
}

function formatValue(value: number | string | undefined): string {
  if (value === undefined || value === null) {
    return "-";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "-";
    }
    if (Number.isInteger(value)) {
      return value.toString();
    }
    if (Math.abs(value) < 0.01 && value !== 0) {
      return value.toExponential(2);
    }
    return value.toFixed(3);
  }
  return String(value);
}

function downloadCsv(points: RunPoint[]): void {
  const factorIds = FACTOR_REGISTRY.map((factor) => factor.id);
  const metricIds = METRIC_COLUMNS.map((column) => column.id);
  const header = [
    "id",
    "seed",
    "feasible",
    ...factorIds.map((id) => `factor.${id}`),
    ...metricIds.map((id) => `metric.${id}`),
  ];
  const lines = [header.join(",")];
  for (const point of points) {
    const row = [
      point.id,
      String(point.seedIndex + 1),
      point.feasible ? "true" : "false",
      ...factorIds.map((id) => csvValue(point.factors[id])),
      ...metricIds.map((id) => csvValue(point.metrics[id])),
    ];
    lines.push(row.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `warehouse-lab-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvValue(value: number | string | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(6);
  }
  const text = String(value);
  if (text.includes(",") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
