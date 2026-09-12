import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@qorvex/database';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CustomersService } from './customers.service';
import { ConfigureCustomerCreditDto } from './dto/configure-customer-credit.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
@RequirePermissions('customers.view')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions('customers.view')
  findAll(@TenantId() tenantId: string) {
    return this.customersService.findAll(tenantId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('customers.manage')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(tenantId, user.id, dto);
  }

  @Get(':id')
  @RequirePermissions('customers.view')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.customersService.findOne(tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('customers.manage')
  update(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(tenantId, user.id, id, dto);
  }

  @Patch(':id/credit')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('customers.credit')
  configureCredit(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfigureCustomerCreditDto,
  ) {
    return this.customersService.configureCredit(tenantId, user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('customers.archive')
  remove(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.customersService.remove(tenantId, user.id, id);
  }
}
