# Warehouse Lab 3D - Project Memory

## Objectif

Warehouse Lab 3D est un bac a sable web pour simuler un entrepot automatise en 3D. Le projet vise a comparer des architectures et strategies de pilotage: robots autonomes, rails guides, strategies de stockage, pathfinding, affectation de taches, demande variable, congestion et pannes.

## Vision

Le projet doit evoluer vers un mini jumeau numerique pedagogique: l'utilisateur ajuste des parametres, lance des simulations deterministes, observe les robots en temps reel, clique sur des elements de l'entrepot et analyse les performances dans un dashboard.

## Stack

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Drei
- Zustand
- Recharts
- TailwindCSS
- Web Worker pour la simulation
- Export local JSON

## Etat Actuel

MVP fonctionnel cree et valide par build. Le serveur Vite local a ete demarre sur `http://127.0.0.1:5173` pour verification visuelle.

## Deja Implemente

- Documentation memoire creee dans `docs/`.
- Plan MVP cree dans `docs/plans/001-mvp-foundation.md`.
- Application Vite React TypeScript Tailwind.
- Modeles TypeScript principaux pour entrepot, robots, commandes, SKU, rails, switches, config, seeds, metriques et resultats d'experience.
- Moteur tick-based deterministe dans un Web Worker.
- RNG seede avec `layoutSeed`, `demandSeed` et `failureSeed`.
- Catalogue SKU simple avec categories fast/medium/slow moving.
- Generation de demande ponderee selon `uniform`, `abc`, `pareto` et `custom`.
- Strategies de stockage `randomStorage` et `abcStorage`; autres strategies preparees comme fallbacks architecturaux.
- Pathfinding Manhattan/BFS simple avec contournement des racks et occupation de cellules.
- Affectation des commandes au robot disponible le plus proche.
- Scene 3D React Three Fiber avec grille, racks, stations, chargeurs, robots, couleurs d'etat et chemin du robot selectionne.
- Rendu 3D ameliore avec rails visibles, intersections/switches, chargeurs plus lisibles, ombres de contact et robots interpoles.
- Matrice 3D multi-etages avec racks empiles, plateaux de niveaux et allees d'ascenseurs visibles.
- Allees d'ascenseurs completes, alignees dans le sens des couloirs.
- Trame verticale verrouillee: 2 rangees de stockage puis 1 couloir ascenseur. Le nombre d'allees d'ascenseurs est derive automatiquement de la largeur, sans parametre utilisateur separe.
- Routage vertical MVP: les robots vont vers une allee ascenseur, montent ou descendent, puis continuent horizontalement au bon niveau.
- Animation verticale via `visualLevel` pour montrer la montee et la descente.
- Selection de robots, racks, stations, chargeurs et cellules.
- Placement manuel des stations sur un plan 2D dans les parametres; les cellules choisies deviennent les points de depot.
- Onglet Lab `Plan 2D`: configuration visuelle de l'entrepot de base (dimensions, etages, passages transverses, densite, stations, chargeurs) avec rappel de la trame 2/1 et bouton `Appliquer cet entrepot`. Le DOE passe alors `warehouseSize=custom` pour conserver le plan dessine.
- Spawn initial des robots aleatoire et reproductible dans les cellules traversables de l'entrepot via `robotSpawnSeed`.
- Selection des ascenseurs avec detail de position, niveaux desservis, file et trajets.
- Dashboard Recharts plus lisible avec cartes compactes, graphe agrandi et contraste renforce.
- Panneau de parametres pour entrepot, robots, demande, stockage et seeds.
- Play, Pause, Reset et vitesses x1/x2/x5/x10.
- Export JSON d'un run.
- Scenarios predefinis.
- README et favicon.
- Pathfinding A* / Dijkstra ponderes (trafic + attente) en plus de Manhattan.
- Reservation temporelle simplifiee: couche espace-temps cooperative par priorite avec anti-swap (arete), activee par `temporalReservation` ou la strategie `reservation`.
- Sous `reservation + reactive`, les robots recalculent maintenant leur chemin avant la passe de reservation pour eviter les attentes excessives sur des chemins devenus obsoletes.
- Strategies de stockage completes: randomStorage, abcStorage, balancedABCStorage, familyStorage, dynamicSlotting.
- Heatmap de congestion (modes Trafic / Attentes) avec legende dans la scene 3D.
- Export CSV des series temporelles.
- DOE parametrable (seeds, duree, warm-up, plan factoriel), robustesse CV, loi d'echelle R* + bootstrap IC.
- Pannes avec MTTR stochastique (exponentiel via failureRng), recharge proportionnelle au deficit.
- Tests statistiques non-parametriques: Kruskal-Wallis, taille d'effet (epsilon2, Cliff's delta), puissance approchee (onglet `Tests stats`).
- Tableau comparatif multi-run avec delta vs baseline (onglet `Comparaison`).
- V0.3 boite a outils recherche:
  - Effets de facteurs (main-effects plot moyenne ± IC 95% bootstrap) + post-hoc de Dunn (Holm) dans `Tests stats`.
  - Analyse d'interactions a deux facteurs (`Interactions`).
  - Formule robots R*: courbe debit vs nombre de robots par disposition, seuil de saturation et loi empirique `R* = f(demande, surface, niveaux, stations, chargeurs, passages)`.
  - Plan chaud: recap physique d'un run Lab avec heatmap de trafic/attente sur le plan reel de l'entrepot.
  - Optimisation multi-objectifs ponderee + genou de Pareto (`Optimisation`).
  - Campagnes nommees persistantes + export JSON/CSV/Markdown + import (`Campagnes`).

## Reste A Faire

- Completer le mode rails guides avec intersections et aiguillages.
- Brancher la simulation de deplacement sur rails au reseau deja visible.
- Ajouter reservation fine d'ascenseur, capacite par allee et files d'attente verticales realistes.
- Etendre la realisme batterie: degradation, courant de pointe, temperature.
- Ajouter tests unitaires pour le moteur, RNG et strategies.

## Conventions Importantes

- La simulation ne doit pas dependre de React ni de Three.js.
- L'UI consomme des snapshots serialisables produits par le worker.
- Toute generation aleatoire doit passer par les seeds et les utilitaires deterministes.
- Les ascenseurs suivent les couloirs generes par le layout; leur nombre n'est pas un parametre configurable.
- Les composants React doivent rester fins; la logique metier vit dans `src/simulation`.
- Les documents de `docs/` doivent etre mis a jour apres chaque chantier structurant.

## Limites Connues Du MVP

- Collisions simplifiees par occupation de cellule au tick courant.
- Pathfinding Manhattan simple, avec A* prepare pour la suite.
- Mode rails guides seulement modelise et represente comme placeholder.
- Routage vertical present, mais reservation et capacite ascenseur restent simplifiees.
- Pas de backend ni persistance avancee.
- Export CSV prepare conceptuellement mais JSON implemente en premier.
- Le bundle principal depasse 500 kB minifie, principalement a cause de Three.js/Recharts; le build reste valide.
