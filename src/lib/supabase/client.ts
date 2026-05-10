import { createBrowserClient } from "@supabase/ssr";

const MISSING_ENV_MSG =
  "未配置 Supabase：在本地请在项目根目录 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY；在线上请在 Vercel → Project → Settings → Environment Variables 添加上述两项（Production），保存后重新 Deploy。数值见 Supabase Dashboard → Project Settings → API。";

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new Error(MISSING_ENV_MSG);
  }
  return createBrowserClient(url, key);
}
