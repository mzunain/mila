import { SupportedLanguageCode, TextDirection } from "./language.js";
import { MeetingNotes } from "./notes.js";

export type MeetingStatus =
  | "scheduled"
  | "live"
  | "processing"
  | "completed"
  | "failed";
export type MeetingSource =
  | "manual"
  | "auto-browser"
  | "auto-calendar"
  | "auto-desktop"
  | "upload"
  | "mock";
export type MeetingProvider =
  | "google-meet"
  | "zoom"
  | "microsoft-teams"
  | "slack-huddle"
  | "whatsapp-web"
  | "unknown";

export interface ExternalMeetingContext {
  provider: MeetingProvider;
  title?: string;
  url?: string;
  detectedAt: string;
  source: MeetingSource;
}

export interface MeetingSession {
  id: string;
  title: string;
  status: MeetingStatus;
  source: MeetingSource;
  autoStarted: boolean;
  outputLanguage: SupportedLanguageCode;
  externalMeeting?: ExternalMeetingContext;
  templateId?: string;
  shareToken?: string | null;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speakerId?: string;
  originalText: string;
  normalizedText: string;
  translatedText: string;
  detectedLanguage: SupportedLanguageCode;
  direction: TextDirection;
  confidence: number;
  startMs: number;
  endMs: number;
  isFinal: boolean;
}

export interface CreateMeetingRequest {
  title?: string;
  outputLanguage?: SupportedLanguageCode;
  source?: MeetingSource;
  autoStarted?: boolean;
  externalMeeting?: ExternalMeetingContext;
  templateId?: string;
}

export interface CreateMeetingResponse {
  session: MeetingSession;
  notes: MeetingNotes;
}

export type ClientMeetingEvent =
  | {
      type: "start";
      sessionId: string;
      outputLanguage: SupportedLanguageCode;
    }
  | {
      type: "audio-chunk";
      sessionId: string;
      mimeType: string;
      chunkId: string;
      capturedAt: string;
      audioBase64?: string;
    }
  | {
      type: "transcript-chunk";
      sessionId: string;
      chunkId: string;
      capturedAt: string;
      text: string;
      speakerId?: string;
      detectedLanguage?: SupportedLanguageCode;
      isFinal?: boolean;
    }
  | {
      type: "stop";
      sessionId: string;
    };

export type ServerMeetingEvent =
  | {
      type: "session";
      session: MeetingSession;
      notes: MeetingNotes;
    }
  | {
      type: "transcript";
      segment: TranscriptSegment;
      notes: MeetingNotes;
    }
  | {
      type: "notes";
      notes: MeetingNotes;
    }
  | {
      type: "error";
      message: string;
      code: string;
    };
