# Warehouse Lab 3D

Warehouse Lab 3D est un MVP de simulation web pour explorer un entrepot automatise en 3D. L'application combine React, TypeScript, Vite, Three.js, React Three Fiber, Zustand, Recharts, TailwindCSS et un Web Worker pour separer la simulation du rendu.

## Demarrage

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Ajouts post-MVP

- Research Lab integre : plan d'experiences automatique multi-seeds comparant les strategies de stockage et de routage, avec moyenne, intervalle 95%, score de robustesse, recommandation et export JSON/CSV/rapport Markdown.
- Carnet de recherche persistant : conservation des derniers DOE, comparaison des formules, tendance de validation croisee, plage de robots recommandee et export Markdown global.
- Capacity Study integre : balayage robot/batterie/lignes verticales/sous-matrices et premiere formule empirique de dimensionnement robot.
- Vertical Topology Study : pression verticale, attentes ascenseur, trajets et recommandation du nombre de lignes verticales.
- Matrix Topology Study : comparaison des decoupages en sous-matrices, connecteurs inter-blocs, attente connecteur et meilleur robot stable.
- Battery Strategy Study integre : balayage autonomie, seuil de recharge, vitesse de recharge, nombre de chargeurs, poids batterie et score de compromis.
- Sous-matrices parametrables dans une matrice geante, avec corridors inter-matrices visibles.
- Configuration physique robot: poids de base, poids batterie, charge utile et effet de masse sur l'energie.
- Lignes verticales dediees parametrables pour les changements d'etage: les robots ne peuvent monter/descendre que depuis ces lignes.
- Visualisation du stockage par type de demande et par intensite de demande directement sur les niveaux de racks.
- Metriques de slotting: distance de stockage ponderee par la demande, distance des SKU rapides et score d'efficacite du placement.
- Vraie A* avec heuristique Manhattan et cout pondere trafic (`trafficCount`, `waitCount`) ; selection live dans le panneau Mouvement.
- Heatmap 3D au sol toggleable (Trafic / Attentes) depuis la TopBar.
- Recharge robots reelle : route automatique vers le charger libre quand `battery <= rechargeThreshold`, etat `movingToCharger` puis `charging`.
- Dashboard etendu (distance totale, energie, congestion, urgents en file).
- Export CSV des series temporelles en plus du JSON.
- Historique de runs en memoire avec mini-comparatif KPI dans le panneau de droite (Save run).

## Fonctionnalites MVP

- Scene 3D avec grille, racks, stations, chargeurs et robots.
- Rails, intersections et switches visibles pour preparer le mode rails guides.
- Matrice 3D multi-etages avec allees d'ascenseurs visibles.
- Allees d'ascenseurs alignees avec les couloirs, generees automatiquement depuis le layout.
- Routage vertical MVP avec animation de montee/descente.
- Simulation tick-based dans un Web Worker.
- Robots autonomes avec pathfinding Manhattan simple.
- Generation de missions caisse ponderees par demande SKU: un robot transporte une caisse a la fois.
- Seeds separees pour layout, demande et pannes.
- Strategies de stockage `randomStorage` et `abcStorage`.
- Scenarios predefinis.
- Play, Pause, Reset et vitesses x1/x2/x5/x10.
- Dashboard avec caisses terminees, backlog, distance, utilisation, debit et graphe lisible.
- Selection d'elements 3D.
- Export JSON des resultats.
- Plan d'experiences reproductible pour produire des resultats de recherche comparables au-dela d'un run unique.

## Architecture

La logique de simulation vit dans `src/simulation` et reste independante de React/Three.js. Le worker publie des snapshots serialisables vers `src/store`, puis la scene 3D et le dashboard lisent cet etat visible.

Voir aussi:

- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/METRICS.md`
- `docs/ROADMAP.md`

## Limites Du MVP

- Collisions simplifiees par occupation de cellule.
- Pathfinding pondere trafic implemente, mais pas de Multi-Agent Path Finding complet (CBS/PBS).
- Mode rails guides prepare dans les types et scenarios mais pas simule completement.
- Recharge robots desormais effective ; pannes presentes mais sans intervention manuelle.
- La recharge dispose maintenant de metriques cumulees, mais pas encore de courbes de charge non lineaires ni vieillissement batterie.
- Le routage vertical existe, mais les reservations fines et capacites d'ascenseur restent simplifiees.
- Export CSV des series desormais disponible (Export JSON aussi conserve).
- Le Research Lab ne remplace pas encore une vraie analyse statistique avancee (ANOVA, puissance, tests post-hoc), mais structure deja les comparaisons avec seeds controles, incertitude, regression, carnet multi-runs, recommandations et rapports Markdown.
- La formule de capacite robot est exploratoire: elle doit etre calibree par davantage de plans d'experiences et, a terme, par des donnees terrain.
