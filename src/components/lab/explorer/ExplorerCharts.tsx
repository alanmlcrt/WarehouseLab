import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Customized,
  ErrorBar,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { FactorDef } from "../../../experiments/labKit";
import {
  formatNumber,
  groupLabel,
  type ExplorerSeries,
  type LevelStat,
} from "./explorerModel";

export interface ChartProps {
  series: ExplorerSeries;
  xAxisLabel: string;
  yAxisLabel: string;
  colorFactor: FactorDef | null;
  colorOf: (group: string) => string;
  /** Facet mode: tighter margins, no axis titles (the facet heading carries them). */
  compact?: boolean;
  /** Optional secondary Y series plotted on a right-side axis (dual-axis trade-off). */
  series2?: ExplorerSeries | null;
  y2AxisLabel?: string;
}

/** Distinct hue for the secondary Y axis — uses amber to contrast with the
 *  teal/blue palette of the primary series. */
const Y2_COLOR = "#d97706";

function deterministicJitter(key: string, amplitude: number): number {
  if (amplitude <= 0) return 0;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  return ((hash / 4294967295) * 2 - 1) * amplitude;
}

function axisFont(compact?: boolean) {
  return compact ? 10 : 12;
}

/** Y domain centred on the per-group means (± std), so outliers in the raw
 *  cloud don't crush the mean line into a flat band. Cloud points that fall
 *  outside the domain are clipped via `allowDataOverflow` on the axis. */
function meanCenteredYDomain(
  series: ExplorerSeries,
): [number | string, number | string] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const stats of series.statsByGroup.values()) {
    for (const s of stats) {
      const band = Number.isFinite(s.std) ? s.std : 0;
      if (s.mean - band < lo) lo = s.mean - band;
      if (s.mean + band > hi) hi = s.mean + band;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return ["auto", "auto"];
  if (hi === lo) {
    const bump = Math.max(Math.abs(hi) * 0.05, 1);
    return [lo - bump, hi + bump];
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function emptyState(message: string) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-400">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend — mean line over a numeric parameter, faint raw cloud underneath
// ---------------------------------------------------------------------------

export function TrendChart(props: ChartProps) {
  const { series, xAxisLabel, yAxisLabel, colorOf, compact, series2, y2AxisLabel } = props;
  if (series.count === 0) return emptyState("Aucun point exploitable.");

  const numericLevels = series.xLevels.map(Number);
  const gaps = numericLevels
    .slice(1)
    .map((v, i) => v - numericLevels[i])
    .filter((g) => g > 0);
  const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;
  const jitterAmp = series.xLevels.length <= 12 ? minGap * 0.16 : 0;

  const fz = axisFont(compact);
  const yDomain = meanCenteredYDomain(series);
  const hasSecondary = !!series2 && series2.count > 0;
  const y2Domain = hasSecondary ? meanCenteredYDomain(series2) : undefined;

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ScatterChart
        margin={{ bottom: compact ? 12 : 28, left: 8, right: 14, top: 8 }}
      >
        <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
        <XAxis
          dataKey="x"
          domain={["auto", "auto"]}
          label={
            compact
              ? undefined
              : {
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -12,
                  fill: "#475569",
                  fontSize: 12,
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) => formatNumber(v)}
          ticks={series.xLevels.length <= 10 ? numericLevels : undefined}
          type="number"
        />
        <YAxis
          allowDataOverflow
          dataKey="y"
          domain={yDomain}
          label={
            compact
              ? undefined
              : {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                  style: { textAnchor: "middle" },
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) => formatNumber(v)}
          type="number"
          width={compact ? 40 : 64}
          yAxisId="left"
        />
        {hasSecondary ? (
          <YAxis
            allowDataOverflow
            dataKey="y"
            domain={y2Domain}
            label={
              compact
                ? undefined
                : {
                    value: y2AxisLabel,
                    angle: 90,
                    position: "insideRight",
                    fill: Y2_COLOR,
                    fontSize: 12,
                    style: { textAnchor: "middle" },
                  }
            }
            orientation="right"
            stroke={Y2_COLOR}
            tick={{ fontSize: fz, fill: Y2_COLOR }}
            tickFormatter={(v: number) => formatNumber(v)}
            type="number"
            width={compact ? 40 : 64}
            yAxisId="right"
          />
        ) : null}
        <ZAxis dataKey="z" domain={[1, 4]} range={[compact ? 18 : 30, compact ? 90 : 220]} />
        <Tooltip
          content={<PointTooltip {...props} />}
          cursor={{ strokeDasharray: "3 3" }}
        />
        {series.groups.map((group) => {
          const color = colorOf(group);
          const rawData = series.raw
            .filter((d) => d.group === group)
            .map((d) => ({
              x: d.xValue + deterministicJitter(d.point.id, jitterAmp),
              y: d.y,
              z: 1,
              xLabel: d.xLabel,
              group,
              point: d.point,
            }));
          return (
            <Scatter
              key={`raw-${group}`}
              data={rawData}
              fill={color}
              fillOpacity={0.2}
              isAnimationActive={false}
              yAxisId="left"
            />
          );
        })}
        {series.groups.map((group) => {
          const color = colorOf(group);
          const meanData = (series.statsByGroup.get(group) ?? []).map((s) => ({
            x: s.xValue,
            y: s.mean,
            z: 4,
            xLabel: s.xLabel,
            group,
            stat: s,
          }));
          return (
            <Scatter
              key={`mean-${group}`}
              data={meanData}
              fill={color}
              fillOpacity={0.95}
              isAnimationActive={false}
              line={{ stroke: color, strokeWidth: 2 }}
              lineType="joint"
              stroke="#ffffff"
              strokeWidth={1.5}
              yAxisId="left"
            />
          );
        })}
        {hasSecondary
          ? series2!.groups.map((group) => {
              // Secondary axis: aggregate dashed line — no raw cloud, no per-color split.
              // We only plot the GRAND mean per X level (across all secondary groups)
              // because the secondary metric is meant as context, not a full breakdown.
              const stats = series2!.statsByGroup.get(group) ?? [];
              const meanData = stats.map((s) => ({
                x: s.xValue,
                y: s.mean,
                z: 4,
                xLabel: s.xLabel,
                group,
                stat: s,
              }));
              return (
                <Scatter
                  key={`mean2-${group}`}
                  data={meanData}
                  fill={Y2_COLOR}
                  fillOpacity={0.95}
                  isAnimationActive={false}
                  line={{
                    stroke: Y2_COLOR,
                    strokeWidth: 2,
                    strokeDasharray: "5 4",
                  }}
                  lineType="joint"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  yAxisId="right"
                />
              );
            })
          : null}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Scatter cloud — raw runs only, numeric or categorical X
// ---------------------------------------------------------------------------

export function ScatterCloud(props: ChartProps) {
  const { series, xAxisLabel, yAxisLabel, colorOf, compact } = props;
  if (series.count === 0) return emptyState("Aucun point exploitable.");

  const jitterAmp = series.xIsNumeric
    ? (() => {
        const nums = series.xLevels.map(Number);
        const gaps = nums.slice(1).map((v, i) => v - nums[i]).filter((g) => g > 0);
        const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;
        return series.xLevels.length <= 12 ? minGap * 0.16 : 0;
      })()
    : 0.16;
  const fz = axisFont(compact);
  const yDomain = meanCenteredYDomain(series);

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ScatterChart
        margin={{ bottom: compact ? 12 : 28, left: 8, right: 14, top: 8 }}
      >
        <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
        <XAxis
          dataKey="x"
          domain={
            series.xIsNumeric
              ? ["auto", "auto"]
              : [-0.5, series.xLevels.length - 0.5]
          }
          label={
            compact
              ? undefined
              : {
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -12,
                  fill: "#475569",
                  fontSize: 12,
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) =>
            series.xIsNumeric ? formatNumber(v) : series.xLevels[v] ?? ""
          }
          ticks={
            series.xIsNumeric
              ? series.xLevels.length <= 10
                ? series.xLevels.map(Number)
                : undefined
              : series.xLevels.map((_, i) => i)
          }
          type="number"
        />
        <YAxis
          allowDataOverflow
          dataKey="y"
          domain={yDomain}
          label={
            compact
              ? undefined
              : {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                  style: { textAnchor: "middle" },
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) => formatNumber(v)}
          type="number"
          width={compact ? 40 : 64}
        />
        <ZAxis range={[compact ? 16 : 40, compact ? 16 : 40]} />
        <Tooltip
          content={<PointTooltip {...props} />}
          cursor={{ strokeDasharray: "3 3" }}
        />
        {series.groups.map((group) => {
          const color = colorOf(group);
          const data = series.raw
            .filter((d) => d.group === group)
            .map((d) => ({
              x: d.xValue + deterministicJitter(d.point.id, jitterAmp),
              y: d.y,
              xLabel: d.xLabel,
              group,
              point: d.point,
            }));
          return (
            <Scatter
              key={group}
              data={data}
              fill={color}
              fillOpacity={0.5}
              isAnimationActive={false}
            />
          );
        })}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Bars — mean per level with ±std error bars, grouped by color
// ---------------------------------------------------------------------------

export function BarsChart(props: ChartProps) {
  const { series, xAxisLabel, yAxisLabel, colorOf, compact, colorFactor } =
    props;
  if (series.count === 0) return emptyState("Aucun point exploitable.");

  const data = series.xLevels
    .map((level) => {
      const row: Record<string, number | string> = { level };
      let has = false;
      for (const group of series.groups) {
        const stat = series.statsByGroup
          .get(group)
          ?.find((s) => s.xLabel === level);
        if (stat) {
          row[group] = stat.mean;
          row[`${group}__err`] = stat.std;
          has = true;
        }
      }
      return has ? row : null;
    })
    .filter((r): r is Record<string, number | string> => r !== null);

  const fz = axisFont(compact);

  return (
    <ResponsiveContainer height="100%" width="100%">
      <BarChart
        barGap={2}
        data={data}
        margin={{ bottom: compact ? 12 : 28, left: 8, right: 14, top: 8 }}
      >
        <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="level"
          interval={0}
          label={
            compact
              ? undefined
              : {
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -12,
                  fill: "#475569",
                  fontSize: 12,
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
        />
        <YAxis
          label={
            compact
              ? undefined
              : {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                  style: { textAnchor: "middle" },
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) => formatNumber(v)}
          width={compact ? 40 : 64}
        />
        <Tooltip
          cursor={{ fill: "rgba(148,163,184,0.12)" }}
          formatter={(value: number, name: string) => [
            formatNumber(value),
            groupLabel(colorFactor, name),
          ]}
          labelStyle={{ fontSize: 12 }}
        />
        {series.groups.map((group) => (
          <Bar
            dataKey={group}
            fill={colorOf(group)}
            isAnimationActive={false}
            key={group}
            maxBarSize={64}
            radius={[2, 2, 0, 0]}
          >
            <ErrorBar
              dataKey={`${group}__err`}
              direction="y"
              stroke="#334155"
              strokeWidth={1}
              width={compact ? 2 : 4}
            />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Box plot — median / quartiles / min-max per level, via a Customized layer
// ---------------------------------------------------------------------------

export function BoxPlotChart(props: ChartProps) {
  const { series, xAxisLabel, yAxisLabel, colorOf, compact } = props;
  if (series.count === 0) return emptyState("Aucun point exploitable.");

  const pad = (series.yMax - series.yMin) * 0.08 || 1;
  const domain: [number, number] = [
    Math.min(0, series.yMin - pad),
    series.yMax + pad,
  ];
  const data = series.xLevels.map((level) => ({ level }));
  const fz = axisFont(compact);

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ComposedChart
        data={data}
        margin={{ bottom: compact ? 12 : 28, left: 8, right: 14, top: 8 }}
      >
        <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="level"
          interval={0}
          label={
            compact
              ? undefined
              : {
                  value: xAxisLabel,
                  position: "insideBottom",
                  offset: -12,
                  fill: "#475569",
                  fontSize: 12,
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
        />
        <YAxis
          domain={domain}
          label={
            compact
              ? undefined
              : {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#475569",
                  fontSize: 12,
                  style: { textAnchor: "middle" },
                }
          }
          stroke="#64748b"
          tick={{ fontSize: fz, fill: "#475569" }}
          tickFormatter={(v: number) => formatNumber(v)}
          width={compact ? 40 : 64}
        />
        <Customized
          component={(cprops: any) => (
            <BoxLayer
              chart={cprops}
              colorOf={colorOf}
              compact={compact}
              series={series}
            />
          )}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function BoxLayer({
  chart,
  series,
  colorOf,
  compact,
}: {
  chart: any;
  series: ExplorerSeries;
  colorOf: (group: string) => string;
  compact?: boolean;
}) {
  const xAxis = chart.xAxisMap?.[Object.keys(chart.xAxisMap)[0]];
  const yAxis = chart.yAxisMap?.[Object.keys(chart.yAxisMap)[0]];
  const offset = chart.offset;
  if (!xAxis || !yAxis || !offset) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  // Real spacing between categories (the point scale puts the first/last level
  // on the plot edges, so we also clamp clusters back inside the plot area).
  const spacing =
    series.xLevels.length > 1
      ? Math.abs(xScale(series.xLevels[1]) - xScale(series.xLevels[0]))
      : offset.width;
  const band = Math.min(spacing * 0.86, offset.width * 0.9);
  const groupW = band / Math.max(1, series.groups.length);
  const boxW = Math.min(groupW * 0.74, compact ? 18 : 46);

  const nodes: JSX.Element[] = [];
  series.xLevels.forEach((level) => {
    const rawCenter = xScale(level);
    if (rawCenter === undefined) return;
    const center = Math.max(
      offset.left + band / 2,
      Math.min(offset.left + offset.width - band / 2, rawCenter),
    );
    series.groups.forEach((group, gi) => {
      const stat = series.statsByGroup.get(group)?.find((s) => s.xLabel === level);
      if (!stat) return;
      const cx = center - band / 2 + groupW * (gi + 0.5);
      const color = colorOf(group);
      const yMax = yScale(stat.max);
      const yQ3 = yScale(stat.q3);
      const yMed = yScale(stat.median);
      const yQ1 = yScale(stat.q1);
      const yMin = yScale(stat.min);
      const key = `${level}-${group}`;
      nodes.push(
        <g key={key}>
          <title>
            {`${level}${group !== "__all__" ? ` · ${group}` : ""}\nn=${stat.n}  méd=${formatNumber(
              stat.median,
            )}\nq1=${formatNumber(stat.q1)}  q3=${formatNumber(
              stat.q3,
            )}\nmin=${formatNumber(stat.min)}  max=${formatNumber(stat.max)}`}
          </title>
          {/* whiskers */}
          <line stroke={color} strokeWidth={1} x1={cx} x2={cx} y1={yMax} y2={yQ3} />
          <line stroke={color} strokeWidth={1} x1={cx} x2={cx} y1={yQ1} y2={yMin} />
          <line
            stroke={color}
            strokeWidth={1}
            x1={cx - boxW / 4}
            x2={cx + boxW / 4}
            y1={yMax}
            y2={yMax}
          />
          <line
            stroke={color}
            strokeWidth={1}
            x1={cx - boxW / 4}
            x2={cx + boxW / 4}
            y1={yMin}
            y2={yMin}
          />
          {/* box */}
          <rect
            fill={color}
            fillOpacity={0.28}
            height={Math.max(1, yQ1 - yQ3)}
            stroke={color}
            strokeWidth={1.25}
            width={boxW}
            x={cx - boxW / 2}
            y={yQ3}
          />
          {/* median */}
          <line
            stroke={color}
            strokeWidth={2}
            x1={cx - boxW / 2}
            x2={cx + boxW / 2}
            y1={yMed}
            y2={yMed}
          />
        </g>,
      );
    });
  });
  return <g>{nodes}</g>;
}

// ---------------------------------------------------------------------------
// Shared tooltip for scatter-based charts
// ---------------------------------------------------------------------------

function PointTooltip({
  active,
  payload,
  xAxisLabel,
  yAxisLabel,
  colorFactor,
}: ChartProps & {
  active?: boolean;
  payload?: Array<{ payload: any }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0].payload;
  const isMean = Boolean(entry.stat);
  return (
    <div className="rounded-md border border-line bg-white p-2 text-xs shadow-md">
      <div className="font-semibold text-ink">
        {isMean ? `Moyenne (n = ${entry.stat.n})` : `Run ${entry.point?.id ?? ""}`}
      </div>
      <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-slate-600">
        <span>{xAxisLabel}</span>
        <span className="text-right font-semibold">{entry.xLabel}</span>
        <span>{yAxisLabel}</span>
        <span className="text-right font-semibold">{formatNumber(entry.y)}</span>
        {colorFactor ? (
          <>
            <span>{colorFactor.label}</span>
            <span className="text-right">{entry.group}</span>
          </>
        ) : null}
      </div>
      {!isMean && entry.point ? (
        <div className="mt-1 max-h-28 overflow-auto border-t border-line pt-1 text-[11px] text-slate-500">
          {Object.entries(entry.point.factors).map(([k, v]) => (
            <div key={k}>
              <span className="font-medium text-slate-600">{k}</span>:{" "}
              {String(v)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Means heatmap — X levels (rows) × color levels (cols), cell = mean(Y)
// ---------------------------------------------------------------------------

export function MeansHeatmap({
  series,
  colorFactor,
  yAxisLabel,
}: {
  series: ExplorerSeries;
  colorFactor: FactorDef | null;
  yAxisLabel: string;
}) {
  if (series.count === 0) return emptyState("Aucun point exploitable.");

  const cell = (group: string, level: string): LevelStat | undefined =>
    series.statsByGroup.get(group)?.find((s) => s.xLabel === level);

  let lo = Infinity;
  let hi = -Infinity;
  for (const group of series.groups) {
    for (const level of series.xLevels) {
      const stat = cell(group, level);
      if (stat) {
        lo = Math.min(lo, stat.mean);
        hi = Math.max(hi, stat.mean);
      }
    }
  }
  if (!Number.isFinite(lo)) return emptyState("Aucun point exploitable.");

  const bg = (value: number) => {
    const t = hi > lo ? (value - lo) / (hi - lo) : 0.5;
    // light → teal ramp
    const r = Math.round(240 - t * (240 - 15));
    const g = Math.round(249 - t * (249 - 118));
    const b = Math.round(244 - t * (244 - 110));
    return `rgb(${r}, ${g}, ${b})`;
  };
  const fg = (value: number) => {
    const t = hi > lo ? (value - lo) / (hi - lo) : 0.5;
    return t > 0.6 ? "#ffffff" : "#0f172a";
  };

  return (
    <div className="overflow-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white p-1.5 text-left text-[11px] font-semibold text-slate-500">
              {yAxisLabel}
            </th>
            {series.groups.map((group) => (
              <th
                className="p-1.5 text-center text-[11px] font-semibold text-slate-600"
                key={group}
              >
                {group === "__all__" ? "Moyenne" : group}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.xLevels.map((level) => (
            <tr key={level}>
              <td className="sticky left-0 bg-white p-1.5 font-medium text-slate-700">
                {level}
              </td>
              {series.groups.map((group) => {
                const stat = cell(group, level);
                return (
                  <td
                    className="p-1.5 text-center tabular-nums"
                    key={group}
                    style={
                      stat
                        ? { backgroundColor: bg(stat.mean), color: fg(stat.mean) }
                        : undefined
                    }
                    title={
                      stat
                        ? `n=${stat.n}, moyenne=${formatNumber(stat.mean)}`
                        : "—"
                    }
                  >
                    {stat ? formatNumber(stat.mean) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
