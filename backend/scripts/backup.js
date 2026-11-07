#!/usr/bin/env node
// Sauvegarde quotidienne du fichier SQLite de production (CDC §10, M10).
// Usage : node scripts/backup.js [--db <chemin>] [--dest <dossier>]
//
// `VACUUM INTO` plutôt qu'une copie de fichier : produit un instantané
// cohérent même si le serveur écrit en parallèle (mode WAL, M2) — une copie
// directe de boudins.db pourrait capturer un état incohérent avec
// boudins.db-wal.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_RETENTION_DAYS = 30;

function parseArgs(argv) {
  const args = {
    db: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'boudins.db'),
    dest: process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'),
    retentionDays: process.env.BACKUP_RETENTION_DAYS ? Number(process.env.BACKUP_RETENTION_DAYS) : DEFAULT_RETENTION_DAYS,
  };
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--db') args.db = argv[i + 1];
    if (argv[i] === '--dest') args.dest = argv[i + 1];
  }
  return args;
}

function backup({ db: dbPath, dest, retentionDays = DEFAULT_RETENTION_DAYS }) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Fichier SQLite introuvable : ${dbPath}`);
  }
  fs.mkdirSync(dest, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(dest, `boudins-${timestamp}.db`);

  const source = new Database(dbPath);
  try {
    source.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
  } finally {
    source.close();
  }

  purgeOldBackups(dest, retentionDays);
  return destPath;
}

// Purge au-delà de retentionDays : la machine reste allumée toute la saison
// (plusieurs mois), une sauvegarde quotidienne sans purge finirait par
// remplir le disque. 30 jours par défaut couvre largement la fenêtre entre
// deux incidents détectés.
function purgeOldBackups(dest, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(dest)) {
    if (!file.startsWith('boudins-') || !file.endsWith('.db')) continue;
    const filePath = path.join(dest, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
    }
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const destPath = backup(args);
    console.log(`Sauvegarde créée : ${destPath}`);
  } catch (err) {
    console.error(`Échec de la sauvegarde : ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { backup, purgeOldBackups, parseArgs, DEFAULT_RETENTION_DAYS };
