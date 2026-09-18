'use client';
import { hasPermission } from '@/lib/authorization';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, Loader2, Pencil, Plus, Search, Wrench } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createWorkshopService,
  getWorkshopServices,
  updateWorkshopService,
  type WorkshopService,
  type WorkshopServicePayload,
} from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

const emptyService = {
  code: '',
  name: '',
  category: '',
  description: '',
  defaultPrice: '',
  estimatedMinutes: '',
  taxRate: '0.18',
  active: true,
};

export function WorkshopServicesView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkshopService | null>(null);
  const [form, setForm] = useState(emptyService);

  const servicesQuery = useQuery({
    queryKey: ['workshop-services', session?.tenantId, 'catalog'],
    queryFn: () => getWorkshopServices(session!.tenantId, session!.accessToken, true),
    enabled: Boolean(session),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopServicePayload) => {
      if (!session) throw new Error('Sesión requerida.');
      return editing
        ? updateWorkshopService(session.tenantId, session.accessToken, editing.id, payload)
        : createWorkshopService(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Servicio actualizado' : 'Servicio creado');
      setForm(emptyService);
      setEditing(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['workshop-services'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el servicio.'),
  });

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (servicesQuery.data ?? []).filter((service) =>
      [service.code, service.name, service.category, service.description]
        .filter(Boolean)
        .some((value) => !query || value!.toLowerCase().includes(query)),
    );
  }, [search, servicesQuery.data]);

  if (!session) return <SessionRequired session={session} />;

  function openCreate() {
    setEditing(null);
    setForm(emptyService);
    setFormOpen(true);
  }

  function openEdit(service: WorkshopService) {
    setEditing(service);
    setForm({
      code: service.code,
      name: service.name,
      category: service.category ?? '',
      description: service.description ?? '',
      defaultPrice: service.defaultPrice,
      estimatedMinutes: service.estimatedMinutes ? String(service.estimatedMinutes) : '',
      taxRate: service.taxRate,
      active: service.active,
    });
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({
      code: form.code,
      name: form.name,
      category: form.category || undefined,
      description: form.description || undefined,
      defaultPrice: Number(form.defaultPrice),
      estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
      taxRate: Number(form.taxRate),
      active: form.active,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <ModuleHeader
          title="Servicios"
          description="Catálogo de mano de obra y servicios del taller. No afectan existencias de repuestos."
        />
        <Button
          disabled={!hasPermission(session, 'services.manage')}
          className="shrink-0"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-white pl-9"
            placeholder="Buscar por código, nombre o categoría"
          />
        </div>
        <p className="text-sm text-muted-foreground">{visibleServices.length} servicio(s)</p>
      </div>

      {formOpen && hasPermission(session, 'services.manage') ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>{editing ? 'Editar servicio' : 'Nuevo servicio'}</CardTitle>
            <CardDescription>
              El sistema crea y mantiene internamente su artículo facturable sin inventario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-3">
                <ServiceField label="Código" required>
                  <Input
                    required
                    maxLength={40}
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, code: event.target.value }))
                    }
                    placeholder="SRV-ACEITE"
                  />
                </ServiceField>
                <div className="md:col-span-2">
                  <ServiceField label="Nombre" required>
                    <Input
                      required
                      maxLength={160}
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Cambio de aceite"
                    />
                  </ServiceField>
                </div>
                <ServiceField label="Categoría">
                  <Input
                    maxLength={100}
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, category: event.target.value }))
                    }
                    placeholder="Mantenimiento"
                  />
                </ServiceField>
                <ServiceField label="Precio base" required>
                  <Input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={form.defaultPrice}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, defaultPrice: event.target.value }))
                    }
                  />
                </ServiceField>
                <ServiceField label="Tiempo estimado (min.)">
                  <Input
                    min="1"
                    step="1"
                    type="number"
                    value={form.estimatedMinutes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, estimatedMinutes: event.target.value }))
                    }
                  />
                </ServiceField>
                <ServiceField label="ITBIS">
                  <select
                    value={form.taxRate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, taxRate: event.target.value }))
                    }
                    className="input-select"
                  >
                    <option value="0.18">18%</option>
                    <option value="0.16">16%</option>
                    <option value="0">Exento</option>
                  </select>
                </ServiceField>
                <div className="md:col-span-2">
                  <ServiceField label="Descripción">
                    <textarea
                      className="input-textarea"
                      maxLength={2000}
                      value={form.description}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, description: event.target.value }))
                      }
                      placeholder="Alcance del trabajo incluido"
                    />
                  </ServiceField>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, active: event.target.checked }))
                  }
                />
                Disponible para cotizaciones y órdenes de trabajo
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardPlus className="h-4 w-4" />
                  )}
                  Guardar servicio
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {servicesQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando servicios...
            </div>
          ) : visibleServices.length ? (
            <div className="divide-y divide-border">
              {visibleServices.map((service) => (
                <div
                  key={service.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Wrench className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{service.name}</p>
                        <Badge variant={service.active ? 'success' : 'outline'}>
                          {service.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {service.code}
                        {service.category ? ` · ${service.category}` : ''}
                        {service.estimatedMinutes ? ` · ${service.estimatedMinutes} min` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:text-right">
                    <p className="font-semibold">{formatCurrency(Number(service.defaultPrice))}</p>
                    <Button
                      disabled={!hasPermission(session, 'services.manage')}
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(service)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Wrench className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 font-semibold">No hay servicios registrados.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea servicios como mano de obra, diagnóstico o mantenimiento para presupuestarlos
                en una OT.
              </p>
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Crear primer servicio
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceField({
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
