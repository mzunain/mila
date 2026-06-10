"use client";

import { supportedLanguages } from "@mila/shared";
import {
  AtSign,
  Bell,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Gift,
  Globe2,
  Home,
  Keyboard,
  KeyRound,
  Languages,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Megaphone,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  Palette,
  PlugZap,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UserRound,
  UsersRound,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Preferences,
  Theme,
  TranscriptRetention,
  clearPreferences,
  defaultPreferences,
  savePreferences,
  usePreferences,
} from "@/lib/preferences";

type SettingsSection =
  | "preferences"
  | "profile"
  | "calendar"
  | "notifications"
  | "connectors"
  | "workspace"
  | "team"
  | "analytics"
  | "billing"
  | "referrals"
  | "help"
  | "labs";

type SettingsUser = {
  id: string;
  email: string;
  name: string | null;
};

type DesktopPreferences = {
  apiUrl?: string;
  wsUrl?: string;
  theme?: Theme;
  launchAtLogin?: boolean;
  showUpcomingInMenuBar?: boolean;
  showEventsWithoutParticipants?: boolean;
  visibleCalendars?: Record<string, boolean>;
  autoDetectedMeetingNotifications?: boolean;
  mutedMeetingApps?: string[];
};

type DesktopCalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  calendarName?: string;
  meetingUrl?: string;
};

type DesktopBridge = {
  getPreferences?: () => Promise<DesktopPreferences>;
  setPreferences?: (patch: Record<string, unknown>) => Promise<unknown>;
  getUpcomingCalendarEvents?: () => Promise<DesktopCalendarEvent[]>;
  openExternal?: (url: string) => Promise<unknown>;
};

const languageOptions = supportedLanguages.filter(
  (language) => language.code !== "unknown" && language.code !== "mixed",
);

const sectionGroups: {
  title: string;
  items: { id: SettingsSection; label: string; icon: LucideIcon }[];
}[] = [
  {
    title: "Personal",
    items: [
      { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
      { id: "profile", label: "Profile", icon: UserRound },
      { id: "calendar", label: "Calendar", icon: CalendarDays },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "connectors", label: "Connectors", icon: PlugZap },
      { id: "help", label: "Get help", icon: CircleHelp },
    ],
  },
  {
    title: "Workspace",
    items: [
      { id: "workspace", label: "General", icon: Building2 },
      { id: "team", label: "Team", icon: UsersRound },
      { id: "analytics", label: "Analytics", icon: LayoutDashboard },
      { id: "billing", label: "Billing", icon: CreditCard },
      { id: "referrals", label: "Referrals", icon: Gift },
      { id: "labs", label: "Labs", icon: Sparkles },
    ],
  },
];

const connectors = [
  {
    name: "Slack",
    description: "Share meeting summaries and action items to channels.",
    icon: MessageCircle,
    tone: "bg-[#36c5f0] text-[#151515]",
    status: "Ready",
  },
  {
    name: "Notion",
    description: "Export polished notes into team pages.",
    icon: FileText,
    tone: "bg-white text-black",
    status: "Ready",
  },
  {
    name: "Zapier",
    description: "Trigger workflows when a meeting summary is ready.",
    icon: PlugZap,
    tone: "bg-[#ff6a00] text-white",
    status: "Planned",
  },
  {
    name: "HubSpot",
    description: "Sync decisions, risks, and next steps to CRM records.",
    icon: BriefcaseBusiness,
    tone: "bg-[#ff7a59] text-white",
    status: "Planned",
  },
  {
    name: "Salesforce",
    description: "Attach meeting memory to accounts and opportunities.",
    icon: Database,
    tone: "bg-[#00a1e0] text-white",
    status: "Planned",
  },
  {
    name: "MCP",
    description: "Let agents query meeting memory with scoped access.",
    icon: Code2,
    tone: "bg-[#67e8f9] text-[#061113]",
    status: "Beta",
  },
];

const detectedApps = [
  "Chrome",
  "Zoom",
  "Google Meet",
  "Microsoft Teams",
  "Webex",
  "WhatsApp",
  "FaceTime",
  "Slack",
  "Discord",
];
const baseCalendarNames = [
  "Muhammad Zulqarnain",
  "Family",
  "Holidays in Pakistan",
  "Holidays in Finland",
];

export function PreferencesForm({ user }: { user: SettingsUser }) {
  const { preferences: persisted, hydrated } = usePreferences();
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("preferences");
  const [overrides, setOverrides] = useState<Partial<Preferences>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<DesktopCalendarEvent[]>(
    [],
  );
  const [calendarStatus, setCalendarStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");

  const state: Preferences = useMemo(
    () => ({ ...persisted, ...overrides }),
    [persisted, overrides],
  );

  const displayName = user.name || readableNameFromEmail(user.email);
  const initials = getInitials(displayName);
  const sectionTitle = getSectionTitle(activeSection);
  const activeCalendarNames = useMemo(() => {
    const names = new Set([user.email, ...baseCalendarNames]);
    for (const event of calendarEvents) {
      if (event.calendarName) names.add(event.calendarName);
    }
    return [...names];
  }, [calendarEvents, user.email]);

  const refreshCalendarEvents = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.getUpcomingCalendarEvents) {
      setCalendarStatus("unavailable");
      return;
    }
    setCalendarStatus("loading");
    try {
      const events = await bridge.getUpcomingCalendarEvents();
      setCalendarEvents(events);
      setCalendarStatus("ready");
    } catch {
      setCalendarEvents([]);
      setCalendarStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getPreferences) return;
    let cancelled = false;
    void bridge.getPreferences().then((desktopPrefs) => {
      if (cancelled) return;
      const patch: Partial<Preferences> = {};
      if (desktopPrefs.apiUrl !== undefined) patch.apiUrl = desktopPrefs.apiUrl;
      if (desktopPrefs.wsUrl !== undefined) patch.wsUrl = desktopPrefs.wsUrl;
      if (desktopPrefs.theme !== undefined) patch.theme = desktopPrefs.theme;
      if (desktopPrefs.launchAtLogin !== undefined) {
        patch.autoLaunch = desktopPrefs.launchAtLogin;
      }
      if (desktopPrefs.showUpcomingInMenuBar !== undefined) {
        patch.showUpcomingInMenuBar = desktopPrefs.showUpcomingInMenuBar;
      }
      if (desktopPrefs.showEventsWithoutParticipants !== undefined) {
        patch.showEventsWithoutParticipants =
          desktopPrefs.showEventsWithoutParticipants;
      }
      if (desktopPrefs.visibleCalendars !== undefined) {
        patch.visibleCalendars = desktopPrefs.visibleCalendars;
      }
      if (desktopPrefs.autoDetectedMeetingNotifications !== undefined) {
        patch.autoDetectedMeetingNotifications =
          desktopPrefs.autoDetectedMeetingNotifications;
      }
      if (desktopPrefs.mutedMeetingApps !== undefined) {
        patch.mutedMeetingApps = desktopPrefs.mutedMeetingApps;
      }
      setOverrides((current) => ({ ...current, ...patch }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshCalendarEvents();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refreshCalendarEvents]);

  const updatePreferences = (patch: Partial<Preferences>) => {
    const next = { ...state, ...patch };
    setOverrides((current) => ({ ...current, ...patch }));
    savePreferences(next);
    setSavedAt(Date.now());
    void syncDesktopPreferences(patch);

    if (
      patch.showUpcomingInMenuBar !== undefined ||
      patch.showEventsWithoutParticipants !== undefined ||
      patch.visibleCalendars !== undefined
    ) {
      window.setTimeout(() => void refreshCalendarEvents(), 150);
    }
  };

  const updatePreference = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => updatePreferences({ [key]: value } as Partial<Preferences>);

  const toggleMutedApp = (appName: string) => {
    const muted = new Set(state.mutedMeetingApps);
    if (muted.has(appName)) muted.delete(appName);
    else muted.add(appName);
    updatePreference("mutedMeetingApps", [...muted]);
  };

  const setCalendarVisibility = (calendarName: string, enabled: boolean) => {
    updatePreference("visibleCalendars", {
      ...state.visibleCalendars,
      [calendarName]: enabled,
    });
  };

  const resetAll = () => {
    clearPreferences();
    setOverrides({});
    setSavedAt(Date.now());
    void syncDesktopPreferences({
      autoLaunch: defaultPreferences.autoLaunch,
      theme: defaultPreferences.theme,
      showUpcomingInMenuBar: defaultPreferences.showUpcomingInMenuBar,
      showEventsWithoutParticipants:
        defaultPreferences.showEventsWithoutParticipants,
      visibleCalendars: defaultPreferences.visibleCalendars,
      autoDetectedMeetingNotifications:
        defaultPreferences.autoDetectedMeetingNotifications,
      mutedMeetingApps: defaultPreferences.mutedMeetingApps,
      apiUrl: defaultPreferences.apiUrl,
      wsUrl: defaultPreferences.wsUrl,
    });
  };

  return (
    <div className="mila-app-bg min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="mila-sidebar border-b px-5 pb-6 pt-6 lg:border-b-0 lg:border-r">
          <Link
            href="/app"
            className="mila-secondary mb-6 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition"
          >
            <Home size={16} />
            Workspace
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] text-sm font-semibold text-[var(--accent)]">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">
                {displayName}
              </p>
              <p className="mila-muted truncate text-xs">{user.email}</p>
            </div>
          </div>

          <nav className="mt-8 space-y-7">
            {sectionGroups.map((group) => (
              <div key={group.title}>
                <p className="mila-eyebrow mb-2 px-2 text-[11px]">
                  {group.title}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === activeSection;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setActiveSection(item.id)}
                          className={
                            active
                              ? "flex h-10 w-full items-center gap-3 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 text-left text-sm font-semibold text-[var(--foreground)]"
                              : "mila-muted flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition hover:bg-white/[0.05] hover:text-[var(--foreground)]"
                          }
                        >
                          <Icon size={17} aria-hidden />
                          <span className="truncate">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] px-6 py-8 lg:px-10">
            <header className="mb-8 flex flex-col gap-4 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="mila-muted text-sm font-medium">Settings</p>
                <h1 className="mt-2 text-4xl font-semibold text-[var(--foreground)]">
                  {sectionTitle}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                {savedAt && hydrated && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-faint)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                    <Check size={13} />
                    Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetAll}
                  className="mila-secondary h-9 rounded-lg border px-3 text-sm font-medium transition"
                >
                  Reset to default
                </button>
              </div>
            </header>

            {activeSection === "preferences" && (
              <PreferencesPanel
                state={state}
                updatePreference={updatePreference}
                updatePreferences={updatePreferences}
              />
            )}
            {activeSection === "profile" && (
              <ProfilePanel user={user} displayName={displayName} />
            )}
            {activeSection === "calendar" && (
              <CalendarPanel
                state={state}
                calendarEvents={calendarEvents}
                calendarStatus={calendarStatus}
                calendarNames={activeCalendarNames}
                updatePreference={updatePreference}
                setCalendarVisibility={setCalendarVisibility}
                refreshCalendarEvents={refreshCalendarEvents}
              />
            )}
            {activeSection === "notifications" && (
              <NotificationsPanel
                state={state}
                updatePreference={updatePreference}
                toggleMutedApp={toggleMutedApp}
              />
            )}
            {activeSection === "connectors" && <ConnectorsPanel />}
            {activeSection === "workspace" && (
              <WorkspacePanel
                state={state}
                updatePreference={updatePreference}
                displayName={displayName}
              />
            )}
            {activeSection === "team" && (
              <TeamPanel user={user} displayName={displayName} />
            )}
            {activeSection === "analytics" && (
              <AnalyticsPanel calendarEvents={calendarEvents} />
            )}
            {activeSection === "billing" && <BillingPanel />}
            {activeSection === "referrals" && <ReferralsPanel />}
            {activeSection === "help" && <HelpPanel />}
            {activeSection === "labs" && (
              <LabsPanel state={state} updatePreference={updatePreference} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PreferencesPanel({
  state,
  updatePreference,
  updatePreferences,
}: {
  state: Preferences;
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
}) {
  return (
    <div className="space-y-9">
      <SettingsBlock title="General">
        <SettingsRow
          icon={Mic}
          title="Live meeting indicator"
          description="Show a compact desktop indicator while Mila is transcribing."
        >
          <Toggle
            checked={state.liveMeetingIndicator}
            onChange={(value) => updatePreference("liveMeetingIndicator", value)}
          />
        </SettingsRow>
        <SettingsRow
          icon={Monitor}
          title="Open Mila when you log in"
          description="Start the desktop app automatically with macOS."
        >
          <Toggle
            checked={state.autoLaunch}
            onChange={(value) => updatePreference("autoLaunch", value)}
          />
        </SettingsRow>
        <SettingsRow
          icon={Video}
          title="Move Mila aside in meetings"
          description="Keep the meeting window visible when capture starts."
        >
          <Toggle
            checked={state.moveAsideInMeetings}
            onChange={(value) => updatePreference("moveAsideInMeetings", value)}
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Appearance">
        <SettingsRow
          icon={Palette}
          title="Theme"
          description="Choose the color scheme for this install."
        >
          <SegmentedControl
            value={state.theme}
            options={[
              { value: "dark", label: "Dark", icon: Moon },
              { value: "light", label: "Light", icon: Sun },
              { value: "system", label: "System", icon: Monitor },
            ]}
            onChange={(theme) => updatePreference("theme", theme as Theme)}
          />
        </SettingsRow>
        <SettingsRow
          icon={Sparkles}
          title="App icon"
          description="Pick a dock icon treatment for personal builds."
        >
          <div className="flex flex-wrap gap-3">
            {["#67e8f9", "#ff9b7c", "#f4d35e", "#f4f1ec", "#87b9ff"].map(
              (color, index) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`App icon option ${index + 1}`}
                  className={
                    index === 0
                      ? "grid h-11 w-11 place-items-center rounded-lg border-2 border-[#67e8f9] text-[#061113]"
                      : "grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-[#061113] opacity-70 transition hover:opacity-100"
                  }
                  style={{ backgroundColor: color }}
                >
                  <span className="text-sm font-black">M</span>
                </button>
              ),
            )}
          </div>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Data and sharing">
        <SettingsRow
          icon={Link2}
          title="Default link sharing"
          description="Choose who can open generated note links by default."
        >
          <SelectControl
            value={state.defaultLinkSharing}
            options={[
              { value: "private", label: "Only me" },
              { value: "workspace", label: "Workspace" },
              { value: "public", label: "Anyone with the link" },
            ]}
            onChange={(value) =>
              updatePreference(
                "defaultLinkSharing",
                value as Preferences["defaultLinkSharing"],
              )
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={ExternalLink}
          title="Always open shared links in Mila"
          description="Route Mila note links from the browser into the desktop app."
        >
          <Toggle
            checked={state.openSharedLinksInDesktop}
            onChange={(value) =>
              updatePreference("openSharedLinksInDesktop", value)
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={ShieldCheck}
          title="Use my data to improve models"
          description="Allow anonymized product improvement data."
        >
          <Toggle
            checked={state.useDataForModelImprovement}
            onChange={(value) =>
              updatePreference("useDataForModelImprovement", value)
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={Database}
          title="Auto deletion period for transcripts"
          description="Remove raw transcripts after a fixed retention window."
        >
          <SelectControl
            value={state.transcriptRetention}
            options={[
              { value: "off", label: "Off" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "1y", label: "1 year" },
            ]}
            onChange={(value) =>
              updatePreference(
                "transcriptRetention",
                value as TranscriptRetention,
              )
            }
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Language">
        <SettingsRow
          icon={Languages}
          title="Transcription language"
          description="Select the language spoken most often in meetings."
        >
          <LanguageSelect
            value={state.transcriptionLanguage}
            onChange={(value) =>
              updatePreferences({ transcriptionLanguage: value })
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={BookOpen}
          title="Summary language"
          description="Choose the language generated notes should use."
        >
          <LanguageSelect
            value={state.summaryLanguage}
            onChange={(value) =>
              updatePreferences({ summaryLanguage: value, outputLanguage: value })
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={FileText}
          title="Custom vocabulary"
          description="Bias live transcription toward recurring names, acronyms, products, and mixed-language terms."
          wide
        >
          <textarea
            value={state.internalJargon}
            onChange={(event) =>
              updatePreference("internalJargon", event.target.value)
            }
            placeholder="Moove, Callipo, Project AlphaDuck, Zulqarnain"
            className="min-h-28 w-full resize-y rounded-lg border border-white/10 bg-[#18191e] px-4 py-3 text-sm text-white outline-none placeholder:text-[#777c82] focus:border-[#67e8f9]/70"
          />
        </SettingsRow>
      </SettingsBlock>
    </div>
  );
}

function ProfilePanel({
  user,
  displayName,
}: {
  user: SettingsUser;
  displayName: string;
}) {
  return (
    <div className="space-y-9">
      <SettingsBlock title="Account">
        <SettingsRow
          icon={UserRound}
          title="Name"
          description="The name shown on notes, exports, and shared links."
        >
          <ReadonlyValue value={displayName} />
        </SettingsRow>
        <SettingsRow
          icon={Globe2}
          title="Email"
          description="Your sign-in email for this Mila workspace."
        >
          <ReadonlyValue value={user.email} />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Security">
        <ActionRow
          icon={KeyRound}
          title="API keys"
          description="Create scoped keys for local automations and agents."
          action="Manage"
        />
        <ActionRow
          icon={LockKeyhole}
          title="Connected sessions"
          description="Review desktop and browser sessions signed in to Mila."
          action="Review"
        />
      </SettingsBlock>
    </div>
  );
}

function CalendarPanel({
  state,
  calendarEvents,
  calendarStatus,
  calendarNames,
  updatePreference,
  setCalendarVisibility,
  refreshCalendarEvents,
}: {
  state: Preferences;
  calendarEvents: DesktopCalendarEvent[];
  calendarStatus: "loading" | "ready" | "unavailable";
  calendarNames: string[];
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  setCalendarVisibility: (calendarName: string, enabled: boolean) => void;
  refreshCalendarEvents: () => Promise<void>;
}) {
  const nextEvent = calendarEvents[0];

  return (
    <div className="space-y-9">
      <SettingsBlock title="Display">
        <SettingsRow
          icon={CalendarDays}
          title="Show upcoming meetings in menu bar"
          description="Display your next meeting and countdown in the macOS menu bar."
        >
          <Toggle
            checked={state.showUpcomingInMenuBar}
            onChange={(value) =>
              updatePreference("showUpcomingInMenuBar", value)
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={UsersRound}
          title="Show events with no participants"
          description="Include calendar blocks that do not have attendees or a video link."
        >
          <Toggle
            checked={state.showEventsWithoutParticipants}
            onChange={(value) =>
              updatePreference("showEventsWithoutParticipants", value)
            }
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock
        title="Upcoming"
        action={
          <button
            type="button"
            onClick={() => void refreshCalendarEvents()}
            className="h-8 rounded-lg border border-white/10 px-3 text-xs font-semibold text-[#f4f1ec] transition hover:bg-white/[0.05] hover:text-white"
          >
            Refresh
          </button>
        }
      >
        {calendarStatus === "unavailable" ? (
          <EmptyState
            icon={CalendarDays}
            title="Calendar access is not available"
            description="Open the desktop app and allow Calendar automation when macOS asks."
          />
        ) : nextEvent ? (
          <div className="px-6 py-5">
            <div className="rounded-lg border border-[#67e8f9]/25 bg-[#67e8f9]/10 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">
                    Next meeting
                  </p>
                  <h2 className="mt-2 truncate text-xl font-semibold text-white">
                    {nextEvent.title}
                  </h2>
                  <p className="mt-1 text-sm text-[#c9c4ba]">
                    {formatEventWindow(nextEvent)} ·{" "}
                    {nextEvent.calendarName ?? "Calendar"}
                  </p>
                </div>
                <div className="rounded-full bg-[#67e8f9] px-4 py-2 text-sm font-semibold text-[#061113]">
                  {formatCountdown(nextEvent.startAt)}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming meetings found"
            description="Mila checked the next 72 hours in the calendars enabled below."
          />
        )}
      </SettingsBlock>

      <SettingsBlock title="Visible calendars">
        {calendarNames.map((calendarName, index) => (
          <SettingsRow
            key={calendarName}
            icon={CalendarDays}
            title={calendarName}
            description={
              index === 0
                ? "Primary calendar for scheduled meeting detection."
                : "Include this calendar in meeting detection and the menu bar."
            }
          >
            <Toggle
              checked={state.visibleCalendars[calendarName] ?? true}
              onChange={(value) => setCalendarVisibility(calendarName, value)}
            />
          </SettingsRow>
        ))}
      </SettingsBlock>
    </div>
  );
}

function NotificationsPanel({
  state,
  updatePreference,
  toggleMutedApp,
}: {
  state: Preferences;
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  toggleMutedApp: (appName: string) => void;
}) {
  return (
    <div className="space-y-9">
      <SettingsBlock title="Meeting notifications">
        <SettingsRow
          icon={CalendarDays}
          title="Scheduled meetings"
          description="Notify one minute before a Calendar meeting starts."
        >
          <Toggle
            checked={state.scheduledMeetingNotifications}
            onChange={(value) =>
              updatePreference("scheduledMeetingNotifications", value)
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={Video}
          title="Auto-detected meetings"
          description="Notify when Mila detects an active Zoom, Meet, Teams, Webex, WhatsApp, or FaceTime call."
        >
          <Toggle
            checked={state.autoDetectedMeetingNotifications}
            onChange={(value) =>
              updatePreference("autoDetectedMeetingNotifications", value)
            }
          />
        </SettingsRow>
        <SettingsRow
          icon={Bell}
          title="Do not notify me in these apps"
          description="Mute detection notifications for selected meeting tools."
          wide
        >
          <div className="flex flex-wrap gap-2">
            {detectedApps.map((appName) => {
              const active = state.mutedMeetingApps.includes(appName);
              return (
                <button
                  key={appName}
                  type="button"
                  onClick={() => toggleMutedApp(appName)}
                  className={
                    active
                      ? "rounded-full bg-[#67e8f9] px-3 py-1.5 text-sm font-semibold text-[#061113]"
                      : "rounded-full border border-white/10 px-3 py-1.5 text-sm font-medium text-[#f4f1ec] transition hover:bg-white/[0.05] hover:text-white"
                  }
                >
                  {appName}
                </button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="When someone says your name">
        <SettingsRow
          icon={AtSign}
          title="Mention alerts"
          description="Alert me the moment a participant says my name — a banner when Mila is in front, an OS notification when it's in the background."
        >
          <Toggle
            checked={state.mentionAlerts}
            onChange={(value) => updatePreference("mentionAlerts", value)}
          />
        </SettingsRow>
        <SettingsRow
          icon={UserRound}
          title="Names & nicknames to listen for"
          description="Your account name is always matched. Add nicknames, initials, or the way your name tends to get misheard — speech-to-text often mangles proper nouns, so spelling out the garbled version helps Mila still catch it."
          wide
        >
          <textarea
            value={state.mentionAliases}
            onChange={(event) =>
              updatePreference("mentionAliases", event.target.value)
            }
            placeholder="Zul, MZ, Qarnain"
            className="min-h-20 w-full resize-y rounded-lg border border-white/10 bg-[#18191e] px-4 py-3 text-sm text-white outline-none placeholder:text-[#777c82] focus:border-[#67e8f9]/70"
          />
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Workspace notifications">
        <SettingsRow
          icon={UsersRound}
          title="Added to folder"
          description="Get activity-feed and email notifications for new folders."
        >
          <SelectControl
            value="activity"
            options={[
              { value: "activity", label: "Activity and email" },
              { value: "off", label: "Off" },
            ]}
            onChange={() => undefined}
          />
        </SettingsRow>
        <SettingsRow
          icon={Megaphone}
          title="Product updates and tips"
          description="Receive release notes and workflow tips."
        >
          <Toggle
            checked={state.marketingEmails}
            onChange={(value) => updatePreference("marketingEmails", value)}
          />
        </SettingsRow>
      </SettingsBlock>
    </div>
  );
}

function ConnectorsPanel() {
  return (
    <div className="space-y-9">
      <div className="rounded-lg border border-[#67e8f9]/25 bg-[#67e8f9]/10 p-5">
        <p className="text-sm font-semibold text-[#67e8f9]">
          Connect Mila to the tools where meeting outcomes already live.
        </p>
      </div>
      <SettingsBlock title="Integrations">
        {connectors.map((connector) => (
          <ConnectorRow key={connector.name} connector={connector} />
        ))}
      </SettingsBlock>
      <SettingsBlock title="API and agents">
        <ActionRow
          icon={KeyRound}
          title="API keys"
          description="Create scoped API keys for secure programmatic access."
          action="Manage"
        />
        <ActionRow
          icon={Bot}
          title="Agent memory"
          description="Expose selected meeting memory to local MCP clients."
          action="Configure"
        />
      </SettingsBlock>
    </div>
  );
}

function WorkspacePanel({
  state,
  updatePreference,
  displayName,
}: {
  state: Preferences;
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  displayName: string;
}) {
  return (
    <div className="space-y-9">
      <SettingsBlock title="Workspace setup">
        <SettingsRow
          icon={Building2}
          title="Workspace name"
          description="Shown in shared notes, exports, and admin screens."
        >
          <input
            value={state.workspaceName}
            onChange={(event) =>
              updatePreference("workspaceName", event.target.value)
            }
            className="h-10 w-full min-w-0 rounded-lg border border-white/10 bg-[#18191e] px-3 text-sm text-white outline-none focus:border-[#67e8f9]/70 sm:w-80"
          />
        </SettingsRow>
        <SettingsRow
          icon={Palette}
          title="Logo"
          description="Recommended size is 256x256px."
        >
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#67e8f9] text-sm font-semibold text-[#061113]">
            {getInitials(displayName)}
          </div>
        </SettingsRow>
      </SettingsBlock>

      <SettingsBlock title="Workspace invites and members">
        <ActionRow
          icon={Link2}
          title="Invite links"
          description="Create and expire invite links for this workspace."
          action="Manage"
        />
        <ActionRow
          icon={KeyRound}
          title="SSO"
          description="Require identity-provider login for enterprise workspaces."
          action="Upgrade"
        />
        <ActionRow
          icon={ShieldCheck}
          title="Directory sync"
          description="Sync members and groups from your identity provider."
          action="Off"
        />
      </SettingsBlock>

      <SettingsBlock title="Danger zone">
        <ActionRow
          icon={ExternalLink}
          title="Transfer notes to another workspace"
          description="Move all notes from this workspace to another account."
          action="Transfer"
          danger
        />
        <ActionRow
          icon={LockKeyhole}
          title="Delete workspace"
          description="Permanently delete notes, transcripts, and team access."
          action="Delete"
          danger
        />
      </SettingsBlock>
    </div>
  );
}

function TeamPanel({
  user,
  displayName,
}: {
  user: SettingsUser;
  displayName: string;
}) {
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#777c82]"
          />
          <input
            placeholder="Search members"
            className="h-11 w-full rounded-lg border border-[#67e8f9]/35 bg-[#18191e] pl-9 pr-3 text-sm text-white outline-none placeholder:text-[#777c82] focus:border-[#67e8f9]"
          />
        </label>
        <div className="flex items-center gap-3">
          <button className="h-10 rounded-lg px-3 text-sm font-semibold text-[#67e8f9] transition hover:bg-[#67e8f9]/10">
            Export CSV
          </button>
          <button className="h-10 rounded-full bg-[#67e8f9] px-4 text-sm font-semibold text-[#0f1012] transition hover:bg-white">
            Invite teammate
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10">
        <div className="grid grid-cols-[1.2fr_1.4fr_0.7fr_40px] bg-[#202127] px-5 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#a6a29b]">
          <span>Name</span>
          <span>Email</span>
          <span>Status</span>
          <span />
        </div>
        <div className="grid grid-cols-[1.2fr_1.4fr_0.7fr_40px] items-center bg-[#242522] px-5 py-4 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#67e8f9] text-xs font-semibold text-[#0f1012]">
              {getInitials(displayName)}
            </div>
            <span className="truncate font-semibold text-white">
              {displayName}
            </span>
          </div>
          <span className="truncate text-[#c8c3b8]">{user.email}</span>
          <span className="w-fit rounded-full bg-[#67e8f9]/18 px-2 py-1 text-xs font-semibold text-[#67e8f9]">
            Admin
          </span>
          <button className="text-[#a6a29b]">...</button>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({
  calendarEvents,
}: {
  calendarEvents: DesktopCalendarEvent[];
}) {
  const stats = [
    { label: "Meetings captured", value: "12", detail: "+4 this week" },
    { label: "Action items found", value: "38", detail: "9 open" },
    { label: "Languages detected", value: "5", detail: "English primary" },
    {
      label: "Upcoming meetings",
      value: String(calendarEvents.length),
      detail: "Next 72 hours",
    },
  ];

  return (
    <div className="space-y-9">
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-white/10 bg-[#202127] p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#929087]">
              {stat.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {stat.value}
            </p>
            <p className="mt-1 text-sm text-[#a6a29b]">{stat.detail}</p>
          </div>
        ))}
      </div>
      <SettingsBlock title="Insights">
        <ActionRow
          icon={Wand2}
          title="Meeting quality trends"
          description="Track repeated topics, decision velocity, and unresolved risks."
          action="View"
        />
        <ActionRow
          icon={FileText}
          title="Export analytics"
          description="Download CSV reports for leadership and operations reviews."
          action="Export"
        />
      </SettingsBlock>
    </div>
  );
}

function BillingPanel() {
  return (
    <div className="space-y-9">
      <div className="rounded-lg border border-[#67e8f9]/25 bg-[#67e8f9]/10 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#67e8f9]">
          Current plan
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-white">Team beta</h2>
            <p className="mt-1 text-sm text-[#c9c4ba]">
              Unlimited meetings while MILA is in private beta.
            </p>
          </div>
          <button className="h-10 rounded-full bg-[#67e8f9] px-4 text-sm font-semibold text-[#0f1012]">
            Manage billing
          </button>
        </div>
      </div>
      <SettingsBlock title="Usage">
        <ActionRow
          icon={Mic}
          title="Transcription hours"
          description="18.5 of 100 beta hours used this month."
          action="Details"
        />
        <ActionRow
          icon={UsersRound}
          title="Seats"
          description="1 active member. Invite teammates when the workspace is ready."
          action="Invite"
        />
      </SettingsBlock>
    </div>
  );
}

function ReferralsPanel() {
  return (
    <div className="space-y-9">
      <div className="rounded-lg border border-white/10 bg-[#202127] p-6">
        <p className="text-sm font-semibold text-[#67e8f9]">Invite founders</p>
        <h2 className="mt-2 max-w-2xl font-serif text-3xl text-white">
          Give another team early access to MILA and get priority feature
          requests.
        </h2>
        <div className="mt-5 flex max-w-xl gap-2">
          <input
            readOnly
            value="https://mila.local/ref/muhammad"
            className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0f1012] px-3 text-sm text-[#f4f1ec]"
          />
          <button className="h-11 rounded-lg bg-[#67e8f9] px-4 text-sm font-semibold text-[#061113]">
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpPanel() {
  return (
    <div className="space-y-9">
      <SettingsBlock title="Support">
        <ActionRow
          icon={CircleHelp}
          title="Help center"
          description="Open setup docs, troubleshooting, and release notes."
          action="Open"
        />
        <ActionRow
          icon={Code2}
          title="Diagnostics"
          description="Collect app, server, calendar, and microphone checks."
          action="Run"
        />
        <ActionRow
          icon={Keyboard}
          title="Keyboard shortcuts"
          description="Review navigation, capture, and export shortcuts."
          action="View"
        />
      </SettingsBlock>
    </div>
  );
}

function LabsPanel({
  state,
  updatePreference,
}: {
  state: Preferences;
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
}) {
  return (
    <div className="space-y-9">
      <SettingsBlock title="MILA extras">
        <SettingsRow
          icon={Bot}
          title="Meeting autopilot"
          description="Draft follow-up emails and CRM updates from accepted action items."
        >
          <Toggle
            checked={state.shareableLinksDefault}
            onChange={(value) => updatePreference("shareableLinksDefault", value)}
          />
        </SettingsRow>
        <ActionRow
          icon={Languages}
          title="Cross-language memory"
          description="Ask questions in one language and cite meeting evidence from another."
          action="Enabled"
        />
        <ActionRow
          icon={ShieldCheck}
          title="Compliance export"
          description="Export notes, transcript retention, and sharing records for audits."
          action="Preview"
        />
      </SettingsBlock>
    </div>
  );
}

function SettingsBlock({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-4 px-1">
        <h2 className="text-base font-semibold text-[#a6a29b]">{title}</h2>
        {action}
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[#202127]">
        <div className="divide-y divide-dashed divide-white/10">{children}</div>
      </div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  description,
  children,
  wide = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? "grid gap-4 px-6 py-5"
          : "grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(180px,auto)] md:items-center"
      }
    >
      <div className="flex min-w-0 gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[#b8b5ad]">
          <Icon size={20} aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#a6a29b]">{description}</p>
        </div>
      </div>
      <div className={wide ? "pl-[60px]" : "flex justify-start md:justify-end"}>
        {children}
      </div>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  description,
  action,
  danger = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  danger?: boolean;
}) {
  return (
    <SettingsRow icon={icon} title={title} description={description}>
      <button
        type="button"
        className={
          danger
            ? "h-9 rounded-full border border-[#ff7a59]/30 px-4 text-sm font-semibold text-[#ff9b7c] transition hover:bg-[#ff7a59]/10"
            : "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-semibold text-[#f4f1ec] transition hover:bg-white/[0.05] hover:text-white"
        }
      >
        {action}
        {!danger && <ChevronRight size={15} />}
      </button>
    </SettingsRow>
  );
}

function ConnectorRow({
  connector,
}: {
  connector: {
    name: string;
    description: string;
    icon: LucideIcon;
    tone: string;
    status: string;
  };
}) {
  const Icon = connector.icon;
  return (
    <div className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 gap-4">
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${connector.tone}`}
        >
          <Icon size={24} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-white">
              {connector.name}
            </h3>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#67e8f9]">
              {connector.status}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#a6a29b]">
            {connector.description}
          </p>
        </div>
      </div>
      <button className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-sm font-semibold text-[#f4f1ec] transition hover:bg-white/[0.05] hover:text-white">
        Connect
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        checked
          ? "relative h-7 w-12 rounded-full bg-[#67e8f9] transition"
          : "relative h-7 w-12 rounded-full bg-[#71716b] transition"
      }
    >
      <span
        className={
          checked
            ? "absolute left-6 top-1 h-5 w-5 rounded-full bg-white shadow transition"
            : "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition"
        }
      />
    </button>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; icon: LucideIcon }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 rounded-lg border border-white/10 bg-[#242522] p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={
              active
                ? "flex h-9 items-center justify-center gap-2 rounded-md bg-[#67e8f9] px-3 text-sm font-semibold text-[#0f1012]"
                : "flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-[#a6a29b] transition hover:text-white"
            }
          >
            <Icon size={15} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-lg border border-white/10 bg-[#18191e] px-3 text-sm font-medium text-white outline-none focus:border-[#67e8f9]/70 sm:w-64"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-lg border border-white/10 bg-[#18191e] px-3 text-sm font-medium text-white outline-none focus:border-[#67e8f9]/70 sm:w-72"
    >
      {languageOptions.map((language) => (
        <option key={language.code} value={language.code}>
          {language.label} - {language.nativeLabel}
        </option>
      ))}
    </select>
  );
}

function ReadonlyValue({ value }: { value: string }) {
  return (
    <div className="max-w-sm truncate rounded-lg border border-white/10 bg-[#18191e] px-3 py-2 text-sm text-[#f4f1ec]">
      {value}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="px-6 py-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-white/[0.06] text-[#a6a29b]">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#a6a29b]">
        {description}
      </p>
    </div>
  );
}

function getDesktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { mila?: DesktopBridge }).mila;
}

function syncDesktopPreferences(patch: Partial<Preferences>) {
  const bridge = getDesktopBridge();
  if (!bridge?.setPreferences) return;

  const desktopPatch: Record<string, unknown> = {};
  if (patch.apiUrl !== undefined) desktopPatch.apiUrl = patch.apiUrl;
  if (patch.wsUrl !== undefined) desktopPatch.wsUrl = patch.wsUrl;
  if (patch.theme !== undefined) desktopPatch.theme = patch.theme;
  if (patch.autoLaunch !== undefined) {
    desktopPatch.launchAtLogin = patch.autoLaunch;
  }
  if (patch.showUpcomingInMenuBar !== undefined) {
    desktopPatch.showUpcomingInMenuBar = patch.showUpcomingInMenuBar;
  }
  if (patch.showEventsWithoutParticipants !== undefined) {
    desktopPatch.showEventsWithoutParticipants =
      patch.showEventsWithoutParticipants;
  }
  if (patch.visibleCalendars !== undefined) {
    desktopPatch.visibleCalendars = patch.visibleCalendars;
  }
  if (patch.autoDetectedMeetingNotifications !== undefined) {
    desktopPatch.autoDetectedMeetingNotifications =
      patch.autoDetectedMeetingNotifications;
  }
  if (patch.mutedMeetingApps !== undefined) {
    desktopPatch.mutedMeetingApps = patch.mutedMeetingApps;
  }

  if (Object.keys(desktopPatch).length === 0) return;
  return bridge.setPreferences(desktopPatch);
}

function getSectionTitle(section: SettingsSection) {
  const titles: Record<SettingsSection, string> = {
    preferences: "Preferences",
    profile: "Profile",
    calendar: "Calendar",
    notifications: "Notifications",
    connectors: "Connectors",
    workspace: "General",
    team: "Team",
    analytics: "Analytics",
    billing: "Billing",
    referrals: "Referrals",
    help: "Get help",
    labs: "Labs",
  };
  return titles[section];
}

function readableNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "Mila user";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "M"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function formatCountdown(isoDate: string) {
  const diffMs = Math.max(0, new Date(isoDate).getTime() - Date.now());
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `Starts in ${hours}h ${remainingMinutes}m`;
  return `Starts in ${minutes}m`;
}

function formatEventWindow(event: DesktopCalendarEvent) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return `${formatClock(start)} - ${formatClock(end)}`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
