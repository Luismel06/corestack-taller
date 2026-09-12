'use client';

import { useId, useState } from 'react';
import { ChevronDown, Search, Settings2, ShieldCheck } from 'lucide-react';
import { effectivePermissions, permissionLabels, roleLabels } from '@qorvex/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  accessSections,
  editablePermissions,
  filterAccessPermissions,
  sectionPermissions,
} from '@/lib/employee-access';

export function EmployeePermissionsEditor({
  membership,
  overrides,
  onChange,
  onRestore,
}: {
  membership: { role: string; [key: string]: unknown };
  overrides: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
  onRestore: () => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('all');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const defaults = effectivePermissions({ ...membership, permissionOverrides: undefined });
  const effective = effectivePermissions({ ...membership, permissionOverrides: overrides });
  const changedCount = editablePermissions.filter((key) => overrides[key] !== undefined).length;
  const allowedCount = editablePermissions.filter((key) => effective[key]).length;
  const visible = filterAccessPermissions(section, query, onlyChanged, overrides);

  return (
    <section
      className="min-w-0 space-y-4 rounded-lg border p-4 md:col-span-2"
      aria-labelledby={id + '-title'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={id + '-title'} className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Accesos de este empleado
          </h3>
          <p className="mt-1 text-sm">
            Perfil: <strong>{roleLabels[membership.role] ?? membership.role}</strong>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Los permisos se completan al elegir el rol. Personaliza solo si necesita alguna
            excepción.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          aria-controls={expanded ? id + '-custom' : undefined}
          onClick={() => setExpanded(!expanded)}
        >
          <Settings2 className="h-4 w-4" />{' '}
          {expanded ? 'Cerrar personalización' : 'Personalizar accesos'}
          <ChevronDown
            className={'h-4 w-4 transition-transform ' + (expanded ? 'rotate-180' : '')}
          />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Resumen de permisos efectivos">
        {accessSections.map((item) => {
          const total = sectionPermissions(item.id).filter((key) => effective[key]).length;
          return total ? (
            <span key={item.id} className="rounded-md bg-muted px-2.5 py-1 text-xs">
              {item.label}: {total} permitidos
            </span>
          ) : null;
        })}
        {!allowedCount ? (
          <span className="text-xs text-muted-foreground">Sin accesos habilitados.</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {changedCount
          ? changedCount + ' permiso(s) personalizado(s) para este empleado.'
          : 'Sin excepciones individuales.'}{' '}
        Los cambios se aplican al guardar el empleado.
      </p>
      {expanded ? (
        <div id={id + '-custom'} className="space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar permiso"
                placeholder="Buscar: cobrar, asignar, inventario…"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              aria-label="Área de permisos"
              className="input-select h-10 w-full"
              value={section}
              onChange={(event) => setSection(event.target.value)}
            >
              <option value="all">Todas las áreas</option>
              {accessSections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(event) => setOnlyChanged(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Solo permisos modificados ({changedCount})
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRestore(true)}>
              Restablecer permisos del rol
            </Button>
          </div>
          {confirmRestore ? (
            <div
              className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              role="alert"
            >
              <p>
                Se quitarán las personalizaciones y se recuperarán los permisos predeterminados del
                rol. No afecta a otros empleados.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onRestore();
                    setConfirmRestore(false);
                    setOnlyChanged(false);
                  }}
                >
                  Sí, restablecer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRestore(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
          <div
            className="max-h-[28rem] space-y-3 overflow-y-auto rounded-md border p-3"
            role="region"
            aria-label="Lista de permisos personalizables"
            tabIndex={0}
          >
            {visible.length ? (
              accessSections.map((item) => {
                const keys = sectionPermissions(item.id).filter((key) => visible.includes(key));
                if (!keys.length) return null;
                return (
                  <div key={item.id}>
                    <h4 className="mb-2 rounded bg-muted px-2 py-1.5 text-xs font-semibold">
                      {item.label}
                    </h4>
                    <div className="divide-y">
                      {keys.map((key) => {
                        const locked =
                          (key === 'employees.manage' && membership.role !== 'ADMIN') ||
                          (membership.role === 'ADMIN' && ['pos.sell', 'cash.open'].includes(key));
                        return (
                          <div
                            key={key}
                            className="grid items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_240px]"
                          >
                            <div className="min-w-0">
                              <label htmlFor={id + key} className="text-sm font-medium">
                                {permissionLabels[key]}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {effective[key] ? 'Permitido' : 'Sin acceso'}
                                {overrides[key] !== undefined ? ' · Personalizado' : ''}
                                {locked ? ' · Restringido por el rol' : ''}
                              </p>
                            </div>
                            <select
                              id={id + key}
                              className="input-select h-9 w-full"
                              disabled={locked}
                              value={
                                overrides[key] === undefined
                                  ? 'inherit'
                                  : overrides[key]
                                    ? 'allow'
                                    : 'deny'
                              }
                              onChange={(event) => {
                                const next = { ...overrides };
                                if (event.target.value === 'inherit') delete next[key];
                                else next[key] = event.target.value === 'allow';
                                onChange(next);
                              }}
                            >
                              <option value="inherit">
                                Usar permisos del rol · {defaults[key] ? 'permitido' : 'sin acceso'}
                              </option>
                              <option value="allow">Permitir a este empleado</option>
                              <option value="deny">Denegar a este empleado</option>
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {onlyChanged && !changedCount
                  ? 'Este empleado no tiene permisos personalizados.'
                  : 'No hay permisos que coincidan con estos filtros.'}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cerrar este panel conserva los cambios pendientes. Los permisos también se validan en el
            servidor.
          </p>
        </div>
      ) : null}
    </section>
  );
}
