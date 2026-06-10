import { buildBlockedCellSet, buildCellMap, getNeighbors, manhattanDistance, positionKey, samePosition, } from "../../utils/grid";
export function findManhattanPath(start, target, options) {
    if (samePosition(start, target)) {
        return [];
    }
    const blocked = options.blocked ?? buildBlockedCellSet(options.warehouse);
    const occupied = options.occupied ?? new Set();
    const queue = [start];
    const visited = new Set([positionKey(start)]);
    const parent = new Map();
    const positions = new Map([[positionKey(start), start]]);
    const targetKey = positionKey(target);
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
            break;
        }
        const neighbors = getNeighbors(current, options.warehouse.width, options.warehouse.height).sort((a, b) => manhattanDistance(a, target) - manhattanDistance(b, target));
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
export function findWeightedPath(start, target, options, algorithm = "astar") {
    if (samePosition(start, target)) {
        return [];
    }
    const blocked = options.blocked ?? buildBlockedCellSet(options.warehouse);
    const occupied = options.occupied ?? new Set();
    const cellMap = options.cellMap ?? buildCellMap(options.warehouse);
    const trafficWeight = options.trafficWeight ?? 0.04;
    const waitWeight = options.waitWeight ?? 0.12;
    const useHeuristic = algorithm === "astar";
    const startKey = positionKey(start);
    const targetKey = positionKey(target);
    const gScore = new Map([[startKey, 0]]);
    const parent = new Map();
    const positions = new Map([[startKey, start]]);
    const open = new MinHeap((a, b) => a.f - b.f);
    open.push({ key: startKey, position: start, f: 0 });
    while (open.size > 0) {
        const current = open.pop();
        if (current.key === targetKey) {
            return reconstructPath(parent, positions, startKey, targetKey);
        }
        const currentG = gScore.get(current.key) ?? Infinity;
        const neighbors = getNeighbors(current.position, options.warehouse.width, options.warehouse.height);
        for (const neighbor of neighbors) {
            const key = positionKey(neighbor);
            const isTarget = key === targetKey;
            if (!isTarget && (blocked.has(key) || occupied.has(key))) {
                continue;
            }
            const cellIndex = cellMap.get(key);
            const cell = cellIndex !== undefined ? options.warehouse.cells[cellIndex] : undefined;
            const stepCost = 1 +
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
export function findPath(start, target, options, algorithm) {
    if (algorithm === "manhattan") {
        return findManhattanPath(start, target, options);
    }
    return findWeightedPath(start, target, options, algorithm);
}
function reconstructPath(parent, positions, startKey, targetKey) {
    const reversed = [];
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
class MinHeap {
    compare;
    data = [];
    constructor(compare) {
        this.compare = compare;
    }
    get size() {
        return this.data.length;
    }
    push(value) {
        this.data.push(value);
        this.bubbleUp(this.data.length - 1);
    }
    pop() {
        if (this.data.length === 0) {
            return undefined;
        }
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this.sinkDown(0);
        }
        return top;
    }
    bubbleUp(index) {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.compare(this.data[index], this.data[parent]) >= 0) {
                return;
            }
            [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
            index = parent;
        }
    }
    sinkDown(index) {
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
