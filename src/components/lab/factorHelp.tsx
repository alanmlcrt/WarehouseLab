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
  /** Optional narrative body shown instead of the modes grid (numeric factors). */
  body?: ReactNode;
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
  warehouseSize: {
    title: "Taille de l'entrepôt",
    intro:
      "Définit les dimensions de la grille (largeur × profondeur en cellules). Les racks remplissent automatiquement l'espace disponible, donc agrandir = plus d'emplacements ET plus de trajets.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus l'entrepôt est grand, plus la distance moyenne par commande augmente — il faut soit plus de robots, soit un meilleur slotting pour compenser."
        paragraphs={[
          "XS (12×10) et S (18×14) servent à itérer vite : une simulation se calcule en quelques secondes. M (24×18) est un bon compromis pour les études comparatives. L (32×24) et XL (42×30) stressent les algorithmes de circulation et exposent les bouchons.",
        ]}
        tips={[
          "Pour comparer plusieurs stratégies, fixe la taille à S ou M — sinon le total d'essais explose et le bruit augmente.",
          "Sur XL, augmente `Durée simulée` à 5–10 min pour atteindre l'état stationnaire avant de mesurer.",
          "Les KPI structurels `warehouseWidth` / `warehouseHeight` / `effectiveRackCount` te disent ce qui a réellement été construit.",
          "Quand tu fais varier la taille SANS fixer `Commandes / min`, la demande suit automatiquement la surface (densité de flux constante, ~13 cmd/min par 100 cellules) : chaque taille est chargée à proportion, ce qui rend visible le point de saturation propre à chacune. Fixe `Commandes / min` explicitement pour garder une demande identique partout.",
        ]}
      />
    ),
  },
  crossAisleSpacing: {
    title: "Passages transverses (cross-aisles)",
    intro:
      "Nombre de passages perpendiculaires qui coupent les allées de racks. Sans passage, un robot doit faire le tour complet d'une allée pour changer de couloir.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus de passages = trajets plus courts MAIS moins d'emplacements de stockage. À régler en fonction de la longueur des allées."
        paragraphs={[
          "0 passage : layout maximaliste en stockage, mais trajets en U coûteux. 1–2 passages : compromis classique. 3+ : utile pour les grands entrepôts où les allées font 20+ cellules.",
        ]}
        tips={[
          "Sur une taille S/M, 0–2 suffit ; sur L/XL, teste 2–4.",
          "Combine avec `pickingStationOrientation` : des passages transverses n'ont d'intérêt que s'ils mènent vers les stations.",
        ]}
      />
    ),
  },
  levelCount: {
    title: "Niveaux (entrepôt vertical)",
    intro:
      "Nombre d'étages superposés. Au-delà de 1 niveau, des ascenseurs (lignes verticales dédiées) sont ajoutés le long des couloirs principaux et les robots ne peuvent changer d'étage que via ces lignes.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus de niveaux = plus de capacité de stockage mais pression accrue sur les ascenseurs (KPI `verticalPressure` et `elevatorTrips`)."
        paragraphs={[
          "1 niveau : pas d'ascenseur, comportement purement 2D — utile pour isoler l'effet du slotting ou du pathfinding.",
          "2–4 niveaux : configuration typique d'un mini-load AS/RS. Les ascenseurs deviennent un goulot d'étranglement potentiel.",
          "5+ niveaux : empile beaucoup de SKU mais demande beaucoup d'ascenseurs et de robots, sinon le backlog vertical explose.",
        ]}
        tips={[
          "Si tu fais varier `levelCount`, surveille `verticalPressure` et `elevatorTrips` dans l'Explorer — c'est là que les saturations apparaissent.",
          "Les ascenseurs suivent les couloirs : leur nombre est dérivé de la géométrie, pas un paramètre indépendant.",
          "Pour comparer 1 vs 2 niveaux, garde le nombre de SKU constant — sinon tu mélanges effet géométrie et effet catalogue.",
        ]}
      />
    ),
  },
  pickingStationCount: {
    title: "Stations de picking",
    intro:
      "Nombre de stations vers lesquelles les robots livrent les caisses. Chaque station est un point de dépôt en bord d'entrepôt et concentre du trafic.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus de stations = trafic réparti, moins de congestion locale, mais coût CAPEX en hausse et placement ABC plus difficile à équilibrer."
        paragraphs={[
          "1–2 stations : configuration minimaliste, idéale pour mesurer la qualité d'un slotting ABC pur (toute la demande converge vers peu de points).",
          "3–4 stations : standard sur un entrepôt M/L — il faut alors un slotting `balancedABCStorage` pour éviter qu'une seule station prenne tout le flux.",
          "5+ : utile uniquement si `ordersPerMinute` est très élevé ou si tu veux étudier la robustesse face à des pannes de station.",
        ]}
        tips={[
          "Si une station sature (`connectorWait` élevé), augmente le nombre OU passe à `balancedABCStorage`.",
          "Sur layout S, plus de 3 stations sert rarement à quelque chose — l'entrepôt est trop petit pour générer assez de trafic.",
          "À comparer avec `pickingStationOrientation` : 4 stations alignées sur la longueur ≠ 4 stations sur la largeur.",
        ]}
      />
    ),
  },
  pickingStationOrientation: {
    title: "Orientation des stations",
    intro:
      "Détermine sur quel côté de l'entrepôt les stations sont alignées : sur le côté long (`length`) ou sur le côté court (`width`).",
    modes: [
      {
        label: "length — côté long",
        summary: "Stations réparties sur le grand côté de l'entrepôt.",
        detail:
          "Les robots traversent l'entrepôt dans la profondeur (côté court). Trajets plus courts en moyenne mais flux concentré dans une direction.",
      },
      {
        label: "width — côté court",
        summary: "Stations alignées sur le petit côté.",
        detail:
          "Les robots empruntent toute la longueur de l'entrepôt. Trajets plus longs en moyenne mais meilleure répartition du trafic dans les allées transverses.",
      },
    ],
  },
  chargingStationCount: {
    title: "Chargeurs",
    intro:
      "Nombre de bornes de recharge disponibles. Quand un robot descend sous `rechargeThreshold`, il rejoint un chargeur libre — s'il n'y en a pas, il attend.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Trop peu de chargeurs = file d'attente à la recharge (`chargingShare` élevé, `averageRobotUtilization` en chute). Trop = CAPEX gaspillé."
        paragraphs={[
          "Règle de pouce : 1 chargeur pour 4–6 robots si `rechargeTicks` est rapide, 1 pour 2–3 si la recharge est lente.",
        ]}
        tips={[
          "Surveille `chargingShare` (part du temps passé en recharge) et `chargeSessions` pour calibrer.",
          "Si `minimumBatteryLevel` tombe à 0, ce n'est pas un manque de chargeurs mais un seuil de recharge trop bas — ajuste `rechargeThreshold`.",
        ]}
      />
    ),
  },
  robotCount: {
    title: "Nombre de robots",
    intro:
      "Taille du parc actif. Le levier le plus direct pour augmenter le débit — et le plus coûteux en CAPEX.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus de robots = plus de débit, jusqu'à un palier (saturation des couloirs et des stations) au-delà duquel ajouter un robot dégrade les KPI."
        paragraphs={[
          "C'est typiquement le facteur à faire VARIER (3–5 valeurs) pour trouver le R* optimal d'une configuration donnée. Pour une étude propre, fais varier `robotCount` et fixe le reste.",
        ]}
        tips={[
          "Trace `throughputPerRobot` vs `robotCount` : la courbe plafonne puis chute → tu as trouvé la saturation.",
          "Si la `feasibilityMargin` devient négative, c'est qu'il n'y a pas assez de robots pour absorber la demande.",
          "Augmenter robotCount sans augmenter `chargingStationCount` finit par créer un bouchon à la recharge.",
        ]}
      />
    ),
  },
  ordersPerMinute: {
    title: "Commandes / minute",
    intro:
      "Cadence d'arrivée des commandes (en réalité de caisses, car 1 robot = 1 caisse). C'est la « charge » imposée à l'entrepôt.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Détermine si le système est sous-chargé (`feasibilityMargin` > 0, backlog stable) ou saturé (backlog qui croît sans limite)."
        paragraphs={[
          "Fais varier `ordersPerMinute` pour tracer la courbe de saturation : à partir de quelle cadence le débit cesse de suivre la demande ?",
        ]}
        tips={[
          "Combine avec `peakProfile` pour tester la robustesse aux surcharges temporaires.",
          "Si tu compares deux configurations, fixe `ordersPerMinute` à une valeur où LES DEUX sont faisables — sinon tu compares deux régimes différents.",
          "Demande réelle = `ordersPerMinute × averageItemsPerOrder`, lue dans le KPI `demandPerMinute`.",
        ]}
      />
    ),
  },
  urgentOrderRate: {
    title: "Part de commandes urgentes",
    intro:
      "Ratio de commandes marquées « urgentes » qui passent en priorité dans la file. 0 = aucune priorité, 1 = toutes urgentes (équivalent à 0).",
    modes: [],
    body: (
      <NarrativeBody
        effect="Une part d'urgents > 0 améliore le `serviceLevel` des urgents au prix d'une légère dégradation pour les commandes standards."
        paragraphs={[
          "Sert à modéliser des SLA différenciés (express vs standard). L'effet est subtil en sous-charge et marqué en surcharge.",
        ]}
        tips={[
          "Pour un effet visible, garde `urgentOrderRate` entre 0.05 et 0.30. Au-delà, la priorisation perd son sens.",
          "Combine avec `peakProfile` intense : c'est dans les pics que la priorisation se voit le mieux.",
        ]}
      />
    ),
  },
  peakProfile: {
    title: "Profil de pic de demande",
    intro:
      "Définit si la cadence d'arrivée est plate ou comporte une surcharge temporaire pendant la simulation. Sert à tester la résilience à un coup de feu.",
    modes: [
      {
        label: "none — Plat",
        summary: "Demande constante du début à la fin.",
        detail:
          "Aucun pic. Bon témoin pour mesurer le régime stationnaire pur, sans transitoire.",
        diagram: <UniformDemand />,
      },
      {
        label: "moderate — Pic ×2",
        summary: "Demande doublée pendant 3 min, à partir de la 2e minute.",
        detail:
          "Surcharge modérée. Un système bien dimensionné absorbe sans casser le `serviceLevel`. Le backlog gonfle puis se résorbe.",
        diagram: (
          <Bars
            colors={[PATH, PATH, HOT, HOT, HOT, PATH]}
            heights={[34, 34, 60, 60, 60, 34]}
          />
        ),
      },
      {
        label: "intense — Pic ×3",
        summary: "Demande triplée pendant 4 min.",
        detail:
          "Surcharge sévère. Révèle les goulots d'étranglement : congestion, file à la recharge, backlog qui ne se résorbe pas avant la fin du run. Très utile pour comparer la robustesse de deux stratégies.",
        diagram: (
          <Bars
            colors={[PATH, PATH, HOT, HOT, HOT, HOT]}
            heights={[34, 34, 78, 78, 78, 78]}
          />
        ),
      },
    ],
  },
  maxBattery: {
    title: "Autonomie batterie",
    intro:
      "Capacité de la batterie : combien de déplacements un robot peut faire avant de devoir recharger.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus d'autonomie = moins de temps perdu à recharger, mais une grosse batterie est plus lourde, donc le robot consomme un peu plus à chaque case (rendement non linéaire)."
        paragraphs={[
          "Trop basse, des robots tombent en panne sèche en pleine tâche (voir le KPI « Pannes batterie »). Trop haute, on paie du poids et du coût pour rien.",
        ]}
        tips={[
          "Pour trouver l'autonomie suffisante, fais-la varier et regarde à partir de quand « Pannes batterie » tombe à zéro.",
        ]}
      />
    ),
  },
  payloadKg: {
    title: "Charge utile (poids transporté)",
    intro:
      "Poids de la caisse transportée. Sert à modéliser des produits plus ou moins lourds.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus le robot est chargé, plus il consomme d'énergie par case parcourue — l'autonomie effective baisse donc avec des charges lourdes."
        paragraphs={[]}
        tips={[
          "À combiner avec l'autonomie batterie : une charge lourde peut exiger une plus grosse batterie pour éviter les pannes.",
        ]}
      />
    ),
  },
  energyPerCell: {
    title: "Énergie par cellule",
    intro:
      "Quantité d'énergie qu'un robot dépense pour franchir une case de la grille. C'est le « taux de consommation » de base.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus c'est élevé, plus la batterie se vide vite → recharges plus fréquentes et risque de panne sèche. La valeur réelle est encore majorée par le poids (robot + batterie + charge)."
        paragraphs={[]}
        tips={[
          "Paramètre avancé : si tu ne sais pas quoi mettre, laisse la valeur par défaut et joue plutôt sur l'autonomie batterie.",
        ]}
      />
    ),
  },
  failureProbability: {
    title: "Taux de panne",
    intro:
      "Probabilité qu'un robot tombe en panne à chaque seconde simulée. 0 = flotte parfaitement fiable.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Une panne immobilise le robot, rend sa commande à la file, et le robot redémarre après un temps de réparation. Plus le taux est haut, plus le débit chute et devient irrégulier."
        paragraphs={[]}
        tips={[
          "Valeurs typiques très faibles (0.001 = ~1 panne toutes les ~1000 s par robot). Sert à tester la résilience, pas le fonctionnement nominal.",
        ]}
      />
    ),
  },
  meanFailureTicks: {
    title: "Temps de réparation (MTTR)",
    intro:
      "Durée moyenne d'immobilisation après une panne (MTTR = Mean Time To Repair), en secondes simulées.",
    modes: [],
    body: (
      <NarrativeBody
        effect="Plus la réparation est longue, plus une panne coûte cher en débit. N'a d'effet que si le taux de panne est supérieur à 0."
        paragraphs={[]}
        tips={[
          "Le temps réel de chaque panne varie autour de cette moyenne (tirage aléatoire), pour rester réaliste.",
        ]}
      />
    ),
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
      {help.body ? (
        <div className="text-sm leading-relaxed text-slate-600">{help.body}</div>
      ) : null}
      {help.modes.length > 0 ? (
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
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Narrative body component for numeric / structural factors
// ---------------------------------------------------------------------------

function NarrativeBody({
  paragraphs,
  tips,
  effect,
}: {
  paragraphs: string[];
  tips?: string[];
  effect?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed text-slate-600">
          {p}
        </p>
      ))}
      {effect ? (
        <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-ink">Effet attendu : </span>
          {effect}
        </div>
      ) : null}
      {tips && tips.length > 0 ? (
        <ul className="ml-4 list-disc space-y-1 text-xs leading-relaxed text-slate-600">
          {tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
