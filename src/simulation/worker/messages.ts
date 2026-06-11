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
    }
  | {
      /** Load a config verbatim, WITHOUT normalizeConfig. Used to replay a lab
       *  run: the per-seed offsets baked into `config.seeds` must survive,
       *  whereas updateConfig rebuilds all seeds from the layout master seed. */
      type: "replay";
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
