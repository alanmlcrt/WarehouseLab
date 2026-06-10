import { useMemo, useState } from "react";
import type {
  FactorValue,
  LabPhysicalCellKind,
  LabPhysicalSnapshot,
  RunPoint,
} from "../../experiments/labKit";
import { getFactorById } from "../../experiments/labKit";
import { formatNumber } from "./explorer/explorerModel";
import { PhysicalHeatmap3D, type HeatPlanCell } from "./PhysicalHeatmap3D";

interface PhysicalHeatmapPanelProps {
  points: RunPoint[];
}

type PhysicalMode = "traffic" | "wait";

const MODE_LABELS: Record<PhysicalMode, string> = {
  traffic: "Trafic",
  wait: "Attente",
};

/** Hard cap on side-by-side 3D canvases — each is its own WebGL context, and
 *  comparing more than a handful of plans at once stops being readable anyway. */
const MAX_PANELS = 6;

interface GeometryGroup {
  key: string;
  label: string;
  points: RunPoint[];
}

interface HeatPlan {
  /** Value shown as the panel title — a factor value, or null for the global mean. */
  value: FactorValue | null;
  runCount: number;
  width: number;
  height: number;
  levelCount: number;
  cells: HeatPlanCell[];
  max: number;
}

export function PhysicalHeatmapPanel({ points }: PhysicalHeatmapPanelProps) {
  const availablePoints = useMemo(
    () => points.filter((point) => point.physicalSnapshot),
    [points],
  );
  const [mode, setMode] = useState<PhysicalMode>("traffic");
  const [geometryKey, setGeometryKey] = useState("");
  const [compareFactor, setCompareFactor] = useState("");

  // Group by geometry first — cells only line up when the grid is identical, so
  // a mean is only meaningful within a single layout.
  const geometries = useMemo(
    () => groupByGeometry(availablePoints),
    [availablePoints],
  );
  const geometry =
    geometries.find((g) => g.key === geometryKey) ?? geometries[0];

  const variedFactors = useMemo(
    () => (geometry ? variedFactorsOf(geometry.points) : []),
    [geometry],
  );

  // The chosen factor still has to exist inside the current geometry.
  const activeFactor = variedFactors.some((f) => f.id === compareFactor)
    ? compareFactor
    : "";

  const plans = useMemo(
    () => (geometry ? buildPlans(geometry.points, mode, activeFactor) : []),
    [geometry, mode, activeFactor],
  );

  if (points.length === 0) {
    return <Centered>Lance un DOE pour générer un récap physique.</Centered>;
  }
  if (!geometry || plans.length === 0) {
    return (
      <Centered>
        Les résultats chargés ne contiennent pas encore de capture physique.
        Relance une campagne Lab pour produire cette vue.
      </Centered>
    );
  }

  // Shared scale so colours and bar heights are comparable between panels.
  const sharedMax = plans.reduce((m, plan) => Math.max(m, plan.max), 0);
  const shownPlans = plans.slice(0, MAX_PANELS);
  const truncated = plans.length - shownPlans.length;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Paramètre
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

        {geometries.length > 1 ? (
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Géométrie
            </span>
            <select
              className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
              onChange={(event) => setGeometryKey(event.target.value)}
              value={geometry.key}
            >
              {geometries.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} · {g.points.length} runs
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex min-w-[200px] flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Comparer par
          </span>
          <select
            className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
            onChange={(event) => setCompareFactor(event.target.value)}
            value={activeFactor}
          >
            <option value="">— moyenne globale —</option>
            {variedFactors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.label}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto grid grid-cols-4 gap-2">
          <Stat label="Plan" value={`${geometry.points[0].physicalSnapshot!.width}x${geometry.points[0].physicalSnapshot!.height}`} />
          <Stat label="Étages" value={Math.max(...shownPlans.map((plan) => plan.levelCount)).toString()} />
          <Stat label="Runs moyennés" value={geometry.points.length.toString()} />
          <Stat label={`Max ${MODE_LABELS[mode].toLowerCase()}`} value={formatNumber(sharedMax)} />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_190px] gap-3">
        <div
          className="grid min-h-0 gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(shownPlans.length, 2)}, minmax(0, 1fr))`,
          }}
        >
          {shownPlans.map((plan, index) => (
            <div
              className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-slate-100 shadow-inner"
              key={plan.value === null ? "all" : `${plan.value}`}
            >
              <div className="flex items-baseline justify-between border-b border-line bg-white px-3 py-2">
                <span className="text-sm font-semibold text-ink">
                  {plan.value === null
                    ? "Moyenne globale"
                    : `${getFactorById(activeFactor)?.label ?? activeFactor} = ${plan.value}`}
                </span>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {plan.runCount} runs · max {formatNumber(plan.max)}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <PhysicalHeatmap3D
                  cells={plan.cells}
                  height={plan.height}
                  key={`${mode}:${index}`}
                  levelCount={plan.levelCount}
                  maxValue={sharedMax}
                  width={plan.width}
                />
              </div>
            </div>
          ))}
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
          <div className="rounded-md border border-line bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Lecture
            </div>
            <p className="mt-2 leading-relaxed">
              Étages empilés (niveau 0 en bas), reliés par les cages d'ascenseur.
              Chaque dalle colore le
              {mode === "traffic" ? " passage cumulé" : " temps d'attente cumulé"}
              {" "}moyen par cellule, sur les runs de cette géométrie. Fais pivoter
              avec la souris.
            </p>
          </div>

          <div className="rounded-md border border-line bg-white p-3 shadow-sm">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Échelle
            </div>
            <div className="h-3 rounded-sm bg-gradient-to-r from-[#fef3c7] via-[#f59e0b] to-[#7f1d1d]" />
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-500">
              <span>0</span>
              <span>{formatNumber(sharedMax)}</span>
            </div>
          </div>

          <Legend />

          {truncated > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
              {truncated} valeur{truncated > 1 ? "s" : ""} de plus non affichée
              {truncated > 1 ? "s" : ""} ({plans.length} au total). Choisis un
              facteur à plus faible cardinalité pour tout comparer.
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function geometrySignature(snapshot: LabPhysicalSnapshot): string {
  // Only group on what keeps cells aligned and is set by a real factor: the grid
  // dimensions and the picking-station count. Rack/charger/elevator counts wobble
  // by a unit or two with the layout RNG seed — folding them in would fragment a
  // single warehouse into spurious groups and scatter the runs we want to average.
  return `${snapshot.width}x${snapshot.height}·${snapshot.stationCount}s`;
}

function groupByGeometry(points: RunPoint[]): GeometryGroup[] {
  const groups = new Map<string, RunPoint[]>();
  for (const point of points) {
    const snapshot = point.physicalSnapshot;
    if (!snapshot) continue;
    const key = geometrySignature(snapshot);
    const bucket = groups.get(key) ?? [];
    bucket.push(point);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, bucket]) => {
      const s = bucket[0].physicalSnapshot!;
      return {
        key,
        label: `${s.width}×${s.height} · ${s.stationCount} stations`,
        points: bucket,
      };
    })
    .sort((a, b) => b.points.length - a.points.length);
}

interface VariedFactor {
  id: string;
  label: string;
}

function variedFactorsOf(points: RunPoint[]): VariedFactor[] {
  const values = new Map<string, Set<string>>();
  for (const point of points) {
    for (const [id, value] of Object.entries(point.factors)) {
      const set = values.get(id) ?? new Set<string>();
      set.add(String(value));
      values.set(id, set);
    }
  }
  return [...values.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([id]) => ({ id, label: getFactorById(id)?.label ?? id }));
}

function buildPlans(
  points: RunPoint[],
  mode: PhysicalMode,
  factorId: string,
): HeatPlan[] {
  if (!factorId) {
    const plan = averagePlan(points, mode, null);
    return plan ? [plan] : [];
  }
  const byValue = new Map<string, RunPoint[]>();
  for (const point of points) {
    const value = String(point.factors[factorId]);
    const bucket = byValue.get(value) ?? [];
    bucket.push(point);
    byValue.set(value, bucket);
  }
  return [...byValue.entries()]
    .sort((a, b) => compareValues(a[0], b[0]))
    .map(([, bucket]) => averagePlan(bucket, mode, bucket[0].factors[factorId]))
    .filter((plan): plan is HeatPlan => plan !== null);
}

function averagePlan(
  points: RunPoint[],
  mode: PhysicalMode,
  value: FactorValue | null,
): HeatPlan | null {
  const acc = new Map<
    string,
    { x: number; y: number; level: number; type: LabPhysicalCellKind; sum: number; n: number }
  >();
  let width = 0;
  let height = 0;
  let levelCount = 1;
  let runCount = 0;
  for (const point of points) {
    const snapshot = point.physicalSnapshot;
    if (!snapshot) continue;
    width = snapshot.width;
    height = snapshot.height;
    levelCount = Math.max(levelCount, snapshot.levelCount ?? 1);
    runCount += 1;
    for (const cell of snapshot.cells) {
      const level = cell.level ?? 0;
      levelCount = Math.max(levelCount, level + 1);
      const key = `${cell.x}:${cell.y}:${level}`;
      const v = mode === "traffic" ? cell.traffic : cell.wait;
      const entry =
        acc.get(key) ?? { x: cell.x, y: cell.y, level, type: cell.type, sum: 0, n: 0 };
      entry.sum += v;
      entry.n += 1;
      entry.type = cell.type;
      acc.set(key, entry);
    }
  }
  if (runCount === 0) return null;
  const cells: HeatPlanCell[] = [...acc.values()].map((entry) => ({
    x: entry.x,
    y: entry.y,
    level: entry.level,
    type: entry.type,
    value: entry.n > 0 ? entry.sum / entry.n : 0,
  }));
  const max = cells.reduce((m, cell) => Math.max(m, cell.value), 0);
  return { value, runCount, width, height, levelCount, cells, max };
}

function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Bits of chrome
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[88px] rounded border border-line bg-slate-50 px-2 py-1.5">
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
        <LegendItem color="#334155" label="Rack" />
        <LegendItem color="#10b981" label="Station" />
        <LegendItem color="#fbbf24" label="Charge" />
        <LegendItem color="#38bdf8" label="Ascenseur" />
        <LegendItem color="#cbd5e1" label="Rail" />
        <LegendItem color="#e2e8f0" label="Libre" />
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}
