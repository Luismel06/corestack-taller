'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hasPermission } from '@/lib/authorization';
import { cn } from '@/lib/utils';
import {
  convertWorkshopAppointmentToReception,
  createWorkshopAppointment,
  getCustomers,
  getWorkshopAppointments,
  getWorkshopMechanics,
  getWorkshopTickets,
  getWorkshopVehicles,
  updateWorkshopAppointment,
  type WorkshopAppointment,
  type WorkshopAppointmentPayload,
  type WorkshopAppointmentStatus,
  type WorkshopMechanic,
  type WorkshopTicket,
} from '@/lib/api';
import { SessionRequired, useCurrentSession } from './session-required';
import { QuickCustomerDialog, QuickVehicleDialog } from './workshop-quick-create-dialogs';
import { VehicleIllustration } from './vehicle-illustration';
import { WorkshopOrderDrawer } from './workshop-order-drawer';

const statusLabel: Record<WorkshopAppointmentStatus, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  ARRIVED: 'Cliente llegó',
  NO_SHOW: 'No asistió',
  CANCELLED: 'Cancelada',
  CONVERTED_TO_RECEPTION: 'Recibida',
};

function localDateTime(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function getAppointmentRange(date: string, view: CalendarView) {
  const anchor = new Date(`${date}T12:00:00`);
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (view === 'WEEK') {
    const mondayOffset = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - mondayOffset);
    end.setDate(start.getDate() + 6);
  } else if (view === 'MONTH') {
    start.setDate(1);
    end.setMonth(anchor.getMonth() + 1, 0);
  }
  return {
    from: `${localDateTime(start).slice(0, 10)}T00:00:00`,
    to: `${localDateTime(end).slice(0, 10)}T23:59:59.999`,
  };
}

function adminDateLabel(date: string, view: CalendarView) {
  const selected = new Date(`${date}T12:00:00`);
  const today = date === localDateTime().slice(0, 10);
  if (view === 'MONTH')
    return selected.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  if (view === 'WEEK') {
    const range = getAppointmentRange(date, view);
    const start = new Date(range.from);
    const end = new Date(range.to);
    return `${start.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const label = selected.toLocaleDateString('es-DO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${today ? 'Hoy, ' : ''}${label}`;
}

function appointmentTime(value: string) {
  return new Date(value).toLocaleTimeString('es-DO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function appointmentTimeParts(value: string) {
  const [date = '', time = '00:00'] = value.split('T');
  const [hourValue = '0', minute = '00'] = time.split(':');
  const hour24 = Number(hourValue);

  return {
    date,
    hour: String(hour24 % 12 || 12).padStart(2, '0'),
    minute,
    period: hour24 >= 12 ? 'PM' : 'AM',
  } as const;
}

function updateAppointmentTime(
  value: string,
  changes: Partial<{ date: string; hour: string; minute: string; period: 'AM' | 'PM' }>,
) {
  const current = appointmentTimeParts(value);
  const next = { ...current, ...changes };
  const hour12 = Number(next.hour);
  const hour24 = (hour12 % 12) + (next.period === 'PM' ? 12 : 0);
  return `${next.date}T${String(hour24).padStart(2, '0')}:${next.minute}`;
}

function AppointmentDateTimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parts = appointmentTimeParts(value);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Input
        required
        type="date"
        className="h-11 min-w-0 basis-40 flex-1 px-3"
        aria-label="Fecha de la cita"
        value={parts.date}
        onChange={(event) => onChange(updateAppointmentTime(value, { date: event.target.value }))}
      />
      <div className="grid min-w-0 flex-1 basis-56 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.35fr)] items-center gap-2">
        <select
          aria-label="Hora"
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
          value={parts.hour}
          onChange={(event) => onChange(updateAppointmentTime(value, { hour: event.target.value }))}
        >
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map(
            (hour) => (
              <option key={hour} value={hour}>
                {hour}
              </option>
            ),
          )}
        </select>
        <span className="font-semibold text-slate-500">:</span>
        <select
          aria-label="Minutos"
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
          value={parts.minute}
          onChange={(event) =>
            onChange(updateAppointmentTime(value, { minute: event.target.value }))
          }
        >
          {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map(
            (minute) => (
              <option key={minute} value={minute}>
                {minute}
              </option>
            ),
          )}
        </select>
        <select
          aria-label="Período"
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm font-semibold"
          value={parts.period}
          onChange={(event) =>
            onChange(updateAppointmentTime(value, { period: event.target.value as 'AM' | 'PM' }))
          }
        >
          <option value="AM">a. m.</option>
          <option value="PM">p. m.</option>
        </select>
      </div>
    </div>
  );
}

const emptyForm = () => ({
  customerId: '',
  vehicleId: '',
  mechanicId: '',
  startsAt: localDateTime(),
  reason: '',
  notes: '',
});

type TabletFilter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'IN_WORKSHOP' | 'READY';
type CalendarView = 'DAY' | 'WEEK' | 'MONTH';

export function WorkshopAgendaView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkshopAppointmentStatus | 'ALL'>('ALL');
  const [date, setDate] = useState(() => localDateTime().slice(0, 10));
  const [calendarView, setCalendarView] = useState<CalendarView>('DAY');
  const [mechanicFilter, setMechanicFilter] = useState('ALL');
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<WorkshopTicket | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<WorkshopAppointment | null>(null);
  const [tabletFilter, setTabletFilter] = useState<TabletFilter>('ALL');
  const [editing, setEditing] = useState<WorkshopAppointment | null>(null);
  const [form, setForm] = useState(emptyForm);

  const tabletMode = session?.role === 'ORDER_TAKER';
  const appointmentRange = useMemo(
    () => getAppointmentRange(date, tabletMode ? 'DAY' : calendarView),
    [calendarView, date, tabletMode],
  );
  const appointmentsQuery = useQuery({
    queryKey: [
      'workshop-appointments',
      session?.tenantId,
      appointmentRange.from,
      appointmentRange.to,
    ],
    queryFn: () =>
      getWorkshopAppointments(session!.tenantId, session!.accessToken, {
        from: appointmentRange.from,
        to: appointmentRange.to,
      }),
    enabled: Boolean(session),
  });
  const customersQuery = useQuery({
    queryKey: ['customers', session?.tenantId],
    queryFn: () => getCustomers(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const vehiclesQuery = useQuery({
    queryKey: ['workshop-vehicles', session?.tenantId],
    queryFn: () => getWorkshopVehicles(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const mechanicsQuery = useQuery({
    queryKey: ['workshop-mechanics', session?.tenantId],
    queryFn: () => getWorkshopMechanics(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });
  const ticketsQuery = useQuery({
    queryKey: ['workshop-tickets', session?.tenantId],
    queryFn: () => getWorkshopTickets(session!.tenantId, session!.accessToken),
    enabled: Boolean(session && hasPermission(session, 'workorders.view')),
    refetchInterval: 20_000,
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['workshop-appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['workshop-overview'] });
    await queryClient.invalidateQueries({ queryKey: ['workshop-tickets'] });
  };
  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopAppointmentPayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return editing
        ? updateWorkshopAppointment(session.tenantId, session.accessToken, editing.id, payload)
        : createWorkshopAppointment(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Cita actualizada' : 'Cita programada');
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm());
      await invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la cita.'),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: WorkshopAppointmentStatus }) => {
      if (!session) throw new Error('Sesión requerida.');
      return updateWorkshopAppointment(session.tenantId, session.accessToken, id, { status: next });
    },
    onSuccess: invalidate,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la cita.'),
  });
  const receiveMutation = useMutation({
    mutationFn: (id: string) => {
      if (!session) throw new Error('Sesión requerida.');
      return convertWorkshopAppointmentToReception(session.tenantId, session.accessToken, id);
    },
    onSuccess: async (ticket) => {
      toast.success(`${ticket.ticketNumber} abierta correctamente`);
      await invalidate();
      setSelectedTicket(ticket);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo recibir el vehículo.'),
  });

  const visibleVehicles = useMemo(
    () => (vehiclesQuery.data ?? []).filter((vehicle) => vehicle.customerId === form.customerId),
    [form.customerId, vehiclesQuery.data],
  );
  const visibleAppointments = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (appointmentsQuery.data ?? []).filter((appointment) => {
      const matchesSearch = [
        appointment.customer.name,
        appointment.customer.phone,
        appointment.vehicle.licensePlate,
        appointment.vehicle.make,
        appointment.vehicle.model,
        appointment.reason,
        appointment.mechanic?.user.name,
      ]
        .filter(Boolean)
        .some((value) => !normalized || value!.toLowerCase().includes(normalized));
      const matchesMechanic = mechanicFilter === 'ALL' || appointment.mechanicId === mechanicFilter;
      const matchesStatus = status === 'ALL' || appointment.status === status;
      return matchesSearch && matchesMechanic && matchesStatus;
    });
  }, [appointmentsQuery.data, mechanicFilter, search, status]);
  const activeTickets = useMemo(
    () =>
      (ticketsQuery.data ?? []).filter(
        (ticket) => !['DELIVERED', 'CANCELLED'].includes(ticket.status),
      ),
    [ticketsQuery.data],
  );
  const tabletAppointments = useMemo(() => {
    if (tabletFilter === 'PENDING')
      return visibleAppointments.filter((appointment) =>
        ['SCHEDULED', 'ARRIVED'].includes(appointment.status),
      );
    if (tabletFilter === 'CONFIRMED')
      return visibleAppointments.filter((appointment) => appointment.status === 'CONFIRMED');
    return visibleAppointments;
  }, [tabletFilter, visibleAppointments]);
  const visibleActiveTickets = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const matching = activeTickets.filter((ticket) =>
      [
        ticket.ticketNumber,
        ticket.customer.name,
        ticket.customer.phone,
        ticket.vehicle.licensePlate,
        ticket.vehicle.make,
        ticket.vehicle.model,
        ticket.complaint,
        ticket.assignments[0]?.employee.user.name,
      ]
        .filter(Boolean)
        .some((value) => !normalized || value!.toLowerCase().includes(normalized)),
    );
    if (tabletFilter === 'READY')
      return matching.filter((ticket) => ticket.status === 'READY_FOR_DELIVERY');
    if (tabletFilter === 'IN_WORKSHOP')
      return matching.filter((ticket) => ticket.status !== 'READY_FOR_DELIVERY');
    return matching;
  }, [activeTickets, search, tabletFilter]);

  if (!session) return <SessionRequired session={session} />;

  const selectedCustomer =
    (customersQuery.data ?? []).find((customer) => customer.id === form.customerId) ?? null;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(appointment: WorkshopAppointment) {
    setEditing(appointment);
    setForm({
      customerId: appointment.customerId,
      vehicleId: appointment.vehicleId,
      mechanicId: appointment.mechanicId ?? '',
      startsAt: localDateTime(new Date(appointment.startsAt)),
      reason: appointment.reason,
      notes: appointment.notes ?? '',
    });
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({
      customerId: form.customerId,
      vehicleId: form.vehicleId,
      mechanicId: form.mechanicId || undefined,
      startsAt: new Date(form.startsAt).toISOString(),
      reason: form.reason,
      notes: form.notes || undefined,
    });
  }

  function changeDate(days: number) {
    setDate((current) => {
      const next = new Date(`${current}T12:00:00`);
      next.setDate(next.getDate() + days);
      return localDateTime(next).slice(0, 10);
    });
  }

  function changePeriod(direction: -1 | 1) {
    setDate((current) => {
      const next = new Date(`${current}T12:00:00`);
      if (calendarView === 'MONTH') next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * (calendarView === 'WEEK' ? 7 : 1));
      return localDateTime(next).slice(0, 10);
    });
  }

  return (
    <div className={cn('space-y-5', tabletMode && 'workshop-tablet')}>
      {session.role === 'ORDER_TAKER' ? (
        <div className="flex justify-end">
          <Button asChild variant="outline" className="h-11">
            <Link href="/workshop">
              <Clock3 className="h-4 w-4" />
              Historial de órdenes
            </Link>
          </Button>
        </div>
      ) : null}
      {tabletMode ? (
        <TabletWorkstation
          title="Toma de órdenes"
          description="Agenda y recepción del taller en un solo lugar."
          date={date}
          search={search}
          filter={tabletFilter}
          appointments={tabletAppointments}
          allAppointments={appointmentsQuery.data ?? []}
          tickets={visibleActiveTickets}
          allTickets={activeTickets}
          loading={appointmentsQuery.isLoading || ticketsQuery.isLoading}
          pending={statusMutation.isPending || receiveMutation.isPending}
          onPreviousDay={() => changeDate(-1)}
          onNextDay={() => changeDate(1)}
          onToday={() => setDate(localDateTime().slice(0, 10))}
          onCreate={openCreate}
          onSearch={setSearch}
          onFilter={setTabletFilter}
          onSelectAppointment={setSelectedAppointment}
          onSelectTicket={setSelectedTicket}
          onStatus={(appointment, next) => statusMutation.mutate({ id: appointment.id, next })}
          onReceive={(appointment) => receiveMutation.mutate(appointment.id)}
        />
      ) : (
        <AdminOrderDesk
          date={date}
          view={calendarView}
          search={search}
          status={status}
          mechanicFilter={mechanicFilter}
          advancedFiltersOpen={advancedFiltersOpen}
          appointments={visibleAppointments}
          allAppointments={appointmentsQuery.data ?? []}
          tickets={activeTickets}
          mechanics={mechanicsQuery.data ?? []}
          loading={appointmentsQuery.isLoading || ticketsQuery.isLoading}
          pending={statusMutation.isPending || receiveMutation.isPending}
          onPrevious={() => changePeriod(-1)}
          onNext={() => changePeriod(1)}
          onToday={() => setDate(localDateTime().slice(0, 10))}
          onDate={setDate}
          onView={setCalendarView}
          onCreate={openCreate}
          onSearch={setSearch}
          onStatusFilter={setStatus}
          onMechanicFilter={setMechanicFilter}
          onToggleAdvanced={() => setAdvancedFiltersOpen((current) => !current)}
          onSelectAppointment={setSelectedAppointment}
          onSelectTicket={setSelectedTicket}
          onEdit={openEdit}
          onStatus={(appointment, next) => statusMutation.mutate({ id: appointment.id, next })}
          onReceive={(appointment) => receiveMutation.mutate(appointment.id)}
        />
      )}

      {formOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) =>
            event.target === event.currentTarget && !saveMutation.isPending && setFormOpen(false)
          }
        >
          <Card
            role="dialog"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border-primary/30 shadow-2xl"
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{editing ? 'Editar cita' : 'Programar cita'}</CardTitle>
                  <CardDescription>
                    La cita no descuenta inventario ni factura; al llegar se convierte en recepción.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormOpen(false)}
                  aria-label="Cerrar formulario"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form className="grid items-start gap-x-6 gap-y-4 md:grid-cols-2" onSubmit={submit}>
                <Field label="Cliente" required>
                  <div className="flex gap-2">
                    <select
                      required
                      className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.customerId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          customerId: event.target.value,
                          vehicleId: '',
                        }))
                      }
                    >
                      <option value="">Selecciona un cliente</option>
                      {(customersQuery.data ?? []).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    {hasPermission(session, 'customers.manage') ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0"
                        onClick={() => setCustomerDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Nuevo</span>
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Vehículo" required>
                  <div className="flex gap-2">
                    <select
                      required
                      disabled={!form.customerId}
                      className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
                      value={form.vehicleId}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, vehicleId: event.target.value }))
                      }
                    >
                      <option value="">Selecciona un vehículo</option>
                      {visibleVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {[vehicle.licensePlate, vehicle.make, vehicle.model]
                            .filter(Boolean)
                            .join(' · ')}
                        </option>
                      ))}
                    </select>
                    {hasPermission(session, 'vehicles.manage') ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0"
                        disabled={!form.customerId}
                        onClick={() => setVehicleDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Nuevo</span>
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Fecha y hora" required>
                  <AppointmentDateTimeInput
                    value={form.startsAt}
                    onChange={(startsAt) => setForm((current) => ({ ...current, startsAt }))}
                  />
                </Field>
                <Field label="Mecánico asignado (opcional)">
                  <select
                    className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.mechanicId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, mechanicId: event.target.value }))
                    }
                  >
                    <option value="">Sin asignar</option>
                    {(mechanicsQuery.data ?? []).map((mechanic) => (
                      <option key={mechanic.id} value={mechanic.id}>
                        {mechanic.user.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                <Field label="Motivo / queja" required>
                  <Input
                    required
                    maxLength={2000}
                    value={form.reason}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, reason: event.target.value }))
                    }
                    placeholder="Ej. Ruido al frenar"
                  />
                </Field>
                </div>
                <div className="md:col-span-2 flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                    Cancelar
                  </Button>
                  <Button disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                    {editing ? 'Guardar cambios' : 'Programar cita'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <QuickCustomerDialog
        open={customerDialogOpen}
        session={session}
        onClose={() => setCustomerDialogOpen(false)}
        onCreated={(customer) => {
          setForm((current) => ({ ...current, customerId: customer.id, vehicleId: '' }));
          setCustomerDialogOpen(false);
          setVehicleDialogOpen(true);
        }}
      />
      <QuickVehicleDialog
        open={vehicleDialogOpen}
        session={session}
        customer={selectedCustomer}
        onClose={() => setVehicleDialogOpen(false)}
        onCreated={(vehicle) => {
          setForm((current) => ({ ...current, vehicleId: vehicle.id }));
          setVehicleDialogOpen(false);
        }}
      />
      <WorkshopOrderDrawer
        session={session}
        ticket={
          selectedTicket
            ? (ticketsQuery.data?.find((ticket) => ticket.id === selectedTicket.id) ??
              selectedTicket)
            : null
        }
        mechanics={mechanicsQuery.data ?? []}
        onClose={() => setSelectedTicket(null)}
      />
      <WorkshopAppointmentDrawer
        appointment={selectedAppointment}
        pending={statusMutation.isPending || receiveMutation.isPending}
        onClose={() => setSelectedAppointment(null)}
        onEdit={(appointment) => {
          setSelectedAppointment(null);
          openEdit(appointment);
        }}
        onStatus={(next) => {
          if (!selectedAppointment) return;
          setSelectedAppointment(null);
          statusMutation.mutate({ id: selectedAppointment.id, next });
        }}
        onReceive={() => {
          if (!selectedAppointment) return;
          setSelectedAppointment(null);
          receiveMutation.mutate(selectedAppointment.id);
        }}
        onOpenTicket={(ticketId) => {
          const ticket = ticketsQuery.data?.find((item) => item.id === ticketId);
          if (ticket) {
            setSelectedAppointment(null);
            setSelectedTicket(ticket);
          }
        }}
      />
    </div>
  );
}

function AdminOrderDesk({
  date,
  view,
  search,
  status,
  mechanicFilter,
  advancedFiltersOpen,
  appointments,
  allAppointments,
  tickets,
  mechanics,
  loading,
  pending,
  onPrevious,
  onNext,
  onToday,
  onDate,
  onView,
  onCreate,
  onSearch,
  onStatusFilter,
  onMechanicFilter,
  onToggleAdvanced,
  onSelectAppointment,
  onSelectTicket,
  onEdit,
  onStatus,
  onReceive,
}: {
  date: string;
  view: CalendarView;
  search: string;
  status: WorkshopAppointmentStatus | 'ALL';
  mechanicFilter: string;
  advancedFiltersOpen: boolean;
  appointments: WorkshopAppointment[];
  allAppointments: WorkshopAppointment[];
  tickets: WorkshopTicket[];
  mechanics: WorkshopMechanic[];
  loading: boolean;
  pending: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onDate: (value: string) => void;
  onView: (view: CalendarView) => void;
  onCreate: () => void;
  onSearch: (value: string) => void;
  onStatusFilter: (status: WorkshopAppointmentStatus | 'ALL') => void;
  onMechanicFilter: (id: string) => void;
  onToggleAdvanced: () => void;
  onSelectAppointment: (appointment: WorkshopAppointment) => void;
  onSelectTicket: (ticket: WorkshopTicket) => void;
  onEdit: (appointment: WorkshopAppointment) => void;
  onStatus: (appointment: WorkshopAppointment, status: WorkshopAppointmentStatus) => void;
  onReceive: (appointment: WorkshopAppointment) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[data-appointment-actions]')) setOpenMenuId(null);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeWithKeyboard);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeWithKeyboard);
    };
  }, [openMenuId]);
  const now = Date.now();
  const todayKey = localDateTime().slice(0, 10);
  const todayAppointments = allAppointments.filter(
    (item) => localDateTime(new Date(item.startsAt)).slice(0, 10) === todayKey,
  );
  const pendingAppointments = todayAppointments.filter(
    (item) => item.status === 'SCHEDULED',
  ).length;
  const received = todayAppointments.filter(
    (item) => item.status === 'CONVERTED_TO_RECEPTION',
  ).length;
  const delayed = todayAppointments.filter(
    (item) =>
      ['SCHEDULED', 'CONFIRMED'].includes(item.status) && new Date(item.startsAt).getTime() < now,
  );
  const completed = todayAppointments.filter(
    (item) => item.status === 'CONVERTED_TO_RECEPTION',
  ).length;
  const nextAppointment = [...allAppointments]
    .filter(
      (item) =>
        ['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(item.status) &&
        new Date(item.startsAt).getTime() >= now,
    )
    .sort((first, second) => +new Date(first.startsAt) - +new Date(second.startsAt))[0];

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-1 sm:p-2">
      <header className="flex flex-col gap-4 px-1 py-1 xl:flex-row xl:items-center">
        <div className="min-w-[16rem] flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Toma de órdenes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Gestión de citas y recepción de vehículos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={onPrevious}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-white"
              aria-label="Periodo anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToday}
              className="min-w-52 px-2 text-sm font-semibold capitalize text-slate-900"
            >
              {adminDateLabel(date, view)}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-white"
              aria-label="Periodo siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-11 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(['DAY', 'WEEK', 'MONTH'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onView(item)}
                className={cn(
                  'rounded-lg px-3 text-sm font-medium transition',
                  view === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500',
                )}
              >
                {item === 'DAY' ? 'Día' : item === 'WEEK' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <Button
            className="h-11 rounded-xl bg-slate-950 px-5 text-white hover:bg-slate-800"
            onClick={onCreate}
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </Button>
        </div>
      </header>

      <main className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminKpi
              label="Citas de hoy"
              value={todayAppointments.length}
              icon={<CalendarDays className="h-5 w-5" />}
              tone="sky"
            />
            <AdminKpi
              label="Pendientes"
              value={pendingAppointments}
              icon={<Clock3 className="h-5 w-5" />}
              tone="amber"
            />
            <AdminKpi
              label="Vehículos recibidos"
              value={received}
              icon={<ClipboardCheck className="h-5 w-5" />}
              tone="emerald"
            />
            <AdminKpi
              label="En taller / OT"
              value={tickets.length}
              icon={<Wrench className="h-5 w-5" />}
              tone="violet"
            />
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_30px_-28px_rgb(15_23_42/0.45)]">
            <div className="flex flex-col gap-2 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 shadow-none"
                  value={search}
                  onChange={(event) => onSearch(event.target.value)}
                  placeholder="Buscar por placa, cliente, teléfono o motivo"
                />
              </div>
              <select
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm lg:w-48"
                value={status}
                onChange={(event) =>
                  onStatusFilter(event.target.value as WorkshopAppointmentStatus | 'ALL')
                }
              >
                <option value="ALL">Todos los estados</option>
                {Object.entries(statusLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm lg:w-48"
                value={mechanicFilter}
                onChange={(event) => onMechanicFilter(event.target.value)}
              >
                <option value="ALL">Todos los técnicos</option>
                {mechanics.map((mechanic) => (
                  <option key={mechanic.id} value={mechanic.id}>
                    {mechanic.user.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={onToggleAdvanced}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Más filtros
              </Button>
            </div>
            {advancedFiltersOpen ? (
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-500">
                  Fecha de referencia
                  <Input
                    className="h-10 w-44"
                    type="date"
                    value={date}
                    onChange={(event) => onDate(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10"
                  onClick={() => {
                    onSearch('');
                    onStatusFilter('ALL');
                    onMechanicFilter('ALL');
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            ) : null}
          </section>

          <section className="overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_-28px_rgb(15_23_42/0.45)]">
            <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-950">Agenda principal</h2>
                <p className="text-sm text-slate-500">
                  {appointments.length} cita(s) en este periodo
                </p>
              </div>
              <CalendarClock className="h-5 w-5 text-slate-400" />
            </div>
            <div className="hidden grid-cols-[6rem_minmax(6rem,1fr)_minmax(6rem,.9fr)_minmax(7rem,1.1fr)_6.25rem_12rem] gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-slate-400 lg:grid">
              <span>Hora</span>
              <span>Vehículo</span>
              <span>Cliente</span>
              <span>Motivo / Servicio</span>
              <span>Estado</span>
              <span className="text-right">Acciones</span>
            </div>
            <div className="divide-y divide-slate-100 [overflow-anchor:none]">
              {loading ? <LoadingState /> : null}
              {!loading && !appointments.length ? (
                <div className="p-5">
                  <EmptyState
                    title="Sin citas"
                    description="No encontramos citas que coincidan con estos filtros."
                  />
                </div>
              ) : null}
              {appointments.map((appointment) => (
                <AdminAppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  tickets={tickets}
                  pending={pending}
                  onSelect={() => onSelectAppointment(appointment)}
                  onSelectTicket={onSelectTicket}
                  onEdit={() => onEdit(appointment)}
                  onStatus={(next) => onStatus(appointment, next)}
                  onReceive={() => onReceive(appointment)}
                  menuOpen={openMenuId === appointment.id}
                  onMenuToggle={() =>
                    setOpenMenuId((current) => (current === appointment.id ? null : appointment.id))
                  }
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <AdminSummaryCard title="Resumen del día">
            <SummaryLine label="Citas de hoy" value={todayAppointments.length} />
            <SummaryLine label="Por confirmar" value={pendingAppointments} />
            <SummaryLine label="Vehículos recibidos" value={received} />
            <SummaryLine label="En taller / OT" value={tickets.length} />
            <SummaryLine label="Citas retrasadas" value={delayed.length} />
            <SummaryLine label="Citas completadas" value={completed} />
          </AdminSummaryCard>
          <AdminSummaryCard title="Próxima cita">
            {nextAppointment ? (
              <button
                type="button"
                onClick={() => onSelectAppointment(nextAppointment)}
                className="w-full rounded-xl bg-slate-50 p-4 text-left"
              >
                <p className="text-2xl font-extrabold text-slate-950">
                  {appointmentTime(nextAppointment.startsAt)}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="font-bold tracking-wide text-slate-900">
                    {nextAppointment.vehicle.licensePlate ?? 'SIN PLACA'}
                  </p>
                  <AppointmentStatusBadge status={nextAppointment.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {nextAppointment.vehicle.make} {nextAppointment.vehicle.model}
                </p>
                <p className="mt-1 text-sm text-slate-500">{nextAppointment.customer.name}</p>
              </button>
            ) : (
              <p className="text-sm text-slate-500">No hay citas próximas para este periodo.</p>
            )}
          </AdminSummaryCard>
          <AdminSummaryCard title="Citas retrasadas">
            <div className="space-y-2">
              {delayed.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectAppointment(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left"
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', 'bg-rose-400')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {item.vehicle.licensePlate ?? item.customer.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {appointmentTime(item.startsAt)} · {statusLabel[item.status]}
                    </span>
                  </span>
                </button>
              ))}
              {!delayed.length ? (
                <p className="text-sm text-slate-500">No hay citas retrasadas.</p>
              ) : null}
            </div>
          </AdminSummaryCard>
          <AdminSummaryCard title="Actividad reciente">
            <div className="space-y-2">
              {[...allAppointments]
                .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))
                .slice(0, 4)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectAppointment(item)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {statusLabel[item.status]}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {appointmentTime(item.startsAt)} ·{' '}
                        {item.vehicle.licensePlate ?? item.customer.name}
                      </span>
                    </span>
                  </button>
                ))}
              {!allAppointments.length ? (
                <p className="text-sm text-slate-500">Todavía no hay actividad.</p>
              ) : null}
            </div>
          </AdminSummaryCard>
        </aside>
      </main>
    </div>
  );
}

function AdminAppointmentRow({
  appointment,
  tickets,
  pending,
  onSelect,
  onSelectTicket,
  onEdit,
  onStatus,
  onReceive,
  menuOpen,
  onMenuToggle,
}: {
  appointment: WorkshopAppointment;
  tickets: WorkshopTicket[];
  pending: boolean;
  onSelect: () => void;
  onSelectTicket: (ticket: WorkshopTicket) => void;
  onEdit: () => void;
  onStatus: (status: WorkshopAppointmentStatus) => void;
  onReceive: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const ticket = appointment.convertedTicket
    ? tickets.find((item) => item.id === appointment.convertedTicket!.id)
    : undefined;
  const primary =
    appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'
      ? { label: 'Marcar llegada', run: () => onStatus('ARRIVED'), icon: Car }
      : appointment.status === 'ARRIVED'
        ? { label: 'Recibir / Abrir OT', run: onReceive, icon: ClipboardCheck }
        : appointment.convertedTicket
          ? { label: 'Abrir OT', run: () => ticket && onSelectTicket(ticket), icon: Wrench }
          : null;
  const PrimaryIcon = primary?.icon;
  const editable = ['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(appointment.status);
  return (
    <article className="grid gap-2 px-5 py-4 transition-colors hover:bg-slate-50/70 lg:grid-cols-[6rem_minmax(6rem,1fr)_minmax(6rem,.9fr)_minmax(7rem,1.1fr)_6.25rem_12rem] lg:items-center">
      <button type="button" onClick={onSelect} className="text-left">
        <span className="block whitespace-nowrap text-lg font-extrabold text-slate-950">
          {appointmentTime(appointment.startsAt)}
        </span>
      </button>
      <div className="min-w-0">
        <p className="truncate text-lg font-black tracking-wide text-slate-950">
          {appointment.vehicle.licensePlate ?? 'SIN PLACA'}
        </p>
        <p className="truncate text-sm font-semibold text-slate-600">
          {appointment.vehicle.make} {appointment.vehicle.model}
          {appointment.vehicle.year ? ` · ${appointment.vehicle.year}` : ''}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-slate-900">{appointment.customer.name}</p>
        <p className="truncate text-xs text-slate-400">
          {appointment.customer.phone ?? 'Sin teléfono'}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-700">{appointment.reason}</p>
        <p className="truncate text-xs text-slate-400">
          {appointment.mechanic?.user.name ?? 'Sin técnico asignado'}
        </p>
      </div>
      <div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {primary && PrimaryIcon ? (
          <Button
            type="button"
            size="sm"
            className="min-w-0 whitespace-nowrap bg-slate-950 px-3 text-white hover:bg-slate-800"
            disabled={pending || (appointment.convertedTicket ? !ticket : false)}
            onClick={primary.run}
          >
            <PrimaryIcon className="h-4 w-4" />
            <span>{primary.label}</span>
          </Button>
        ) : null}
        <div className="relative" data-appointment-actions>
          <button
            type="button"
            onClick={onMenuToggle}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"
            aria-label="Más acciones"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute bottom-11 right-0 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl">
              {editable ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onMenuToggle();
                      onEdit();
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onMenuToggle();
                      onEdit();
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    Reprogramar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onMenuToggle();
                      onStatus('CANCELLED');
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                  >
                    Cancelar
                  </button>
                </>
              ) : null}
              <Link
                href={`/customers?customer=${encodeURIComponent(appointment.customerId)}`}
                onClick={onMenuToggle}
                className="block rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                Ver cliente
              </Link>
              <Link
                href={`/workshop/vehicles?vehicle=${encodeURIComponent(appointment.vehicleId)}`}
                onClick={onMenuToggle}
                className="block rounded-lg px-3 py-2 hover:bg-slate-50"
              >
                Ver vehículo
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AdminKpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'sky' | 'amber' | 'emerald' | 'violet';
}) {
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_25px_-26px_rgb(15_23_42/0.5)]">
      <span className={cn('grid h-11 w-11 place-items-center rounded-xl', tones[tone])}>
        {icon}
      </span>
      <div>
        <p className="text-2xl font-extrabold leading-none text-slate-950">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{label}</p>
      </div>
    </article>
  );
}

function AdminSummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_25px_-26px_rgb(15_23_42/0.5)]">
      <h2 className="mb-4 font-bold text-slate-950">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

function TabletWorkstation({
  title,
  description,
  date,
  search,
  filter,
  appointments,
  allAppointments,
  tickets,
  allTickets,
  loading,
  pending,
  onPreviousDay,
  onNextDay,
  onToday,
  onCreate,
  onSearch,
  onFilter,
  onSelectAppointment,
  onSelectTicket,
  onStatus,
  onReceive,
}: {
  title: string;
  description: string;
  date: string;
  search: string;
  filter: TabletFilter;
  appointments: WorkshopAppointment[];
  allAppointments: WorkshopAppointment[];
  tickets: WorkshopTicket[];
  allTickets: WorkshopTicket[];
  loading: boolean;
  pending: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onCreate: () => void;
  onSearch: (value: string) => void;
  onFilter: (filter: TabletFilter) => void;
  onSelectAppointment: (appointment: WorkshopAppointment) => void;
  onSelectTicket: (ticket: WorkshopTicket) => void;
  onStatus: (appointment: WorkshopAppointment, status: WorkshopAppointmentStatus) => void;
  onReceive: (appointment: WorkshopAppointment) => void;
}) {
  const currentDate = new Date(`${date}T12:00:00`);
  const today = date === localDateTime().slice(0, 10);
  const dateLabel = `${today ? 'Hoy, ' : ''}${currentDate.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const pendingAppointments = allAppointments.filter((item) =>
    ['SCHEDULED', 'ARRIVED'].includes(item.status),
  ).length;
  const confirmed = allAppointments.filter((item) => item.status === 'CONFIRMED').length;
  const inWorkshop = allTickets.filter((item) => item.status !== 'READY_FOR_DELIVERY').length;
  const ready = allTickets.filter((item) => item.status === 'READY_FOR_DELIVERY').length;
  const filters: Array<{ id: TabletFilter; label: string; count: number; tone: string }> = [
    {
      id: 'ALL',
      label: 'Todos',
      count: allAppointments.length,
      tone: 'bg-slate-950 text-white border-slate-950',
    },
    {
      id: 'PENDING',
      label: 'Pendientes',
      count: pendingAppointments,
      tone: 'bg-orange-50 text-orange-800 border-orange-200',
    },
    {
      id: 'CONFIRMED',
      label: 'Confirmadas',
      count: confirmed,
      tone: 'bg-sky-50 text-sky-800 border-sky-200',
    },
    {
      id: 'IN_WORKSHOP',
      label: 'En taller',
      count: inWorkshop,
      tone: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      id: 'READY',
      label: 'Listos',
      count: ready,
      tone: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
  ];

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_8px_30px_-24px_rgb(15_23_42/0.45)] sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[15rem] flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 active:bg-white"
              onClick={onPreviousDay}
              aria-label="Día anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="min-w-40 rounded-lg px-3 text-sm font-semibold capitalize text-slate-900 active:bg-white"
              onClick={onToday}
            >
              <CalendarDays className="mr-2 inline h-4 w-4" />
              {dateLabel}
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 active:bg-white"
              onClick={onNextDay}
              aria-label="Día siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <Button
            className="h-12 rounded-xl bg-slate-950 px-6 text-base text-white shadow-sm active:scale-[.98]"
            onClick={onCreate}
          >
            <Plus className="h-5 w-5" />
            Nueva cita
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 xl:pb-0">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onFilter(item.id)}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition active:scale-[.98]',
                  filter === item.id ? item.tone : 'border-slate-200 bg-white text-slate-600',
                )}
              >
                {item.label}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    filter === item.id ? 'bg-white/60' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {item.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full xl:w-[22rem]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-11 text-base shadow-none"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar placa, cliente o teléfono"
            />
          </div>
        </div>
      </header>

      <main className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)]">
        <TabletPanel
          title="Agenda del día"
          description={`${appointments.length} cita(s) para ${today ? 'hoy' : dateLabel}`}
          icon={<CalendarDays className="h-5 w-5" />}
        >
          {loading ? (
            <LoadingState />
          ) : appointments.length ? (
            appointments.map((appointment) => (
              <TabletAppointmentCard
                key={appointment.id}
                appointment={appointment}
                pending={pending}
                onSelect={() => onSelectAppointment(appointment)}
                onStatus={(status) => onStatus(appointment, status)}
                onReceive={() => onReceive(appointment)}
                onOpenTicket={(ticketId) => {
                  const ticket = allTickets.find((item) => item.id === ticketId);
                  if (ticket) onSelectTicket(ticket);
                }}
              />
            ))
          ) : (
            <EmptyState title="No hay citas" description="No encontramos citas con este filtro." />
          )}
        </TabletPanel>

        <TabletPanel
          title="Órdenes en taller"
          description={`${tickets.length} orden(es) activas`}
          icon={<Wrench className="h-5 w-5" />}
        >
          {loading ? (
            <LoadingState />
          ) : tickets.length ? (
            tickets.map((ticket) => (
              <TabletOrderCard
                key={ticket.id}
                ticket={ticket}
                onSelect={() => onSelectTicket(ticket)}
              />
            ))
          ) : (
            <EmptyState
              title="Taller al día"
              description="No hay órdenes activas con este filtro."
            />
          )}
        </TabletPanel>
      </main>
    </div>
  );
}

function TabletPanel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_35px_-28px_rgb(15_23_42/0.5)] lg:h-[calc(100vh-15.5rem)] lg:min-h-[31rem]">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
      <div className="surface-scrollbar flex-1 space-y-2.5 overflow-y-auto bg-slate-50/45 p-3 sm:p-4">
        {children}
      </div>
    </section>
  );
}

function TabletAppointmentCard({
  appointment,
  pending,
  onSelect,
  onStatus,
  onReceive,
  onOpenTicket,
}: {
  appointment: WorkshopAppointment;
  pending: boolean;
  onSelect: () => void;
  onStatus: (status: WorkshopAppointmentStatus) => void;
  onReceive: () => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const action =
    appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'
      ? { label: 'Marcar llegada', icon: Car, run: () => onStatus('ARRIVED') }
      : appointment.status === 'ARRIVED'
        ? { label: 'Recibir vehículo', icon: ClipboardCheck, run: onReceive }
        : appointment.convertedTicket
          ? {
              label: 'Abrir OT',
              icon: Wrench,
              run: () => onOpenTicket(appointment.convertedTicket!.id),
            }
          : null;
  const ActionIcon = action?.icon;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group grid cursor-pointer grid-cols-[4.8rem_minmax(0,1fr)] gap-3 rounded-xl border bg-white p-3.5 text-left shadow-[0_5px_20px_-18px_rgb(15_23_42/0.5)] outline-none transition active:scale-[.995] focus-visible:ring-2 focus-visible:ring-slate-900 sm:grid-cols-[5.2rem_minmax(0,1fr)_auto]',
        appointmentTone(appointment.status),
      )}
    >
      <div className="border-r border-slate-100 pr-3">
        <p className="text-xl font-extrabold tracking-tight text-slate-950">
          {new Date(appointment.startsAt).toLocaleTimeString('es-DO', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })}
        </p>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xl font-black tracking-wide text-slate-950">
            {appointment.vehicle.licensePlate ?? 'SIN PLACA'}
          </p>
          <AppointmentStatusBadge status={appointment.status} />
        </div>
        <p className="truncate text-base font-bold text-slate-700">
          {appointment.vehicle.make} {appointment.vehicle.model}
          {appointment.vehicle.year ? ` · ${appointment.vehicle.year}` : ''}
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <UserRound className="h-3.5 w-3.5" />
            {appointment.customer.name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            <span className="truncate">{appointment.reason}</span>
          </span>
        </div>
      </div>
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:pl-2">
        {action && ActionIcon ? (
          <Button
            type="button"
            className={cn(
              'h-11 min-w-36 rounded-lg px-4',
              appointment.status === 'ARRIVED' && 'bg-slate-950 text-white',
            )}
            variant={appointment.status === 'ARRIVED' ? 'default' : 'outline'}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              action.run();
            }}
          >
            <ActionIcon className="h-4 w-4" />
            {action.label}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 border border-slate-200 bg-white"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          aria-label="Más acciones"
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </article>
  );
}

function TabletOrderCard({ ticket, onSelect }: { ticket: WorkshopTicket; onSelect: () => void }) {
  const progress = ticketProgress(ticket);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_5px_20px_-18px_rgb(15_23_42/0.5)] outline-none transition active:scale-[.995] focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-bold text-slate-950">{ticket.ticketNumber}</span>
        <TicketStatusBadge status={ticket.status} />
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-3.5">
        <span className="flex h-[72px] w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 p-1.5">
          <VehicleIllustration
            type={ticket.vehicle.vehicleType}
            className="h-full w-full mix-blend-multiply"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-lg font-extrabold tracking-wide text-slate-950">
              {ticket.vehicle.licensePlate ?? 'SIN PLACA'}
            </p>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
          </div>
          <p className="truncate text-sm font-medium text-slate-600">
            {ticket.vehicle.make} {ticket.vehicle.model}
            {ticket.vehicle.year ? ` · ${ticket.vehicle.year}` : ''}
          </p>
          <p className="mt-1 truncate text-sm text-slate-500">{ticket.customer.name}</p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-500">
            <Wrench className="h-3.5 w-3.5 shrink-0" />
            {ticket.assignments[0]?.employee.user.name ?? 'Sin mecánico'}
          </p>
        </div>
      </div>
      <p className="mt-2 truncate text-sm text-slate-600">{ticket.complaint}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn('h-full rounded-full', progress.tone)}
            style={{ width: `${progress.value}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-500">{progress.value}%</span>
      </div>
    </button>
  );
}

function WorkshopAppointmentDrawer({
  appointment,
  pending,
  onClose,
  onEdit,
  onStatus,
  onReceive,
  onOpenTicket,
}: {
  appointment: WorkshopAppointment | null;
  pending: boolean;
  onClose: () => void;
  onEdit: (appointment: WorkshopAppointment) => void;
  onStatus: (status: WorkshopAppointmentStatus) => void;
  onReceive: () => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  if (!appointment) return null;
  return (
    <div
      className="fixed inset-0 z-[104] bg-slate-950/45 backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de cita"
        className="ml-auto flex h-full w-full max-w-xl flex-col bg-slate-50 shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b bg-white p-5">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-500">
              Cita ·{' '}
              {new Date(appointment.startsAt).toLocaleString('es-DO', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-wide text-slate-950">
              {appointment.vehicle.licensePlate ?? 'SIN PLACA'}
            </h2>
            <p className="text-slate-600">
              {appointment.vehicle.make} {appointment.vehicle.model}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <AppointmentStatusBadge status={appointment.status} />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <DrawerDetail label="Cliente" value={appointment.customer.name} />
              <DrawerDetail label="Teléfono" value={appointment.customer.phone ?? 'Sin teléfono'} />
              <DrawerDetail label="Motivo" value={appointment.reason} />
              <DrawerDetail
                label="Mecánico"
                value={appointment.mechanic?.user.name ?? 'Sin asignar'}
              />
            </dl>
            {appointment.notes ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                {appointment.notes}
              </p>
            ) : null}
          </section>
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-950">Acciones rápidas</h3>
            <div className="mt-4 grid gap-3">
              {['SCHEDULED', 'CONFIRMED'].includes(appointment.status) ? (
                <Button className="h-12" disabled={pending} onClick={() => onStatus('ARRIVED')}>
                  <Car className="h-5 w-5" />
                  Marcar llegada
                </Button>
              ) : null}
              {appointment.status === 'ARRIVED' ? (
                <Button className="h-12" disabled={pending} onClick={onReceive}>
                  <ClipboardCheck className="h-5 w-5" />
                  Recibir vehículo y abrir OT
                </Button>
              ) : null}
              {appointment.convertedTicket ? (
                <Button
                  className="h-12"
                  onClick={() => onOpenTicket(appointment.convertedTicket!.id)}
                >
                  <Wrench className="h-5 w-5" />
                  Abrir {appointment.convertedTicket.ticketNumber}
                </Button>
              ) : null}
              {['SCHEDULED', 'CONFIRMED', 'ARRIVED'].includes(appointment.status) ? (
                <>
                  <Button variant="outline" className="h-12" onClick={() => onEdit(appointment)}>
                    Editar cita o asignación
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-12 text-red-700 hover:bg-red-50 hover:text-red-800"
                    disabled={pending}
                    onClick={() => onStatus('CANCELLED')}
                  >
                    Cancelar cita
                  </Button>
                </>
              ) : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DrawerDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function AppointmentStatusBadge({ status }: { status: WorkshopAppointmentStatus }) {
  const tones: Record<WorkshopAppointmentStatus, string> = {
    SCHEDULED: 'bg-slate-100 text-slate-700',
    CONFIRMED: 'bg-sky-100 text-sky-700',
    ARRIVED: 'bg-orange-100 text-orange-700',
    NO_SHOW: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-red-50 text-red-600',
    CONVERTED_TO_RECEPTION: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', tones[status])}
    >
      {statusLabel[status]}
    </span>
  );
}

function TicketStatusBadge({ status }: { status: WorkshopTicket['status'] }) {
  const tones: Record<WorkshopTicket['status'], string> = {
    RECEIVED: 'bg-sky-100 text-sky-700',
    DIAGNOSIS: 'bg-violet-100 text-violet-700',
    AWAITING_APPROVAL: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    IN_PROGRESS: 'bg-orange-100 text-orange-700',
    READY_FOR_DELIVERY: 'bg-green-100 text-green-700',
    DELIVERED: 'bg-slate-100 text-slate-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', tones[status])}>
      {statusLabelForTicket(status)}
    </span>
  );
}

function appointmentTone(status: WorkshopAppointmentStatus) {
  if (status === 'CONFIRMED') return 'border-l-4 border-l-sky-400';
  if (status === 'ARRIVED') return 'border-l-4 border-l-orange-400';
  if (status === 'CONVERTED_TO_RECEPTION') return 'border-l-4 border-l-emerald-400';
  return 'border-l-4 border-l-slate-300';
}

function ticketProgress(ticket: WorkshopTicket) {
  const values: Record<WorkshopTicket['status'], number> = {
    RECEIVED: 15,
    DIAGNOSIS: 30,
    AWAITING_APPROVAL: 45,
    APPROVED: 60,
    IN_PROGRESS: 75,
    READY_FOR_DELIVERY: 95,
    DELIVERED: 100,
    CANCELLED: 0,
  };
  const tone =
    ticket.status === 'READY_FOR_DELIVERY'
      ? 'bg-emerald-500'
      : ticket.status === 'IN_PROGRESS' || ticket.status === 'APPROVED'
        ? 'bg-orange-400'
        : 'bg-sky-500';
  return { value: values[ticket.status], tone };
}

function LoadingState() {
  return (
    <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      Actualizando operación…
    </p>
  );
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-white px-5 py-12 text-center">
      <CheckCircle2 className="h-8 w-8 text-slate-300" />
      <p className="mt-3 font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function statusLabelForTicket(status: WorkshopTicket['status']) {
  return (
    {
      RECEIVED: 'Recepción',
      DIAGNOSIS: 'Diagnóstico',
      AWAITING_APPROVAL: 'Por aprobar',
      APPROVED: 'Por facturar',
      IN_PROGRESS: 'En reparación',
      READY_FOR_DELIVERY: 'Lista',
      DELIVERED: 'Entregada',
      CANCELLED: 'Cancelada',
    } as const
  )[status];
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
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
    <label className="grid gap-1.5 text-sm font-medium">
      <Label>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </Label>
      {children}
    </label>
  );
}
