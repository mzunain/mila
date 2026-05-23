import { Module } from '@nestjs/common';
import { CapabilitiesController, HealthController } from './health.controller';
import { MeetingsModule } from './meetings/meetings.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, MeetingsModule],
  controllers: [HealthController, CapabilitiesController],
  providers: [],
})
export class AppModule {}
