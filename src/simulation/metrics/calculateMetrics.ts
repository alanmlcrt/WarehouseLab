import type {
  MetricSample,
  Order,
  Robot,
  SimulationMetrics,
  StorageLocation,
  Warehouse,
} from "../models/types";

export function createEmptyMetrics(): SimulationMetrics {
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
    stationUtilization: 0,
    elevatorUtilization: 0,
    chargerUtilization: 0,
    fleetUtilization: 0,
    floorCongestion: 0,
    stationQueueLength: 0,
    series: [],
  };
}

export interface MetricsInput {
  tick: number;
  elapsedSeconds: number;
  robots: Robot[];
  orders: Order[];
  completedOrders: Order[];
  previousSeries: MetricSample[];
  completedThisTick: number;
  congestionEvents: number;
  depletionEvents: number;
  connectorTraffic: number;
  connectorWait: number;
  warehouse: Warehouse;
  /** Pre-computed, run-invariant slotting metrics. The SKU placement is fixed
   *  once the warehouse is built, so recomputing it every tick is pure waste —
   *  the engine computes it once and passes it here. */
  slotting?: SlottingMetrics;
}

export type SlottingMetrics = Pick<
  SimulationMetrics,
  | "demandWeightedStorageDistance"
  | "fastMovingStorageDistance"
  | "slowMovingStorageDistance"
  | "slottingEfficiency"
>;

export function calculateMetrics(input: MetricsInput): SimulationMetrics {
  const totalDistance = input.robots.reduce(
    (sum, robot) => sum + robot.distanceTravelled,
    0,
  );
  const energyConsumed = input.robots.reduce(
    (sum, robot) => sum + robot.energyConsumed,
    0,
  );
  const chargingTicks = input.robots.reduce(
    (sum, robot) => sum + robot.chargingTicks,
    0,
  );
  const chargeSessions = input.robots.reduce(
    (sum, robot) => sum + robot.chargeSessions,
    0,
  );
  const elevatorTrips = input.warehouse.elevatorZones.reduce(
    (sum, elevator) => sum + elevator.tripsCompleted,
    0,
  );
  const elevatorRideTicks = input.robots.reduce(
    (sum, robot) => sum + robot.elevatorRideTicks,
    0,
  );
  const elevatorWaitTicks = input.robots.reduce(
    (sum, robot) => sum + robot.elevatorWaitTicks,
    0,
  );
  const averageBatteryLevel =
    input.robots.length === 0
      ? 0
      : input.robots.reduce((sum, robot) => sum + robot.battery, 0) /
        input.robots.length;
  const minimumBatteryLevel =
    input.robots.length === 0
      ? 0
      : Math.min(...input.robots.map((robot) => robot.battery));
  const completedOrders = input.completedOrders.length;
  const pendingOrders = input.orders.filter((order) => order.status === "pending")
    .length;
  const activeRobots = input.robots.filter(
    (robot) => robot.assignedOrderId || robot.state === "picking" || robot.state === "droppingOff",
  ).length;
  const averageProcessingTime =
    completedOrders === 0
      ? 0
      : input.completedOrders.reduce((sum, order) => {
          if (order.completedAt === undefined) {
            return sum;
          }
          return sum + (order.completedAt - order.createdAt);
        }, 0) / completedOrders;
  const averageRobotUtilization =
    input.robots.length === 0 || input.tick === 0
      ? 0
      : input.robots.reduce((sum, robot) => sum + robot.activeTicks, 0) /
        (input.tick * input.robots.length);
  const completedLastMinute = input.completedOrders.filter(
    (order) =>
      order.completedAt !== undefined &&
      order.completedAt >= Math.max(0, input.elapsedSeconds - 60),
  ).length;
  const throughputPerMinute =
    input.elapsedSeconds < 60
      ? completedOrders / Math.max(1, input.elapsedSeconds / 60)
      : completedLastMinute;
  const sample: MetricSample = {
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

  // ---- Per-resource utilization (binding-bottleneck attribution) -----------
  // Each link of the throughput chain is expressed as occupied-ticks / capacity,
  // a 0..1 ratio. The lab compares them to pinpoint which resource saturates.
  const ticks = Math.max(1, input.tick);
  const stations = input.warehouse.pickingStations;
  const totalLanes = stations.reduce(
    (sum, station) => sum + Math.max(1, station.accessPositions.length),
    0,
  );
  const stationBusyTicks = stations.reduce(
    (sum, station) => sum + station.busyTicks,
    0,
  );
  const stationUtilization = clamp01(
    stationBusyTicks / (ticks * Math.max(1, totalLanes)),
  );
  const stationQueueLength = stations.reduce(
    (sum, station) => sum + station.queueLength,
    0,
  );
  const cages = input.warehouse.elevatorZones.length;
  const elevatorBusyTicks = input.warehouse.elevatorZones.reduce(
    (sum, elevator) => sum + elevator.busyTicks,
    0,
  );
  const elevatorUtilization =
    cages === 0 ? 0 : clamp01(elevatorBusyTicks / (ticks * cages));
  const chargerCount = input.warehouse.chargingStations.length;
  const chargerUtilization =
    chargerCount === 0 ? 0 : clamp01(chargingTicks / (ticks * chargerCount));
  // Floor congestion: share of robot-ticks lost to blocked moves (waiting for an
  // occupied cell). High value = the aisles/grid are the bottleneck, not a resource.
  const waitingTicks = input.robots.reduce(
    (sum, robot) => sum + robot.waitingTicks,
    0,
  );
  const floorCongestion =
    input.robots.length === 0
      ? 0
      : clamp01(waitingTicks / (ticks * input.robots.length));
  // Fleet utilization measures *productive* robot-ticks — time spent actually
  // moving toward / handling orders, with blocked-waiting and charging removed.
  // (averageRobotUtilization counts every non-idle tick, so it sits near 100%
  // and tells you nothing about whether the fleet is the binding constraint.)
  const activeTicksTotal = input.robots.reduce(
    (sum, robot) => sum + robot.activeTicks,
    0,
  );
  const productiveTicks = Math.max(
    0,
    activeTicksTotal - waitingTicks - chargingTicks,
  );
  const fleetUtilization =
    input.robots.length === 0
      ? 0
      : clamp01(productiveTicks / (ticks * input.robots.length));

  return {
    completedOrders,
    averageProcessingTime,
    totalDistance,
    averageDistancePerOrder:
      completedOrders === 0 ? 0 : totalDistance / completedOrders,
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
    verticalPressure:
      (elevatorWaitTicks + elevatorRideTicks) /
      Math.max(1, input.tick * Math.max(1, input.warehouse.elevatorZones.length)),
    stationUtilization,
    elevatorUtilization,
    chargerUtilization,
    fleetUtilization,
    floorCongestion,
    stationQueueLength,
    series: [...input.previousSeries, sample].slice(-240),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function calculateSlottingMetrics(
  warehouse: Warehouse,
): SlottingMetrics {
  const locationById = new Map(
    warehouse.storageLocations.map((location) => [location.id, location]),
  );
  const locatedSkus = warehouse.skuCatalog
    .map((sku) => ({
      sku,
      location: sku.currentLocation
        ? locationById.get(sku.currentLocation)
        : undefined,
    }))
    .filter(
      (entry): entry is { sku: (typeof warehouse.skuCatalog)[number]; location: StorageLocation } =>
        Boolean(entry.location),
    );

  if (locatedSkus.length === 0) {
    return {
      demandWeightedStorageDistance: 0,
      fastMovingStorageDistance: 0,
      slowMovingStorageDistance: 0,
      slottingEfficiency: 0,
    };
  }

  const demandSum = locatedSkus.reduce(
    (sum, entry) => sum + entry.sku.demandWeight,
    0,
  );
  const demandWeightedStorageDistance =
    locatedSkus.reduce(
      (sum, entry) =>
        sum + entry.sku.demandWeight * entry.location.distanceToNearestStation,
      0,
    ) / Math.max(1, demandSum);
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
  const slottingEfficiency =
    worst === ideal
      ? 1
      : Math.max(
          0,
          Math.min(1, (worst - demandWeightedStorageDistance) / (worst - ideal)),
        );

  return {
    demandWeightedStorageDistance,
    fastMovingStorageDistance: averageDistance(fast.map((entry) => entry.location)),
    slowMovingStorageDistance: averageDistance(slow.map((entry) => entry.location)),
    slottingEfficiency,
  };
}

function weightedDistanceForSorted(distances: number[], demands: number[]): number {
  const demandSum = demands.reduce((sum, demand) => sum + demand, 0);
  return distances.reduce(
    (sum, distance, index) => sum + distance * (demands[index] ?? 0),
    0,
  ) / Math.max(1, demandSum);
}

function averageDistance(locations: StorageLocation[]): number {
  if (locations.length === 0) {
    return 0;
  }
  return (
    locations.reduce(
      (sum, location) => sum + location.distanceToNearestStation,
      0,
    ) / locations.length
  );
}
