'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getInvoice } from '@/lib/api';
import { brand, platform } from '@/lib/brand';
import { translatePaymentMethod, translateStatus } from '@/lib/display-labels';
import { formatCurrency } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { formatQuantity } from './pos/pos-utils';
import { SessionRequired, useCurrentSession } from './session-required';

export function InvoiceDetail({
  invoiceId,
  printMode = false,
  autoPrint = false,
}: {
  invoiceId: string;
  printMode?: boolean;
  autoPrint?: boolean;
}) {
  const session = useCurrentSession();
  const invoiceQuery = useQuery({
    queryKey: ['invoice', invoiceId, session?.tenantId],
    queryFn: () => getInvoice(session?.tenantId ?? '', session?.accessToken ?? '', invoiceId),
    enabled: Boolean(session),
  });
  const invoice = invoiceQuery.data;
  const autoPrintTriggeredRef = useRef(false);

  useEffect(() => {
    if (printMode && autoPrint && invoice && !autoPrintTriggeredRef.current) {
      autoPrintTriggeredRef.current = true;
      window.setTimeout(() => window.print(), 500);
    }
  }, [autoPrint, invoice, printMode]);

  if (!session) {
    return <SessionRequired session={session} />;
  }

  if (!invoice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Factura</CardTitle>
          <CardDescription>Cargando datos desde PostgreSQL.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (printMode) {
    return (
      <main className="mx-auto w-[80mm] max-w-full bg-white p-3 text-zinc-950 print:w-[80mm] print:p-0">
        <Receipt invoice={invoice} copyLabel="ORIGINAL: CLIENTE" />
        <div className="my-4 border-t-2 border-dashed border-zinc-500" />
        <Receipt invoice={invoice} copyLabel="COPIA: VENDEDOR" />
        <div className="mt-4 print:hidden">
          <Button className="w-full" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Reimprimir factura
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Factura"
        description="Detalle persistido con items, pago, cajero y estado fiscal."
      />
      <Card>
        <CardHeader>
          <CardTitle>{invoice.invoiceNumber}</CardTitle>
          <CardDescription>
            {invoice.customer?.name ?? 'Consumidor final'} - {translateStatus(invoice.status)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Receipt invoice={invoice} copyLabel="VISTA PREVIA" />
        </CardContent>
      </Card>
    </div>
  );
}

function Receipt({
  invoice,
  copyLabel,
}: {
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>;
  copyLabel: string;
}) {
  const amountReceived =
    Number(invoice.amountReceived) > 0
      ? Number(invoice.amountReceived)
      : Number(invoice.paidAmount);
  const changeAmount = Number(invoice.changeAmount ?? 0);
  const subtotalBase = Number(invoice.subtotal);
  const fiscalNumber = invoice.ncf ?? invoice.eNcf ?? '-';
  const issuePoint = invoice.cashSession?.cashRegister;
  const companyName = brand.name;
  const legalName = invoice.tenant?.legalName ?? invoice.tenant?.name ?? companyName;
  const documentTitle = getInvoiceDocumentTitle(invoice.documentType);
  const businessContact = [invoice.tenant?.phone, invoice.tenant?.email]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  const taxBuckets = invoice.items.reduce((buckets, item) => {
    const rate = Number(item.taxRate);
    const bucket = buckets.get(rate) ?? { base: 0, tax: 0 };
    bucket.base += Number(item.subtotal);
    bucket.tax += Number(item.taxTotal);
    buckets.set(rate, bucket);
    return buckets;
  }, new Map<number, { base: number; tax: number }>());
  const taxableBase = [...taxBuckets.entries()]
    .filter(([rate]) => rate > 0)
    .reduce((sum, [, bucket]) => sum + bucket.base, 0);
  const exemptBase = [...taxBuckets.entries()]
    .filter(([rate]) => rate === 0)
    .reduce((sum, [, bucket]) => sum + bucket.base, 0);

  return (
    <section className="space-y-3 text-[12px] leading-[1.28]">
      <header className="flex flex-col items-center text-center">
        <div className="relative h-16 w-24">
          <Image src={brand.logoPath} alt={brand.name} fill className="object-contain" />
        </div>
        <p className="mt-1 font-semibold uppercase">{legalName}</p>
        <p>{companyName}</p>
        <p>RNC/Cédula {invoice.tenant?.rnc ?? 'No configurado'}</p>
        {invoice.tenant?.address ? <p>{invoice.tenant.address}</p> : null}
        {businessContact ? <p>{businessContact}</p> : null}
        <p className="mt-2 font-semibold">
          Punto de emisión: {issuePoint?.name ?? 'Caja no asignada'}
          {issuePoint?.location ? ` · ${issuePoint.location}` : ''}
        </p>
      </header>

      <div className="border-y border-dashed border-zinc-400 py-2">
        <h2 className="mb-1 text-center text-sm font-bold uppercase">{documentTitle}</h2>
        <ReceiptRow
          label={invoice.eNcf ? 'e-NCF' : 'NCF'}
          value={fiscalNumber}
          valueClassName="font-semibold"
        />
        <ReceiptRow label="Factura interna" value={invoice.invoiceNumber} />
        <ReceiptRow
          label="Fecha de emisión"
          value={formatInvoiceDateTime(invoice.issuedAt ?? invoice.createdAt)}
        />
        <ReceiptRow label="Cajero" value={invoice.issuedBy?.name ?? '-'} />
        <ReceiptRow label="Cliente" value={invoice.customer?.name ?? 'Consumidor final'} />
      </div>

      <div className="space-y-2">
        {invoice.items.map((item) => (
          <div
            key={item.id}
            className="border-b border-dashed border-zinc-300 pb-2 last:border-b-0"
          >
            <div className="flex justify-between gap-3">
              <span className="font-medium">{item.description}</span>
              <span className="shrink-0 font-medium">{formatCurrency(Number(item.total))}</span>
            </div>
            {item.sku || item.barcode ? (
              <p className="text-[11px] text-zinc-600">
                {[item.sku, item.barcode].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <p className="text-[11px] text-zinc-600">
              {formatQuantity(item.quantity)} {Number(item.quantity) === 1 ? 'Unidad' : 'Unidades'}{' '}
              × {formatCurrency(Number(item.unitPrice))} · Base{' '}
              {formatCurrency(Number(item.subtotal))} · ITBIS{' '}
              {formatCurrency(Number(item.taxTotal))}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-y border-dashed border-zinc-400 py-2">
        <ReceiptRow label="Subtotal bruto" value={formatCurrency(subtotalBase)} />
        <ReceiptRow label="Subtotal sin ITBIS" value={formatCurrency(subtotalBase)} />
        {taxableBase > 0 ? (
          <ReceiptRow label="Base gravada" value={formatCurrency(taxableBase)} />
        ) : null}
        {exemptBase > 0 ? (
          <ReceiptRow label="Monto exento" value={formatCurrency(exemptBase)} />
        ) : null}
        {[...taxBuckets.entries()]
          .filter(([, bucket]) => bucket.tax > 0)
          .sort(([left], [right]) => right - left)
          .map(([rate, bucket]) => (
            <ReceiptRow
              key={rate}
              label={`ITBIS ${formatTaxRate(rate)}`}
              value={formatCurrency(bucket.tax)}
            />
          ))}
        <ReceiptRow label="Total factura" value={formatCurrency(Number(invoice.total))} strong />
      </div>

      <div className="space-y-0.5">
        <ReceiptRow label="Pagado" value={formatCurrency(Number(invoice.paidAmount))} />
        <ReceiptRow label="Método" value={translatePaymentMethod(invoice.paymentMethod)} />
        <ReceiptRow label="Recibido" value={formatCurrency(amountReceived)} />
        <ReceiptRow label="Devuelta" value={formatCurrency(changeAmount)} strong />
        <ReceiptRow label="Balance" value={formatCurrency(Number(invoice.balance))} />
      </div>

      <footer className="pt-2 text-center">
        <p className="font-bold">{copyLabel}</p>
        <p className="text-[11px] text-zinc-500">Powered by {platform.name}</p>
      </footer>
    </section>
  );
}

function formatTaxRate(rate: number) {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function ReceiptRow({
  label,
  value,
  strong = false,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={strong ? 'flex justify-between gap-3 font-bold' : 'flex justify-between gap-3'}>
      <span>{label}</span>
      <span className={`text-right ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

function getInvoiceDocumentTitle(documentType: string) {
  if (documentType === 'FISCAL_CREDIT_01') return 'Factura de crédito fiscal';
  if (documentType === 'FISCAL_CREDIT_ELECTRONIC_31')
    return 'Factura de crédito fiscal electrónica';
  if (documentType === 'CONSUMER_ELECTRONIC_32') return 'Factura de consumo electrónica';
  return 'Factura de consumo';
}

function formatInvoiceDateTime(value: string) {
  return new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
