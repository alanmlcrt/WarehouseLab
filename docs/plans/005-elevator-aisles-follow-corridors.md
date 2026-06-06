# Plan 005 - Elevator Aisles Follow Corridors

## Objectif

Corriger l'orientation des allees d'ascenseurs pour qu'elles suivent les couloirs de circulation au lieu de les couper perpendiculairement. Le nombre d'allees d'ascenseurs doit etre derive du nombre de couloirs, sans parametre utilisateur separe.

## Perimetre

Inclus:

- Deriver les couloirs depuis le layout de racks.
- Generer une allee d'ascenseurs horizontale par couloir.
- Supprimer le champ `Ascenseurs` du panneau de parametres.
- Mettre a jour le rendu pour afficher les allees dans le sens du couloir.
- Mettre a jour la documentation projet.

Exclus:

- Refonte complete du layout.
- Capacite fine par segment d'allee.

## Fichiers A Modifier

- `src/simulation/core/warehouseFactory.ts`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `docs/PROJECT_MEMORY.md`
- `docs/SIMULATION_MODEL.md`
- `docs/ARCHITECTURE.md`
- `docs/AI_CHANGELOG.md`

## Criteres De Validation

- Les allees d'ascenseurs sont dans le sens des couloirs.
- Le champ `Ascenseurs` n'est plus visible dans les parametres.
- Le nombre d'allees correspond aux couloirs generes par le layout.
- `npm run build` passe.

## Etat

- Implementation terminee.
- Verification visuelle realisee sur `http://127.0.0.1:5173`.
- Verification TypeScript valide via `npx tsc -b`.
- `npm run build` reste a relancer hors sandbox: l'execution sandbox echoue au chargement de `vite.config.ts` avec `Access is denied`, avant la compilation applicative.
