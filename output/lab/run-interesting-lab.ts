import { runLab, type LabPlan } from "../../src/experiments/labKit";
import { cloneConfig, scenarios } from "../../src/simulation/scenarios/presets";
import { mkdir, writeFile } from "node:fs/promises";

const baseConfig = cloneConfig(scenarios[0].config);
baseConfig.name = "Interesting layout DOE";
baseConfig.warehouse.width = 24;
baseConfig.warehouse.height = 18;
baseConfig.warehouse.crossAisleSpacing = 2;
baseConfig.warehouse.storageDensity = 1;
baseConfig.warehouse.pickingStationCount = 3;
baseConfig.robots.robotCount = 14;
baseConfig.demand.ordersPerMinute = 22;
baseConfig.movement.pathfindingStrategy = "astar";

const plan: LabPlan = {
  seedCount: 2,
  simulatedMinutes: 4,
  warmupMinutes: 1,
  bindings: [
    { factorId: "crossAisleSpacing", values: [0, 1, 3] },
    { factorId: "pickingStationOrientation", values: ["length", "width"] },
    { factorId: "storageStrategy", values: ["abcStorage", "balancedABCStorage"] },
    { factorId: "reroutingPolicy", values: ["fixed", "reactive"] },
    { factorId: "ordersPerMinute", values: [22, 32] },
  ],
};

const points = await runLab({
  baseConfig,
  plan,
  onProgress: (progress) => {
    if (
      progress.completedRuns === 0 ||
      progress.completedRuns === progress.totalRuns ||
      progress.completedRuns % 12 === 0
    ) {
      console.log(
        `${progress.completedRuns}/${progress.totalRuns} ${progress.currentLabel}`,
      );
    }
  },
});

function groupKey(point: (typeof points)[number], keys: string[]): string {
  return keys.map((key) => `${key}=${point.factors[key]}`).join(" | ");
}

function summarize(keys: string[]) {
  const groups = new Map<string, typeof points>();
  for (const point of points) {
    const key = groupKey(point, keys);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const mean = (metric: string) =>
        rows.reduce((sum, row) => sum + (row.metrics[metric] ?? 0), 0) /
        Math.max(1, rows.length);
      return {
        key,
        n: rows.length,
        feasibleShare:
          rows.filter((row) => row.feasible).length / Math.max(1, rows.length),
        throughput: mean("steadyThroughputPerMinute"),
        backlog: mean("steadyBacklog"),
        utilization: mean("steadyUtilization"),
        energyPerOrder: mean("energyPerOrder"),
        distancePerOrder: mean("averageDistancePerOrder"),
        congestion: mean("congestionEvents"),
        feasibilityMargin: mean("feasibilityMargin"),
      };
    })
    .sort((a, b) => b.feasibilityMargin - a.feasibilityMargin);
}

const result = {
  generatedAt: new Date().toISOString(),
  baseConfig,
  plan,
  points,
  summaries: {
    passagesOrientation: summarize([
      "crossAisleSpacing",
      "pickingStationOrientation",
    ]),
    reroutingPassages: summarize(["reroutingPolicy", "crossAisleSpacing"]),
    storageOrientation: summarize([
      "storageStrategy",
      "pickingStationOrientation",
    ]),
    demandPolicy: summarize(["ordersPerMinute", "reroutingPolicy"]),
    full: summarize([
      "ordersPerMinute",
      "crossAisleSpacing",
      "pickingStationOrientation",
      "storageStrategy",
      "reroutingPolicy",
    ]),
  },
};

await mkdir("output/lab", { recursive: true });
await writeFile(
  "output/lab/interesting-layout-doe.json",
  JSON.stringify(result, null, 2),
  "utf-8",
);

console.log("\nTOP passages x orientation");
console.table(result.summaries.passagesOrientation.slice(0, 8));
console.log("\nTOP rerouting x passages");
console.table(result.summaries.reroutingPassages.slice(0, 8));
console.log("\nTOP storage x orientation");
console.table(result.summaries.storageOrientation.slice(0, 8));
