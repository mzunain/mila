import Image from "next/image";
import Link from "next/link";

const columns = [
  {
    heading: "Product",
    links: [
      { label: "Product", href: "#product" },
      { label: "Features", href: "#features" },
      { label: "Download", href: "#download" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact", href: "mailto:hello@mila.app" },
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
  {
    heading: "Apps",
    links: [
      { label: "macOS", href: "#download" },
      { label: "Windows", href: "#download" },
      { label: "iOS", href: "#download" },
      { label: "Android", href: "#download" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-[#e2ded6] bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3 text-base font-semibold text-[#151411]">
            <Image src="/mila-mark.svg" alt="" width={34} height={34} />
            Mila
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#625f59]">
            Multilingual meeting memory for teams that need clean notes,
            decisions, and follow-up without a bot in the room.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.heading}>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#65727a]">
                {column.heading}
              </div>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#625f59] transition hover:text-[#0e7490]"
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
      <div className="border-t border-[#e2ded6]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-[#72777d] sm:flex-row lg:px-8">
          <span>© {new Date().getFullYear()} Mila.</span>
          <span>English, Urdu, Hindi, Finnish, and more.</span>
        </div>
      </div>
    </footer>
  );
}
