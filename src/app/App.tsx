import { useEffect } from "react";
import { Dashboard } from "../components/dashboard/Dashboard";
import { TopBar } from "../components/controls/TopBar";
import { LabPage } from "../components/lab/LabPage";
import { AppShell } from "../components/layout/AppShell";
import { ParameterPanel } from "../components/panels/ParameterPanel";
import { SelectionPanel } from "../components/panels/SelectionPanel";
import { WarehouseScene } from "../components/scene/WarehouseScene";
import { useSimulationStore } from "../store/simulationStore";

export function App() {
  const initialize = useSimulationStore((state) => state.initialize);
  const snapshot = useSimulationStore((state) => state.snapshot);
  const workerError = useSimulationStore((state) => state.workerError);
  const labMode = useSimulationStore((state) => state.labMode);
  const isRunning = useSimulationStore((state) => state.isRunning);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (labMode) {
    return <LabPage />;
  }

  const showLiveStats = Boolean(snapshot && (isRunning || snapshot.tick > 0));

  return (
    <AppShell
      top={<TopBar />}
      left={<ParameterPanel />}
      center={
        snapshot ? (
          <WarehouseScene />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Chargement de la simulation
          </div>
        )
      }
      right={<SelectionPanel />}
      bottom={showLiveStats ? <Dashboard /> : undefined}
    >
      {workerError ? (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 shadow-panel">
          {workerError}
        </div>
      ) : null}
    </AppShell>
  );
}
