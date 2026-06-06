import { ContactShadows, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, Vector3 } from "three";
import type {
  Cell,
  ChargingStation,
  ElevatorZone,
  GridPosition,
  InterMatrixConnector,
  PickingStation,
  Rack,
  Rail,
  Robot,
  SKU,
  SimulationState,
  StorageLocation,
  SubMatrixZone,
  Switch,
  Warehouse,
} from "../../simulation/models/types";
import {
  useSimulationStore,
  type HeatmapMode,
  type StorageViewMode,
} from "../../store/simulationStore";
import type { SceneSelection } from "../../types/selection";
import { cellId } from "../../utils/grid";

export function WarehouseScene() {
  const snapshot = useSimulationStore((state) => state.snapshot);
  const selected = useSimulationStore((state) => state.selected);
  const select = useSimulationStore((state) => state.select);
  const heatmapMode = useSimulationStore((state) => state.heatmapMode);
  const storageViewMode = useSimulationStore((state) => state.storageViewMode);

  if (!snapshot) {
    return null;
  }

  const cameraDistance = Math.max(snapshot.warehouse.width, snapshot.warehouse.height);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{
          position: [cameraDistance * 0.55, cameraDistance * 0.8, cameraDistance * 0.72],
          fov: 40,
        }}
        shadows
      >
        <color args={["#eaf0f6"]} attach="background" />
        <ambientLight intensity={0.72} />
        <hemisphereLight groundColor="#94a3b8" intensity={0.55} />
        <directionalLight
          castShadow
          intensity={1.25}
          position={[8, 16, 10]}
          shadow-mapSize-height={1024}
          shadow-mapSize-width={1024}
        />
        <SceneContents
          heatmapMode={heatmapMode}
          selected={selected}
          select={select}
          snapshot={snapshot}
          storageViewMode={storageViewMode}
        />
        <ContactShadows
          blur={2.8}
          far={18}
          opacity={0.28}
          position={[0, 0.02, 0]}
          scale={42}
        />
        <OrbitControls
          enableDamping
          maxPolarAngle={Math.PI / 2.15}
          minDistance={8}
          target={[0, 0, 0]}
        />
      </Canvas>
      {storageViewMode !== "off" ? (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-line bg-white/90 p-3 text-xs shadow-panel backdrop-blur">
          <div className="mb-2 font-semibold text-ink">
            {storageViewMode === "category" ? "Stock par type" : "Stock par demande"}
          </div>
          <div className="grid gap-1.5 text-slate-600">
            <LegendRow color="#ef4444" label="A rapide" />
            <LegendRow color="#f59e0b" label="B moyen" />
            <LegendRow color="#2563eb" label="C lent" />
          </div>
        </div>
      ) : null}
      {heatmapMode !== "off" ? (
        <div className="pointer-events-none absolute right-4 top-4 rounded-md border border-line bg-white/90 p-3 text-xs shadow-panel backdrop-blur">
          <div className="mb-2 font-semibold text-ink">
            {heatmapMode === "traffic" ? "Trafic par cellule" : "Attentes par cellule"}
          </div>
          <div
            className="h-2.5 w-40 rounded-full"
            style={{
              background:
                "linear-gradient(to right, rgb(34,197,94), rgb(251,191,36), rgb(220,38,38))",
            }}
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>faible</span>
            <span>élevé</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 rounded-sm"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

interface SceneContentsProps {
  snapshot: SimulationState;
  selected: SceneSelection | null;
  select: (selection: SceneSelection | null) => void;
  heatmapMode: HeatmapMode;
  storageViewMode: StorageViewMode;
}

function SceneContents({
  snapshot,
  selected,
  select,
  heatmapMode,
  storageViewMode,
}: SceneContentsProps) {
  const { warehouse } = snapshot;
  const selectedRobot =
    selected?.type === "robot"
      ? snapshot.robots.find((robot) => robot.id === selected.id)
      : undefined;

  return (
    <group>
      <Floor warehouse={warehouse} select={select} />
      <CrossAisleOverlay
        spacing={snapshot.config.warehouse.crossAisleSpacing}
        warehouse={warehouse}
      />
      {heatmapMode !== "off" ? (
        <Heatmap warehouse={warehouse} mode={heatmapMode} />
      ) : null}
      <LevelDecks warehouse={warehouse} />
      <SubMatrixOverlay
        connectors={warehouse.interMatrixConnectors}
        selected={selected}
        select={select}
        subMatrices={warehouse.subMatrices}
        warehouse={warehouse}
      />
      <gridHelper
        args={[
          Math.max(warehouse.width, warehouse.height),
          Math.max(warehouse.width, warehouse.height),
          "#8ea0b3",
          "#d6e0ea",
        ]}
        position={[0, 0.016, 0]}
      />
      <RailNetwork
        isGuidedMode={snapshot.config.movement.trafficMode === "rails-guided"}
        rails={warehouse.rails}
        switches={warehouse.switches}
        warehouse={warehouse}
      />
      {warehouse.elevatorZones.map((elevator) => (
        <ElevatorMesh
          elevator={elevator}
          key={elevator.id}
          selected={selected?.type === "elevator" && selected.id === elevator.id}
          warehouse={warehouse}
          onSelect={() =>
            select({
              type: "elevator",
              id: elevator.id,
              position: elevator.position,
            })
          }
        />
      ))}
      {warehouse.racks.map((rack) => (
        <RackMesh
          key={rack.id}
          rack={rack}
          selected={selected?.type === "rack" && selected.id === rack.id}
          storageViewMode={storageViewMode}
          warehouse={warehouse}
          onSelect={() => select({ type: "rack", id: rack.id, position: rack.position })}
        />
      ))}
      {warehouse.pickingStations.map((station) => (
        <StationMesh
          key={station.id}
          selected={selected?.type === "station" && selected.id === station.id}
          station={station}
          warehouse={warehouse}
          onSelect={() =>
            select({ type: "station", id: station.id, position: station.position })
          }
        />
      ))}
      {warehouse.chargingStations.map((charger) => (
        <ChargerMesh
          charger={charger}
          key={charger.id}
          selected={selected?.type === "charger" && selected.id === charger.id}
          warehouse={warehouse}
          onSelect={() =>
            select({ type: "charger", id: charger.id, position: charger.position })
          }
        />
      ))}
      {snapshot.robots.map((robot) => (
        <RobotMesh
          key={robot.id}
          robot={robot}
          selected={selected?.type === "robot" && selected.id === robot.id}
          warehouse={warehouse}
          onSelect={() => select({ type: "robot", id: robot.id, position: robot.position })}
        />
      ))}
      {selectedRobot ? <RobotPath robot={selectedRobot} warehouse={warehouse} /> : null}
    </group>
  );
}

function SubMatrixOverlay({
  subMatrices,
  connectors,
  warehouse,
  selected,
  select,
}: {
  subMatrices: SubMatrixZone[];
  connectors: InterMatrixConnector[];
  warehouse: Warehouse;
  selected: SceneSelection | null;
  select: (selection: SceneSelection | null) => void;
}) {
  if (subMatrices.length <= 1) {
    return null;
  }

  return (
    <group>
      {subMatrices.map((matrix) => {
        const y = 0.038;
        const min = toWorld(matrix.origin, warehouse, y);
        const maxX = matrix.origin.x + matrix.width;
        const maxY = matrix.origin.y + matrix.height;
        const corners: [number, number, number][] = [
          min,
          [maxX - warehouse.width / 2 + 0.5, y, min[2]],
          [maxX - warehouse.width / 2 + 0.5, y, maxY - warehouse.height / 2 + 0.5],
          [min[0], y, maxY - warehouse.height / 2 + 0.5],
          min,
        ];

        return (
          <Line
            color="#334155"
            key={matrix.id}
            lineWidth={1.4}
            opacity={0.55}
            points={corners}
            transparent
          />
        );
      })}
      {connectors.map((connector) => (
        <group key={connector.id}>
          {connector.cells.map((cell) => (
            <mesh
              key={`${connector.id}-${cell.x}-${cell.y}`}
              onPointerDown={stopAnd(() =>
                select({ type: "connector", id: connector.id, position: cell }),
              )}
              position={toWorld(cell, warehouse, 0.041)}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.88, 0.88]} />
              <meshBasicMaterial
                color={selected?.type === "connector" && selected.id === connector.id ? "#dc2626" : "#f59e0b"}
                opacity={selected?.type === "connector" && selected.id === connector.id ? 0.44 : 0.22}
                transparent
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Floor({
  warehouse,
  select,
}: {
  warehouse: Warehouse;
  select: (selection: SceneSelection | null) => void;
}) {
  return (
    <mesh
      receiveShadow
      position={[0, -0.02, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        const x = Math.floor(event.point.x + warehouse.width / 2);
        const y = Math.floor(event.point.z + warehouse.height / 2);
        if (x >= 0 && y >= 0 && x < warehouse.width && y < warehouse.height) {
          select({ type: "cell", id: cellId({ x, y }), position: { x, y } });
        }
      }}
    >
      <planeGeometry args={[warehouse.width, warehouse.height]} />
      <meshStandardMaterial color="#f8fbff" roughness={0.92} />
    </mesh>
  );
}

function CrossAisleOverlay({
  warehouse,
  spacing,
}: {
  warehouse: Warehouse;
  spacing: number;
}) {
  const rows = useMemo(() => computeCrossAisleRows(warehouse.height, spacing), [
    warehouse.height,
    spacing,
  ]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <group>
      {rows.map((y) => (
        <mesh
          key={`cross-aisle-${y}`}
          position={toWorld({ x: (warehouse.width - 1) / 2, y }, warehouse, 0.028)}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[warehouse.width - 2, 0.86]} />
          <meshBasicMaterial color="#ef4444" opacity={0.24} transparent />
        </mesh>
      ))}
    </group>
  );
}

function computeCrossAisleRows(height: number, count: number): number[] {
  const passageCount = Math.max(0, Math.round(count));
  if (passageCount <= 0) {
    return [];
  }

  const usableMinY = 2;
  const usableMaxY = height - 3;
  const rows: number[] = [];
  for (let index = 0; index < passageCount; index += 1) {
    const ratio = (index + 1) / (passageCount + 1);
    const y = Math.round(usableMinY + ratio * (usableMaxY - usableMinY));
    if (y >= usableMinY && y <= usableMaxY && !rows.includes(y)) {
      rows.push(y);
    }
  }

  return rows.sort((a, b) => a - b);
}

function Heatmap({
  warehouse,
  mode,
}: {
  warehouse: Warehouse;
  mode: Exclude<HeatmapMode, "off">;
}) {
  const cells = useMemo(
    () => warehouse.cells.filter((cell) => cell.type !== "rack" && cell.type !== "blocked"),
    [warehouse.cells],
  );
  const peak = useMemo(() => {
    let max = 0;
    for (const cell of cells) {
      const value = mode === "traffic" ? cell.trafficCount : cell.waitCount;
      if (value > max) {
        max = value;
      }
    }
    return Math.max(1, max);
  }, [cells, mode]);

  return (
    <group>
      {cells.map((cell) => {
        const value = mode === "traffic" ? cell.trafficCount : cell.waitCount;
        if (value <= 0) {
          return null;
        }
        const intensity = Math.min(1, value / peak);
        const color = heatColor(intensity);
        return (
          <mesh
            key={`heat-${cell.id}`}
            position={toWorld(cell, warehouse, 0.025)}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.96, 0.96]} />
            <meshBasicMaterial
              color={color}
              opacity={0.18 + intensity * 0.52}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

function heatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped < 0.5) {
    const ratio = clamped / 0.5;
    return rgb(Math.round(34 + ratio * (251 - 34)), Math.round(197 - ratio * (197 - 191)), Math.round(94 - ratio * (94 - 36)));
  }
  const ratio = (clamped - 0.5) / 0.5;
  return rgb(Math.round(251 - ratio * (251 - 220)), Math.round(191 - ratio * (191 - 38)), Math.round(36 - ratio * (36 - 38)));
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function LevelDecks({ warehouse }: { warehouse: Warehouse }) {
  return (
    <group>
      {warehouse.levels.map((level) => {
        const y = levelToWorldHeight(warehouse, level.index);
        const isGround = level.index === 0;
        const corners: [number, number, number][] = [
          [-warehouse.width / 2, y + 0.012, -warehouse.height / 2],
          [warehouse.width / 2, y + 0.012, -warehouse.height / 2],
          [warehouse.width / 2, y + 0.012, warehouse.height / 2],
          [-warehouse.width / 2, y + 0.012, warehouse.height / 2],
          [-warehouse.width / 2, y + 0.012, -warehouse.height / 2],
        ];

        return (
          <group key={level.index}>
            {!isGround ? (
              <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[warehouse.width, warehouse.height]} />
                <meshStandardMaterial
                  color="#dbeafe"
                  depthWrite={false}
                  opacity={0.08}
                  transparent
                />
              </mesh>
            ) : null}
            <Line
              color={isGround ? "#94a3b8" : "#38bdf8"}
              lineWidth={isGround ? 1 : 1.4}
              opacity={isGround ? 0.35 : 0.55}
              points={corners}
              transparent
            />
          </group>
        );
      })}
    </group>
  );
}

function RailNetwork({
  rails,
  switches,
  warehouse,
  isGuidedMode,
}: {
  rails: Rail[];
  switches: Switch[];
  warehouse: Warehouse;
  isGuidedMode: boolean;
}) {
  return (
    <group>
      {rails.map((rail) => (
        <RailMesh
          isGuidedMode={isGuidedMode}
          key={rail.id}
          rail={rail}
          warehouse={warehouse}
        />
      ))}
      {switches.map((railSwitch) => (
        <SwitchMesh
          isGuidedMode={isGuidedMode}
          key={railSwitch.id}
          railSwitch={railSwitch}
          warehouse={warehouse}
        />
      ))}
    </group>
  );
}

function RailMesh({
  rail,
  warehouse,
  isGuidedMode,
}: {
  rail: Rail;
  warehouse: Warehouse;
  isGuidedMode: boolean;
}) {
  const opacity = isGuidedMode ? 0.9 : 0.52;
  const color =
    rail.role === "station-loop"
      ? "#14b8a6"
      : rail.role === "cross"
        ? "#2563eb"
        : "#475569";
  const cells = useMemo(() => rail.cells, [rail.cells]);

  return (
    <group>
      {cells.map((cell, index) => {
        const next = cells[index + 1];
        const previous = cells[index - 1];
        const horizontal = next
          ? next.y === cell.y
          : previous
            ? previous.y === cell.y
            : true;
        const position = toWorld(cell, warehouse, 0.032);

        return (
          <group key={`${rail.id}-${cell.x}-${cell.y}`} position={position}>
            <mesh receiveShadow>
              <boxGeometry args={horizontal ? [0.92, 0.035, 0.16] : [0.16, 0.035, 0.92]} />
              <meshStandardMaterial
                color={color}
                metalness={0.45}
                opacity={opacity}
                roughness={0.38}
                transparent
              />
            </mesh>
            <mesh position={[0, 0.032, 0]}>
              <boxGeometry args={horizontal ? [0.92, 0.012, 0.035] : [0.035, 0.012, 0.92]} />
              <meshStandardMaterial
                color="#f8fafc"
                opacity={isGuidedMode ? 0.58 : 0.34}
                transparent
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function SwitchMesh({
  railSwitch,
  warehouse,
  isGuidedMode,
}: {
  railSwitch: Switch;
  warehouse: Warehouse;
  isGuidedMode: boolean;
}) {
  return (
    <mesh position={toWorld(railSwitch.position, warehouse, 0.075)}>
      <cylinderGeometry args={[0.22, 0.22, 0.05, 28]} />
      <meshStandardMaterial
        color={isGuidedMode ? "#f59e0b" : "#94a3b8"}
        emissive={isGuidedMode ? "#78350f" : "#000000"}
        emissiveIntensity={isGuidedMode ? 0.18 : 0}
        metalness={0.35}
        roughness={0.42}
      />
    </mesh>
  );
}

function RackMesh({
  rack,
  warehouse,
  selected,
  storageViewMode,
  onSelect,
}: {
  rack: Rack;
  warehouse: Warehouse;
  selected: boolean;
  storageViewMode: StorageViewMode;
  onSelect: () => void;
}) {
  const heat = Math.min(1, rack.accessCount / 12);
  const locationsByLevel = getRackLocationsByLevel(warehouse, rack);
  const demandPeak = Math.max(
    1,
    ...warehouse.skuCatalog.map((sku) => sku.demandWeight),
  );
  const fallbackColor = selected
    ? "#facc15"
    : heat > 0.65
      ? "#dc2626"
      : heat > 0.25
        ? "#d97706"
        : "#253246";

  return (
    <group position={toWorld(rack.position, warehouse, 0)}>
      <mesh
        castShadow
        onPointerDown={stopAnd(onSelect)}
        position={[0, topLevelHeight(warehouse) / 2 + 0.28, 0]}
      >
        <boxGeometry args={[0.12, topLevelHeight(warehouse) + 0.78, 0.12]} />
        <meshStandardMaterial color="#64748b" metalness={0.25} roughness={0.5} />
      </mesh>
      {warehouse.levels.map((level) => {
        const y = levelToWorldHeight(warehouse, level.index) + 0.33;
        const location = locationsByLevel.get(level.index);
        const sku = getSkuForLocation(warehouse, location);
        const color = selected
          ? "#facc15"
          : storageColor(sku, storageViewMode, demandPeak, fallbackColor);
        const markerColor = sku ? categoryColor(sku.category) : "#94a3b8";
        const demandRatio = sku ? Math.min(1, sku.demandWeight / demandPeak) : 0;
        return (
          <group key={`${rack.id}-level-${level.index}`} position={[0, y, 0]}>
            <mesh castShadow onPointerDown={stopAnd(onSelect)}>
              <boxGeometry args={[0.78, 0.52, 0.78]} />
              <meshStandardMaterial
                color={color}
                emissive={storageViewMode !== "off" && sku ? markerColor : "#000000"}
                emissiveIntensity={storageViewMode === "demand" ? demandRatio * 0.12 : 0.05}
                metalness={0.08}
                roughness={0.64}
              />
            </mesh>
            <mesh position={[0, 0.28, 0]} onPointerDown={stopAnd(onSelect)}>
              <boxGeometry args={[0.72, 0.028, 0.72]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
            </mesh>
            {storageViewMode !== "off" && sku ? (
              <mesh position={[0.32, 0.31, -0.32]} onPointerDown={stopAnd(onSelect)}>
                <boxGeometry args={[0.16 + demandRatio * 0.16, 0.04, 0.16]} />
                <meshStandardMaterial color={markerColor} roughness={0.36} />
              </mesh>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}


function ElevatorMesh({
  elevator,
  warehouse,
  selected,
  onSelect,
}: {
  elevator: ElevatorZone;
  warehouse: Warehouse;
  selected: boolean;
  onSelect: () => void;
}) {
  const height = topLevelHeight(warehouse) + 0.95;
  const isHorizontal = elevator.orientation === "horizontal-aisle";
  const shaftSize: [number, number, number] = isHorizontal
    ? [0.9, height, 0.54]
    : [0.54, height, 0.9];
  const capSize: [number, number, number] = isHorizontal
    ? [warehouse.width - 3, 0.08, 0.76]
    : [0.76, 0.08, warehouse.height - 1.6];
  const doorSize: [number, number, number] = isHorizontal
    ? [0.46, 0.24, 0.035]
    : [0.035, 0.24, 0.46];

  return (
    <group>
      {elevator.cells.map((cell) => {
        const shaftPosition = toWorld(cell, warehouse, height / 2 - 0.02);
        return (
          <group key={`${elevator.id}-${cell.x}-${cell.y}`} position={shaftPosition}>
            <mesh castShadow onPointerDown={stopAnd(onSelect)}>
              <boxGeometry args={shaftSize} />
              <meshStandardMaterial
                color={selected ? "#facc15" : "#06b6d4"}
                emissive="#083344"
                emissiveIntensity={0.16}
                metalness={0.22}
                opacity={0.2}
                roughness={0.36}
                transparent
              />
            </mesh>
          </group>
        );
      })}
      <mesh
        position={toWorld(elevator.position, warehouse, height + 0.05)}
        onPointerDown={stopAnd(onSelect)}
      >
        <boxGeometry args={capSize} />
        <meshStandardMaterial
          color={selected ? "#fde68a" : "#0891b2"}
          depthWrite={false}
          opacity={0.62}
          transparent
        />
      </mesh>
      {warehouse.levels.map((level) => (
        <Line
          color={selected ? "#facc15" : "#22d3ee"}
          key={`${elevator.id}-level-line-${level.index}`}
          lineWidth={selected ? 2.6 : 1.6}
          opacity={0.65}
          points={elevator.cells.map((cell) =>
            toWorld(cell, warehouse, levelToWorldHeight(warehouse, level.index) + 0.18),
          )}
          transparent
        />
      ))}
      {elevator.cells
        .filter((_, index) => index % 3 === 0)
        .map((cell) =>
          warehouse.levels.map((level) => (
            <mesh
              key={`${elevator.id}-door-${cell.x}-${cell.y}-${level.index}`}
              position={toWorld(
                cell,
                warehouse,
                levelToWorldHeight(warehouse, level.index) + 0.16,
              )}
              onPointerDown={stopAnd(onSelect)}
            >
              <boxGeometry args={doorSize} />
              <meshStandardMaterial
                color={selected ? "#fef3c7" : "#ecfeff"}
                emissive="#0e7490"
                emissiveIntensity={0.08}
              />
            </mesh>
          )),
        )}
    </group>
  );
}
function StationMesh({
  station,
  warehouse,
  selected,
  onSelect,
}: {
  station: PickingStation;
  warehouse: Warehouse;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <mesh
      castShadow
      position={toWorld(station.position, warehouse, levelToWorldHeight(warehouse, 0) + 0.18)}
      onPointerDown={stopAnd(onSelect)}
    >
      <boxGeometry args={[1.08, 0.36, 1.08]} />
      <meshStandardMaterial
        color={selected ? "#facc15" : station.active ? "#0f766e" : "#38bdf8"}
        emissive={station.active ? "#064e3b" : "#082f49"}
        emissiveIntensity={station.active ? 0.16 : 0.06}
        roughness={0.56}
      />
    </mesh>
  );
}

function ChargerMesh({
  charger,
  warehouse,
  selected,
  onSelect,
}: {
  charger: ChargingStation;
  warehouse: Warehouse;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <group position={toWorld(charger.position, warehouse, 0.08)}>
      <mesh castShadow onPointerDown={stopAnd(onSelect)}>
        <boxGeometry args={[0.78, 0.16, 0.78]} />
        <meshStandardMaterial
          color={selected ? "#facc15" : "#22c55e"}
          emissive="#064e3b"
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh position={[0, 0.12, 0]} onPointerDown={stopAnd(onSelect)}>
        <torusGeometry args={[0.27, 0.018, 8, 32]} />
        <meshStandardMaterial color="#dcfce7" />
      </mesh>
    </group>
  );
}

function RobotMesh({
  robot,
  warehouse,
  selected,
  onSelect,
}: {
  robot: Robot;
  warehouse: Warehouse;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<Group>(null);
  const initializedRef = useRef(false);
  const target = useMemo(
    () =>
      new Vector3(
        ...toWorld(
          robot.position,
          warehouse,
          levelToWorldHeight(warehouse, robot.visualLevel) + 0.19,
        ),
      ),
    [
      robot.position.x,
      robot.position.y,
      robot.visualLevel,
      warehouse.height,
      warehouse.width,
    ],
  );

  useEffect(() => {
    initializedRef.current = false;
  }, [robot.id, warehouse.height, warehouse.width]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    if (!initializedRef.current) {
      groupRef.current.position.copy(target);
      initializedRef.current = true;
      return;
    }

    groupRef.current.position.lerp(target, Math.min(1, delta * 9));
  });

  return (
    <group ref={groupRef}>
      <mesh receiveShadow position={[0, -0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 28]} />
        <meshBasicMaterial color="#0f172a" opacity={0.16} transparent />
      </mesh>
      <mesh castShadow onPointerDown={stopAnd(onSelect)}>
        <cylinderGeometry args={[0.3, 0.34, 0.34, 28]} />
        <meshStandardMaterial
          color={selected ? "#facc15" : robotColor(robot.state)}
          emissive={robot.state === "failed" ? "#7f1d1d" : "#020617"}
          emissiveIntensity={robot.state === "failed" ? 0.22 : 0.04}
          metalness={0.18}
          roughness={0.42}
        />
      </mesh>
      <mesh position={[0, 0.24, 0]} onPointerDown={stopAnd(onSelect)}>
        <boxGeometry args={[0.3, 0.08, 0.3]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.3, -0.13]} onPointerDown={stopAnd(onSelect)}>
        <boxGeometry args={[0.16, 0.025, 0.035]} />
        <meshStandardMaterial color={robot.battery < 20 ? "#dc2626" : "#22c55e"} />
      </mesh>
    </group>
  );
}

function RobotPath({ robot, warehouse }: { robot: Robot; warehouse: Warehouse }) {
  const points = [robot.position, ...robot.path].map((position) =>
    toWorld(position, warehouse, levelToWorldHeight(warehouse, robot.visualLevel) + 0.08),
  );

  if (points.length < 2) {
    return null;
  }

  return <Line color="#2563eb" lineWidth={2} points={points} />;
}

function getRackLocationsByLevel(
  warehouse: Warehouse,
  rack: Rack,
): Map<number, StorageLocation> {
  return new Map(
    warehouse.storageLocations
      .filter((location) => location.rackId === rack.id)
      .map((location) => [location.level, location]),
  );
}

function getSkuForLocation(
  warehouse: Warehouse,
  location?: StorageLocation,
): SKU | undefined {
  if (!location?.skuId) {
    return undefined;
  }
  return warehouse.skuCatalog.find((sku) => sku.id === location.skuId);
}

function storageColor(
  sku: SKU | undefined,
  mode: StorageViewMode,
  demandPeak: number,
  fallbackColor: string,
): string {
  if (!sku || mode === "off") {
    return fallbackColor;
  }

  if (mode === "category") {
    return categoryColor(sku.category);
  }

  return demandShade(categoryColor(sku.category), sku.demandWeight / demandPeak);
}

function categoryColor(category: SKU["category"]): string {
  switch (category) {
    case "fast-moving":
      return "#ef4444";
    case "medium-moving":
      return "#f59e0b";
    case "slow-moving":
      return "#2563eb";
    default:
      return "#64748b";
  }
}

function demandShade(hex: string, ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const rgbValue = Number.parseInt(hex.slice(1), 16);
  const r = (rgbValue >> 16) & 255;
  const g = (rgbValue >> 8) & 255;
  const b = rgbValue & 255;
  const mix = 0.32 + clamped * 0.68;
  return rgb(
    Math.round(245 + (r - 245) * mix),
    Math.round(248 + (g - 248) * mix),
    Math.round(252 + (b - 252) * mix),
  );
}

function levelToWorldHeight(warehouse: Warehouse, level: number): number {
  const lowerLevel = Math.floor(level);
  const upperLevel = Math.ceil(level);
  const lowerHeight = warehouse.levels[lowerLevel]?.height ?? lowerLevel * 1.15;
  const upperHeight = warehouse.levels[upperLevel]?.height ?? upperLevel * 1.15;
  const fraction = level - lowerLevel;
  return lowerHeight + (upperHeight - lowerHeight) * fraction;
}

function topLevelHeight(warehouse: Warehouse): number {
  const lastLevel = warehouse.levels[warehouse.levels.length - 1];
  return lastLevel?.height ?? 0;
}

function toWorld(
  position: GridPosition,
  warehouse: Warehouse,
  y = 0,
): [number, number, number] {
  return [
    position.x - warehouse.width / 2 + 0.5,
    y,
    position.y - warehouse.height / 2 + 0.5,
  ];
}

function robotColor(state: Robot["state"]): string {
  switch (state) {
    case "idle":
      return "#64748b";
    case "movingToPick":
    case "movingToDropoff":
    case "movingToElevator":
      return "#2563eb";
    case "movingToCharger":
      return "#16a34a";
    case "ridingElevator":
      return "#06b6d4";
    case "picking":
    case "droppingOff":
      return "#0f766e";
    case "waiting":
      return "#d97706";
    case "charging":
      return "#22c55e";
    case "failed":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

function stopAnd(callback: () => void) {
  return (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    callback();
  };
}
