export type TemplateCategory =
  | 'discovery'
  | 'sales'
  | 'interview'
  | 'one-on-one'
  | 'standup'
  | 'general';

export interface MeetingTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Sections the AI should produce in addition to summary/keyPoints/actionItems/decisions. */
  sections: TemplateSection[];
  /** Extra instructions appended to the notes engine prompt. */
  prompt: string;
  /** Default title to prefill when the user starts a meeting with this template. */
  defaultTitle: string;
  /** Optional emoji or short icon. */
  icon?: string;
}

export interface TemplateSection {
  id: string;
  label: string;
  description: string;
}

export const meetingTemplates: MeetingTemplate[] = [
  {
    id: 'discovery',
    name: 'Customer discovery',
    description: 'Pull out pains, jobs-to-be-done, quotes, and follow-ups.',
    category: 'discovery',
    icon: '🔍',
    defaultTitle: 'Customer discovery call',
    sections: [
      { id: 'pains', label: 'Pains', description: 'Friction the customer described.' },
      {
        id: 'jobs',
        label: 'Jobs to be done',
        description: 'What the customer is trying to achieve.',
      },
      { id: 'quotes', label: 'Quotes', description: 'Verbatim moments worth remembering.' },
    ],
    prompt:
      'You are summarising a customer-discovery interview. Focus on extracting customer pains, current workarounds, jobs to be done, and direct quotes worth sharing with the team.',
  },
  {
    id: 'sales',
    name: 'Sales call',
    description: 'BANT-style notes: budget, authority, need, timeline, next step.',
    category: 'sales',
    icon: '💼',
    defaultTitle: 'Sales call',
    sections: [
      { id: 'budget', label: 'Budget', description: 'Stated or implied budget.' },
      { id: 'authority', label: 'Authority', description: 'Who is the decision maker.' },
      { id: 'need', label: 'Need', description: 'Problem the customer wants to solve.' },
      { id: 'timeline', label: 'Timeline', description: 'When the customer wants to act.' },
    ],
    prompt:
      'You are summarising a sales conversation. Capture budget, decision-maker, need, timeline, and the agreed-upon next step. Flag objections explicitly.',
  },
  {
    id: 'user-interview',
    name: 'User interview',
    description: 'Open-ended research interview with themes and surprising moments.',
    category: 'interview',
    icon: '🧠',
    defaultTitle: 'User research interview',
    sections: [
      { id: 'context', label: 'Context', description: 'Background on the participant.' },
      { id: 'themes', label: 'Themes', description: 'Patterns that emerged in the conversation.' },
      {
        id: 'surprises',
        label: 'Surprises',
        description: 'Things that contradicted your hypothesis.',
      },
    ],
    prompt:
      'You are summarising a user research interview. Highlight themes, surprises, contradictions to the team hypothesis, and quotes that capture the user voice.',
  },
  {
    id: 'one-on-one',
    name: '1:1',
    description: 'Wins, blockers, growth notes, and next-week commitments.',
    category: 'one-on-one',
    icon: '🤝',
    defaultTitle: 'Weekly 1:1',
    sections: [
      { id: 'wins', label: 'Wins', description: 'What went well this week.' },
      { id: 'blockers', label: 'Blockers', description: 'What is in the way.' },
      { id: 'growth', label: 'Growth', description: 'Feedback and development conversation.' },
    ],
    prompt:
      'You are summarising a 1:1 between a manager and a direct report. Capture wins, blockers, growth feedback, and concrete commitments for next week. Be respectful of personal context.',
  },
  {
    id: 'standup',
    name: 'Standup',
    description: 'Per-person yesterday/today/blockers from a quick sync.',
    category: 'standup',
    icon: '⏱️',
    defaultTitle: 'Daily standup',
    sections: [
      { id: 'yesterday', label: 'Yesterday', description: 'What each person shipped.' },
      { id: 'today', label: 'Today', description: 'What each person is doing now.' },
      { id: 'blockers', label: 'Blockers', description: 'Where they are stuck.' },
    ],
    prompt:
      'You are summarising a standup. For each speaker, capture what they did, what they will do, and what is blocking them. Keep it terse.',
  },
  {
    id: 'general',
    name: 'General meeting',
    description: 'The default Mila notes: summary, key points, decisions, actions.',
    category: 'general',
    icon: '🗒️',
    defaultTitle: 'Untitled meeting',
    sections: [],
    prompt: '',
  },
];

export function getTemplate(id: string | null | undefined): MeetingTemplate {
  const fallback = meetingTemplates.find((template) => template.id === 'general');
  if (!id) return fallback as MeetingTemplate;
  return meetingTemplates.find((template) => template.id === id) ?? (fallback as MeetingTemplate);
}

export interface ShareLinkResponse {
  sessionId: string;
  shareToken: string;
  url: string;
}

export interface PublicSharedSession {
  id: string;
  title: string;
  outputLanguage: string;
  createdAt: string;
  notes: {
    summary: string;
    keyPoints: string[];
    actionItems: { id: string; text: string; owner?: string }[];
    decisions: string[];
  };
}
