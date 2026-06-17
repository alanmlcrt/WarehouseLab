import type { SimulationConfig } from "../simulation/models/types";
import type { CombinationEntry, RunPoint } from "./labKit";

/** Sent once per worker. Carries everything constant across the whole run so the
 *  per-chunk `run` messages stay tiny (just task indices). */
export interface LabWorkerInit {
  type: "init";
  baseConfig: SimulationConfig;
  combinations: CombinationEntry[][];
  ticksPerRun: number;
  warmupSeconds: number;
}

/** One simulation run, addressed by indices into the init payload.
 *  i = global run index (combo-major, seed-minor), c = combination index,
 *  s = seed index. */
export interface LabWorkerRunTask {
  i: number;
  c: number;
  s: number;
}

export interface LabWorkerRun {
  type: "run";
  tasks: LabWorkerRunTask[];
}

export type LabWorkerRequest = LabWorkerInit | LabWorkerRun;

export interface LabWorkerResultEntry {
  i: number;
  point: RunPoint;
}

export type LabWorkerResponse =
  | { type: "done"; results: LabWorkerResultEntry[] }
  | { type: "error"; message: string };
