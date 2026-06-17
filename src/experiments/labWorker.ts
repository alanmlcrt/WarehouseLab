/// <reference lib="webworker" />

import { runSinglePoint } from "./labKit";
import type { CombinationEntry } from "./labKit";
import type { SimulationConfig } from "../simulation/models/types";
import type { LabWorkerRequest, LabWorkerResponse } from "./labWorkerMessages";

// State set once by the `init` message, then reused for every `run` chunk.
let baseConfig: SimulationConfig | undefined;
let combinations: CombinationEntry[][] = [];
let ticksPerRun = 0;
let warmupSeconds = 0;

self.onmessage = (event: MessageEvent<LabWorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      baseConfig = message.baseConfig;
      combinations = message.combinations;
      ticksPerRun = message.ticksPerRun;
      warmupSeconds = message.warmupSeconds;
      return;
    }

    // message.type === "run"
    if (!baseConfig) {
      throw new Error("Lab worker received a run before init");
    }
    const config = baseConfig;
    const results = message.tasks.map((task) => ({
      i: task.i,
      point: runSinglePoint(
        config,
        combinations[task.c],
        task.s,
        ticksPerRun,
        warmupSeconds,
      ),
    }));
    post({ type: "done", results });
  } catch (error) {
    post({
      type: "error",
      message:
        error instanceof Error ? error.message : "Unknown lab worker error",
    });
  }
};

function post(message: LabWorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}
