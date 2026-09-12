'use client';

import { ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Customer } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  formatCurrencyInput,
  formatCurrencyInputFromNumber,
  sanitizeCurrencyInput,
} from './currency-input';
import { PaymentCalculator } from './payment-calculator';
import type { PosTotals } from './types';
import { SplitPayments, type SplitPaymentRow } from './split-payments';

type PosPaymentPanelProps = {
  customers: Customer[];
  customerId: string;
  documentType: string;
  electronicInvoiceRequested: boolean;
  requiresE32Recipient: boolean;
  fiscalDocumentType: 'RNC' | 'CEDULA';
  fiscalDocumentNumber: string;
  fiscalDocumentValid: boolean;
  fiscalCustomerName?: string | null;
  paymentMethod: string;
  splitPayments: SplitPaymentRow[];
  onSplitPaymentsChange: (rows: SplitPaymentRow[]) => void;
  salePaymentMode: 'CASH' | 'CREDIT';
  dueDate?: string | null;
  customerLocked?: boolean;
  amountReceived: string;
  totals: PosTotals;
  message: string | null;
  canCompleteSale: boolean;
  isCompleting: boolean;
  onCustomerChange: (value: string) => void;
  onDocumentTypeChange: (value: string) => void;
  onFiscalDocumentTypeChange: (value: 'RNC' | 'CEDULA') => void;
  onFiscalDocumentNumberChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onAmountReceivedChange: (value: string) => void;
  onCompleteSale: () => void;
};

export function PosPaymentPanel({
  customers,
  customerId,
  documentType,
  electronicInvoiceRequested,
  requiresE32Recipient,
  fiscalDocumentType,
  fiscalDocumentNumber,
  fiscalDocumentValid,
  fiscalCustomerName,
  paymentMethod,
  splitPayments,
  onSplitPaymentsChange,
  salePaymentMode,
  dueDate,
  customerLocked = false,
  amountReceived,
  totals,
  message,
  canCompleteSale,
  isCompleting,
  onCustomerChange,
  onDocumentTypeChange,
  onFiscalDocumentTypeChange,
  onFiscalDocumentNumberChange,
  onPaymentMethodChange,
  onAmountReceivedChange,
  onCompleteSale,
}: PosPaymentPanelProps) {
  const cashInsufficient =
    paymentMethod === 'CASH' &&
    totals.requiredPayment > 0 &&
    totals.received < totals.requiredPayment;
  const cashPayment = paymentMethod === 'CASH';
  const creditSale = salePaymentMode === 'CREDIT';
  const requiresFiscalDocument = ['FISCAL_CREDIT_01', 'FISCAL_CREDIT_ELECTRONIC_31'].includes(
    documentType,
  );
  const requiresRnc = documentType === 'FISCAL_CREDIT_ELECTRONIC_31';
  const requiresRecipientDocument = requiresFiscalDocument || requiresE32Recipient;
  const fiscalLabel = requiresRnc ? 'E31' : requiresE32Recipient ? 'E32' : 'B01';

  return (
    <div className="space-y-2">
      <div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="customer">Cliente</Label>
            <select
              id="customer"
              value={customerId}
              disabled={customerLocked}
              onChange={(event) => onCustomerChange(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-zinc-100"
            >
              <option value="">Consumidor final</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            {requiresRecipientDocument ? (
              <p className="text-xs text-muted-foreground">
                {requiresE32Recipient
                  ? 'Por superar RD$250,000, E32 requiere identificar y registrar al comprador.'
                  : 'Requiere un cliente registrado para sustentar el crédito fiscal.'}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="documentType">Comprobante</Label>
            <select
              id="documentType"
              value={documentType}
              onChange={(event) => onDocumentTypeChange(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {electronicInvoiceRequested ? (
                <>
                  <option value="CONSUMER_ELECTRONIC_32">Factura de consumo electrónica E32</option>
                  <option value="FISCAL_CREDIT_ELECTRONIC_31">
                    Factura de crédito fiscal electrónica E31
                  </option>
                </>
              ) : (
                <>
                  <option value="CONSUMER_02">Factura de consumo B02</option>
                  <option value="FISCAL_CREDIT_01">Factura de crédito fiscal B01</option>
                </>
              )}
            </select>
            {electronicInvoiceRequested ? (
              <p className="text-xs text-muted-foreground">
                Esta orden solicita e-CF; la copia se enviará al correo configurado cuando Resend
                esté activo.
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="paymentMethod">Método de pago</Label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
              className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="MIXED">Mixto</option>
            </select>
          </div>
        </div>

        {requiresRecipientDocument ? (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="mb-3">
              <p className="font-semibold text-zinc-950">Datos fiscales para {fiscalLabel}</p>
              <p className="text-xs text-muted-foreground">
                {requiresRnc
                  ? 'E31 requiere el RNC del cliente. Se valida antes de facturar.'
                  : requiresE32Recipient
                    ? 'E32 igual o superior a RD$250,000 requiere el RNC o la cédula y el nombre del comprador.'
                    : 'Indica el RNC o la cédula del cliente. El documento se valida antes de facturar.'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-2">
                <Label htmlFor="fiscalDocumentType">Documento</Label>
                <select
                  id="fiscalDocumentType"
                  value={fiscalDocumentType}
                  disabled={requiresRnc}
                  onChange={(event) =>
                    onFiscalDocumentTypeChange(event.target.value as 'RNC' | 'CEDULA')
                  }
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="RNC">RNC</option>
                  <option value="CEDULA">Cédula</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscalDocumentNumber">
                  {fiscalDocumentType === 'RNC' ? 'RNC del cliente' : 'Cédula del cliente'}
                </Label>
                <Input
                  id="fiscalDocumentNumber"
                  inputMode="numeric"
                  value={fiscalDocumentNumber}
                  onChange={(event) => onFiscalDocumentNumberChange(event.target.value)}
                  placeholder={fiscalDocumentType === 'RNC' ? '000-00000-0' : '000-0000000-0'}
                />
              </div>
            </div>
            {fiscalDocumentNumber ? (
              <p
                className={
                  fiscalDocumentValid && fiscalCustomerName
                    ? 'mt-2 text-xs text-success'
                    : 'mt-2 text-xs text-danger'
                }
              >
                {fiscalDocumentValid
                  ? fiscalCustomerName
                    ? `Documento válido. Cliente: ${fiscalCustomerName}.`
                    : 'Documento válido, pero no hay un cliente activo registrado con ese dato.'
                  : `Verifica el ${fiscalDocumentType === 'RNC' ? 'RNC' : 'número de cédula'}.`}
              </p>
            ) : null}
          </div>
        ) : null}

        {creditSale ? (
          <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            Venta fiada aprobada. En esta factura se cobra únicamente la inicial de{' '}
            <strong>{formatCurrency(totals.requiredPayment)}</strong>
            {dueDate
              ? ` y el saldo vence el ${new Date(dueDate).toLocaleDateString('es-DO')}.`
              : '.'}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-2 text-white">
          <p className="text-xs text-zinc-300">Total a cobrar</p>
          <p className="mt-0.5 text-lg font-bold">{formatCurrency(totals.requiredPayment)}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-blue-950">
          <p className="text-xs text-blue-700">Recibido</p>
          <p className="mt-0.5 text-lg font-bold">{formatCurrency(totals.received)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">
          <p className="text-xs">Devuelta</p>
          <p className="mt-0.5 text-lg font-bold">{formatCurrency(totals.change)}</p>
        </div>
      </div>

      {paymentMethod === 'MIXED' ? (
        <SplitPayments
          rows={splitPayments}
          required={totals.requiredPayment}
          disabled={isCompleting}
          onChange={onSplitPaymentsChange}
        />
      ) : cashPayment ? (
        <PaymentCalculator
          total={totals.requiredPayment}
          amountReceived={amountReceived}
          disabled={isCompleting}
          onAmountChange={onAmountReceivedChange}
          summary={<PaymentTotalsSummary totals={totals} creditSale={creditSale} message={null} />}
          action={
            <CompleteSaleAction
              disabled={!canCompleteSale || cashInsufficient || isCompleting}
              isCompleting={isCompleting}
              onComplete={onCompleteSale}
            />
          }
        />
      ) : (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
          <Label htmlFor="amountReceived">Monto pagado</Label>
          <Input
            id="amountReceived"
            type="text"
            inputMode="decimal"
            value={amountReceived}
            disabled
            onChange={(event) => onAmountReceivedChange(sanitizeCurrencyInput(event.target.value))}
            onBlur={(event) => onAmountReceivedChange(formatCurrencyInput(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            placeholder={totals.requiredPayment ? formatCurrencyInputFromNumber(totals.requiredPayment) : '0.00'}
            className="h-14 text-2xl font-semibold"
          />
          <p className="text-xs text-muted-foreground">Tarjeta y transferencia se registran por el monto exacto requerido.</p>
        </div>
      )}

      {!cashPayment ? (
        <PaymentTotalsSummary totals={totals} creditSale={creditSale} message={message} />
      ) : null}

      {cashInsufficient ? (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          El efectivo recibido debe cubrir el monto requerido para completar la venta.
        </p>
      ) : null}

      {!cashPayment ? (
        <CompleteSaleAction
          disabled={!canCompleteSale || cashInsufficient || isCompleting}
          isCompleting={isCompleting}
          onComplete={onCompleteSale}
        />
      ) : null}
    </div>
  );
}

function PaymentTotalsSummary({
  totals,
  creditSale,
  message,
}: {
  totals: PosTotals;
  creditSale: boolean;
  message: string | null;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50/60 p-2">
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
        <div className="flex justify-between"><span>Descuento</span><span>{formatCurrency(totals.discount)}</span></div>
        <div className="flex justify-between"><span>ITBIS</span><span>{formatCurrency(totals.tax)}</span></div>
        <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-sm font-bold text-zinc-950"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
        {creditSale ? (
          <>
            <div className="flex justify-between font-semibold text-sky-800"><span>Inicial a cobrar</span><span>{formatCurrency(totals.requiredPayment)}</span></div>
            <div className="flex justify-between font-semibold text-amber-800"><span>Saldo pendiente</span><span>{formatCurrency(totals.remainingBalance)}</span></div>
          </>
        ) : null}
        <div className="flex justify-between font-semibold text-success"><span>Devuelta</span><span>{formatCurrency(totals.change)}</span></div>
      </div>
      {message ? <p className="mt-1.5 line-clamp-1 text-[10px] text-muted-foreground">{message}</p> : null}
    </div>
  );
}

function CompleteSaleAction({
  disabled,
  isCompleting,
  onComplete,
}: {
  disabled: boolean;
  isCompleting: boolean;
  onComplete: () => void;
}) {
  return (
    <div>
      <Button type="button" className="h-10 w-full text-xs font-bold" disabled={disabled} onClick={onComplete}>
        <ReceiptText className="h-4 w-4" />
        {isCompleting ? 'Facturando...' : 'Facturar e imprimir'}
      </Button>
      <p className="mt-1.5 text-center text-[10px] leading-3 text-muted-foreground">
        Al confirmar, se emite la factura y se abre el recibo para imprimir automáticamente.
      </p>
    </div>
  );
}
