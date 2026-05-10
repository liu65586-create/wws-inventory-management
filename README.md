# WWS 库存与销售管理（Temu 卖家）

Next.js（App Router）+ TypeScript + TailwindCSS + Supabase + TanStack Query。部署目标：Vercel。

## 快速开始

1. 安装 Node.js（建议 20+）并安装依赖：

```bash
npm install
```

2. 在 Supabase 控制台创建项目，将 `supabase/migrations` 中的 SQL 按顺序执行（或启用 Supabase CLI 迁移）。

3. 复制环境变量：

```bash
copy .env.example .env.local
```

填写 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。若使用仅服务端的维护脚本，可配置 `SUPABASE_SERVICE_ROLE_KEY`（本仓库主流程用 Cookie 会话 + anon + RLS 即可）。

4. 启动开发服务器：

```bash
npm run dev
```

## 功能模块

- `/sales`：销量上传（Excel）、当日占比（Chart.js）、历史趋势（堆叠柱/折线）、表格内近 30 天迷你折线（Recharts），SKU 超过 100 行启用 `react-window`。
- `/inventory`：多仓库动态列、图片上传（`sku-images` 存储桶）、库存 Excel 按仓库导入。
- `/competitor`：同款抓取为 **Mock**（`/api/crawl`），结果页展示近 7 天曲线；真实 Temu 抓取需自行评估合规与反爬策略。
- `/replenishment`：按近 7 天销量估算可售天数、预警与建议补货；支持导出 CSV；每 5 分钟自动刷新。
- `/settings/inventory-api`：按仓库维护 `api_config` JSON（预留自动拉取）。

## 推送到 GitHub

远端仓库：[https://github.com/liu65586-create/wws-inventory-management](https://github.com/liu65586-create/wws-inventory-management)

```bash
git init
git add .
git commit -m "Initial import: WWS inventory and sales app"
git branch -M main
git remote add origin https://github.com/liu65586-create/wws-inventory-management.git
git push -u origin main
```

若远端已有 README 提交，请先 `git pull --rebase origin main` 再推送。

## 合规说明

对第三方平台（如 Temu）进行自动化抓取可能违反其服务条款。请仅在合法授权或合规场景下使用；本仓库中的爬虫接口默认返回 Mock 数据用于产品与前端联调。
