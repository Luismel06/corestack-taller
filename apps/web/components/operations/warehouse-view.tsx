'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, PackagePlus, Pencil, Plus, Trash2, Warehouse } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createWarehouseProduct,
  deleteWarehouseProduct,
  getWarehouseMovements,
  getWarehouseProducts,
  getWarehouseStock,
  updateWarehouseProduct,
  type Product,
  type WarehouseProductPayload,
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

const emptyForm = (): WarehouseProductPayload => ({
  name: '',
  sku: '',
  barcode: '',
  brand: '',
  description: '',
  unit: 'UNIT',
  cost: undefined,
  initialQuantity: 0,
});

export function WarehouseView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [editingProduct, setEditingProduct] = useState<WarehouseCatalogProduct | null>(null);
  const [form, setForm] = useState<WarehouseProductPayload>(emptyForm);

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

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error('Sesión requerida.');
      if (!form.name.trim()) throw new Error('Indica el nombre del producto.');

      const payload: WarehouseProductPayload = {
        ...form,
        name: form.name.trim(),
        sku: form.sku?.trim() || undefined,
        barcode: form.barcode?.trim() || undefined,
        brand: form.brand?.trim() || undefined,
        description: form.description?.trim() || undefined,
        cost: form.cost === undefined ? undefined : Number(form.cost),
        initialQuantity: form.initialQuantity === undefined ? 0 : Number(form.initialQuantity),
      };

      if (editingProduct) {
        const { initialQuantity: _initialQuantity, ...updatePayload } = payload;
        return updateWarehouseProduct(
          session.tenantId,
          session.accessToken,
          editingProduct.id,
          updatePayload,
        );
      }

      return createWarehouseProduct(session.tenantId, session.accessToken, payload);
    },
    onSuccess: async () => {
      const message = editingProduct
        ? 'Producto de almacén actualizado.'
        : 'Producto agregado al almacén.';
      setEditingProduct(null);
      setForm(emptyForm());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['warehouse-products'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse-movements'] }),
      ]);
      toast.success(message);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el producto.');
    },
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate();
  }

  function edit(product: WarehouseCatalogProduct) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      brand: product.brand ?? '',
      description: product.description ?? '',
      unit: product.unit,
      cost: product.cost === null ? undefined : Number(product.cost),
      initialQuantity: 0,
    });
  }

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

      <Card>
        <CardHeader>
          <CardTitle>
            {editingProduct ? 'Editar producto de almacén' : 'Agregar producto de almacén'}
          </CardTitle>
          <CardDescription>
            Estos productos solo estarán disponibles al crear una orden de compra dirigida a
            Almacén.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={submit}>
            <Field label="Nombre" required>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={160}
              />
            </Field>
            <Field label="SKU / código">
              <Input
                value={form.sku ?? ''}
                onChange={(event) => setForm({ ...form, sku: event.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Código de barras">
              <Input
                value={form.barcode ?? ''}
                onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Marca">
              <Input
                value={form.brand ?? ''}
                onChange={(event) => setForm({ ...form, brand: event.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Costo unitario">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    cost: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Field>
            {!editingProduct ? (
              <Field label="Existencia inicial">
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.initialQuantity ?? 0}
                  onChange={(event) =>
                    setForm({ ...form, initialQuantity: Number(event.target.value) })
                  }
                />
              </Field>
            ) : null}
            <div className="flex items-end gap-2 md:col-span-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                <Plus className="h-4 w-4" />
                {saveMutation.isPending
                  ? 'Guardando...'
                  : editingProduct
                    ? 'Guardar cambios'
                    : 'Agregar producto'}
              </Button>
              {editingProduct ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingProduct(null);
                    setForm(emptyForm());
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos de almacén</CardTitle>
          <CardDescription>
            Administra productos B2B sin exponerlos a ventas de mostrador.
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
                    <TableCell>
                      <Badge variant={product.status === 'ACTIVE' ? 'success' : 'outline'}>
                        {product.status === 'ACTIVE' ? 'Activo' : 'Eliminado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => edit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
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
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Aún no hay productos de almacén. Agrega el primero para poder incluirlo en una
                      orden de compra.
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
          <CardDescription>
            Entradas y reversiones originadas por existencias iniciales y recepciones de compra.
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
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
  return 'Existencia inicial / ajuste';
}
