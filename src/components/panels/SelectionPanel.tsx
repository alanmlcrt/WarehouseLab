import type { ReactNode } from "react";
import { formatPosition } from "../../utils/grid";
import { useSimulationStore } from "../../store/simulationStore";
import type { ExperimentResult, SKU } from "../../simulation/models/types";

export function SelectionPanel() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const selected = useSimulationStore((state) => state.selected);
  const runHistory = useSimulationStore((state) => state.runHistory);
  const removeRun = useSimulationStore((state) => state.removeRun);
  const clearRuns = useSimulationStore((state) => state.clearRuns);

  if (!snapshot) {
    return <Panel title="Sélection">Initialisation</Panel>;
  }

  if (!selected) {
    return (
      <Panel title="Sélection">
        <div className="rounded-md border border-dashed border-line bg-white p-4 text-sm text-slate-500">
          Aucun élément sélectionné
        </div>
        <RunHistoryPanel
          runs={runHistory}
          onRemove={removeRun}
          onClear={clearRuns}
        />
      </Panel>
    );
  }

  if (selected.type === "robot") {
    const robot = snapshot.robots.find((candidate) => candidate.id === selected.id);
    return (
      <Panel title={selected.id}>
        {robot ? (
          <Details
            rows={[
              ["Etat", robot.state],
              ["Position", formatPosition(robot.position)],
              ["Etage", `${robot.level + 1}`],
              ["Etage visuel", robot.visualLevel.toFixed(2)],
              ["Destination", formatPosition(robot.destination)],
              ["Ascenseur", robot.targetElevatorId ?? "-"],
              ["Commande", robot.assignedOrderId ?? "-"],
              ["Batterie", `${robot.battery.toFixed(1)} / ${robot.maxBattery}`],
              ["Distance", robot.distanceTravelled.toFixed(0)],
              ["Attente", `${robot.waitingTicks} ticks`],
              ["Énergie", robot.energyConsumed.toFixed(1)],
              ["Tâches", robot.completedTasks.toString()],
            ]}
          />
        ) : null}
        <EventList events={robot?.recentEvents ?? []} />
      </Panel>
    );
  }

  if (selected.type === "station") {
    const station = snapshot.warehouse.pickingStations.find(
      (candidate) => candidate.id === selected.id,
    );
    return (
      <Panel title={selected.id}>
        {station ? (
          <Details
            rows={[
              ["Nom", station.name],
              ["Station", formatPosition(station.position)],
              ["Accès", formatPosition(station.accessPosition)],
              ["File", station.queueLength.toString()],
              ["Traitées", station.processedOrders.toString()],
              ["Active", station.active ? "oui" : "non"],
              ["Occupation", `${station.busyTicks} ticks`],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  if (selected.type === "rack") {
    const rack = snapshot.warehouse.racks.find((candidate) => candidate.id === selected.id);
    const locations = snapshot.warehouse.storageLocations.filter(
      (location) => location.rackId === selected.id,
    );
    const skus = locations
      .map((location) =>
        snapshot.warehouse.skuCatalog.find((sku) => sku.id === location.skuId),
      )
      .filter((sku): sku is SKU => Boolean(sku));
    const topSkus = [...skus]
      .sort((a, b) => b.demandWeight - a.demandWeight)
      .slice(0, 3);
    const typeCounts = skus.reduce<Record<SKU["category"], number>>(
      (counts, sku) => {
        counts[sku.category] += 1;
        return counts;
      },
      { "fast-moving": 0, "medium-moving": 0, "slow-moving": 0 },
    );
    return (
      <Panel title={selected.id}>
        {rack ? (
          <Details
            rows={[
              ["Position", formatPosition(rack.position)],
              ["Acces", rack.accessCount.toString()],
              ["Emplacements", rack.locationIds.length.toString()],
              [
                "Types",
                `A:${typeCounts["fast-moving"]} B:${typeCounts["medium-moving"]} C:${typeCounts["slow-moving"]}`,
              ],
              [
                "Top demande",
                topSkus
                  .map((sku) => `${sku.id} (${sku.demandWeight.toFixed(1)})`)
                  .join(", ") || "-",
              ],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  if (selected.type === "cell") {
    const cell = snapshot.warehouse.cells.find((candidate) => candidate.id === selected.id);
    return (
      <Panel title={`Cellule ${selected.id}`}>
        {cell ? (
          <Details
            rows={[
              ["Type", cell.type],
              ["Position", formatPosition(cell)],
              ["Passages", cell.trafficCount.toString()],
              ["Attente", cell.waitCount.toString()],
              ["Rack", cell.rackId ?? "-"],
              ["Station", cell.stationId ?? "-"],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  if (selected.type === "charger") {
    const charger = snapshot.warehouse.chargingStations.find(
      (candidate) => candidate.id === selected.id,
    );
    return (
      <Panel title={selected.id}>
        {charger ? (
          <Details
            rows={[
              ["Position", formatPosition(charger.position)],
              ["Occupé par", charger.occupiedBy ?? "-"],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  if (selected.type === "elevator") {
    const elevator = snapshot.warehouse.elevatorZones.find(
      (candidate) => candidate.id === selected.id,
    );
    return (
      <Panel title={selected.id}>
        {elevator ? (
          <Details
            rows={[
              ["Nom", elevator.name],
              ["Position", formatPosition(elevator.position)],
              ["Cellules", elevator.cells.length.toString()],
              [
                "Orientation",
                elevator.orientation === "vertical-aisle"
                  ? "couloir vertical"
                  : "couloir transversal",
              ],
              ["Étages", elevator.levels.map((level) => level + 1).join(", ")],
              ["File", elevator.queueLength.toString()],
              ["Trajets", elevator.tripsCompleted.toString()],
              ["Occupé", elevator.busy ? "oui" : "non"],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  if (selected.type === "connector") {
    const connector = snapshot.warehouse.interMatrixConnectors.find(
      (candidate) => candidate.id === selected.id,
    );
    return (
      <Panel title={selected.id}>
        {connector ? (
          <Details
            rows={[
              ["Depuis", connector.fromSubMatrixId],
              ["Vers", connector.toSubMatrixId],
              ["Orientation", connector.orientation],
              ["Cellules", connector.cells.length.toString()],
              ["Passages", connector.trafficCount.toString()],
              ["Attente", connector.waitCount.toString()],
              [
                "Taux attente",
                `${(connector.waitCount / Math.max(1, connector.trafficCount)).toFixed(3)}`,
              ],
            ]}
          />
        ) : null}
      </Panel>
    );
  }

  return <Panel title="Sélection">-</Panel>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Details({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="overflow-hidden rounded-md border border-line bg-white text-sm shadow-sm">
      {rows.map(([label, value]) => (
        <div
          className="grid grid-cols-[110px_1fr] border-b border-line px-3 py-2 last:border-b-0"
          key={label}
        >
          <dt className="text-slate-500">{label}</dt>
          <dd className="min-w-0 truncate font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunHistoryPanel({
  runs,
  onRemove,
  onClear,
}: {
  runs: ExperimentResult[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-white p-4 text-xs text-slate-500">
        Aucun run sauvegardé. Utilise "Sauver" pour comparer les stratégies.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-white p-3 text-sm shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Historique runs</h3>
        <button
          className="text-xs text-slate-500 hover:text-ink"
          onClick={onClear}
          type="button"
        >
          Vider
        </button>
      </div>
      <div className="space-y-2">
        {runs.map((run) => (
          <RunRow key={run.id} run={run} onRemove={() => onRemove(run.id)} />
        ))}
      </div>
    </div>
  );
}

function RunRow({
  run,
  onRemove,
}: {
  run: ExperimentResult;
  onRemove: () => void;
}) {
  const completed = run.metrics.completedOrders;
  const throughput = run.metrics.throughputPerMinute.toFixed(1);
  const utilization = Math.round(run.metrics.averageRobotUtilization * 100);
  const congestion = run.metrics.congestionEvents;

  return (
    <div className="rounded border border-line px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-ink">
            {run.config.name}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {run.storageStrategy} · {run.config.movement.pathfindingStrategy} ·{" "}
            {run.durationSeconds.toFixed(0)}s
          </div>
        </div>
        <button
          className="text-[11px] text-slate-400 hover:text-danger"
          onClick={onRemove}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] text-slate-600">
        <Mini label="Done" value={completed.toString()} />
        <Mini label="Tput" value={throughput} />
        <Mini label="Util" value={`${utilization}%`} />
        <Mini label="Cong" value={congestion.toString()} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-panel px-1 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}

function EventList({ events }: { events: string[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-line bg-white p-3 text-sm shadow-sm">
      <h3 className="mb-2 font-semibold">Historique</h3>
      <ul className="space-y-1 text-slate-600">
        {events.map((event, index) => (
          <li key={`${event}-${index}`}>{event}</li>
        ))}
      </ul>
    </div>
  );
}
