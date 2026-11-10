const express = require('express');
const {
  listOrders,
  updateOrderStatus,
  updateOrderPaymentState,
  ORDER_STATUSES,
  PAID_STATUSES,
  getOrderById,
  getOrderItemsForEdit,
  applyOrderEdit,
  deleteOrder,
} = require('../../db/ordersRepo');
const { getSetting } = require('../../db/settingsRepo');
const { getActiveProductsById } = require('../../db/productsRepo');
const { DuplicatePhoneError } = require('../../db/customersRepo');
const { buildUpdatedOrderItems, OrderValidationError } = require('../../services/pricing');
const { validateCustomerInput, ValidationError } = require('../../services/validation');

function createAdminOrdersRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { status, search } = req.query;
    const season = req.query.season || getSetting(db, 'season');

    if (status && !ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide : ${status}` });
    }

    const orders = listOrders(db, { status, season, search });
    res.json({ orders });
  });

  router.patch('/:id/status', (req, res) => {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Statut invalide : ${status}` });
    }

    const updated = updateOrderStatus(db, req.params.id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    res.json({ ok: true });
  });

  // Payé / Récupéré découplés (demande directe du 2026-11-10, .ai/decisions.md
  // — revient sur l'Option A du 2026-11-08) : deux champs indépendants, chacun
  // modifiable seul, sans aucune règle de transition entre eux. Remplace
  // l'usage de PATCH /:id/status par le dashboard (celui-ci reste disponible
  // tel quel, pour compatibilité avec le filtre ?status= et l'export).
  router.patch('/:id/payment', (req, res) => {
    const { paid_status, picked_up } = req.body || {};

    if (paid_status === undefined && picked_up === undefined) {
      return res.status(400).json({ error: 'Aucun champ à modifier.' });
    }
    if (paid_status !== undefined && !PAID_STATUSES.includes(paid_status)) {
      return res.status(400).json({ error: `Statut de paiement invalide : ${paid_status}` });
    }
    if (picked_up !== undefined && typeof picked_up !== 'boolean') {
      return res.status(400).json({ error: 'picked_up doit être un booléen.' });
    }

    const updated = updateOrderPaymentState(db, req.params.id, { paid_status, picked_up });
    if (!updated) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    res.json({ ok: true });
  });

  // Édition PII + lignes de commande par l'admin (M-DASH5, .ai/decisions.md
  // 2026-11-08) : validation puis diff calculés avant tout accès en écriture,
  // pour ne jamais modifier le client si les lignes sont invalides (ou
  // inversement) — applyOrderEdit applique le tout dans une seule transaction.
  router.put('/:id', (req, res) => {
    const order = getOrderById(db, req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    let pii;
    try {
      pii = validateCustomerInput(req.body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const existingItems = getOrderItemsForEdit(db, order.id);
    const activeProductsById = getActiveProductsById(db);
    let diff;
    try {
      diff = buildUpdatedOrderItems(existingItems, req.body.items || [], activeProductsById);
    } catch (err) {
      if (err instanceof OrderValidationError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    try {
      applyOrderEdit(db, order.id, order.customer_id, pii, diff);
    } catch (err) {
      if (err instanceof DuplicatePhoneError) {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }

    res.json({ ok: true });
  });

  // Suppression complète d'une commande (demande directe du 2026-11-09) :
  // le client associé n'est jamais supprimé (deleteOrder, db/ordersRepo.js),
  // seulement la commande et ses lignes. Double confirmation gérée côté
  // front (popup admin) — aucune confirmation supplémentaire attendue ici.
  router.delete('/:id', (req, res) => {
    const deleted = deleteOrder(db, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminOrdersRouter };
