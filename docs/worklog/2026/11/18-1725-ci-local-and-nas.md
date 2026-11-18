# CI 경량화: 검증은 작업 PC 훅으로, 실행 점검·되돌림 훈련은 NAS로

- 일시: 2026-11-18 17:25 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-11-18-ci-local-and-nas.md`, `2026-10-28-dev-workflow.md`, 작업 기록 `18-1625-ci-docs-zero-usage.md`

## 한 일
- 사용자 지시(2026-11-18):
  1. NAS에서 실행할 수 있는 것은 NAS로 뺀다.
  2. 필수만 남기고 작업 PC에서 진행한다. Claude Code는 작업을 한 번에 모아서 검증하여 토큰 사용량을 줄인다.
- 빌드 메모리 측정(Verified, 이 Mac Node 24.22.2 `/usr/bin/time -l`): `@terra/game build` 최대 RSS 1,406~1,442MB(약 3.5초), `@terra/server build` 485MB(약 0.5초). NAS(총 3,890MB, `tic-app` 약 600MB + `tic-db` + 다른 컨테이너)에서 `docker build`를 돌리면 스왑 위험이 있어 `image` 빌드만 GitHub 서버에 남기고 나머지를 옮겼다.
- `.github/workflows/ci.yml`:
  - `check`·`secrets` 작업과 `pull_request` 트리거를 지웠다.
  - `image` 작업에서 컨테이너를 띄워 행성 굽기를 기다리던 `smoke` 단계를 뺐다(NAS `deploy`로 이동).
- `Dockerfile`: 빌드 단계 끝에 `node scripts/check-pwa.mjs && node scripts/check-bundle.mjs && node scripts/check-content.mjs --no-compat`을 더해 이미지 빌드 중에 PWA·첫 화면 JS 크기·콘텐츠 팩을 함께 확인한다(추가 시간 약 1~2초).
- `ops/smoke.mjs`: `STATIC_DIR`이 있거나 `EXPECT_STATIC=ok`일 때 `/`(`id="root"`), `/manifest.webmanifest` 형식, `/sw.js` 형식, `/assets/missing-abc.js` 404를 함께 확인한다(옛 `ci.yml` `image` 점검을 NAS 배포 점검으로 합침).
- `.github/workflows/rollback-drill.yml`: `broken-image` 작업을 NAS `drill` 작업(`[self-hosted, nas]`) 안으로 합쳤다.
- `package.json`·`lefthook.yml`:
  - `pnpm check` 순서를 `format:check → typecheck → lint → …`로 바꿔, 다른 작업 PC에서 `git pull` 받은 뒤 바로 돌려도 `paraglide` 컴파일과 서버 선언 파일이 `lint` 전에 먼저 만들어지게 했다.
  - `pre-push` 훅에 `pnpm --filter @terra/server db:generate && test -z "$(git status --porcelain -- apps/server/drizzle)"`를 더했다.
- `AGENTS.md` 3장, `docs/adr/2026-10-28-dev-workflow.md`(일부 대체 표시), 새 ADR `docs/adr/2026-11-18-ci-local-and-nas.md` 작성.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.github/workflows/ci.yml` | `check`·`secrets`·PR 트리거·이미지 안 `smoke` 컨테이너 제거, `image` → `deploy`만 유지 |
| `.github/workflows/rollback-drill.yml` | `broken-image`를 NAS 실행기(`[self-hosted, nas]`) 작업으로 합침 |
| `Dockerfile` | 빌드 단계에서 `check-pwa`·`check-bundle`·`check-content --no-compat` 실행 |
| `ops/smoke.mjs` | 정적 파일·PWA 응답 점검(`/`, `manifest.webmanifest`, `sw.js`, 없는 파일 404) 추가 |
| `package.json` | `pnpm check`에서 `typecheck`를 `lint` 앞으로 이동 |
| `lefthook.yml` | `pre-push`에 `db:generate` 마이그레이션 누락 검사 추가 |
| `AGENTS.md` | 3장 검사 모아서 하기·CI/NAS 역할 분담 규칙 갱신 |
| `docs/adr/2026-10-28-dev-workflow.md`, `docs/adr/2026-11-18-ci-local-and-nas.md` | CI 경량화 결정 기록 |
| `docs/worklog/2026/11/18-1725-ci-local-and-nas.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- `Dockerfile`에서 부르는 `scripts/check-pwa.mjs`·`check-bundle.mjs`·`check-content.mjs`가 읽는 경로를 `.dockerignore`에 넣지 않는다.

## 건드리지 말 것
- `ops/deploy.sh`의 자동 되돌림 순서와 `changes` 단계(마지막 성공한 main 실행 기준 비교).

## 미검증·TODO·알려진 문제
- `ci.yml`·`rollback-drill.yml`·`lefthook.yml` YAML 구문과 로컬 `pre-push` 훅 전체는 확인했다(Verified). 바뀐 `ci.yml`(`image` → `deploy`)과 `ops/smoke.mjs` 정적 파일 점검이 실제 GitHub·NAS에서 도는 것은 푸시 뒤 처음 확인된다(미실행).
- `rollback-drill.yml`은 수동 실행 워크플로라 실제로 돌리지 않았다(미실행).

## 사용자 결정 대기
- 없음.
