'use client';

import JsBarcode from 'jsbarcode';
import { Barcode, Download, Printer, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { brand } from '@/lib/brand';
import { openBarcodeLabelPrintWindow, printBarcodeLabel } from '@/lib/barcode-label-print';
import { ModuleHeader } from './module-header';

const barcodeFormats = [
  { value: 'CODE128', label: 'Code 128 · recomendado', hint: 'Admite letras, números y símbolos.' },
  { value: 'CODE39', label: 'Code 39', hint: 'Para códigos alfanuméricos simples.' },
  { value: 'EAN13', label: 'EAN-13', hint: 'Debe contener exactamente 12 o 13 dígitos.' },
  { value: 'EAN8', label: 'EAN-8', hint: 'Debe contener exactamente 7 u 8 dígitos.' },
  { value: 'UPC', label: 'UPC-A', hint: 'Debe contener exactamente 11 o 12 dígitos.' },
  { value: 'ITF14', label: 'ITF-14', hint: 'Debe contener exactamente 13 o 14 dígitos.' },
] as const;

type BarcodeFormat = (typeof barcodeFormats)[number]['value'];

export function BarcodeGeneratorView() {
  const [value, setValue] = useState('ALLPA-00001');
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [generatedValue, setGeneratedValue] = useState('ALLPA-00001');
  const [generatedFormat, setGeneratedFormat] = useState<BarcodeFormat>('CODE128');
  const [error, setError] = useState<string | null>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = barcodeRef.current;
    if (!svg) return;

    try {
      JsBarcode(svg, generatedValue, {
        format: generatedFormat,
        displayValue: true,
        font: 'Arial',
        fontSize: 16,
        lineColor: '#111111',
        background: '#ffffff',
        margin: 12,
        width: 2,
        height: 90,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el código.');
    }
  }, [generatedFormat, generatedValue]);

  const selectedFormat = barcodeFormats.find((item) => item.value === format);

  function generateBarcode() {
    const nextValue = value.trim();
    if (!nextValue) {
      setError('Introduce un valor para generar el código de barras.');
      return;
    }

    setGeneratedValue(nextValue);
    setGeneratedFormat(format);
  }

  function downloadSvg() {
    const svg = barcodeRef.current;
    if (!svg || error) return;

    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${generatedValue.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'barcode'}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printBarcode() {
    if (error) return;

    const printWindow = openBarcodeLabelPrintWindow();
    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      return;
    }

    try {
      printBarcodeLabel(printWindow, {
        name: brand.name,
        barcode: generatedValue,
        barcodeType: generatedFormat,
      });
    } catch (cause) {
      printWindow.close();
      setError(cause instanceof Error ? cause.message : 'No se pudo preparar la etiqueta.');
    }
  }

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Códigos de barras"
        description="Genera, descarga o imprime códigos independientes sin alterar el catálogo ni el inventario."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(25rem,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Generar código</CardTitle>
            <CardDescription>Elige el formato e introduce exactamente el valor que quieres codificar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Valor</span>
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') generateBarcode();
                }}
                placeholder="Ej.: ALLPA-00001"
                autoComplete="off"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Formato</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as BarcodeFormat)}
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                {barcodeFormats.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted-foreground">{selectedFormat?.hint}</p>
            </label>
            <Button type="button" className="w-full" onClick={generateBarcode}>
              <RefreshCw className="h-4 w-4" />
              Generar código
            </Button>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Barcode className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Vista previa</CardTitle>
                <CardDescription>{generatedFormat.replace('CODE', 'Code ')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-8">
            <div className="flex min-h-56 items-center justify-center overflow-auto rounded-md border bg-white p-4">
              <svg ref={barcodeRef} role="img" aria-label={`Código de barras ${generatedValue}`} />
            </div>
            {error ? <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={downloadSvg} disabled={Boolean(error)}>
                <Download className="h-4 w-4" />
                Descargar SVG
              </Button>
              <Button type="button" onClick={printBarcode} disabled={Boolean(error)}>
                <Printer className="h-4 w-4" />
                Imprimir etiqueta
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
