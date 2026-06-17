import { useMemo, useState } from "react";
import {
  getActiveMetricColumns,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { correlationMatrix } from "../../experiments/labStats";
import { getVaryingFactors } from "./analysis";
import { Verdict } from "./Verdict";

interface CorrelationHeatmapProps {
  points: RunPoint[];
}

export function CorrelationHeatmap({ points }: CorrelationHeatmapProps) {
  // Restrict to the test itself: the numeric parameters that were swept, plus
  // the metrics that actually vary in the dataset. Avoids the 30-column wall.
  const columns = useMemo(() => {
    const factorCols = getVaryingFactors(points)
      .filter((factor) => factor.type !== "enum")
      .map((factor) => ({
        id: factor.id,
        label: factor.label,
        source: "factor" as const,
      }));
    const metricCols = getActiveMetricColumns(points).map((metric) => ({
      id: metric.id,
      label: metric.label,
      source: "metric" as const,
    }));
    return [...factorCols, ...metricCols];
  }, [points]);

  const series = useMemo(
    () =>
      columns.map((column) => ({
        id: `${column.source}:${column.id}`,
        label: column.label,
        values: points
          .map((point) => getValueFromPoint(point, column.id, column.source))
          .filter((value): value is number => typeof value === "number"),
      })),
    [columns, points],
  );

  const validSeries = series.filter((s) => s.values.length === points.length);
  const matrix = useMemo(
    () =>
      correlationMatrix(
        validSeries.map((s) => ({ id: s.id, values: s.values })),
      ),
    [validSeries],
  );

  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  // Strongest relationship in the matrix (largest |r| off the diagonal), stated
  // in plain words so a reader doesn't have to scan the whole grid.
  const strongest = useMemo(() => {
    let best: { a: string; b: string; r: number } | null = null;
    for (let i = 0; i < validSeries.length; i += 1) {
      for (let j = i + 1; j < validSeries.length; j += 1) {
        const r = matrix[i]?.[j] ?? 0;
        if (!best || Math.abs(r) > Math.abs(best.r)) {
          best = { a: validSeries[i].label, b: validSeries[j].label, r };
        }
      }
    }
    return best;
  }, [matrix, validSeries]);

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Aucun point. Lance un DOE.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {strongest && Math.abs(strongest.r) >= 0.3 ? (
        <Verdict>
          Relation la plus forte : <b className="text-ink">{strongest.a}</b> et{" "}
          <b className="text-ink">{strongest.b}</b>{" "}
          {strongest.r >= 0 ? "augmentent ensemble" : "évoluent en sens opposé"}{" "}
          <span className="text-slate-400">
            (r = {strongest.r.toFixed(2)}, {Math.abs(strongest.r) >= 0.7 ? "lien fort" : "lien modéré"})
          </span>
          . Une corrélation n'est pas une cause : c'est une piste à confirmer.
        </Verdict>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white p-2 text-xs text-slate-500">
        <span>
          Corrélations entre les paramètres testés et les métriques du test.
          Bleu = varient en sens opposé, vert = varient ensemble.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ColorScaleLegend />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white p-3 shadow-sm">
        {validSeries.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Trop peu de colonnes valides
          </div>
        ) : (
          <table className="min-w-max border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 bg-white px-2 py-1 text-left text-slate-500">
                  &nbsp;
                </th>
                {validSeries.map((column, index) => (
                  <th
                    className="rotate-[-45deg] px-1 py-3 text-left font-medium text-slate-500"
                    key={column.id}
                    style={{ minWidth: 22, height: 90 }}
                    title={column.label}
                  >
                    <span
                      className={
                        hover && hover.col === index
                          ? "text-ink"
                          : "text-slate-500"
                      }
                    >
                      {column.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {validSeries.map((row, rowIndex) => (
                <tr key={row.id}>
                  <th
                    className={`sticky left-0 z-10 bg-white px-2 py-1 text-left ${
                      hover && hover.row === rowIndex
                        ? "text-ink"
                        : "text-slate-500"
                    }`}
                    title={row.label}
                  >
                    {row.label}
                  </th>
                  {validSeries.map((column, colIndex) => {
                    const value = matrix[rowIndex]?.[colIndex] ?? 0;
                    return (
                      <td
                        className="cursor-pointer text-center"
                        key={`${row.id}-${column.id}`}
                        onMouseEnter={() =>
                          setHover({ row: rowIndex, col: colIndex })
                        }
                        onMouseLeave={() => setHover(null)}
                        style={{
                          backgroundColor: colorForCorrelation(value),
                          color: Math.abs(value) > 0.6 ? "#fff" : "#0f172a",
                          width: 28,
                          height: 22,
                          fontSize: 9,
                        }}
                        title={`${row.label} vs ${column.label}: ${value.toFixed(3)}`}
                      >
                        {value.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function colorForCorrelation(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped >= 0) {
    const intensity = clamped;
    const r = Math.round(255 - 200 * intensity);
    const g = Math.round(255 - 130 * intensity);
    const b = Math.round(255 - 130 * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const intensity = -clamped;
  const r = Math.round(255 - 130 * intensity);
  const g = Math.round(255 - 130 * intensity);
  const b = Math.round(255 - 50 * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function ColorScaleLegend() {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span>-1</span>
      <div
        className="h-3 w-32 rounded"
        style={{
          background:
            "linear-gradient(to right, rgb(125,125,205), #fff, rgb(55,125,125))",
        }}
      />
      <span>+1</span>
    </div>
  );
}
