'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link2,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  WorkshopVehicleAreaCondition,
  WorkshopVehicleAreaFinding,
  WorkshopVehicleType,
} from '@/lib/api';
import {
  preferredVehicleViews,
  VEHICLE_AREA_LABELS,
  VEHICLE_HOTSPOTS,
  VEHICLE_MAP_VIEWS,
  VEHICLE_VIEW_ASPECTS,
  VEHICLE_VIEW_ASSETS,
  type VehicleMapHotspot,
  type VehicleMapView,
} from './vehicle-damage-map-config';

type RelatedLine = {
  description: string;
  type: 'LABOR' | 'PART' | 'OTHER';
  vehicleAreaId?: string | null;
  quantity?: string | number;
  unitPrice?: string | number;
};

type CatalogPart = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  price: string;
  salePrice: string;
};

type CatalogService = {
  id: string;
  name: string;
  code: string;
  category: string | null;
  defaultPrice: string;
};

const conditionOptions: Array<{
  value: WorkshopVehicleAreaCondition;
  label: string;
  icon: typeof CheckCircle2;
}> = [
  { value: 'OK', label: 'Correcto', icon: CheckCircle2 },
  { value: 'ATTENTION', label: 'Con atención', icon: AlertTriangle },
  { value: 'REPAIR', label: 'Por reparar', icon: Wrench },
];

const conditionLabel: Record<WorkshopVehicleAreaCondition, string> = {
  OK: 'Correcto',
  ATTENTION: 'Con atención',
  REPAIR: 'Por reparar',
};

const conditionClass: Record<WorkshopVehicleAreaCondition, string> = {
  OK: 'border-emerald-500 bg-emerald-400/35 text-emerald-800',
  ATTENTION: 'border-amber-500 bg-amber-400/40 text-amber-900',
  REPAIR: 'border-rose-500 bg-rose-400/40 text-rose-900',
};

const conditionFill: Record<WorkshopVehicleAreaCondition, string> = {
  OK: '#22c55e',
  ATTENTION: '#f59e0b',
  REPAIR: '#ef4444',
};

function HotspotShape({ hotspot }: { hotspot: VehicleMapHotspot }) {
  const shape = hotspot.shape;
  if (shape.kind === 'ellipse') {
    return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
  }
  if (shape.kind === 'polygon') return <polygon points={shape.points} />;
  return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
}

function VehicleView({
  vehicleType,
  view,
  findings,
  selectedAreaId,
  onSelect,
  compact = false,
  className = '',
}: {
  vehicleType: WorkshopVehicleType;
  view: VehicleMapView;
  findings: WorkshopVehicleAreaFinding[];
  selectedAreaId?: string | null;
  onSelect?: (areaId: string, view: VehicleMapView) => void;
  compact?: boolean;
  className?: string;
}) {
  const byArea = new Map(findings.map((finding) => [finding.areaId, finding]));
  const viewLabel = VEHICLE_MAP_VIEWS.find((item) => item.id === view)?.label ?? view;
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${compact ? 'p-2' : 'p-3'} ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold uppercase tracking-wide text-slate-500`}
        >
          {viewLabel}
        </p>
        {!compact ? <span className="text-[10px] text-slate-400">Selecciona una zona</span> : null}
      </div>
      <div
        className={`relative mx-auto overflow-hidden rounded-lg bg-slate-50 ${view === 'top' ? 'max-w-[15rem]' : ''}`}
        style={{ aspectRatio: VEHICLE_VIEW_ASPECTS[vehicleType][view] }}
      >
        {/* These illustrations are project assets and form the visual base of the interactive map. */}
        <img
          src={VEHICLE_VIEW_ASSETS[vehicleType][view]}
          alt={`Vehículo visto desde ${viewLabel.toLowerCase()}`}
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-label={`Zonas del vehículo: ${viewLabel}`}
        >
          {VEHICLE_HOTSPOTS[vehicleType][view].map((hotspot) => {
            const finding = byArea.get(hotspot.areaId);
            const selected = selectedAreaId === hotspot.areaId;
            return (
              <g
                key={`${view}-${hotspot.areaId}`}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={VEHICLE_AREA_LABELS[hotspot.areaId]}
                onClick={() => onSelect?.(hotspot.areaId, view)}
                onKeyDown={(event) => {
                  if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    onSelect(hotspot.areaId, view);
                  }
                }}
                className={onSelect ? 'cursor-pointer outline-none' : undefined}
                fill={finding ? conditionFill[finding.condition] : '#2563eb'}
                fillOpacity={finding ? 0.34 : selected ? 0.2 : 0.04}
                stroke={
                  selected ? '#0f172a' : finding ? conditionFill[finding.condition] : '#2563eb'
                }
                strokeWidth={selected ? 1.4 : finding ? 0.9 : 0.45}
                strokeDasharray={finding ? undefined : '2 1.5'}
                vectorEffect="non-scaling-stroke"
              >
                <title>{VEHICLE_AREA_LABELS[hotspot.areaId]}</title>
                <HotspotShape hotspot={hotspot} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function VehicleDamageMap({
  vehicleType,
  findings,
  lines,
  readOnly,
  parts = [],
  services = [],
  catalogLoading = false,
  onChange,
  onAddPart,
  onAddService,
  onCreatePart,
  onCreateService,
  onResetArea,
}: {
  vehicleType?: WorkshopVehicleType | null;
  findings: WorkshopVehicleAreaFinding[];
  lines: RelatedLine[];
  readOnly?: boolean;
  parts?: CatalogPart[];
  services?: CatalogService[];
  catalogLoading?: boolean;
  onChange: (findings: WorkshopVehicleAreaFinding[]) => void;
  onAddPart?: (areaId: string, productId: string) => void;
  onAddService?: (areaId: string, serviceId: string) => void;
  onCreatePart?: (areaId: string) => void;
  onCreateService?: (areaId: string) => void;
  onResetArea: (areaId: string) => void;
}) {
  const normalizedType: WorkshopVehicleType = vehicleType === 'SUV' ? 'SUV' : 'CAR';
  const [selected, setSelected] = useState<{ areaId: string; view: VehicleMapView } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draftCondition, setDraftCondition] = useState<WorkshopVehicleAreaCondition>('ATTENTION');
  const [draftFinding, setDraftFinding] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const selectedFinding = findings.find((item) => item.areaId === selected?.areaId);
  const relatedLines = lines.filter((line) => line.vehicleAreaId === selected?.areaId);
  const relatedTotal = relatedLines.reduce(
    (sum, line) => sum + Number(line.quantity ?? 1) * Number(line.unitPrice ?? 0),
    0,
  );
  const viewLayout: Array<{ view: VehicleMapView; className: string }> = [
    { view: 'top', className: 'xl:col-start-1 xl:row-start-1 xl:row-span-2' },
    { view: 'back', className: 'xl:col-start-2 xl:row-start-1' },
    { view: 'front', className: 'xl:col-start-3 xl:row-start-1' },
    { view: 'left', className: 'xl:col-start-2 xl:row-start-2' },
    { view: 'right', className: 'xl:col-start-3 xl:row-start-2' },
  ];

  const updateSelected = (
    patch: Partial<Pick<WorkshopVehicleAreaFinding, 'condition' | 'finding' | 'notes'>>,
  ) => {
    if (!selected) return;
    const existing = findings.find((item) => item.areaId === selected.areaId);
    const next: WorkshopVehicleAreaFinding = {
      areaId: selected.areaId,
      areaLabel: VEHICLE_AREA_LABELS[selected.areaId],
      view: selected.view,
      condition: existing?.condition ?? 'ATTENTION',
      finding: existing?.finding ?? null,
      notes: existing?.notes ?? null,
      ...existing,
      ...patch,
    };
    onChange(
      existing
        ? findings.map((item) => (item.areaId === next.areaId ? next : item))
        : [...findings, next],
    );
  };

  const selectArea = (areaId: string, view: VehicleMapView) => {
    const existing = findings.find((item) => item.areaId === areaId);
    setSelected({ areaId, view });
    if (readOnly) return;
    setDraftCondition(existing?.condition ?? 'ATTENTION');
    setDraftFinding(existing?.finding ?? '');
    setDraftNotes(existing?.notes ?? '');
    setCatalogSearch('');
    setWizardStep(0);
    setWizardOpen(true);
  };

  const saveWizardFinding = () => {
    if (!selected) return;
    updateSelected({
      condition: draftCondition,
      finding: draftFinding.trim() || null,
      notes: draftNotes.trim() || null,
    });
  };

  const normalizedSearch = catalogSearch.trim().toLowerCase();
  const matchingParts = normalizedSearch
    ? parts
        .filter((part) =>
          [part.name, part.sku]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalizedSearch)),
        )
        .slice(0, 6)
    : [];
  const matchingServices = normalizedSearch
    ? services
        .filter((service) =>
          [service.name, service.code, service.category]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(normalizedSearch)),
        )
        .slice(0, 6)
    : [];

  const resetSelected = () => {
    if (!selected) return;
    if (
      relatedLines.length > 0 &&
      !window.confirm(
        'Esta zona tiene partidas relacionadas. Se conservarán, pero quedarán sin zona. ¿Continuar?',
      )
    ) {
      return;
    }
    onChange(findings.filter((item) => item.areaId !== selected.areaId));
    onResetArea(selected.areaId);
  };

  return (
    <section className="rounded-xl border bg-slate-50/70 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Mapa de daños del vehículo</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Selecciona una zona para registrar su condición y relacionar servicios o repuestos.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {conditionOptions.map(({ value, label }) => (
            <span
              key={value}
              className={`rounded-full border px-2 py-1 text-[10px] font-medium ${conditionClass[value]}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(11rem,0.72fr)_repeat(2,minmax(0,1fr))] xl:grid-rows-2">
          {viewLayout.map(({ view, className }) => (
            <VehicleView
              key={view}
              vehicleType={normalizedType}
              view={view}
              findings={findings}
              selectedAreaId={selected?.areaId}
              onSelect={selectArea}
              className={`h-full ${className}`}
            />
          ))}
        </div>

        <aside className="rounded-xl border bg-white p-3">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Resumen de la zona
                  </p>
                  <h5 className="mt-1 font-semibold text-slate-950">
                    {VEHICLE_AREA_LABELS[selected.areaId]}
                  </h5>
                </div>
                {selectedFinding ? (
                  <Badge className={conditionClass[selectedFinding.condition]}>
                    {conditionLabel[selectedFinding.condition]}
                  </Badge>
                ) : null}
              </div>

              <div className="grid gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-500">Hallazgo</p>
                  <p className="mt-1 leading-5 text-slate-800">
                    {selectedFinding?.finding || 'Sin hallazgo registrado.'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-500">Nota técnica</p>
                  <p className="mt-1 leading-5 text-slate-800">
                    {selectedFinding?.notes || 'Sin nota técnica.'}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Repuestos y servicios</p>
                    <p className="text-[10px] text-muted-foreground">Relacionados con esta zona</p>
                  </div>
                  <Badge variant="outline">{relatedLines.length}</Badge>
                </div>
                {relatedLines.length ? (
                  <div className="space-y-2">
                    {relatedLines.map((line, index) => (
                      <div
                        key={`${line.description}-${index}`}
                        className="rounded-lg border bg-white p-2.5 text-xs shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 gap-2 font-medium text-slate-900">
                            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                            <span>{line.description}</span>
                          </span>
                          <Badge variant="outline" className="shrink-0 text-[9px]">
                            {line.type === 'PART'
                              ? 'Repuesto'
                              : line.type === 'LABOR'
                                ? 'Servicio'
                                : 'Otro'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex justify-between border-t pt-2 text-muted-foreground">
                          <span>Cant. {Number(line.quantity ?? 1)}</span>
                          <strong className="text-slate-900">
                            RD${' '}
                            {(
                              Number(line.quantity ?? 1) * Number(line.unitPrice ?? 0)
                            ).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-lg bg-slate-950 px-3 py-2.5 text-xs text-white">
                      <span>Total de la zona</span>
                      <strong>
                        RD$ {relatedTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    Sin servicios ni repuestos relacionados.
                  </p>
                )}
              </div>

              {!readOnly ? (
                <div className="grid gap-2 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const existing = findings.find((item) => item.areaId === selected.areaId);
                      setDraftCondition(existing?.condition ?? 'ATTENTION');
                      setDraftFinding(existing?.finding ?? '');
                      setDraftNotes(existing?.notes ?? '');
                      setWizardStep(existing ? 3 : 0);
                      setWizardOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />{' '}
                    {selectedFinding ? 'Agregar otra partida' : 'Completar zona'}
                  </Button>
                  {selectedFinding ? (
                    <Button type="button" size="sm" variant="outline" onClick={resetSelected}>
                      <RotateCcw className="h-4 w-4" /> Restablecer zona
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-3 text-center">
              <Wrench className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Selecciona una zona</p>
              <p className="mt-1 text-xs text-muted-foreground">
                El detalle técnico aparecerá aquí.
              </p>
            </div>
          )}
        </aside>
      </div>

      {findings.length ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {findings.map((finding) => (
            <button
              key={finding.areaId}
              type="button"
              onClick={() => setSelected({ areaId: finding.areaId, view: finding.view })}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${conditionClass[finding.condition]}`}
            >
              {finding.areaLabel} · {conditionLabel[finding.condition]}
            </button>
          ))}
        </div>
      ) : null}
      {wizardOpen && selected && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
              <section
                role="dialog"
                aria-modal="true"
                aria-label={`Inspeccionar ${VEHICLE_AREA_LABELS[selected.areaId]}`}
                className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
              >
                <header className="shrink-0 border-b bg-slate-50 px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                        Mapa de daños · {VEHICLE_AREA_LABELS[selected.areaId]}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-950">
                        {
                          ['Condición', 'Hallazgo', 'Nota técnica', 'Agregar repuesto o servicio'][
                            wizardStep
                          ]
                        }
                      </h3>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setWizardOpen(false)}
                      aria-label="Cerrar asistente"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {['Condición', 'Hallazgo', 'Nota técnica', 'Partidas'].map((label, index) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          if (index === 3) saveWizardFinding();
                          setWizardStep(index);
                        }}
                        className="text-left"
                      >
                        <span
                          className={`block h-1.5 rounded-full ${index <= wizardStep ? 'bg-slate-950' : 'bg-slate-200'}`}
                        />
                        <span
                          className={`mt-1.5 hidden text-[10px] font-medium sm:block ${index === wizardStep ? 'text-slate-950' : 'text-slate-400'}`}
                        >
                          {index + 1}. {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                  {wizardStep === 0 ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {conditionOptions.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setDraftCondition(value)}
                          className={`flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl border-2 p-4 text-sm font-semibold transition ${
                            draftCondition === value
                              ? conditionClass[value]
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="h-7 w-7" /> {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {wizardStep === 1 ? (
                    <label className="block space-y-2 text-sm font-semibold text-slate-800">
                      ¿Qué encontraste en esta zona?
                      <textarea
                        autoFocus
                        className="input-textarea min-h-40 bg-white text-sm font-normal"
                        value={draftFinding}
                        onChange={(event) => setDraftFinding(event.target.value)}
                        placeholder="Ej.: Golpe visible, desgaste, pieza floja o ruido identificado"
                      />
                      <span className="block text-xs font-normal text-muted-foreground">
                        Describe el hallazgo de forma clara para que también pueda mostrarse al
                        cliente.
                      </span>
                    </label>
                  ) : null}

                  {wizardStep === 2 ? (
                    <label className="block space-y-2 text-sm font-semibold text-slate-800">
                      Nota técnica
                      <textarea
                        autoFocus
                        className="input-textarea min-h-40 bg-white text-sm font-normal"
                        value={draftNotes}
                        onChange={(event) => setDraftNotes(event.target.value)}
                        placeholder="Ej.: Recomendación, procedimiento sugerido o detalle para el mecánico"
                      />
                      <span className="block text-xs font-normal text-muted-foreground">
                        Esta nota complementa el diagnóstico de la zona seleccionada.
                      </span>
                    </label>
                  ) : null}

                  {wizardStep === 3 ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          autoFocus
                          className="h-12 w-full rounded-xl border bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          value={catalogSearch}
                          onChange={(event) => setCatalogSearch(event.target.value)}
                          placeholder="Buscar repuesto o servicio por nombre, SKU o código"
                        />
                        {catalogLoading ? (
                          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <section className="rounded-xl border bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-semibold">Repuestos</h4>
                              <p className="text-[11px] text-muted-foreground">
                                Descuentan inventario
                              </p>
                            </div>
                            {onCreatePart ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onCreatePart(selected.areaId)}
                              >
                                <Plus className="h-3.5 w-3.5" /> Crear
                              </Button>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {!normalizedSearch ? (
                              <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-muted-foreground">
                                Escribe para buscar repuestos.
                              </p>
                            ) : matchingParts.length ? (
                              matchingParts.map((part) => (
                                <button
                                  key={part.id}
                                  type="button"
                                  onClick={() => {
                                    saveWizardFinding();
                                    onAddPart?.(selected.areaId, part.id);
                                    setCatalogSearch('');
                                  }}
                                  className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm"
                                >
                                  <span className="min-w-0">
                                    <strong className="block truncate text-sm">{part.name}</strong>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                      {part.sku ?? 'Sin SKU'} · Stock {part.stock}
                                    </span>
                                  </span>
                                  <strong className="shrink-0 text-xs">
                                    RD${' '}
                                    {Number(
                                      Number(part.salePrice) > 0 ? part.salePrice : part.price,
                                    ).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                  </strong>
                                </button>
                              ))
                            ) : (
                              <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-muted-foreground">
                                No hay repuestos coincidentes.
                              </p>
                            )}
                          </div>
                        </section>

                        <section className="rounded-xl border bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-semibold">Servicios</h4>
                              <p className="text-[11px] text-muted-foreground">
                                Mano de obra y servicios
                              </p>
                            </div>
                            {onCreateService ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onCreateService(selected.areaId)}
                              >
                                <Plus className="h-3.5 w-3.5" /> Crear
                              </Button>
                            ) : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {!normalizedSearch ? (
                              <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-muted-foreground">
                                Escribe para buscar servicios.
                              </p>
                            ) : matchingServices.length ? (
                              matchingServices.map((service) => (
                                <button
                                  key={service.id}
                                  type="button"
                                  onClick={() => {
                                    saveWizardFinding();
                                    onAddService?.(selected.areaId, service.id);
                                    setCatalogSearch('');
                                  }}
                                  className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm"
                                >
                                  <span className="min-w-0">
                                    <strong className="block truncate text-sm">
                                      {service.name}
                                    </strong>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                      {service.code} · {service.category ?? 'Servicio general'}
                                    </span>
                                  </span>
                                  <strong className="shrink-0 text-xs">
                                    RD${' '}
                                    {Number(service.defaultPrice).toLocaleString('es-DO', {
                                      minimumFractionDigits: 2,
                                    })}
                                  </strong>
                                </button>
                              ))
                            ) : (
                              <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-muted-foreground">
                                No hay servicios coincidentes.
                              </p>
                            )}
                          </div>
                        </section>
                      </div>

                      {relatedLines.length ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-blue-700" />
                              <p className="text-sm font-semibold text-blue-950">
                                Agregado a {VEHICLE_AREA_LABELS[selected.areaId]}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-white">
                              {relatedLines.length}
                            </Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {relatedLines.map((line, index) => (
                              <span
                                key={`${line.description}-${index}`}
                                className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-900"
                              >
                                {line.description}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-slate-50 px-5 py-4 sm:px-6">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={wizardStep === 0}
                    onClick={() => setWizardStep((current) => Math.max(0, current - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Atrás
                  </Button>
                  {wizardStep < 3 ? (
                    <Button
                      type="button"
                      onClick={() => {
                        if (wizardStep === 2) saveWizardFinding();
                        setWizardStep((current) => Math.min(3, current + 1));
                      }}
                    >
                      Continuar <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        saveWizardFinding();
                        setWizardOpen(false);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Finalizar zona
                    </Button>
                  )}
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

export function VehicleDamagePrintMap({
  vehicleType,
  findings,
}: {
  vehicleType?: WorkshopVehicleType | null;
  findings: WorkshopVehicleAreaFinding[];
}) {
  const normalizedType: WorkshopVehicleType = vehicleType === 'SUV' ? 'SUV' : 'CAR';
  const views = useMemo(
    () =>
      preferredVehicleViews(
        normalizedType,
        findings.map((finding) => finding.areaId),
        2,
      ),
    [findings, normalizedType],
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {views.map((view) => (
        <VehicleView
          key={view}
          vehicleType={normalizedType}
          view={view}
          findings={findings}
          compact
        />
      ))}
    </div>
  );
}
