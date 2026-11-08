import { describe, it, expect, afterEach } from 'vitest';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { getCampaign, upsertCampaign } from '../src/db/campaignsRepo.js';

describe('campaignsRepo', () => {
  let db;
  afterEach(() => db?.close());

  it('renvoie undefined pour une saison sans campagne enregistrée', () => {
    db = getDb(':memory:');
    migrate(db);

    expect(getCampaign(db, '2026')).toBeUndefined();
  });

  it('crée une campagne avec les deux champs fournis', () => {
    db = getDb(':memory:');
    migrate(db);

    upsertCampaign(db, '2026', { pickup_address: '1 allée Jean Giraudoux, 21000 Dijon', pickup_time: 'à partir de 16h' });

    expect(getCampaign(db, '2026')).toMatchObject({
      season: '2026',
      pickup_address: '1 allée Jean Giraudoux, 21000 Dijon',
      pickup_time: 'à partir de 16h',
    });
  });

  it('met à jour un seul champ sans écraser l’autre déjà enregistré', () => {
    db = getDb(':memory:');
    migrate(db);
    upsertCampaign(db, '2026', { pickup_address: 'Adresse initiale', pickup_time: 'Horaire initial' });

    upsertCampaign(db, '2026', { pickup_time: 'Nouvel horaire' });

    expect(getCampaign(db, '2026')).toMatchObject({
      pickup_address: 'Adresse initiale',
      pickup_time: 'Nouvel horaire',
    });
  });

  it('garde des campagnes distinctes par saison', () => {
    db = getDb(':memory:');
    migrate(db);
    upsertCampaign(db, '2026', { pickup_address: 'Adresse 2026', pickup_time: 'Horaire 2026' });
    upsertCampaign(db, '2027', { pickup_address: 'Adresse 2027', pickup_time: 'Horaire 2027' });

    expect(getCampaign(db, '2026').pickup_address).toBe('Adresse 2026');
    expect(getCampaign(db, '2027').pickup_address).toBe('Adresse 2027');
  });
});
