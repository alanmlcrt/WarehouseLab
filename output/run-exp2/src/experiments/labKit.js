import { SimulationEngine } from "../simulation/core/SimulationEngine";
import { getEffectiveCrateOrdersPerMinute } from "../simulation/core/demand";
import { deriveBatteryWeightKg } from "../simulation/core/derivedConfig";
import { cloneConfig } from "../simulation/scenarios/presets";
// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------
/** Relative CAPEX proxy (arbitrary cost units). A robot dominates the bill;
 *  a charger is a fraction of it. Used only for cost/service trade-off plots,
 *  so absolute units don't matter - only the ratio between the two does. */
export const ROBOT_COST_UNIT = 10;
export const CHARGER_COST_UNIT = 3;
/** Setting rackCount to this value tells the factory to fill the grid to
 *  capacity - it stops naturally when no valid positions remain. */
export const RACK_FILL_SENTINEL = 9999;
/** Max robots the engine allows on a given floor before clamping, to keep the
 *  grid from jamming. One robot per 4 cells. Shared by the engine clamp and the
 *  PlanEditor warning so the rule lives in one place. */
export const ROBOT_DENSITY_CELLS_PER_ROBOT = 4;
export function maxRobotsForArea(width, height) {
    return Math.max(1, Math.floor((width * height) / ROBOT_DENSITY_CELLS_PER_ROBOT));
}
export const WAREHOUSE_SIZE_PRESETS = {
    xs: { label: "XS  (12x10)", width: 12, height: 10 },
    s: { label: "S   (18x14)", width: 18, height: 14 },
    m: { label: "M   (24x18)", width: 24, height: 18 },
    l: { label: "L   (32x24)", width: 32, height: 24 },
    xl: { label: "XL  (42x30)", width: 42, height: 30 },
    custom: { label: "Custom", width: 0, height: 0 },
};
export const PEAK_PROFILE_PRESETS = {
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
export const FACTOR_REGISTRY = [
    {
        id: "robotCount",
        label: "Nombre de robots",
        group: "Robots",
        path: "robots.robotCount",
        type: "number",
        defaultValues: [6, 10, 14, 18, 22],
        min: 1,
        max: 80,
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
export const CONFOUND_RULES = [
    {
        trigger: "storageStrategy",
        lock: ["demandPattern"],
        why: "Pour isoler l'effet d'une stratégie de stockage, le profil de demande doit rester constant.",
    },
    {
        trigger: "demandPattern",
        lock: ["ordersPerMinute"],
        why: "Pour mesurer l'effet d'un profil de demande, fixe l'intensité globale.",
    },
    {
        trigger: "ordersPerMinute",
        lock: ["peakProfile"],
        why: "Faire varier la cadence ET le profil de pic mélange régime stationnaire et surcharge transitoire.",
    },
    {
        trigger: "robotCount",
        lock: ["chargingStationCount"],
        why: "Pour trouver le R* optimal, garde le nombre de chargeurs fixe — sinon le palier de saturation se déplace pour deux raisons.",
    },
    {
        trigger: "warehouseSize",
        lock: ["crossAisleSpacing", "levelCount", "pickingStationCount"],
        why: "Comparer plusieurs tailles d'entrepôt change déjà énormément la géométrie ; fixe les autres paramètres structurels.",
    },
];
/** Returns the set of factor ids that should be locked (forced to context, 1 val)
 *  given the current plan, plus the rules that triggered each lock. */
export function computeLockedFactors(plan) {
    const locked = new Map();
    const bindings = new Map(plan.bindings.map((b) => [b.factorId, b]));
    for (const rule of CONFOUND_RULES) {
        const triggerRole = plan.factorRoles?.[rule.trigger] ?? "variable";
        const triggerValues = bindings.get(rule.trigger)?.values ?? [];
        const isVaried = triggerRole === "variable" && triggerValues.length > 1;
        if (!isVaried)
            continue;
        const triggerLabel = getFactorById(rule.trigger)?.label ?? rule.trigger;
        for (const lockedId of rule.lock) {
            if (!locked.has(lockedId)) {
                locked.set(lockedId, { rule, triggerLabel });
            }
        }
    }
    return locked;
}
/** Soft confound advisory: the rules now produce a non-blocking warning
 *  surfaced in the banner. The user is free to vary several factors at once
 *  (interaction studies need this). This function is kept as a no-op for
 *  callers that still wrap the plan — the plan stays untouched. */
export function applyConfoundLocks(plan) {
    return plan;
}
// ---------------------------------------------------------------------------
// Required factors — the user MUST pick a value (Fixé or À tester). They
// cannot be left out via the shelf because the engine's behaviour materially
// depends on them and falling back to a silent preset default would hide a
// real decision (e.g. "how many levels does my warehouse have?").
// ---------------------------------------------------------------------------
export const REQUIRED_FACTOR_IDS = new Set([
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
export function isRequiredFactor(id) {
    return REQUIRED_FACTOR_IDS.has(id);
}
/** Normalise a plan so every required factor has at least one value and a
 *  role (context by default). Used after every mutation to keep the invariant
 *  even if a saved campaign predates the rule. */
export function ensureRequiredFactorValues(plan) {
    let mutated = false;
    const factorRoles = { ...plan.factorRoles };
    const bindings = plan.bindings.map((binding) => {
        if (!isRequiredFactor(binding.factorId))
            return binding;
        const factor = getFactorById(binding.factorId);
        if (!factor)
            return binding;
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
export const METRIC_COLUMNS = [
    { id: "derivedMaxBattery", label: "Capacité batterie (dérivée)", unit: "énergie", structural: true },
    { id: "effectiveRackCount", label: "Emplacements de stockage", unit: "racks", structural: true, essential: true, group: "Stockage" },
    { id: "rackDensityPct", label: "Densité de stockage", unit: "%", structural: true },
    { id: "warehouseWidth", label: "Largeur réelle", unit: "cellules", structural: true },
    { id: "warehouseHeight", label: "Profondeur réelle", unit: "cellules", structural: true },
    { id: "steadyThroughputPerMinute", label: "Débit", unit: "caisses/min", essential: true, group: "Performance" },
    { id: "throughputPerMinute", label: "Débit instantané (60s)", unit: "caisses/min" },
    { id: "demandPerMinute", label: "Demande", unit: "caisses/min" },
    { id: "feasibilityMargin", label: "Marge de capacité", unit: "ratio", essential: true, group: "Performance" },
    { id: "steadyUtilization", label: "Utilisation steady-state", unit: "ratio" },
    { id: "steadyBacklog", label: "Backlog moyen", unit: "commandes", essential: true, group: "Performance" },
    { id: "serviceLevel", label: "Taux de service", unit: "%", essential: true, group: "Performance" },
    { id: "throughputPerRobot", label: "Débit / robot", unit: "caisses/min/robot", essential: true, group: "Performance" },
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
    { id: "slottingEfficiency", label: "Qualité du rangement", essential: true, group: "Stockage" },
    { id: "demandWeightedStorageDistance", label: "Distance pondérée" },
    { id: "fastMovingStorageDistance", label: "Distance SKU rapides" },
    { id: "elevatorTrips", label: "Trajets verticaux" },
    { id: "verticalPressure", label: "Pression verticale" },
];
/** Maximum number of replications (seeds) per configuration. Higher = tighter
 *  confidence on every mean/std, at a linear cost in run time. */
export const MAX_SEEDS = 100;
export const MIN_SEEDS = 50;
/** Deterministic, well-spread seed offsets for any replication index, so the
 *  lab is no longer capped at a handful of hardcoded seeds. Index 0 keeps the
 *  base seeds (offset 0) for reproducibility with single-seed runs. */
function getSeedOffset(index) {
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
    const hash = (salt) => {
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
export function getFactorById(id) {
    return FACTOR_REGISTRY.find((factor) => factor.id === id);
}
export function getActiveFactorBindings(plan) {
    return plan.bindings.filter((binding) => binding.values.length > 0);
}
export function buildDefaultLabPlan() {
    const contextIds = new Set([
        "warehouseSize",
        "ordersPerMinute",
        "demandPattern",
        "peakProfile",
        "pickingStationCount",
        "chargingStationCount",
        "levelCount",
    ]);
    const built = {
        seedCount: 50,
        simulatedMinutes: 3,
        warmupMinutes: 1,
        factorRoles: Object.fromEntries(FACTOR_REGISTRY.map((factor) => [
            factor.id,
            contextIds.has(factor.id) ? "context" : "variable",
        ])),
        bindings: FACTOR_REGISTRY.map((factor) => ({
            factorId: factor.id,
            values: factor.id === "robotCount"
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
export function countPlanCombinations(plan) {
    return getRunFactorBindings(plan).reduce((product, binding) => product * Math.max(1, binding.values.length), 1);
}
export function countPlanRuns(plan) {
    const seeds = Math.max(MIN_SEEDS, Math.min(plan.seedCount, MAX_SEEDS));
    return countPlanCombinations(plan) * seeds;
}
export async function runLab({ baseConfig, plan, onProgress, }) {
    const bindings = getActiveFactorBindings(plan);
    const combinations = enumerateCombinations(getRunFactorBindings(plan));
    const seedCount = Math.max(MIN_SEEDS, Math.min(plan.seedCount, MAX_SEEDS));
    const ticksPerRun = Math.max(120, Math.round((plan.simulatedMinutes * 60) / baseConfig.tickDurationSeconds));
    const points = [];
    const totalRuns = combinations.length * seedCount;
    let completed = 0;
    // The loop runs on the main thread. Reporting progress + yielding after every
    // single run forced one React re-render + repaint per run, which dwarfed the
    // ~20 ms of actual compute (the engine alone does ~50 runs/s). Throttle both
    // to ~60 ms wall-clock so the UI stays responsive without paying a render tax
    // on every run.
    const PROGRESS_INTERVAL_MS = 60;
    let lastTick = performance.now();
    onProgress?.({ completedRuns: 0, totalRuns, currentLabel: "Démarrage…" });
    for (const combination of combinations) {
        for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
            const config = applyCombination(baseConfig, combination, seedIndex);
            const label = buildLabel(combination, seedIndex);
            const engine = new SimulationEngine(config);
            for (let tick = 0; tick < ticksPerRun; tick += 1) {
                engine.tick();
            }
            const snapshot = engine.getSnapshot(false, 1);
            const demand = getEffectiveCrateOrdersPerMinute(config.demand, 0);
            const effectiveRackCount = snapshot.warehouse.racks.length;
            const steady = computeSteadyState(snapshot.metrics.series, plan.warmupMinutes * 60, config.robots.robotCount);
            const metrics = flattenMetrics(snapshot.metrics, demand, config.robots.maxBattery, effectiveRackCount, config.warehouse.width, config.warehouse.height, config.robots.robotCount, config.warehouse.chargingStationCount);
            // Feasibility judged on the stationary regime, not the noisy 60 s snapshot.
            const feasibilityMargin = demand > 0
                ? (steady.steadyThroughputPerMinute - demand) / demand
                : 0;
            const point = {
                id: `${label}-${seedIndex + 1}`,
                seedIndex,
                factors: Object.fromEntries(combination.map((entry) => {
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
                })),
                metrics: {
                    ...metrics,
                    steadyThroughputPerMinute: steady.steadyThroughputPerMinute,
                    steadyUtilization: steady.steadyUtilization,
                    steadyBacklog: steady.steadyBacklog,
                    demandPerMinute: demand,
                    feasibilityMargin,
                },
                feasible: steady.steadyThroughputPerMinute >= demand * 0.98,
                physicalSnapshot: capturePhysicalSnapshot(snapshot),
            };
            points.push(point);
            completed += 1;
            // Only surface progress + hand control back to the browser every
            // ~60 ms, not every run — that's what keeps the UI alive without one
            // re-render/repaint per simulation.
            const now = performance.now();
            if (now - lastTick >= PROGRESS_INTERVAL_MS) {
                onProgress?.({ completedRuns: completed, totalRuns, currentLabel: label });
                await yieldToBrowser();
                lastTick = now;
            }
        }
    }
    onProgress?.({
        completedRuns: totalRuns,
        totalRuns,
        currentLabel: "Terminé",
    });
    return points;
}
function getFactorRole(plan, factorId) {
    return plan.factorRoles?.[factorId] ?? "variable";
}
function getRunFactorBindings(plan) {
    return getActiveFactorBindings(plan).map((binding) => {
        if (getFactorRole(plan, binding.factorId) === "context") {
            return { ...binding, values: binding.values.slice(0, 1) };
        }
        return binding;
    });
}
function enumerateCombinations(bindings) {
    if (bindings.length === 0) {
        return [[]];
    }
    const results = [[]];
    for (const binding of bindings) {
        const next = [];
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
function applyCombination(baseConfig, combination, seedIndex) {
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
            const preset = WAREHOUSE_SIZE_PRESETS[entry.value];
            if (preset && preset.width > 0 && preset.height > 0) {
                config.warehouse.width = preset.width;
                config.warehouse.height = preset.height;
                config.warehouse.rackCount = RACK_FILL_SENTINEL;
            }
            continue;
        }
        // Compound factor: peakProfile -> expand into the four demand peak fields.
        if (factor.compound && entry.factorId === "peakProfile") {
            const preset = PEAK_PROFILE_PRESETS[entry.value];
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
        config.robots.batteryWeightKg = deriveBatteryWeightKg(config.robots.maxBattery);
    }
    // Clamp robotCount to a sensible density relative to warehouse floor area
    // so extreme combinations don't jam the grid with hundreds of robots.
    const maxRobotsForFloor = maxRobotsForArea(config.warehouse.width, config.warehouse.height);
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
function setByPath(target, path, value) {
    const segments = path.split(".");
    let cursor = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        cursor = cursor[segments[index]];
    }
    cursor[segments[segments.length - 1]] = value;
}
function getByPath(target, path) {
    const segments = path.split(".");
    let cursor = target;
    for (const segment of segments) {
        if (cursor == null) {
            return undefined;
        }
        cursor = cursor[segment];
    }
    return cursor;
}
/** Steady-state output analysis via the deletion method: drop the warm-up
 *  transient, then measure the stationary regime from the time series.
 *  Falls back gracefully to the whole window when the series is too short. */
export function computeSteadyState(series, warmupSeconds, robotCount) {
    if (series.length < 2) {
        const only = series[0];
        return {
            steadyThroughputPerMinute: only?.throughputPerMinute ?? 0,
            steadyUtilization: only?.averageRobotUtilization ?? 0,
            steadyBacklog: only?.pendingOrders ?? 0,
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
    const steadyThroughputPerMinute = deltaSeconds > 0
        ? ((last.completedOrders - first.completedOrders) / deltaSeconds) * 60
        : last.throughputPerMinute;
    const meanActive = window.reduce((sum, sample) => sum + sample.activeRobots, 0) / window.length;
    const meanBacklog = window.reduce((sum, sample) => sum + sample.pendingOrders, 0) / window.length;
    return {
        steadyThroughputPerMinute,
        steadyUtilization: meanActive / Math.max(1, robotCount),
        steadyBacklog: meanBacklog,
        warmupSecondsUsed: warmupUsed,
    };
}
function flattenMetrics(metrics, demand, derivedMaxBattery, effectiveRackCount, warehouseWidth, warehouseHeight, effectiveRobotCount, chargingStationCount) {
    const completed = Math.max(1, metrics.completedOrders);
    // Order service level (fill rate): share of created orders actually fulfilled
    // by the end of the run. The remainder is still sitting in the backlog.
    const totalOrders = metrics.completedOrders + metrics.pendingOrders;
    const serviceLevel = totalOrders > 0 ? metrics.completedOrders / totalOrders : 1;
    return {
        derivedMaxBattery,
        effectiveRackCount,
        effectiveRobotCount,
        warehouseWidth,
        warehouseHeight,
        rackDensityPct: (effectiveRackCount / Math.max(1, warehouseWidth * warehouseHeight)) * 100,
        throughputPerMinute: metrics.throughputPerMinute,
        serviceLevel,
        throughputPerRobot: metrics.throughputPerMinute / Math.max(1, effectiveRobotCount),
        backlogRatio: metrics.pendingOrders / completed,
        costProxy: effectiveRobotCount * ROBOT_COST_UNIT +
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
        chargingShare: metrics.chargingTicks /
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
function buildLabel(combination, seedIndex) {
    if (combination.length === 0) {
        return `base-s${seedIndex + 1}`;
    }
    return combination
        .map((entry) => `${entry.factorId}=${entry.value}`)
        .concat(`s${seedIndex + 1}`)
        .join("|");
}
function capturePhysicalSnapshot(state) {
    let maxTraffic = 0;
    let maxWait = 0;
    const cells = [];
    for (const cell of state.warehouse.cells) {
        maxTraffic = Math.max(maxTraffic, cell.trafficCount);
        maxWait = Math.max(maxWait, cell.waitCount);
        if (cell.type === "empty" && cell.trafficCount === 0 && cell.waitCount === 0) {
            continue;
        }
        cells.push({
            x: cell.x,
            y: cell.y,
            type: cell.type,
            traffic: cell.trafficCount,
            wait: cell.waitCount,
        });
    }
    return {
        width: state.warehouse.width,
        height: state.warehouse.height,
        rackCount: state.warehouse.racks.length,
        stationCount: state.warehouse.pickingStations.length,
        chargerCount: state.warehouse.chargingStations.length,
        elevatorAisleCount: state.warehouse.elevatorZones.length,
        maxTraffic,
        maxWait,
        cells,
    };
}
function yieldToBrowser() {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}
/** Metrics shown in comparison dropdowns: essential KPIs AND structural
 *  quantities that vary across the dataset (storage capacity, dimensions...).
 *  Structural metrics are useful as Y axes when the user compares geometry
 *  changes — they expose the design trade-off (e.g. more aisles = fewer racks).
 *  Falls back to the essential list when the dataset is empty. */
export function getActiveMetricColumns(points) {
    const essentials = METRIC_COLUMNS.filter((col) => col.essential);
    if (points.length === 0) {
        return essentials.filter((col) => !col.structural);
    }
    return essentials.filter((col) => {
        const first = points[0].metrics[col.id];
        return points.some((p) => p.metrics[col.id] !== first);
    });
}
export function getNumericColumns() {
    const factorColumns = FACTOR_REGISTRY.filter((factor) => factor.type === "number").map((factor) => ({
        id: factor.id,
        label: factor.label,
        source: "factor",
        group: factor.group,
    }));
    const metricColumns = METRIC_COLUMNS.map((column) => ({
        id: column.id,
        label: column.label,
        source: "metric",
        group: "Metrics",
    }));
    return [...factorColumns, ...metricColumns];
}
/** Categorical (enum / preset) factors - candidates for dummy encoding in the
 *  regression. Their value in point.factors is a string, not a number. */
export function getCategoricalFactors() {
    return FACTOR_REGISTRY.filter((factor) => factor.type === "enum");
}
/** Distinct levels of a categorical factor actually present in the dataset. */
export function getFactorLevels(points, factorId) {
    const set = new Set();
    for (const point of points) {
        const value = point.factors[factorId];
        if (typeof value === "string") {
            set.add(value);
        }
    }
    return [...set].sort();
}
export function getValueFromPoint(point, columnId, source) {
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
