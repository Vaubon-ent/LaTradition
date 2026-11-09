# Plan d'implémentation — Refonte front suite à l'audit UX (2026-11-09)

> Prérequis : `.ai/decisions.md` (section Retenues, entrées du 2026-11-09 : correctifs P1/P2, responsive stepper/roulette, estimation de prix au récap), `docs/Rapport UX — LaTradition (latradition.netlify.app).md`, `.ai/mapping.md` (rôle des fichiers `frontend/`).
> Palier de rigueur : **strict** → chaque mission ci-dessous inclut des tests couvrant les cas limites, pas seulement le chemin heureux.
> Rappel : le P0 (bug nonce anti-replay) a déjà été corrigé séparément via `/debogage` le 2026-11-09 — hors scope de ce plan.

## Scope

Trois chantiers front gelés, tous sur le parcours client (`frontend/`), aucun ne touche le backend :
1. Correctifs ponctuels des findings P1/P2 de l'audit UX (étape Coordonnées) + une petite fonctionnalité nouvelle (bouton « Recommencer »).
2. Responsive : stepper +/- sur pc/tablette, roulette sur mobile, à l'étape Commande (plus jamais les deux en même temps).
3. Carte Récapitulatif retravaillée : estimation de prix par ligne + total, retrait de l'indicatif prix/kg, design inspiré d'un ticket de caisse.

Ne couvre pas : `pickup_time`/`pickup_address` (erreur de saisie à corriger via `PUT /api/admin/settings`, pas du code) ; la confidentialité du brouillon `localStorage` (décision F7 déjà gelée, non rouverte) ; tout ce qui touche au dashboard admin.

## Limite connue (à rappeler avant `/implementation`)
Aucun outil de navigateur disponible dans cette session Claude Code CLI (confirmé à plusieurs reprises ce projet, voir `change-log.md` du 2026-11-09). Les missions ci-dessous seront vérifiées par :
- la suite `vitest`/`jsdom` existante (`frontend/tests/`), qui couvre la logique et la structure DOM mais **pas le rendu visuel réel ni les media queries CSS** (jsdom ne calcule pas de layout ni de `@media` sur une largeur de fenêtre réelle) ;
- une vérification manuelle en conditions réelles mais **non visuelle** (serveur réel, requêtes HTTP/DOM directes) pour la logique ;
- le rendu visuel réel (notamment le responsive 768px et le design ticket de caisse) reste à vérifier par l'utilisateur ou une session avec outil navigateur — comme pour M-DASH4 et toutes les missions front précédentes de ce projet.

## Architecture concrète

### M-FR1 — fonctions pures partagées (`frontend/js/state.js`)
- `formatKgLabel(value)` : déplacée depuis `frontend/js/steps/order.js` (actuellement privée), exportée. Remplace la virgule/point à la source pour les deux appelants (corrige le finding #3).
- `estimateLineCents(product, quantityKg)` : nouvelle fonction pure, **réplique exactement la formule serveur** (`backend/src/services/pricing.js`) plutôt qu'un calcul naïf, pour qu'une estimation ne diverge jamais du total réel de plus d'un centime d'arrondi :
  ```js
  function estimateLineCents(product, quantityKg) {
    const pricePer500g = Math.round(product.price_per_kg / 2);
    const quantity500g = Math.round(quantityKg * 2);
    return quantity500g * pricePer500g;
  }
  ```
- Aucun changement de signature sur les fonctions existantes de `state.js`.

### M-FR2 — Carte Récapitulatif (`frontend/js/steps/recap.js`, `frontend/css/styles.css`)
- Retrait de l'affichage `price_per_kg` par ligne (actuel `priceInfo`).
- Chaque ligne devient une rangée « ticket de caisse » : nom du produit + quantité (via `formatKgLabel`) à gauche, estimation de prix (`estimateLineCents`, via `formatEuros` déjà existant dans ce fichier) alignée à droite, séparateur en pointillés.
- Nouvelle ligne de total, après la liste : **« Estimation : XX,XX € »** en gras, séparée par une ligne pleine, suivie d'une mention explicite en petit texte (« Montant définitif confirmé à la validation. ») — jamais le mot « Total » seul, pour ne pas être confondu avec le `total_cents` serveur affiché à l'étape Confirmation (`confirmation.js`, inchangé).
- CSS : police monospace pour le bloc récap uniquement (`.receipt`), lignes en `display:flex; justify-content:space-between`, bordure pointillée entre lignes, total en gras avec séparateur plein au-dessus.
- Aucun changement à `handleSubmit`/`submitOrder` : la commande réellement soumise et son calcul restent exclusivement côté serveur (F5 non remise en cause sur le fond, seulement l'affichage pré-soumission).

### M-FR3 — Responsive stepper (pc/tablette) / roulette (mobile) (`frontend/js/steps/order.js`, `frontend/css/styles.css`)
- CSS pur, sans détection JS de largeur d'écran (plus robuste au redimensionnement) :
  ```css
  @media (min-width: 768px) {
    .qty-wheel { display: none !important; }
  }
  @media (max-width: 767.98px) {
    .stepper button[data-role="dec"],
    .stepper button[data-role="inc"] { display: none; }
  }
  ```
  Le champ de saisie libre (`input[data-role="qty"]`) n'est jamais masqué sur aucune des deux tailles — c'est lui qui garantit la conformité à la décision déjà gelée (« jamais le seul moyen de choisir une quantité »).
- JS : légère robustesse ajoutée dans `order.js` (`openWheel`) — fermer toutes les autres roulettes de produit avant d'ouvrir celle du produit courant (pertinent surtout sur mobile où plusieurs cartes produit peuvent avoir une roulette ; sans effet visible sur pc/tablette puisqu'elle y est masquée par CSS).
- Pas de changement aux listeners existants (focus/click pour ouvrir, clic extérieur pour fermer) au-delà de ce point.

### M-FR4 — Correctifs ponctuels étape Coordonnées (`frontend/js/steps/pii.js`)
- **#1 (message qui ne se nettoie pas)** : un listener `input` déjà existant par champ ; ajout d'une revalidation légère à chaque frappe qui masque `validation-error` dès que `validateClientSide` ne renvoie plus d'erreur (sans déclencher l'appel réseau `check-phone`, réservé au clic Suivant).
- **#7 (Entrée inopérante)** : le `<form>` existant gagne un vrai listener `submit` (`event.preventDefault()` puis `handleNext`) ; le bouton Suivant passe en `type="submit"`.
- **#5 (pas de feedback de clic)** : pendant l'appel `checkPhone` dans `handleNext`, le bouton Suivant est désactivé (et éventuellement un libellé temporaire « Vérification... ») puis réactivé dans tous les cas (succès, erreur réseau, doublon) avant `ctx.goNext()` ou en cas de retour anticipé.
- **#6 (incohérence de pattern) : non traité directement** — décision retenue : vérifier après coup si le symptôme a disparu (voir mission M-FR6, vérification manuelle).

### M-FR5 — Bouton « Recommencer » (`frontend/js/app.js`, `frontend/index.html`, `frontend/css/styles.css`)
- Nouvel élément unique dans `index.html` (hors des 5 `<section data-step>`, par ex. juste sous l'indicateur `#progress`), pas dupliqué par étape — cohérent avec le fait qu'`app.js` contrôle déjà `progressEl` et la visibilité des étapes de façon centralisée.
- `app.js` (`renderAll`) : visible uniquement si `state.step > 1`.
- Nouvelle fonction `ctx.restart()` dans `app.js` — **distincte de `clearDraftOnConfirmation`** : au clic, `window.confirm('Êtes-vous sûr ? Votre commande en cours sera effacée.')` ; si confirmé, `state = createInitialState()`, `clearDraft()`, **sans** mettre `draftSuppressed` à `true` (contrairement au cas confirmation — les saisies suivantes doivent recommencer à être sauvegardées).

## Composants et dépendances
```
frontend/js/state.js (formatKgLabel, estimateLineCents — nouveau/déplacé)
 ├─ steps/order.js   (import formatKgLabel ; CSS responsive M-FR3 ; fermeture centralisée des roulettes)
 ├─ steps/recap.js   (import formatKgLabel + estimateLineCents ; rendu "ticket de caisse" M-FR2)
 └─ steps/pii.js     (M-FR4, aucune dépendance à state.js au-delà de l'existant)

frontend/js/app.js   (M-FR5 : ctx.restart(), nouvel élément index.html)
```
Aucune nouvelle dépendance npm, aucun changement backend.

## Missions (priorisées)

### M-FR1 (pur, base commune) — `formatKgLabel`/`estimateLineCents` dans `state.js`
- Tests (`frontend/tests/state.test.js`) : `formatKgLabel` (entier vs décimal 0,5 ; vérifie la virgule) ; `estimateLineCents` (quantité entière, quantité à 0,5 kg, prix en centimes impair — cas qui exercerait un double-arrondi si la formule naïve était utilisée à la place de la formule miroir du serveur).

### M-FR2 (frontend, DOM) — Carte Récapitulatif
- Fichiers : `frontend/js/steps/recap.js`, `frontend/css/styles.css`.
- Dépend de M-FR1.
- Tests (`frontend/tests/recap.test.js`, nouveau fichier ou extension de `app.test.js`) : aucune mention « €/kg » dans le DOM rendu ; une estimation par ligne cohérente avec `estimateLineCents` ; une estimation totale égale à la somme des lignes ; libellé contenant le mot « Estimation » (jamais seul « Total ») + la mention explicite.

### M-FR3 (frontend, CSS + DOM) — Responsive stepper/roulette
- Fichiers : `frontend/js/steps/order.js`, `frontend/css/styles.css`.
- Tests (`frontend/tests/app.test.js` ou nouveau `order.test.js`) : **limité à ce que jsdom peut réellement vérifier** — la règle CSS est présente dans la feuille de style (assertion sur le texte de `styles.css` ou sur la présence de la media query, pas sur un rendu réel) ; ouverture d'une 2e roulette ferme bien la première dans le DOM (`hidden` devient `true`), indépendamment de la taille d'écran simulée.
- **Vérification visuelle réelle du responsive (768px) laissée à l'utilisateur** (limite d'environnement rappelée en tête de ce plan).

### M-FR4 (frontend, DOM) — Correctifs étape Coordonnées
- Fichiers : `frontend/js/steps/pii.js`.
- Tests (`frontend/tests/app.test.js`, extension) : taper un prénom invalide puis valide fait disparaître le message sans clic sur Suivant ; soumission du formulaire via la touche Entrée (dispatch d'un événement `submit` sur le `<form>`) déclenche `handleNext` ; pendant un appel `checkPhone` mocké en attente, le bouton Suivant est désactivé puis réactivé après résolution (succès et échec).

### M-FR5 (frontend, DOM) — Bouton « Recommencer »
- Fichiers : `frontend/js/app.js`, `frontend/index.html`, `frontend/css/styles.css`.
- Tests (`frontend/tests/app.test.js`, extension) : bouton absent à l'étape 1, présent dès l'étape 2 ; `window.confirm` mocké à `false` → aucun changement d'état ; mocké à `true` → retour à l'étape 1, `items`/`pii` réinitialisés, brouillon `localStorage` vidé, **et** une saisie faite ensuite est bien re-sauvegardée en brouillon (vérifie que `draftSuppressed` n'est pas resté figé, contrairement au cas confirmation).

### M-FR6 (vérification manuelle en conditions réelles + limite)
- Backend + front réels en local (comme pour F1-F7, M-DASH4) : parcours complet avec le nouveau récap (vérifier que l'estimation affichée correspond bien au `total_cents` réellement renvoyé à l'étape Confirmation, à l'arrondi du centime près) ; déclenchement du doublon téléphone pour vérifier que le symptôme #6 a bien disparu une fois #1 corrigé (sinon, le signaler comme à rouvrir, décision déjà prévue) ; clic sur « Recommencer » à plusieurs étapes.
- **Rendu visuel (responsive 768px, design ticket de caisse) non vérifiable dans cette session** (pas d'outil navigateur) — à faire par l'utilisateur ou une session avec outil navigateur, comme déjà noté pour M-DASH4 et toutes les missions front précédentes.

## Vérification des décisions en suspens
Aucune décision en suspens actuelle ne bloque ce plan. Le finding #6 (incohérence de pattern) n'est pas une décision en suspens à proprement parler mais un point à reconfirmer en M-FR6 après coup — déjà noté comme tel dans `.ai/decisions.md`.

## Prêt pour `/implementation`
M-FR1 → (M-FR2 et M-FR3 en parallèle, tous deux dépendants de M-FR1 uniquement) → M-FR4 et M-FR5 (indépendants de tout le reste, peuvent être menés à tout moment) → M-FR6 en dernier.
