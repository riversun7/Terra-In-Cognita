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
# 게임 앱이 쓰는 2차맵 엔진(three 포함). pnpm은 package.json이 없어도 잠금 파일대로 설치하지만(2026-10-29 확인), 쓰는 묶음은 적어 둔다
COPY packages/engine/package.json packages/engine/
# 서버가 쓰는 행성 격자(셀 키)·판정 코드(경로·이동·배치·임시 지형). 같은 이유로 적어 둔다
COPY packages/planet/package.json packages/planet/
COPY packages/protocol/package.json packages/protocol/
COPY packages/shared/package.json packages/shared/
COPY packages/sim/package.json packages/sim/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ARG APP_BUILD=dev
ENV APP_BUILD=${APP_BUILD}
# 차례로 늘어나는 빌드 번호(CI 실행 번호). 없으면(손으로 만든 이미지) 빈 값 — 화면은 커밋 앞자리만 보인다
ARG APP_BUILD_NUMBER=
ENV APP_BUILD_NUMBER=${APP_BUILD_NUMBER}
# 빌드 시각(ISO, UTC — CI가 넘긴다). 앱·서버 빌드 도장(설정 → 앱 정보의 버전 줄, /health build)이 한국 시각 분까지로 보인다.
# 이 빌드에는 .git이 없어서(.dockerignore) 커밋은 APP_BUILD에서 읽는다. 없으면(손으로 만든 이미지) 지금 시각을 앱·서버에 같이 쓴다
ARG APP_BUILD_TIME=
RUN APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" && export APP_BUILD_TIME \
  && pnpm --filter @terra/game build && pnpm --filter @terra/server build \
  && node scripts/check-pwa.mjs && node scripts/check-bundle.mjs && node scripts/check-content.mjs --no-compat
# 서버 실행에 필요한 것만 모은다 (dist + 운영용 node_modules)
RUN pnpm --filter @terra/server deploy --prod /out

FROM node:24.22.1-trixie-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4100 \
    STATIC_DIR=/app/public \
    CONTENT_DIR=/app/content/core \
    PLANET_CACHE_DIR=/app/planet-cache
WORKDIR /app
# 1차맵 행성 타일 디스크 캐시(ADR 2026-10-29-s2-planet-lod). NAS는 이 자리에 볼륨을 붙인다(ops/compose.yml).
# 볼륨이 없어도(CI 이미지 확인) 쓸 수 있게 node 사용자에게 준다
RUN mkdir -p /app/planet-cache && chown node:node /app/planet-cache
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
