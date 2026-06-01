import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsGateway } from './meetings.gateway';
import { MeetingsService } from './meetings.service';
import { ShareController } from './share.controller';
import { ASR_PROVIDER } from './providers/asr-provider.token';
import { DemoAwareAsrProvider } from './providers/demo-aware-asr.provider';
import { HttpAsrProvider } from './providers/http-asr.provider';
import { MockAsrProvider } from './providers/mock-asr.provider';
import { NotesEngineService } from './notes-engine.service';
import { LiveAssistService } from './live-assist.service';
import { resolveAsrMode } from '../asr-config';

const asrProviderFactory = {
  provide: ASR_PROVIDER,
  useFactory: (
    mockAsrProvider: MockAsrProvider,
    httpAsrProvider: HttpAsrProvider,
  ) => {
    return new DemoAwareAsrProvider(
      mockAsrProvider,
      httpAsrProvider,
      resolveAsrMode().isReal,
    );
  },
  inject: [MockAsrProvider, HttpAsrProvider],
};

@Module({
  controllers: [MeetingsController, ShareController],
  providers: [
    MeetingsService,
    MeetingsGateway,
    MockAsrProvider,
    HttpAsrProvider,
    asrProviderFactory,
    NotesEngineService,
    LiveAssistService,
  ],
  exports: [MeetingsService, NotesEngineService],
})
export class MeetingsModule {}
