import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { getEffectiveCrateOrdersPerMinute } from "../simulation/core/demand";
import { deriveBatteryWeightKg } from "../simulation/core/derivedConfig";
import type {
  Cell,
  MetricSample,
  SimulationConfig,
  SimulationMetrics,
  SimulationState,
} from "../simulation/models/types";
import { cloneConfig } from "../simulation/scenarios/presets";
import {
  chooseWorkerCount,
  isWorkerPoolSupported,
  runWithWorkerPool,
} from "./labPool";

export type FactorGroup =
  | "Warehouse"
  | "Robots"
  | "Demand"
  | "Storage"
  | "Movement";

export type FactorValue = number | string;

export interface FactorDef {
  id: string;
  label: string;
  group: FactorGroup;
  /** Dot-path into SimulationConfig, or "_compound" for multi-field factors. */
  path: string;
  unit?: string;
  type: "number" | "enum";
  defaultValues: FactorValue[];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** If set, this factor's value is automatically derived from another factor
   *  and cannot be set independently when that factor is active. */
  derivedFromId?: string;
  /** If true, setting this factor expands into multiple config fields. */
  compound?: boolean;
}

// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------

/** Relative CAPEX proxy (arbitrary cost units). A robot dominates the bill;
 *  a charger is a fraction of it. Used only for cost/service trade-off plots,
 *  so absolute units don't matter - only the ratio between the two does. */
export const ROBOT_COST_UNIT = 10;
export const CHARGER_COST_UNIT = 3;

// ---------------------------------------------------------------------------
// Warehouse size presets
// ---------------------------------------------------------------------------

export interface WarehouseSizePreset {
  label: string;
  width: number;
  height: number;
}

/** Setting rackCount to this value tells the factory to fill the grid to
 *  capacity - it stops naturally when no valid positions remain. */
export const RACK_FILL_SENTINEL = 9999;

/** Max robots the engine allows on a given floor before clamping, to keep the
 *  grid from jamming. One robot per 4 cells. Shared by the engine clamp and the
 *  PlanEditor warning so the rule lives in one place. */
export const ROBOT_DENSITY_CELLS_PER_ROBOT = 4;

export function maxRobotsForArea(width: number, height: number): number {
  return Math.max(1, Math.floor((width * height) / ROBOT_DENSITY_CELLS_PER_ROBOT));
}

export const WAREHOUSE_SIZE_PRESETS: Record<string, WarehouseSizePreset> = {
  xs: { label: "XS  (12x10)", width: 12, height: 10 },
  s:  { label: "S   (18x14)", width: 18, height: 14 },
  m:  { label: "M   (24x18)", width: 24, height: 18 },
  l:  { label: "L   (32x24)", width: 32, height: 24 },
  xl: { label: "XL  (42x30)", width: 42, height: 30 },
  custom: { label: "Custom", width: 0, height: 0 },
};

// ---------------------------------------------------------------------------
// Peak-demand profiles (compound factor -> expands into the four peak fields)
// ---------------------------------------------------------------------------

export interface PeakProfilePreset {
  label: string;
  description: string;
  enabled: boolean;
  multiplier: number;
  startMinute: number;
  durationMinutes: number;
}

export const PEAK_PROFILE_PRESETS: Record<string, PeakProfilePreset> = {
  none: {
    label: "Plat",
    description: "Demande stationnaire, aucun pic.",
    enabled: false,
    multiplier: 1,
    startMinute: 0,
    durationMinutes: 0,
  },
  moderate: {
    label: "Pic x2",
    description: "Surcharge modérée : x2 pendant 3 min à partir de la 2e minute.",
    enabled: true,
    multiplier: 2,
    startMinute: 2,
    durationMinutes: 3,
  },
  intense: {
    label: "Pic x3",
    description: "Surcharge intense : x3 pendant 4 min à partir de la 2e minute.",
    enabled: true,
    multiplier: 3,
    startMinute: 2,
    durationMinutes: 4,
  },
};

export const FACTOR_REGISTRY: FactorDef[] = [
  {
    id: "robotCount",
    label: "Nombre de robots",
    group: "Robots",
    path: "robots.robotCount",
    type: "number",
    defaultValues: [6, 10, 14, 18, 22],
    min: 1,
    max: 500,
    step: 1,
  },
  {
    id: "maxBattery",
    label: "Autonomie batterie",
    group: "Robots",
    path: "robots.maxBattery",
    type: "number",
    unit: "unités d'autonomie",
    defaultValues: [56, 98, 140, 196],
    min: 20,
    max: 400,
    step: 10,
  },
  {
    id: "payloadKg",
    label: "Charge utile (poids)",
    group: "Robots",
    path: "robots.payloadKg",
    type: "number",
    unit: "kg",
    // Fonctionnel : la charge transportée alourdit le robot et augmente la
    // consommation d'énergie par case.
    defaultValues: [8, 12, 18],
    min: 1,
    max: 60,
    step: 1,
  },
  {
    id: "rechargeThreshold",
    label: "Seuil de recharge",
    group: "Robots",
    path: "robots.rechargeThreshold",
    type: "number",
    unit: "%",
    defaultValues: [10, 20, 30],
    min: 5,
    max: 60,
    step: 5,
  },
  {
    id: "rechargeTicks",
    label: "Vitesse de recharge",
    group: "Robots",
    path: "robots.rechargeTicks",
    type: "number",
    unit: "ticks",
    defaultValues: [20, 40, 60],
    min: 10,
    max: 120,
    step: 10,
  },
  {
    id: "energyPerCell",
    label: "Énergie par cellule",
    group: "Robots",
    path: "robots.energyPerCell",
    type: "number",
    defaultValues: [0.2, 0.4, 0.6],
    min: 0.05,
    max: 2,
    step: 0.05,
  },
  {
    id: "failureProbability",
    label: "Taux de panne / tick",
    group: "Robots",
    path: "robots.failureProbability",
    type: "number",
    unit: "prob/tick",
    defaultValues: [0, 0.001, 0.003],
    min: 0,
    max: 0.02,
    step: 0.001,
  },
  {
    id: "meanFailureTicks",
    label: "Temps de réparation (MTTR)",
    group: "Robots",
    path: "robots.meanFailureTicks",
    type: "number",
    unit: "ticks",
    defaultValues: [30, 60, 120],
    min: 5,
    max: 300,
    step: 5,
  },
  {
    id: "warehouseSize",
    label: "Taille entrepôt",
    group: "Warehouse",
    path: "_compound",
    type: "enum",
    // Racks fill space automatically - rackCount is derived from available cells.
    defaultValues: ["s", "m"],
    options: Object.keys(WAREHOUSE_SIZE_PRESETS),
    compound: true,
  },
  {
    id: "crossAisleSpacing",
    label: "Nombre de passages",
    group: "Warehouse",
    path: "warehouse.crossAisleSpacing",
    type: "number",
    unit: "passages",
    defaultValues: [0, 1, 2, 3],
    min: 0,
    max: 8,
    step: 1,
  },
  {
    id: "levelCount",
    label: "Niveaux",
    group: "Warehouse",
    path: "warehouse.levelCount",
    type: "number",
    defaultValues: [2, 4, 6],
    min: 1,
    max: 10,
    step: 1,
  },
  {
    id: "pickingStationCount",
    label: "Stations picking",
    group: "Warehouse",
    path: "warehouse.pickingStationCount",
    type: "number",
    defaultValues: [2, 3, 4],
    min: 1,
    max: 12,
    step: 1,
  },
  {
    id: "pickingStationOrientation",
    label: "Orientation stations",
    group: "Warehouse",
    path: "warehouse.pickingStationOrientation",
    type: "enum",
    defaultValues: ["length", "width"],
    options: ["length", "width"],
  },
  {
    id: "chargingStationCount",
    label: "Chargeurs",
    group: "Warehouse",
    path: "warehouse.chargingStationCount",
    type: "number",
    defaultValues: [2, 4, 6],
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: "ordersPerMinute",
    label: "Commandes / min",
    group: "Demand",
    path: "demand.ordersPerMinute",
    type: "number",
    defaultValues: [18, 30],
    min: 1,
    max: 100,
    step: 1,
  },
  {
    id: "demandPattern",
    label: "Profil de demande",
    group: "Demand",
    path: "demand.demandPattern",
    type: "enum",
    defaultValues: ["abc"],
    options: ["uniform", "abc", "pareto"],
  },
  {
    id: "urgentOrderRate",
    label: "Part de urgents",
    group: "Demand",
    path: "demand.urgentOrderRate",
    type: "number",
    unit: "ratio",
    defaultValues: [0, 0.05, 0.15],
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    id: "peakProfile",
    label: "Profil de pic",
    group: "Demand",
    path: "_compound",
    type: "enum",
    defaultValues: ["none", "moderate"],
    options: Object.keys(PEAK_PROFILE_PRESETS),
    compound: true,
  },
  {
    id: "storageStrategy",
    label: "Stratégie stockage",
    group: "Storage",
    path: "storage.strategy",
    type: "enum",
    // familyStorage retire des options : avec un catalogue où la catégorie suit
    // la vitesse, il est mathématiquement identique à abcStorage. Les 4 ci-dessous
    // produisent des placements réellement distincts (cf. distance pondérée).
    defaultValues: ["abcStorage", "randomStorage"],
    options: [
      "randomStorage",
      "abcStorage",
      "balancedABCStorage",
      "dynamicSlotting",
    ],
  },
  {
    id: "pathfindingStrategy",
    label: "Pathfinding (aveugle vs trafic)",
    group: "Movement",
    path: "movement.pathfindingStrategy",
    type: "enum",
    // Default = reservation (A* + booking pre-pass) so studies start from a
    // properly-coordinated fleet. manhattan/astar restent disponibles pour
    // étudier la dégradation due à une mauvaise coordination.
    defaultValues: ["reservation", "astar", "manhattan"],
    options: ["manhattan", "astar", "reservation"],
  },
  {
    id: "taskAssignmentStrategy",
    label: "Règle d'affectation",
    group: "Movement",
    path: "movement.taskAssignmentStrategy",
    type: "enum",
    defaultValues: ["nearestRobot", "oldestAvailable"],
    options: ["nearestRobot", "oldestAvailable"],
  },
  {
    id: "reroutingPolicy",
    label: "Re-routage (trajet fixe vs dynamique)",
    group: "Movement",
    path: "movement.reroutingPolicy",
    type: "enum",
    // Default = reactive (recalcul permanent) — la flotte fuit la congestion
    // en continu. fixed/periodic gardés pour étudier la dégradation.
    defaultValues: ["reactive", "periodic", "fixed"],
    options: ["fixed", "periodic", "reactive"],
  },
];

// ---------------------------------------------------------------------------
// Confound rules — when factor X and one of its linked factors both vary, the
// Lab shows an advisory because the measured effect becomes an interaction.
// These rules do not mutate the plan: interaction studies remain possible.
// ---------------------------------------------------------------------------

export interface ConfoundRule {
  /** Factor whose variation triggers the advisory. */
  trigger: string;
  /** Factors that should stay fixed when the trigger is studied in isolation. */
  lock: string[];
  /** Plain-language explanation shown in the banner / tooltip. */
  why: string;
}

export interface ConfoundWarning {
  rule: ConfoundRule;
  triggerLabel: string;
}

export const CONFOUND_RULES: ConfoundRule[] = [
  {
    trigger: "storageStrategy",
    lock: ["demandPattern"],
    why: "Le stockage ABC dépend de la distribution SKU ; garde le profil de demande fixe pour isoler le placement.",
  },
  {
    trigger: "demandPattern",
    lock: ["storageStrategy", "ordersPerMinute", "peakProfile", "urgentOrderRate"],
    why: "Le profil de demande mesure le mix SKU ; garde stockage, cadence, pics et urgences fixes pour lire cet effet seul.",
  },
  {
    trigger: "ordersPerMinute",
    lock: ["demandPattern", "peakProfile", "urgentOrderRate"],
    why: "La cadence mesure l'intensité globale ; garde le mix SKU, les pics et les urgences fixes.",
  },
  {
    trigger: "peakProfile",
    lock: ["ordersPerMinute", "demandPattern", "urgentOrderRate"],
    why: "Le profil de pic mesure une surcharge temporelle ; garde cadence, mix SKU et urgences fixes.",
  },
  {
    trigger: "urgentOrderRate",
    lock: ["ordersPerMinute", "demandPattern", "peakProfile"],
    why: "La part d'urgents change la priorité de service ; garde intensité, mix SKU et pics fixes.",
  },
  {
    trigger: "robotCount",
    lock: ["chargingStationCount", "pathfindingStrategy", "reroutingPolicy"],
    why: "L'effet flotte dépend de la charge disponible et de la coordination ; garde ces paramètres fixes pour trouver R*.",
  },
  {
    trigger: "chargingStationCount",
    lock: [
      "robotCount",
      "maxBattery",
      "rechargeThreshold",
      "rechargeTicks",
      "energyPerCell",
      "payloadKg",
    ],
    why: "Les chargeurs mesurent l'infrastructure énergie ; garde flotte, autonomie, recharge et masse fixes.",
  },
  {
    trigger: "maxBattery",
    lock: [
      "chargingStationCount",
      "rechargeThreshold",
      "rechargeTicks",
      "energyPerCell",
      "payloadKg",
      "robotCount",
    ],
    why: "L'autonomie change aussi le poids batterie ; garde recharge, consommation, charge utile, chargeurs et flotte fixes.",
  },
  {
    trigger: "rechargeThreshold",
    lock: ["maxBattery", "chargingStationCount", "rechargeTicks", "energyPerCell", "payloadKg"],
    why: "Le seuil de recharge est une politique batterie ; garde autonomie, chargeurs, vitesse de charge et consommation fixes.",
  },
  {
    trigger: "rechargeTicks",
    lock: ["maxBattery", "chargingStationCount", "rechargeThreshold"],
    why: "La vitesse de recharge se lit à autonomie, seuil et nombre de chargeurs constants.",
  },
  {
    trigger: "energyPerCell",
    lock: ["payloadKg", "maxBattery", "chargingStationCount"],
    why: "La consommation par cellule se mélange avec la masse transportée, l'autonomie et la capacité de charge.",
  },
  {
    trigger: "payloadKg",
    lock: ["energyPerCell", "maxBattery", "chargingStationCount"],
    why: "La charge utile modifie la masse et donc l'énergie ; garde consommation, autonomie et chargeurs fixes.",
  },
  {
    trigger: "warehouseSize",
    lock: ["crossAisleSpacing", "levelCount", "pickingStationCount"],
    why: "La taille change la surface et les lignes verticales ; garde niveaux, passages et stations fixes pour isoler la géométrie.",
  },
  {
    trigger: "levelCount",
    lock: ["warehouseSize", "crossAisleSpacing", "pickingStationCount"],
    why: "Les niveaux mesurent l'effet vertical ; garde surface, passages et stations fixes.",
  },
  {
    trigger: "pickingStationCount",
    lock: ["warehouseSize", "levelCount", "crossAisleSpacing"],
    why: "Les stations changent la capacité de sortie ; garde surface, hauteur et passages fixes.",
  },
  {
    trigger: "crossAisleSpacing",
    lock: ["warehouseSize", "levelCount", "pickingStationCount"],
    why: "Les passages changent la connectivité interne ; garde surface, hauteur et stations fixes.",
  },
  {
    trigger: "pathfindingStrategy",
    lock: ["reroutingPolicy", "robotCount"],
    why: "Le pathfinding dépend du niveau de congestion et de la fréquence de recalcul ; garde flotte et re-routage fixes.",
  },
  {
    trigger: "reroutingPolicy",
    lock: ["pathfindingStrategy", "robotCount"],
    why: "Le re-routage dépend de l'algorithme de chemin et de la densité robots ; garde ces paramètres fixes.",
  },
];

/** Returns the set of factor ids that should be locked (forced to context, 1 val)
 *  given the current plan, plus the rules that triggered each lock. */
export function computeLockedFactors(
  plan: LabPlan,
): Map<string, ConfoundWarning[]> {
  const locked = new Map<string, ConfoundWarning[]>();
  const bindings = new Map(plan.bindings.map((b) => [b.factorId, b]));
  const isVaried = (factorId: string): boolean => {
    const role = plan.factorRoles?.[factorId] ?? "variable";
    const values = bindings.get(factorId)?.values ?? [];
    return role === "variable" && values.length > 1;
  };
  for (const rule of CONFOUND_RULES) {
    if (!isVaried(rule.trigger)) continue;
    const triggerLabel = getFactorById(rule.trigger)?.label ?? rule.trigger;
    for (const lockedId of rule.lock) {
      if (!isVaried(lockedId)) continue;
      const warnings = locked.get(lockedId) ?? [];
      warnings.push({ rule, triggerLabel });
      locked.set(lockedId, warnings);
    }
  }
  return locked;
}

/** Soft confound advisory: the rules now produce a non-blocking warning
 *  surfaced in the banner. The user is free to vary several factors at once
 *  (interaction studies need this). This function is kept as a no-op for
 *  callers that still wrap the plan — the plan stays untouched. */
export function applyConfoundLocks(plan: LabPlan): LabPlan {
  return plan;
}

// ---------------------------------------------------------------------------
// Required factors — the user MUST pick a value (Fixé or À tester). They
// cannot be left out via the shelf because the engine's behaviour materially
// depends on them and falling back to a silent preset default would hide a
// real decision (e.g. "how many levels does my warehouse have?").
// ---------------------------------------------------------------------------

export const REQUIRED_FACTOR_IDS: ReadonlySet<string> = new Set([
  "warehouseSize",
  "levelCount",
  "pickingStationCount",
  "chargingStationCount",
  "robotCount",
  "ordersPerMinute",
  "demandPattern",
  "storageStrategy",
  "pathfindingStrategy",
  "reroutingPolicy",
]);

export function isRequiredFactor(id: string): boolean {
  return REQUIRED_FACTOR_IDS.has(id);
}

/** Normalise a plan so every required factor has at least one value and a
 *  role (context by default). Used after every mutation to keep the invariant
 *  even if a saved campaign predates the rule. */
export function ensureRequiredFactorValues(plan: LabPlan): LabPlan {
  let mutated = false;
  const factorRoles = { ...plan.factorRoles };
  const bindings = plan.bindings.map((binding) => {
    if (!isRequiredFactor(binding.factorId)) return binding;
    const factor = getFactorById(binding.factorId);
    if (!factor) return binding;
    if (binding.values.length === 0) {
      mutated = true;
      factorRoles[binding.factorId] = "context";
      return {
        ...binding,
        values: [factor.defaultValues[0] ?? (factor.min ?? 1)],
      };
    }
    return binding;
  });
  return mutated ? { ...plan, factorRoles, bindings } : plan;
}

export const DEFAULT_ACTIVE_FACTOR_IDS = [
  "warehouseSize",
  "ordersPerMinute",
  "demandPattern",
  "peakProfile",
  "pickingStationCount",
  "chargingStationCount",
  "robotCount",
  "storageStrategy",
];

export type MetricGroup =
  | "Performance"
  | "Efficacité"
  | "Coût"
  | "Stockage"
  | "Batterie";

export const METRIC_COLUMNS: Array<{
  id: string;
  label: string;
  unit?: string;
  /** True for metrics that directly mirror an input factor or layout parameter.
   *  They vary when a config param changes but are not performance outcomes. */
  structural?: true;
  /** True for the KPIs that matter most — shown in dropdowns by default. */
  essential?: true;
  /** Theme used to group the metric in dropdowns (essential metrics only). */
  group?: MetricGroup;
}> = [
  { id: "derivedMaxBattery", label: "Capacité batterie (dérivée)", unit: "énergie", structural: true },
  { id: "effectiveRackCount", label: "Emplacements de stockage", unit: "racks", structural: true, group: "Stockage" },
  { id: "rackDensityPct", label: "Densité de stockage", unit: "%", structural: true },
  { id: "warehouseWidth", label: "Largeur réelle", unit: "cellules", structural: true },
  { id: "warehouseHeight", label: "Profondeur réelle", unit: "cellules", structural: true },
  { id: "steadyThroughputPerMinute", label: "Débit", unit: "caisses/min", essential: true, group: "Performance" },
  { id: "throughputPerMinute", label: "Débit instantané (60s)", unit: "caisses/min" },
  { id: "demandPerMinute", label: "Demande", unit: "caisses/min", essential: true, group: "Performance" },
  { id: "feasibilityMargin", label: "Marge de capacité", unit: "ratio", essential: true, group: "Performance" },
  { id: "steadyUtilization", label: "Utilisation steady-state", unit: "ratio" },
  { id: "steadyBacklog", label: "Backlog moyen", unit: "commandes", essential: true, group: "Performance" },
  { id: "backlogGrowthPerMinute", label: "Croissance backlog", unit: "cmd/min", essential: true, group: "Performance" },
  { id: "serviceLevel", label: "Taux de service", unit: "%", essential: true, group: "Performance" },
  { id: "throughputPerRobot", label: "Débit / robot", unit: "caisses/min/robot", essential: true, group: "Efficacité" },
  { id: "backlogRatio", label: "Ratio backlog" },
  { id: "effectiveRobotCount", label: "Parc effectif", unit: "robots", structural: true },
  { id: "costProxy", label: "Coût (indicatif)", unit: "unités", essential: true, group: "Coût" },
  { id: "averageProcessingTime", label: "Temps moyen / commande", unit: "s", essential: true, group: "Performance" },
  { id: "averageRobotUtilization", label: "Occupation robots", unit: "ratio", essential: true, group: "Efficacité" },
  { id: "averageDistancePerOrder", label: "Distance / commande", essential: true, group: "Efficacité" },
  { id: "totalDistance", label: "Distance totale" },
  { id: "completedOrders", label: "Caisses livrées" },
  { id: "pendingOrders", label: "Backlog final" },
  { id: "congestionEvents", label: "Congestion", essential: true, group: "Efficacité" },
  { id: "connectorTraffic", label: "Trafic connecteur" },
  { id: "connectorWait", label: "Attente connecteur" },
  { id: "energyConsumed", label: "Énergie totale" },
  { id: "energyPerOrder", label: "Énergie / commande", essential: true, group: "Efficacité" },
  { id: "chargingShare", label: "Part en recharge" },
  { id: "chargeSessions", label: "Sessions charge" },
  { id: "depletionEvents", label: "Pannes batterie", essential: true, group: "Batterie" },
  { id: "averageBatteryLevel", label: "Batterie moyenne" },
  { id: "minimumBatteryLevel", label: "Batterie min" },
  { id: "slottingEfficiency", label: "Qualité du rangement", group: "Stockage" },
  { id: "demandWeightedStorageDistance", label: "Distance pondérée" },
  { id: "fastMovingStorageDistance", label: "Distance SKU rapides" },
  { id: "elevatorTrips", label: "Trajets verticaux" },
  { id: "verticalPressure", label: "Pression verticale" },
];

export interface FactorBinding {
  factorId: string;
  values: FactorValue[];
}

export type FactorRole = "context" | "variable";

export interface LabPlan {
  bindings: FactorBinding[];
  factorRoles: Record<string, FactorRole>;
  seedCount: number;
  simulatedMinutes: number;
  /** Warm-up window discarded before measuring steady-state KPIs (minutes). */
  warmupMinutes: number;
}

export interface RunPoint {
  id: string;
  seedIndex: number;
  factors: Record<string, FactorValue>;
  metrics: Record<string, number>;
  feasible: boolean;
  physicalSnapshot?: LabPhysicalSnapshot;
  /** Exact resolved config the engine ran with (factors applied + per-seed
   *  offsets). Because the engine is deterministic, loading this config
   *  verbatim replays the run tick-for-tick in the 3D view. Optional: points
   *  persisted before this field existed don't have it. */
  config?: SimulationConfig;
}

export type LabPhysicalCellKind = Cell["type"];

export interface LabPhysicalCell {
  x: number;
  y: number;
  /** Floor index. Older snapshots without per-level capture omit it (level 0). */
  level: number;
  type: LabPhysicalCellKind;
  traffic: number;
  wait: number;
}

export interface LabPhysicalSnapshot {
  width: number;
  height: number;
  levelCount: number;
  rackCount: number;
  stationCount: number;
  chargerCount: number;
  elevatorAisleCount: number;
  maxTraffic: number;
  maxWait: number;
  cells: LabPhysicalCell[];
}

export interface LabProgress {
  completedRuns: number;
  totalRuns: number;
  currentLabel: string;
}

export interface LabRunOptions {
  baseConfig: SimulationConfig;
  plan: LabPlan;
  onProgress?: (progress: LabProgress) => void;
}

/** Maximum number of replications (seeds) per configuration. Higher = tighter
 *  confidence on every mean/std, at a linear cost in run time. */
export const MAX_SEEDS = 100;
export const MIN_SEEDS = 50;

/** Deterministic, well-spread seed offsets for any replication index, so the
 *  lab is no longer capped at a handful of hardcoded seeds. Index 0 keeps the
 *  base seeds (offset 0) for reproducibility with single-seed runs. */
function getSeedOffset(index: number): {
  layoutSeed: number;
  skuCatalogSeed: number;
  stationSeed: number;
  robotSpawnSeed: number;
  demandSeed: number;
  trafficSeed: number;
  batterySeed: number;
  failureSeed: number;
} {
  if (index <= 0) {
    return {
      layoutSeed: 0,
      skuCatalogSeed: 0,
      stationSeed: 0,
      robotSpawnSeed: 0,
      demandSeed: 0,
      trafficSeed: 0,
      batterySeed: 0,
      failureSeed: 0,
    };
  }
  const hash = (salt: number): number => {
    let x = Math.imul(index + 1, salt) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0x297a2d39) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) % 100000;
  };
  return {
    layoutSeed: hash(0x9e3779b1),
    skuCatalogSeed: hash(0x7f4a7c15),
    stationSeed: hash(0x94d049bb),
    robotSpawnSeed: hash(0x165667b1),
    demandSeed: hash(0x85ebca77),
    trafficSeed: hash(0x27d4eb2f),
    batterySeed: hash(0x4cf5ad43),
    failureSeed: hash(0xc2b2ae3d),
  };
}

export function getFactorById(id: string): FactorDef | undefined {
  return FACTOR_REGISTRY.find((factor) => factor.id === id);
}

export function getActiveFactorBindings(plan: LabPlan): FactorBinding[] {
  return plan.bindings.filter((binding) => binding.values.length > 0);
}

export function buildDefaultLabPlan(): LabPlan {
  const contextIds = new Set([
    "warehouseSize",
    "ordersPerMinute",
    "demandPattern",
    "peakProfile",
    "pickingStationCount",
    "chargingStationCount",
    "levelCount",
  ]);
  const built: LabPlan = {
    seedCount: 50,
    simulatedMinutes: 3,
    warmupMinutes: 1,
    factorRoles: Object.fromEntries(
      FACTOR_REGISTRY.map((factor) => [
        factor.id,
        contextIds.has(factor.id) ? "context" : "variable",
      ]),
    ) as Record<string, FactorRole>,
    bindings: FACTOR_REGISTRY.map((factor) => ({
      factorId: factor.id,
      values:
        factor.id === "robotCount"
          ? [6, 10, 14, 18, 22]
          : factor.id === "warehouseSize"
            ? ["s"]
          : factor.id === "ordersPerMinute"
            ? [18]
          : factor.id === "demandPattern"
            ? ["abc"]
          : factor.id === "peakProfile"
            ? ["none"]
          : factor.id === "pickingStationCount"
            ? [2]
          : factor.id === "chargingStationCount"
            ? [3]
          : factor.id === "storageStrategy"
            ? ["randomStorage", "abcStorage"]
            : DEFAULT_ACTIVE_FACTOR_IDS.includes(factor.id)
              ? factor.defaultValues
              : [],
    })),
  };
  // Guarantee every required factor has a value, even if it was missed above.
  return ensureRequiredFactorValues(built);
}

/** Number of distinct factor combinations = full factorial of every active
 *  factor's value list. This is what makes the lab multi-factor: activate N
 *  factors and the DOE sweeps their Cartesian product. */
export function countPlanCombinations(plan: LabPlan): number {
  return getRunFactorBindings(plan).reduce(
    (product, binding) => product * Math.max(1, binding.values.length),
    1,
  );
}

export function countPlanRuns(plan: LabPlan): number {
  const seeds = Math.max(MIN_SEEDS, Math.min(plan.seedCount, MAX_SEEDS));
  return countPlanCombinations(plan) * seeds;
}

// Reporting progress + yielding after every single run forces one React
// re-render + repaint per run, which dwarfs the ~20 ms of actual compute.
// Throttle both to ~60 ms wall-clock so the UI stays responsive without paying
// a render tax on every run.
const PROGRESS_INTERVAL_MS = 60;

/** Resolved run dimensions shared by the parallel and sequential paths. */
function resolveRunDimensions(
  baseConfig: SimulationConfig,
  plan: LabPlan,
): {
  combinations: CombinationEntry[][];
  seedCount: number;
  ticksPerRun: number;
  warmupSeconds: number;
  totalRuns: number;
} {
  const combinations = enumerateCombinations(getRunFactorBindings(plan));
  const seedCount = Math.max(MIN_SEEDS, Math.min(plan.seedCount, MAX_SEEDS));
  const ticksPerRun = Math.max(
    120,
    Math.round((plan.simulatedMinutes * 60) / baseConfig.tickDurationSeconds),
  );
  return {
    combinations,
    seedCount,
    ticksPerRun,
    warmupSeconds: plan.warmupMinutes * 60,
    totalRuns: combinations.length * seedCount,
  };
}

export async function runLab({
  baseConfig,
  plan,
  onProgress,
}: LabRunOptions): Promise<RunPoint[]> {
  const { combinations, seedCount, ticksPerRun, warmupSeconds, totalRuns } =
    resolveRunDimensions(baseConfig, plan);
  onProgress?.({ completedRuns: 0, totalRuns, currentLabel: "Démarrage…" });

  // Runs are independent (each carries its own frozen seeds), so the sweep is
  // embarrassingly parallel. Fan it out across a worker pool when available;
  // fall back to a single-threaded sweep under SSR / test runners.
  if (!isWorkerPoolSupported() || totalRuns === 0) {
    return runLabSequential(
      baseConfig,
      combinations,
      seedCount,
      ticksPerRun,
      warmupSeconds,
      totalRuns,
      onProgress,
    );
  }

  // Pre-size by global index so out-of-order completion still rebuilds the exact
  // sequential order — keeps output byte-identical to the single-threaded path.
  const points: RunPoint[] = new Array(totalRuns);
  const workerCount = chooseWorkerCount(totalRuns);
  // ~4 chunks per worker balances postMessage overhead against load-balancing.
  const chunkSize = Math.max(
    1,
    Math.min(16, Math.ceil(totalRuns / (workerCount * 4))),
  );
  let completed = 0;
  let lastTick = performance.now();

  await runWithWorkerPool({
    baseConfig,
    combinations,
    ticksPerRun,
    warmupSeconds,
    seedCount,
    totalRuns,
    workerCount,
    chunkSize,
    onResults: (entries) => {
      for (const entry of entries) {
        points[entry.i] = entry.point;
      }
      completed += entries.length;
      const now = performance.now();
      if (now - lastTick >= PROGRESS_INTERVAL_MS || completed === totalRuns) {
        const last = entries[entries.length - 1];
        onProgress?.({
          completedRuns: completed,
          totalRuns,
          currentLabel: last ? last.point.id : "",
        });
        lastTick = now;
      }
    },
  });

  onProgress?.({ completedRuns: totalRuns, totalRuns, currentLabel: "Terminé" });
  return points;
}

/** Single-threaded sweep, used as the fallback when Web Workers are unavailable
 *  (SSR, Node test runners). Identical results to the pooled path. */
async function runLabSequential(
  baseConfig: SimulationConfig,
  combinations: CombinationEntry[][],
  seedCount: number,
  ticksPerRun: number,
  warmupSeconds: number,
  totalRuns: number,
  onProgress?: (progress: LabProgress) => void,
): Promise<RunPoint[]> {
  const points: RunPoint[] = [];
  let completed = 0;
  let lastTick = performance.now();

  for (const combination of combinations) {
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
      const point = runSinglePoint(
        baseConfig,
        combination,
        seedIndex,
        ticksPerRun,
        warmupSeconds,
      );
      points.push(point);
      completed += 1;

      const now = performance.now();
      if (now - lastTick >= PROGRESS_INTERVAL_MS) {
        onProgress?.({
          completedRuns: completed,
          totalRuns,
          currentLabel: point.id,
        });
        await yieldToBrowser();
        lastTick = now;
      }
    }
  }

  onProgress?.({ completedRuns: totalRuns, totalRuns, currentLabel: "Terminé" });
  return points;
}

/** Execute one simulation run (one factor combination at one seed) and collapse
 *  it into a RunPoint. Pure and deterministic given (baseConfig, combination,
 *  seedIndex), so it runs identically on the main thread or inside a worker. */
export function runSinglePoint(
  baseConfig: SimulationConfig,
  combination: CombinationEntry[],
  seedIndex: number,
  ticksPerRun: number,
  warmupSeconds: number,
): RunPoint {
  const config = applyCombination(baseConfig, combination, seedIndex);
  const label = buildLabel(combination, seedIndex);

  const engine = new SimulationEngine(config);
  for (let tick = 0; tick < ticksPerRun; tick += 1) {
    engine.tick();
  }
  const snapshot = engine.getSnapshot(false, 1);
  const demand = getEffectiveCrateOrdersPerMinute(config.demand, 0);
  const effectiveRackCount = snapshot.warehouse.racks.length;
  const steady = computeSteadyState(
    snapshot.metrics.series,
    warmupSeconds,
    config.robots.robotCount,
  );
  const metrics = flattenMetrics(
    snapshot.metrics,
    demand,
    config.robots.maxBattery,
    effectiveRackCount,
    config.warehouse.width,
    config.warehouse.height,
    config.robots.robotCount,
    config.warehouse.chargingStationCount,
    snapshot.orders.length,
  );
  // Feasibility judged on the stationary regime, not the noisy 60 s snapshot.
  const feasibilityMargin =
    demand > 0 ? (steady.steadyThroughputPerMinute - demand) / demand : 0;

  return {
    id: `${label}-${seedIndex + 1}`,
    seedIndex,
    factors: Object.fromEntries(
      combination.map((entry) => {
        // Record the EFFECTIVE value the engine actually ran with (read back
        // from the config after applyCombination), not the requested one.
        // This matters when a value is silently adjusted — e.g. robotCount
        // clamped to the floor-density cap — so charts and regression don't
        // treat clamped duplicates as distinct levels. Compound factors keep
        // their categorical value (warehouseSize="s", peakProfile="moderate").
        const factor = getFactorById(entry.factorId);
        if (factor && !factor.compound && factor.path !== "_compound") {
          const effective = getByPath(config, factor.path);
          if (effective !== undefined) {
            return [entry.factorId, effective];
          }
        }
        return [entry.factorId, entry.value];
      }),
    ),
    metrics: {
      ...metrics,
      steadyThroughputPerMinute: steady.steadyThroughputPerMinute,
      steadyUtilization: steady.steadyUtilization,
      steadyBacklog: steady.steadyBacklog,
      backlogGrowthPerMinute: steady.backlogGrowthPerMinute,
      demandPerMinute: demand,
      feasibilityMargin,
    },
    feasible: steady.steadyThroughputPerMinute >= demand * 0.98,
    physicalSnapshot: capturePhysicalSnapshot(snapshot),
    config,
  };
}

function getFactorRole(plan: LabPlan, factorId: string): FactorRole {
  return plan.factorRoles?.[factorId] ?? "variable";
}

function getRunFactorBindings(plan: LabPlan): FactorBinding[] {
  return getActiveFactorBindings(plan).map((binding) => {
    if (getFactorRole(plan, binding.factorId) === "context") {
      return { ...binding, values: binding.values.slice(0, 1) };
    }
    return binding;
  });
}

export interface CombinationEntry {
  factorId: string;
  value: FactorValue;
}

function enumerateCombinations(
  bindings: FactorBinding[],
): CombinationEntry[][] {
  if (bindings.length === 0) {
    return [[]];
  }
  const results: CombinationEntry[][] = [[]];
  for (const binding of bindings) {
    const next: CombinationEntry[][] = [];
    for (const partial of results) {
      for (const value of binding.values) {
        next.push([...partial, { factorId: binding.factorId, value }]);
      }
    }
    results.length = 0;
    results.push(...next);
  }
  return results;
}

function applyCombination(
  baseConfig: SimulationConfig,
  combination: CombinationEntry[],
  seedIndex: number,
): SimulationConfig {
  const config = cloneConfig(baseConfig);

  // Track which factors were explicitly set so we can derive dependents.
  const setFactorIds = new Set(combination.map((entry) => entry.factorId));

  for (const entry of combination) {
    const factor = getFactorById(entry.factorId);
    if (!factor) {
      continue;
    }

    // Compound factor: warehouseSize -> expand into width + height.
    // rackCount is set to RACK_FILL_SENTINEL so the factory fills available space.
    if (factor.compound && entry.factorId === "warehouseSize") {
      const preset = WAREHOUSE_SIZE_PRESETS[entry.value as string];
      if (preset && preset.width > 0 && preset.height > 0) {
        config.warehouse.width = preset.width;
        config.warehouse.height = preset.height;
        config.warehouse.rackCount = RACK_FILL_SENTINEL;
      }
      continue;
    }

    // Compound factor: peakProfile -> expand into the four demand peak fields.
    if (factor.compound && entry.factorId === "peakProfile") {
      const preset = PEAK_PROFILE_PRESETS[entry.value as string];
      if (preset) {
        config.demand.peakDemandEnabled = preset.enabled;
        config.demand.peakMultiplier = preset.multiplier;
        config.demand.peakStartMinute = preset.startMinute;
        config.demand.peakDurationMinutes = preset.durationMinutes;
      }
      continue;
    }

    if (factor.path !== "_compound") {
      setByPath(config, factor.path, entry.value);
    }
  }

  // If warehouseSize was set but rackCount was NOT explicitly overridden, ensure
  // the fill sentinel is applied (also handles the case where no topology was set).
  if (setFactorIds.has("warehouseSize") && !setFactorIds.has("rackCount")) {
    config.warehouse.rackCount = RACK_FILL_SENTINEL;
  }

  // Battery weight is derived from autonomy; it is not a user-controlled factor.
  if (setFactorIds.has("maxBattery")) {
    config.robots.batteryWeightKg = deriveBatteryWeightKg(
      config.robots.maxBattery,
    );
  }

  // Couple the temporal-reservation flag to the pathfinding factor so the lab's
  // "manhattan" / "astar" levels mean what they say: a fleet WITHOUT the
  // cooperative booking pass. Otherwise the base preset's `temporalReservation:
  // true` silently keeps reservation admission on for every level (since
  // useTemporalReservation() ORs the two), making "manhattan" run as
  // "manhattan search + reservation admission" — a confusing hybrid that breaks
  // reproducibility and hides the real cost of poor coordination.
  if (setFactorIds.has("pathfindingStrategy")) {
    config.movement.temporalReservation =
      config.movement.pathfindingStrategy === "reservation";
  }

  // Clamp robotCount to a sensible density relative to warehouse floor area
  // so extreme combinations don't jam the grid with hundreds of robots.
  const maxRobotsForFloor = maxRobotsForArea(
    config.warehouse.width,
    config.warehouse.height,
  );
  if (config.robots.robotCount > maxRobotsForFloor) {
    config.robots.robotCount = Math.max(1, maxRobotsForFloor);
  }

  const offset = getSeedOffset(seedIndex);
  config.seeds = {
    layoutSeed: config.seeds.layoutSeed + offset.layoutSeed,
    skuCatalogSeed: config.seeds.skuCatalogSeed + offset.skuCatalogSeed,
    stationSeed: config.seeds.stationSeed + offset.stationSeed,
    robotSpawnSeed: config.seeds.robotSpawnSeed + offset.robotSpawnSeed,
    demandSeed: config.seeds.demandSeed + offset.demandSeed,
    trafficSeed: config.seeds.trafficSeed + offset.trafficSeed,
    batterySeed: config.seeds.batterySeed + offset.batterySeed,
    failureSeed: config.seeds.failureSeed + offset.failureSeed,
  };
  return config;
}

function setByPath(target: any, path: string, value: FactorValue): void {
  const segments = path.split(".");
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    cursor = cursor[segments[index]];
  }
  cursor[segments[segments.length - 1]] = value;
}

function getByPath(target: any, path: string): FactorValue | undefined {
  const segments = path.split(".");
  let cursor = target;
  for (const segment of segments) {
    if (cursor == null) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor as FactorValue | undefined;
}

export interface SteadyStateMetrics {
  /** Throughput estimated as the slope of cumulative completions over the
   *  post-warmup window (caisses/min) - far more stable than the 60 s snapshot. */
  steadyThroughputPerMinute: number;
  /** Mean share of robots actively serving orders over the window (0..1). */
  steadyUtilization: number;
  /** Mean pending backlog over the window (orders) - a Little's-law style signal. */
  steadyBacklog: number;
  /** Slope of pending backlog over the same window (orders/min). Positive means unstable demand. */
  backlogGrowthPerMinute: number;
  /** Warm-up actually discarded (seconds); may be clamped to fit the series. */
  warmupSecondsUsed: number;
}

/** Steady-state output analysis via the deletion method: drop the warm-up
 *  transient, then measure the stationary regime from the time series.
 *  Falls back gracefully to the whole window when the series is too short. */
export function computeSteadyState(
  series: MetricSample[],
  warmupSeconds: number,
  robotCount: number,
): SteadyStateMetrics {
  if (series.length < 2) {
    const only = series[0];
    return {
      steadyThroughputPerMinute: only?.throughputPerMinute ?? 0,
      steadyUtilization: only?.averageRobotUtilization ?? 0,
      steadyBacklog: only?.pendingOrders ?? 0,
      backlogGrowthPerMinute: 0,
      warmupSecondsUsed: 0,
    };
  }

  const endSeconds = series[series.length - 1].elapsedSeconds;
  // Never discard more than 80% of the run, so a long warm-up can't starve the
  // window. Also clamp to what the (capped) series actually covers.
  const earliest = series[0].elapsedSeconds;
  const cap = earliest + 0.8 * (endSeconds - earliest);
  const effectiveWarmup = Math.min(Math.max(warmupSeconds, earliest), cap);

  let window = series.filter((sample) => sample.elapsedSeconds >= effectiveWarmup);
  let warmupUsed = effectiveWarmup;
  if (window.length < 2) {
    window = series;
    warmupUsed = earliest;
  }

  const first = window[0];
  const last = window[window.length - 1];
  const deltaSeconds = last.elapsedSeconds - first.elapsedSeconds;
  const steadyThroughputPerMinute =
    deltaSeconds > 0
      ? ((last.completedOrders - first.completedOrders) / deltaSeconds) * 60
      : last.throughputPerMinute;

  const meanActive =
    window.reduce((sum, sample) => sum + sample.activeRobots, 0) / window.length;
  const meanBacklog =
    window.reduce((sum, sample) => sum + sample.pendingOrders, 0) / window.length;
  const backlogGrowthPerMinute =
    deltaSeconds > 0
      ? ((last.pendingOrders - first.pendingOrders) / deltaSeconds) * 60
      : 0;

  return {
    steadyThroughputPerMinute,
    steadyUtilization: meanActive / Math.max(1, robotCount),
    steadyBacklog: meanBacklog,
    backlogGrowthPerMinute,
    warmupSecondsUsed: warmupUsed,
  };
}

function flattenMetrics(
  metrics: SimulationMetrics,
  demand: number,
  derivedMaxBattery: number,
  effectiveRackCount: number,
  warehouseWidth: number,
  warehouseHeight: number,
  effectiveRobotCount: number,
  chargingStationCount: number,
  openOrderCount: number,
): Record<string, number> {
  const completed = Math.max(1, metrics.completedOrders);
  // Order service level (fill rate): share of created orders fulfilled by the
  // end of the run. Open orders include pending, assigned, picking and in-transit
  // work; counting only pending would inflate service when WIP is high.
  const totalOrders = metrics.completedOrders + openOrderCount;
  const serviceLevel =
    totalOrders > 0 ? metrics.completedOrders / totalOrders : 1;
  return {
    derivedMaxBattery,
    effectiveRackCount,
    effectiveRobotCount,
    warehouseWidth,
    warehouseHeight,
    rackDensityPct: (effectiveRackCount / Math.max(1, warehouseWidth * warehouseHeight)) * 100,
    throughputPerMinute: metrics.throughputPerMinute,
    serviceLevel,
    throughputPerRobot:
      metrics.throughputPerMinute / Math.max(1, effectiveRobotCount),
    backlogRatio: metrics.pendingOrders / completed,
    costProxy:
      effectiveRobotCount * ROBOT_COST_UNIT +
      chargingStationCount * CHARGER_COST_UNIT,
    averageProcessingTime: metrics.averageProcessingTime,
    averageRobotUtilization: metrics.averageRobotUtilization,
    averageDistancePerOrder: metrics.averageDistancePerOrder,
    totalDistance: metrics.totalDistance,
    completedOrders: metrics.completedOrders,
    pendingOrders: metrics.pendingOrders,
    congestionEvents: metrics.congestionEvents,
    connectorTraffic: metrics.connectorTraffic,
    connectorWait: metrics.connectorWait,
    energyConsumed: metrics.energyConsumed,
    energyPerOrder: metrics.energyConsumed / completed,
    chargingShare:
      metrics.chargingTicks /
      Math.max(1, metrics.completedOrders + metrics.pendingOrders),
    chargeSessions: metrics.chargeSessions,
    depletionEvents: metrics.depletionEvents,
    averageBatteryLevel: metrics.averageBatteryLevel,
    minimumBatteryLevel: metrics.minimumBatteryLevel,
    slottingEfficiency: metrics.slottingEfficiency,
    demandWeightedStorageDistance: metrics.demandWeightedStorageDistance,
    fastMovingStorageDistance: metrics.fastMovingStorageDistance,
    elevatorTrips: metrics.elevatorTrips,
    verticalPressure: metrics.verticalPressure,
    activeRobots: metrics.activeRobots,
    demandPerMinute: demand,
  };
}

function buildLabel(combination: CombinationEntry[], seedIndex: number): string {
  if (combination.length === 0) {
    return `base-s${seedIndex + 1}`;
  }
  return combination
    .map((entry) => `${entry.factorId}=${entry.value}`)
    .concat(`s${seedIndex + 1}`)
    .join("|");
}

function capturePhysicalSnapshot(state: SimulationState): LabPhysicalSnapshot {
  let maxTraffic = 0;
  let maxWait = 0;
  const cells: LabPhysicalCell[] = [];
  const { cellTrafficByLevel, cellWaitByLevel } = state.warehouse;
  const levelCount = Math.max(1, state.warehouse.levels.length);

  // One entry per (cell, floor): structural footprint repeats on every floor so
  // each stacked plane reads as a real warehouse level; the heat differs per floor.
  state.warehouse.cells.forEach((cell, index) => {
    for (let level = 0; level < levelCount; level += 1) {
      const traffic = cellTrafficByLevel[level]?.[index] ?? 0;
      const wait = cellWaitByLevel[level]?.[index] ?? 0;
      maxTraffic = Math.max(maxTraffic, traffic);
      maxWait = Math.max(maxWait, wait);
      if (cell.type === "empty" && traffic === 0 && wait === 0) {
        continue;
      }
      cells.push({ x: cell.x, y: cell.y, level, type: cell.type, traffic, wait });
    }
  });

  return {
    width: state.warehouse.width,
    height: state.warehouse.height,
    levelCount,
    rackCount: state.warehouse.racks.length,
    stationCount: state.warehouse.pickingStations.length,
    chargerCount: state.warehouse.chargingStations.length,
    elevatorAisleCount: state.warehouse.elevatorZones.length,
    maxTraffic,
    maxWait,
    cells,
  };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Metrics shown in comparison dropdowns: core KPIs plus contextual diagnostics
 *  that vary across the dataset. Storage capacity and slotting quality are not
 *  operational performance KPIs, but they are useful as explanatory Y axes when
 *  a layout or storage strategy sweep actually changes them. */
export function getActiveMetricColumns(
  points: RunPoint[],
): typeof METRIC_COLUMNS {
  const core = METRIC_COLUMNS.filter((col) => col.essential && !col.structural);
  if (points.length === 0) {
    return core;
  }
  const varies = (col: (typeof METRIC_COLUMNS)[number]): boolean => {
    const first = points[0].metrics[col.id];
    return points.some((p) => p.metrics[col.id] !== first);
  };
  const contextual = METRIC_COLUMNS.filter(
    (col) => !col.essential && col.group && varies(col),
  );
  return [...core.filter(varies), ...contextual];
}

export function getNumericColumns(): Array<{
  id: string;
  label: string;
  source: "factor" | "metric";
  group?: FactorGroup | "Metrics";
}> {
  const factorColumns = FACTOR_REGISTRY.filter(
    (factor) => factor.type === "number",
  ).map((factor) => ({
    id: factor.id,
    label: factor.label,
    source: "factor" as const,
    group: factor.group,
  }));
  const metricColumns = METRIC_COLUMNS.map((column) => ({
    id: column.id,
    label: column.label,
    source: "metric" as const,
    group: "Metrics" as const,
  }));
  return [...factorColumns, ...metricColumns];
}

/** Categorical (enum / preset) factors - candidates for dummy encoding in the
 *  regression. Their value in point.factors is a string, not a number. */
export function getCategoricalFactors(): FactorDef[] {
  return FACTOR_REGISTRY.filter((factor) => factor.type === "enum");
}

/** Distinct levels of a categorical factor actually present in the dataset. */
export function getFactorLevels(points: RunPoint[], factorId: string): string[] {
  const set = new Set<string>();
  for (const point of points) {
    const value = point.factors[factorId];
    if (typeof value === "string") {
      set.add(value);
    }
  }
  return [...set].sort();
}

export function getValueFromPoint(
  point: RunPoint,
  columnId: string,
  source: "factor" | "metric",
): number | undefined {
  if (source === "factor") {
    const raw = point.factors[columnId];
    if (typeof raw === "number") {
      return raw;
    }
    return undefined;
  }
  const raw = point.metrics[columnId];
  return typeof raw === "number" ? raw : undefined;
}

// ---------------------------------------------------------------------------
// Experiment templates — pre-configured LabPlans demonstrating key phenomena.
// ---------------------------------------------------------------------------

export interface ExperimentTemplate {
  id: string;
  title: string;
  /** One-line explanation of what the chart will show. */
  hypothesis: string;
  icon: string;
  seedCount: number;
  simulatedMinutes: number;
  warmupMinutes: number;
  /** Factors swept across multiple values. */
  variableFactors: Array<{ factorId: string; values: FactorValue[] }>;
  /** Factors held constant (single value, overrides base config). */
  contextFactors: Array<{ factorId: string; values: [FactorValue] }>;
}

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  {
    id: "robot_saturation",
    title: "Saturation par robots (R*)",
    hypothesis:
      "Sur un entrepôt réaliste (M, 6 niveaux, 3 stations) le débit grimpe, culmine vers R*≈40 robots, puis recule : ascenseurs et picking saturent et la congestion explose (×40)",
    icon: "📈",
    seedCount: 16,
    simulatedMinutes: 5,
    warmupMinutes: 2,
    variableFactors: [
      // Climb → R*≈40 → léger recul. Trace `steadyThroughputPerMinute` contre
      // robotCount : la courbe monte, plafonne puis recule quand la congestion
      // (×40 entre 8 et 56 robots) l'emporte. Pas régulier de 8, comme l'exige
      // le modèle (start, end, step) de l'éditeur de facteurs.
      // Vérifié headless (8 seeds) : 16.9→26.5→32.1→33.4→34.5→34.0→31.7.
      { factorId: "robotCount", values: [8, 16, 24, 32, 40, 48, 56] },
    ],
    contextFactors: [
      // Entrepôt réaliste : M, 6 niveaux, 3 stations de picking. Le goulot n'est
      // plus un montage jouet (1 station / 1 niveau) mais les vraies ressources
      // partagées d'un entrepôt en hauteur : cages d'ascenseur (1 robot à la fois)
      // et files de picking.
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "levelCount", values: [6] },
      { factorId: "pickingStationCount", values: [3] },
      // Demande au-dessus du plafond soutenable (supply-limited) : le système ne
      // rattrape jamais la file, donc le goulot est bien la capacité interne.
      { factorId: "ordersPerMinute", values: [55] },
      { factorId: "demandPattern", values: ["abc"] },
      { factorId: "peakProfile", values: ["none"] },
      // Chargeurs généreux : la batterie n'est pas le goulot, on isole la congestion.
      { factorId: "chargingStationCount", values: [8] },
      { factorId: "storageStrategy", values: ["abcStorage"] },
      // Flotte coordonnée (réservation + re-routage réactif) : le recul vient
      // d'une vraie limite de capacité physique, pas de collisions naïves.
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
  {
    id: "storage_strategies",
    title: "Stockage : ABC vs random",
    hypothesis:
      "Sur un entrepôt réaliste (M, 6 niveaux), ABC écrase random partout (×2 sur le débit) : trajets courts ET moins de congestion. L'écart persiste même à forte flotte — aucun croisement",
    icon: "📦",
    seedCount: 20,
    simulatedMinutes: 5,
    warmupMinutes: 2,
    variableFactors: [
      // On balaie aussi la taille de flotte pour montrer que l'avantage ABC ne
      // s'érode pas : sur un entrepôt multi-niveaux coordonné, ABC garde ~+10 à
      // +20 caisses/min sur random à tous les effectifs. Trace
      // `steadyThroughputPerMinute` vs robotCount, coloré par storageStrategy :
      // deux courbes parallèles, ABC nettement au-dessus (pas de croisement).
      // Vérifié headless (8 seeds, demande 45) : écart ABC-random 10.5→16.8.
      { factorId: "storageStrategy", values: ["abcStorage", "randomStorage"] },
      { factorId: "robotCount", values: [8, 16, 24, 32, 40, 48] },
    ],
    contextFactors: [
      // Entrepôt réaliste : M, 6 niveaux, 3 stations, flotte coordonnée.
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "levelCount", values: [6] },
      { factorId: "pickingStationCount", values: [3] },
      // Demande supply-limited pour que la qualité du rangement compte vraiment.
      { factorId: "ordersPerMinute", values: [50] },
      // Verrouillé par la règle de confusion (storageStrategy → fixe demandPattern).
      { factorId: "demandPattern", values: ["abc"] },
      { factorId: "peakProfile", values: ["none"] },
      { factorId: "chargingStationCount", values: [8] },
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
  {
    id: "peak_resilience",
    title: "Robustesse aux pics",
    hypothesis:
      "Sur un entrepôt réaliste (M, 6 niveaux), sous un pic ×3 le backlog explose et le taux de service s'effondre ; plus la flotte est grande, mieux elle encaisse",
    icon: "⚡",
    seedCount: 16,
    simulatedMinutes: 7,
    warmupMinutes: 2,
    variableFactors: [
      { factorId: "peakProfile", values: ["none", "moderate", "intense"] },
      { factorId: "robotCount", values: [16, 24, 32] },
    ],
    contextFactors: [
      // Entrepôt réaliste : M, 6 niveaux, 3 stations.
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "levelCount", values: [6] },
      { factorId: "pickingStationCount", values: [3] },
      // Demande de base proche du plafond pour que le pic fasse vraiment mal.
      // Vérifié headless : backlog 58→273 (none→intense à 16 robots), service
      // 65%→31% ; la flotte 32 amortit (service intense 41%).
      { factorId: "ordersPerMinute", values: [38] },
      { factorId: "demandPattern", values: ["abc"] },
      { factorId: "chargingStationCount", values: [8] },
      { factorId: "storageStrategy", values: ["abcStorage"] },
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
  {
    id: "vertical_topology",
    title: "Topologie verticale",
    hypothesis:
      "Ajouter des niveaux densifie le stockage mais allonge les cycles et la pression verticale",
    icon: "🏗️",
    seedCount: 20,
    simulatedMinutes: 5,
    warmupMinutes: 1,
    variableFactors: [
      { factorId: "levelCount", values: [1, 2, 3, 4] },
    ],
    contextFactors: [
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "ordersPerMinute", values: [30] },
      { factorId: "demandPattern", values: ["abc"] },
      { factorId: "peakProfile", values: ["none"] },
      { factorId: "pickingStationCount", values: [3] },
      { factorId: "chargingStationCount", values: [6] },
      // Enough robots to handle vertical travel overhead at 4 levels.
      { factorId: "robotCount", values: [18] },
      { factorId: "storageStrategy", values: ["abcStorage"] },
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
  {
    id: "vertical_pressure",
    title: "Pression verticale (M, 6 niveaux)",
    hypothesis:
      "Sur 6 niveaux, ajouter des robots cesse de payer une fois les ascenseurs saturés : le débit plafonne et la congestion migre vers les cages.",
    icon: "🛗",
    seedCount: 12,
    simulatedMinutes: 4,
    warmupMinutes: 1,
    variableFactors: [
      // Climb → plateau : à bas effectif le débit suit la flotte, puis bute sur
      // la capacité des allées d'ascenseur (ressource partagée, 1 robot à la fois)
      // que toute la hauteur doit traverser. Pas régulier de 8, comme l'exige le
      // modèle (start, end, step) de l'éditeur de facteurs.
      { factorId: "robotCount", values: [8, 16, 24, 32, 40, 48] },
    ],
    contextFactors: [
      // Entrepôt réaliste : taille M, 6 niveaux, 3 stations de picking.
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "levelCount", values: [6] },
      { factorId: "pickingStationCount", values: [3] },
      // Demande au-dessus du plafond vertical (supply-limited) : le système ne
      // rattrape jamais la demande, donc le goulot est bien l'ascenseur, pas la
      // file de commandes.
      { factorId: "ordersPerMinute", values: [45] },
      { factorId: "demandPattern", values: ["abc"] },
      { factorId: "peakProfile", values: ["none"] },
      // Chargeurs généreux : la batterie n'est pas le goulot, on isole le vertical.
      { factorId: "chargingStationCount", values: [8] },
      { factorId: "storageStrategy", values: ["abcStorage"] },
      // Flotte coordonnée (réservation + re-routage réactif) : le plateau vient
      // d'une vraie limite de capacité, pas de collisions naïves.
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
  {
    id: "capacity_map",
    title: "Carte de capacité (M, 6 niveaux)",
    hypothesis:
      "Croise flotte × cadence : la heatmap des Outils trace la frontière de faisabilité — combien de robots il faut pour tenir chaque débit avant que le backlog explose.",
    icon: "🗺️",
    seedCount: 8,
    simulatedMinutes: 4,
    warmupMinutes: 1,
    // Deux facteurs croisés : c'est ce que la heatmap 2D des Outils sait afficher.
    variableFactors: [
      { factorId: "robotCount", values: [12, 24, 36, 48, 60] },
      { factorId: "ordersPerMinute", values: [20, 30, 40, 50, 60] },
    ],
    contextFactors: [
      // Entrepôt réaliste : taille M, 6 niveaux, 3 stations.
      { factorId: "warehouseSize", values: ["m"] },
      { factorId: "levelCount", values: [6] },
      { factorId: "pickingStationCount", values: [3] },
      { factorId: "demandPattern", values: ["abc"] },
      // Régime stationnaire (pas de pic) : on lit une vraie capacité soutenue.
      { factorId: "peakProfile", values: ["none"] },
      { factorId: "chargingStationCount", values: [8] },
      { factorId: "storageStrategy", values: ["abcStorage"] },
      { factorId: "pathfindingStrategy", values: ["reservation"] },
      { factorId: "reroutingPolicy", values: ["reactive"] },
    ],
  },
];

/** Build a complete LabPlan from a template. Required factors not listed in
 *  the template fall back to their registry defaults via ensureRequiredFactorValues. */
export function buildPlanFromTemplate(template: ExperimentTemplate): LabPlan {
  const base = buildDefaultLabPlan();

  const variableMap = new Map(
    template.variableFactors.map(({ factorId, values }) => [factorId, values]),
  );
  const contextMap = new Map(
    template.contextFactors.map(({ factorId, values }) => [
      factorId,
      values as FactorValue[],
    ]),
  );

  const factorRoles: Record<string, FactorRole> = {};
  for (const binding of base.bindings) {
    if (variableMap.has(binding.factorId)) {
      factorRoles[binding.factorId] = "variable";
    } else if (contextMap.has(binding.factorId)) {
      factorRoles[binding.factorId] = "context";
    } else {
      factorRoles[binding.factorId] = "variable"; // lands on shelf (no values)
    }
  }

  const bindings = base.bindings.map((binding) => {
    if (variableMap.has(binding.factorId)) {
      return { factorId: binding.factorId, values: variableMap.get(binding.factorId)! };
    }
    if (contextMap.has(binding.factorId)) {
      return { factorId: binding.factorId, values: contextMap.get(binding.factorId)! };
    }
    return { factorId: binding.factorId, values: [] };
  });

  return ensureRequiredFactorValues({
    bindings,
    factorRoles,
    seedCount: template.seedCount,
    simulatedMinutes: template.simulatedMinutes,
    warmupMinutes: template.warmupMinutes,
  });
}
