type DecimalValue = { toString(): string };

type EcfTaxCategory = 'ITBIS_18' | 'ITBIS_16' | 'EXEMPT';

type EcfSimulationInput = {
  documentType: 'FISCAL_CREDIT_ELECTRONIC_31' | 'CONSUMER_ELECTRONIC_32';
  eNcf: string;
  invoiceNumber: string;
  issuedAt: Date;
  tenant: {
    rnc: string | null;
    legalName: string | null;
    commercialName: string | null;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  customer: { name: string; documentNumber: string | null; email: string | null } | null;
  recipientEmail?: string | null;
  cashRegisterName?: string | null;
  paymentMethod: string;
  paymentMode: 'CASH' | 'CREDIT';
  subtotal: DecimalValue;
  taxTotal: DecimalValue;
  total: DecimalValue;
  items: Array<{
    sku: string | null;
    barcode: string | null;
    description: string;
    quantity: DecimalValue;
    unitPrice: DecimalValue;
    isService: boolean;
    taxCategory: EcfTaxCategory;
    taxRate: DecimalValue;
    subtotal: DecimalValue;
    taxTotal: DecimalValue;
    total: DecimalValue;
  }>;
};

type TaxBreakdown = {
  taxable18Base: number;
  taxable16Base: number;
  taxableZeroBase: number;
  exemptBase: number;
  itbis18: number;
  itbis16: number;
  itbisZero: number;
};

const xmlEscape = (value: string | null | undefined) =>
  (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const amount = (value: DecimalValue | number) =>
  (typeof value === 'number' ? value : Number(value.toString())).toFixed(2);

function getTaxIndicator(item: EcfSimulationInput['items'][number]) {
  if (item.taxCategory === 'EXEMPT') return '4';
  const rate = Number(item.taxRate.toString());
  if (Math.abs(rate - 0.18) < 0.0001) return '1';
  if (Math.abs(rate - 0.16) < 0.0001) return '2';
  return '3';
}

function getTaxBreakdown(items: EcfSimulationInput['items']): TaxBreakdown {
  return items.reduce<TaxBreakdown>(
    (totals, item) => {
      const base = Number(item.subtotal.toString());
      const tax = Number(item.taxTotal.toString());
      const indicator = getTaxIndicator(item);

      if (indicator === '1') {
        totals.taxable18Base += base;
        totals.itbis18 += tax;
      } else if (indicator === '2') {
        totals.taxable16Base += base;
        totals.itbis16 += tax;
      } else if (indicator === '3') {
        totals.taxableZeroBase += base;
        totals.itbisZero += tax;
      } else {
        totals.exemptBase += base;
      }

      return totals;
    },
    {
      taxable18Base: 0,
      taxable16Base: 0,
      taxableZeroBase: 0,
      exemptBase: 0,
      itbis18: 0,
      itbis16: 0,
      itbisZero: 0,
    },
  );
}

function xmlTaxTotals(tax: TaxBreakdown) {
  const taxableTotal = tax.taxable18Base + tax.taxable16Base + tax.taxableZeroBase;
  const totalItbis = tax.itbis18 + tax.itbis16 + tax.itbisZero;

  return [
    taxableTotal > 0 ? `      <MontoGravadoTotal>${amount(taxableTotal)}</MontoGravadoTotal>` : '',
    tax.taxable18Base > 0
      ? `      <MontoGravadoI1>${amount(tax.taxable18Base)}</MontoGravadoI1>`
      : '',
    tax.taxable16Base > 0
      ? `      <MontoGravadoI2>${amount(tax.taxable16Base)}</MontoGravadoI2>`
      : '',
    tax.taxableZeroBase > 0
      ? `      <MontoGravadoI3>${amount(tax.taxableZeroBase)}</MontoGravadoI3>`
      : '',
    tax.exemptBase > 0 ? `      <MontoExento>${amount(tax.exemptBase)}</MontoExento>` : '',
    tax.taxable18Base > 0 ? '      <ITBIS1>18</ITBIS1>' : '',
    tax.taxable16Base > 0 ? '      <ITBIS2>16</ITBIS2>' : '',
    tax.taxableZeroBase > 0 ? '      <ITBIS3>0</ITBIS3>' : '',
    totalItbis > 0 ? `      <TotalITBIS>${amount(totalItbis)}</TotalITBIS>` : '',
    tax.taxable18Base > 0 ? `      <TotalITBIS1>${amount(tax.itbis18)}</TotalITBIS1>` : '',
    tax.taxable16Base > 0 ? `      <TotalITBIS2>${amount(tax.itbis16)}</TotalITBIS2>` : '',
    tax.taxableZeroBase > 0 ? `      <TotalITBIS3>${amount(tax.itbisZero)}</TotalITBIS3>` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function emailTaxBreakdown(tax: TaxBreakdown) {
  const rows = [
    tax.taxable18Base > 0
      ? ['Base gravada 18%', amount(tax.taxable18Base), 'ITBIS 18%', amount(tax.itbis18)]
      : null,
    tax.taxable16Base > 0
      ? ['Base gravada 16%', amount(tax.taxable16Base), 'ITBIS 16%', amount(tax.itbis16)]
      : null,
    tax.taxableZeroBase > 0
      ? ['Base gravada 0%', amount(tax.taxableZeroBase), 'ITBIS 0%', amount(tax.itbisZero)]
      : null,
    tax.exemptBase > 0 ? ['Monto exento', amount(tax.exemptBase), '', ''] : null,
  ].filter((row): row is [string, string, string, string] => Boolean(row));

  return rows
    .map(
      ([baseLabel, baseValue, taxLabel, taxValue]) =>
        `<tr><td style="padding:4px 0;color:#52525b">${baseLabel}</td><td align="right" style="padding:4px 0">RD$${baseValue}</td><td style="padding:4px 0 4px 16px;color:#52525b">${taxLabel}</td><td align="right" style="padding:4px 0">${taxLabel ? `RD$${taxValue}` : ''}</td></tr>`,
    )
    .join('');
}

function formatDgiiDate(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(value)
    .replaceAll('/', '-');
}

export function buildEcfSimulation(input: EcfSimulationInput) {
  const type = input.documentType === 'FISCAL_CREDIT_ELECTRONIC_31' ? '31' : '32';
  const issuerName = input.tenant.legalName ?? input.tenant.commercialName ?? input.tenant.name;
  const customerName = input.customer?.name ?? 'Consumidor final';
  const customerDocument = input.customer?.documentNumber ?? '';
  const tax = getTaxBreakdown(input.items);
  const typeOfPayment = input.paymentMode === 'CREDIT' ? '2' : '1';
  const paymentForm =
    input.paymentMethod === 'CARD' ? '2' : input.paymentMethod === 'TRANSFER' ? '3' : '1';
  const paymentMethodLabel =
    input.paymentMethod === 'CARD'
      ? 'Tarjeta'
      : input.paymentMethod === 'TRANSFER'
        ? 'Transferencia'
        : 'Efectivo';
  const paymentModeLabel = input.paymentMode === 'CREDIT' ? 'Crédito' : 'Contado';
  const details = input.items
    .map(
      (item, index) => `
    <Item>
      <NumeroLinea>${index + 1}</NumeroLinea>
      <TablaCodigosItem>
        <CodigosItem>
          <TipoCodigo>INT</TipoCodigo>
          <CodigoItem>${xmlEscape(item.sku ?? item.barcode ?? 'SIN-CODIGO')}</CodigoItem>
        </CodigosItem>
      </TablaCodigosItem>
      <IndicadorFacturacion>${getTaxIndicator(item)}</IndicadorFacturacion>
      <NombreItem>${xmlEscape(item.description)}</NombreItem>
      <IndicadorBienoServicio>${item.isService ? '2' : '1'}</IndicadorBienoServicio>
      <CantidadItem>${item.quantity.toString()}</CantidadItem>
      <PrecioUnitarioItem>${amount(item.unitPrice)}</PrecioUnitarioItem>
      <MontoItem>${amount(item.subtotal)}</MontoItem>
    </Item>`,
    )
    .join('');
  const emailItems = input.items
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;color:#27272a">${xmlEscape(item.description)}<br /><span style="font-size:12px;color:#71717a">${item.quantity.toString()} × RD$${amount(item.unitPrice)} · ITBIS ${amount(item.taxTotal)}</span></td><td align="right" style="padding:8px 0;font-weight:600">RD$${amount(item.total)}</td></tr>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${type}</TipoeCF>
      <eNCF>${xmlEscape(input.eNcf)}</eNCF>
      <IndicadorMontoGravado>0</IndicadorMontoGravado>
      <TipoIngresos>01</TipoIngresos>
      <TipoPago>${typeOfPayment}</TipoPago>
      <TablaFormasPago>
        <FormaDePago>
          <FormaPago>${paymentForm}</FormaPago>
          <MontoPago>${amount(input.total)}</MontoPago>
        </FormaDePago>
      </TablaFormasPago>
    </IdDoc>
    <Emisor>
      <RNCEmisor>${xmlEscape(input.tenant.rnc)}</RNCEmisor>
      <RazonSocialEmisor>${xmlEscape(issuerName)}</RazonSocialEmisor>
      <NombreComercial>${xmlEscape(input.tenant.commercialName ?? input.tenant.name)}</NombreComercial>
      <DireccionEmisor>${xmlEscape(input.tenant.address)}</DireccionEmisor>
      <TablaTelefonoEmisor>
        <TelefonoEmisor>${xmlEscape(input.tenant.phone)}</TelefonoEmisor>
      </TablaTelefonoEmisor>
      <CorreoEmisor>${xmlEscape(input.tenant.email)}</CorreoEmisor>
      <NumeroFacturaInterna>${xmlEscape(input.invoiceNumber)}</NumeroFacturaInterna>
      <FechaEmision>${formatDgiiDate(input.issuedAt)}</FechaEmision>
    </Emisor>
    <Comprador>
      ${customerDocument ? `<RNCComprador>${xmlEscape(customerDocument)}</RNCComprador>` : ''}
      <RazonSocialComprador>${xmlEscape(customerName)}</RazonSocialComprador>
      ${input.customer?.email ? `<CorreoComprador>${xmlEscape(input.customer.email)}</CorreoComprador>` : ''}
    </Comprador>
    <Totales>
${xmlTaxTotals(tax)}
      <MontoTotal>${amount(input.total)}</MontoTotal>
    </Totales>
  </Encabezado>
  <DetallesItems>${details}
  </DetallesItems>
</ECF>`;

  return {
    xml,
    recipientEmail: input.recipientEmail ?? input.customer?.email ?? null,
    status: 'PENDING_RESEND_CONFIGURATION' as const,
    email: {
      subject: `Factura de Consumo Electronica No.${input.eNcf} - CoreStack Systems`,
      text: [
        `Factura electrónica ${input.eNcf}`,
        `Emisor: ${issuerName}`,
        `Cliente: ${customerName}`,
        customerDocument ? `RNC/Cédula: ${customerDocument}` : '',
        `Total: RD$${amount(input.total)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      html: `<main style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827"><h1>Factura electrónica</h1><p>Hola ${xmlEscape(customerName)},</p><p>Se generó la factura electrónica <strong>${xmlEscape(input.eNcf)}</strong> de ${xmlEscape(input.tenant.commercialName ?? input.tenant.name)}.</p><table style="width:100%;border-collapse:collapse">${emailItems}</table><table style="width:100%;border-collapse:collapse;margin-top:16px">${emailTaxBreakdown(tax)}<tr><td colspan="3" style="padding:8px 0;border-top:1px solid #d1d5db"><strong>Total</strong></td><td align="right" style="padding:8px 0;border-top:1px solid #d1d5db"><strong>RD$${amount(input.total)}</strong></td></tr></table></main>`,
    },
    templateVariables: {
      COMPANY_NAME: 'comprobante electronico',
      COMPANY_LEGAL_NAME: issuerName,
      COMPANY_RNC: input.tenant.rnc ?? '',
      COMPANY_EMAIL: input.tenant.email ?? '',
      COMPANY_PHONE: input.tenant.phone ?? '',
      COMPANY_ADDRESS: input.tenant.address ?? '',
      DOCUMENT_TYPE:
        type === '31'
          ? 'Factura de crédito fiscal electrónica E31'
          : 'Factura de consumo electrónica E32',
      ECF_NUMBER: input.eNcf,
      INVOICE_NUMBER: input.invoiceNumber,
      CUSTOMER_NAME: customerName,
      CUSTOMER_DOCUMENT: customerDocument,
      CUSTOMER_DOCUMENT_LABEL: customerDocument ? 'RNC/Cédula' : '',
      ISSUED_AT: input.issuedAt.toLocaleString('es-DO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      CASH_REGISTER: input.cashRegisterName ?? 'Caja principal - ALLPA',
      PAYMENT_METHOD: paymentMethodLabel,
      PAYMENT_MODE: paymentModeLabel,
      ITEMS_HTML: emailItems,
      TAX_BREAKDOWN_HTML: emailTaxBreakdown(tax),
      SUBTOTAL: amount(input.subtotal),
      TAXABLE_18_BASE: amount(tax.taxable18Base),
      TAXABLE_16_BASE: amount(tax.taxable16Base),
      TAXABLE_0_BASE: amount(tax.taxableZeroBase),
      EXEMPT_AMOUNT: amount(tax.exemptBase),
      ITBIS_18: amount(tax.itbis18),
      ITBIS_16: amount(tax.itbis16),
      ITBIS_0: amount(tax.itbisZero),
      ITBIS: amount(input.taxTotal),
      TOTAL: amount(input.total),
    },
  };
}
