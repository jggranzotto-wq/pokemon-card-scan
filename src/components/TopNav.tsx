import Link from "next/link";

const LINKS = [
  { href: "/", id: "collection", label: "Collection" },
  { href: "/scan", id: "scan", label: "Scan" },
  { href: "/settings", id: "settings", label: "Settings" },
] as const;

export function TopNav({ active }: { active: (typeof LINKS)[number]["id"] }) {
  return (
    <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-ink-card p-1 ring-1 ring-ink-line">
      {LINKS.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          className={`grid min-h-11 place-items-center rounded-xl text-sm font-semibold ${
            active === link.id ? "bg-bolt text-ink" : "text-paper-mute"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
