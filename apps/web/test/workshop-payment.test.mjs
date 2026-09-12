import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workshopPaymentState, workshopCashierPath } from '../lib/workshop-payment.ts';

const ticket = {
  status: 'IN_PROGRESS',
  approvalStatus: 'APPROVED',
  qualityCheck: null,
  salesOrder: null,
  delivery: null,
};
const approved = { ...ticket, status: 'APPROVED' };
const ready = { ...ticket, status: 'READY_FOR_DELIVERY', qualityCheck: { status: 'APPROVED' } };
const queued = {
  ...ready,
  salesOrder: { id: 'order', status: 'SENT_TO_CASHIER', total: '118', invoice: null },
};
const billed = (status, balance) => ({
  ...queued,
  salesOrder: {
    ...queued.salesOrder,
    status: 'COMPLETED',
    invoice: { status, balance, total: '118', paidAmount: '118' },
  },
});

test('la aprobación habilita facturación antes de iniciar la reparación', () => {
  assert.equal(workshopPaymentState(ticket).key, 'NOT_READY');
  assert.equal(workshopPaymentState(approved).canPrepare, true);
  assert.equal(workshopPaymentState(approved).fullyPaid, false);
  assert.equal(workshopPaymentState(queued).key, 'QUEUED');
  assert.equal(workshopPaymentState(queued).canPrepare, false);
  assert.equal(workshopPaymentState(queued).canDeliver, false);
  assert.equal(
    workshopPaymentState({ ...queued, salesOrder: { ...queued.salesOrder, status: 'IN_CASHIER' } })
      .key,
    'IN_CASHIER',
  );
});
test('emitir factura no equivale a pago: saldo y confirmación deben coincidir', () => {
  for (const status of ['ISSUED', 'PARTIALLY_PAID', 'PAID']) {
    assert.equal(workshopPaymentState(billed(status, '0.01')).key, 'BALANCE_DUE');
    assert.equal(workshopPaymentState(billed(status, '0.01')).canDeliver, false);
  }
  assert.equal(workshopPaymentState(billed('ISSUED', '0')).key, 'REVIEW');
  assert.equal(workshopPaymentState(billed('PAID', '0.00')).canDeliver, true);
  assert.equal(
    workshopPaymentState({ ...billed('PAID', '0'), qualityCheck: { status: 'REJECTED' } })
      .canDeliver,
    false,
  );
  assert.equal(
    workshopPaymentState({ ...billed('PAID', '0'), status: 'IN_PROGRESS' }).canDeliver,
    false,
  );
});
test('anulaciones, saldos inválidos y órdenes cerradas no aparecen como pagadas', () => {
  for (const status of ['CANCELLED', 'VOID', 'VOIDED']) {
    const state = workshopPaymentState(billed(status, '0'));
    assert.equal(state.key, 'REVIEW');
    assert.equal(state.fullyPaid, false);
    assert.equal(state.canDeliver, false);
  }
  for (const value of ['', ' ', null, undefined, '-1', 'NaN', 'Infinity'])
    assert.equal(workshopPaymentState(billed('PAID', value)).key, 'REVIEW');
  for (const status of ['CANCELLED', 'COMPLETED'])
    assert.equal(
      workshopPaymentState({ ...queued, salesOrder: { ...queued.salesOrder, status } }).key,
      'REVIEW',
    );
});
test('entrega y cancelación conservan estado propio, sin habilitar un segundo cobro', () => {
  const state = workshopPaymentState({
    ...billed('PAID', '0'),
    status: 'DELIVERED',
    delivery: { id: 'delivery' },
  });
  assert.equal(state.key, 'DELIVERED');
  assert.equal(state.canDeliver, false);
  assert.equal(state.canPrepare, false);
  assert.equal(workshopPaymentState({ ...ready, status: 'CANCELLED' }).key, 'CANCELLED');
});
test('enlace a caja identifica la orden sin ejecutar el cobro ni interpretar parámetros extra', () => {
  assert.equal(workshopCashierPath('order-1'), '/pos?order=order-1');
  assert.equal(workshopCashierPath('order&total=1'), '/pos?order=order%26total%3D1');
});
