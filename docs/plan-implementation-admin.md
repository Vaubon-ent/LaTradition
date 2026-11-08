# Plan d'implémentation — Socle d'authentification du dashboard admin (`/admin`)

> Prérequis : `.ai/decisions.md` (section Retenues, entrées du 2026-11-08 sur la route admin), Cadrage de `.ai/project-context.md`, `.ai/project-rules.md`.
> Palier de rigueur : **strict** → chaque mission ci-dessous inclut des tests couvrant les cas limites, pas seulement le chemin heureux.

## Scope

Ce plan couvre **uniquement le socle d'authentification** du dashboard admin : la route `/admin`, la page de login, la détection de session, et la gestion globale de l'expiration de session. Il ne couvre **pas** le contenu métier des vues (liste des commandes, totaux de production, édition des produits/paramètres, export, anonymisation client) — le backend de ces 6 fonctionnalités existe déjà (M6-M8), seule l'interface reste à faire et nécessitera sa propre planification une fois son contenu/layout décidé.

## Architecture concrète

### Backend — un seul ajout, zéro nouvelle dépendance
- **`backend/src/routes/admin/session.js`** (nouveau) : `createAdminSessionRouter()` → `GET /session` → `{ ok: true }`. Aucune logique propre : la validité du cookie est déjà garantie par `requireAdminAuth`, qui tourne avant cette route.
- **`backend/src/app.js`** : monter ce routeur dans le groupe déjà protégé (après la ligne `app.use('/api/admin', requireAdminAuth(adminJwtSecret))`, à côté des autres routeurs admin existants) :
  ```js
  app.use('/api/admin', createAdminSessionRouter());
  ```
- Réutilise entièrement `services/adminAuth.js` et `middleware/requireAdminAuth.js` existants (M5) — pas de nouvelle table, pas de nouveau service.

### Frontend — nouveau point d'entrée `frontend/admin/`
- **`frontend/admin/index.html`** : trois `<section data-view>` (`loading` visible par défaut, `login`, `dashboard` — placeholder vide pour l'instant) jamais détruites/recréées ; seule `hidden` change — même pattern que `frontend/index.html` (F1-F7).
- **`frontend/admin/js/adminState.js`** : état plat minimal, fonctions pures, aucune dépendance au DOM (testable isolément comme `frontend/js/state.js`) :
  ```
  { view: 'loading' | 'login' | 'dashboard', loginError: string|null }
  ```
- **`frontend/admin/js/adminApi.js`** :
  - `checkSession()` → `GET /api/admin/session`
  - `login(password)` → `POST /api/admin/login`
  - `logout()` → `POST /api/admin/logout`
  - `adminFetch(path, options)` : wrapper générique **destiné à être réutilisé par toutes les futures vues métier**. Si la réponse est 401, appelle un callback `onUnauthorized` (fourni par `adminApp.js`) avant de rejeter — centralise la gestion de l'expiration de session en un seul endroit, une fois pour toutes.
  - Toutes les URLs en absolu (`/api/admin/...`), jamais en relatif — convention actée en Decision-Gel pour neutraliser le risque propre à un sous-dossier.
- **`frontend/admin/js/adminApp.js`** (orchestrateur) :
  1. Au chargement : vue `loading` → `checkSession()` → succès : vue `dashboard` ; échec (401) : vue `login`.
  2. Soumission du formulaire login → `login(password)` → succès : vue `dashboard` ; échec 401 : message d'erreur (reste en vue `login`) ; échec 429 : message dédié (« trop de tentatives », verrou brute-force déjà existant côté back).
  3. Bouton logout (placeholder dashboard) → `logout()` → vue `login`.
  4. Enregistre `onUnauthorized` auprès de `adminApi.js` → bascule vers `login` + message « session expirée, reconnectez-vous » — câblé dès maintenant, réutilisable sans modification par toutes les futures vues métier qui appelleront `adminFetch`.
- **`frontend/admin/css/admin.css`** : feuille dédiée et minimale (login + placeholder dashboard), indépendante de `frontend/css/styles.css`.
- **`netlify.toml`** : aucune modification — le sous-dossier `admin/` est servi nativement par Netlify (décision retenue).

### Composants et dépendances
```
admin/index.html
 └─ adminApp.js (orchestrateur)
     ├─ adminState.js (pur, sans DOM)
     └─ adminApi.js
         └─ GET/POST /api/admin/{session,login,logout}  (backend)
             └─ requireAdminAuth → services/adminAuth.js (existant, M5)
```

## Missions (priorisées)

### M-ADM1 (backend) — `GET /api/admin/session`
- Fichiers : `backend/src/routes/admin/session.js`, montage dans `backend/src/app.js`.
- Tests (`backend/tests/adminSession.test.js`) :
  - sans cookie → 401
  - cookie présent mais signature invalide → 401
  - cookie expiré → 401
  - cookie valide → 200 `{ ok: true }`

### M-ADM2 (frontend) — Squelette `admin/` : état, API, login, session, 401 global
- Fichiers : `frontend/admin/index.html`, `js/adminState.js`, `js/adminApi.js`, `js/adminApp.js`, `css/admin.css`.
- Tests (`frontend/tests/adminState.test.js`, `adminApi.test.js` mockés, `adminApp.test.js` intégration DOM jsdom) :
  - état initial = `loading`
  - session invalide au chargement → vue `login`
  - session valide au chargement → vue `dashboard`
  - login mot de passe correct → vue `dashboard`
  - login mot de passe incorrect (401) → message d'erreur, vue reste `login`
  - login verrouillé (429) → message dédié
  - logout → retour vue `login`
  - un appel `adminFetch` recevant 401 en cours d'usage (session expirée pendant l'utilisation) → bascule vers `login` + message dédié
  - vérification que toutes les constantes d'URL utilisées sont en chemin absolu (`/...`), jamais relatif

### M-ADM3 (vérification en conditions réelles)
- Confirmer que `/admin/` est bien servi par Netlify (redirection 301 implicite depuis `/admin` acceptée), sans modification de `netlify.toml`.
- Parcours manuel : chargement direct de `/admin/` sans session → login ; mauvais mot de passe → message ; bon mot de passe → dashboard placeholder ; rechargement avec cookie valide → dashboard direct ; logout → retour login.
- Dépend du déblocage de l'infra réelle (502/CORS, cf. État courant de `.ai/project-context.md`) — à exécuter une fois ce point résolu, pas bloquant pour M-ADM1/M-ADM2.

## Hors scope (nécessitera sa propre planification)
Contenu métier des vues dashboard : liste/statut des commandes, totaux de production, édition produits (`price_per_kg`), édition des paramètres (`news`, dates, `pickup_address`/`contact_phone`), export xlsx/csv, anonymisation client. Backend déjà prêt (M6-M8) ; seule l'interface reste à construire.

## Vérification des décisions en suspens
Aucune des décisions en suspens actuelles (prix réels, date de saison, durée de conservation, contenu du champ « news », valeurs `pickup_address`/`contact_phone`, URL Netlify définitive) ne bloque ce plan : elles concernent le contenu futur des vues métier (hors scope ici) ou l'infra de déploiement déjà en cours de résolution séparément. Rien à signaler comme bloquant.

## Prêt pour `/implementation`
M-ADM1 → M-ADM2 → M-ADM3, dans cet ordre.
