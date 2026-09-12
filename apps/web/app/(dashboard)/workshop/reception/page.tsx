import { redirect } from 'next/navigation';

export default async function WorkshopReceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string }>;
}) {
  const { ticket } = await searchParams;
  redirect(ticket ? `/workshop?ticket=${encodeURIComponent(ticket)}` : '/workshop/agenda');
}
