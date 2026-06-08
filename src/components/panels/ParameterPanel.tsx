import { useMemo, useState, type ReactNode } from "react";
import type {
  Cell,
  DemandProfile,
  GridPosition,
  PathfindingStrategy,
  SimulationConfig,
  StorageStrategy,
} from "../../simulation/models/types";
import {
  buildSeedsFromMaster,
  deriveBatteryWeightKg,
} from "../../simulation/core/derivedConfig";
import {
  getElevatorAisleCountForWidth,
  RACK_COLUMNS_PER_ELEVATOR_AISLE,
} from "../../simulation/core/warehouseFactory";
import { useSimulationStore } from "../../store/simulationStore";

const demandProfiles: DemandProfile[] = ["uniform", "abc", "pareto", "custom"];
const storageStrategies: StorageStrategy[] = [
  "randomStorage",
  "abcStorage",
  "balancedABCStorage",
  "familyStorage",
  "dynamicSlotting",
];
const pathfindingStrategies: PathfindingStrategy[] = [
  "manhattan",
  "astar",
  "dijkstra",
  "reservation",
];
const stationOrientations: Array<
  SimulationConfig["warehouse"]["pickingStationOrientation"]
> = ["length", "width"];
const stationOrientationLabels: Record<
  SimulationConfig["warehouse"]["pickingStationOrientation"],
  string
> = {
  length: "Longueur",
  width: "Largeur",
};

export function ParameterPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const updateConfig = useSimulationStore((state) => state.updateConfig);
  const [stationEditorOpen, setStationEditorOpen] = useState(false);

  if (!snapshot) {
    return <PanelFrame title="Paramètres">Initialisation</PanelFrame>;
  }

  const config = snapshot.config;
  const update = (nextConfig: SimulationConfig) => updateConfig(nextConfig);
  const updateStationCount = (pickingStationCount: number) =>
    update({
      ...config,
      warehouse: {
        ...config.warehouse,
        pickingStationCount,
        customPickingStations: normalizeCustomStationPositions(
          config.warehouse.customPickingStations,
          config.warehouse.width,
          config.warehouse.height,
          pickingStationCount,
        ),
      },
    });
  const updateMaxBattery = (maxBattery: number) =>
    update({
      ...config,
      robots: {
        ...config.robots,
        maxBattery,
        batteryWeightKg: deriveBatteryWeightKg(maxBattery),
      },
    });

  return (
    <PanelFrame title="Paramètres">
      <Section title="Entrepôt">
        <NumberField
          label="Largeur"
          max={40}
          min={10}
          value={config.warehouse.width}
          onChange={(width) =>
            update({
              ...config,
              warehouse: {
                ...config.warehouse,
                width,
                customPickingStations: normalizeCustomStationPositions(
                  config.warehouse.customPickingStations,
                  width,
                  config.warehouse.height,
                  config.warehouse.pickingStationCount,
                ),
              },
            })
          }
        />
        <NumberField
          label="Longueur"
          max={32}
          min={8}
          value={config.warehouse.height}
          onChange={(height) =>
            update({
              ...config,
              warehouse: {
                ...config.warehouse,
                height,
                customPickingStations: normalizeCustomStationPositions(
                  config.warehouse.customPickingStations,
                  config.warehouse.width,
                  height,
                  config.warehouse.pickingStationCount,
                ),
              },
            })
          }
        />
        <NumberField
          label="Étages"
          max={8}
          min={1}
          value={config.warehouse.levelCount}
          onChange={(levelCount) =>
            update({
              ...config,
              warehouse: { ...config.warehouse, levelCount },
            })
          }
        />
        <LockedLayoutField />
        <ReadOnlyField
          label="Couloirs ascenseur"
          value={getElevatorAisleCountForWidth(config.warehouse.width).toString()}
        />
        <NumberField
          label="Passages transverses"
          max={8}
          min={0}
          value={config.warehouse.crossAisleSpacing}
          onChange={(crossAisleSpacing) =>
            update({
              ...config,
              warehouse: { ...config.warehouse, crossAisleSpacing },
            })
          }
        />
        <NumberField
          label="Densité stockage"
          max={1}
          min={0.1}
          step={0.05}
          value={config.warehouse.storageDensity}
          onChange={(storageDensity) =>
            update({
              ...config,
              warehouse: { ...config.warehouse, storageDensity },
            })
          }
        />
        <ReadOnlyField
          label="Racks générés"
          value={snapshot.warehouse.racks.length.toString()}
        />
        <NumberField
          label="Stations"
          max={12}
          min={1}
          value={config.warehouse.pickingStationCount}
          onChange={updateStationCount}
        />
        <div className="grid grid-cols-[1fr_150px] items-center gap-3 text-sm">
          <span className="text-slate-600">Plan stations</span>
          <button
            className="h-9 rounded-md border border-line bg-slate-50 px-2 text-sm font-semibold text-ink hover:bg-white"
            onClick={() => setStationEditorOpen(true)}
            type="button"
          >
            Plan 2D
          </button>
        </div>
        <SelectField
          label="Orientation stations"
          value={config.warehouse.pickingStationOrientation}
          options={stationOrientations}
          formatOption={(option) => stationOrientationLabels[option]}
          onChange={(pickingStationOrientation) =>
            update({
              ...config,
              warehouse: { ...config.warehouse, pickingStationOrientation },
            })
          }
        />
      </Section>

      <Section title="Robots">
        <NumberField
          label="Nombre"
          max={30}
          min={1}
          value={config.robots.robotCount}
          onChange={(robotCount) =>
            update({
              ...config,
              robots: { ...config.robots, robotCount },
            })
          }
        />
        <NumberField
          label="Autonomie batterie"
          max={200}
          min={20}
          value={config.robots.maxBattery}
          onChange={updateMaxBattery}
        />
        <ReadOnlyField
          label="Poids batterie"
          value={`${config.robots.batteryWeightKg.toFixed(1)} kg`}
        />
        <NumberField
          label="Charge utile kg"
          max={60}
          min={1}
          value={config.robots.payloadKg}
          onChange={(payloadKg) =>
            update({
              ...config,
              robots: { ...config.robots, payloadKg },
            })
          }
        />
        <NumberField
          label="Panne"
          max={0.01}
          min={0}
          step={0.001}
          value={config.robots.failureProbability}
          onChange={(failureProbability) =>
            update({
              ...config,
              robots: { ...config.robots, failureProbability },
            })
          }
        />
      </Section>

      <Section title="Demande">
        <NumberField
          label="Commandes/min"
          max={80}
          min={1}
          value={config.demand.ordersPerMinute}
          onChange={(ordersPerMinute) =>
            update({
              ...config,
              demand: { ...config.demand, ordersPerMinute },
            })
          }
        />
        <SelectField
          label="Profil"
          value={config.demand.demandPattern}
          options={demandProfiles}
          onChange={(demandPattern) =>
            update({
              ...config,
              demand: { ...config.demand, demandPattern },
            })
          }
        />
      </Section>

      <Section title="Stockage">
        <SelectField
          label="Stratégie"
          value={config.storage.strategy}
          options={storageStrategies}
          onChange={(strategy) =>
            update({
              ...config,
              storage: { ...config.storage, strategy },
            })
          }
        />
        <NumberField
          label="SKU"
          max={100}
          min={8}
          value={config.storage.skuCount}
          onChange={(skuCount) =>
            update({
              ...config,
              storage: { ...config.storage, skuCount },
            })
          }
        />
      </Section>

      <Section title="Mouvement">
        <SelectField
          label="Pathfinding"
          value={config.movement.pathfindingStrategy}
          options={pathfindingStrategies}
          onChange={(pathfindingStrategy) =>
            update({
              ...config,
              movement: { ...config.movement, pathfindingStrategy },
            })
          }
        />
        <ToggleField
          label="Réservation temporelle"
          value={config.movement.temporalReservation}
          onChange={(temporalReservation) =>
            update({
              ...config,
              movement: { ...config.movement, temporalReservation },
            })
          }
        />
      </Section>

      <Section title="Seeds">
        <NumberField
          label="Seed principale"
          max={999999}
          min={1}
          value={config.seeds.layoutSeed}
          onChange={(masterSeed) =>
            update({
              ...config,
              seeds: buildSeedsFromMaster(masterSeed),
            })
          }
        />
      </Section>
      {stationEditorOpen ? (
        <StationPlacementModal
          cells={snapshot.warehouse.cells}
          config={config}
          currentStationPositions={snapshot.warehouse.pickingStations.map(
            (station) => station.accessPosition,
          )}
          onApply={(positions) => {
            update({
              ...config,
              warehouse: {
                ...config.warehouse,
                customPickingStations: positions,
                pickingStationCount: Math.max(1, positions.length),
              },
            });
            setStationEditorOpen(false);
          }}
          onAuto={() => {
            update({
              ...config,
              warehouse: {
                ...config.warehouse,
                customPickingStations: undefined,
              },
            });
            setStationEditorOpen(false);
          }}
          onClose={() => setStationEditorOpen(false)}
        />
      ) : null}
    </PanelFrame>
  );
}

export function StationPlacementModal({
  cells,
  config,
  currentStationPositions,
  onApply,
  onAuto,
  onClose,
}: {
  cells: Cell[];
  config: SimulationConfig;
  currentStationPositions: GridPosition[];
  onApply: (positions: GridPosition[]) => void;
  onAuto: () => void;
  onClose: () => void;
}) {
  const targetCount = config.warehouse.pickingStationCount;
  const cellByKey = useMemo(
    () => new Map(cells.map((cell) => [`${cell.x}:${cell.y}`, cell])),
    [cells],
  );
  const [draft, setDraft] = useState<GridPosition[]>(
    () =>
      (config.warehouse.customPickingStations?.length
        ? config.warehouse.customPickingStations
        : currentStationPositions
      ).slice(0, targetCount),
  );

  const selectedIndex = (position: GridPosition) =>
    draft.findIndex((entry) => entry.x === position.x && entry.y === position.y);

  const toggle = (position: GridPosition) => {
    const cell = cellByKey.get(`${position.x}:${position.y}`);
    if (cell?.type === "elevator") {
      return;
    }
    setDraft((current) => {
      const existing = current.findIndex(
        (entry) => entry.x === position.x && entry.y === position.y,
      );
      if (existing >= 0) {
        return current.filter((_, index) => index !== existing);
      }
      if (current.length >= targetCount) {
        return current;
      }
      return [...current, position];
    });
  };

  const rows = Array.from({ length: config.warehouse.height }, (_, y) => y);
  const cols = Array.from({ length: config.warehouse.width }, (_, x) => x);
  const complete = draft.length === targetCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6">
      <div className="grid max-h-[92vh] w-[min(980px,96vw)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-line bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-ink">Placement stations</div>
            <div className="text-xs text-slate-500">
              {draft.length} / {targetCount} stations
            </div>
          </div>
          <button
            className="rounded-md border border-line px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 overflow-auto bg-slate-100 p-4">
          <div
            className="mx-auto grid w-max gap-0.5 rounded-md border border-slate-300 bg-slate-300 p-1"
            style={{
              gridTemplateColumns: `repeat(${config.warehouse.width}, minmax(16px, 22px))`,
            }}
          >
            {rows.flatMap((y) =>
              cols.map((x) => {
                const position = { x, y };
                const cell = cellByKey.get(`${x}:${y}`);
                const index = selectedIndex(position);
                const selected = index >= 0;
                const disabled = cell?.type === "elevator";
                return (
                  <button
                    aria-label={`Cellule ${x},${y}`}
                    className={`flex aspect-square items-center justify-center rounded-[2px] text-[10px] font-bold tabular-nums transition-colors ${
                      selected
                        ? "bg-emerald-500 text-white ring-2 ring-emerald-900/30"
                        : cellClass(cell)
                    } ${disabled ? "cursor-not-allowed opacity-60" : "hover:ring-2 hover:ring-ink/30"}`}
                    disabled={disabled}
                    key={`${x}:${y}`}
                    onClick={() => toggle(position)}
                    title={`${x}, ${y}${disabled ? " - ascenseur" : ""}`}
                    type="button"
                  >
                    {selected ? index + 1 : cellGlyph(cell)}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            <LegendSwatch className="bg-slate-50" label="Libre" />
            <LegendSwatch className="bg-slate-800" label="Rack" />
            <LegendSwatch className="bg-sky-100" label="Rail" />
            <LegendSwatch className="bg-emerald-500" label="Station" />
            <LegendSwatch className="bg-amber-200" label="Charge" />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-md border border-line px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onAuto}
              type="button"
            >
              Auto
            </button>
            <button
              className="h-9 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!complete}
              onClick={() => onApply(draft)}
              type="button"
            >
              Appliquer
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function cellClass(cell?: Cell): string {
  if (!cell) {
    return "bg-slate-200 text-slate-400";
  }
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
  if (!cell) {
    return "";
  }
  switch (cell.type) {
    case "rack":
      return "R";
    case "station":
      return "S";
    case "charger":
      return "C";
    case "elevator":
      return "E";
    case "rail":
      return "";
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

export function normalizeCustomStationPositions(
  positions: GridPosition[] | undefined,
  width: number,
  height: number,
  count: number,
): GridPosition[] | undefined {
  const normalized = (positions ?? [])
    .map((position) => ({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }))
    .filter(
      (position, index, all) =>
        position.x >= 0 &&
        position.x < width &&
        position.y >= 0 &&
        position.y < height &&
        all.findIndex((candidate) => candidate.x === position.x && candidate.y === position.y) ===
          index,
    )
    .slice(0, count);
  return normalized.length > 0 ? normalized : undefined;
}

function PanelFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-line bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="grid grid-cols-[1fr_92px] items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        className="h-9 rounded-md border border-line bg-white px-2 text-right"
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.min(max, Math.max(min, next)));
          }
        }}
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_92px] items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="rounded-md border border-line bg-slate-50 px-2 py-2 text-right font-medium text-slate-500">
        {value}
      </span>
    </div>
  );
}

function LockedLayoutField() {
  return (
    <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold uppercase tracking-[0.08em] text-cyan-700">
          Trame verrouillee
        </span>
        <span className="font-semibold tabular-nums text-ink">
          {RACK_COLUMNS_PER_ELEVATOR_AISLE} / 1
        </span>
      </div>
      <div className="mt-1 text-cyan-800">
        {RACK_COLUMNS_PER_ELEVATOR_AISLE} rangees de stockage, puis 1 couloir ascenseur.
      </div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        checked={value}
        className="h-5 w-5 cursor-pointer accent-accent"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: T[];
  formatOption?: (value: T) => string;
  onChange: (value: T) => void;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  formatOption,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="grid grid-cols-[1fr_150px] items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        className="h-9 rounded-md border border-line bg-white px-2"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption ? formatOption(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}
