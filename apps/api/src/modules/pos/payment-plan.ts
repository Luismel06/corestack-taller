import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@qorvex/database';

export type PaymentInput = {
  method: PaymentMethod;
  amount: number;
  amountReceived?: number;
  reference?: string;
};
const allowedMethods: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'];

function money(value: number, field: string) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 9999999999.99 ||
    !new Prisma.Decimal(value).eq(new Prisma.Decimal(value).toDecimalPlaces(2))
  ) {
    throw new BadRequestException(`${field}: indica un monto válido de hasta dos decimales.`);
  }
  return new Prisma.Decimal(value);
}

export function buildPaymentPlan(
  required: Prisma.Decimal,
  input: {
    payments?: PaymentInput[];
    paymentMethod?: PaymentMethod;
    amountReceived?: number;
  },
) {
  if (input.payments && (input.paymentMethod !== undefined || input.amountReceived !== undefined)) {
    throw new BadRequestException('Envía el desglose de pagos o el pago único, no ambos.');
  }
  if (input.payments && (input.payments.length < 1 || input.payments.length > 10)) {
    throw new BadRequestException('Registra entre uno y diez pagos.');
  }
  const sources = input.payments ?? [
    {
      method: input.paymentMethod!,
      amount: required.toNumber(),
      amountReceived: input.amountReceived,
    },
  ];
  if (sources.filter((item) => item.method === 'CASH').length > 1) {
    throw new BadRequestException('Agrupa el efectivo en un solo pago para calcular la devuelta.');
  }
  const payments = sources.map((item) => {
    if (!allowedMethods.includes(item.method))
      throw new BadRequestException('Método de pago no permitido.');
    const amount = money(item.amount, 'Pago');
    if (input.payments && !amount.gt(0))
      throw new BadRequestException('Cada pago debe ser mayor que cero.');
    const received = money(item.amountReceived ?? item.amount, 'Recibido');
    if (required.isZero() && received.gt(0))
      throw new BadRequestException('No corresponde recibir dinero cuando la inicial es cero.');
    if (received.lt(amount))
      throw new BadRequestException('Cash received must cover the required initial payment.');
    if (item.method !== 'CASH' && !received.eq(amount)) {
      throw new BadRequestException(
        'Solo el efectivo permite devuelta; los demás pagos deben ser exactos.',
      );
    }
    const reference = item.reference?.trim() || undefined;
    if (reference && reference.length > 120)
      throw new BadRequestException('La referencia admite hasta 120 caracteres.');
    if (['CHECK', 'OTHER'].includes(item.method) && !reference)
      throw new BadRequestException('Indica la referencia del cheque u otro medio de pago.');
    return { method: item.method, amount, received, change: received.sub(amount), reference };
  });
  const paidAmount = payments.reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
  if (!paidAmount.eq(required))
    throw new BadRequestException(
      'La suma de los pagos debe coincidir exactamente con el importe a cobrar.',
    );
  const methods = new Set(payments.map((item) => item.method));
  return {
    payments: payments.filter((item) => item.amount.gt(0)),
    paidAmount,
    amountReceived: payments.reduce((sum, item) => sum.add(item.received), new Prisma.Decimal(0)),
    changeAmount: payments.reduce((sum, item) => sum.add(item.change), new Prisma.Decimal(0)),
    paymentMethod: methods.size === 1 ? payments[0].method : null,
  };
}
