# Backend — gestion des commandes de boudins

Référence fonctionnelle complète : `../docs/cahier-des-charges.md`. Décisions et raisons : `../.ai/decisions.md`.

## Installation

```sh
npm install
cp .env.example .env   # puis éditer .env, voir ci-dessous
npm run db:setup
npm start
```

## Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute local (défaut 3000). |
| `DB_PATH` | Chemin du fichier SQLite (défaut `data/boudins.db`). |
| `NONCE_SECRET` | Secret HMAC du nonce anti-replay (M3bis). Obligatoire. |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe admin partagé (M5). Obligatoire. Générer avec `node -e "console.log(require('bcryptjs').hashSync('mot-de-passe', 10))"`. |
| `ADMIN_JWT_SECRET` | Secret de signature des sessions admin (JWT, M5). Obligatoire. |
| `ALLOWED_ORIGIN` | Origine Netlify autorisée en CORS (M9). Sans cette variable, toute requête porteuse d'un en-tête `Origin` est refusée par défaut — comportement volontairement sûr tant que le site n'est pas déployé. |
| `MIN_DELAY_MS` | Délai minimum anti-bot en ms avant soumission d'une commande (M3bis). Optionnel, défaut 3000. |
| `BACKUP_DIR` | Dossier de destination des sauvegardes (M10). Optionnel, défaut `backups/`. |
| `BACKUP_RETENTION_DAYS` | Durée de conservation des sauvegardes avant purge (M10). Optionnel, défaut 30. |

Tous les secrets restent dans `.env`, jamais commités (`.gitignore`).

## Sécurité transverse (M9)

- En-têtes de sécurité : `helmet` (CSP, `X-Content-Type-Options`, etc.), actif par défaut sur toutes les réponses.
- CORS : restreint à `ALLOWED_ORIGIN` uniquement ; toute requête cross-origin non autorisée reçoit 403. Les appels sans en-tête `Origin` (curl, debug direct) ne sont pas concernés — CORS est une politique de navigateur, pas une authentification.
- Aucune donnée personnelle (nom, téléphone) n'apparaît jamais dans une URL : les ressources sont toujours identifiées par un id numérique opaque.
- Journalisation : les erreurs serveur et les échecs de connexion admin sont journalisés (`console.error`/`console.warn`) sans jamais inclure le corps de la requête ni le mot de passe reçu — voir `src/middleware/errorHandler.js` et `src/routes/admin/auth.js`.

## Exploitation (M10)

### Sauvegarde quotidienne

```sh
node scripts/backup.js
```

Produit une copie cohérente du fichier SQLite (via `VACUUM INTO`, sûre même en écriture concurrente WAL) dans `BACKUP_DIR`, puis purge les sauvegardes plus anciennes que `BACKUP_RETENTION_DAYS`. Script indépendant du code applicatif (CDC §10) : peut tourner alors que le serveur est actif.

**Planification (Linux, confirmé pour la machine de production)** — via systemd timer, voir `deploy/boudins-backup.{service,timer}` :

```sh
sudo cp deploy/boudins-backup.service deploy/boudins-backup.timer /etc/systemd/system/
# ajuster User= et WorkingDirectory= dans boudins-backup.service pour la machine réelle
sudo systemctl daemon-reload
sudo systemctl enable --now boudins-backup.timer
```

Ne pas oublier de copier périodiquement le contenu de `BACKUP_DIR` vers un stockage externe (disque, cloud personnel) — ce script ne fait que la copie locale cohérente, pas l'export hors machine (CDC §10).

### Démarrage automatique

Le serveur Express et Tailscale Funnel doivent redémarrer avec la machine. Pour le serveur, voir `deploy/boudins-backend.service` :

```sh
sudo cp deploy/boudins-backend.service /etc/systemd/system/
# ajuster User= et WorkingDirectory=
sudo systemctl daemon-reload
sudo systemctl enable --now boudins-backend.service
```

Pour Tailscale Funnel, suivre la documentation officielle Tailscale (`tailscaled` est déjà un service systemd à l'installation ; activer le funnel sur le port du backend une fois la machine configurée).

### Mises à jour

Avant chaque saison : `npm outdated`, `npm audit`, mise à jour du système (`apt upgrade` ou équivalent), puis relancer la suite de tests (`npm test`) avant de redéployer.
