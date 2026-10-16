# Build and runtime images are supplied by the deployment image lock.
# NODE_RUNTIME_IMAGE defaults to NODE_IMAGE for direct/legacy single-base builds.
ARG NODE_IMAGE=node:24.21.0-trixie@sha256:98ad2493de85738f55c11fe22e8586caf1fd917b7a8075c57ab9c55116e06492
ARG NODE_RUNTIME_IMAGE=${NODE_IMAGE}

FROM ${NODE_IMAGE} AS build

# ============================================================================
# 代理配置（可选，仅在国内网络环境需要）
# ============================================================================
# 如果在国外主机构建，通常不需要代理配置
# 如果需要代理，可以通过 --build-arg 传递：
#   docker build --build-arg HTTP_PROXY=http://proxy.example.com:8080 \
#                --build-arg HTTPS_PROXY=http://proxy.example.com:8080 \
#                -f mybuild/Dockerfile -t knowlab-admin-frontend:1.0.0 .
# ============================================================================
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG NO_PROXY
ARG no_proxy
ARG NODE_USE_ENV_PROXY=1

# 设置代理环境变量（仅在传递了代理参数时生效）
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${http_proxy} \
    https_proxy=${https_proxy} \
    NO_PROXY=${NO_PROXY} \
    no_proxy=${no_proxy} \
    NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY}

# NEXT_PUBLIC_* 构建时静态嵌入 bundle，CI 通过 --build-arg 注入
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_APP_NAME=knowlab
ARG APP_ORIGIN=http://localhost:3000
ARG BACKEND_INTERNAL_URL=http://127.0.0.1:8000
ARG DEPLOYMENT_ID=local-build
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME} \
    APP_ORIGIN=${APP_ORIGIN} \
    BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL} \
    DEPLOYMENT_ID=${DEPLOYMENT_ID}

# Native optional dependencies follow the build image libc.
# The supplied build and runtime images must use the same libc family.

ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=${NPM_CONFIG_REGISTRY} \
    COREPACK_NPM_REGISTRY=${NPM_CONFIG_REGISTRY} \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000

# 固定基础镜像已包含 Corepack。启用 Node 24 原生环境代理后由 Corepack 安装精确 pnpm，
# 避免额外的 npm 全局安装层及其无法可靠中止的网络挂起。
RUN corepack enable && \
    corepack install --global pnpm@10.24.0 && \
    pnpm --version | grep -qx '10.24.0'

ENV CYPRESS_INSTALL_BINARY=0 \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 注意：不设置 NODE_ENV，由 next build 内部自动设为 production
# 若在此处设置 NODE_ENV=development，React 会使用开发模式构建，
# 导致 /_global-error 预渲染时 useContext 报错
# CI=true：pnpm 在无 TTY 的 Docker 环境中需要此变量才能正常执行
ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1

# 构建上下文为子模块根目录；源码在 app/ 子目录
COPY app/ /frontend
WORKDIR /frontend

RUN --mount=type=cache,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --network-concurrency=3

# 须在 next.config 中配置 output: 'standalone'
RUN pnpm build

FROM build AS run-dev
CMD ["pnpm", "dev"]

FROM build AS run-start
ENV NODE_ENV=production APP_ENV=production
RUN pnpm prepare:standalone
ENTRYPOINT ["node"]
CMD [".next/standalone/server.js"]

# Runtime contains only the selected Node base and Next standalone output.
# 不要 FROM build，否则会把 pnpm store、node_modules、构建缓存和编译依赖一起带进最终镜像。
FROM ${NODE_RUNTIME_IMAGE} AS run-minimal

RUN if command -v groupadd >/dev/null 2>&1; then \
      groupadd --system --gid 1001 nodejs && \
      useradd --system --uid 1001 --gid nodejs --no-create-home nextjs; \
    else \
      addgroup --system --gid 1001 nodejs && \
      adduser --system --uid 1001 --ingroup nodejs nextjs; \
    fi

# 构建代理只允许存在于 build 阶段，禁止固化到最终运行镜像。
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Next.js standalone：需 next.config 中 output: 'standalone'
COPY --from=build --chown=nextjs:nodejs /frontend/public ./public
COPY --from=build --chown=nextjs:nodejs /frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /frontend/.next/static ./.next/static

EXPOSE 3000
USER nextjs
ENTRYPOINT ["node"]
CMD ["server.js"]
