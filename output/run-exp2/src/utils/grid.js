export function cellId(position) {
    return `${position.x}:${position.y}`;
}
export function positionKey(position) {
    return cellId(position);
}
export function samePosition(a, b) {
    return a.x === b.x && a.y === b.y;
}
export function manhattanDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function inBounds(position, width, height) {
    return (position.x >= 0 &&
        position.x < width &&
        position.y >= 0 &&
        position.y < height);
}
export function getNeighbors(position, width, height) {
    const candidates = [
        { x: position.x + 1, y: position.y },
        { x: position.x - 1, y: position.y },
        { x: position.x, y: position.y + 1 },
        { x: position.x, y: position.y - 1 },
    ];
    return candidates.filter((candidate) => inBounds(candidate, width, height));
}
export function buildCellMap(warehouse) {
    const map = new Map();
    warehouse.cells.forEach((cell, index) => map.set(positionKey(cell), index));
    return map;
}
export function buildBlockedCellSet(warehouse) {
    const blocked = new Set();
    for (const cell of warehouse.cells) {
        if (cell.type === "rack" || cell.type === "blocked") {
            blocked.add(positionKey(cell));
        }
    }
    return blocked;
}
export function formatPosition(position) {
    if (!position) {
        return "-";
    }
    return `${position.x}, ${position.y}`;
}
