import type { WorkshopTicket } from './api';

export function workshopQuoteApprovalBlocker(ticket: WorkshopTicket) {
  if (!ticket.inspection) return 'Completa la inspección técnica en Diagnóstico.';
  if (!ticket.lines.length) return 'Agrega al menos un servicio o repuesto a la cotización.';
  if (
    ticket.tasks.some(
      (task) => task.kind === 'DIAGNOSIS' && !['COMPLETED', 'CANCELLED'].includes(task.status),
    )
  ) {
    return 'Completa las tareas de diagnóstico pendientes.';
  }
  return null;
}
