import { WorkshopQuotationPrint } from '@/components/operations/workshop-quotation-print';

export default async function WorkshopQuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoPrint?: string }>;
}) {
  const { id } = await params;
  const { autoPrint } = await searchParams;

  return <WorkshopQuotationPrint ticketId={id} autoPrint={autoPrint === '1'} />;
}
