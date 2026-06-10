export const ENERGY_DENSITY_PER_KG = 14;
export function deriveBatteryWeightKg(maxBattery) {
    return Math.round((maxBattery / ENERGY_DENSITY_PER_KG) * 10) / 10;
}
export function buildSeedsFromMaster(masterSeed) {
    const base = Math.max(1, Math.floor(masterSeed));
    return {
        layoutSeed: base,
        skuCatalogSeed: offsetSeed(base, 101),
        stationSeed: offsetSeed(base, 202),
        robotSpawnSeed: offsetSeed(base, 303),
        demandSeed: offsetSeed(base, 404),
        trafficSeed: offsetSeed(base, 505),
        batterySeed: offsetSeed(base, 606),
        failureSeed: offsetSeed(base, 707),
    };
}
function offsetSeed(seed, salt) {
    let value = Math.imul(seed + salt, 0x9e3779b1) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
    return ((value ^ (value >>> 13)) >>> 0) % 999999 || 1;
}
