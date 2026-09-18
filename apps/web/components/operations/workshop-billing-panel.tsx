'use client';

import Link from 'next/link';
import { Loader2, Mail, Receipt, Send } from 'lucide-react';
import type { WorkshopTicket } from '@/lib/api';
import { canAccessPath, hasPermission } from '@/lib/authorization';
import { workshopCashierPath, workshopPaymentState } from '@/lib/workshop-payment';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentSession } from './session-required';

export function WorkshopBillingPanel({
  ticket,
  onSendToCashier,
  onEmailInvoice,
  pending = false,
}: {
  ticket: WorkshopTicket;
  onSendToCashier?: () => void;
  onEmailInvoice?: () => void;
  pending?: boolean;
}) {
  const session = useCurrentSession();
  const state = workshopPaymentState(ticket);
  const order = ticket.salesOrder;
  const invoice = order?.invoice;
  return (
    <section
      aria-label="Facturación y cierre de la orden"
      className="min-w-0 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4 text-primary" /> Facturación y cobro
        </h3>
        <Badge variant={state.variant}>{state.label}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
        {state.description}
      </p>
      <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Etapas de cobro">
        {[
          ['1. Presupuesto aprobado', ['APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus)],
          ['2. Factura emitida', Boolean(invoice)],
          ['3. Orden entregada', ticket.status === 'DELIVERED'],
        ].map(([label, done]) => (
          <li
            key={String(label)}
            className={done ? 'font-medium text-emerald-700' : 'text-muted-foreground'}
          >
            {done ? '✓ ' : ''}
            {label}
          </li>
        ))}
      </ol>
      {invoice ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <div className="col-span-2 min-w-0 sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Factura</dt>
            <dd className="break-words font-medium">{invoice.invoiceNumber}</dd>
          </div>
          <Amount label="Total factura" value={invoice.total} />
          <Amount label="Pagado registrado" value={invoice.paidAmount} />
          <Amount label="Saldo pendiente" value={invoice.balance} />
        </dl>
      ) : order ? (
        <p className="mt-3 text-sm">
          Total a cobrar, con ITBIS: <strong>{formatCurrency(Number(order.total))}</strong>
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {state.canPrepare &&
        onSendToCashier &&
        hasPermission(session, 'workorders.send_to_cashier') ? (
          <Button type="button" size="sm" disabled={pending} onClick={onSendToCashier}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {pending ? 'Enviando a Caja…' : 'Facturar en Caja'}
          </Button>
        ) : null}
        {order &&
        !invoice &&
        ['QUEUED', 'IN_CASHIER'].includes(state.key) &&
        canAccessPath(session, '/pos') ? (
          <Button asChild size="sm" variant="outline">
            <Link href={workshopCashierPath(order.id)}>Abrir en Caja</Link>
          </Button>
        ) : null}
        {invoice && canAccessPath(session, `/invoices/${invoice.id}/print`) ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/invoices/${invoice.id}/print`}>Ver comprobante</Link>
          </Button>
        ) : null}
        {invoice && onEmailInvoice && hasPermission(session, 'invoices.view') ? (
          <Button type="button" size="sm" variant="outline" onClick={onEmailInvoice}>
            <Mail className="h-4 w-4" /> Enviar factura por email
          </Button>
        ) : null}
      </div>
      {order && !invoice && !canAccessPath(session, '/pos') ? (
        <p className="mt-2 text-xs text-muted-foreground">
          El cobro se realiza desde POS y Caja.
        </p>
      ) : null}
    </section>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-semibold">
        {value !== '' && Number.isFinite(Number(value))
          ? formatCurrency(Number(value))
          : 'Por confirmar'}
      </dd>
    </div>
  );
}
