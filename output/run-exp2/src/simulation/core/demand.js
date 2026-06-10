import { getDemandWeight } from "../../data/catalog";
import { weightedRandomChoice } from "../../utils/random";
export function getEffectiveOrdersPerMinute(demandConfig, elapsedSeconds) {
    if (!demandConfig.peakDemandEnabled) {
        return demandConfig.ordersPerMinute;
    }
    const elapsedMinutes = elapsedSeconds / 60;
    const peakEnd = demandConfig.peakStartMinute + demandConfig.peakDurationMinutes;
    if (elapsedMinutes >= demandConfig.peakStartMinute &&
        elapsedMinutes < peakEnd) {
        return demandConfig.ordersPerMinute * demandConfig.peakMultiplier;
    }
    return demandConfig.ordersPerMinute;
}
export function getEffectiveCrateOrdersPerMinute(demandConfig, elapsedSeconds) {
    return (getEffectiveOrdersPerMinute(demandConfig, elapsedSeconds) *
        Math.max(1, demandConfig.averageItemsPerOrder));
}
export function createOrder(orderNumber, warehouse, demandConfig, elapsedSeconds, rng) {
    const availableSkus = warehouse.skuCatalog.filter((sku) => sku.currentLocation);
    const sku = chooseSku(availableSkus, demandConfig, rng);
    const line = {
        skuId: sku.id,
        quantity: 1,
    };
    const urgent = rng.next() < demandConfig.urgentOrderRate;
    return {
        id: `ORD_${String(orderNumber).padStart(5, "0")}`,
        lines: [line],
        status: "pending",
        priority: urgent ? 0 : getOrderPriority([sku.id], warehouse.skuCatalog),
        urgent,
        createdAt: elapsedSeconds,
    };
}
function chooseSku(catalog, demandConfig, rng) {
    return weightedRandomChoice(rng, catalog.map((sku) => ({
        item: sku,
        weight: getDemandWeight(sku, catalog, demandConfig.demandPattern),
    })));
}
function getOrderPriority(skuIds, catalog) {
    const catalogById = new Map(catalog.map((sku) => [sku.id, sku]));
    return Math.min(...skuIds.map((skuId) => catalogById.get(skuId)?.priority ?? 3));
}
