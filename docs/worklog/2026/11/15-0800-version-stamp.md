# 앱·서버 빌드 도장(한국 시각 분까지)과 버전 줄

- 일시: 2026-11-15 08:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-29-app-shell.md` "바뀜 (2026-11-14, 빌드 도장)", 줄기 `work/version-stamp`

사용자 요청(2026-11-15, 원문): "버전확인도 할수있게 버전을 날짜와 시간 분까지 표시해달라."

## 한 일
- 게임 앱·서버를 빌드할 때 빌드 시각(ISO, UTC)과 커밋 앞 7자를 Vite `define`으로 넣는다(두 `vite.config.ts`의 `buildStamp` 플러그인). 화면·/health에는 한국 시각 `YYYY-MM-DD HH:mm`으로 보인다(`@terra/shared/buildStamp`의 순수 함수).
- 값의 출처: CI는 `--build-arg APP_BUILD_TIME`(새)과 `APP_BUILD`(원래 있던 커밋 앞 12자). Docker 빌드에는 `.git`이 없다(`.dockerignore`, Verified: 파일). 인자가 없으면 Dockerfile이 지금 시각 하나를 앱·서버에 같이 쓴다. 손으로 빌드하면 지금 시각 + `git rev-parse HEAD`, git이 없으면 커밋은 빈 값(빌드 계속). Vite 개발 서버·tsx 서버·단위 시험은 도장 없음 → `dev`.
- 서버: `/health`에 `build: { time, commit }`(옛 칸 그대로), tRPC `system.info`에도 같은 `build`. `ops/smoke.mjs`는 통과 줄에 빌드 도장을 보이기만 한다(옛 이미지로 되돌려도 통과).
- 화면: 설정 → 앱 정보에 버전 줄 "버전 · 앱 2026-11-15 07:54 (4fe6c77) · 서버 2026-11-15 07:54 (4fe6c77) · 팩 core@92"(원래 "빌드 307 (…)" 줄은 그대로). 개발자 홈(`/dev`) 맨 아래에도 같은 줄. 앱과 서버 커밋이 다르면 "앱을 다시 켜면 새 버전이 적용됩니다" 안내. `pwa/updates.ts`는 바꾸지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/buildStamp.ts`(새)·`.test.ts`(새)·`package.json` | 도장 순수 함수(KST 변환·커밋 자르기·빌드 설정 값 고르기·화면 글·다름 판정)와 시험, 하위 진입점 `./buildStamp` |
| `apps/game/vite.config.ts`, `apps/game/src/env.d.ts` | 앱 도장 define(`__APP_BUILD_TIME__`·`__APP_BUILD_COMMIT__`), 개발 서버는 빈 값 |
| `apps/server/vite.config.ts`, `apps/server/src/buildStamp.ts`(새) | 서버 도장 define(`__SERVER_BUILD_*`), 없으면 null(`typeof`로 읽음 — 빌드 결과에서 값으로 바뀐 것 Verified: `dist/main.js`) |
| `apps/server/src/app.ts`, `apps/server/src/trpc/system.ts` | `/health`·`system.info`에 `build` |
| `apps/server/src/app.test.ts`, `apps/server/src/trpc/system.test.ts`, `apps/game/src/net/api.test.ts` | 응답·출력 타입에 `build` |
| `apps/game/src/settings/versionInfo.ts`(새)·`.test.ts`(새)·`VersionRow.tsx`(새)·`versionRow.css`(새) | 버전 줄 조립(순수)·서버 묻기·화면 |
| `apps/game/src/settings/SettingsPage.tsx`, `apps/game/src/editor/DevHome.tsx`·`devHome.css` | 버전 줄을 앱 정보와 개발자 홈 아래에 |
| `apps/game/messages/{ko,en}.json` | `settings_version_*` 7개(ko·en) |
| `.oxlintrc.json` | `no-underscore-dangle` 허용 목록에 새 define 이름 4개 |
| `Dockerfile`, `.github/workflows/ci.yml` | `APP_BUILD_TIME` 빌드 인자(없으면 Dockerfile이 지금 시각) |
| `ops/smoke.mjs` | 통과 줄에 서버 빌드 도장 |
| `e2e/shell.spec.ts`, `e2e/dev.spec.ts` | 버전 줄 시험(값·/health 일치·다름 안내·사진), 개발자 홈 버전 줄 |
| `docs/adr/2026-10-29-app-shell.md` | "바뀜 (2026-11-14, 빌드 도장)" |

## 검사 (Verified: 실행)
- `pnpm check`(TEST_DATABASE_URL 있음): 시험 파일 706개·시험 5,291개 통과.
- 새 단위 시험: `buildStamp.test.ts` 12개, `versionInfo.test.ts` 5개, 서버 `app.test.ts`·`system.test.ts` 13개, `api.test.ts` 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 JS 109,698 B / 상한 131,416 B — 버전 줄은 지연 조각 `VersionRow-*.js`라 첫 화면에 없음).
- 화면 시험 `pnpm e2e e2e/shell.spec.ts e2e/dev.spec.ts`: 35개 통과(새 시험 5개: 설정 버전 줄, 다름 안내, 사진 pastel·dark, 개발자 홈 버전 줄).
- `docker compose -f ops/compose.yml config`(가짜 필수 변수) 통과(compose 파일은 안 바꿈).
- 사진(390px): 설정 앱 정보 파스텔·다크에서 눈으로 확인(가로 넘침 없음, 긴 줄은 줄바꿈).

## 함께 바꿔야 하는 파일
- 새 define 이름을 더하면 `.oxlintrc.json`의 `no-underscore-dangle` 허용 목록과 `env.d.ts`(앱)·`src/buildStamp.ts`(서버)를 함께.
- 두 `vite.config.ts`의 `buildStamp` 플러그인은 같은 규칙이다(한쪽만 바꾸지 않는다).

## 건드리지 말 것
- `apps/game/src/pwa/updates.ts`(새 버전 적용 규칙), `__APP_BUILD__`(접속 인사·성능 보고의 클라이언트 빌드 이름, 그대로 커밋 앞 12자/`dev`).

## 미검증·TODO·알려진 문제
- CI Docker 이미지 빌드 경로(`--build-arg APP_BUILD_TIME`)는 실행하지 않았다(미실행). 로컬 `docker build`도 하지 않았다. Dockerfile의 `${APP_BUILD_TIME:-$(date …)}` 쉘 대체는 Assumed(문법은 일반 sh).
- `apps/server/src/app.ts`는 999줄이다(상한 1,000). 다른 줄기가 이 파일에 더하면 합칠 때 나눠야 한다.
- 개발자 홈 사진은 화면 위쪽만 찍혀 아래 버전 줄은 사진에 없다(시험이 값을 본다).
- 같은 커밋을 다시 빌드해도 시각이 달라 `VersionRow-*.js` 해시가 바뀐다(그 조각만 다시 받는다).

## 리셋 필요 여부
- 필요 없음. DB·팩·SIM·프로토콜 변경 없음.

## 사용자 결정 대기
- 없음.
