import { findPath, type PathfindingAlgorithm } from "../algorithms/pathfinding";
import { createOrder, getEffectiveCrateOrdersPerMinute } from "./demand";
import { buildWarehouse } from "./warehouseFactory";
import {
  buildBlockedCellSet,
  buildCellMap,
  inBounds,
  manhattanDistance,
  positionKey,
  samePosition,
} from "../../utils/grid";
import { createSeededRandom, type SeededRandom } from "../../utils/random";
import {
  calculateMetrics,
  createEmptyMetrics,
} from "../metrics/calculateMetrics";
import type {
  ElevatorZone,
  GridPosition,
  Order,
  PickingStation,
  Robot,
  SimulationConfig,
  SimulationState,
  StorageLocation,
  Task,
  Warehouse,
} from "../models/types";
import { cloneConfig } from "../scenarios/presets";

export class SimulationEngine {
  private state: SimulationState;
  private layoutRng: SeededRandom;
  private skuCatalogRng: SeededRandom;
  private stationRng: SeededRandom;
  private robotSpawnRng: SeededRandom;
  private demandRng: SeededRandom;
  private batteryRng: SeededRandom;
  private failureRng: SeededRandom;
  private blockedCells: Set<string>;
  private cellMap: Map<string, number>;
  private connectorCellMap: Map<string, number[]>;
  /** Space-time reservation table (cooperative, priority-based) used when
   *  temporal reservation is active. Keys encode either a cell slot
   *  `"<offset>:<level>:<posKey>"` or an undirected edge slot
   *  `"e:<offset>:<level>:<edgeKey>"`, mapping to the owning robot id. */
  private reservationTable = new Map<string, string>();
  private orderAccumulator = 0;
  private orderCounter = 1;
  private taskCounter = 1;
  private congestionEvents = 0;
  private massFactor = 1;

  constructor(config: SimulationConfig) {
    const clonedConfig = cloneConfig(config);
    // Energy spent per move scales with the robot's total mass: a heavier
    // battery (= more capacity) costs more to haul, so range does not grow
    // linearly with capacity. Calibrated so the base preset (38+7+12 kg) = 1.
    this.massFactor =
      (clonedConfig.robots.baseWeightKg +
        clonedConfig.robots.batteryWeightKg +
        clonedConfig.robots.payloadKg) /
      REFERENCE_MASS_KG;
    this.layoutRng = createSeededRandom(clonedConfig.seeds.layoutSeed);
    this.skuCatalogRng = createSeededRandom(clonedConfig.seeds.skuCatalogSeed);
    this.stationRng = createSeededRandom(clonedConfig.seeds.stationSeed);
    this.robotSpawnRng = createSeededRandom(clonedConfig.seeds.robotSpawnSeed);
    this.demandRng = createSeededRandom(clonedConfig.seeds.demandSeed);
    this.batteryRng = createSeededRandom(clonedConfig.seeds.batterySeed);
    this.failureRng = createSeededRandom(clonedConfig.seeds.failureSeed);
    const warehouse = buildWarehouse(
      clonedConfig,
      this.layoutRng,
      this.stationRng,
      this.skuCatalogRng,
    );
    this.blockedCells = buildBlockedCellSet(warehouse);
    this.cellMap = buildCellMap(warehouse);
    this.connectorCellMap = buildConnectorCellMap(warehouse);
    this.state = {
      config: clonedConfig,
      warehouse,
      robots: this.createRobots(clonedConfig, warehouse),
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

  tick(): void {
    this.state.tick += 1;
    this.state.elapsedSeconds += this.state.config.tickDurationSeconds;
    this.generateDemand();
    this.assignChargingTasks();
    this.assignOrders();
    const completedThisTick = this.advanceRobots();
    this.updateStationState();
    this.state.metrics = calculateMetrics({
      tick: this.state.tick,
      elapsedSeconds: this.state.elapsedSeconds,
      robots: this.state.robots,
      orders: this.state.orders,
      completedOrders: this.state.completedOrders,
      previousSeries: this.state.metrics.series,
      completedThisTick,
      congestionEvents: this.congestionEvents,
      connectorTraffic: this.getConnectorTraffic(),
      connectorWait: this.getConnectorWait(),
      warehouse: this.state.warehouse,
    });
  }

  getSnapshot(isRunning: boolean, speed: number): SimulationState {
    this.state.isRunning = isRunning;
    this.state.speed = speed;
    return this.state;
  }

  private createRobots(
    config: SimulationConfig,
    warehouse: Warehouse,
  ): Robot[] {
    const spawnPositions = this.getSpawnPositions(warehouse);
    const spawnOffset =
      spawnPositions.length > 0
        ? this.robotSpawnRng.int(0, spawnPositions.length - 1)
        : 0;

    return Array.from({ length: config.robots.robotCount }, (_, index) => {
      const position =
        spawnPositions[(index + spawnOffset) % spawnPositions.length] ?? { x: 2, y: 1 };
      const initialBatteryRatio = this.batteryRng.float(0.9, 1);
      return {
        id: `ROBOT_${index + 1}`,
        position,
        level: 0,
        visualLevel: 0,
        state: "idle",
        battery: config.robots.maxBattery * initialBatteryRatio,
        maxBattery: config.robots.maxBattery,
        capacity: config.robots.capacity,
        path: [],
        serviceTicksRemaining: 0,
        distanceTravelled: 0,
        activeTicks: 0,
        idleTicks: 0,
        waitingTicks: 0,
        completedTasks: 0,
        energyConsumed: 0,
        chargingTicks: 0,
        chargeSessions: 0,
        elevatorRideTicks: 0,
        elevatorWaitTicks: 0,
        recentEvents: ["Ready"],
      };
    });
  }

  private getSpawnPositions(warehouse: Warehouse): GridPosition[] {
    const blocked = buildBlockedCellSet(warehouse);
    const positions: GridPosition[] = [];
    const seen = new Set<string>();

    const add = (position: GridPosition) => {
      const key = positionKey(position);
      if (!blocked.has(key) && !seen.has(key)) {
        seen.add(key);
        positions.push(position);
      }
    };

    for (const station of warehouse.pickingStations) {
      add(station.accessPosition);
    }

    for (let depth = 1; depth < Math.max(warehouse.width, warehouse.height); depth += 1) {
      for (const station of warehouse.pickingStations) {
        const candidates = getPositionsAtDistance(
          station.accessPosition,
          depth,
          warehouse.width,
          warehouse.height,
        );

        for (const candidate of candidates) {
          add(candidate);
        }
      }

      if (positions.length >= warehouse.pickingStations.length * (depth + 1)) {
        break;
      }
    }

    return positions;
  }

  private generateDemand(): void {
    const crateOrdersPerMinute = getEffectiveCrateOrdersPerMinute(
      this.state.config.demand,
      this.state.elapsedSeconds,
    );
    this.orderAccumulator +=
      (crateOrdersPerMinute * this.state.config.tickDurationSeconds) / 60;

    while (this.orderAccumulator >= 1) {
      this.state.orders.push(
        createOrder(
          this.orderCounter,
          this.state.warehouse,
          this.state.config.demand,
          this.state.elapsedSeconds,
          this.demandRng,
        ),
      );
      this.orderCounter += 1;
      this.orderAccumulator -= 1;
    }
  }

  private assignOrders(): void {
    const pendingOrders = this.state.orders
      .filter((order) => order.status === "pending")
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    for (const order of pendingOrders) {
      const availableRobots = this.state.robots.filter(
        (robot) =>
          robot.state === "idle" &&
          !robot.assignedOrderId &&
          robot.battery > this.state.config.robots.rechargeThreshold,
      );

      if (availableRobots.length === 0) {
        return;
      }

      const storageLocation = this.findStorageLocationForOrder(order);
      if (!storageLocation) {
        continue;
      }

      const station = this.findNearestStation(storageLocation.accessPosition);
      const robot = this.pickRobotForOrder(availableRobots, storageLocation);
      const route = this.createPickRoute(robot, storageLocation);

      if (!route) {
        continue;
      }

      const task: Task = {
        id: `TASK_${this.taskCounter}`,
        type: "pick-and-deliver",
        orderId: order.id,
        robotId: robot.id,
        skuId: order.lines[0]?.skuId,
        from: storageLocation.accessPosition,
        to: station.accessPosition,
        status: "active",
        createdAt: this.state.elapsedSeconds,
        startedAt: this.state.elapsedSeconds,
      };
      this.taskCounter += 1;
      this.state.tasks.push(task);

      order.status = "assigned";
      order.assignedAt = this.state.elapsedSeconds;
      order.stationId = station.id;
      order.rackId = storageLocation.rackId;
      order.storageLocationId = storageLocation.id;

      robot.state = route.state;
      robot.assignedOrderId = order.id;
      robot.currentTaskId = task.id;
      robot.destination = route.destination;
      robot.path = route.path;
      robot.targetLevel = route.targetLevel;
      robot.targetElevatorId = route.elevatorId;
      robot.routeAfterElevator = route.routeAfterElevator;
      robot.recentEvents = addEvent(robot.recentEvents, `Assigned ${order.id}`);
    }
  }

  private createPickRoute(
    robot: Robot,
    storageLocation: StorageLocation,
  ): PlannedRoute | undefined {
    if (robot.level === storageLocation.level) {
      return this.createHorizontalRoute(
        robot,
        storageLocation.accessPosition,
        "movingToPick",
      );
    }

    return this.createElevatorRoute(
      robot,
      storageLocation.accessPosition,
      storageLocation.level,
      "pick",
    );
  }

  private findStorageLocationForOrder(order: Order): StorageLocation | undefined {
    const skuId = order.lines[0]?.skuId;
    if (!skuId) {
      return undefined;
    }

    const sku = this.state.warehouse.skuCatalog.find((candidate) => candidate.id === skuId);
    if (!sku?.currentLocation) {
      return undefined;
    }

    return this.state.warehouse.storageLocations.find(
      (location) => location.id === sku.currentLocation,
    );
  }

  private findNearestStation(position: GridPosition): PickingStation {
    return [...this.state.warehouse.pickingStations].sort(
      (a, b) =>
        this.scoreWithTrafficJitter(
          manhattanDistance(a.accessPosition, position),
          a.id,
        ) -
        this.scoreWithTrafficJitter(
          manhattanDistance(b.accessPosition, position),
          b.id,
        ),
    )[0];
  }

  private pickRobotForOrder(
    robots: Robot[],
    location: StorageLocation,
  ): Robot {
    if (this.state.config.movement.taskAssignmentStrategy === "oldestAvailable") {
      return [...robots].sort(
        (a, b) =>
          this.scoreWithTrafficJitter(-a.idleTicks, a.id) -
          this.scoreWithTrafficJitter(-b.idleTicks, b.id),
      )[0];
    }

    return [...robots].sort(
      (a, b) =>
        this.scoreWithTrafficJitter(
          manhattanDistance(a.position, location.accessPosition),
          a.id,
        ) -
        this.scoreWithTrafficJitter(
          manhattanDistance(b.position, location.accessPosition),
          b.id,
        ),
    )[0];
  }

  private advanceRobots(): number {
    let completedThisTick = 0;
    const occupied = new Set(
      this.state.robots.map((robot) =>
        this.positionLevelKey(robot.position, robot.level),
      ),
    );
    const reserved = new Set<string>();

    // Temporal reservation: book each mover's near-future cells/edges before
    // anyone moves, so admission below is conflict-free and swap-free.
    if (this.useTemporalReservation()) {
      this.buildReservationTable();
    }

    for (const robot of this.state.robots) {
      occupied.delete(this.positionLevelKey(robot.position, robot.level));

      if (robot.state === "idle") {
        robot.idleTicks += 1;
        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      if (robot.state === "failed") {
        robot.serviceTicksRemaining -= 1;
        robot.waitingTicks += 1;
        if (robot.serviceTicksRemaining <= 0) {
          this.releaseRobot(robot, "Recovered");
        }
        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      if (this.shouldFailRobot()) {
        const order = this.findAssignedOrder(robot);
        if (order) {
          order.status = "pending";
          order.assignedAt = undefined;
          order.stationId = undefined;
          order.rackId = undefined;
          order.storageLocationId = undefined;
        }
        const task = this.state.tasks.find(
          (candidate) => candidate.id === robot.currentTaskId,
        );
        if (task) {
          task.status = "failed";
          task.completedAt = this.state.elapsedSeconds;
        }
        robot.state = "failed";
        robot.assignedOrderId = undefined;
        robot.currentTaskId = undefined;
        robot.destination = undefined;
        robot.path = [];
        // Repair time is a stochastic draw around the configured MTTR
        // (exponential), not a fixed constant — closer to real breakdown
        // recovery. Deterministic because it draws from failureRng.
        robot.serviceTicksRemaining = this.sampleRepairTicks();
        robot.recentEvents = addEvent(robot.recentEvents, "Failure event");
        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      if (robot.state === "charging") {
        robot.activeTicks += 1;
        robot.chargingTicks += 1;
        const ratio = this.state.config.robots.maxBattery /
          Math.max(1, this.state.config.robots.rechargeTicks);
        robot.battery = Math.min(robot.maxBattery, robot.battery + ratio);
        robot.serviceTicksRemaining -= 1;
        if (
          robot.serviceTicksRemaining <= 0 ||
          robot.battery >= robot.maxBattery
        ) {
          this.completeCharging(robot);
        }
        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      if (
        robot.state === "picking" ||
        robot.state === "droppingOff" ||
        robot.state === "ridingElevator"
      ) {
        robot.activeTicks += 1;
        robot.serviceTicksRemaining -= 1;
        if (robot.state === "ridingElevator") {
          robot.elevatorRideTicks += 1;
          this.updateElevatorVisualLevel(robot);
        }

        if (robot.serviceTicksRemaining <= 0) {
          if (robot.state === "ridingElevator") {
            this.completeElevatorRide(robot);
          } else if (robot.state === "picking") {
            this.startDelivery(robot);
          } else {
            completedThisTick += this.completeDelivery(robot);
          }
        }

        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      if (
        robot.state === "movingToPick" ||
        robot.state === "movingToDropoff" ||
        robot.state === "movingToElevator" ||
        robot.state === "movingToCharger"
      ) {
        robot.activeTicks += 1;
        this.moveRobot(robot, occupied, reserved);
        occupied.add(this.positionLevelKey(robot.position, robot.level));
        continue;
      }

      occupied.add(this.positionLevelKey(robot.position, robot.level));
    }

    return completedThisTick;
  }

  private moveRobot(
    robot: Robot,
    occupied: Set<string>,
    reserved: Set<string>,
  ): void {
    if (!robot.destination) {
      this.releaseRobot(robot, "No destination");
      return;
    }

    if (samePosition(robot.position, robot.destination)) {
      this.handleArrival(robot);
      return;
    }

    const policy = this.state.config.movement.reroutingPolicy ?? "periodic";
    const reservationActive = this.useTemporalReservation();
    // Reactive policy recomputes the whole path every move so the robot can
    // dynamically steer around the current congestion. Fixed/periodic only
    // (re)plan when they have no path yet. Under reservation we keep the path
    // booked by the pre-pass instead of re-planning it mid-move.
    if (robot.path.length === 0 || (policy === "reactive" && !reservationActive)) {
      robot.path = this.planPath(robot.position, robot.destination, robot);
    }

    const next = robot.path[0];
    if (!next) {
      this.registerWait(robot, occupied);
      return;
    }

    const nextKey = this.positionLevelKey(next, robot.level);
    const isElevatorLane = this.isElevatorPosition(next);
    if (
      this.blockedCells.has(positionKey(next)) ||
      (!isElevatorLane && (occupied.has(nextKey) || reserved.has(nextKey))) ||
      (reservationActive && !isElevatorLane && !this.holdsReservation(robot, next))
    ) {
      // Fixed = commit to the single trajectory and just wait (jams build up).
      // Periodic = occasionally replan around the blockage. Reactive already
      // replanned above this tick.
      if (policy === "periodic" && this.state.tick % 3 === 0) {
        robot.path = this.planPath(robot.position, robot.destination, robot);
      }
      this.registerWait(robot, occupied);
      return;
    }

    robot.position = next;
    robot.path = robot.path.slice(1);
    robot.distanceTravelled += 1;
    const energyDrain = this.state.config.robots.energyPerCell * this.massFactor;
    robot.energyConsumed += energyDrain;
    robot.battery = Math.max(0, robot.battery - energyDrain);
    if (!isElevatorLane) {
      reserved.add(nextKey);
    }
    this.incrementCellTraffic(next);
    this.incrementConnectorTraffic(next);

    if (samePosition(robot.position, robot.destination)) {
      this.handleArrival(robot);
    }
  }

  private registerWait(robot: Robot, occupied: Set<string>): void {
    robot.waitingTicks += 1;
    if (robot.state === "movingToElevator" || this.isElevatorPosition(robot.position)) {
      robot.elevatorWaitTicks += 1;
    }
    this.congestionEvents += 1;
    robot.recentEvents = addEvent(robot.recentEvents, "Waiting for cell");
    occupied.add(this.positionLevelKey(robot.position, robot.level));
    this.incrementCellWait(robot.position);
    this.incrementConnectorWait(robot.position);
  }

  private handleArrival(robot: Robot): void {
    if (robot.state === "movingToElevator") {
      this.startElevatorRide(robot);
      return;
    }

    if (robot.state === "movingToPick") {
      const order = this.findAssignedOrder(robot);
      const sku = order
        ? this.state.warehouse.skuCatalog.find(
            (candidate) => candidate.id === order.lines[0]?.skuId,
          )
        : undefined;
      const serviceTicks = Math.max(1, Math.round(sku?.handlingTime ?? 2));

      robot.state = "picking";
      robot.serviceTicksRemaining = serviceTicks;
      robot.path = [];
      order && (order.status = "picking");
      robot.recentEvents = addEvent(robot.recentEvents, "Picking");
      this.incrementStorageAccess(order);
      return;
    }

    if (robot.state === "movingToDropoff") {
      const order = this.findAssignedOrder(robot);
      robot.state = "droppingOff";
      robot.serviceTicksRemaining = 2;
      robot.path = [];
      if (order) {
        order.status = "inTransit";
      }
      robot.recentEvents = addEvent(robot.recentEvents, "Dropping off");
      return;
    }

    if (robot.state === "movingToCharger") {
      robot.state = "charging";
      robot.serviceTicksRemaining = this.state.config.robots.rechargeTicks;
      robot.path = [];
      robot.chargeSessions += 1;
      robot.recentEvents = addEvent(robot.recentEvents, "Charging");
    }
  }

  private startDelivery(robot: Robot): void {
    const order = this.findAssignedOrder(robot);
    const station = order?.stationId
      ? this.state.warehouse.pickingStations.find(
          (candidate) => candidate.id === order.stationId,
        )
      : undefined;

    if (!order || !station) {
      this.releaseRobot(robot, "Missing delivery target");
      return;
    }

    order.pickedAt = this.state.elapsedSeconds;
    order.status = "inTransit";

    if (robot.level !== 0) {
      const route = this.createElevatorRoute(
        robot,
        station.accessPosition,
        0,
        "dropoff",
      );

      if (!route) {
        this.registerRobotDelay(robot, "No elevator route");
        return;
      }

      robot.state = route.state;
      robot.destination = route.destination;
      robot.path = route.path;
      robot.targetLevel = route.targetLevel;
      robot.targetElevatorId = route.elevatorId;
      robot.routeAfterElevator = route.routeAfterElevator;
      robot.recentEvents = addEvent(robot.recentEvents, "Heading to elevator");
      return;
    }

    const route = this.createHorizontalRoute(robot, station.accessPosition, "movingToDropoff");
    if (!route) {
      this.registerRobotDelay(robot, "Delivery route blocked");
      return;
    }

    robot.state = route.state;
    robot.destination = route.destination;
    robot.path = route.path;
    robot.recentEvents = addEvent(robot.recentEvents, `Delivering to ${station.name}`);
  }

  private completeDelivery(robot: Robot): number {
    const order = this.findAssignedOrder(robot);
    if (!order) {
      this.releaseRobot(robot, "Order missing");
      return 0;
    }

    order.status = "completed";
    order.completedAt = this.state.elapsedSeconds;
    this.state.completedOrders.push({ ...order });
    this.state.orders = this.state.orders.filter((candidate) => candidate.id !== order.id);

    const station = this.state.warehouse.pickingStations.find(
      (candidate) => candidate.id === order.stationId,
    );
    if (station) {
      station.processedOrders += 1;
      station.active = true;
      station.busyTicks += 1;
    }

    const task = this.state.tasks.find((candidate) => candidate.id === robot.currentTaskId);
    if (task) {
      task.status = "completed";
      task.completedAt = this.state.elapsedSeconds;
    }

    robot.completedTasks += 1;
    this.releaseRobot(robot, `Completed ${order.id}`);
    return 1;
  }

  private releaseRobot(robot: Robot, event: string): void {
    if (robot.targetChargerId) {
      const charger = this.state.warehouse.chargingStations.find(
        (candidate) => candidate.id === robot.targetChargerId,
      );
      if (charger && charger.occupiedBy === robot.id) {
        charger.occupiedBy = undefined;
      }
    }
    robot.state = "idle";
    robot.assignedOrderId = undefined;
    robot.currentTaskId = undefined;
    robot.destination = undefined;
    robot.targetLevel = undefined;
    robot.targetElevatorId = undefined;
    robot.routeAfterElevator = undefined;
    robot.elevatorStartLevel = undefined;
    robot.elevatorTravelTicks = undefined;
    robot.targetChargerId = undefined;
    robot.visualLevel = robot.level;
    robot.path = [];
    robot.serviceTicksRemaining = 0;
    robot.recentEvents = addEvent(robot.recentEvents, event);
  }

  private incrementStorageAccess(order?: Order): void {
    if (!order?.storageLocationId) {
      return;
    }

    const location = this.state.warehouse.storageLocations.find(
      (candidate) => candidate.id === order.storageLocationId,
    );
    if (location) {
      location.accessCount += 1;
    }

    const rack = this.state.warehouse.racks.find(
      (candidate) => candidate.id === order.rackId,
    );
    if (rack) {
      rack.accessCount += 1;
    }

    const sku = this.state.warehouse.skuCatalog.find(
      (candidate) => candidate.id === order.lines[0]?.skuId,
    );
    if (sku) {
      sku.accessCount += 1;
    }
  }

  private updateStationState(): void {
    for (const station of this.state.warehouse.pickingStations) {
      station.queueLength = this.state.orders.filter(
        (order) => order.stationId === station.id && order.status !== "completed",
      ).length;
      station.active = this.state.robots.some(
        (robot) =>
          robot.assignedOrderId &&
          robot.destination &&
          samePosition(robot.destination, station.accessPosition),
      );
      if (station.active) {
        station.busyTicks += 1;
      }
    }
  }

  private findAssignedOrder(robot: Robot): Order | undefined {
    return this.state.orders.find((order) => order.id === robot.assignedOrderId);
  }

  private assignChargingTasks(): void {
    const threshold = this.state.config.robots.rechargeThreshold;
    if (threshold <= 0) {
      return;
    }

    const reservedChargerIds = new Set(
      this.state.robots
        .filter(
          (robot) =>
            robot.state === "charging" || robot.state === "movingToCharger",
        )
        .map((robot) => robot.targetChargerId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const robot of this.state.robots) {
      if (robot.state !== "idle" || robot.assignedOrderId) {
        continue;
      }
      if (robot.battery > threshold) {
        continue;
      }

      const charger = this.findNearestFreeCharger(robot.position, reservedChargerIds);
      if (!charger) {
        continue;
      }

      const route = this.createHorizontalRoute(robot, charger.position, "movingToPick");
      if (!route && !samePosition(robot.position, charger.position)) {
        continue;
      }

      reservedChargerIds.add(charger.id);
      charger.occupiedBy = robot.id;

      robot.state = "movingToCharger";
      robot.destination = charger.position;
      robot.path = route?.path ?? [];
      robot.targetChargerId = charger.id;
      robot.recentEvents = addEvent(robot.recentEvents, "Routing to charger");

      if (samePosition(robot.position, charger.position)) {
        this.handleArrival(robot);
      }
    }
  }

  private findNearestFreeCharger(
    from: GridPosition,
    reservedIds: Set<string>,
  ) {
    const candidates = this.state.warehouse.chargingStations
      .filter((charger) => !reservedIds.has(charger.id) && !charger.occupiedBy)
      .sort(
        (a, b) =>
          this.scoreWithTrafficJitter(manhattanDistance(a.position, from), a.id) -
          this.scoreWithTrafficJitter(manhattanDistance(b.position, from), b.id),
      );
    return candidates[0];
  }

  private completeCharging(robot: Robot): void {
    const charger = this.state.warehouse.chargingStations.find(
      (candidate) => candidate.id === robot.targetChargerId,
    );
    if (charger) {
      charger.occupiedBy = undefined;
    }
    robot.targetChargerId = undefined;
    robot.battery = robot.maxBattery;
    this.releaseRobot(robot, "Charged");
  }

  private planPath(
    from: GridPosition,
    to: GridPosition,
    robot: Robot,
  ): GridPosition[] {
    const algorithm = this.resolvePathAlgorithm();
    return findPath(
      from,
      to,
      {
        warehouse: this.state.warehouse,
        occupied: this.getOccupiedCells(robot.id, robot.level),
        blocked: this.blockedCells,
        cellMap: this.cellMap,
      },
      algorithm,
    );
  }

  private resolvePathAlgorithm(): PathfindingAlgorithm {
    const strategy = this.state.config.movement.pathfindingStrategy;
    if (strategy === "astar" || strategy === "reservation") {
      return "astar";
    }
    if (strategy === "dijkstra") {
      return "dijkstra";
    }
    return "manhattan";
  }

  private getOccupiedCells(exceptRobotId?: string, level = 0): Set<string> {
    return new Set(
      this.state.robots
        .filter(
          (robot) =>
            robot.id !== exceptRobotId &&
            robot.level === level &&
            !this.isElevatorPosition(robot.position),
        )
        .map((robot) => positionKey(robot.position)),
    );
  }

  private createHorizontalRoute(
    robot: Robot,
    destination: GridPosition,
    state: "movingToPick" | "movingToDropoff",
  ): PlannedRoute | undefined {
    const path = this.planPath(robot.position, destination, robot);

    if (path.length === 0 && !samePosition(robot.position, destination)) {
      return undefined;
    }

    return {
      state,
      destination,
      path,
    };
  }

  private createElevatorRoute(
    robot: Robot,
    finalDestination: GridPosition,
    targetLevel: number,
    routeAfterElevator: "pick" | "dropoff",
  ): PlannedRoute | undefined {
    const elevatorPlan = this.findBestElevatorStop(
      robot.position,
      finalDestination,
    );

    if (!elevatorPlan) {
      return undefined;
    }

    const path = this.planPath(robot.position, elevatorPlan.stop, robot);

    if (path.length === 0 && !samePosition(robot.position, elevatorPlan.stop)) {
      return undefined;
    }

    elevatorPlan.elevator.queueLength += 1;

    return {
      state: "movingToElevator",
      destination: elevatorPlan.stop,
      path,
      targetLevel,
      elevatorId: elevatorPlan.elevator.id,
      routeAfterElevator,
    };
  }

  private findBestElevatorStop(
    from: GridPosition,
    to: GridPosition,
  ): { elevator: ElevatorZone; stop: GridPosition } | undefined {
    let best:
      | {
          elevator: ElevatorZone;
          stop: GridPosition;
          score: number;
        }
      | undefined;

    for (const elevator of this.state.warehouse.elevatorZones) {
      for (const stop of elevator.cells) {
        const score = manhattanDistance(from, stop) + manhattanDistance(stop, to);
        const jitteredScore = this.scoreWithTrafficJitter(
          score,
          `${elevator.id}:${positionKey(stop)}`,
        );
        if (!best || jitteredScore < best.score) {
          best = { elevator, stop, score: jitteredScore };
        }
      }
    }

    return best;
  }

  private startElevatorRide(robot: Robot): void {
    const targetLevel = robot.targetLevel ?? robot.level;
    const elevator = this.state.warehouse.elevatorZones.find(
      (candidate) => candidate.id === robot.targetElevatorId,
    );
    const levelDelta = Math.abs(targetLevel - robot.level);

    if (levelDelta === 0) {
      this.completeElevatorRide(robot);
      return;
    }

    if (elevator) {
      elevator.queueLength = Math.max(0, elevator.queueLength - 1);
      elevator.busy = true;
      elevator.reservedBy = robot.id;
    }

    const travelTicks = Math.max(1, levelDelta * 3);
    robot.state = "ridingElevator";
    robot.serviceTicksRemaining = travelTicks;
    robot.elevatorStartLevel = robot.level;
    robot.elevatorTravelTicks = travelTicks;
    robot.visualLevel = robot.level;
    robot.path = [];
    robot.recentEvents = addEvent(
      robot.recentEvents,
      `Elevator to level ${targetLevel + 1}`,
    );
  }

  private updateElevatorVisualLevel(robot: Robot): void {
    const startLevel = robot.elevatorStartLevel ?? robot.level;
    const targetLevel = robot.targetLevel ?? robot.level;
    const totalTicks = Math.max(1, robot.elevatorTravelTicks ?? 1);
    const progress = 1 - Math.max(0, robot.serviceTicksRemaining) / totalTicks;
    robot.visualLevel = startLevel + (targetLevel - startLevel) * progress;
  }

  private completeElevatorRide(robot: Robot): void {
    const targetLevel = robot.targetLevel ?? robot.level;
    const elevator = this.state.warehouse.elevatorZones.find(
      (candidate) => candidate.id === robot.targetElevatorId,
    );

    robot.level = targetLevel;
    robot.visualLevel = targetLevel;
    robot.elevatorStartLevel = undefined;
    robot.elevatorTravelTicks = undefined;

    if (elevator) {
      elevator.tripsCompleted += 1;
      elevator.busy = false;
      elevator.reservedBy = undefined;
    }

    if (robot.routeAfterElevator === "pick") {
      const order = this.findAssignedOrder(robot);
      const storageLocation = order ? this.findStorageLocationForOrder(order) : undefined;
      if (!storageLocation) {
        this.releaseRobot(robot, "Missing pickup after elevator");
        return;
      }

      const route = this.createHorizontalRoute(
        robot,
        storageLocation.accessPosition,
        "movingToPick",
      );
      if (!route) {
        this.registerRobotDelay(robot, "Pickup route blocked");
        return;
      }

      robot.state = route.state;
      robot.destination = route.destination;
      robot.path = route.path;
      robot.recentEvents = addEvent(robot.recentEvents, "Leaving elevator");
      return;
    }

    const order = this.findAssignedOrder(robot);
    const station = order?.stationId
      ? this.state.warehouse.pickingStations.find(
          (candidate) => candidate.id === order.stationId,
        )
      : undefined;

    if (!station) {
      this.releaseRobot(robot, "Missing station after elevator");
      return;
    }

    const route = this.createHorizontalRoute(robot, station.accessPosition, "movingToDropoff");
    if (!route) {
      this.registerRobotDelay(robot, "Station route blocked");
      return;
    }

    robot.state = route.state;
    robot.destination = route.destination;
    robot.path = route.path;
    robot.recentEvents = addEvent(robot.recentEvents, "Back on ground level");
  }

  private registerRobotDelay(robot: Robot, event: string): void {
    const order = this.findAssignedOrder(robot);
    if (order) {
      order.status = "pending";
      order.assignedAt = undefined;
      order.stationId = undefined;
      order.rackId = undefined;
      order.storageLocationId = undefined;
    }
    robot.waitingTicks += 1;
    this.releaseRobot(robot, event);
  }

  private positionLevelKey(position: GridPosition, level: number): string {
    return `${level}:${positionKey(position)}`;
  }

  private isElevatorPosition(position: GridPosition): boolean {
    const index = this.cellMap.get(positionKey(position));
    return index !== undefined && this.state.warehouse.cells[index].type === "elevator";
  }

  private incrementCellTraffic(position: GridPosition): void {
    const index = this.cellMap.get(positionKey(position));
    if (index !== undefined) {
      this.state.warehouse.cells[index].trafficCount += 1;
    }
  }

  private incrementConnectorTraffic(position: GridPosition): void {
    const indexes = this.connectorCellMap.get(positionKey(position));
    if (!indexes) {
      return;
    }
    for (const index of indexes) {
      this.state.warehouse.interMatrixConnectors[index].trafficCount += 1;
    }
  }

  private incrementCellWait(position: GridPosition): void {
    const index = this.cellMap.get(positionKey(position));
    if (index !== undefined) {
      this.state.warehouse.cells[index].waitCount += 1;
    }
  }

  private incrementConnectorWait(position: GridPosition): void {
    const indexes = this.connectorCellMap.get(positionKey(position));
    if (!indexes) {
      return;
    }
    for (const index of indexes) {
      this.state.warehouse.interMatrixConnectors[index].waitCount += 1;
    }
  }

  private getConnectorTraffic(): number {
    return this.state.warehouse.interMatrixConnectors.reduce(
      (sum, connector) => sum + connector.trafficCount,
      0,
    );
  }

  private getConnectorWait(): number {
    return this.state.warehouse.interMatrixConnectors.reduce(
      (sum, connector) => sum + connector.waitCount,
      0,
    );
  }

  private shouldFailRobot(): boolean {
    const probability = this.state.config.robots.failureProbability;
    return probability > 0 && this.failureRng.next() < probability;
  }

  /** Exponential repair time around the configured mean (MTTR), clamped to a
   *  minimum of one tick. Drawn from failureRng so runs stay reproducible. */
  private sampleRepairTicks(): number {
    const mean = Math.max(1, this.state.config.robots.meanFailureTicks);
    const u = Math.min(0.999999, Math.max(1e-6, this.failureRng.next()));
    return Math.max(1, Math.round(-mean * Math.log(1 - u)));
  }

  private useTemporalReservation(): boolean {
    const movement = this.state.config.movement;
    return (
      movement.temporalReservation === true ||
      movement.pathfindingStrategy === "reservation"
    );
  }

  /** Pre-pass: every mover books its current cell and the next few cells/edges
   *  of its planned path into the reservation table, in priority order (most
   *  starved first). A robot stops booking as soon as a slot is already held by
   *  a higher-priority robot. Edge slots forbid head-on swaps across a shared
   *  edge in the same tick. */
  private buildReservationTable(): void {
    this.reservationTable.clear();

    const movers = this.state.robots
      .filter(
        (robot) =>
          robot.destination !== undefined &&
          (robot.state === "movingToPick" ||
            robot.state === "movingToDropoff" ||
            robot.state === "movingToElevator" ||
            robot.state === "movingToCharger"),
      )
      .sort(
        (a, b) =>
          this.scoreWithTrafficJitter(-a.waitingTicks, a.id) -
          this.scoreWithTrafficJitter(-b.waitingTicks, b.id),
      );

    for (const robot of movers) {
      if (robot.path.length === 0 && robot.destination) {
        robot.path = this.planPath(robot.position, robot.destination, robot);
      }

      const level = robot.level;
      // Anchor the current cell so no one targets it at the same instant.
      this.reservationTable.set(
        `0:${level}:${positionKey(robot.position)}`,
        robot.id,
      );

      let previous = robot.position;
      const horizon = Math.min(RESERVATION_HORIZON, robot.path.length);
      for (let i = 0; i < horizon; i += 1) {
        const cell = robot.path[i];
        if (this.isElevatorPosition(cell)) {
          break;
        }
        const offset = i + 1;
        if (
          !this.tryReserve(`${offset}:${level}:${positionKey(cell)}`, robot.id) ||
          !this.tryReserve(
            `e:${offset}:${level}:${edgeKey(previous, cell)}`,
            robot.id,
          )
        ) {
          break;
        }
        previous = cell;
      }
    }
  }

  private tryReserve(key: string, robotId: string): boolean {
    const holder = this.reservationTable.get(key);
    if (holder && holder !== robotId) {
      return false;
    }
    this.reservationTable.set(key, robotId);
    return true;
  }

  /** True when the robot owns both the cell slot and the traversal-edge slot
   *  needed to step into `next` on this tick. */
  private holdsReservation(robot: Robot, next: GridPosition): boolean {
    const level = robot.level;
    return (
      this.reservationTable.get(`1:${level}:${positionKey(next)}`) === robot.id &&
      this.reservationTable.get(
        `e:1:${level}:${edgeKey(robot.position, next)}`,
      ) === robot.id
    );
  }

  private scoreWithTrafficJitter(baseScore: number, key: string): number {
    return baseScore + deterministicJitter(this.state.config.seeds.trafficSeed, key);
  }
}

/** Total robot mass (kg) of the base preset, used to normalise the energy /
 *  mass coupling so the default configuration keeps its calibrated drain. */
const REFERENCE_MASS_KG = 57;

/** How many future cells each robot books ahead under temporal reservation. */
const RESERVATION_HORIZON = 6;

/** Undirected edge key between two adjacent cells, so a head-on swap (u→v and
 *  v→u in the same tick) collides on the same reservation slot. */
function edgeKey(a: GridPosition, b: GridPosition): string {
  const first = positionKey(a);
  const second = positionKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function deterministicJitter(seed: number, key: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
  }
  return createSeededRandom(hash).next() * 0.001;
}

function buildConnectorCellMap(warehouse: Warehouse): Map<string, number[]> {
  const map = new Map<string, number[]>();
  warehouse.interMatrixConnectors.forEach((connector, index) => {
    for (const cell of connector.cells) {
      const key = positionKey(cell);
      const indexes = map.get(key) ?? [];
      indexes.push(index);
      map.set(key, indexes);
    }
  });
  return map;
}

function getPositionsAtDistance(
  center: GridPosition,
  distance: number,
  width: number,
  height: number,
): GridPosition[] {
  const positions: GridPosition[] = [];

  for (let dx = -distance; dx <= distance; dx += 1) {
    const dy = distance - Math.abs(dx);
    const candidates =
      dy === 0
        ? [{ x: center.x + dx, y: center.y }]
        : [
            { x: center.x + dx, y: center.y + dy },
            { x: center.x + dx, y: center.y - dy },
          ];

    for (const candidate of candidates) {
      if (inBounds(candidate, width, height)) {
        positions.push(candidate);
      }
    }
  }

  return positions;
}

function addEvent(events: string[], event: string): string[] {
  return [event, ...events].slice(0, 5);
}

interface PlannedRoute {
  state: "movingToPick" | "movingToDropoff" | "movingToElevator";
  destination: GridPosition;
  path: GridPosition[];
  targetLevel?: number;
  elevatorId?: string;
  routeAfterElevator?: "pick" | "dropoff";
}
