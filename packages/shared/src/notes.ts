import { SupportedLanguageCode } from './language.js';

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  due?: string;
  status: 'open' | 'done';
  sourceSegmentId?: string;
  sourceStartMs?: number;
}

export interface DecisionItem {
  id: string;
  text: string;
  sourceSegmentId?: string;
  sourceStartMs?: number;
}

export interface MeetingNotes {
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  decisionItems?: DecisionItem[];
  outputLanguage: SupportedLanguageCode;
  updatedAt: string;
}

export function createEmptyNotes(outputLanguage: SupportedLanguageCode = 'en'): MeetingNotes {
  return {
    summary: 'Listening for the first useful meeting moments.',
    keyPoints: [],
    actionItems: [],
    decisions: [],
    outputLanguage,
    updatedAt: new Date().toISOString(),
  };
}
