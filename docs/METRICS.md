# Metriques

## Caisses Termineees

Definition: nombre total de missions caisse livrees aux stations.

Formule: compteur incremente a chaque livraison terminee.

Utilite: mesurer le debit global.

Affichage: compteur principal et courbe de debit.

## Temps Moyen De Traitement

Definition: temps moyen entre creation et livraison d'une commande.

Formule: somme des durees de traitement / commandes terminees.

Utilite: evaluer la performance percue.

Affichage: KPI dashboard.

## Distance Totale Parcourue

Definition: somme des deplacements de tous les robots en cellules.

Formule: increment de 1 par cellule parcourue.

Utilite: approximer l'effort logistique et l'energie.

Affichage: KPI dashboard.

## Distance Moyenne Par Commande

Definition: distance totale divisee par le nombre de commandes terminees.

Formule: `totalDistance / completedOrders`.

Utilite: comparer les strategies de stockage.

Affichage: KPI dashboard.

## Utilisation Moyenne Des Robots

Definition: part du temps robot passee sur une tache active.

Formule: temps actif total / temps disponible total.

Utilite: detecter sous-utilisation ou saturation.

Affichage: KPI dashboard et courbe.

## Robots Actifs

Definition: nombre de robots avec une tache non terminee.

Utilite: comprendre la charge instantanee.

Affichage: KPI dashboard.

## Caisses En Attente

Definition: missions caisse non affectees et non terminees.

Utilite: mesurer le backlog.

Affichage: KPI dashboard et courbe.

## Congestion

Definition: nombre d'attentes causees par cellule occupee ou chemin bloque.

Utilite: identifier les limites de densite robot.

Affichage: courbe et future heatmap.

## Connecteurs Inter-Matrices

Definition: trafic et attentes cumules sur les corridors reliant les sous-matrices.

Formule: chaque passage sur une cellule de connecteur incremente `connectorTraffic`; chaque attente sur une cellule de connecteur incremente `connectorWait`.

Utilite: mesurer si le decoupage en sous-matrices cree un goulet d'etranglement entre blocs.

Affichage: KPI dashboard sous la forme `trafic / attentes`, selection directe d'un connecteur dans la scene, et variables exportees dans le Capacity Study.

## Topologie Blocs

Definition: synthese des points de capacite par decoupage `subMatrixRows x subMatrixColumns`.

Metriques derivees:

- `blockCount`: nombre de sous-matrices.
- `connectorCount`: nombre de chemins inter-matrices.
- `averageConnectorWaitRate`: `connectorWait / max(1, connectorTraffic)`.
- `bestRobotCount`: plus petit nombre de robots stable observe pour cette topologie.

Utilite: evaluer si une matrice geante decoupee en blocs reduit la complexite ou cree un goulet inter-blocs.

Affichage: panneau `Topologie blocs`, export CSV `matrix_topology_study`, rapports Markdown.

## Regression De Capacite

Definition: modele log-lineaire calibre sur les points du Capacity Study.

Formule:

```text
ln(R*) = b0 + b1 ln(D) + b2 ln(cells) + b3 levels
       + b4 ln(1/verticalLines) + b5 ln(blocks)
       + b6 ln(connectors) + b7 ln(weight)
       + b8 ln(1/autonomy) + b9 connectorWaitRate
       + b10 slottingInefficiency + b11 verticalPressure
```

Utilite: passer d'une formule heuristique a des coefficients estimes depuis les simulations.

Affichage: `R2`, erreur de validation croisee, nombre de points et coefficients dans l'export CSV/JSON du Research Lab.

## Qualite De Slotting

Definitions:

- `demandWeightedStorageDistance`: distance moyenne des emplacements vers une station, ponderee par `demandWeight`.
- `fastMovingStorageDistance`: distance moyenne des SKU rapides.
- `slowMovingStorageDistance`: distance moyenne des SKU lents.
- `slottingEfficiency`: score entre 0 et 1 comparant le placement courant a un placement ideal, ou les SKU les plus demandes prennent les distances les plus courtes.

Utilite: transformer le placement des items en variable scientifique exploitable par la regression.

Affichage: KPI `Slotting`, tableau Research, exports CSV/JSON et rapports Markdown.

## Pression Verticale

Definitions:

- `elevatorTrips`: nombre de trajets verticaux termines.
- `elevatorRideTicks`: ticks cumules passes en trajet vertical.
- `elevatorWaitTicks`: ticks cumules d'attente lies aux acces verticaux.
- `verticalPressure`: `(elevatorWaitTicks + elevatorRideTicks) / (ticksSimules * nombreDeLignesVerticales)`.

Utilite: detecter si le nombre ou la disposition des lignes verticales limite le debit avant meme que le nombre de robots soit le vrai probleme.

Affichage: KPI `Vertical`, panneau `Topologie verticale`, exports CSV/JSON et rapports Markdown.

## Rapport De Recherche

Definition: synthese Markdown generee depuis un resultat complet du Research Lab.

Contenu: formule empirique, regression, coefficients, meilleurs points de capacite, comparaison des variantes, recommandations de prochaines experiences et limites connues.

Utilite: transformer un run de simulation en resultat scientifique partageable, sans perdre les conditions experimentales ni les avertissements de validite.

Affichage: bouton `Report` dans l'onglet Research.

## Carnet De Recherche

Definition: historique persistant des derniers resultats Research Lab.

Formule de tendance: comparaison de la RMSE de validation croisee entre les deux derniers runs avec une tolerance de `max(0.025, RMSE precedente * 0.06)`.

Utilite: suivre si les formules se stabilisent quand on explore de nouvelles tailles de matrice, lignes verticales, batteries et sous-matrices.

Affichage: panneau `Carnet de recherche` dans l'onglet Research et export `Notebook`.

## Tests Statistiques Non-Parametriques

Definitions (onglet `Tests stats` du Lab, implementes dans `labStats.ts`):

- `kruskalWallis(groups)`: test de Kruskal-Wallis (ANOVA non-parametrique sur les rangs) avec correction des ex-aequo. Retourne `H` (statistique, ~ chi2 a `k-1` df), `pValue` (via gamma incomplete regularisee), `epsilonSquared` (taille d'effet `H/(N-1)`, dans [0,1]) et `power` (puissance approchee via chi2 non-centrale a alpha=0.05).
- `cliffsDelta(a, b)`: taille d'effet pairwise non-parametrique dans [-1, 1].
- Interpretation des magnitudes: negligeable / faible / moyen / fort.

Utilite: tester si un facteur du DOE (ex. strategie de stockage, pathfinding) modifie significativement une metrique, sans hypothese de normalite, et quantifier l'ampleur + la fiabilite de l'effet.

Affichage: onglet `Tests stats` — selection facteur de groupement + metrique, cartes H/p/epsilon2/puissance, main-effects plot (moyenne ± IC 95%), table par niveau (n, mediane, moyenne), post-hoc.

## Post-hoc, Intervalles Et Interactions

Definitions (V0.3, `labStats.ts`) :

- `bootstrapMeanCI(values)`: intervalle de confiance percentile de la moyenne (95% par defaut) par re-echantillonnage seede — alimente le main-effects plot.
- `dunnTest(groups, labels)`: test post-hoc de Dunn apres Kruskal-Wallis. z sur l'ecart de rang moyen (variance corrigee des ex-aequo), p bilaterale (loi normale), correction de **Holm** step-down pour les k(k-1)/2 comparaisons. Indique quelles paires de niveaux different vraiment.
- **Interaction** (onglet `Interactions`): moyenne de la metrique par cellule (niveau A × niveau B), tracee en lignes. Indice de non-parallelisme = etendue des effets de A selon B, normalisee par l'etendue globale → libelle parallele / modere / divergent.

Utilite: passer de « un facteur a un effet » a « quels niveaux different » et « les facteurs interagissent-ils ».

Affichage: tables Dunn + Cliff's delta dans `Tests stats`, interaction plot dans `Interactions`.

## Optimisation Multi-Objectifs

Definitions (onglet `Optimisation`):

- Agregation des seeds par combinaison de facteurs (moyenne de chaque objectif).
- Normalisation min-max de chaque objectif (sens max/min), puis **score de desirabilite** = somme ponderee des objectifs normalises / somme des poids.
- Configuration recommandee = combinaison au meilleur score.
- **Genou de Pareto**: sur deux objectifs, point du front de Pareto (via `paretoFront`) le plus proche du coin ideal en espace normalise.

Utilite: arbitrer les compromis debit / energie / congestion / cout et proposer un reglage.

Affichage: cartes config recommandee, classement des configurations, nuage Pareto avec front et genou.

## Comparaison Multi-Run

Definition: tableau comparatif des runs sauvegardes (`runHistory`, alimente par « Save run »).

Contenu: runs en colonnes, KPIs en lignes (debit, backlog, temps moyen, distance/commande, utilisation, congestion, energie, slotting, trajets verticaux) plus un resume de configuration (robots, stockage, pathfinding, reservation, demande). Une baseline selectionnable affiche les autres colonnes en delta pourcent, avec surbrillance du meilleur par ligne selon le sens (min/max).

Utilite: confronter rapidement plusieurs configurations testees en simulation live.

Affichage: onglet `Comparaison` du Lab.

## Recharge Et Batterie

Definitions:

- `chargingTicks`: ticks cumules passes par les robots en etat `charging`.
- `chargeSessions`: nombre de demarrages de session de recharge.
- `averageBatteryLevel`: niveau moyen de batterie instantane.
- `minimumBatteryLevel`: plus bas niveau de batterie instantane observe sur la flotte.
- `chargingShare`: `chargingTicks / (robotCount * ticksSimules)`.

Utilite: quantifier le compromis entre autonomie embarquee, poids batterie, chargeurs disponibles et interruption operationnelle.

Affichage: panneau `Batterie et recharge` dans l'onglet Research, export CSV et rapports Markdown.
