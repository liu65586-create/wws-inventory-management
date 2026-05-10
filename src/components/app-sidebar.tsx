"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/sales", label: "销量" },
  { href: "/inventory", label: "库存" },
  { href: "/competitor", label: "竞品动态" },
  { href: "/replenishment", label: "补货参考" },
  { href: "/settings/inventory-api", label: "库存 API 设置" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const v = window.localStorage.getItem("sidebar_collapsed");
    if (v === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-[width]",
        collapsed ? "w-[72px]" : "w-56",
      )}
    >
      <div className="flex items-center justify-between gap-2 p-3">
        {!collapsed && (
          <div className="text-sm font-semibold tracking-tight">WWS 库存</div>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs"
          title="折叠侧边栏"
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2 pb-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-2 py-2 text-sm hover:bg-[hsl(var(--muted))]",
                active && "bg-[hsl(var(--muted))] font-medium",
                collapsed && "text-center",
              )}
              title={collapsed ? item.label : undefined}
            >
              {collapsed ? item.label.slice(0, 1) : item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 border-t border-[hsl(var(--border))] p-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm"
        >
          退出
        </button>
      </div>
    </aside>
  );
}
