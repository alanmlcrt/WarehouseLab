import { useEffect, useMemo, useState } from "react";
import {
  RACK_FILL_SENTINEL,
  WAREHOUSE_SIZE_PRESETS,
  ensureRequiredFactorValues,
  type FactorValue,
  type LabPlan,
} from "../../experiments/labKit";
import {
  buildWarehouse,
  RACK_COLUMNS_PER_ELEVATOR_AISLE,
} from "../../simulation/core/warehouseFactory";
import { cloneConfig } from "../../simulation/scenarios/presets";
import { createEmptyMetrics } from "../../simulation/metrics/calculateMetrics";
import type {
  Cell,
  GridPosition,
  SimulationConfig,
  SimulationState,
  Warehouse,
} from "../../simulation/models/types";
import { useSimulationStore } from "../../store/simulationStore";
import { createSeededRandom } from "../../utils/random";
import { normalizeCustomStationPositions } from "../panels/ParameterPanel";
import { WarehouseScene } from "../scene/WarehouseScene";

interface Plan2DPageProps {
  plan: LabPlan;
  onPlanChange: (plan: LabPlan) => void;
}

export function Plan2DPage({ plan, onPlanChange }: Plan2DPageProps) {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const updateConfig = useSimulationStore((state) => state.updateConfig);
  const [draft, setDraft] = useState<SimulationConfig | null>(() =>
    snapshot ? cloneConfig(snapshot.config) : null,
  );
  const [view, setView] = useState<"2d" | "3d">("2d");

  useEffect(() => {
    if (!draft && snapshot) {
      setDraft(cloneConfig(snapshot.config));
    }
  }, [draft, snapshot]);

  // The lab plan (edited in the "Configurer" tab) is the source of truth for the
  // shared structural fields. Mirror them into the local draft so a change made
  // in Configurer shows up here — and our own edits (which write the plan) loop
  // back through here too, keeping a single source of truth.
  useEffect(() => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current.warehouse };
      let changed = false;
      const applyNumber = (key: "levelCount" | "crossAisleSpacing" | "pickingStationCount" | "chargingStationCount") => {
        const value = numPlan(plan, key);
        if (value !== undefined && next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      };
      applyNumber("levelCount");
      applyNumber("crossAisleSpacing");
      applyNumber("pickingStationCount");
      applyNumber("chargingStationCount");
      const preset = WAREHOUSE_SIZE_PRESETS[String(planValue(plan, "warehouseSize") ?? "")];
      if (preset && preset.width > 0) {
        if (next.width !== preset.width) {
          next.width = preset.width;
          changed = true;
        }
        if (next.height !== preset.height) {
          next.height = preset.height;
          changed = true;
        }
      }
      if (!changed) {
        return current;
      }
      next.customPickingStations = normalizeCustomStationPositions(
        next.customPickingStations,
        next.width,
        next.height,
        next.pickingStationCount,
      );
      return { ...current, warehouse: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const preview = useMemo(() => (draft ? buildPreviewWarehouse(draft) : null), [draft]);
  // Static snapshot fed to <WarehouseScene> for the 3D preview: the designed
  // warehouse with no robots/orders. The scene only reads warehouse/config/robots.
  const previewState = useMemo<SimulationState | null>(
    () => (draft && preview ? buildPreviewState(draft, preview) : null),
    [draft, preview],
  );
  const selectedStations = draft && preview && draft.warehouse.customPickingStations !== undefined
    ? draft.warehouse.customPickingStations
    : preview?.pickingStations.map((station) => station.accessPosition) ?? [];
  const elevatorAisleCount = preview?.elevatorZones.length ?? 0;

  if (!snapshot || !draft || !preview || !previewState) {
    return <Centered>Initialisation du plan.</Centered>;
  }

  const setWarehouse = (patch: Partial<SimulationConfig["warehouse"]>) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const nextWarehouse = {
        ...current.warehouse,
        ...patch,
      };
      nextWarehouse.customPickingStations = normalizeCustomStationPositions(
        nextWarehouse.customPickingStations,
        nextWarehouse.width,
        nextWarehouse.height,
        nextWarehouse.pickingStationCount,
      );
      return {
        ...current,
        warehouse: nextWarehouse,
      };
    });
  };

  const toggleStation = (position: GridPosition) => {
    const cell = preview.cells.find((candidate) => candidate.x === position.x && candidate.y === position.y);
    if (cell?.type === "elevator") {
      return;
    }
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const currentStations = current.warehouse.customPickingStations !== undefined
        ? current.warehouse.customPickingStations
        : selectedStations;
      const existing = currentStations.findIndex(
        (station) => station.x === position.x && station.y === position.y,
      );
      const nextStations =
        existing >= 0
          ? currentStations.filter((_, index) => index !== existing)
          : currentStations.length >= current.warehouse.pickingStationCount
            ? currentStations
            : [...currentStations, position];
      return {
        ...current,
        warehouse: {
          ...current.warehouse,
          customPickingStations: nextStations,
        },
      };
    });
  };

  // Write a single fixed value into the shared lab plan (and force the factor to
  // the "Fixé" role). This is what keeps the Plan tab and the Configurer tab in
  // lockstep: both edit the same plan bindings.
  const writePlanField = (factorId: string, value: FactorValue) => {
    onPlanChange(
      ensureRequiredFactorValues({
        ...plan,
        factorRoles: { ...plan.factorRoles, [factorId]: "context" },
        bindings: plan.bindings.map((binding) =>
          binding.factorId === factorId ? { ...binding, values: [value] } : binding,
        ),
      }),
    );
  };

  // Pick a predefined size: set the dimensions on the draft and record the preset
  // key in the plan. The mirror effect then keeps everything consistent.
  const selectSize = (key: string) => {
    const preset = WAREHOUSE_SIZE_PRESETS[key];
    if (preset && preset.width > 0) {
      setWarehouse({ width: preset.width, height: preset.height });
    }
    writePlanField("warehouseSize", key);
  };

  // Manual width/height edit → the size is no longer a named preset.
  const setSizeManual = (patch: Partial<Pick<SimulationConfig["warehouse"], "width" | "height">>) => {
    setWarehouse(patch);
    writePlanField("warehouseSize", "custom");
  };

  const applyWarehouse = () => {
    const stationCount = Math.max(1, selectedStations.length);
    const nextConfig = cloneConfig({
      ...draft,
      warehouse: {
        ...draft.warehouse,
        rackCount: RACK_FILL_SENTINEL,
        pickingStationCount: stationCount,
        customPickingStations: selectedStations,
      },
    });
    updateConfig(nextConfig);
    // The plan is already kept in sync live; just make sure the resolved station
    // count (which can come from the on-grid placement) is reflected.
    writePlanField("pickingStationCount", stationCount);
  };

  const sizeKey = String(planValue(plan, "warehouseSize") ?? "custom");

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-3">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-lg border border-line bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="text-base font-semibold text-ink">Plan</div>
            <div className="text-xs text-slate-500">
              {draft.warehouse.width} x {draft.warehouse.height} cellules · {preview.racks.length} racks · {selectedStations.length} stations
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {view === "2d" ? (
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                <LegendSwatch className="bg-slate-50" label="Libre" />
                <LegendSwatch className="bg-slate-800" label="Rack" />
                <LegendSwatch className="bg-sky-100" label="Rail" />
                <LegendSwatch className="bg-emerald-500" label="Station" />
                <LegendSwatch className="bg-amber-200" label="Charge" />
                <LegendSwatch className="bg-cyan-200" label="Ascenseur" />
              </div>
            ) : (
              <span className="text-[11px] text-slate-500">
                Aperçu 3D · glisser pour pivoter, molette pour zoomer
              </span>
            )}
            <div className="flex items-center rounded-md border border-line bg-slate-50 p-0.5">
              {(["2d", "3d"] as const).map((mode) => (
                <button
                  className={`rounded px-3 py-1 text-xs font-semibold uppercase ${
                    view === mode ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                  key={mode}
                  onClick={() => setView(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </header>

        {view === "2d" ? (
          <div className="min-h-0 overflow-auto bg-slate-100 p-4">
            <div
              className="mx-auto grid w-max gap-0.5 rounded-md border border-slate-300 bg-slate-300 p-1"
              style={{
                gridTemplateColumns: `repeat(${draft.warehouse.width}, minmax(18px, 28px))`,
              }}
            >
              {Array.from({ length: draft.warehouse.height }, (_, y) =>
                Array.from({ length: draft.warehouse.width }, (_, x) => {
                  const position = { x, y };
                  const cell = preview.cells.find(
                    (candidate) => candidate.x === x && candidate.y === y,
                  );
                  const stationIndex = selectedStations.findIndex(
                    (station) => station.x === x && station.y === y,
                  );
                  const selected = stationIndex >= 0;
                  const disabled = cell?.type === "elevator";
                  return (
                    <button
                      aria-label={`Cellule ${x},${y}`}
                      className={`flex aspect-square items-center justify-center rounded-[2px] text-[10px] font-bold tabular-nums transition-colors ${
                        selected ? "bg-emerald-500 text-white ring-2 ring-emerald-900/30" : cellClass(cell)
                      } ${disabled ? "cursor-not-allowed opacity-60" : "hover:ring-2 hover:ring-ink/30"}`}
                      disabled={disabled}
                      key={`${x}:${y}`}
                      onClick={() => toggleStation(position)}
                      title={`${x}, ${y}${disabled ? " - ascenseur" : ""}`}
                      type="button"
                    >
                      {selected ? stationIndex + 1 : cellGlyph(cell)}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 bg-[#eaf0f6]">
            <WarehouseScene snapshot={previewState} />
          </div>
        )}
      </section>

      <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
        <section className="rounded-lg border border-line bg-white p-3 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-ink">Dimensions</div>
          <div className="mb-3 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold uppercase tracking-[0.08em] text-cyan-700">
                Trame verrouillee
              </span>
              <span className="font-semibold tabular-nums text-ink">
                {RACK_COLUMNS_PER_ELEVATOR_AISLE} rangees / 1 couloir
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-cyan-800">
              <span>Couloirs ascenseur generes</span>
              <span className="font-semibold tabular-nums">{elevatorAisleCount}</span>
            </div>
          </div>
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Taille prédéfinie
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(WAREHOUSE_SIZE_PRESETS)
                .filter(([, preset]) => preset.width > 0)
                .map(([key, preset]) => (
                  <button
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                      sizeKey === key
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    key={key}
                    onClick={() => selectSize(key)}
                    title={`${preset.width} x ${preset.height}`}
                    type="button"
                  >
                    {key}
                  </button>
                ))}
              {sizeKey === "custom" ? (
                <span className="rounded-md border border-accent bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                  Custom {draft.warehouse.width}×{draft.warehouse.height}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberBox label="Largeur" min={10} max={42} value={draft.warehouse.width} onChange={(width) => setSizeManual({ width })} />
            <NumberBox label="Longueur" min={8} max={32} value={draft.warehouse.height} onChange={(height) => setSizeManual({ height })} />
            <NumberBox label="Etages" min={1} max={10} value={draft.warehouse.levelCount} onChange={(levelCount) => writePlanField("levelCount", levelCount)} />
            <NumberBox label="Stations" min={1} max={12} value={draft.warehouse.pickingStationCount} onChange={(pickingStationCount) => writePlanField("pickingStationCount", pickingStationCount)} />
            <NumberBox label="Passages transv." min={0} max={8} value={draft.warehouse.crossAisleSpacing} onChange={(crossAisleSpacing) => writePlanField("crossAisleSpacing", crossAisleSpacing)} />
            <NumberBox label="Chargeurs" min={1} max={30} value={draft.warehouse.chargingStationCount} onChange={(chargingStationCount) => writePlanField("chargingStationCount", chargingStationCount)} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Ces réglages sont partagés avec l'onglet <span className="font-medium text-slate-500">Configurer</span>.
          </p>
        </section>

        <section className="rounded-lg border border-line bg-white p-3 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-ink">Stockage</div>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Densite
            <input
              className="w-full accent-accent"
              max={1}
              min={0.1}
              onChange={(event) => setWarehouse({ storageDensity: Number(event.target.value) })}
              step={0.05}
              type="range"
              value={draft.warehouse.storageDensity}
            />
            <span className="text-sm font-semibold normal-case tracking-normal text-ink">
              {Math.round(draft.warehouse.storageDensity * 100)} %
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-line bg-white p-3 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-ink">Stations</div>
          <p className="text-xs leading-relaxed text-slate-500">
            Clique sur la grille pour placer les points de depot. Les robots y deposent les commandes.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedStations.map((station, index) => (
              <span
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                key={`${station.x}:${station.y}`}
              >
                S{index + 1}: {station.x},{station.y}
              </span>
            ))}
          </div>
        </section>

        <button
          className="h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={selectedStations.length !== draft.warehouse.pickingStationCount}
          onClick={applyWarehouse}
          type="button"
        >
          Appliquer cet entrepot
        </button>
      </aside>
    </div>
  );
}

function buildPreviewWarehouse(config: SimulationConfig) {
  return buildWarehouse(
    config,
    createSeededRandom(config.seeds.layoutSeed),
    createSeededRandom(config.seeds.stationSeed),
    createSeededRandom(config.seeds.skuCatalogSeed),
  );
}

/** A minimal, non-running SimulationState so the 3D scene can render the
 *  designed warehouse as a static plan preview (no robots, no orders). */
function buildPreviewState(
  config: SimulationConfig,
  warehouse: Warehouse,
): SimulationState {
  return {
    config,
    warehouse,
    robots: [],
    orders: [],
    completedOrders: [],
    tasks: [],
    tick: 0,
    elapsedSeconds: 0,
    isRunning: false,
    speed: 1,
    metrics: createEmptyMetrics(),
  };
}

/** First fixed value of a plan factor (the Plan tab represents one concrete
 *  layout, so it always reads/writes a single value). */
function planValue(plan: LabPlan, factorId: string): FactorValue | undefined {
  return plan.bindings.find((binding) => binding.factorId === factorId)?.values[0];
}

function numPlan(plan: LabPlan, factorId: string): number | undefined {
  const value = Number(planValue(plan, factorId));
  return Number.isFinite(value) ? value : undefined;
}

function NumberBox({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <input
        className="h-9 rounded-md border border-line bg-white px-2 text-right text-sm tabular-nums"
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.max(min, Math.min(max, Math.round(next))));
          }
        }}
        type="number"
        value={value}
      />
    </label>
  );
}

function cellClass(cell?: Cell): string {
  if (!cell) return "bg-slate-200 text-slate-400";
  switch (cell.type) {
    case "rack":
      return "bg-slate-800 text-slate-300";
    case "station":
      return "bg-emerald-100 text-emerald-800";
    case "charger":
      return "bg-amber-200 text-amber-900";
    case "elevator":
      return "bg-cyan-200 text-cyan-900";
    case "rail":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-slate-50 text-slate-300";
  }
}

function cellGlyph(cell?: Cell): string {
  if (!cell) return "";
  switch (cell.type) {
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

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-3 w-3 rounded-[2px] border border-slate-300 ${className}`} />
      {label}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {children}
    </div>
  );
}
