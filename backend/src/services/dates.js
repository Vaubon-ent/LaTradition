const { DateTime } = require('luxon');

const TIMEZONE = 'Europe/Paris';

// conception_date et order_deadline sont toutes les deux des dates saisies
// manuellement par l'admin (demande explicite du 2026-11-10, .ai/decisions.md)
// — revient sur M3, qui calculait order_deadline = conception_date - 7 jours.
// Même validation pour les deux (date calendaire valide en Europe/Paris).
function parseDateString(dateStr, label = 'Date') {
  const dt = DateTime.fromISO(dateStr, { zone: TIMEZONE }).startOf('day');
  if (!dt.isValid) {
    throw new Error(`${label} invalide : ${dateStr}`);
  }
  return dt;
}

// Dernier instant où une commande est encore acceptée : 23:59:59.999 (Europe/
// Paris) du jour de order_deadline.
function getLockMoment(orderDeadlineStr) {
  return parseDateString(orderDeadlineStr, 'Date limite').endOf('day');
}

function isOrderLocked(orderDeadlineStr, now = DateTime.now().setZone(TIMEZONE)) {
  return now > getLockMoment(orderDeadlineStr);
}

function getLockInfo(conceptionDateStr, orderDeadlineStr, now = DateTime.now().setZone(TIMEZONE)) {
  return {
    conceptionDate: conceptionDateStr,
    orderDeadline: orderDeadlineStr,
    locked: isOrderLocked(orderDeadlineStr, now),
  };
}

module.exports = {
  TIMEZONE,
  parseDateString,
  getLockMoment,
  isOrderLocked,
  getLockInfo,
};
