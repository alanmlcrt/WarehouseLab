import { createSkuCatalog } from "../../data/catalog";
import {
  cellId,
  inBounds,
  manhattanDistance,
  positionKey,
} from "../../utils/grid";
import type { SeededRandom } from "../../utils/random";
import { applyStorageStrategy } from "../algorithms/storageStrategies";
import type {
  Cell,
  ChargingStation,
  ElevatorZone,
  GridPosition,
  PickingStation,
  Rack,
  Rail,
  SimulationConfig,
  StorageLocation,
  SubMatrixZone,
  InterMatrixConnector,
  Switch,
  Warehouse,
  WarehouseLevel,
} from "../models/types";

export const RACK_COLUMNS_PER_ELEVATOR_AISLE = 2;
const WAREHOUSE_LAYOUT_EDGE_BUFFER = 3;

export function buildWarehouse(
  config: SimulationConfig,
  layoutRng: SeededRandom,
  stationRng: SeededRandom,
  skuCatalogRng: SeededRandom,
): Warehouse {
  const cells = createEmptyCells(config.warehouse.width, config.warehouse.height);
  const levels = createWarehouseLevels(config.warehouse.levelCount);
  const subMatrices = createSubMatrices(config);
  const interMatrixConnectors = createInterMatrixConnectors(subMatrices);
  const elevatorZones = createElevatorZones(
    config.warehouse.width,
    config.warehouse.height,
    levels,
  );
  const pickingStations = createPickingStations(
    config.warehouse.width,
    config.warehouse.height,
    config.warehouse.pickingStationCount,
    config.warehouse.pickingStationOrientation,
    stationRng,
    config.warehouse.pickingStationLaneCount,
    config.warehouse.customPickingStations,
    new Set(elevatorZones.flatMap((elevator) => elevator.cells.map(positionKey))),
  );
  const chargingStations = createChargingStations(
    config.warehouse.width,
    config.warehouse.height,
    config.warehouse.chargingStationCount,
    config.warehouse.pickingStationOrientation,
    stationRng,
    new Set(pickingStations.flatMap((station) => station.accessPositions.map(positionKey))),
  );

  for (const station of pickingStations) {
    // Mark every lane of the station as a "station" cell — robots dropping off
    // can use any of them.
    for (const cell of station.accessPositions) {
      setCell(cells, cell, {
        type: "station",
        stationId: station.id,
      });
    }
  }

  for (const charger of chargingStations) {
    setCell(cells, charger.position, {
      type: "charger",
      chargerId: charger.id,
    });
  }

  for (const elevator of elevatorZones) {
    for (const position of elevator.cells) {
      setCell(cells, position, {
        type: "elevator",
        elevatorId: elevator.id,
      });
    }
  }

  for (const connector of interMatrixConnectors) {
    for (const position of connector.cells) {
      const cell = cells.find(
        (candidate) => candidate.x === position.x && candidate.y === position.y,
      );
      if (cell?.type === "empty") {
        setCell(cells, position, { type: "rail" });
      }
    }
  }

  const { racks, storageLocations } = createRackLayout(
    cells,
    config,
    pickingStations,
    subMatrices,
  );
  const { rails, switches } = createRailNetwork(
    cells,
    config,
    pickingStations,
    chargingStations,
    elevatorZones,
  );
  const catalog = createSkuCatalog(config.storage.skuCount, skuCatalogRng);
  const warehouse: Warehouse = {
    width: config.warehouse.width,
    height: config.warehouse.height,
    cells,
    racks,
    storageLocations,
    pickingStations,
    chargingStations,
    rails,
    switches,
    levels,
    elevatorZones,
    subMatrices: countSubMatrixRacks(subMatrices, racks),
    interMatrixConnectors,
    skuCatalog: catalog,
  };

  return applyStorageStrategy(
    warehouse,
    catalog,
    config.storage.strategy,
    layoutRng,
  );
}

function createEmptyCells(width: number, height: number): Cell[] {
  const cells: Cell[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({
        id: cellId({ x, y }),
        x,
        y,
        type: "empty",
        trafficCount: 0,
        waitCount: 0,
      });
    }
  }

  return cells;
}

function createPickingStations(
  width: number,
  height: number,
  count: number,
  orientation: SimulationConfig["warehouse"]["pickingStationOrientation"],
  rng: SeededRandom,
  laneCount: number = 2,
  customPositions: GridPosition[] = [],
  blockedPositions: Set<string> = new Set(),
): PickingStation[] {
  const aisleColumns = computeAisleLayout(width).aisleColumns;
  const stationOrderOffset = count > 0 ? rng.int(0, Math.max(0, count - 1)) : 0;
  const stations: PickingStation[] = [];
  const used = new Set<string>();
  const usableCustomPositions = customPositions
    .map((position) => ({
      x: Math.round(position.x),
      y: Math.round(position.y),
    }))
    .filter((position) => inBounds(position, width, height))
    .filter((position) => !blockedPositions.has(positionKey(position)))
    .filter((position) => {
      const key = positionKey(position);
      if (used.has(key)) {
        return false;
      }
      used.add(key);
      return true;
    })
    .slice(0, count);

  usableCustomPositions.forEach((accessPosition, index) => {
    stations.push(createStation(index, accessPosition, accessPosition, [accessPosition]));
  });

  for (let index = stations.length; index < count; index += 1) {
    const stationIndex = (index + stationOrderOffset) % Math.max(1, count);
    const aisleIndex = Math.min(
      aisleColumns.length - 1,
      Math.max(
        0,
        Math.round(
          ((stationIndex + 1) * (aisleColumns.length - 1)) / (count + 1),
        ) + rng.int(-1, 1),
      ),
    );
    const autoAccessPosition =
      orientation === "width"
        ? {
            x: aisleColumns[aisleIndex] ?? Math.floor(width / 2),
            y: height - 2,
          }
        : {
            x: 1,
            y: Math.min(
              height - 2,
              Math.max(
                1,
                Math.round(((stationIndex + 1) * height) / (count + 1)) +
                  rng.int(-1, 1),
              ),
            ),
          };
    const accessPosition = findNearestAvailableStationCell(
      autoAccessPosition,
      width,
      height,
      used,
      blockedPositions,
    );
    const position =
      orientation === "width"
        ? { x: accessPosition.x, y: height }
        : { x: -1, y: accessPosition.y };

    // Generate `laneCount` access cells side by side along the building edge,
    // clamped to the inner grid. This spreads dropoff queueing across cells
    // instead of choking on a single one.
    const lanes = Math.max(1, Math.round(laneCount));
    const accessPositions: GridPosition[] = [];
    for (let lane = 0; lane < lanes; lane += 1) {
      // Alternate +1, -1, +2, -2 around the centre so the spread stays balanced.
      const offset = lane === 0 ? 0 : Math.ceil(lane / 2) * (lane % 2 === 1 ? 1 : -1);
      const candidate =
        orientation === "width"
          ? { x: accessPosition.x + offset, y: accessPosition.y }
          : { x: accessPosition.x, y: accessPosition.y + offset };
      const xMin = orientation === "width" ? 0 : 1;
      const xMax = orientation === "width" ? width - 1 : 1;
      const yMin = 1;
      const yMax = height - 2;
      if (
        candidate.x >= xMin &&
        candidate.x <= xMax &&
        candidate.y >= yMin &&
        candidate.y <= yMax &&
        !blockedPositions.has(positionKey(candidate)) &&
        !used.has(positionKey(candidate)) &&
        !accessPositions.some(
          (existing) => existing.x === candidate.x && existing.y === candidate.y,
        )
      ) {
        accessPositions.push(candidate);
      }
    }
    if (accessPositions.length === 0) {
      accessPositions.push(accessPosition);
    }
    accessPositions.forEach((stationPosition) => used.add(positionKey(stationPosition)));

    stations.push(createStation(index, position, accessPositions[0], accessPositions));
  }

  return stations;
}

function createStation(
  index: number,
  position: GridPosition,
  accessPosition: GridPosition,
  accessPositions: GridPosition[],
): PickingStation {
  return {
    id: `STATION_${index + 1}`,
    name: `Station ${index + 1}`,
    position,
    accessPosition,
    accessPositions,
    queueLength: 0,
    processedOrders: 0,
    active: false,
    busyTicks: 0,
  };
}

function findNearestAvailableStationCell(
  preferred: GridPosition,
  width: number,
  height: number,
  used: Set<string>,
  blocked: Set<string>,
): GridPosition {
  const isOpen = (position: GridPosition) =>
    inBounds(position, width, height) &&
    !used.has(positionKey(position)) &&
    !blocked.has(positionKey(position));
  if (isOpen(preferred)) {
    return preferred;
  }

  for (let distance = 1; distance < Math.max(width, height); distance += 1) {
    for (const candidate of getPositionsAtDistance(preferred, distance, width, height)) {
      if (isOpen(candidate)) {
        return candidate;
      }
    }
  }

  return {
    x: Math.min(width - 1, Math.max(0, preferred.x)),
    y: Math.min(height - 1, Math.max(0, preferred.y)),
  };
}

function createChargingStations(
  width: number,
  height: number,
  count: number,
  pickingStationOrientation: SimulationConfig["warehouse"]["pickingStationOrientation"],
  rng: SeededRandom,
  excludedPositions: Set<string> = new Set(),
): ChargingStation[] {
  const candidates = range(2, Math.max(2, width - 2))
    .filter((x) => x % 2 === 0)
    .map((x) => ({
      x,
      y: pickingStationOrientation === "width" ? 1 : height - 2,
    }))
    .filter((position) => !excludedPositions.has(positionKey(position)));
  const positions = rng.shuffle(candidates).slice(0, count);

  return Array.from({ length: count }, (_, index) => ({
    id: `CHARGER_${index + 1}`,
    position: positions[index] ?? {
      x: Math.min(width - 2, 2 + index * 2),
      y: pickingStationOrientation === "width" ? 1 : height - 2,
    },
  }));
}

function createWarehouseLevels(count: number): WarehouseLevel[] {
  return Array.from({ length: Math.max(1, count) }, (_, index) => ({
    index,
    name: `Niveau ${index + 1}`,
    height: index * 1.15,
    active: index === 0,
  }));
}

function createSubMatrices(config: SimulationConfig): SubMatrixZone[] {
  const columns = Math.max(1, config.warehouse.subMatrixColumns);
  const rows = Math.max(1, config.warehouse.subMatrixRows);
  const usableMinX = 2;
  const usableMinY = 2;
  const usableWidth = Math.max(1, config.warehouse.width - 4);
  const usableHeight = Math.max(1, config.warehouse.height - 4);
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const zones: SubMatrixZone[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const origin = {
        x: Math.round(usableMinX + column * cellWidth),
        y: Math.round(usableMinY + row * cellHeight),
      };
      const nextX = Math.round(usableMinX + (column + 1) * cellWidth);
      const nextY = Math.round(usableMinY + (row + 1) * cellHeight);
      zones.push({
        id: `MATRIX_${row + 1}_${column + 1}`,
        name: `Sous-matrice ${row + 1}.${column + 1}`,
        column,
        row,
        origin,
        width: Math.max(1, nextX - origin.x),
        height: Math.max(1, nextY - origin.y),
        rackCount: 0,
      });
    }
  }

  return zones;
}

function createInterMatrixConnectors(
  subMatrices: SubMatrixZone[],
): InterMatrixConnector[] {
  const connectors: InterMatrixConnector[] = [];
  const byCoordinate = new Map(
    subMatrices.map((matrix) => [`${matrix.row}:${matrix.column}`, matrix]),
  );

  for (const matrix of subMatrices) {
    const right = byCoordinate.get(`${matrix.row}:${matrix.column + 1}`);
    if (right) {
      const y = Math.round(matrix.origin.y + matrix.height / 2);
      const startX = matrix.origin.x + matrix.width - 1;
      const endX = right.origin.x;
      connectors.push({
        id: `CONNECT_${matrix.id}_${right.id}`,
        fromSubMatrixId: matrix.id,
        toSubMatrixId: right.id,
        cells: range(Math.min(startX, endX), Math.max(startX, endX)).map((x) => ({
          x,
          y,
        })),
        orientation: "horizontal",
        trafficCount: 0,
        waitCount: 0,
      });
    }

    const below = byCoordinate.get(`${matrix.row + 1}:${matrix.column}`);
    if (below) {
      const x = Math.round(matrix.origin.x + matrix.width / 2);
      const startY = matrix.origin.y + matrix.height - 1;
      const endY = below.origin.y;
      connectors.push({
        id: `CONNECT_${matrix.id}_${below.id}`,
        fromSubMatrixId: matrix.id,
        toSubMatrixId: below.id,
        cells: range(Math.min(startY, endY), Math.max(startY, endY)).map((y) => ({
          x,
          y,
        })),
        orientation: "vertical",
        trafficCount: 0,
        waitCount: 0,
      });
    }
  }

  return connectors;
}

function createElevatorZones(
  width: number,
  height: number,
  levels: WarehouseLevel[],
): ElevatorZone[] {
  const { aisleColumns } = computeAisleLayout(width);

  return aisleColumns.map((dedicatedColumn, index) => ({
    id: `ELEVATOR_${index + 1}`,
    name:
      aisleColumns.length === 1
        ? "Couloir ascenseur"
        : `Couloir ascenseur ${index + 1}`,
    position: { x: dedicatedColumn, y: Math.floor(height / 2) },
    cells: range(2, height - 3).map((y) => ({ x: dedicatedColumn, y })),
    orientation: "vertical-aisle",
    levels: levels.map((level) => level.index),
    queueLength: 0,
    tripsCompleted: 0,
    busy: false,
  }));
}

function computeAisleLayout(width: number): {
  aisleColumns: number[];
  rackColumns: number[];
} {
  const aisleColumns: number[] = [];
  const rackColumns: number[] = [];
  const minX = WAREHOUSE_LAYOUT_EDGE_BUFFER;
  const maxX = width - WAREHOUSE_LAYOUT_EDGE_BUFFER;
  let cursor = minX;

  while (cursor <= maxX) {
    for (
      let offset = 0;
      offset < RACK_COLUMNS_PER_ELEVATOR_AISLE && cursor <= maxX;
      offset += 1
    ) {
      rackColumns.push(cursor);
      cursor += 1;
    }

    if (cursor <= maxX) {
      aisleColumns.push(cursor);
      cursor += 1;
    }
  }

  if (aisleColumns.length === 0) {
    aisleColumns.push(Math.max(1, Math.floor(width / 2)));
  }

  return { aisleColumns, rackColumns };
}

export function getElevatorAisleCountForWidth(width: number): number {
  return computeAisleLayout(width).aisleColumns.length;
}

/** Rows that act as horizontal cross-aisles (kept rack-free). A count <= 0
 *  disables cross-aisles, matching a layout where robots cannot change between
 *  the vertical main aisles except through the end loops. */
function computeCorridorRows(height: number, count: number): number[] {
  const passageCount = Math.max(0, Math.round(count));
  if (passageCount <= 0) {
    return [];
  }

  const usableMinY = 2;
  const usableMaxY = height - 3;
  const rows: number[] = [];
  for (let index = 0; index < passageCount; index += 1) {
    const ratio = (index + 1) / (passageCount + 1);
    const y = Math.round(usableMinY + ratio * (usableMaxY - usableMinY));
    if (y >= usableMinY && y <= usableMaxY && !rows.includes(y)) {
      rows.push(y);
    }
  }

  return rows.sort((a, b) => a - b);
}

function createRackLayout(
  cells: Cell[],
  config: SimulationConfig,
  pickingStations: PickingStation[],
  subMatrices: SubMatrixZone[],
): { racks: Rack[]; storageLocations: StorageLocation[] } {
  const racks: Rack[] = [];
  const storageLocations: StorageLocation[] = [];
  const reserved = new Set(
    cells
      .filter((cell) => cell.type !== "empty")
      .map((cell) => positionKey(cell)),
  );
  const corridorRows = new Set(
    computeCorridorRows(
      config.warehouse.height,
      Math.round(config.warehouse.crossAisleSpacing ?? 3),
    ),
  );
  const { rackColumns } = computeAisleLayout(config.warehouse.width);
  const rackTarget = getRackTarget(cells, config, reserved, corridorRows, subMatrices);

  for (let y = 2; y < config.warehouse.height - 2; y += 1) {
    if (corridorRows.has(y)) {
      continue;
    }

    for (const x of rackColumns) {
      if (racks.length >= rackTarget) {
        return { racks, storageLocations };
      }

      const position = { x, y };
      if (
        reserved.has(positionKey(position)) ||
        isSubMatrixBoundary(position, config, subMatrices)
      ) {
        continue;
      }

      const accessPosition = findAccessPosition(
        position,
        config.warehouse.width,
        config.warehouse.height,
        reserved,
      );

      if (!accessPosition) {
        continue;
      }

      const rackId = `RACK_${racks.length + 1}`;
      const locationIds = Array.from(
        { length: config.warehouse.levelCount },
        (_, level) => `LOC_${racks.length + 1}_${level + 1}`,
      );
      const distanceToNearestStation = Math.min(
        ...pickingStations.map((station) =>
          manhattanDistance(accessPosition, station.accessPosition),
        ),
      );

      racks.push({
        id: rackId,
        position,
        width: 1,
        height: 1,
        levels: config.warehouse.levelCount,
        locationIds,
        accessCount: 0,
      });
      locationIds.forEach((locationId, level) => {
        storageLocations.push({
          id: locationId,
          rackId,
          position,
          level,
          accessPosition,
          distanceToNearestStation: distanceToNearestStation + level * 1.6,
          accessCount: 0,
        });
      });
      reserved.add(positionKey(position));
      setCell(cells, position, { type: "rack", rackId });
    }
  }

  return { racks, storageLocations };
}

function getRackTarget(
  cells: Cell[],
  config: SimulationConfig,
  reserved: Set<string>,
  corridorRows: Set<number>,
  subMatrices: SubMatrixZone[],
): number {
  const cellByKey = new Map(cells.map((cell) => [positionKey(cell), cell]));
  const { rackColumns } = computeAisleLayout(config.warehouse.width);
  let availableSlots = 0;

  for (let y = 2; y < config.warehouse.height - 2; y += 1) {
    if (corridorRows.has(y)) {
      continue;
    }

    for (const x of rackColumns) {
      const position = { x, y };
      const key = positionKey(position);
      const cell = cellByKey.get(key);
      if (
        !cell ||
        reserved.has(key) ||
        isSubMatrixBoundary(position, config, subMatrices)
      ) {
        continue;
      }

      const accessPosition = findAccessPosition(
        position,
        config.warehouse.width,
        config.warehouse.height,
        reserved,
      );
      if (accessPosition) {
        availableSlots += 1;
      }
    }
  }

  const density = Math.max(0, Math.min(1, config.warehouse.storageDensity));
  const autoTarget = Math.ceil(availableSlots * density);
  return Math.max(1, Math.min(availableSlots, autoTarget));
}

function isSubMatrixBoundary(
  position: GridPosition,
  config: SimulationConfig,
  subMatrices: SubMatrixZone[],
): boolean {
  if (config.warehouse.subMatrixColumns <= 1 && config.warehouse.subMatrixRows <= 1) {
    return false;
  }

  const corridorWidth = Math.max(1, config.warehouse.interMatrixCorridorWidth);
  return subMatrices.some((matrix) => {
    const rightEdge = matrix.origin.x + matrix.width - 1;
    const bottomEdge = matrix.origin.y + matrix.height - 1;
    const nearVerticalBoundary =
      matrix.column < config.warehouse.subMatrixColumns - 1 &&
      Math.abs(position.x - rightEdge) < corridorWidth;
    const nearHorizontalBoundary =
      matrix.row < config.warehouse.subMatrixRows - 1 &&
      Math.abs(position.y - bottomEdge) < corridorWidth;
    return nearVerticalBoundary || nearHorizontalBoundary;
  });
}

function countSubMatrixRacks(
  subMatrices: SubMatrixZone[],
  racks: Rack[],
): SubMatrixZone[] {
  return subMatrices.map((matrix) => ({
    ...matrix,
    rackCount: racks.filter(
      (rack) =>
        rack.position.x >= matrix.origin.x &&
        rack.position.x < matrix.origin.x + matrix.width &&
        rack.position.y >= matrix.origin.y &&
        rack.position.y < matrix.origin.y + matrix.height,
    ).length,
  }));
}

function findAccessPosition(
  rackPosition: GridPosition,
  width: number,
  height: number,
  reserved: Set<string>,
): GridPosition | undefined {
  const candidates = [
    { x: rackPosition.x - 1, y: rackPosition.y },
    { x: rackPosition.x + 1, y: rackPosition.y },
    { x: rackPosition.x, y: rackPosition.y - 1 },
    { x: rackPosition.x, y: rackPosition.y + 1 },
  ];

  return candidates.find(
    (candidate) =>
      inBounds(candidate, width, height) && !reserved.has(positionKey(candidate)),
  );
}

function setCell(
  cells: Cell[],
  position: GridPosition,
  patch: Partial<Cell>,
): void {
  const cell = cells.find(
    (candidate) => candidate.x === position.x && candidate.y === position.y,
  );

  if (cell) {
    Object.assign(cell, patch);
  }
}

function createRailNetwork(
  cells: Cell[],
  config: SimulationConfig,
  pickingStations: PickingStation[],
  chargingStations: ChargingStation[],
  elevatorZones: ElevatorZone[],
): { rails: Rail[]; switches: Switch[] } {
  const rails: Rail[] = [];
  const switchesByKey = new Map<string, Switch>();
  const cellByKey = new Map(cells.map((cell) => [positionKey(cell), cell]));
  const isRailMode = config.movement.trafficMode === "rails-guided";
  const horizontalRows = uniqueNumbers([
    ...pickingStations.map((station) => station.accessPosition.y),
    ...elevatorZones.map((elevator) => elevator.position.y),
    Math.floor(config.warehouse.height / 2),
    config.warehouse.height - 3,
  ])
    .filter((y) => y > 0 && y < config.warehouse.height - 1)
    .sort((a, b) => a - b);
  const verticalColumns = uniqueNumbers([
    3,
    ...elevatorZones.map((elevator) => elevator.position.x),
    Math.floor(config.warehouse.width * 0.42),
    Math.floor(config.warehouse.width * 0.68),
    config.warehouse.width - 3,
  ])
    .filter((x) => x > 1 && x < config.warehouse.width - 1)
    .sort((a, b) => a - b);

  horizontalRows.forEach((y, index) => {
    const rail: Rail = {
      id: `RAIL_H_${index + 1}`,
      direction: "two-way",
      role: index === 0 ? "station-loop" : "main",
      cells: range(1, config.warehouse.width - 2)
        .map((x) => ({ x, y }))
        .filter((position) => isRailCandidate(position, cellByKey)),
    };
    rails.push(rail);
  });

  verticalColumns.forEach((x, index) => {
    const rail: Rail = {
      id: `RAIL_V_${index + 1}`,
      direction: "two-way",
      role: index === 0 ? "station-loop" : "cross",
      cells: range(1, config.warehouse.height - 2)
        .map((y) => ({ x, y }))
        .filter((position) => isRailCandidate(position, cellByKey)),
    };
    rails.push(rail);
  });

  for (const rail of rails) {
    for (const position of rail.cells) {
      const cell = cellByKey.get(positionKey(position));
      if (!cell) {
        continue;
      }

      if (cell.type === "empty") {
        cell.type = "rail";
        cell.railId = rail.id;
      }

      const connectedRailIds = rails
        .filter(
          (candidate) =>
            candidate.id !== rail.id &&
            candidate.cells.some(
              (candidatePosition) =>
                candidatePosition.x === position.x &&
                candidatePosition.y === position.y,
            ),
        )
        .map((candidate) => candidate.id);

      if (connectedRailIds.length > 0) {
        const switchKey = positionKey(position);
        const existing = switchesByKey.get(switchKey);
        const mergedRailIds = [
          ...new Set([rail.id, ...connectedRailIds, ...(existing?.connectedRailIds ?? [])]),
        ];

        switchesByKey.set(switchKey, {
          id: `SWITCH_${position.x}_${position.y}`,
          position,
          connectedRailIds: mergedRailIds,
          kind: isRailMode ? "switch" : "intersection",
        });
      }
    }
  }

  // Add short charging spurs so the infrastructure reads as a complete system.
  chargingStations.forEach((charger, index) => {
    const rail: Rail = {
      id: `RAIL_CHARGE_${index + 1}`,
      direction: "two-way",
      role: "station-loop",
      cells: [
        { x: charger.position.x, y: charger.position.y - 1 },
        charger.position,
      ].filter((position) => isRailCandidate(position, cellByKey)),
    };
    rails.push(rail);
  });

  return {
    rails: rails.filter((rail) => rail.cells.length > 1),
    switches: [...switchesByKey.values()],
  };
}

function isRailCandidate(
  position: GridPosition,
  cellByKey: Map<string, Cell>,
): boolean {
  const cell = cellByKey.get(positionKey(position));
  return Boolean(cell && cell.type !== "rack" && cell.type !== "blocked");
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
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

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))];
}
