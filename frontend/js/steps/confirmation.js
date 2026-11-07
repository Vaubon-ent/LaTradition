function init(container) {
  container.innerHTML = `
    <h2>Merci pour votre commande !</h2>
    <p data-role="total"></p>
    <p data-role="deadline"></p>
    <p data-role="address" hidden></p>
    <p data-role="contact" hidden></p>
    <p class="muted">Paiement en ligne : disponible prochainement.</p>
  `;
}

function formatEuros(cents) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// `conceptionDateStr` est une date calendaire (YYYY-MM-DD, sans heure) :
// on la construit en UTC puis on la formate avec timeZone: 'UTC' pour que le
// fuseau du navigateur du client ne puisse jamais la faire glisser d'un jour.
function formatDateLong(conceptionDateStr) {
  const [year, month, day] = conceptionDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

// Appelé par app.js uniquement après une confirmation serveur réussie
// (state.order non nul) : c'est le seul moment où le brouillon est nettoyé
// (.ai/decisions.md — F6/F7), jamais avant.
function enter(container, ctx) {
  ctx.clearDraftOnConfirmation();
}

function render(container, state) {
  const totalEl = container.querySelector('[data-role="total"]');
  const deadlineEl = container.querySelector('[data-role="deadline"]');
  if (state.order) {
    totalEl.textContent = `Total : ${formatEuros(state.order.total_cents)} €`;
    deadlineEl.textContent = `Date de retrait : ${formatDateLong(state.order.conception_date)}`;
  }

  const addressEl = container.querySelector('[data-role="address"]');
  const hasAddress = typeof state.pickup_address === 'string' && state.pickup_address.trim().length > 0;
  addressEl.hidden = !hasAddress;
  if (hasAddress) {
    addressEl.textContent = `Adresse de retrait : ${state.pickup_address}`;
  }

  const contactEl = container.querySelector('[data-role="contact"]');
  const hasContact = typeof state.contact_phone === 'string' && state.contact_phone.trim().length > 0;
  contactEl.hidden = !hasContact;
  if (hasContact) {
    contactEl.textContent = `Une question ? Contactez-nous au ${state.contact_phone}`;
  }
}

export { init, enter, render, formatDateLong };
