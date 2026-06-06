# AI Changelog

## 2026-05-27 - Initialisation memoire et plan MVP

Modifications:

- Creation des documents internes du projet.
- Creation du plan MVP.

Pourquoi:

- Poser les conventions et la trajectoire avant l'implementation.

Fichiers impactes:

- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`
- `docs/SIMULATION_MODEL.md`
- `docs/METRICS.md`
- `docs/EXPERIMENTS.md`
- `docs/AI_CHANGELOG.md`
- `docs/plans/001-mvp-foundation.md`

Tests lances:

- Aucun a ce stade.

Problemes connus:

- Application pas encore implementee.

## 2026-05-27 - MVP Warehouse Lab 3D

Modifications:

- Creation de l'application Vite React TypeScript.
- Ajout TailwindCSS, Three.js, React Three Fiber, Drei, Zustand et Recharts.
- Implementation du moteur de simulation tick-based dans un Web Worker.
- Ajout des types metier principaux, scenarios, seeds, catalogue SKU, demande ponderee, stockage random/ABC et pathfinding Manhattan.
- Ajout de la scene 3D, panneaux de controle, panneau de selection, dashboard et export JSON.
- Ajout du README et du favicon.

Pourquoi:

- Livrer un MVP executable localement pour simuler et observer un entrepot automatise autonome.

Fichiers impactes:

- `package.json`
- `.gitignore`
- `index.html`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `tailwind.config.js`
- `postcss.config.js`
- `public/favicon.svg`
- `src/app/*`
- `src/components/**/*`
- `src/data/catalog.ts`
- `src/simulation/**/*`
- `src/store/simulationStore.ts`
- `src/types/selection.ts`
- `src/utils/*`
- `README.md`
- `docs/*`

Tests lances:

- `npm install`
- `npm run build`
- Verification Playwright locale sur `http://127.0.0.1:5173`
- Clic `Play`, observation des metriques evolutives et capture `output/playwright/warehouse-lab-3d-mvp.png`

Problemes connus:

- Le build sandbox non escalade peut echouer sur l'acces a `vite.config.ts`; le build hors sandbox passe.
- Warning Vite: bundle principal superieur a 500 kB.
- Browser in-app indisponible dans cet environnement a cause d'un echec runtime Windows sandbox; verification faite via Playwright CLI.

## 2026-05-27 - Amelioration rendu 3D, rails et dashboard

Modifications:

- Ajout du plan `docs/plans/002-3d-polish-rails-dashboard.md`.
- Extension des types `Rail` et `Switch`.
- Generation d'un reseau de rails, intersections et switches dans `warehouseFactory`.
- Rendu 3D enrichi: rails visibles, intersections, ombres de contact, racks plus detailles, chargeurs plus lisibles et robots avec interpolation.
- Dashboard inferieur agrandi et contraste renforce.

Pourquoi:

- Rendre l'experience plus convaincante visuellement, plus fluide et plus proche d'un simulateur d'entrepot lisible.

Fichiers impactes:

- `docs/plans/002-3d-polish-rails-dashboard.md`
- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/layout/AppShell.tsx`
- `src/app/styles.css`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build`
- Verification Playwright locale sur `http://127.0.0.1:5173`
- Clic `Play`, capture `output/playwright/warehouse-lab-3d-polished.png`
- Verification console: 0 erreur courante

Problemes connus:

- Les rails sont visibles mais ne pilotent pas encore les trajectoires.
- Warning Vite persistant sur la taille du bundle principal.

## 2026-05-27 - Matrice multi-etages et zones d'ascenseurs

Modifications:

- Ajout du plan `docs/plans/003-multilevel-matrix-elevators.md`.
- Ajout des types `WarehouseLevel` et `ElevatorZone`.
- Ajout de la configuration multi-etages et d'une premiere version parametree des ascenseurs.
- Generation d'ascenseurs dans le layout.
- Rendu des racks sous forme de colonnes multi-niveaux.
- Rendu des plateaux de niveaux et des puits d'ascenseurs.
- Selection des ascenseurs dans le panneau de detail.
- Ajout des champs niveaux/ascenseurs dans le panneau de parametres.

Pourquoi:

- Faire lire l'entrepot comme une vraie matrice 3D multi-etages, avec zones verticales necessaires au futur pathfinding.

Fichiers impactes:

- `docs/plans/003-multilevel-matrix-elevators.md`
- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `src/types/selection.ts`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build`
- Verification Playwright locale sur `http://127.0.0.1:5173`
- Capture `output/playwright/warehouse-lab-3d-multilevel.png`
- Clic `Play`, verification metriques: commandes traitees, robots actifs, backlog
- Verification console: 0 erreur courante

Problemes connus:

- Les niveaux superieurs sont visibles mais non encore utilises par le moteur de commandes.
- Les ascenseurs ne gerent pas encore reservation, attente ni mouvement vertical.

## 2026-05-27 - Routage vertical et allees d'ascenseurs

Modifications:

- Ajout du plan `docs/plans/004-vertical-routing-elevator-aisles.md`.
- Transformation des ascenseurs ponctuels en allees completes de cellules ascenseur.
- Distribution des emplacements de stockage sur plusieurs niveaux.
- Ajout des etats robot `movingToElevator` et `ridingElevator`.
- Ajout de `visualLevel`, `targetLevel`, `targetElevatorId` et informations de trajet vertical sur les robots.
- Ajout d'un routage vertical MVP: aller a l'ascenseur, monter/descendre, repartir au niveau cible.
- Les cellules d'allee ascenseur sont traitees comme couloirs a capacite elevee pour eviter la congestion artificielle.
- Rendu des allees ascenseur en couloirs verticaux translucides sur toute la longueur.

Pourquoi:

- Rendre visibles les robots qui montent et descendent, et faire correspondre les ascenseurs a des allees permettant de se croiser et devier.

Fichiers impactes:

- `docs/plans/004-vertical-routing-elevator-aisles.md`
- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build`
- Verification Playwright locale sur `http://127.0.0.1:5173`
- Run accelere x10: commandes terminees, backlog revenu a 0, debit 18 commandes/min
- Capture `output/playwright/warehouse-lab-3d-elevator-aisles.png`
- Verification console: 0 erreur courante

Problemes connus:

- Les ascenseurs n'ont pas encore de reservation temporelle stricte ni capacite numerique configurable.
- Plusieurs robots peuvent partager une cellule d'allee ascenseur dans le MVP pour representer un couloir vertical large.

## 2026-05-27 - Allees d'ascenseurs alignees avec les couloirs

Modifications:

- Ajout du plan `docs/plans/005-elevator-aisles-follow-corridors.md`.
- Generation des allees d'ascenseurs depuis les lignes de couloir du layout.
- Orientation des allees dans le sens des couloirs au lieu d'une coupe perpendiculaire.
- Suppression du champ `Ascenseurs` du panneau de parametres.
- Suppression de la propriete d'ascenseurs configurable dans `WarehouseConfig`.
- Mise a jour du rendu 3D et du panneau de detail pour nommer l'orientation comme `sens du couloir`.
- Mise a jour de la memoire projet, du modele de simulation, de l'architecture et du README.

Pourquoi:

- Les ascenseurs doivent se comporter comme des allees de circulation verticales alignees sur les couloirs, et leur nombre doit suivre le layout au lieu d'etre choisi separement.

Fichiers impactes:

- `docs/plans/005-elevator-aisles-follow-corridors.md`
- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `src/components/scene/WarehouseScene.tsx`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`
- `README.md`

Tests lances:

- `npx tsc -b`
- `npm run build` tente en sandbox, bloque par l'acces refuse a `vite.config.ts` avant la compilation Vite.
- Verification visuelle locale sur `http://127.0.0.1:5173`
- Capture `output/playwright/warehouse-lab-3d-elevator-corridors.png`

Problemes connus:

- Les ascenseurs restent modelises comme des allees a capacite elevee dans le MVP, sans reservation temporelle fine par segment.
- Le build complet doit etre relance hors sandbox quand l'autorisation est disponible.

## 2026-05-29 - Research Lab post-MVP

Modifications:

- Ajout d'un moteur de plans d'experiences reproductibles dans `src/experiments/researchLab.ts`.
- Comparaison automatique multi-seeds de variantes stockage/routage.
- Calcul des moyennes, intervalles de confiance 95%, backlog, congestion, energie par commande, utilisation, robustesse et score de rang.
- Ajout d'un onglet Research dans le dashboard avec progression, classement, insight et exports JSON/CSV.
- Extension du store Zustand avec etat et actions de recherche.
- Mise a jour du README et de la roadmap.

Pourquoi:

- Faire evoluer l'application vers un outil scientifique capable de produire des resultats comparatifs concrets, pas seulement une visualisation de simulation.

Fichiers impactes:

- `src/experiments/researchLab.ts`
- `src/store/simulationStore.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/layout/AppShell.tsx`
- `README.md`
- `docs/ROADMAP.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` en sandbox: bloque par l'acces refuse a `vite.config.ts`.
- `npm run build` hors sandbox: OK.
- Serveur Vite local demarre sur `http://127.0.0.1:5173/`, reponse HTTP 200 verifiee.

Problemes connus:

- Verification visuelle in-app browser indisponible dans cet environnement: le runtime navigateur echoue sur le sandbox Windows.
- Warning Vite persistant sur la taille du bundle principal.

## 2026-05-29 - Ligne verticale dediee et visualisation stockage

Modifications:

- Remplacement des multiples allees d'ascenseur par une seule ligne verticale dediee au couloir central.
- Les changements d'etage se routent donc uniquement depuis cette ligne.
- Ajout du mode `Stock off / Types / Demande` dans la TopBar.
- Coloration des niveaux de racks par type SKU A/B/C et intensite selon `demandWeight`.
- Ajout d'une legende de stockage et enrichissement du panneau rack avec types presents et top SKU demandes.

Pourquoi:

- Rendre la grille de deplacement plus contrainte et plus lisible, et permettre d'auditer visuellement si les articles tres demandes sont bien ranges pres des stations.

Fichiers impactes:

- `src/simulation/core/warehouseFactory.ts`
- `src/store/simulationStore.ts`
- `src/components/controls/TopBar.tsx`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `README.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.
- Serveur local `http://127.0.0.1:5173/`: HTTP 200.

Problemes connus:

- Les ascenseurs restent sans reservation temporelle fine; la ligne est unique mais sa capacite interne reste simplifiee.

## 2026-05-29 - Capacity Study et formule robot

Modifications:

- Ajout du parametre `verticalAccessLineCount` dans la configuration d'entrepot.
- Generation d'une ou plusieurs lignes verticales dediees selon ce parametre.
- Ajout du balayage Capacity Study dans le Research Lab: nombre de robots, profils batterie, seuil de recharge, temps de recharge et lignes verticales.
- Ajout d'une formule empirique de dimensionnement:
  `R = ceil((D / q_robot) * S * P_vertical * P_batterie * C_matrice)`.
- Affichage dans le dashboard de la recommandation robot, du debit calibre par robot et du meilleur point stable simule.
- Export CSV enrichi avec les points du Capacity Study.
- Documentation de la methode dans `docs/EXPERIMENTS.md`.

Pourquoi:

- Avancer vers l'objectif de deduire des formules de capacite robot selon la taille de matrice, la configuration verticale, le placement et les contraintes batterie.

Fichiers impactes:

- `src/experiments/researchLab.ts`
- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/dashboard/Dashboard.tsx`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.
- Serveur local `http://127.0.0.1:5173/`: HTTP 200.

Problemes connus:

- La formule est encore exploratoire: elle est calibree sur un balayage local court et doit evoluer vers une vraie regression multi-facteurs.
- Les sous-matrices et chemins inter-matrices ne sont pas encore modelises explicitement.

## 2026-05-29 - Sous-matrices, connecteurs et masse robot

Modifications:

- Ajout des types `SubMatrixZone` et `InterMatrixConnector`.
- Ajout des parametres `subMatrixRows`, `subMatrixColumns` et `interMatrixCorridorWidth`.
- Generation de sous-matrices et corridors inter-matrices dans le layout.
- Reservation des corridors inter-matrices pour eviter que des racks bloquent les chemins entre blocs.
- Rendu 3D des contours de sous-matrices et des connecteurs.
- Ajout des parametres physiques robot: `baseWeightKg`, `batteryWeightKg`, `payloadKg`.
- Extension du Capacity Study pour balayer les topologies de sous-matrices et ajuster `energyPerCell` selon la masse batterie.
- Extension de la formule avec `P_blocs` et `P_poids`.

Pourquoi:

- Permettre l'etude d'une matrice geante composee de sous-matrices connectees, et commencer a relier autonomie, poids batterie et capacite robot.

Fichiers impactes:

- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/scene/WarehouseScene.tsx`
- `src/experiments/researchLab.ts`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

Problemes connus:

- Les connecteurs inter-matrices ont maintenant du trafic et de l'attente cumules, et sont selectionnables dans la scene.

## 2026-05-29 - Metriques connecteurs et regression de capacite

Modifications:

- Ajout des metriques `connectorTraffic` et `connectorWait`.
- Accumulation du trafic et des attentes sur les connecteurs inter-matrices dans le moteur de simulation.
- Ajout d'un KPI dashboard `Connecteurs` sous la forme trafic / attentes.
- Ajout d'une regression log-lineaire dans le Capacity Study.
- Ajout du `R2`, de l'erreur de validation croisee, du nombre de points et des coefficients dans l'UI et les exports.
- Ajout de la selection directe des connecteurs inter-matrices avec detail trafic/attente/taux d'attente.
- Documentation des nouvelles metriques dans `docs/METRICS.md`.

Pourquoi:

- Passer d'une formule heuristique a une formule progressivement calibree par les donnees de simulation, et mesurer les goulets d'etranglement entre sous-matrices.

Fichiers impactes:

- `src/simulation/models/types.ts`
- `src/simulation/metrics/calculateMetrics.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `src/types/selection.ts`
- `docs/METRICS.md`
- `docs/EXPERIMENTS.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

Problemes connus:

- La regression est encore log-lineaire simple avec regularisation; il faudra ajouter intervalles de coefficients et plans d'experiences plus longs.

## 2026-05-29 - Rapport scientifique Research Lab

Modifications:

- Ajout d'un export Markdown `Report` dans l'onglet Research.
- Ajout d'une synthese executive automatiquement generee depuis les resultats du Research Lab.
- Ajout dans le rapport de la formule empirique, de la regression, des coefficients, du `R2`, de la validation croisee et des meilleurs points stables.
- Ajout de recommandations automatiques de prochaines experiences selon les signaux observes: erreur de validation, points instables, pression connecteurs, saturation robot, compromis batterie/poids.
- Documentation de cette sortie dans `README.md`, `docs/EXPERIMENTS.md` et `docs/METRICS.md`.

Pourquoi:

- Transformer les simulations en traces scientifiques lisibles, partageables et actionnables, au lieu de limiter l'outil a des exports bruts JSON/CSV.

Fichiers impactes:

- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

Problemes connus:

- Le rapport ne remplace pas encore un notebook statistique complet; il sert de couche de restitution et d'orientation experimentale.

## 2026-05-29 - Carnet Research Lab multi-runs

Modifications:

- Ajout d'un historique Research Lab persistant dans le navigateur.
- Conservation des derniers DOE termines avec possibilite de rouvrir ou supprimer un run.
- Ajout d'un panneau `Carnet de recherche` avec tendance, plage de robots recommandee, meilleur `R2` et derniere RMSE de validation croisee.
- Ajout d'un export Markdown `Notebook` qui compare les formules et les niveaux de confiance entre runs.
- Documentation du carnet dans `README.md`, `docs/EXPERIMENTS.md` et `docs/METRICS.md`.

Pourquoi:

- Passer d'un resultat de simulation isole a une demarche cumulative, ou chaque experience aide a stabiliser ou contester la formule de capacite robot.

Fichiers impactes:

- `src/experiments/researchLab.ts`
- `src/store/simulationStore.ts`
- `src/components/dashboard/Dashboard.tsx`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

Problemes connus:

- Le carnet reste local au navigateur; un futur stockage fichier/projet ou import/export JSON de carnet serait utile pour partager des campagnes completes.

## 2026-05-29 - Battery Strategy Study

Modifications:

- Ajout de metriques moteur: `chargingTicks`, `chargeSessions`, `averageBatteryLevel`, `minimumBatteryLevel`.
- Ajout d'un Battery Strategy Study dans le Research Lab.
- Balayage automatique de la capacite batterie, seuil de recharge, temps de recharge et nombre de chargeurs.
- Derivation du poids batterie depuis la capacite et impact sur `energyPerCell`.
- Ajout d'un score de compromis integrant debit, service level, energie par commande, temps en charge, sessions de charge, surpoids et autonomie minimale.
- Ajout d'un panneau `Batterie et recharge` dans l'onglet Research.
- Export du Battery Study dans le CSV et les rapports Markdown.
- Documentation dans `README.md`, `docs/EXPERIMENTS.md`, `docs/METRICS.md` et `docs/SIMULATION_MODEL.md`.

Pourquoi:

- Repondre explicitement a la question de recherche: eviter de surdimensionner les batteries tout en gardant une autonomie operationnelle suffisante et un flux stable.

Fichiers impactes:

- `src/simulation/models/types.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/simulation/metrics/calculateMetrics.ts`
- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/store/simulationStore.ts`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

Problemes connus:

- La charge reste lineaire; il faudra modeliser plus tard la courbe de charge, le vieillissement batterie, la puissance de charge et les contraintes thermiques.

## 2026-05-29 - Metriques scientifiques de slotting

Modifications:

- Ajout de metriques de placement: `demandWeightedStorageDistance`, `fastMovingStorageDistance`, `slowMovingStorageDistance`, `slottingEfficiency`.
- Calcul d'un score de slotting en comparant le placement courant au placement ideal et au pire placement selon la demande SKU.
- Ajout du slotting dans les summaries Research Lab et le classement des strategies.
- Ajout de `slotting_inefficiency` dans la regression de capacite.
- Affichage du KPI `Slotting` dans le dashboard et d'une colonne `Slotting` dans le tableau Research.
- Export des metriques de slotting dans CSV/JSON/Markdown.
- Documentation dans `README.md`, `docs/EXPERIMENTS.md`, `docs/METRICS.md` et `docs/SIMULATION_MODEL.md`.

Pourquoi:

- Faire du placement des items une variable mesurable pour les futures formules de capacite robot, au lieu d'une simple option de strategie.

Fichiers impactes:

- `src/simulation/models/types.ts`
- `src/simulation/metrics/calculateMetrics.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

## 2026-05-29 - Vertical Topology Study

Modifications:

- Ajout de metriques verticales: `elevatorTrips`, `elevatorRideTicks`, `elevatorWaitTicks`, `verticalPressure`.
- Accumulation des ticks de trajet vertical et des attentes verticales au niveau robot.
- Ajout de `vertical_pressure` dans la regression de capacite.
- Ajout d'un Vertical Topology Study derive des points du Capacity Study.
- Ajout d'un panneau `Topologie verticale` dans l'onglet Research.
- Ajout du KPI dashboard `Vertical`.
- Export des resultats verticaux en CSV et Markdown.

Pourquoi:

- Mesurer quand les lignes verticales/ascenseurs deviennent le goulet d'etranglement, au lieu d'attribuer toute degradation au nombre de robots.

Fichiers impactes:

- `src/simulation/models/types.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/simulation/metrics/calculateMetrics.ts`
- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/store/simulationStore.ts`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

## 2026-05-29 - Matrix Topology Study

Modifications:

- Ajout des types `MatrixTopologyStudyPoint` et `MatrixTopologyStudyResult`.
- Ajout d'un Matrix Topology Study derive des points du Capacity Study.
- Regroupement par topologie `subMatrixRows x subMatrixColumns`.
- Calcul du nombre de blocs, nombre de connecteurs, points faisables, meilleur nombre de robots stable, debit moyen, service level, trafic connecteur et taux d'attente connecteur.
- Ajout d'un panneau `Topologie blocs` dans l'onglet Research.
- Export de la section `matrix_topology_study` dans le CSV et les rapports Markdown.
- Validation de l'historique Research Lab pour ne conserver que les runs contenant la nouvelle etude.

Pourquoi:

- Mesurer si le decoupage d'une matrice geante en sous-matrices aide la capacite ou cree des passages obliges entre blocs.

Fichiers impactes:

- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/store/simulationStore.ts`
- `README.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.

## 2026-05-29 - Unite operationnelle caisse

Modifications:

- Clarification du modele: un robot transporte une seule caisse a la fois.
- La generation de demande cree des missions caisse a une seule ligne SKU et `quantity = 1`.
- La demande operationnelle devient `ordersPerMinute * averageItemsPerOrder`.
- Le moteur utilise cette demande en caisses/minute pour generer les missions.
- Le Research Lab utilise cette demande cible pour les Capacity Study, Battery Study, regression et formule robot.
- Ajustement des libelles dashboard: `Caisses`, `caisses/min`, `Caisses/commande`.
- Documentation dans `README.md`, `docs/SIMULATION_MODEL.md`, `docs/EXPERIMENTS.md` et `docs/METRICS.md`.

Pourquoi:

- Aligner la simulation avec la contrainte physique explicite: un robot ne transporte pas une commande multi-articles, il execute une mission caisse.

Fichiers impactes:

- `src/simulation/core/demand.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/experiments/researchLab.ts`
- `src/components/dashboard/Dashboard.tsx`
- `src/components/panels/ParameterPanel.tsx`
- `README.md`
- `docs/SIMULATION_MODEL.md`
- `docs/EXPERIMENTS.md`
- `docs/METRICS.md`
- `docs/AI_CHANGELOG.md`

Tests lances:

- `npm run build` hors sandbox: OK.
