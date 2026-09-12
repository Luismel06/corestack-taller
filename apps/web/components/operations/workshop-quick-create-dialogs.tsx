'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Car, Loader2, UserPlus, X } from 'lucide-react';
import { FormEvent, useEffect, useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createCustomer,
  createWorkshopVehicle,
  type Customer,
  type WorkshopVehicle,
  type WorkshopVehicleType,
} from '@/lib/api';
import { hasPermission } from '@/lib/authorization';
import type { AuthSession } from '@/lib/auth-session';

type DialogFrameProps = {
  open: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  pending: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

function DialogFrame({
  open,
  title,
  description,
  icon,
  pending,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: DialogFrameProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', close);
    };
  }, [onClose, open, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && !pending && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-card shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={pending}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
          {children}
        </div>
        <footer className="flex flex-col-reverse gap-3 border-t bg-muted/30 p-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="min-h-12 px-6" disabled={pending}>
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium ${wide ? 'sm:col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

const emptyCustomer = {
  name: '',
  documentType: 'CONSUMER_FINAL',
  documentNumber: '',
  phone: '',
  email: '',
  address: '',
};

export function QuickCustomerDialog({
  open,
  session,
  onClose,
  onCreated,
}: {
  open: boolean;
  session: AuthSession;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyCustomer);
  const mutation = useMutation({
    mutationFn: () => {
      if (!hasPermission(session, 'customers.manage'))
        throw new Error('No tienes permiso para registrar clientes.');
      return createCustomer(session.tenantId, session.accessToken, {
        name: form.name.trim(),
        documentType: form.documentType,
        documentNumber: form.documentNumber.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      });
    },
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      setForm(emptyCustomer);
      onCreated(customer);
      toast.success('Cliente creado y seleccionado');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el cliente.'),
  });

  return (
    <DialogFrame
      open={open}
      title="Registrar cliente"
      description="Crea el cliente sin perder los datos de la cita. Al guardar quedará seleccionado automáticamente."
      icon={<UserPlus className="h-6 w-6" />}
      pending={mutation.isPending}
      submitLabel="Crear y seleccionar"
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Nombre completo" wide>
        <Input
          autoFocus
          required
          maxLength={160}
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </Field>
      <Field label="Tipo de documento">
        <select
          className="h-11 rounded-md border border-input bg-background px-3"
          value={form.documentType}
          onChange={(event) =>
            setForm((current) => ({ ...current, documentType: event.target.value }))
          }
        >
          <option value="CONSUMER_FINAL">Consumidor final</option>
          <option value="CEDULA">Cédula</option>
          <option value="RNC">RNC</option>
          <option value="PASSPORT">Pasaporte</option>
          <option value="OTHER">Otro</option>
        </select>
      </Field>
      <Field label="Documento">
        <Input
          maxLength={40}
          value={form.documentNumber}
          onChange={(event) =>
            setForm((current) => ({ ...current, documentNumber: event.target.value }))
          }
        />
      </Field>
      <Field label="Teléfono">
        <Input
          type="tel"
          maxLength={40}
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        />
      </Field>
      <Field label="Correo">
        <Input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />
      </Field>
      <Field label="Dirección" wide>
        <Input
          maxLength={240}
          value={form.address}
          onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
        />
      </Field>
    </DialogFrame>
  );
}

const emptyVehicle = {
  vehicleType: '' as WorkshopVehicleType | '',
  licensePlate: '',
  make: '',
  model: '',
  year: '',
  color: '',
  vin: '',
  mileage: '',
};

export function QuickVehicleDialog({
  open,
  session,
  customer,
  onClose,
  onCreated,
}: {
  open: boolean;
  session: AuthSession;
  customer: Customer | null;
  onClose: () => void;
  onCreated: (vehicle: WorkshopVehicle) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyVehicle);
  const mutation = useMutation({
    mutationFn: () => {
      if (!customer) throw new Error('Selecciona primero el propietario del vehículo.');
      if (!hasPermission(session, 'vehicles.manage'))
        throw new Error('No tienes permiso para registrar vehículos.');
      return createWorkshopVehicle(session.tenantId, session.accessToken, {
        customerId: customer.id,
        vehicleType: form.vehicleType || undefined,
        licensePlate: form.licensePlate.trim() || undefined,
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year ? Number(form.year) : undefined,
        color: form.color.trim() || undefined,
        vin: form.vin.trim() || undefined,
        mileage: form.mileage ? Number(form.mileage) : undefined,
      });
    },
    onSuccess: async (vehicle) => {
      await queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      setForm(emptyVehicle);
      onCreated(vehicle);
      toast.success('Vehículo creado y seleccionado');
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el vehículo.'),
  });

  return (
    <DialogFrame
      open={open}
      title="Registrar vehículo"
      description={`Propietario: ${customer?.name ?? 'sin seleccionar'}. Volverás directamente a la cita al guardar.`}
      icon={<Car className="h-6 w-6" />}
      pending={mutation.isPending}
      submitLabel="Crear y seleccionar"
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Tipo de vehículo">
        <select
          autoFocus
          required
          className="h-11 rounded-md border border-input bg-background px-3"
          value={form.vehicleType}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              vehicleType: event.target.value as WorkshopVehicleType | '',
            }))
          }
        >
          <option value="">Seleccionar tipo</option>
          <option value="CAR">Carro</option>
          <option value="SUV">SUV</option>
        </select>
      </Field>
      <Field label="Placa">
        <Input
          maxLength={24}
          className="uppercase"
          value={form.licensePlate}
          onChange={(event) =>
            setForm((current) => ({ ...current, licensePlate: event.target.value.toUpperCase() }))
          }
          placeholder="A123456"
        />
      </Field>
      <Field label="Marca">
        <Input
          required
          maxLength={80}
          value={form.make}
          onChange={(event) => setForm((current) => ({ ...current, make: event.target.value }))}
          placeholder="Toyota"
        />
      </Field>
      <Field label="Modelo">
        <Input
          required
          maxLength={80}
          value={form.model}
          onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
          placeholder="Corolla"
        />
      </Field>
      <Field label="Año">
        <Input
          type="number"
          min={1900}
          max={new Date().getFullYear() + 1}
          value={form.year}
          onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
        />
      </Field>
      <Field label="Color">
        <Input
          maxLength={40}
          value={form.color}
          onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
        />
      </Field>
      <Field label="Kilometraje">
        <Input
          type="number"
          min={0}
          value={form.mileage}
          onChange={(event) => setForm((current) => ({ ...current, mileage: event.target.value }))}
        />
      </Field>
      <Field label="VIN / chasis" wide>
        <Input
          maxLength={80}
          className="uppercase"
          value={form.vin}
          onChange={(event) =>
            setForm((current) => ({ ...current, vin: event.target.value.toUpperCase() }))
          }
        />
      </Field>
    </DialogFrame>
  );
}
