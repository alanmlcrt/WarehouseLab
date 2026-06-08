# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm install         # install dependencies
npm run dev         # start Vite dev server (defaults to http://127.0.0.1:5173)
npm run build       # tsc -b && vite build
npm run preview     # preview the production build
```

There is no test runner, linter, or formatter configured. Type checking happens through `tsc -b` as part of `npm run build`.

## High-Level Architecture

Warehouse Lab 3D simulates an automated warehouse. The codebase is built around a strict separation between a **pure simulation engine** and the **React/Three.js visualization**, connected through a Web Worker boundary.

### The three layers

1. **Simulation (`src/simulation/`)** — Tick-based deterministic engine. Must not import from React or Three.js. Operates only on grid coordinates and serializable objects.
   - `core/SimulationEngine.ts` — the engine: per-tick it generates orders, assigns tasks, advances paths, handles elevators, detects pickup/dropoff, and updates metrics.
   - `models/types.ts` — all serializable domain types (`Warehouse`, `Robot`, `Order`, `Task`, `Rack`, `SimulationConfig`, `SimulationState`, `SimulationMetrics`, `ExperimentResult`).
   - `algorithms/` — `pathfinding.ts` (A* with Manhattan heuristic + traffic-weighted cost via `trafficCount`/`waitCount`) and `storageStrategies.ts` (`randomStorage`, `abcStorage`).
   - `core/warehouseFactory.ts` — generates the warehouse: grid, racks, stations, chargers, rails/switches, sub-matrix corridors, multi-level layout, and dedicated elevator lines aligned with corridors.
   - `core/demand.ts` — weighted SKU sampling driven by `uniform` / `abc` / `pareto` / `custom` profiles.
   - `metrics/calculateMetrics.ts` — KPIs, time series, slotting quality, vertical pressure, connector traffic, battery aggregates.
   - `scenarios/presets.ts` — predefined `SimulationConfig`s plus `cloneConfig`.
   - `worker/` — `messages.ts` defines the request/response contract (`init`, `play`, `pause`, `reset`, `setSpeed`, `loadScenario`, `updateConfig` → `snapshot` / `error`); `simulationWorker.ts` runs the engine inside the worker.

2. **Store (`src/store/simulationStore.ts`)** — Zustand store holds the latest visible snapshot, UI flags (running, speed, scenario, selection, heatmap mode, storage view mode), run history, and Research Lab state. The Worker is held in a **module-level variable**, never inside Zustand state, so the store stays serializable. All commands to the engine flow through `post(message)`.

3. **UI (`src/components/`, `src/app/`)** — React reads snapshots from Zustand and renders them. It must not mutate simulation state.
   - `scene/WarehouseScene.tsx` — React Three Fiber rendering. Robots are interpolated with `useFrame` between the discrete tick snapshots; the worker still publishes ticks at fixed cadence.
   - `dashboard/Dashboard.tsx` — Recharts KPIs and time series.
   - `panels/ParameterPanel.tsx` and `panels/SelectionPanel.tsx` — config editor and selected-element details.
   - `controls/TopBar.tsx` — scenario picker, transport controls, heatmap/storage view toggles.
   - `layout/AppShell.tsx`, `app/App.tsx`, `app/main.tsx` — composition root.

### Data flow

User → Zustand action → `worker.postMessage(SimulationWorkerRequest)` → worker advances engine ~every 250 ms applying `speed` ticks per cycle (a tick = 1 simulated second) → worker posts `SimulationWorkerResponse { type: "snapshot", state }` → store updates → scene + dashboard re-render from the snapshot.

### Research Lab (`src/experiments/researchLab.ts`)

Runs design-of-experiments on top of the engine: multi-seed sweeps (Capacity, Matrix Topology, Vertical Topology, Battery Strategy), a log-linear regression for robot count `R*`, cross-validation RMSE, robustness scores, and Markdown/JSON/CSV export. Research history persists to `localStorage` under `warehouse-lab-research-history-v1`. Read it before editing experiment logic — it's a single large file (~70 KB) and concentrates the empirical-formula logic.

## Conventions that matter

- **No React/Three in `src/simulation/`.** The engine must remain runnable and testable in isolation. UI converts grid coords → Three.js positions, never the reverse.
- **All randomness goes through seeded RNGs** (`src/utils/random.ts`). The config carries three independent seeds: `layoutSeed`, `demandSeed`, `failureSeed`. Same config + same seeds = identical results. Never call `Math.random()` inside simulation code.
- **Snapshots are the only contract between worker and UI.** Anything the UI needs must end up on `SimulationState` (serializable). Don't try to share class instances across the worker boundary.
- **Elevators follow corridors.** The number of vertical lines / elevator aisles is derived from the layout's corridor lines, not exposed as an independent user parameter. Robots may only change level from dedicated vertical lines.
- **Cell occupancy is the collision model.** No multi-agent path finding yet; if next cell is occupied the robot waits and accumulates `waitCount`. Paths recompute periodically when blocked.
- **One robot, one box.** The operational unit is a single carton. `caisses/min = ordersPerMinute * averageItemsPerOrder`.

## Project docs

The `docs/` folder is the source of truth for project intent and should be kept in sync after structural changes:

- `docs/ARCHITECTURE.md` — folder responsibilities, worker contract, store layout.
- `docs/SIMULATION_MODEL.md` — tick loop, robot states, storage strategies, elevators, batteries, seeds.
- `docs/METRICS.md` — definition and formula for every KPI surfaced in the dashboard and Research Lab.
- `docs/DECISIONS.md` — ADR-style record of why the Worker + seeded RNG + no-backend choices were made.
- `docs/ROADMAP.md` — what's planned for v0.1 / v0.2 / v0.3.
- `docs/PROJECT_MEMORY.md` — running status of what's done vs. pending.
- `docs/plans/` — per-chantier implementation plans (numbered).
