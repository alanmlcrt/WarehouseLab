# Plan 003 - Multi-Level Matrix And Elevators

## Objectif

Transformer la scene pour montrer un entrepot sous forme de matrice 3D multi-etages, avec niveaux de stockage empiles et zones d'ascenseurs clairement visibles.

## Perimetre

Inclus:

- Ajouter les notions de niveaux de stockage et zones d'ascenseurs dans le modele.
- Ajouter la configuration multi-etages et une premiere version des zones d'ascenseurs.
- Generer des ascenseurs dans le layout.
- Afficher les racks comme colonnes multi-niveaux.
- Afficher des plateformes/plateaux de niveau dans la scene 3D.
- Afficher les ascenseurs comme puits verticaux reliant les niveaux.
- Documenter la limite MVP: la simulation reste principalement horizontale au niveau 0, mais le modele prepare les mouvements verticaux.

Exclus:

- Pathfinding 3D complet.
- Reservation d'ascenseur.
- Temps d'attente ascenseur et files verticales.

## Fichiers A Modifier

- `src/simulation/models/types.ts`
- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/scenarios/presets.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/panels/ParameterPanel.tsx`
- `src/components/panels/SelectionPanel.tsx`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

## Etapes Prevues

1. Etendre les types avec `WarehouseLevel` et `ElevatorZone`.
2. Generer des plateformes de niveaux et ascenseurs.
3. Marquer les cellules ascenseurs comme traversables.
4. Ajouter les parametres UI niveaux/ascenseurs.
5. Revoir la scene pour montrer la matrice 3D empilee.
6. Ajouter selection et detail ascenseur.
7. Lancer `npm run build`.
8. Verifier visuellement dans le navigateur.

## Risques Techniques

- Ne pas rendre la scene illisible avec trop de geometrie.
- Ne pas casser la simulation 2D existante.
- Garder les ascenseurs visibles meme lorsque le mode rails est actif.

## Criteres De Validation

- Les niveaux sont visibles comme une matrice verticale.
- Les racks affichent plusieurs etages.
- Les ascenseurs sont identifiables et selectionnables.
- Le build TypeScript passe.
