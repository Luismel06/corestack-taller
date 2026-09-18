'use client';
import { hasPermission } from '@/lib/authorization';

import { useState } from 'react';
import { ClipboardList, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkshopTaskInput, WorkshopTaskUpdate, WorkshopTicket } from '@/lib/api';
import { useCurrentSession } from './session-required';

const statuses = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  PAUSED: 'Pausada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

const taskCategories = [
  ['GENERAL', 'Revisión general'],
  ['PARTS', 'Piezas y repuestos'],
  ['ENGINE', 'Motor'],
  ['TRANSMISSION', 'Transmisión'],
  ['COMPUTER', 'Computadora'],
  ['BRAKES', 'Frenos'],
  ['SUSPENSION_STEERING', 'Suspensión y dirección'],
  ['ELECTRICAL', 'Sistema eléctrico'],
  ['BODY_INTERIOR', 'Carrocería e interior'],
  ['OTHER', 'Otro'],
] as const;

function categoryLabel(category?: string | null) {
  return taskCategories.find(([value]) => value === category)?.[1] ?? 'Sin clasificar';
}

export function WorkshopTasksPanel({
  ticket,
  mechanics,
  mode = 'standard',
  pending,
  onCreate,
  onUpdate,
}: {
  ticket: WorkshopTicket;
  mechanics: Array<{ id: string; user: { name: string } }>;
  mode?: 'standard' | 'diagnosis';
  pending: boolean;
  onCreate: (input: WorkshopTaskInput) => Promise<unknown>;
  onUpdate: (id: string, input: WorkshopTaskUpdate) => Promise<unknown>;
}) {
  const session = useCurrentSession();
  const canManage = hasPermission(session, 'workorders.assign');
  const canCancel = hasPermission(session, 'tasks.cancel');
  const canProgress = hasPermission(session, 'tasks.progress');
  const locked =
    Boolean(ticket.salesOrder) ||
    ['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(ticket.status);
  const approvedLines = ticket.lines.filter((line) => line.approvalStatus === 'APPROVED');
  const canDiagnose = ['RECEIVED', 'DIAGNOSIS'].includes(ticket.status);
  const canRepair = ['APPROVED', 'IN_PROGRESS'].includes(ticket.status);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [employeeId, setEmployeeId] = useState('');
  const [legacyScopes, setLegacyScopes] = useState<Record<string, string>>({});
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const diagnosisMode = mode === 'diagnosis';
  const missingLabor = approvedLines.filter(
    (line) =>
      line.type === 'LABOR' &&
      !ticket.tasks.some((task) => task.ticketLineId === line.id && task.status !== 'CANCELLED'),
  );
  function inputForScope(value: string): Pick<WorkshopTaskInput, 'kind' | 'ticketLineId'> {
    return value === 'DIAGNOSIS' ? { kind: 'DIAGNOSIS' } : { kind: 'REPAIR', ticketLineId: value };
  }
  async function update(id: string, input: WorkshopTaskUpdate) {
    try {
      await onUpdate(id, input);
      return true;
    } catch {
      return false;
    } // Parent displays the API error.
  }
  const scopeOptions = (
    <>
      <option value="">Seleccionar trabajo autorizado</option>
      {canDiagnose ? <option value="DIAGNOSIS">Diagnóstico / inspección inicial</option> : null}
      {canRepair
        ? approvedLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.description}
            </option>
          ))
        : null}
    </>
  );
  return (
    <fieldset
      disabled={pending || locked}
      className={`min-w-0 space-y-3 ${diagnosisMode ? 'border-0 p-0' : 'rounded-md border border-border p-3'}`}
    >
      {!diagnosisMode ? (
        <legend className="px-1 text-sm font-semibold">Tareas por mecánico</legend>
      ) : null}
      {diagnosisMode ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4" /> Módulo de tareas
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Clasifica y asigna las revisiones necesarias antes de generar la cotización.
            </p>
          </div>
          {canManage && !locked ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowComposer(true)}
            >
              <Plus className="h-4 w-4" /> Agregar tarea
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          El diagnóstico se realiza antes de autorizar. Cada reparación corresponde a una línea
          aprobada; no agrega cargos al presupuesto.
        </p>
      )}
      {missingLabor.length && !locked ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Servicios sin tareas asignadas: {missingLabor.map((line) => line.description).join(', ')}.
          Deben completarse antes de aprobar calidad.
        </p>
      ) : null}
      {diagnosisMode ? (
        <div className="overflow-hidden rounded-md border bg-white">
          <div className="hidden grid-cols-[minmax(11rem,1.5fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_7rem] gap-3 border-b bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Tarea</span>
            <span>Clasificación</span>
            <span>Mecánico</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>
          <div className="divide-y">
            {ticket.tasks
              .filter((task) => task.kind === 'DIAGNOSIS' || task.kind === 'LEGACY')
              .map((task) => {
                const closed = ['COMPLETED', 'CANCELLED'].includes(task.status);
                const ownsTask = task.employee?.user.id === session?.user.id;
                const canAdvance =
                  canProgress &&
                  (session?.role !== 'MECHANIC' || ownsTask || canManage) &&
                  ticket.status === 'DIAGNOSIS' &&
                  Boolean(task.employeeId);
                return (
                  <div
                    key={task.id}
                    className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(11rem,1.5fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_7rem] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground md:hidden">
                        Tarea de diagnóstico
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {categoryLabel(task.category)}
                    </span>
                    <div>
                      {canManage && task.status === 'PENDING' ? (
                        <select
                          className="input-select h-9 w-full min-w-0"
                          aria-label={`Mecánico de ${task.title}`}
                          value={task.employeeId ?? ''}
                          onChange={(event) => {
                            if (event.target.value)
                              void update(task.id, { employeeId: event.target.value });
                          }}
                        >
                          <option value="">Sin asignar</option>
                          {mechanics.map((mechanic) => (
                            <option key={mechanic.id} value={mechanic.id}>
                              {mechanic.user.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{task.employee?.user.name ?? 'Sin asignar'}</span>
                      )}
                    </div>
                    <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                      {statuses[task.status]}
                    </span>
                    <div className="flex gap-1">
                      {!closed && ['PENDING', 'PAUSED'].includes(task.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!canAdvance}
                          onClick={() => void update(task.id, { status: 'IN_PROGRESS' })}
                        >
                          {task.status === 'PAUSED' ? 'Reanudar' : 'Iniciar'}
                        </Button>
                      ) : null}
                      {!closed && task.status === 'IN_PROGRESS' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={!canAdvance}
                          onClick={() => void update(task.id, { status: 'COMPLETED' })}
                        >
                          Finalizar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            {!ticket.tasks.filter((task) => task.kind === 'DIAGNOSIS' || task.kind === 'LEGACY')
              .length ? (
              <p className="p-3 text-sm text-muted-foreground">
                Todavía no hay tareas de diagnóstico.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {ticket.tasks.map((task) => {
            const closed = ['COMPLETED', 'CANCELLED'].includes(task.status);
            const line = ticket.lines.find((item) => item.id === task.ticketLineId);
            const ownsTask = task.employee?.user.id === session?.user.id;
            const correctStage =
              task.kind === 'DIAGNOSIS'
                ? ticket.status === 'DIAGNOSIS'
                : task.kind === 'REPAIR' &&
                  ticket.status === 'IN_PROGRESS' &&
                  line?.approvalStatus === 'APPROVED';
            const canAdvance =
              canProgress &&
              (session?.role !== 'MECHANIC' || ownsTask || canManage) &&
              correctStage &&
              Boolean(task.employeeId);
            return (
              <div key={task.id} className="space-y-2 rounded-md border bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.kind === 'LEGACY'
                        ? 'Histórica · alcance sin clasificar'
                        : task.kind === 'DIAGNOSIS'
                          ? 'Diagnóstico'
                          : `Autorizado: ${line?.description ?? 'Revisar vínculo'}`}
                    </p>
                  </div>
                  <span className="rounded border bg-white px-2 py-1 text-xs">
                    {statuses[task.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {task.employee?.user.name ?? 'Sin mecánico'} · Trabajo: {task.actualMinutes} min ·
                  Pausa: {task.pausedMinutes} min
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Tiempos acumulados al último cambio de estado.
                </p>
                {task.kind === 'LEGACY' && !closed ? (
                  <p className="text-xs text-amber-800">
                    {task.status === 'PENDING'
                      ? 'Clasifica esta tarea antes de iniciarla.'
                      : 'Conserva su historial: cancela la tarea con un motivo y crea una nueva vinculada al trabajo autorizado.'}
                  </p>
                ) : null}
                {canManage && task.status === 'PENDING' ? (
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="input-select max-w-full sm:w-56"
                      aria-label={`Mecánico de ${task.title}`}
                      value={task.employeeId ?? ''}
                      onChange={(event) => {
                        if (event.target.value)
                          void update(task.id, { employeeId: event.target.value });
                      }}
                    >
                      <option value="">Asignar mecánico</option>
                      {mechanics.map((mechanic) => (
                        <option key={mechanic.id} value={mechanic.id}>
                          {mechanic.user.name}
                        </option>
                      ))}
                    </select>
                    {task.kind === 'LEGACY' ? (
                      <>
                        <select
                          className="input-select min-w-0 flex-1"
                          aria-label={`Trabajo de ${task.title}`}
                          value={legacyScopes[task.id] ?? ''}
                          onChange={(event) =>
                            setLegacyScopes((current) => ({
                              ...current,
                              [task.id]: event.target.value,
                            }))
                          }
                        >
                          {scopeOptions}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!legacyScopes[task.id]}
                          onClick={() => void update(task.id, inputForScope(legacyScopes[task.id]))}
                        >
                          Vincular tarea
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {!closed ? (
                  <div className="flex flex-wrap gap-2">
                    {['PENDING', 'PAUSED'].includes(task.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canAdvance}
                        onClick={() => void update(task.id, { status: 'IN_PROGRESS' })}
                      >
                        {task.status === 'PAUSED' ? 'Reanudar' : 'Iniciar'}
                      </Button>
                    ) : null}
                    {task.status === 'IN_PROGRESS' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!(canManage || ownsTask)}
                        onClick={() => void update(task.id, { status: 'PAUSED' })}
                      >
                        Pausar
                      </Button>
                    ) : null}
                    {['IN_PROGRESS', 'PAUSED'].includes(task.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canAdvance}
                        onClick={() => void update(task.id, { status: 'COMPLETED' })}
                      >
                        Finalizar
                      </Button>
                    ) : null}
                    {canCancel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancelId(task.id);
                          setCancelReason('');
                        }}
                      >
                        Cancelar tarea
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {task.status === 'CANCELLED' ? (
                  <p className="text-xs text-muted-foreground">
                    Motivo:{' '}
                    {task.timeEntries.find((entry) => entry.event === 'CANCEL')?.note ??
                      'No registrado en el historial anterior'}
                  </p>
                ) : null}
                {cancelId === task.id ? (
                  <div className="space-y-2 border-t pt-2">
                    <Label htmlFor={`cancel-task-${task.id}`}>Motivo de cancelación</Label>
                    <Input
                      id={`cancel-task-${task.id}`}
                      value={cancelReason}
                      maxLength={2000}
                      onChange={(event) => setCancelReason(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Cancelar esta tarea no elimina el trabajo autorizado ni su importe. Si sigue
                      pendiente, asigna una tarea de reemplazo.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!cancelReason.trim()}
                        onClick={async () => {
                          if (
                            await update(task.id, {
                              status: 'CANCELLED',
                              cancellationReason: cancelReason.trim(),
                            })
                          )
                            setCancelId(null);
                        }}
                      >
                        Confirmar cancelación
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelId(null)}
                      >
                        Volver
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!ticket.tasks.length ? (
            <p className="py-2 text-sm text-muted-foreground">Todavía no hay tareas registradas.</p>
          ) : null}
        </div>
      )}
      {canManage && !locked && showComposer ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm"
          onMouseDown={(event) => event.target === event.currentTarget && setShowComposer(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-task-title"
            className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Módulo de tareas
                </p>
                <h3 id="new-task-title" className="mt-1 text-lg font-semibold">
                  Agregar tarea
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clasifica la revisión y asígnala al mecánico responsable.
                </p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setShowComposer(false)}>
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="grid gap-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="task-category">Clasificación *</Label>
                <select
                  id="task-category"
                  className="input-select h-11 w-full"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {taskCategories.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Tarea a realizar *</Label>
                <Input
                  id="task-title"
                  className="h-11"
                  maxLength={240}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ej. Escanear computadora y registrar códigos"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-employee">Mecánico responsable *</Label>
                <select
                  id="task-employee"
                  className="input-select h-11 w-full"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                >
                  <option value="">Seleccionar mecánico</option>
                  {mechanics.map((mechanic) => (
                    <option key={mechanic.id} value={mechanic.id}>{mechanic.user.name}</option>
                  ))}
                </select>
              </div>
              {!canDiagnose ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Las tareas de diagnóstico solo pueden agregarse durante la etapa de diagnóstico.
                </p>
              ) : null}
            </div>
            <footer className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setShowComposer(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={
                  !title.trim() ||
                  !category ||
                  !canDiagnose ||
                  !employeeId
                }
                onClick={async () => {
                  try {
                    await onCreate({
                      kind: 'DIAGNOSIS',
                      title: title.trim(),
                      category,
                      employeeId,
                    });
                    setTitle('');
                    setCategory('GENERAL');
                    setShowComposer(false);
                  } catch {
                    /* Keep form data; parent displays the error. */
                  }
                }}
              >
                <Plus className="h-4 w-4" /> Guardar tarea
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </fieldset>
  );
}
