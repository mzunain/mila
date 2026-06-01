import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Globe2,
  Languages,
  LockKeyhole,
  MessageSquare,
  Mic,
  Monitor,
  PanelRight,
  Search,
  Share2,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { DownloadHero } from "@/components/landing/download-hero";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNav } from "@/components/landing/landing-nav";
import { PlatformGrid } from "@/components/landing/platform-grid";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const proofItems = [
  {
    icon: Mic,
    label: "Bot-free capture",
    detail: "Records from your device, so Mila never joins as a guest.",
  },
  {
    icon: Languages,
    label: "Multilingual notes",
    detail: "Turn mixed-language calls into one clean brief.",
  },
  {
    icon: MessageSquare,
    label: "Ask every meeting",
    detail: "Search transcripts, decisions, owners, and follow-ups.",
  },
] satisfies Array<{ icon: LucideIcon; label: string; detail: string }>;

const capabilityCards = [
  {
    icon: Wand2,
    title: "From rough notes to executive summaries",
    copy: "Drop quick thoughts during the call. Mila turns them into polished summaries, decisions, risks, and next steps once the conversation ends.",
  },
  {
    icon: Globe2,
    title: "Made for multilingual teams",
    copy: "Keep the original transcript, normalize the language, and share the final note in the language your team actually reads.",
  },
  {
    icon: Share2,
    title: "Share the outcome, not the recording",
    copy: "Send a clean read-only link with the summary, action items, and transcript. No account required for viewers.",
  },
] satisfies Array<{ icon: LucideIcon; title: string; copy: string }>;

const workflowSteps = [
  {
    icon: CalendarCheck,
    title: "Before the call",
    copy: "Pick a template for sales, discovery, research, hiring, 1:1s, or strategy reviews.",
  },
  {
    icon: Mic,
    title: "During the call",
    copy: "Mila captures live audio and transcript context while you stay focused on the people in the room.",
  },
  {
    icon: BadgeCheck,
    title: "After the call",
    copy: "Get a polished brief with decisions, owners, open questions, and a searchable memory of what happened.",
  },
] satisfies Array<{ icon: LucideIcon; title: string; copy: string }>;

const templateRows = [
  ["Customer discovery", "Pain, current workaround, willingness to pay"],
  ["Sales call", "Champion, budget, objections, next step"],
  ["Research interview", "Tasks, confusion, direct quotes, themes"],
  ["Leadership review", "Decisions, risks, owners, deadlines"],
] as const;

export default async function LandingPage() {
  const session = await getSession();
  const signedIn = Boolean(session);

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-[#111417]">
      <LandingNav signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <ProofStrip />
        <ProductExperience signedIn={signedIn} />
        <CapabilitySection />
        <WorkflowSection />
        <TemplatesSection />
        <PlatformsSection />
        <PricingTeaser signedIn={signedIn} />
        <DownloadHero />
      </main>
      <LandingFooter />
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative min-h-[78svh] overflow-hidden border-b border-[#e2ded6]">
      <Image
        src="/landing/mila-hero-product.png"
        alt="Mila running on a laptop and phone during a video meeting"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(246,248,247,0.98)_0%,rgba(246,248,247,0.88)_37%,rgba(246,248,247,0.28)_68%,rgba(246,248,247,0.02)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(246,248,247,0)_68%,rgba(246,248,247,1)_100%)]" />

      <div className="relative mx-auto flex min-h-[78svh] max-w-7xl items-center px-6 py-16 lg:px-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-[#c8d7d9] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0e7490] backdrop-blur">
            <Sparkles size={13} />
            Multilingual meeting memory
          </div>
          <h1 className="mt-7 text-6xl font-semibold leading-[0.9] tracking-normal text-[#0b1110] sm:text-7xl lg:text-8xl">
            Mila
          </h1>
          <p className="mt-6 max-w-xl text-xl leading-8 text-[#27332f] sm:text-2xl sm:leading-9">
            The elegant AI workspace that turns calls into notes, decisions,
            and follow-up answers without sending a bot into the meeting.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={signedIn ? "/app" : "/register"}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0e7490] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#0e7490]/20 transition hover:bg-[#155e75]"
            >
              {signedIn ? "Open Mila" : "Start free"}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="#product"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#c8d7d9] bg-white/75 px-5 py-3 text-sm font-semibold text-[#151411] backdrop-blur transition hover:border-[#0e7490] hover:bg-white"
            >
              See the product
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#51615a]">
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-[#0e7490]" />
              Mac, Windows, web, iOS, Android
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-[#0e7490]" />
              Built for private, bot-free meetings
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="border-b border-[#e2ded6] bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px bg-[#e2ded6] md:grid-cols-3">
        {proofItems.map((item) => (
          <ProofItem key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}

function ProofItem({
  icon: Icon,
  label,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <div className="bg-white px-6 py-7 lg:px-8">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#e6f8fb] text-[#0e7490]">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#151411]">{label}</h2>
          <p className="mt-1 text-sm leading-6 text-[#5e6f67]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function ProductExperience({ signedIn }: { signedIn: boolean }) {
  return (
    <section id="product" className="bg-[#f7f4ef] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <Eyebrow icon={PanelRight}>The workspace</Eyebrow>
            <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-normal text-[#151411] sm:text-5xl">
              Every meeting becomes a finished work artifact.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#625f59]">
              Mila gives teams a single place for the transcript, summary,
              action items, share link, and AI chat. It feels like a premium
              notebook, not a call recorder.
            </p>
            <div className="mt-8 grid max-w-xl grid-cols-2 gap-3">
              <Metric value="4" label="views: transcript, notes, chat, share" />
              <Metric value="0" label="meeting bots in the attendee list" />
            </div>
            <Link
              href={signedIn ? "/app" : "/register"}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-[#121815] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#25322c]"
            >
              {signedIn ? "Open workspace" : "Create workspace"}
              <ArrowRight size={16} />
            </Link>
          </div>
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}

function ProductMockup() {
  return (
    <div className="overflow-hidden rounded-lg border border-[#18231f] bg-[#111417] shadow-2xl shadow-[#33443b]/20">
      <div className="flex h-12 items-center justify-between border-b border-white/10 bg-[#0d1311] px-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b5f]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f8c86b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#22d3ee]" />
        </div>
        <div className="hidden text-xs font-medium text-[#93a79e] sm:block">
          Product strategy review
        </div>
        <div className="flex items-center gap-2 text-xs text-[#93a79e]">
          <Clock3 size={13} />
          Live
        </div>
      </div>

      <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[210px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0c1210] p-4 lg:block">
          <div className="mb-5 flex items-center gap-2 text-white">
            <Image src="/mila-mark.svg" alt="" width={28} height={28} />
            <span className="font-semibold">Mila</span>
          </div>
          <div className="space-y-1">
            {["Live room", "Sessions", "Templates", "Shared links"].map(
              (item, index) => (
                <div
                  key={item}
                  className={
                    index === 0
                      ? "rounded-md bg-[#16382c] px-3 py-2 text-xs font-medium text-white"
                      : "rounded-md px-3 py-2 text-xs text-[#74877f]"
                  }
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </aside>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#22d3ee]">
                  Live transcript
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Customer discovery sync
                </h3>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md bg-white/[0.06] px-3 py-2 text-xs text-[#d8e5df]">
                <Zap size={13} className="text-[#f8c86b]" />
                Notes updating
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <TranscriptLine
                speaker="Ayla"
                color="text-[#7dd3fc]"
                text="The strongest signal is shared templates. Customers want a faster way to repeat discovery calls."
              />
              <TranscriptLine
                speaker="Zain"
                color="text-[#22d3ee]"
                text="Let's ship the customer interview template first, then measure activation from new teams."
              />
              <TranscriptLine
                speaker="Hira"
                color="text-[#f8c86b]"
                text="I can prepare the first draft tonight and attach the example questions from last week's interviews."
              />
            </div>

            <div className="mt-7 rounded-md border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#93a79e]">
                <Brain size={14} className="text-[#22d3ee]" />
                Meeting brief
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[#d8e5df]">
                <li className="flex gap-3">
                  <Check size={16} className="mt-1 shrink-0 text-[#22d3ee]" />
                  Shared templates are the top request in customer interviews.
                </li>
                <li className="flex gap-3">
                  <Check size={16} className="mt-1 shrink-0 text-[#22d3ee]" />
                  Team will launch customer discovery first, then review usage.
                </li>
                <li className="flex gap-3">
                  <Check size={16} className="mt-1 shrink-0 text-[#22d3ee]" />
                  Hira owns the draft and will circulate it for review tomorrow.
                </li>
              </ul>
            </div>
          </div>

          <aside className="bg-[#fbfaf7] p-5 text-[#111417]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0e7490]">
              <Search size={14} />
              Ask Mila
            </div>
            <div className="mt-5 space-y-3">
              <div className="ml-auto max-w-[88%] rounded-md bg-[#0e7490] px-3 py-2 text-sm leading-6 text-white">
                What did we decide about templates?
              </div>
              <div className="rounded-md border border-[#dce6e1] bg-white px-3 py-3 text-sm leading-6 text-[#42534c] shadow-sm">
                Launch customer discovery first. Hira drafts v1 tonight; Zain
                reviews activation after the first team rollout.
              </div>
            </div>
            <div className="mt-6 border-t border-[#dce6e1] pt-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#708178]">
                Action items
              </div>
              <div className="mt-3 space-y-2">
                {["Draft template", "Share customer asks", "Book design review"].map(
                  (task) => (
                    <div
                      key={task}
                      className="flex items-center gap-2 rounded-md border border-[#dce6e1] bg-white px-3 py-2 text-sm text-[#42534c]"
                    >
                      <span className="h-3 w-3 rounded-sm border border-[#9fb3aa]" />
                      {task}
                    </div>
                  ),
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TranscriptLine({
  speaker,
  color,
  text,
}: {
  speaker: string;
  color: string;
  text: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
      <div className={`text-sm font-semibold ${color}`}>{speaker}</div>
      <p className="mt-1 text-sm leading-6 text-[#c8d7d0]">{text}</p>
    </div>
  );
}

function CapabilitySection() {
  return (
    <section id="features" className="border-y border-[#e2ded6] bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          <Eyebrow icon={Sparkles}>Why it sells</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-[#151411] sm:text-5xl">
            The note taker people actually want in the room.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {capabilityCards.map((card) => (
            <FeatureCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  copy,
}: {
  icon: LucideIcon;
  title: string;
  copy: string;
}) {
  return (
    <article className="rounded-lg border border-[#e2ded6] bg-[#fbfaf7] p-6 transition hover:-translate-y-0.5 hover:border-[#9dccd4] hover:shadow-xl hover:shadow-[#455a60]/10">
      <span className="grid h-11 w-11 place-items-center rounded-md bg-[#e6f8fb] text-[#0e7490]">
        <Icon size={20} />
      </span>
      <h3 className="mt-6 text-xl font-semibold leading-7 text-[#151411]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#625f59]">{copy}</p>
    </article>
  );
}

function WorkflowSection() {
  return (
    <section className="bg-[#111417] py-20 text-white lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <Eyebrow icon={Clock3} tone="dark">
              How it works
            </Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              A calmer workflow for high-stakes conversations.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#aeb8bd]">
              Mila is built for repeated, professional use: prepare the note,
              capture the meeting, and share a finished artifact while the
              context is still fresh.
            </p>
          </div>
          <div className="grid gap-4">
            {workflowSteps.map((step, index) => (
              <WorkflowStep key={step.title} index={index + 1} {...step} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStep({
  icon: Icon,
  index,
  title,
  copy,
}: {
  icon: LucideIcon;
  index: number;
  title: string;
  copy: string;
}) {
  return (
    <article className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-5 sm:grid-cols-[64px_1fr]">
      <div className="flex items-center gap-3 sm:block">
        <span className="grid h-12 w-12 place-items-center rounded-md bg-[#22d3ee] text-[#061113]">
          <Icon size={20} />
        </span>
        <span className="font-mono text-sm text-[#72867d] sm:mt-4 sm:block">
          0{index}
        </span>
      </div>
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#aeb8bd]">{copy}</p>
      </div>
    </article>
  );
}

function TemplatesSection() {
  return (
    <section className="border-b border-[#e2ded6] bg-[#f7f4ef] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow icon={FileText}>Templates</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-[#151411] sm:text-5xl">
              Notes shaped for the work you are doing.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#625f59]">
              A sales call, research interview, and executive review should not
              produce the same generic summary. Mila gives each conversation a
              useful structure.
            </p>
          </div>
          <div className="rounded-lg border border-[#e2ded6] bg-white p-3 shadow-xl shadow-[#455a60]/10">
            {templateRows.map(([title, detail]) => (
              <div
                key={title}
                className="grid gap-3 border-b border-[#e6eee9] px-3 py-4 last:border-b-0 sm:grid-cols-[190px_1fr]"
              >
                <div className="font-semibold text-[#151411]">{title}</div>
                <div className="text-sm leading-6 text-[#625f59]">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformsSection() {
  return (
    <section id="download" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={Monitor}>Everywhere you meet</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-[#151411] sm:text-5xl">
            Desktop for capture. Mobile for follow-up. Web for sharing.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#625f59]">
            Start the meeting on your laptop, review the action items on your
            phone, and share the summary with anyone who needs the outcome.
          </p>
        </div>
        <PlatformGrid className="mt-12" />
      </div>
    </section>
  );
}

function PricingTeaser({ signedIn }: { signedIn: boolean }) {
  const plans = [
    {
      name: "Personal",
      price: "Free",
      tagline: "For founders, researchers, and operators.",
      features: ["Unlimited local meetings", "Multilingual notes", "Web workspace"],
      cta: signedIn ? "Open Mila" : "Start free",
      href: signedIn ? "/app" : "/register",
      featured: false,
    },
    {
      name: "Team",
      price: "$12",
      tagline: "Per seat, per month.",
      features: ["Shared templates", "Workspace search", "Calendar-ready workflows", "Team links"],
      cta: "Start a team",
      href: "/register?plan=team",
      featured: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      tagline: "For regulated teams and private deployments.",
      features: ["SSO and admin controls", "Audit-ready sharing", "Dedicated support"],
      cta: "Talk to us",
      href: "mailto:hello@mila.app",
      featured: false,
    },
  ];

  return (
    <section id="pricing" className="border-y border-[#e2ded6] bg-[#f7f4ef] py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow icon={LockKeyhole}>Simple pricing</Eyebrow>
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-[#151411] sm:text-5xl">
            Start free. Upgrade when meeting memory becomes team infrastructure.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={
                plan.featured
                  ? "rounded-lg border border-[#0e7490] bg-[#111417] p-6 text-white shadow-2xl shadow-[#0e7490]/20"
                  : "rounded-lg border border-[#e2ded6] bg-white p-6 text-[#151411]"
              }
            >
              <div
                className={
                  plan.featured
                    ? "text-xs font-semibold uppercase tracking-[0.18em] text-[#22d3ee]"
                    : "text-xs font-semibold uppercase tracking-[0.18em] text-[#0e7490]"
                }
              >
                {plan.name}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">{plan.price}</span>
                {plan.price !== "Free" && plan.price !== "Custom" && (
                  <span
                    className={
                      plan.featured ? "text-sm text-[#aeb8bd]" : "text-sm text-[#625f59]"
                    }
                  >
                    / seat / month
                  </span>
                )}
              </div>
              <p
                className={
                  plan.featured
                    ? "mt-2 text-sm leading-6 text-[#aeb8bd]"
                    : "mt-2 text-sm leading-6 text-[#625f59]"
                }
              >
                {plan.tagline}
              </p>
              <ul className="mt-6 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check
                      size={15}
                      className={plan.featured ? "text-[#22d3ee]" : "text-[#0e7490]"}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={
                  plan.featured
                    ? "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#22d3ee] px-4 py-3 text-sm font-semibold text-[#061113] transition hover:bg-[#8ff2fb]"
                    : "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#c8d7d9] bg-white px-4 py-3 text-sm font-semibold text-[#151411] transition hover:border-[#0e7490]"
                }
              >
                {plan.cta}
                <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-[#e2ded6] bg-white p-4">
      <div className="text-3xl font-semibold text-[#0e7490]">{value}</div>
      <div className="mt-1 text-xs leading-5 text-[#625f59]">{label}</div>
    </div>
  );
}

function Eyebrow({
  icon: Icon,
  children,
  tone = "light",
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={
        tone === "dark"
          ? "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#22d3ee]"
          : "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#0e7490]"
      }
    >
      <Icon size={14} />
      {children}
    </div>
  );
}
