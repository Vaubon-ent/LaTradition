import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { setSetting } from '../src/db/settingsRepo.js';
import { upsertCampaign } from '../src/db/campaignsRepo.js';

describe('GET /api/settings/public', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('renvoie la date de conception, la date limite (saisie manuelle), l’état de verrouillage et un nonce', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).get('/api/settings/public');

    expect(res.status).toBe(200);
    expect(res.body.conceptionDate).toBe('2026-12-13');
    expect(res.body.orderDeadline).toBe('2026-12-06');
    expect(typeof res.body.locked).toBe('boolean');
    expect(typeof res.body.nonce).toBe('string');
    expect(res.body.nonce.split('.')).toHaveLength(4);
  });

  it('renvoie une chaîne vide pour news tant qu’aucune actualité n’est configurée', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.news).toBe('');
  });

  it('renvoie le contenu de news une fois configuré', async () => {
    const built = buildTestApp();
    db = built.db;
    setSetting(db, 'news', 'Les prix augmentent cette année, commandez vite !');

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.news).toBe('Les prix augmentent cette année, commandez vite !');
  });

  it('renvoie une chaîne vide pour pickup_address, pickup_time et contact_phone tant qu’ils ne sont pas configurés', async () => {
    const built = buildTestApp();
    db = built.db;

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.pickup_address).toBe('');
    expect(res.body.pickup_time).toBe('');
    expect(res.body.contact_phone).toBe('');
  });

  it('renvoie pickup_address/pickup_time (campagne de la saison courante) et contact_phone une fois configurés', async () => {
    const built = buildTestApp();
    db = built.db;
    // Saison courante = '2026' (seed de test, voir db/seed.js).
    upsertCampaign(db, '2026', {
      pickup_address: '12 rue de la Tradition, 12345 Boudinville',
      pickup_time: 'à partir de 16h',
    });
    setSetting(db, 'contact_phone', '06 11 22 33 44');

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.pickup_address).toBe('12 rue de la Tradition, 12345 Boudinville');
    expect(res.body.pickup_time).toBe('à partir de 16h');
    expect(res.body.contact_phone).toBe('06 11 22 33 44');
  });

  it('ne renvoie jamais la campagne d’une autre saison', async () => {
    const built = buildTestApp();
    db = built.db;
    upsertCampaign(db, '2025', { pickup_address: 'Ancienne adresse', pickup_time: 'Ancien horaire' });

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.pickup_address).toBe('');
    expect(res.body.pickup_time).toBe('');
  });

  it('renvoie locked: true quand la date limite (saisie manuelle) est déjà passée', async () => {
    const built = buildTestApp();
    db = built.db;
    setSetting(db, 'order_deadline', '2000-01-10'); // largement dans le passé

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.locked).toBe(true);
  });

  it('ne verrouille jamais du seul fait que conception_date soit dans le passé : seule order_deadline compte', async () => {
    const built = buildTestApp();
    db = built.db;
    setSetting(db, 'conception_date', '2000-01-10'); // order_deadline (seed) reste dans le futur

    const res = await request(built.app).get('/api/settings/public');

    expect(res.body.locked).toBe(false);
  });

  it('renvoie une erreur 500 si conception_date n’est pas configurée', async () => {
    const built = buildTestApp({ withSeed: false });
    db = built.db;

    const res = await request(built.app).get('/api/settings/public');

    expect(res.status).toBe(500);
  });

  it('renvoie une erreur 500 si order_deadline n’est pas configurée', async () => {
    const built = buildTestApp();
    db = built.db;
    db.prepare("DELETE FROM settings WHERE key = 'order_deadline'").run();

    const res = await request(built.app).get('/api/settings/public');

    expect(res.status).toBe(500);
  });
});
