import { Controller, Get } from '@nestjs/common';
import { NotesEngineService } from './meetings/notes-engine.service';

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
    const asrProvider = process.env.ASR_PROVIDER ?? 'mock';

    return {
      asrProvider,
      supportsRealAudio: asrProvider !== 'mock',
      supportsDemoAudio: true,
      supportedInputs: ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
      notes: this.notesEngine.getCapabilities(),
    };
  }
}
