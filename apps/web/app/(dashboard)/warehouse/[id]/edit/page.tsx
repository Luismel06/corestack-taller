import { WarehouseProductForm } from '@/components/operations/warehouse-product-form';

export default async function EditWarehouseProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WarehouseProductForm productId={id} />;
}
