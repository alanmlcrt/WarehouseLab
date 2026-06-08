import { useEffect, useMemo, useState } from "react";
import {
  RACK_FILL_SENTINEL,
  type FactorValue,
  type LabPlan,
} from "../../experiments/labKit";
import {
  buildWarehouse,
  RACK_COLUMNS_PER_ELEVATOR_AISLE,
} from "../../simulation/core/warehouseFactory";
import { cloneConfig } from "../../simulation/scenarios/presets";
import type { Cell, GridPosition, SimulationConfig } from "../../simulation/models/types";
import { useSimulationStore } from "../../store/simulationStore";
import { createSeededRandom } from "../../utils/random";
import { normalizeCustomStationPositions } from "../panels/ParameterPanel";

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

  useEffect(() => {
    if (!draft && snapshot) {
      setDraft(cloneConfig(snapshot.config));
    }
  }, [draft, snapshot]);

  const preview = useMemo(() => (draft ? buildPreviewWarehouse(draft) : null), [draft]);
  const selectedStations = draft && preview && draft.warehouse.customPickingStations !== undefined
    ? draft.warehouse.customPickingStations
    : preview?.pickingStations.map((station) => station.accessPosition) ?? [];
  const elevatorAisleCount = preview?.elevatorZones.length ?? 0;

  if (!snapshot || !draft || !preview) {
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
    onPlanChange(syncPlanWithWarehouse(plan, nextConfig));
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-3">
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-lg border border-line bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="text-base font-semibold text-ink">Plan 2D</div>
            <div className="text-xs text-slate-500">
              {draft.warehouse.width} x {draft.warehouse.height} cellules · {preview.racks.length} racks · {selectedStations.length} stations
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            <LegendSwatch className="bg-slate-50" label="Libre" />
            <LegendSwatch className="bg-slate-800" label="Rack" />
            <LegendSwatch className="bg-sky-100" label="Rail" />
            <LegendSwatch className="bg-emerald-500" label="Station" />
            <LegendSwatch className="bg-amber-200" label="Charge" />
            <LegendSwatch className="bg-cyan-200" label="Ascenseur" />
          </div>
        </header>

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
          <div className="grid grid-cols-2 gap-2">
            <NumberBox label="Largeur" min={10} max={42} value={draft.warehouse.width} onChange={(width) => setWarehouse({ width })} />
            <NumberBox label="Longueur" min={8} max={32} value={draft.warehouse.height} onChange={(height) => setWarehouse({ height })} />
            <NumberBox label="Etages" min={1} max={10} value={draft.warehouse.levelCount} onChange={(levelCount) => setWarehouse({ levelCount })} />
            <NumberBox label="Stations" min={1} max={12} value={draft.warehouse.pickingStationCount} onChange={(pickingStationCount) => setWarehouse({ pickingStationCount })} />
            <NumberBox label="Passages transv." min={0} max={8} value={draft.warehouse.crossAisleSpacing} onChange={(crossAisleSpacing) => setWarehouse({ crossAisleSpacing })} />
            <NumberBox label="Chargeurs" min={1} max={30} value={draft.warehouse.chargingStationCount} onChange={(chargingStationCount) => setWarehouse({ chargingStationCount })} />
          </div>
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

function syncPlanWithWarehouse(plan: LabPlan, config: SimulationConfig): LabPlan {
  const values = new Map<string, FactorValue[]>([
    ["warehouseSize", ["custom"]],
    ["levelCount", [config.warehouse.levelCount]],
    ["crossAisleSpacing", [config.warehouse.crossAisleSpacing]],
    ["pickingStationCount", [config.warehouse.pickingStationCount]],
    ["chargingStationCount", [config.warehouse.chargingStationCount]],
  ]);
  return {
    ...plan,
    factorRoles: {
      ...plan.factorRoles,
      warehouseSize: "context",
      levelCount: "context",
      crossAisleSpacing: "context",
      pickingStationCount: "context",
      chargingStationCount: "context",
    },
    bindings: plan.bindings.map((binding) =>
      values.has(binding.factorId)
        ? { ...binding, values: values.get(binding.factorId) ?? binding.values }
        : binding,
    ),
  };
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
