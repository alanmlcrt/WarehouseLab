import { useEffect, useMemo, useState } from "react";
import {
  getActiveMetricColumns,
  getFactorById,
  type RunPoint,
} from "../../experiments/labKit";
import { getVaryingFactors } from "./analysis";
import {
  BarsChart,
  BoxPlotChart,
  ScatterCloud,
  TrendChart,
  type ChartProps,
} from "./explorer/ExplorerCharts";
import { buildSeries, PALETTE, SINGLE_GROUP } from "./explorer/explorerModel";
import { groupMetrics, MetricSelect } from "./metrics";

interface ExplorerViewProps {
  points: RunPoint[];
}

type ChartType = "auto" | "trend" | "bars" | "box" | "scatter";

const CHART_LABELS: Array<{ id: ChartType; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "trend", label: "Courbe" },
  { id: "bars", label: "Barres" },
  { id: "box", label: "Boîtes" },
  { id: "scatter", label: "Nuage" },
];

export function ExplorerView({ points }: ExplorerViewProps) {
  const varying = useMemo(() => getVaryingFactors(points), [points]);
  const metrics = useMemo(() => getActiveMetricColumns(points), [points]);

  const [xId, setXId] = useState("");
  const [yId, setYId] = useState("");
  const [y2Id, setY2Id] = useState("");
  const [colorId, setColorId] = useState("");
  const [chartType, setChartType] = useState<ChartType>("auto");

  // Defaults: prefer a numeric factor on X (e.g. robotCount) and throughput on Y.
  const activeX =
    varying.find((factor) => factor.id === xId)?.id ??
    varying.find((factor) => factor.type !== "enum")?.id ??
    varying[0]?.id ??
    "";
  const activeY =
    metrics.find((metric) => metric.id === yId)?.id ??
    metrics.find((metric) => metric.id === "steadyThroughputPerMinute")?.id ??
    metrics[0]?.id ??
    "";
  const activeColor =
    colorId && colorId !== activeX && varying.some((f) => f.id === colorId)
      ? colorId
      : "";
  // Secondary Y is optional and must differ from the primary Y. We allow any
  // metric that survives the active-columns filter.
  const activeY2 =
    y2Id && y2Id !== activeY && metrics.some((metric) => metric.id === y2Id)
      ? y2Id
      : "";

  useEffect(() => {
    if (xId !== activeX) setXId(activeX);
    if (yId !== activeY) setYId(activeY);
    if (colorId !== activeColor) setColorId(activeColor);
    if (y2Id !== activeY2) setY2Id(activeY2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeX, activeY, activeColor, activeY2]);

  const xFactor = getFactorById(activeX) ?? null;
  const colorFactor = activeColor ? getFactorById(activeColor) ?? null : null;

  const series = useMemo(
    () => (xFactor ? buildSeries(points, xFactor, activeY, colorFactor) : null),
    [points, xFactor, activeY, colorFactor],
  );
  // Secondary series: no color split (single group) so the dashed overlay stays
  // readable — even when the primary chart is colored by a factor.
  const series2 = useMemo(
    () => (xFactor && activeY2 ? buildSeries(points, xFactor, activeY2, null) : null),
    [points, xFactor, activeY2],
  );

  if (points.length === 0) {
    return <Centered>Lance une expérience pour explorer les résultats.</Centered>;
  }
  if (varying.length === 0 || !xFactor || !series) {
    return (
      <Centered>
        Fais varier au moins un paramètre (colonne « À tester ») puis relance.
      </Centered>
    );
  }

  const yMetric = metrics.find((metric) => metric.id === activeY);
  const yLabel = yMetric
    ? yMetric.unit
      ? `${yMetric.label} (${yMetric.unit})`
      : yMetric.label
    : activeY;
  const y2Metric = activeY2 ? metrics.find((metric) => metric.id === activeY2) : null;
  const y2Label = y2Metric
    ? y2Metric.unit
      ? `${y2Metric.label} (${y2Metric.unit})`
      : y2Metric.label
    : activeY2;

  const effectiveType: Exclude<ChartType, "auto"> =
    chartType === "auto" ? (series.xIsNumeric ? "trend" : "bars") : chartType;

  const colorOf = (group: string): string => {
    if (group === SINGLE_GROUP) return "#0f766e";
    const index = series.groups.indexOf(group);
    return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
  };

  const chartProps: ChartProps = {
    series,
    xAxisLabel: xFactor.label,
    yAxisLabel: yLabel,
    colorFactor,
    colorOf,
    series2,
    y2AxisLabel: y2Label,
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-line bg-white p-3 shadow-sm">
        <Field label="En abscisse (X)">
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setXId(event.target.value)}
            value={activeX}
          >
            {varying.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="En ordonnée (Y)">
          <MetricSelect
            label=""
            metrics={metrics}
            onChange={setYId}
            value={activeY}
          />
        </Field>
        <Field label="Y secondaire (axe droit)">
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setY2Id(event.target.value)}
            value={activeY2}
            title="Ajoute une 2e courbe en pointillés sur un axe Y à droite — utile pour visualiser un trade-off (ex. débit vs capacité de stockage)."
          >
            <option value="">— aucune —</option>
            {groupMetrics(metrics.filter((metric) => metric.id !== activeY)).map(
              (section) => (
                <optgroup key={section.group} label={section.group}>
                  {section.items.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.label}
                      {metric.unit ? ` (${metric.unit})` : ""}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </Field>
        <Field label="Comparer par">
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setColorId(event.target.value)}
            value={activeColor}
          >
            <option value="">— aucun —</option>
            {varying
              .filter((factor) => factor.id !== activeX)
              .map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factor.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Graphe">
          <div className="flex h-9 items-center gap-1 rounded border border-line bg-slate-50 p-0.5">
            {CHART_LABELS.map((entry) => (
              <button
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  (chartType === entry.id)
                    ? "bg-white text-ink shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                key={entry.id}
                onClick={() => setChartType(entry.id)}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <section className="min-h-0 rounded-lg border border-line bg-white p-3 shadow-sm">
        {colorFactor ? <Legend series={series} colorOf={colorOf} colorFactor={colorFactor} /> : null}
        {series2 && y2Metric ? (
          <div className="mb-1 flex items-center gap-1.5 text-xs text-amber-700">
            <span
              aria-hidden
              className="inline-block h-0.5 w-6"
              style={{
                background:
                  "repeating-linear-gradient(to right, #d97706 0 5px, transparent 5px 9px)",
              }}
            />
            <span className="font-medium">Axe droit (pointillés) :</span>
            <span>{y2Label}</span>
          </div>
        ) : null}
        <div className="h-[calc(100%-1.75rem)] min-h-[280px]">
          {effectiveType === "trend" ? (
            series.xIsNumeric ? (
              <TrendChart {...chartProps} />
            ) : (
              <BarsChart {...chartProps} />
            )
          ) : effectiveType === "bars" ? (
            <BarsChart {...chartProps} />
          ) : effectiveType === "box" ? (
            <BoxPlotChart {...chartProps} />
          ) : (
            <ScatterCloud {...chartProps} />
          )}
        </div>
      </section>
    </div>
  );
}

function Legend({
  series,
  colorOf,
  colorFactor,
}: {
  series: NonNullable<ReturnType<typeof buildSeries>>;
  colorOf: (group: string) => string;
  colorFactor: { label: string };
}) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
      <span className="font-medium text-slate-500">{colorFactor.label} :</span>
      {series.groups.map((group) => (
        <span className="inline-flex items-center gap-1" key={group}>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colorOf(group) }}
          />
          {group}
        </span>
      ))}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}
