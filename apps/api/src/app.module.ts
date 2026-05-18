import { Module } from '@nestjs/common';
import { CapabilitiesController, HealthController } from './health.controller';
import { MeetingsModule } from './meetings/meetings.module';

@Module({
  imports: [MeetingsModule],
  controllers: [HealthController, CapabilitiesController],
  providers: [],
})
export class AppModule {}
