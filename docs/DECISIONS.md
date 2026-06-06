# Decisions Techniques

## 2026-05-27 - Simulation dans un Web Worker

Decision: isoler le moteur de simulation tick-based dans un Web Worker.

Raison: eviter de bloquer le rendu 3D et garder une separation nette entre calcul et visualisation.

Alternatives: simulation dans le thread principal avec `requestAnimationFrame`.

Impact: necessite des messages serialisables et un snapshot de simulation clair.

## 2026-05-27 - Determinisme par seeds separees

Decision: utiliser des generateurs pseudo-aleatoires deterministes distincts pour layout, demande et pannes.

Raison: comparer plusieurs strategies de stockage avec la meme demande.

Alternatives: `Math.random`, seed unique.

Impact: toutes les fonctions aleatoires doivent recevoir un RNG explicite.

## 2026-05-27 - MVP autonome sans backend

Decision: garder les resultats en memoire et exporter en JSON local.

Raison: reduire le perimetre initial et rendre le projet executable localement.

Alternatives: persistance locale IndexedDB ou backend.

Impact: les experiences multi-run seront ajoutees progressivement.

## 2026-05-31 - Statistiques non-parametriques + bootstrap

Decision: pour l'inference du Lab, utiliser Kruskal-Wallis + post-hoc de Dunn avec correction de Holm, et des intervalles de confiance par bootstrap percentile (moyenne, R*).

Raison: les KPI de simulation (debit, backlog) ont des distributions souvent non normales et heterogenes selon la config ; les methodes par rang ne supposent pas la normalite. Holm domine Bonferroni (meme controle du FWER, plus puissant). Le bootstrap evite d'implementer les quantiles de Student/F et reste coherent avec le determinisme (RNG seede).

Alternatives: ANOVA/t-test parametriques, IC de Student, correction de Bonferroni.

Impact: les fonctions stats (`labStats.ts`) restent self-contained ; les IC dependent d'un RNG seede donc reproductibles.

## 2026-05-31 - Campagnes de recherche persistees en localStorage

Decision: une campagne = plan DOE + nuage de resultats + metadonnees, sauvegardee sous `warehouse-lab-campaigns-v1`, exportable en JSON/CSV/Markdown et reimportable.

Raison: reproductibilite et partage des resultats sans backend ; le CSV alimente une analyse externe (R/Python), le Markdown sert de rapport.

Alternatives: IndexedDB, backend, export uniquement.

Impact: la limite de taille du localStorage borne le nombre de campagnes (cap a 30) ; pas de versionnage de schema au-dela du suffixe de cle.
