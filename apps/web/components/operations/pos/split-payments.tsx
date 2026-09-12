'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { formatCurrencyInput, parseCurrencyInput, sanitizeCurrencyInput } from './currency-input';

export type SplitPaymentRow = {
  id: string;
  method: string;
  amount: string;
  amountReceived: string;
  reference: string;
};
export const paymentMethods = [
  ['CASH', 'Efectivo'],
  ['CARD', 'Tarjeta'],
  ['TRANSFER', 'Transferencia'],
  ['CHECK', 'Cheque'],
  ['OTHER', 'Otro medio'],
] as const;

export function splitPaymentSummary(rows: SplitPaymentRow[], required: number) {
  const appliedCents = rows.reduce(
    (sum, row) => sum + Math.round(parseCurrencyInput(row.amount) * 100),
    0,
  );
  const changeCents = rows.reduce(
    (sum, row) =>
      sum +
      (row.method === 'CASH'
        ? Math.max(
            0,
            Math.round(
              (parseCurrencyInput(row.amountReceived) - parseCurrencyInput(row.amount)) * 100,
            ),
          )
        : 0),
    0,
  );
  const remainingCents = Math.round(required * 100) - appliedCents;
  const valid =
    rows.length > 0 &&
    remainingCents === 0 &&
    rows.filter((row) => row.method === 'CASH').length <= 1 &&
    rows.every(
      (row) =>
        parseCurrencyInput(row.amount) > 0 &&
        (row.method !== 'CASH' ||
          parseCurrencyInput(row.amountReceived) >= parseCurrencyInput(row.amount)) &&
        (!['CHECK', 'OTHER'].includes(row.method) || Boolean(row.reference.trim())),
    );
  return {
    applied: appliedCents / 100,
    change: changeCents / 100,
    remaining: remainingCents / 100,
    valid,
  };
}

export function SplitPayments({
  rows,
  required,
  disabled,
  onChange,
}: {
  rows: SplitPaymentRow[];
  required: number;
  disabled: boolean;
  onChange: (rows: SplitPaymentRow[]) => void;
}) {
  const summary = splitPaymentSummary(rows, required);
  function update(id: string, field: keyof SplitPaymentRow, value: string) {
    onChange(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Distribuye el importe entre los medios recibidos. La devuelta corresponde únicamente al
        efectivo.
      </p>
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pago {index + 1}</p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Eliminar pago ${index + 1}`}
              disabled={disabled || rows.length <= 1}
              onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`method-${row.id}`}>Medio</Label>
              <select
                id={`method-${row.id}`}
                disabled={disabled}
                value={row.method}
                onChange={(event) => update(row.id, 'method', event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {paymentMethods.map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={
                      value === 'CASH' &&
                      rows.some((item) => item.id !== row.id && item.method === 'CASH')
                    }
                  >
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`amount-${row.id}`}>Importe aplicado</Label>
              <Input
                id={`amount-${row.id}`}
                inputMode="decimal"
                disabled={disabled}
                value={row.amount}
                onChange={(event) =>
                  update(row.id, 'amount', sanitizeCurrencyInput(event.target.value))
                }
                onBlur={(event) =>
                  update(row.id, 'amount', formatCurrencyInput(event.target.value))
                }
              />
            </div>
            {row.method === 'CASH' ? (
              <div className="space-y-1">
                <Label htmlFor={`received-${row.id}`}>Efectivo recibido</Label>
                <Input
                  id={`received-${row.id}`}
                  inputMode="decimal"
                  disabled={disabled}
                  value={row.amountReceived}
                  onChange={(event) =>
                    update(row.id, 'amountReceived', sanitizeCurrencyInput(event.target.value))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor={`reference-${row.id}`}>
                Referencia{' '}
                {['CHECK', 'OTHER'].includes(row.method) ? '(obligatoria)' : '(opcional)'}
              </Label>
              <Input
                id={`reference-${row.id}`}
                maxLength={120}
                disabled={disabled}
                value={row.reference}
                onChange={(event) => update(row.id, 'reference', event.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || rows.length >= 10}
          onClick={() =>
            onChange([
              ...rows,
              {
                id: crypto.randomUUID(),
                method: 'CARD',
                amount: '',
                amountReceived: '',
                reference: '',
              },
            ])
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Agregar medio
        </Button>
        <p
          role="status"
          className={
            summary.remaining === 0
              ? 'text-sm font-medium text-success'
              : 'text-sm font-medium text-amber-700'
          }
        >
          {summary.remaining < 0 ? 'Exceso aplicado' : 'Por distribuir'}:{' '}
          {formatCurrency(Math.abs(summary.remaining))}
        </p>
      </div>
    </div>
  );
}
