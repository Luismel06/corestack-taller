import { Module } from '@nestjs/common';
import { WorkshopController } from './workshop.controller';
import { WorkshopService } from './workshop.service';
import { WorkshopSupportController } from './workshop-support.controller';
import { WorkshopSupportService } from './workshop-support.service';

@Module({
  controllers: [WorkshopController, WorkshopSupportController],
  providers: [WorkshopService, WorkshopSupportService],
})
export class WorkshopModule {}
