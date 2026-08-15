import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateFiscalSequenceDto } from './dto/create-fiscal-sequence.dto';
import { FiscalSequencesService } from './fiscal-sequences.service';

@Controller('fiscal-sequences')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class FiscalSequencesController {
  constructor(private readonly fiscalSequencesService: FiscalSequencesService) {}

  @Get('alerts')
  getAlerts(@TenantId() tenantId: string) {
    return this.fiscalSequencesService.getAlerts(tenantId);
  }

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.fiscalSequencesService.findAll(tenantId);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFiscalSequenceDto,
  ) {
    return this.fiscalSequencesService.create(tenantId, user, dto);
  }
}
