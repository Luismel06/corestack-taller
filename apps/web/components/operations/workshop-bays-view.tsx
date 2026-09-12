'use client';
import { hasPermission } from '@/lib/authorization';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CircleAlert, Loader2, Pencil, Plus, Search } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createWorkshopBay,
  getWorkshopBays,
  updateWorkshopBay,
  type WorkshopBay,
  type WorkshopBayStatus,
} from '@/lib/api';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

const emptyBay = { code: '', name: '', notes: '' };
const statusMeta: Record<
  WorkshopBayStatus,
  { label: string; variant: 'success' | 'warning' | 'outline' }
> = {
  AVAILABLE: { label: 'Disponible', variant: 'success' },
  OCCUPIED: { label: 'Ocupada', variant: 'warning' },
  BLOCKED: { label: 'Bloqueada', variant: 'outline' },
  MAINTENANCE: { label: 'Mantenimiento', variant: 'outline' },
};

export function WorkshopBaysView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkshopBay | null>(null);
  const [form, setForm] = useState(emptyBay);
  const canManage = hasPermission(session, 'bays.manage');

  const baysQuery = useQuery({
    queryKey: ['workshop-bays', session?.tenantId],
    queryFn: () => getWorkshopBays(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { code: string; name: string; notes?: string }) => {
      if (!session) throw new Error('Sesión requerida.');
      return editing
        ? updateWorkshopBay(session.tenantId, session.accessToken, editing.id, payload)
        : createWorkshopBay(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async () => {
      toast.success(editing ? 'Bahía actualizada' : 'Bahía creada');
      setForm(emptyBay);
      setEditing(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['workshop-bays'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la bahía.'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ bayId, status }: { bayId: string; status: WorkshopBayStatus }) => {
      if (!session) throw new Error('Sesión requerida.');
      return updateWorkshopBay(session.tenantId, session.accessToken, bayId, { status });
    },
    onSuccess: async () => {
      toast.success('Estado de bahía actualizado');
      await queryClient.invalidateQueries({ queryKey: ['workshop-bays'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la bahía.'),
  });

  const visibleBays = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (baysQuery.data ?? []).filter((bay) =>
      [bay.code, bay.name, bay.notes]
        .filter(Boolean)
        .some((value) => !term || value!.toLowerCase().includes(term)),
    );
  }, [baysQuery.data, search]);

  if (!session) return <SessionRequired session={session} />;

  function openCreate() {
    setEditing(null);
    setForm(emptyBay);
    setFormOpen(true);
  }

  function openEdit(bay: WorkshopBay) {
    setEditing(bay);
    setForm({ code: bay.code, name: bay.name, notes: bay.notes ?? '' });
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({
      code: form.code,
      name: form.name,
      notes: form.notes.trim() || undefined,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <ModuleHeader
          title="Bahías del taller"
          description="Administra los espacios de trabajo. Una bahía queda ocupada automáticamente al asignarla en recepción."
        />
        {canManage ? (
          <Button className="shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva bahía
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="bg-white pl-9"
            placeholder="Buscar bahía por código o nombre"
          />
        </div>
        <p className="text-sm text-muted-foreground">{visibleBays.length} bahía(s)</p>
      </div>

      {formOpen ? (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle>{editing ? 'Editar bahía' : 'Nueva bahía'}</CardTitle>
            <CardDescription>
              Usa códigos cortos y visibles en el piso del taller, por ejemplo B1, ELEV-01 o
              DIAG-02.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-3">
                <BayField label="Código">
                  <Input
                    required
                    maxLength={40}
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, code: event.target.value }))
                    }
                    placeholder="B1"
                  />
                </BayField>
                <div className="md:col-span-2">
                  <BayField label="Nombre">
                    <Input
                      required
                      maxLength={120}
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Bahía de mecánica general"
                    />
                  </BayField>
                </div>
                <div className="md:col-span-3">
                  <BayField label="Notas operativas">
                    <textarea
                      className="input-textarea"
                      maxLength={1000}
                      value={form.notes}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Elevador disponible, capacidad, restricciones u observaciones"
                    />
                  </BayField>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Building2 className="h-4 w-4" />
                  )}
                  Guardar bahía
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {baysQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando bahías...
            </div>
          ) : visibleBays.length ? (
            <div className="divide-y divide-border">
              {visibleBays.map((bay) => {
                const meta = statusMeta[bay.status];
                return (
                  <div
                    key={bay.id}
                    className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{bay.code}</p>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{bay.name}</p>
                        {bay.notes ? (
                          <p className="mt-1 text-xs text-muted-foreground">{bay.notes}</p>
                        ) : null}
                      </div>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Estado de ${bay.code}`}
                          className="input-select h-9 min-w-36 text-sm"
                          value={bay.status}
                          disabled={statusMutation.isPending || bay.status === 'OCCUPIED'}
                          onChange={(event) =>
                            statusMutation.mutate({
                              bayId: bay.id,
                              status: event.target.value as WorkshopBayStatus,
                            })
                          }
                        >
                          <option value="AVAILABLE">Disponible</option>
                          <option value="BLOCKED">Bloqueada</option>
                          <option value="MAINTENANCE">Mantenimiento</option>
                          {bay.status === 'OCCUPIED' ? (
                            <option value="OCCUPIED">Ocupada</option>
                          ) : null}
                        </select>
                        <Button size="sm" variant="outline" onClick={() => openEdit(bay)}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Building2 className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 font-semibold">Aún no hay bahías registradas.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crea las bahías físicas del taller para asignarlas durante la recepción del
                vehículo.
              </p>
              {canManage ? (
                <Button className="mt-4" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Crear primera bahía
                </Button>
              ) : (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <CircleAlert className="h-4 w-4" />
                  Solicita a un administrador que las configure.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BayField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
