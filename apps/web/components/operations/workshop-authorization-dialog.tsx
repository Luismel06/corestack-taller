'use client';

import { useId, useState } from 'react';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { WorkshopAuthorizationEvidence } from '@/lib/api';

export type AuthorizationResponse = WorkshopAuthorizationEvidence & {
  status: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
  approvedLineIds: string[];
  note?: string;
};

export function WorkshopAuthorizationDialog({
  title,
  customerName,
  lines,
  allowPartial = true,
  initiallyRejected = false,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  customerName: string;
  lines: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    total: string;
  }>;
  allowPartial?: boolean;
  initiallyRejected?: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (response: AuthorizationResponse) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(() =>
    initiallyRejected ? [] : lines.map((line) => line.id),
  );
  const [authorizedByName, setAuthorizedByName] = useState(customerName);
  const [method, setMethod] = useState<WorkshopAuthorizationEvidence['method']>('IN_PERSON');
  const [note, setNote] = useState('');
  const all = selected.length === lines.length;
  const status = !selected.length ? 'REJECTED' : all ? 'APPROVED' : 'PARTIALLY_APPROVED';
  const total = lines
    .filter((line) => selected.includes(line.id))
    .reduce((sum, line) => sum + Number(line.total), 0);

  return (
    <ActionDialog
      open
      title={title}
      size="lg"
      description="Registra la respuesta que recibiste del cliente y revisa los trabajos autorizados."
      confirmLabel={
        status === 'REJECTED'
          ? 'Registrar rechazo'
          : status === 'PARTIALLY_APPROVED'
            ? 'Registrar aprobación parcial'
            : 'Registrar aprobación'
      }
      isPending={pending}
      confirmDisabled={!authorizedByName.trim() || !lines.length}
      onClose={onClose}
      onConfirm={() =>
        onSubmit({
          status,
          approvedLineIds: selected,
          authorizedByName: authorizedByName.trim(),
          method,
          note: note.trim() || undefined,
        })
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelected(lines.map((line) => line.id))}
        >
          Aprobar todo
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSelected([])}>
          Rechazar todo
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {lines.map((line) => (
          <label key={line.id} className="flex items-start gap-3 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
              checked={selected.includes(line.id)}
              disabled={pending || !allowPartial}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, line.id]
                    : current.filter((value) => value !== line.id),
                )
              }
            />
            <span className="min-w-0 flex-1 break-words">
              {line.description}
              <span className="mt-1 block text-xs text-muted-foreground">
                {line.quantity} × {formatCurrency(Number(line.unitPrice))}
              </span>
            </span>
            <span className="shrink-0 font-medium">{formatCurrency(Number(line.total))}</span>
          </label>
        ))}
      </div>
      <p className="flex flex-wrap justify-between gap-2 text-sm">
        <span>
          {selected.length} de {lines.length} trabajos autorizados · Base sin ITBIS
        </span>
        <strong>{formatCurrency(total)}</strong>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>Persona que respondió</Label>
          <Input
            id={`${id}-name`}
            required
            maxLength={160}
            value={authorizedByName}
            onChange={(event) => setAuthorizedByName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-method`}>Medio de autorización</Label>
          <select
            id={`${id}-method`}
            className="input-select"
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as WorkshopAuthorizationEvidence['method'])
            }
          >
            <option value="IN_PERSON">Presencial</option>
            <option value="PHONE">Teléfono</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Correo</option>
            <option value="DIGITAL">Documento digital</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-note`}>Comentario o referencia de la autorización</Label>
        <textarea
          id={`${id}-note`}
          className="input-textarea w-full"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ej.: cliente confirma por teléfono; acepta frenos y deja la suspensión pendiente."
        />
      </div>
    </ActionDialog>
  );
}
