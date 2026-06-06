# Plan 002 - 3D Polish, Rails And Dashboard

## Objectif

Ameliorer la perception visuelle du MVP: rendu 3D plus lisible et agreable, rails visibles, animation robot plus fluide et dashboard inferieur plus exploitable.

## Perimetre

Inclus:

- Ajouter une topologie de rails visuelle avec intersections et switches.
- Afficher les rails dans la scene 3D, avec un rendu plus marque en mode `rails-guided`.
- Interpoler la position des robots entre deux snapshots worker pour eviter les deplacements saccades.
- Ameliorer le rendu des racks, stations, chargeurs et robots.
- Revoir le dashboard inferieur pour rendre le graphe plus grand et mieux contraste.
- Mettre a jour documentation et changelog.

Exclus:

- Simulation complete des rails guides.
- Reservation d'intersections reelle.
- Multi-Agent Path Finding complet.

## Fichiers A Creer Ou Modifier

- `src/simulation/core/warehouseFactory.ts`
- `src/simulation/models/types.ts`
- `src/components/scene/WarehouseScene.tsx`
- `src/components/dashboard/Dashboard.tsx`
- `src/app/styles.css`
- `docs/PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/SIMULATION_MODEL.md`
- `docs/AI_CHANGELOG.md`

## Etapes Prevues

1. Generer une grille de rails visuelle avec intersections.
2. Enrichir les cellules rails sans bloquer la simulation autonome.
3. Afficher rails, intersections et aiguillages dans la scene.
4. Ajouter interpolation R3F des robots via `useFrame`.
5. Ajouter details visuels: socles, accents, ombres, labels legers si utile.
6. Agrandir et contraster le dashboard.
7. Lancer `npm run build`.
8. Verifier dans le navigateur local.

## Risques Techniques

- Les rails ne doivent pas bloquer les robots autonomes.
- L'interpolation ne doit pas casser la selection ni desynchroniser le snapshot.
- Le dashboard doit rester lisible dans la hauteur actuelle.

## Criteres De Validation

- La scene affiche clairement les rails/intersections.
- Les robots glissent visuellement entre les cellules.
- Le graph inferieur est plus grand, lisible et contraste.
- `npm run build` passe.
