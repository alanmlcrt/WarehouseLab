import { scenarios } from "../../simulation/scenarios/presets";
import {
  useSimulationStore,
  type HeatmapMode,
  type StorageViewMode,
} from "../../store/simulationStore";
import {
  exportSimulationCsv,
  exportSimulationJson,
} from "../../utils/exportResults";

const speeds = [1, 2, 5, 10];
const heatmapModes: { value: HeatmapMode; label: string }[] = [
  { value: "off", label: "Heatmap" },
  { value: "traffic", label: "Trafic" },
  { value: "wait", label: "Attentes" },
];
const storageViewModes: { value: StorageViewMode; label: string }[] = [
  { value: "off", label: "Stock" },
  { value: "category", label: "Types" },
  { value: "demand", label: "Demande" },
];

export function TopBar() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const isRunning = useSimulationStore((state) => state.isRunning);
  const speed = useSimulationStore((state) => state.speed);
  const scenarioId = useSimulationStore((state) => state.scenarioId);
  const play = useSimulationStore((state) => state.play);
  const pause = useSimulationStore((state) => state.pause);
  const reset = useSimulationStore((state) => state.reset);
  const setSpeed = useSimulationStore((state) => state.setSpeed);
  const loadScenario = useSimulationStore((state) => state.loadScenario);
  const heatmapMode = useSimulationStore((state) => state.heatmapMode);
  const setHeatmapMode = useSimulationStore((state) => state.setHeatmapMode);
  const storageViewMode = useSimulationStore((state) => state.storageViewMode);
  const setStorageViewMode = useSimulationStore(
    (state) => state.setStorageViewMode,
  );
  const saveRun = useSimulationStore((state) => state.saveRun);
  const enterLab = useSimulationStore((state) => state.enterLab);

  return (
    <div className="flex h-full min-w-0 items-center gap-2 overflow-x-auto px-3">
      <div className="mr-1 min-w-[154px]">
        <div className="text-base font-semibold leading-tight">Warehouse Lab 3D</div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
          Simulation MVP
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={!snapshot || isRunning}
          onClick={play}
          type="button"
        >
          Lancer
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={!snapshot || !isRunning}
          onClick={pause}
          type="button"
        >
          Pause
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold"
          disabled={!snapshot}
          onClick={reset}
          type="button"
        >
          Réinit.
        </button>
      </div>

      <div className="flex shrink-0 items-center rounded-md border border-line bg-white p-1">
        {speeds.map((candidate) => (
          <button
            className={`h-8 w-10 rounded text-sm font-semibold ${
              speed === candidate ? "bg-ink text-white" : "text-slate-600"
            }`}
            key={candidate}
            onClick={() => setSpeed(candidate)}
            type="button"
          >
            x{candidate}
          </button>
        ))}
      </div>

      <select
        className="h-10 min-w-[180px] shrink-0 rounded-md border border-line bg-white px-3 text-sm"
        onChange={(event) => loadScenario(event.target.value)}
        value={scenarioId}
      >
        {scenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.name}
          </option>
        ))}
      </select>

      <div className="flex shrink-0 items-center rounded-md border border-line bg-white p-1">
        {heatmapModes.map((option) => (
          <button
            className={`h-8 px-2 rounded text-xs font-semibold ${
              heatmapMode === option.value ? "bg-ink text-white" : "text-slate-600"
            }`}
            key={option.value}
            onClick={() => setHeatmapMode(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center rounded-md border border-line bg-white p-1">
        {storageViewModes.map((option) => (
          <button
            className={`h-8 px-2 rounded text-xs font-semibold ${
              storageViewMode === option.value ? "bg-ink text-white" : "text-slate-600"
            }`}
            key={option.value}
            onClick={() => setStorageViewMode(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 text-sm text-slate-600">
        <span className="min-w-[48px] text-right">
          {snapshot ? `${Math.round(snapshot.elapsedSeconds)} s` : "0 s"}
        </span>
        <button
          className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white"
          onClick={enterLab}
          title="Revenir au laboratoire (page principale)"
          type="button"
        >
          ← Lab
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={!snapshot}
          onClick={saveRun}
          type="button"
        >
          Sauver
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={!snapshot}
          onClick={() => snapshot && exportSimulationJson(snapshot)}
          type="button"
        >
          JSON
        </button>
        <button
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={!snapshot}
          onClick={() => snapshot && exportSimulationCsv(snapshot)}
          type="button"
        >
          CSV
        </button>
      </div>
    </div>
  );
}
