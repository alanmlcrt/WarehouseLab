import { buildSeedsFromMaster, deriveBatteryWeightKg, } from "../core/derivedConfig";
const baseConfig = {
    scenarioId: "small-basic",
    name: "Small Basic",
    tickDurationSeconds: 1,
    warehouse: {
        width: 18,
        height: 14,
        levelCount: 4,
        verticalAccessLineCount: 1,
        subMatrixRows: 1,
        subMatrixColumns: 1,
        interMatrixCorridorWidth: 1,
        crossAisleSpacing: 2,
        storageDensity: 1,
        rackCount: 36,
        pickingStationCount: 2,
        pickingStationOrientation: "length",
        chargingStationCount: 3,
        layoutPreset: "small",
    },
    robots: {
        robotCount: 10,
        speedCellsPerTick: 1,
        capacity: 1,
        payloadKg: 12,
        baseWeightKg: 38,
        batteryWeightKg: deriveBatteryWeightKg(100),
        maxBattery: 100,
        energyPerCell: 0.2,
        rechargeThreshold: 15,
        rechargeTicks: 40,
        failureProbability: 0,
        meanFailureTicks: 60,
    },
    demand: {
        demandPattern: "abc",
        ordersPerMinute: 18,
        averageItemsPerOrder: 1,
        urgentOrderRate: 0.04,
        peakDemandEnabled: false,
        peakMultiplier: 2,
        peakStartMinute: 5,
        peakDurationMinutes: 3,
    },
    storage: {
        strategy: "abcStorage",
        skuCount: 80,
        dynamicSlottingEnabled: false,
        familyGroupingEnabled: false,
    },
    movement: {
        // Default movement stack = properly coordinated fleet. Avoids swap
        // deadlocks (reservation) and lets robots dodge live congestion (reactive).
        // Studies wanting to expose the degradation can downgrade to manhattan+fixed.
        pathfindingStrategy: "reservation",
        taskAssignmentStrategy: "nearestRobot",
        reroutingPolicy: "reactive",
        collisionAvoidance: true,
        temporalReservation: true,
        trafficMode: "autonomous",
    },
    seeds: buildSeedsFromMaster(1234),
};
export const scenarios = [
    scenario("small-basic", "Small Basic", "Entrepôt compact et équilibré.", {}),
    scenario("random-storage", "Random Storage", "Stockage aleatoire avec demande ABC.", {
        storage: { strategy: "randomStorage" },
        seeds: { layoutSeed: 2468 },
    }),
    scenario("abc-storage", "ABC Storage", "Articles rapides proches des stations.", {
        storage: { strategy: "abcStorage" },
        seeds: { layoutSeed: 2468 },
    }),
    scenario("high-demand", "High Demand", "Demande soutenue pour tester le backlog.", {
        demand: { ordersPerMinute: 34 },
        robots: { robotCount: 14 },
    }),
    scenario("congestion-test", "Congestion Test", "Beaucoup de robots dans un espace limite.", {
        robots: { robotCount: 20 },
        warehouse: { width: 16, height: 12, rackCount: 34 },
        demand: { ordersPerMinute: 26 },
    }),
    scenario("astar-anti-congestion", "A* anti-congestion", "A* avec cout pondere trafic pour eviter les couloirs satures.", {
        movement: { pathfindingStrategy: "astar" },
        robots: { robotCount: 18 },
        warehouse: { width: 18, height: 14, rackCount: 38 },
        demand: { ordersPerMinute: 28 },
    }),
    scenario("peak-demand", "Peak Demand", "Pic temporaire de demande.", {
        demand: {
            ordersPerMinute: 14,
            peakDemandEnabled: true,
            peakMultiplier: 3,
            peakStartMinute: 2,
            peakDurationMinutes: 4,
        },
    }),
    scenario("robot-failures", "Robot Failures", "Configuration preparee pour les pannes.", {
        robots: { failureProbability: 0.002, meanFailureTicks: 45 },
    }),
    scenario("battery-stress", "Battery Stress", "Batterie reduite, robots forces de se recharger.", {
        robots: {
            maxBattery: 40,
            energyPerCell: 0.6,
            rechargeThreshold: 18,
            rechargeTicks: 30,
        },
        warehouse: { chargingStationCount: 4 },
    }),
    scenario("ops-tradeoff", "Compromis opérationnels", "Pic de demande, recharge, congestion et stations en tension.", {
        warehouse: {
            width: 24,
            height: 18,
            levelCount: 5,
            crossAisleSpacing: 3,
            storageDensity: 1,
            rackCount: 9999,
            pickingStationCount: 3,
            pickingStationOrientation: "length",
            chargingStationCount: 4,
            layoutPreset: "balanced",
        },
        robots: {
            robotCount: 8,
            payloadKg: 16,
            maxBattery: 86,
            energyPerCell: 0.34,
            rechargeThreshold: 22,
            rechargeTicks: 46,
            failureProbability: 0.001,
            meanFailureTicks: 45,
        },
        demand: {
            demandPattern: "pareto",
            ordersPerMinute: 3,
            averageItemsPerOrder: 1,
            urgentOrderRate: 0.1,
            peakDemandEnabled: true,
            peakMultiplier: 2,
            peakStartMinute: 2,
            peakDurationMinutes: 3,
        },
        storage: {
            strategy: "balancedABCStorage",
            skuCount: 120,
        },
        movement: {
            pathfindingStrategy: "astar",
            taskAssignmentStrategy: "nearestRobot",
            reroutingPolicy: "reactive",
            temporalReservation: true,
        },
        seeds: { layoutSeed: 4242 },
    }),
    scenario("rails-guided-placeholder", "Rails Guided Placeholder", "Scenario rails guides prepare dans l'architecture.", {
        movement: { trafficMode: "rails-guided" },
        warehouse: { layoutPreset: "rails-placeholder" },
        storage: { strategy: "abcStorage" },
    }),
];
export function getScenarioById(id) {
    return scenarios.find((scenarioDefinition) => scenarioDefinition.id === id) ?? scenarios[0];
}
export function cloneConfig(config) {
    const cloned = JSON.parse(JSON.stringify(config));
    return normalizeConfig(cloned);
}
export function normalizeConfig(config) {
    const masterSeed = config.seeds.layoutSeed;
    return {
        ...config,
        robots: {
            ...config.robots,
            batteryWeightKg: deriveBatteryWeightKg(config.robots.maxBattery),
        },
        demand: {
            ...config.demand,
            averageItemsPerOrder: 1,
        },
        seeds: buildSeedsFromMaster(masterSeed),
    };
}
function scenario(id, name, description, overrides) {
    const config = mergeConfig(baseConfig, overrides);
    config.scenarioId = id;
    config.name = name;
    return {
        id,
        name,
        description,
        config,
    };
}
function mergeConfig(config, overrides) {
    return normalizeConfig({
        ...cloneConfig(config),
        warehouse: { ...config.warehouse, ...overrides.warehouse },
        robots: { ...config.robots, ...overrides.robots },
        demand: { ...config.demand, ...overrides.demand },
        storage: { ...config.storage, ...overrides.storage },
        movement: { ...config.movement, ...overrides.movement },
        seeds: { ...config.seeds, ...overrides.seeds },
    });
}
