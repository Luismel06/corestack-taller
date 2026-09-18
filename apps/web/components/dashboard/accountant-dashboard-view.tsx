'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Landmark,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { getDashboardSummary, type DashboardSummary } from '@/lib/api';
import { getSession } from '@/lib/auth-session';
import { canAccessPath } from '@/lib/authorization';
import { cn, formatCurrency } from '@/lib/utils';

export function AccountantDashboardView() {
  const session = getSession();
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', session?.tenantId, 'accountant'],
    queryFn: () => getDashboardSummary(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
    refetchInterval: 60_000,
  });

  if (!session) return <DashboardMessage title="Sesión requerida" detail="Inicia sesión para consultar el panel contable." />;
  if (summaryQuery.isLoading) return <DashboardSkeleton />;
  if (!summaryQuery.data) return <DashboardMessage title="No se pudo cargar el panel contable" detail="Comprueba la conexión con la API e inténtalo nuevamente." />;

  const summary = summaryQuery.data;
  const receivables = summary.accounting.receivables;
  const payables = summary.accounting.payables;
  const attention = buildAttention(summary);
  const quickActions = [
    { label: 'Facturación', href: '/invoices', icon: FileText },
    { label: 'Cuentas por cobrar', href: '/receivables', icon: WalletCards },
    { label: 'Cuentas por pagar', href: '/payables', icon: ReceiptText },
    { label: 'Facturas de suplidores', href: '/supplier-invoices', icon: ScrollText },
    { label: 'Aprobaciones de crédito', href: '/credit-approvals', icon: BadgeDollarSign },
    { label: 'Devoluciones', href: '/returns', icon: RotateCcw },
    { label: 'Sesiones de caja', href: '/cash/sessions', icon: Landmark },
    { label: 'Secuencias fiscales', href: '/settings/fiscal-sequences', icon: ClipboardCheck },
  ].filter((item) => canAccessPath(session, item.href));

  return (
    <div className="space-y-4 pb-5">
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Landmark className="h-5 w-5" /></span>
          <div><h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Panel contable</h1><p className="mt-0.5 text-sm text-muted-foreground">Ventas, obligaciones, cobros y alertas financieras de {session.tenantName}.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs"><p className="font-semibold capitalize text-slate-900">{formatFullDate(new Date())}</p><p className="text-muted-foreground">Actualizado {formatTime(new Date(summaryQuery.dataUpdatedAt))}</p></div>
          <Button variant="outline" onClick={() => void summaryQuery.refetch()} disabled={summaryQuery.isFetching}><RefreshCw className={cn('h-4 w-4', summaryQuery.isFetching && 'animate-spin')} />Actualizar</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores financieros">
        <MetricCard label="Ventas netas del mes" value={formatCurrency(summary.netSalesMonth)} detail={`${formatCurrency(summary.netSalesToday)} cobrados hoy`} icon={TrendingUp} tone="blue" />
        <MetricCard label="Cuentas por cobrar" value={formatCurrency(receivables.outstandingBalance)} detail={`${receivables.openInvoiceCount} factura(s) abierta(s)`} icon={WalletCards} tone="violet" />
        <MetricCard label="Cuentas por pagar" value={formatCurrency(payables.outstandingBalance)} detail={`${payables.openInvoiceCount} obligación(es) abierta(s)`} icon={ReceiptText} tone="amber" />
        <MetricCard label="Balance pendiente" value={formatCurrency(receivables.outstandingBalance - payables.outstandingBalance)} detail="Por cobrar menos por pagar" icon={Banknote} tone={receivables.outstandingBalance - payables.outstandingBalance < 0 ? 'red' : 'green'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Ingresos netos" description="Comportamiento de los últimos 7 días." icon={CircleDollarSign}>
          <div className="h-64 pt-3"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.salesLast7Days ?? []} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e4e4e7" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#71717a' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#71717a' }} tickFormatter={compactMoney} /><Tooltip formatter={(value) => formatCurrency(Number(value))} /><Bar dataKey="total" fill="#059669" radius={[5, 5, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Atención financiera" description="Partidas que requieren seguimiento." icon={ShieldAlert}>
          <div className="divide-y divide-zinc-100">{attention.length ? attention.map((item) => <Link key={item.label} href={item.href} className="flex items-center gap-3 py-3 first:pt-1"><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.danger ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}><item.icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-950">{item.value} {item.label}</p><p className="truncate text-xs text-muted-foreground">{item.detail}</p></div><ArrowRight className="h-4 w-4 text-slate-400" /></Link>) : <EmptyState text="No hay alertas financieras pendientes." />}</div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AgingPanel title="Cuentas por cobrar" href="/receivables" summary={receivables} />
        <AgingPanel title="Cuentas por pagar" href="/payables" summary={payables} />
        <Panel title="Control documental" description="Facturas y comprobantes del negocio." icon={FileText}>
          <div className="grid grid-cols-2 gap-2"><SmallStat label="Facturas pagadas" value={summary.paidInvoices} /><SmallStat label="Facturas pendientes" value={summary.pendingInvoices} /><SmallStat label="Borradores" value={summary.draftInvoices} /><SmallStat label="Canceladas" value={summary.cancelledInvoices} /></div>
          <Link href="/invoices" className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">Abrir facturación <ArrowRight className="h-4 w-4" /></Link>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Panel title="Facturas recientes" description="Últimos documentos emitidos." icon={ReceiptText}>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2">Documento</th><th className="pb-2">Cliente</th><th className="pb-2">Estado</th><th className="pb-2 text-right">Total</th></tr></thead><tbody className="divide-y divide-zinc-100">{summary.recentInvoices.slice(0, 6).map((invoice) => <tr key={invoice.id}><td className="py-2.5 font-semibold"><Link href={`/invoices/${invoice.id}`} className="hover:underline">{invoice.invoiceNumber}</Link></td><td className="py-2.5 text-slate-600">{invoice.customerName}</td><td className="py-2.5"><span className="rounded-full bg-zinc-100 px-2 py-1 text-xs">{invoiceStatus(invoice.status)}</span></td><td className="py-2.5 text-right font-semibold">{formatCurrency(invoice.total)}</td></tr>)}</tbody></table>{!summary.recentInvoices.length ? <EmptyState text="No hay facturas recientes." /> : null}</div>
        </Panel>
        <Panel title="Accesos contables" description="Módulos disponibles para el contador." icon={Landmark}>
          <div className="grid grid-cols-2 gap-2">{quickActions.map((item) => <Link key={item.href} href={item.href} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-center text-xs font-semibold text-slate-800 transition hover:border-emerald-200 hover:bg-emerald-50/50"><item.icon className="h-5 w-5 text-emerald-700" />{item.label}</Link>)}</div>
        </Panel>
      </section>
    </div>
  );
}

type Tone = 'blue' | 'violet' | 'amber' | 'green' | 'red';
const toneClasses: Record<Tone, string> = { blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700' };
function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: LucideIcon; tone: Tone }) { return <article className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', toneClasses[tone])}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-600">{label}</p><p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div></article>; }
function Panel({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children: React.ReactNode }) { return <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><header className="mb-3 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Icon className="h-4 w-4" /></span><div><h2 className="font-bold text-slate-950">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div></header>{children}</article>; }
function AgingPanel({ title, href, summary }: { title: string; href: string; summary: DashboardSummary['accounting']['receivables'] }) { return <Panel title={title} description="Vencimiento de obligaciones abiertas." icon={CalendarClock}><div className="space-y-2"><AgingRow label="Saldo abierto" value={formatCurrency(summary.outstandingBalance)} /><AgingRow label="Saldo vencido" value={formatCurrency(summary.overdueBalance)} danger={summary.overdueBalance > 0} /><AgingRow label="Vencen hoy" value={String(summary.dueTodayCount)} /><AgingRow label="Próximos 7 días" value={String(summary.dueSoonCount)} /></div><Link href={href} className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold hover:bg-zinc-50">Ver detalle <ArrowRight className="h-4 w-4" /></Link></Panel>; }
function AgingRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"><span className="text-slate-600">{label}</span><strong className={cn('text-slate-950', danger && 'text-red-600')}>{value}</strong></div>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-zinc-50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></div>; }
function buildAttention(summary: DashboardSummary) { const { receivables, payables, creditApprovals, purchaseOrders, receipts } = summary.accounting; return [{ label: 'cuentas por cobrar vencidas', value: receivables.overdueCount, detail: formatCurrency(receivables.overdueBalance), href: '/receivables', icon: WalletCards, danger: true }, { label: 'cuentas por pagar vencidas', value: payables.overdueCount, detail: formatCurrency(payables.overdueBalance), href: '/payables', icon: AlertTriangle, danger: true }, { label: 'créditos pendientes', value: creditApprovals.pendingCount, detail: `${formatCurrency(creditApprovals.pendingFinancedAmount)} por revisar`, href: '/credit-approvals', icon: BadgeDollarSign, danger: false }, { label: 'compras sin factura', value: purchaseOrders.awaitingInvoiceCount, detail: 'Requieren conciliación documental', href: '/purchase-orders', icon: FileText, danger: false }, { label: 'recepciones con diferencias', value: receipts.itemsWithDifferenceCount, detail: 'Validar cantidades y costos', href: '/supplier-invoices', icon: ClipboardCheck, danger: false }, { label: 'secuencias fiscales en alerta', value: summary.fiscalSequenceAlerts.length, detail: 'Revisar vigencia y numeración', href: '/settings/fiscal-sequences', icon: ShieldAlert, danger: true }].filter((item) => item.value > 0); }
function invoiceStatus(status: string) { return ({ PAID: 'Pagada', ISSUED: 'Emitida', DRAFT: 'Borrador', CANCELLED: 'Cancelada', VOIDED: 'Anulada', PARTIALLY_PAID: 'Pago parcial' } as Record<string, string>)[status] ?? status; }
function compactMoney(value: number) { return Math.abs(value) >= 1000 ? `RD$${Math.round(value / 1000)}k` : `RD$${Math.round(value)}`; }
function formatTime(date: Date) { return new Intl.DateTimeFormat('es-DO', { hour: '2-digit', minute: '2-digit' }).format(date); }
function formatFullDate(date: Date) { return new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date); }
function EmptyState({ text }: { text: string }) { return <div className="grid min-h-28 place-items-center rounded-lg bg-zinc-50 px-5 text-center text-xs text-muted-foreground">{text}</div>; }
function DashboardMessage({ title, detail }: { title: string; detail: string }) { return <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center"><h1 className="text-lg font-bold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>; }
function DashboardSkeleton() { return <div className="space-y-3">{[76, 105, 300, 280].map((height, index) => <div key={index} className="animate-pulse rounded-xl border border-zinc-200 bg-white" style={{ height }} />)}</div>; }
