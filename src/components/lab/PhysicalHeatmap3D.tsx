import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Object3D } from "three";
import type { LabPhysicalCellKind } from "../../experiments/labKit";

/** One averaged cell of a hot-plan, on a given floor. */
export interface HeatPlanCell {
  x: number;
  y: number;
  level: number;
  type: LabPhysicalCellKind;
  value: number;
}

interface PhysicalHeatmap3DProps {
  width: number;
  height: number;
  levelCount: number;
  cells: HeatPlanCell[];
  /** Shared across compared panels so colours stay comparable. */
  maxValue: number;
}

// ---------------------------------------------------------------------------
// Colours — value gradient (amber → dark red) over the structural palette.
// ---------------------------------------------------------------------------

const VALUE_START: [number, number, number] = [254, 243, 199];
const VALUE_END: [number, number, number] = [127, 29, 29];

function valueColor(t: number, out: Color): Color {
  const k = Math.sqrt(Math.min(1, Math.max(0, t)));
  out.setRGB(
    (VALUE_START[0] + (VALUE_END[0] - VALUE_START[0]) * k) / 255,
    (VALUE_START[1] + (VALUE_END[1] - VALUE_START[1]) * k) / 255,
    (VALUE_START[2] + (VALUE_END[2] - VALUE_START[2]) * k) / 255,
  );
  return out.convertSRGBToLinear();
}

const STRUCTURE_COLORS: Record<string, string> = {
  rack: "#334155",
  station: "#10b981",
  charger: "#fbbf24",
  elevator: "#38bdf8",
  rail: "#cbd5e1",
  blocked: "#94a3b8",
  empty: "#e2e8f0",
};

function structureColor(type: LabPhysicalCellKind | undefined, out: Color): Color {
  return out.set(STRUCTURE_COLORS[type ?? "empty"] ?? "#e2e8f0").convertSRGBToLinear();
}

/** Same grid → world mapping as WarehouseScene. */
function toWorld(x: number, y: number, width: number, height: number): [number, number] {
  return [x - width / 2 + 0.5, y - height / 2 + 0.5];
}

// ---------------------------------------------------------------------------
// Cell tiles — one flat tile per (cell, floor), placed at its floor height and
// coloured by value (heat) when non-zero, otherwise by its structural type.
// ---------------------------------------------------------------------------

function CellTiles({
  width,
  height,
  cells,
  maxValue,
  floorGap,
}: {
  width: number;
  height: number;
  cells: HeatPlanCell[];
  maxValue: number;
  floorGap: number;
}) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    cells.forEach((cell, i) => {
      const [wx, wz] = toWorld(cell.x, cell.y, width, height);
      dummy.position.set(wx, cell.level * floorGap + 0.07, wz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (cell.value > 0 && maxValue > 0) {
        mesh.setColorAt(i, valueColor(cell.value / maxValue, color));
      } else {
        mesh.setColorAt(i, structureColor(cell.type, color));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, width, height, maxValue, floorGap]);

  return (
    <instancedMesh args={[undefined, undefined, cells.length]} ref={ref} receiveShadow>
      <boxGeometry args={[0.92, 0.14, 0.92]} />
      <meshStandardMaterial roughness={0.75} />
    </instancedMesh>
  );
}

/** Faint translucent slab under each floor, so the stack reads as storeys. */
function FloorSlabs({
  width,
  height,
  levelCount,
  floorGap,
}: {
  width: number;
  height: number;
  levelCount: number;
  floorGap: number;
}) {
  return (
    <>
      {Array.from({ length: levelCount }, (_, level) => (
        <mesh
          key={level}
          position={[0, level * floorGap, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width + 0.5, height + 0.5]} />
          <meshStandardMaterial
            color="#f8fafc"
            opacity={0.35}
            roughness={1}
            transparent
          />
        </mesh>
      ))}
    </>
  );
}

/** Translucent pillars at elevator cells, connecting the floors visually. */
function ElevatorShafts({
  width,
  height,
  levelCount,
  cells,
  floorGap,
}: {
  width: number;
  height: number;
  levelCount: number;
  cells: HeatPlanCell[];
  floorGap: number;
}) {
  const shafts = useMemo(() => {
    const seen = new Set<string>();
    const out: [number, number][] = [];
    for (const cell of cells) {
      if (cell.type !== "elevator") continue;
      const key = `${cell.x}:${cell.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([cell.x, cell.y]);
    }
    return out;
  }, [cells]);

  if (levelCount <= 1 || shafts.length === 0) return null;
  const totalHeight = (levelCount - 1) * floorGap;

  return (
    <>
      {shafts.map(([x, y]) => {
        const [wx, wz] = toWorld(x, y, width, height);
        return (
          <mesh key={`${x}:${y}`} position={[wx, totalHeight / 2, wz]}>
            <boxGeometry args={[0.5, totalHeight, 0.5]} />
            <meshStandardMaterial
              color="#38bdf8"
              opacity={0.28}
              roughness={0.4}
              transparent
            />
          </mesh>
        );
      })}
    </>
  );
}

export function PhysicalHeatmap3D({
  width,
  height,
  levelCount,
  cells,
  maxValue,
}: PhysicalHeatmap3DProps) {
  const span = Math.max(width, height);
  const floorGap = Math.max(2, span * 0.16);
  const stack = (levelCount - 1) * floorGap;
  const camera = useMemo(
    () => ({
      position: [span * 0.72, span * 0.62 + stack, span * 0.82] as [number, number, number],
      fov: 42,
    }),
    [span, stack],
  );

  return (
    <Canvas camera={camera} dpr={[1, 1.75]} shadows>
      <color args={["#eef2f7"]} attach="background" />
      <ambientLight intensity={0.78} />
      <hemisphereLight groundColor="#94a3b8" intensity={0.5} />
      <directionalLight
        castShadow
        intensity={1.1}
        position={[span * 0.5, span + stack, span * 0.6]}
      />
      <FloorSlabs floorGap={floorGap} height={height} levelCount={levelCount} width={width} />
      <CellTiles
        cells={cells}
        floorGap={floorGap}
        height={height}
        maxValue={maxValue}
        width={width}
      />
      <ElevatorShafts
        cells={cells}
        floorGap={floorGap}
        height={height}
        levelCount={levelCount}
        width={width}
      />
      <OrbitControls
        enableDamping
        maxPolarAngle={Math.PI / 2.05}
        minDistance={span * 0.4}
        target={[0, stack / 2, 0]}
      />
    </Canvas>
  );
}
