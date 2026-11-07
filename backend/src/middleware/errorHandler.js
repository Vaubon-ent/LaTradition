// Gestionnaire d'erreurs centralisé (CDC §10 : logs des erreurs serveur
// sans données personnelles). Ne journalise jamais req.body/req.query (une
// commande ou une connexion échouée peut contenir nom/téléphone), uniquement
// le message et la pile de l'erreur elle-même, ainsi que la méthode/route
// (jamais de valeur de paramètre).
function errorHandler(err, req, res, _next) {
  console.error(`[server-error] ${req.method} ${req.path} - ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Erreur interne du serveur.' });
}

module.exports = { errorHandler };
