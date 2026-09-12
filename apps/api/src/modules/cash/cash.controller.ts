import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CashService } from './cash.service';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';

@Controller('cash')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Get('registers')
  findRegisters(@TenantId() tenantId: string) {
    return this.cashService.findRegisters(tenantId);
  }

  @Post('registers')
  createRegister(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCashRegisterDto,
  ) {
    return this.cashService.createRegister(tenantId, user, dto);
  }

  @Get('sessions')
  findSessions(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findSessions(tenantId, user);
  }

  @Get('sessions/payment-options')
  findPaymentSessions(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findPaymentSessions(tenantId, user);
  }

  @Get('sessions/current')
  findCurrentSession(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findCurrentSession(tenantId, user);
  }

  @Post('sessions/open')
  openSession(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpenCashSessionDto,
  ) {
    return this.cashService.openSession(tenantId, user, dto);
  }

  @Post('sessions/:id/close')
  closeSession(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
  ) {
    return this.cashService.closeSession(tenantId, user, id, dto);
  }

  @Get('movements')
  findMovements(@TenantId() tenantId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cashService.findMovements(tenantId, user);
  }

  @Post('movements')
  createMovement(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCashMovementDto,
  ) {
    return this.cashService.createMovement(tenantId, user, dto);
  }
}
