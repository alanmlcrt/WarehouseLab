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

Les robots du MVP transportent une commande a la fois. Ils passent par les etats `idle`, `movingToPick`, `picking`, `movingToDropoff`, `droppingOff`, `movingToElevator`, `ridingElevator`, `movingToCharger`, `charging`, `waiting`, `failed`, `depleted`.

L'etat `depleted` correspond a une panne seche: un robot dont la batterie atteint 0 en pleine tache s'immobilise, rend sa commande a la file, et reste hors-service le temps d'un secours/recharge (proportionnel a `rechargeTicks`) avant de repartir batterie pleine.

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

**Capacite des cabines.** Chaque couloir vertical (`ElevatorZone`) modelise une cabine unique: un seul robot la traverse a la fois (`busy` / `reservedBy`). Un robot qui arrive a une cabine occupee attend a la cellule d'acces et reessaie au tick suivant; son attente est comptee dans la congestion. Le choix de cabine penalise les cabines occupees pour repartir la flotte entre les couloirs. Plusieurs couloirs (derives de la largeur) fournissent donc plusieurs cabines en parallele. Un robot qui tombe en panne ou est libere pendant un trajet relache sa cabine pour ne pas la verrouiller.

## Pathfinding

Plusieurs strategies sont disponibles via `movement.pathfindingStrategy`:

- `manhattan`: parcours en largeur guide par la distance de Manhattan (aveugle au trafic).
- `astar`: A* avec heuristique Manhattan et cout de pas pondere par `trafficCount`/`waitCount` des cellules (evite la congestion accumulee).
- `dijkstra`: meme cout pondere sans heuristique.
- `reservation`: A* + couche de reservation temporelle (voir ci-dessous).

La politique de re-routage (`reroutingPolicy`) controle la frequence de recalcul: `fixed` (un seul trajet), `periodic` (replan si bloque), `reactive` (recalcul a chaque mouvement).

**Defaut.** Le preset de base et le Lab demarrent en `reservation` + `reactive`: c'est la combinaison qui evite les blocages d'echange (swap deadlocks) et donne des courbes de saturation exploitables. `manhattan` / `fixed` restent disponibles pour etudier la degradation due a une mauvaise coordination.

**Planification autour des robots.** La recherche de chemin traite la position courante de *tous* les robots comme obstacle (pas seulement les robots a l'arret). C'est volontaire: sous A* pondere-trafic + reservation, planifier autour des positions courantes est une coordination proactive qui repartit la flotte entre les allees. Un test A/B a confirme qu'ignorer les robots en mouvement effondre le debit (~3x) — voir le commentaire de `getOccupiedCells`.

## Collisions Et Reservation Temporelle

Par defaut, les conflits sont evites par occupation de cellule au tick courant: si la prochaine cellule est occupee ou deja reservee par un robot ayant bouge ce tick, le robot attend et accumule du temps d'attente.

Quand `movement.temporalReservation` est actif (ou que la strategie est `reservation`), une couche **espace-temps cooperative par priorite** s'ajoute. A chaque tick, avant tout deplacement, chaque robot en mouvement reserve sa cellule courante puis les `RESERVATION_HORIZON` (6) cellules suivantes de son chemin, sur les ticks futurs correspondants. Les robots les plus en attente sont prioritaires; un robot cesse de reserver des qu'un creneau est deja pris. Des creneaux d'**arete** (non orientee) interdisent les echanges tete-a-tete (deux robots qui traversent la meme arete en sens inverse au meme tick). Un robot n'avance que s'il detient le creneau cellule + arete a l'offset 1. Les couloirs d'ascenseur restent exemptes (capacite elevee). La recherche spatiale reste A*; la reservation ne gere que l'admission au mouvement (version simplifiee, sans A* espace-temps complet).

## Batterie, Poids Et Pannes

La configuration robot inclut `baseWeightKg`, `batteryWeightKg` et `payloadKg`. Dans le Capacity Study et le Battery Strategy Study, une batterie plus grosse augmente l'autonomie mais augmente aussi `energyPerCell` par effet de masse. La simulation mesure les ticks de charge, les sessions de charge, la batterie moyenne et la batterie minimale pour scorer le compromis entre petite batterie, charge plus frequente et interruption operationnelle. Les courbes de charge restent lineaires; degradation batterie, courant de pointe et temperature ne sont pas encore modelises.

**La batterie est une contrainte dure.** Un robot inactif passe sous `rechargeThreshold` part recharger. Mais un robot qui prend une mission juste au-dessus du seuil peut se vider en cours de route: s'il atteint 0, il passe en `depleted` (panne seche, voir section Robots) et sa commande repart en file. Le compteur `depletionEvents` (KPI « Pannes batterie ») remonte ces evenements: un chiffre eleve signale une autonomie ou un seuil mal dimensionnes. Une autonomie suffisante ramene ce compteur a zero.

Les pannes peuvent remettre une commande en attente et immobiliser un robot. Le temps de reparation n'est plus constant: il est tire selon une loi exponentielle autour de `meanFailureTicks` (MTTR), via `failureRng`, donc reproductible. La recharge s'arrete des que la batterie est pleine (duree proportionnelle au deficit).

## Seeds

La config porte huit sous-seeds independants: `layoutSeed`, `skuCatalogSeed`, `stationSeed`, `robotSpawnSeed`, `demandSeed`, `trafficSeed`, `batterySeed`, `failureSeed`. Dans le Lab, chaque repetition (seed) decale ces huit seeds de facon decorrelee: une repetition est donc un entrepot physiquement different (placement, mix SKU demande, pannes), ce qui en fait une vraie replication statistique — pas une simple re-mesure.

Deux simulations avec la meme configuration et les memes seeds produisent les memes resultats (aucun `Math.random()` dans le moteur).
