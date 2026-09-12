import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeLogAction,
  EmployeeStatus,
  MembershipStatus,
  Role,
  UserStatus,
  Prisma,
} from '@qorvex/database';
import {
  effectivePermissions,
  permissions,
  legacyPermissions,
  maxTenantUsers,
} from '@qorvex/permissions';
import { requirePermissions } from '../../common/authorization';
import * as bcrypt from 'bcryptjs';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

const permissionKeys = [
  'canUsePos',
  'canOpenCashSession',
  'canCloseCashSession',
  'canApplyDiscount',
  'canCancelInvoice',
  'canVoidInvoice',
  'canAdjustInventory',
  'canManageProducts',
  'canManageEmployees',
  'canViewReports',
  'canManageFiscalSequences',
  'canViewCashLogs',
  'canReprintReceipt',
  'canTakeOrders',
] as const;
const tenantAssignableRoles: Role[] = [Role.ADMIN, Role.CASHIER, Role.ORDER_TAKER, Role.MECHANIC];
// Los roles anteriores permanecen contados mientras se migran, aunque ya no puedan asignarse.
const tenantCountedRoles: Role[] = [
  Role.ADMIN,
  Role.CASHIER,
  Role.ORDER_TAKER,
  Role.MECHANIC,
  Role.MANAGER,
  Role.SERVICE_ADVISOR,
  Role.RECEPTIONIST,
  Role.SUPERVISOR,
  Role.INVENTORY_MANAGER,
  Role.ACCOUNTING,
  Role.ACCOUNTANT,
];

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async userLimit(tenantId: string) {
    const used = await this.activeUserCount(this.prisma, tenantId);
    return { limit: maxTenantUsers, used, available: Math.max(0, maxTenantUsers - used) };
  }

  private activeUserCount(client: Pick<Prisma.TransactionClient, 'membership'>, tenantId: string) {
    return client.membership.count({
      where: { tenantId, status: MembershipStatus.ACTIVE, role: { in: tenantCountedRoles } },
    });
  }

  private async ensureUserSlot(tx: Prisma.TransactionClient, tenantId: string) {
    if ((await this.activeUserCount(tx, tenantId)) >= maxTenantUsers)
      throw new BadRequestException(
        `Esta empresa admite un máximo de ${maxTenantUsers} usuarios activos. Desactiva uno antes de crear o reactivar otro.`,
      );
  }

  findAll(tenantId: string) {
    return this.prisma.employeeProfile.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            memberships: {
              where: { tenantId },
              select: this.membershipSelect(),
            },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(tenantId: string, actor: AuthenticatedUser, dto: CreateEmployeeDto) {
    this.requireEmployeeManagement(tenantId, actor);
    this.ensureTenantRole(dto.role);
    this.validateOverrides(dto.permissionOverrides, dto.role);
    if (!dto.password || dto.password.length < 8)
      throw new BadRequestException(
        'Define una contraseña de al menos ocho caracteres para el empleado.',
      );

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    if (existing?.memberships.some((membership) => membership.tenantId === tenantId)) {
      throw new ConflictException('This user already belongs to this tenant.');
    }
    if (existing)
      throw new ConflictException(
        'Ya existe una cuenta con ese correo. No se puede reutilizar ni modificar desde el alta de empleados.',
      );

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const employee = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      await this.requireFreshEmployeeManagement(tx, tenantId, actor.id);
      const profileStatus = dto.status ?? EmployeeStatus.ACTIVE;
      if (profileStatus === EmployeeStatus.ACTIVE) await this.ensureUserSlot(tx, tenantId);

      const mapUserStatus = (status: EmployeeStatus | undefined) =>
        status === EmployeeStatus.BLOCKED
          ? UserStatus.BLOCKED
          : status === EmployeeStatus.INACTIVE || status === EmployeeStatus.TERMINATED
            ? UserStatus.INACTIVE
            : status === EmployeeStatus.ACTIVE
              ? UserStatus.ACTIVE
              : undefined;

      const mapMembershipStatus = (status: EmployeeStatus | undefined) =>
        status === EmployeeStatus.ACTIVE
          ? MembershipStatus.ACTIVE
          : status
            ? MembershipStatus.INACTIVE
            : undefined;

      const user = await tx.user.create({
        data: {
          email,
          name: dto.name,
          phone: dto.phone,
          passwordHash,
          status: mapUserStatus(profileStatus) ?? UserStatus.ACTIVE,
        },
      });

      const membership = await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          role: dto.role,
          status: mapMembershipStatus(profileStatus) ?? MembershipStatus.ACTIVE,
          ...this.pickPermissions(dto, dto.role, true),
          permissionOverrides: dto.permissionOverrides ?? {},
        },
      });

      const profile = await tx.employeeProfile.create({
        data: {
          tenantId,
          userId: user.id,
          employeeCode: dto.employeeCode,
          jobTitle: dto.jobTitle,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          address: dto.address,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          notes: dto.notes,
          status: profileStatus,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              memberships: {
                where: { tenantId },
                select: this.membershipSelect(),
              },
            },
          },
        },
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: EmployeeLogAction.UPDATE_PRODUCT,
          entity: 'EmployeeProfile',
          entityId: profile.id,
          metadata: {
            action: 'EMPLOYEE_CREATED',
            employeeUserId: user.id,
            role: dto.role,
            permissions: this.permissionSnapshot(membership),
            permissionOverrides: membership.permissionOverrides,
          },
        },
      });

      return profile;
    });

    return employee;
  }

  async findOne(tenantId: string, id: string) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            memberships: {
              where: { tenantId },
              select: this.membershipSelect(),
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found for tenant.');
    }

    return employee;
  }

  async update(tenantId: string, actor: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    this.requireEmployeeManagement(tenantId, actor);
    if (dto.role) {
      this.ensureTenantRole(dto.role);
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${tenantId} FOR UPDATE`;
      await this.requireFreshEmployeeManagement(tx, tenantId, actor.id);
      const employee = await tx.employeeProfile.findFirst({
        where: { id, tenantId },
        include: { user: { include: { memberships: true } } },
      });
      if (!employee) throw new NotFoundException('Employee not found for tenant.');
      if (employee.user.memberships.some((item) => item.tenantId !== tenantId))
        throw new ForbiddenException(
          'Esta cuenta pertenece a varias empresas y requiere administración de identidad independiente.',
        );
      const membership = employee.user.memberships[0];

      if (!membership) {
        throw new NotFoundException('Employee membership not found.');
      }

      const nextRole = dto.role ?? membership.role;
      if (dto.status === EmployeeStatus.ACTIVE && membership.status !== MembershipStatus.ACTIVE)
        await this.ensureUserSlot(tx, tenantId);
      this.validateOverrides(dto.permissionOverrides, nextRole);
      if (
        membership.role === Role.ADMIN &&
        ((dto.status && dto.status !== EmployeeStatus.ACTIVE) ||
          nextRole !== Role.ADMIN ||
          dto.permissionOverrides?.['employees.manage'] === false)
      ) {
        await this.ensureAnotherActiveAdmin(tx, tenantId, employee.user.id);
      }
      await tx.user.update({
        where: { id: employee.userId },
        data: {
          email: dto.email?.toLowerCase().trim(),
          name: dto.name,
          phone: dto.phone,
          passwordHash,
          status:
            dto.status === EmployeeStatus.BLOCKED
              ? UserStatus.BLOCKED
              : dto.status === EmployeeStatus.INACTIVE || dto.status === EmployeeStatus.TERMINATED
                ? UserStatus.INACTIVE
                : dto.status === EmployeeStatus.ACTIVE
                  ? UserStatus.ACTIVE
                  : undefined,
        },
      });

      const updatedMembership = await tx.membership.update({
        where: { id: membership.id },
        data: {
          role: dto.role,
          status:
            dto.status === EmployeeStatus.ACTIVE
              ? MembershipStatus.ACTIVE
              : dto.status
                ? MembershipStatus.INACTIVE
                : undefined,
          ...this.pickPermissions(
            dto,
            dto.role ?? membership.role,
            Boolean(dto.role && dto.role !== membership.role),
          ),
          permissionOverrides:
            dto.permissionOverrides ?? (dto.role && dto.role !== membership.role ? {} : undefined),
        },
        select: this.membershipSelect(),
      });

      const updated = await tx.employeeProfile.update({
        where: { id },
        data: {
          employeeCode: dto.employeeCode,
          jobTitle: dto.jobTitle,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          address: dto.address,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          notes: dto.notes,
          status: dto.status,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              memberships: {
                where: { tenantId },
                select: this.membershipSelect(),
              },
            },
          },
        },
      });

      await tx.employeeActivityLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: EmployeeLogAction.UPDATE_PRODUCT,
          entity: 'EmployeeProfile',
          entityId: id,
          metadata: {
            action: 'EMPLOYEE_UPDATED',
            fields: Object.keys(dto),
            previousRole: membership.role,
            newRole: updatedMembership.role,
            previousPermissions: this.permissionSnapshot(membership),
            newPermissions: this.permissionSnapshot(updatedMembership),
            changedPermissionKeys: this.changedPermissionKeys(membership, updatedMembership),
            previousPermissionOverrides: membership.permissionOverrides,
            newPermissionOverrides: updatedMembership.permissionOverrides,
          },
        },
      });

      return updated;
    });
  }

  async activity(tenantId: string, employeeId: string) {
    const userId = await this.getEmployeeUserId(tenantId, employeeId);

    return this.prisma.employeeActivityLog.findMany({
      where: {
        tenantId,
        userId,
      },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
        cashSession: { include: { cashRegister: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async invoices(tenantId: string, employeeId: string) {
    const userId = await this.getEmployeeUserId(tenantId, employeeId);

    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        issuedById: userId,
      },
      include: {
        customer: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async cashMovements(tenantId: string, employeeId: string) {
    const userId = await this.getEmployeeUserId(tenantId, employeeId);

    return this.prisma.cashMovement.findMany({
      where: {
        tenantId,
        userId,
      },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
        cashSession: { include: { cashRegister: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private requireEmployeeManagement(tenantId: string, actor: AuthenticatedUser) {
    requirePermissions(actor, tenantId, 'employees.manage');
    const membership = actor.memberships.find((candidate) => candidate.tenantId === tenantId);
    const platformMembership = actor.memberships.find((candidate) =>
      ([Role.SUPER_ADMIN, Role.QORVEX_SUPER_ADMIN] as Role[]).includes(candidate.role),
    );

    if (platformMembership) {
      return;
    }

    if (!membership || !([Role.ADMIN] as Role[]).includes(membership.role)) {
      throw new ForbiddenException('Employee management permission is required.');
    }
  }

  private async getEmployeeUserId(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employeeProfile.findFirst({
      where: {
        id: employeeId,
        tenantId,
      },
      select: { userId: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found for tenant.');
    }

    return employee.userId;
  }

  private ensureTenantRole(role: Role) {
    if (!tenantAssignableRoles.includes(role)) {
      throw new BadRequestException('This role cannot be assigned to a tenant employee.');
    }
  }

  private async ensureAnotherActiveAdmin(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const admins = await tx.membership.findMany({
      where: {
        tenantId,
        role: Role.ADMIN,
        status: MembershipStatus.ACTIVE,
        userId: { not: userId },
        user: { status: 'ACTIVE' },
      },
    });

    if (!admins.some((admin) => effectivePermissions(admin)['employees.manage'])) {
      throw new BadRequestException('At least one active admin must remain for the tenant.');
    }
  }

  private pickPermissions(dto: CreateEmployeeDto | UpdateEmployeeDto, role?: Role, reset = false) {
    const data = permissionKeys.reduce<Partial<Record<(typeof permissionKeys)[number], boolean>>>(
      (permissions, key) => {
        if (dto[key] !== undefined) {
          permissions[key] = dto[key];
        }

        return permissions;
      },
      reset && role ? legacyPermissions(effectivePermissions({ role })) : {},
    );

    if (
      role &&
      [
        'MANAGER',
        'SERVICE_ADVISOR',
        'RECEPTIONIST',
        'SUPERVISOR',
        'INVENTORY_MANAGER',
        'ACCOUNTING',
      ].includes(role)
    )
      return data;
    if (role === Role.ORDER_TAKER) {
      return {
        ...this.blankPermissions(),
        canTakeOrders: true,
      };
    }

    if (role === Role.MECHANIC) {
      return this.blankPermissions();
    }

    if (role === Role.ACCOUNTANT) {
      return {
        ...this.blankPermissions(),
        canViewReports: true,
        canViewCashLogs: true,
        canReprintReceipt: true,
      };
    }

    if (role === Role.CASHIER) {
      return {
        ...data,
        canTakeOrders: false,
      };
    }

    if (role === Role.ADMIN) {
      return {
        ...data,
        canUsePos: false,
        canOpenCashSession: false,
        canTakeOrders: true,
      };
    }

    return data;
  }

  private blankPermissions() {
    return permissionKeys.reduce<Record<(typeof permissionKeys)[number], boolean>>(
      (data, key) => {
        data[key] = false;
        return data;
      },
      {} as Record<(typeof permissionKeys)[number], boolean>,
    );
  }

  private permissionSnapshot(value: Record<(typeof permissionKeys)[number], boolean>) {
    return permissionKeys.reduce<Record<(typeof permissionKeys)[number], boolean>>(
      (permissions, key) => {
        permissions[key] = value[key];
        return permissions;
      },
      {} as Record<(typeof permissionKeys)[number], boolean>,
    );
  }

  private changedPermissionKeys(
    previous: Record<(typeof permissionKeys)[number], boolean>,
    next: Record<(typeof permissionKeys)[number], boolean>,
  ) {
    return permissionKeys.filter((key) => previous[key] !== next[key]);
  }

  private membershipSelect() {
    return {
      id: true,
      role: true,
      status: true,
      permissionOverrides: true,
      canUsePos: true,
      canOpenCashSession: true,
      canCloseCashSession: true,
      canApplyDiscount: true,
      canCancelInvoice: true,
      canVoidInvoice: true,
      canAdjustInventory: true,
      canManageProducts: true,
      canManageEmployees: true,
      canViewReports: true,
      canManageFiscalSequences: true,
      canViewCashLogs: true,
      canReprintReceipt: true,
      canTakeOrders: true,
    };
  }

  private validateOverrides(value: unknown, role: Role) {
    if (value === undefined) return;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.entries(value).some(
        ([key, enabled]) => !permissions.includes(key) || typeof enabled !== 'boolean',
      )
    )
      throw new BadRequestException(
        'Los permisos deben ser claves conocidas con valores verdadero/falso.',
      );
    const overrides = value as Record<string, boolean>;
    if (overrides['employees.manage'] && role !== Role.ADMIN)
      throw new BadRequestException('Solo un administrador puede administrar usuarios y accesos.');
    if (role === Role.ADMIN && (overrides['pos.sell'] || overrides['cash.open']))
      throw new BadRequestException('El administrador supervisa; asigna un cajero para cobrar.');
  }

  private async requireFreshEmployeeManagement(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) throw new ForbiddenException('Usuario no disponible.');
    this.requireEmployeeManagement(tenantId, user);
  }
}
