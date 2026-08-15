import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
