'use client';

import { WorkshopTasksPanel } from './workshop-tasks-panel';
import { WorkshopBillingPanel } from './workshop-billing-panel';
import { workshopPaymentState } from '@/lib/workshop-payment';
import { workshopQuoteApprovalBlocker } from '@/lib/workshop-quote';
import { hasPermission } from '@/lib/authorization';
import type { WorkshopTaskInput, WorkshopTaskUpdate } from '@/lib/api';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardPlus,
  ClipboardCheck,
  Download,
  FileText,
  Gauge,
  Loader2,
  MessageCircle,
  PencilLine,
  Plus,
  Receipt,
  Search,
  Send,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createWorkshopTask,
  createWorkshopChangeOrder,
  createProduct,
  createWorkshopService,
  createWorkshopTicket,
  createWorkshopVehicle,
  createWorkshopReception,
  deleteWorkshopTicket,
  createWorkshopDelivery,
  getCustomers,
  getProducts,
  getWorkshopMechanics,
  getWorkshopChangeOrders,
  getWorkshopVehicleHistory,
  getWorkshopServices,
  getWorkshopTickets,
  getWorkshopVehicles,
  respondWorkshopApproval,
  respondWorkshopChangeOrder,
  reviseWorkshopQuote,
  saveWorkshopQualityCheck,
  saveWorkshopInspection,
  sendWorkshopTicketToCashier,
  moveWorkshopPart,
  updateWorkshopTask,
  updateWorkshopTicket,
  updateWorkshopReception,
  updateWorkshopVehicle,
  type WorkshopApprovalStatus,
  type WorkshopApprovalResponse,
  type WorkshopAuthorizationEvidence,
  type WorkshopChangeOrder,
  type WorkshopChangeOrderStatus,
  type WorkshopTicket,
  type WorkshopTicketStatus,
  type WorkshopVehicle,
  type WorkshopVehicleType,
  type WorkshopMechanic,
  type WorkshopService,
  type WorkshopReceptionPayload,
  type WorkshopQualityCheckPayload,
  type WorkshopVehicleHistory,
  type WorkshopVehicleAreaFinding,
  type WorkshopDeliveryPayload,
  type WorkshopInspectionPayload,
  type WorkshopInspectionResult,
  type Product,
} from '@/lib/api';
import { brand } from '@/lib/brand';
import { SessionRequired, useCurrentSession } from './session-required';
import { WorkshopPartsPanel, type PartOperation } from './workshop-parts-panel';
import {
  WorkshopAuthorizationDialog,
  type AuthorizationResponse,
} from './workshop-authorization-dialog';
import { DocumentEmailDialog } from './document-email-dialog';
import { VehicleIllustration } from './vehicle-illustration';
import { VehicleDamageMap } from './vehicle-damage-map';
import { VEHICLE_AREA_LABELS } from './vehicle-damage-map-config';

type TicketLineForm = {
  productId: string;
  serviceId: string;
  type: 'LABOR' | 'PART' | 'OTHER';
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate?: string;
  vehicleAreaId?: string;
};

const emptyTicket = {
  customerId: '',
  vehicleId: '',
  complaint: '',
  promisedAt: '',
  diagnosis: '',
  customerNotes: '',
  mechanicIds: [] as string[],
  lines: [] as TicketLineForm[],
};

const emptyVehicleForm = () => ({
  customerId: '',
  vehicleType: '' as WorkshopVehicleType | '',
  licensePlate: '',
  make: '',
  model: '',
  year: '',
  color: '',
  vin: '',
  mileage: '',
  notes: '',
});

const statusLabels: Record<WorkshopTicketStatus, string> = {
  RECEIVED: 'Recibido',
  DIAGNOSIS: 'Diagnóstico',
  AWAITING_APPROVAL: 'Pendiente aprobación',
  APPROVED: 'Aprobado · por facturar',
  IN_PROGRESS: 'En reparación',
  READY_FOR_DELIVERY: 'Listo para entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const nextStatus: Partial<Record<WorkshopTicketStatus, WorkshopTicketStatus>> = {
  RECEIVED: 'DIAGNOSIS',
  DIAGNOSIS: 'AWAITING_APPROVAL',
};

type WorkOrderStage = 'DIAGNOSIS' | 'QUOTE' | 'BILLING';
type WorkOrderKpi = 'ALL' | 'DIAGNOSIS' | 'TO_QUOTE' | 'AWAITING' | 'BILLING' | 'DELIVERED';

function stageForTicket(ticket: WorkshopTicket): WorkOrderStage {
  if (['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY', 'DELIVERED'].includes(ticket.status))
    return 'BILLING';
  if (ticket.status === 'AWAITING_APPROVAL') return 'QUOTE';
  return 'DIAGNOSIS';
}

function mechanicName(ticket: WorkshopTicket) {
  return ticket.assignments[0]?.employee.user.name ?? 'Sin asignar';
}

function initials(value: string) {
  if (value === 'Sin asignar') return '—';
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function statusVariant(status: WorkshopTicketStatus) {
  if (status === 'DELIVERED') return 'success' as const;
  if (status === 'CANCELLED') return 'danger' as const;
  if (status === 'AWAITING_APPROVAL' || status === 'READY_FOR_DELIVERY') return 'warning' as const;
  return 'outline' as const;
}

function formatWorkshopCurrency(value: string | number) {
  return `RD$ ${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

export function WorkshopView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [panel, setPanel] = useState<'ticket' | 'vehicle' | null>(null);
  const [ticketForm, setTicketForm] = useState(emptyTicket);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicle, setEditingVehicle] = useState<WorkshopVehicle | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<'orders' | 'vehicles'>('orders');
  const [ticketSearch, setTicketSearch] = useState('');
  const [mechanicFilter, setMechanicFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<WorkshopTicketStatus | 'ALL'>('ALL');
  const [kpiFilter, setKpiFilter] = useState<WorkOrderKpi>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [sortMode, setSortMode] = useState<'PROMISED_AT' | 'OPENED_AT'>('PROMISED_AT');
  const [editingTicket, setEditingTicket] = useState<WorkshopTicket | null>(null);
  const [activeTicketStage, setActiveTicketStage] = useState<WorkOrderStage>('DIAGNOSIS');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [authorization, setAuthorization] = useState<{
    ticket: WorkshopTicket;
    rejected: boolean;
    changeOrder?: WorkshopChangeOrder;
  } | null>(null);
  const [quoteShareTicket, setQuoteShareTicket] = useState<WorkshopTicket | null>(null);
  const [invoiceEmailTicket, setInvoiceEmailTicket] = useState<WorkshopTicket | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<WorkshopTicket | null>(null);
  const [quoteRevisionCandidate, setQuoteRevisionCandidate] = useState<WorkshopTicket | null>(null);
  const observedInvoiceRef = useRef<{ ticketId: string; invoiceId: string | null } | null>(null);

  const customers = useQuery({
    queryKey: ['customers', session?.tenantId],
    queryFn: () => getCustomers(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const vehicles = useQuery({
    queryKey: ['workshop-vehicles', session?.tenantId],
    queryFn: () => getWorkshopVehicles(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const mechanics = useQuery({
    queryKey: ['workshop-mechanics', session?.tenantId],
    queryFn: () => getWorkshopMechanics(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const products = useQuery({
    queryKey: ['products', session?.tenantId, 'workshop'],
    queryFn: () => getProducts(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const services = useQuery({
    queryKey: ['workshop-services', session?.tenantId],
    queryFn: () => getWorkshopServices(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const tickets = useQuery({
    queryKey: ['workshop-tickets', session?.tenantId],
    queryFn: () => getWorkshopTickets(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
    refetchInterval: 20_000,
  });
  // Refresh payment/delivery information without overwriting an unsaved operational form.
  const billingTicket = editingTicket
    ? (tickets.data?.find((ticket) => ticket.id === editingTicket.id) ?? editingTicket)
    : null;
  const changeOrders = useQuery({
    queryKey: ['workshop-change-orders', session?.tenantId, editingTicket?.id],
    queryFn: () =>
      getWorkshopChangeOrders(session!.tenantId, session!.accessToken, editingTicket!.id),
    enabled: Boolean(session && editingTicket),
  });

  useEffect(() => {
    if (pathname.endsWith('/vehicles') || searchParams.get('view') === 'vehicles') {
      setWorkspaceMode('vehicles');
    } else {
      setWorkspaceMode('orders');
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (workspaceMode !== 'orders') return;
    const ticketId = searchParams.get('ticket');
    if (!ticketId) return;
    const ticket = tickets.data?.find((item) => item.id === ticketId);
    if (ticket) setEditingTicket(ticket);
  }, [searchParams, tickets.data, workspaceMode]);

  useEffect(() => {
    if (!editingTicket) return;
    setActiveTicketStage(stageForTicket(editingTicket));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [editingTicket?.id]);

  useEffect(() => {
    if (!billingTicket) {
      observedInvoiceRef.current = null;
      return;
    }

    const invoiceId = billingTicket.salesOrder?.invoice?.id ?? null;
    const previous = observedInvoiceRef.current;
    if (previous?.ticketId === billingTicket.id && !previous.invoiceId && invoiceId) {
      toast.success('Factura emitida y orden entregada', {
        description: `${billingTicket.ticketNumber} fue facturada en Caja y su proceso quedó completado.`,
        duration: 7000,
      });
    }
    observedInvoiceRef.current = { ticketId: billingTicket.id, invoiceId };

    setEditingTicket((current) =>
      current?.id === billingTicket.id &&
      (current.salesOrder?.id !== billingTicket.salesOrder?.id ||
        current.salesOrder?.invoice?.id !== invoiceId)
        ? { ...current, salesOrder: billingTicket.salesOrder }
        : current,
    );
  }, [billingTicket?.id, billingTicket?.salesOrder?.id, billingTicket?.salesOrder?.invoice?.id]);

  useEffect(() => setPage(1), [dateFilter, kpiFilter, mechanicFilter, statusFilter, ticketSearch]);

  const selectedVehicles = useMemo(
    () => (vehicles.data ?? []).filter((vehicle) => vehicle.customerId === ticketForm.customerId),
    [vehicles.data, ticketForm.customerId],
  );

  const visibleTickets = useMemo(() => {
    const search = ticketSearch.trim().toLowerCase();
    const matchingTickets = (tickets.data ?? []).filter((ticket) =>
      [
        ticket.ticketNumber,
        ticket.customer.name,
        ticket.customer.phone,
        ticket.vehicle.licensePlate,
        ticket.vehicle.make,
        ticket.vehicle.model,
        ticket.complaint,
      ]
        .filter(Boolean)
        .some((value) => !search || value?.toLowerCase().includes(search)),
    );
    const assigned =
      mechanicFilter === 'ALL'
        ? matchingTickets
        : matchingTickets.filter(
            (ticket) =>
              ticket.assignments.some((assignment) => assignment.employee.id === mechanicFilter) ||
              ticket.tasks.some((task) => task.employeeId === mechanicFilter),
          );
    const byStatus = assigned.filter((ticket) => {
      if (statusFilter !== 'ALL' && ticket.status !== statusFilter) return false;
      if (dateFilter) {
        const source = ticket.promisedAt ?? ticket.openedAt;
        if (source.slice(0, 10) !== dateFilter) return false;
      }
      if (kpiFilter === 'ALL') return true;
      if (kpiFilter === 'DIAGNOSIS')
        return ticket.status === 'RECEIVED' || (ticket.status === 'DIAGNOSIS' && !ticket.diagnosis);
      if (kpiFilter === 'TO_QUOTE')
        return ticket.status === 'DIAGNOSIS' && Boolean(ticket.diagnosis);
      if (kpiFilter === 'AWAITING') return ticket.status === 'AWAITING_APPROVAL';
      if (kpiFilter === 'BILLING')
        return ['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY'].includes(ticket.status);
      return ticket.status === 'DELIVERED';
    });
    return [...byStatus].sort((first, second) => {
      const firstDate =
        sortMode === 'PROMISED_AT' ? (first.promisedAt ?? first.openedAt) : first.openedAt;
      const secondDate =
        sortMode === 'PROMISED_AT' ? (second.promisedAt ?? second.openedAt) : second.openedAt;
      return new Date(firstDate).getTime() - new Date(secondDate).getTime();
    });
  }, [dateFilter, kpiFilter, mechanicFilter, sortMode, statusFilter, ticketSearch, tickets.data]);

  const visibleVehicles = useMemo(() => {
    const search = ticketSearch.trim().toLowerCase();
    if (!search) return vehicles.data ?? [];
    return (vehicles.data ?? []).filter((vehicle) =>
      [
        vehicle.licensePlate,
        vehicle.make,
        vehicle.model,
        vehicle.customer.name,
        vehicle.customer.phone,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search)),
    );
  }, [ticketSearch, vehicles.data]);

  const invalidateWorkshop = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workshop-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] }),
    ]);
  };

  const partMutation = useMutation({
    mutationFn: ({
      ticketId,
      lineId,
      action,
      ...payload
    }: PartOperation & { ticketId: string }) => {
      if (!session) throw new Error('Sesión requerida.');
      return moveWorkshopPart(
        session.tenantId,
        session.accessToken,
        ticketId,
        lineId,
        action,
        payload,
      );
    },
    onSuccess: async (ticket) => {
      setEditingTicket((current) => (current?.id === ticket.id ? ticket : current));
      toast.success('Movimiento de repuesto registrado.');
      await Promise.all([
        invalidateWorkshop(),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
    },
  });

  const ticketMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error('Sesión requerida.');
      return createWorkshopTicket(session.tenantId, session.accessToken, {
        customerId: ticketForm.customerId,
        vehicleId: ticketForm.vehicleId,
        complaint: ticketForm.complaint,
        diagnosis: ticketForm.diagnosis || undefined,
        customerNotes: ticketForm.customerNotes || undefined,
        promisedAt: ticketForm.promisedAt || undefined,
        mechanicIds: ticketForm.mechanicIds,
        lines: ticketForm.lines
          .filter((line) => line.description.trim())
          .map((line) => ({
            productId: line.productId || undefined,
            serviceId: line.serviceId || undefined,
            type: line.type,
            description: line.description,
            quantity: Number(line.quantity || 1),
            unitPrice: Number(line.unitPrice || 0),
          })),
      });
    },
    onSuccess: async (ticket) => {
      toast.success(`Ticket ${ticket.ticketNumber} creado`);
      setTicketForm(emptyTicket);
      setPanel(null);
      setEditingTicket(ticket);
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el ticket.'),
  });

  const vehicleMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error('Sesión requerida.');
      const payload = {
        customerId: vehicleForm.customerId,
        vehicleType: vehicleForm.vehicleType || undefined,
        licensePlate: vehicleForm.licensePlate || undefined,
        make: vehicleForm.make,
        model: vehicleForm.model,
        year: vehicleForm.year ? Number(vehicleForm.year) : undefined,
        color: vehicleForm.color || undefined,
        vin: vehicleForm.vin || undefined,
        mileage: vehicleForm.mileage ? Number(vehicleForm.mileage) : undefined,
        notes: vehicleForm.notes || undefined,
      };
      return editingVehicle
        ? updateWorkshopVehicle(session.tenantId, session.accessToken, editingVehicle.id, payload)
        : createWorkshopVehicle(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async (vehicle) => {
      toast.success(editingVehicle ? 'Vehículo actualizado' : 'Vehículo registrado');
      setVehicleForm(emptyVehicleForm());
      setEditingVehicle(null);
      setTicketForm((current) => ({
        ...current,
        customerId: vehicle.customerId,
        vehicleId: vehicle.id,
      }));
      setPanel('ticket');
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el vehículo.'),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkshopTicketStatus }) => {
      if (!session) throw new Error('Sesión requerida.');
      return updateWorkshopTicket(session.tenantId, session.accessToken, id, { status });
    },
    onSuccess: async (ticket) => {
      setEditingTicket((current) => (current?.id === ticket.id ? ticket : current));
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el ticket.'),
  });

  const updateTicketMutation = useMutation({
    mutationFn: ({
      ticketId,
      payload,
    }: {
      ticketId: string;
      payload: {
        diagnosis?: string;
        customerNotes?: string;
        promisedAt?: string;
        mechanicIds?: string[];
      };
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return updateWorkshopTicket(session.tenantId, session.accessToken, ticketId, payload);
    },
    onSuccess: async (ticket) => {
      toast.success('Ticket actualizado');
      setEditingTicket((current) => (current?.id === ticket.id ? ticket : current));
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar el ticket.'),
  });

  const deleteTicketMutation = useMutation({
    mutationFn: (ticket: WorkshopTicket) => {
      if (!session) throw new Error('Sesión requerida.');
      return deleteWorkshopTicket(session.tenantId, session.accessToken, ticket.id);
    },
    onSuccess: async (deleted) => {
      setEditingTicket((current) => (current?.id === deleted.id ? null : current));
      setDeleteCandidate(null);
      toast.success(`Expediente ${deleted.ticketNumber} eliminado`);
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el expediente.'),
  });

  const reviseQuoteMutation = useMutation({
    mutationFn: (ticket: WorkshopTicket) => {
      if (!session) throw new Error('Sesión requerida.');
      return reviseWorkshopQuote(session.tenantId, session.accessToken, ticket.id);
    },
    onSuccess: async (ticket) => {
      setQuoteRevisionCandidate(null);
      setEditingTicket(ticket);
      setActiveTicketStage('QUOTE');
      toast.success('Cotización habilitada para edición', {
        description: 'Al enviarla nuevamente se creará una versión nueva.',
      });
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo editar la cotización.'),
  });

  const approvalMutation = useMutation({
    mutationFn: ({
      ticketId,
      response,
    }: {
      ticketId: string;
      response: WorkshopApprovalResponse;
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return respondWorkshopApproval(session.tenantId, session.accessToken, ticketId, response);
    },
    onSuccess: async (ticket) => {
      toast.success('Respuesta del cliente registrada');
      setAuthorization(null);
      setEditingTicket((current) => (current?.id === ticket.id ? ticket : current));
      if (['APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus)) {
        setActiveTicketStage('BILLING');
      }
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la aprobación.'),
  });

  const createChangeOrderMutation = useMutation({
    mutationFn: ({
      ticketId,
      payload,
    }: {
      ticketId: string;
      payload: {
        title: string;
        description?: string;
        lines: Array<{
          productId?: string;
          serviceId?: string;
          type: 'LABOR' | 'PART' | 'OTHER';
          description: string;
          quantity: number;
          unitPrice: number;
        }>;
      };
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return createWorkshopChangeOrder(session.tenantId, session.accessToken, ticketId, payload);
    },
    onSuccess: async () => {
      toast.success('Trabajo adicional enviado a aprobación');
      await queryClient.invalidateQueries({ queryKey: ['workshop-change-orders'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'No se pudo crear el trabajo adicional.',
      ),
  });

  const respondChangeOrderMutation = useMutation({
    mutationFn: ({
      ticketId,
      changeOrderId,
      response,
    }: {
      ticketId: string;
      changeOrderId: string;
      response: WorkshopAuthorizationEvidence & {
        status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
        note?: string;
      };
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return respondWorkshopChangeOrder(
        session.tenantId,
        session.accessToken,
        ticketId,
        changeOrderId,
        response,
      );
    },
    onSuccess: async () => {
      toast.success('Respuesta del trabajo adicional registrada');
      setAuthorization(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop-change-orders'] }),
        invalidateWorkshop(),
      ]);
      setEditingTicket((current) => {
        const refreshed = queryClient
          .getQueryData<WorkshopTicket[]>(['workshop-tickets', session?.tenantId])
          ?.find((ticket) => ticket.id === current?.id);
        return refreshed ?? current;
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la respuesta.'),
  });

  const taskMutation = useMutation({
    mutationFn: ({ ticketId, payload }: { ticketId: string; payload: WorkshopTaskInput }) => {
      if (!session) throw new Error('Sesión requerida.');
      return createWorkshopTask(session.tenantId, session.accessToken, ticketId, payload);
    },
    onSuccess: async (task) => {
      setEditingTicket((current) =>
        current?.id === task.ticketId ? { ...current, tasks: [...current.tasks, task] } : current,
      );
      toast.success('Tarea agregada');
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo agregar la tarea.'),
  });

  const taskStatusMutation = useMutation({
    mutationFn: ({
      ticketId,
      taskId,
      payload,
    }: {
      ticketId: string;
      taskId: string;
      payload: WorkshopTaskUpdate;
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return updateWorkshopTask(session.tenantId, session.accessToken, ticketId, taskId, payload);
    },
    onSuccess: async (task) => {
      setEditingTicket((current) =>
        current?.id === task.ticketId
          ? { ...current, tasks: current.tasks.map((item) => (item.id === task.id ? task : item)) }
          : current,
      );
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la tarea.'),
  });

  const sendToCashierMutation = useMutation({
    mutationFn: ({
      ticketId,
      electronicInvoiceRequested,
      ecfRecipientEmail,
    }: {
      ticketId: string;
      electronicInvoiceRequested: boolean;
      ecfRecipientEmail?: string;
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return sendWorkshopTicketToCashier(session.tenantId, session.accessToken, ticketId, {
        electronicInvoiceRequested,
        ecfRecipientEmail,
      });
    },
    onSuccess: async (order) => {
      toast.success(`Enviada a Caja: ${order.orderNumber}`, {
        description:
          'La orden ya aparece en pendientes de cobro. Al emitir la factura quedará completada y entregada.',
        duration: 7000,
      });
      await invalidateWorkshop();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar a Caja.'),
  });

  if (!session) return <SessionRequired session={session} />;

  function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ticketMutation.mutate();
  }
  function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    vehicleMutation.mutate();
  }
  function openTicketForm() {
    setTicketForm(emptyTicket);
    setPanel('ticket');
  }
  function closeTicketForm() {
    if (ticketMutation.isPending) return;
    setTicketForm(emptyTicket);
    setPanel(null);
  }
  function openVehicleRegistration() {
    setEditingVehicle(null);
    setVehicleForm(emptyVehicleForm());
    setWorkspaceMode('vehicles');
    setPanel('vehicle');
  }
  function openVehicleEdit(vehicle: WorkshopVehicle) {
    setEditingVehicle(vehicle);
    setVehicleForm({
      customerId: vehicle.customerId,
      vehicleType: vehicle.vehicleType ?? '',
      licensePlate: vehicle.licensePlate ?? '',
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year?.toString() ?? '',
      color: vehicle.color ?? '',
      vin: vehicle.vin ?? '',
      mileage: vehicle.mileage?.toString() ?? '',
      notes: vehicle.notes ?? '',
    });
    setWorkspaceMode('vehicles');
    setPanel('vehicle');
  }
  function toggleMechanic(id: string) {
    setTicketForm((current) => ({
      ...current,
      mechanicIds: current.mechanicIds.includes(id)
        ? current.mechanicIds.filter((value) => value !== id)
        : [...current.mechanicIds, id],
    }));
  }
  function addLine() {
    setTicketForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          productId: '',
          serviceId: '',
          type: 'LABOR',
          description: '',
          quantity: '1',
          unitPrice: '',
        },
      ],
    }));
  }
  function setLine(index: number, field: keyof TicketLineForm, value: string) {
    setTicketForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line,
      ),
    }));
  }
  function selectLineProduct(index: number, productId: string) {
    const product = (products.data ?? []).find((candidate) => candidate.id === productId);
    setTicketForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              productId,
              serviceId: '',
              description: product?.name ?? line.description,
              unitPrice: product
                ? String(Number(product.salePrice) > 0 ? product.salePrice : product.price)
                : line.unitPrice,
              type: product?.trackInventory ? 'PART' : 'LABOR',
            }
          : line,
      ),
    }));
  }
  function selectLineService(index: number, serviceId: string) {
    const service = (services.data ?? []).find((candidate) => candidate.id === serviceId);
    setTicketForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              productId: '',
              serviceId,
              description: service?.name ?? line.description,
              unitPrice: service ? String(service.defaultPrice) : line.unitPrice,
              type: line.type === 'PART' ? 'LABOR' : line.type,
            }
          : line,
      ),
    }));
  }

  function openTicketForVehicle(vehicle: (typeof visibleVehicles)[number]) {
    setTicketForm((current) => ({
      ...current,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
    }));
    setWorkspaceMode('orders');
    setPanel('ticket');
  }

  const ticketRowActions = {
    pending: advanceMutation.isPending || deleteTicketMutation.isPending,
    onAdvance: (id: string, status: WorkshopTicketStatus) => advanceMutation.mutate({ id, status }),
    onEdit: (ticket: WorkshopTicket) => setEditingTicket(ticket),
    onApproval: (
      ticketId: string,
      status: Extract<WorkshopApprovalStatus, 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>,
    ) => {
      const ticket = tickets.data?.find((item) => item.id === ticketId);
      if (ticket) setAuthorization({ ticket, rejected: status === 'REJECTED' });
    },
    approvalPending: approvalMutation.isPending,
    onSendToCashier: (ticket: WorkshopTicket) =>
      sendToCashierMutation.mutate({
        ticketId: ticket.id,
        electronicInvoiceRequested: false,
      }),
    onDelete: (ticket: WorkshopTicket) => setDeleteCandidate(ticket),
  };

  const workspaceCopy = {
    orders: {
      title: 'Órdenes de trabajo',
      description:
        'Expediente único del vehículo: diagnóstico, trabajos, aprobación, cobro y entrega.',
      search: 'Buscar orden, placa, cliente o teléfono',
    },
    vehicles: {
      title: 'Vehículos',
      description: 'Propietarios y vehículos listos para crear una orden de reparación.',
      search: 'Buscar placa, vehículo o propietario',
    },
  }[workspaceMode];
  const allTickets = tickets.data ?? [];
  const pageCount = Math.max(1, Math.ceil(visibleTickets.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedTickets = visibleTickets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{brand.name} · Taller</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {workspaceCopy.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceCopy.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!hasPermission(session, 'vehicles.manage')}
            onClick={openVehicleRegistration}
          >
            <Car className="h-4 w-4" />
            Registrar vehículo
          </Button>
          <Button disabled={!hasPermission(session, 'workorders.create')} onClick={openTicketForm}>
            <ClipboardPlus className="h-4 w-4" />
            Nueva orden de trabajo
          </Button>
        </div>
      </section>

      {workspaceMode !== 'vehicles' ? (
        <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card px-2 py-1.5 text-xs text-muted-foreground shadow-sm">
          {[
            'Cita',
            'Vehículo recibido',
            'Diagnóstico',
            'Cotización',
            'Aprobación',
            'Facturación',
            'Entregado',
          ].map((step, index) => (
            <div key={step} className="flex shrink-0 items-center">
              <span className="rounded-lg px-2.5 py-1.5 font-medium text-foreground">{step}</span>
              {index < 6 ? <ChevronRight className="h-4 w-4 text-border" /> : null}
            </div>
          ))}
        </div>
      ) : null}

      {workspaceMode === 'orders' ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <OperationalMetric
            label="Órdenes activas"
            value={
              allTickets.filter((ticket) => !['DELIVERED', 'CANCELLED'].includes(ticket.status))
                .length
            }
            icon={Wrench}
            tone="blue"
            selected={kpiFilter === 'ALL'}
            onClick={() => setKpiFilter('ALL')}
          />
          <OperationalMetric
            label="En diagnóstico"
            value={
              allTickets.filter(
                (ticket) =>
                  ticket.status === 'RECEIVED' ||
                  (ticket.status === 'DIAGNOSIS' && !ticket.diagnosis),
              ).length
            }
            icon={Car}
            tone="slate"
            selected={kpiFilter === 'DIAGNOSIS'}
            onClick={() => setKpiFilter('DIAGNOSIS')}
          />
          <OperationalMetric
            label="Por cotizar"
            value={
              allTickets.filter(
                (ticket) => ticket.status === 'DIAGNOSIS' && Boolean(ticket.diagnosis),
              ).length
            }
            icon={FileText}
            tone="amber"
            selected={kpiFilter === 'TO_QUOTE'}
            onClick={() => setKpiFilter('TO_QUOTE')}
          />
          <OperationalMetric
            label="Esperando aprobación"
            value={allTickets.filter((ticket) => ticket.status === 'AWAITING_APPROVAL').length}
            icon={Clock3}
            tone="amber"
            selected={kpiFilter === 'AWAITING'}
            onClick={() => setKpiFilter('AWAITING')}
          />
          <OperationalMetric
            label="Por facturar"
            value={
              allTickets.filter((ticket) =>
                ['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY'].includes(ticket.status),
              ).length
            }
            icon={Receipt}
            tone="slate"
            selected={kpiFilter === 'BILLING'}
            onClick={() => setKpiFilter('BILLING')}
          />
          <OperationalMetric
            label="Entregadas"
            value={allTickets.filter((ticket) => ticket.status === 'DELIVERED').length}
            icon={CheckCircle2}
            tone="green"
            selected={kpiFilter === 'DELIVERED'}
            onClick={() => setKpiFilter('DELIVERED')}
          />
        </div>
      ) : null}

      <div className="grid gap-2 rounded-xl border bg-card p-2 shadow-sm lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem_12rem_auto]">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={ticketSearch}
            onChange={(event) => setTicketSearch(event.target.value)}
            className="border-0 bg-muted/35 pl-9 shadow-none"
            placeholder={`${workspaceCopy.search} o motivo`}
          />
        </div>
        {workspaceMode !== 'vehicles' ? (
          <>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as WorkshopTicketStatus | 'ALL')
              }
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="ALL">Todos los estados</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={mechanicFilter}
              onChange={(event) => setMechanicFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="ALL">Todos los mecánicos</option>
              {(mechanics.data ?? []).map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>
                  {mechanic.user.name}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              aria-label="Filtrar por fecha"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSortMode((current) => (current === 'PROMISED_AT' ? 'OPENED_AT' : 'PROMISED_AT'))
              }
            >
              <SlidersHorizontal className="h-4 w-4" /> Más filtros
            </Button>
          </>
        ) : null}
      </div>

      {panel === 'vehicle' && hasPermission(session, 'vehicles.manage') ? (
        <VehicleForm
          form={vehicleForm}
          editing={Boolean(editingVehicle)}
          customers={customers.data ?? []}
          pending={vehicleMutation.isPending}
          onChange={(field, value) => setVehicleForm((current) => ({ ...current, [field]: value }))}
          onSubmit={submitVehicle}
        />
      ) : null}
      {panel === 'ticket' && hasPermission(session, 'workorders.create') ? (
        <WorkOrderCreateDialog pending={ticketMutation.isPending} onClose={closeTicketForm}>
          <TicketForm
            dialog
            form={ticketForm}
            customers={customers.data ?? []}
            vehicles={selectedVehicles}
            mechanics={mechanics.data ?? []}
            products={products.data ?? []}
            services={services.data ?? []}
            pending={ticketMutation.isPending}
            onChange={(field, value) =>
              setTicketForm((current) => ({
                ...current,
                [field]: value,
                ...(field === 'customerId' ? { vehicleId: '' } : {}),
              }))
            }
            onToggleMechanic={toggleMechanic}
            onAddLine={addLine}
            onSetLine={setLine}
            onSelectProduct={selectLineProduct}
            onSelectService={selectLineService}
            onRemoveLine={(index) =>
              setTicketForm((current) => ({
                ...current,
                lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
              }))
            }
            onSubmit={submitTicket}
          />
        </WorkOrderCreateDialog>
      ) : null}
      {editingTicket && billingTicket
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-slate-950/45 p-2 backdrop-blur-[2px] sm:p-3 lg:p-4">
              <section
                role="dialog"
                aria-modal="true"
                aria-label={`Expediente ${editingTicket.ticketNumber}`}
                className="flex h-[calc(100dvh-1rem)] max-h-[64rem] w-[calc(100vw-1rem)] max-w-[92rem] flex-col overflow-hidden rounded-xl border bg-slate-50 shadow-2xl sm:h-[94dvh] sm:w-[94vw]"
              >
                <header className="shrink-0 border-b bg-white px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                          {editingTicket.ticketNumber}
                        </h2>
                        <TicketSoftBadge status={editingTicket.status} />
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">
                        {editingTicket.vehicle.licensePlate ?? 'Sin placa'} ·{' '}
                        {editingTicket.vehicle.make} {editingTicket.vehicle.model}{' '}
                        {editingTicket.vehicle.year ?? ''}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {editingTicket.customer.name} ·{' '}
                        {editingTicket.customer.phone ?? 'Sin teléfono'} · Promesa:{' '}
                        {formatWorkshopTime(editingTicket.promisedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingTicket(null)}
                      aria-label="Cerrar expediente"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <WorkOrderStageNav active={activeTicketStage} onChange={setActiveTicketStage} />
                </header>

                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-4">
                  <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem]">
                    <main className="min-w-0 space-y-4">
                      {activeTicketStage === 'DIAGNOSIS' || activeTicketStage === 'QUOTE' ? (
                        <TicketEditor
                          key={`${editingTicket.id}-${editingTicket.quoteVersions[0]?.id ?? 'draft'}-${activeTicketStage}`}
                          ticket={editingTicket}
                          stage={activeTicketStage}
                          workspace
                          formId="work-order-workspace-form"
                          mechanics={mechanics.data ?? []}
                          products={products.data ?? []}
                          services={services.data ?? []}
                          partsLoading={products.isFetching}
                          servicesLoading={services.isFetching}
                          pending={
                            updateTicketMutation.isPending ||
                            taskMutation.isPending ||
                            taskStatusMutation.isPending
                          }
                          onClose={() => setEditingTicket(null)}
                          onSubmit={async (payload, intent) => {
                            try {
                              const saved = await updateTicketMutation.mutateAsync({
                                ticketId: editingTicket.id,
                                payload,
                              });
                              if (intent === 'REQUEST_APPROVAL') {
                                const blocker = workshopQuoteApprovalBlocker(saved);
                                if (blocker) {
                                  toast.error(blocker);
                                  return;
                                }
                                await advanceMutation.mutateAsync({
                                  id: saved.id,
                                  status: 'AWAITING_APPROVAL',
                                });
                              }
                            } catch {
                              // Each mutation displays its own error and the draft remains visible.
                            }
                          }}
                          onCreateTask={(payload) =>
                            taskMutation.mutateAsync({ ticketId: editingTicket.id, payload })
                          }
                          onUpdateTask={(taskId, payload) =>
                            taskStatusMutation.mutateAsync({
                              ticketId: editingTicket.id,
                              taskId,
                              payload,
                            })
                          }
                        />
                      ) : null}

                      {activeTicketStage === 'BILLING' ? (
                        <WorkshopBillingPanel
                          ticket={billingTicket}
                          pending={sendToCashierMutation.isPending}
                          onSendToCashier={() =>
                            sendToCashierMutation.mutate({
                              ticketId: billingTicket.id,
                              electronicInvoiceRequested: false,
                            })
                          }
                          onEmailInvoice={() => setInvoiceEmailTicket(billingTicket)}
                        />
                      ) : null}
                    </main>
                    <WorkOrderSummary ticket={billingTicket} activeStage={activeTicketStage} />
                  </div>
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-white px-4 py-2.5 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Button type="button" variant="outline" onClick={() => setEditingTicket(null)}>
                      Cerrar
                    </Button>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {activeTicketStage === 'QUOTE' && editingTicket.quoteVersions.length ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setQuoteShareTicket(editingTicket)}
                        >
                          <Download className="h-4 w-4" /> Descargar PDF
                        </Button>
                      </>
                    ) : null}
                    {activeTicketStage === 'QUOTE' &&
                    editingTicket.status === 'AWAITING_APPROVAL' &&
                    hasPermission(session, 'quotes.create') ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setQuoteRevisionCandidate(editingTicket)}
                      >
                        <PencilLine className="h-4 w-4" /> Editar cotización
                      </Button>
                    ) : null}
                    {activeTicketStage === 'QUOTE' &&
                    editingTicket.status === 'AWAITING_APPROVAL' &&
                    hasPermission(session, 'quotes.record_approval') ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAuthorization({ ticket: editingTicket, rejected: false })}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Registrar aprobación
                      </Button>
                    ) : null}
                    {activeTicketStage === 'DIAGNOSIS' || activeTicketStage === 'QUOTE' ? (
                      <Button
                        type="submit"
                        form="work-order-workspace-form"
                        variant="outline"
                        disabled={updateTicketMutation.isPending}
                      >
                        {activeTicketStage === 'QUOTE' ? 'Guardar borrador' : 'Guardar cambios'}
                      </Button>
                    ) : null}
                    {activeTicketStage === 'DIAGNOSIS' &&
                    ['RECEIVED', 'DIAGNOSIS'].includes(editingTicket.status) ? (
                      <Button
                        type="button"
                        disabled={advanceMutation.isPending}
                        onClick={() => {
                          if (editingTicket.status === 'RECEIVED') {
                            advanceMutation.mutate({ id: editingTicket.id, status: 'DIAGNOSIS' });
                            return;
                          }
                          setActiveTicketStage('QUOTE');
                        }}
                      >
                        {editingTicket.status === 'RECEIVED'
                          ? 'Iniciar diagnóstico'
                          : 'Continuar a cotización'}{' '}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {activeTicketStage === 'QUOTE' && editingTicket.status === 'DIAGNOSIS' ? (
                      <Button
                        type="submit"
                        form="work-order-workspace-form"
                        name="workspace-action"
                        value="REQUEST_APPROVAL"
                        disabled={updateTicketMutation.isPending || advanceMutation.isPending}
                        title="Guardar la cotización y enviarla a aprobación del cliente."
                      >
                        Enviar a aprobación del cliente <ChevronRight className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
      {authorization ? (
        <WorkshopAuthorizationDialog
          key={authorization.changeOrder?.id ?? authorization.ticket.id}
          title={
            authorization.changeOrder
              ? `Adicional #${authorization.changeOrder.number} · ${authorization.ticket.ticketNumber}`
              : `Presupuesto v${authorization.ticket.quoteVersions[0]?.version ?? ''} · ${authorization.ticket.ticketNumber}`
          }
          customerName={authorization.ticket.customer.name}
          lines={authorization.changeOrder?.lines ?? authorization.ticket.lines}
          allowPartial={!authorization.changeOrder}
          initiallyRejected={authorization.rejected}
          pending={approvalMutation.isPending || respondChangeOrderMutation.isPending}
          onClose={() => setAuthorization(null)}
          onSubmit={(response: AuthorizationResponse) => {
            if (authorization.changeOrder) {
              if (response.status === 'PARTIALLY_APPROVED') return;
              respondChangeOrderMutation.mutate({
                ticketId: authorization.ticket.id,
                changeOrderId: authorization.changeOrder.id,
                response: { ...response, status: response.status },
              });
            } else {
              approvalMutation.mutate({
                ticketId: authorization.ticket.id,
                response: {
                  ...response,
                  quoteVersionId: authorization.ticket.quoteVersions[0]?.id ?? '',
                },
              });
            }
          }}
        />
      ) : null}
      <ActionDialog
        open={Boolean(quoteShareTicket)}
        size="sm"
        title="Compartir cotización"
        description="Elige si deseas descargar el PDF o preparar su envío por WhatsApp."
        icon={<MessageCircle className="h-5 w-5" />}
        confirmLabel="Abrir WhatsApp"
        cancelLabel="Cancelar"
        onClose={() => setQuoteShareTicket(null)}
        onConfirm={() => {
          if (!quoteShareTicket) return;

          const version = quoteShareTicket.quoteVersions[0]?.version ?? 1;
          const documentNumber = `${quoteShareTicket.ticketNumber}-V${version}`;
          const vehicle = [
            quoteShareTicket.vehicle.make,
            quoteShareTicket.vehicle.model,
            quoteShareTicket.vehicle.year,
          ]
            .filter(Boolean)
            .join(' ');
          const digits = (quoteShareTicket.customer.phone ?? '').replace(/\D/g, '');
          const whatsappPhone = digits.length === 10 ? `1${digits}` : digits;
          const message = encodeURIComponent(
            `Hola ${quoteShareTicket.customer.name}, aquí está su cotización ${documentNumber} de ${brand.name} para su ${vehicle}. El total es ${formatWorkshopCurrency(quoteShareTicket.total)}. Quedamos atentos a su confirmación.`,
          );
          const whatsappUrl = whatsappPhone
            ? `https://wa.me/${whatsappPhone}?text=${message}`
            : `https://wa.me/?text=${message}`;

          const whatsappWindow = window.open(whatsappUrl, '_blank');
          if (whatsappWindow) {
            whatsappWindow.opener = null;
          } else {
            window.location.assign(whatsappUrl);
          }
          setQuoteShareTicket(null);
        }}
      >
        {quoteShareTicket ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-semibold text-foreground">
                {quoteShareTicket.ticketNumber}-V
                {quoteShareTicket.quoteVersions[0]?.version ?? 1}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {quoteShareTicket.customer.name} · {formatWorkshopCurrency(quoteShareTicket.total)}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-center"
              onClick={() => {
                window.open(
                  `/workshop/${quoteShareTicket.id}/quote/print?autoPrint=1`,
                  '_blank',
                  'noopener,noreferrer',
                );
                setQuoteShareTicket(null);
              }}
            >
              <Download className="h-4 w-4" /> Descargar PDF
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              Primero descarga el PDF. Después pulsa Abrir WhatsApp y adjunta el archivo descargado
              en el chat; el mensaje se cargará automáticamente.
            </p>
          </div>
        ) : null}
      </ActionDialog>
      {invoiceEmailTicket?.salesOrder?.invoice ? (
        <DocumentEmailDialog
          open
          session={session}
          kind="invoices"
          documentId={invoiceEmailTicket.salesOrder.invoice.id}
          documentNumber={invoiceEmailTicket.salesOrder.invoice.invoiceNumber}
          customerName={invoiceEmailTicket.customer.name}
          defaultEmail={invoiceEmailTicket.customer.email}
          onClose={() => setInvoiceEmailTicket(null)}
        />
      ) : null}
      <ActionDialog
        open={Boolean(quoteRevisionCandidate)}
        tone="warning"
        size="sm"
        title="Editar cotización"
        description="La versión enviada dejará de esperar respuesta y la cotización volverá a modo edición."
        confirmLabel="Continuar y editar"
        cancelLabel="Mantener pendiente"
        isPending={reviseQuoteMutation.isPending}
        onClose={() => {
          if (!reviseQuoteMutation.isPending) setQuoteRevisionCandidate(null);
        }}
        onConfirm={() => {
          if (quoteRevisionCandidate) reviseQuoteMutation.mutate(quoteRevisionCandidate);
        }}
        summary={
          quoteRevisionCandidate ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">
                    {quoteRevisionCandidate.ticketNumber} · Cotización v
                    {quoteRevisionCandidate.quoteVersions[0]?.version ?? 1}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {quoteRevisionCandidate.customer.name} ·{' '}
                    {formatWorkshopCurrency(quoteRevisionCandidate.total)}
                  </p>
                </div>
                <Badge variant="warning">Pendiente</Badge>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                La versión actual se conservará en el historial. Cuando vuelvas a enviarla al
                cliente se generará automáticamente la siguiente versión.
              </div>
            </div>
          ) : null
        }
      />
      <ActionDialog
        open={Boolean(deleteCandidate)}
        tone="danger"
        size="sm"
        title="Eliminar expediente de orden"
        description="Confirma que deseas eliminar permanentemente esta orden de trabajo."
        confirmLabel="Eliminar expediente"
        cancelLabel="Conservar orden"
        isPending={deleteTicketMutation.isPending}
        onClose={() => {
          if (!deleteTicketMutation.isPending) setDeleteCandidate(null);
        }}
        onConfirm={() => {
          if (deleteCandidate) deleteTicketMutation.mutate(deleteCandidate);
        }}
        summary={
          deleteCandidate ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{deleteCandidate.ticketNumber}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {deleteCandidate.customer.name} · {deleteCandidate.vehicle.make}{' '}
                    {deleteCandidate.vehicle.model}
                  </p>
                </div>
                <TicketSoftBadge status={deleteCandidate.status} />
              </div>
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
                Esta acción no se puede deshacer. Las órdenes con facturación, Caja o movimientos de
                inventario no pueden eliminarse.
              </div>
            </div>
          ) : null
        }
      />
      {workspaceMode === 'orders' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {tickets.isLoading ? (
              <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando la cola del taller...
              </div>
            ) : (
              <>
                <WorkOrderList tickets={pagedTickets} {...ticketRowActions} />
                {visibleTickets.length ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
                    <span>
                      Mostrando {(currentPage - 1) * pageSize + 1}–
                      {Math.min(currentPage * pageSize, visibleTickets.length)} de{' '}
                      {visibleTickets.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="rounded-md bg-slate-950 px-3 py-2 font-semibold text-white">
                        {currentPage}
                      </span>
                      <span>de {pageCount}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={currentPage >= pageCount}
                        onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <select
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                        className="h-9 rounded-md border bg-card px-2"
                      >
                        <option value={8}>8 por página</option>
                        <option value={12}>12 por página</option>
                        <option value={20}>20 por página</option>
                      </select>
                    </div>
                  </div>
                ) : null}
                {!visibleTickets.length ? <EmptyWorkshopState onCreate={openTicketForm} /> : null}
              </>
            )}
          </div>
          <TodayRail tickets={allTickets} onOpen={setEditingTicket} />
        </div>
      ) : (
        <VehicleDirectory
          vehicles={visibleVehicles}
          onRegister={openVehicleRegistration}
          onEdit={openVehicleEdit}
          onCreateTicket={openTicketForVehicle}
        />
      )}
    </div>
  );
}

type WorkshopLaneTone = 'blue' | 'slate' | 'amber' | 'green' | 'emerald';

const laneStyles: Record<WorkshopLaneTone, { accent: string; dot: string }> = {
  blue: { accent: 'border-l-primary', dot: 'bg-primary' },
  slate: { accent: 'border-l-slate-500', dot: 'bg-slate-500' },
  amber: { accent: 'border-l-amber-500', dot: 'bg-amber-500' },
  green: { accent: 'border-l-emerald-600', dot: 'bg-emerald-600' },
  emerald: { accent: 'border-l-green-500', dot: 'bg-green-500' },
};

const stageMeta: Array<{
  id: WorkOrderStage;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: 'DIAGNOSIS',
    label: 'Diagnóstico',
    description: 'Recepción y evaluación',
    icon: ClipboardCheck,
  },
  { id: 'QUOTE', label: 'Cotización', description: 'Servicios y repuestos', icon: FileText },
  { id: 'BILLING', label: 'Facturación', description: 'Cobro y cierre', icon: Receipt },
];

function WorkOrderStageNav({
  active,
  onChange,
}: {
  active: WorkOrderStage;
  onChange: (stage: WorkOrderStage) => void;
}) {
  const activeIndex = stageMeta.findIndex((stage) => stage.id === active);
  return (
    <nav
      className="mt-3 grid overflow-hidden rounded-xl border bg-slate-50 sm:grid-cols-3"
      aria-label="Etapas de la orden"
    >
      {stageMeta.map((stage, index) => {
        const Icon = stage.icon;
        const selected = stage.id === active;
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onChange(stage.id)}
            className={`flex min-h-14 items-center gap-3 border-b px-4 py-2.5 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${selected ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:bg-white/70'}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${selected ? 'bg-primary text-primary-foreground' : index < activeIndex ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}
            >
              {index < activeIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{stage.label}</span>
              <span className="hidden text-[11px] sm:block">{stage.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function TicketSoftBadge({ status }: { status: WorkshopTicketStatus }) {
  const tones: Record<WorkshopTicketStatus, string> = {
    RECEIVED: 'bg-emerald-100 text-emerald-800',
    DIAGNOSIS: 'bg-blue-100 text-blue-800',
    AWAITING_APPROVAL: 'bg-orange-100 text-orange-800',
    APPROVED: 'bg-teal-100 text-teal-800',
    IN_PROGRESS: 'bg-violet-100 text-violet-800',
    READY_FOR_DELIVERY: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-slate-100 text-slate-700',
    CANCELLED: 'bg-rose-100 text-rose-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function WorkOrderSummary({
  ticket,
  activeStage,
}: {
  ticket: WorkshopTicket;
  activeStage: WorkOrderStage;
}) {
  const mechanic = mechanicName(ticket);
  const activeIndex = stageMeta.findIndex((stage) => stage.id === activeStage);
  const progress = Math.round(((activeIndex + 1) / stageMeta.length) * 100);
  return (
    <aside className="min-w-0 space-y-3 lg:sticky lg:top-0">
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4" /> Resumen de la orden
        </h3>
        <div className="mt-4 flex items-center gap-3">
          <VehicleIllustration type={ticket.vehicle.vehicleType} className="h-16 w-24 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {ticket.vehicle.make} {ticket.vehicle.model}
            </p>
            <p className="text-xs font-medium">{ticket.vehicle.licensePlate ?? 'Sin placa'}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{ticket.customer.name}</p>
          </div>
        </div>
        <dl className="mt-4 space-y-3 border-t pt-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Estado actual</dt>
            <dd>
              <TicketSoftBadge status={ticket.status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Mecánico</dt>
            <dd className="flex items-center gap-2 font-medium">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold">
                {initials(mechanic)}
              </span>
              {mechanic}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total actual</dt>
            <dd className="text-sm font-semibold">{formatWorkshopCurrency(ticket.total)}</dd>
          </div>
        </dl>
      </section>
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">Progreso de la orden</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </section>
    </aside>
  );
}

function OperationalMetric({
  label,
  value,
  icon: Icon,
  tone,
  selected,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'blue' | 'slate' | 'amber' | 'green';
  selected?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    blue: 'bg-primary/10 text-primary',
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? 'border-primary/40 ring-2 ring-primary/10' : 'border-border'}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </button>
  );
}

function WorkshopLane({
  title,
  description,
  tone,
  tickets,
  pending,
  onAdvance,
  onEdit,
  onApproval,
  approvalPending,
  onSendToCashier,
}: {
  title: string;
  description: string;
  tone: WorkshopLaneTone;
  tickets: WorkshopTicket[];
  pending: boolean;
  onAdvance: (id: string, status: WorkshopTicketStatus) => void;
  onEdit: (ticket: WorkshopTicket) => void;
  onApproval: (
    ticketId: string,
    status: Extract<WorkshopApprovalStatus, 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>,
  ) => void;
  approvalPending: boolean;
  onSendToCashier: (ticket: WorkshopTicket) => void;
}) {
  const style = laneStyles[tone];
  return (
    <section
      className={`overflow-hidden rounded-xl border border-border border-l-4 bg-card ${style.accent}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
          {tickets.length}
        </span>
      </div>
      {tickets.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Orden</th>
                  <th className="px-3 py-2.5">Vehículo</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Mecánico</th>
                  <th className="px-3 py-2.5">Promesa</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5 text-right">Estimado</th>
                  <th className="w-10 px-2 py-2.5" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <WorkOrderTableRow
                    key={ticket.id}
                    ticket={ticket}
                    pending={pending}
                    onAdvance={onAdvance}
                    onEdit={onEdit}
                    onApproval={onApproval}
                    approvalPending={approvalPending}
                    onSendToCashier={onSendToCashier}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                pending={pending}
                onAdvance={(status) => onAdvance(ticket.id, status)}
                onEdit={() => onEdit(ticket)}
                onApproval={(status) => onApproval(ticket.id, status)}
                approvalPending={approvalPending}
                onSendToCashier={() => onSendToCashier(ticket)}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">No hay órdenes en esta etapa.</p>
      )}
    </section>
  );
}

function WorkOrderList({
  tickets,
  pending,
  onAdvance,
  onEdit,
  onApproval,
  approvalPending,
  onSendToCashier,
  onDelete,
}: {
  tickets: WorkshopTicket[];
  pending: boolean;
  onAdvance: (id: string, status: WorkshopTicketStatus) => void;
  onEdit: (ticket: WorkshopTicket) => void;
  onApproval: (
    ticketId: string,
    status: Extract<WorkshopApprovalStatus, 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>,
  ) => void;
  approvalPending: boolean;
  onSendToCashier: (ticket: WorkshopTicket) => void;
  onDelete: (ticket: WorkshopTicket) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">Expedientes de órdenes</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cada fila abre el expediente completo; el Tablero solo cambia la forma de visualizar estos
          mismos datos.
        </p>
      </div>
      {tickets.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-3 py-3">Vehículo</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Mecánico</th>
                  <th className="px-3 py-3">Promesa</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-2 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tickets.map((ticket) => (
                  <WorkOrderTableRow
                    key={ticket.id}
                    ticket={ticket}
                    pending={pending}
                    onAdvance={onAdvance}
                    onEdit={onEdit}
                    onApproval={onApproval}
                    approvalPending={approvalPending}
                    onSendToCashier={onSendToCashier}
                    onDelete={onDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                pending={pending}
                onAdvance={(status) => onAdvance(ticket.id, status)}
                onEdit={() => onEdit(ticket)}
                onApproval={(status) => onApproval(ticket.id, status)}
                approvalPending={approvalPending}
                onSendToCashier={() => onSendToCashier(ticket)}
                onDelete={() => onDelete(ticket)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function WorkOrderTableRow({
  ticket,
  pending,
  onEdit,
  onDelete,
}: {
  ticket: WorkshopTicket;
  pending: boolean;
  onAdvance: (id: string, status: WorkshopTicketStatus) => void;
  onEdit: (ticket: WorkshopTicket) => void;
  onApproval: (
    ticketId: string,
    status: Extract<WorkshopApprovalStatus, 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>,
  ) => void;
  approvalPending: boolean;
  onSendToCashier: (ticket: WorkshopTicket) => void;
  onDelete?: (ticket: WorkshopTicket) => void;
}) {
  const mechanic = mechanicName(ticket);
  const session = useCurrentSession();
  return (
    <tr
      className="cursor-pointer transition hover:bg-muted/35 focus-within:bg-muted/35"
      onClick={() => onEdit(ticket)}
    >
      <td className="px-4 py-3 align-top">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(ticket);
          }}
          className="text-left font-semibold hover:text-primary"
        >
          {ticket.ticketNumber}
        </button>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatWorkshopTime(ticket.openedAt)}
        </p>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2.5">
          <VehicleIllustration type={ticket.vehicle.vehicleType} className="h-12 w-16 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{ticket.vehicle.licensePlate ?? 'Sin placa'}</p>
            <p className="mt-0.5 max-w-36 truncate text-xs text-muted-foreground">
              {ticket.vehicle.make} {ticket.vehicle.model}
              {ticket.vehicle.year ? ` ${ticket.vehicle.year}` : ''}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <p className="max-w-32 truncate font-medium">{ticket.customer.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {ticket.customer.phone ?? 'Sin teléfono'}
        </p>
      </td>
      <td className="px-3 py-3 align-top text-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
            {initials(mechanic)}
          </span>
          <span className="max-w-24 truncate">{mechanic}</span>
        </div>
      </td>
      <td className="px-3 py-3 align-top text-sm">{formatWorkshopTime(ticket.promisedAt)}</td>
      <td className="px-3 py-3 align-top">
        <TicketSoftBadge status={ticket.status} />
      </td>
      <td className="px-3 py-3 text-right align-top font-medium">
        RD${Number(ticket.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-2 text-right align-top" onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-end gap-1">
          {onDelete &&
          session?.role !== 'ORDER_TAKER' &&
          hasPermission(session, 'workorders.cancel') ? (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => onDelete(ticket)}
              title="Eliminar expediente"
              aria-label={`Eliminar ${ticket.ticketNumber}`}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(ticket)}
            title="Abrir expediente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function TodayRail({
  tickets,
  onOpen,
}: {
  tickets: WorkshopTicket[];
  onOpen: (ticket: WorkshopTicket) => void;
}) {
  const active = tickets.filter((ticket) => !['DELIVERED', 'CANCELLED'].includes(ticket.status));
  const promises = [...active]
    .filter((ticket) => ticket.promisedAt)
    .sort(
      (first, second) =>
        new Date(first.promisedAt!).getTime() - new Date(second.promisedAt!).getTime(),
    )
    .slice(0, 4);
  const activity = tickets
    .flatMap((ticket) => ticket.statusEvents.map((event) => ({ ticket, event })))
    .sort(
      (first, second) =>
        new Date(second.event.createdAt).getTime() - new Date(first.event.createdAt).getTime(),
    )
    .slice(0, 5);
  const summary = [
    ['Órdenes abiertas', active.length, ClipboardCheck, 'bg-blue-100 text-blue-700'],
    [
      'En diagnóstico',
      tickets.filter(
        (ticket) =>
          ticket.status === 'RECEIVED' || (ticket.status === 'DIAGNOSIS' && !ticket.diagnosis),
      ).length,
      Car,
      'bg-slate-100 text-slate-700',
    ],
    [
      'Por cotizar',
      tickets.filter((ticket) => ticket.status === 'DIAGNOSIS' && Boolean(ticket.diagnosis)).length,
      FileText,
      'bg-amber-100 text-amber-700',
    ],
    [
      'Esperando aprobación',
      tickets.filter((ticket) => ticket.status === 'AWAITING_APPROVAL').length,
      Clock3,
      'bg-orange-100 text-orange-700',
    ],
    [
      'Por facturar',
      tickets.filter((ticket) =>
        ['APPROVED', 'IN_PROGRESS', 'READY_FOR_DELIVERY'].includes(ticket.status),
      ).length,
      Receipt,
      'bg-violet-100 text-violet-700',
    ],
    [
      'Entregadas',
      tickets.filter((ticket) => ticket.status === 'DELIVERED').length,
      CheckCircle2,
      'bg-emerald-100 text-emerald-700',
    ],
  ] as const;
  return (
    <aside className="space-y-3">
      <section className="rounded-xl border border-border bg-card p-4">
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
        <div className="mt-4 space-y-2.5">
          {summary.map(([label, value, Icon, tone]) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-muted-foreground">{label}</span>
              <strong className="ml-auto text-foreground">{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Clock3 className="h-4 w-4 text-rose-500" /> Próximas promesas
        </h2>
        <div className="mt-3 divide-y">
          {promises.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onOpen(ticket)}
              className="flex w-full items-center gap-2 py-2.5 text-left text-xs"
            >
              <span className="w-14 shrink-0 font-semibold">
                {new Date(ticket.promisedAt!).toLocaleTimeString('es-DO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <Car className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{ticket.ticketNumber}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
          {!promises.length ? (
            <p className="py-3 text-xs text-muted-foreground">
              No hay fechas prometidas pendientes.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-primary" /> Actividad reciente
        </h2>
        <div className="mt-3 space-y-3">
          {activity.map(({ ticket, event }) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpen(ticket)}
              className="flex w-full gap-2 border-l-2 border-slate-200 pl-3 text-left text-xs"
            >
              <span className="w-14 shrink-0 text-muted-foreground">
                {new Date(event.createdAt).toLocaleTimeString('es-DO', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="min-w-0">
                <strong className="block truncate">{statusLabels[event.toStatus]}</strong>
                <span className="block truncate text-muted-foreground">
                  {ticket.ticketNumber} · {ticket.customer.name}
                </span>
              </span>
            </button>
          ))}
          {!activity.length ? (
            <p className="text-xs text-muted-foreground">Sin actividad reciente.</p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function formatWorkshopTime(value: string | null) {
  if (!value) return 'Sin promesa';
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatWorkshopAmount(value: string) {
  return `RD$${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}

function ReceptionWorkspace({
  tickets,
  selectedTicketId,
  onSelectTicket,
  onEdit,
  onCreate,
}: {
  tickets: WorkshopTicket[];
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
  onEdit: (ticket: WorkshopTicket) => void;
  onCreate: () => void;
}) {
  const activeTickets = tickets.filter(
    (ticket) => !['DELIVERED', 'CANCELLED'].includes(ticket.status),
  );
  const selected =
    activeTickets.find((ticket) => ticket.id === selectedTicketId) ?? activeTickets[0] ?? null;
  const stageCount = (statuses: WorkshopTicketStatus[]) =>
    activeTickets.filter((ticket) => statuses.includes(ticket.status)).length;

  return (
    <div className="space-y-5">
      <section className="grid overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[repeat(5,minmax(0,1fr))_minmax(14rem,1.35fr)]">
        {[
          ['En recepción', stageCount(['RECEIVED']), Car, 'text-primary'],
          ['Diagnóstico', stageCount(['DIAGNOSIS']), ClipboardCheck, 'text-slate-700'],
          [
            'Estimación pendiente',
            stageCount(['AWAITING_APPROVAL']),
            ClipboardPlus,
            'text-amber-600',
          ],
          ['En reparación', stageCount(['APPROVED', 'IN_PROGRESS']), Wrench, 'text-emerald-700'],
          [
            'Listo para entrega',
            stageCount(['READY_FOR_DELIVERY']),
            CheckCircle2,
            'text-green-700',
          ],
        ].map(([label, value, Icon, tone]) => {
          const MetricIcon = Icon as LucideIcon;
          return (
            <div
              key={label as string}
              className="border-b border-border p-4 md:border-b-0 md:border-r"
            >
              <MetricIcon className={`h-5 w-5 ${tone as string}`} />
              <p className="mt-3 text-2xl font-semibold tabular-nums">{value as number}</p>
              <p className="text-xs text-muted-foreground">{label as string}</p>
            </div>
          );
        })}
        <div className="p-4 md:col-span-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Carga de trabajo hoy</span>
            <span className="font-semibold text-primary">
              {Math.min(100, Math.round((activeTickets.length / 12) * 100))}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.round((activeTickets.length / 12) * 100))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Capacidad estimada del taller</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Vehículos en recepción</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Selecciona un vehículo para revisar y continuar su orden de trabajo.
              </p>
            </div>
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              Registrar vehículo
            </Button>
          </div>
          {activeTickets.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Ingreso</th>
                    <th className="px-3 py-2.5">Vehículo</th>
                    <th className="px-3 py-2.5">Cliente</th>
                    <th className="px-3 py-2.5">Motivo / queja</th>
                    <th className="px-3 py-2.5">Kilometraje</th>
                    <th className="px-3 py-2.5">Mecánico</th>
                    <th className="px-3 py-2.5">Promesa</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeTickets.map((ticket) => {
                    const isSelected = selected?.id === ticket.id;
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket.id)}
                        className={`cursor-pointer transition hover:bg-muted/45 ${
                          isSelected
                            ? 'bg-primary/[0.045] shadow-[inset_3px_0_0_hsl(var(--primary))]'
                            : ''
                        }`}
                      >
                        <td className="px-4 py-3 align-top text-xs">
                          <p className="font-semibold text-foreground">
                            {formatWorkshopTime(ticket.openedAt)}
                          </p>
                          <p className="mt-1 text-muted-foreground">{ticket.ticketNumber}</p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-semibold">
                            {ticket.vehicle.licensePlate ?? 'Sin placa'}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ticket.vehicle.make} {ticket.vehicle.model}
                            {ticket.vehicle.year ? ` ${ticket.vehicle.year}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium">{ticket.customer.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ticket.customer.phone ?? 'Sin teléfono'}
                          </p>
                        </td>
                        <td className="max-w-48 px-3 py-3 align-top text-xs leading-5">
                          <span className="line-clamp-2">{ticket.complaint}</span>
                        </td>
                        <td className="px-3 py-3 align-top text-xs">
                          {ticket.vehicle.mileage !== null
                            ? `${Number(ticket.vehicle.mileage).toLocaleString('es-DO')} km`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 align-top text-xs">
                          {ticket.assignments[0]?.employee.user.name ?? 'Sin asignar'}
                        </td>
                        <td className="px-3 py-3 align-top text-xs">
                          {formatWorkshopTime(ticket.promisedAt)}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Badge variant={statusVariant(ticket.status)}>
                            {statusLabels[ticket.status]}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyWorkshopState onCreate={onCreate} />
          )}
        </section>

        <ReceptionInspector ticket={selected} onEdit={onEdit} />
      </div>
    </div>
  );
}

function ReceptionInspector({
  ticket,
  onEdit,
}: {
  ticket: WorkshopTicket | null;
  onEdit: (ticket: WorkshopTicket) => void;
}) {
  if (!ticket) {
    return (
      <aside className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Car className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">Selecciona un vehículo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Aquí aparecerán sus datos, diagnóstico y próxima acción.
        </p>
      </aside>
    );
  }

  const mechanic = ticket.assignments[0]?.employee.user.name ?? 'Sin asignar';
  return (
    <aside className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant={statusVariant(ticket.status)}>{statusLabels[ticket.status]}</Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {ticket.vehicle.licensePlate ?? 'Sin placa'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.vehicle.make} {ticket.vehicle.model}
            {ticket.vehicle.year ? ` ${ticket.vehicle.year}` : ''}
          </p>
        </div>
        <Car className="h-5 w-5 text-primary" />
      </div>
      <dl className="mt-5 divide-y divide-border text-sm">
        <ReceptionDetail label="Ingreso" value={formatWorkshopTime(ticket.openedAt)} />
        <ReceptionDetail
          label="Kilometraje"
          value={
            ticket.vehicle.mileage !== null
              ? `${Number(ticket.vehicle.mileage).toLocaleString('es-DO')} km`
              : 'No registrado'
          }
        />
        <ReceptionDetail
          label="Cliente"
          value={ticket.customer.name}
          detail={ticket.customer.phone ?? undefined}
        />
        <ReceptionDetail label="Mecánico asignado" value={mechanic} />
        <ReceptionDetail label="Promesa de entrega" value={formatWorkshopTime(ticket.promisedAt)} />
      </dl>
      <div className="mt-5 border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Motivo / queja
        </p>
        <p className="mt-2 text-sm leading-6">{ticket.complaint}</p>
      </div>
      <ReceptionEditor ticket={ticket} />
      <QualityCheckEditor ticket={ticket} />
      <div className="mt-5">
        <WorkshopBillingPanel ticket={ticket} />
      </div>
      <DeliveryEditor ticket={ticket} />
      <div className="mt-5 rounded-lg border border-primary/20 bg-primary/[0.045] p-3">
        <p className="text-xs font-semibold text-primary">Próxima acción</p>
        <p className="mt-1 text-sm font-medium">
          {ticket.status === 'RECEIVED'
            ? 'Completar diagnóstico inicial'
            : 'Abrir orden de trabajo'}
        </p>
        <Button className="mt-3 w-full" size="sm" onClick={() => onEdit(ticket)}>
          <ClipboardCheck className="h-4 w-4" />
          {ticket.status === 'RECEIVED' ? 'Iniciar diagnóstico' : 'Abrir orden'}
        </Button>
      </div>
    </aside>
  );
}

function ReceptionEditor({ ticket }: { ticket: WorkshopTicket }) {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    mileage: '',
    fuelLevel: '',
    accessories: '',
    belongings: '',
    exteriorCondition: '',
    interiorCondition: '',
    warningLights: '',
    observations: '',
    initialMechanicId: '',
  });
  const mechanics = useQuery({
    queryKey: ['workshop-mechanics', session?.tenantId],
    queryFn: () => getWorkshopMechanics(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const reception = ticket.reception;
  const editable = hasPermission(session, 'reception.manage') && ticket.status === 'RECEIVED';

  useEffect(() => {
    setForm({
      mileage: reception
        ? String(reception.mileage)
        : ticket.vehicle.mileage === null
          ? ''
          : String(ticket.vehicle.mileage),
      fuelLevel: reception?.fuelLevel ?? '',
      accessories: reception?.accessories ?? '',
      belongings: reception?.belongings ?? '',
      exteriorCondition: reception?.exteriorCondition ?? '',
      interiorCondition: reception?.interiorCondition ?? '',
      warningLights: reception?.warningLights ?? '',
      observations: reception?.observations ?? '',
      initialMechanicId: reception?.initialMechanicId ?? ticket.assignments[0]?.employee.id ?? '',
    });
    setOpen(false);
  }, [reception, ticket.id, ticket.vehicle.mileage, ticket.assignments]);

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopReceptionPayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return reception
        ? updateWorkshopReception(session.tenantId, session.accessToken, ticket.id, payload)
        : createWorkshopReception(session.tenantId, session.accessToken, ticket.id, payload);
    },
    onSuccess: async () => {
      toast.success(reception ? 'Recepción actualizada' : 'Recepción registrada');
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la recepción.'),
  });

  if (!reception && !editable) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({
      mileage: Number(form.mileage),
      fuelLevel: form.fuelLevel || undefined,
      accessories: form.accessories || undefined,
      belongings: form.belongings || undefined,
      exteriorCondition: form.exteriorCondition || undefined,
      interiorCondition: form.interiorCondition || undefined,
      warningLights: form.warningLights || undefined,
      observations: form.observations || undefined,
      initialMechanicId: form.initialMechanicId || undefined,
    });
  }

  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recepción e inspección de entrada
          </p>
          <p className="mt-1 text-sm font-medium">
            {reception ? 'Recepción registrada' : 'Pendiente: requerida antes del diagnóstico'}
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant={reception ? 'outline' : 'default'}
            onClick={() => setOpen((current) => !current)}
          >
            <ClipboardCheck className="h-4 w-4" />
            {reception ? 'Editar' : 'Completar'}
          </Button>
        ) : null}
      </div>
      {reception && !open ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-muted/40 p-3 text-xs">
          <p>
            <strong>{Number(reception.mileage).toLocaleString('es-DO')} km</strong> · Combustible:{' '}
            {reception.fuelLevel ?? 'No registrado'}
          </p>
          <p className="text-muted-foreground">
            Exterior: {reception.exteriorCondition ?? 'Sin observaciones'}
          </p>
          <p className="text-muted-foreground">
            Testigos: {reception.warningLights ?? 'No registrados'}
          </p>
        </div>
      ) : null}
      {open ? (
        <form className="mt-4 grid gap-3" onSubmit={submit}>
          <Field label="Kilometraje *">
            <Input
              required
              min="0"
              type="number"
              value={form.mileage}
              onChange={(event) =>
                setForm((current) => ({ ...current, mileage: event.target.value }))
              }
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Combustible">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.fuelLevel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fuelLevel: event.target.value }))
                }
              >
                <option value="">No registrado</option>
                <option value="Vacío">Vacío</option>
                <option value="1/4">1/4</option>
                <option value="1/2">1/2</option>
                <option value="3/4">3/4</option>
                <option value="Lleno">Lleno</option>
              </select>
            </Field>
          </div>
          <Field label="Técnico inicial">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.initialMechanicId}
              onChange={(event) =>
                setForm((current) => ({ ...current, initialMechanicId: event.target.value }))
              }
            >
              <option value="">Sin asignar</option>
              {(mechanics.data ?? []).map((mechanic) => (
                <option key={mechanic.id} value={mechanic.id}>
                  {mechanic.user.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Accesorios entregados">
            <Input
              value={form.accessories}
              onChange={(event) =>
                setForm((current) => ({ ...current, accessories: event.target.value }))
              }
              placeholder="Ej. Llave de rueda, gato"
            />
          </Field>
          <Field label="Objetos dejados">
            <Input
              value={form.belongings}
              onChange={(event) =>
                setForm((current) => ({ ...current, belongings: event.target.value }))
              }
              placeholder="Ej. Documentos, cargador"
            />
          </Field>
          <Field label="Condición exterior">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.exteriorCondition}
              onChange={(event) =>
                setForm((current) => ({ ...current, exteriorCondition: event.target.value }))
              }
              placeholder="Rayones, golpes, cristales, luces, neumáticos..."
            />
          </Field>
          <Field label="Condición interior">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.interiorCondition}
              onChange={(event) =>
                setForm((current) => ({ ...current, interiorCondition: event.target.value }))
              }
              placeholder="Estado de asientos, tablero y tapicería"
            />
          </Field>
          <Field label="Testigos encendidos">
            <Input
              value={form.warningLights}
              onChange={(event) =>
                setForm((current) => ({ ...current, warningLights: event.target.value }))
              }
              placeholder="Ej. Check engine, ABS"
            />
          </Field>
          <Field label="Observaciones">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.observations}
              onChange={(event) =>
                setForm((current) => ({ ...current, observations: event.target.value }))
              }
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
              {reception ? 'Guardar' : 'Registrar recepción'}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

const defaultInspectionItems = [
  ['PARTS', 'Piezas y componentes'],
  ['ENGINE', 'Motor'],
  ['TRANSMISSION', 'Transmisión'],
  ['COMPUTER', 'Computadora y diagnóstico electrónico'],
  ['BRAKES', 'Sistema de frenos'],
  ['SUSPENSION_STEERING', 'Suspensión y dirección'],
  ['ELECTRICAL', 'Sistema eléctrico'],
  ['BODY_INTERIOR', 'Carrocería e interior'],
] as const;

function InspectionEditor({
  ticket,
  workspace = false,
}: {
  ticket: WorkshopTicket;
  workspace?: boolean;
}) {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<
    Array<{
      code: string;
      label: string;
      result: WorkshopInspectionResult;
      comment: string;
      recommendation: string;
    }>
  >([]);
  const inspection = ticket.inspection;
  const inspectedCount = items.filter((item) => item.result !== 'NOT_INSPECTED').length;
  const editable =
    hasPermission(session, 'workorders.diagnose') &&
    ['RECEIVED', 'DIAGNOSIS'].includes(ticket.status);

  useEffect(() => {
    setItems(
      inspection?.items.map((item) => ({
        code: item.code,
        label: item.label,
        result: item.result,
        comment: item.comment ?? '',
        recommendation: item.recommendation ?? '',
      })) ??
        defaultInspectionItems.map(([code, label]) => ({
          code,
          label,
          result: 'NOT_INSPECTED' as WorkshopInspectionResult,
          comment: '',
          recommendation: '',
        })),
    );
    setOpen(false);
  }, [inspection, ticket.id]);

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopInspectionPayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return saveWorkshopInspection(session.tenantId, session.accessToken, ticket.id, payload);
    },
    onSuccess: async () => {
      toast.success('Inspección técnica guardada');
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la inspección.'),
  });

  if (!editable && !inspection) return null;
  const updateItem = (
    index: number,
    field: 'label' | 'result' | 'comment' | 'recommendation',
    value: string,
  ) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );

  return (
    <section
      className={
        workspace
          ? 'rounded-xl border border-border bg-white p-4 shadow-sm'
          : 'mt-5 border-t border-border pt-5'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inspección técnica <span className="font-normal text-muted-foreground">(opcional)</span>
          </p>
          <p className="mt-1 text-sm font-medium">
            {inspection
              ? `${inspection.items.length} puntos inspeccionados`
              : 'Clasificación general para apoyar la cotización'}
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant={inspection ? 'outline' : 'default'}
            onClick={() => setOpen((current) => !current)}
          >
            <ClipboardCheck className="h-4 w-4" />
            {inspection ? 'Revisar' : 'Inspeccionar'}
          </Button>
        ) : null}
      </div>
      {inspection && !open ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
            {inspection.items.filter((item) => item.result === 'GOOD').length} correctos
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
            {inspection.items.filter((item) => item.result === 'ATTENTION').length} con atención
          </span>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-800">
            {inspection.items.filter((item) => item.result === 'REQUIRES_REPAIR').length} por
            reparar
          </span>
        </div>
      ) : null}
      {open ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({
              items: items.map((item) => ({
                ...item,
                comment: item.comment || undefined,
                recommendation: item.recommendation || undefined,
              })),
            });
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {inspectedCount} de {items.length} puntos cotejados
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setItems((current) =>
                  current.map((item) => ({ ...item, result: 'GOOD' as WorkshopInspectionResult })),
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Marcar todos correctos
            </Button>
          </div>
          <div className="grid gap-2 xl:grid-cols-2">
            {items.map((item, index) => (
              <div key={item.code} className="rounded-lg border border-border p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {item.code.startsWith('CUSTOM_') ? (
                    <Input
                      className="h-8 min-w-32 flex-1"
                      value={item.label}
                      onChange={(event) => updateItem(index, 'label', event.target.value)}
                    />
                  ) : (
                    <p className="min-w-0 flex-1 text-sm font-medium">{item.label}</p>
                  )}
                  <div className="inline-flex rounded-md border bg-slate-50 p-0.5">
                    {(
                      [
                        ['GOOD', 'Bien', 'text-emerald-700 data-[active=true]:bg-emerald-100'],
                        ['ATTENTION', 'Atención', 'text-amber-700 data-[active=true]:bg-amber-100'],
                        [
                          'REQUIRES_REPAIR',
                          'Reparar',
                          'text-rose-700 data-[active=true]:bg-rose-100',
                        ],
                      ] as const
                    ).map(([result, label, tone]) => (
                      <button
                        key={result}
                        type="button"
                        data-active={item.result === result}
                        aria-pressed={item.result === result}
                        onClick={() => updateItem(index, 'result', result)}
                        className={`h-8 rounded px-2 text-[11px] font-medium transition ${tone}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {item.result === 'ATTENTION' || item.result === 'REQUIRES_REPAIR' ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      className="h-9 text-xs"
                      value={item.comment}
                      onChange={(event) => updateItem(index, 'comment', event.target.value)}
                      placeholder="Hallazgo o comentario"
                    />
                    <Input
                      className="h-9 text-xs"
                      value={item.recommendation}
                      onChange={(event) => updateItem(index, 'recommendation', event.target.value)}
                      placeholder="Recomendación"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  {
                    code: `CUSTOM_${current.length + 1}`,
                    label: 'Punto adicional',
                    result: 'NOT_INSPECTED',
                    comment: '',
                    recommendation: '',
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Punto adicional
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button disabled={saveMutation.isPending || inspectedCount !== items.length}>
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                Guardar inspección
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function QualityCheckEditor({ ticket }: { ticket: WorkshopTicket }) {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [observations, setObservations] = useState('');
  const [checks, setChecks] = useState({
    workCompleted: false,
    partsVerified: false,
    leaksChecked: false,
    fluidsChecked: false,
    warningLightsChecked: false,
    roadTested: false,
    toolsRemoved: false,
    vehicleCleaned: false,
  });
  const qualityCheck = ticket.qualityCheck;
  const editable = hasPermission(session, 'workorders.quality') && ticket.status === 'IN_PROGRESS';

  useEffect(() => {
    if (!qualityCheck) {
      setStatus('APPROVED');
      setObservations('');
      setChecks({
        workCompleted: false,
        partsVerified: false,
        leaksChecked: false,
        fluidsChecked: false,
        warningLightsChecked: false,
        roadTested: false,
        toolsRemoved: false,
        vehicleCleaned: false,
      });
    } else {
      setStatus(qualityCheck.status === 'REJECTED' ? 'REJECTED' : 'APPROVED');
      setObservations(qualityCheck.observations ?? '');
      setChecks({
        workCompleted: qualityCheck.workCompleted,
        partsVerified: qualityCheck.partsVerified,
        leaksChecked: qualityCheck.leaksChecked,
        fluidsChecked: qualityCheck.fluidsChecked,
        warningLightsChecked: qualityCheck.warningLightsChecked,
        roadTested: qualityCheck.roadTested,
        toolsRemoved: qualityCheck.toolsRemoved,
        vehicleCleaned: qualityCheck.vehicleCleaned,
      });
    }
    setOpen(false);
  }, [qualityCheck, ticket.id]);

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopQualityCheckPayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return saveWorkshopQualityCheck(session.tenantId, session.accessToken, ticket.id, payload);
    },
    onSuccess: async () => {
      toast.success(
        status === 'APPROVED' ? 'Control de calidad aprobado' : 'Orden devuelta a reparación',
      );
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'No se pudo guardar el control de calidad.',
      ),
  });

  if (!editable && !qualityCheck) return null;
  const checkLabels: Array<[keyof typeof checks, string]> = [
    ['workCompleted', 'Trabajos completados'],
    ['partsVerified', 'Repuestos verificados'],
    ['leaksChecked', 'Sin fugas'],
    ['fluidsChecked', 'Fluidos verificados'],
    ['warningLightsChecked', 'Testigos verificados'],
    ['roadTested', 'Prueba de carretera'],
    ['toolsRemoved', 'Herramientas retiradas'],
    ['vehicleCleaned', 'Vehículo limpio'],
  ];

  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Control de calidad final
          </p>
          <p className="mt-1 text-sm font-medium">
            {qualityCheck?.status === 'APPROVED'
              ? 'Aprobado para entrega'
              : qualityCheck?.status === 'REJECTED'
                ? 'Devuelto a reparación'
                : 'Requerido antes de preparar el cobro'}
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant={qualityCheck ? 'outline' : 'default'}
            onClick={() => setOpen((current) => !current)}
          >
            <ClipboardCheck className="h-4 w-4" />
            {qualityCheck ? 'Revisar' : 'Realizar'}
          </Button>
        ) : null}
      </div>
      {qualityCheck && !open ? (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          Revisado por {qualityCheck.checkedBy.name}.{' '}
          {qualityCheck.observations ?? 'Sin observaciones.'}
        </p>
      ) : null}
      {open ? (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate({ status, ...checks, observations: observations || undefined });
          }}
        >
          {checkLabels.map(([field, label]) => (
            <label
              key={field}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={checks[field]}
                onChange={(event) =>
                  setChecks((current) => ({ ...current, [field]: event.target.checked }))
                }
              />
              {label}
            </label>
          ))}
          <Field label="Resultado">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'APPROVED' | 'REJECTED')}
            >
              <option value="APPROVED">Aprobar para entrega</option>
              <option value="REJECTED">Devolver a reparación</option>
            </select>
          </Field>
          <Field label="Observaciones">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Guardar control
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function DeliveryEditor({ ticket }: { ticket: WorkshopTicket }) {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState(ticket.customer.name);
  const [mileageOut, setMileageOut] = useState(
    ticket.vehicle.mileage === null ? '' : String(ticket.vehicle.mileage),
  );
  const [recommendations, setRecommendations] = useState('');
  const [notes, setNotes] = useState('');
  const invoice = ticket.salesOrder?.invoice;
  const payment = workshopPaymentState(ticket);

  useEffect(() => {
    setRecipientName(ticket.delivery?.recipientName ?? ticket.customer.name);
    setMileageOut(
      ticket.delivery
        ? String(ticket.delivery.mileageOut)
        : ticket.vehicle.mileage === null
          ? ''
          : String(ticket.vehicle.mileage),
    );
    setRecommendations(ticket.delivery?.recommendations ?? '');
    setNotes(ticket.delivery?.notes ?? '');
    setOpen(false);
  }, [ticket.id, ticket.delivery, ticket.customer.name, ticket.vehicle.mileage]);

  const deliveryMutation = useMutation({
    mutationFn: (payload: WorkshopDeliveryPayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return createWorkshopDelivery(session.tenantId, session.accessToken, ticket.id, payload);
    },
    onSuccess: async () => {
      toast.success('Entrega del vehículo registrada');
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-overview'] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la entrega.'),
  });

  if (!ticket.delivery && !(ticket.status === 'READY_FOR_DELIVERY' && invoice)) return null;

  return (
    <section className="mt-5 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entrega del vehículo
          </p>
          <p className="mt-1 text-sm font-medium">
            {ticket.delivery
              ? `Entregado a ${ticket.delivery.recipientName}`
              : `Factura ${invoice!.invoiceNumber} emitida; pendiente de entrega`}
          </p>
        </div>
        {!ticket.delivery ? (
          <Button
            type="button"
            size="sm"
            disabled={!payment.canDeliver || !hasPermission(session, 'workorders.deliver')}
            onClick={() => setOpen((current) => !current)}
          >
            <CheckCircle2 className="h-4 w-4" />
            Entregar
          </Button>
        ) : null}
      </div>
      {!ticket.delivery && !payment.canDeliver ? (
        <p className="mt-2 text-sm text-amber-700">
          {payment.fullyPaid
            ? 'Confirma calidad y el estado operativo antes de entregar.'
            : payment.description}
        </p>
      ) : null}
      {ticket.delivery ? (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          {Number(ticket.delivery.mileageOut).toLocaleString('es-DO')} km · Entregó:{' '}
          {ticket.delivery.deliveredBy.name}
          {ticket.delivery.recommendations
            ? ` · Recomendaciones: ${ticket.delivery.recommendations}`
            : ''}
        </p>
      ) : null}
      {open && payment.canDeliver && hasPermission(session, 'workorders.deliver') ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            deliveryMutation.mutate({
              recipientName,
              mileageOut: Number(mileageOut),
              recommendations: recommendations || undefined,
              notes: notes || undefined,
            });
          }}
        >
          <Field label="Persona que recibe *">
            <Input
              required
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
            />
          </Field>
          <Field label="Kilometraje de salida *">
            <Input
              required
              min="0"
              type="number"
              value={mileageOut}
              onChange={(event) => setMileageOut(event.target.value)}
            />
          </Field>
          <Field label="Recomendaciones">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              placeholder="Próximo mantenimiento, uso y garantía"
            />
          </Field>
          <Field label="Notas de entrega">
            <textarea
              className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={deliveryMutation.isPending}>
              {deliveryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirmar entrega
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ReceptionDetail({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="py-3 first:pt-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
      {detail ? <dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

function WorkshopBoard({
  tickets,
  mechanics,
  onEdit,
}: {
  tickets: WorkshopTicket[];
  mechanics: WorkshopMechanic[];
  onEdit: (ticket: WorkshopTicket) => void;
}) {
  const lanes: Array<{
    title: string;
    tone: 'blue' | 'slate' | 'amber' | 'green' | 'emerald';
    statuses: WorkshopTicketStatus[];
  }> = [
    { title: 'Recepción', tone: 'blue', statuses: ['RECEIVED'] },
    { title: 'Diagnóstico', tone: 'slate', statuses: ['DIAGNOSIS'] },
    { title: 'Autorización', tone: 'amber', statuses: ['AWAITING_APPROVAL'] },
    { title: 'En reparación', tone: 'green', statuses: ['APPROVED', 'IN_PROGRESS'] },
    { title: 'Entrega', tone: 'emerald', statuses: ['READY_FOR_DELIVERY'] },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        {lanes.map((lane) => (
          <BoardLane
            key={lane.title}
            title={lane.title}
            tone={lane.tone}
            tickets={tickets.filter((ticket) => lane.statuses.includes(ticket.status))}
            onEdit={onEdit}
          />
        ))}
      </div>
      <MechanicCapacity mechanics={mechanics} tickets={tickets} />
    </div>
  );
}

function BoardLane({
  title,
  tone,
  tickets,
  onEdit,
}: {
  title: string;
  tone: WorkshopLaneTone;
  tickets: WorkshopTicket[];
  onEdit: (ticket: WorkshopTicket) => void;
}) {
  const style = laneStyles[tone];
  return (
    <section className={`rounded-xl border border-border border-l-4 bg-card p-4 ${style.accent}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
          {tickets.length}
        </span>
      </div>
      {tickets.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onEdit(ticket)}
              className="rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{ticket.vehicle.licensePlate ?? 'Sin placa'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ticket.vehicle.make} {ticket.vehicle.model}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatWorkshopAmount(ticket.total)}</p>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 text-xs">
                <div>
                  <p className="font-medium">{ticket.customer.name}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {ticket.assignments[0]?.employee.user.name ?? 'Sin mecánico'}
                  </p>
                </div>
                <p className="text-right text-primary">{formatWorkshopTime(ticket.promisedAt)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted-foreground">
          Sin órdenes en esta etapa.
        </p>
      )}
    </section>
  );
}

function MechanicCapacity({
  mechanics,
  tickets,
}: {
  mechanics: WorkshopMechanic[];
  tickets: WorkshopTicket[];
}) {
  return (
    <aside className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Mecánicos</h2>
        <span className="text-sm font-semibold text-primary">{mechanics.length}</span>
      </div>
      <div className="mt-4 space-y-3">
        {mechanics.length ? (
          mechanics.map((mechanic) => {
            const assigned = tickets.filter((ticket) =>
              ticket.assignments.some((assignment) => assignment.employee.id === mechanic.id),
            );
            const capacity = Math.min(100, assigned.length * 25);
            return (
              <div key={mechanic.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{mechanic.user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {mechanic.jobTitle ?? 'Mecánico'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold">{assigned.length} activas</span>
                </div>
                <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                  <span>Capacidad</span>
                  <span>{capacity}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${capacity}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Registra empleados con perfil de mecánico para asignar órdenes.
          </p>
        )}
      </div>
      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <Gauge className="h-4 w-4" />
        La capacidad se estima según las órdenes activas asignadas.
      </div>
    </aside>
  );
}

function VehicleDirectory({
  vehicles,
  onRegister,
  onEdit,
  onCreateTicket,
}: {
  vehicles: WorkshopVehicle[];
  onRegister: () => void;
  onEdit: (vehicle: WorkshopVehicle) => void;
  onCreateTicket: (vehicle: WorkshopVehicle) => void;
}) {
  const session = useCurrentSession();
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: ['workshop-vehicle-history', session?.tenantId, historyVehicleId],
    queryFn: () =>
      getWorkshopVehicleHistory(session!.tenantId, session!.accessToken, historyVehicleId!),
    enabled: Boolean(session && historyVehicleId),
  });
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Vehículos registrados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta el vehículo antes de abrir una orden de reparación.
          </p>
        </div>
        <Button size="sm" onClick={onRegister}>
          <Plus className="h-4 w-4" />
          Registrar vehículo
        </Button>
      </div>
      {vehicles.length ? (
        <div className="divide-y divide-border">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Car className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-semibold">{vehicle.licensePlate ?? 'Sin placa'}</p>
                    <span className="text-sm text-muted-foreground">
                      {vehicle.make} {vehicle.model}
                      {vehicle.year ? ` · ${vehicle.year}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {vehicle.customer.name}
                    {vehicle.mileage !== null
                      ? ` · ${Number(vehicle.mileage).toLocaleString('es-DO')} km`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {session && hasPermission(session, 'vehicles.manage') ? (
                  <Button size="sm" variant="outline" onClick={() => onEdit(vehicle)}>
                    Editar
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setHistoryVehicleId(vehicle.id)}>
                  Historial
                </Button>
                <Button size="sm" variant="outline" onClick={() => onCreateTicket(vehicle)}>
                  Abrir orden
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-12 text-center">
          <Car className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aún no hay vehículos registrados.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra el primero para iniciar una orden de reparación.
          </p>
        </div>
      )}
      {historyVehicleId ? (
        <VehicleHistoryPanel
          history={historyQuery.data}
          loading={historyQuery.isLoading}
          onClose={() => setHistoryVehicleId(null)}
        />
      ) : null}
    </section>
  );
}

function VehicleHistoryPanel({
  history,
  loading,
  onClose,
}: {
  history?: WorkshopVehicleHistory;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <section className="border-t border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Historial del vehículo</h3>
          {history ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {history.licensePlate ?? 'Sin placa'} · {history.make} {history.model} ·{' '}
              {history.customer.name}
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial...
        </p>
      ) : history ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Órdenes y trabajos
            </p>
            <div className="mt-3 space-y-3">
              {history.tickets.length ? (
                history.tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{ticket.ticketNumber}</span>
                      <Badge variant={statusVariant(ticket.status)}>
                        {statusLabels[ticket.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm">{ticket.complaint}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(ticket.openedAt).toLocaleDateString('es-DO')} ·{' '}
                      {ticket.assignments
                        .map((assignment) => assignment.employee.user.name)
                        .join(', ') || 'Sin técnico'}
                    </p>
                    {ticket.diagnosis ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Diagnóstico: {ticket.diagnosis}
                      </p>
                    ) : null}
                    {ticket.salesOrder?.invoice ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Factura: {ticket.salesOrder.invoice.invoiceNumber}
                      </p>
                    ) : null}
                    {ticket.delivery ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Entregado a {ticket.delivery.recipientName} ·{' '}
                        {Number(ticket.delivery.mileageOut).toLocaleString('es-DO')} km
                      </p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aún no tiene órdenes registradas.</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Visitas programadas
            </p>
            <div className="mt-3 space-y-3">
              {history.appointments.length ? (
                history.appointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="border-b border-border pb-3 text-sm last:border-0 last:pb-0"
                  >
                    <p className="font-medium">{appointment.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(appointment.startsAt).toLocaleString('es-DO')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {appointment.status === 'CONVERTED_TO_RECEPTION'
                        ? 'Convertida en recepción'
                        : appointment.status}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hay citas registradas.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmptyWorkshopState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center">
      <Wrench className="mx-auto h-7 w-7 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold">El taller está listo para recibir vehículos.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Abre una orden de trabajo para iniciar la recepción, diagnóstico y asignación de mecánicos.
      </p>
      <Button className="mt-4" onClick={onCreate}>
        <ClipboardPlus className="h-4 w-4" />
        Nueva orden de trabajo
      </Button>
    </div>
  );
}

function WorkOrderCreateDialog({
  pending,
  onClose,
  children,
}: {
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, pending]);

  return (
    <div
      className="fixed inset-0 z-[104] bg-slate-950/50 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-work-order-title"
        className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-slate-50 shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl"
      >
        <header className="flex items-start gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            <ClipboardPlus className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="new-work-order-title" className="text-xl font-bold text-slate-950">
              Nueva orden de trabajo
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Selecciona el vehículo y registra lo que reporta el cliente. Los demás datos pueden
              completarse después.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={pending}
            onClick={onClose}
            aria-label="Cerrar formulario"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="surface-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

function VehicleForm({
  form,
  editing,
  customers,
  pending,
  onChange,
  onSubmit,
}: {
  form: Record<string, string>;
  editing: boolean;
  customers: Array<{ id: string; name: string }>;
  pending: boolean;
  onChange: (field: string, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? 'Editar vehículo' : 'Registrar vehículo'}</CardTitle>
        <CardDescription>
          El vehículo queda ligado a su propietario y podrá reutilizarse en futuros servicios.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
          <Field label="Cliente" required>
            <select
              required
              value={form.customerId}
              onChange={(event) => onChange('customerId', event.target.value)}
              className="input-select"
            >
              <option value="">Seleccionar cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Placa">
            <Input
              value={form.licensePlate}
              onChange={(event) => onChange('licensePlate', event.target.value)}
              placeholder="A123456"
            />
          </Field>
          <Field label="Tipo de vehículo" required>
            <select
              required
              value={form.vehicleType}
              onChange={(event) => onChange('vehicleType', event.target.value)}
              className="input-select"
            >
              <option value="">Seleccionar tipo</option>
              <option value="CAR">Carro</option>
              <option value="SUV">SUV</option>
            </select>
          </Field>
          <Field label="Marca" required>
            <Input
              required
              value={form.make}
              onChange={(event) => onChange('make', event.target.value)}
              placeholder="Toyota"
            />
          </Field>
          <Field label="Modelo" required>
            <Input
              required
              value={form.model}
              onChange={(event) => onChange('model', event.target.value)}
              placeholder="Corolla"
            />
          </Field>
          <Field label="Año">
            <Input
              type="number"
              min="1900"
              max="2100"
              value={form.year}
              onChange={(event) => onChange('year', event.target.value)}
            />
          </Field>
          <Field label="Kilometraje">
            <Input
              type="number"
              min="0"
              value={form.mileage}
              onChange={(event) => onChange('mileage', event.target.value)}
            />
          </Field>
          <Field label="Color">
            <Input value={form.color} onChange={(event) => onChange('color', event.target.value)} />
          </Field>
          <Field label="VIN / chasis">
            <Input value={form.vin} onChange={(event) => onChange('vin', event.target.value)} />
          </Field>
          <div className="md:col-span-3">
            <Button disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editing ? 'Guardar cambios' : 'Guardar vehículo'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketForm({
  dialog = false,
  form,
  customers,
  vehicles,
  mechanics,
  products,
  services,
  pending,
  onChange,
  onToggleMechanic,
  onAddLine,
  onSetLine,
  onSelectProduct,
  onSelectService,
  onRemoveLine,
  onSubmit,
}: {
  dialog?: boolean;
  form: typeof emptyTicket;
  customers: Array<{ id: string; name: string }>;
  vehicles: Array<{
    id: string;
    licensePlate: string | null;
    make: string;
    model: string;
    year: number | null;
  }>;
  mechanics: Array<{ id: string; user: { name: string } }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: string;
    salePrice: string;
    taxRate: string;
    trackInventory: boolean;
  }>;
  services: WorkshopService[];
  pending: boolean;
  onChange: (field: keyof typeof emptyTicket, value: string) => void;
  onToggleMechanic: (id: string) => void;
  onAddLine: () => void;
  onSetLine: (index: number, field: keyof TicketLineForm, value: string) => void;
  onSelectProduct: (index: number, productId: string) => void;
  onSelectService: (index: number, serviceId: string) => void;
  onRemoveLine: (index: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const session = useCurrentSession();
  return (
    <Card className={dialog ? 'border-0 shadow-none' : undefined}>
      {!dialog ? (
        <CardHeader>
          <CardTitle>Abrir ticket de servicio</CardTitle>
          <CardDescription>
            Registra la condición inicial. El diagnóstico y los costos pueden completarse conforme
            avance el trabajo.
          </CardDescription>
        </CardHeader>
      ) : null}
      <CardContent>
        <form className="space-y-5" onSubmit={onSubmit}>
          <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-sm font-bold text-slate-950">1. Vehículo y motivo de ingreso</p>
              <p className="mt-1 text-sm text-slate-500">
                Estos son los únicos datos necesarios para abrir la orden.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Cliente" required>
                <select
                  required
                  value={form.customerId}
                  onChange={(event) => onChange('customerId', event.target.value)}
                  className="input-select"
                >
                  <option value="">Seleccionar cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vehículo" required>
                <select
                  required
                  disabled={!form.customerId}
                  value={form.vehicleId}
                  onChange={(event) => onChange('vehicleId', event.target.value)}
                  className="input-select disabled:bg-zinc-100"
                >
                  <option value="">Seleccionar vehículo</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {[vehicle.licensePlate, vehicle.make, vehicle.model, vehicle.year]
                        .filter(Boolean)
                        .join(' · ')}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="¿Qué reporta el cliente?" required>
                  <textarea
                    required
                    rows={3}
                    value={form.complaint}
                    onChange={(event) => onChange('complaint', event.target.value)}
                    className="input-textarea"
                    placeholder="Ej. Se escucha un ruido al frenar"
                  />
                </Field>
              </div>
            </div>
          </section>

          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-semibold text-slate-800 sm:px-5">
              Detalles opcionales
              <span className="text-sm font-normal text-slate-500 group-open:hidden">Mostrar</span>
              <span className="hidden text-sm font-normal text-slate-500 group-open:inline">
                Ocultar
              </span>
            </summary>
            <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2 sm:p-5">
              <Field label="Fecha prometida">
                <Input
                  type="datetime-local"
                  value={form.promisedAt}
                  onChange={(event) => onChange('promisedAt', event.target.value)}
                />
              </Field>
              <Field label="Notas para el cliente">
                <textarea
                  rows={2}
                  value={form.customerNotes}
                  onChange={(event) => onChange('customerNotes', event.target.value)}
                  className="input-textarea"
                />
              </Field>
            </div>
          </details>
          <fieldset
            className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
            disabled={!hasPermission(session, 'workorders.assign')}
          >
            <p className="text-sm font-bold text-slate-950">2. Asignación inicial</p>
            <p className="mb-3 mt-1 text-sm text-slate-500">
              Puedes asignar un mecánico ahora o hacerlo después desde la orden.
            </p>
            <div className="flex flex-wrap gap-2">
              {mechanics.map((mechanic) => (
                <label
                  key={mechanic.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.mechanicIds.includes(mechanic.id)}
                    onChange={() => onToggleMechanic(mechanic.id)}
                  />
                  {mechanic.user.name}
                </label>
              ))}
              {!mechanics.length ? (
                <p className="text-sm text-muted-foreground">
                  Crea empleados con rol Mecánico para asignarlos.
                </p>
              ) : null}
            </div>
          </fieldset>
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-semibold text-slate-800 sm:px-5">
              Agregar servicios o repuestos ahora
              <span className="text-sm font-normal text-slate-500 group-open:hidden">Opcional</span>
              <span className="hidden text-sm font-normal text-slate-500 group-open:inline">
                Ocultar
              </span>
            </summary>
            <fieldset
              className="border-t border-slate-100 p-4 sm:p-5"
              disabled={!hasPermission(session, 'quotes.create')}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Trabajos y repuestos presupuestados</p>
                <Button type="button" size="sm" variant="outline" onClick={onAddLine}>
                  <Plus className="h-4 w-4" />
                  Agregar repuestos y servicios
                </Button>
              </div>
              {form.lines.length ? (
                <div className="space-y-2">
                  {form.lines.map((line, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[130px_1fr_1fr_100px_130px_auto]"
                    >
                      <select
                        value={line.type}
                        onChange={(event) => {
                          onSetLine(index, 'type', event.target.value);
                          onSetLine(index, 'productId', '');
                          onSetLine(index, 'serviceId', '');
                        }}
                        className="input-select"
                      >
                        <option value="LABOR">Servicio</option>
                        <option value="PART">Repuesto</option>
                        <option value="OTHER">Otro</option>
                      </select>
                      {line.type === 'PART' ? (
                        <select
                          value={line.productId}
                          onChange={(event) => onSelectProduct(index, event.target.value)}
                          className="input-select"
                        >
                          <option value="">Seleccionar repuesto</option>
                          {products
                            .filter((product) => product.trackInventory)
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                                {product.sku ? ` · ${product.sku}` : ''}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <select
                          value={line.serviceId}
                          onChange={(event) => onSelectService(index, event.target.value)}
                          className="input-select"
                        >
                          <option value="">Seleccionar servicio</option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} · {service.code}
                            </option>
                          ))}
                        </select>
                      )}
                      <Input
                        placeholder="Descripción"
                        value={line.description}
                        onChange={(event) => onSetLine(index, 'description', event.target.value)}
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Cant."
                        value={line.quantity}
                        onChange={(event) => onSetLine(index, 'quantity', event.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Precio"
                        value={line.unitPrice}
                        onChange={(event) => onSetLine(index, 'unitPrice', event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveLine(index)}
                      >
                        Quitar
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Sin líneas todavía. Puedes agregarlas ahora o durante el diagnóstico.
                </p>
              )}
            </fieldset>
          </details>
          <Button className="h-12 w-full text-base sm:w-auto sm:min-w-56" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Crear orden de trabajo
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketRow({
  ticket,
  pending,
  onAdvance,
  onEdit,
  onApproval,
  approvalPending,
  onSendToCashier,
  onDelete,
}: {
  ticket: WorkshopTicket;
  pending: boolean;
  onAdvance: (status: WorkshopTicketStatus) => void;
  onEdit: () => void;
  onApproval: (
    status: Extract<WorkshopApprovalStatus, 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED'>,
  ) => void;
  approvalPending: boolean;
  onSendToCashier: () => void;
  onDelete?: () => void;
}) {
  const next = nextStatus[ticket.status];
  const receptionRequired = ticket.status === 'RECEIVED' && !ticket.reception;
  const session = useCurrentSession();
  const payment = workshopPaymentState(ticket);
  return (
    <div className="rounded-lg border border-border p-4 transition-colors hover:bg-zinc-50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{ticket.ticketNumber}</span>
            <Badge variant={statusVariant(ticket.status)}>{statusLabels[ticket.status]}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium">
            {ticket.customer.name} ·{' '}
            {[ticket.vehicle.licensePlate, ticket.vehicle.make, ticket.vehicle.model]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{ticket.complaint}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Mecánicos:{' '}
            {ticket.assignments.length
              ? ticket.assignments.map((assignment) => assignment.employee.user.name).join(', ')
              : 'Sin asignar'}{' '}
            · Total RD$ {Number(ticket.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Aprobación:{' '}
            {ticket.approvalStatus === 'PENDING'
              ? 'Pendiente del cliente'
              : ticket.approvalStatus === 'APPROVED'
                ? 'Aprobada'
                : ticket.approvalStatus === 'PARTIALLY_APPROVED'
                  ? 'Aprobación parcial'
                  : ticket.approvalStatus === 'REJECTED'
                    ? 'Rechazada'
                    : 'Sin solicitar'}
            {ticket.tasks.length ? ` · ${ticket.tasks.length} tarea(s)` : ''}
          </p>
          <p className="mt-2 text-xs font-medium">
            <Badge variant={payment.variant}>{payment.label}</Badge>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Actualizar
          </Button>
          {receptionRequired ? (
            <Button asChild size="sm">
              <Link href={`/workshop?ticket=${ticket.id}`}>
                <ClipboardCheck className="h-4 w-4" />
                Completar recepción
              </Link>
            </Button>
          ) : next &&
            hasPermission(session, 'workorders.change_status') &&
            (next !== 'AWAITING_APPROVAL' || hasPermission(session, 'quotes.create')) ? (
            <Button size="sm" disabled={pending} onClick={() => onAdvance(next)}>
              Pasar a {statusLabels[next]}
            </Button>
          ) : null}
          {ticket.status === 'AWAITING_APPROVAL' &&
          hasPermission(session, 'quotes.record_approval') ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={approvalPending}
                onClick={() => onApproval('REJECTED')}
              >
                Rechazar
              </Button>
              <Button size="sm" disabled={approvalPending} onClick={() => onApproval('APPROVED')}>
                <CheckCircle2 className="h-4 w-4" />
                Aprobar
              </Button>
            </>
          ) : null}
          {payment.canPrepare && hasPermission(session, 'workorders.send_to_cashier') ? (
            <Button size="sm" disabled={pending} onClick={onSendToCashier}>
              <Send className="h-4 w-4" />
              Facturar en Caja
            </Button>
          ) : null}
          {ticket.salesOrder ? (
            ticket.salesOrder.invoice ? (
              <Badge variant={payment.variant}>{ticket.salesOrder.invoice.invoiceNumber}</Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Send className="h-4 w-4" />
                Consultar cobro
              </Button>
            )
          ) : null}
          {onDelete &&
          session?.role !== 'ORDER_TAKER' &&
          hasPermission(session, 'workorders.cancel') ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onDelete}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChangeOrderPanel({
  ticket,
  products,
  services,
  changeOrders,
  loading,
  pending,
  onCreate,
  onRespond,
}: {
  ticket: WorkshopTicket;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: string;
    salePrice: string;
    taxRate: string;
    trackInventory: boolean;
    stock: number;
  }>;
  services: WorkshopService[];
  changeOrders: WorkshopChangeOrder[];
  loading: boolean;
  pending: boolean;
  onCreate: (payload: {
    title: string;
    description?: string;
    lines: Array<{
      productId?: string;
      serviceId?: string;
      type: 'LABOR' | 'PART' | 'OTHER';
      description: string;
      quantity: number;
      unitPrice: number;
    }>;
  }) => Promise<void>;
  onRespond: (
    changeOrderId: string,
    status: Extract<WorkshopChangeOrderStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>,
  ) => void;
}) {
  const session = useCurrentSession();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<TicketLineForm[]>([]);
  const canCreate =
    hasPermission(session, 'quotes.create') &&
    !ticket.salesOrder &&
    (ticket.status === 'APPROVED' || ticket.status === 'IN_PROGRESS');

  function addLine() {
    setLines((current) => [
      ...current,
      {
        productId: '',
        serviceId: '',
        type: 'LABOR',
        description: '',
        quantity: '1',
        unitPrice: '',
      },
    ]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validLines = lines.filter((line) => line.description.trim());
    if (!validLines.length) {
      toast.error('Agrega al menos una línea al trabajo adicional.');
      return;
    }
    try {
      await onCreate({
        title,
        description: description.trim() || undefined,
        lines: validLines.map((line) => ({
          productId: line.productId || undefined,
          serviceId: line.serviceId || undefined,
          type: line.type,
          description: line.description,
          quantity: Number(line.quantity || 1),
          unitPrice: Number(line.unitPrice || 0),
        })),
      });
      setTitle('');
      setDescription('');
      setLines([]);
      setOpen(false);
    } catch {
      // The mutation displays the error. Keep the draft for correction and retry.
    }
  }

  return (
    <Card className="border-amber-300/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Trabajos adicionales</CardTitle>
            <CardDescription>
              Todo hallazgo fuera del presupuesto aprobado requiere una autorización independiente.
            </CardDescription>
          </div>
          {canCreate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen((current) => !current)}
            >
              <Plus className="h-4 w-4" />
              {open ? 'Cancelar' : 'Solicitar aprobación'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {open ? (
          <form
            className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3"
            onSubmit={submit}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Trabajo adicional" required>
                <Input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej.: Reemplazo de terminales de dirección"
                />
              </Field>
              <Field label="Detalle para autorización">
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Motivo del hallazgo"
                />
              </Field>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid min-w-0 gap-2 rounded-md border border-border bg-white p-2 md:grid-cols-2 xl:grid-cols-[8.5rem_1fr_1fr_5rem_7rem_auto]"
                >
                  <select
                    className="input-select"
                    value={line.type}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                type: event.target.value as TicketLineForm['type'],
                                productId: '',
                                serviceId: '',
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="LABOR">Servicio</option>
                    <option value="PART">Repuesto</option>
                    <option value="OTHER">Otro</option>
                  </select>
                  {line.type === 'PART' ? (
                    <select
                      className="input-select"
                      value={line.productId}
                      onChange={(event) => {
                        const product = products.find((item) => item.id === event.target.value);
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  productId: event.target.value,
                                  description: product?.name ?? item.description,
                                  unitPrice: product
                                    ? String(
                                        Number(product.salePrice) > 0
                                          ? product.salePrice
                                          : product.price,
                                      )
                                    : item.unitPrice,
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value="">Seleccionar repuesto</option>
                      {products
                        .filter((product) => product.trackInventory)
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                            {product.sku ? ` · ${product.sku}` : ''}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <select
                      className="input-select"
                      value={line.serviceId}
                      onChange={(event) => {
                        const service = services.find((item) => item.id === event.target.value);
                        setLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  serviceId: event.target.value,
                                  description: service?.name ?? item.description,
                                  unitPrice: service
                                    ? String(service.defaultPrice)
                                    : item.unitPrice,
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      <option value="">Seleccionar servicio</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} · {service.code}
                        </option>
                      ))}
                    </select>
                  )}
                  <Input
                    value={line.description}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, description: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Descripción"
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantity: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unitPrice: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Agregar línea
              </Button>
            </div>
            <Button disabled={pending}>
              <Send className="h-4 w-4" />
              Enviar a aprobación
            </Button>
          </form>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando autorizaciones...</p>
        ) : changeOrders.length ? (
          <div className="space-y-2">
            {changeOrders.map((changeOrder) => (
              <div key={changeOrder.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      Adicional #{changeOrder.number} · {changeOrder.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {changeOrder.lines.length} línea(s) ·{' '}
                      {formatWorkshopCurrency(changeOrder.total)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      changeOrder.status === 'APPROVED'
                        ? 'success'
                        : changeOrder.status === 'PENDING'
                          ? 'warning'
                          : 'outline'
                    }
                  >
                    {changeOrder.status === 'PENDING'
                      ? 'Pendiente'
                      : changeOrder.status === 'APPROVED'
                        ? 'Aprobado'
                        : changeOrder.status === 'REJECTED'
                          ? 'Rechazado'
                          : 'Cancelado'}
                  </Badge>
                </div>
                {changeOrder.description ? (
                  <p className="mt-2 text-xs text-muted-foreground">{changeOrder.description}</p>
                ) : null}
                {changeOrder.decision ? (
                  <AuthorizationRecord
                    decision={changeOrder.decision}
                    note={changeOrder.responseNote}
                  />
                ) : null}
                {changeOrder.status === 'PENDING' && canCreate ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || !hasPermission(session, 'quotes.record_approval')}
                      onClick={() => onRespond(changeOrder.id, 'APPROVED')}
                    >
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !hasPermission(session, 'quotes.record_approval')}
                      onClick={() => onRespond(changeOrder.id, 'REJECTED')}
                    >
                      Rechazar
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay trabajos adicionales registrados.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AuthorizationRecord({
  decision,
  note,
}: {
  decision: WorkshopAuthorizationEvidence;
  note: string | null;
}) {
  const method = {
    IN_PERSON: 'Presencial',
    PHONE: 'Teléfono',
    WHATSAPP: 'WhatsApp',
    EMAIL: 'Correo',
    DIGITAL: 'Documento digital',
  }[decision.method];
  return (
    <p className="mt-1 w-full text-xs text-muted-foreground">
      Respuesta de {decision.authorizedByName} · {method}
      {decision.recordedAt ? ` · ${new Date(decision.recordedAt).toLocaleString('es-DO')}` : ''}
      {note ? <span className="mt-1 block">{note}</span> : null}
    </p>
  );
}

function TicketEditor({
  ticket,
  stage,
  workspace = false,
  formId,
  mechanics,
  products,
  services,
  partsLoading = false,
  servicesLoading = false,
  pending,
  onClose,
  onSubmit,
  onCreateTask,
  onUpdateTask,
}: {
  ticket: WorkshopTicket;
  stage?: WorkOrderStage;
  workspace?: boolean;
  formId?: string;
  mechanics: Array<{ id: string; user: { name: string } }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: string;
    salePrice: string;
    taxRate: string;
    trackInventory: boolean;
    stock: number;
  }>;
  services: WorkshopService[];
  partsLoading?: boolean;
  servicesLoading?: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    payload: {
      diagnosis?: string;
      customerNotes?: string;
      promisedAt?: string;
      mechanicIds?: string[];
      lines?: Array<{
        productId?: string;
        serviceId?: string;
        vehicleAreaId?: string;
        type: 'LABOR' | 'PART' | 'OTHER';
        description: string;
        quantity: number;
        unitPrice: number;
      }>;
      areaFindings?: Array<{
        areaId: string;
        areaLabel: string;
        view: 'front' | 'back' | 'left' | 'right' | 'top';
        condition: 'OK' | 'ATTENTION' | 'REPAIR';
        finding?: string;
        notes?: string;
      }>;
    },
    intent?: 'SAVE' | 'REQUEST_APPROVAL',
  ) => void | Promise<void>;
  onCreateTask: (payload: WorkshopTaskInput) => Promise<unknown>;
  onUpdateTask: (taskId: string, payload: WorkshopTaskUpdate) => Promise<unknown>;
}) {
  const session = useCurrentSession();
  const canEdit = hasPermission(session, 'workorders.edit');
  const canDiagnose = hasPermission(session, 'workorders.diagnose');
  const canAssign = hasPermission(session, 'workorders.assign');
  const canQuote = hasPermission(session, 'quotes.create');
  const canManage = canEdit || canDiagnose || canAssign || canQuote;
  const readOnly = !canManage || ['DELIVERED', 'CANCELLED'].includes(ticket.status);
  const budgetLocked =
    !canQuote ||
    Boolean(ticket.salesOrder) ||
    ['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus);
  const showDiagnosis = !stage || stage === 'DIAGNOSIS';
  const showQuote = !stage || stage === 'QUOTE';
  const showTasks = !stage || stage === 'DIAGNOSIS';
  const [form, setForm] = useState({
    diagnosis: ticket.diagnosis ?? '',
    customerNotes: ticket.customerNotes ?? '',
    promisedAt: ticket.promisedAt ? ticket.promisedAt.slice(0, 16) : '',
    mechanicIds: ticket.assignments.map((assignment) => assignment.employee.id),
  });
  const [lines, setLines] = useState<TicketLineForm[]>(
    ticket.lines.map((line) => ({
      productId: line.productId ?? '',
      serviceId: line.serviceId ?? '',
      type: line.type,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      vehicleAreaId: line.vehicleAreaId ?? undefined,
    })),
  );
  const [areaFindings, setAreaFindings] = useState<WorkshopVehicleAreaFinding[]>(
    ticket.areaFindings ?? [],
  );
  const [activeCatalogAreaId, setActiveCatalogAreaId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogDialog, setCatalogDialog] = useState<'PART' | 'SERVICE' | null>(null);
  const addPart = (product: (typeof products)[number], vehicleAreaId?: string | null) => {
    setLines((current) => [
      ...current,
      {
        productId: product.id,
        serviceId: '',
        type: 'PART',
        description: product.name,
        quantity: '1',
        unitPrice: String(Number(product.salePrice) > 0 ? product.salePrice : product.price),
        taxRate: product.taxRate,
        vehicleAreaId: vehicleAreaId ?? activeCatalogAreaId ?? undefined,
      },
    ]);
    setActiveCatalogAreaId(null);
  };
  const addService = (service: WorkshopService, vehicleAreaId?: string | null) => {
    setLines((current) => [
      ...current,
      {
        productId: '',
        serviceId: service.id,
        type: 'LABOR',
        description: service.name,
        quantity: '1',
        unitPrice: String(service.defaultPrice),
        taxRate: service.taxRate,
        vehicleAreaId: vehicleAreaId ?? activeCatalogAreaId ?? undefined,
      },
    ]);
    setActiveCatalogAreaId(null);
  };
  const draftSubtotal = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0,
  );
  const currentTaxes = lines.reduce((sum, line) => {
    const lineSubtotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    const catalogTaxRate = line.productId
      ? products.find((product) => product.id === line.productId)?.taxRate
      : services.find((service) => service.id === line.serviceId)?.taxRate;
    const taxRate = Number(line.taxRate ?? catalogTaxRate ?? 0.18);
    return sum + lineSubtotal * (Number.isFinite(taxRate) ? taxRate : 0);
  }, 0);
  const currentTotal = draftSubtotal + currentTaxes;
  const selectedMechanic = mechanics.find((mechanic) => mechanic.id === form.mechanicIds[0]);

  return (
    <Card className={workspace ? 'border-border shadow-sm' : 'border-slate-400 shadow-md'}>
      {!workspace ? (
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Actualizar {ticket.ticketNumber}</CardTitle>
              <CardDescription>
                {ticket.customer.name} · {ticket.vehicle.make} {ticket.vehicle.model}
              </CardDescription>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="space-y-4">
        {workspace ? (
          <div className="flex items-start gap-3 border-b pb-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {stage === 'QUOTE' ? (
                <FileText className="h-4 w-4" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
            </span>
            <div>
              <h3 className="font-semibold">{stage === 'QUOTE' ? 'Cotización' : 'Diagnóstico'}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stage === 'QUOTE'
                  ? 'Organiza los servicios y repuestos antes de solicitar aprobación.'
                  : 'Registra los hallazgos iniciales y prepara la cotización.'}
              </p>
            </div>
          </div>
        ) : null}
        <form
          id={formId}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (readOnly) return;
            const submitter = (event.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            const intent = submitter?.value === 'REQUEST_APPROVAL' ? 'REQUEST_APPROVAL' : 'SAVE';
            const validLines = lines.filter((line) => line.description.trim());
            if (intent === 'REQUEST_APPROVAL' && !validLines.length) {
              toast.error('Agrega al menos un servicio o repuesto a la cotización.');
              return;
            }
            void onSubmit(
              {
                diagnosis: canDiagnose ? form.diagnosis || undefined : undefined,
                customerNotes: canEdit ? form.customerNotes || undefined : undefined,
                promisedAt: canEdit ? form.promisedAt || undefined : undefined,
                mechanicIds: canAssign ? form.mechanicIds : undefined,
                lines: budgetLocked
                  ? undefined
                  : validLines.map((line) => ({
                      productId: line.productId || undefined,
                      serviceId: line.serviceId || undefined,
                      type: line.type,
                      description: line.description,
                      quantity: Number(line.quantity || 1),
                      unitPrice: Number(line.unitPrice || 0),
                      vehicleAreaId: line.vehicleAreaId || undefined,
                    })),
                areaFindings: budgetLocked
                  ? undefined
                  : areaFindings.map((finding) => ({
                      areaId: finding.areaId,
                      areaLabel: finding.areaLabel,
                      view: finding.view,
                      condition: finding.condition,
                      finding: finding.finding || undefined,
                      notes: finding.notes || undefined,
                    })),
              },
              intent,
            );
          }}
        >
          <fieldset disabled={pending || readOnly} className="min-w-0 space-y-4">
            {showDiagnosis ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Fecha prometida">
                    <Input
                      type="datetime-local"
                      disabled={!canEdit}
                      value={form.promisedAt}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, promisedAt: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Diagnóstico">
                  <textarea
                    className="input-textarea"
                    disabled={!canDiagnose}
                    value={form.diagnosis}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, diagnosis: event.target.value }))
                    }
                    placeholder="Hallazgos y trabajo recomendado"
                  />
                </Field>
                <div className="grid items-end gap-4 md:grid-cols-2">
                  <Field label="Mecánico asignado">
                    <select
                      className="input-select"
                      disabled={!canAssign}
                      value={form.mechanicIds[0] ?? ''}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          mechanicIds: event.target.value ? [event.target.value] : [],
                        }))
                      }
                    >
                      <option value="">Sin asignar</option>
                      {mechanics.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id}>
                          {mechanic.user.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex min-h-10 items-center gap-3 rounded-md px-1">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                      {selectedMechanic ? initials(selectedMechanic.user.name) : '—'}
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {selectedMechanic?.user.name ?? 'Sin mecánico'}
                      </p>
                      <p className="text-xs text-muted-foreground">Mecánico</p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {showQuote ? (
              <div className="space-y-4">
                <section className="rounded-lg border bg-slate-50/70 p-3">
                  <Field label="Notas del cliente">
                    <textarea
                      className="input-textarea min-h-20 bg-white"
                      disabled={!canEdit}
                      value={form.customerNotes}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, customerNotes: event.target.value }))
                      }
                      placeholder="Preferencias, autorizaciones o comentarios comunicados por el cliente"
                    />
                  </Field>
                </section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Presupuesto: repuestos y servicios</p>
                    {ticket.quoteVersions[0] ? (
                      <p className="text-xs text-muted-foreground">
                        Versión {ticket.quoteVersions[0].version} ·{' '}
                        {ticket.status === 'DIAGNOSIS' && ticket.approvalStatus === 'NOT_REQUESTED'
                          ? 'Preparando nueva versión'
                          : ticket.quoteVersions[0].status === 'PENDING'
                            ? 'Pendiente de respuesta'
                            : 'Respuesta registrada'}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={cartOpen ? 'default' : 'outline'}
                    onClick={() => setCartOpen((current) => !current)}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Carrito
                    <Badge
                      variant="outline"
                      className={
                        cartOpen ? 'border-white/30 bg-white/15 text-white' : 'bg-slate-50'
                      }
                    >
                      {lines.length}
                    </Badge>
                    <span className="font-semibold">{formatWorkshopCurrency(currentTotal)}</span>
                  </Button>
                </div>
                {ticket.salesOrder ||
                ticket.approvalStatus === 'APPROVED' ||
                ticket.approvalStatus === 'PARTIALLY_APPROVED' ? (
                  <p className="mb-2 text-xs text-muted-foreground">
                    El presupuesto aprobado se mantiene congelado. Para cambiarlo se requerirá una
                    revisión.
                  </p>
                ) : null}
                {cartOpen ? (
                  <section className="overflow-hidden rounded-xl border border-slate-300 bg-slate-50/60 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
                          <ShoppingCart className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">Carrito de la cotización</p>
                          <p className="text-xs text-muted-foreground">
                            {lines.length} partida(s) agregada(s)
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCartOpen(false)}
                      >
                        <X className="h-4 w-4" /> Cerrar carrito
                      </Button>
                    </div>
                    <div className="p-3">
                      {budgetLocked ? (
                        <div className="overflow-x-auto rounded-xl border bg-white">
                          <div className="grid min-w-[860px] grid-cols-[8rem_minmax(15rem,1fr)_5rem_7rem_7rem_8rem] gap-3 border-b bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <span>Tipo</span>
                            <span>Descripción</span>
                            <span className="text-right">Cant.</span>
                            <span className="text-right">Precio</span>
                            <span className="text-right">ITBIS</span>
                            <span className="text-right">Estado</span>
                          </div>
                          {ticket.lines.map((line) => {
                            const subtotal = Number(line.quantity) * Number(line.unitPrice);
                            const tax = subtotal * Number(line.taxRate);
                            return (
                              <div
                                key={line.id}
                                className="grid min-w-[860px] grid-cols-[8rem_minmax(15rem,1fr)_5rem_7rem_7rem_8rem] items-center gap-3 border-b px-3 py-3 text-sm last:border-b-0"
                              >
                                <Badge variant="outline" className="w-fit">
                                  {line.type === 'PART'
                                    ? 'Repuesto'
                                    : line.type === 'LABOR'
                                      ? 'Servicio'
                                      : 'Otro'}
                                </Badge>
                                <span className="font-medium text-slate-900">
                                  {line.description}
                                  {line.vehicleAreaId ? (
                                    <span className="mt-1 block text-xs font-normal text-blue-700">
                                      {VEHICLE_AREA_LABELS[line.vehicleAreaId] ??
                                        line.vehicleAreaId}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="text-right tabular-nums">
                                  {Number(line.quantity)}
                                </span>
                                <span className="text-right tabular-nums">
                                  {formatWorkshopCurrency(line.unitPrice)}
                                </span>
                                <span className="text-right tabular-nums">
                                  {formatWorkshopCurrency(tax)}
                                </span>
                                <Badge
                                  className="ml-auto w-fit"
                                  variant={
                                    line.approvalStatus === 'APPROVED'
                                      ? 'success'
                                      : line.approvalStatus === 'REJECTED'
                                        ? 'danger'
                                        : 'outline'
                                  }
                                >
                                  {line.approvalStatus === 'APPROVED'
                                    ? 'Autorizado'
                                    : line.approvalStatus === 'REJECTED'
                                      ? 'Rechazado'
                                      : 'Pendiente'}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      ) : lines.length ? (
                        <div className="overflow-x-auto rounded-xl border bg-white">
                          <div className="grid min-w-[920px] grid-cols-[8rem_minmax(22rem,1fr)_5rem_7rem_7rem_8rem] gap-2 border-b bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <span>Tipo</span>
                            <span>Descripción</span>
                            <span className="text-right">Cant.</span>
                            <span className="text-right">Precio</span>
                            <span className="text-right">ITBIS</span>
                            <span className="text-right">Estado</span>
                          </div>
                          {lines.map((line, index) => {
                            const subtotal =
                              Number(line.quantity || 0) * Number(line.unitPrice || 0);
                            const tax = subtotal * Number(line.taxRate ?? 0.18);
                            return (
                              <div
                                key={index}
                                className="grid min-w-[920px] grid-cols-[8rem_minmax(22rem,1fr)_5rem_7rem_7rem_8rem] items-center gap-2 border-b px-3 py-3 last:border-b-0"
                              >
                                <select
                                  value={line.type}
                                  onChange={(event) =>
                                    setLines((current) =>
                                      current.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? {
                                              ...entry,
                                              type: event.target.value as TicketLineForm['type'],
                                              productId: '',
                                              serviceId: '',
                                            }
                                          : entry,
                                      ),
                                    )
                                  }
                                  className="input-select"
                                >
                                  <option value="LABOR">Servicio</option>
                                  <option value="PART">Repuesto</option>
                                  <option value="OTHER">Otro</option>
                                </select>
                                <div className="space-y-1.5">
                                  {line.type === 'PART' ? (
                                    <select
                                      value={line.productId}
                                      onChange={(event) => {
                                        const product = products.find(
                                          (candidate) => candidate.id === event.target.value,
                                        );
                                        setLines((current) =>
                                          current.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                  ...entry,
                                                  productId: event.target.value,
                                                  serviceId: '',
                                                  description: product?.name ?? entry.description,
                                                  unitPrice: product
                                                    ? String(
                                                        Number(product.salePrice) > 0
                                                          ? product.salePrice
                                                          : product.price,
                                                      )
                                                    : entry.unitPrice,
                                                  taxRate: product?.taxRate ?? entry.taxRate,
                                                }
                                              : entry,
                                          ),
                                        );
                                      }}
                                      className="input-select"
                                    >
                                      <option value="">Seleccionar repuesto</option>
                                      {products
                                        .filter((product) => product.trackInventory)
                                        .map((product) => (
                                          <option key={product.id} value={product.id}>
                                            {product.name}
                                            {product.sku ? ` · ${product.sku}` : ''}
                                          </option>
                                        ))}
                                    </select>
                                  ) : (
                                    <select
                                      value={line.serviceId}
                                      onChange={(event) => {
                                        const service = services.find(
                                          (candidate) => candidate.id === event.target.value,
                                        );
                                        setLines((current) =>
                                          current.map((entry, entryIndex) =>
                                            entryIndex === index
                                              ? {
                                                  ...entry,
                                                  productId: '',
                                                  serviceId: event.target.value,
                                                  description: service?.name ?? entry.description,
                                                  unitPrice: service
                                                    ? String(service.defaultPrice)
                                                    : entry.unitPrice,
                                                  taxRate: service?.taxRate ?? entry.taxRate,
                                                }
                                              : entry,
                                          ),
                                        );
                                      }}
                                      className="input-select"
                                    >
                                      <option value="">Seleccionar servicio</option>
                                      {services.map((service) => (
                                        <option key={service.id} value={service.id}>
                                          {service.name} · {service.code}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <Input
                                    value={line.description}
                                    onChange={(event) =>
                                      setLines((current) =>
                                        current.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, description: event.target.value }
                                            : entry,
                                        ),
                                      )
                                    }
                                    placeholder="Descripción"
                                  />
                                  <select
                                    className="input-select h-8 text-xs"
                                    aria-label="Zona del vehículo relacionada"
                                    value={line.vehicleAreaId ?? ''}
                                    onChange={(event) =>
                                      setLines((current) =>
                                        current.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? {
                                                ...entry,
                                                vehicleAreaId: event.target.value || undefined,
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">Sin zona relacionada</option>
                                    {areaFindings.map((finding) => (
                                      <option key={finding.areaId} value={finding.areaId}>
                                        {finding.areaLabel}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <Input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(event) =>
                                    setLines((current) =>
                                      current.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, quantity: event.target.value }
                                          : entry,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(event) =>
                                    setLines((current) =>
                                      current.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, unitPrice: event.target.value }
                                          : entry,
                                      ),
                                    )
                                  }
                                />
                                <span className="text-right text-sm font-medium tabular-nums text-slate-700">
                                  {formatWorkshopCurrency(tax)}
                                </span>
                                <div className="flex items-center justify-end gap-1.5">
                                  <Badge variant="outline">Borrador</Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Quitar línea"
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                    disabled={budgetLocked}
                                    onClick={() =>
                                      setLines((current) =>
                                        current.filter((_, entryIndex) => entryIndex !== index),
                                      )
                                    }
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                          Agrega los servicios y repuestos diagnosticados antes de solicitar la
                          aprobación.
                        </p>
                      )}
                      <dl className="ml-auto mt-4 w-full max-w-sm overflow-hidden rounded-xl border bg-white text-sm shadow-sm">
                        <div className="flex justify-between gap-4 px-4 py-3">
                          <dt className="text-muted-foreground">Subtotal sin ITBIS</dt>
                          <dd className="font-semibold tabular-nums">
                            {formatWorkshopCurrency(draftSubtotal)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t px-4 py-3">
                          <dt className="text-muted-foreground">ITBIS</dt>
                          <dd className="font-semibold tabular-nums text-blue-700">
                            {formatWorkshopCurrency(currentTaxes)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t bg-slate-50 px-4 py-3.5 text-base">
                          <dt className="font-semibold">Total</dt>
                          <dd className="text-lg font-bold tabular-nums">
                            {formatWorkshopCurrency(currentTotal)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-left transition hover:border-slate-500 hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-800 shadow-sm ring-1 ring-slate-200">
                        <ShoppingCart className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-sm">Resumen del carrito</strong>
                        <span className="block truncate text-xs text-muted-foreground">
                          {lines.length
                            ? `${lines.length} partida(s) · Pulsa para revisar o editar`
                            : 'Todavía no has agregado repuestos ni servicios'}
                        </span>
                      </span>
                    </span>
                    <strong className="shrink-0 text-sm tabular-nums">
                      {formatWorkshopCurrency(currentTotal)}
                    </strong>
                  </button>
                )}
                <VehicleDamageMap
                  vehicleType={ticket.vehicle.vehicleType}
                  findings={areaFindings}
                  lines={lines}
                  readOnly={budgetLocked}
                  parts={products.filter((product) => product.trackInventory)}
                  services={services}
                  catalogLoading={partsLoading || servicesLoading}
                  onChange={setAreaFindings}
                  onAddPart={(areaId, productId) => {
                    const product = products.find((item) => item.id === productId);
                    if (product) addPart(product, areaId);
                  }}
                  onAddService={(areaId, serviceId) => {
                    const service = services.find((item) => item.id === serviceId);
                    if (service) addService(service, areaId);
                  }}
                  onCreatePart={
                    hasPermission(session, 'products.manage')
                      ? (areaId) => {
                          setActiveCatalogAreaId(areaId);
                          setCatalogDialog('PART');
                        }
                      : undefined
                  }
                  onCreateService={
                    hasPermission(session, 'services.manage')
                      ? (areaId) => {
                          setActiveCatalogAreaId(areaId);
                          setCatalogDialog('SERVICE');
                        }
                      : undefined
                  }
                  onResetArea={(areaId) =>
                    setLines((current) =>
                      current.map((line) =>
                        line.vehicleAreaId === areaId
                          ? { ...line, vehicleAreaId: undefined }
                          : line,
                      ),
                    )
                  }
                />
              </div>
            ) : null}
          </fieldset>
          {canManage && !workspace ? (
            <Button disabled={pending || readOnly}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar cambios
            </Button>
          ) : null}
        </form>
        {showTasks ? (
          <WorkshopTasksPanel
            ticket={ticket}
            mechanics={mechanics}
            mode={stage === 'DIAGNOSIS' ? 'diagnosis' : 'standard'}
            pending={pending}
            onCreate={onCreateTask}
            onUpdate={onUpdateTask}
          />
        ) : null}
      </CardContent>
      {catalogDialog ? (
        <CatalogItemDialog
          kind={catalogDialog}
          onClose={() => setCatalogDialog(null)}
          onCreated={(item) => {
            if (catalogDialog === 'PART') addPart(item as Product);
            else addService(item as WorkshopService);
            setCatalogDialog(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function CatalogItemDialog({
  kind,
  onClose,
  onCreated,
}: {
  kind: 'PART' | 'SERVICE';
  onClose: () => void;
  onCreated: (item: Product | WorkshopService) => void;
}) {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    name: '',
    sku: '',
    category: '',
    price: '',
    cost: '',
    stock: '0',
    minStock: '0',
    taxRate: '0.18',
    description: '',
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Sesión requerida.');
      if (kind === 'PART') {
        return createProduct(session.tenantId, session.accessToken, {
          name: form.name.trim(),
          sku: form.sku.trim() || undefined,
          description: form.description.trim() || undefined,
          unit: 'UNIT',
          price: Number(form.price),
          cost: form.cost ? Number(form.cost) : undefined,
          taxRate: Number(form.taxRate),
          taxCategory: Number(form.taxRate) === 0 ? 'EXEMPT' : 'ITBIS_18',
          trackInventory: true,
          stock: Number(form.stock),
          minStock: Number(form.minStock),
          status: 'ACTIVE',
        });
      }
      return createWorkshopService(session.tenantId, session.accessToken, {
        code: form.code.trim(),
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        description: form.description.trim() || undefined,
        defaultPrice: Number(form.price),
        taxRate: Number(form.taxRate),
        active: true,
      });
    },
    onSuccess: async (item) => {
      toast.success(kind === 'PART' ? 'Repuesto creado' : 'Servicio creado');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-services'] }),
      ]);
      onCreated(item);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el registro.'),
  });

  return createPortal(
    <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/55 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={kind === 'PART' ? 'Nuevo repuesto' : 'Nuevo servicio'}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {kind === 'PART' ? 'Inventario' : 'Catálogo de servicios'}
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {kind === 'PART' ? 'Nuevo repuesto' : 'Nuevo servicio'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {kind === 'PART'
                ? 'El repuesto controla existencia y se identifica por nombre o SKU.'
                : 'El servicio representa mano de obra y no descuenta inventario.'}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'SERVICE' ? (
              <Field label="Código" required>
                <Input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="SRV-001"
                />
              </Field>
            ) : (
              <Field label="SKU">
                <Input
                  value={form.sku}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sku: event.target.value }))
                  }
                  placeholder="REP-001"
                />
              </Field>
            )}
            <Field label="Nombre" required>
              <Input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            {kind === 'SERVICE' ? (
              <Field label="Categoría">
                <Input
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="Mantenimiento"
                />
              </Field>
            ) : (
              <Field label="Costo">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, cost: event.target.value }))
                  }
                />
              </Field>
            )}
            <Field label={kind === 'PART' ? 'Precio de venta' : 'Precio del servicio'} required>
              <Input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({ ...current, price: event.target.value }))
                }
              />
            </Field>
            {kind === 'PART' ? (
              <>
                <Field label="Existencia inicial" required>
                  <Input
                    required
                    disabled={!hasPermission(session, 'inventory.adjust')}
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, stock: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Stock mínimo" required>
                  <Input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={form.minStock}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, minStock: event.target.value }))
                    }
                  />
                </Field>
              </>
            ) : null}
            <Field label="ITBIS">
              <select
                className="input-select"
                value={form.taxRate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, taxRate: event.target.value }))
                }
              >
                <option value="0.18">18%</option>
                <option value="0">Exento</option>
              </select>
            </Field>
          </div>
          <Field label="Descripción">
            <textarea
              className="input-textarea min-h-20"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
          <footer className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar y agregar
            </Button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </Label>
      {children}
    </div>
  );
}
