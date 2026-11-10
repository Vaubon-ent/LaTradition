import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { parseDateString, isOrderLocked, getLockInfo } from '../src/services/dates.js';

// order_deadline est désormais saisie manuellement, indépendamment de
// conception_date (demande explicite du 2026-11-10, .ai/decisions.md — revient
// sur M3, qui la calculait à conception_date - 7 jours civils).
describe('parseDateString', () => {
  it('accepte une date calendaire valide', () => {
    expect(() => parseDateString('2026-12-06', 'Date limite')).not.toThrow();
  });

  it('rejette une date invalide avec le libellé fourni dans le message', () => {
    expect(() => parseDateString('pas-une-date', 'Date limite')).toThrow('Date limite invalide');
  });
});

describe('isOrderLocked', () => {
  const orderDeadline = '2026-12-06';

  it('autorise une commande juste avant la date limite', () => {
    const now = DateTime.fromISO('2026-12-05T23:59:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked(orderDeadline, now)).toBe(false);
  });

  it('autorise une commande à la dernière seconde du jour limite', () => {
    const now = DateTime.fromISO('2026-12-06T23:59:59.999', { zone: 'Europe/Paris' });
    expect(isOrderLocked(orderDeadline, now)).toBe(false);
  });

  it('verrouille une commande 1 milliseconde après la limite', () => {
    const now = DateTime.fromISO('2026-12-07T00:00:00.000', { zone: 'Europe/Paris' });
    expect(isOrderLocked(orderDeadline, now)).toBe(true);
  });

  it('verrouille toute commande largement après la date limite', () => {
    const now = DateTime.fromISO('2026-12-20T12:00:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked(orderDeadline, now)).toBe(true);
  });

  it('reste correct quand "maintenant" est après un changement d’heure survenu après la date limite', () => {
    // Limite le 2026-03-26 (heure d'hiver). "Maintenant" le 2026-03-29 (heure d'été, DST déjà passé).
    const nowAfterDst = DateTime.fromISO('2026-03-29T12:00:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked('2026-03-26', nowAfterDst)).toBe(true);
  });
});

describe('getLockInfo', () => {
  it('renvoie un résumé cohérent, conception_date et order_deadline indépendantes', () => {
    const now = DateTime.fromISO('2026-12-01T10:00:00', { zone: 'Europe/Paris' });
    const info = getLockInfo('2026-12-13', '2026-12-06', now);
    expect(info).toEqual({
      conceptionDate: '2026-12-13',
      orderDeadline: '2026-12-06',
      locked: false,
    });
  });
});
