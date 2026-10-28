# syntax=docker/dockerfile:1
# 게임 이미지 — 게임 앱(정적 파일) + Fastify 서버 하나로 (docs/adr/2026-10-28-deploy-and-ops.md)
# 기본 이미지: Debian 13(trixie) slim, glibc. Alpine은 쓰지 않는다.

FROM node:24.22.1-trixie-slim AS build
RUN npm install -g pnpm@11.28.9
WORKDIR /repo
# 의존성 설치를 캐시하기 위해 package.json들을 먼저 복사
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/game/package.json apps/game/
COPY apps/server/package.json apps/server/
COPY packages/content/package.json packages/content/
COPY packages/protocol/package.json packages/protocol/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ARG APP_BUILD=dev
ENV APP_BUILD=${APP_BUILD}
RUN pnpm --filter @terra/game build && pnpm --filter @terra/server build
# 서버 실행에 필요한 것만 모은다 (dist + 운영용 node_modules)
RUN pnpm --filter @terra/server deploy --prod /out

FROM node:24.22.1-trixie-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4100 \
    STATIC_DIR=/app/public \
    CONTENT_DIR=/app/content/core
WORKDIR /app
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
# dist/main.js(서버), dist/migrate.js(마이그레이션), dist/cli.js(관리 명령, .github/workflows/account-admin.yml), dist/assets/(공용 조각)
COPY --from=build /out/dist ./dist
# 마이그레이션 SQL — dist/migrate.js가 ../drizzle을 읽는다 (ops/deploy.sh 5단계)
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/game/dist ./public
# 콘텐츠 팩 — 코드와 함께 배포·되돌림한다. 서버가 시작할 때 검사하고, 틀리면 뜨지 않는다 (docs/adr/2026-10-28-content-pack-format.md)
COPY --from=build /repo/content ./content
USER node
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
