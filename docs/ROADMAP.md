# Roadmap

## MVP

- Scene 3D avec grille, racks, stations, chargeurs et robots.
- Simulation tick-based dans un Web Worker.
- Robots autonomes avec pathfinding Manhattan simple.
- Commandes generees selon une demande ponderee.
- Strategies `randomStorage` et `abcStorage`.
- Play, Pause, Reset, vitesses x1/x2/x5/x10.
- Dashboard Recharts avec metriques de base.
- Export JSON.
- Scenarios predefinis.

## Version 0.1 (livree)

- [x] Selection detaillee robot/station/rack/cellule.
- [x] Heatmap congestion et acces racks (modes Trafic/Attentes + legende).
- [x] Export CSV.
- [x] Comparaison de runs (tableau comparatif multi-run, onglet Lab).
- [x] Research Lab DOE: comparaison multi-seeds des strategies de stockage/routage, intervalles, score de robustesse, export scientifique.

## Version 0.2 (livree)

- [x] A* complet (heuristique Manhattan + cout pondere trafic/attente).
- [x] Reservation temporelle simplifiee (couche espace-temps cooperative par priorite, anti-swap).
- [x] Balanced ABC storage (+ familyStorage, dynamicSlotting).
- [x] Pannes robots avec MTTR stochastique (exponentiel) et recharge proportionnelle.
- [x] Protocoles experimentaux parametrables: duree, nombre de seeds, facteurs, scenario baseline.
- [x] Tests statistiques: Kruskal-Wallis (ANOVA non-parametrique), taille d'effet (epsilon2, Cliff's delta) et puissance approchee.

## Version 0.3 (livree) — boite a outils recherche

- [x] Effets de facteurs : main-effects plot (moyenne ± IC 95% bootstrap par niveau).
- [x] Post-hoc de Dunn (correction de Holm) apres Kruskal-Wallis + Cliff's delta par paire.
- [x] Analyse d'interactions a deux facteurs (interaction plot + indice de non-parallelisme).
- [x] Reproductibilite : campagnes nommees (save/load), export JSON complet, CSV du nuage de points, rapport Markdown.
- [x] Optimisation multi-objectifs : score de desirabilite pondere, configuration recommandee, genou de Pareto.

## Version 0.4 (planifie)

- Mode rails guides jouable.
- Intersections, aiguillages et reservation d'intersection.
- Reservation fine d'ascenseur, capacite par allee, files verticales realistes.
- Tests unitaires moteur / RNG / strategies.

## Idees Futures

- Dynamic slotting.
- Multi-Agent Path Finding simplifie.
- Persistence IndexedDB.
- Import/export de scenarios.
- Vue replay.
- Optimisation automatique: recherche Pareto debit/energie/congestion, recommandations de flotte et layout.
- Calibration sur donnees terrain: import WMS, distributions d'inter-arrivees, temps de picking, validation croisee.
