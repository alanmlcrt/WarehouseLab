# Plan 004 - Vertical Routing And Elevator Aisles

## Objectif

Faire vivre la matrice 3D: les robots doivent monter et descendre visuellement, et les ascenseurs doivent devenir des allees completes permettant aux robots de se croiser et de devier plus facilement.

## Perimetre

Inclus:

- Transformer les ascenseurs ponctuels en allees verticales de cellules ascenseur.
- Repartir les emplacements de stockage sur plusieurs niveaux.
- Choisir une cellule d'ascenseur proche pour rejoindre le niveau cible.
- Ajouter les etats de robot pour aller a l'ascenseur et voyager verticalement.
- Animer la montee/descente via le champ `level` du robot.
- Afficher les allees d'ascenseur comme des couloirs verticaux translucides.

Exclus:

- Reservation temporelle complete d'ascenseur.
- Capacite fine par ascenseur.
- Pathfinding 3D complet avec couts differencies.

## Fichiers A Modifier

- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/core/SimulationEngine.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `docs/PROJECT_MEMORY.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

## Criteres De Validation

- Les ascenseurs couvrent toute une allee.
- Certains robots montent vers les niveaux superieurs.
- Les metriques continuent d'evoluer.
- `npm run build` passe.
