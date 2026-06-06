# Plan 001 - MVP Foundation

## Objectif

Creer un MVP fonctionnel de Warehouse Lab 3D: simulation deterministe d'un entrepot autonome, scene 3D, dashboard, controles et export JSON.

## Perimetre

Inclus:

- Scaffolding Vite React TypeScript Tailwind.
- Types metier principaux.
- Moteur tick-based dans Web Worker.
- Seeds deterministes.
- Catalogue SKU simple.
- Generation de demande ponderee.
- Strategies `randomStorage` et `abcStorage`.
- Pathfinding Manhattan simple.
- Scene 3D avec grille, racks, stations, robots et chargeurs.
- Play, Pause, Reset, vitesses x1/x2/x5/x10.
- Dashboard Recharts avec metriques MVP.
- Panneau de parametres.
- Scenarios predefinis.
- Export JSON.
- README.

Exclus du MVP:

- Vrai Multi-Agent Path Finding.
- Mode rails guides complet.
- Pannes et recharge realistes.
- Export CSV complet.
- Persistence avancee.

## Fichiers A Creer Ou Modifier

- `package.json`
- `index.html`
- `vite.config.ts`
- `tsconfig*.json`
- `tailwind.config.js`
- `postcss.config.js`
- `src/app/*`
- `src/components/**/*`
- `src/simulation/**/*`
- `src/store/*`
- `src/types/*`
- `src/utils/*`
- `src/data/*`
- `README.md`
- `docs/*`

## Etapes Prevues

1. Creer le squelette Vite et la configuration TypeScript/Tailwind.
2. Definir les types de simulation.
3. Implementer RNG deterministe et helpers de tirage.
4. Creer scenarios, catalogue SKU et strategies de stockage.
5. Implementer moteur tick-based.
6. Brancher le Web Worker et le store Zustand.
7. Construire UI, controles, scene 3D et dashboard.
8. Ajouter export JSON.
9. Installer les dependances.
10. Lancer `npm run build` et corriger.
11. Mettre a jour la documentation memoire.

## Risques Techniques

- Compatibilite versions React Three Fiber / Three.js.
- Serialization worker si les types deviennent trop riches.
- Congestion robot pouvant bloquer certaines commandes.
- Performance si snapshots trop frequents.

## Criteres De Validation

- `npm install` fonctionne.
- `npm run dev` demarre l'application.
- `npm run build` fonctionne sans erreur TypeScript.
- La scene 3D affiche grille, racks, stations et robots.
- Les robots traitent des commandes.
- Les metriques evoluent.
- Play, Pause, Reset et vitesses fonctionnent.
- Export JSON disponible.
- Documentation mise a jour.

## Commandes De Test Et Build

```bash
npm install
npm run build
```
