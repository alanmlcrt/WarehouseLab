import type { DemandProfile, SKU } from "../simulation/models/types";
import type { SeededRandom } from "../utils/random";

const categoryNames = {
  "fast-moving": "A",
  "medium-moving": "B",
  "slow-moving": "C",
} as const;

export function createSkuCatalog(
  skuCount: number,
  rng?: SeededRandom,
): SKU[] {
  return Array.from({ length: skuCount }, (_, index) => {
    const rank = index / Math.max(1, skuCount - 1);
    const category =
      rank < 0.2
        ? "fast-moving"
        : rank < 0.55
          ? "medium-moving"
          : "slow-moving";
    const categoryWeight =
      category === "fast-moving" ? 100 : category === "medium-moving" ? 35 : 8;

    const demandJitter = rng ? rng.float(0.92, 1.08) : 1;
    const volumeJitter = rng ? rng.float(-0.25, 0.25) : 0;
    const handlingJitter = rng ? rng.int(0, 1) : 0;

    return {
      id: `SKU_${String(index + 1).padStart(3, "0")}`,
      name: `Produit ${categoryNames[category]}-${String(index + 1).padStart(3, "0")}`,
      category,
      demandWeight: Math.max(1, Math.round((categoryWeight - rank * 6) * demandJitter)),
      // Volume is deliberately decorrelated from velocity (a fast mover can be
      // bulky, a slow mover compact). This is what lets COI / cube-per-order
      // slotting produce a genuinely different layout than plain demand ABC.
      volume: Math.max(0.25, 0.5 + (((index * 7) + 3) % 6) * 0.5 + volumeJitter),
      handlingTime:
        (category === "fast-moving" ? 2 : category === "medium-moving" ? 3 : 4) +
        handlingJitter,
      priority: category === "fast-moving" ? 1 : category === "medium-moving" ? 2 : 3,
      accessCount: 0,
    };
  });
}

export function getDemandWeight(
  sku: SKU,
  catalog: SKU[],
  pattern: DemandProfile,
): number {
  if (pattern === "uniform") {
    return 1;
  }

  if (pattern === "abc" || pattern === "custom") {
    return sku.demandWeight;
  }

  const index = catalog.findIndex((candidate) => candidate.id === sku.id);
  const topCutoff = Math.max(1, Math.ceil(catalog.length * 0.2));
  return index < topCutoff ? 80 / topCutoff : 20 / Math.max(1, catalog.length - topCutoff);
}
