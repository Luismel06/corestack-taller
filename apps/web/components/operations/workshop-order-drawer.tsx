'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, ClipboardCheck, Loader2, Plus, Save, UserRound, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createWorkshopReception,
  saveWorkshopInspection,
  updateWorkshopTicket,
  type WorkshopBay,
  type WorkshopMechanic,
  type WorkshopService,
  type WorkshopTicket,
  type WorkshopTicketStatus,
} from '@/lib/api';
import type { AuthSession } from '@/lib/auth-session';

const statusLabels: Record<WorkshopTicketStatus, string> = {
  RECEIVED: 'Recepción',
  DIAGNOSIS: 'Revisión / diagnóstico',
  AWAITING_APPROVAL: 'Esperando aprobación',
  APPROVED: 'Aprobado · por facturar',
  IN_PROGRESS: 'En reparación',
  READY_FOR_DELIVERY: 'Listo para entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

function linePayload(ticket: WorkshopTicket) {
  return ticket.lines.map((line) => ({
    productId: line.productId || undefined,
    serviceId: line.serviceId || undefined,
    type: line.type,
    description: line.description,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
  }));
}

export function WorkshopOrderDrawer({
  session,
  ticket,
  mechanics,
  services,
  bays,
  onClose,
}: {
  session: AuthSession;
  ticket: WorkshopTicket | null;
  mechanics: WorkshopMechanic[];
  services: WorkshopService[];
  bays: WorkshopBay[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mileage, setMileage] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [bayId, setBayId] = useState('');
  const [mechanicId, setMechanicId] = useState('');
  const [exterior, setExterior] = useState('');
  const [warningLights, setWarningLights] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [serviceId, setServiceId] = useState('');

  useEffect(() => {
    if (!ticket) return;
    setMileage(String(ticket.reception?.mileage ?? ticket.vehicle.mileage ?? ''));
    setFuelLevel(ticket.reception?.fuelLevel ?? '1/2');
    setBayId(ticket.reception?.bayId ?? '');
    setMechanicId(ticket.assignments[0]?.employee.id ?? ticket.reception?.initialMechanicId ?? '');
    setExterior(ticket.reception?.exteriorCondition ?? '');
    setWarningLights(ticket.reception?.warningLights ?? '');
    setDiagnosis(ticket.diagnosis ?? '');
    setServiceId('');
  }, [ticket]);

  useEffect(() => {
    if (!ticket) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', close);
    };
  }, [onClose, ticket]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-bays'] }),
    ]);
  };

  const receptionMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error('Selecciona una orden.');
      const currentMileage = Number(mileage);
      if (!Number.isInteger(currentMileage) || currentMileage < 0) throw new Error('Indica un kilometraje válido.');
      if (!diagnosis.trim()) throw new Error('Escribe el resultado de la revisión inicial.');
      if (!ticket.reception) {
        await createWorkshopReception(session.tenantId, session.accessToken, ticket.id, {
          mileage: currentMileage,
          fuelLevel: fuelLevel || undefined,
          exteriorCondition: exterior || undefined,
          warningLights: warningLights || undefined,
          bayId: bayId || undefined,
          initialMechanicId: mechanicId || undefined,
          observations: diagnosis.trim(),
        });
      }
      if (ticket.status === 'RECEIVED') {
        await updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, {
          status: 'DIAGNOSIS',
          diagnosis: diagnosis.trim(),
          mechanicIds: mechanicId ? [mechanicId] : [],
        });
      } else {
        await updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, { diagnosis: diagnosis.trim() });
      }
      await saveWorkshopInspection(session.tenantId, session.accessToken, ticket.id, {
        items: [
          { code: 'EXTERIOR', label: 'Condición exterior', result: exterior.trim() ? 'ATTENTION' : 'GOOD', comment: exterior.trim() || undefined },
          { code: 'WARNING_LIGHTS', label: 'Testigos del tablero', result: warningLights.trim() ? 'ATTENTION' : 'GOOD', comment: warningLights.trim() || undefined },
          { code: 'INITIAL_REVIEW', label: 'Revisión inicial', result: 'REQUIRES_REPAIR', comment: diagnosis.trim() },
        ],
      });
    },
    onSuccess: async () => { toast.success('Recepción y revisión inicial guardadas'); await invalidate(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar la recepción.'),
  });

  const mechanicMutation = useMutation({
    mutationFn: () => {
      if (!ticket) throw new Error('Selecciona una orden.');
      return updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, { mechanicIds: mechanicId ? [mechanicId] : [] });
    },
    onSuccess: async () => { toast.success('Mecánico asignado'); await invalidate(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo asignar el mecánico.'),
  });

  const serviceMutation = useMutation({
    mutationFn: () => {
      if (!ticket) throw new Error('Selecciona una orden.');
      const service = services.find((item) => item.id === serviceId);
      if (!service) throw new Error('Selecciona un servicio.');
      return updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, {
        lines: [...linePayload(ticket), {
          serviceId: service.id,
          type: 'LABOR',
          description: service.name,
          quantity: 1,
          unitPrice: Number(service.defaultPrice),
        }],
      });
    },
    onSuccess: async () => { setServiceId(''); toast.success('Servicio agregado a la orden'); await invalidate(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo agregar el servicio.'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: WorkshopTicketStatus) => {
      if (!ticket) throw new Error('Selecciona una orden.');
      return updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, { status });
    },
    onSuccess: async () => { toast.success('Estado actualizado'); await invalidate(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado.'),
  });

  if (!ticket) return null;
  const canEditQuote = ['RECEIVED', 'DIAGNOSIS'].includes(ticket.status) && !['APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus);
  const pending = receptionMutation.isPending || mechanicMutation.isPending || serviceMutation.isPending || statusMutation.isPending;

  return (
    <div className="fixed inset-0 z-[105] bg-slate-950/55 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`Orden ${ticket.ticketNumber}`} className="ml-auto flex h-full w-full max-w-3xl flex-col bg-zinc-100 shadow-2xl">
        <header className="flex items-start gap-4 border-b bg-white p-5 sm:p-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Wrench className="h-7 w-7" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{ticket.ticketNumber}</h2><Badge variant="outline">{statusLabels[ticket.status]}</Badge></div>
            <p className="mt-1 text-base text-muted-foreground">{ticket.vehicle.licensePlate ?? 'Sin placa'} · {ticket.vehicle.make} {ticket.vehicle.model}</p>
            <p className="text-sm text-muted-foreground">{ticket.customer.name} · {ticket.complaint}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-12 w-12" onClick={onClose} disabled={pending} aria-label="Cerrar"><X className="h-6 w-6" /></Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {['RECEIVED', 'DIAGNOSIS'].includes(ticket.status) ? (
            <form className="rounded-2xl border bg-white p-5 shadow-sm" onSubmit={(event: FormEvent) => { event.preventDefault(); receptionMutation.mutate(); }}>
              <div className="mb-4 flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-primary" /><div><h3 className="text-lg font-semibold">Recepción y revisión inicial</h3><p className="text-sm text-muted-foreground">Un solo registro acompaña la orden durante todo el proceso.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TouchField label="Kilometraje"><Input className="h-12 text-base" required type="number" min={0} value={mileage} onChange={(event) => setMileage(event.target.value)} /></TouchField>
                <TouchField label="Combustible"><select className="h-12 rounded-md border border-input bg-background px-3 text-base" value={fuelLevel} onChange={(event) => setFuelLevel(event.target.value)}><option value="1/4">1/4</option><option value="1/2">1/2</option><option value="3/4">3/4</option><option value="FULL">Lleno</option></select></TouchField>
                <TouchField label="Bahía"><select className="h-12 rounded-md border border-input bg-background px-3 text-base" value={bayId} onChange={(event) => setBayId(event.target.value)}><option value="">Sin asignar</option>{bays.filter((bay) => bay.status === 'AVAILABLE' || bay.id === ticket.reception?.bayId).map((bay) => <option key={bay.id} value={bay.id}>{bay.code} · {bay.name}</option>)}</select></TouchField>
                <TouchField label="Mecánico inicial"><select className="h-12 rounded-md border border-input bg-background px-3 text-base" value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">Sin asignar</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.user.name}</option>)}</select></TouchField>
                <TouchField label="Condición exterior"><Input className="h-12 text-base" value={exterior} onChange={(event) => setExterior(event.target.value)} placeholder="Golpes, rayones..." /></TouchField>
                <TouchField label="Testigos encendidos"><Input className="h-12 text-base" value={warningLights} onChange={(event) => setWarningLights(event.target.value)} placeholder="Ninguno / ABS..." /></TouchField>
                <TouchField label="Resultado de la revisión" wide><textarea className="min-h-28 rounded-md border border-input bg-background p-3 text-base" required value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="Hallazgos iniciales y diagnóstico..." /></TouchField>
              </div>
              <Button className="mt-5 h-14 w-full text-base" disabled={pending}><Save className="h-5 w-5" />Guardar e iniciar diagnóstico</Button>
            </form>
          ) : null}

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3"><UserRound className="h-6 w-6 text-primary" /><h3 className="text-lg font-semibold">Responsable de la orden</h3></div>
            <div className="flex flex-col gap-3 sm:flex-row"><select className="h-14 min-w-0 flex-1 rounded-md border border-input bg-background px-4 text-base" value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">Sin asignar</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.user.name}</option>)}</select><Button className="h-14 px-6 text-base" variant="outline" disabled={pending} onClick={() => mechanicMutation.mutate()}>Asignar</Button></div>
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Wrench className="h-6 w-6 text-primary" /><div><h3 className="text-lg font-semibold">Servicios y reparaciones</h3><p className="text-sm text-muted-foreground">{ticket.lines.length} trabajo(s) · RD$ {Number(ticket.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p></div></div></div>
            {ticket.lines.length ? <div className="mb-4 space-y-2">{ticket.lines.map((line) => <div key={line.id} className="flex justify-between gap-3 rounded-xl bg-muted/50 p-3"><span>{line.description}</span><strong className="shrink-0">RD$ {Number(line.total).toLocaleString('es-DO')}</strong></div>)}</div> : null}
            {canEditQuote ? <div className="flex flex-col gap-3 sm:flex-row"><select className="h-14 min-w-0 flex-1 rounded-md border border-input bg-background px-4 text-base" value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Seleccionar servicio</option>{services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name} · RD$ {Number(service.defaultPrice).toLocaleString('es-DO')}</option>)}</select><Button className="h-14 px-6 text-base" disabled={!serviceId || pending} onClick={() => serviceMutation.mutate()}><Plus className="h-5 w-5" />Agregar</Button></div> : <p className="text-sm text-muted-foreground">El presupuesto aprobado conserva sus líneas. Los adicionales se registran desde la orden completa.</p>}
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold">Siguiente acción</h3>
            {ticket.status === 'DIAGNOSIS' ? <Button className="h-14 w-full text-base" disabled={pending || !ticket.inspection || ticket.lines.length === 0} onClick={() => statusMutation.mutate('AWAITING_APPROVAL')}><CheckCircle2 className="h-5 w-5" />Enviar cotización para aprobación</Button> : null}
            {ticket.status === 'APPROVED' && !ticket.salesOrder?.invoice ? <Button asChild className="h-14 w-full text-base"><Link href={`/workshop?ticket=${ticket.id}`}><ChevronRight className="h-5 w-5" />Facturar antes de reparar</Link></Button> : null}
            {ticket.status === 'APPROVED' && ticket.salesOrder?.invoice && ticket.promisedAt ? <Button className="h-14 w-full text-base" disabled={pending} onClick={() => statusMutation.mutate('IN_PROGRESS')}><Wrench className="h-5 w-5" />Iniciar reparación</Button> : null}
            {ticket.status === 'APPROVED' && ticket.salesOrder?.invoice && !ticket.promisedAt ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Define la fecha estimada de entrega desde la orden completa antes de iniciar la reparación.</p> : null}
            {ticket.status === 'AWAITING_APPROVAL' ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Esperando la respuesta del cliente. Registra la aprobación desde la orden completa.</p> : null}
            {['IN_PROGRESS', 'READY_FOR_DELIVERY', 'DELIVERED'].includes(ticket.status) ? <p className="rounded-xl bg-muted p-4 text-muted-foreground">Continúa las tareas, el control de calidad y la entrega desde el expediente completo.</p> : null}
          </section>
        </div>

        <footer className="border-t bg-white p-4 sm:p-5"><Button asChild className="h-14 w-full text-base"><Link href={`/workshop?ticket=${ticket.id}`}>Abrir expediente completo <ChevronRight className="h-5 w-5" /></Link></Button></footer>
      </aside>
    </div>
  );
}

function TouchField({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`grid gap-2 text-base font-medium ${wide ? 'sm:col-span-2' : ''}`}><Label className="text-sm">{label}</Label>{children}</label>;
}
