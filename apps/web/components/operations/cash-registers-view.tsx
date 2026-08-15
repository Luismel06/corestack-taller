'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Landmark, Plus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createCashRegister, getCashRegisters } from '@/lib/api';
import { isAdminSession } from '@/lib/authorization';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

export function CashRegistersView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');

  const registersQuery = useQuery({
    queryKey: ['cash-registers', session?.tenantId],
    queryFn: () => getCashRegisters(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!session) {
        throw new Error('Sesión requerida.');
      }

      if (!name.trim()) {
        throw new Error('Indica el nombre de la caja.');
      }

      return createCashRegister(session.tenantId, session.accessToken, {
        name: name.trim(),
        location: location.trim() || undefined,
      });
    },
    onSuccess: async (register) => {
      setName('');
      setLocation('');
      await queryClient.invalidateQueries({ queryKey: ['cash-registers'] });
      toast.success('Caja creada correctamente.', { description: register.name });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la caja.');
    },
  });

  if (!session) {
    return <SessionRequired session={session} />;
  }

  if (!isAdminSession(session)) {
    return <SessionRequired session={null} />;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Cajas"
        description="Crea y consulta las cajas físicas disponibles para apertura y cobro."
      />

      <Card>
        <CardHeader>
          <CardTitle>Crear nueva caja</CardTitle>
          <CardDescription>
            Cada caja puede tener una sola sesión abierta a la vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="cashRegisterName">Nombre</Label>
              <Input
                id="cashRegisterName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Caja principal - ALLPA"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cashRegisterLocation">Ubicación (opcional)</Label>
              <Input
                id="cashRegisterLocation"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Ej. Mostrador principal"
                maxLength={160}
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Creando...' : 'Crear caja'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cajas registradas</CardTitle>
          <CardDescription>
            {registersQuery.data?.length ?? 0} cajas disponibles en esta empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registersQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-md bg-zinc-100" />
              ))}
            </div>
          ) : registersQuery.data?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {registersQuery.data.map((register) => (
                <div key={register.id} className="rounded-md border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="rounded-md bg-primary/10 p-2 text-primary">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-950">{register.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {register.location || 'Sin ubicación asignada'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={register.status === 'ACTIVE' ? 'success' : 'outline'}>
                      <CircleCheck className="h-3.5 w-3.5" />
                      {register.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aún no hay cajas creadas. Registra la primera para poder abrir una sesión.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
