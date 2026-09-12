'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  parseSessionSnapshot,
  sessionSnapshot,
  subscribeSession,
  type AuthSession,
} from '@/lib/auth-session';
import { useMemo, useSyncExternalStore } from 'react';
import { brand } from '@/lib/brand';

export function useCurrentSession() {
  const snapshot = useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
  return useMemo(() => parseSessionSnapshot(snapshot), [snapshot]);
}

export function SessionRequired({ session }: { session: AuthSession | null }) {
  if (session) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sesion requerida</CardTitle>
        <CardDescription>
          Inicia sesión como usuario autorizado de {brand.name} para consultar este módulo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href="/login">Ir al login</a>
        </Button>
      </CardContent>
    </Card>
  );
}
