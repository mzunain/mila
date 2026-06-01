import { SupportedLanguageCode, TextDirection } from "./language.js";
import { MeetingNotes } from "./notes.js";
import type { ActionReviewRisk } from "./intelligence.js";
import type {
  AssistContext,
  AssistSuggestion,
  AssistTurn,
} from "./live-assist.js";

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

export interface MeetingSessionPreview {
  summary: string;
  keyPoints: string[];
  decisionCount: number;
  actionStats: {
    total: number;
    open: number;
    completed: number;
    missingOwner: number;
    missingDue: number;
    overdue: number;
    riskLevel: ActionReviewRisk;
    headline: string;
  };
  updatedAt?: string;
}

export interface MeetingSessionListItem extends MeetingSession {
  notesPreview?: MeetingSessionPreview;
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
    }
  | {
      // Live conversation copilot: ask for "what should I say next" talking
      // points based on the recent turns. Sent over the same authed socket as
      // the meeting stream; the reply is private to the requesting client.
      type: "assist-request";
      sessionId: string;
      turns: AssistTurn[];
      context?: AssistContext;
      /** Cap on talking points; engine clamps to 1..6 (default 4). */
      maxPoints?: number;
      /**
       * True when the user explicitly asked (e.g. pressed a hotkey). Manual
       * requests bypass the "is the tail worth answering" heuristic and always
       * get a terminal reply (suggestion or assist-unavailable).
       */
      manual?: boolean;
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
      type: "status";
      code: string;
      message: string;
      severity: "info" | "warning";
    }
  | {
      type: "error";
      message: string;
      code: string;
    }
  | {
      // Private talking-point suggestion for the requesting client only.
      type: "assist-suggestion";
      sessionId: string;
      suggestion: AssistSuggestion;
    }
  | {
      // A manual assist-request that produced nothing actionable. `no-model`
      // means no LLM is configured (the feature can't run); `no-suggestion`
      // means the model had nothing useful to add right now.
      type: "assist-unavailable";
      sessionId: string;
      reason: "no-model" | "no-suggestion";
    };
