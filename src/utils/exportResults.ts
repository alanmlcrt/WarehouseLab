import type {
  ExperimentResult,
  MetricSample,
  SimulationState,
} from "../simulation/models/types";

export function buildExperimentResult(snapshot: SimulationState): ExperimentResult {
  return {
    id: `RUN_${Date.now()}`,
    scenarioId: snapshot.config.scenarioId,
    storageStrategy: snapshot.config.storage.strategy,
    demandPattern: snapshot.config.demand.demandPattern,
    seeds: snapshot.config.seeds,
    config: snapshot.config,
    metrics: snapshot.metrics,
    createdAt: new Date().toISOString(),
    durationSeconds: snapshot.elapsedSeconds,
  };
}

export function exportSimulationJson(snapshot: SimulationState): void {
  const result = buildExperimentResult(snapshot);
  const blob = new Blob([JSON.stringify(result, null, 2)], {
    type: "application/json",
  });
  downloadBlob(
    blob,
    `${snapshot.config.scenarioId}-${snapshot.config.storage.strategy}-${result.id}.json`,
  );
}

export function exportSimulationCsv(snapshot: SimulationState): void {
  const header: (keyof MetricSample)[] = [
    "tick",
    "elapsedSeconds",
    "completedOrders",
    "completedThisTick",
    "pendingOrders",
    "activeRobots",
    "averageProcessingTime",
    "averageRobotUtilization",
    "totalDistance",
    "congestionEvents",
    "throughputPerMinute",
  ];

  const lines = [header.join(",")];
  for (const sample of snapshot.metrics.series) {
    lines.push(
      header
        .map((key) => formatCsvValue(sample[key]))
        .join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  downloadBlob(
    blob,
    `${snapshot.config.scenarioId}-${snapshot.config.storage.strategy}-series.csv`,
  );
}

function formatCsvValue(value: number | string): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3);
  }
  return value;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
