import { Apple, ArrowRight, Brain, Check, Globe2, MessageSquare, Mic, Monitor, Share2, Sparkles, Wand2, Zap } from "lucide-react";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { DownloadHero } from "@/components/landing/download-hero";
import { PlatformGrid } from "@/components/landing/platform-grid";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-100">
      <LandingNav signedIn={Boolean(session)} />
      <main>
        <Hero signedIn={Boolean(session)} />
        <TrustStrip />
        <FeatureNotepad />
        <FeatureChat />
        <FeatureTemplates />
        <FeatureShare />
        <PlatformsSection />
        <Testimonials />
        <PricingTeaser />
        <DownloadHero />
      </main>
      <LandingFooter />
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(circle_at_50%_30%,rgba(52,211,153,0.18),transparent_60%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-20 lg:pt-32 lg:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            <Sparkles size={12} />
            Multilingual · No meeting bots · On every platform
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl">
            The AI notepad for{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
              every meeting
            </span>
            , every language.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            Mila listens to your calls in English, Urdu, Hindi, Finnish and more —
            and gives you back clean notes, action items, and an AI chat that
            already knows what you discussed.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={signedIn ? "/app" : "/register"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 sm:w-auto"
            >
              {signedIn ? "Open Mila" : "Get started — it's free"}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="#download"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08] sm:w-auto"
            >
              <Apple size={16} />
              Download for Mac
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Free for personal use · Mac · Windows · iPhone · Android · Web
          </p>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl">
      <div className="absolute -inset-x-10 -inset-y-6 bg-[radial-gradient(circle_at_50%_50%,rgba(52,211,153,0.12),transparent_70%)] blur-3xl" />
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0f141b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#0a0e13] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
          <span className="ml-3 text-xs text-slate-500">
            mila — Product strategy review
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
          <div className="hidden border-r border-white/10 bg-[#0c1118] p-5 lg:block">
            <div className="space-y-2">
              {[
                "Product strategy review",
                "Customer discovery — Ayla",
                "Q3 roadmap kickoff",
                "1:1 with Hira",
              ].map((label, index) => (
                <div
                  key={label}
                  className={
                    index === 0
                      ? "rounded-md bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100"
                      : "rounded-md px-3 py-2 text-xs text-slate-400"
                  }
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
                <span className="relative grid h-2 w-2 place-items-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-300" />
                </span>
                Live transcript
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <p className="text-slate-300">
                  <span className="text-emerald-300">Ayla:</span> Customers are
                  asking for shared meeting templates more than anything else.
                </p>
                <p className="text-slate-300">
                  <span className="text-cyan-300">Zain:</span> ٹھیک ہے، تو ہم اس
                  ہفتے کسٹمر ڈسکوری ٹیمپلیٹ شپ کرتے ہیں۔
                </p>
                <p className="text-slate-400">
                  <span className="text-amber-300">Hira:</span> I&apos;ll draft
                  one tonight and share for review tomorrow.
                </p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
                <Sparkles size={11} className="text-emerald-300" />
                Notes
              </div>
              <ul className="mt-5 space-y-2 text-sm text-slate-200">
                <li className="flex gap-2">
                  <span className="text-emerald-300">•</span>
                  Templates are the most-requested feature this month
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-300">•</span>
                  Ship a customer-discovery template this week
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-300">•</span>
                  Hira drafts v1 tonight → review tomorrow
                </li>
              </ul>
              <div className="mt-6 rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400">
                <span className="font-medium text-slate-300">Action items</span>
                <ul className="mt-2 space-y-1.5">
                  <li>☐ Hira — draft customer-discovery template by Wed</li>
                  <li>☐ Ayla — share top 3 customer asks</li>
                  <li>☐ Zain — kick off design review on Thursday</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustStrip() {
  const items = [
    { icon: Mic, label: "Captures your computer's audio — no bots in the meeting" },
    { icon: Globe2, label: "Speaks Urdu, Hindi, Finnish, English & more" },
    { icon: Zap, label: "Runs locally on Mac, Windows, iPhone, Android" },
  ];
  return (
    <section className="border-b border-white/5 bg-white/[0.015]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-10 md:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-emerald-300">
                <Icon size={16} />
              </span>
              {item.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FeatureNotepad() {
  return (
    <FeatureSection
      eyebrow="Notepad"
      title="The AI notepad for people in back-to-back meetings."
      description="Type your own short notes while Mila listens. After the call, she expands them with everything that was actually said — in any language."
      bullets={[
        "Capture rough thoughts; Mila polishes them when the call ends.",
        "Speaker labels, timestamps, and a clean summary by default.",
        "Edit anything — your notes stay yours.",
      ]}
      icon={Wand2}
      visual={<NotepadVisual />}
    />
  );
}

function NotepadVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f141b] p-5 shadow-2xl shadow-black/40">
      <div className="text-xs uppercase tracking-wider text-slate-500">Your notes</div>
      <div className="mt-3 space-y-2 text-sm text-slate-300">
        <p>- customer wants shared templates</p>
        <p>- check pricing for team plan</p>
      </div>
      <div className="my-5 h-px bg-white/10" />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300">
        <Sparkles size={11} />
        After the meeting
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-200">
        <p>
          <strong className="text-white">Templates:</strong> Ayla&apos;s team
          wants reusable templates they can fork per customer interview.
        </p>
        <p>
          <strong className="text-white">Pricing:</strong> Team plan with
          per-seat pricing tested well. Follow up on enterprise tier.
        </p>
      </div>
    </div>
  );
}

function FeatureChat() {
  return (
    <FeatureSection
      reverse
      eyebrow="Chat"
      title="AI chat that already knows what you're working on."
      description="Ask Mila about anything from this week's meetings. She has full context — transcripts, notes, and action items — across every conversation."
      bullets={[
        "“What did Ayla say about pricing?” — answers in seconds, with quotes.",
        "Roll up themes across many meetings into one brief.",
        "Translate any answer into Urdu, Hindi, Finnish, or English.",
      ]}
      icon={MessageSquare}
      visual={<ChatVisual />}
    />
  );
}

function ChatVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f141b] p-5 shadow-2xl shadow-black/40">
      <div className="space-y-4">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-emerald-300/15 px-4 py-2.5 text-sm text-emerald-100">
          What did Ayla flag about pricing this week?
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white/[0.05] px-4 py-3 text-sm text-slate-200">
          <p>Across two calls (Tue + Thu), Ayla called out:</p>
          <ul className="mt-2 space-y-1 text-slate-300">
            <li>• Team plan tested well at $12/seat</li>
            <li>• Enterprise tier still feels too rigid</li>
            <li>• She&apos;s drafting a one-pager for the design partner</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function FeatureTemplates() {
  return (
    <FeatureSection
      eyebrow="Templates"
      title="Notes shaped for the conversation you're having."
      description="Pick a template before the meeting — Mila fills in the right fields automatically as you talk. Customer discovery, 1:1s, sales, user interviews, and more."
      bullets={[
        "Customer discovery: problem, current solution, willingness to pay.",
        "1:1s: wins, blockers, growth, action items.",
        "Sales call: pain, champion, budget, next step.",
      ]}
      icon={Brain}
      visual={<TemplatesVisual />}
    />
  );
}

function TemplatesVisual() {
  const templates = [
    { name: "Customer discovery", fields: ["Problem", "Current solution", "Willingness to pay"] },
    { name: "1:1", fields: ["Wins", "Blockers", "Growth"] },
    { name: "Sales call", fields: ["Pain", "Champion", "Next step"] },
    { name: "User interview", fields: ["Task", "Confusion", "Quote"] },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {templates.map((tpl) => (
        <div
          key={tpl.name}
          className="rounded-lg border border-white/10 bg-[#0f141b] p-4 transition hover:border-emerald-400/40 hover:bg-[#121822]"
        >
          <div className="text-sm font-medium text-white">{tpl.name}</div>
          <ul className="mt-2 space-y-1">
            {tpl.fields.map((field) => (
              <li key={field} className="flex items-center gap-1.5 text-xs text-slate-400">
                <Check size={11} className="text-emerald-300" />
                {field}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FeatureShare() {
  return (
    <FeatureSection
      reverse
      eyebrow="Share"
      title="Share your notes with one click."
      description="Send a clean read-only link to anyone — they get the summary, action items, and full transcript without needing an account."
      bullets={[
        "Public links with optional password.",
        "Export to Markdown, PDF, or paste straight into Notion or Slack.",
        "Calendar integration auto-shares with meeting attendees.",
      ]}
      icon={Share2}
      visual={<ShareVisual />}
    />
  );
}

function ShareVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f141b] p-5 shadow-2xl shadow-black/40">
      <div className="text-sm font-medium text-white">Share this meeting</div>
      <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-[#0a0e13] px-3 py-2 text-xs">
        <span className="font-mono text-slate-400">mila.app/s/m_8f3k2p</span>
        <button
          type="button"
          className="ml-auto rounded bg-emerald-300/15 px-2 py-0.5 text-emerald-200"
        >
          Copy
        </button>
      </div>
      <div className="mt-4 space-y-2 text-xs text-slate-400">
        <label className="flex items-center justify-between">
          Anyone with the link can view
          <span className="relative h-5 w-9 rounded-full bg-emerald-400/60">
            <span className="absolute left-4 top-0.5 h-4 w-4 rounded-full bg-emerald-50" />
          </span>
        </label>
        <label className="flex items-center justify-between">
          Auto-share with attendees
          <span className="relative h-5 w-9 rounded-full bg-emerald-400/60">
            <span className="absolute left-4 top-0.5 h-4 w-4 rounded-full bg-emerald-50" />
          </span>
        </label>
      </div>
    </div>
  );
}

function FeatureSection({
  eyebrow,
  title,
  description,
  bullets,
  icon: Icon,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  icon: typeof Wand2;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className={
          reverse
            ? "grid items-center gap-12 lg:grid-cols-2 lg:[&>div:last-child]:order-first"
            : "grid items-center gap-12 lg:grid-cols-2"
        }>
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <Icon size={14} />
              {eyebrow}
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {title}
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              {description}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-sm text-slate-300">
                  <Check size={16} className="mt-0.5 flex-shrink-0 text-emerald-300" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div>{visual}</div>
        </div>
      </div>
    </section>
  );
}

function PlatformsSection() {
  return (
    <section id="download" className="border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <Monitor size={14} />
            Everywhere you work
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Works on every platform. No meeting bots.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400">
            Mila captures your computer&apos;s audio directly, so the people on
            the other side don&apos;t see a bot in the call. Take her on the go
            with the mobile apps.
          </p>
        </div>
        <PlatformGrid className="mt-12" />
      </div>
    </section>
  );
}

function Testimonials() {
  const quotes = [
    {
      quote: "Mila replaced three different note-taking tools. The multilingual support alone is worth it for our cross-border calls.",
      author: "Sana A.",
      role: "PM at a fintech",
    },
    {
      quote: "First AI notes that don't make me look like I have a stranger sitting in my meeting. The summary lands before I get back to my desk.",
      author: "Tom R.",
      role: "Founder",
    },
    {
      quote: "Customer discovery interviews in Urdu, summaries in English. This used to take me 90 minutes per call.",
      author: "Hira K.",
      role: "Product researcher",
    },
  ];
  return (
    <section className="border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Teams use Mila for the meetings that matter.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {quotes.map((quote) => (
            <figure
              key={quote.author}
              className="rounded-xl border border-white/10 bg-[#0f141b] p-6"
            >
              <blockquote className="text-sm leading-6 text-slate-200">
                &ldquo;{quote.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 text-xs text-slate-500">
                <span className="font-medium text-slate-300">{quote.author}</span>
                {" · "}
                {quote.role}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingTeaser() {
  const plans = [
    {
      name: "Personal",
      price: "Free",
      tagline: "For your own meetings.",
      features: ["Unlimited meetings", "All languages", "Mac, Windows, mobile"],
      cta: "Get started",
      href: "/register",
      featured: false,
    },
    {
      name: "Team",
      price: "$12",
      tagline: "Per seat, per month.",
      features: ["Everything in Personal", "Shared templates", "Workspace search", "Calendar integration"],
      cta: "Start a team",
      href: "/register?plan=team",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      tagline: "SSO, admin, audit log.",
      features: ["Everything in Team", "SSO + SCIM", "On-prem ASR option", "Dedicated support"],
      cta: "Talk to us",
      href: "mailto:hello@mila.app",
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Free for personal use. Fair for teams.
          </h2>
          <p className="mt-4 text-base text-slate-400">
            Start free. Upgrade when your team needs shared workspaces.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={
                plan.featured
                  ? "rounded-2xl border-2 border-emerald-400/40 bg-gradient-to-b from-emerald-400/10 to-transparent p-7"
                  : "rounded-2xl border border-white/10 bg-[#0f141b] p-7"
              }
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                {plan.name}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-white">{plan.price}</span>
                {plan.price !== "Free" && plan.price !== "Custom" && (
                  <span className="text-sm text-slate-500">/ seat / month</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
              <ul className="mt-6 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check size={14} className="text-emerald-300" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={
                  plan.featured
                    ? "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                    : "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                }
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
