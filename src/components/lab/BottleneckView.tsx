import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BOTTLENECK_LABELS,
  BOTTLENECK_LINKS,
  type BottleneckLink,
  classifyBottleneck,
  getFactorById,
  getValueFromPoint,
  type RunPoint,
} from "../../experiments/labKit";
import { mean } from "../../experiments/labStats";
import { getVaryingFactors } from "./analysis";
import { distinctValues, sortLevels } from "./explorer/explorerModel";

/** Each link of the throughput chain gets one stable color, reused by the bars,
 *  the dominant-bottleneck chips and the legend. */
const LINK_COLORS: Record<BottleneckLink, string> = {
  station: "#2563eb",
  elevator: "#9333ea",
  charger: "#f59e0b",
  floor: "#dc2626",
  fleet: "#0f766e",
  demande: "#64748b",
};

/** Map a chain link to the utilization metric that measures it. */
const LINK_METRIC: Record<(typeof BOTTLENECK_LINKS)[number], string> = {
  station: "stationUtilization",
  elevator: "elevatorUtilization",
  charger: "chargerUtilization",
  floor: "floorCongestion",
  fleet: "fleetUtilization",
};

const THROUGHPUT_METRIC = "steadyThroughputPerMinute";
/** A link this busy is effectively the wall — drawn as a dashed reference line. */
const SATURATION_THRESHOLD = 0.9;

interface XRow {
  x: string;
  station: number;
  elevator: number;
  charger: number;
  floor: number;
  fleet: number;
  throughput: number;
  dominant: BottleneckLink;
}

interface BottleneckViewProps {
  points: RunPoint[];
}

export function BottleneckView({ points }: BottleneckViewProps) {
  const varying = useMemo(() => getVaryingFactors(points), [points]);

  // Default X: the robot count if it varies, else the first numeric factor, else
  // the first varying factor. The bottleneck story is clearest along fleet size.
  const numericVarying = varying.filter((factor) => factor.type !== "enum");
  const defaultX =
    varying.find((factor) => factor.id === "robotCount")?.id ??
    numericVarying[0]?.id ??
    varying[0]?.id ??
    "";

  const [xId, setXId] = useState(defaultX);
  const [groupValue, setGroupValue] = useState<string>("");
  const [showHelp, setShowHelp] = useState(false);

  const activeX = varying.some((f) => f.id === xId) ? xId : defaultX;
  // Secondary dimension: the other varying factor (e.g. pickingStationCount). We
  // slice the data to one of its values so each X has a single, unambiguous bar
  // cluster — averaging across it would blur which link is actually binding.
  const groupFactor = varying.find((factor) => factor.id !== activeX) ?? null;
  const groupLevels = useMemo(
    () =>
      groupFactor
        ? sortLevels(
            distinctValues(points, groupFactor.id),
            groupFactor.type !== "enum",
            groupFactor.options,
          )
        : [],
    [points, groupFactor],
  );

  const activeGroup =
    groupFactor && groupLevels.includes(groupValue)
      ? groupValue
      : groupLevels[0] ?? "";

  useEffect(() => {
    if (xId !== activeX) setXId(activeX);
    if (groupFactor && groupValue !== activeGroup) setGroupValue(activeGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeX, activeGroup]);

  const xFactor = getFactorById(activeX) ?? null;

  const rows = useMemo<XRow[]>(() => {
    if (!xFactor) return [];
    const xIsNumeric = xFactor.type !== "enum";
    const subset = groupFactor
      ? points.filter((p) => String(p.factors[groupFactor.id]) === activeGroup)
      : points;

    const xLevels = sortLevels(
      distinctValues(subset, xFactor.id),
      xIsNumeric,
      xFactor.options,
    );

    return xLevels
      .map((level) => {
        const atLevel = subset.filter(
          (p) => String(p.factors[xFactor.id]) === level,
        );
        if (atLevel.length === 0) return null;

        const meanMetric = (id: string): number =>
          mean(
            atLevel
              .map((p) => getValueFromPoint(p, id, "metric"))
              .filter((v): v is number => v !== undefined && Number.isFinite(v)),
          );

        const aggregated: Record<string, number> = {
          stationUtilization: meanMetric("stationUtilization"),
          elevatorUtilization: meanMetric("elevatorUtilization"),
          chargerUtilization: meanMetric("chargerUtilization"),
          floorCongestion: meanMetric("floorCongestion"),
          fleetUtilization: meanMetric("fleetUtilization"),
        };
        const feasibility = meanMetric("feasibilityMargin");
        const { link } = classifyBottleneck(aggregated, feasibility);

        return {
          x: level,
          station: aggregated.stationUtilization,
          elevator: aggregated.elevatorUtilization,
          charger: aggregated.chargerUtilization,
          floor: aggregated.floorCongestion,
          fleet: aggregated.fleetUtilization,
          throughput: meanMetric(THROUGHPUT_METRIC),
          dominant: link,
        } satisfies XRow;
      })
      .filter((row): row is XRow => row !== null);
  }, [points, xFactor, groupFactor, activeGroup]);

  if (points.length === 0) {
    return <Centered>Lance une expérience pour analyser les goulots.</Centered>;
  }
  if (!xFactor || rows.length === 0) {
    return (
      <Centered>
        Fais varier au moins un paramètre (idéalement le nombre de robots) puis
        relance.
      </Centered>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      {/* Controls */}
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
        {groupFactor && groupLevels.length > 0 ? (
          <Field label={groupFactor.label}>
            <div className="flex flex-wrap gap-1">
              {groupLevels.map((level) => {
                const active = level === activeGroup;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setGroupValue(level)}
                    className={`h-9 rounded border px-3 text-sm font-medium ${
                      active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}
        <div className="ml-auto self-start">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-sm font-semibold text-slate-500 hover:bg-slate-50"
            title="Comment lire ce graphe ?"
            aria-label="Aide"
          >
            ?
          </button>
        </div>
        {showHelp ? (
          <div className="w-full rounded-md border border-line bg-slate-50 p-3 text-sm text-slate-600">
            Chaque barre = l'<strong>utilisation</strong> (0–100 %) d'un maillon de
            la chaîne de débit à ce point. <strong>Le maillon le plus haut</strong>{" "}
            (mis en relief) est la <strong>contrainte qui plafonne le débit</strong>{" "}
            : c'est lui qu'il faut desserrer. Au-delà de la ligne pointillée
            (~90 %) le maillon est saturé. Un point marqué{" "}
            <em>« Demande »</em> signifie que le système suit la demande — ajouter
            des ressources ne sert à rien. La courbe grise relie l'attribution au{" "}
            <strong>débit</strong> réel.
          </div>
        ) : null}
      </div>

      {/* Chart */}
      <div className="min-h-0 rounded-lg border border-line bg-white p-3 shadow-sm">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 56, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 12 }}
              label={{
                value: xFactor.label,
                position: "insideBottom",
                offset: -12,
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="util"
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 12 }}
              label={{
                value: "Utilisation",
                angle: -90,
                position: "insideLeft",
                fontSize: 12,
              }}
            />
            <YAxis
              yAxisId="thr"
              orientation="right"
              tick={{ fontSize: 12 }}
              label={{
                value: "Débit (caisses/min)",
                angle: 90,
                position: "insideRight",
                fontSize: 12,
              }}
            />
            <Tooltip content={<BottleneckTooltip />} />
            <ReferenceLine
              yAxisId="util"
              y={SATURATION_THRESHOLD}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: "saturation", fontSize: 10, fill: "#94a3b8", position: "right" }}
            />
            {BOTTLENECK_LINKS.map((link) => (
              <Bar
                key={link}
                yAxisId="util"
                dataKey={link}
                name={BOTTLENECK_LABELS[link]}
                fill={LINK_COLORS[link]}
              >
                {rows.map((row) => (
                  <Cell
                    key={`${link}-${row.x}`}
                    fill={LINK_COLORS[link]}
                    fillOpacity={row.dominant === link ? 1 : 0.32}
                  />
                ))}
              </Bar>
            ))}
            <Line
              yAxisId="thr"
              type="monotone"
              dataKey="throughput"
              name="Débit"
              stroke="#0f172a"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Reading strip: dominant bottleneck per X level + legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-white p-3 text-sm shadow-sm">
        <span className="font-semibold text-slate-600">Goulot le long de X :</span>
        {rows.map((row) => (
          <span key={row.x} className="flex items-center gap-1">
            <span className="text-slate-500">{row.x}</span>
            <span
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: LINK_COLORS[row.dominant] }}
            >
              {BOTTLENECK_LABELS[row.dominant]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BottleneckTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; dataKey: string; payload: XRow }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as XRow | undefined;
  return (
    <div className="rounded border border-line bg-white p-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-slate-700">{label}</div>
      {BOTTLENECK_LINKS.map((link) => (
        <div key={link} className="flex items-center justify-between gap-3">
          <span style={{ color: LINK_COLORS[link] }}>{BOTTLENECK_LABELS[link]}</span>
          <span className="tabular-nums text-slate-600">
            {Math.round(((row?.[link] as number) ?? 0) * 100)}%
          </span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-line pt-1">
        <span className="text-slate-500">Débit</span>
        <span className="tabular-nums text-slate-700">
          {(row?.throughput ?? 0).toFixed(1)}
        </span>
      </div>
      {row ? (
        <div className="mt-1 text-[11px] font-semibold" style={{ color: LINK_COLORS[row.dominant] }}>
          Goulot : {BOTTLENECK_LABELS[row.dominant]}
        </div>
      ) : null}
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
