'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ClipboardCheck,
  History,
  ImagePlus,
  Save,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createWorkshopReception,
  getWorkshopTickets,
  getWorkshopVehicleHistory,
  saveWorkshopInspection,
  updateWorkshopReception,
  updateWorkshopTicket,
  uploadWorkshopReceptionImages,
  type WorkshopMechanic,
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

export function WorkshopOrderDrawer({
  session,
  ticket,
  mechanics,
  onClose,
}: {
  session: AuthSession;
  ticket: WorkshopTicket | null;
  mechanics: WorkshopMechanic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mileage, setMileage] = useState('');
  const [fuelLevel, setFuelLevel] = useState('');
  const [mechanicId, setMechanicId] = useState('');
  const [exterior, setExterior] = useState('');
  const [warningLights, setWarningLights] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [savedImages, setSavedImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const vehicleHistory = useQuery({
    queryKey: ['workshop-vehicle-history', ticket?.vehicle.id],
    queryFn: () =>
      getWorkshopVehicleHistory(session.tenantId, session.accessToken, ticket!.vehicle.id),
    enabled: Boolean(ticket && historyOpen),
  });
  const customerOrders = useQuery({
    queryKey: ['workshop-tickets', session.tenantId],
    queryFn: () => getWorkshopTickets(session.tenantId, session.accessToken),
    enabled: Boolean(ticket && historyOpen),
  });

  useEffect(() => {
    if (!ticket) return;
    setMileage(String(ticket.reception?.mileage ?? ticket.vehicle.mileage ?? ''));
    setFuelLevel(ticket.reception?.fuelLevel ?? '1/2');
    setMechanicId(ticket.assignments[0]?.employee.id ?? ticket.reception?.initialMechanicId ?? '');
    setExterior(ticket.reception?.exteriorCondition ?? '');
    setWarningLights(ticket.reception?.warningLights ?? '');
    setDiagnosis(ticket.diagnosis ?? '');
    setSavedImages(ticket.reception?.imageUrls ?? []);
    setNewImages([]);
  // Background refreshes must not erase unsaved fields or selected photos.
  }, [ticket?.id]);

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
    ]);
  };

  const receptionMutation = useMutation({
    mutationFn: async () => {
      if (!ticket) throw new Error('Selecciona una orden.');
      const currentMileage = Number(mileage);
      if (!Number.isInteger(currentMileage) || currentMileage < 0)
        throw new Error('Indica un kilometraje válido.');
      if (!diagnosis.trim()) throw new Error('Escribe el resultado de la revisión inicial.');
      const uploaded = newImages.length
        ? await uploadWorkshopReceptionImages(session.tenantId, session.accessToken, newImages)
        : { imageUrls: [] };
      const imageUrls = [...savedImages, ...uploaded.imageUrls].slice(0, 2);
      const receptionPayload = {
        mileage: currentMileage,
        fuelLevel: fuelLevel || undefined,
        exteriorCondition: exterior || undefined,
        warningLights: warningLights || undefined,
        initialMechanicId: mechanicId || undefined,
        observations: diagnosis.trim(),
        imageUrls,
      };
      if (!ticket.reception)
        await createWorkshopReception(
          session.tenantId,
          session.accessToken,
          ticket.id,
          receptionPayload,
        );
      else
        await updateWorkshopReception(
          session.tenantId,
          session.accessToken,
          ticket.id,
          receptionPayload,
        );
      setSavedImages(imageUrls);
      setNewImages([]);
      if (ticket.status === 'RECEIVED') {
        await updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, {
          status: 'DIAGNOSIS',
          diagnosis: diagnosis.trim(),
          mechanicIds: mechanicId ? [mechanicId] : [],
        });
      } else {
        await updateWorkshopTicket(session.tenantId, session.accessToken, ticket.id, {
          diagnosis: diagnosis.trim(),
        });
      }
      await saveWorkshopInspection(session.tenantId, session.accessToken, ticket.id, {
        items: [
          {
            code: 'EXTERIOR',
            label: 'Condición exterior',
            result: exterior.trim() ? 'ATTENTION' : 'GOOD',
            comment: exterior.trim() || undefined,
          },
          {
            code: 'WARNING_LIGHTS',
            label: 'Testigos del tablero',
            result: warningLights.trim() ? 'ATTENTION' : 'GOOD',
            comment: warningLights.trim() || undefined,
          },
          {
            code: 'INITIAL_REVIEW',
            label: 'Revisión inicial',
            result: 'REQUIRES_REPAIR',
            comment: diagnosis.trim(),
          },
        ],
      });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success('Recepción guardada. Continuando a la orden de trabajo.');
      const ticketId = ticket?.id;
      onClose();
      if (ticketId) router.push(`/workshop?ticket=${encodeURIComponent(ticketId)}`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la recepción.'),
  });

  if (!ticket) return null;
  const pending = receptionMutation.isPending;
  const relatedCustomerOrders = (customerOrders.data ?? []).filter(
    (item) => item.customer.id === ticket.customer.id,
  );

  return (
    <div
      className="fixed inset-0 z-[105] bg-slate-950/55 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Orden ${ticket.ticketNumber}`}
        className="ml-auto flex h-full w-full max-w-3xl flex-col bg-zinc-100 shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b bg-white p-5 sm:p-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wrench className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">{ticket.ticketNumber}</h2>
              <Badge variant="outline">{statusLabels[ticket.status]}</Badge>
            </div>
            <p className="mt-1 text-base text-muted-foreground">
              {ticket.vehicle.licensePlate ?? 'Sin placa'} · {ticket.vehicle.make}{' '}
              {ticket.vehicle.model}
            </p>
            <p className="text-sm text-muted-foreground">
              {ticket.customer.name} · {ticket.complaint}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12"
            onClick={onClose}
            disabled={pending}
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {['RECEIVED', 'DIAGNOSIS'].includes(ticket.status) ? (
            <form
              className="rounded-2xl border bg-white p-5 shadow-sm"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                receptionMutation.mutate();
              }}
            >
              <div className="mb-4 flex items-center gap-3">
                <ClipboardCheck className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">Recepción y revisión inicial</h3>
                  <p className="text-sm text-muted-foreground">
                    Un solo registro acompaña la orden durante todo el proceso.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TouchField label="Kilometraje" required>
                  <Input
                    className="h-12 text-base"
                    required
                    type="number"
                    min={0}
                    value={mileage}
                    onChange={(event) => setMileage(event.target.value)}
                  />
                </TouchField>
                <TouchField label="Combustible">
                  <select
                    className="h-12 rounded-md border border-input bg-background px-3 text-base"
                    value={fuelLevel}
                    onChange={(event) => setFuelLevel(event.target.value)}
                  >
                    <option value="1/4">1/4</option>
                    <option value="1/2">1/2</option>
                    <option value="3/4">3/4</option>
                    <option value="FULL">Lleno</option>
                  </select>
                </TouchField>
                <TouchField label="Mecánico inicial">
                  <select
                    className="h-12 rounded-md border border-input bg-background px-3 text-base"
                    value={mechanicId}
                    onChange={(event) => setMechanicId(event.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {mechanics.map((mechanic) => (
                      <option key={mechanic.id} value={mechanic.id}>
                        {mechanic.user.name}
                      </option>
                    ))}
                  </select>
                </TouchField>
                <TouchField label="Condición exterior">
                  <Input
                    className="h-12 text-base"
                    value={exterior}
                    onChange={(event) => setExterior(event.target.value)}
                    placeholder="Golpes, rayones..."
                  />
                </TouchField>
                <TouchField label="Testigos encendidos">
                  <Input
                    className="h-12 text-base"
                    value={warningLights}
                    onChange={(event) => setWarningLights(event.target.value)}
                    placeholder="Ninguno / ABS..."
                  />
                </TouchField>
                <TouchField label="Resultado de la revisión" required wide>
                  <textarea
                    className="min-h-28 rounded-md border border-input bg-background p-3 text-base"
                    required
                    value={diagnosis}
                    onChange={(event) => setDiagnosis(event.target.value)}
                    placeholder="Hallazgos iniciales y diagnóstico..."
                  />
                </TouchField>
                <div className="grid gap-3 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Evidencias del vehículo</Label>
                    <span className="text-xs text-muted-foreground">Máximo 2 imágenes</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {savedImages.map((url) => (
                      <ImageTile
                        key={url}
                        src={url}
                        onRemove={() =>
                          setSavedImages((items) => items.filter((item) => item !== url))
                        }
                      />
                    ))}
                    {newImages.map((file, index) => (
                      <ImageTile
                        key={`${file.name}-${index}`}
                        file={file}
                        onRemove={() =>
                          setNewImages((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      />
                    ))}
                    {savedImages.length + newImages.length < 2 ? (
                      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-600">
                        <ImagePlus className="h-6 w-6" />
                        Agregar imagen
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          className="sr-only"
                          disabled={pending}
                          onChange={(event) => {
                            // Snapshot FileList before clearing the input: React may run
                            // the state updater after the native input has been reset.
                            const files = Array.from(event.currentTarget.files ?? []);
                            const available = 2 - savedImages.length - newImages.length;
                            event.currentTarget.value = '';
                            const validFiles = files.filter((file) => {
                              if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                                toast.error(`${file.name}: selecciona una imagen JPG, PNG o WEBP.`);
                                return false;
                              }
                              if (file.size > 5 * 1024 * 1024) {
                                toast.error(`${file.name}: el tamaño máximo es 5 MB.`);
                                return false;
                              }
                              return true;
                            });
                            if (validFiles.length > available)
                              toast.warning('Puedes agregar un máximo de 2 imágenes por recepción.');
                            const selected = validFiles.slice(0, available);
                            setNewImages((items) => [...items, ...selected]);
                          }}
                        />
                      </label>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG o WEBP · Hasta 5 MB por imagen. Las fotos se suben al guardar la recepción.
                  </p>
                </div>
              </div>
              <Button className="mt-5 h-14 w-full text-base" disabled={pending}>
                <Save className="h-5 w-5" />
                Guardar e iniciar diagnóstico
              </Button>
            </form>
          ) : null}
        </div>

        <footer className="border-t bg-white p-4 sm:p-5">
          <Button className="h-14 w-full text-base" onClick={() => setHistoryOpen(true)}>
            <History className="h-5 w-5" />
            Ver historial del cliente
          </Button>
        </footer>
      </aside>
      {historyOpen ? (
        <div
          className="fixed inset-0 z-[125] grid place-items-center bg-slate-950/60 p-3"
          onMouseDown={(event) => event.target === event.currentTarget && setHistoryOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Historial del cliente"
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start gap-3 border-b p-5">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setHistoryOpen(false)}
                aria-label="Regresar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold">Historial del cliente y vehículo</h2>
                <p className="font-semibold">
                  {ticket.customer.name} · {ticket.customer.phone ?? 'Sin teléfono'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ticket.vehicle.licensePlate ?? 'SIN PLACA'} · {ticket.vehicle.make}{' '}
                  {ticket.vehicle.model}
                  {ticket.vehicle.year ? ` · ${ticket.vehicle.year}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </header>
            <div className="space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Cliente
                  </p>
                  <p className="mt-2 text-lg font-bold">{ticket.customer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ticket.customer.phone ?? 'Sin teléfono'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ticket.customer.email ?? 'Sin correo'}
                  </p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Vehículo
                  </p>
                  <p className="mt-2 text-lg font-black tracking-wide">
                    {ticket.vehicle.licensePlate ?? 'SIN PLACA'}
                  </p>
                  <p className="font-semibold">
                    {ticket.vehicle.make} {ticket.vehicle.model}
                    {ticket.vehicle.year ? ` · ${ticket.vehicle.year}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    VIN: {ticket.vehicle.vin ?? 'No registrado'} ·{' '}
                    {ticket.vehicle.mileage === null
                      ? 'Kilometraje no registrado'
                      : `${Number(ticket.vehicle.mileage).toLocaleString('es-DO')} km`}
                  </p>
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <HistorySection
                  title="Historial del vehículo"
                  subtitle={`${vehicleHistory.data?.tickets.length ?? 0} orden(es) · ${vehicleHistory.data?.appointments.length ?? 0} cita(s)`}
                  tickets={vehicleHistory.data?.tickets ?? []}
                />
                <HistorySection
                  title="Historial del cliente"
                  subtitle={`${relatedCustomerOrders.length} orden(es) en todos sus vehículos`}
                  tickets={relatedCustomerOrders}
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function HistorySection({
  title,
  subtitle,
  tickets,
}: {
  title: string;
  subtitle: string;
  tickets: WorkshopTicket[];
}) {
  return (
    <section>
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-3 space-y-2">
        {tickets.map((item) => (
          <div key={item.id} className="rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <strong>{item.ticketNumber}</strong>
              <Badge variant="outline">{statusLabels[item.status]}</Badge>
            </div>
            <p className="mt-1 text-sm font-semibold">
              {item.vehicle.licensePlate ?? 'SIN PLACA'} · {item.vehicle.make} {item.vehicle.model}
            </p>
            <p className="text-sm text-muted-foreground">
              {new Date(item.openedAt).toLocaleDateString('es-DO')} · {item.complaint}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Trabajos:{' '}
              {item.lines.length
                ? item.lines.map((line) => line.description).join(', ')
                : 'Sin trabajos registrados'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Último cambio:{' '}
              {new Date(item.statusEvents[0]?.createdAt ?? item.openedAt).toLocaleString('es-DO')}
            </p>
          </div>
        ))}
        {!tickets.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">
            No hay historial registrado.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ImageTile({ src, file, onRemove }: { src?: string; file?: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="relative overflow-hidden rounded-xl border bg-slate-50">
      {(src || preview) ? <img src={src ?? preview} alt="Evidencia de recepción" className="h-28 w-full object-cover" /> : <div className="h-28" />}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white text-red-600 shadow"
        aria-label="Quitar imagen"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function TouchField({
  label,
  children,
  wide = false,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  required?: boolean;
}) {
  return (
    <label className={`grid gap-2 text-base font-medium ${wide ? 'sm:col-span-2' : ''}`}>
      <Label className="text-sm">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </Label>
      {children}
    </label>
  );
}
