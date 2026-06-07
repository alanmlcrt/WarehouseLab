import { useState } from "react";
import { HelpModal } from "./HelpModal";

export interface MetricOption {
  id: string;
  label: string;
  unit?: string;
  group?: string;
}

/** Stable display order for the metric theme groups in dropdowns. */
const METRIC_GROUP_ORDER = [
  "Performance",
  "Efficacité",
  "Coût",
  "Stockage",
  "Batterie",
] as const;

/** Group metrics by theme, preserving the canonical group order, so dropdowns
 *  read as short labelled sections instead of one long flat list. */
export function groupMetrics(metrics: MetricOption[]): Array<{
  group: string;
  items: MetricOption[];
}> {
  const byGroup = new Map<string, MetricOption[]>();
  for (const metric of metrics) {
    const key = metric.group ?? "Autres";
    const arr = byGroup.get(key);
    if (arr) arr.push(metric);
    else byGroup.set(key, [metric]);
  }
  const known = METRIC_GROUP_ORDER.filter((g) => byGroup.has(g));
  const rest = [...byGroup.keys()].filter(
    (g) => !METRIC_GROUP_ORDER.includes(g as (typeof METRIC_GROUP_ORDER)[number]),
  );
  return [...known, ...rest].map((group) => ({
    group,
    items: byGroup.get(group) ?? [],
  }));
}

/** One-line, plain-language definition for each metric the Lab surfaces. */
export const METRIC_HELP: Record<string, string> = {
  steadyThroughputPerMinute:
    "Débit : nombre de caisses livrées par minute, mesuré une fois le système stabilisé (la période de chauffe est écartée). C'est la mesure de performance principale — plus c'est haut, mieux c'est.",
  throughputPerMinute:
    "Débit instantané mesuré sur la dernière minute simulée. Plus bruité que le débit principal ; utile surtout pour voir les à-coups.",
  steadyBacklog:
    "Nombre moyen de commandes en attente une fois le régime stable atteint. Plus c'est bas, mieux c'est.",
  serviceLevel:
    "Taux de service : part des commandes créées qui ont effectivement été livrées avant la fin du run.",
  throughputPerRobot:
    "Productivité d'un robot : débit total divisé par le nombre de robots.",
  costProxy:
    "Coût indicatif du parc (robots + chargeurs) en unités relatives. Sert à arbitrer entre coût et performance.",
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
    "Marge de capacité : écart relatif entre le débit que le système peut atteindre et la demande. Positif = l'entrepôt tient la charge avec de la marge ; proche de 0 = à la limite ; négatif = sous-dimensionné (la demande dépasse ce qui est livrable).",
  totalDistance: "Distance totale parcourue par tous les robots (en cellules).",
  pendingOrders: "Commandes encore en attente à la fin du run.",
  completedOrders: "Nombre total de caisses livrées sur le run.",
  averageBatteryLevel: "Niveau de batterie moyen de la flotte.",
  minimumBatteryLevel: "Niveau de batterie le plus bas observé sur la flotte.",
  chargingShare: "Part du temps passée en recharge par la flotte.",
  depletionEvents:
    "Nombre de fois où un robot est tombé en panne sèche (batterie à 0) en pleine tâche sur le run. Sa commande repart en file et le robot est immobilisé le temps d'un secours/recharge. Un chiffre élevé signale une autonomie ou un seuil de recharge mal dimensionnés.",
  verticalPressure:
    "Pression sur les lignes verticales : élevée = les ascenseurs limitent le débit avant les robots.",
  elevatorTrips: "Nombre de trajets verticaux effectués.",
  effectiveRackCount:
    "Nombre d'emplacements de stockage réellement construits dans la grille. Quand on ajoute des passages transverses ou des ascenseurs, des cellules de racks sont sacrifiées au profit de la circulation — cette métrique chiffre la capacité perdue.",
  rackDensityPct:
    "Part de l'entrepôt occupée par des racks (0 à 100 %). Complément de la circulation : 60 % de racks = 40 % de couloirs / passages / ascenseurs. Donne le compromis stockage vs circulation d'un seul coup d'œil.",
  warehouseWidth: "Largeur réelle de la grille construite (en cellules).",
  warehouseHeight: "Profondeur réelle de la grille construite (en cellules).",
  effectiveRobotCount: "Nombre de robots effectivement déployés sur le run.",
  derivedMaxBattery:
    "Capacité batterie effective (dérivée du poids du robot et de sa charge utile).",
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
        {groupMetrics(metrics).map((section) => (
          <optgroup key={section.group} label={section.group}>
            {section.items.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.label}
                {metric.unit ? ` (${metric.unit})` : ""}
              </option>
            ))}
          </optgroup>
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
