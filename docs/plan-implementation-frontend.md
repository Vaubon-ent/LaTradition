# Plan d'implémentation — Frontend (parcours client)

> Prérequis : `.ai/project-rules.md`, Cadrage de `.ai/project-context.md`, `.ai/decisions.md` (Retenues, entrées du 2026-11-07 sur le design du parcours client), `docs/cahier-des-charges.md`.
> Palier de rigueur : **strict** → chaque mission ci-dessous inclut des tests couvrant les cas limites, pas seulement le chemin heureux.
> Scope : uniquement le **parcours client** (`frontend/index.html`, 5 étapes). Le tableau de bord admin (`admin.html`) n'est pas couvert par ce plan (voir point de clarification 4 plus bas).

## Contradiction résolue (voir `.ai/decisions.md`)
La contradiction entre la décision gelée (« prix en kg déjà géré côté back ») et le code réel (`price_per_500g` stocké, pas de prix au kg) a été tranchée par l'utilisateur : **le prix au kg devient la source de vérité côté back**. L'admin saisira un prix par kg ; le prix par 500g, utilisé en interne pour la facturation (unité de commande `quantity_500g`), sera désormais **dérivé par calcul** à partir du prix au kg — et non l'inverse. Ceci implique une vraie migration de schéma (mission B0 ci-dessous), pas juste un champ calculé en lecture.

## Décisions en suspens — non bloquantes mais à signaler
- Contenu/structure exacte du champ `news` : aucun impact sur l'implémentation (stocké comme texte libre dans `settings`), peut évoluer sans migration.
- Prix réels des 3 boudins / date de conception réelle / durée de conservation (CDC) : déjà gérés par des placeholders côté back, sans impact sur ce plan.

## Architecture concrète

```
frontend/
├── index.html         # 5 <section data-step="N"> cachées/affichées en CSS, jamais détruites/recréées en JS
├── css/
│   └── styles.css
└── js/
    ├── state.js        # état plat : { step, nonce, pii: {}, items: { productId: qtyKg }, news, products }
    ├── api.js           # wrappers fetch : products, settings/public, check-phone, orders
    ├── draft.js         # sauvegarde/restauration/nettoyage du brouillon localStorage
    └── steps/
        ├── welcome.js
        ├── order.js
        ├── pii.js
        ├── recap.js
        └── confirmation.js
```

Extensions nécessaires côté `backend/` existant (pas de nouveau service, pas de nouvelle techno) :
- `settings` : nouvelle clé `news` (texte), lue par `GET /api/settings/public`, modifiable par `PUT /api/admin/settings` (route déjà existante, juste étendue).
- `products` : champ calculé `price_per_kg` ajouté à `GET /api/products` (si option (a) retenue ci-dessus).
- Nouvel endpoint public léger pour le check de doublon téléphone (B3 ci-dessous).

## Missions

### Priorité 1 — Extensions backend nécessaires au front (préalables)

**B0. Migration du modèle de prix — `price_per_kg` devient la source de vérité**
Fichiers concrètement impactés (vérifiés dans le code) : `src/db/schema.js`, `src/db/productsRepo.js`, `src/db/seed.js`, `src/routes/admin/products.js`, `src/services/pricing.js`, et les tests `adminProducts.test.js`, `db.test.js`, `orders.test.js`, `pricing.test.js`, `products.test.js`.
- `schema.js` : renommer la colonne `products.price_per_500g` → `products.price_per_kg`. Pas de migration de données réelle nécessaire (aucun prix réel en production, seulement des placeholders) — mais la base de dev locale doit être recréée (`CREATE TABLE IF NOT EXISTS` ne modifie pas une table existante).
- `productsRepo.js` : toutes les requêtes (`getActiveProducts`, `getActiveProductsById`, `updateProduct`, `getProductById`) utilisent `price_per_kg` au lieu de `price_per_500g`.
- `seed.js` : placeholders exprimés en prix/kg.
- `routes/admin/products.js` (`PUT /api/admin/products/:id`) : accepte `price_per_kg` en entrée (au lieu de `price_per_500g`), même validation (entier ≥ 0).
- `services/pricing.js` (`buildOrderItems`) : calcule le prix unitaire par 500g au moment de la construction de la commande — `unitPriceCents = Math.round(product.price_per_kg / 2)` — puis figé dans `order_items` comme aujourd'hui (une commande passée n'est jamais affectée par un changement de prix ultérieur, comportement inchangé).
- Tests à adapter + cas limite à ajouter : `price_per_kg` impair en centimes (ex. 1551) → arrondi déterministe du prix par 500g dérivé (775 ou 776, à documenter explicitement), pas de perte de centimes sur le total d'une ligne à quantité élevée.

**B1. `GET /api/products` — exposer `price_per_kg`**
- Une fois B0 fait, `GET /api/products` renvoie directement `price_per_kg` (c'est désormais la valeur stockée, plus besoin de champ calculé).
- Tests : produits inactifs toujours exclus (comportement existant inchangé), pas de régression sur les autres champs renvoyés.

**B2. Extension `settings` — champ `news`**
- `GET /api/settings/public` renvoie `news` (chaîne vide si jamais définie).
- `PUT /api/admin/settings` accepte `news` (chaîne, vide autorisée — « aucune actualité »).
- Tests : lecture/écriture, valeur absente → chaîne vide par défaut, pas de régression sur `conception_date`/`season`.

**B3. Nouvel endpoint — check doublon téléphone**
- Ex. `POST /api/check-phone`, public, body `{ phone, nonce }`.
- Confirmé : vérifie la signature + le TTL du nonce **sans le consommer** (il reste réservé à la vraie soumission de commande — le nonce est à usage unique).
- Logique : cherche le client par téléphone (`customersRepo`), si trouvé, vérifie l'existence d'une commande pour la saison courante (`settings.season`) → `{ duplicate: true|false }`.
- Tests : téléphone inconnu → `false` ; téléphone connu sans commande cette saison → `false` ; téléphone connu avec commande cette saison → `true` ; nonce absent/invalide/expiré → rejeté (403), nonce valide mais non consommé après l'appel (vérifier qu'il reste utilisable ensuite par `POST /api/orders`).

### Priorité 2 — Front, étape par étape

**F1. Squelette front + état**
- `index.html` avec 5 `<section data-step>` cachées en CSS (jamais recréées dynamiquement) + `styles.css` + `state.js`.
- Navigation : boutons Suivant/Précédent + indicateur de progression (ex. « Étape 2/5 »). Swipe tactile en bonus, non prioritaire, ajouté en dernier si le temps le permet — jamais le seul moyen de naviguer.
- Tests (vanilla, sans framework de test front lourd — scripts Node/jsdom ou vérification manuelle documentée selon faisabilité) : navigation avant/arrière conserve les valeurs déjà saisies dans les champs.

**F2. Étape 1 — Bienvenue**
- Affiche `news` (`GET /api/settings/public`), bouton « Commander » → passe à l'étape 2.
- Ne récupère **pas** le nonce ici (décision retenue : récupération différée à l'étape Commande pour limiter le risque d'expiration sur un parcours long).
- Tests : `news` vide → section masquée ou message neutre (à définir au moment du code), bouton actif dans tous les cas.

**F3. Étape 2 — Commande**
- À l'entrée de l'étape : récupère le nonce + la liste des produits (`GET /api/products`, incluant `price_per_kg`).
- Une card par produit : nom, prix/kg informatif, stepper +/- par pas de **0,5 kg**, jamais négatif.
- Validation front minimale (au moins une quantité > 0) avant d'activer « Suivant » — confort uniquement, le serveur revalide de toute façon.
- Tests : incrément/décrément par 0,5, blocage sous 0, bouton « Suivant » désactivé si toutes les quantités sont à 0.

**F4. Étape 3 — PII**
- Formulaire nom/prénom/téléphone.
- Au clic « Suivant » : appel à B3 (check-phone). Si `duplicate: true`, afficher un avertissement non bloquant (« ce numéro semble déjà avoir une commande cette saison ») mais laisser continuer.
- Tests : validation basique des champs (non vide, format téléphone simple), avertissement affiché sans bloquer la navigation, navigation possible même si l'appel B3 échoue (ne doit pas bloquer tout le parcours sur une erreur réseau non critique).

**F5. Étape 4 — Récap / Prix**
- Affiche le récapitulatif des lignes et le total — **le total vient exclusivement de la réponse serveur** (jamais recalculé en front).
- Confirmé : c'est à la fin de cette étape (bouton de validation finale) que `POST /api/orders` est réellement envoyé. L'étape 5 n'affichera que le résultat.
- Tests : total affiché = total renvoyé par le serveur, erreurs serveur (nonce expiré, doublon détecté à la création, validation échouée) affichées clairement avec possibilité de corriger sans perdre la saisie.

**F6. Étape 5 — Confirmation**
- Message de remerciement, date de retrait (réponse serveur ou `GET /api/settings/public`), lien de paiement en ligne affiché comme **placeholder** (« disponible prochainement ») — aucune intégration Stripe réelle (hors V1).
- Nettoyage du brouillon `localStorage` ici, uniquement après confirmation serveur réussie.
- Tests : brouillon supprimé après succès, brouillon conservé si l'étape 4 échoue avant confirmation.

**F7. Persistance du brouillon (`localStorage`)**
- Sauvegarde incrémentale de l'état (PII + quantités) à chaque changement, restauration au chargement de la page si un brouillon existe.
- Nettoyage : après confirmation réussie (F6) ou action explicite « Recommencer ».
- Tests : fermeture/réouverture de la page restaure le brouillon, confirmation réussie vide le brouillon, pas de fuite si le brouillon contient des PII partielles (pas de log de son contenu).

## Dépendances entre missions
B0 → B1 (B1 dépend directement de la migration de schéma). B0, B1, B2, B3 doivent être faites avant (ou en même temps que) F3/F4, qui en dépendent directement. F1 (squelette + état) est le prérequis de tout le reste. F5/F6 s'appuient sur la soumission en fin d'étape 4 (confirmée ci-dessous).

## Point de scope encore ouvert (non bloquant)
**Scope du dashboard admin** : ce plan ne couvre que le parcours client. L'admin n'a aujourd'hui aucune interface pour éditer `news` ni pour saisir le nouveau `price_per_kg` (le dashboard `admin.html` reste entièrement à faire). Faut-il une édition temporaire via appel API direct en attendant un plan dédié au dashboard admin, ou faut-il élargir ce plan pour inclure au moins ces deux éditions ?

## Prêt pour `/implementation`
Les 3 points bloquants précédents sont tranchés :
1. Migration du modèle de prix vers `price_per_kg` comme source de vérité (mission B0) — confirmé.
2. Le check-phone (B3) vérifie le nonce sans le consommer — confirmé.
3. `POST /api/orders` est envoyé en fin d'étape 4, l'étape 5 n'affiche que le résultat — confirmé.

Il ne reste que le point de scope ci-dessus (admin), qui n'empêche pas de démarrer B0 → B1 → B2 → B3 puis F1 → F7 dans l'ordre.
