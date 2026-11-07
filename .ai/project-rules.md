# Règles du projet — LaTradition (gestion des commandes de boudins)

## Stack technique retenue
- Langage(s) : JavaScript (Node.js LTS côté serveur, vanilla JS côté client ; Svelte + Vite envisageable côté front si besoin de réactivité).
- Frameworks / bibliothèques principales :
  - Back : Express (ou Hono), `better-sqlite3`/`sqlite3`, `exceljs` (export xlsx), bcrypt/argon2 (hash admin), helmet.
  - Front : HTML/CSS/JS vanilla, déployé sur Netlify.
  - Base de données : SQLite (fichier local, machine de Samuel, France).
  - Accès externe : Tailscale Funnel (`*.ts.net`, HTTPS), proxy `/api/*` via `netlify.toml`.
  - Paiement (hors V1) : Stripe Checkout.
- Raison du choix (y compris arbitrage boucle de rétroaction IA / familiarité / écosystème) :
  - Volume très faible (~100 clients, quelques centaines de commandes/an, usage saisonnier) : pas besoin d'une stack à forte scalabilité.
  - Un seul langage (JS) côté front et back, écosystème mature et très familier pour un agent IA (meilleure boucle de rétroaction que des alternatives plus strictement typées mais moins bien maîtrisées ici).
  - SQLite + machine locale + Tailscale Funnel évitent tout hébergement payant ou gestion de serveur complexe, cohérent avec un projet associatif/familial à très faible budget.
  - Netlify (gratuit) + proxy évite les soucis de CORS et donne HTTPS automatique côté client.

## Conventions de code
- Langue de l'interface utilisateur : français.
- Langue du code, des commentaires, des noms de variables/fonctions : anglais.
- Montants toujours stockés et manipulés en centimes (entiers), jamais en flottants.
- Tout calcul de prix et toute validation de commande sont effectués côté serveur ; le front ne fait qu'afficher une estimation.
- Requêtes SQL paramétrées uniquement.

## Contraintes techniques
- Express écoute sur `localhost` uniquement ; seul Tailscale Funnel expose le service.
- Routes admin protégées par middleware d'authentification, sans exception.
- Secrets dans `.env`, jamais commités.
- Rate limiting sur `POST /api/orders` et `POST /api/admin/login`.
- Dates gérées côté serveur avec le fuseau `Europe/Paris`.
- Pas de données personnelles dans les URL.

## Notes
Ce fichier prime sur les instructions `ai-dev-framework` sauf sur les règles marquées [ABSOLUTE].

Le détail complet des choix (modèle de données, endpoints API, règles métier, sécurité, exploitation) est documenté dans `docs/cahier-des-charges.md`, qui reste la référence fonctionnelle de premier niveau pour ce projet.
