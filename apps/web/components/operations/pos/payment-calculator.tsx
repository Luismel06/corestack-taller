'use client';

import { Delete, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  appendCurrencyInput,
  backspaceCurrencyInput,
  clearCurrencyInput,
  formatCurrencyInput,
  formatCurrencyInputFromNumber,
  parseCurrencyInput,
  sanitizeCurrencyInput,
} from './currency-input';

type PaymentCalculatorProps = {
  total: number;
  amountReceived: string;
  disabled?: boolean;
  onAmountChange: (value: string) => void;
  summary?: ReactNode;
  action?: ReactNode;
};

const numberKeys: Array<string | null> = [
  '7', '8', '9', null,
  '4', '5', '6', null,
  '1', '2', '3', null,
  '00', '0', '.', 'DELETE',
];

export function PaymentCalculator({
  total,
  amountReceived,
  disabled = false,
  onAmountChange,
  summary,
  action,
}: PaymentCalculatorProps) {
  function append(value: string) {
    onAmountChange(appendCurrencyInput(amountReceived, value));
  }

  function addAmount(value: number) {
    const current = parseCurrencyInput(amountReceived);
    onAmountChange(formatCurrencyInputFromNumber(current + value));
  }

  return (
    <div className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <div>
        <Label htmlFor="amountReceived">Monto entregado por el cliente</Label>
        <div className="relative mt-1">
          <Input
            id="amountReceived"
            type="text"
            inputMode="decimal"
            value={amountReceived}
            disabled={disabled}
            onChange={(event) => onAmountChange(sanitizeCurrencyInput(event.target.value))}
            onBlur={(event) => onAmountChange(formatCurrencyInput(event.target.value))}
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 pr-12 text-lg font-semibold"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">RD$</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="h-8 text-xs font-semibold"
            disabled={disabled}
            onClick={() => onAmountChange(formatCurrencyInputFromNumber(total))}
          >
            Exacto
          </Button>
          {[50, 100, 500, 1000].map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            className="h-8 text-xs font-semibold"
            disabled={disabled}
            onClick={() => addAmount(amount)}
          >
            +{amount}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="h-8 border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
          disabled={disabled}
          onClick={() => onAmountChange(clearCurrencyInput())}
        >
          <RotateCcw className="h-4 w-4" />
          Limpiar
        </Button>
        </div>
        {summary ? <div className="mt-2">{summary}</div> : null}
      </div>

      <div>
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_2.25rem] gap-1.5">
          {numberKeys.map((key, index) =>
          key === null ? (
            <span key={`spacer-${index}`} aria-hidden="true" />
          ) : key === 'DELETE' ? (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="h-9 px-0"
              disabled={disabled}
              onClick={() => onAmountChange(backspaceCurrencyInput(amountReceived))}
              aria-label="Borrar último dígito"
            >
              <Delete className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              key={`${key}-${index}`}
              type="button"
              variant="outline"
              className="h-9 text-sm font-semibold"
              disabled={disabled || key === '.'}
              onClick={() => append(key)}
            >
              {key}
            </Button>
          ),
          )}
        </div>
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}
