'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PackageSearch, TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatQuantity } from '@/components/operations/pos/pos-utils';
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
import { getProductSalesRanking, type ProductSalesMetric } from '@/lib/api';
import { getSession } from '@/lib/auth-session';
import { translateProductUnit } from '@/lib/display-labels';
import { formatCurrency, formatDate } from '@/lib/utils';

export function ProductSalesRankingView() {
  const session = getSession();
  const rankingQuery = useQuery({
    queryKey: ['product-sales-ranking', session?.tenantId],
    queryFn: () => getProductSalesRanking(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session?.tenantId && session.accessToken),
  });

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sesion requerida</CardTitle>
          <CardDescription>Inicia sesion para consultar el ranking de productos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/login">Ir al login</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (rankingQuery.isLoading) {
    return <ProductSalesSkeleton />;
  }

  if (rankingQuery.isError || !rankingQuery.data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ranking no disponible</CardTitle>
          <CardDescription>
            No pude cargar el ranking de productos. Revisa la conexion con el API.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ranking = rankingQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Analitica de productos</p>
          <h1 className="mt-1 text-2xl font-semibold">Productos vendidos</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Ranking historico calculado desde facturas emitidas y cobradas. Los productos sin ventas aparecen
            primero en la lista de menos vendidos.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Volver al panel
          </Link>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Productos activos" value={ranking.productCount} />
        <MetricCard label="Con ventas" value={ranking.productsWithSales} />
        <MetricCard label="Sin ventas" value={ranking.productsWithoutSales} />
      </section>

      <ProductSalesTable
        title="Mas vendidos"
        description="Ordenados de mayor a menor por cantidad vendida."
        products={ranking.mostSold}
        icon="up"
      />

      <ProductSalesTable
        title="Menos vendidos"
        description="Ordenados de menor a mayor; incluye productos activos con cero ventas."
        products={ranking.leastSold}
        icon="down"
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <PackageSearch className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSalesTable({
  title,
  description,
  products,
  icon,
}: {
  title: string;
  description: string;
  products: ProductSalesMetric[];
  icon: 'up' | 'down';
}) {
  const Icon = icon === 'up' ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Facturas</TableHead>
                <TableHead className="text-right">Total vendido</TableHead>
                <TableHead>Ultima venta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length ? (
                products.map((product, index) => (
                  <TableRow key={product.productId}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <Link
                        href={`/products?q=${encodeURIComponent(product.sku ?? product.name)}`}
                        className="font-medium text-accent"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {product.sku ?? 'Sin SKU'} {product.brand ? `- ${product.brand}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{product.categoryName}</Badge>
                    </TableCell>
                    <TableCell>{translateProductUnit(product.unit)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatQuantity(product.quantitySold)}
                    </TableCell>
                    <TableCell className="text-right">{product.invoiceCount}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(product.grossAmount)}
                    </TableCell>
                    <TableCell>
                      {product.lastSoldAt ? formatDate(product.lastSoldAt) : 'Sin ventas'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No hay productos activos para mostrar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSalesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 rounded-md bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="h-4 w-28 rounded-sm bg-muted" />
              <div className="mt-3 h-7 w-16 rounded-sm bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="h-80 p-5" />
      </Card>
    </div>
  );
}
