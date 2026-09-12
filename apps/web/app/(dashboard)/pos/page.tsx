import { PosView } from '@/components/operations/pos-view';
import { Suspense } from 'react';

export default function PosPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Cargando Caja…</p>}>
      <PosView />
    </Suspense>
  );
}
