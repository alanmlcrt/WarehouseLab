import {
  getActiveFactorBindings,
  getFactorById,
  type LabPlan,
  type RunPoint,
} from "./labKit";
import {
  buildRobotOptimizationModel,
  formatRobotFormula,
  predictRobotsFromFormula,
} from "./fleetOptimizer";
import { interpretEpsilonSquared, kruskalWallis } from "./labStats";

/** A reproducible research campaign: the DOE plan, its result cloud, and
 *  enough metadata to interpret it later or share it. */
export interface LabCampaign {
  id: string;
  name: string;
  createdAt: string;
  plan: LabPlan;
  results: RunPoint[];
  meta: {
    totalPoints: number;
    seedCount: number;
    simulatedMinutes: number;
    warmupMinutes: number;
    appVersion: string;
  };
}

const APP_VERSION = "0.3";
const REPORT_KPI = "steadyThroughputPerMinute";

export function buildCampaign(
  name: string,
  plan: LabPlan,
  results: RunPoint[],
): LabCampaign {
  return {
    id: `CAMP_${Date.now()}`,
    name: name.trim() || `Campagne ${new Date().toLocaleString()}`,
    createdAt: new Date().toISOString(),
    plan,
    results,
    meta: {
      totalPoints: results.length,
      seedCount: plan.seedCount,
      simulatedMinutes: plan.simulatedMinutes,
      warmupMinutes: plan.warmupMinutes,
      appVersion: APP_VERSION,
    },
  };
}

export function toCampaignJson(campaign: LabCampaign): string {
  return JSON.stringify(campaign, null, 2);
}

/** Parse + minimally validate an imported campaign JSON. Throws on malformed
 *  input so the caller can surface an error. */
export function parseCampaignJson(text: string): LabCampaign {
  const parsed = JSON.parse(text) as Partial<LabCampaign>;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.plan ||
    !Array.isArray(parsed.results) ||
    !Array.isArray((parsed.plan as LabPlan).bindings)
  ) {
    throw new Error("Fichier de campagne invalide (plan/résultats manquants).");
  }
  const plan = parsed.plan as LabPlan;
  const results = parsed.results as RunPoint[];
  return {
    id: parsed.id ?? `CAMP_${Date.now()}`,
    name: parsed.name ?? "Campagne importée",
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    plan,
    results,
    meta: parsed.meta ?? {
      totalPoints: results.length,
      seedCount: plan.seedCount,
      simulatedMinutes: plan.simulatedMinutes,
      warmupMinutes: plan.warmupMinutes,
      appVersion: APP_VERSION,
    },
  };
}

/** Flatten the result cloud to CSV: one row per run, columns = union of factor
 *  ids + metric ids actually present. Suitable for import into R/Python. */
export function toPointCloudCsv(results: RunPoint[]): string {
  const factorIds = new Set<string>();
  const metricIds = new Set<string>();
  for (const point of results) {
    Object.keys(point.factors).forEach((id) => factorIds.add(id));
    Object.keys(point.metrics).forEach((id) => metricIds.add(id));
  }
  const factorCols = [...factorIds].sort();
  const metricCols = [...metricIds].sort();
  const header = ["id", "seedIndex", "feasible", ...factorCols, ...metricCols];

  const rows = results.map((point) => {
    const cells = [
      point.id,
      String(point.seedIndex),
      String(point.feasible),
      ...factorCols.map((id) => formatCsv(point.factors[id])),
      ...metricCols.map((id) => formatCsv(point.metrics[id])),
    ];
    return cells.join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

/** Markdown research report: experimental design, factors ranked by their
 *  Kruskal-Wallis effect on the steady-state throughput, and the recommended
 *  configuration (best feasible steady throughput). */
export function toMarkdownReport(campaign: LabCampaign): string {
  const { plan, results } = campaign;
  const lines: string[] = [];

  lines.push(`# Rapport de campagne — ${campaign.name}`);
  lines.push("");
  lines.push(`- Date : ${new Date(campaign.createdAt).toLocaleString()}`);
  lines.push(`- Points : ${results.length}`);
  lines.push(
    `- Réplications : ${plan.seedCount} seed(s) · ${plan.simulatedMinutes} min simulées · warm-up ${plan.warmupMinutes} min`,
  );
  lines.push("");

  lines.push("## Plan d'expérience");
  lines.push("");
  const active = getActiveFactorBindings(plan);
  if (active.length === 0) {
    lines.push("_Aucun facteur actif (run de référence)._");
  } else {
    lines.push("| Facteur | Niveaux |");
    lines.push("| --- | --- |");
    for (const binding of active) {
      const label = getFactorById(binding.factorId)?.label ?? binding.factorId;
      lines.push(`| ${label} | ${binding.values.join(", ")} |`);
    }
  }
  lines.push("");

  lines.push("## Facteurs significatifs (Kruskal-Wallis sur le débit steady-state)");
  lines.push("");
  const ranked = rankFactorsByEffect(results);
  if (ranked.length === 0) {
    lines.push("_Pas assez de variation pour tester un facteur._");
  } else {
    lines.push("| Facteur | H | p | ε² | Effet |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of ranked) {
      lines.push(
        `| ${row.label} | ${row.h.toFixed(2)} | ${
          row.p < 0.0001 ? "< 0.0001" : row.p.toFixed(4)
        } | ${row.epsilonSquared.toFixed(3)} | ${row.magnitude} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Configuration recommandée");
  lines.push("");
  const best = recommendBest(results);
  if (!best) {
    lines.push("_Aucun point exploitable._");
  } else {
    lines.push(
      `Meilleur débit steady-state faisable : **${(best.metrics[REPORT_KPI] ?? 0).toFixed(2)} caisses/min** (run \`${best.id}\`).`,
    );
    lines.push("");
    lines.push("| Facteur | Valeur |");
    lines.push("| --- | --- |");
    for (const [key, value] of Object.entries(best.factors)) {
      const label = getFactorById(key)?.label ?? key;
      lines.push(`| ${label} | ${value} |`);
    }
  }
  lines.push("");

  lines.push("## Formule robots R*");
  lines.push("");
  const robotModel = buildRobotOptimizationModel(results);
  if (robotModel.contexts.length === 0) {
    lines.push(
      "_Le nombre de robots n'a pas ete varie dans cette campagne : aucune courbe R* exploitable._",
    );
  } else {
    if (robotModel.formula) {
      lines.push(`Formule empirique : \`${formatRobotFormula(robotModel.formula)}\`.`);
      lines.push(
        `Qualite d'ajustement : R2=${robotModel.formula.rSquared.toFixed(3)}, erreur moyenne ${robotModel.formula.rmseRobots.toFixed(1)} robot(s).`,
      );
      lines.push("");
    } else {
      lines.push(
        "_Plusieurs niveaux de robots ont ete testes, mais pas assez de dispositions distinctes pour ajuster une formule globale._",
      );
      lines.push("");
    }
    lines.push("| Disposition | R* observe | Debit max | Perte apres seuil | R* formule |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const context of robotModel.contexts) {
      const predicted = robotModel.formula
        ? predictRobotsFromFormula(robotModel.formula, context.featureValues)
        : null;
      lines.push(
        `| ${context.label} | ${context.recommended.robotCount} | ${context.bestObserved.throughput.toFixed(2)} | ${context.saturationLossPct.toFixed(0)}% | ${predicted ? predicted.toFixed(1) : "-"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Limites");
  lines.push("");
  lines.push(
    "- Collisions par occupation de cellule ; réservation temporelle simplifiée (sans A\\* espace-temps complet).",
  );
  lines.push(
    "- Puissance des tests approchée ; effets jugés sur le régime stationnaire (warm-up exclu).",
  );

  return lines.join("\n");
}

interface FactorEffectRow {
  factorId: string;
  label: string;
  h: number;
  p: number;
  epsilonSquared: number;
  magnitude: string;
}

function rankFactorsByEffect(results: RunPoint[]): FactorEffectRow[] {
  const factorIds = new Set<string>();
  results.forEach((point) =>
    Object.keys(point.factors).forEach((id) => factorIds.add(id)),
  );

  const rows: FactorEffectRow[] = [];
  for (const factorId of factorIds) {
    const byLevel = new Map<string, number[]>();
    for (const point of results) {
      const level = point.factors[factorId];
      if (level === undefined) {
        continue;
      }
      const value = point.metrics[REPORT_KPI];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }
      const key = String(level);
      const bucket = byLevel.get(key) ?? [];
      bucket.push(value);
      byLevel.set(key, bucket);
    }
    if (byLevel.size < 2) {
      continue;
    }
    const test = kruskalWallis([...byLevel.values()]);
    if (!test) {
      continue;
    }
    rows.push({
      factorId,
      label: getFactorById(factorId)?.label ?? factorId,
      h: test.h,
      p: test.pValue,
      epsilonSquared: test.epsilonSquared,
      magnitude: interpretEpsilonSquared(test.epsilonSquared),
    });
  }
  return rows.sort((a, b) => a.p - b.p);
}

function recommendBest(results: RunPoint[]): RunPoint | undefined {
  const feasible = results.filter((point) => point.feasible);
  const pool = feasible.length > 0 ? feasible : results;
  return pool.reduce<RunPoint | undefined>((best, point) => {
    const value = point.metrics[REPORT_KPI] ?? -Infinity;
    const bestValue = best?.metrics[REPORT_KPI] ?? -Infinity;
    return value > bestValue ? point : best;
  }, undefined);
}

function formatCsv(value: number | string | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadText(
  filename: string,
  mime: string,
  content: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
