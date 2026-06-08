import { useEffect, useState } from "react";
import { useSimulationStore } from "../../store/simulationStore";
import { AdvancedPanel } from "./AdvancedPanel";
import { CampaignManager } from "./CampaignManager";
import { ExplorerView } from "./ExplorerView";
import { Plan2DPage } from "./Plan2DPage";
import { PlanEditor } from "./PlanEditor";

type LabTab = "plan2d" | "config" | "explorer" | "tools" | "campaigns";

const TABS: Array<{
  id: LabTab;
  label: string;
  description: string;
  /** Requires a result dataset to be useful. */
  needsResults?: true;
}> = [
  { id: "plan2d", label: "Plan 2D", description: "Dessiner l'entrepot de base et appliquer sa configuration" },
  { id: "config", label: "Configurer", description: "Choisir ce qui est fixé et ce qu'on fait varier" },
  { id: "explorer", label: "Explorer", description: "Tracer librement un paramètre contre une métrique", needsResults: true },
  { id: "tools", label: "Outils", description: "Interactions, corrélations, régression, tests…", needsResults: true },
  { id: "campaigns", label: "Campagnes", description: "Sauvegarder et recharger une étude" },
];

export function LabPage() {
  const plan = useSimulationStore((state) => state.labPlan);
  const results = useSimulationStore((state) => state.labResults);
  const progress = useSimulationStore((state) => state.labProgress);
  const error = useSimulationStore((state) => state.labError);
  const isRunning = useSimulationStore((state) => state.isLabRunning);
  const updatePlan = useSimulationStore((state) => state.updateLabPlan);
  const runExperiment = useSimulationStore((state) => state.runLabExperiment);
  const clearResults = useSimulationStore((state) => state.clearLabResults);
  const exitLab = useSimulationStore((state) => state.exitLab);

  const [tab, setTab] = useState<LabTab>("plan2d");
  const hasResults = results.length > 0;

  // Land on the explorer the first time a dataset appears.
  useEffect(() => {
    if (hasResults && (tab === "config" || tab === "plan2d") && !isRunning) {
      setTab("explorer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResults]);

  return (
    <div className="grid h-full grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-[#eef3f8]">
      <header className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-line bg-white px-4">
        <div className="flex min-w-[150px] items-center gap-2">
          <span className="text-base font-semibold text-ink">Warehouse Lab</span>
          {hasResults ? (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent tabular-nums">
              {results.length.toLocaleString("fr-FR")} pts
            </span>
          ) : null}
        </div>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto py-2">
          {TABS.map((entry) => {
            const locked = entry.needsResults && !hasResults;
            const active = tab === entry.id;
            return (
              <button
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : locked
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-600 hover:bg-slate-100"
                }`}
                disabled={locked}
                key={entry.id}
                onClick={() => setTab(entry.id)}
                title={locked ? "Lance une expérience d'abord" : entry.description}
                type="button"
              >
                {entry.label}
              </button>
            );
          })}
        </nav>
        <button
          className="shrink-0 rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          onClick={exitLab}
          type="button"
        >
          Quitter
        </button>
      </header>
      <main className="min-h-0 p-3">
        {tab === "plan2d" ? (
          <Plan2DPage plan={plan} onPlanChange={updatePlan} />
        ) : null}
        {tab === "config" ? (
          <PlanEditor
            error={error}
            isRunning={isRunning}
            onChange={updatePlan}
            onClear={clearResults}
            onRun={runExperiment}
            plan={plan}
            progress={progress}
            resultsCount={results.length}
          />
        ) : null}
        {tab === "explorer" ? <ExplorerView points={results} /> : null}
        {tab === "tools" ? <AdvancedPanel points={results} /> : null}
        {tab === "campaigns" ? <CampaignManager /> : null}
      </main>
    </div>
  );
}
