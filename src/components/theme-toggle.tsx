"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-9 w-20" />;

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm"
    >
      {isDark ? "亮色" : "暗色"}
    </button>
  );
}
