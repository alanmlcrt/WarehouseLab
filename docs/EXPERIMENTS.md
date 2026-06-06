# Experiences

## Random Storage Vs ABC

Question: a demande identique, le stockage aleatoire penalise-t-il fortement les performances par rapport au stockage ABC ?

Parametres: meme `demandSeed`, strategies `randomStorage` et `abcStorage`.

Metriques: temps moyen, distance moyenne, debit, backlog, congestion.

Metriques de placement ajoutees:

- distance de stockage ponderee par `demandWeight`;
- distance moyenne des SKU `fast-moving`;
- efficacite de slotting entre une affectation ideale et une affectation inverse;
- impact du slotting dans le classement des strategies et la regression de capacite.

## Impact Du Nombre De Robots

Question: a partir de quelle densite les robots creent-ils plus de congestion que de debit ?

Parametres: 5, 10, 15, 20 robots.

Metriques: debit, utilisation, attentes, backlog.

## Capacity Study

Question: combien de robots faut-il pour une matrice donnee, avec une demande, un nombre d'etages, une topologie de lignes verticales et un profil batterie donnes ?

Parametres balayes automatiquement:

- nombre de robots autour d'une premiere estimation basee sur la demande;
- batterie compacte, batterie courante, batterie longue autonomie;
- nombre de lignes verticales actuel et actuel + 1.
- topologie en sous-matrices: configuration actuelle, un decoupage supplementaire horizontal ou vertical.
- poids physique induit par la batterie: le poids batterie modifie l'energie par cellule.

Critere de faisabilite:

- debit effectif >= 95% de la demande;
- backlog final sous un budget proportionnel a la demande;
- utilisation robot moyenne <= 92%, pour garder une marge operationnelle.

Formule empirique exposee par le Research Lab:

```text
R = ceil((D / q_robot) * S * P_vertical * P_batterie * P_blocs * P_poids * C_matrice)
```

Avec:

- `D`: caisses par minute cible, calculees par `ordersPerMinute * averageItemsPerOrder`.
- `q_robot`: debit par robot calibre sur les simulations stables.
- `S`: facteur de securite.
- `P_vertical`: penalite liee au nombre d'etages et de lignes verticales.
- `P_batterie`: penalite si l'autonomie estimee devient trop courte.
- `P_blocs`: penalite liee au nombre de sous-matrices et de connecteurs inter-matrices.
- `P_poids`: penalite liee a la masse robot + batterie + charge utile.
- `C_matrice`: complexite issue de la surface et du nombre de niveaux.

Statut: formule exploratoire. Elle sert a orienter les prochaines simulations, pas encore a dimensionner une installation reelle sans calibration terrain.

Le Research Lab calcule aussi une regression log-lineaire sur les points simules. Elle estime `ln(R*)` depuis les facteurs observables et exporte les coefficients ainsi que le `R2`. Cette regression sert a remplacer progressivement les penalites fixees a la main par des coefficients calibres.

La regression inclut aussi `slottingInefficiency`, derive de l'efficacite de placement. Cette variable permet de mesurer si une matrice demande plus de robots parce que les SKU frequents sont trop loin des stations.

## Vertical Topology Study

Question: combien de lignes verticales faut-il pour eviter que les changements d'etage deviennent le goulet d'etranglement ?

Source: le Vertical Topology Study est derive des points du Capacity Study. Il regroupe les points par `verticalAccessLineCount`.

Metriques:

- nombre de points testes par nombre de lignes;
- nombre de points faisables;
- meilleur nombre de robots stable;
- debit moyen;
- pression verticale moyenne;
- ticks moyens d'attente ascenseur;
- trajets ascenseur moyens;
- score de topologie verticale.

Utilite: separer l'effet "il faut plus de robots" de l'effet "les robots attendent trop pour changer d'etage".

## Matrix Topology Study

Question: faut-il garder une matrice unique ou regrouper plusieurs sous-matrices dans une matrice geante reliee par des chemins inter-blocs ?

Source: le Matrix Topology Study est derive des points du Capacity Study. Il regroupe les resultats par topologie `subMatrixRows x subMatrixColumns`.

Metriques:

- nombre de blocs;
- nombre de connecteurs;
- nombre de points testes;
- nombre de points faisables;
- meilleur nombre de robots stable;
- debit moyen;
- service level moyen;
- trafic connecteur moyen;
- attente connecteur moyenne;
- taux d'attente connecteur;
- score de topologie blocs.

Utilite: distinguer une topologie qui aide a structurer la matrice d'une topologie qui cree trop de passages obliges entre sous-matrices.

## Rapport Scientifique Markdown

Le bouton `Report` de l'onglet Research exporte une note Markdown complete pour transformer un run en trace exploitable.

Contenu du rapport:

- synthese executive: recommandation robot, meilleure variante, meilleur point stable, qualite de regression;
- formule empirique et facteurs calibres;
- modele de regression, coefficients, `R2`, RMSE/MAE de validation croisee et taille d'echantillon;
- top des variantes comparees et points de capacite les plus fiables;
- recommandations de prochaines experiences selon les signaux detectes: erreur de validation elevee, points instables, pression connecteurs, saturation robot, compromis batterie/poids;
- limites connues du modele.

Utilite:

- documenter une experience sans retraiter le JSON a la main;
- comparer plusieurs configurations de matrice en conservant les hypotheses;
- preparer les prochains plans d'experiences vers une formule de dimensionnement plus robuste.

## Carnet De Recherche

Chaque run Research Lab termine est ajoute a un carnet persistant cote navigateur. Le carnet conserve les derniers DOE pour comparer l'evolution des formules sans perdre les essais precedents.

Indicateurs:

- nombre de runs conserves;
- derniere recommandation robot;
- plage min/max des recommandations robot observees;
- meilleur `R2` observe;
- derniere erreur de validation croisee;
- tendance entre les deux derniers runs: `improving`, `stable`, `degrading` ou `insufficient-data`.

Le bouton `Notebook` exporte un Markdown global qui compare les runs, les recommandations, les niveaux de confiance et les meilleurs points stables.

Niveaux de confiance:

- `exploratory`: points stables presents, mais domaine encore trop local ou regression trop faible;
- `usable`: regression correcte sur au moins 48 points;
- `strong`: regression plus robuste, erreur de validation croisee basse, au moins 72 points et plusieurs points stables.

Usage scientifique:

- detecter si le domaine teste converge vers une formule stable;
- identifier les configurations qui degradent la regression;
- garder une trace lisible des hypotheses avant de lancer des simulations plus longues.

## High Demand

Question: comment le systeme reagit-il a une demande durablement elevee ?

Metriques: backlog, temps moyen, robots actifs.

## Battery Strategy Study

Question: peut-on eviter de grosses batteries en augmentant ou optimisant la recharge, sans tomber sous une autonomie operationnelle minimale ?

Parametres balayes automatiquement:

- capacite batterie: petite, moyenne, actuelle, grande;
- seuil de recharge: bas, prudent, conservateur;
- temps de recharge: rapide, courant, lent;
- nombre de chargeurs: configuration actuelle et ajout cible selon le nombre de robots;
- poids batterie derive de la capacite, avec effet sur `energyPerCell`.

Metriques:

- autonomie estimee en minutes;
- debit effectif et service level;
- backlog;
- energie par commande;
- nombre de sessions de charge;
- part du temps robot passee en charge;
- batterie minimale observee;
- score de compromis batterie/recharge.

Critere de faisabilite:

- debit effectif >= 95% de la demande;
- service level >= 90%;
- autonomie estimee >= 8 minutes;
- part du temps en charge <= 22%;
- utilisation robot moyenne <= 94%.

Utilite: isoler les profils ou une batterie plus petite reste viable grace a une strategie de recharge et un nombre de chargeurs adaptes.

## Peak Demand

Question: le systeme absorbe-t-il un pic temporaire ?

Metriques: backlog, temps de retour a l'equilibre, p95 futur.

## Robot Failures

Question: quelle resilience face aux pannes ?

Statut: prepare dans les modeles, implementation complete a venir.

## Rails Guided Placeholder

Question: quelles topologies de rails reduisent la congestion ?

Statut: scenario et modeles prepares, simulation a venir.
