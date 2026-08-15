import JsBarcode from 'jsbarcode';
import { brand } from './brand';
import { formatCurrency } from './utils';

type BarcodeLabel = {
  barcode: string;
  barcodeType?: string | null;
  name?: string | null;
  sku?: string | null;
  price?: number | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return entities[character];
  });
}

function resolveBarcodeFormat(type?: string | null) {
  switch (type) {
    case 'EAN13':
      return 'EAN13';
    case 'UPC_A':
    case 'UPC':
      return 'UPC';
    case 'CODE39':
      return 'CODE39';
    case 'EAN8':
      return 'EAN8';
    case 'ITF14':
      return 'ITF14';
    case 'QR':
      throw new Error('Las etiquetas QR requieren el módulo de códigos QR.');
    default:
      return 'CODE128';
  }
}

function createBarcodeSvg(value: string, type?: string | null) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  JsBarcode(svg, value, {
    format: resolveBarcodeFormat(type),
    displayValue: true,
    font: 'Arial',
    fontSize: 11,
    lineColor: '#000000',
    background: '#ffffff',
    margin: 0,
    width: 1.35,
    height: 46,
  });

  return svg.outerHTML;
}

/** Opens the print tab while the click is still active, avoiding popup blockers. */
export function openBarcodeLabelPrintWindow() {
  const printWindow = window.open('', '_blank', 'popup,width=420,height=300');
  if (!printWindow) return null;

  printWindow.document.write(
    '<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px">Preparando etiqueta...</body></html>',
  );
  printWindow.document.close();
  return printWindow;
}

/** Uses the printer's current label media; the application never overrides its page size. */
export function printBarcodeLabel(printWindow: Window, label: BarcodeLabel) {
  const barcode = label.barcode.trim();
  if (!barcode) throw new Error('La etiqueta no tiene un código de barras válido.');

  const barcodeSvg = createBarcodeSvg(barcode, label.barcodeType);
  const productName = label.name?.trim() || brand.name;
  const details = [label.sku?.trim(), label.price == null ? null : formatCurrency(label.price)]
    .filter(Boolean)
    .join(' · ');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(productName)} · Etiqueta</title>
        <style>
          @page { size: auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 100%; min-height: 100%; margin: 0; background: #fff; color: #000; }
          body { font-family: Arial, Helvetica, sans-serif; }
          .label {
            display: flex;
            min-height: 100%;
            width: 100%;
            flex-direction: column;
            justify-content: center;
            gap: 1.5mm;
            padding: 2.5mm;
            text-align: center;
          }
          .name { overflow: hidden; font-size: 10pt; font-weight: 700; line-height: 1.15; }
          .details { font-size: 8pt; line-height: 1.15; }
          .barcode { display: flex; justify-content: center; max-width: 100%; overflow: hidden; }
          .barcode svg { display: block; max-width: 100%; height: auto; }
          @media screen { .label { min-width: 58mm; min-height: 40mm; } }
        </style>
      </head>
      <body>
        <main class="label">
          <div class="name">${escapeHtml(productName)}</div>
          <div class="barcode">${barcodeSvg}</div>
          ${details ? `<div class="details">${escapeHtml(details)}</div>` : ''}
        </main>
      </body>
    </html>`);
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 150);
}
