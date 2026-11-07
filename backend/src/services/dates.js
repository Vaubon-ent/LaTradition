const { DateTime } = require('luxon');

const TIMEZONE = 'Europe/Paris';
const ORDER_DEADLINE_OFFSET_DAYS = 7;

function parseConceptionDate(conceptionDateStr) {
  const dt = DateTime.fromISO(conceptionDateStr, { zone: TIMEZONE }).startOf('day');
  if (!dt.isValid) {
    throw new Error(`Date de conception invalide : ${conceptionDateStr}`);
  }
  return dt;
}

// Jour calendaire limite (en Europe/Paris) : conception_date - 7 jours civils.
// `.minus({ days })` sur un DateTime zoné effectue une soustraction calendaire
// (conserve l'heure locale), pas une soustraction de 7×24h — important lors
// d'un changement d'heure DST entre les deux dates.
function getOrderDeadlineDate(conceptionDateStr) {
  return parseConceptionDate(conceptionDateStr).minus({ days: ORDER_DEADLINE_OFFSET_DAYS });
}

// Dernier instant où une commande est encore acceptée : 23:59:59.999 du jour
// limite, en Europe/Paris. Après cet instant, le formulaire est verrouillé.
function getLockMoment(conceptionDateStr) {
  return getOrderDeadlineDate(conceptionDateStr).endOf('day');
}

function isOrderLocked(conceptionDateStr, now = DateTime.now().setZone(TIMEZONE)) {
  return now > getLockMoment(conceptionDateStr);
}

function getLockInfo(conceptionDateStr, now = DateTime.now().setZone(TIMEZONE)) {
  return {
    conceptionDate: conceptionDateStr,
    orderDeadline: getOrderDeadlineDate(conceptionDateStr).toISODate(),
    locked: isOrderLocked(conceptionDateStr, now),
  };
}

module.exports = {
  TIMEZONE,
  ORDER_DEADLINE_OFFSET_DAYS,
  parseConceptionDate,
  getOrderDeadlineDate,
  getLockMoment,
  isOrderLocked,
  getLockInfo,
};
