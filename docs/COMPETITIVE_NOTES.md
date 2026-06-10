# Competitive Notes

Updated: 2026-06-07

This is a working product checklist from public docs and product pages for
meeting-notes and live-coaching tools. It focuses on gaps that Mila can close
with free engineering work before paid distribution or infrastructure work.

## Current Position

Mila already has a strong technical base:

- Desktop capture with no meeting bot.
- Multilingual transcript and translated transcript views.
- Local faster-whisper ASR worker.
- NestJS API with Postgres, pgvector, Redis, and WebSocket live updates.
- Final AI notes, action items, decisions, and meeting chat.
- On-demand live coaching.

The product story should lean into "private desktop capture, no bot, local-first
backend option" rather than trying to look like every bot-based notetaker.

## Competitor Signals

### Granola

Granola's useful differentiators are bot-free desktop capture, user-guided notes,
and explicit transcription control. Their docs say transcription starts when the
user opens a meeting note or Quick Note, and the transcript panel supports
show/hide plus Stop/Resume transcription.

What Mila should copy:

- Manual-first capture by default.
- Clear pause/resume/stop transcription controls.
- Show/hide transcript.
- Make the user's typed notes steer the final AI notes.

Source: https://docs.granola.ai/help-center/taking-notes/transcription

### Fireflies

Fireflies emphasizes real-time notes, live transcript, live action items, and
AskFred during the meeting. The live surface also includes quick prompts such as
summarizing the meeting so far and extracting action items.

What Mila should copy:

- One-click live prompts: summarize so far, action items, decisions, catch me up.
- Bookmark or mark moment while the call is happening.
- Meeting prep tab before capture starts.
- Live action items that link back to transcript segments.

Sources:

- https://fireflies.ai/product/real-time
- https://fireflies.zendesk.com/hc/en-us/articles/23544702321681-Learn-about-the-Fireflies-Real-time-Notes-feature

### Fathom

Fathom leans on free recording/transcription/summarization, fast post-meeting
summaries, action items, custom dictionaries, global search, real-time
collaboration, custom summary templates, CRM sync, and trust/compliance
messaging.

What Mila should copy:

- Custom vocabulary for product names, people, acronyms, and mixed-language terms.
- Custom summary templates by meeting type.
- Global meeting search with team/workspace scope.
- Trust page with clear privacy, deletion, and retention claims.

Source: https://www.fathom.ai/overview

### tl;dv

tl;dv emphasizes timestamped AI notes, pinned moments, meeting templates,
exports, clips, and AI chat over the recording.

What Mila should copy:

- Pin important moments live.
- Link every generated note to a transcript timestamp.
- Export notes to workspace tools.
- Create shareable text/audio clips when audio retention is enabled.

Source: https://intercom.help/tldv/en/articles/7198123-ai-meeting-notes

### Otter

Otter's strongest live-meeting surface is collaborative AI chat during the
meeting, plus saved questions and answers, automated summaries, action items,
and integrations with Zoom, Google Meet, and Microsoft Teams through the
notetaker bot.

What Mila should copy:

- Ask questions during a live meeting and save the answers with the meeting.
- Mention participants in action items.
- Add transcript anchors for every generated action item.
- Calendar-driven meeting prep and title/context detection.

Sources:

- https://help.otter.ai/hc/en-us/articles/15113851067415-Using-Otter-Chat-during-a-live-meeting
- https://help.otter.ai/hc/en-us/articles/18063735333399-Otter-Notetaker-chat-messages

### Zoom AI Companion

Zoom uses the real-time transcript for contextual meeting answers and cites
timestamps from the transcript. Meeting summaries can turn into editable docs.

What Mila should copy:

- Timestamp citations in live Q&A and final notes.
- "Convert to doc" export for final notes.
- Clear host/user control over when summary or transcript features start.

Source: https://library.zoom.com/zoom-workplace/ai-companion/artificial-intelligence-bluepaper/ai-companion/ai-companion-features/zoom-meetings

### Hedy

Hedy is closest to Mila's live-coaching direction. It markets real-time
conversation coaching, talking points, multilingual transcription, automatic
suggestions, session types, prep notes, highlights, custom vocabulary, and
on-device speech recognition.

What Mila should copy:

- Session types for sales, interview, standup, coaching, negotiation, lecture.
- Prep notes from recent related sessions.
- Custom vocabulary per workspace or meeting.
- Highlights and reusable clips/quotes.
- Optional automatic coaching only after manual opt-in.

Sources:

- https://www.hedy.ai/
- https://www.hedy.ai/features/

### Read AI

Read AI positions itself as an agent across meetings, emails, and messages. The
most important pattern for Mila is not just "notes", but answers with citations
across a user's meeting and work history, plus sharing to Slack/email/workspaces.

What Mila should copy:

- Ask across previous meetings with citations.
- Share summaries and decisions to Slack/email/workspaces.
- Treat meetings as part of a broader knowledge base, not isolated notes.

Source: https://www.read.ai/

## Free Next Steps

1. Keep transcript capture on-demand by default.
2. Keep live coaching on-demand by default.
3. Add pause/resume transcription without ending the meeting.
4. Add "summarize so far", "action items", "decisions", and "catch me up"
   buttons using the existing live transcript and LLM route.
5. Add transcript anchors to action items and decisions.
6. Add a meeting prep panel that uses calendar/title/context when available.
7. Add custom vocabulary hints to ASR requests.
8. Add a small benchmark script that measures browser chunk delay, ASR latency,
   API persistence time, and end-to-end transcript arrival time.

## Paid Or Infrastructure-Dependent Steps

- Apple Developer signing and notarization for a clean macOS install path.
- Hosted GPU ASR for both high accuracy and low latency at scale.
- Real App Store / Play Store distribution.
- Production hosted backend, domain, and uptime monitoring.
