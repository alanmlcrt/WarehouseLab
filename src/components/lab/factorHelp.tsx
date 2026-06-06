import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Plain-language help for the technical lab factors, with little SVG schematics
// so a non-specialist understands what each mode actually does.
// ---------------------------------------------------------------------------

const HOT = "#dc2626"; // articles tres demandes (rapides)
const MID = "#f59e0b"; // demande moyenne
const COLD = "#94a3b8"; // peu demandes (lents)
const STATION = "#0f766e";
const PATH = "#2563eb";
const JAM = "#fca5a5";
const LINE = "#cbd5e1";

interface HelpMode {
  label: string;
  summary: string;
  detail: string;
  diagram?: ReactNode;
}

export interface FactorHelp {
  title: string;
  intro: string;
  legend?: ReactNode;
  modes: HelpMode[];
}

// --- small SVG primitives --------------------------------------------------

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      className="h-[96px] w-full rounded-md border border-line bg-slate-50"
      viewBox="0 0 150 96"
    >
      {children}
    </svg>
  );
}

function Station({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect fill={STATION} height={20} rx={2} width={12} x={x} y={y} />
      <text fill="#fff" fontSize={9} fontWeight={700} x={x + 3} y={y + 14}>
        S
      </text>
    </g>
  );
}

function Slot({ x, y, c }: { x: number; y: number; c: string }) {
  return <rect fill={c} height={13} rx={2} width={17} x={x} y={y} />;
}

const COLS = [26, 47, 68, 89, 110];
const ROWS = [10, 28, 46, 64];

/** Grid of slots coloured by a per-cell colour function. */
function SlotGrid({ color }: { color: (col: number, row: number) => string }) {
  return (
    <>
      {ROWS.map((y, row) =>
        COLS.map((x, col) => <Slot c={color(col, row)} key={`${col}-${row}`} x={x} y={y} />),
      )}
    </>
  );
}

// --- storage diagrams ------------------------------------------------------

function RandomStorage() {
  // deterministic pseudo-scatter
  const palette = [HOT, COLD, MID, COLD, HOT, COLD, MID, COLD, COLD, HOT, COLD, MID, COLD, MID, COLD, COLD, HOT, COLD, COLD, MID];
  return (
    <Frame>
      <Station x={6} y={34} />
      <SlotGrid color={(col, row) => palette[(row * 5 + col) % palette.length]} />
    </Frame>
  );
}

function AbcStorage() {
  return (
    <Frame>
      <Station x={6} y={34} />
      <SlotGrid
        color={(col) => (col <= 0 ? HOT : col === 1 ? HOT : col === 2 ? MID : COLD)}
      />
    </Frame>
  );
}

function BalancedStorage() {
  return (
    <Frame>
      <Station x={6} y={6} />
      <Station x={6} y={62} />
      <SlotGrid
        color={(col, row) => {
          const nearAStation = row === 0 || row === 3;
          if (col <= 1 && nearAStation) return HOT;
          if (col <= 1) return MID;
          return COLD;
        }}
      />
    </Frame>
  );
}

function CoiStorage() {
  return (
    <Frame>
      <Station x={6} y={34} />
      <SlotGrid
        color={(col, row) => {
          if (col <= 1 && row !== 0) return HOT; // petits + demandes => au plus pres
          if (col === 2) return MID;
          return COLD;
        }}
      />
      {/* article tres demande mais volumineux: repousse au loin */}
      <rect
        fill={HOT}
        height={13}
        rx={2}
        stroke="#7f1d1d"
        strokeDasharray="2 2"
        strokeWidth={2}
        width={17}
        x={COLS[4]}
        y={ROWS[0]}
      />
      <text fill="#7f1d1d" fontSize={7} x={92} y={9}>
        volumineux →
      </text>
    </Frame>
  );
}

// --- demand profile diagrams ----------------------------------------------

function Bars({ heights, colors }: { heights: number[]; colors: string[] }) {
  const base = 82;
  const width = 16;
  const gap = 6;
  const start = 14;
  return (
    <Frame>
      <line stroke={LINE} x1={8} x2={142} y1={base} y2={base} />
      {heights.map((h, i) => (
        <rect
          fill={colors[i] ?? PATH}
          height={h}
          key={i}
          rx={1.5}
          width={width}
          x={start + i * (width + gap)}
          y={base - h}
        />
      ))}
    </Frame>
  );
}

function UniformDemand() {
  return (
    <Bars
      colors={[PATH, PATH, PATH, PATH, PATH, PATH]}
      heights={[34, 34, 34, 34, 34, 34]}
    />
  );
}

function AbcDemand() {
  return (
    <Bars
      colors={[HOT, HOT, MID, MID, COLD, COLD]}
      heights={[58, 50, 22, 18, 9, 7]}
    />
  );
}

function ParetoDemand() {
  return (
    <Frame>
      <line stroke={LINE} x1={8} x2={142} y1={82} y2={82} />
      {[64, 30, 16, 9, 6, 4].map((h, i) => (
        <rect
          fill={i === 0 ? HOT : i < 2 ? MID : COLD}
          height={h}
          key={i}
          rx={1.5}
          width={16}
          x={14 + i * 22}
          y={82 - h}
        />
      ))}
      <path
        d="M22 18 Q60 60 134 76"
        fill="none"
        stroke="#7f1d1d"
        strokeWidth={1.5}
      />
    </Frame>
  );
}

// --- routing diagrams ------------------------------------------------------

function Obstacle({ x, y }: { x: number; y: number }) {
  return <rect fill="#475569" height={22} rx={2} width={14} x={x} y={y} />;
}

function FixedRoute() {
  return (
    <Frame>
      <Obstacle x={70} y={36} />
      <circle cx={16} cy={48} fill={PATH} r={4} />
      <circle cx={132} cy={48} fill={STATION} r={4} />
      <line stroke={PATH} strokeWidth={2} x1={16} x2={66} y1={48} y2={48} />
      <line
        stroke={JAM}
        strokeDasharray="3 3"
        strokeWidth={2}
        x1={84}
        x2={132}
        y1={48}
        y2={48}
      />
      <circle cx={58} cy={48} fill={JAM} r={3} />
      <circle cx={50} cy={48} fill={JAM} r={3} />
      <text fill="#b91c1c" fontSize={8} x={40} y={70}>
        bouchon
      </text>
    </Frame>
  );
}

function PeriodicRoute() {
  return (
    <Frame>
      <Obstacle x={70} y={36} />
      <circle cx={16} cy={48} fill={PATH} r={4} />
      <circle cx={132} cy={48} fill={STATION} r={4} />
      <path
        d="M16 48 H62 V24 H92 V48 H132"
        fill="none"
        stroke={PATH}
        strokeWidth={2}
      />
      <text fill="#475569" fontSize={8} x={38} y={70}>
        recalcul si bloqué
      </text>
    </Frame>
  );
}

function ReactiveRoute() {
  return (
    <Frame>
      <Obstacle x={56} y={20} />
      <Obstacle x={92} y={50} />
      <circle cx={16} cy={48} fill={PATH} r={4} />
      <circle cx={132} cy={40} fill={STATION} r={4} />
      <path
        d="M16 48 Q40 52 52 60 Q70 70 84 56 Q100 44 116 42 H132"
        fill="none"
        stroke={PATH}
        strokeWidth={2}
      />
      <text fill="#475569" fontSize={8} x={30} y={86}>
        contourne en continu
      </text>
    </Frame>
  );
}

// --- pathfinding diagrams --------------------------------------------------

function ManhattanPath() {
  return (
    <Frame>
      <ellipse cx={78} cy={48} fill={JAM} opacity={0.7} rx={26} ry={20} />
      <circle cx={16} cy={70} fill={PATH} r={4} />
      <circle cx={134} cy={26} fill={STATION} r={4} />
      <path d="M16 70 H134 V26" fill="none" stroke={PATH} strokeWidth={2} />
      <text fill="#b91c1c" fontSize={8} x={60} y={50}>
        trafic
      </text>
    </Frame>
  );
}

function AstarPath() {
  return (
    <Frame>
      <ellipse cx={78} cy={48} fill={JAM} opacity={0.7} rx={26} ry={20} />
      <circle cx={16} cy={70} fill={PATH} r={4} />
      <circle cx={134} cy={26} fill={STATION} r={4} />
      <path
        d="M16 70 Q30 86 60 84 Q104 82 120 50 Q128 36 134 26"
        fill="none"
        stroke={PATH}
        strokeWidth={2}
      />
      <text fill="#475569" fontSize={8} x={52} y={20}>
        évite le trafic
      </text>
    </Frame>
  );
}

// --- legends ---------------------------------------------------------------

function VelocityLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
      <Swatch c={HOT} label="Article rapide (très demandé)" />
      <Swatch c={MID} label="Demande moyenne" />
      <Swatch c={COLD} label="Article lent (peu demandé)" />
      <Swatch c={STATION} label="Station de prélèvement (S)" />
    </div>
  );
}

function Swatch({ c, label }: { c: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FACTOR_HELP: Record<string, FactorHelp> = {
  storageStrategy: {
    title: "Stratégies de stockage (slotting)",
    intro:
      "Le slotting décide quel article va dans quel emplacement. Un bon slotting rapproche les articles les plus commandés des stations pour réduire les trajets des robots.",
    legend: <VelocityLegend />,
    modes: [
      {
        label: "randomStorage — Aléatoire",
        summary: "Chaque article est rangé au hasard.",
        detail:
          "Aucune logique : un article très demandé peut se retrouver tout au fond. Sert de point de comparaison (le pire cas réaliste).",
        diagram: <RandomStorage />,
      },
      {
        label: "abcStorage — ABC (par vitesse)",
        summary: "Les articles les plus demandés au plus près de la station.",
        detail:
          "Classe les articles par demande (A = rapides, B = moyens, C = lents) et place les A dans les emplacements les plus proches. Minimise la distance moyenne pondérée par la demande.",
        diagram: <AbcStorage />,
      },
      {
        label: "balancedABCStorage — ABC équilibré",
        summary: "Les articles populaires répartis entre plusieurs stations.",
        detail:
          "Comme l'ABC, mais au lieu d'entasser tous les articles populaires au même endroit, il les distribue autour des différentes stations. Évite qu'une seule station soit engorgée.",
        diagram: <BalancedStorage />,
      },
      {
        label: "dynamicSlotting — COI (demande / volume)",
        summary: "Privilégie les articles demandés ET peu encombrants.",
        detail:
          "Indice cube-par-commande : classe par demande divisée par le volume. Un petit article très demandé gagne la meilleure place ; un article très demandé mais volumineux est repoussé car il occupe trop d'espace près de la station.",
        diagram: <CoiStorage />,
      },
    ],
  },
  demandPattern: {
    title: "Profils de demande",
    intro:
      "Définit comment les commandes se répartissent entre les articles. C'est la « forme » de la demande que subit l'entrepôt.",
    modes: [
      {
        label: "uniform — Uniforme",
        summary: "Tous les articles sont commandés aussi souvent.",
        detail:
          "Demande plate : aucun article n'est privilégié. Le slotting ABC n'apporte presque rien dans ce cas, ce qui en fait un bon témoin.",
        diagram: <UniformDemand />,
      },
      {
        label: "abc — ABC (loi 80/20)",
        summary: "Quelques articles concentrent l'essentiel des commandes.",
        detail:
          "Typique du commerce : ~20 % des articles (A, en rouge) font ~80 % des commandes. C'est là que le bon placement compte le plus.",
        diagram: <AbcDemand />,
      },
      {
        label: "pareto — Pareto (très concentré)",
        summary: "Concentration encore plus extrême sur les têtes de gondole.",
        detail:
          "Loi de puissance : une poignée d'articles écrase tout le reste. Stresse fortement les emplacements proches des stations et les algorithmes de routage.",
        diagram: <ParetoDemand />,
      },
    ],
  },
  reroutingPolicy: {
    title: "Re-routage : trajet fixe vs dynamique",
    intro:
      "Détermine à quelle fréquence un robot recalcule son chemin. C'est le cœur de la comparaison entre algorithmes de circulation.",
    modes: [
      {
        label: "fixed — Trajet fixe",
        summary: "Un seul trajet calculé une fois, jamais recalculé.",
        detail:
          "Le robot suit son chemin coûte que coûte. Si un autre robot le bloque, il attend. Sous forte densité, les robots s'accumulent : bouchons et quasi-blocage.",
        diagram: <FixedRoute />,
      },
      {
        label: "periodic — Recalcul périodique",
        summary: "Recalcule seulement de temps en temps quand il est bloqué.",
        detail:
          "Compromis : le robot ne recalcule que s'il reste coincé, toutes les quelques secondes. Bon équilibre entre stabilité et adaptation.",
        diagram: <PeriodicRoute />,
      },
      {
        label: "reactive — Dynamique",
        summary: "Recalcule son chemin à chaque déplacement.",
        detail:
          "Le robot réagit en continu à la congestion et contourne les zones encombrées. Très souple, mais peut osciller (tous les robots fuient la même zone en même temps).",
        diagram: <ReactiveRoute />,
      },
    ],
  },
  pathfindingStrategy: {
    title: "Calcul de chemin : aveugle vs conscient du trafic",
    intro:
      "Définit comment le plus court chemin est calculé entre deux points.",
    modes: [
      {
        label: "manhattan — Plus court (aveugle)",
        summary: "Cherche le chemin le plus court sans tenir compte du trafic.",
        detail:
          "Rapide et simple, mais traverse les zones encombrées sans les éviter : risque de ralentissements.",
        diagram: <ManhattanPath />,
      },
      {
        label: "astar — A* pondéré trafic",
        summary: "Pénalise les cellules déjà très fréquentées.",
        detail:
          "Ajoute un coût sur les cases où il y a beaucoup de passage et d'attente : le robot préfère un détour fluide à une ligne droite engorgée.",
        diagram: <AstarPath />,
      },
    ],
  },
  taskAssignmentStrategy: {
    title: "Règle d'affectation des tâches",
    intro:
      "Quand une commande arrive, quel robot disponible reçoit la mission ?",
    modes: [
      {
        label: "nearestRobot — Le plus proche",
        summary: "La commande va au robot le plus proche de l'article.",
        detail:
          "Minimise le trajet à vide. Généralement le plus efficace, mais peut surcharger les robots d'une zone très active.",
      },
      {
        label: "oldestAvailable — Le plus ancien disponible",
        summary: "La commande va au robot inactif depuis le plus longtemps.",
        detail:
          "Répartit le travail équitablement entre robots (utile pour l'usure / batterie), au prix de trajets à vide plus longs.",
      },
    ],
  },
};

export function hasFactorHelp(factorId: string): boolean {
  return Boolean(FACTOR_HELP[factorId]);
}

export function FactorHelpBody({ factorId }: { factorId: string }) {
  const help = FACTOR_HELP[factorId];
  if (!help) {
    return null;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-slate-600">{help.intro}</p>
      {help.legend ? (
        <div className="rounded-md border border-line bg-slate-50 p-3">
          {help.legend}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {help.modes.map((mode) => (
          <div
            className="flex flex-col gap-2 rounded-md border border-line p-3"
            key={mode.label}
          >
            {mode.diagram}
            <div>
              <div className="text-sm font-semibold text-ink">{mode.label}</div>
              <div className="text-xs font-medium text-accent">{mode.summary}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {mode.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
