'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEmployee, getEmployee, getEmployeeUserLimit, updateEmployee } from '@/lib/api';
import { brand } from '@/lib/brand';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';
import { effectivePermissions, legacyPermissions, roleLabels } from '@qorvex/permissions';
import { EmployeePermissionsEditor } from './employee-permissions-editor';

const permissionFields = [
  ['canUsePos', 'Usar caja'],
  ['canOpenCashSession', 'Abrir caja'],
  ['canCloseCashSession', 'Cerrar caja'],
  ['canApplyDiscount', 'Aplicar descuentos'],
  ['canCancelInvoice', 'Cancelar facturas'],
  ['canVoidInvoice', 'Anular facturas'],
  ['canManageProducts', 'Gestionar productos'],
  ['canAdjustInventory', 'Ajustar inventario'],
  ['canManageEmployees', 'Gestionar empleados'],
  ['canViewReports', 'Ver reportes'],
  ['canManageFiscalSequences', 'Secuencias fiscales'],
  ['canViewCashLogs', 'Ver logs de caja'],
  ['canReprintReceipt', 'Reimprimir recibos'],
  ['canTakeOrders', 'Tomar ordenes'],
] as const;

type EmployeeFormState = Record<(typeof permissionFields)[number][0], boolean> & {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  employeeCode: string;
  jobTitle: string;
  documentNumber: string;
  status: string;
};

const defaultState: EmployeeFormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'CASHIER',
  employeeCode: '',
  jobTitle: '',
  documentNumber: '',
  status: 'ACTIVE',
  canUsePos: true,
  canOpenCashSession: true,
  canCloseCashSession: true,
  canApplyDiscount: false,
  canCancelInvoice: false,
  canVoidInvoice: false,
  canManageProducts: false,
  canAdjustInventory: false,
  canManageEmployees: false,
  canViewReports: false,
  canManageFiscalSequences: false,
  canViewCashLogs: false,
  canReprintReceipt: true,
  canTakeOrders: false,
};

function assignableRole(role: string) {
  if (['ADMIN', 'CASHIER', 'ORDER_TAKER', 'MECHANIC'].includes(role)) return role;
  if (['SERVICE_ADVISOR', 'RECEPTIONIST', 'SUPERVISOR'].includes(role)) return 'ORDER_TAKER';
  return 'ADMIN';
}

export function EmployeeForm({ employeeId }: { employeeId?: string }) {
  const session = useCurrentSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EmployeeFormState>(defaultState);
  const [loadedEmployeeId, setLoadedEmployeeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const employeeQuery = useQuery({
    queryKey: ['employee', employeeId, session?.tenantId],
    queryFn: () =>
      getEmployee(session?.tenantId ?? '', session?.accessToken ?? '', employeeId ?? ''),
    enabled: Boolean(session && employeeId),
  });

  const limitQuery = useQuery({
    queryKey: ['employee-user-limit', session?.tenantId],
    queryFn: () => getEmployeeUserLimit(session!.tenantId, session!.accessToken),
    enabled: Boolean(session),
  });

  useEffect(() => {
    if (employeeQuery.data && loadedEmployeeId !== employeeQuery.data.id) {
      const membership = employeeQuery.data.user.memberships[0];
      const role = assignableRole(membership?.role ?? 'CASHIER');
      setLoadedEmployeeId(employeeQuery.data.id);
      setOverrides(membership?.permissionOverrides ?? {});
      setForm({
        ...defaultState,
        name: employeeQuery.data.user.name,
        email: employeeQuery.data.user.email,
        phone: employeeQuery.data.user.phone ?? '',
        password: '',
        role,
        employeeCode: employeeQuery.data.employeeCode ?? '',
        jobTitle: employeeQuery.data.jobTitle ?? '',
        documentNumber: employeeQuery.data.documentNumber ?? '',
        status: employeeQuery.data.status,
        ...Object.fromEntries(permissionFields.map(([key]) => [key, Boolean(membership?.[key])])),
      } as EmployeeFormState);
    }
  }, [employeeQuery.data, loadedEmployeeId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesion requerida.');
      }

      const payload = {
        ...form,
        permissionOverrides: overrides,
        password: form.password || undefined,
        documentType: form.documentNumber ? 'CEDULA' : undefined,
        documentNumber: form.documentNumber || undefined,
      };

      if (employeeId) {
        return updateEmployee(session.tenantId, session.accessToken, employeeId, payload);
      }

      return createEmployee(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth-access'] });
      await queryClient.invalidateQueries({ queryKey: ['employee'] });
      await queryClient.invalidateQueries({ queryKey: ['employees'] });
      await queryClient.invalidateQueries({ queryKey: ['employee-user-limit'] });
      router.push('/employees');
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el empleado.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  function setField(key: keyof EmployeeFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setRole(role: string) {
    setOverrides({});
    setForm((current) => ({
      ...current,
      role,
      ...getDefaultPermissionsForRole(role),
    }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={employeeId ? 'Editar empleado' : 'Nuevo empleado'}
        description={`Controla accesos operativos de ${brand.name} sin mezclar usuarios de otras empresas.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Perfil y permisos</CardTitle>
          <CardDescription>
            {limitQuery.data
              ? `${limitQuery.data.used}/${limitQuery.data.limit} usuarios activos. Crear o reactivar un usuario requiere un cupo disponible.`
              : 'Máximo de cinco usuarios activos por empresa.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
            <Field label="Nombre">
              <Input
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                required
              />
            </Field>
            <Field label="Correo">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setField('email', event.target.value)}
                required
              />
            </Field>
            <Field label="Telefono">
              <Input
                value={form.phone}
                onChange={(event) => setField('phone', event.target.value)}
              />
            </Field>
            <Field label="Contrasena">
              <Input
                type="password"
                required={!employeeId}
                minLength={8}
                value={form.password}
                onChange={(event) => setField('password', event.target.value)}
                placeholder={employeeId ? 'Dejar vacío para no cambiar' : 'Mínimo ocho caracteres'}
              />
            </Field>
            <Field label="Rol">
              <select
                value={form.role}
                onChange={(event) => setRole(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado">
              <select
                value={form.status}
                onChange={(event) => setField('status', event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
                <option value="BLOCKED">Bloqueado</option>
                <option value="TERMINATED">Terminado</option>
              </select>
            </Field>
            <Field label="Codigo empleado">
              <Input
                value={form.employeeCode}
                onChange={(event) => setField('employeeCode', event.target.value)}
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={form.jobTitle}
                onChange={(event) => setField('jobTitle', event.target.value)}
              />
            </Field>
            <Field label="Cedula">
              <Input
                value={form.documentNumber}
                onChange={(event) => setField('documentNumber', event.target.value)}
              />
            </Field>

            <EmployeePermissionsEditor
              membership={form}
              overrides={overrides}
              onChange={setOverrides}
              onRestore={() => setRole(form.role)}
            />
            <div className="md:col-span-2">
              {message ? <p className="mb-3 text-sm text-muted-foreground">{message}</p> : null}
              <Button type="submit" disabled={saveMutation.isPending}>
                <Save className="h-4 w-4" />
                Guardar empleado
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function getDefaultPermissionsForRole(role: string) {
  return legacyPermissions(effectivePermissions({ role })) as Pick<
    EmployeeFormState,
    (typeof permissionFields)[number][0]
  >;
}
