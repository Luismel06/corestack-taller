'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, CalendarDays, CarFront, CheckCircle2,
  CircleDollarSign, Clock3, FileText, Package, RefreshCw, Search, ShieldCheck,
  Users, WalletCards, Wrench, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { AccountantDashboardView } from '@/components/dashboard/accountant-dashboard-view';
import { VehicleIllustration } from '@/components/operations/vehicle-illustration';
import {
  getOperationalDashboardSummary, getWorkshopAppointments, getWorkshopTickets,
  type OperationalDashboardSummary, type WorkshopAppointment, type WorkshopAppointmentStatus,
  type WorkshopTicket, type WorkshopTicketStatus,
} from '@/lib/api';
import { getSession, type AuthSession } from '@/lib/auth-session';
import { canAccessPath, isAccountantSession } from '@/lib/authorization';
import { cn, formatCurrency } from '@/lib/utils';

const ticketLabels: Record<WorkshopTicketStatus, string> = {
  RECEIVED: 'Recibida', DIAGNOSIS: 'En diagnóstico', AWAITING_APPROVAL: 'Esperando aprobación',
  APPROVED: 'Aprobada', IN_PROGRESS: 'En reparación', READY_FOR_DELIVERY: 'Lista para entrega',
  DELIVERED: 'Entregada', CANCELLED: 'Cancelada',
};
const appointmentLabels: Record<WorkshopAppointmentStatus, string> = {
  SCHEDULED: 'Programada', CONFIRMED: 'Confirmada', ARRIVED: 'En taller', NO_SHOW: 'No asistió',
  CANCELLED: 'Cancelada', CONVERTED_TO_RECEPTION: 'Recibida',
};

export function DashboardView() {
  const session = getSession();
  const today = dayBounds();
  const summaryQuery = useQuery({
    queryKey: ['dashboard-operational-summary', session?.tenantId],
    queryFn: () => getOperationalDashboardSummary(session!.tenantId, session!.accessToken),
    enabled: Boolean(session && !isAccountantSession(session)), refetchInterval: 60_000,
  });
  const appointmentsQuery = useQuery({
    queryKey: ['workshop-appointments', session?.tenantId, 'dashboard-today'],
    queryFn: () => getWorkshopAppointments(session!.tenantId, session!.accessToken, {
      from: today.start.toISOString(), to: today.end.toISOString(),
    }),
    enabled: Boolean(session && canAccessPath(session, '/workshop/agenda')), refetchInterval: 60_000,
  });
  const ticketsQuery = useQuery({
    queryKey: ['workshop-tickets', session?.tenantId],
    queryFn: () => getWorkshopTickets(session!.tenantId, session!.accessToken),
    enabled: Boolean(session && canAccessPath(session, '/workshop')), refetchInterval: 60_000,
  });

  if (!session) return <DashboardMessage title="Sesión requerida" detail="Inicia sesión para consultar el panel operativo." />;
  if (isAccountantSession(session)) return <AccountantDashboardView />;
  if (summaryQuery.isLoading) return <DashboardSkeleton />;
  if (!summaryQuery.data) return <DashboardMessage title="No se pudo cargar el panel" detail="Comprueba la conexión con la API e inténtalo nuevamente." />;

  const summary = summaryQuery.data;
  const dailySales = summary.salesLast7Days ?? [];
  const appointments = appointmentsQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];
  const now = new Date();
  const activeTickets = tickets.filter((ticket) => !['DELIVERED', 'CANCELLED'].includes(ticket.status)).sort(compareTickets);
  const delayedTickets = activeTickets.filter((ticket) => ticket.promisedAt && new Date(ticket.promisedAt) < now);
  const delayedAppointments = appointments.filter((item) => ['SCHEDULED', 'CONFIRMED'].includes(item.status) && new Date(item.startsAt) < now);
  const counts = {
    vehiclesToday: appointments.filter((item) => !['CANCELLED', 'NO_SHOW'].includes(item.status)).length,
    diagnosis: tickets.filter((item) => item.status === 'DIAGNOSIS').length,
    repair: tickets.filter((item) => item.status === 'IN_PROGRESS').length,
    approval: tickets.filter((item) => item.status === 'AWAITING_APPROVAL').length,
    ready: tickets.filter((item) => item.status === 'READY_FOR_DELIVERY').length,
    toReceive: appointments.filter((item) => ['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(item.status)).length,
    inProcess: tickets.filter((item) => ['RECEIVED', 'DIAGNOSIS', 'APPROVED', 'IN_PROGRESS'].includes(item.status)).length,
  };
  const metrics: Metric[] = [
    { label: 'Vehículos hoy', value: String(counts.vehiclesToday), detail: 'Citas y recepciones del día', icon: CarFront, tone: 'blue' },
    { label: 'En diagnóstico', value: String(counts.diagnosis), detail: 'Vehículos en revisión', icon: Search, tone: 'amber' },
    { label: 'En reparación', value: String(counts.repair), detail: 'Trabajos en proceso', icon: Wrench, tone: 'blue' },
    { label: 'Esperando aprobación', value: String(counts.approval), detail: 'Cotizaciones pendientes', icon: Clock3, tone: 'orange' },
    { label: 'Listos para entrega', value: String(counts.ready), detail: 'Vehículos terminados', icon: CheckCircle2, tone: 'green' },
    { label: 'Cobros de hoy', value: formatCurrency(summary.netSalesToday), detail: `${summary.completedOrdersToday} transacción(es)`, icon: CircleDollarSign, tone: 'green' },
  ];
  const attention = buildAttention(summary, delayedTickets.length, delayedAppointments.length, counts.ready, counts.approval);
  const activity = buildActivity(tickets, summary).slice(0, 6);
  const refreshing = summaryQuery.isFetching || appointmentsQuery.isFetching || ticketsQuery.isFetching;

  return (
    <div className="space-y-3 pb-4">
      <section className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-[43%] right-[25%] hidden overflow-hidden bg-gradient-to-r from-white via-slate-50 to-blue-50 lg:block">
          <VehicleIllustration type={null} className="absolute -bottom-8 right-4 h-32 w-48 opacity-20 grayscale" />
        </div>
        <div className="relative flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><CarFront className="h-5 w-5" /></span>
            <div><h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{getGreeting()}, {session.user.name.split(' ')[0] || session.user.name}.</h1><p className="mt-0.5 text-sm text-muted-foreground">Aquí tienes el resumen de la operación de tu taller automotriz para hoy.</p></div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-sm"><p className="capitalize font-semibold text-slate-900">{formatFullDate(now)}</p><p className="mt-0.5 text-muted-foreground">Actualizado {formatTime(new Date(summaryQuery.dataUpdatedAt))}</p></div>
            <Button variant="outline" onClick={() => void Promise.all([summaryQuery.refetch(), appointmentsQuery.refetch(), ticketsQuery.refetch()])} disabled={refreshing}><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />Actualizar</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores del taller">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>

      <Link href="/workshop" className="group grid items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md lg:grid-cols-[minmax(15rem,1.25fr)_repeat(5,minmax(6rem,.7fr))_2rem]">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white"><Wrench className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-950">Operación del taller</h2><p className="text-xs text-muted-foreground">Estado general de las órdenes de trabajo en el taller.</p></div></div>
        <OperationCount label="Por recibir" value={counts.toReceive} /><OperationCount label="En proceso" value={counts.inProcess} /><OperationCount label="Esperando aprobación" value={counts.approval} /><OperationCount label="Listas para entregar" value={counts.ready} /><OperationCount label="Retrasadas" value={delayedTickets.length} danger={delayedTickets.length > 0} /><ArrowRight className="hidden h-5 w-5 text-slate-500 transition group-hover:translate-x-1 lg:block" />
      </Link>

      <section className="grid items-stretch gap-3 xl:grid-cols-[1.05fr_1.16fr_.9fr]">
        <DashboardCard title="Agenda de hoy" description="Citas programadas y recepciones de hoy." icon={CalendarDays} action={{ label: 'Ver agenda', href: '/workshop/agenda' }}><AgendaList appointments={appointments.slice(0, 5)} loading={appointmentsQuery.isLoading} /></DashboardCard>
        <DashboardCard title="Órdenes activas" description="Trabajos en proceso en el taller." icon={Wrench} action={{ label: 'Ver todas', href: '/workshop' }}><ActiveOrders tickets={activeTickets.slice(0, 5)} loading={ticketsQuery.isLoading} /></DashboardCard>
        <DashboardCard title="Atención hoy" description="Tareas que requieren tu atención." icon={AlertTriangle} action={{ label: 'Ver taller', href: '/workshop' }}><AttentionList items={attention} session={session} /></DashboardCard>
      </section>

      <section className="grid items-stretch gap-3 xl:grid-cols-[1.08fr_.94fr_1fr]">
        <DashboardCard title="Cobros netos" description="Ingresos de los últimos 7 días." icon={CircleDollarSign} corner={<strong className="text-lg text-slate-950">{formatCurrency(sumDailySales(dailySales))}</strong>}><NetSalesChart data={dailySales} /></DashboardCard>
        <DashboardCard title="Actividad reciente" description="Últimos eventos en el taller." icon={Activity} action={{ label: 'Ver logs', href: '/operations/logs' }}><ActivityList items={activity} /></DashboardCard>
        <DashboardCard title="Accesos rápidos" description="Acciones más comunes del taller." icon={ShieldCheck}><QuickActions session={session} /></DashboardCard>
      </section>
    </div>
  );
}

type Tone = 'blue' | 'amber' | 'orange' | 'green' | 'red' | 'violet';
type Metric = { label: string; value: string; detail: string; icon: LucideIcon; tone: Tone };
const tones: Record<Tone, string> = { blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', orange: 'bg-orange-50 text-orange-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', violet: 'bg-violet-50 text-violet-700' };
const dots: Record<Tone, string> = { blue: 'bg-blue-500', amber: 'bg-amber-500', orange: 'bg-orange-500', green: 'bg-emerald-500', red: 'bg-red-500', violet: 'bg-violet-500' };

function MetricCard({ metric }: { metric: Metric }) { const Icon = metric.icon; return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[metric.tone])}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-600">{metric.label}</p><p className="mt-0.5 truncate text-xl font-bold text-slate-950">{metric.value}</p><p className="truncate text-[11px] text-muted-foreground">{metric.detail}</p></div></article>; }
function OperationCount({ label, value, danger }: { label: string; value: number; danger?: boolean }) { return <div className="border-l border-zinc-200 px-3 text-center"><p className={cn('text-lg font-bold text-slate-950', danger && 'text-red-600')}>{value}</p><p className={cn('text-[11px] text-muted-foreground', danger && 'text-red-600')}>{label}</p></div>; }

function DashboardCard({ title, description, icon: Icon, action, corner, children }: { title: string; description: string; icon: LucideIcon; action?: { label: string; href: string }; corner?: React.ReactNode; children: React.ReactNode }) {
  return <article className="flex min-h-[18rem] min-w-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm"><header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5"><div className="flex min-w-0 gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-950">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p></div></div>{action ? <Link href={action.href} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">{action.label}<ArrowRight className="h-3.5 w-3.5" /></Link> : corner}</header><div className="min-h-0 flex-1 px-4 pb-3">{children}</div></article>;
}

function AgendaList({ appointments, loading }: { appointments: WorkshopAppointment[]; loading: boolean }) {
  if (loading) return <LoadingRows />; if (!appointments.length) return <EmptyState text="No hay citas programadas para hoy." />;
  return <div className="relative mt-1 before:absolute before:bottom-3 before:left-[4.45rem] before:top-3 before:w-px before:bg-zinc-200">{appointments.map((item) => <Link href="/workshop/agenda" key={item.id} className="relative grid grid-cols-[4rem_1fr_auto] items-start gap-3 border-b border-zinc-100 py-2 last:border-0"><time className="text-xs font-semibold text-slate-700">{formatTime(new Date(item.startsAt))}</time><span className="absolute left-[4.16rem] top-3.5 h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white" /><div className="min-w-0 pl-2"><p className="truncate text-xs font-semibold text-slate-950">{item.customer.name}</p><p className="truncate text-[11px] text-muted-foreground">{vehicleName(item.vehicle)} · {item.reason}</p></div><SoftBadge label={appointmentLabels[item.status]} tone={appointmentTone(item.status)} /></Link>)}</div>;
}

function ActiveOrders({ tickets, loading }: { tickets: WorkshopTicket[]; loading: boolean }) {
  if (loading) return <LoadingRows />; if (!tickets.length) return <EmptyState text="No hay órdenes activas en el taller." />;
  return <div className="mt-1 divide-y divide-zinc-100">{tickets.map((ticket) => { const progress = taskProgress(ticket); return <Link href={`/workshop?ticket=${ticket.id}`} key={ticket.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2 py-2"><VehicleIllustration type={ticket.vehicle.vehicleType} className="h-9 w-12" /><div className="grid min-w-0 gap-x-3 sm:grid-cols-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-950">{ticket.ticketNumber} · {ticket.vehicle.licensePlate ?? 'Sin placa'}</p><p className="truncate text-[11px] text-muted-foreground">{vehicleName(ticket.vehicle)}</p></div><div className="min-w-0"><p className="truncate text-xs text-slate-700">{ticket.customer.name}</p>{progress !== null ? <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} /></div> : null}</div></div><SoftBadge label={ticketLabels[ticket.status]} tone={ticketTone(ticket.status)} /></Link>; })}</div>;
}

type AttentionItem = { label: string; detail: string; value: number; href: string; icon: LucideIcon; tone: Tone };
function buildAttention(summary: OperationalDashboardSummary, delayed: number, lateAppointments: number, ready: number, approval: number): AttentionItem[] { return [
  { label: 'cotizaciones pendientes', detail: 'Requieren aprobación del cliente', value: approval, href: '/quotations', icon: FileText, tone: 'orange' },
  { label: 'órdenes retrasadas', detail: 'Exceden el tiempo prometido', value: delayed, href: '/workshop', icon: Clock3, tone: 'red' },
  { label: 'productos con stock bajo', detail: 'Revisar inventario de repuestos', value: summary.lowStockProducts, href: '/products', icon: Package, tone: 'amber' },
  { label: 'vehículos listos para entrega', detail: 'Notificar al cliente', value: ready, href: '/workshop', icon: CheckCircle2, tone: 'green' },
  { label: 'citas retrasadas', detail: 'Confirmar llegada o reprogramar', value: lateAppointments, href: '/workshop/agenda', icon: CalendarDays, tone: 'red' },
  { label: 'facturas pendientes', detail: 'Requieren seguimiento de cobro', value: summary.pendingInvoices, href: '/invoices', icon: WalletCards, tone: 'violet' },
].filter((item) => item.value > 0) as AttentionItem[]; }
function AttentionList({ items, session }: { items: AttentionItem[]; session: AuthSession }) { const visible = items.filter((item) => canAccessPath(session, item.href)).slice(0, 5); if (!visible.length) return <EmptyState text="Todo está al día. No hay alertas operativas." />; return <div className="mt-1 divide-y divide-zinc-100">{visible.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.label} className="flex items-center gap-3 py-2"><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[item.tone])}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-950">{item.value} {item.label}</p><p className="truncate text-[11px] text-muted-foreground">{item.detail}</p></div></Link>; })}</div>; }

type ActivityItem = { id: string; label: string; detail: string; createdAt: string; tone: Tone };
function buildActivity(tickets: WorkshopTicket[], summary: OperationalDashboardSummary): ActivityItem[] {
  const labels: Partial<Record<WorkshopTicketStatus, string>> = { RECEIVED: 'Vehículo recibido', DIAGNOSIS: 'Diagnóstico iniciado', AWAITING_APPROVAL: 'Cotización preparada', APPROVED: 'Aprobación recibida', IN_PROGRESS: 'Reparación iniciada', READY_FOR_DELIVERY: 'Vehículo terminado', DELIVERED: 'Vehículo entregado' };
  const workshop = tickets.flatMap((ticket) => ticket.statusEvents.map((event) => ({ id: event.id, label: labels[event.toStatus] ?? 'Estado actualizado', detail: `${ticket.ticketNumber} · ${ticket.vehicle.licensePlate ?? vehicleName(ticket.vehicle)}`, createdAt: event.createdAt, tone: ticketTone(event.toStatus) })));
  const payments = summary.recentInvoices.map((invoice) => ({ id: `invoice-${invoice.id}`, label: 'Cobro registrado', detail: `${invoice.invoiceNumber} · ${invoice.customerName}`, createdAt: invoice.issuedAt ?? invoice.createdAt, tone: 'green' as Tone }));
  const emails = summary.recentAuditActivity.filter((item) => item.action === 'DOCUMENT_EMAIL_SENT').map((item) => ({ id: `audit-${item.id}`, label: 'Cotización enviada', detail: item.userName ?? 'Sistema', createdAt: item.createdAt, tone: 'blue' as Tone }));
  return [...workshop, ...payments, ...emails].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
function ActivityList({ items }: { items: ActivityItem[] }) { if (!items.length) return <EmptyState text="Aún no hay actividad operativa reciente." />; return <div className="mt-1 divide-y divide-zinc-100">{items.map((item) => <div key={item.id} className="grid grid-cols-[.55rem_1fr_auto] items-center gap-2 py-1.5"><span className={cn('h-2 w-2 rounded-full', dots[item.tone])} /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{item.label}</p><p className="truncate text-[11px] text-muted-foreground">{item.detail}</p></div><time className="text-[10px] text-muted-foreground">{formatTime(new Date(item.createdAt))}</time></div>)}</div>; }

function QuickActions({ session }: { session: AuthSession }) { const actions = [
  { label: 'Toma de órdenes', href: '/workshop/agenda', icon: CalendarDays }, { label: 'Órdenes de trabajo', href: '/workshop', icon: Wrench },
  { label: 'Cotizaciones', href: '/quotations', icon: FileText }, { label: 'Sesiones de caja', href: '/cash/sessions', icon: CircleDollarSign },
  { label: 'Clientes y vehículos', href: '/customers', icon: Users }, { label: 'Inventario', href: '/products', icon: Package },
].filter((item) => canAccessPath(session, item.href)); return <div className="mt-2 grid grid-cols-2 gap-2">{actions.map((item) => { const Icon = item.icon; return <Link key={item.label} href={item.href} className="flex min-h-[4.4rem] flex-col items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-2 text-center text-xs font-semibold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50/40"><Icon className="h-5 w-5 text-blue-700" />{item.label}</Link>; })}</div>; }
function NetSalesChart({ data }: { data: NonNullable<OperationalDashboardSummary['salesLast7Days']> }) { return <div className="mt-2 h-[12.5rem] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e4e4e7" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={compactMoney} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div>; }

function SoftBadge({ label, tone }: { label: string; tone: Tone }) { return <span className={cn('inline-flex max-w-32 shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold', tones[tone])}>{label}</span>; }
function ticketTone(status: WorkshopTicketStatus): Tone { if (status === 'READY_FOR_DELIVERY' || status === 'DELIVERED') return 'green'; if (status === 'AWAITING_APPROVAL') return 'orange'; if (status === 'IN_PROGRESS') return 'blue'; if (status === 'CANCELLED') return 'red'; if (status === 'APPROVED') return 'violet'; return 'amber'; }
function appointmentTone(status: WorkshopAppointmentStatus): Tone { if (status === 'CONVERTED_TO_RECEPTION' || status === 'ARRIVED') return 'green'; if (status === 'CONFIRMED') return 'blue'; if (status === 'NO_SHOW' || status === 'CANCELLED') return 'red'; return 'violet'; }
function taskProgress(ticket: WorkshopTicket) { return ticket.tasks.length ? Math.round(ticket.tasks.filter((task) => task.status === 'COMPLETED').length / ticket.tasks.length * 100) : null; }
function compareTickets(a: WorkshopTicket, b: WorkshopTicket) { if (!a.promisedAt) return 1; if (!b.promisedAt) return -1; return new Date(a.promisedAt).getTime() - new Date(b.promisedAt).getTime(); }
function vehicleName(vehicle: WorkshopTicket['vehicle']) { return [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' '); }
function formatTime(date: Date) { return new Intl.DateTimeFormat('es-DO', { hour: '2-digit', minute: '2-digit' }).format(date); }
function formatFullDate(date: Date) { return new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date); }
function getGreeting() { const hour = new Date().getHours(); return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'; }
function dayBounds() { const start = new Date(); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }; }
function sumDailySales(data: NonNullable<OperationalDashboardSummary['salesLast7Days']>) { return data.reduce((sum, item) => sum + item.total, 0); }
function compactMoney(value: number) { return Math.abs(value) >= 1000 ? `RD$${Math.round(value / 1000)}k` : `RD$${Math.round(value)}`; }
function EmptyState({ text }: { text: string }) { return <div className="grid min-h-44 place-items-center rounded-lg bg-zinc-50 px-5 text-center text-xs text-muted-foreground">{text}</div>; }
function LoadingRows() { return <div className="mt-2 space-y-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-100" />)}</div>; }
function DashboardMessage({ title, detail }: { title: string; detail: string }) { return <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center"><h1 className="text-lg font-bold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>; }
function DashboardSkeleton() { return <div className="space-y-3">{[72, 96, 70, 300, 280].map((height, i) => <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-white" style={{ height }} />)}</div>; }
