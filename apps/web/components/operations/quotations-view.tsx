'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Loader2,
  Mail,
  MoreHorizontal,
  Printer,
  Search,
  Send,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  acceptSalesOrder,
  cancelSalesOrder,
  getQuotationActivity,
  getSalesOrders,
  getWorkshopTickets,
  respondWorkshopApproval,
  updateWorkshopTicket,
  type QuotationActivity,
  type SalesOrder,
  type WorkshopApprovalResponse,
  type WorkshopTicket,
  type WorkshopVehicleType,
} from '@/lib/api';
import { hasPermission } from '@/lib/authorization';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { workshopQuoteApprovalBlocker } from '@/lib/workshop-quote';
import { CancelReasonModal } from './cancel-reason-modal';
import { DocumentEmailDialog } from './document-email-dialog';
import { SessionRequired, useCurrentSession } from './session-required';
import { VehicleIllustration } from './vehicle-illustration';
import {
  WorkshopAuthorizationDialog,
  type AuthorizationResponse,
} from './workshop-authorization-dialog';

type QuoteUiStatus =
  | 'DRAFT'
  | 'PENDING_SEND'
  | 'SENT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';
type QuoteKpi = 'ALL' | 'PENDING' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
type QuoteSource = 'SALES_ORDER' | 'WORKSHOP';
type QuoteLine = {
  id: string;
  type: 'LABOR' | 'PART' | 'OTHER';
  description: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  taxTotal: string;
  total: string;
};
type QuoteRecord = {
  key: string;
  source: QuoteSource;
  entityId: string;
  code: string;
  orderNumber: string | null;
  ticketId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  vehicle: {
    licensePlate: string | null;
    make: string;
    model: string;
    year: number | null;
    vehicleType: WorkshopVehicleType | null;
  } | null;
  motive: string | null;
  createdAt: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  status: QuoteUiStatus;
  email: QuotationActivity | null;
  activity: QuotationActivity[];
  lines: QuoteLine[];
  salesOrder: SalesOrder | null;
  ticket: WorkshopTicket | null;
};

const acceptedOrderStatuses = new Set(['CREATED', 'SENT_TO_CASHIER', 'IN_CASHIER', 'COMPLETED']);
const statusLabels: Record<QuoteUiStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_SEND: 'Pendiente de envío',
  SENT: 'Enviada',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
};
const statusStyles: Record<QuoteUiStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_SEND: 'bg-amber-100 text-amber-800',
  SENT: 'bg-blue-100 text-blue-800',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  CANCELLED: 'bg-slate-100 text-slate-600',
  EXPIRED: 'bg-violet-100 text-violet-800',
};

export function QuotationsView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<QuoteUiStatus | 'ALL'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<QuoteSource | 'ALL'>('ALL');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [kpiFilter, setKpiFilter] = useState<QuoteKpi>('ALL');
  const [selected, setSelected] = useState<QuoteRecord | null>(null);
  const [emailTarget, setEmailTarget] = useState<QuoteRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<QuoteRecord | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [authorizationTarget, setAuthorizationTarget] = useState<QuoteRecord | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const salesOrdersQuery = useQuery({
    queryKey: ['sales-orders', session?.tenantId, 'quotations-all'],
    queryFn: () => getSalesOrders(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const workshopQuery = useQuery({
    queryKey: ['workshop-tickets', session?.tenantId, 'quotation-center'],
    queryFn: () => getWorkshopTickets(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const activityQuery = useQuery({
    queryKey: ['quotation-activity', session?.tenantId],
    queryFn: () => getQuotationActivity(session!.tenantId, session!.accessToken),
    enabled: Boolean(session && hasPermission(session, 'quotes.create')),
  });

  const activityByEntity = useMemo(() => {
    const map = new Map<string, QuotationActivity[]>();
    for (const activity of activityQuery.data ?? []) {
      if (!activity.entityId) continue;
      const key = `${activity.entity}:${activity.entityId}`;
      map.set(key, [...(map.get(key) ?? []), activity]);
    }
    return map;
  }, [activityQuery.data]);

  const records = useMemo<QuoteRecord[]>(() => {
    const latestEmail = (entity: 'SalesOrder' | 'WorkshopTicket', id: string) =>
      (activityByEntity.get(`${entity}:${id}`) ?? []).find((item) =>
        ['DOCUMENT_EMAIL_SENT', 'DOCUMENT_EMAIL_FAILED'].includes(item.action),
      ) ?? null;
    const commercial = (salesOrdersQuery.data ?? [])
      .filter((order) => order.destination === 'QUOTATION' || order.orderNumber.startsWith('COT-'))
      .map<QuoteRecord>((order) => {
        const email = latestEmail('SalesOrder', order.id);
        const status: QuoteUiStatus =
          order.status === 'CANCELLED'
            ? 'CANCELLED'
            : acceptedOrderStatuses.has(order.status)
              ? 'APPROVED'
              : email?.action === 'DOCUMENT_EMAIL_SENT'
                ? 'SENT'
                : 'PENDING_SEND';
        return {
          key: `sales-${order.id}`,
          source: 'SALES_ORDER',
          entityId: order.id,
          code: order.orderNumber,
          orderNumber: order.workshopTicket?.ticketNumber ?? null,
          ticketId: order.workshopTicket?.id ?? null,
          customerName: order.customer?.name ?? order.clientName ?? 'Cliente ocasional',
          customerPhone: order.customer?.phone ?? null,
          customerEmail: order.customer?.email ?? null,
          vehicle: order.workshopTicket
            ? { ...order.workshopTicket.vehicle, year: null, vehicleType: null }
            : null,
          motive: order.notes ?? order.items[0]?.description ?? null,
          createdAt: order.createdAt,
          subtotal: order.subtotal,
          taxTotal: order.taxTotal,
          discountTotal: order.discountTotal,
          total: order.total,
          status,
          email,
          activity: activityByEntity.get(`SalesOrder:${order.id}`) ?? [],
          lines: order.items.map((item) => ({
            ...item,
            type: item.product?.trackInventory ? 'PART' : 'OTHER',
          })),
          salesOrder: order,
          ticket: null,
        };
      });
    const workshop = (workshopQuery.data ?? [])
      .filter((ticket) => ticket.quoteVersions.length > 0)
      .map<QuoteRecord>((ticket) => {
        const version = ticket.quoteVersions[0];
        const email = latestEmail('WorkshopTicket', ticket.id);
        const status: QuoteUiStatus =
          ticket.status === 'CANCELLED'
            ? 'CANCELLED'
            : version.status === 'APPROVED' || version.status === 'PARTIALLY_APPROVED'
              ? 'APPROVED'
              : version.status === 'REJECTED'
                ? 'REJECTED'
                : ticket.approvalStatus === 'PENDING'
                  ? 'PENDING_APPROVAL'
                  : email?.action === 'DOCUMENT_EMAIL_SENT'
                    ? 'SENT'
                    : ticket.status === 'DIAGNOSIS'
                      ? 'DRAFT'
                      : 'PENDING_SEND';
        return {
          key: `workshop-${ticket.id}`,
          source: 'WORKSHOP',
          entityId: ticket.id,
          code: `${ticket.ticketNumber}-V${version.version}`,
          orderNumber: ticket.ticketNumber,
          ticketId: ticket.id,
          customerName: ticket.customer.name,
          customerPhone: ticket.customer.phone,
          customerEmail: ticket.customer.email,
          vehicle: ticket.vehicle,
          motive: ticket.complaint,
          createdAt: version.createdAt,
          subtotal: String(Number(version.laborTotal) + Number(version.partsTotal)),
          taxTotal: String(
            Math.max(
              0,
              Number(version.total) - Number(version.laborTotal) - Number(version.partsTotal),
            ),
          ),
          discountTotal: '0',
          total: version.total,
          status,
          email,
          activity: activityByEntity.get(`WorkshopTicket:${ticket.id}`) ?? [],
          lines: ticket.lines.map((line) => ({
            id: line.id,
            type: line.type,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.total,
            taxTotal: '0',
            total: line.total,
          })),
          salesOrder: null,
          ticket,
        };
      });
    return [...commercial, ...workshop].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activityByEntity, salesOrdersQuery.data, workshopQuery.data]);

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const query = search.trim().toLowerCase();
        if (
          query &&
          ![
            record.code,
            record.orderNumber,
            record.customerName,
            record.customerPhone,
            record.vehicle?.licensePlate,
            record.vehicle?.make,
            record.vehicle?.model,
          ]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query))
        )
          return false;
        if (statusFilter !== 'ALL' && record.status !== statusFilter) return false;
        if (sourceFilter !== 'ALL' && record.source !== sourceFilter) return false;
        if (dateFilter && localDateKey(new Date(record.createdAt)) !== dateFilter) return false;
        if (
          kpiFilter === 'PENDING' &&
          !['DRAFT', 'PENDING_SEND', 'PENDING_APPROVAL'].includes(record.status)
        )
          return false;
        if (
          kpiFilter === 'SENT' &&
          !record.activity.some((event) => event.action === 'DOCUMENT_EMAIL_SENT')
        )
          return false;
        if (kpiFilter === 'APPROVED' && record.status !== 'APPROVED') return false;
        if (kpiFilter === 'REJECTED' && record.status !== 'REJECTED') return false;
        if (kpiFilter === 'EXPIRED' && record.status !== 'EXPIRED') return false;
        return true;
      }),
    [dateFilter, kpiFilter, records, search, sourceFilter, statusFilter],
  );

  useEffect(
    () => setPage(1),
    [dateFilter, kpiFilter, pageSize, search, sourceFilter, statusFilter],
  );
  useEffect(() => {
    setSelected((current) =>
      current ? (records.find((record) => record.key === current.key) ?? null) : null,
    );
  }, [records]);
  useEffect(() => {
    if (!selected) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [selected]);

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      cancelSalesOrder(session!.tenantId, session!.accessToken, orderId, reason),
    onSuccess: async () => {
      toast.success('Cotización cancelada correctamente.');
      setCancelTarget(null);
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la cotización.'),
  });
  const acceptMutation = useMutation({
    mutationFn: (orderId: string) =>
      acceptSalesOrder(session!.tenantId, session!.accessToken, orderId),
    onSuccess: async () => {
      toast.success('Aprobación registrada y cotización enviada al siguiente paso.');
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo aprobar la cotización.'),
  });
  const requestApprovalMutation = useMutation({
    mutationFn: (ticketId: string) =>
      updateWorkshopTicket(session!.tenantId, session!.accessToken, ticketId, {
        status: 'AWAITING_APPROVAL',
      }),
    onSuccess: async () => {
      toast.success('Cotización enviada a aprobación.');
      await queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo solicitar la aprobación.'),
  });
  const approvalMutation = useMutation({
    mutationFn: ({
      ticketId,
      response,
    }: {
      ticketId: string;
      response: WorkshopApprovalResponse;
    }) => respondWorkshopApproval(session!.tenantId, session!.accessToken, ticketId, response),
    onSuccess: async () => {
      toast.success('Respuesta del cliente registrada.');
      setAuthorizationTarget(null);
      setSelected(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['quotation-activity'] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la respuesta.'),
  });

  if (!session) return <SessionRequired session={session} />;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const today = localDateKey(new Date());
  const kpis: Array<{
    id: QuoteKpi;
    label: string;
    subtitle: string;
    value: number;
    icon: LucideIcon;
    tone: string;
  }> = [
    {
      id: 'PENDING',
      label: 'Pendientes',
      subtitle: 'Requieren seguimiento',
      value: records.filter((r) => ['DRAFT', 'PENDING_SEND', 'PENDING_APPROVAL'].includes(r.status))
        .length,
      icon: FileText,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      id: 'SENT',
      label: 'Enviadas',
      subtitle: 'A clientes',
      value: records.filter((r) =>
        r.activity.some((event) => event.action === 'DOCUMENT_EMAIL_SENT'),
      ).length,
      icon: Send,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      id: 'APPROVED',
      label: 'Aprobadas',
      subtitle: 'Listas para continuar',
      value: records.filter((r) => r.status === 'APPROVED').length,
      icon: CheckCircle2,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      id: 'REJECTED',
      label: 'Rechazadas',
      subtitle: 'Por el cliente',
      value: records.filter((r) => r.status === 'REJECTED').length,
      icon: XCircle,
      tone: 'bg-rose-50 text-rose-700',
    },
    {
      id: 'EXPIRED',
      label: 'Vencidas',
      subtitle: 'Sin vigencia configurada',
      value: 0,
      icon: Clock3,
      tone: 'bg-violet-50 text-violet-700',
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cotizaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestión centralizada de cotizaciones pendientes, enviadas, aprobadas y canceladas.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/workshop/agenda">
            <Wrench className="h-4 w-4" /> Ir a toma de órdenes
          </Link>
        </Button>
      </header>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <QuoteMetric
            key={kpi.id}
            {...kpi}
            selected={kpiFilter === kpi.id}
            onClick={() => setKpiFilter((current) => (current === kpi.id ? 'ALL' : kpi.id))}
          />
        ))}
      </section>
      <section className="grid gap-2 rounded-xl border bg-card p-2 shadow-sm lg:grid-cols-[minmax(16rem,1fr)_13rem_13rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-0 bg-muted/35 pl-9 shadow-none"
            placeholder="Buscar por COT, OT, placa o cliente"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as QuoteUiStatus | 'ALL')}
          className="h-10 rounded-md border bg-card px-3 text-sm"
        >
          <option value="ALL">Todos los estados</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          aria-label="Filtrar por fecha"
        />
        <Button type="button" variant="outline" onClick={() => setShowMoreFilters((v) => !v)}>
          <Filter className="h-4 w-4" /> Más filtros
        </Button>
        {showMoreFilters ? (
          <div className="lg:col-start-2">
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as QuoteSource | 'ALL')}
              className="h-10 w-full rounded-md border bg-card px-3 text-sm"
            >
              <option value="ALL">Todos los orígenes</option>
              <option value="WORKSHOP">Órdenes de taller</option>
              <option value="SALES_ORDER">Cotizaciones comerciales</option>
            </select>
          </div>
        ) : null}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Historial de cotizaciones</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cotizaciones comerciales y versiones vigentes de las órdenes de taller.
            </p>
          </div>
          {salesOrdersQuery.isLoading || workshopQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando cotizaciones...
            </div>
          ) : pageRecords.length ? (
            <QuotationTable records={pageRecords} onOpen={setSelected} onEmail={setEmailTarget} />
          ) : (
            <EmptyQuotationState />
          )}
          {filteredRecords.length ? (
            <Pagination
              currentPage={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={filteredRecords.length}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          ) : null}
        </section>
        <QuotationRail
          records={records}
          activities={activityQuery.data ?? []}
          today={today}
          onOpen={setSelected}
        />
      </div>
      {selected
        ? createPortal(
            <QuotationDetailModal
              record={selected}
              pending={acceptMutation.isPending || requestApprovalMutation.isPending}
              onClose={() => setSelected(null)}
              onEmail={() => setEmailTarget(selected)}
              onEdit={() =>
                selected.source === 'WORKSHOP'
                  ? router.push(`/workshop?ticket=${selected.ticketId}`)
                  : router.push(`/orders?edit=${selected.entityId}`)
              }
              onApprove={() =>
                selected.source === 'WORKSHOP'
                  ? setAuthorizationTarget(selected)
                  : acceptMutation.mutate(selected.entityId)
              }
              onRequestApproval={() =>
                selected.ticketId && requestApprovalMutation.mutate(selected.ticketId)
              }
              onCancel={() => {
                setCancelTarget(selected);
                setCancelReason('');
              }}
            />,
            document.body,
          )
        : null}
      {emailTarget ? (
        <DocumentEmailDialog
          open
          session={session}
          kind={emailTarget.source === 'WORKSHOP' ? 'workshop-quotes' : 'quotations'}
          documentId={emailTarget.entityId}
          documentNumber={emailTarget.code}
          customerName={emailTarget.customerName}
          defaultEmail={emailTarget.customerEmail}
          onClose={() => {
            setEmailTarget(null);
            void queryClient.invalidateQueries({ queryKey: ['quotation-activity'] });
          }}
        />
      ) : null}
      <CancelReasonModal
        open={Boolean(cancelTarget)}
        title="Cancelar cotización"
        description={
          cancelTarget
            ? `Indica por qué se cancela ${cancelTarget.code}.`
            : 'Indica el motivo de cancelación.'
        }
        reason={cancelReason}
        confirmLabel="Cancelar cotización"
        isPending={cancelMutation.isPending}
        onReasonChange={setCancelReason}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget && cancelReason.trim())
            cancelMutation.mutate({ orderId: cancelTarget.entityId, reason: cancelReason.trim() });
          else toast.error('El motivo de cancelación es requerido.');
        }}
      />
      {authorizationTarget?.ticket ? (
        <WorkshopAuthorizationDialog
          key={authorizationTarget.key}
          title={`Aprobación · ${authorizationTarget.code}`}
          customerName={authorizationTarget.customerName}
          lines={authorizationTarget.ticket.lines}
          allowPartial
          initiallyRejected={false}
          pending={approvalMutation.isPending}
          onClose={() => setAuthorizationTarget(null)}
          onSubmit={(response: AuthorizationResponse) =>
            approvalMutation.mutate({
              ticketId: authorizationTarget.ticket!.id,
              response: {
                ...response,
                quoteVersionId: authorizationTarget.ticket!.quoteVersions[0].id,
              },
            })
          }
        />
      ) : null}
    </div>
  );
}

function QuoteMetric({
  label,
  subtitle,
  value,
  icon: Icon,
  tone,
  selected,
  onClick,
}: {
  label: string;
  subtitle: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? 'border-primary/40 ring-2 ring-primary/10' : ''}`}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <strong className="block text-xl leading-5">{value}</strong>
        <span className="mt-1 block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
    </button>
  );
}
function QuoteStatusBadge({ status }: { status: QuoteUiStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function QuotationTable({
  records,
  onOpen,
  onEmail,
}: {
  records: QuoteRecord[];
  onOpen: (record: QuoteRecord) => void;
  onEmail: (record: QuoteRecord) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[68rem] text-left text-sm">
        <thead className="border-b bg-muted/35 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Cotización</th>
            <th className="px-3 py-3">OT</th>
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Vehículo</th>
            <th className="px-3 py-3">Fecha</th>
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3">Estado</th>
            <th className="px-3 py-3">Envío</th>
            <th className="px-2 py-3">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {records.map((record) => (
            <tr
              key={record.key}
              onClick={() => onOpen(record)}
              className="cursor-pointer transition hover:bg-muted/30"
            >
              <td className="px-4 py-3">
                <p className="font-semibold">{record.code}</p>
                <p className="mt-0.5 max-w-40 truncate text-xs text-muted-foreground">
                  {record.motive ?? 'Sin descripción'}
                </p>
              </td>
              <td className="px-3 py-3 font-medium">{record.orderNumber ?? '—'}</td>
              <td className="px-3 py-3">
                <p className="max-w-36 truncate font-medium">{record.customerName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {record.customerPhone ?? 'Sin teléfono'}
                </p>
              </td>
              <td className="px-3 py-2">
                <VehicleCell record={record} />
              </td>
              <td className="px-3 py-3 text-xs">{formatDateTime(record.createdAt)}</td>
              <td className="px-3 py-3 text-right font-semibold">
                {formatCurrency(Number(record.total))}
              </td>
              <td className="px-3 py-3">
                <QuoteStatusBadge status={record.status} />
              </td>
              <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                <EmailState record={record} onEmail={() => onEmail(record)} />
              </td>
              <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onOpen(record)}
                  aria-label={`Abrir ${record.code}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function VehicleCell({ record }: { record: QuoteRecord }) {
  if (!record.vehicle)
    return <span className="text-xs text-muted-foreground">Sin vehículo vinculado</span>;
  return (
    <div className="flex items-center gap-2">
      <VehicleIllustration type={record.vehicle.vehicleType} className="h-11 w-14 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{record.vehicle.licensePlate ?? 'Sin placa'}</p>
        <p className="max-w-36 truncate text-xs text-muted-foreground">
          {record.vehicle.make} {record.vehicle.model}
          {record.vehicle.year ? ` · ${record.vehicle.year}` : ''}
        </p>
      </div>
    </div>
  );
}
function EmailState({ record, onEmail }: { record: QuoteRecord; onEmail: () => void }) {
  if (record.status === 'CANCELLED')
    return <span className="text-xs text-muted-foreground">No disponible</span>;
  const sent = record.email?.action === 'DOCUMENT_EMAIL_SENT';
  return (
    <button type="button" onClick={onEmail} className="flex items-start gap-2 text-left text-xs">
      <Mail className={`mt-0.5 h-4 w-4 ${sent ? 'text-blue-600' : 'text-muted-foreground'}`} />
      <span>
        <strong className={sent ? 'text-blue-700' : 'text-foreground'}>
          {sent
            ? 'Reenviar'
            : record.email?.action === 'DOCUMENT_EMAIL_FAILED'
              ? 'Reintentar'
              : 'Sin enviar'}
        </strong>
        {record.email ? (
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {relativeTime(record.email.createdAt)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Pagination({
  currentPage,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  currentPage: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number | ((value: number) => number)) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span>
        Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} de{' '}
        {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          disabled={currentPage <= 1}
          onClick={() => onPage((v) => Math.max(1, v - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="rounded-md bg-slate-950 px-3 py-2 font-semibold text-white">
          {currentPage}
        </span>
        <span>de {pageCount}</span>
        <Button
          size="icon"
          variant="outline"
          disabled={currentPage >= pageCount}
          onClick={() => onPage((v) => Math.min(pageCount, v + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-9 rounded-md border bg-card px-2"
        >
          <option value={8}>8 por página</option>
          <option value={10}>10 por página</option>
          <option value={20}>20 por página</option>
        </select>
      </div>
    </div>
  );
}

function QuotationRail({
  records,
  activities,
  today,
  onOpen,
}: {
  records: QuoteRecord[];
  activities: QuotationActivity[];
  today: string;
  onOpen: (record: QuoteRecord) => void;
}) {
  const recordMap = new Map(
    records.map((r) => [
      `${r.source === 'WORKSHOP' ? 'WorkshopTicket' : 'SalesOrder'}:${r.entityId}`,
      r,
    ]),
  );
  const createdToday = records.filter((r) => localDateKey(new Date(r.createdAt)) === today);
  const summary: Array<[string, number, LucideIcon, string]> = [
    ['Cotizaciones creadas hoy', createdToday.length, FileText, 'bg-blue-100 text-blue-700'],
    [
      'Enviadas a clientes',
      createdToday.filter((r) => r.activity.some((event) => event.action === 'DOCUMENT_EMAIL_SENT'))
        .length,
      Send,
      'bg-sky-100 text-sky-700',
    ],
    [
      'Aprobadas',
      createdToday.filter((r) => r.status === 'APPROVED').length,
      CheckCircle2,
      'bg-emerald-100 text-emerald-700',
    ],
    [
      'Pendientes de respuesta',
      records.filter((r) => r.status === 'PENDING_APPROVAL').length,
      Clock3,
      'bg-orange-100 text-orange-700',
    ],
  ];
  return (
    <aside className="space-y-3">
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4" /> Resumen del día
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date().toLocaleDateString('es-DO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <div className="mt-4 space-y-3">
          {summary.map(([label, value, Icon, tone]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-muted-foreground">{label}</span>
              <strong className="ml-auto">{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Clock3 className="h-4 w-4 text-rose-500" /> Por vencer
        </h2>
        <div className="mt-3 rounded-lg bg-muted/35 p-3 text-xs text-muted-foreground">
          La estructura actual no registra vigencia de cotización. Cuando se configure, las próximas
          a vencer aparecerán aquí.
        </div>
      </section>
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4 text-primary" /> Actividad reciente
        </h2>
        <div className="relative mt-4 space-y-0 pl-1">
          <span className="absolute bottom-3 left-[0.45rem] top-2 w-px bg-slate-200" />
          {activities.slice(0, 6).map((activity) => {
            const record = activity.entityId
              ? recordMap.get(`${activity.entity}:${activity.entityId}`)
              : null;
            const label =
              activity.action === 'DOCUMENT_EMAIL_SENT'
                ? 'Cotización enviada'
                : activity.action === 'DOCUMENT_EMAIL_FAILED'
                  ? 'Error al enviar'
                  : activity.metadata?.approvalStatus === 'REJECTED'
                    ? 'Cotización rechazada'
                    : 'Aprobación recibida';
            return (
              <button
                key={activity.id}
                type="button"
                disabled={!record}
                onClick={() => record && onOpen(record)}
                className="relative flex w-full gap-3 pb-4 text-left last:pb-0"
              >
                <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-primary ring-1 ring-slate-200" />
                <span className="min-w-0 text-xs">
                  <strong className="block truncate">{label}</strong>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {activity.metadata?.documentNumber ?? record?.code ?? 'Cotización'} ·{' '}
                    {relativeTime(activity.createdAt)}
                  </span>
                </span>
              </button>
            );
          })}
          {!activities.length ? (
            <p className="text-xs text-muted-foreground">Sin actividad reciente.</p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function QuotationDetailModal({
  record,
  pending,
  onClose,
  onEmail,
  onEdit,
  onApprove,
  onRequestApproval,
  onCancel,
}: {
  record: QuoteRecord;
  pending: boolean;
  onClose: () => void;
  onEmail: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onRequestApproval: () => void;
  onCancel: () => void;
}) {
  const canEdit = ['DRAFT', 'PENDING_SEND', 'SENT', 'PENDING_APPROVAL'].includes(record.status);
  const approvalBlocker = record.ticket ? workshopQuoteApprovalBlocker(record.ticket) : null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle ${record.code}`}
        className="flex h-[90dvh] w-[92vw] max-w-[78rem] flex-col overflow-hidden rounded-2xl border bg-slate-50 shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b bg-white px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{record.code}</h2>
              <QuoteStatusBadge status={record.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {record.orderNumber ? `${record.orderNumber} · ` : ''}
              {record.customerName}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <main className="space-y-4">
              <section className="rounded-xl border bg-white p-4">
                <h3 className="font-semibold">Detalle de servicios y repuestos</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="border-b bg-muted/35 text-left text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="p-3">Descripción</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3 text-right">Cantidad</th>
                        <th className="p-3 text-right">Precio</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {record.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="p-3 font-medium">{line.description}</td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {line.type === 'PART'
                              ? 'Repuesto'
                              : line.type === 'LABOR'
                                ? 'Mano de obra'
                                : 'Servicio'}
                          </td>
                          <td className="p-3 text-right">{line.quantity}</td>
                          <td className="p-3 text-right">
                            {formatCurrency(Number(line.unitPrice))}
                          </td>
                          <td className="p-3 text-right font-semibold">
                            {formatCurrency(Number(line.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="ml-auto mt-4 w-full max-w-xs space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between">
                    <dt>Subtotal</dt>
                    <dd>{formatCurrency(Number(record.subtotal))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Impuestos</dt>
                    <dd>{formatCurrency(Number(record.taxTotal))}</dd>
                  </div>
                  {Number(record.discountTotal) ? (
                    <div className="flex justify-between">
                      <dt>Descuento</dt>
                      <dd>-{formatCurrency(Number(record.discountTotal))}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t pt-2 text-base font-semibold">
                    <dt>Total</dt>
                    <dd>{formatCurrency(Number(record.total))}</dd>
                  </div>
                </dl>
              </section>
            </main>
            <aside className="space-y-3">
              <section className="rounded-xl border bg-white p-4">
                <h3 className="text-sm font-semibold">Cliente y vehículo</h3>
                <p className="mt-3 text-sm font-medium">{record.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {record.customerPhone ?? 'Sin teléfono'} · {record.customerEmail ?? 'Sin email'}
                </p>
                <div className="mt-4">
                  <VehicleCell record={record} />
                </div>
              </section>
              <section className="rounded-xl border bg-white p-4">
                <h3 className="text-sm font-semibold">Historial de envío</h3>
                <div className="relative mt-4 space-y-0 pl-1">
                  <span className="absolute bottom-3 left-[0.45rem] top-2 w-px bg-slate-200" />
                  {record.activity
                    .filter((event) =>
                      ['DOCUMENT_EMAIL_SENT', 'DOCUMENT_EMAIL_FAILED'].includes(event.action),
                    )
                    .slice(0, 6)
                    .map((event) => (
                      <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                        <span
                          className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white ring-1 ring-slate-200 ${event.action === 'DOCUMENT_EMAIL_SENT' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        />
                        <div className="min-w-0 text-xs">
                          <p className="font-medium">
                            {event.action === 'DOCUMENT_EMAIL_SENT' ? 'Enviada' : 'Error de envío'}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {event.metadata?.recipient ?? 'Sin destinatario'} ·{' '}
                            {formatDateTime(event.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  {!record.activity.some((event) =>
                    ['DOCUMENT_EMAIL_SENT', 'DOCUMENT_EMAIL_FAILED'].includes(event.action),
                  ) ? (
                    <p className="text-xs text-muted-foreground">Todavía no se ha enviado.</p>
                  ) : null}
                </div>
              </section>
              {record.ticket?.quoteVersions[0]?.decision ? (
                <section className="rounded-xl border bg-white p-4">
                  <h3 className="text-sm font-semibold">Aprobación</h3>
                  <p className="mt-3 text-xs">
                    {record.ticket.quoteVersions[0].decision.authorizedByName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Método: {record.ticket.quoteVersions[0].decision.method}
                  </p>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {canEdit ? (
              <Button variant="outline" onClick={onEdit}>
                Editar
              </Button>
            ) : null}
            {record.status !== 'CANCELLED' ? (
              <Button variant="outline" onClick={onEmail}>
                <Mail className="h-4 w-4" />
                {record.email?.action === 'DOCUMENT_EMAIL_SENT' ? 'Reenviar' : 'Enviar'}
              </Button>
            ) : null}
            {record.source === 'SALES_ORDER' && ['PENDING_SEND', 'SENT'].includes(record.status) ? (
              <Button disabled={pending} onClick={onApprove}>
                <CheckCircle2 className="h-4 w-4" /> Aprobar
              </Button>
            ) : null}
            {record.source === 'WORKSHOP' && ['DRAFT', 'SENT'].includes(record.status) ? (
              <Button
                disabled={pending || Boolean(approvalBlocker)}
                title={approvalBlocker ?? 'Solicitar aprobación al cliente.'}
                onClick={onRequestApproval}
              >
                Solicitar aprobación
              </Button>
            ) : null}
            {record.source === 'WORKSHOP' && record.status === 'PENDING_APPROVAL' ? (
              <Button disabled={pending} onClick={onApprove}>
                Registrar respuesta
              </Button>
            ) : null}
            {record.source === 'SALES_ORDER' ? (
              <Button asChild variant="outline">
                <Link href={`/orders/${record.entityId}/print`}>
                  <Printer className="h-4 w-4" /> Visualizar
                </Link>
              </Button>
            ) : null}
            {record.source === 'SALES_ORDER' && ['PENDING_SEND', 'SENT'].includes(record.status) ? (
              <Button variant="ghost" className="text-rose-700" onClick={onCancel}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </footer>
      </section>
    </div>
  );
}

function EmptyQuotationState() {
  return (
    <div className="m-4 flex flex-col items-center rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
        <FileText className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold">No hay cotizaciones para mostrar</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Crea o continúa una orden de trabajo para preparar la cotización del vehículo.
      </p>
      <Button asChild className="mt-4" variant="outline">
        <Link href="/workshop/agenda">Ir a toma de órdenes</Link>
      </Button>
    </div>
  );
}
function relativeTime(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(difference / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
