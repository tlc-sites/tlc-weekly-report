import Link from "@/components/pending-link";

const ITEMS = [
  { href: "/admin/submissions", label: "제출현황" },
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/groups", label: "그룹" },
  { href: "/admin/services", label: "예배" },
] as const;

export function AdminNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  return (
    <nav aria-label="관리 메뉴" className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-border bg-accent/5 p-1.5 text-[15px]">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-2 py-2 text-center transition ${
            item.href === current ? "bg-accent text-accent-foreground font-semibold" : "text-muted hover:bg-surface"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
