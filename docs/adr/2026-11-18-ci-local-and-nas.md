# CI 경량화: 코드 검증은 작업 PC 훅에서, 실행 점검·훈련은 NAS에서, GitHub는 이미지 빌드만

- 상태: 확정
- 날짜: 2026-11-18
- 관련: docs/PLAN.md 9·10장, ADR `2026-10-28-dev-workflow.md`, `2026-10-28-deploy-and-ops.md`, 작업 기록 `docs/worklog/2026/11/18-1625-ci-docs-zero-usage.md`, `18-1725-ci-local-and-nas.md`

## 배경
11월 1~15일 사이 GitHub Actions(`ubuntu-24.04`) 사용량이 $13.65(비공개 무료 한도 직전)에 달해 배포가 한 차례 막히고 저장소를 공개로 전환했다(Verified: 사용자 결제 화면, 작업 기록 `15-0830-batch-1115-merge.md`). 주력 개발 환경인 Claude Code 세션이 이미 자체 컨테이너에서 `pnpm check`(DB 통합 시험 포함)·`pnpm build`·화면 시험을 모두 통과시킨 뒤 `main`에 올리는데도, GitHub CI가 똑같은 `check`(8~17분)·`secrets`(1~2분)·컨테이너 기동 점검(행성 굽기 대기 포함)을 매번 다시 돌렸다.

사용자 결정(2026-11-18):
1. NAS에서 실행할 수 있는 것은 NAS로 뺀다.
2. 필수만 남기고 작업 PC에서 진행한다. Claude Code는 작업을 한 번에 모아서 검증하여 토큰 사용량을 줄인다.

## 선택지
1. 기존 유지: 매 푸시마다 GitHub `ubuntu-24.04`에서 `check`·`secrets`·`image` 실행.
2. **검증은 작업 PC(`lefthook`), 실행 점검·훈련은 NAS(`[self-hosted, nas]`), GitHub는 `image`(Docker 빌드·푸시)만 실행.**
3. `docker build`까지 모두 NAS에서 실행.

## 결정
2번으로 한다.
- `.github/workflows/ci.yml`:
  - `check`·`secrets` 작업과 `pull_request` 트리거를 없앤다. 문서·스킬만 바뀐 푸시는 `paths-ignore`로 실행하지 않는다.
  - `image` 작업(`ubuntu-24.04`)은 `Dockerfile` 빌드와 GHCR 푸시만 한다. `Dockerfile` 빌드 단계 끝에 `node scripts/check-pwa.mjs && node scripts/check-bundle.mjs && node scripts/check-content.mjs --no-compat`을 함께 돌려 별도 VM 없이 PWA·첫 화면 JS 상한·콘텐츠 팩을 확인한다.
  - 옛 `image` 작업의 컨테이너 기동 점검(`/`·`/manifest.webmanifest`·`/sw.js`·404)은 `ops/smoke.mjs`로 합쳐 NAS `deploy` 작업(`[self-hosted, nas]`)이 `tic-app`에서 한 번에 확인한다(실패 시 직전 태그로 자동 되돌림).
- `.github/workflows/rollback-drill.yml`: `broken-image` 작업을 NAS `drill` 작업(`[self-hosted, nas]`) 안으로 합쳐 GitHub 서버 시간을 쓰지 않는다.
- `package.json`·`lefthook.yml`:
  - `pnpm check`에서 `pnpm typecheck`(`paraglide` 다국어 컴파일 + 서버 선언 파일 생성)를 `pnpm lint`보다 먼저 돌려, 다른 PC에서 `git pull` 받은 뒤 바로 검사해도 린트가 깨지지 않게 한다.
  - `pre-push` 훅에 `pnpm --filter @terra/server db:generate && test -z "$(git status --porcelain -- apps/server/drizzle)"`를 넣어 마이그레이션 누락을 푸시 전에 막는다.
- 에이전트 작업 규칙(`AGENTS.md` 3장): 작업 중에는 바꾼 꾸러미 시험만 돌리고, 전체 검증(`pnpm check`·바꾼 화면 시험)은 작업을 모아 끝낼 때 한 번만 돌려 토큰과 시간을 아낀다.

## 이유
- `pnpm --filter @terra/game build`는 최대 RSS 약 1.34~1.82GiB를 쓴다(Verified: `/usr/bin/time -l` 측정). NAS는 전체 메모리 3,890MB에서 `tic-app`(약 600MB)·`tic-db`·기존 컨테이너가 함께 돌아(Verified: `ops/nas-facts.md`) NAS에서 `docker build`를 돌리면 HDD 스왑(fdatasync 약 77ms)으로 운영 서버 루프가 밀릴 위험이 크다(Assumed). 반면 `image`만 GitHub에서 돌리면 푸시당 약 1~2분이라 비공개 무료 한도(월 2,000분) 안에서 충분히 돈다.
- NAS는 행성 캐시(`/app/planet-cache`)가 이미 있어 `ops/smoke.mjs` 기동 점검이 즉시 끝나고, GitHub 서버에서 빈 캐시로 행성을 굽던 12~20초가 사라진다(Verified: `ops/compose.yml`, `ci.yml`).
- `rollback-drill`의 훈련용 이미지는 `busybox:1.37` 3줄이라 NAS에서 바로 빌드해도 부하가 없다(Verified: `rollback-drill.yml`).

## 결과
- `main` 코드 푸시당 GitHub Actions 유료 서버 시간이 약 12~22분에서 약 1~2분으로 줄고, 문서 푸시·PR·`rollback-drill`은 0분이 된다.
- DB(`TEST_DATABASE_URL`)가 없는 작업 PC에서 푸시하면 DB 통합 시험(`*.db.test.ts`)은 건너뛴 채 올라갈 수 있다 → DB 관련 변경은 DB가 있는 환경(또는 로컬 PostgreSQL 컨테이너)에서 확인한다.
