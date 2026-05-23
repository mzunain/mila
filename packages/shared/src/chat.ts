export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Optional list of meeting session ids the assistant cited in this response. */
  citations?: ChatCitation[];
}

export interface ChatCitation {
  sessionId: string;
  title: string;
  snippet?: string;
}

export interface ChatRequest {
  messages: { role: ChatRole; content: string }[];
  /**
   * Optional list of session IDs to scope the assistant to.
   * If omitted, the server uses recent sessions for the user.
   */
  sessionIds?: string[];
}

export interface ChatResponse {
  message: ChatMessage;
}
