import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  EXPERIMENT_TEMPLATES,
  FACTOR_REGISTRY,
  PEAK_PROFILE_PRESETS,
  WAREHOUSE_SIZE_PRESETS,
  MAX_SEEDS,
  MIN_SEEDS,
  applyConfoundLocks,
  buildDefaultLabPlan,
  buildPlanFromTemplate,
  computeLockedFactors,
  countPlanRuns,
  ensureRequiredFactorValues,
  getFactorById,
  isRequiredFactor,
  maxRobotsForArea,
  type ConfoundWarning,
  type FactorDef,
  type FactorRole,
  type FactorValue,
  type LabPlan,
} from "../../experiments/labKit";
import { FACTOR_HELP, FactorHelpBody, hasFactorHelp } from "./factorHelp";
import { HelpModal } from "./HelpModal";

interface PlanEditorProps {
  plan: LabPlan;
  isRunning: boolean;
  progress: { completedRuns: number; totalRuns: number; currentLabel: string } | null;
  error: string | null;
  resultsCount: number;
  onChange: (plan: LabPlan) => void;
  onRun: () => void;
  onClear: () => void;
}

type Zone = "context" | "variable" | "shelf";

// ---------------------------------------------------------------------------
// UI categorisation — display factors grouped by domain (storage, robots,
// energy, etc.) rather than as a flat list. The underlying `factor.group`
// is too coarse ("Robots" lumps energy + reliability), so we override here.
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: readonly string[] = [
  "Entrepôt",
  "Stockage",
  "Demande",
  "Flotte robots",
  "Énergie",
  "Fiabilité",
  "Mouvement & routage",
];

const ENERGY_IDS = new Set([
  "maxBattery",
  "rechargeThreshold",
  "rechargeTicks",
  "energyPerCell",
  "chargingStationCount",
]);
const RELIABILITY_IDS = new Set(["failureProbability", "meanFailureTicks"]);

function categoryOf(factor: FactorDef): string {
  if (factor.group === "Robots") {
    if (ENERGY_IDS.has(factor.id)) return "Énergie";
    if (RELIABILITY_IDS.has(factor.id)) return "Fiabilité";
    return "Flotte robots";
  }
  if (factor.group === "Warehouse") {
    // Chargers conceptually belong to "Énergie" even though they live on the
    // warehouse layout side — they're the power-supply infrastructure.
    if (ENERGY_IDS.has(factor.id)) return "Énergie";
    return "Entrepôt";
  }
  if (factor.group === "Demand") return "Demande";
  if (factor.group === "Storage") return "Stockage";
  if (factor.group === "Movement") return "Mouvement & routage";
  return factor.group;
}

function groupByCategory(
  factors: FactorDef[],
): Array<{ category: string; items: FactorDef[] }> {
  const map = new Map<string, FactorDef[]>();
  for (const factor of factors) {
    const cat = categoryOf(factor);
    const arr = map.get(cat);
    if (arr) arr.push(factor);
    else map.set(cat, [factor]);
  }
  // Stable ordering: known categories first in the canonical order, then any
  // leftovers alphabetically (defensive — shouldn't trigger today).
  const known = CATEGORY_ORDER.filter((cat) => map.has(cat));
  const rest = [...map.keys()]
    .filter((cat) => !CATEGORY_ORDER.includes(cat))
    .sort();
  return [...known, ...rest].map((cat) => ({
    category: cat,
    items: map.get(cat) ?? [],
  }));
}

export function PlanEditor({
  plan,
  isRunning,
  progress,
  error,
  resultsCount,
  onChange: rawOnChange,
  onRun,
  onClear,
}: PlanEditorProps) {
  const [helpFactorId, setHelpFactorId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(EXPERIMENT_TEMPLATES[0]?.id ?? "");

  // Confound locks + required-factor invariant: applied after every mutation so
  // the UI cannot end up with a varied confounder or a required factor that
  // has no value (e.g. dragged into the shelf by mistake).
  const onChange = (next: LabPlan) =>
    rawOnChange(ensureRequiredFactorValues(applyConfoundLocks(next)));

  // Mount-time normalisation: catches saved campaigns that predate the rules.
  useEffect(() => {
    const normalised = ensureRequiredFactorValues(applyConfoundLocks(plan));
    if (normalised !== plan) rawOnChange(normalised);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lockedFactors = useMemo(() => computeLockedFactors(plan), [plan]);
  const isLocked = (factorId: string): boolean => lockedFactors.has(factorId);

  // Density clamp advisory: if the largest requested robotCount exceeds the
  // capacity of the smallest warehouse being tested, the engine will cap it and
  // those high values collapse onto the cap. Warn so the user isn't surprised
  // to see robotCount levels "missing" in the results.
  const robotClampWarning = useMemo(() => {
    const robotBinding = plan.bindings.find((b) => b.factorId === "robotCount");
    const sizeBinding = plan.bindings.find((b) => b.factorId === "warehouseSize");
    const maxRobots = Math.max(
      0,
      ...(robotBinding?.values ?? []).map((v) => Number(v)).filter(Number.isFinite),
    );
    if (maxRobots <= 0) return null;
    const sizes = sizeBinding?.values.length ? sizeBinding.values : ["s"];
    let worst: { size: string; cap: number } | null = null;
    for (const size of sizes) {
      const preset = WAREHOUSE_SIZE_PRESETS[String(size)];
      if (!preset) continue;
      if (preset.width <= 0 || preset.height <= 0) continue;
      const cap = maxRobotsForArea(preset.width, preset.height);
      if (!worst || cap < worst.cap) worst = { size: preset.label.trim(), cap };
    }
    if (worst && maxRobots > worst.cap) {
      return { cap: worst.cap, size: worst.size, requested: maxRobots };
    }
    return null;
  }, [plan]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const totalRuns = useMemo(() => countPlanRuns(plan), [plan]);
  const selectedTemplate = useMemo(
    () =>
      EXPERIMENT_TEMPLATES.find((template) => template.id === templateId) ??
      EXPERIMENT_TEMPLATES[0],
    [templateId],
  );
  const bindingsById = useMemo(
    () => new Map(plan.bindings.map((binding) => [binding.factorId, binding])),
    [plan],
  );

  const roleOf = (factorId: string): FactorRole =>
    plan.factorRoles?.[factorId] ?? "variable";

  const valuesOf = (factor: FactorDef): FactorValue[] =>
    bindingsById.get(factor.id)?.values ?? [];

  const isActive = (factor: FactorDef): boolean =>
    (bindingsById.get(factor.id)?.values.length ?? 0) > 0;

  const contextFactors = useMemo(
    () => FACTOR_REGISTRY.filter((factor) => roleOf(factor.id) === "context"),
    [plan.factorRoles],
  );
  const testFactors = useMemo(
    () =>
      FACTOR_REGISTRY.filter(
        (factor) => roleOf(factor.id) === "variable" && isActive(factor),
      ),
    [bindingsById, plan.factorRoles],
  );
  const shelfFactors = useMemo(
    () =>
      FACTOR_REGISTRY.filter(
        (factor) => roleOf(factor.id) === "variable" && !isActive(factor),
      ),
    [bindingsById, plan.factorRoles],
  );

  const variableCount = testFactors.filter(
    (factor) => valuesOf(factor).length > 1,
  ).length;

  // --- mutations -----------------------------------------------------------
  const setBindingValues = (factorId: string, values: FactorValue[]) => {
    onChange({
      ...plan,
      bindings: plan.bindings.map((binding) =>
        binding.factorId === factorId ? { ...binding, values } : binding,
      ),
    });
  };

  /** Move a factor into a zone (context / variable / shelf) with sensible values. */
  const moveFactor = (factorId: string, zone: Zone) => {
    const factor = getFactorById(factorId);
    if (!factor) {
      return;
    }
    // Required factors must always carry a value — refuse the shelf drop.
    // The user still sees the card stay where it was, no error popup needed.
    if (zone === "shelf" && isRequiredFactor(factorId)) {
      return;
    }
    const current = bindingsById.get(factorId)?.values ?? [];
    if (zone === "shelf") {
      onChange({
        ...plan,
        factorRoles: { ...plan.factorRoles, [factorId]: "variable" },
        bindings: plan.bindings.map((binding) =>
          binding.factorId === factorId ? { ...binding, values: [] } : binding,
        ),
      });
      return;
    }
    const nextValues =
      zone === "context"
        ? [current[0] ?? factor.defaultValues[0]].filter(
            (value): value is FactorValue => value !== undefined,
          )
        : current.length > 1
          ? current
          : factor.defaultValues;
    onChange({
      ...plan,
      factorRoles: { ...plan.factorRoles, [factorId]: zone },
      bindings: plan.bindings.map((binding) =>
        binding.factorId === factorId ? { ...binding, values: nextValues } : binding,
      ),
    });
  };

  const setSeedCount = (seedCount: number) =>
    onChange({ ...plan, seedCount: Math.max(MIN_SEEDS, Math.min(MAX_SEEDS, seedCount)) });
  const setSimulatedMinutes = (simulatedMinutes: number) =>
    onChange({ ...plan, simulatedMinutes: Math.max(1, Math.min(30, simulatedMinutes)) });
  const setWarmupMinutes = (warmupMinutes: number) =>
    onChange({
      ...plan,
      warmupMinutes: Math.max(0, Math.min(plan.simulatedMinutes, warmupMinutes)),
    });

  const applySimpleTestPlan = () => onChange(buildDefaultLabPlan());
  const applyRichAnalysisPlan = () => {
    const richValues = new Map<string, FactorValue[]>([
      ["warehouseSize", ["s"]],
      ["robotCount", [6, 10, 14, 18, 22]],
      ["crossAisleSpacing", [0, 2]],
      ["pickingStationOrientation", ["length", "width"]],
      ["storageStrategy", ["abcStorage", "balancedABCStorage"]],
      ["ordersPerMinute", [18]],
    ]);
    const simulatedMinutes = Math.max(5, plan.simulatedMinutes);
    onChange({
      ...plan,
      seedCount: Math.max(50, plan.seedCount),
      simulatedMinutes,
      warmupMinutes: Math.min(simulatedMinutes, Math.max(1, plan.warmupMinutes)),
      bindings: plan.bindings.map((binding) => ({
        ...binding,
        values: richValues.get(binding.factorId) ?? [],
      })),
    });
  };

  const onDragStart = (event: DragStartEvent) =>
    setDraggingId(String(event.active.id));
  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const factorId = String(event.active.id);
    const zone = event.over?.id as Zone | undefined;
    if (zone === "context" || zone === "variable" || zone === "shelf") {
      if (zone === "shelf" || roleOf(factorId) !== zone) {
        moveFactor(factorId, zone);
      }
    }
  };

  const draggingFactor = draggingId ? getFactorById(draggingId) : undefined;

  const progressRatio =
    progress && progress.totalRuns > 0
      ? progress.completedRuns / progress.totalRuns
      : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Run bar -------------------------------------------------------- */}
      <div className="grid gap-3 rounded-lg border border-line bg-white p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-ink">L'expérience</span>
            <RunBadge totalRuns={totalRuns} variableCount={variableCount} />
            {resultsCount > 0 ? (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                résultats prêts
              </span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <NumberField
              label="Répétitions (seeds)"
              hint="essais par config"
              max={MAX_SEEDS}
              min={MIN_SEEDS}
              onCommit={setSeedCount}
              value={plan.seedCount}
            />
            <NumberField
              label="Durée"
              hint="minutes simulées"
              max={30}
              min={1}
              onCommit={setSimulatedMinutes}
              value={plan.simulatedMinutes}
            />
            <NumberField
              label="Chauffe"
              hint="minutes ignorées"
              max={plan.simulatedMinutes}
              min={0}
              onCommit={setWarmupMinutes}
              step={0.5}
              value={plan.warmupMinutes}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <button
            className="h-10 rounded-md bg-accent px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
            disabled={isRunning || totalRuns === 0}
            onClick={onRun}
            type="button"
          >
            {isRunning ? "Calcul…" : "Lancer"}
          </button>
          <button
            className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={isRunning}
            onClick={applySimpleTestPlan}
            type="button"
            title="Repartir d'un plan simple"
          >
            Simple
          </button>
          <button
            className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            disabled={isRunning}
            onClick={applyRichAnalysisPlan}
            type="button"
            title="Plan large multi-paramètres"
          >
            Large
          </button>
          {resultsCount > 0 ? (
            <button
              className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              disabled={isRunning}
              onClick={onClear}
              type="button"
            >
              Effacer
            </button>
          ) : null}
        </div>
        {progress ? (
          <div className="lg:col-span-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
              />
            </div>
            <div className="mt-1 truncate text-xs text-slate-500">
              {progress.completedRuns} / {progress.totalRuns} — {progress.currentLabel}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-2 py-1 text-xs text-danger lg:col-span-2">
            {error}
          </div>
        ) : null}
        {lockedFactors.size > 0 || robotClampWarning ? (
          <RunAdvisoryPanel
            lockedFactors={lockedFactors}
            robotClampWarning={robotClampWarning}
          />
        ) : null}
      </div>
      {/* Template picker ------------------------------------------------ */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center">
        <label
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400"
          htmlFor="lab-template-picker"
        >
          Cas type
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
          <select
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-slate-50 px-2 text-sm font-semibold text-ink"
            disabled={isRunning}
            id="lab-template-picker"
            onChange={(event) => setTemplateId(event.target.value)}
            value={selectedTemplate?.id ?? ""}
          >
            {EXPERIMENT_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
          </select>
          <button
            className="h-9 rounded-md bg-ink px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isRunning || !selectedTemplate}
            onClick={() => {
              if (selectedTemplate) onChange(buildPlanFromTemplate(selectedTemplate));
            }}
            title={selectedTemplate?.hypothesis}
            type="button"
          >
            Charger
          </button>
        </div>
      </div>
      {/* Drag board ----------------------------------------------------- */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[1fr_minmax(190px,0.7fr)_1fr]">
          <DropColumn
            id="context"
            title="Fixé"
            subtitle="une valeur, identique pour tous les essais"
            count={contextFactors.length}
            tone="slate"
          >
            {groupByCategory(contextFactors).map((section) => (
              <CategorySection
                key={`ctx-${section.category}`}
                title={section.category}
                count={section.items.length}
              >
                {section.items.map((factor) => (
                  <FactorCard
                    key={factor.id}
                    factor={factor}
                    zone="context"
                    values={valuesOf(factor)}
                    dragging={draggingId === factor.id}
                    lock={lockedFactors.get(factor.id) ?? null}
                    onHelp={() => setHelpFactorId(factor.id)}
                    onSetValues={(values) => setBindingValues(factor.id, values)}
                    onMove={(zone) => moveFactor(factor.id, zone)}
                  />
                ))}
              </CategorySection>
            ))}
          </DropColumn>

          <DropColumn
            id="shelf"
            title="Réserve"
            subtitle="paramètres non utilisés — glisse-les à gauche ou à droite"
            count={shelfFactors.length}
            tone="indigo"
            empty="Aucun paramètre disponible — tout est en jeu."
          >
            {groupByCategory(shelfFactors).map((section) => (
              <CategorySection
                key={`shelf-${section.category}`}
                title={section.category}
                count={section.items.length}
              >
                <div className="flex flex-wrap gap-1.5">
                  {section.items.map((factor) => (
                    <ShelfChip
                      key={factor.id}
                      factor={factor}
                      dragging={draggingId === factor.id}
                      locked={isLocked(factor.id)}
                      onAdd={(zone) => moveFactor(factor.id, zone)}
                    />
                  ))}
                </div>
              </CategorySection>
            ))}
          </DropColumn>

          <DropColumn
            id="variable"
            title="À tester"
            subtitle="plusieurs valeurs comparées entre elles"
            count={testFactors.length}
            tone="accent"
            empty="Glisse un paramètre ici pour le faire varier."
          >
            {groupByCategory(testFactors).map((section) => (
              <CategorySection
                key={`var-${section.category}`}
                title={section.category}
                count={section.items.length}
              >
                {section.items.map((factor) => (
                  <FactorCard
                    key={factor.id}
                    factor={factor}
                    zone="variable"
                    values={valuesOf(factor)}
                    dragging={draggingId === factor.id}
                    lock={lockedFactors.get(factor.id) ?? null}
                    onHelp={() => setHelpFactorId(factor.id)}
                    onSetValues={(values) => setBindingValues(factor.id, values)}
                    onMove={(zone) => moveFactor(factor.id, zone)}
                  />
                ))}
              </CategorySection>
            ))}
          </DropColumn>
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingFactor ? (
            <div className="flex items-center gap-2 rounded-md border border-accent bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg">
              <GripIcon />
              {draggingFactor.label}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <HelpModal
        onClose={() => setHelpFactorId(null)}
        open={helpFactorId !== null}
        title={helpFactorId ? FACTOR_HELP[helpFactorId]?.title ?? "Aide" : "Aide"}
      >
        {helpFactorId ? <FactorHelpBody factorId={helpFactorId} /> : null}
      </HelpModal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run badge
// ---------------------------------------------------------------------------

function RunBadge({
  totalRuns,
  variableCount,
}: {
  totalRuns: number;
  variableCount: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      <span className="tabular-nums">{totalRuns.toLocaleString("fr-FR")}</span>
      simulations
      <span className="text-slate-400">·</span>
      <span className="tabular-nums">{variableCount}</span>
      paramètre{variableCount > 1 ? "s" : ""} varié{variableCount > 1 ? "s" : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Droppable column
// ---------------------------------------------------------------------------

type ColumnTone = "slate" | "accent" | "indigo";

const TONE_STYLES: Record<
  ColumnTone,
  {
    border: string;
    headerBg: string;
    dot: string;
    countBg: string;
    countText: string;
  }
> = {
  slate: {
    border: "border-slate-200",
    headerBg: "bg-slate-50",
    dot: "bg-slate-400",
    countBg: "bg-white",
    countText: "text-slate-600",
  },
  accent: {
    border: "border-accent/30",
    headerBg: "bg-accent/5",
    dot: "bg-accent",
    countBg: "bg-accent/10",
    countText: "text-accent",
  },
  indigo: {
    border: "border-indigo-200",
    headerBg: "bg-indigo-50",
    dot: "bg-indigo-400",
    countBg: "bg-white",
    countText: "text-indigo-600",
  },
};

function DropColumn({
  id,
  title,
  subtitle,
  count,
  tone,
  empty,
  children,
}: {
  id: Zone;
  title: string;
  subtitle: string;
  count: number;
  tone: ColumnTone;
  empty?: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const styles = TONE_STYLES[tone];
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-colors ${
        isOver ? "border-accent ring-2 ring-accent/30" : styles.border
      }`}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 ${styles.headerBg}`}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${styles.dot}`} />
          <div>
            <div className="text-sm font-semibold text-ink">{title}</div>
            <div className="text-[11px] text-slate-500">{subtitle}</div>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${styles.countBg} ${styles.countText}`}
        >
          {count}
        </span>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {count === 0 && empty ? (
          <div
            className={`flex h-24 items-center justify-center rounded-md border border-dashed px-4 text-center text-xs ${
              isOver ? "border-accent text-accent" : "border-line text-slate-400"
            }`}
          >
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Factor card (draggable)
// ---------------------------------------------------------------------------

function FactorCard({
  factor,
  zone,
  values,
  dragging,
  lock,
  onHelp,
  onSetValues,
  onMove,
}: {
  factor: FactorDef;
  zone: Exclude<Zone, "shelf">;
  values: FactorValue[];
  dragging: boolean;
  lock: ConfoundWarning[] | null;
  onHelp: () => void;
  onSetValues: (values: FactorValue[]) => void;
  onMove: (zone: Zone) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: factor.id });
  const hasHelp = hasFactorHelp(factor.id);
  const warningTitle = lock
    ? lock
        .map((warning) => `${warning.triggerLabel} varie aussi. ${warning.rule.why}`)
        .join("\n")
    : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border px-2.5 py-2 transition-colors ${
        dragging
          ? "opacity-40"
          : lock
            ? "border-amber-200 bg-amber-50/20"
            : zone === "variable"
              ? "border-accent/30 bg-accent/[0.03]"
              : "border-line bg-white"
      }`}
    >
      <div className="flex items-center gap-1.5 text-sm">
        <button
          className="flex h-6 w-5 cursor-grab touch-none items-center justify-center text-slate-400 hover:text-slate-600 active:cursor-grabbing"
          aria-label={`Déplacer ${factor.label}`}
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-ink">
          {factor.label}
          {factor.unit ? (
            <span className="ml-1 text-xs font-normal text-slate-400">{factor.unit}</span>
          ) : null}
        </span>
        {lock ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
            title={warningTitle}
          >
            <WarningIcon />
            Effet mêlé
          </span>
        ) : null}
        {hasHelp ? (
          <button
            aria-label={`Aide : ${factor.label}`}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 text-xs font-bold text-accent hover:bg-accent hover:text-white"
            onClick={onHelp}
            title="Comment ça marche ?"
            type="button"
          >
            ?
          </button>
        ) : null}
        <button
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          onClick={() => onMove(zone === "context" ? "variable" : "context")}
          title={zone === "context" ? "Faire varier" : "Fixer"}
          type="button"
        >
          <SwapIcon />
        </button>
      </div>
      <div className="mt-1.5 pl-6">
        {/* Locked factors stay editable as a single fixed value — the lock only
            forbids VARYING them (move to "À tester" / multi-value), not picking
            the value. */}
        <ValueEditor factor={factor} zone={zone} values={values} onCommit={onSetValues} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shelf of inactive (available) factors
// ---------------------------------------------------------------------------

function ShelfChip({
  factor,
  dragging,
  locked,
  onAdd,
}: {
  factor: FactorDef;
  dragging: boolean;
  locked: boolean;
  onAdd: (zone: Zone) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: factor.id,
    disabled: locked,
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5 text-xs ${
        dragging
          ? "border-line bg-slate-50 opacity-40"
          : locked
            ? "border-amber-300 bg-amber-50"
            : "border-line bg-slate-50"
      }`}
      title={
        locked
          ? "Verrouillé par une étude en cours"
          : FACTOR_HELP[factor.id]?.intro
      }
    >
      <button
        className={`flex h-5 w-4 touch-none items-center justify-center ${
          locked
            ? "cursor-not-allowed text-slate-300"
            : "cursor-grab text-slate-400 hover:text-slate-600 active:cursor-grabbing"
        }`}
        aria-label={`Déplacer ${factor.label}`}
        disabled={locked}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <span className={`font-medium ${locked ? "text-amber-700" : "text-slate-600"}`}>
        {factor.label}
      </span>
      <button
        className={`rounded-full px-1.5 py-0.5 font-semibold ${
          locked
            ? "cursor-not-allowed text-slate-300"
            : "text-accent hover:bg-accent hover:text-white"
        }`}
        disabled={locked}
        onClick={() => onAdd("variable")}
        title={locked ? "Verrouillé" : "Ajouter aux paramètres testés"}
        type="button"
      >
        Tester
      </button>
      <button
        className={`rounded-full px-1.5 py-0.5 font-semibold ${
          locked
            ? "cursor-not-allowed text-slate-300"
            : "text-slate-500 hover:bg-slate-200"
        }`}
        disabled={locked}
        onClick={() => onAdd("context")}
        title={locked ? "Verrouillé" : "Ajouter au contexte fixé"}
        type="button"
      >
        Fixer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value editor (enum chips / numeric)
// ---------------------------------------------------------------------------

function ValueEditor({
  factor,
  zone,
  values,
  onCommit,
}: {
  factor: FactorDef;
  zone: Exclude<Zone, "shelf">;
  values: FactorValue[];
  onCommit: (values: FactorValue[]) => void;
}) {
  if (factor.type === "enum") {
    return (
      <div className="flex flex-wrap gap-1">
        {factor.options?.map((option) => {
          const selected = values.includes(option);
          const sizePreset =
            factor.id === "warehouseSize" ? WAREHOUSE_SIZE_PRESETS[option] : null;
          const peakPreset =
            factor.id === "peakProfile" ? PEAK_PROFILE_PRESETS[option] : null;
          return (
            <button
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-white text-slate-600 hover:border-slate-300"
              }`}
              key={option}
              title={
                sizePreset
                  ? `${sizePreset.width}x${sizePreset.height}`
                  : peakPreset
                    ? peakPreset.description
                    : undefined
              }
              onClick={() => {
                if (zone === "context") {
                  onCommit([option]);
                  return;
                }
                onCommit(
                  selected
                    ? values.filter((value) => value !== option)
                    : [...values, option],
                );
              }}
              type="button"
            >
              {sizePreset?.label ?? peakPreset?.label ?? option}
            </button>
          );
        })}
      </div>
    );
  }
  return zone === "context" ? (
    <SingleNumericInput factor={factor} values={values} onCommit={onCommit} />
  ) : (
    <NumericRangeInput factor={factor} values={values} onCommit={onCommit} />
  );
}

// ---------------------------------------------------------------------------
// Numeric inputs (unchanged logic, reused)
// ---------------------------------------------------------------------------

function NumberField({
  label,
  hint,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  label: string;
  hint: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      <BoundedNumberInput
        className="mt-1 h-9 rounded border border-line bg-white px-2 text-sm tabular-nums"
        max={max}
        min={min}
        onCommit={onCommit}
        step={step}
        value={value}
      />
      <span className="mt-0.5 text-[10px] text-slate-400">{hint}</span>
    </label>
  );
}

function BoundedNumberInput({
  className,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  className: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step?: number;
  value: number;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [focused, value]);

  const commit = () => {
    const parsed = Number(draft.replace(",", "."));
    const next = Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
    onCommit(next);
    setDraft(String(next));
  };

  return (
    <input
      className={className}
      inputMode="decimal"
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      step={step}
      type="text"
      value={draft}
    />
  );
}

function SingleNumericInput({
  factor,
  values,
  onCommit,
}: {
  factor: FactorDef;
  values: FactorValue[];
  onCommit: (values: FactorValue[]) => void;
}) {
  const parsedValue = Number(values[0]);
  const parsedDefault = Number(factor.defaultValues[0]);
  const current = Number.isFinite(parsedValue)
    ? parsedValue
    : Number.isFinite(parsedDefault)
      ? parsedDefault
      : factor.min ?? 0;
  return (
    <BoundedNumberInput
      className="h-8 w-28 rounded border border-line bg-white px-2 text-xs tabular-nums"
      max={factor.max ?? 999999}
      min={factor.min ?? -999999}
      onCommit={(value) => onCommit([value])}
      step={factor.step}
      value={current}
    />
  );
}

function NumericRangeInput({
  factor,
  values,
  onCommit,
}: {
  factor: FactorDef;
  values: FactorValue[];
  onCommit: (values: FactorValue[]) => void;
}) {
  const initialRange = useMemo(() => rangeFromValues(values, factor), [factor, values]);
  const [draft, setDraft] = useState(() => initialRange);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(initialRange);
    }
  }, [focused, initialRange]);

  const commit = () => {
    const next = normalizeRangeDraft(draft, factor);
    onCommit(generateRangeValues(next));
    setDraft(next);
  };

  const preview = generateRangeValues(normalizeRangeDraft(draft, factor));

  return (
    <div className="rounded border border-line bg-white p-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        <RangeField
          label="De"
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onFocus={() => setFocused(true)}
          onValue={(start) => setDraft((current) => ({ ...current, start }))}
          value={draft.start}
        />
        <RangeField
          label="À"
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onFocus={() => setFocused(true)}
          onValue={(end) => setDraft((current) => ({ ...current, end }))}
          value={draft.end}
        />
        <RangeField
          label="Pas"
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onFocus={() => setFocused(true)}
          onValue={(step) => setDraft((current) => ({ ...current, step }))}
          value={draft.step}
        />
      </div>
      <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
        {preview.length} valeurs : {preview.join(", ")}
      </div>
    </div>
  );
}

interface RangeDraft {
  start: number;
  end: number;
  step: number;
}

function RangeField({
  label,
  onBlur,
  onFocus,
  onValue,
  value,
}: {
  label: string;
  onBlur: () => void;
  onFocus: () => void;
  onValue: (value: number) => void;
  value: number;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.08em] text-slate-400">{label}</span>
      <input
        className="mt-0.5 h-7 rounded border border-line bg-white px-1.5 text-xs tabular-nums"
        inputMode="decimal"
        onBlur={onBlur}
        onChange={(event) => {
          const parsed = Number(event.target.value.replace(",", "."));
          if (Number.isFinite(parsed)) {
            onValue(parsed);
          }
        }}
        onFocus={onFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        type="text"
        value={String(value)}
      />
    </label>
  );
}

function rangeFromValues(values: FactorValue[], factor: FactorDef): RangeDraft {
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const defaults = factor.defaultValues
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const source = numericValues.length > 0 ? numericValues : defaults;
  const start = source[0] ?? factor.min ?? 0;
  const end = source[source.length - 1] ?? start;
  return { start, end, step: inferStep(source, factor.step ?? 1) };
}

function inferStep(values: number[], fallback: number): number {
  if (values.length < 2) {
    return fallback;
  }
  const gaps = values
    .slice(1)
    .map((value, index) => value - values[index])
    .filter((gap) => gap > 0);
  return gaps.length > 0 ? gaps[0] : fallback;
}

function normalizeRangeDraft(draft: RangeDraft, factor: FactorDef): RangeDraft {
  const min = factor.min ?? -Infinity;
  const max = factor.max ?? Infinity;
  const start = clamp(Math.min(draft.start, draft.end), min, max);
  const end = clamp(Math.max(draft.start, draft.end), min, max);
  const fallbackStep = factor.step ?? 1;
  const step = Math.max(
    fallbackStep > 0 ? fallbackStep : 1,
    Math.abs(draft.step) || fallbackStep || 1,
  );
  return { start, end, step };
}

function generateRangeValues(range: RangeDraft): FactorValue[] {
  const decimals = decimalPlaces(range.step);
  const values: number[] = [];
  for (let value = range.start; value <= range.end + range.step / 1000; value += range.step) {
    values.push(roundTo(value, decimals));
  }
  return values;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, no emoji)
// ---------------------------------------------------------------------------

function CategorySection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <header className="flex items-center gap-1.5 px-0.5 pt-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {title}
        </span>
        <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-slate-100 px-1 text-[10px] font-semibold text-slate-500 tabular-nums">
          {count}
        </span>
        <span className="h-px flex-1 bg-slate-100" />
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect height="8" rx="1" width="10" x="3" y="7" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function RunAdvisoryPanel({
  lockedFactors,
  robotClampWarning,
}: {
  lockedFactors: Map<string, ConfoundWarning[]>;
  robotClampWarning: { cap: number; size: string; requested: number } | null;
}) {
  // Soft warning: group flagged factors into unique relationships. Rules are
  // symmetric, but the banner should show "A x B" once, not once per direction.
  const relationships = new Map<
    string,
    { triggerLabel: string; linkedLabel: string; why: string }
  >();
  for (const [factorId, warnings] of lockedFactors) {
    for (const info of warnings) {
      const pairKey = [info.rule.trigger, factorId].sort().join("::");
      if (!relationships.has(pairKey)) {
        relationships.set(pairKey, {
          triggerLabel: info.triggerLabel,
          linkedLabel: getFactorById(factorId)?.label ?? factorId,
          why: info.rule.why,
        });
      }
    }
  }
  const confoundEntries = [...relationships.values()];
  const noticeCount = (confoundEntries.length > 0 ? 1 : 0) + (robotClampWarning ? 1 : 0);

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50/45 px-3 py-2 text-xs text-amber-900 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <WarningIcon />
        </span>
        <span className="font-semibold">À vérifier</span>
        <span className="text-amber-800">
          {noticeCount} point{noticeCount > 1 ? "s" : ""} avant lancement.
        </span>
        {confoundEntries.length > 0 ? (
          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-amber-800">
            Liens mêlés : {confoundEntries.length}
          </span>
        ) : null}
        {robotClampWarning ? (
          <span className="rounded-full bg-white px-2 py-0.5 font-medium text-amber-800">
            Robots plafonnés à {robotClampWarning.cap}
          </span>
        ) : null}
      </div>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] font-semibold text-amber-700 hover:text-amber-900">
          Voir le détail
        </summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {confoundEntries.length > 0 ? (
            <div className="rounded border border-amber-200 bg-white/70 p-2">
              <div className="font-semibold">Attribution plus difficile</div>
              <div className="mt-1 space-y-1 text-amber-800">
                {confoundEntries.map((entry, i) => (
                  <div key={i}>
                    <span className="font-medium">{entry.triggerLabel}</span>
                    {" × "}
                    <span className="font-medium">{entry.linkedLabel}</span>
                    {" "}varient ensemble. {entry.why}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {robotClampWarning ? (
            <div className="rounded border border-amber-200 bg-white/70 p-2">
              <div className="font-semibold">Densité robots plafonnée</div>
              <div className="mt-1 text-amber-800">
                Sur l'entrepôt {robotClampWarning.size}, le moteur limite à{" "}
                <span className="font-medium tabular-nums">{robotClampWarning.cap}</span>{" "}
                robots. Les valeurs au-dessus seront ramenées au plafond et fusionnées
                dans les résultats.
              </div>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function WarningIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M8 2 1.8 13h12.4L8 2Z" />
      <path d="M8 6v3.2" />
      <path d="M8 12h.01" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <circle cx="3.5" cy="2.5" r="1.1" />
      <circle cx="8.5" cy="2.5" r="1.1" />
      <circle cx="3.5" cy="6" r="1.1" />
      <circle cx="8.5" cy="6" r="1.1" />
      <circle cx="3.5" cy="9.5" r="1.1" />
      <circle cx="8.5" cy="9.5" r="1.1" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h8l-2.5-2.5M12 11H4l2.5 2.5" />
    </svg>
  );
}
