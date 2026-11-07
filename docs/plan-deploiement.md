# Plan d'implémentation — Déploiement réel (connexion front ↔ back)

> Prérequis : `.ai/project-rules.md`, `.ai/decisions.md` (section Retenues — stack de déploiement), `docs/cahier-des-charges.md` §8 (architecture), §9 (sécurité), §10 (exploitation), §13 (checklist de recette).
> Palier de rigueur : **strict** → chaque mission ci-dessous se termine par une vérification manuelle documentée dans `.ai/change-log.md` (l'infrastructure réelle — machine physique, Tailscale, Netlify — n'est pas testable par une suite automatisée).
> Scope : mettre en place la chaîne réelle Netlify (front) → proxy `/api/*` → Tailscale Funnel → backend Express sur la machine de production. Ne couvre pas le contenu métier (prix réels, date de saison, `news`, `pickup_address`/`contact_phone`) — voir section « Décisions en suspens » plus bas.

## Architecture concrète (rappel CDC §8, déjà retenue)

```
Client (téléphone/navigateur)
   │  HTTPS
   ▼
Netlify (frontend/, statique)
   │  netlify.toml : redirection proxy /api/* → URL Tailscale Funnel
   ▼
Tailscale Funnel (*.ts.net, HTTPS, pas de port ouvert sur la box)
   │
   ▼
Machine de production (Linux, confirmé M10) — Express sur 127.0.0.1:PORT uniquement
   │
   ▼
SQLite local (backend/data/boudins.db)
```

Le navigateur ne voit qu'une seule origine (le domaine Netlify) : le `fetch('/api/...')` du front (déjà écrit ainsi, voir `frontend/js/api.js`) est donc correct tel quel, aucune modification de code front n'est nécessaire pour cette mise en connexion.

## Décision prise — mode de déploiement Netlify

**Dépôt Git + déploiement continu**, retenu le 2026-11-07 (voir `.ai/decisions.md`). Le projet n'avait jusqu'ici aucun dépôt Git : D4 inclut donc son initialisation (par moi, localement) puis son envoi vers un hébergeur Git au choix de l'utilisateur (GitHub ou autre) — la création du dépôt distant et l'autorisation de push restent de ton ressort (compte externe), je ne les ferai pas sans ton accord explicite au moment venu.

## Composants nécessaires et dépendances

| Composant | Dépend de | Fait par |
|---|---|---|
| Dépôt Git (si CI/CD retenu) | — | décision utilisateur + moi (init + premier commit) |
| Site Netlify | dépôt Git (si CI/CD) ou rien (si CLI) | moi, une fois la décision prise |
| `netlify.toml` (redirection `/api/*`) | URL Tailscale Funnel connue (D1) | moi |
| Tailscale installé + Funnel activé sur la machine de prod | accès physique/SSH à la machine | **toi** (je ne peux pas agir sur une machine Linux distante que je n'ai pas) |
| `.env` réel sur la machine de prod (secrets forts, `ALLOWED_ORIGIN` = URL Netlify définitive) | URL Netlify connue (D4 avant D2 côté valeur finale) | **toi**, avec les commandes que je te donne |
| Unités systemd (`backend/deploy/*`) adaptées et installées | accès à la machine de prod | **toi** |
| Vérification bout-en-bout en conditions réelles | tout ce qui précède | les deux (toi sur le terrain, moi si tu me donnes un accès/logs) |

**Point important** : je n'ai pas d'accès à la machine de production (Linux, physique, chez toi/ton père). Les missions D1, D2 (partie machine), D3 ne peuvent pas être exécutées par moi via `/implementation` — je peux te fournir les commandes exactes et les gabarits prêts à copier, mais leur exécution reste la tienne. Je le précise maintenant pour que le plan soit réaliste, pas pour bloquer la suite : D4 (Netlify, netlify.toml) et une partie de D2 (génération des secrets) peuvent être préparés ou faits par moi dès que la décision Git/Netlify ci-dessus est prise.

## Missions

### D1. Tailscale Funnel sur la machine de production (toi)
- Installer Tailscale sur la machine (`https://tailscale.com/download`), l'authentifier sur ton compte/tailnet.
- Activer le Funnel sur le port du backend (`PORT` dans `.env`, défaut 3000) : `tailscale funnel 3000` (ou équivalent selon la version), en HTTPS.
- Récupérer l'URL stable `*.ts.net` obtenue — nécessaire pour `netlify.toml` (D4).
- Vérification manuelle : `curl https://<machine>.ts.net/api/health` depuis un réseau externe (ex. 4G) doit renvoyer `{"status":"ok"}`.

### D2. Secrets et configuration réelle du backend (toi, avec mes commandes)
- Générer des secrets forts et uniques (jamais ceux utilisés en dev local) :
  - `NONCE_SECRET` et `ADMIN_JWT_SECRET` : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  - `ADMIN_PASSWORD_HASH` : choisir un vrai mot de passe admin, puis `node -e "console.log(require('bcryptjs').hashSync('LE_VRAI_MOT_DE_PASSE', 10))"`.
- `ALLOWED_ORIGIN` = URL Netlify définitive (connue après D4, ou connue à l'avance si le site Netlify est créé avant d'y déployer du contenu — Netlify attribue son sous-domaine dès la création du site).
- `.env` sur la machine de prod (jamais commité, cf. `.ai/project-rules.md`) — copier `backend/.env.example` et remplir avec les valeurs ci-dessus.
- `npm run db:setup` sur la machine de prod (crée/migre `backend/data/boudins.db` avec le schéma à jour, y compris `price_per_kg` depuis B0).
- Vérification manuelle : `npm start` sur la machine, `curl http://127.0.0.1:$PORT/api/health` en local sur la machine.

### D3. Démarrage automatique (toi)
- Adapter `backend/deploy/boudins-backend.service` et `boudins-backup.{service,timer}` : `User=` et `WorkingDirectory=` réels (déjà documenté dans `backend/README.md`).
- Installer les unités (`systemctl daemon-reload`, `enable --now`).
- Vérification manuelle : redémarrage de la machine (ou `systemctl restart`), confirmer que le backend et le Funnel Tailscale reviennent automatiquement sans intervention.

### D4. Dépôt Git + déploiement continu Netlify + `netlify.toml`
- ✅ **Fait (moi)** : dépôt Git local initialisé (`git init`), `.gitignore` racine (exclut `node_modules/`, `backend/data/`, `backend/.env`, `graphify-out/`), `netlify.toml` créé avec l'URL Tailscale en placeholder (`<machine>.ts.net`, à remplacer une fois D1 fait).
- **Toi** : créer le dépôt distant (GitHub ou autre hébergeur à ton choix) et me communiquer son URL, ou pousser toi-même depuis ta machine — je ne crée pas de compte externe ni ne pousse sans ton accord explicite au moment venu.
- **Toi** : connecter le dépôt distant à un site Netlify (interface web Netlify, « Import from Git »).
- Récupérer l'URL Netlify définitive → revenir sur D2 pour y mettre la bonne valeur de `ALLOWED_ORIGIN` si pas encore fait.
- Vérification manuelle : ouvrir l'URL Netlify dans un navigateur, vérifier que la page se charge (pas de `file://`, cf. l'écran blanc rencontré en local) et que les appels `/api/*` passent (onglet réseau du navigateur, statut 200, pas d'erreur CORS).

### D5. Vérification bout-en-bout en conditions réelles (les deux)
- Parcours client complet (F1 → F6) depuis un téléphone sur un réseau différent de la machine de prod (ex. 4G), jusqu'à une vraie commande en base.
- Connexion admin (`POST /api/admin/login`) depuis la même URL Netlify, vérification des endpoints admin (liste des commandes, export).
- Vérifier le rejet CORS : une requête avec un `Origin` différent de `ALLOWED_ORIGIN` doit recevoir 403 (reprendre le test déjà couvert par `tests/` en local, mais le rejouer une fois en conditions réelles pour confirmer la configuration réseau).
- Reprendre explicitement la checklist CDC §13 (recette) point par point.

### D6. Mise à jour de la documentation projet (moi)
- `.ai/change-log.md` : consigner chaque vérification manuelle ci-dessus avec son résultat.
- `.ai/project-context.md` (État courant) : passer « État de préparation à la production » de *non prêt* à *déployé*, une fois D1-D5 validés.
- `.ai/mapping.md` : ajouter `netlify.toml` et son rôle.

## Dépendances entre missions
D1 → D4 (l'URL Tailscale doit être connue pour écrire `netlify.toml`). D4 → D2 (la valeur finale d'`ALLOWED_ORIGIN` dépend de l'URL Netlify, elle-même connue dès la création du site — donc D2 peut démarrer avec les secrets dès maintenant, et se compléter avec `ALLOWED_ORIGIN` une fois D4 commencé). D1, D2, D3 → D5. D5 → D6.

## Niveaux de test
Palier strict, mais infrastructure réelle non automatisable : chaque mission se termine par une **vérification manuelle documentée** (commande exécutée + résultat observé, consigné dans `.ai/change-log.md`), pas par une suite de tests automatisés. Les suites `npm test` existantes (136 backend + 33 frontend) restent la garantie de non-régression du code ; ce plan ne leur ajoute rien de nouveau à tester automatiquement, il vérifie que l'assemblage réseau fonctionne.

## Décisions en suspens — non bloquantes pour ce plan, mais à trancher avant une vraie saison de commandes
Ces points n'empêchent pas de dérouler D1-D6 (le backend tourne déjà avec des valeurs placeholder), mais la mise en production ne doit pas accepter de vraies commandes tant qu'ils ne sont pas réglés :
- Prix réels des 3 boudins (CDC §3/§12.1) — actuellement 10,00 €/kg placeholder.
- Date de conception/retrait réelle de la saison (CDC §4/§12.2) — actuellement `2026-12-13` placeholder.
- Durée de conservation des données clients (CDC §7.3/§12.4).
- `pickup_address` / `contact_phone` — actuellement vides (ajoutés cette session, affichés uniquement s'ils sont configurés).

## Prêt pour `/implementation`
Oui, pour la part qui m'incombe : initialiser le dépôt Git (D4, partie « Moi »), préparer `netlify.toml` avec un placeholder d'URL Tailscale, et te donner les commandes exactes de D1-D3 à exécuter toi-même sur la machine de prod. Le reste (D1-D3, la partie « Toi » de D4, D5) dépend de ton accès physique à la machine de production et de tes comptes externes (hébergeur Git, Netlify, Tailscale) — je ne peux pas les exécuter à ta place.
