# Architecture

## Structure Cible

```text
src/
  app/
    App.tsx
    main.tsx
  components/
    controls/
    dashboard/
    layout/
    panels/
    scene/
  simulation/
    algorithms/
    core/
    metrics/
    models/
    scenarios/
    worker/
  store/
  types/
  utils/
  data/
```

## Responsabilites

- `src/simulation/core`: moteur tick-based, affectation des commandes, deplacement des robots, resolution simplifiee des collisions.
- `src/simulation/models`: types metier serialisables et independants de l'UI.
- `src/simulation/algorithms`: pathfinding, affectation de taches, generation aleatoire et strategies de stockage.
- `src/simulation/metrics`: calculs et series temporelles.
- `src/simulation/scenarios`: presets d'experiences et configurations.
- `src/simulation/worker`: contrat de messages et instance Web Worker.
- `src/store`: etat UI, snapshot de simulation visible, selection et controles.
- `src/components/scene`: rendu 3D React Three Fiber.
- `src/components/dashboard`: graphiques et indicateurs Recharts.
- `src/components/panels`: parametres et detail de selection.

## Rails

Le reseau de rails est genere dans `warehouseFactory` et stocke dans `Warehouse.rails` et `Warehouse.switches`. Il est visible dans tous les scenarios pour preparer la comparaison avec le mode rails guides, mais la simulation autonome ne contraint pas encore les robots a suivre ces rails.

## Niveaux Et Ascenseurs

Le layout contient maintenant `Warehouse.levels` et `Warehouse.elevatorZones`. Les niveaux sont rendus comme des plateaux transparents empiles, et les ascenseurs comme des allees horizontales placees dans le sens des couloirs. Le nombre d'allees est derive des lignes de couloir du layout, pas d'un parametre utilisateur separe.

Le moteur route les robots vers une cellule d'allee ascenseur, applique un trajet vertical, puis reprend le pathfinding horizontal au niveau cible. Le champ `level` reste le niveau logique, tandis que `visualLevel` permet une animation continue de la montee ou descente.

## Flux De Donnees

1. L'utilisateur choisit un scenario ou modifie une configuration.
2. Zustand envoie une commande au Web Worker.
3. Le worker maintient le moteur de simulation et avance par ticks.
4. Le worker publie des snapshots serialisables.
5. Zustand stocke le dernier snapshot visible.
6. La scene 3D et le dashboard lisent ce snapshot sans muter la simulation.

## Web Worker

Le worker isole les calculs de simulation du thread de rendu. Il accepte des messages `init`, `play`, `pause`, `reset`, `setSpeed`, `loadScenario`, `updateConfig` et repond avec `snapshot` ou `error`.

Le worker avance la simulation toutes les 250 ms en appliquant `speed` ticks par cycle. Un tick represente une seconde simulee dans le MVP.

## Zustand

Le store centralise:

- simulation visible
- etat play/pause
- vitesse
- scenario actif
- configuration editable
- element selectionne dans la scene
- actions d'export

Le worker n'est pas stocke dans Zustand: il reste une variable de module dans `src/store/simulationStore.ts`, ce qui evite de mettre une reference non serialisable dans l'etat UI.

## Separation Simulation / Visualisation

La simulation manipule des coordonnees de grille et des objets serialisables. La 3D convertit uniquement ces coordonnees en positions Three.js et applique des couleurs selon l'etat.

Les robots sont interpoles dans le composant de scene via `useFrame`; le worker continue de publier des snapshots discrets, mais le rendu lisse les transitions entre cellules.
