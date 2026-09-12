import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { DocumentEmailService } from './document-email.service';
import { SendDocumentEmailDto } from './dto/send-document-email.dto';

@Controller('document-emails')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
export class DocumentEmailController {
  constructor(private readonly emails: DocumentEmailService) {}

  @Get('quotation-activity')
  @RequirePermissions('quotes.create')
  quotationActivity(@TenantId() tenantId: string) {
    return this.emails.quotationActivity(tenantId);
  }

  @Get('quotations/:id')
  @RequirePermissions('quotes.create')
  quotationHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.emails.history(tenantId, 'QUOTATION', id);
  }

  @Post('quotations/:id')
  @RequirePermissions('quotes.create')
  sendQuotation(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
  ) {
    return this.emails.sendQuotation(tenantId, user.id, id, dto.recipient);
  }

  @Get('workshop-quotes/:id')
  @RequirePermissions('quotes.create')
  workshopQuoteHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.emails.history(tenantId, 'WORKSHOP_QUOTE', id);
  }

  @Post('workshop-quotes/:id')
  @RequirePermissions('quotes.create')
  sendWorkshopQuote(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
  ) {
    return this.emails.sendWorkshopQuote(tenantId, user.id, id, dto.recipient);
  }

  @Get('invoices/:id')
  @RequirePermissions('invoices.view')
  invoiceHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.emails.history(tenantId, 'INVOICE', id);
  }

  @Post('invoices/:id')
  @RequirePermissions('invoices.view')
  sendInvoice(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
  ) {
    return this.emails.sendInvoice(tenantId, user.id, id, dto.recipient);
  }
}
