'use client';

import { useId, useState } from 'react';
import { PackageCheck, Undo2 } from 'lucide-react';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkshopTicket } from '@/lib/api';
import { translateInventoryMovementType } from '@/lib/display-labels';

export type PartOperation = {
  lineId: string;
  action: 'consume' | 'return' | 'release';
  quantity: number;
  operationKey: string;
  note?: string;
};

export function WorkshopPartsPanel({
  ticket,
  canManage,
  pending,
  onMove,
}: {
  ticket: WorkshopTicket;
  canManage: boolean;
  pending: boolean;
  onMove: (operation: PartOperation) => Promise<void>;
}) {
  const id = useId();
  const [operation, setOperation] = useState<PartOperation | null>(null);
  const [error, setError] = useState('');
  const parts = ticket.lines.filter((line) => line.type === 'PART' && line.product?.trackInventory);
  const active =
    canManage && !ticket.salesOrder && ['APPROVED', 'IN_PROGRESS'].includes(ticket.status);
  const selected = parts.find((line) => line.id === operation?.lineId);
  const max = selected
    ? operation?.action !== 'return'
      ? selected.reservedQuantity
      : Number(selected.consumedQuantity)
    : 0;
  const step =
    selected && ['METER', 'FOOT', 'YARD', 'POUND'].includes(selected.product?.unit ?? '')
      ? 0.01
      : 1;
  const remaining = parts.filter(
    (line) => line.approvalStatus === 'APPROVED' && line.reservedQuantity > 0,
  );
  if (!parts.length) return null;

  function open(lineId: string, action: PartOperation['action'], quantity: number) {
    setError('');
    setOperation({ lineId, action, quantity, operationKey: crypto.randomUUID(), note: '' });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repuestos de la reparación</CardTitle>
        <CardDescription>
          Aprobar reserva la pieza. Entregarla al mecánico descuenta la existencia; Caja no la
          descuenta de nuevo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {remaining.length > 0 && !ticket.salesOrder && ticket.status !== 'CANCELLED' ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Hay {remaining.length}{' '}
            {remaining.length === 1
              ? 'repuesto con unidades pendientes'
              : 'repuestos con unidades pendientes'}{' '}
            de entregar. Registra las salidas o libera las unidades que no se usarán antes de enviar
            a Caja.
          </p>
        ) : null}
        <div className="divide-y rounded-lg border">
          {parts.map((line) => (
            <div key={line.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{line.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.product?.sku ?? 'Sin SKU'} ·{' '}
                    {line.approvalStatus === 'APPROVED'
                      ? 'Autorizado'
                      : 'No autorizado para consumo'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Presupuestado</p>
                    <p>{Number(line.quantity)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Por entregar</p>
                    <p>{line.reservedQuantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entregado neto</p>
                    <p>{Number(line.consumedQuantity)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sin usar / no cobrar</p>
                    <p>{Number(line.releasedQuantity)}</p>
                  </div>
                </div>
              </div>
              {active && line.approvalStatus === 'APPROVED' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || line.reservedQuantity <= 0}
                    onClick={() => open(line.id, 'consume', line.reservedQuantity)}
                  >
                    <PackageCheck className="mr-2 h-4 w-4" /> Entregar al mecánico
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || Number(line.consumedQuantity) <= 0}
                    onClick={() => open(line.id, 'return', Number(line.consumedQuantity))}
                  >
                    <Undo2 className="mr-2 h-4 w-4" /> Devolver sin usar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || line.reservedQuantity <= 0}
                    onClick={() => open(line.id, 'release', line.reservedQuantity)}
                  >
                    Liberar unidades no utilizadas
                  </Button>
                </div>
              ) : null}
              {line.inventoryMovements.length ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Ver movimientos ({line.inventoryMovements.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {line.inventoryMovements.map((movement) => (
                      <li key={movement.id} className="rounded bg-muted/40 p-2">
                        <p>
                          {translateInventoryMovementType(movement.type)} · {movement.quantity}{' '}
                          unidades
                        </p>
                        <p className="text-muted-foreground">
                          {new Date(movement.createdAt).toLocaleString('es-DO')} ·{' '}
                          {movement.createdBy?.name ?? 'Sistema'}
                        </p>
                        {movement.reason ? (
                          <p className="break-words text-muted-foreground">{movement.reason}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
        </div>
        {operation && selected ? (
          <ActionDialog
            open
            title={
              operation.action === 'consume'
                ? 'Entregar repuesto al mecánico'
                : operation.action === 'return'
                  ? 'Reincorporar repuesto sin usar'
                  : 'Liberar unidades y excluirlas del cobro'
            }
            description={
              operation.action === 'consume'
                ? 'Registra la salida física de inventario para esta reparación.'
                : operation.action === 'return'
                  ? 'La pieza vuelve a existencia y queda reservada para esta OT. Si ya no se usará, libera luego esa reserva para excluirla del cobro.'
                  : 'Estas unidades quedan disponibles para otras órdenes y no se cobrarán. El presupuesto original y el motivo se conservan. Si se necesitan después, solicita un adicional.'
            }
            confirmLabel={
              operation.action === 'consume'
                ? 'Registrar entrega'
                : operation.action === 'return'
                  ? 'Registrar devolución'
                  : 'Liberar sin cobrar'
            }
            isPending={pending}
            confirmDisabled={
              !Number.isFinite(operation.quantity) ||
              operation.quantity <= 0 ||
              operation.quantity > max ||
              (step === 1 && !Number.isInteger(operation.quantity)) ||
              (operation.action === 'release' && !operation.note?.trim())
            }
            onClose={() => {
              if (!pending) setOperation(null);
            }}
            onConfirm={async () => {
              setError('');
              try {
                await onMove(operation);
                setOperation(null);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : 'No se pudo registrar el movimiento.',
                );
              }
            }}
          >
            <p className="mb-4 break-words font-medium">{selected.description}</p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${id}-quantity`}>Cantidad (máximo {max})</Label>
                <Input
                  id={`${id}-quantity`}
                  type="number"
                  min={step}
                  max={max}
                  step={step}
                  disabled={pending}
                  value={operation.quantity}
                  onChange={(event) =>
                    setOperation({ ...operation, quantity: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-note`}>
                  {operation.action === 'release'
                    ? 'Motivo (obligatorio)'
                    : 'Observación (opcional)'}
                </Label>
                <Input
                  id={`${id}-note`}
                  maxLength={500}
                  disabled={pending}
                  value={operation.note ?? ''}
                  onChange={(event) => setOperation({ ...operation, note: event.target.value })}
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>
          </ActionDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
