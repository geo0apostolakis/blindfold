import { CircleHelp, Coins, EyeOff, LayoutGrid, MessageCircle, Route, Tag } from "lucide-react";

const nav = [
  { href: "#top", label: "Home", Icon: LayoutGrid },
  { href: "#chat", label: "App", Icon: MessageCircle },
  { href: "#credits", label: "Credits", Icon: Coins },
  { href: "#how", label: "How it works", Icon: Route },
  { href: "#seen", label: "Threat model", Icon: EyeOff },
  { href: "#pricing", label: "Pricing", Icon: Tag },
  { href: "#faq", label: "FAQ", Icon: CircleHelp },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-ink px-4 py-5 lg:flex">
      <a href="#top" className="flex items-center gap-2.5 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
        <img src="/logo.svg" alt="" width={34} height={34} className="rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">blindfold</span>
      </a>
      <nav className="mt-8 flex flex-col gap-1">
        {nav.map(({ href, label, Icon }, i) => (
          <a
            key={href}
            href={href}
            className="rise flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[17px] text-mute transition-colors duration-200 hover:bg-ink-2 hover:text-paper"
            style={{ "--delay": `${120 + i * 50}ms` } as React.CSSProperties}
          >
            <Icon size={20} strokeWidth={1.6} aria-hidden />
            {label}
          </a>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-2xl px-2 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
        <img src="/logo.svg" alt="" width={40} height={40} className="rounded-full" />
        <div className="min-w-0">
          <p className="font-medium">Blindfold</p>
          <p className="text-sm text-mute">Private AI chat</p>
        </div>
      </div>
    </aside>
  );
}
