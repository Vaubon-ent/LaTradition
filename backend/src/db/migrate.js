const { SCHEMA_SQL } = require('./schema');

function migrate(db) {
  db.exec(SCHEMA_SQL);
}

module.exports = { migrate };
