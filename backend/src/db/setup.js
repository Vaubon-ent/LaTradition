require('dotenv').config();
const path = require('path');
const { getDb } = require('./connection');
const { migrate } = require('./migrate');
const { seed } = require('./seed');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'boudins.db');
const db = getDb(dbPath);
migrate(db);
seed(db);
db.close();

console.log(`Base migrée et initialisée : ${dbPath}`);
