'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Mail, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActionDialog } from '@/components/ui/action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDocumentEmailHistory, sendDocumentEmail } from '@/lib/api';
import type { AuthSession } from '@/lib/auth-session';

export function DocumentEmailDialog({
  open,
  session,
  kind,
  documentId,
  documentNumber,
  customerName,
  defaultEmail,
  onClose,
}: {
  open: boolean;
  session: AuthSession;
  kind: 'quotations' | 'workshop-quotes' | 'invoices';
  documentId: string;
  documentNumber: string;
  customerName: string;
  defaultEmail?: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState(defaultEmail ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const label = kind === 'invoices' ? 'factura / comprobante' : 'cotización';
  const historyKey = ['document-email-history', kind, documentId, session.tenantId];
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: () => getDocumentEmailHistory(session.tenantId, session.accessToken, kind, documentId),
    enabled: open && Boolean(documentId),
  });

  useEffect(() => {
    if (open) {
      setRecipient(defaultEmail ?? '');
      setLocalError(null);
    }
  }, [defaultEmail, documentId, open]);

  const sendMutation = useMutation({
    mutationFn: () => {
      const email = recipient.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indica un correo electrónico válido.');
      return sendDocumentEmail(session.tenantId, session.accessToken, kind, documentId, email);
    },
    onMutate: () => setLocalError(null),
    onSuccess: async (delivery) => {
      toast.success(`${kind === 'invoices' ? 'Factura' : 'Cotización'} enviada correctamente`, { description: delivery.recipient });
      await queryClient.invalidateQueries({ queryKey: historyKey });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : `No se pudo enviar la ${label}.`;
      setLocalError(message);
      toast.error('Error al enviar el correo', { description: message });
    },
  });

  const history = historyQuery.data ?? [];
  const latest = history[0];
  const sent = latest?.action === 'DOCUMENT_EMAIL_SENT';

  return (
    <ActionDialog
      open={open}
      title={`Enviar ${label}`}
      description={`${documentNumber} · ${customerName}. El correo registrado se carga automáticamente y puedes corregirlo antes de enviar.`}
      icon={<Mail className="h-5 w-5" />}
      confirmLabel={sent ? 'Reenviar correo' : 'Enviar correo'}
      cancelLabel="Cerrar"
      isPending={sendMutation.isPending}
      confirmDisabled={!recipient.trim()}
      size="lg"
      onClose={onClose}
      onConfirm={() => sendMutation.mutate()}
    >
      <label className="grid gap-2">
        <Label htmlFor="document-email-recipient">Correo del cliente</Label>
        <Input
          id="document-email-recipient"
          type="email"
          autoComplete="email"
          data-dialog-autofocus
          className="h-12 text-base"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="cliente@correo.com"
        />
      </label>

      {sendMutation.isPending ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm">
          <RotateCw className="h-5 w-5 animate-spin text-primary" />
          Enviando mediante Resend…
        </div>
      ) : sendMutation.isSuccess ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span><strong>Enviado correctamente.</strong><br />Destinatario: {sendMutation.data.recipient} · {new Date(sendMutation.data.sentAt).toLocaleString('es-DO')}</span>
        </div>
      ) : localError ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span><strong>No se pudo enviar.</strong><br />{localError}</span>
        </div>
      ) : null}

      <section className="rounded-lg border border-border">
        <div className="border-b bg-muted/35 px-3 py-2.5">
          <h3 className="text-sm font-semibold">Historial de envíos</h3>
        </div>
        <div className="max-h-44 divide-y overflow-y-auto">
          {historyQuery.isLoading ? <p className="p-3 text-sm text-muted-foreground">Consultando envíos…</p> : null}
          {!historyQuery.isLoading && !history.length ? <p className="p-3 text-sm text-muted-foreground">Este documento todavía no se ha enviado por correo.</p> : null}
          {history.slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 p-3 text-sm">
              {entry.action === 'DOCUMENT_EMAIL_SENT' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{entry.action === 'DOCUMENT_EMAIL_SENT' ? 'Enviado' : 'Error de envío'} · {entry.metadata?.recipient ?? 'Sin destinatario'}</p>
                <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString('es-DO')}{entry.metadata?.error ? ` · ${entry.metadata.error}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </ActionDialog>
  );
}
