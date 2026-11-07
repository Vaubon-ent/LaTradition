# Cahier des charges : application de gestion des commandes de boudins

> Document destiné à un agent IA chargé d'implémenter l'application.
> Langue de l'interface : français. Langue du code et des commentaires : anglais.

---

## 1. Contexte

Un artisan (le père de Samuel) vend des boudins une fois par an, à une clientèle de famille et d'amis proches. Les commandes sont prises à l'avance, puis les boudins sont préparés et récupérés lors d'un week-end unique, dit « week-end de conception ».

L'application remplace le carnet et les échanges informels par :
- une page de commande consultable depuis un téléphone (client) ;
- un tableau de bord d'administration (père) pour suivre les commandes, préparer la production et exporter les données.

**Volume attendu :** environ 100 clients maximum, quelques centaines de commandes au total par saison.
**Usage :** une saison par an, principalement sur mobile.

---

## 2. Objectifs

1. Permettre à un client de commander en quelques taps depuis son téléphone.
2. Afficher au client le total de sa commande après validation.
3. Permettre au père de voir toutes les commandes, leur statut, et la quantité totale à fabriquer.
4. Permettre l'export des commandes en Excel (.xlsx) ou CSV (compatible Google Sheets).
5. Conserver les données clients d'une saison à l'autre.

---

## 3. Produits et prix

| Produit | Identifiant | Prix au kg |
|---|---|---|
| Boudin blanc | `blanc` | À configurer |
| Boudin blanc morue | `blanc_morue` | À configurer |
| Boudin noir | `noir` | À configurer |

**Règles :**
- L'unité de vente minimale est **500 g**. Toute quantité est un nombre entier d'unités de 500 g (1 = 500 g, 2 = 1 kg, 3 = 1,5 kg, etc.).
- Le **kilo** est la référence commerciale. Certains clients commandent en 500 g, d'autres en 1 kg ou plus. Affichage client : libellé en kg ou en g selon la quantité.
- Le prix de chaque produit est **saisi et stocké au kg** (`price_per_kg`, décision du 2026-11-07, `.ai/decisions.md`). Le prix unitaire par 500g utilisé pour la facturation d'une ligne est **dérivé par calcul** (`price_per_kg / 2`, arrondi au centime) au moment de la construction de la commande, puis figé dans la ligne. Le prix d'une commande = somme, pour chaque ligne, de `quantité_en_unités_500g × prix_500g_dérivé`.
- Les prix doivent être configurables dans l'admin, sans modification de code.
- **Le calcul du prix est fait exclusivement côté serveur.** Le front peut afficher une estimation, mais le total enregistré et affiché après validation vient du serveur.

---

## 4. Dates et cycle de vie d'une saison

- Une seule **date de conception / retrait** par saison, configurable dans l'admin.
- **Date limite de commande :** calculée automatiquement, une semaine avant la date de conception. Passé ce délai, le formulaire client est verrouillé (message clair affiché, pas de soumission possible).
- L'admin peut consulter et modifier les commandes après verrouillage, mais le client ne le peut plus.
- Le système doit gérer la date côté serveur (fuseau `Europe/Paris`), pas uniquement côté navigateur.

---

## 5. Fonctionnalités : côté client (page de commande)

### 5.1 Formulaire
- Champs obligatoires : **nom**, **prénom**, **numéro de téléphone** (pour contact).
- Pour chaque produit : quantité en unités de 500 g (sélecteur ou champ numérique, minimum 0).
- Au moins un produit doit avoir une quantité supérieure à 0.
- Validation du téléphone : format français ou international, avec message d'erreur clair.

### 5.2 Récapitulatif et validation
- Affichage du détail : produit, quantité (en g ou kg), prix de la ligne, total.
- Bouton de validation.
- Après validation : affichage du **total à payer** et de la **date de retrait**.
- Mention visible avant validation : « Paiement au retrait. Commande non annulable ni remboursable. »

### 5.3 Paiement
- **V1 :** pas de paiement en ligne. Le paiement se fait au retrait.
- **Évolution prévue (hors V1) :** paiement optionnel à la commande via Stripe Checkout. Le paiement au retrait reste obligatoire si la commande n'est pas payée en ligne.
- **Ne jamais** déclarer un paiement commercial comme « transfert entre particuliers ».

### 5.4 Règles métier
- Pas d'annulation ni de remboursement via l'application.
- Pas de plafond de production.
- Une fois la commande validée, elle est enregistrée et ne peut être modifiée par le client.

---

## 6. Fonctionnalités : côté admin (tableau de bord)

### 6.1 Accès
- Authentification obligatoire pour toute route d'administration.
- Mot de passe ou code d'accès fort, stocké sous forme de hash (bcrypt ou argon2).
- Session avec expiration. Protection contre la force brute (limitation de tentatives de connexion).

### 6.2 Liste des commandes
- Tableau ou liste lisible sur mobile : nom, prénom, téléphone, produits, total, date de commande, statut.
- Filtres : statut, date de commande.
- Recherche par nom ou téléphone.

### 6.3 Statut d'une commande
Valeurs possibles :
- `recue` : commande enregistrée (état initial).
- `payee` : paiement reçu (au retrait ou en ligne).
- `retiree` : boudins remis au client.

Le père change le statut depuis le tableau de bord, en un tap.

### 6.4 Récapitulatif de production
- Totaux par produit, exprimés en kilos (avec demi-kilos si nécessaire).
- Calculé sur toutes les commandes non annulées, donc toutes les commandes de la saison.
- Exemple d'affichage : « Boudin blanc : 23,5 kg (47 unités de 500 g) ».

### 6.5 Export
- Téléchargement de **toutes les commandes** au format **.xlsx**.
- Téléchargement au format **.csv** (séparateur `;`, encodage UTF-8 avec BOM, pour compatibilité Excel et Google Sheets).
- Colonnes minimales : date de commande, nom, prénom, téléphone, produit, quantité (unités 500 g), quantité (g), total, statut.
- Génération possible côté serveur ou côté navigateur (SheetJS pour le xlsx).

### 6.6 Paramètres
- Prix par produit (au kg, `price_per_kg`).
- Date de conception / retrait.
- Date limite de commande (calculée, mais modifiable si besoin).
- Texte d'actualité (« news ») affiché en page d'accueil du front client (prix en hausse, fermeture des commandes, etc.) — contenu et structure non figés, voir `.ai/decisions.md`.

---

## 7. Données

### 7.1 Modèle minimal

**Table `products`**
- `id` (texte, ex. `blanc`)
- `name` (texte)
- `price_per_kg` (entier, en centimes d'euro — source de vérité ; le prix par 500g facturé est dérivé par calcul, jamais stocké)
- `active` (booléen)

**Table `settings`**
- `key` (texte), `value` (texte)
- Clés : `conception_date`, `order_deadline` (calculée ou stockée), `season`, `news` (texte libre, vide par défaut).

**Table `customers`**
- `id`, `first_name`, `last_name`, `phone` (unique par saison)
- `created_at`

**Table `orders`**
- `id`, `customer_id`, `season`, `status`, `total_cents`, `paid_online` (booléen), `created_at`, `updated_at`

**Table `order_items`**
- `id`, `order_id`, `product_id`, `quantity_500g` (entier ≥ 1), `unit_price_cents` (prix figé au moment de la commande), `line_total_cents`

### 7.2 Règles sur les données
- Les montants sont stockés en **centimes** (entiers), jamais en flottants.
- Le prix unitaire est copié dans `order_items` au moment de la commande, pour que les changements de prix ultérieurs n'affectent pas les commandes déjà passées.
- Les données sont stockées **en France**. Le fichier SQLite est sur la machine locale de Samuel, donc en France.

### 7.3 Conservation et suppression
- Les données sont conservées d'une saison à l'autre, pour pré-remplir les clients récurrents.
- Prévoir une fonction de suppression ou d'anonymisation des données client, sur demande ou après une durée à définir.
- Mention de finalité (commande de boudins, contact pour retrait) à afficher sur le formulaire client.

---

## 8. Stack technique

| Couche | Technologie | Justification |
|---|---|---|
| Front | HTML, CSS, JavaScript vanilla (ou Svelte + Vite si besoin de réactivité) | Léger, sans build complexe pour la V1 |
| Hébergement front | Netlify (offre gratuite) | Déploiement automatique, HTTPS, aucune mise en veille |
| Proxy | Redirection `/api/*` dans `netlify.toml` vers la machine locale | Même origine côté navigateur, pas de CORS |
| Back | Node.js LTS + Express (ou Hono) | Simple, un seul langage avec le front |
| Base de données | SQLite (fichier local), via `better-sqlite3` ou `sqlite3` | Suffisant pour le volume, zéro serveur à gérer |
| Accès externe | Tailscale Funnel (adresse fixe `*.ts.net`, HTTPS) | Gratuit, sans domaine ni port ouvert sur la box |
| Export xlsx | `exceljs` (serveur) ou SheetJS (navigateur) | Bibliothèques matures |
| Paiement (hors V1) | Stripe Checkout | Frais réduits pour petit panier, pas de statut « particulier » à justifier |
| Auth admin | Hash bcrypt ou argon2 + session cookie | Simple et sûr |

### 8.1 Organisation du projet suggérée
```
boudins/
├── frontend/          # Déployé sur Netlify
│   ├── index.html     # Page de commande client
│   ├── admin.html     # Tableau de bord admin
│   ├── css/
│   └── js/
├── backend/           # Tourne sur la machine locale
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/    # orders, admin, products, settings
│   │   ├── db/        # schéma SQLite, migrations, accès données
│   │   ├── services/  # calcul de prix, dates, export
│   │   └── middleware/# auth admin, rate limit, validation
│   ├── data/          # fichier SQLite (exclu du dépôt Git)
│   └── .env           # secrets (exclu du dépôt Git)
├── netlify.toml       # Redirection /api/* vers Tailscale Funnel
└── README.md
```

### 8.2 Endpoints API (indicatifs)

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| GET | `/api/products` | public | Liste des produits et prix (au kg) |
| GET | `/api/settings/public` | public | Date de retrait, date limite, état du verrouillage, actualité (`news`) |
| POST | `/api/check-phone` | public | Vérifier si un téléphone a déjà une commande cette saison (avertissement non bloquant, vérifie le nonce sans le consommer) |
| POST | `/api/orders` | public | Créer une commande (refusé si verrouillé) |
| POST | `/api/admin/login` | public | Connexion admin |
| POST | `/api/admin/logout` | admin | Déconnexion |
| GET | `/api/admin/orders` | admin | Liste des commandes (filtres) |
| PATCH | `/api/admin/orders/:id/status` | admin | Changer le statut |
| GET | `/api/admin/production` | admin | Totaux de production en kg |
| GET | `/api/admin/export.xlsx` | admin | Export Excel |
| GET | `/api/admin/export.csv` | admin | Export CSV |
| PUT | `/api/admin/products/:id` | admin | Modifier un prix (au kg) |
| PUT | `/api/admin/settings` | admin | Modifier date de conception, saison ou actualité (`news`) |

---

## 9. Sécurité

- **Tout calcul de prix et toute validation de commande se font côté serveur.** Ne jamais faire confiance aux montants envoyés par le client.
- **Validation stricte des entrées** (types, longueurs, valeurs autorisées) sur chaque route.
- **Rate limit** sur `POST /api/orders` et `POST /api/admin/login`.
- **Routes admin protégées** par middleware d'authentification, sans exception.
- **Express écoute sur `localhost` uniquement.** Seul Tailscale Funnel expose le service.
- **Secrets** (clé de session, hash admin) dans `.env`, jamais dans le dépôt.
- **Requêtes SQL paramétrées** uniquement, pour éviter l'injection.
- **Pas de données personnelles dans les URL** (pas de nom ni de téléphone en paramètre).
- **En-têtes de sécurité** (helmet ou équivalent).
- **CORS** : inutile si le proxy Netlify est en place, mais restreindre l'origine à l'adresse Netlify par précaution.

---

## 10. Exploitation

- **Sauvegarde :** copie quotidienne du fichier SQLite pendant la saison, vers un stockage externe (disque, cloud personnel). Export `.sql` possible en complément.
- **Démarrage automatique :** le serveur Express et Tailscale Funnel redémarrent avec la machine (service systemd ou équivalent).
- **Mises à jour :** système et dépendances mis à jour régulièrement, en particulier avant la saison.
- **Dépendance :** la machine doit rester allumée et connectée pendant la saison de commandes.
- **Journalisation :** logs des erreurs serveur et des connexions admin échouées, sans données personnelles.

---

## 11. Hors périmètre V1

- Paiement en ligne (Stripe) : évolution prévue, à ajouter après validation.
- Notifications automatiques (SMS, email) au client.
- Multi-utilisateurs ou multi-comptes admin.
- Gestion de stock ou de production au-delà du récapitulatif.
- Annulation ou remboursement via l'application.
- Application mobile native.

---

## 12. Points à confirmer avant implémentation

1. Prix des trois types de boudins au kg.
2. Date de conception / retrait de la saison en cours.
3. Choix du mode de paiement en V1 : au retrait uniquement (recommandé), ou Stripe dès maintenant.
4. Durée de conservation des données clients entre deux saisons.

---

## 13. Critères d'acceptation (V1)

- [ ] Un client peut commander depuis un téléphone en moins de 2 minutes.
- [ ] Le total affiché correspond au calcul serveur, en centimes exacts.
- [ ] Une commande est impossible après la date limite.
- [ ] Les commandes apparaissent dans l'admin immédiatement après validation.
- [ ] Le statut d'une commande peut être changé en un tap.
- [ ] Le récapitulatif de production donne les totaux exacts en kg, par produit.
- [ ] L'export xlsx et CSV contient toutes les commandes avec les colonnes prévues.
- [ ] L'admin est inaccessible sans authentification.
- [ ] L'API n'est accessible que via le proxy Netlify et Tailscale Funnel.
- [ ] La base SQLite est sauvegardée automatiquement pendant la saison.
