import type { GridPosition, Warehouse } from "../simulation/models/types";

export function cellId(position: GridPosition): string {
  return `${position.x}:${position.y}`;
}

export function positionKey(position: GridPosition): string {
  return cellId(position);
}

export function samePosition(a: GridPosition, b: GridPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(
  position: GridPosition,
  width: number,
  height: number,
): boolean {
  return (
    position.x >= 0 &&
    position.x < width &&
    position.y >= 0 &&
    position.y < height
  );
}

export function getNeighbors(
  position: GridPosition,
  width: number,
  height: number,
): GridPosition[] {
  const candidates = [
    { x: position.x + 1, y: position.y },
    { x: position.x - 1, y: position.y },
    { x: position.x, y: position.y + 1 },
    { x: position.x, y: position.y - 1 },
  ];

  return candidates.filter((candidate) => inBounds(candidate, width, height));
}

export function buildCellMap(warehouse: Warehouse): Map<string, number> {
  const map = new Map<string, number>();
  warehouse.cells.forEach((cell, index) => map.set(positionKey(cell), index));
  return map;
}

export function buildBlockedCellSet(warehouse: Warehouse): Set<string> {
  const blocked = new Set<string>();
  for (const cell of warehouse.cells) {
    if (cell.type === "rack" || cell.type === "blocked") {
      blocked.add(positionKey(cell));
    }
  }
  return blocked;
}

export function formatPosition(position?: GridPosition): string {
  if (!position) {
    return "-";
  }

  return `${position.x}, ${position.y}`;
}
