// Infos par campagne (saison) : adresse et horaire de retrait, susceptibles
// de changer d'une saison à l'autre (.ai/decisions.md) — distinctes du
// singleton global `settings`.

function getCampaign(db, season) {
  return db.prepare('SELECT season, pickup_address, pickup_time FROM campaigns WHERE season = ?').get(season);
}

// Met à jour uniquement les champs fournis (undefined = inchangé), en
// conservant les valeurs existantes de l'autre champ le cas échéant.
function upsertCampaign(db, season, { pickup_address, pickup_time } = {}) {
  const existing = getCampaign(db, season);
  const next = {
    season,
    pickup_address: pickup_address !== undefined ? pickup_address : existing?.pickup_address || '',
    pickup_time: pickup_time !== undefined ? pickup_time : existing?.pickup_time || '',
  };
  db.prepare(
    `INSERT INTO campaigns (season, pickup_address, pickup_time) VALUES (@season, @pickup_address, @pickup_time)
     ON CONFLICT(season) DO UPDATE SET pickup_address = excluded.pickup_address, pickup_time = excluded.pickup_time`
  ).run(next);
}

module.exports = { getCampaign, upsertCampaign };
