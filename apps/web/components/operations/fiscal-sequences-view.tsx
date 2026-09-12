'use client';

import { hasPermission } from '@/lib/authorization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import { createFiscalSequence, getFiscalSequences } from '@/lib/api';
import { getStatusVariant, translateStatus } from '@/lib/display-labels';
import { normalizeDominicanDocument, validateDominicanDocument } from '@/lib/dominican-documents';
import { formatDate } from '@/lib/utils';
import { ModuleHeader } from './module-header';
import { SessionRequired, useCurrentSession } from './session-required';

const fiscalDocumentTypes = [
  {
    value: 'FISCAL_CREDIT_01',
    label: 'Factura de crédito fiscal B01',
    prefix: 'B01',
    requiresRnc: true,
    description: 'NCF local para empresas o contratistas que necesitan sustentar el gasto.',
  },
  {
    value: 'CONSUMER_02',
    label: 'Factura de consumo B02',
    prefix: 'B02',
    requiresRnc: false,
    description: 'NCF local para consumidores finales y compras regulares.',
  },
  {
    value: 'FISCAL_CREDIT_ELECTRONIC_31',
    label: 'Factura de crédito fiscal electrónica E31',
    prefix: 'E31',
    requiresRnc: true,
    description: 'e-CF que requiere solicitar el RNC del cliente.',
  },
  {
    value: 'CONSUMER_ELECTRONIC_32',
    label: 'Factura de consumo electrónica E32',
    prefix: 'E32',
    requiresRnc: false,
    description: 'e-CF para consumidores finales.',
  },
] as const;

type OperationalFiscalDocumentType = (typeof fiscalDocumentTypes)[number]['value'];

type SequenceForm = {
  documentType: OperationalFiscalDocumentType;
  startNumber: string;
  endNumber: string;
  nextNumber: string;
  authorizationNumber: string;
  validUntil: string;
  issuerDocumentType: 'RNC' | 'CEDULA';
  issuerDocumentNumber: string;
};

export function FiscalSequencesView() {
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const sequencesQuery = useQuery({
    queryKey: ['fiscal-sequences', session?.tenantId],
    queryFn: () => getFiscalSequences(session?.tenantId ?? '', session?.accessToken ?? ''),
    enabled: Boolean(session),
  });
  const [form, setForm] = useState<SequenceForm>({
    documentType: 'CONSUMER_02',
    startNumber: '1',
    endNumber: '1',
    nextNumber: '1',
    authorizationNumber: '',
    validUntil: '',
    issuerDocumentType: 'RNC',
    issuerDocumentNumber: '',
  });

  const sequences = sequencesQuery.data ?? [];
  const selectedType = fiscalDocumentTypes.find((type) => type.value === form.documentType)!;
  const suggestedStart = useMemo(() => {
    const previousBlocks = sequences.filter(
      (sequence) => sequence.documentType === form.documentType,
    );
    return previousBlocks.length
      ? Math.max(...previousBlocks.map((sequence) => sequence.endNumber)) + 1
      : 1;
  }, [form.documentType, sequences]);
  const hasActiveBlock = sequences.some(
    (sequence) => sequence.documentType === form.documentType && sequence.status === 'ACTIVE',
  );
  const canManage = hasPermission(session, 'settings.fiscal');

  const createMutation = useMutation({
    mutationFn: (input: {
      documentType: OperationalFiscalDocumentType;
      startNumber: number;
      endNumber: number;
      nextNumber: number;
      authorizationNumber?: string;
      validUntil?: string;
      issuerDocumentType: 'RNC' | 'CEDULA';
      issuerDocumentNumber: string;
    }) => {
      if (!session) throw new Error('Sesión requerida.');
      return createFiscalSequence(session.tenantId, session.accessToken, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fiscal-sequences'] });
      toast.success('Bloque autorizado registrado.');
      const nextSuggested = suggestedStart;
      setForm((current) => ({
        ...current,
        startNumber: String(nextSuggested),
        endNumber: String(nextSuggested),
        nextNumber: String(nextSuggested),
        authorizationNumber: '',
        validUntil: '',
      }));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el bloque.');
    },
  });

  if (!session) return <SessionRequired session={session} />;

  function changeDocumentType(documentType: OperationalFiscalDocumentType) {
    const priorBlocks = sequences.filter((sequence) => sequence.documentType === documentType);
    const start = priorBlocks.length
      ? Math.max(...priorBlocks.map((sequence) => sequence.endNumber)) + 1
      : 1;

    setForm((current) => ({
      documentType,
      startNumber: String(start),
      endNumber: String(start),
      nextNumber: String(start),
      authorizationNumber: '',
      validUntil: '',
      issuerDocumentType: current.issuerDocumentType,
      issuerDocumentNumber: current.issuerDocumentNumber,
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startNumber = Number(form.startNumber);
    const endNumber = Number(form.endNumber);
    const nextNumber = Number(form.nextNumber);

    if (!validateDominicanDocument(form.issuerDocumentType, form.issuerDocumentNumber)) {
      toast.error(
        form.issuerDocumentType === 'RNC'
          ? 'El RNC del emisor no es válido.'
          : 'La cédula del emisor no es válida.',
      );
      return;
    }

    if (
      !Number.isInteger(startNumber) ||
      !Number.isInteger(endNumber) ||
      !Number.isInteger(nextNumber)
    ) {
      toast.error('Los números del bloque deben ser enteros válidos.');
      return;
    }

    createMutation.mutate({
      documentType: form.documentType,
      startNumber,
      endNumber,
      nextNumber,
      authorizationNumber: form.authorizationNumber.trim(),
      ...(form.validUntil ? { validUntil: form.validUntil } : {}),
      issuerDocumentType: form.issuerDocumentType,
      issuerDocumentNumber: normalizeDominicanDocument(form.issuerDocumentNumber),
    });
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Secuencias fiscales"
        description="Bloques NCF B01/B02 y e-CF E31/E32 autorizados por DGII. E31/E32 se emiten como simulación hasta configurar firma y envío."
      />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Agregar un nuevo bloque autorizado</CardTitle>
            <CardDescription>
              Cada autorización se conserva como un bloque independiente. Nunca se amplía ni se
              reinicia un rango que ya fue registrado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-semibold">
                {hasActiveBlock
                  ? 'Ya hay un bloque activo para este tipo: el nuevo quedará en espera.'
                  : 'No hay un bloque activo para este tipo: el nuevo se activará de inmediato.'}
              </p>
              <p className="mt-1 text-muted-foreground">
                Copia exactamente el rango autorizado por DGII. El siguiente número puede ser mayor
                que el inicio si ya lo utilizaste fuera del sistema. Los rangos nunca pueden
                solaparse.
              </p>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="fiscal-document-type">Tipo</Label>
                  <select
                    id="fiscal-document-type"
                    value={form.documentType}
                    onChange={(event) =>
                      changeDocumentType(event.target.value as OperationalFiscalDocumentType)
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {fiscalDocumentTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {selectedType.description}
                  </p>
                </div>
                <NumericField
                  id="fiscal-start-number"
                  label="Número desde"
                  value={form.startNumber}
                  onChange={(startNumber) => setForm((current) => ({ ...current, startNumber }))}
                  hint={`Sugerido según el historial: ${suggestedStart}`}
                />
                <NumericField
                  id="fiscal-end-number"
                  label="Número hasta"
                  value={form.endNumber}
                  onChange={(endNumber) => setForm((current) => ({ ...current, endNumber }))}
                />
                <NumericField
                  id="fiscal-next-number"
                  label="Siguiente a utilizar"
                  value={form.nextNumber}
                  onChange={(nextNumber) => setForm((current) => ({ ...current, nextNumber }))}
                  hint="Déjalo igual al inicio salvo que ya hayas usado números fuera del sistema."
                />
                <div className="space-y-2">
                  <Label htmlFor="fiscal-issuer-document-type">Documento del emisor</Label>
                  <select
                    id="fiscal-issuer-document-type"
                    value={form.issuerDocumentType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        issuerDocumentType: event.target.value as 'RNC' | 'CEDULA',
                        issuerDocumentNumber: '',
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="RNC">RNC</option>
                    <option value="CEDULA">Cédula</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscal-issuer-document-number">
                    {form.issuerDocumentType === 'RNC' ? 'RNC del emisor' : 'Cédula del emisor'}
                  </Label>
                  <Input
                    id="fiscal-issuer-document-number"
                    inputMode="numeric"
                    value={form.issuerDocumentNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        issuerDocumentNumber: event.target.value,
                      }))
                    }
                    placeholder={
                      form.issuerDocumentType === 'RNC' ? '1-01-00000-1' : '001-0000000-1'
                    }
                    required
                  />
                  {form.issuerDocumentNumber ? (
                    <p
                      className={
                        validateDominicanDocument(
                          form.issuerDocumentType,
                          form.issuerDocumentNumber,
                        )
                          ? 'text-xs text-success'
                          : 'text-xs text-danger'
                      }
                    >
                      {validateDominicanDocument(form.issuerDocumentType, form.issuerDocumentNumber)
                        ? 'Documento válido.'
                        : 'Verifica el dígito verificador dominicano.'}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscal-authorization">
                    No. autorización DGII {selectedType.requiresRnc ? '' : '(si DGII la indica)'}
                  </Label>
                  <Input
                    id="fiscal-authorization"
                    value={form.authorizationNumber}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        authorizationNumber: event.target.value,
                      }))
                    }
                    required={selectedType.requiresRnc}
                    maxLength={80}
                    placeholder="Ej.: 6005410462"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscal-valid-until">
                    Válida hasta {selectedType.requiresRnc ? '' : '(si DGII la indica)'}
                  </Label>
                  <Input
                    id="fiscal-valid-until"
                    type="date"
                    value={form.validUntil}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, validUntil: event.target.value }))
                    }
                    required={selectedType.requiresRnc}
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedType.requiresRnc
                  ? `${selectedType.prefix} requiere solicitar y registrar el RNC del cliente antes de facturar.`
                  : `${selectedType.prefix} es para consumidor final; no requiere RNC ni permite sustentar crédito fiscal.`}
              </p>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando bloque...' : 'Agregar bloque autorizado'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          Solo los usuarios autorizados pueden agregar bloques fiscales. Puedes consultar el
          historial y los bloques activos a continuación.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bloques fiscales registrados</CardTitle>
          <CardDescription>
            POS consume únicamente el bloque activo. Al agotarse, el siguiente bloque válido en
            espera se activa automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table wrapperClassName="overflow-auto rounded-md border border-border">
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Prefijo</TableHead>
                <TableHead>Siguiente</TableHead>
                <TableHead>Final</TableHead>
                <TableHead>Restantes</TableHead>
                <TableHead className="min-w-32">Progreso</TableHead>
                <TableHead>RNC/Cédula emisor</TableHead>
                <TableHead>Autorización</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sequences.map((sequence) => {
                const total = sequence.endNumber - sequence.startNumber + 1;
                const used = Math.min(
                  Math.max(sequence.nextNumber - sequence.startNumber, 0),
                  total,
                );
                const remaining = Math.max(sequence.endNumber - sequence.nextNumber + 1, 0);
                const progress = total > 0 ? Math.round((used / total) * 100) : 0;

                return (
                  <TableRow key={sequence.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {getFiscalTypeLabel(sequence.documentType)}
                    </TableCell>
                    <TableCell>{sequence.prefix}</TableCell>
                    <TableCell className="font-medium">
                      {formatFiscalNumber(sequence.prefix, sequence.nextNumber)}
                    </TableCell>
                    <TableCell>{formatFiscalNumber(sequence.prefix, sequence.endNumber)}</TableCell>
                    <TableCell>{remaining}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">
                          {used} usados · {progress}%
                        </span>
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {sequence.issuerDocumentNumber
                        ? `${sequence.issuerDocumentType ?? 'RNC'} ${sequence.issuerDocumentNumber}`
                        : '-'}
                    </TableCell>
                    <TableCell>{sequence.authorizationNumber ?? '-'}</TableCell>
                    <TableCell>
                      {sequence.validUntil ? formatDate(sequence.validUntil) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(sequence.status)}>
                        {sequence.status === 'INACTIVE'
                          ? 'En espera'
                          : translateStatus(sequence.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!sequences.length ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    Aún no hay bloques fiscales registrados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NumericField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function getFiscalTypeLabel(documentType: string) {
  return fiscalDocumentTypes.find((type) => type.value === documentType)?.label ?? documentType;
}

function formatFiscalNumber(prefix: string, number: number) {
  const digits = prefix === 'BA' ? 4 : prefix === 'B01' || prefix === 'B02' ? 8 : 10;
  return `${prefix}${String(number).padStart(digits, '0')}`;
}
