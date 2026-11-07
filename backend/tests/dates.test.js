import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  getOrderDeadlineDate,
  isOrderLocked,
  getLockInfo,
} from '../src/services/dates.js';

describe('getOrderDeadlineDate', () => {
  it('calcule la date limite à 7 jours civils avant la date de conception', () => {
    const deadline = getOrderDeadlineDate('2026-12-13');
    expect(deadline.toISODate()).toBe('2026-12-06');
  });

  it('reste correcte quand la fenêtre de 7 jours traverse le changement d’heure de printemps (29 mars 2026)', () => {
    // Conception le 2026-04-02 (jeudi) -> limite le 2026-03-26 (jeudi, encore à l'heure d'hiver).
    const deadline = getOrderDeadlineDate('2026-04-02');
    expect(deadline.toISODate()).toBe('2026-03-26');
    expect(deadline.offsetNameShort).toBe('UTC+1'); // CET, avant le passage à CEST
  });
});

describe('isOrderLocked', () => {
  const conceptionDate = '2026-12-13'; // date limite : 2026-12-06

  it('autorise une commande juste avant la date limite', () => {
    const now = DateTime.fromISO('2026-12-05T23:59:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked(conceptionDate, now)).toBe(false);
  });

  it('autorise une commande à la dernière seconde du jour limite', () => {
    const now = DateTime.fromISO('2026-12-06T23:59:59.999', { zone: 'Europe/Paris' });
    expect(isOrderLocked(conceptionDate, now)).toBe(false);
  });

  it('verrouille une commande 1 milliseconde après la limite', () => {
    const now = DateTime.fromISO('2026-12-07T00:00:00.000', { zone: 'Europe/Paris' });
    expect(isOrderLocked(conceptionDate, now)).toBe(true);
  });

  it('verrouille toute commande largement après la date de conception', () => {
    const now = DateTime.fromISO('2026-12-20T12:00:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked(conceptionDate, now)).toBe(true);
  });

  it('reste correct quand "maintenant" est après un changement d’heure survenu après la date limite', () => {
    // Limite le 2026-03-26 (heure d'hiver). "Maintenant" le 2026-03-29 (heure d'été, DST déjà passé).
    const conceptionAfterDst = '2026-04-02';
    const nowAfterDst = DateTime.fromISO('2026-03-29T12:00:00', { zone: 'Europe/Paris' });
    expect(isOrderLocked(conceptionAfterDst, nowAfterDst)).toBe(true);
  });
});

describe('getLockInfo', () => {
  it('renvoie un résumé cohérent', () => {
    const now = DateTime.fromISO('2026-12-01T10:00:00', { zone: 'Europe/Paris' });
    const info = getLockInfo('2026-12-13', now);
    expect(info).toEqual({
      conceptionDate: '2026-12-13',
      orderDeadline: '2026-12-06',
      locked: false,
    });
  });
});
