import { useState } from "react";
import type { RunPoint } from "../../experiments/labKit";
import { CorrelationHeatmap } from "./CorrelationHeatmap";
import { InsightsPanel } from "./InsightsPanel";
import { InteractionPanel } from "./InteractionPanel";
import { LabHeatmapPanel } from "./LabHeatmapPanel";
import { ParetoChart } from "./ParetoChart";
import { PhysicalHeatmapPanel } from "./PhysicalHeatmapPanel";
import { RegressionPanel } from "./RegressionPanel";
import { RobotFormulaPanel } from "./RobotFormulaPanel";
import { StatTestsPanel } from "./StatTestsPanel";

interface AdvancedPanelProps {
  points: RunPoint[];
}

interface Tool {
  id: string;
  label: string;
  hint: string;
  render: (points: RunPoint[]) => React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    id: "interactions",
    label: "Interactions",
    hint: "Deux paramètres se renforcent-ils mutuellement ?",
    render: (points) => <InteractionPanel points={points} />,
  },
  {
    id: "robustness",
    label: "Robustesse",
    hint: "Stabilité des résultats d'un essai (seed) à l'autre, par configuration.",
    render: (points) => <InsightsPanel points={points} />,
  },
  {
    id: "robot-formula",
    label: "Formule R*",
    hint: "Nombre de robots optimal selon la demande et la geometrie testee.",
    render: (points) => <RobotFormulaPanel points={points} />,
  },
  {
    id: "heatmap",
    label: "Heatmap",
    hint: "Carte 2D des resultats : deux parametres croises, une metrique moyenne.",
    render: (points) => <LabHeatmapPanel points={points} />,
  },
  {
    id: "physical-heatmap",
    label: "Plan chaud",
    hint: "Plan d'entrepot 3D : trafic ou attente moyen par cellule, comparable par strategie ou autre facteur.",
    render: (points) => <PhysicalHeatmapPanel points={points} />,
  },
  {
    id: "regression",
    label: "Régression",
    hint: "Poids chiffré de chaque paramètre dans le résultat.",
    render: (points) => <RegressionPanel points={points} />,
  },
  {
    id: "tests",
    label: "Tests stat.",
    hint: "Les écarts observés sont-ils statistiquement significatifs ?",
    render: (points) => <StatTestsPanel points={points} />,
  },
  {
    id: "correlation",
    label: "Corrélations",
    hint: "Quelles mesures évoluent ensemble.",
    render: (points) => <CorrelationHeatmap points={points} />,
  },
  {
    id: "pareto",
    label: "Compromis",
    hint: "Meilleur arbitrage entre deux objectifs opposés.",
    render: (points) => <ParetoChart points={points} />,
  },
];

export function AdvancedPanel({ points }: AdvancedPanelProps) {
  const [toolId, setToolId] = useState<string>(TOOLS[0].id);
  const tool = TOOLS.find((entry) => entry.id === toolId) ?? TOOLS[0];

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-line bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
        Lance une expérience pour débloquer les outils experts.
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="rounded-lg border border-line bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {TOOLS.map((entry) => {
            const active = entry.id === tool.id;
            return (
              <button
                aria-selected={active}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
                key={entry.id}
                onClick={() => setToolId(entry.id)}
                role="tab"
                type="button"
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-xs text-slate-500">{tool.hint}</p>
      </div>
      <div className="min-h-0 overflow-hidden rounded-lg border border-line bg-white p-3 shadow-sm">
        {tool.render(points)}
      </div>
    </div>
  );
}
