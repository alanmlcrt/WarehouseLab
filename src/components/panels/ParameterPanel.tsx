import type { ReactNode } from "react";
import type {
  DemandProfile,
  PathfindingStrategy,
  SimulationConfig,
  StorageStrategy,
} from "../../simulation/models/types";
import {
  buildSeedsFromMaster,
  deriveBatteryWeightKg,
} from "../../simulation/core/derivedConfig";
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

  if (!snapshot) {
    return <PanelFrame title="Paramètres">Initialisation</PanelFrame>;
  }

  const config = snapshot.config;
  const update = (nextConfig: SimulationConfig) => updateConfig(nextConfig);
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
              warehouse: { ...config.warehouse, width },
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
              warehouse: { ...config.warehouse, height },
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
        <ReadOnlyField
          label="Couloirs principaux"
          value={getMainAisleCount(config.warehouse.width).toString()}
        />
        <NumberField
          label="Nombre passages"
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
          max={4}
          min={1}
          value={config.warehouse.pickingStationCount}
          onChange={(pickingStationCount) =>
            update({
              ...config,
              warehouse: { ...config.warehouse, pickingStationCount },
            })
          }
        />
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
    </PanelFrame>
  );
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

function getMainAisleCount(width: number): number {
  const minX = 3;
  const maxX = width - 3;
  let cursor = minX;
  let count = 0;

  while (cursor <= maxX) {
    cursor += 2;
    if (cursor <= maxX) {
      count += 1;
      cursor += 1;
    }
  }

  return Math.max(1, count);
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
