import type { GridPosition, Warehouse } from "../models/types";
import {
  buildBlockedCellSet,
  buildCellMap,
  getNeighbors,
  manhattanDistance,
  positionKey,
  samePosition,
} from "../../utils/grid";

export type PathfindingAlgorithm = "manhattan" | "astar" | "dijkstra";

export interface PathfindingOptions {
  warehouse: Warehouse;
  occupied?: Set<string>;
  blocked?: Set<string>;
  cellMap?: Map<string, number>;
  trafficWeight?: number;
  waitWeight?: number;
}

export function findManhattanPath(
  start: GridPosition,
  target: GridPosition,
  options: PathfindingOptions,
): GridPosition[] {
  if (samePosition(start, target)) {
    return [];
  }

  const blocked = options.blocked ?? buildBlockedCellSet(options.warehouse);
  const occupied = options.occupied ?? new Set<string>();
  const queue: GridPosition[] = [start];
  const visited = new Set<string>([positionKey(start)]);
  const parent = new Map<string, string>();
  const positions = new Map<string, GridPosition>([[positionKey(start), start]]);
  const targetKey = positionKey(target);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const neighbors = getNeighbors(
      current,
      options.warehouse.width,
      options.warehouse.height,
    ).sort(
      (a, b) => manhattanDistance(a, target) - manhattanDistance(b, target),
    );

    for (const neighbor of neighbors) {
      const key = positionKey(neighbor);
      const isTarget = key === targetKey;

      if (visited.has(key)) {
        continue;
      }

      if (!isTarget && (blocked.has(key) || occupied.has(key))) {
        continue;
      }

      visited.add(key);
      parent.set(key, positionKey(current));
      positions.set(key, neighbor);

      if (isTarget) {
        return reconstructPath(parent, positions, positionKey(start), targetKey);
      }

      queue.push(neighbor);
    }
  }

  return [];
}

export function findWeightedPath(
  start: GridPosition,
  target: GridPosition,
  options: PathfindingOptions,
  algorithm: "astar" | "dijkstra" = "astar",
): GridPosition[] {
  if (samePosition(start, target)) {
    return [];
  }

  const blocked = options.blocked ?? buildBlockedCellSet(options.warehouse);
  const occupied = options.occupied ?? new Set<string>();
  const cellMap = options.cellMap ?? buildCellMap(options.warehouse);
  const trafficWeight = options.trafficWeight ?? 0.04;
  const waitWeight = options.waitWeight ?? 0.12;
  const useHeuristic = algorithm === "astar";

  const startKey = positionKey(start);
  const targetKey = positionKey(target);
  const gScore = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string>();
  const positions = new Map<string, GridPosition>([[startKey, start]]);
  const open = new MinHeap<{ key: string; position: GridPosition; f: number }>(
    (a, b) => a.f - b.f,
  );

  open.push({ key: startKey, position: start, f: 0 });

  while (open.size > 0) {
    const current = open.pop()!;

    if (current.key === targetKey) {
      return reconstructPath(parent, positions, startKey, targetKey);
    }

    const currentG = gScore.get(current.key) ?? Infinity;

    const neighbors = getNeighbors(
      current.position,
      options.warehouse.width,
      options.warehouse.height,
    );

    for (const neighbor of neighbors) {
      const key = positionKey(neighbor);
      const isTarget = key === targetKey;

      if (!isTarget && (blocked.has(key) || occupied.has(key))) {
        continue;
      }

      const cellIndex = cellMap.get(key);
      const cell = cellIndex !== undefined ? options.warehouse.cells[cellIndex] : undefined;
      const stepCost =
        1 +
        (cell ? cell.trafficCount * trafficWeight + cell.waitCount * waitWeight : 0);
      const tentative = currentG + stepCost;

      if (tentative >= (gScore.get(key) ?? Infinity)) {
        continue;
      }

      gScore.set(key, tentative);
      parent.set(key, current.key);
      positions.set(key, neighbor);

      const h = useHeuristic ? manhattanDistance(neighbor, target) : 0;
      open.push({ key, position: neighbor, f: tentative + h });
    }
  }

  return [];
}

export function findPath(
  start: GridPosition,
  target: GridPosition,
  options: PathfindingOptions,
  algorithm: PathfindingAlgorithm,
): GridPosition[] {
  if (algorithm === "manhattan") {
    return findManhattanPath(start, target, options);
  }
  return findWeightedPath(start, target, options, algorithm);
}

function reconstructPath(
  parent: Map<string, string>,
  positions: Map<string, GridPosition>,
  startKey: string,
  targetKey: string,
): GridPosition[] {
  const reversed: GridPosition[] = [];
  let currentKey = targetKey;

  while (currentKey !== startKey) {
    const position = positions.get(currentKey);
    const previousKey = parent.get(currentKey);

    if (!position || !previousKey) {
      return [];
    }

    reversed.push(position);
    currentKey = previousKey;
  }

  return reversed.reverse();
}

class MinHeap<T> {
  private readonly data: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.data.length;
  }

  push(value: T): void {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) {
      return undefined;
    }
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.data[index], this.data[parent]) >= 0) {
        return;
      }
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    const length = this.data.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}
