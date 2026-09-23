import Link from "next/link";

const LINKS = [
  { href: "/admin", label: "Admin" },
  { href: "/architecture", label: "Architecture" },
];

/** Quick jump to this control plane's other ops surfaces — not player-facing navigation. */
export function NavLinks() {
  return (
    <nav className="flex shrink-0 items-center justify-center gap-5 border-b border-zinc-800 bg-zinc-950 px-4 py-1.5">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="font-mono text-[11px] tracking-widest text-zinc-500 uppercase transition-colors hover:text-zinc-300"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
