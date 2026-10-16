import Link from "next/link";

const ITEMS = [
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/groups", label: "그룹" },
  { href: "/admin/services", label: "예배" },
] as const;

export function AdminNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  return (
    <nav className="mb-5 flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={`flex-1 rounded-md py-2 text-center ${
            item.href === current ? "bg-accent text-accent-foreground font-semibold" : "text-muted"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
