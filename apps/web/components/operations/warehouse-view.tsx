'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes, PackagePlus, Warehouse } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getWarehouseMovements, getWarehouseStock } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { formatQuantity } from './pos/pos-utils';
import { SessionRequired, useCurrentSession } from './session-required';

export function WarehouseView() {
  const session = useCurrentSession();
  const stockQuery = useQuery({
    queryKey: ['warehouse-stock', session?.tenantId],
    queryFn: () => getWarehouseStock(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const movementsQuery = useQuery({
    queryKey: ['warehouse-movements', session?.tenantId],
    queryFn: () => getWarehouseMovements(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  if (!session) return <SessionRequired session={session} />;

  const stock = stockQuery.data ?? [];
  const totalUnits = stock.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Almacén"
        description="Existencias B2B separadas del inventario de ventas y del POS."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Warehouse} label="Productos en almacén" value={stock.length} />
        <StatCard icon={Boxes} label="Unidades almacenadas" value={formatQuantity(totalUnits)} />
        <StatCard
          icon={PackagePlus}
          label="Movimientos recientes"
          value={movementsQuery.data?.length ?? 0}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Existencias de almacén</CardTitle>
          <CardDescription>
            Estas cantidades no se suman al stock disponible para tomar órdenes ni caja POS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="surface-scrollbar overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
                  <TableHead className="text-right">Último costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{item.product.unit}</p>
                    </TableCell>
                    <TableCell>{item.product.sku ?? '—'}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatQuantity(item.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.unitCost ? formatCurrency(Number(item.unitCost)) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {!stock.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      Aún no hay mercancía recibida en almacén.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos del almacén</CardTitle>
          <CardDescription>Entradas y reversiones originadas por recepciones de compra.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="surface-scrollbar max-h-[32rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Existencia final</TableHead>
                  <TableHead>Referencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(movementsQuery.data ?? []).map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDate(movement.createdAt)}</TableCell>
                    <TableCell className="font-medium">{movement.product.name}</TableCell>
                    <TableCell>{warehouseMovementLabel(movement.type)}</TableCell>
                    <TableCell className="text-right">{formatQuantity(movement.quantity)}</TableCell>
                    <TableCell className="text-right">
                      {movement.newQuantity === null
                        ? '—'
                        : formatQuantity(movement.newQuantity)}
                    </TableCell>
                    <TableCell>{movement.reference ?? movement.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {!movementsQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Sin movimientos de almacén.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Warehouse;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function warehouseMovementLabel(type: string) {
  if (type === 'PURCHASE') return 'Entrada por compra';
  if (type === 'ADJUSTMENT_OUT') return 'Salida / reversión';
  return 'Ajuste de entrada';
}
