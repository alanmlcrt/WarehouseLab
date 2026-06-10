import { manhattanDistance } from "../../utils/grid";
/**
 * Assigns every SKU in the catalog to a storage location according to the
 * chosen slotting strategy. Each strategy produces a genuinely different
 * placement so the lab can compare them:
 *
 *  - randomStorage      : SKUs scattered at random (baseline).
 *  - abcStorage         : highest-demand SKUs in the globally closest slots.
 *  - balancedABCStorage : highest-demand SKUs spread round-robin across the
 *                         picking stations, to avoid overloading a single one.
 *  - familyStorage      : SKUs grouped by category into contiguous distance
 *                         bands (fast family nearest, slow family furthest).
 *  - dynamicSlotting    : COI / cube-per-order — demand per unit volume, so a
 *                         small fast mover beats a bulky one for the best slot.
 */
export function applyStorageStrategy(warehouse, catalog, strategy, rng) {
    const orderedSkus = orderSkus(catalog, strategy, rng);
    const orderedLocations = orderLocations(warehouse, strategy, rng);
    const assignedCatalog = orderedSkus.map((sku, index) => ({
        ...sku,
        currentLocation: orderedLocations[index]?.id,
    }));
    const catalogById = new Map(assignedCatalog.map((sku) => [sku.id, sku]));
    const locationAssignments = new Map();
    assignedCatalog.forEach((sku) => {
        if (sku.currentLocation) {
            locationAssignments.set(sku.currentLocation, sku.id);
        }
    });
    return {
        ...warehouse,
        storageLocations: warehouse.storageLocations.map((location) => ({
            ...location,
            skuId: locationAssignments.get(location.id),
            accessCount: 0,
        })),
        racks: warehouse.racks.map((rack) => ({ ...rack, accessCount: 0 })),
        skuCatalog: warehouse.skuCatalog.map((sku) => catalogById.get(sku.id) ?? sku),
    };
}
function categoryRank(category) {
    if (category === "fast-moving") {
        return 0;
    }
    if (category === "medium-moving") {
        return 1;
    }
    return 2;
}
/** Returns the catalog ordered by descending placement priority — the first
 *  SKU should get the first (best) location returned by `orderLocations`. */
function orderSkus(catalog, strategy, rng) {
    switch (strategy) {
        case "abcStorage":
        case "balancedABCStorage":
            return [...catalog].sort((a, b) => b.demandWeight - a.demandWeight);
        case "familyStorage":
            return [...catalog].sort((a, b) => categoryRank(a.category) - categoryRank(b.category) ||
                b.demandWeight - a.demandWeight);
        case "dynamicSlotting":
            // Cube-per-order index: demand per unit volume (higher = closer slot).
            return [...catalog].sort((a, b) => b.demandWeight / Math.max(0.1, b.volume) -
                a.demandWeight / Math.max(0.1, a.volume));
        case "randomStorage":
        default:
            return rng.shuffle(catalog);
    }
}
/** Returns storage locations ordered from best to worst for the strategy. */
function orderLocations(warehouse, strategy, rng) {
    if (strategy === "randomStorage") {
        return rng.shuffle(warehouse.storageLocations);
    }
    const byDistance = [...warehouse.storageLocations].sort((a, b) => a.distanceToNearestStation - b.distanceToNearestStation);
    if (strategy !== "balancedABCStorage") {
        return byDistance;
    }
    // Balanced ABC: bucket each slot under its nearest station (keeping distance
    // order inside each bucket), then round-robin so the most popular SKUs land
    // near *different* stations instead of clustering at one.
    const stations = warehouse.pickingStations;
    if (stations.length <= 1) {
        return byDistance;
    }
    const buckets = new Map();
    for (const location of byDistance) {
        let nearest = 0;
        let best = Infinity;
        stations.forEach((station, index) => {
            const distance = manhattanDistance(station.accessPosition, location.accessPosition);
            if (distance < best) {
                best = distance;
                nearest = index;
            }
        });
        const bucket = buckets.get(nearest) ?? [];
        bucket.push(location);
        buckets.set(nearest, bucket);
    }
    const bucketArrays = [...buckets.values()];
    const interleaved = [];
    for (let depth = 0; interleaved.length < byDistance.length; depth += 1) {
        let added = false;
        for (const bucket of bucketArrays) {
            if (bucket[depth]) {
                interleaved.push(bucket[depth]);
                added = true;
            }
        }
        if (!added) {
            break;
        }
    }
    return interleaved;
}
