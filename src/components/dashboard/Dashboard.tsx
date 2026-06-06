import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricSample } from "../../simulation/models/types";
import { useSimulationStore } from "../../store/simulationStore";

export function Dashboard() {
  const snapshot = useSimulationStore((state) => state.snapshot);

  if (!snapshot) {
    return <div className="p-4 text-sm text-slate-500">Dashboard en attente</div>;
  }

  const metrics = snapshot.metrics;
  const series = metrics.series;
  const urgentBacklog = snapshot.orders.filter(
    (order) => order.urgent && order.status !== "completed",
  ).length;

  return (
    <div className="grid h-full grid-cols-[minmax(500px,0.9fr)_minmax(360px,1fr)] gap-4 p-4">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid min-h-0 grid-cols-3 gap-2">
          <Metric label="Caisses" value={metrics.completedOrders.toString()} />
          <Metric label="Backlog" value={metrics.pendingOrders.toString()} />
          <Metric
            label="Temps moyen"
            value={`${metrics.averageProcessingTime.toFixed(1)} s`}
          />
          <Metric
            label="Distance/commande"
            value={metrics.averageDistancePerOrder.toFixed(1)}
          />
          <Metric
            label="Robots actifs"
            value={`${metrics.activeRobots} / ${snapshot.robots.length}`}
          />
          <Metric
            label="Utilisation"
            value={`${Math.round(metrics.averageRobotUtilization * 100)} %`}
          />
          <Metric
            label="Distance totale"
            value={metrics.totalDistance.toFixed(0)}
          />
          <Metric
            label="Énergie"
            value={metrics.energyConsumed.toFixed(1)}
          />
          <Metric
            label="Congestion"
            value={metrics.congestionEvents.toString()}
          />
          <Metric
            label="Connecteurs"
            value={`${metrics.connectorTraffic} / ${metrics.connectorWait}`}
          />
          <Metric
            label="Vertical"
            value={`${Math.round(metrics.verticalPressure * 100)} %`}
          />
          <Metric
            label="Slotting"
            value={`${Math.round(metrics.slottingEfficiency * 100)} %`}
          />
          <Metric label="Urgents en file" value={urgentBacklog.toString()} />
        </div>
      </div>

      <LiveChart series={series} throughput={metrics.throughputPerMinute} />
    </div>
  );
}

function LiveChart({
  series,
  throughput,
}: {
  series: MetricSample[];
  throughput: number;
}) {
  return (
    <div className="min-h-0 rounded-md border border-line bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Débit et backlog</h2>
        <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">
          {throughput.toFixed(1)} caisses/min
        </span>
      </div>
      <ResponsiveContainer height="84%" width="100%">
        <LineChart data={series} margin={{ bottom: 6, left: 4, right: 18, top: 8 }}>
          <CartesianGrid stroke="#dbe6f2" strokeDasharray="4 4" />
          <XAxis
            dataKey="elapsedSeconds"
            minTickGap={26}
            stroke="#64748b"
            tick={{ fontSize: 12, fill: "#475569" }}
            tickFormatter={(value) => `${value}s`}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 12, fill: "#475569" }} width={42} />
          <Tooltip
            contentStyle={{
              border: "1px solid #d9e1ec",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(23, 32, 51, 0.12)",
            }}
            formatter={(value: number, name) => [Number(value).toFixed(1), name]}
            labelFormatter={(value) => `${value}s`}
          />
          <Legend height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            dataKey="completedOrders"
            dot={false}
            name="Caisses"
            stroke="#0f766e"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            dataKey="pendingOrders"
            dot={false}
            name="Backlog"
            stroke="#ea580c"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            dataKey="activeRobots"
            dot={false}
            name="Robots actifs"
            stroke="#2563eb"
            strokeWidth={2.5}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-white px-2.5 py-2 shadow-sm">
      <div className="truncate text-[10px] uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold text-ink">{value}</div>
    </div>
  );
}
