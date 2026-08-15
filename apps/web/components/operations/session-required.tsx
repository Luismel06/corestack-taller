'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSession, type AuthSession } from '@/lib/auth-session';
import { brand } from '@/lib/brand';

export function useCurrentSession() {
  return getSession();
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
