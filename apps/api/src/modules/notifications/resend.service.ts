import { Injectable, Logger } from '@nestjs/common';
import { ElectronicDocumentStatus } from '@qorvex/database';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';

type EcfEmailCopy = {
  electronicDocumentId: string;
  invoiceId: string;
  recipients: string[];
  subject: string;
  templateVariables: Record<string, string>;
};

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendEcfCopy(input: EcfEmailCopy) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const templateId = process.env.RESEND_ECF_TEMPLATE_ID;

    if (!apiKey || !from || !templateId) {
      await this.markFailure(
        input.electronicDocumentId,
        'Falta configurar RESEND_API_KEY, RESEND_FROM o RESEND_ECF_TEMPLATE_ID.',
      );
      return;
    }

    try {
      const resend = new Resend(apiKey);
      if (!input.recipients.length) {
        throw new Error('No hay destinatarios para la copia e-CF.');
      }

      const deliveries = await Promise.all(
        input.recipients.map(async (recipient, index) => {
          const { data, error } = await resend.emails.send({
            from,
            to: [recipient],
            subject: input.subject,
            template: {
              id: templateId,
              variables: input.templateVariables,
            },
            headers: {
              'Idempotency-Key': `ecf-copy-${input.invoiceId}-${index}`,
            },
          });

          if (error || !data?.id) {
            throw new Error(error?.message ?? `Resend no pudo enviar el correo a ${recipient}.`);
          }

          return { recipient, emailId: data.id };
        }),
      );

      await this.prisma.electronicDocument.update({
        where: { id: input.electronicDocumentId },
        data: {
          status: ElectronicDocumentStatus.SENT,
          externalId: deliveries.map((delivery) => delivery.emailId).join(','),
          errorMessage: null,
          responsePayload: {
            provider: 'RESEND',
            status: 'SENT',
            deliveries,
            recipients: input.recipients,
            sentAt: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la copia e-CF.';
      this.logger.error(`No se pudo enviar la copia e-CF ${input.invoiceId}: ${message}`);
      await this.markFailure(input.electronicDocumentId, message);
    }
  }

  private async markFailure(electronicDocumentId: string, message: string) {
    await this.prisma.electronicDocument.update({
      where: { id: electronicDocumentId },
      data: {
        status: ElectronicDocumentStatus.FAILED,
        errorMessage: message.slice(0, 1000),
        responsePayload: {
          provider: 'RESEND',
          status: 'FAILED',
          error: message.slice(0, 1000),
        },
      },
    });
  }
}
