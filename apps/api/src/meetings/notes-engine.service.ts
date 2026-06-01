import { Injectable, Logger } from '@nestjs/common';
import {
  ActionItem,
  MeetingNotes,
  SupportedLanguageCode,
  TranscriptSegment,
} from '@mila/shared';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

type NotesMode = 'incremental' | 'final';

interface LlmRoute {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  label: string;
}

interface LlmNotesPayload {
  summary?: unknown;
  keyPoints?: unknown;
  actionItems?: unknown;
  decisions?: unknown;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

@Injectable()
export class NotesEngineService {
  private readonly logger = new Logger(NotesEngineService.name);
  private readonly freeClaudeEnv = loadFreeClaudeEnv();
  private readonly llmRoutes = this.resolveLlmRoutes();
  private readonly liveLlmNotesEnabled =
    readBoolean(getConfigValue('LLM_LIVE_NOTES_ENABLED', this.freeClaudeEnv)) ??
    false;
  private readonly timeoutMs =
    readNumber(getConfigValue('LLM_TIMEOUT_MS', this.freeClaudeEnv)) ?? 45000;
  private readonly transcriptMaxChars =
    readNumber(
      getConfigValue('LLM_TRANSCRIPT_MAX_CHARS', this.freeClaudeEnv),
    ) ?? 16000;

  async generateIncrementalNotes(
    segments: TranscriptSegment[],
    outputLanguage: SupportedLanguageCode,
  ): Promise<MeetingNotes> {
    const fallback = this.generateHeuristicIncrementalNotes(
      segments,
      outputLanguage,
    );

    if (!this.liveLlmNotesEnabled || !this.llmRoutes.length) {
      return fallback;
    }

    return (
      (await this.generateLlmNotes('incremental', segments, outputLanguage)) ??
      fallback
    );
  }

  async generateFinalNotes(
    segments: TranscriptSegment[],
    outputLanguage: SupportedLanguageCode,
  ): Promise<MeetingNotes> {
    const fallback = this.generateHeuristicFinalNotes(segments, outputLanguage);

    if (!this.llmRoutes.length) {
      return fallback;
    }

    return (
      (await this.generateLlmNotes('final', segments, outputLanguage)) ??
      fallback
    );
  }

  getCapabilities() {
    const provider =
      getConfigValue('LLM_PROVIDER', this.freeClaudeEnv) ?? 'mock';

    return {
      provider,
      liveNotesEnabled: this.liveLlmNotesEnabled,
      configured: this.llmRoutes.length > 0,
      routes: this.llmRoutes.map((route) => ({
        provider: route.provider,
        model: route.model,
      })),
    };
  }

  private generateHeuristicIncrementalNotes(
    segments: TranscriptSegment[],
    outputLanguage: SupportedLanguageCode,
  ): MeetingNotes {
    const finalSegments = segments.filter((segment) => segment.isFinal);
    const normalizedText = finalSegments
      .map((segment) => segment.normalizedText)
      .join(' ');
    const keyPoints = finalSegments
      .slice(-4)
      .map((segment) => segment.normalizedText)
      .filter(Boolean);

    return {
      summary: normalizedText
        ? `Live summary: ${this.compact(normalizedText, 220)}`
        : 'Listening for the first useful meeting moments.',
      keyPoints,
      actionItems: this.extractActionItems(finalSegments),
      decisions: this.extractDecisions(finalSegments),
      outputLanguage,
      updatedAt: new Date().toISOString(),
    };
  }

  private generateHeuristicFinalNotes(
    segments: TranscriptSegment[],
    outputLanguage: SupportedLanguageCode,
  ): MeetingNotes {
    const incremental = this.generateHeuristicIncrementalNotes(
      segments,
      outputLanguage,
    );
    const allText = segments.map((segment) => segment.normalizedText).join(' ');

    return {
      ...incremental,
      summary: allText
        ? `Final summary: ${this.compact(allText, 360)}`
        : 'No speech was captured in this meeting.',
      updatedAt: new Date().toISOString(),
    };
  }

  private async generateLlmNotes(
    mode: NotesMode,
    segments: TranscriptSegment[],
    outputLanguage: SupportedLanguageCode,
  ) {
    if (!segments.length) {
      return null;
    }

    const transcript = this.formatTranscript(segments);

    for (const route of this.llmRoutes) {
      try {
        const payload = await this.callChatCompletions(route, {
          mode,
          outputLanguage,
          transcript,
        });
        const notes = this.parseLlmNotes(payload, outputLanguage);

        if (notes) {
          return notes;
        }
      } catch (error) {
        this.logger.warn(
          `LLM notes route failed for ${route.label}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return null;
  }

  private async callChatCompletions(
    route: LlmRoute,
    input: {
      mode: NotesMode;
      outputLanguage: SupportedLanguageCode;
      transcript: string;
    },
  ) {
    return this.callChat(
      route,
      {
        system:
          'You are Mila, an AI meeting assistant. Convert multilingual and code-switched meeting transcripts into structured notes. Preserve meaning over literal translation. Return only valid JSON.',
        user: buildNotesPrompt(input),
      },
      { temperature: 0.2, maxTokens: input.mode === 'final' ? 1400 : 800 },
    );
  }

  /** Does the deployment have at least one usable LLM route? */
  hasLlmRoutes(): boolean {
    return this.llmRoutes.length > 0;
  }

  /**
   * Public chat entry point for features beyond notes (e.g. the live copilot).
   * Tries each configured route in order and returns the first non-empty
   * completion, or null if every route fails / none are configured.
   */
  async completeChat(
    messages: { system: string; user: string },
    opts: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string | null> {
    for (const route of this.llmRoutes) {
      try {
        const content = await this.callChat(route, messages, opts);
        if (content && content.trim()) {
          return content;
        }
      } catch (error) {
        this.logger.warn(
          `LLM chat route failed for ${route.label}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    return null;
  }

  /**
   * Run one chat-completion turn against a specific route. Shared by the notes
   * pipeline and the live copilot so all OpenAI-compatible request shaping and
   * response unwrapping lives in one place.
   */
  private async callChat(
    route: LlmRoute,
    messages: { system: string; user: string },
    opts: { temperature?: number; maxTokens?: number } = {},
  ) {
    const response = await fetch(
      `${route.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: buildHeaders(route),
        body: JSON.stringify({
          model: route.model,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 800,
          messages: [
            { role: 'system', content: messages.system },
            { role: 'user', content: messages.user },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${body.slice(0, 180)}`);
    }

    const completion = (await response.json()) as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('empty model response');
    }

    if (typeof content === 'string') {
      return content;
    }

    return content
      .map((part) => (part.type === 'text' || part.text ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  private parseLlmNotes(
    rawContent: string,
    outputLanguage: SupportedLanguageCode,
  ): MeetingNotes | null {
    const jsonText = extractJsonObject(rawContent);

    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText) as LlmNotesPayload;
      const summary = readText(parsed.summary);

      if (!summary) {
        return null;
      }

      return {
        summary,
        keyPoints: readStringList(parsed.keyPoints).slice(0, 12),
        actionItems: readActionItems(parsed.actionItems).slice(0, 12),
        decisions: readStringList(parsed.decisions).slice(0, 12),
        outputLanguage,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private formatTranscript(segments: TranscriptSegment[]) {
    const transcript = segments
      .filter((segment) => segment.isFinal)
      .map((segment, index) => {
        const speaker = segment.speakerId ?? `speaker-${index + 1}`;

        return [
          `[${index + 1}] speaker=${speaker} language=${segment.detectedLanguage}`,
          `original: ${segment.originalText}`,
          `normalized: ${segment.normalizedText}`,
        ].join('\n');
      })
      .join('\n\n');

    if (transcript.length <= this.transcriptMaxChars) {
      return transcript;
    }

    return transcript.slice(transcript.length - this.transcriptMaxChars);
  }

  private resolveLlmRoutes() {
    const provider =
      getConfigValue('LLM_PROVIDER', this.freeClaudeEnv) ?? 'mock';

    if (provider === 'mock') {
      return [];
    }

    const primary =
      getConfigValue('LLM_MODEL', this.freeClaudeEnv) ??
      (provider === 'free-claude'
        ? getConfigValue('MODEL', this.freeClaudeEnv)
        : undefined);
    const fallback =
      getConfigValue('LLM_FALLBACK_MODELS', this.freeClaudeEnv) ??
      (provider === 'free-claude'
        ? 'openrouter/minimax/minimax-m2.5:free,openrouter/qwen/qwen3-coder:free'
        : '');
    const specs = [primary, ...fallback.split(',')]
      .map((spec) => spec?.trim())
      .filter((spec): spec is string => Boolean(spec));
    const routes = specs
      .map((spec) => this.resolveRoute(spec, provider))
      .filter((route): route is LlmRoute => Boolean(route));
    const seen = new Set<string>();

    return routes.filter((route) => {
      const key = `${route.provider}:${route.model}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  private resolveRoute(spec: string, defaultProvider: string): LlmRoute | null {
    if (spec.startsWith('nvidia_nim/')) {
      return this.buildRoute('nvidia_nim', spec.slice('nvidia_nim/'.length));
    }

    if (spec.startsWith('openrouter/')) {
      return this.buildRoute('openrouter', spec.slice('openrouter/'.length));
    }

    if (spec.startsWith('google/')) {
      return this.buildRoute('google', spec.slice('google/'.length));
    }

    if (spec.startsWith('gemini/')) {
      return this.buildRoute('google', spec.slice('gemini/'.length));
    }

    if (spec.startsWith('deepseek/')) {
      return this.buildRoute('deepseek', spec.slice('deepseek/'.length));
    }

    if (spec.startsWith('moonshot/')) {
      return this.buildRoute('moonshot', spec.slice('moonshot/'.length));
    }

    if (spec.startsWith('kimi/')) {
      return this.buildRoute('moonshot', spec.slice('kimi/'.length));
    }

    if (spec.startsWith('zai/')) {
      return this.buildRoute('zai', spec.slice('zai/'.length));
    }

    if (spec.startsWith('glm/')) {
      return this.buildRoute('zai', spec.slice('glm/'.length));
    }

    if (spec.startsWith('xai/')) {
      return this.buildRoute('xai', spec.slice('xai/'.length));
    }

    if (spec.startsWith('grok/')) {
      return this.buildRoute('xai', spec.slice('grok/'.length));
    }

    if (spec.startsWith('opencode/')) {
      return this.buildRoute('opencode', spec.slice('opencode/'.length));
    }

    if (spec.startsWith('ollama/')) {
      return this.buildRoute('ollama', spec.slice('ollama/'.length));
    }

    if (spec.startsWith('lmstudio/')) {
      return this.buildRoute('lmstudio', spec.slice('lmstudio/'.length));
    }

    if (spec.startsWith('llamacpp/')) {
      return this.buildRoute('llamacpp', spec.slice('llamacpp/'.length));
    }

    return this.buildRoute(defaultProvider, spec);
  }

  private buildRoute(provider: string, model: string): LlmRoute | null {
    if (!model) {
      return null;
    }

    if (provider === 'free-claude') {
      return this.resolveRoute(model, 'openrouter');
    }

    if (provider === 'nvidia' || provider === 'nvidia_nim') {
      const apiKey = getConfigValue('NVIDIA_NIM_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'nvidia_nim',
        model,
        baseUrl:
          getConfigValue('NVIDIA_NIM_BASE_URL', this.freeClaudeEnv) ??
          'https://integrate.api.nvidia.com/v1',
        apiKey,
        label: `nvidia_nim/${model}`,
      };
    }

    if (provider === 'openrouter') {
      const apiKey = getConfigValue('OPENROUTER_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider,
        model,
        baseUrl:
          getConfigValue('OPENROUTER_BASE_URL', this.freeClaudeEnv) ??
          'https://openrouter.ai/api/v1',
        apiKey,
        label: `${provider}/${model}`,
      };
    }

    if (provider === 'google' || provider === 'gemini') {
      const apiKey =
        getConfigValue('GOOGLE_API_KEY', this.freeClaudeEnv) ??
        getConfigValue('GEMINI_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'google',
        model,
        baseUrl:
          getConfigValue('GOOGLE_BASE_URL', this.freeClaudeEnv) ??
          'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey,
        label: `google/${model}`,
      };
    }

    if (provider === 'deepseek') {
      const apiKey = getConfigValue('DEEPSEEK_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider,
        model,
        baseUrl:
          getConfigValue('DEEPSEEK_BASE_URL', this.freeClaudeEnv) ??
          'https://api.deepseek.com/v1',
        apiKey,
        label: `${provider}/${model}`,
      };
    }

    if (provider === 'moonshot' || provider === 'kimi') {
      const apiKey =
        getConfigValue('MOONSHOT_API_KEY', this.freeClaudeEnv) ??
        getConfigValue('MOONSHOT_AI_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'moonshot',
        model,
        baseUrl:
          getConfigValue('MOONSHOT_BASE_URL', this.freeClaudeEnv) ??
          'https://api.moonshot.ai/v1',
        apiKey,
        label: `moonshot/${model}`,
      };
    }

    if (provider === 'zai' || provider === 'glm' || provider === 'z-ai') {
      const apiKey =
        getConfigValue('ZAI_API_KEY', this.freeClaudeEnv) ??
        getConfigValue('Z_AI_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'zai',
        model,
        baseUrl:
          getConfigValue('ZAI_BASE_URL', this.freeClaudeEnv) ??
          'https://api.z.ai/api/paas/v4',
        apiKey,
        label: `zai/${model}`,
      };
    }

    if (provider === 'xai' || provider === 'grok') {
      const apiKey =
        getConfigValue('XAI_API_KEY', this.freeClaudeEnv) ??
        getConfigValue('GROK_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'xai',
        model,
        baseUrl:
          getConfigValue('XAI_BASE_URL', this.freeClaudeEnv) ??
          'https://api.x.ai/v1',
        apiKey,
        label: `xai/${model}`,
      };
    }

    if (provider === 'opencode') {
      const apiKey =
        getConfigValue('OPENCODE_API_KEY', this.freeClaudeEnv) ??
        getConfigValue('OPENCODE_AI_API_KEY', this.freeClaudeEnv);

      if (!apiKey) {
        return null;
      }

      return {
        provider: 'opencode',
        model,
        baseUrl:
          getConfigValue('OPENCODE_BASE_URL', this.freeClaudeEnv) ??
          'https://opencode.ai/v1',
        apiKey,
        label: `opencode/${model}`,
      };
    }

    if (provider === 'ollama') {
      return {
        provider,
        model,
        baseUrl:
          getConfigValue('OLLAMA_BASE_URL', this.freeClaudeEnv) ??
          'http://localhost:11434/v1',
        label: `${provider}/${model}`,
      };
    }

    if (provider === 'lmstudio') {
      return {
        provider,
        model,
        baseUrl:
          getConfigValue('LM_STUDIO_BASE_URL', this.freeClaudeEnv) ??
          'http://localhost:1234/v1',
        label: `${provider}/${model}`,
      };
    }

    if (provider === 'llamacpp') {
      return {
        provider,
        model,
        baseUrl:
          getConfigValue('LLAMACPP_BASE_URL', this.freeClaudeEnv) ??
          'http://localhost:8080/v1',
        label: `${provider}/${model}`,
      };
    }

    const baseUrl = getConfigValue('LLM_BASE_URL', this.freeClaudeEnv);

    if (!baseUrl) {
      return null;
    }

    return {
      provider: 'openai-compatible',
      model,
      baseUrl,
      apiKey: getConfigValue('LLM_API_KEY', this.freeClaudeEnv),
      label: `openai-compatible/${model}`,
    };
  }

  private extractActionItems(segments: TranscriptSegment[]): ActionItem[] {
    return segments
      .filter((segment) =>
        /action|follow up|send|prepare|don't forget|do not forget/i.test(
          segment.normalizedText,
        ),
      )
      .slice(-5)
      .map((segment, index) => ({
        id: `action-${index + 1}`,
        text: segment.normalizedText,
        status: 'open' as const,
      }));
  }

  private extractDecisions(segments: TranscriptSegment[]) {
    return segments
      .filter((segment) =>
        /decided|decision|approved|go with|we will/i.test(
          segment.normalizedText,
        ),
      )
      .slice(-5)
      .map((segment) => segment.normalizedText);
  }

  private compact(text: string, maxLength: number) {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1).trim()}...`;
  }
}

function buildNotesPrompt(input: {
  mode: NotesMode;
  outputLanguage: SupportedLanguageCode;
  transcript: string;
}) {
  return [
    `Mode: ${input.mode}`,
    `Output language: ${input.outputLanguage}`,
    'Return ONLY a JSON object with this exact shape (no markdown, no commentary):',
    '{',
    '  "summary": string,                       // 1-3 sentences',
    '  "keyPoints": string[],                   // bullet-sized facts',
    '  "actionItems": [',
    '    {',
    '      "text": string,                      // required, the action',
    '      "owner": string | null,              // person name if explicitly assigned, else null',
    '      "due": string | null                 // ISO date or human deadline if explicit, else null',
    '    }',
    '  ],',
    '  "decisions": string[]                    // explicit decisions made',
    '}',
    'Rules:',
    '- Handle Urdu, Hindi, Finnish, English, and mixed code-switching.',
    '- If the transcript is not in the output language, translate internally before writing the notes.',
    '- Keep action items concrete and preserve owners/dates when present.',
    '- Use null (not the string "optional", "TBD", "unknown", or "n/a") when owner or due is not stated.',
    '- Omit empty arrays only if you have nothing to put in them; never emit placeholder strings.',
    '- Do not include markdown fences, comments, or any text outside the JSON.',
    '',
    'Transcript:',
    input.transcript,
  ].join('\n');
}

function buildHeaders(route: LlmRoute) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (route.apiKey) {
    headers.authorization = `Bearer ${route.apiKey}`;
  }

  if (route.provider === 'openrouter') {
    headers['HTTP-Referer'] =
      process.env.LLM_APP_URL ?? 'http://localhost:3002';
    headers['X-Title'] = 'Mila';
  }

  return headers;
}

const PLACEHOLDER_TOKENS = new Set([
  'optional',
  'tbd',
  'tba',
  'n/a',
  'na',
  'none',
  'null',
  'unknown',
  'unspecified',
  'pending',
  '-',
  '—',
  '…',
  '...',
]);

function readText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (PLACEHOLDER_TOKENS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readText(item))
    .filter((item): item is string => Boolean(item));
}

function readActionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `action-${index + 1}`,
          text: item,
          status: 'open' as const,
        };
      }

      if (!isRecord(item)) {
        return null;
      }

      const text = readText(item.text);

      if (!text) {
        return null;
      }

      return {
        id: `action-${index + 1}`,
        text,
        owner: readText(item.owner) ?? undefined,
        due: readText(item.due) ?? undefined,
        status: item.status === 'done' ? ('done' as const) : ('open' as const),
      };
    })
    .filter((item): item is ActionItem => Boolean(item));
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return trimmed.slice(start, end + 1);
}

function loadFreeClaudeEnv() {
  const provider = process.env.LLM_PROVIDER;
  const importFreeClaude = readBoolean(process.env.LLM_IMPORT_FREE_CLAUDE_ENV);

  if (provider !== 'free-claude' && !importFreeClaude) {
    return new Map<string, string>();
  }

  const path = expandHome(
    process.env.FREE_CLAUDE_ENV_PATH ?? '~/.config/free-claude-code/.env',
  );

  if (!existsSync(path)) {
    return new Map<string, string>();
  }

  return parseDotEnv(readFileSync(path, 'utf8'));
}

function parseDotEnv(contents: string) {
  const values = new Map<string, string>();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');

    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();

    if (key) {
      values.set(key, stripQuotes(value));
    }
  }

  return values;
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getConfigValue(key: string, fallback: Map<string, string>) {
  const processValue = process.env[key];

  if (processValue !== undefined && processValue !== '') {
    return processValue;
  }

  const fallbackValue = fallback.get(key);

  return fallbackValue || undefined;
}

function expandHome(path: string) {
  if (path === '~') {
    return homedir();
  }

  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }

  return path;
}

function readBoolean(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) {
    return false;
  }

  return undefined;
}

function readNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
