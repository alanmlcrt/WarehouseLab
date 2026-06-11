/// <reference lib="webworker" />

import { SimulationEngine } from "../core/SimulationEngine";
import type { SimulationConfig } from "../models/types";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from "./messages";
import { cloneConfig } from "../scenarios/presets";

let engine: SimulationEngine | undefined;
let currentConfig: SimulationConfig | undefined;
let isRunning = false;
let speed = 1;
let timerId: ReturnType<typeof setInterval> | undefined;

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  try {
    handleMessage(event.data);
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
};

function handleMessage(message: SimulationWorkerRequest): void {
  switch (message.type) {
    case "init":
    case "loadScenario":
    case "updateConfig":
      loadSimulation(message.config);
      break;
    case "replay":
      loadSimulation(message.config, true);
      break;
    case "play":
      isRunning = true;
      ensureLoop();
      postSnapshot();
      break;
    case "pause":
      isRunning = false;
      postSnapshot();
      break;
    case "reset":
      if (currentConfig) {
        // Verbatim reload: currentConfig was already normalized when it came
        // through init/updateConfig, and replay configs must keep their seeds.
        loadSimulation(currentConfig, true);
      }
      break;
    case "setSpeed":
      speed = message.speed;
      postSnapshot();
      break;
  }
}

function loadSimulation(config: SimulationConfig, preserveSeeds = false): void {
  // preserveSeeds: replay path. cloneConfig→normalizeConfig would rebuild every
  // seed from the layout master seed and lose the lab run's exact seed offsets,
  // so replays deep-clone verbatim. `reset` keeps replaying the same run because
  // currentConfig already holds the preserved seeds.
  currentConfig = preserveSeeds
    ? (JSON.parse(JSON.stringify(config)) as SimulationConfig)
    : cloneConfig(config);
  engine = new SimulationEngine(currentConfig);
  isRunning = false;
  ensureLoop();
  postSnapshot();
}

function ensureLoop(): void {
  if (timerId !== undefined) {
    return;
  }

  timerId = setInterval(() => {
    if (!engine || !isRunning) {
      return;
    }

    for (let index = 0; index < speed; index += 1) {
      engine.tick();
    }
    postSnapshot();
  }, 250);
}

function postSnapshot(): void {
  if (!engine) {
    return;
  }

  post({
    type: "snapshot",
    state: engine.getSnapshot(isRunning, speed),
  });
}

function post(message: SimulationWorkerResponse): void {
  self.postMessage(message);
}
