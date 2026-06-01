import type { AsrProvider, TranscribeChunkInput } from './asr-provider';

export class DemoAwareAsrProvider implements AsrProvider {
  constructor(
    private readonly mockAsrProvider: AsrProvider,
    private readonly httpAsrProvider: AsrProvider,
    private readonly preferHttp: boolean,
  ) {}

  transcribe(input: TranscribeChunkInput) {
    if (input.mimeType === 'audio/mock') {
      return this.mockAsrProvider.transcribe(input);
    }

    if (this.preferHttp) {
      return this.httpAsrProvider.transcribe(input);
    }

    return this.mockAsrProvider.transcribe(input);
  }
}
