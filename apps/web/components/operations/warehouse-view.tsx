'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, PackagePlus, Pencil, Plus, Trash2, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteWarehouseProduct,
  getWarehouseMovements,
  getWarehouseProducts,
  getWarehouseStock,
  type Product,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { formatQuantity } from './pos/pos-utils';
import { SessionRequired, useCurrentSession } from './session-required';

type WarehouseCatalogProduct = Product & {
  warehouseStocks: Array<{
    id: string;
    quantity: number;
    unitCost: string | null;
    updatedAt: string;
  }>;
};

export function WarehouseView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();

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
  const productsQuery = useQuery({
    queryKey: ['warehouse-products', session?.tenantId],
    queryFn: () => getWarehouseProducts(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => {
      if (!session) throw new Error('Sesión requerida.');
      return deleteWarehouseProduct(session.tenantId, session.accessToken, productId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['warehouse-products'] });
      toast.success('Producto eliminado del catálogo de almacén.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el producto.');
    },
  });

  if (!session) return <SessionRequired session={session} />;

  const stock = stockQuery.data ?? [];
  const totalUnits = stock.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Almacén"
        description="Catálogo y existencias B2B aislados del inventario de ventas y del POS."
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

      <div className="flex justify-end">
        <Button asChild>
          <Link href="/warehouse/new">
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos de almacén</CardTitle>
          <CardDescription>
            Administra productos B2B que se venden desde Toma de órdenes, sin exponerlos a ventas de
            mostrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="surface-scrollbar overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Existencia</TableHead>
                  <TableHead className="text-right">Precio B2B</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(productsQuery.data ?? []).map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.brand ?? product.unit}
                      </p>
                    </TableCell>
                    <TableCell>{product.sku ?? '—'}</TableCell>
                    <TableCell>
                      {formatQuantity(product.warehouseStocks[0]?.quantity ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(Number(product.salePrice ?? product.price))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.status === 'ACTIVE' ? 'success' : 'outline'}>
                        {product.status === 'ACTIVE' ? 'Activo' : 'Eliminado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link href={`/warehouse/${product.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Link>
                        </Button>
                        {product.status === 'ACTIVE' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Eliminar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!productsQuery.data?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Aún no hay productos de almacén. Agrega el primero para venderlo desde Toma de
                      órdenes como Almacén B2B.
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
          <CardTitle>Existencias de almacén</CardTitle>
          <CardDescription>
            Estas cantidades se descuentan al facturar una orden marcada como Almacén B2B. No se
            suman al inventario de ventas ni al POS directo.
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
          <CardDescription>
            Entradas, salidas B2B y reversiones originadas por existencias iniciales y compras.
          </CardDescription>
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
                    <TableCell className="text-right">
                      {formatQuantity(movement.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {movement.newQuantity === null ? '—' : formatQuantity(movement.newQuantity)}
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
  if (type === 'SALE') return 'Venta B2B';
  if (type === 'ADJUSTMENT_OUT') return 'Salida / reversión';
  return 'Existencia inicial / ajuste';
}
