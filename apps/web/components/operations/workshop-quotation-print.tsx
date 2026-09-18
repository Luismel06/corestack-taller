'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { brand } from '@/lib/brand';
import { getWorkshopTickets, type WorkshopQuoteVersion } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { SessionRequired, useCurrentSession } from './session-required';
import { VehicleDamagePrintMap } from './vehicle-damage-map';
import { VEHICLE_AREA_LABELS } from './vehicle-damage-map-config';

type QuoteLine = NonNullable<NonNullable<WorkshopQuoteVersion['snapshot']>['lines']>[number];

const lineTypeLabel = {
  LABOR: 'Servicio',
  PART: 'Repuesto',
  OTHER: 'Otro',
} as const;

export function WorkshopQuotationPrint({
  ticketId,
  autoPrint = false,
}: {
  ticketId: string;
  autoPrint?: boolean;
}) {
  const session = useCurrentSession();
  const router = useRouter();
  const ticketsQuery = useQuery({
    queryKey: ['workshop-tickets', session?.tenantId],
    queryFn: () => getWorkshopTickets(session!.tenantId, session!.accessToken),
    enabled: Boolean(session && ticketId),
  });
  const ticket = ticketsQuery.data?.find((item) => item.id === ticketId);
  const quote = ticket?.quoteVersions[0];

  useEffect(() => {
    if (autoPrint && ticket && quote) {
      const timer = window.setTimeout(() => window.print(), 900);
      return () => window.clearTimeout(timer);
    }
  }, [autoPrint, quote, ticket]);

  if (!session) return <SessionRequired session={session} />;

  if (ticketsQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Preparando cotización...</p>;
  }

  if (!ticket || !quote) {
    return (
      <div className="p-6">
        <p className="text-sm text-danger">Esta orden todavía no tiene una cotización generada.</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => router.push(`/workshop?ticket=${ticketId}`)}
        >
          Volver a la orden
        </Button>
      </div>
    );
  }

  const snapshotLines = quote.snapshot?.lines ?? [];
  const lines: QuoteLine[] = snapshotLines.length
    ? snapshotLines
    : ticket.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        serviceId: line.serviceId,
        vehicleAreaId: line.vehicleAreaId,
        type: line.type,
        description: line.description,
        quantity: line.quantity,
        releasedQuantity: line.releasedQuantity,
        billableQuantity: String(
          Math.max(0, Number(line.quantity) - Number(line.releasedQuantity)),
        ),
        unitPrice: line.unitPrice,
        total: line.total,
      }));
  const snapshotFindings = quote.snapshot?.areaFindings ?? ticket.areaFindings ?? [];
  const subtotal = Number(quote.laborTotal) + Number(quote.partsTotal);
  const taxes = Math.max(0, Number(quote.total) - subtotal);
  const vehicleName = [ticket.vehicle.make, ticket.vehicle.model, ticket.vehicle.year]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 print:max-w-none print:space-y-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Cotización de {ticket.ticketNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Lista para imprimir o guardar como archivo PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/workshop?ticket=${ticket.id}`)}>
            Volver a la OT
          </Button>
          <Button onClick={() => window.print()}>
            <Download className="h-4 w-4" /> Guardar como PDF
          </Button>
        </div>
      </div>

      <article className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-950 shadow-sm sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-zinc-200 pb-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-black">
              <img
                src={brand.logoPath}
                alt={`Logo de ${brand.name}`}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                {brand.businessType}
              </p>
              <h2 className="mt-1 text-2xl font-bold">{brand.name}</h2>
              <p className="mt-1 text-sm text-zinc-600">{brand.descriptor}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
              Cotización
            </p>
            <p className="mt-1 text-xl font-bold">
              {ticket.ticketNumber}-V{quote.version}
            </p>
            <Badge className="mt-2" variant="outline">
              Versión {quote.version}
            </Badge>
          </div>
        </header>

        <section className="grid gap-5 border-b border-zinc-200 py-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Cliente</p>
            <p className="mt-1 font-semibold">{ticket.customer.name}</p>
            <p className="text-sm text-zinc-600">{ticket.customer.phone || 'Sin teléfono'}</p>
            <p className="text-sm text-zinc-600">
              {ticket.customer.email || 'Sin correo registrado'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Vehículo</p>
            <p className="mt-1 font-semibold">{ticket.vehicle.licensePlate || 'Sin placa'}</p>
            <p className="text-sm text-zinc-600">{vehicleName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Documento</p>
            <p className="mt-1 font-semibold">{ticket.ticketNumber}</p>
            <p className="text-sm text-zinc-600">Emitida: {formatDateTime(quote.createdAt)}</p>
            {ticket.promisedAt ? (
              <p className="text-sm text-zinc-600">Promesa: {formatDateTime(ticket.promisedAt)}</p>
            ) : null}
          </div>
        </section>

        <section className="break-inside-avoid border-b border-zinc-200 py-5">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Mapa de daños del vehículo
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Condición visual registrada para esta versión de la cotización.
            </p>
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-[1fr_1.25fr]">
            <div className="space-y-2">
              {snapshotFindings.length ? (
                snapshotFindings.map((finding) => (
                  <div key={finding.areaId} className="rounded-lg border border-zinc-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{finding.areaLabel}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          finding.condition === 'REPAIR'
                            ? 'bg-rose-100 text-rose-700'
                            : finding.condition === 'ATTENTION'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {finding.condition === 'REPAIR'
                          ? 'Por reparar'
                          : finding.condition === 'ATTENTION'
                            ? 'Con atención'
                            : 'Correcto'}
                      </span>
                    </div>
                    {finding.finding ? (
                      <p className="mt-1 text-xs text-zinc-700">{finding.finding}</p>
                    ) : null}
                    {finding.notes ? (
                      <p className="mt-1 text-xs text-zinc-500">{finding.notes}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500">
                  Sin daños o condiciones especiales registrados.
                </p>
              )}
            </div>
            <VehicleDamagePrintMap
              vehicleType={ticket.vehicle.vehicleType}
              findings={snapshotFindings}
            />
          </div>
        </section>

        <section className="py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 pl-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr
                  key={line.id ?? `${line.description}-${index}`}
                  className="border-b border-zinc-100 align-top"
                >
                  <td className="py-3 pr-3 font-medium">
                    {line.description}
                    {line.vehicleAreaId ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">
                        Área: {VEHICLE_AREA_LABELS[line.vehicleAreaId] ?? line.vehicleAreaId}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3 text-zinc-600">{lineTypeLabel[line.type]}</td>
                  <td className="py-3 text-right">
                    {Number(line.billableQuantity ?? line.quantity).toLocaleString('es-DO')}
                  </td>
                  <td className="py-3 text-right">{formatCurrency(Number(line.unitPrice))}</td>
                  <td className="py-3 pl-3 text-right font-semibold">
                    {formatCurrency(Number(line.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="grid gap-6 border-t border-zinc-200 pt-5 sm:grid-cols-[1fr_18rem]">
          <div className="text-sm text-zinc-600">
            <p className="font-semibold text-zinc-950">Observaciones</p>
            <p className="mt-1">
              {quote.note ||
                ticket.customerNotes ||
                ticket.diagnosis ||
                'Cotización sujeta a aprobación del cliente.'}
            </p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-5">
              <span>Servicios</span>
              <strong>{formatCurrency(Number(quote.laborTotal))}</strong>
            </div>
            <div className="flex justify-between gap-5">
              <span>Repuestos</span>
              <strong>{formatCurrency(Number(quote.partsTotal))}</strong>
            </div>
            {taxes > 0 ? (
              <div className="flex justify-between gap-5">
                <span>Impuestos</span>
                <strong>{formatCurrency(taxes)}</strong>
              </div>
            ) : null}
            <div className="flex justify-between gap-5 border-t border-zinc-300 pt-3 text-lg">
              <span>Total</span>
              <strong>{formatCurrency(Number(quote.total))}</strong>
            </div>
          </div>
        </footer>

        <div className="mt-8 hidden items-center gap-2 border-t border-zinc-200 pt-4 text-xs text-zinc-500 print:flex">
          <Printer className="h-3.5 w-3.5" /> Documento generado desde {brand.name} ·{' '}
          {formatDateTime(new Date())}
        </div>
      </article>
    </div>
  );
}
