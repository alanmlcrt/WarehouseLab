import type { SimulationConfig } from "../simulation/models/types";
import type { CombinationEntry } from "./labKit";
import type {
  LabWorkerRequest,
  LabWorkerResponse,
  LabWorkerResultEntry,
  LabWorkerRunTask,
} from "./labWorkerMessages";

/** Are Web Workers available? False under SSR / Node test runners, where the
 *  lab falls back to a single-threaded sweep. */
export function isWorkerPoolSupported(): boolean {
  return typeof Worker !== "undefined";
}

/** How many workers to spawn for a sweep. Leaves one core for the main thread
 *  so progress reporting and the UI stay responsive during the run. Capped by
 *  the amount of work so we never spawn idle workers. */
export function chooseWorkerCount(totalRuns: number): number {
  const hardware =
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const desired = Math.max(1, hardware - 1);
  return Math.max(1, Math.min(desired, totalRuns));
}

export interface LabPoolOptions {
  baseConfig: SimulationConfig;
  combinations: CombinationEntry[][];
  ticksPerRun: number;
  warmupSeconds: number;
  seedCount: number;
  /** Total runs = combinations.length * seedCount. */
  totalRuns: number;
  workerCount: number;
  /** Runs handed to a worker per message. Trades postMessage overhead against
   *  load-balancing granularity. */
  chunkSize: number;
  /** Called as each chunk comes back, for result placement + progress. */
  onResults: (entries: LabWorkerResultEntry[]) => void;
}

/** Run the full sweep across a pool of workers using a dynamic work queue:
 *  each worker pulls the next chunk when it finishes, so uneven per-run costs
 *  (bigger warehouses run slower) self-balance. Resolves once every run is done.
 *  Results are addressed by global index, so the caller reconstructs the exact
 *  sequential order regardless of completion order. */
export function runWithWorkerPool(options: LabPoolOptions): Promise<void> {
  const {
    baseConfig,
    combinations,
    ticksPerRun,
    warmupSeconds,
    seedCount,
    totalRuns,
    workerCount,
    chunkSize,
    onResults,
  } = options;

  return new Promise<void>((resolve, reject) => {
    if (totalRuns === 0) {
      resolve();
      return;
    }

    const workers: Worker[] = [];
    let cursor = 0;
    let inFlight = 0;
    let settled = false;

    const cleanup = (): void => {
      for (const worker of workers) {
        worker.terminate();
      }
    };

    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    // Slice the next chunk straight from the global cursor; indices map back to
    // (combination, seed) without materialising the whole task list.
    const nextChunk = (): LabWorkerRunTask[] => {
      const tasks: LabWorkerRunTask[] = [];
      const end = Math.min(cursor + chunkSize, totalRuns);
      for (; cursor < end; cursor += 1) {
        tasks.push({
          i: cursor,
          c: Math.floor(cursor / seedCount),
          s: cursor % seedCount,
        });
      }
      return tasks;
    };

    const dispatch = (worker: Worker): void => {
      const tasks = nextChunk();
      if (tasks.length === 0) {
        // No work left for this worker. The run is complete once the last
        // in-flight chunk has also drained.
        if (inFlight === 0 && !settled) {
          settled = true;
          cleanup();
          resolve();
        }
        return;
      }
      inFlight += 1;
      const run: LabWorkerRequest = { type: "run", tasks };
      worker.postMessage(run);
    };

    for (let index = 0; index < workerCount; index += 1) {
      const worker = new Worker(
        new URL("./labWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<LabWorkerResponse>) => {
        if (settled) return;
        const message = event.data;
        if (message.type === "error") {
          fail(message.message);
          return;
        }
        inFlight -= 1;
        onResults(message.results);
        dispatch(worker);
      };
      worker.onerror = (event) => {
        fail(event.message || "Lab worker crashed");
      };
      workers.push(worker);

      const init: LabWorkerRequest = {
        type: "init",
        baseConfig,
        combinations,
        ticksPerRun,
        warmupSeconds,
      };
      worker.postMessage(init);
      dispatch(worker);
    }
  });
}
