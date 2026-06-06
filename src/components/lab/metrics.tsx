import { useState } from "react";
import { HelpModal } from "./HelpModal";

export interface MetricOption {
  id: string;
  label: string;
  unit?: string;
}

/** One-line, plain-language definition for each metric the Lab surfaces. */
export const METRIC_HELP: Record<string, string> = {
  steadyThroughputPerMinute:
    "Débit en régime stable : nombre de caisses livrées par minute une fois la période de chauffe écartée. Plus c'est haut, mieux c'est.",
  throughputPerMinute:
    "Débit instantané mesuré sur la dernière minute simulée. Plus bruité que le débit steady-state.",
  steadyBacklog:
    "Nombre moyen de commandes en attente une fois le régime stable atteint. Plus c'est bas, mieux c'est.",
  serviceLevel:
    "Taux de service : part des commandes créées qui ont effectivement été livrées avant la fin du run.",
  throughputPerRobot:
    "Productivité d'un robot : débit total divisé par le nombre de robots.",
  costProxy:
    "Coût indicatif du parc (robots + chargeurs) en unités relatives. Sert aux compromis coût / performance.",
  averageRobotUtilization:
    "Occupation des robots : part du temps où ils travaillent réellement (0 à 1).",
  averageProcessingTime:
    "Temps moyen entre la création d'une commande et sa livraison.",
  averageDistancePerOrder:
    "Distance moyenne parcourue par commande livrée. Plus c'est bas, plus le placement est efficace.",
  congestionEvents:
    "Nombre de fois où un robot a dû attendre (cellule occupée ou chemin bloqué). Indicateur d'embouteillage.",
  energyPerOrder: "Énergie consommée par commande livrée.",
  energyConsumed: "Énergie totale consommée par la flotte sur tout le run.",
  slottingEfficiency:
    "Qualité du placement des articles (0 à 1) : 1 = les articles les plus demandés sont au plus près des stations.",
  demandPerMinute: "Demande entrante : nombre de caisses à livrer par minute.",
  feasibilityMargin:
    "Marge entre le débit atteignable et la demande. Négatif = système sous-dimensionné.",
  totalDistance: "Distance totale parcourue par tous les robots (en cellules).",
  pendingOrders: "Commandes encore en attente à la fin du run.",
  completedOrders: "Nombre total de caisses livrées sur le run.",
  averageBatteryLevel: "Niveau de batterie moyen de la flotte.",
  minimumBatteryLevel: "Niveau de batterie le plus bas observé sur la flotte.",
  chargingShare: "Part du temps passée en recharge par la flotte.",
  verticalPressure:
    "Pression sur les lignes verticales : élevée = les ascenseurs limitent le débit avant les robots.",
  elevatorTrips: "Nombre de trajets verticaux effectués.",
};

export function metricDefinition(id: string, label: string): string {
  return METRIC_HELP[id] ?? `Métrique « ${label} ».`;
}

/**
 * Constrained metric dropdown + a "?" that explains the selected metric.
 * Use everywhere a metric is picked so the user never faces an unexplained name.
 */
export function MetricSelect({
  label = "Métrique",
  metrics,
  value,
  onChange,
}: {
  label?: string;
  metrics: MetricOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const current = metrics.find((metric) => metric.id === value);
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {label ? <span className="text-slate-500">{label}</span> : null}
      <select
        className="h-9 rounded border border-line bg-white px-2 text-sm font-medium"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {metrics.map((metric) => (
          <option key={metric.id} value={metric.id}>
            {metric.label}
            {metric.unit ? ` (${metric.unit})` : ""}
          </option>
        ))}
      </select>
      <button
        aria-label={`Définition : ${current?.label ?? "métrique"}`}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 text-xs font-bold text-accent hover:bg-accent hover:text-white"
        onClick={() => setHelpOpen(true)}
        title="Que signifie cette métrique ?"
        type="button"
      >
        ?
      </button>
      <HelpModal
        onClose={() => setHelpOpen(false)}
        open={helpOpen}
        title={current?.label ?? "Métrique"}
      >
        <p className="text-sm leading-relaxed text-slate-700">
          {metricDefinition(value, current?.label ?? value)}
        </p>
      </HelpModal>
    </div>
  );
}
