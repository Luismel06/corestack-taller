import type { WorkshopTicket } from './api';

export function workshopQuoteApprovalBlocker(ticket: WorkshopTicket) {
  if (!ticket.lines.length) return 'Agrega al menos un servicio o repuesto a la cotización.';
  return null;
}
