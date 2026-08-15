import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ResendService } from './resend.service';

@Module({
  imports: [PrismaModule],
  providers: [ResendService],
  exports: [ResendService],
})
export class NotificationsModule {}
