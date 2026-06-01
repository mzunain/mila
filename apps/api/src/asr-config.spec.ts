import { resolveAsrMode } from './asr-config';

describe('resolveAsrMode', () => {
  it('reports real audio only when ASR_PROVIDER is http', () => {
    const mode = resolveAsrMode({ ASR_PROVIDER: 'http' });

    expect(mode.provider).toBe('http');
    expect(mode.isReal).toBe(true);
    expect(mode.hint).toBeNull();
  });

  it('defaults to mock demo mode when ASR_PROVIDER is unset', () => {
    const mode = resolveAsrMode({});

    expect(mode.provider).toBe('mock');
    expect(mode.isReal).toBe(false);
    expect(mode.hint).toContain('ASR_PROVIDER=http');
  });

  it('treats unknown providers as demo mode rather than advertising real audio', () => {
    const mode = resolveAsrMode({ ASR_PROVIDER: 'whisper' });

    expect(mode.isReal).toBe(false);
    expect(mode.hint).toContain('whisper');
  });

  it('ignores surrounding whitespace and blank values', () => {
    expect(resolveAsrMode({ ASR_PROVIDER: '  http  ' }).isReal).toBe(true);
    expect(resolveAsrMode({ ASR_PROVIDER: '   ' }).provider).toBe('mock');
  });
});
