export function createEmptyMetrics() {
    return {
        completedOrders: 0,
        averageProcessingTime: 0,
        totalDistance: 0,
        averageDistancePerOrder: 0,
        averageRobotUtilization: 0,
        activeRobots: 0,
        pendingOrders: 0,
        throughputPerMinute: 0,
        congestionEvents: 0,
        connectorTraffic: 0,
        connectorWait: 0,
        energyConsumed: 0,
        chargingTicks: 0,
        chargeSessions: 0,
        elevatorTrips: 0,
        elevatorRideTicks: 0,
        elevatorWaitTicks: 0,
        depletionEvents: 0,
        averageBatteryLevel: 0,
        minimumBatteryLevel: 0,
        demandWeightedStorageDistance: 0,
        fastMovingStorageDistance: 0,
        slowMovingStorageDistance: 0,
        slottingEfficiency: 0,
        verticalPressure: 0,
        series: [],
    };
}
export function calculateMetrics(input) {
    const totalDistance = input.robots.reduce((sum, robot) => sum + robot.distanceTravelled, 0);
    const energyConsumed = input.robots.reduce((sum, robot) => sum + robot.energyConsumed, 0);
    const chargingTicks = input.robots.reduce((sum, robot) => sum + robot.chargingTicks, 0);
    const chargeSessions = input.robots.reduce((sum, robot) => sum + robot.chargeSessions, 0);
    const elevatorTrips = input.warehouse.elevatorZones.reduce((sum, elevator) => sum + elevator.tripsCompleted, 0);
    const elevatorRideTicks = input.robots.reduce((sum, robot) => sum + robot.elevatorRideTicks, 0);
    const elevatorWaitTicks = input.robots.reduce((sum, robot) => sum + robot.elevatorWaitTicks, 0);
    const averageBatteryLevel = input.robots.length === 0
        ? 0
        : input.robots.reduce((sum, robot) => sum + robot.battery, 0) /
            input.robots.length;
    const minimumBatteryLevel = input.robots.length === 0
        ? 0
        : Math.min(...input.robots.map((robot) => robot.battery));
    const completedOrders = input.completedOrders.length;
    const pendingOrders = input.orders.filter((order) => order.status === "pending")
        .length;
    const activeRobots = input.robots.filter((robot) => robot.assignedOrderId || robot.state === "picking" || robot.state === "droppingOff").length;
    const averageProcessingTime = completedOrders === 0
        ? 0
        : input.completedOrders.reduce((sum, order) => {
            if (order.completedAt === undefined) {
                return sum;
            }
            return sum + (order.completedAt - order.createdAt);
        }, 0) / completedOrders;
    const averageRobotUtilization = input.robots.length === 0 || input.tick === 0
        ? 0
        : input.robots.reduce((sum, robot) => sum + robot.activeTicks, 0) /
            (input.tick * input.robots.length);
    const completedLastMinute = input.completedOrders.filter((order) => order.completedAt !== undefined &&
        order.completedAt >= Math.max(0, input.elapsedSeconds - 60)).length;
    const throughputPerMinute = input.elapsedSeconds < 60
        ? completedOrders / Math.max(1, input.elapsedSeconds / 60)
        : completedLastMinute;
    const sample = {
        tick: input.tick,
        elapsedSeconds: input.elapsedSeconds,
        completedOrders,
        completedThisTick: input.completedThisTick,
        pendingOrders,
        activeRobots,
        averageProcessingTime,
        averageRobotUtilization,
        totalDistance,
        congestionEvents: input.congestionEvents,
        throughputPerMinute,
    };
    const slotting = input.slotting ?? calculateSlottingMetrics(input.warehouse);
    return {
        completedOrders,
        averageProcessingTime,
        totalDistance,
        averageDistancePerOrder: completedOrders === 0 ? 0 : totalDistance / completedOrders,
        averageRobotUtilization,
        activeRobots,
        pendingOrders,
        throughputPerMinute,
        congestionEvents: input.congestionEvents,
        connectorTraffic: input.connectorTraffic,
        connectorWait: input.connectorWait,
        energyConsumed,
        chargingTicks,
        chargeSessions,
        elevatorTrips,
        elevatorRideTicks,
        elevatorWaitTicks,
        depletionEvents: input.depletionEvents,
        averageBatteryLevel,
        minimumBatteryLevel,
        demandWeightedStorageDistance: slotting.demandWeightedStorageDistance,
        fastMovingStorageDistance: slotting.fastMovingStorageDistance,
        slowMovingStorageDistance: slotting.slowMovingStorageDistance,
        slottingEfficiency: slotting.slottingEfficiency,
        verticalPressure: (elevatorWaitTicks + elevatorRideTicks) /
            Math.max(1, input.tick * Math.max(1, input.warehouse.elevatorZones.length)),
        series: [...input.previousSeries, sample].slice(-240),
    };
}
export function calculateSlottingMetrics(warehouse) {
    const locationById = new Map(warehouse.storageLocations.map((location) => [location.id, location]));
    const locatedSkus = warehouse.skuCatalog
        .map((sku) => ({
        sku,
        location: sku.currentLocation
            ? locationById.get(sku.currentLocation)
            : undefined,
    }))
        .filter((entry) => Boolean(entry.location));
    if (locatedSkus.length === 0) {
        return {
            demandWeightedStorageDistance: 0,
            fastMovingStorageDistance: 0,
            slowMovingStorageDistance: 0,
            slottingEfficiency: 0,
        };
    }
    const demandSum = locatedSkus.reduce((sum, entry) => sum + entry.sku.demandWeight, 0);
    const demandWeightedStorageDistance = locatedSkus.reduce((sum, entry) => sum + entry.sku.demandWeight * entry.location.distanceToNearestStation, 0) / Math.max(1, demandSum);
    const fast = locatedSkus.filter((entry) => entry.sku.category === "fast-moving");
    const slow = locatedSkus.filter((entry) => entry.sku.category === "slow-moving");
    const distances = locatedSkus
        .map((entry) => entry.location.distanceToNearestStation)
        .sort((a, b) => a - b);
    const demands = locatedSkus
        .map((entry) => entry.sku.demandWeight)
        .sort((a, b) => b - a);
    const ideal = weightedDistanceForSorted(distances, demands);
    const worst = weightedDistanceForSorted([...distances].reverse(), demands);
    const slottingEfficiency = worst === ideal
        ? 1
        : Math.max(0, Math.min(1, (worst - demandWeightedStorageDistance) / (worst - ideal)));
    return {
        demandWeightedStorageDistance,
        fastMovingStorageDistance: averageDistance(fast.map((entry) => entry.location)),
        slowMovingStorageDistance: averageDistance(slow.map((entry) => entry.location)),
        slottingEfficiency,
    };
}
function weightedDistanceForSorted(distances, demands) {
    const demandSum = demands.reduce((sum, demand) => sum + demand, 0);
    return distances.reduce((sum, distance, index) => sum + distance * (demands[index] ?? 0), 0) / Math.max(1, demandSum);
}
function averageDistance(locations) {
    if (locations.length === 0) {
        return 0;
    }
    return (locations.reduce((sum, location) => sum + location.distanceToNearestStation, 0) / locations.length);
}
