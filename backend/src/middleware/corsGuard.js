// Restriction CORS à l'origine Netlify (CDC §9, décision M9 : bloquer par
// défaut tant que ALLOWED_ORIGIN n'est pas configuré en production). Pas de
// dépendance au package `cors` : la logique voulue est volontairement
// simple (une seule origine autorisée), dans le même esprit que les autres
// middlewares du projet (nonce, anti-abus) écrits à la main.
//
// Les requêtes sans en-tête Origin (curl, appels serveur-à-serveur via le
// proxy Netlify, usage direct pour debug) ne sont pas concernées par CORS —
// c'est un mécanisme imposé par les navigateurs, pas une authentification —
// et passent donc toujours.
function createCorsGuard(allowedOrigin) {
  return function corsGuard(req, res, next) {
    const origin = req.headers.origin;

    if (origin) {
      if (!allowedOrigin || origin !== allowedOrigin) {
        return res.status(403).json({ error: 'Origine non autorisée.' });
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    }

    next();
  };
}

module.exports = { createCorsGuard };
