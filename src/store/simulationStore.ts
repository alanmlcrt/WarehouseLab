import { create } from "zustand";
import {
  buildDefaultLabPlan,
  MIN_SEEDS,
  MAX_SEEDS,
  runLab,
  type LabPlan,
  type LabProgress,
  type RunPoint,
} from "../experiments/labKit";
import {
  buildCampaign,
  parseCampaignJson,
  type LabCampaign,
} from "../experiments/labExport";
import { cloneConfig, scenarios } from "../simulation/scenarios/presets";
import type {
  ExperimentResult,
  SimulationConfig,
  SimulationState,
} from "../simulation/models/types";
import type {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from "../simulation/worker/messages";
import type { SceneSelection } from "../types/selection";
import { buildExperimentResult } from "../utils/exportResults";

export type HeatmapMode = "off" | "traffic" | "wait";
export type StorageViewMode = "off" | "category" | "demand";

interface SimulationStore {
  snapshot: SimulationState | null;
  scenarioId: string;
  isRunning: boolean;
  speed: number;
  selected: SceneSelection | null;
  workerError: string | null;
  heatmapMode: HeatmapMode;
  storageViewMode: StorageViewMode;
  runHistory: ExperimentResult[];
  labMode: boolean;
  labPlan: LabPlan;
  labResults: RunPoint[];
  labProgress: LabProgress | null;
  labError: string | null;
  isLabRunning: boolean;
  labCampaigns: LabCampaign[];
  initialize: () => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  loadScenario: (scenarioId: string) => void;
  updateConfig: (config: SimulationConfig) => void;
  select: (selection: SceneSelection | null) => void;
  setHeatmapMode: (mode: HeatmapMode) => void;
  setStorageViewMode: (mode: StorageViewMode) => void;
  saveRun: () => void;
  removeRun: (id: string) => void;
  clearRuns: () => void;
  enterLab: () => void;
  exitLab: () => void;
  /** Replay a lab run in the 3D view: loads the run's exact config (seeds
   *  included) into the worker and starts playback from tick 0. */
  replayLabRun: (point: RunPoint) => void;
  updateLabPlan: (plan: LabPlan) => void;
  runLabExperiment: () => Promise<void>;
  clearLabResults: () => void;
  saveLabCampaign: (name: string) => void;
  loadLabCampaign: (id: string) => void;
  deleteLabCampaign: (id: string) => void;
  importLabCampaign: (text: string) => void;
}

let worker: Worker | undefined;
const labResultsStorageKey = "warehouse-lab-results-v1";
const labPlanStorageKey = "warehouse-lab-plan-v1";
const labCampaignsStorageKey = "warehouse-lab-campaigns-v1";

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  snapshot: null,
  scenarioId: scenarios[0].id,
  isRunning: false,
  speed: 1,
  selected: null,
  workerError: null,
  heatmapMode: "off",
  storageViewMode: "off",
  runHistory: [],
  // Lab is the landing page. The 3D simulation view is a sub-view reached from
  // the lab (replay a run, or "Voir en 3D" from the Plan tab) and exited via
  // the TopBar's "← Lab" button.
  labMode: true,
  labPlan: loadStoredLabPlan(),
  labResults: loadStoredLabResults(),
  labProgress: null,
  labError: null,
  isLabRunning: false,
  labCampaigns: loadStoredCampaigns(),
  initialize: () => {
    if (!worker) {
      worker = new Worker(
        new URL("../simulation/worker/simulationWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
        if (event.data.type === "error") {
          set({ workerError: event.data.message });
          return;
        }

        set({
          snapshot: event.data.state,
          isRunning: event.data.state.isRunning,
          speed: event.data.state.speed,
          scenarioId: event.data.state.config.scenarioId,
          workerError: null,
        });
      };
    }

    post({
      type: "init",
      config: cloneConfig(scenarios[0].config),
    });
  },
  play: () => {
    post({ type: "play" });
    set({ isRunning: true });
  },
  pause: () => {
    post({ type: "pause" });
    set({ isRunning: false });
  },
  reset: () => {
    post({ type: "reset" });
    set({ isRunning: false, selected: null });
  },
  setSpeed: (speed) => {
    post({ type: "setSpeed", speed });
    set({ speed });
  },
  loadScenario: (scenarioId) => {
    const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
    if (!scenario) {
      return;
    }

    post({
      type: "loadScenario",
      config: cloneConfig(scenario.config),
    });
    set({ scenarioId, isRunning: false, selected: null });
  },
  updateConfig: (config) => {
    post({ type: "updateConfig", config: cloneConfig(config) });
    set({ isRunning: false, selected: null });
  },
  select: (selection) => set({ selected: selection }),
  setHeatmapMode: (heatmapMode) => set({ heatmapMode }),
  setStorageViewMode: (storageViewMode) => set({ storageViewMode }),
  saveRun: () => {
    const snapshot = get().snapshot;
    if (!snapshot) {
      return;
    }
    const result = buildExperimentResult(snapshot);
    set({ runHistory: [result, ...get().runHistory].slice(0, 12) });
  },
  removeRun: (id) =>
    set({ runHistory: get().runHistory.filter((run) => run.id !== id) }),
  clearRuns: () => set({ runHistory: [] }),
  enterLab: () => set({ labMode: true }),
  exitLab: () => set({ labMode: false }),
  replayLabRun: (point) => {
    if (!point.config) {
      set({
        labError:
          "Ce run ne porte pas sa configuration (résultat antérieur) — relance l'expérience pour pouvoir le rejouer.",
      });
      return;
    }
    // "replay" (not updateConfig): the worker must keep the run's seeds
    // verbatim, normalizeConfig would rebuild them from the master seed.
    post({ type: "replay", config: point.config });
    post({ type: "play" });
    set({
      labMode: false,
      isRunning: true,
      selected: null,
      scenarioId: point.config.scenarioId,
      labError: null,
    });
  },
  updateLabPlan: (labPlan) => {
    storeLabPlan(labPlan);
    set({ labPlan });
  },
  runLabExperiment: async () => {
    if (get().isLabRunning) {
      return;
    }
    const snapshot = get().snapshot;
    const baseConfig = snapshot ? snapshot.config : scenarios[0].config;

    set({
      isLabRunning: true,
      labError: null,
      labProgress: {
        completedRuns: 0,
        totalRuns: 0,
        currentLabel: "Preparation",
      },
    });

    try {
      const results = await runLab({
        baseConfig: cloneConfig(baseConfig),
        plan: get().labPlan,
        onProgress: (progress) => set({ labProgress: progress }),
      });
      storeLabResults(results);
      set({
        labResults: results,
        labProgress: null,
        isLabRunning: false,
      });
    } catch (error) {
      set({
        labError:
          error instanceof Error ? error.message : "Lab experiment failed",
        labProgress: null,
        isLabRunning: false,
      });
    }
  },
  clearLabResults: () => {
    storeLabResults([]);
    set({ labResults: [], labProgress: null, labError: null });
  },
  saveLabCampaign: (name) => {
    const { labPlan, labResults, labCampaigns } = get();
    if (labResults.length === 0) {
      set({ labError: "Aucun résultat à sauvegarder." });
      return;
    }
    const campaign = buildCampaign(name, labPlan, labResults);
    const next = [campaign, ...labCampaigns].slice(0, 30);
    storeCampaigns(next);
    set({ labCampaigns: next, labError: null });
  },
  loadLabCampaign: (id) => {
    const campaign = get().labCampaigns.find((entry) => entry.id === id);
    if (!campaign) {
      return;
    }
    storeLabPlan(campaign.plan);
    storeLabResults(campaign.results);
    set({
      labPlan: campaign.plan,
      labResults: campaign.results,
      labError: null,
    });
  },
  deleteLabCampaign: (id) => {
    const next = get().labCampaigns.filter((entry) => entry.id !== id);
    storeCampaigns(next);
    set({ labCampaigns: next });
  },
  importLabCampaign: (text) => {
    try {
      const campaign = parseCampaignJson(text);
      const next = [campaign, ...get().labCampaigns].slice(0, 30);
      storeCampaigns(next);
      storeLabPlan(campaign.plan);
      storeLabResults(campaign.results);
      set({
        labCampaigns: next,
        labPlan: campaign.plan,
        labResults: campaign.results,
        labError: null,
      });
    } catch (error) {
      set({
        labError:
          error instanceof Error
            ? `Import impossible : ${error.message}`
            : "Import impossible.",
      });
    }
  },
}));

function post(message: SimulationWorkerRequest): void {
  worker?.postMessage(message);
}

export function getCurrentConfig(): SimulationConfig {
  const snapshot = useSimulationStore.getState().snapshot;
  return cloneConfig(snapshot?.config ?? scenarios[0].config);
}

function loadStoredLabPlan(): LabPlan {
  if (typeof window === "undefined") {
    return buildDefaultLabPlan();
  }
  try {
    const raw = window.localStorage.getItem(labPlanStorageKey);
    if (!raw) {
      return buildDefaultLabPlan();
    }
    const parsed = JSON.parse(raw) as Partial<LabPlan>;
    if (!parsed || !Array.isArray(parsed.bindings)) {
      return buildDefaultLabPlan();
    }
    const defaults = buildDefaultLabPlan();
    return {
      seedCount:
        typeof parsed.seedCount === "number"
          ? Math.max(MIN_SEEDS, Math.min(MAX_SEEDS, parsed.seedCount))
          : defaults.seedCount,
      simulatedMinutes:
        typeof parsed.simulatedMinutes === "number"
          ? parsed.simulatedMinutes
          : defaults.simulatedMinutes,
      warmupMinutes:
        typeof parsed.warmupMinutes === "number"
          ? parsed.warmupMinutes
          : defaults.warmupMinutes,
      factorRoles: {
        ...defaults.factorRoles,
        ...(parsed.factorRoles ?? {}),
      },
      bindings: defaults.bindings.map((binding) => {
        const stored = parsed.bindings?.find(
          (candidate) => candidate.factorId === binding.factorId,
        );
        return stored ? { ...binding, values: stored.values } : binding;
      }),
    };
  } catch {
    return buildDefaultLabPlan();
  }
}

function storeLabPlan(plan: LabPlan): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(labPlanStorageKey, JSON.stringify(plan));
  } catch {
    window.localStorage.removeItem(labPlanStorageKey);
  }
}

function loadStoredLabResults(): RunPoint[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(labResultsStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunPoint[]) : [];
  } catch {
    return [];
  }
}

function storeLabResults(results: RunPoint[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      labResultsStorageKey,
      JSON.stringify(results.slice(0, 2000)),
    );
  } catch {
    window.localStorage.removeItem(labResultsStorageKey);
  }
}

function loadStoredCampaigns(): LabCampaign[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(labCampaignsStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LabCampaign[]) : [];
  } catch {
    return [];
  }
}

function storeCampaigns(campaigns: LabCampaign[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      labCampaignsStorageKey,
      JSON.stringify(campaigns.slice(0, 30)),
    );
  } catch {
    window.localStorage.removeItem(labCampaignsStorageKey);
  }
}
