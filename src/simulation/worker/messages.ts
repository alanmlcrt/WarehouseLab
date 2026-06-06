import type { SimulationConfig, SimulationState } from "../models/types";

export type SimulationWorkerRequest =
  | {
      type: "init";
      config: SimulationConfig;
    }
  | {
      type: "play";
    }
  | {
      type: "pause";
    }
  | {
      type: "reset";
    }
  | {
      type: "setSpeed";
      speed: number;
    }
  | {
      type: "loadScenario";
      config: SimulationConfig;
    }
  | {
      type: "updateConfig";
      config: SimulationConfig;
    };

export type SimulationWorkerResponse =
  | {
      type: "snapshot";
      state: SimulationState;
    }
  | {
      type: "error";
      message: string;
    };
