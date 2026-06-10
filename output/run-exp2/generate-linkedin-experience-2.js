import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDefaultLabPlan, runLab, } from "../src/experiments/labKit";
import { cloneConfig, scenarios } from "../src/simulation/scenarios/presets";
const ROBOT_LEVELS = [10, 15, 20];
const PASSAGE_LEVELS = [0, 1, 2, 4];
function withBinding(plan, factorId, values, role) {
    return {
        ...plan,
        factorRoles: {
            ...plan.factorRoles,
            [factorId]: role,
        },
        bindings: plan.bindings.map((binding) => binding.factorId === factorId ? { ...binding, values } : binding),
    };
}
function buildExperiencePlan() {
    let plan = buildDefaultLabPlan();
    plan = {
        ...plan,
        seedCount: 50,
        simulatedMinutes: 3,
        warmupMinutes: 1,
        factorRoles: Object.fromEntries(Object.keys(plan.factorRoles).map((factorId) => [factorId, "context"])),
    };
    plan = withBinding(plan, "warehouseSize", ["l"], "context");
    plan = withBinding(plan, "levelCount", [1], "context");
    plan = withBinding(plan, "pickingStationCount", [2], "context");
    plan = withBinding(plan, "chargingStationCount", [4], "context");
    plan = withBinding(plan, "ordersPerMinute", [18], "context");
    plan = withBinding(plan, "demandPattern", ["abc"], "context");
    plan = withBinding(plan, "peakProfile", ["none"], "context");
    plan = withBinding(plan, "storageStrategy", ["abcStorage"], "context");
    plan = withBinding(plan, "pathfindingStrategy", ["reservation"], "context");
    plan = withBinding(plan, "reroutingPolicy", ["reactive"], "context");
    plan = withBinding(plan, "robotCount", ROBOT_LEVELS, "variable");
    plan = withBinding(plan, "crossAisleSpacing", PASSAGE_LEVELS, "variable");
    return plan;
}
function mean(values) {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
function format(value, decimals = 1) {
    return value.toLocaleString("fr-FR", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
}
function cellMean(points, robotCount, passages, metricId) {
    return mean(points
        .filter((point) => Number(point.factors.robotCount) === robotCount &&
        Number(point.factors.crossAisleSpacing) === passages)
        .map((point) => point.metrics[metricId])
        .filter((value) => Number.isFinite(value)));
}
function color(value, min, max) {
    const t = max > min ? (value - min) / (max - min) : 0.5;
    const r = Math.round(248 + (15 - 248) * t);
    const g = Math.round(250 + (118 - 250) * t);
    const b = Math.round(252 + (110 - 252) * t);
    return `rgb(${r}, ${g}, ${b})`;
}
function html(points) {
    const throughput = PASSAGE_LEVELS.flatMap((passages) => ROBOT_LEVELS.map((robots) => cellMean(points, robots, passages, "steadyThroughputPerMinute")));
    const backlog = PASSAGE_LEVELS.flatMap((passages) => ROBOT_LEVELS.map((robots) => cellMean(points, robots, passages, "steadyBacklog")));
    const waits = PASSAGE_LEVELS.flatMap((passages) => ROBOT_LEVELS.map((robots) => cellMean(points, robots, passages, "connectorWait")));
    const minThroughput = Math.min(...throughput);
    const maxThroughput = Math.max(...throughput);
    const rows = PASSAGE_LEVELS.map((passages) => {
        const cells = ROBOT_LEVELS.map((robots) => {
            const value = cellMean(points, robots, passages, "steadyThroughputPerMinute");
            const bg = color(value, minThroughput, maxThroughput);
            const text = value > (minThroughput + maxThroughput) / 2 ? "white" : "#0f172a";
            return `<td><div class="heat-cell" style="background:${bg};color:${text}"><strong>${format(value)}</strong><span>caisses/min</span></div></td>`;
        }).join("");
        return `<tr><th>${passages}</th>${cells}</tr>`;
    }).join("");
    const best = PASSAGE_LEVELS.flatMap((passages) => ROBOT_LEVELS.map((robots) => ({
        robots,
        passages,
        throughput: cellMean(points, robots, passages, "steadyThroughputPerMinute"),
        backlog: cellMean(points, robots, passages, "steadyBacklog"),
        wait: cellMean(points, robots, passages, "connectorWait"),
        racks: cellMean(points, robots, passages, "effectiveRackCount"),
    }))).sort((a, b) => b.throughput - a.throughput);
    const comparison = best
        .map((entry) => `<tr><td>${entry.passages}</td><td>${entry.robots}</td><td>${format(entry.throughput)}</td><td>${format(entry.backlog)}</td><td>${format(entry.wait, 0)}</td><td>${format(entry.racks, 0)}</td></tr>`)
        .join("");
    const betterLayout = best.find((entry) => entry.robots < 20 && entry.passages > 0);
    const moreRobotsNoPassage = best.find((entry) => entry.robots === 20 && entry.passages === 0);
    const verdict = betterLayout && moreRobotsNoPassage && betterLayout.throughput > moreRobotsNoPassage.throughput
        ? `${betterLayout.passages} passage(s) avec ${betterLayout.robots} robots bat 20 robots sans passage.`
        : "Les passages réduisent surtout le backlog et l'attente dans cette campagne.";
    return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Warehouse Lab - Experience 2</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #eef3f8; color: #0f172a; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0; font-size: 30px; }
    .subtitle { margin: 8px 0 22px; color: #475569; }
    .banner { border: 1px solid #99d8ca; background: #ecfdf5; border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
    section { background: white; border: 1px solid #d8e1ea; border-radius: 8px; padding: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: center; }
    th { color: #475569; background: #f8fafc; }
    .heat-cell { min-height: 70px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 4px; }
    .heat-cell strong { font-size: 20px; }
    .heat-cell span { font-size: 11px; opacity: 0.85; }
    .stats { display: grid; gap: 10px; }
    .stat { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #f8fafc; }
    .stat div { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: .05em; }
    .stat strong { display: block; margin-top: 4px; font-size: 18px; }
    .small { color: #64748b; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Experience 2 - Un passage transverse peut valoir plus que plusieurs robots</h1>
    <p class="subtitle">Plan DOE: robots ${ROBOT_LEVELS.join(", ")} x passages ${PASSAGE_LEVELS.join(", ")} · ${points.length.toLocaleString("fr-FR")} runs · 50 seeds par configuration · entrepot L 32x24, 1 niveau, 2 stations.</p>
    <div class="banner">${verdict}</div>
    <div class="grid">
      <section>
        <h2>Heatmap - Debit moyen steady-state</h2>
        <table>
          <thead>
            <tr><th>Passages \\ Robots</th>${ROBOT_LEVELS.map((robots) => `<th>${robots}</th>`).join("")}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <section class="stats">
        <div class="stat"><div>Debit min</div><strong>${format(minThroughput)} caisses/min</strong></div>
        <div class="stat"><div>Debit max</div><strong>${format(maxThroughput)} caisses/min</strong></div>
        <div class="stat"><div>Backlog moyen</div><strong>${format(mean(backlog))} commandes</strong></div>
        <div class="stat"><div>Attente connecteur moyenne</div><strong>${format(mean(waits), 0)} ticks</strong></div>
        <p class="small">Lecture: plus la cellule est foncee, plus le debit moyen est eleve. Le tableau ci-dessous ajoute backlog, attente et capacite racks pour lire le compromis circulation vs stockage.</p>
      </section>
    </div>
    <section style="margin-top:18px">
      <h2>Classement des configurations</h2>
      <table>
        <thead><tr><th>Passages</th><th>Robots</th><th>Debit</th><th>Backlog</th><th>Attente</th><th>Racks</th></tr></thead>
        <tbody>${comparison}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
async function main() {
    const baseConfig = cloneConfig(scenarios[0].config);
    const plan = buildExperiencePlan();
    const results = await runLab({
        baseConfig,
        plan,
        onProgress: (progress) => {
            if (progress.completedRuns % 50 === 0 || progress.completedRuns === progress.totalRuns) {
                console.log(`${progress.completedRuns}/${progress.totalRuns} ${progress.currentLabel}`);
            }
        },
    });
    const outputPath = resolve("output", "linkedin-experience-2.html");
    writeFileSync(outputPath, html(results), "utf8");
    writeFileSync(resolve("output", "linkedin-experience-2-results.json"), JSON.stringify(results, null, 2), "utf8");
    console.log(outputPath);
}
void main();
