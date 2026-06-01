import { Controller, Get } from '@nestjs/common';
import { NotesEngineService } from './meetings/notes-engine.service';
import { resolveAsrMode } from './asr-config';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'mila-api',
      timestamp: new Date().toISOString(),
    };
  }
}

@Controller('capabilities')
export class CapabilitiesController {
  constructor(private readonly notesEngine: NotesEngineService) {}

  @Get()
  getCapabilities() {
    const asr = resolveAsrMode();

    return {
      asrProvider: asr.provider,
      supportsRealAudio: asr.isReal,
      realAudioHint: asr.hint,
      supportsDemoAudio: true,
      supportedInputs: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
      notes: this.notesEngine.getCapabilities(),
    };
  }
}
