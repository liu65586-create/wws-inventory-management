"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signError) {
      setError(signError.message);
      setLoading(false);
      return;
    }
    router.replace("/sales");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-6 text-2xl font-semibold">注册</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">邮箱</span>
          <input
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">密码（至少 6 位）</span>
          <input
            className="w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-black px-3 py-2 text-white dark:bg-white dark:text-black"
        >
          {loading ? "提交中…" : "创建账号"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        已有账号？{" "}
        <Link href="/login" className="underline">
          登录
        </Link>
      </p>
    </div>
  );
}
