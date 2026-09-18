import type { WorkshopTicket } from './api';

type PaymentTicket = Pick<
  WorkshopTicket,
  'status' | 'approvalStatus' | 'salesOrder' | 'qualityCheck' | 'delivery'
>;
type PaymentState = {
  key:
    | 'NOT_READY'
    | 'READY'
    | 'QUEUED'
    | 'IN_CASHIER'
    | 'BALANCE_DUE'
    | 'PAID'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REVIEW';
  label: string;
  description: string;
  variant: 'outline' | 'warning' | 'success' | 'danger';
  canPrepare: boolean;
  canDeliver: boolean;
  fullyPaid: boolean;
};

// Presentation only: API transactions remain authoritative for charging and delivery.
export function workshopPaymentState(ticket: PaymentTicket): PaymentState {
  const result = (
    key: PaymentState['key'],
    label: string,
    description: string,
    variant: PaymentState['variant'] = 'outline',
  ): PaymentState => ({
    key,
    label,
    description,
    variant,
    canPrepare: false,
    canDeliver: false,
    fullyPaid: false,
  });
  const order = ticket.salesOrder;
  const invoice = order?.invoice;
  if (ticket.status === 'CANCELLED')
    return result(
      'CANCELLED',
      'Orden cancelada',
      'No se prepara un nuevo cobro desde esta orden.',
      'danger',
    );
  if (invoice) {
    if (['CANCELLED', 'VOID', 'VOIDED'].includes(invoice.status))
      return result(
        'REVIEW',
        'Factura requiere revisión',
        'La factura está cancelada o anulada. Administración debe revisar el documento; no vuelvas a cobrar esta orden.',
        'danger',
      );
    const balance = Number(invoice.balance);
    if (
      typeof invoice.balance !== 'string' ||
      !/^-?\d+(\.\d+)?$/.test(invoice.balance) ||
      !Number.isFinite(balance) ||
      balance < 0
    )
      return result(
        'REVIEW',
        'Saldo requiere revisión',
        'No se puede confirmar el pago con el saldo recibido. Actualiza la orden o solicita una revisión.',
        'danger',
      );
    if (balance > 0)
      return result(
        'BALANCE_DUE',
        'Saldo pendiente',
        'La factura está emitida, pero falta completar el pago. No se habilita la entrega ni se crea otra factura.',
        'warning',
      );
    if (invoice.status !== 'PAID')
      return result(
        'REVIEW',
        'Pago por confirmar',
        'Saldo cero sin confirmación de pago. Revisa la factura antes de entregar.',
        'warning',
      );
    const delivered = ticket.status === 'DELIVERED' || Boolean(ticket.delivery);
    return {
      ...result(
        delivered ? 'DELIVERED' : 'PAID',
        delivered ? 'Pagada y entregada' : 'Pagada',
        delivered
          ? 'El cobro y la entrega están registrados.'
          : 'Cobro completo. La orden se cerrará como entregada al completar la facturación.',
        'success',
      ),
      fullyPaid: true,
      canDeliver: false,
    };
  }
  if (order) {
    if (['CANCELLED', 'COMPLETED'].includes(order.status))
      return result(
        'REVIEW',
        'Cobro requiere revisión',
        'La orden de cobro está cerrada sin una factura disponible. Solicita una revisión; no generes un cobro duplicado.',
        'danger',
      );
    return order.status === 'IN_CASHIER'
      ? result(
          'IN_CASHIER',
          'En atención en Caja',
          'El cajero tomó la orden. Todavía no se ha registrado el pago.',
          'warning',
        )
      : result(
          'QUEUED',
          'Pendiente de cobro',
          'La orden ya está en POS y Caja. El cajero confirma el comprobante y registra el pago.',
          'warning',
        );
  }
  if (
    ['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY'].includes(ticket.status) &&
    ['APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus)
  )
    return {
      ...result(
        'READY',
        'Lista para facturar',
        'El cliente aprobó el presupuesto. Envía la orden a Caja para facturar y completar el proceso.',
      ),
      canPrepare: true,
    };
  return result(
    'NOT_READY',
    'Pendiente de aprobación',
    'Diagnostica el vehículo, prepara la cotización y registra la aprobación del cliente.',
  );
}

export function workshopCashierPath(orderId: string) {
  return `/pos?order=${encodeURIComponent(orderId)}`;
}
