# tpl-admin-frontend

SunmoonAI 的 Next.js Admin 通用模板。它与 FastAPI `tpl-backend` 组成不可拆分的
发布和验收单元，提供 App Router、public/authenticated 渲染边界、next-intl、
Tailwind/shadcn UI、同源 `/api` 接入和 Node standalone 构建。

本模板只承载跨业务通用能力，不包含 Knowfeed、Knowbase 或 Research 的领域页面和 DTO。
旧 React Router SPA 保留在独立的 `tpl-admin-frontend-react` 仓库，仅作迁移参考。

## 本地开发

```bash
nvm use 24.18.0
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

发布基线为 Node `24.18.0` LTS 与 pnpm `10.24.x`；版本冻结服务于单次发布可复现，
模板按季度检查 LTS 生命周期并在 EOL 前至少六个月启动下一次受控升级。

首次使用时，从 `.env.example` 生成未提交的 `.env.local`。浏览器 API 固定为同源
`/api`；`DEPLOYMENT_ENV`、`AUTH_APP`、`APP_ORIGIN`、
`BACKEND_INTERNAL_URL`、`DEPLOYMENT_ID` 属于 server-only 运行时契约。
Casdoor、Redis、服务 token 或其他凭据不得进入 `NEXT_PUBLIC_*` 或前端仓库。

## 质量门禁

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm check:i18n
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

生产镜像只运行 Next standalone Node 产物。发布前必须记录模板 commit、依赖锁、
镜像 digest、前后端配对版本、环境契约和回滚版本。

## 架构边界

- `proxy.ts` 只负责 locale negotiation 等请求前路由工作，不是授权边界。
- `env/client.ts` 只允许同源 API path；`instrumentation.ts` 在生产 Node server
  启动时验证 server-only 环境。
- 公共首页可预渲染；管理工作区明确 dynamic/no-store/noindex。
- 受保护页面只通过 `lib/server/auth-session.ts` 的 server-only DAL 将请求 cookie
  和 correlation ID 转给配对 FastAPI Admin Backend，并严格解析 Browser Session
  DTO v1。401 服务端跳转登录，其他上游或契约错误 fail closed。
- 浏览器 logout 只使用同源 POST + CSRF，不保存第二份认证状态。
- Admin 使用独立 `surface=admin`、audience、cookie 和 session namespace，不能复用
  Web 的身份边界。
- 本仓库的受控 fixture 只验证前端契约和渲染；真实 Casdoor、FastAPI、双 Pod、
  滚动升级和回滚资格由 P0-007E 集成门禁验收。
- 迁移到 Knowfeed、Knowbase、Research 时必须完整继承通用能力，再叠加领域页面；
  不允许以“只复制安全壳”替代模板同步。

## 参考

- Next.js App Router 与自托管文档：<https://nextjs.org/docs>
- 当前架构与契约入口：`k8s/docs/project-guide/`
- 旧设计与迁移证据：按 `k8s/sunmoonai/docs/legacy-backlog/verification-index.md` 的固定 Git 版本查询，不作为当前实施基线。
