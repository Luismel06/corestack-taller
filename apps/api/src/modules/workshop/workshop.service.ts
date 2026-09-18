import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmployeeStatus,
  InventoryMovementType,
  MembershipStatus,
  Prisma,
  ProductInventoryDestination,
  ProductStatus,
  ProductUnit,
  Role,
  SalesOrderDestination,
  SalesOrderStatus,
  WorkshopAppointmentStatus,
  WorkshopApprovalStatus,
  WorkshopQualityStatus,
  WorkshopInspectionResult,
  WorkshopTicketLineType,
  WorkshopTicketStatus,
  WorkshopTaskStatus,
  WorkshopTaskTimeEvent,
  WorkshopChangeOrderStatus,
} from '@qorvex/database';
import { AuditService } from '../audit/audit.service';
import { taskTimeTotals } from './task-time';
import { PrismaService } from '../../prisma/prisma.service';
import { effectivePermissions } from '@qorvex/permissions';
import {
  CreateWorkshopTicketDto,
  CreateWorkshopChangeOrderDto,
  CreateWorkshopTaskDto,
  CreateWorkshopServiceDto,
  CreateWorkshopAppointmentDto,
  CreateWorkshopReceptionDto,
  RespondWorkshopApprovalDto,
  RespondWorkshopChangeOrderDto,
  SendWorkshopTicketToCashierDto,
  CreateWorkshopVehicleDto,
  UpdateWorkshopTaskDto,
  UpdateWorkshopTicketDto,
  UpdateWorkshopServiceDto,
  UpdateWorkshopAppointmentDto,
  UpdateWorkshopReceptionDto,
  SaveWorkshopQualityCheckDto,
  CreateWorkshopDeliveryDto,
  SaveWorkshopInspectionDto,
  UpdateWorkshopVehicleDto,
  WorkshopTicketLineDto,
  WorkshopAuthorizationEvidenceDto,
  WorkshopPartMovementDto,
} from './dto/workshop.dto';

const ticketInclude = {
  externalJobs: true,
  advances: true,
  warranties: { include: { claims: true } },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  vehicle: true,
  areaFindings: { orderBy: { createdAt: 'asc' as const } },
  assignments: {
    include: {
      employee: {
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      },
    },
  },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, trackInventory: true, unit: true } },
      inventoryMovements: {
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      service: { select: { id: true, code: true, name: true, estimatedMinutes: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  tasks: {
    include: {
      employee: {
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      },
      timeEntries: { orderBy: { occurredAt: 'asc' } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  },
  salesOrder: {
    include: {
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          balance: true,
          total: true,
          paidAmount: true,
        },
      },
    },
  },
  reception: {
    include: {
      initialMechanic: {
        include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  },
  qualityCheck: {
    include: { checkedBy: { select: { id: true, name: true } } },
  },
  delivery: {
    include: { deliveredBy: { select: { id: true, name: true } } },
  },
  inspection: {
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      createdBy: { select: { id: true, name: true } },
    },
  },
  quoteVersions: {
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { version: 'desc' },
  },
  statusEvents: {
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.WorkshopTicketInclude;

const appointmentInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  vehicle: true,
  mechanic: {
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  },
  createdBy: { select: { id: true, name: true } },
  convertedTicket: { include: ticketInclude },
} satisfies Prisma.WorkshopAppointmentInclude;

const changeOrderInclude = {
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      service: { select: { id: true, code: true, name: true, estimatedMinutes: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  createdBy: { select: { id: true, name: true } },
  respondedBy: { select: { id: true, name: true } },
} satisfies Prisma.WorkshopChangeOrderInclude;

const maxReceptionImageSize = 5 * 1024 * 1024;
const receptionImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadedReceptionImage = {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
  size: number;
};

@Injectable()
export class WorkshopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async overview(tenantId: string) {
    const [received, inProgress, awaitingApproval, readyForDelivery, today] = await Promise.all([
      this.prisma.workshopTicket.count({ where: { tenantId, status: 'RECEIVED' } }),
      this.prisma.workshopTicket.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      this.prisma.workshopTicket.count({ where: { tenantId, status: 'AWAITING_APPROVAL' } }),
      this.prisma.workshopTicket.count({ where: { tenantId, status: 'READY_FOR_DELIVERY' } }),
      this.prisma.workshopTicket.findMany({
        relationLoadStrategy: 'join',
        where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        include: ticketInclude,
        orderBy: [{ priority: 'desc' }, { openedAt: 'asc' }],
        take: 8,
      }),
    ]);

    return { received, inProgress, awaitingApproval, readyForDelivery, today };
  }

  async uploadReceptionImages(
    tenantId: string,
    userId: string,
    files: UploadedReceptionImage[] = [],
  ) {
    if (!files.length || files.length > 2) {
      throw new BadRequestException('Selecciona entre una y dos imágenes.');
    }
    const supabaseUrl = this.config.get<string>('SUPABASE_URL')?.replace(/\/+$/, '');
    const supabaseKey =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      this.config.get<string>('SUPABASE_SECRET_KEY');
    const bucket = this.config.get<string>('SUPABASE_PRODUCT_IMAGE_BUCKET') || 'product-images';
    if (!supabaseUrl || !supabaseKey) {
      throw new BadRequestException('El almacenamiento de imágenes no está configurado.');
    }
    await ensureReceptionImageBucket(supabaseUrl, supabaseKey, bucket);

    const urls: string[] = [];
    for (const file of files) {
      if (!file.buffer?.length || !file.mimetype || !receptionImageTypes.has(file.mimetype)) {
        throw new BadRequestException('Las evidencias deben ser imágenes JPG, PNG o WEBP.');
      }
      if (file.size > maxReceptionImageSize) {
        throw new BadRequestException('Cada imagen debe pesar 5 MB o menos.');
      }
      const extension =
        file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
      const objectPath = `${tenantId}/workshop-receptions/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            'Content-Type': file.mimetype,
            'x-upsert': 'false',
          },
          body: new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
        },
      );
      if (!response.ok) throw new BadRequestException('No se pudo guardar una de las imágenes.');
      urls.push(
        `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
      );
    }

    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_RECEPTION_IMAGES_UPLOADED',
      entity: 'WorkshopReceptionImage',
      entityId: tenantId,
      metadata: { count: urls.length },
    });
    return { imageUrls: urls };
  }

  findVehicles(tenantId: string, customerId?: string) {
    return this.prisma.workshopVehicle.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async vehicleHistory(tenantId: string, id: string) {
    const vehicle = await this.prisma.workshopVehicle.findFirst({
      relationLoadStrategy: 'join',
      where: { id, tenantId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        tickets: {
          include: ticketInclude,
          orderBy: { openedAt: 'desc' },
        },
        appointments: {
          select: {
            id: true,
            startsAt: true,
            estimatedMinutes: true,
            reason: true,
            status: true,
            convertedTicketId: true,
          },
          orderBy: { startsAt: 'desc' },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado.');
    return vehicle;
  }

  async createVehicle(tenantId: string, userId: string, dto: CreateWorkshopVehicleDto) {
    await this.ensureCustomer(tenantId, dto.customerId);
    const licensePlate = this.cleanOptional(dto.licensePlate)?.toUpperCase();

    try {
      const vehicle = await this.prisma.workshopVehicle.create({
        data: { ...dto, licensePlate, tenantId },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
      await this.audit.log({
        tenantId,
        userId,
        action: 'WORKSHOP_VEHICLE_CREATED',
        entity: 'WorkshopVehicle',
        entityId: vehicle.id,
        metadata: { licensePlate, make: vehicle.make, model: vehicle.model },
      });
      return vehicle;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Ya existe un vehículo con esa placa en el taller.');
      }
      throw error;
    }
  }

  async updateVehicle(tenantId: string, userId: string, id: string, dto: UpdateWorkshopVehicleDto) {
    const vehicle = await this.getVehicle(tenantId, id);
    if (dto.customerId && dto.customerId !== vehicle.customerId) {
      await this.ensureCustomer(tenantId, dto.customerId);
    }
    const licensePlate =
      dto.licensePlate === undefined
        ? undefined
        : this.cleanOptional(dto.licensePlate)?.toUpperCase();

    try {
      const updated = await this.prisma.workshopVehicle.update({
        where: { id },
        data: { ...dto, ...(dto.licensePlate !== undefined ? { licensePlate } : {}) },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });
      await this.audit.log({
        tenantId,
        userId,
        action: 'WORKSHOP_VEHICLE_UPDATED',
        entity: 'WorkshopVehicle',
        entityId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return updated;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Ya existe un vehículo con esa placa en el taller.');
      }
      throw error;
    }
  }

  async findAppointments(
    tenantId: string,
    status?: WorkshopAppointmentStatus,
    from?: string,
    to?: string,
  ) {
    const startsAt = this.appointmentDateRange(from, to);
    return this.prisma.workshopAppointment.findMany({
      relationLoadStrategy: 'join',
      where: { tenantId, ...(status ? { status } : {}), ...(startsAt ? { startsAt } : {}) },
      include: appointmentInclude,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      take: 250,
    });
  }

  async createAppointment(tenantId: string, userId: string, dto: CreateWorkshopAppointmentDto) {
    await this.ensureCustomer(tenantId, dto.customerId);
    const vehicle = await this.getVehicle(tenantId, dto.vehicleId);
    if (vehicle.customerId !== dto.customerId) {
      throw new BadRequestException('El vehículo seleccionado no pertenece al cliente.');
    }
    if (dto.mechanicId) await this.ensureMechanics(tenantId, [dto.mechanicId]);

    const appointment = await this.prisma.workshopAppointment.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        mechanicId: dto.mechanicId,
        createdById: userId,
        startsAt: this.parseAppointmentDate(dto.startsAt),
        estimatedMinutes: dto.estimatedMinutes ?? 60,
        reason: dto.reason.trim(),
        notes: this.cleanOptional(dto.notes),
      },
      include: appointmentInclude,
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_APPOINTMENT_CREATED',
      entity: 'WorkshopAppointment',
      entityId: appointment.id,
      metadata: {
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        startsAt: appointment.startsAt,
      },
    });
    return appointment;
  }

  async updateAppointment(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateWorkshopAppointmentDto,
  ) {
    const current = await this.getAppointment(tenantId, id);
    if (
      current.status === WorkshopAppointmentStatus.CONVERTED_TO_RECEPTION ||
      current.status === WorkshopAppointmentStatus.CANCELLED ||
      current.status === WorkshopAppointmentStatus.NO_SHOW
    ) {
      throw new BadRequestException('Esta cita ya no puede modificarse.');
    }
    if (dto.status === WorkshopAppointmentStatus.CONVERTED_TO_RECEPTION) {
      throw new BadRequestException('Usa la acción de convertir a recepción para cerrar la cita.');
    }
    if (dto.status) this.ensureAppointmentStatusTransition(current.status, dto.status);

    const customerId = dto.customerId ?? current.customerId;
    const vehicleId = dto.vehicleId ?? current.vehicleId;
    if (dto.customerId) await this.ensureCustomer(tenantId, customerId);
    if (dto.vehicleId || dto.customerId) {
      const vehicle = await this.getVehicle(tenantId, vehicleId);
      if (vehicle.customerId !== customerId) {
        throw new BadRequestException('El vehículo seleccionado no pertenece al cliente.');
      }
    }
    if (dto.mechanicId) await this.ensureMechanics(tenantId, [dto.mechanicId]);

    const appointment = await this.prisma.workshopAppointment.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        mechanicId: dto.mechanicId,
        startsAt: dto.startsAt ? this.parseAppointmentDate(dto.startsAt) : undefined,
        estimatedMinutes: dto.estimatedMinutes,
        reason: dto.reason?.trim(),
        notes: dto.notes === undefined ? undefined : this.cleanOptional(dto.notes),
        status: dto.status,
      },
      include: appointmentInclude,
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_APPOINTMENT_UPDATED',
      entity: 'WorkshopAppointment',
      entityId: id,
      metadata: { fields: Object.keys(dto), status: appointment.status },
    });
    return appointment;
  }

  async convertAppointmentToReception(tenantId: string, userId: string, id: string) {
    const appointment = await this.getAppointment(tenantId, id);
    if (appointment.convertedTicketId) {
      throw new BadRequestException('Esta cita ya fue convertida en una recepción.');
    }
    const receivableStatuses: WorkshopAppointmentStatus[] = [
      WorkshopAppointmentStatus.SCHEDULED,
      WorkshopAppointmentStatus.CONFIRMED,
      WorkshopAppointmentStatus.ARRIVED,
    ];
    if (!receivableStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        'Solo una cita programada, confirmada o llegada puede recibirse.',
      );
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const sequence = await tx.workshopTicket.count({ where: { tenantId } });
      const ticketNumber = `OT-${String(sequence + 1).padStart(6, '0')}`;
      const promisedAt = new Date(
        appointment.startsAt.getTime() + appointment.estimatedMinutes * 60 * 1000,
      );
      const createdTicket = await tx.workshopTicket.create({
        data: {
          tenantId,
          customerId: appointment.customerId,
          vehicleId: appointment.vehicleId,
          ticketNumber,
          status: WorkshopTicketStatus.RECEIVED,
          priority: 'NORMAL',
          complaint: appointment.reason,
          internalNotes: appointment.notes
            ? `Cita ${appointment.id}: ${appointment.notes}`
            : `Creada desde la cita ${appointment.id}.`,
          promisedAt,
          createdById: userId,
          statusEvents: {
            create: {
              tenantId,
              toStatus: WorkshopTicketStatus.RECEIVED,
              note: 'Orden creada desde una cita.',
              createdById: userId,
            },
          },
          assignments: appointment.mechanicId
            ? { create: { employeeId: appointment.mechanicId } }
            : undefined,
        },
        include: ticketInclude,
      });
      await tx.workshopAppointment.update({
        where: { id },
        data: {
          status: WorkshopAppointmentStatus.CONVERTED_TO_RECEPTION,
          convertedTicketId: createdTicket.id,
        },
      });
      return createdTicket;
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_APPOINTMENT_CONVERTED_TO_RECEPTION',
      entity: 'WorkshopAppointment',
      entityId: id,
      metadata: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
    });
    return ticket;
  }

  async createReception(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: CreateWorkshopReceptionDto,
  ) {
    const ticket = await this.getTicket(tenantId, ticketId);
    if (ticket.reception) {
      throw new ConflictException(
        'La recepción ya fue registrada. Usa actualizar para corregirla.',
      );
    }
    if (ticket.status !== WorkshopTicketStatus.RECEIVED) {
      throw new BadRequestException('La recepción solo puede registrarse antes del diagnóstico.');
    }
    if (dto.initialMechanicId) await this.ensureMechanics(tenantId, [dto.initialMechanicId]);
    this.ensureReceptionMileage(ticket.vehicle.mileage, dto.mileage);

    const reception = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workshopReception.create({
        data: {
          tenantId,
          ticketId,
          mileage: dto.mileage,
          fuelLevel: this.cleanOptional(dto.fuelLevel),
          accessories: this.cleanOptional(dto.accessories),
          belongings: this.cleanOptional(dto.belongings),
          exteriorCondition: this.cleanOptional(dto.exteriorCondition),
          interiorCondition: this.cleanOptional(dto.interiorCondition),
          warningLights: this.cleanOptional(dto.warningLights),
          observations: this.cleanOptional(dto.observations),
          imageUrls: dto.imageUrls ?? [],
          initialMechanicId: dto.initialMechanicId,
          createdById: userId,
        },
        include: {
          initialMechanic: { include: { user: { select: { id: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      });
      if (ticket.vehicle.mileage === null || dto.mileage > ticket.vehicle.mileage) {
        await tx.workshopVehicle.update({
          where: { id: ticket.vehicleId },
          data: { mileage: dto.mileage },
        });
      }
      if (
        dto.initialMechanicId &&
        !ticket.assignments.some((item) => item.employee.id === dto.initialMechanicId)
      ) {
        await tx.workshopTicketAssignment.create({
          data: { ticketId, employeeId: dto.initialMechanicId },
        });
      }
      return created;
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_RECEPTION_CREATED',
      entity: 'WorkshopReception',
      entityId: reception.id,
      metadata: { ticketId, mileage: dto.mileage, imageCount: reception.imageUrls.length },
    });
    return reception;
  }

  async updateReception(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: UpdateWorkshopReceptionDto,
  ) {
    const ticket = await this.getTicket(tenantId, ticketId);
    if (!ticket.reception) throw new NotFoundException('La recepción aún no ha sido registrada.');
    if (ticket.status !== WorkshopTicketStatus.RECEIVED) {
      throw new BadRequestException(
        'La recepción no puede modificarse después de iniciar el diagnóstico.',
      );
    }
    if (dto.initialMechanicId) await this.ensureMechanics(tenantId, [dto.initialMechanicId]);
    if (dto.mileage !== undefined) this.ensureReceptionMileage(ticket.vehicle.mileage, dto.mileage);

    const reception = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workshopReception.update({
        where: { ticketId },
        data: {
          mileage: dto.mileage,
          fuelLevel: dto.fuelLevel === undefined ? undefined : this.cleanOptional(dto.fuelLevel),
          accessories:
            dto.accessories === undefined ? undefined : this.cleanOptional(dto.accessories),
          belongings: dto.belongings === undefined ? undefined : this.cleanOptional(dto.belongings),
          exteriorCondition:
            dto.exteriorCondition === undefined
              ? undefined
              : this.cleanOptional(dto.exteriorCondition),
          interiorCondition:
            dto.interiorCondition === undefined
              ? undefined
              : this.cleanOptional(dto.interiorCondition),
          warningLights:
            dto.warningLights === undefined ? undefined : this.cleanOptional(dto.warningLights),
          observations:
            dto.observations === undefined ? undefined : this.cleanOptional(dto.observations),
          imageUrls: dto.imageUrls,
          initialMechanicId: dto.initialMechanicId,
        },
        include: {
          initialMechanic: { include: { user: { select: { id: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
        },
      });
      if (
        dto.mileage !== undefined &&
        (ticket.vehicle.mileage === null || dto.mileage > ticket.vehicle.mileage)
      ) {
        await tx.workshopVehicle.update({
          where: { id: ticket.vehicleId },
          data: { mileage: dto.mileage },
        });
      }
      if (
        dto.initialMechanicId &&
        !ticket.assignments.some((item) => item.employee.id === dto.initialMechanicId)
      ) {
        await tx.workshopTicketAssignment.create({
          data: { ticketId, employeeId: dto.initialMechanicId },
        });
      }
      return updated;
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_RECEPTION_UPDATED',
      entity: 'WorkshopReception',
      entityId: reception.id,
      metadata: { ticketId, fields: Object.keys(dto) },
    });
    return reception;
  }

  async saveQualityCheck(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: SaveWorkshopQualityCheckDto,
  ) {
    const qualityCheck = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      if (ticket.status !== WorkshopTicketStatus.IN_PROGRESS) {
        throw new BadRequestException(
          'El control de calidad solo se realiza durante la reparación.',
        );
      }
      if (dto.status === WorkshopQualityStatus.PENDING) {
        throw new BadRequestException(
          'El control de calidad debe aprobarse o devolverse a reparación.',
        );
      }
      const checks = [
        dto.workCompleted,
        dto.partsVerified,
        dto.leaksChecked,
        dto.fluidsChecked,
        dto.warningLightsChecked,
        dto.roadTested,
        dto.toolsRemoved,
        dto.vehicleCleaned,
      ];
      if (dto.status === WorkshopQualityStatus.APPROVED && checks.some((check) => !check)) {
        throw new BadRequestException(
          'Completa todos los puntos del checklist antes de aprobar el control de calidad.',
        );
      }
      if (dto.status === WorkshopQualityStatus.APPROVED) {
        await this.ensureNoPendingChanges(tx, tenantId, ticketId);
        this.ensureAuthorizedTasksCompleted(ticket);
        if (ticket.tasks.some((task) => !['COMPLETED', 'CANCELLED'].includes(task.status))) {
          throw new BadRequestException(
            'Finaliza las tareas antes de aprobar el control de calidad.',
          );
        }
      }
      return tx.workshopQualityCheck.upsert({
        where: { ticketId },
        create: {
          tenantId,
          ticketId,
          checkedById: userId,
          status: dto.status,
          workCompleted: dto.workCompleted,
          partsVerified: dto.partsVerified,
          leaksChecked: dto.leaksChecked,
          fluidsChecked: dto.fluidsChecked,
          warningLightsChecked: dto.warningLightsChecked,
          roadTested: dto.roadTested,
          toolsRemoved: dto.toolsRemoved,
          vehicleCleaned: dto.vehicleCleaned,
          observations: this.cleanOptional(dto.observations),
        },
        update: {
          checkedById: userId,
          checkedAt: new Date(),
          status: dto.status,
          workCompleted: dto.workCompleted,
          partsVerified: dto.partsVerified,
          leaksChecked: dto.leaksChecked,
          fluidsChecked: dto.fluidsChecked,
          warningLightsChecked: dto.warningLightsChecked,
          roadTested: dto.roadTested,
          toolsRemoved: dto.toolsRemoved,
          vehicleCleaned: dto.vehicleCleaned,
          observations: this.cleanOptional(dto.observations),
        },
        include: { checkedBy: { select: { id: true, name: true } } },
      });
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_QUALITY_CHECK_SAVED',
      entity: 'WorkshopQualityCheck',
      entityId: qualityCheck.id,
      metadata: { ticketId, status: dto.status },
    });
    return qualityCheck;
  }

  async createDelivery(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: CreateWorkshopDeliveryDto,
  ) {
    const delivery = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      if (ticket.delivery)
        throw new ConflictException('La entrega de este vehículo ya fue registrada.');
      if (ticket.status !== WorkshopTicketStatus.READY_FOR_DELIVERY) {
        throw new BadRequestException(
          'El vehículo debe estar listo para entrega antes de registrarla.',
        );
      }
      if (!ticket.salesOrder?.invoice) {
        throw new BadRequestException(
          'La factura debe emitirse en Caja antes de entregar el vehículo.',
        );
      }
      const invoice = ticket.salesOrder.invoice;
      if (invoice.status !== 'PAID' || !invoice.balance.isZero()) {
        throw new BadRequestException(
          'Completa el pago de la factura en Caja antes de entregar el vehículo.',
        );
      }
      if (ticket.qualityCheck?.status !== WorkshopQualityStatus.APPROVED) {
        throw new BadRequestException(
          'El vehículo necesita control de calidad aprobado antes de la entrega.',
        );
      }
      await this.ensureNoPendingChanges(tx, tenantId, ticketId);
      this.ensureReceptionMileage(ticket.vehicle.mileage, dto.mileageOut);

      const deliveredAt = new Date();
      const created = await tx.workshopDelivery.create({
        data: {
          tenantId,
          ticketId,
          recipientName: dto.recipientName.trim(),
          mileageOut: dto.mileageOut,
          recommendations: this.cleanOptional(dto.recommendations),
          notes: this.cleanOptional(dto.notes),
          deliveredById: userId,
          deliveredAt,
        },
        include: { deliveredBy: { select: { id: true, name: true } } },
      });
      await tx.workshopTicket.update({
        where: { id: ticketId },
        data: { status: WorkshopTicketStatus.DELIVERED, deliveredAt },
      });
      await tx.workshopTicketStatusEvent.create({
        data: {
          tenantId,
          ticketId,
          fromStatus: WorkshopTicketStatus.READY_FOR_DELIVERY,
          toStatus: WorkshopTicketStatus.DELIVERED,
          note: `Vehículo entregado a ${dto.recipientName.trim()}.`,
          createdById: userId,
        },
      });
      if (ticket.vehicle.mileage === null || dto.mileageOut > ticket.vehicle.mileage) {
        await tx.workshopVehicle.update({
          where: { id: ticket.vehicleId },
          data: { mileage: dto.mileageOut },
        });
      }
      return created;
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_VEHICLE_DELIVERED',
      entity: 'WorkshopDelivery',
      entityId: delivery.id,
      metadata: {
        ticketId,
        recipientName: delivery.recipientName,
        mileageOut: delivery.mileageOut,
      },
    });
    return delivery;
  }

  async saveInspection(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: SaveWorkshopInspectionDto,
  ) {
    const ticket = await this.getTicket(tenantId, ticketId);
    const inspectionStatuses: WorkshopTicketStatus[] = [
      WorkshopTicketStatus.DIAGNOSIS,
      WorkshopTicketStatus.RECEIVED,
    ];
    if (!inspectionStatuses.includes(ticket.status)) {
      throw new BadRequestException(
        'La inspección solo puede registrarse durante recepción o diagnóstico.',
      );
    }
    if (!ticket.reception) {
      throw new BadRequestException('Completa la recepción antes de registrar la inspección.');
    }
    if (!dto.items.length) throw new BadRequestException('Agrega al menos un punto de inspección.');
    const codes = dto.items.map((item) => item.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Cada punto de inspección debe tener un código único.');
    }

    const inspection = await this.prisma.$transaction(async (tx) => {
      const current = await tx.workshopInspection.upsert({
        where: { ticketId },
        create: {
          tenantId,
          ticketId,
          createdById: userId,
        },
        update: {
          createdById: userId,
          inspectedAt: new Date(),
        },
      });
      await tx.workshopInspectionItem.deleteMany({ where: { inspectionId: current.id } });
      return tx.workshopInspection.update({
        where: { id: current.id },
        data: {
          items: {
            create: dto.items.map((item, index) => ({
              tenantId,
              code: item.code.trim().toUpperCase(),
              label: item.label.trim(),
              result: item.result,
              comment: this.cleanOptional(item.comment),
              recommendation: this.cleanOptional(item.recommendation),
              sortOrder: index,
            })),
          },
        },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { id: true, name: true } },
        },
      });
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_INSPECTION_SAVED',
      entity: 'WorkshopInspection',
      entityId: inspection.id,
      metadata: {
        ticketId,
        items: inspection.items.length,
        requiresRepair: inspection.items.filter(
          (item) => item.result === WorkshopInspectionResult.REQUIRES_REPAIR,
        ).length,
      },
    });
    return inspection;
  }

  findServices(tenantId: string, includeInactive = false) {
    return this.prisma.workshopService.findMany({
      where: { tenantId, ...(includeInactive ? {} : { active: true }) },
      include: { product: { select: { id: true, sku: true, taxRate: true, status: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createService(tenantId: string, userId: string, dto: CreateWorkshopServiceDto) {
    const code = this.normalizeServiceCode(dto.code);
    const name = dto.name.trim();
    const defaultPrice = this.money(dto.defaultPrice);
    const taxRate = new Prisma.Decimal(dto.taxRate ?? 0.18);

    try {
      const service = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenantId,
            name,
            sku: this.serviceProductSku(code),
            description: this.cleanOptional(dto.description),
            unit: 'UNIT',
            price: defaultPrice,
            salePrice: defaultPrice,
            taxRate,
            trackInventory: false,
            stock: 0,
            minStock: 0,
            status: dto.active === false ? ProductStatus.INACTIVE : ProductStatus.ACTIVE,
          },
        });
        return tx.workshopService.create({
          data: {
            tenantId,
            productId: product.id,
            code,
            name,
            category: this.cleanOptional(dto.category),
            description: this.cleanOptional(dto.description),
            defaultPrice,
            estimatedMinutes: dto.estimatedMinutes,
            taxRate,
            active: dto.active ?? true,
          },
          include: { product: { select: { id: true, sku: true, taxRate: true, status: true } } },
        });
      });
      await this.audit.log({
        tenantId,
        userId,
        action: 'WORKSHOP_SERVICE_CREATED',
        entity: 'WorkshopService',
        entityId: service.id,
        metadata: { code: service.code, productId: service.productId },
      });
      return service;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Ya existe un servicio con ese código.');
      }
      throw error;
    }
  }

  async updateService(tenantId: string, userId: string, id: string, dto: UpdateWorkshopServiceDto) {
    const service = await this.prisma.workshopService.findFirst({ where: { id, tenantId } });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    const code = dto.code === undefined ? undefined : this.normalizeServiceCode(dto.code);
    const name = dto.name?.trim();
    const defaultPrice = dto.defaultPrice === undefined ? undefined : this.money(dto.defaultPrice);
    const taxRate = dto.taxRate === undefined ? undefined : new Prisma.Decimal(dto.taxRate);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: service.productId },
          data: {
            name,
            sku: code === undefined ? undefined : this.serviceProductSku(code),
            description:
              dto.description === undefined ? undefined : this.cleanOptional(dto.description),
            price: defaultPrice,
            salePrice: defaultPrice,
            taxRate,
            status:
              dto.active === undefined
                ? undefined
                : dto.active
                  ? ProductStatus.ACTIVE
                  : ProductStatus.INACTIVE,
          },
        });
        return tx.workshopService.update({
          where: { id },
          data: {
            code,
            name,
            category: dto.category === undefined ? undefined : this.cleanOptional(dto.category),
            description:
              dto.description === undefined ? undefined : this.cleanOptional(dto.description),
            defaultPrice,
            estimatedMinutes: dto.estimatedMinutes,
            taxRate,
            active: dto.active,
          },
          include: { product: { select: { id: true, sku: true, taxRate: true, status: true } } },
        });
      });
      await this.audit.log({
        tenantId,
        userId,
        action: 'WORKSHOP_SERVICE_UPDATED',
        entity: 'WorkshopService',
        entityId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return updated;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Ya existe un servicio con ese código.');
      }
      throw error;
    }
  }

  async findTickets(
    tenantId: string,
    user: {
      id: string;
      memberships: Array<{ tenantId: string; role: Role; permissionOverrides?: unknown }>;
    },
    status?: WorkshopTicketStatus,
  ) {
    const membership = user.memberships.find((item) => item.tenantId === tenantId);
    const isMechanic =
      membership?.role === Role.MECHANIC && !effectivePermissions(membership)['workorders.assign'];
    const employee = isMechanic
      ? await this.prisma.employeeProfile.findFirst({
          where: { tenantId, userId: user.id, status: EmployeeStatus.ACTIVE },
          select: { id: true },
        })
      : null;

    // A mechanic account without an active employee profile must never inherit
    // visibility over the workshop board.
    if (isMechanic && !employee) return [];

    return this.prisma.workshopTicket.findMany({
      relationLoadStrategy: 'join',
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(isMechanic && employee
          ? {
              OR: [
                { assignments: { some: { employeeId: employee.id } } },
                { tasks: { some: { employeeId: employee.id } } },
              ],
            }
          : {}),
      },
      include: ticketInclude,
      orderBy: [{ priority: 'desc' }, { openedAt: 'desc' }],
      take: 100,
    });
  }

  async createTicket(tenantId: string, userId: string, dto: CreateWorkshopTicketDto) {
    const vehicle = await this.getVehicle(tenantId, dto.vehicleId);
    if (vehicle.customerId !== dto.customerId) {
      throw new BadRequestException('El vehículo seleccionado no pertenece al cliente.');
    }
    await this.ensureMechanics(tenantId, dto.mechanicIds ?? []);
    const lines = await this.resolveLineCatalog(tenantId, dto.lines ?? []);
    const validAreaIds = new Set((dto.areaFindings ?? []).map((finding) => finding.areaId));
    if (lines.some((line) => line.vehicleAreaId && !validAreaIds.has(line.vehicleAreaId))) {
      throw new BadRequestException(
        'Una línea del presupuesto está vinculada a un área del vehículo inexistente.',
      );
    }
    const totals = this.calculateTotals(lines);
    const sequence = await this.prisma.workshopTicket.count({ where: { tenantId } });
    const ticketNumber = `OT-${String(sequence + 1).padStart(6, '0')}`;

    try {
      const ticket = await this.prisma.workshopTicket.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          vehicleId: dto.vehicleId,
          ticketNumber,
          complaint: dto.complaint.trim(),
          priority: dto.priority,
          diagnosis: this.cleanOptional(dto.diagnosis),
          internalNotes: this.cleanOptional(dto.internalNotes),
          customerNotes: this.cleanOptional(dto.customerNotes),
          promisedAt: dto.promisedAt ? new Date(dto.promisedAt) : undefined,
          estimatedTotal: this.money(dto.estimatedTotal ?? totals.total),
          laborTotal: totals.laborTotal,
          partsTotal: totals.partsTotal,
          total: totals.total,
          createdById: userId,
          statusEvents: {
            create: {
              tenantId,
              toStatus: WorkshopTicketStatus.RECEIVED,
              note: 'Orden de trabajo creada.',
              createdById: userId,
            },
          },
          assignments: { create: (dto.mechanicIds ?? []).map((employeeId) => ({ employeeId })) },
          lines: { create: this.lineData(lines) },
          areaFindings: {
            create: (dto.areaFindings ?? []).map((finding) => ({
              tenantId,
              areaId: finding.areaId.trim(),
              areaLabel: finding.areaLabel.trim(),
              view: finding.view,
              condition: finding.condition,
              finding: this.cleanOptional(finding.finding),
              notes: this.cleanOptional(finding.notes),
            })),
          },
        },
        include: ticketInclude,
      });
      await this.audit.log({
        tenantId,
        userId,
        action: 'WORKSHOP_TICKET_CREATED',
        entity: 'WorkshopTicket',
        entityId: ticket.id,
        metadata: { ticketNumber, vehicleId: dto.vehicleId, mechanicIds: dto.mechanicIds ?? [] },
      });
      return ticket;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('No se pudo reservar el número de ticket. Intenta nuevamente.');
      }
      throw error;
    }
  }

  async updateTicket(tenantId: string, userId: string, id: string, dto: UpdateWorkshopTicketDto) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockTicket(tx, tenantId, id);
      if (['DELIVERED', 'CANCELLED'].includes(current.status)) {
        throw new BadRequestException('La orden está cerrada y no admite modificaciones.');
      }
      if (current.salesOrderId && dto.status === WorkshopTicketStatus.CANCELLED) {
        throw new BadRequestException(
          'Una orden facturada debe anularse mediante el proceso fiscal correspondiente.',
        );
      }
      if (
        (dto.lines || dto.areaFindings) &&
        current.status === WorkshopTicketStatus.AWAITING_APPROVAL
      ) {
        throw new BadRequestException(
          'Registra la respuesta del presupuesto enviado antes de preparar una nueva versión.',
        );
      }
      if (dto.status) this.ensureStatusTransition(current.status, dto.status);
      if (
        current.status === WorkshopTicketStatus.RECEIVED &&
        dto.status === WorkshopTicketStatus.DIAGNOSIS &&
        !current.reception
      ) {
        const appointment = await tx.workshopAppointment.findUnique({
          where: { convertedTicketId: id },
          select: { id: true },
        });
        if (appointment) {
          throw new BadRequestException(
            'Completa la recepción del vehículo antes de iniciar el diagnóstico.',
          );
        }
        await tx.workshopReception.create({
          data: {
            tenantId,
            ticketId: id,
            mileage: current.vehicle.mileage ?? 0,
            observations: 'Recepción inicial creada al abrir la orden directamente.',
            imageUrls: [],
            initialMechanicId: current.assignments[0]?.employeeId,
            createdById: userId,
          },
        });
      }
      if (
        current.status === WorkshopTicketStatus.IN_PROGRESS &&
        dto.status === WorkshopTicketStatus.READY_FOR_DELIVERY &&
        current.qualityCheck?.status !== WorkshopQualityStatus.APPROVED
      ) {
        throw new BadRequestException(
          'Aprueba el control de calidad antes de marcar el vehículo listo para entrega.',
        );
      }
      if (
        current.status === WorkshopTicketStatus.IN_PROGRESS &&
        dto.status === WorkshopTicketStatus.READY_FOR_DELIVERY &&
        current.tasks.some(
          (task) =>
            task.status === WorkshopTaskStatus.PENDING ||
            task.status === WorkshopTaskStatus.IN_PROGRESS ||
            task.status === WorkshopTaskStatus.PAUSED,
        )
      ) {
        throw new BadRequestException(
          'Finaliza o cancela las tareas de los mecánicos antes de preparar el vehículo para entrega.',
        );
      }
      if (dto.status === WorkshopTicketStatus.DELIVERED) {
        throw new BadRequestException(
          'Registra la entrega del vehículo para cerrar la orden de trabajo.',
        );
      }
      if (dto.status === WorkshopTicketStatus.READY_FOR_DELIVERY) {
        await this.ensureNoPendingChanges(tx, tenantId, id);
        this.ensureAuthorizedTasksCompleted(current);
        if (
          current.lines.some(
            (line) =>
              line.approvalStatus === WorkshopApprovalStatus.APPROVED &&
              line.product?.trackInventory &&
              (!line.consumedQuantity.add(line.releasedQuantity).eq(line.quantity) ||
                line.reservedQuantity > 1e-9),
          )
        ) {
          throw new BadRequestException(
            'Registra la entrega de los repuestos aprobados o libera las unidades que no se usarán antes de marcar el vehículo listo para entrega.',
          );
        }
      }
      if (dto.status === WorkshopTicketStatus.IN_PROGRESS) {
        this.ensureApprovedWork(current);
        if (!current.salesOrder?.invoice) {
          throw new BadRequestException('Factura la orden en Caja antes de iniciar la reparación.');
        }
        if (!(dto.promisedAt || current.promisedAt)) {
          throw new BadRequestException(
            'Indica el tiempo estimado de entrega antes de iniciar la reparación.',
          );
        }
      }
      if (dto.mechanicIds) await this.ensureMechanics(tenantId, dto.mechanicIds);
      if (dto.lines || dto.areaFindings) {
        if (
          current.approvalStatus === WorkshopApprovalStatus.APPROVED ||
          current.approvalStatus === WorkshopApprovalStatus.PARTIALLY_APPROVED ||
          current.salesOrderId
        ) {
          throw new BadRequestException(
            'El presupuesto ya fue aprobado o enviado a Caja. Crea una revisión antes de cambiar sus líneas.',
          );
        }
      }
      const lines = dto.lines ? await this.resolveLineCatalog(tenantId, dto.lines) : undefined;
      const areaFindings = dto.areaFindings;
      if (lines) {
        const validAreaIds = new Set(
          (areaFindings ?? current.areaFindings).map((finding) => finding.areaId),
        );
        const invalidAreaLine = lines.find(
          (line) => line.vehicleAreaId && !validAreaIds.has(line.vehicleAreaId),
        );
        if (invalidAreaLine) {
          throw new BadRequestException(
            'Una línea del presupuesto está vinculada a un área del vehículo inexistente.',
          );
        }
      }
      const totals = lines ? this.calculateTotals(lines) : null;
      const statusDates = this.statusDates(dto.status);
      const requestingApproval =
        dto.status === WorkshopTicketStatus.AWAITING_APPROVAL && current.status !== dto.status;
      const cancelling = dto.status === WorkshopTicketStatus.CANCELLED;
      const quoteLines = lines ?? current.lines;
      if (requestingApproval && !quoteLines.length) {
        throw new BadRequestException(
          'Registra al menos un servicio o repuesto antes de solicitar aprobación del presupuesto.',
        );
      }

      if (cancelling && current.lines.some((line) => line.consumedQuantity.gt(0))) {
        throw new BadRequestException(
          'Devuelve los repuestos entregados antes de cancelar la OT. No se reintegran piezas instaladas automáticamente.',
        );
      }
      if (cancelling)
        await this.releaseTicketPartReservations(
          tx,
          tenantId,
          userId,
          current.ticketNumber,
          current.lines,
        );
      if (cancelling) {
        const cancelledAt = new Date();
        for (const task of current.tasks.filter(
          (item) => !['COMPLETED', 'CANCELLED'].includes(item.status),
        )) {
          const entry = { event: WorkshopTaskTimeEvent.CANCEL, occurredAt: cancelledAt };
          await tx.workshopTaskTimeEntry.create({
            data: {
              tenantId,
              taskId: task.id,
              userId,
              ...entry,
              note: 'Orden de trabajo cancelada.',
            },
          });
          await tx.workshopTask.update({
            where: { id: task.id },
            data: {
              status: 'CANCELLED',
              ...taskTimeTotals([...task.timeEntries, entry], {
                now: cancelledAt,
                startedAt: task.startedAt,
                status: 'CANCELLED',
                previousActualMinutes: task.actualMinutes,
                previousPausedMinutes: task.pausedMinutes,
              }),
            },
          });
        }
        await tx.workshopChangeOrder.updateMany({
          where: { tenantId, ticketId: id, status: WorkshopChangeOrderStatus.PENDING },
          data: {
            status: WorkshopChangeOrderStatus.CANCELLED,
            respondedAt: new Date(),
            respondedById: userId,
            responseNote: 'Orden de trabajo cancelada.',
          },
        });
      }
      if (dto.mechanicIds) {
        await tx.workshopTicketAssignment.deleteMany({ where: { ticketId: id } });
      }
      if (dto.lines) {
        await tx.workshopTicketLine.deleteMany({ where: { ticketId: id } });
      }
      if (areaFindings) {
        const areaIds = areaFindings.map((finding) => finding.areaId);
        await tx.workshopTicketLine.updateMany({
          where: {
            ticketId: id,
            vehicleAreaId: areaIds.length ? { notIn: areaIds } : { not: null },
          },
          data: { vehicleAreaId: null },
        });
        await tx.workshopVehicleAreaFinding.deleteMany({ where: { ticketId: id } });
      }
      const updated = await tx.workshopTicket.update({
        where: { id },
        data: {
          status: dto.status,
          priority: dto.priority,
          complaint: dto.complaint?.trim(),
          diagnosis: dto.diagnosis === undefined ? undefined : this.cleanOptional(dto.diagnosis),
          internalNotes:
            dto.internalNotes === undefined ? undefined : this.cleanOptional(dto.internalNotes),
          customerNotes:
            dto.customerNotes === undefined ? undefined : this.cleanOptional(dto.customerNotes),
          promisedAt:
            dto.promisedAt === undefined
              ? undefined
              : dto.promisedAt
                ? new Date(dto.promisedAt)
                : null,
          estimatedTotal:
            dto.estimatedTotal === undefined ? undefined : this.money(dto.estimatedTotal),
          laborTotal: totals?.laborTotal,
          partsTotal: totals?.partsTotal,
          total: totals?.total,
          ...(requestingApproval
            ? {
                approvalStatus: WorkshopApprovalStatus.PENDING,
                approvalRequestedAt: new Date(),
                approvalNote: null,
              }
            : {}),
          ...statusDates,
          ...(dto.mechanicIds
            ? { assignments: { create: dto.mechanicIds.map((employeeId) => ({ employeeId })) } }
            : {}),
          ...(lines ? { lines: { create: this.lineData(lines) } } : {}),
          ...(areaFindings
            ? {
                areaFindings: {
                  create: areaFindings.map((finding) => ({
                    tenantId,
                    areaId: finding.areaId.trim(),
                    areaLabel: finding.areaLabel.trim(),
                    view: finding.view,
                    condition: finding.condition,
                    finding: this.cleanOptional(finding.finding),
                    notes: this.cleanOptional(finding.notes),
                  })),
                },
              }
            : {}),
        },
        include: ticketInclude,
      });
      if (dto.status && dto.status !== current.status) {
        await tx.workshopTicketStatusEvent.create({
          data: {
            tenantId,
            ticketId: id,
            fromStatus: current.status,
            toStatus: dto.status,
            createdById: userId,
          },
        });
      }
      if (requestingApproval) {
        await tx.workshopTicketLine.updateMany({
          where: { ticketId: id },
          data: { approvalStatus: WorkshopApprovalStatus.PENDING },
        });
        const latestVersion = await tx.workshopQuoteVersion.findFirst({
          where: { ticketId: id },
          select: { version: true },
          orderBy: { version: 'desc' },
        });
        await tx.workshopQuoteVersion.create({
          data: {
            tenantId,
            ticketId: id,
            version: (latestVersion?.version ?? 0) + 1,
            status: WorkshopApprovalStatus.PENDING,
            laborTotal: updated.laborTotal,
            partsTotal: updated.partsTotal,
            total: updated.total,
            snapshot: this.quoteSnapshot(updated.lines, updated.areaFindings),
            createdById: userId,
          },
        });
        return tx.workshopTicket.findUniqueOrThrow({
          relationLoadStrategy: 'join',
          where: { id },
          include: ticketInclude,
        });
      }
      return tx.workshopTicket.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id },
        include: ticketInclude,
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_TICKET_UPDATED',
      entity: 'WorkshopTicket',
      entityId: id,
      metadata: { fields: Object.keys(dto), status: ticket.status },
    });
    return ticket;
  }

  async deleteTicket(tenantId: string, userId: string, id: string) {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, id);
      if (ticket.salesOrderId || ticket.salesOrder) {
        throw new BadRequestException(
          'No se puede eliminar una orden enviada a Caja o facturada. Debe conservarse por trazabilidad fiscal.',
        );
      }
      const expenseCount = await tx.workshopExpense.count({ where: { tenantId, ticketId: id } });
      if (
        ticket.advances.length ||
        expenseCount > 0 ||
        ticket.externalJobs.length ||
        ticket.warranties.length
      ) {
        throw new BadRequestException(
          'No se puede eliminar una orden con anticipos, gastos, trabajos externos o garantías registrados.',
        );
      }
      if (
        ticket.lines.some(
          (line) =>
            line.inventoryMovements.length > 0 ||
            line.reservedQuantity > 0 ||
            line.consumedQuantity.gt(0) ||
            line.releasedQuantity.gt(0),
        )
      ) {
        throw new BadRequestException(
          'No se puede eliminar una orden con movimientos o reservas de inventario. Cancélala para conservar el historial.',
        );
      }

      // Tasks can reference a ticket line with a restrictive FK. Remove them first so
      // the ticket cascade can safely clear the remaining operational draft data.
      await tx.workshopTask.deleteMany({ where: { ticketId: ticket.id } });
      await tx.workshopTicket.delete({ where: { id: ticket.id } });
      return { id: ticket.id, ticketNumber: ticket.ticketNumber };
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_TICKET_DELETED',
      entity: 'WorkshopTicket',
      entityId: deleted.id,
      metadata: { ticketNumber: deleted.ticketNumber },
    });
    return deleted;
  }

  async reviseQuote(tenantId: string, userId: string, id: string) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockTicket(tx, tenantId, id);
      if (
        current.status !== WorkshopTicketStatus.AWAITING_APPROVAL ||
        current.approvalStatus !== WorkshopApprovalStatus.PENDING
      ) {
        throw new BadRequestException(
          'Solo una cotización pendiente de respuesta puede volver a edición.',
        );
      }
      if (current.salesOrderId) {
        throw new BadRequestException(
          'La cotización ya fue enviada a Caja y no puede volver a edición.',
        );
      }

      await tx.workshopQuoteVersion.updateMany({
        where: { ticketId: id, status: WorkshopApprovalStatus.PENDING },
        data: {
          status: WorkshopApprovalStatus.NOT_REQUESTED,
          note: 'Versión sustituida por una revisión antes de recibir respuesta.',
        },
      });
      await tx.workshopTicketLine.updateMany({
        where: { ticketId: id },
        data: { approvalStatus: WorkshopApprovalStatus.NOT_REQUESTED },
      });
      await tx.workshopTicket.update({
        where: { id },
        data: {
          status: WorkshopTicketStatus.DIAGNOSIS,
          approvalStatus: WorkshopApprovalStatus.NOT_REQUESTED,
          approvalRequestedAt: null,
          approvalNote: null,
        },
      });
      await tx.workshopTicketStatusEvent.create({
        data: {
          tenantId,
          ticketId: id,
          fromStatus: current.status,
          toStatus: WorkshopTicketStatus.DIAGNOSIS,
          note: 'Cotización reabierta para preparar una nueva versión.',
          createdById: userId,
        },
      });
      return tx.workshopTicket.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id },
        include: ticketInclude,
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_QUOTE_REOPENED',
      entity: 'WorkshopTicket',
      entityId: id,
      metadata: {
        ticketNumber: ticket.ticketNumber,
        previousVersion: ticket.quoteVersions[0]?.version,
      },
    });
    return ticket;
  }

  async respondApproval(
    tenantId: string,
    userId: string,
    id: string,
    dto: RespondWorkshopApprovalDto,
  ) {
    const validApprovalResponses: WorkshopApprovalStatus[] = [
      WorkshopApprovalStatus.APPROVED,
      WorkshopApprovalStatus.PARTIALLY_APPROVED,
      WorkshopApprovalStatus.REJECTED,
    ];
    if (!validApprovalResponses.includes(dto.status)) {
      throw new BadRequestException('Selecciona una respuesta válida para el presupuesto.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, id);
      if (ticket.salesOrderId || ticket.status !== WorkshopTicketStatus.AWAITING_APPROVAL) {
        throw new BadRequestException('Solo los tickets pendientes pueden recibir una respuesta.');
      }
      if (
        (dto.status === WorkshopApprovalStatus.APPROVED ||
          dto.status === WorkshopApprovalStatus.PARTIALLY_APPROVED) &&
        !ticket.lines.length
      ) {
        throw new BadRequestException(
          'Registra al menos un servicio o repuesto en el presupuesto antes de solicitar aprobación.',
        );
      }

      const pendingVersion = await tx.workshopQuoteVersion.findFirst({
        where: { tenantId, ticketId: id, status: WorkshopApprovalStatus.PENDING },
        orderBy: { version: 'desc' },
      });
      if (!pendingVersion || pendingVersion.id !== dto.quoteVersionId) {
        throw new ConflictException(
          'El presupuesto cambió. Revisa la versión vigente antes de registrar la respuesta.',
        );
      }
      const acceptedIds =
        dto.status === WorkshopApprovalStatus.REJECTED
          ? []
          : dto.status === WorkshopApprovalStatus.APPROVED
            ? ticket.lines.map((line) => line.id)
            : (dto.approvedLineIds ?? []);
      const acceptedSet = new Set(acceptedIds);
      if (
        acceptedSet.size !== acceptedIds.length ||
        acceptedIds.some((lineId) => !ticket.lines.some((line) => line.id === lineId))
      ) {
        throw new BadRequestException(
          'Selecciona únicamente líneas de este presupuesto, sin duplicados.',
        );
      }
      if (
        dto.status === WorkshopApprovalStatus.PARTIALLY_APPROVED &&
        (!acceptedIds.length || acceptedIds.length === ticket.lines.length)
      ) {
        throw new BadRequestException(
          'La aprobación parcial debe seleccionar al menos una línea y dejar otra rechazada.',
        );
      }
      if (
        dto.status === WorkshopApprovalStatus.APPROVED &&
        dto.approvedLineIds &&
        (dto.approvedLineIds.length !== acceptedIds.length ||
          dto.approvedLineIds.some((lineId) => !acceptedSet.has(lineId)))
      ) {
        throw new BadRequestException(
          'Para aprobar todo, selecciona todas las líneas del presupuesto.',
        );
      }
      const decision = {
        ...this.authorizationEvidence(dto, userId),
        approvedLineIds: acceptedIds,
        quoteVersionId: pendingVersion.id,
      };
      await tx.workshopQuoteVersion.update({
        where: { id: pendingVersion.id },
        data: { status: dto.status, note: this.cleanOptional(dto.note), decision },
      });
      await tx.workshopTicketLine.updateMany({
        where: { ticketId: id },
        data: { approvalStatus: WorkshopApprovalStatus.REJECTED },
      });
      if (acceptedIds.length) {
        await tx.workshopTicketLine.updateMany({
          where: { ticketId: id, id: { in: acceptedIds } },
          data: { approvalStatus: WorkshopApprovalStatus.APPROVED },
        });
        await this.reserveTicketPartReservations(
          tx,
          tenantId,
          userId,
          ticket.ticketNumber,
          ticket.lines.filter((line) => acceptedSet.has(line.id)),
        );
      }
      const totals = this.calculateTotals(ticket.lines.filter((line) => acceptedSet.has(line.id)));

      const approvedTicket = await tx.workshopTicket.update({
        where: { id },
        data: {
          approvalStatus: dto.status,
          approvalNote: this.cleanOptional(dto.note),
          laborTotal: totals.laborTotal,
          partsTotal: totals.partsTotal,
          total: totals.total,
          approvedAt: new Date(),
          status:
            dto.status === WorkshopApprovalStatus.REJECTED
              ? WorkshopTicketStatus.DIAGNOSIS
              : WorkshopTicketStatus.APPROVED,
        },
        include: ticketInclude,
      });
      await tx.workshopTicketStatusEvent.create({
        data: {
          tenantId,
          ticketId: id,
          fromStatus: ticket.status,
          toStatus: approvedTicket.status,
          note: this.cleanOptional(dto.note),
          createdById: userId,
        },
      });
      return tx.workshopTicket.findUniqueOrThrow({
        relationLoadStrategy: 'join',
        where: { id },
        include: ticketInclude,
      });
    });

    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_TICKET_APPROVAL_RECORDED',
      entity: 'WorkshopTicket',
      entityId: id,
      metadata: { ticketNumber: updated.ticketNumber, approvalStatus: dto.status },
    });
    return updated;
  }

  async findChangeOrders(tenantId: string, ticketId: string) {
    await this.getTicket(tenantId, ticketId);
    return this.prisma.workshopChangeOrder.findMany({
      where: { tenantId, ticketId },
      include: changeOrderInclude,
      orderBy: { number: 'desc' },
    });
  }

  async createChangeOrder(
    tenantId: string,
    userId: string,
    ticketId: string,
    dto: CreateWorkshopChangeOrderDto,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      this.ensureApprovedWork(ticket);
      if (ticket.salesOrderId) {
        throw new BadRequestException(
          'No se pueden agregar trabajos adicionales después de enviar la orden a Caja.',
        );
      }
      if (
        ticket.status !== WorkshopTicketStatus.APPROVED &&
        ticket.status !== WorkshopTicketStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          'Los trabajos adicionales se registran después de aprobar el presupuesto y antes de finalizar la reparación.',
        );
      }
      if (!dto.lines.length) {
        throw new BadRequestException(
          'Agrega al menos un servicio o repuesto al trabajo adicional.',
        );
      }
      const lines = await this.resolveLineCatalog(tenantId, dto.lines);
      const validAreaIds = new Set(ticket.areaFindings.map((finding) => finding.areaId));
      if (lines.some((line) => line.vehicleAreaId && !validAreaIds.has(line.vehicleAreaId))) {
        throw new BadRequestException(
          'Una línea del trabajo adicional está vinculada a un área inexistente.',
        );
      }
      const totals = this.calculateTotals(lines);
      const latest = await tx.workshopChangeOrder.findFirst({
        where: { ticketId },
        select: { number: true },
        orderBy: { number: 'desc' },
      });
      return tx.workshopChangeOrder.create({
        data: {
          tenantId,
          ticketId,
          number: (latest?.number ?? 0) + 1,
          title: dto.title.trim(),
          description: this.cleanOptional(dto.description),
          laborTotal: totals.laborTotal,
          partsTotal: totals.partsTotal,
          total: totals.total,
          createdById: userId,
          lines: { create: this.lineData(lines) },
        },
        include: changeOrderInclude,
      });
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_CHANGE_ORDER_CREATED',
      entity: 'WorkshopChangeOrder',
      entityId: created.id,
      metadata: { ticketId, number: created.number, total: created.total.toString() },
    });
    return created;
  }

  async respondChangeOrder(
    tenantId: string,
    userId: string,
    ticketId: string,
    changeOrderId: string,
    dto: RespondWorkshopChangeOrderDto,
  ) {
    if (
      dto.status !== WorkshopChangeOrderStatus.APPROVED &&
      dto.status !== WorkshopChangeOrderStatus.REJECTED &&
      dto.status !== WorkshopChangeOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Selecciona aprobar, rechazar o cancelar el trabajo adicional.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      if (ticket.salesOrderId) {
        throw new BadRequestException(
          'La orden ya fue enviada a Caja y no admite trabajos adicionales.',
        );
      }
      if (
        ticket.status !== WorkshopTicketStatus.APPROVED &&
        ticket.status !== WorkshopTicketStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          'El ticket no está disponible para aprobar trabajos adicionales.',
        );
      }
      const changeOrder = await tx.workshopChangeOrder.findFirst({
        where: { id: changeOrderId, tenantId, ticketId },
        include: { lines: true },
      });
      if (!changeOrder) throw new NotFoundException('Trabajo adicional no encontrado.');
      if (changeOrder.status !== WorkshopChangeOrderStatus.PENDING) {
        throw new BadRequestException('Este trabajo adicional ya tiene una respuesta registrada.');
      }

      const response = await tx.workshopChangeOrder.update({
        where: { id: changeOrder.id },
        data: {
          status: dto.status,
          responseNote: this.cleanOptional(dto.note),
          respondedAt: new Date(),
          respondedById: userId,
          decision: this.authorizationEvidence(dto, userId),
        },
        include: changeOrderInclude,
      });

      if (dto.status !== WorkshopChangeOrderStatus.APPROVED) return response;

      const acceptedLines = changeOrder.lines.map((line) => ({
        productId: line.productId ?? undefined,
        serviceId: line.serviceId ?? undefined,
        vehicleAreaId: line.vehicleAreaId ?? undefined,
        type: line.type,
        description: line.description,
        quantity: line.quantity.toNumber(),
        unitPrice: line.unitPrice.toNumber(),
        taxRate: line.taxRate,
      }));
      await this.resolveLineCatalog(tenantId, acceptedLines);
      await tx.workshopTicketLine.createMany({
        data: this.lineData(acceptedLines).map((line) => ({
          ...line,
          ticketId,
          approvalStatus: WorkshopApprovalStatus.APPROVED,
        })),
      });
      const allLines = await tx.workshopTicketLine.findMany({
        where: { ticketId, approvalStatus: WorkshopApprovalStatus.APPROVED },
      });
      await this.reserveTicketPartReservations(tx, tenantId, userId, ticket.ticketNumber, allLines);
      const totals = this.calculateTotals(allLines);
      await tx.workshopTicket.update({
        where: { id: ticketId },
        data: {
          estimatedTotal: totals.total,
          laborTotal: totals.laborTotal,
          partsTotal: totals.partsTotal,
          total: totals.total,
        },
      });
      // New authorized work must pass quality control again before collection.
      await tx.workshopQualityCheck.updateMany({
        where: { ticketId },
        data: { status: WorkshopQualityStatus.PENDING },
      });
      const latestQuote = await tx.workshopQuoteVersion.findFirst({
        where: { ticketId },
        select: { version: true },
        orderBy: { version: 'desc' },
      });
      await tx.workshopQuoteVersion.create({
        data: {
          tenantId,
          ticketId,
          version: (latestQuote?.version ?? 0) + 1,
          status: WorkshopApprovalStatus.APPROVED,
          laborTotal: totals.laborTotal,
          partsTotal: totals.partsTotal,
          total: totals.total,
          snapshot: this.quoteSnapshot(allLines, ticket.areaFindings),
          note: `Revisión ${changeOrder.number} aprobada: ${changeOrder.title}`,
          createdById: userId,
        },
      });
      return response;
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'WORKSHOP_CHANGE_ORDER_RESPONDED',
      entity: 'WorkshopChangeOrder',
      entityId: changeOrderId,
      metadata: { ticketId, status: dto.status },
    });
    return updated;
  }

  async createTask(tenantId: string, userId: string, ticketId: string, dto: CreateWorkshopTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      if (['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(ticket.status)) {
        throw new BadRequestException('La orden debe estar abierta para agregar tareas.');
      }
      if (dto.employeeId) await this.ensureMechanics(tenantId, [dto.employeeId]);

      this.ensureTaskScope(ticket, dto.kind, dto.ticketLineId);
      if (!dto.title?.trim()) throw new BadRequestException('Indica el nombre de la tarea.');
      await tx.workshopQualityCheck.updateMany({
        where: { ticketId },
        data: { status: WorkshopQualityStatus.PENDING },
      });
      const task = await tx.workshopTask.create({
        data: {
          ticketId,
          kind: dto.kind,
          ticketLineId: dto.ticketLineId,
          employeeId: dto.employeeId,
          title: dto.title.trim(),
          category: this.cleanOptional(dto.category),
          description: this.cleanOptional(dto.description),
          estimatedMinutes: dto.estimatedMinutes,
        },
        include: {
          employee: {
            include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          },
          timeEntries: { orderBy: { occurredAt: 'asc' } },
        },
      });
      await this.audit.log(
        {
          tenantId,
          userId,
          action: 'WORKSHOP_TASK_CREATED',
          entity: 'WorkshopTask',
          entityId: task.id,
          metadata: {
            ticketId,
            employeeId: task.employeeId,
            title: task.title,
            category: task.category,
            kind: task.kind,
            ticketLineId: task.ticketLineId,
          },
        },
        tx,
      );
      return task;
    });
  }

  async updateTask(
    tenantId: string,
    user: {
      id: string;
      memberships: Array<{ tenantId: string; role: Role; permissionOverrides?: unknown }>;
    },
    ticketId: string,
    taskId: string,
    dto: UpdateWorkshopTaskDto,
  ) {
    if ('actualMinutes' in dto || 'pausedMinutes' in dto)
      throw new BadRequestException(
        'Los tiempos se calculan a partir de los eventos; no se editan manualmente.',
      );
    if (
      Object.entries(dto).some(
        ([key, value]) =>
          ['kind', 'ticketLineId', 'employeeId', 'title', 'status'].includes(key) &&
          (value === null || value === ''),
      )
    )
      throw new BadRequestException(
        'El tipo, vínculo, técnico y estado de la tarea no pueden vaciarse.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, ticketId);
      if (['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(ticket.status)) {
        throw new BadRequestException('Las tareas de una orden finalizada no pueden modificarse.');
      }
      const task = await tx.workshopTask.findFirst({
        where: { id: taskId, ticketId },
        include: { employee: true, timeEntries: { orderBy: { occurredAt: 'asc' } } },
      });
      if (!task) throw new NotFoundException('Tarea no encontrada.');
      if (dto.employeeId) await this.ensureMechanics(tenantId, [dto.employeeId]);

      const membership = user.memberships.find((item) => item.tenantId === tenantId);
      const capabilities = membership ? effectivePermissions(membership) : {};
      const isMechanic = membership?.role === Role.MECHANIC && !capabilities['workorders.assign'];
      if (isMechanic && task.employee?.userId !== user.id) {
        throw new BadRequestException('Solo puedes actualizar las tareas que tienes asignadas.');
      }
      if (
        isMechanic &&
        Object.keys(dto).some(
          (field) =>
            field !== 'status' && !(field === 'cancellationReason' && capabilities['tasks.cancel']),
        )
      ) {
        throw new BadRequestException(
          'El mecánico solo puede registrar el avance de su tarea; la asignación corresponde al asesor.',
        );
      }
      const kind = dto.kind ?? task.kind;
      const ticketLineId = dto.ticketLineId ?? task.ticketLineId;
      const scopeChanged = kind !== task.kind || ticketLineId !== task.ticketLineId;
      const assignmentChanged = dto.employeeId !== undefined && dto.employeeId !== task.employeeId;
      if (scopeChanged && task.kind !== 'LEGACY')
        throw new BadRequestException(
          'La tarea ya tiene un alcance definido. Cancélala y crea otra para cambiar el trabajo autorizado.',
        );
      if ((scopeChanged || assignmentChanged) && task.status !== 'PENDING')
        throw new BadRequestException(
          'Una tarea iniciada conserva su alcance y técnico. Cancélala y crea una nueva asignación.',
        );
      const repeatedCancellation =
        task.status === 'CANCELLED' &&
        dto.status === 'CANCELLED' &&
        dto.cancellationReason?.trim() ===
          task.timeEntries.find((entry) => entry.event === 'CANCEL')?.note;
      if (
        ['COMPLETED', 'CANCELLED'].includes(task.status) &&
        Object.keys(dto).some(
          (field) =>
            field !== 'status' && !(repeatedCancellation && field === 'cancellationReason'),
        )
      )
        throw new BadRequestException('Una tarea finalizada conserva su registro histórico.');
      if (
        task.status !== 'PENDING' &&
        Object.keys(dto).some((field) => !['status', 'cancellationReason'].includes(field))
      )
        throw new BadRequestException(
          'Una tarea iniciada conserva su información. Registra una nueva tarea si cambia el trabajo.',
        );
      if (dto.title !== undefined && !dto.title.trim())
        throw new BadRequestException('Indica el nombre de la tarea.');
      const advancesWork = dto.status === 'IN_PROGRESS' || dto.status === 'COMPLETED';
      if (scopeChanged || advancesWork) this.ensureTaskScope(ticket, kind, ticketLineId);
      if (advancesWork) {
        const employeeId = dto.employeeId ?? task.employeeId;
        if (!employeeId)
          throw new BadRequestException(
            'Asigna un mecánico antes de iniciar o finalizar la tarea.',
          );
        await this.ensureMechanics(tenantId, [employeeId]);
        if (kind === 'DIAGNOSIS' && ticket.status !== 'DIAGNOSIS')
          throw new BadRequestException(
            'Las tareas de diagnóstico se ejecutan durante el diagnóstico.',
          );
        if (kind === 'REPAIR' && ticket.status !== 'IN_PROGRESS')
          throw new BadRequestException(
            'Inicia la reparación de la orden antes de trabajar la tarea.',
          );
      }
      if (isMechanic && dto.status === 'CANCELLED' && !capabilities['tasks.cancel'])
        throw new BadRequestException(
          'La cancelación de una tarea corresponde al asesor o supervisor.',
        );
      const now = new Date();
      const nextStatus = dto.status ?? task.status;
      const timeEvent = this.taskTimeEvent(task.status, nextStatus);
      if (timeEvent === 'CANCEL' && !dto.cancellationReason?.trim())
        throw new BadRequestException('Indica el motivo de cancelación de la tarea.');
      if (
        dto.status &&
        dto.status !== task.status &&
        !timeEvent &&
        nextStatus !== WorkshopTaskStatus.CANCELLED
      ) {
        throw new BadRequestException('La transición de estado de esta tarea no es válida.');
      }
      if (
        dto.status &&
        dto.status !== task.status &&
        !this.canTransitionTaskStatus(task.status, nextStatus)
      ) {
        throw new BadRequestException('La transición de estado de esta tarea no es válida.');
      }

      if (timeEvent) {
        await tx.workshopTaskTimeEntry.create({
          data: {
            tenantId,
            taskId,
            userId: user.id,
            event: timeEvent,
            occurredAt: now,
            note: timeEvent === 'CANCEL' ? dto.cancellationReason!.trim() : undefined,
          },
        });
      }

      const entriesForTotal = timeEvent
        ? [...task.timeEntries, { event: timeEvent, occurredAt: now }]
        : task.timeEntries;
      if (
        !repeatedCancellation &&
        (Object.keys(dto).some((field) => field !== 'status') || nextStatus !== task.status)
      )
        await tx.workshopQualityCheck.updateMany({
          where: { ticketId },
          data: { status: 'PENDING' },
        });
      const updated = await tx.workshopTask.update({
        where: { id: taskId },
        data: {
          employeeId: dto.employeeId,
          kind: dto.kind,
          ticketLineId: dto.ticketLineId,
          title: dto.title?.trim(),
          category: dto.category === undefined ? undefined : this.cleanOptional(dto.category),
          description:
            dto.description === undefined ? undefined : this.cleanOptional(dto.description),
          estimatedMinutes: dto.estimatedMinutes,
          status: dto.status,
          ...(timeEvent
            ? taskTimeTotals(entriesForTotal, {
                now,
                startedAt: task.startedAt,
                status: nextStatus,
                previousActualMinutes: task.actualMinutes,
                previousPausedMinutes: task.pausedMinutes,
              })
            : {}),
          ...(timeEvent === WorkshopTaskTimeEvent.START ? { startedAt: now } : {}),
          ...(timeEvent === WorkshopTaskTimeEvent.COMPLETE ? { completedAt: now } : {}),
        },
        include: {
          employee: {
            include: { user: { select: { id: true, name: true, email: true, phone: true } } },
          },
          timeEntries: { orderBy: { occurredAt: 'asc' } },
        },
      });
      await this.audit.log(
        {
          tenantId,
          userId: user.id,
          action: 'WORKSHOP_TASK_UPDATED',
          entity: 'WorkshopTask',
          entityId: taskId,
          metadata: {
            ticketId,
            status: updated.status,
            actualMinutes: updated.actualMinutes,
            pausedMinutes: updated.pausedMinutes,
            kind: updated.kind,
            ticketLineId: updated.ticketLineId,
            cancellationReason: dto.cancellationReason,
            fields: Object.keys(dto),
            previous: {
              title: task.title,
              employeeId: task.employeeId,
              kind: task.kind,
              ticketLineId: task.ticketLineId,
              status: task.status,
              estimatedMinutes: task.estimatedMinutes,
              actualMinutes: task.actualMinutes,
              pausedMinutes: task.pausedMinutes,
            },
            next: {
              title: updated.title,
              employeeId: updated.employeeId,
              kind: updated.kind,
              ticketLineId: updated.ticketLineId,
              status: updated.status,
              estimatedMinutes: updated.estimatedMinutes,
              actualMinutes: updated.actualMinutes,
              pausedMinutes: updated.pausedMinutes,
            },
          },
        },
        tx,
      );
      return updated;
    });
    return updated;
  }

  async movePart(
    tenantId: string,
    userId: string,
    ticketId: string,
    lineId: string,
    action: string,
    dto: WorkshopPartMovementDto,
  ) {
    if (!['consume', 'return', 'release'].includes(action)) {
      throw new BadRequestException('Movimiento de repuesto no válido.');
    }
    if (
      !Number.isFinite(dto.quantity) ||
      dto.quantity <= 0 ||
      dto.quantity > 9999999999.99 ||
      !new Prisma.Decimal(dto.quantity).eq(new Prisma.Decimal(dto.quantity).toDecimalPlaces(2)) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        dto.operationKey,
      )
    ) {
      throw new BadRequestException(
        'Indica una cantidad positiva de hasta dos decimales y una clave de operación válida.',
      );
    }
    const type =
      action === 'consume'
        ? InventoryMovementType.WORK_ORDER_CONSUMPTION
        : action === 'return'
          ? InventoryMovementType.WORK_ORDER_RETURN
          : InventoryMovementType.WORK_ORDER_RELEASE;
    if (action === 'release' && !this.cleanOptional(dto.note)) {
      throw new BadRequestException('Indica por qué estas unidades no se utilizarán ni cobrarán.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const ticket = await this.lockTicket(tx, tenantId, ticketId);
        const existing = await tx.inventoryMovement.findUnique({
          where: { tenantId_operationKey: { tenantId, operationKey: dto.operationKey } },
        });
        if (existing) {
          if (
            existing.workshopTicketLineId !== lineId ||
            existing.type !== type ||
            existing.quantity !== dto.quantity ||
            !ticket.lines.some((line) => line.id === lineId)
          ) {
            throw new ConflictException('Esta clave de operación ya se usó para otro movimiento.');
          }
          return ticket;
        }
        if (ticket.salesOrderId || !['APPROVED', 'IN_PROGRESS'].includes(ticket.status)) {
          throw new BadRequestException(
            'Los repuestos se entregan o devuelven durante la reparación, antes de preparar el cobro.',
          );
        }
        this.ensureApprovedWork(ticket);
        const line = ticket.lines.find((item) => item.id === lineId);
        if (
          !line ||
          !line.productId ||
          line.type !== WorkshopTicketLineType.PART ||
          line.approvalStatus !== WorkshopApprovalStatus.APPROVED
        ) {
          throw new BadRequestException('Selecciona un repuesto aprobado de esta OT.');
        }
        const product = await tx.product.findFirst({ where: { id: line.productId, tenantId } });
        if (!product?.trackInventory) {
          throw new BadRequestException('Este artículo no tiene control de inventario.');
        }
        const fractionalUnits: ProductUnit[] = [
          ProductUnit.METER,
          ProductUnit.FOOT,
          ProductUnit.YARD,
          ProductUnit.POUND,
        ];
        if (!fractionalUnits.includes(product.unit) && !Number.isInteger(dto.quantity)) {
          throw new BadRequestException('Este repuesto requiere cantidades enteras.');
        }
        const quantity = new Prisma.Decimal(dto.quantity);
        const consuming = action === 'consume';
        if (
          consuming &&
          (product.status !== ProductStatus.ACTIVE ||
            new Prisma.Decimal(line.reservedQuantity).lt(quantity) ||
            line.consumedQuantity.add(line.releasedQuantity).add(quantity).gt(line.quantity))
        ) {
          throw new BadRequestException(
            'La cantidad supera la reserva pendiente o el repuesto ya no está activo.',
          );
        }
        if (action === 'return' && line.consumedQuantity.lt(quantity)) {
          throw new BadRequestException('No puedes devolver más piezas de las entregadas.');
        }
        if (action === 'release' && new Prisma.Decimal(line.reservedQuantity).lt(quantity)) {
          throw new BadRequestException(
            'Solo puedes liberar cantidades pendientes de entregar. Devuelve primero las piezas que no se usaron.',
          );
        }
        const changed = consuming
          ? await tx.$queryRaw<Array<{ stock: number }>>`
              UPDATE "Product" SET "stock" = "stock" - ${dto.quantity},
                "reservedStock" = GREATEST("reservedStock" - ${dto.quantity}, 0)
              WHERE "id" = ${product.id} AND "tenantId" = ${tenantId}
                AND "trackInventory" = TRUE AND "status" = 'ACTIVE'
                AND "stock" >= ${dto.quantity} AND "reservedStock" >= ${dto.quantity}
              RETURNING "stock"
            `
          : action === 'return'
            ? await tx.$queryRaw<Array<{ stock: number }>>`
              UPDATE "Product" SET "stock" = "stock" + ${dto.quantity},
                "reservedStock" = "reservedStock" + ${dto.quantity}
              WHERE "id" = ${product.id} AND "tenantId" = ${tenantId} AND "trackInventory" = TRUE
              RETURNING "stock"
            `
            : await tx.$queryRaw<Array<{ stock: number }>>`
              UPDATE "Product" SET "reservedStock" = GREATEST("reservedStock" - ${dto.quantity}, 0)
              WHERE "id" = ${product.id} AND "tenantId" = ${tenantId}
                AND "reservedStock" >= ${dto.quantity} AND "trackInventory" = TRUE
              RETURNING "stock"
            `;
        if (changed.length !== 1)
          throw new ConflictException('La existencia o reserva cambió. Revisa el inventario.');
        const consumedQuantity = consuming
          ? line.consumedQuantity.add(quantity)
          : action === 'return'
            ? line.consumedQuantity.sub(quantity)
            : line.consumedQuantity;
        const releasedQuantity =
          action === 'release' ? line.releasedQuantity.add(quantity) : line.releasedQuantity;
        await tx.workshopTicketLine.update({
          where: { id: lineId },
          data: {
            consumedQuantity,
            releasedQuantity,
            reservedQuantity: line.quantity.sub(consumedQuantity).sub(releasedQuantity).toNumber(),
          },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type,
            quantity: dto.quantity,
            previousStock:
              changed[0].stock +
              (consuming ? dto.quantity : action === 'return' ? -dto.quantity : 0),
            newStock: changed[0].stock,
            unitCost: product.cost,
            reference: ticket.ticketNumber,
            workshopTicketLineId: lineId,
            operationKey: dto.operationKey,
            createdById: userId,
            reason:
              this.cleanOptional(dto.note) ??
              (consuming
                ? 'Entrega de repuesto para reparación'
                : 'Devolución sin usar; reserva restituida a la OT'),
          },
        });
        if (action === 'release') {
          const acceptedLines = await tx.workshopTicketLine.findMany({
            where: { ticketId, approvalStatus: WorkshopApprovalStatus.APPROVED },
          });
          const totals = this.calculateTotals(acceptedLines);
          await tx.workshopTicket.update({
            where: { id: ticketId },
            data: { ...totals, estimatedTotal: totals.total },
          });
        }
        await tx.workshopQualityCheck.updateMany({
          where: { ticketId },
          data: { status: WorkshopQualityStatus.PENDING },
        });
        return tx.workshopTicket.findUniqueOrThrow({
          relationLoadStrategy: 'join',
          where: { id: ticketId },
          include: ticketInclude,
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ConflictException(
          'La clave de este movimiento ya fue utilizada. Actualiza la orden.',
        );
      throw error;
    }
  }

  async sendToCashier(
    tenantId: string,
    userId: string,
    id: string,
    dto: SendWorkshopTicketToCashierDto,
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, tenantId, id);
      if (ticket.salesOrderId) {
        throw new BadRequestException('Esta orden de reparación ya fue enviada a Caja.');
      }
      if (
        ticket.status !== WorkshopTicketStatus.APPROVED &&
        ticket.status !== WorkshopTicketStatus.IN_PROGRESS &&
        ticket.status !== WorkshopTicketStatus.READY_FOR_DELIVERY
      ) {
        throw new BadRequestException(
          'El presupuesto debe estar aprobado antes de facturar la orden.',
        );
      }
      const acceptedApprovalStatuses: WorkshopApprovalStatus[] = [
        WorkshopApprovalStatus.APPROVED,
        WorkshopApprovalStatus.PARTIALLY_APPROVED,
      ];
      if (!acceptedApprovalStatuses.includes(ticket.approvalStatus)) {
        throw new BadRequestException(
          'La orden necesita una aprobación registrada antes de cobrarla.',
        );
      }
      this.ensureApprovedWork(ticket);
      await this.ensureNoPendingChanges(tx, tenantId, id);
      const approvedLines = ticket.lines.filter(
        (line) => line.approvalStatus === WorkshopApprovalStatus.APPROVED,
      );
      if (!approvedLines.length || approvedLines.some((line) => !line.productId)) {
        throw new BadRequestException(
          'Para enviar a Caja, cada línea debe vincularse a un repuesto o servicio del catálogo.',
        );
      }
      const recipientEmail = dto.electronicInvoiceRequested
        ? (this.cleanOptional(dto.ecfRecipientEmail) ?? ticket.customer.email)
        : null;
      if (dto.electronicInvoiceRequested && !recipientEmail) {
        throw new BadRequestException(
          'Indica el correo para enviar la copia de la factura electrónica.',
        );
      }

      const productIds = approvedLines.map((line) => line.productId!).filter(Boolean);
      const products = await tx.product.findMany({
        where: {
          tenantId,
          id: { in: productIds },
          status: ProductStatus.ACTIVE,
          inventoryDestination: ProductInventoryDestination.SALES_INVENTORY,
        },
      });
      if (products.length !== new Set(productIds).size) {
        throw new BadRequestException(
          'Algún repuesto o servicio ya no está disponible en el catálogo.',
        );
      }
      const productsById = new Map(products.map((product) => [product.id, product]));
      const items = approvedLines
        .map((line) => {
          const product = productsById.get(line.productId!);
          if (!product) throw new BadRequestException('Producto de orden no encontrado.');
          const quantity = product.trackInventory
            ? line.quantity.sub(line.releasedQuantity)
            : line.quantity;
          const pendingQuantity = quantity.sub(line.consumedQuantity);
          if (
            product.trackInventory &&
            (pendingQuantity.lt(0) ||
              Math.abs(line.reservedQuantity - pendingQuantity.toNumber()) > 1e-9)
          ) {
            throw new BadRequestException(
              `La reserva de ${product.name} no coincide con la cantidad aprobada. Actualiza la orden antes de facturar.`,
            );
          }
          const subtotal = quantity.mul(line.unitPrice).toDecimalPlaces(2);
          const taxTotal = subtotal.mul(line.taxRate).toDecimalPlaces(2);
          return {
            line,
            product,
            quantity,
            subtotal,
            taxTotal,
            total: subtotal.add(taxTotal).toDecimalPlaces(2),
          };
        })
        .filter((item) => item.quantity.gt(0));
      if (!items.length)
        throw new BadRequestException('No hay trabajos o repuestos consumidos para cobrar.');
      const subtotal = items.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
      const taxTotal = items.reduce((sum, item) => sum.add(item.taxTotal), new Prisma.Decimal(0));
      const total = subtotal.add(taxTotal).toDecimalPlaces(2);

      const salesOrder = await tx.salesOrder.create({
        data: {
          tenantId,
          customerId: ticket.customerId,
          destination: SalesOrderDestination.CASH_SALE,
          inventorySource: ProductInventoryDestination.SALES_INVENTORY,
          clientName: ticket.customer.name,
          electronicInvoiceRequested: dto.electronicInvoiceRequested === true,
          ecfRecipientEmail: recipientEmail,
          orderNumber: this.generateWorkshopOrderNumber(ticket.ticketNumber),
          status: SalesOrderStatus.SENT_TO_CASHIER,
          subtotal,
          taxTotal,
          total,
          createdById: userId,
          sentToCashierAt: new Date(),
          notes: `Orden de reparación ${ticket.ticketNumber}`,
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              workshopTicketLineId: item.line.id,
              sku: item.product.sku,
              barcode: item.product.barcode,
              description: item.line.description,
              quantity: item.quantity,
              reservedQuantity: item.line.reservedQuantity,
              inventoryConsumedQuantity: item.line.consumedQuantity,
              unitPrice: item.line.unitPrice,
              taxRate: item.line.taxRate,
              taxTotal: item.taxTotal,
              subtotal: item.subtotal,
              total: item.total,
            })),
          },
        },
      });
      await tx.workshopTicket.update({
        where: { id },
        data: { salesOrderId: salesOrder.id, total, estimatedTotal: total },
      });
      await this.audit.log(
        {
          tenantId,
          userId,
          action: 'WORKSHOP_TICKET_SENT_TO_CASHIER',
          entity: 'WorkshopTicket',
          entityId: id,
          metadata: { orderNumber: salesOrder.orderNumber, total: salesOrder.total.toString() },
        },
        tx,
      );
      return salesOrder;
    });
    return order;
  }

  mechanics(tenantId: string) {
    return this.prisma.employeeProfile.findMany({
      where: {
        tenantId,
        status: EmployeeStatus.ACTIVE,
        user: {
          memberships: { some: { tenantId, role: Role.MECHANIC, status: MembershipStatus.ACTIVE } },
        },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  private async resolveLineCatalog(tenantId: string, lines: WorkshopTicketLineDto[]) {
    const productIds = lines
      .map((line) => line.productId)
      .filter((productId): productId is string => Boolean(productId));
    const serviceIds = lines
      .map((line) => line.serviceId)
      .filter((serviceId): serviceId is string => Boolean(serviceId));
    const [products, services] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          tenantId,
          id: { in: [...new Set(productIds)] },
          inventoryDestination: ProductInventoryDestination.SALES_INVENTORY,
          status: ProductStatus.ACTIVE,
        },
        select: { id: true, taxRate: true },
      }),
      this.prisma.workshopService.findMany({
        where: { tenantId, id: { in: [...new Set(serviceIds)] }, active: true },
        include: {
          product: {
            select: {
              id: true,
              status: true,
              inventoryDestination: true,
              trackInventory: true,
              taxRate: true,
            },
          },
        },
      }),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));
    const servicesById = new Map(services.map((service) => [service.id, service]));

    return lines.map((line) => {
      if (line.type === WorkshopTicketLineType.PART) {
        if (!line.productId || !productsById.has(line.productId)) {
          throw new BadRequestException('Cada repuesto debe pertenecer al inventario activo.');
        }
        if (line.serviceId) {
          throw new BadRequestException('Un repuesto no puede estar vinculado a un servicio.');
        }
        return { ...line, taxRate: productsById.get(line.productId)!.taxRate };
      }

      if (!line.serviceId) {
        throw new BadRequestException(
          'La mano de obra y los servicios externos deben seleccionarse desde el catálogo de servicios.',
        );
      }
      const service = servicesById.get(line.serviceId);
      if (
        !service ||
        service.product.status !== ProductStatus.ACTIVE ||
        service.product.inventoryDestination !== ProductInventoryDestination.SALES_INVENTORY ||
        service.product.trackInventory
      ) {
        throw new BadRequestException('Uno de los servicios seleccionados no está disponible.');
      }
      return { ...line, productId: service.productId, taxRate: service.product.taxRate };
    });
  }

  private normalizeServiceCode(code: string) {
    const normalized = code.trim().toUpperCase().replace(/\s+/g, '-');
    if (!normalized) throw new BadRequestException('El código del servicio es obligatorio.');
    return normalized;
  }

  private serviceProductSku(code: string) {
    return `SRV-${code}`;
  }

  private async reserveTicketPartReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    ticketNumber: string,
    lines: Array<{
      id: string;
      productId: string | null;
      type: WorkshopTicketLineType;
      quantity: Prisma.Decimal;
      reservedQuantity: number;
      consumedQuantity: Prisma.Decimal;
      releasedQuantity: Prisma.Decimal;
    }>,
  ) {
    const required = new Map<string, number>();
    for (const line of lines) {
      if (
        !line.productId ||
        line.reservedQuantity > 0 ||
        line.consumedQuantity.gt(0) ||
        line.releasedQuantity.gt(0)
      ) {
        continue;
      }
      required.set(line.productId, (required.get(line.productId) ?? 0) + line.quantity.toNumber());
    }
    if (!required.size) return;
    const products = await tx.product.findMany({
      where: { tenantId, id: { in: [...required.keys()] }, status: ProductStatus.ACTIVE },
      select: { id: true, name: true, trackInventory: true, stock: true, cost: true },
      orderBy: { id: 'asc' },
    });
    if (products.length !== required.size) {
      throw new BadRequestException('Algún repuesto presupuestado ya no está disponible.');
    }
    const trackedProductIds = new Set(
      products.filter((product) => product.trackInventory).map((product) => product.id),
    );
    for (const product of products) {
      if (!product.trackInventory) continue;
      const quantity = required.get(product.id) ?? 0;
      const updated = await tx.$executeRaw`
        UPDATE "Product"
        SET "reservedStock" = "reservedStock" + ${quantity}
        WHERE "id" = ${product.id}
          AND "tenantId" = ${tenantId}
          AND "trackInventory" = TRUE
          AND ("stock" - "reservedStock") >= ${quantity}
      `;
      if (updated !== 1) {
        throw new BadRequestException(
          `No hay suficiente existencia disponible para ${product.name}.`,
        );
      }
    }
    for (const line of lines) {
      if (
        !line.productId ||
        line.reservedQuantity > 0 ||
        line.consumedQuantity.gt(0) ||
        line.releasedQuantity.gt(0)
      ) {
        continue;
      }
      await tx.workshopTicketLine.update({
        where: { id: line.id },
        data: {
          reservedQuantity: trackedProductIds.has(line.productId) ? line.quantity.toNumber() : 0,
        },
      });
      const product = products.find((item) => item.id === line.productId);
      if (product?.trackInventory) {
        const currentProduct = await tx.product.findUniqueOrThrow({ where: { id: product.id } });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type: InventoryMovementType.WORK_ORDER_RESERVATION,
            quantity: line.quantity.toNumber(),
            previousStock: currentProduct.stock,
            newStock: currentProduct.stock,
            unitCost: product.cost,
            reference: ticketNumber,
            workshopTicketLineId: line.id,
            reason: 'Reserva por autorización del cliente; no descuenta existencia',
            createdById: userId,
          },
        });
      }
    }
  }

  private async releaseTicketPartReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    ticketNumber: string,
    lines: Array<{ id: string; productId: string | null; reservedQuantity: number }>,
  ) {
    for (const line of lines) {
      if (!line.productId || line.reservedQuantity <= 0) continue;
      const changed = await tx.$queryRaw<Array<{ stock: number }>>`
        UPDATE "Product"
        SET "reservedStock" = GREATEST("reservedStock" - ${line.reservedQuantity}, 0)
        WHERE "id" = ${line.productId} AND "tenantId" = ${tenantId}
          AND "reservedStock" >= ${line.reservedQuantity}
        RETURNING "stock"
      `;
      if (changed.length !== 1)
        throw new ConflictException('La reserva cambió. Revisa inventario antes de cancelar.');
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: line.productId,
          type: InventoryMovementType.WORK_ORDER_RELEASE,
          quantity: line.reservedQuantity,
          previousStock: changed[0].stock,
          newStock: changed[0].stock,
          reference: ticketNumber,
          workshopTicketLineId: line.id,
          reason: 'Liberación de reserva por cancelación de OT',
          createdById: userId,
        },
      });
      await tx.workshopTicketLine.update({
        where: { id: line.id },
        data: { reservedQuantity: 0, releasedQuantity: { increment: line.reservedQuantity } },
      });
    }
  }

  private async getVehicle(tenantId: string, id: string) {
    const vehicle = await this.prisma.workshopVehicle.findFirst({ where: { id, tenantId } });
    if (!vehicle) throw new NotFoundException('Vehículo no encontrado.');
    return vehicle;
  }

  private async getTicket(tenantId: string, id: string) {
    const ticket = await this.prisma.workshopTicket.findFirst({
      relationLoadStrategy: 'join',
      where: { id, tenantId },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Ticket de servicio no encontrado.');
    return ticket;
  }

  private async lockTicket(tx: Prisma.TransactionClient, tenantId: string, id: string) {
    // All approval, billing and delivery mutations serialize on the same OT.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "WorkshopTicket" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Orden de trabajo no encontrada.');
    return tx.workshopTicket.findUniqueOrThrow({
      relationLoadStrategy: 'join',
      where: { id },
      include: ticketInclude,
    });
  }

  private ensureApprovedWork(
    ticket: Prisma.WorkshopTicketGetPayload<{ include: typeof ticketInclude }>,
  ) {
    if (
      !['APPROVED', 'PARTIALLY_APPROVED'].includes(ticket.approvalStatus) ||
      !ticket.lines.some((line) => line.approvalStatus === WorkshopApprovalStatus.APPROVED)
    ) {
      throw new BadRequestException(
        'La orden necesita trabajos expresamente autorizados por el cliente.',
      );
    }
  }

  private async ensureNoPendingChanges(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ticketId: string,
  ) {
    const pending = await tx.workshopChangeOrder.count({
      where: { tenantId, ticketId, status: WorkshopChangeOrderStatus.PENDING },
    });
    if (pending)
      throw new BadRequestException(
        'Registra la respuesta de los trabajos adicionales pendientes antes de finalizar o cobrar.',
      );
  }

  private authorizationEvidence(
    dto: WorkshopAuthorizationEvidenceDto,
    userId: string,
  ): Prisma.InputJsonObject {
    if (
      !dto.authorizedByName?.trim() ||
      !['IN_PERSON', 'PHONE', 'WHATSAPP', 'EMAIL', 'DIGITAL'].includes(dto.method)
    ) {
      throw new BadRequestException('Registra el nombre de quien autoriza y el medio de contacto.');
    }
    return {
      authorizedByName: dto.authorizedByName.trim(),
      method: dto.method,
      recordedById: userId,
      recordedAt: new Date().toISOString(),
    };
  }

  private async getAppointment(tenantId: string, id: string) {
    const appointment = await this.prisma.workshopAppointment.findFirst({
      relationLoadStrategy: 'join',
      where: { id, tenantId },
      include: appointmentInclude,
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada.');
    return appointment;
  }

  private async ensureCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');
  }

  private async ensureMechanics(tenantId: string, employeeIds: string[]) {
    if (!employeeIds.length) return;
    const count = await this.prisma.employeeProfile.count({
      where: {
        tenantId,
        id: { in: employeeIds },
        status: EmployeeStatus.ACTIVE,
        user: {
          memberships: { some: { tenantId, role: Role.MECHANIC, status: MembershipStatus.ACTIVE } },
        },
      },
    });
    if (count !== employeeIds.length) {
      throw new BadRequestException('Solo se pueden asignar mecánicos activos del taller.');
    }
  }

  private calculateTotals(
    lines: Array<{
      type: WorkshopTicketLineType;
      quantity: number | Prisma.Decimal;
      unitPrice: number | Prisma.Decimal;
      taxRate?: number | Prisma.Decimal;
      releasedQuantity?: number | Prisma.Decimal;
    }>,
  ) {
    const totals = lines.reduce(
      (accumulator, line) => {
        const subtotal = new Prisma.Decimal(line.quantity)
          .sub(line.releasedQuantity ?? 0)
          .mul(line.unitPrice)
          .toDecimalPlaces(2);
        const taxTotal = subtotal.mul(line.taxRate ?? 0.18).toDecimalPlaces(2);
        const total = subtotal.add(taxTotal).toDecimalPlaces(2);
        accumulator.total = accumulator.total.plus(total);
        if (line.type !== WorkshopTicketLineType.PART)
          accumulator.laborTotal = accumulator.laborTotal.plus(subtotal);
        if (line.type === WorkshopTicketLineType.PART)
          accumulator.partsTotal = accumulator.partsTotal.plus(subtotal);
        return accumulator;
      },
      {
        total: new Prisma.Decimal(0),
        laborTotal: new Prisma.Decimal(0),
        partsTotal: new Prisma.Decimal(0),
      },
    );
    return totals;
  }

  private quoteSnapshot(
    lines: Array<{
      id?: string;
      productId?: string | null;
      serviceId?: string | null;
      vehicleAreaId?: string | null;
      type: WorkshopTicketLineType;
      description: string;
      quantity: number | Prisma.Decimal;
      unitPrice: number | Prisma.Decimal;
      taxRate?: number | Prisma.Decimal;
      releasedQuantity?: number | Prisma.Decimal;
    }>,
    areaFindings: Array<{
      areaId: string;
      areaLabel: string;
      view: string;
      condition: string;
      finding?: string | null;
      notes?: string | null;
    }> = [],
  ): Prisma.InputJsonValue {
    return {
      lines: lines.map((line) => ({
        id: line.id ?? null,
        productId: line.productId ?? null,
        serviceId: line.serviceId ?? null,
        vehicleAreaId: line.vehicleAreaId ?? null,
        type: line.type,
        description: line.description,
        quantity: new Prisma.Decimal(line.quantity).toFixed(2),
        releasedQuantity: new Prisma.Decimal(line.releasedQuantity ?? 0).toFixed(2),
        billableQuantity: new Prisma.Decimal(line.quantity)
          .sub(line.releasedQuantity ?? 0)
          .toFixed(2),
        unitPrice: new Prisma.Decimal(line.unitPrice).toFixed(2),
        taxRate: new Prisma.Decimal(line.taxRate ?? 0.18).toFixed(4),
        taxTotal: new Prisma.Decimal(line.quantity)
          .sub(line.releasedQuantity ?? 0)
          .mul(line.unitPrice)
          .mul(line.taxRate ?? 0.18)
          .toDecimalPlaces(2)
          .toFixed(2),
        total: new Prisma.Decimal(line.quantity)
          .sub(line.releasedQuantity ?? 0)
          .mul(line.unitPrice)
          .toDecimalPlaces(2)
          .toFixed(2),
      })),
      areaFindings: areaFindings.map((finding) => ({
        areaId: finding.areaId,
        areaLabel: finding.areaLabel,
        view: finding.view,
        condition: finding.condition,
        finding: finding.finding ?? null,
        notes: finding.notes ?? null,
      })),
    };
  }

  private lineData(
    lines: Array<{
      productId?: string | null;
      serviceId?: string | null;
      vehicleAreaId?: string | null;
      type: WorkshopTicketLineType;
      description: string;
      quantity: number | Prisma.Decimal;
      unitPrice: number | Prisma.Decimal;
      taxRate?: number | Prisma.Decimal;
    }>,
  ) {
    return lines.map((line) => {
      const quantity = this.money(line.quantity);
      const unitPrice = this.money(line.unitPrice);
      return {
        productId: line.productId || undefined,
        serviceId: line.serviceId || undefined,
        vehicleAreaId: line.vehicleAreaId || undefined,
        type: line.type,
        description: line.description.trim(),
        quantity,
        unitPrice,
        taxRate: new Prisma.Decimal(line.taxRate ?? 0.18).toDecimalPlaces(4),
        total: quantity.mul(unitPrice).toDecimalPlaces(2),
      };
    });
  }

  private canTransitionTaskStatus(current: WorkshopTaskStatus, next: WorkshopTaskStatus) {
    if (current === next) return true;
    const allowed: Record<WorkshopTaskStatus, WorkshopTaskStatus[]> = {
      [WorkshopTaskStatus.PENDING]: [WorkshopTaskStatus.IN_PROGRESS, WorkshopTaskStatus.CANCELLED],
      [WorkshopTaskStatus.IN_PROGRESS]: [
        WorkshopTaskStatus.PAUSED,
        WorkshopTaskStatus.COMPLETED,
        WorkshopTaskStatus.CANCELLED,
      ],
      [WorkshopTaskStatus.PAUSED]: [
        WorkshopTaskStatus.IN_PROGRESS,
        WorkshopTaskStatus.COMPLETED,
        WorkshopTaskStatus.CANCELLED,
      ],
      [WorkshopTaskStatus.COMPLETED]: [],
      [WorkshopTaskStatus.CANCELLED]: [],
    };
    return allowed[current].includes(next);
  }

  private taskTimeEvent(current: WorkshopTaskStatus, next: WorkshopTaskStatus) {
    if (current !== next && next === WorkshopTaskStatus.CANCELLED)
      return WorkshopTaskTimeEvent.CANCEL;
    if (current === WorkshopTaskStatus.PENDING && next === WorkshopTaskStatus.IN_PROGRESS) {
      return WorkshopTaskTimeEvent.START;
    }
    if (current === WorkshopTaskStatus.IN_PROGRESS && next === WorkshopTaskStatus.PAUSED) {
      return WorkshopTaskTimeEvent.PAUSE;
    }
    if (current === WorkshopTaskStatus.PAUSED && next === WorkshopTaskStatus.IN_PROGRESS) {
      return WorkshopTaskTimeEvent.RESUME;
    }
    if (
      (current === WorkshopTaskStatus.IN_PROGRESS || current === WorkshopTaskStatus.PAUSED) &&
      next === WorkshopTaskStatus.COMPLETED
    ) {
      return WorkshopTaskTimeEvent.COMPLETE;
    }
    return undefined;
  }

  private ensureTaskScope(
    ticket: Prisma.WorkshopTicketGetPayload<{ include: typeof ticketInclude }>,
    kind: string,
    ticketLineId?: string | null,
  ) {
    if (kind === 'DIAGNOSIS') {
      if (ticketLineId)
        throw new BadRequestException('El diagnóstico no se vincula a una línea de reparación.');
      if (!['RECEIVED', 'DIAGNOSIS'].includes(ticket.status))
        throw new BadRequestException(
          'Las tareas de diagnóstico se preparan en recepción o diagnóstico.',
        );
      return;
    }
    if (kind !== 'REPAIR')
      throw new BadRequestException(
        'Clasifica la tarea como diagnóstico o reparación antes de ejecutarla.',
      );
    const line = ticket.lines.find((candidate) => candidate.id === ticketLineId);
    if (!line || line.approvalStatus !== 'APPROVED')
      throw new BadRequestException('Selecciona una línea aprobada del presupuesto de esta orden.');
    if (!['APPROVED', 'IN_PROGRESS'].includes(ticket.status))
      throw new BadRequestException('La reparación debe estar aprobada antes de asignar trabajos.');
    this.ensureApprovedWork(ticket);
  }

  private ensureAuthorizedTasksCompleted(
    ticket: Prisma.WorkshopTicketGetPayload<{ include: typeof ticketInclude }>,
  ) {
    const pendingExternal = ticket.lines.find(
      (line) =>
        line.type === 'OTHER' &&
        line.approvalStatus === 'APPROVED' &&
        !ticket.externalJobs.some(
          (job) => job.ticketLineId === line.id && job.status === 'RETURNED',
        ),
    );
    if (pendingExternal)
      throw new BadRequestException(
        `Registra el retorno del servicio externo: ${pendingExternal.description}.`,
      );
    if (ticket.tasks.some((task) => !['COMPLETED', 'CANCELLED'].includes(task.status)))
      throw new BadRequestException('Finaliza las tareas antes de aprobar el control de calidad.');
    const pendingLabor = ticket.lines
      .filter((line) => line.type === 'LABOR' && line.approvalStatus === 'APPROVED')
      .find(
        (line) =>
          !ticket.tasks.some(
            (task) =>
              task.ticketLineId === line.id &&
              task.kind === 'REPAIR' &&
              task.status === 'COMPLETED',
          ),
      );
    if (pendingLabor)
      throw new BadRequestException(
        `Falta registrar y completar la tarea autorizada: ${pendingLabor.description}.`,
      );
  }

  private money(value: number | Prisma.Decimal) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private cleanOptional(value: string | undefined) {
    const cleaned = value?.trim();
    return cleaned || undefined;
  }

  private ensureReceptionMileage(currentMileage: number | null, receivedMileage: number) {
    if (currentMileage !== null && receivedMileage < currentMileage) {
      throw new BadRequestException(
        'El kilometraje de recepción no puede ser menor que el último kilometraje del vehículo.',
      );
    }
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private parseAppointmentDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('La fecha de la cita no es válida.');
    }
    return date;
  }

  private appointmentDateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: this.parseAppointmentDate(from) } : {}),
      ...(to ? { lte: this.parseAppointmentDate(to) } : {}),
    };
  }

  private ensureAppointmentStatusTransition(
    current: WorkshopAppointmentStatus,
    next: WorkshopAppointmentStatus,
  ) {
    if (current === next) return;
    const allowed: Record<WorkshopAppointmentStatus, WorkshopAppointmentStatus[]> = {
      SCHEDULED: ['CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
      CONFIRMED: ['SCHEDULED', 'ARRIVED', 'NO_SHOW', 'CANCELLED'],
      ARRIVED: ['CANCELLED'],
      NO_SHOW: [],
      CANCELLED: [],
      CONVERTED_TO_RECEPTION: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException('La transición de estado de la cita no es válida.');
    }
  }

  private ensureStatusTransition(current: WorkshopTicketStatus, next: WorkshopTicketStatus) {
    if (current === next) return;
    const allowed: Record<WorkshopTicketStatus, WorkshopTicketStatus[]> = {
      RECEIVED: ['DIAGNOSIS', 'CANCELLED'],
      DIAGNOSIS: ['AWAITING_APPROVAL', 'CANCELLED'],
      AWAITING_APPROVAL: ['CANCELLED'],
      APPROVED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['READY_FOR_DELIVERY', 'CANCELLED'],
      READY_FOR_DELIVERY: ['IN_PROGRESS'],
      DELIVERED: [],
      CANCELLED: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException('La transición de estado del ticket no es válida.');
    }
  }

  private statusDates(status?: WorkshopTicketStatus) {
    const now = new Date();
    if (status === 'READY_FOR_DELIVERY') return { completedAt: now };
    if (status === 'CANCELLED') return { cancelledAt: now };
    return {};
  }

  private generateWorkshopOrderNumber(ticketNumber: string) {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `OT-${ticketNumber.replace(/^OT-/, '')}-${stamp}-${suffix}`;
  }
}

async function ensureReceptionImageBucket(url: string, key: string, bucket: string) {
  const bucketUrl = `${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const existing = await fetch(bucketUrl, { headers });
  const body = (await existing.json().catch(() => null)) as {
    code?: string;
    statusCode?: string | number;
    message?: string;
  } | null;
  const missing =
    existing.status === 404 ||
    (existing.status === 400 &&
      (body?.code === 'NoSuchBucket' ||
        String(body?.statusCode) === '404' ||
        body?.message === 'Bucket not found'));
  if (missing) {
    const created = await fetch(`${url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bucket, name: bucket, public: true }),
    });
    if (!created.ok && created.status !== 409) {
      const error = (await created.json().catch(() => null)) as { message?: string } | null;
      if (/already exists/i.test(error?.message ?? '')) return;
      throw new BadRequestException('No se pudo preparar el almacenamiento de imágenes.');
    }
    return;
  }
  if (!existing.ok)
    throw new BadRequestException('El almacenamiento de imágenes no está disponible.');
}
