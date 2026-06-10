export type EntityId = string;

export interface GridPosition {
  x: number;
  y: number;
}

export type CellType =
  | "empty"
  | "rack"
  | "station"
  | "charger"
  | "elevator"
  | "rail"
  | "blocked";

export interface Cell extends GridPosition {
  id: EntityId;
  type: CellType;
  rackId?: EntityId;
  stationId?: EntityId;
  chargerId?: EntityId;
  elevatorId?: EntityId;
  railId?: EntityId;
  trafficCount: number;
  waitCount: number;
}

export interface WarehouseLevel {
  index: number;
  name: string;
  height: number;
  active: boolean;
}

export interface ElevatorZone {
  id: EntityId;
  name: string;
  position: GridPosition;
  cells: GridPosition[];
  orientation: "vertical-aisle" | "horizontal-aisle";
  levels: number[];
  queueLength: number;
  tripsCompleted: number;
  busy: boolean;
  reservedBy?: EntityId;
}

export interface SubMatrixZone {
  id: EntityId;
  name: string;
  column: number;
  row: number;
  origin: GridPosition;
  width: number;
  height: number;
  rackCount: number;
}

export interface InterMatrixConnector {
  id: EntityId;
  fromSubMatrixId: EntityId;
  toSubMatrixId: EntityId;
  cells: GridPosition[];
  orientation: "horizontal" | "vertical";
  trafficCount: number;
  waitCount: number;
}

export type ItemCategory = "fast-moving" | "medium-moving" | "slow-moving";

export interface SKU {
  id: EntityId;
  name: string;
  category: ItemCategory;
  demandWeight: number;
  volume: number;
  handlingTime: number;
  priority: number;
  currentLocation?: EntityId;
  accessCount: number;
}

export interface Item {
  id: EntityId;
  skuId: EntityId;
  locationId: EntityId;
}

export interface StorageLocation {
  id: EntityId;
  rackId: EntityId;
  position: GridPosition;
  level: number;
  accessPosition: GridPosition;
  skuId?: EntityId;
  distanceToNearestStation: number;
  accessCount: number;
}

export interface Rack {
  id: EntityId;
  position: GridPosition;
  width: number;
  height: number;
  levels: number;
  locationIds: EntityId[];
  accessCount: number;
}

export interface PickingStation {
  id: EntityId;
  name: string;
  position: GridPosition;
  /** Primary access cell (kept for backwards compat / display). Equals
   *  `accessPositions[0]`. */
  accessPosition: GridPosition;
  /** All drop cells available at this station. Robots route to whichever is
   *  closest, modelling a multi-lane loading bay instead of a single
   *  one-robot-at-a-time bottleneck cell. */
  accessPositions: GridPosition[];
  queueLength: number;
  processedOrders: number;
  active: boolean;
  busyTicks: number;
}

export interface ChargingStation {
  id: EntityId;
  position: GridPosition;
  occupiedBy?: EntityId;
}

export interface Rail {
  id: EntityId;
  cells: GridPosition[];
  direction: "one-way" | "two-way";
  role: "main" | "cross" | "station-loop";
}

export interface Switch {
  id: EntityId;
  position: GridPosition;
  connectedRailIds: EntityId[];
  kind: "intersection" | "switch";
  reservedBy?: EntityId;
}

export interface Warehouse {
  width: number;
  height: number;
  cells: Cell[];
  /** Per-level cumulative traffic/wait, parallel to `cells`: indexed
   *  [levelIndex][cellIndex]. `cells[].trafficCount/waitCount` stay the
   *  flattened total (sum over levels) used by the 2D heatmap. */
  cellTrafficByLevel: number[][];
  cellWaitByLevel: number[][];
  racks: Rack[];
  storageLocations: StorageLocation[];
  pickingStations: PickingStation[];
  chargingStations: ChargingStation[];
  rails: Rail[];
  switches: Switch[];
  levels: WarehouseLevel[];
  elevatorZones: ElevatorZone[];
  subMatrices: SubMatrixZone[];
  interMatrixConnectors: InterMatrixConnector[];
  skuCatalog: SKU[];
}

export type RobotState =
  | "idle"
  | "movingToPick"
  | "movingToElevator"
  | "ridingElevator"
  | "picking"
  | "movingToDropoff"
  | "droppingOff"
  | "movingToCharger"
  | "waiting"
  | "charging"
  | "failed"
  /** Battery hit 0 mid-task: the robot is stranded until rescued/recharged. */
  | "depleted";

export interface Robot {
  id: EntityId;
  position: GridPosition;
  level: number;
  visualLevel: number;
  state: RobotState;
  battery: number;
  maxBattery: number;
  capacity: number;
  currentTaskId?: EntityId;
  assignedOrderId?: EntityId;
  destination?: GridPosition;
  targetLevel?: number;
  targetElevatorId?: EntityId;
  routeAfterElevator?: "pick" | "dropoff";
  elevatorStartLevel?: number;
  elevatorTravelTicks?: number;
  targetChargerId?: EntityId;
  path: GridPosition[];
  serviceTicksRemaining: number;
  distanceTravelled: number;
  activeTicks: number;
  idleTicks: number;
  waitingTicks: number;
  completedTasks: number;
  energyConsumed: number;
  chargingTicks: number;
  chargeSessions: number;
  elevatorRideTicks: number;
  elevatorWaitTicks: number;
  recentEvents: string[];
}

export type TaskType = "pick" | "deliver" | "charge" | "pick-and-deliver";
export type TaskStatus = "pending" | "active" | "completed" | "failed";

export interface Task {
  id: EntityId;
  type: TaskType;
  orderId?: EntityId;
  robotId?: EntityId;
  skuId?: EntityId;
  from?: GridPosition;
  to?: GridPosition;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type OrderStatus =
  | "pending"
  | "assigned"
  | "picking"
  | "inTransit"
  | "completed"
  | "cancelled";

export interface OrderLine {
  skuId: EntityId;
  quantity: number;
}

export interface Order {
  id: EntityId;
  lines: OrderLine[];
  status: OrderStatus;
  priority: number;
  urgent: boolean;
  createdAt: number;
  assignedAt?: number;
  pickedAt?: number;
  completedAt?: number;
  stationId?: EntityId;
  rackId?: EntityId;
  storageLocationId?: EntityId;
}

export type DemandProfile = "uniform" | "abc" | "pareto" | "custom";
export type StorageStrategy =
  | "randomStorage"
  | "abcStorage"
  | "balancedABCStorage"
  | "familyStorage"
  | "dynamicSlotting";
export type PathfindingStrategy =
  | "manhattan"
  | "astar"
  | "dijkstra"
  | "reservation";
export type TaskAssignmentStrategy = "nearestRobot" | "oldestAvailable";
export type TrafficMode = "autonomous" | "rails-guided";
/** How often a robot's path is recomputed while travelling.
 *  - fixed: computed once, never recomputed → a single trajectory that jams.
 *  - periodic: recomputed every few ticks only when blocked.
 *  - reactive: recomputed at every move → dynamic congestion avoidance. */
export type ReroutingPolicy = "fixed" | "periodic" | "reactive";

export interface DemandConfig {
  demandPattern: DemandProfile;
  ordersPerMinute: number;
  averageItemsPerOrder: number;
  urgentOrderRate: number;
  peakDemandEnabled: boolean;
  peakMultiplier: number;
  peakStartMinute: number;
  peakDurationMinutes: number;
}

export interface WarehouseConfig {
  width: number;
  height: number;
  levelCount: number;
  /** Backward-compatible field only. Elevator aisles are derived from the
   *  locked rack layout: two storage columns, then one elevator aisle. */
  verticalAccessLineCount: number;
  subMatrixRows: number;
  subMatrixColumns: number;
  interMatrixCorridorWidth: number;
  /** Number of cross-aisles inside the rack block. 0 means long uninterrupted
   *  main aisles; higher values add horizontal passages where robots can switch
   *  between main aisles. */
  crossAisleSpacing: number;
  storageDensity: number;
  rackCount: number;
  pickingStationCount: number;
  pickingStationOrientation: "length" | "width";
  /** Optional top-down drop cells chosen by the user. These positions are used
   *  first; missing stations fall back to automatic placement. */
  customPickingStations?: GridPosition[];
  /** Number of drop cells per picking station (lanes). Default = 2 so robots
   *  don't all queue on the same single cell — closer to a real loading bay. */
  pickingStationLaneCount?: number;
  chargingStationCount: number;
  layoutPreset: "small" | "balanced" | "dense" | "rails-placeholder";
}

export interface RobotConfig {
  robotCount: number;
  speedCellsPerTick: number;
  capacity: number;
  payloadKg: number;
  baseWeightKg: number;
  batteryWeightKg: number;
  maxBattery: number;
  energyPerCell: number;
  rechargeThreshold: number;
  rechargeTicks: number;
  failureProbability: number;
  meanFailureTicks: number;
}

export interface StorageConfig {
  strategy: StorageStrategy;
  skuCount: number;
  dynamicSlottingEnabled: boolean;
  familyGroupingEnabled: boolean;
}

export interface MovementConfig {
  pathfindingStrategy: PathfindingStrategy;
  taskAssignmentStrategy: TaskAssignmentStrategy;
  reroutingPolicy: ReroutingPolicy;
  collisionAvoidance: boolean;
  temporalReservation: boolean;
  trafficMode: TrafficMode;
}

export interface SimulationSeeds {
  layoutSeed: number;
  skuCatalogSeed: number;
  stationSeed: number;
  robotSpawnSeed: number;
  demandSeed: number;
  trafficSeed: number;
  batterySeed: number;
  failureSeed: number;
}

export interface SimulationConfig {
  scenarioId: string;
  name: string;
  tickDurationSeconds: number;
  warehouse: WarehouseConfig;
  robots: RobotConfig;
  demand: DemandConfig;
  storage: StorageConfig;
  movement: MovementConfig;
  seeds: SimulationSeeds;
}

export interface MetricSample {
  tick: number;
  elapsedSeconds: number;
  completedOrders: number;
  completedThisTick: number;
  pendingOrders: number;
  activeRobots: number;
  averageProcessingTime: number;
  averageRobotUtilization: number;
  totalDistance: number;
  congestionEvents: number;
  throughputPerMinute: number;
}

export interface SimulationMetrics {
  completedOrders: number;
  averageProcessingTime: number;
  totalDistance: number;
  averageDistancePerOrder: number;
  averageRobotUtilization: number;
  activeRobots: number;
  pendingOrders: number;
  throughputPerMinute: number;
  congestionEvents: number;
  connectorTraffic: number;
  connectorWait: number;
  energyConsumed: number;
  chargingTicks: number;
  chargeSessions: number;
  elevatorTrips: number;
  elevatorRideTicks: number;
  elevatorWaitTicks: number;
  /** Cumulative count of robots that ran flat mid-task over the run. */
  depletionEvents: number;
  averageBatteryLevel: number;
  minimumBatteryLevel: number;
  demandWeightedStorageDistance: number;
  fastMovingStorageDistance: number;
  slowMovingStorageDistance: number;
  slottingEfficiency: number;
  verticalPressure: number;
  series: MetricSample[];
}

export interface SimulationState {
  config: SimulationConfig;
  warehouse: Warehouse;
  robots: Robot[];
  orders: Order[];
  completedOrders: Order[];
  tasks: Task[];
  tick: number;
  elapsedSeconds: number;
  isRunning: boolean;
  speed: number;
  metrics: SimulationMetrics;
}

export interface ExperimentResult {
  id: EntityId;
  scenarioId: string;
  storageStrategy: StorageStrategy;
  demandPattern: DemandProfile;
  seeds: SimulationSeeds;
  config: SimulationConfig;
  metrics: SimulationMetrics;
  createdAt: string;
  durationSeconds: number;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  config: SimulationConfig;
}
