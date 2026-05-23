import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Download", href: "#download" },
      { label: "Pricing", href: "#pricing" },
      { label: "Templates", href: "#features" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "mailto:hello@mila.app" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#080b10]">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-white">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-emerald-300 to-cyan-400 text-slate-950">
              M
            </span>
            Mila
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
            Multilingual AI meeting notes. Works on Mac, Windows, iPhone, Android,
            and the web — without joining your call as a bot.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.heading}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {column.heading}
              </div>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-400 transition hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Mila. Made with care.</span>
          <span>Speaks: English · اردو · हिन्दी · Suomi · +6 more</span>
        </div>
      </div>
    </footer>
  );
}
