# Modele De Simulation

## Tick-Based

La simulation avance par ticks discrets. Chaque tick:

1. Genere de nouvelles commandes selon la demande.
2. Affecte les commandes en attente aux robots disponibles.
3. Met a jour les chemins des robots.
4. Deplace les robots d'une cellule si possible.
5. Detecte les arrivees aux racks et stations.
6. Termine les commandes livrees.
7. Met a jour les metriques et series temporelles.

## Modeles De Donnees

- `Warehouse`: grille, cellules, racks, stations, chargeurs, rails.
- `Robot`: position, etat, batterie, tache, chemin, statistiques.
- `Order`: lignes d'articles, priorite, timestamps.
- `Task`: etapes pick et deliver.
- `Rack` et `StorageLocation`: emplacements et SKU stockes.
- `SimulationConfig`: parametres, seeds et strategies.
- `SimulationState`: etat courant serialisable.
- `SimulationMetrics`: agregats et series temporelles.

## Robots

Les robots du MVP transportent une commande a la fois. Ils passent par les etats `idle`, `movingToPick`, `picking`, `movingToDropoff`, `droppingOff`, `charging`, `waiting`, `failed`.

## Commandes Et Caisses

L'unite operationnelle simulee est la caisse: un robot transporte une seule caisse a la fois.

`ordersPerMinute` represente la demande client, et `averageItemsPerOrder` represente le nombre moyen de caisses par commande client. La demande cible utilisee par le moteur et les formules est donc:

```text
caisses/min = ordersPerMinute * averageItemsPerOrder
```

Chaque mission caisse contient une seule ligne SKU avec `quantity = 1`. Les SKU sont choisis par tirage pondere selon le modele de demande.

## Racks Et Stockage

`randomStorage` place les SKU aleatoirement. `abcStorage` place les SKU les plus demandes pres des stations.

La simulation calcule aussi une qualite de slotting. Elle compare la distance ponderee par la demande au meilleur placement theorique disponible dans les emplacements generes. Le score `slottingEfficiency` vaut 1 quand les SKU les plus demandes occupent les distances les plus courtes, et tend vers 0 quand le placement se rapproche du pire cas inverse.

La scene 3D peut afficher le stockage par type de demande:

- A / `fast-moving`: articles tres demandes.
- B / `medium-moving`: demande intermediaire.
- C / `slow-moving`: demande faible.

Le mode `Types` colore les niveaux de rack par famille SKU. Le mode `Demande` conserve la famille visuelle mais module l'intensite selon `demandWeight`.

## Stations

Les stations de picking servent de destinations de livraison. Le MVP choisit la station la plus proche de la position de pick.

## Rails Et Intersections

Le modele genere maintenant un reseau de rails horizontal/vertical avec intersections et switches. Dans le MVP, ces rails sont surtout visuels et servent de preparation au mode rails guides complet. Ils ne bloquent pas les robots autonomes et ne remplacent pas encore le pathfinding grille.

## Matrice Multi-Etages

L'entrepot possede `levelCount` niveaux. Les racks sont representes comme des colonnes de casiers empiles, et les emplacements de stockage contiennent un champ `level`.

Les emplacements de stockage sont distribues sur les niveaux. Une commande peut donc cibler un article situe en hauteur, ce qui declenche le routage vers une allee d'ascenseur.

## Sous-Matrices Et Connecteurs

La matrice peut etre decoupee en sous-matrices via `subMatrixRows` et `subMatrixColumns`. Le layout reserve alors des corridors inter-matrices, visibles dans la scene, pour representer les chemins entre blocs d'une matrice geante.

Chaque sous-matrice conserve son nombre de racks, et les connecteurs inter-matrices sont exportes dans `Warehouse.interMatrixConnectors`. Ces variables alimentent le Capacity Study via une penalite `P_blocs`.

Le Research Lab regroupe maintenant les points du Capacity Study par topologie de sous-matrices. Le Matrix Topology Study compare le trafic connecteur, l'attente connecteur, les points faisables et le meilleur nombre de robots stable pour chaque decoupage.

## Ascenseurs

Les `ElevatorZone` relient tous les niveaux. Le layout genere une ou plusieurs lignes verticales dediees, placees sur les couloirs proches du centre. Les robots ne peuvent changer d'etage que depuis ces lignes.

L'utilisateur controle le nombre d'etages et le nombre de lignes verticales dediees.

Le routage vertical MVP fonctionne ainsi:

1. Le robot choisit une cellule d'ascenseur qui minimise le trajet horizontal avant/apres l'ascenseur.
2. Il se deplace horizontalement jusqu'a cette cellule.
3. Il passe en etat `ridingElevator`.
4. `visualLevel` progresse pendant le trajet vertical pour rendre la montee ou descente visible.

La simulation cumule maintenant les trajets verticaux, les ticks de trajet et les ticks d'attente associes aux acces verticaux. Ces signaux alimentent `verticalPressure`, puis le Vertical Topology Study du Research Lab.
5. Le robot reprend un trajet horizontal au niveau cible.

Les allees d'ascenseur sont traitees comme des couloirs a capacite elevee dans le MVP. La reservation fine et les files d'attente realistes restent a implementer.

## Pathfinding

Plusieurs strategies sont disponibles via `movement.pathfindingStrategy`:

- `manhattan`: parcours en largeur guide par la distance de Manhattan (aveugle au trafic).
- `astar`: A* avec heuristique Manhattan et cout de pas pondere par `trafficCount`/`waitCount` des cellules (evite la congestion accumulee).
- `dijkstra`: meme cout pondere sans heuristique.
- `reservation`: A* + couche de reservation temporelle (voir ci-dessous).

La politique de re-routage (`reroutingPolicy`) controle la frequence de recalcul: `fixed` (un seul trajet), `periodic` (replan si bloque), `reactive` (recalcul a chaque mouvement).

## Collisions Et Reservation Temporelle

Par defaut, les conflits sont evites par occupation de cellule au tick courant: si la prochaine cellule est occupee ou deja reservee par un robot ayant bouge ce tick, le robot attend et accumule du temps d'attente.

Quand `movement.temporalReservation` est actif (ou que la strategie est `reservation`), une couche **espace-temps cooperative par priorite** s'ajoute. A chaque tick, avant tout deplacement, chaque robot en mouvement reserve sa cellule courante puis les `RESERVATION_HORIZON` (6) cellules suivantes de son chemin, sur les ticks futurs correspondants. Les robots les plus en attente sont prioritaires; un robot cesse de reserver des qu'un creneau est deja pris. Des creneaux d'**arete** (non orientee) interdisent les echanges tete-a-tete (deux robots qui traversent la meme arete en sens inverse au meme tick). Un robot n'avance que s'il detient le creneau cellule + arete a l'offset 1. Les couloirs d'ascenseur restent exemptes (capacite elevee). La recherche spatiale reste A*; la reservation ne gere que l'admission au mouvement (version simplifiee, sans A* espace-temps complet).

## Batterie, Poids Et Pannes

La configuration robot inclut `baseWeightKg`, `batteryWeightKg` et `payloadKg`. Dans le Capacity Study et le Battery Strategy Study, une batterie plus grosse augmente l'autonomie mais augmente aussi `energyPerCell` par effet de masse. La simulation mesure les ticks de charge, les sessions de charge, la batterie moyenne et la batterie minimale pour scorer le compromis entre petite batterie, charge plus frequente et interruption operationnelle. Les courbes de charge restent lineaires; degradation batterie, courant de pointe et temperature ne sont pas encore modelises. Les pannes peuvent remettre une commande en attente et immobiliser un robot. Le temps de reparation n'est plus constant: il est tire selon une loi exponentielle autour de `meanFailureTicks` (MTTR), via `failureRng`, donc reproductible. La recharge s'arrete des que la batterie est pleine (duree proportionnelle au deficit).

## Seeds

- `layoutSeed`: placement initial des SKU.
- `demandSeed`: generation des commandes.
- `failureSeed`: pannes et incidents futurs.

Deux simulations avec la meme configuration et les memes seeds doivent produire les memes resultats.
