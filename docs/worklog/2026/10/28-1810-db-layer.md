# DB 기반: Drizzle 1.0 RC + pg, 마이그레이션, 배포 연동

- 일시: 2026-10-28 18:10 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-db-access-and-migrations.md`(새, ADR 22), PLAN 3장·9.4·10.2·13
- 사용자 결정(2026-10-28): DB 연결은 pg. tRPC는 게임 앱이 서버의 타입만 가져오는 예외를 허용(다음 작업에서 ADR로 남김).

## 한 일
- 의존성(`apps/server`): drizzle-orm 1.0.0-rc.5, pg 8.23.1. 개발용으로 drizzle-kit 1.0.0-rc.5, @types/pg 8.23.1. 모두 공개 1일이 지나 `minimumReleaseAge`를 통과한다.
- 코드
  - `src/db/schema.ts`: 첫 표 `client_errors`(기기 오류 기록, PLAN 9.5). 오류를 받는 API는 다음 작업(텔레메트리)에서 만든다.
  - `src/db/client.ts`: 연결 풀(최대 10, 대기 5초), 풀 오류 처리, 헬스체크용 응답 확인(2초). 풀 오류를 듣는 곳이 없으면 DB가 재시작될 때 서버 프로세스가 죽는다.
  - `src/db/migrations.ts`, `src/migrate.ts`: 마이그레이션을 적용하고 적용한 이름을 출력한다. 빌드하면 `dist/migrate.js`가 된다.
  - `/health`: `db`가 `ok`·`error`·`off` 중 하나. DB가 응답하지 않으면 503.
  - `main.ts`: `DATABASE_URL`이 있으면 연결한다. 종료할 때는 진행 중인 요청을 끝낸 뒤 연결을 닫는다.
- 배포
  - `Dockerfile`: 마이그레이션 폴더를 이미지에 넣는다.
  - `ops/compose.yml`: 앱에 `DATABASE_URL`을 준다(비밀번호는 NAS의 `.env`).
  - `ops/deploy.sh` 5단계: `compose run --rm --no-deps app node dist/migrate.js`.
  - `rollback-drill.yml`: 고장 난 이미지에 가짜 `node`를 넣는다. 마이그레이션 단계는 통과하고 헬스체크에서 실패하므로, 되돌림 경로를 그대로 시험한다.
  - `ops/restore-check.sh`: `drizzle` 스키마(마이그레이션 기록 표)도 센다.
- CI: PostgreSQL 18.6 서비스 컨테이너와 `TEST_DATABASE_URL`로 DB 통합 테스트를 돌린다. 표 정의만 바꾸고 `db:generate`를 빠뜨리면 실패한다.
- 검사
  - `scripts/check-docs.mjs`: 올라간 마이그레이션의 수정·이름 변경·삭제를 막는다.
  - 마이그레이션 폴더는 자동 생성 파일이라 포맷·파일 크기 검사에서 뺀다.

## 확인 (Verified: 이 컨테이너의 PostgreSQL 16.15 임시 클러스터)
| 항목 | 결과 |
|---|---|
| 테스트 | DB 없이: 6 통과, 3 건너뜀. DB를 붙이면: 9 통과 |
| 빌드한 `dist/migrate.js` | 1회차에 `20261028090116_client_errors` 적용, 2회차에는 "적용할 마이그레이션 없음" |
| 서버 + DB | 켜짐 200(`db: ok`) → DB 끔 503(`degraded`, 프로세스 유지, 풀 오류 1건 기록) → DB 켬 200 → 종료 신호에 정상 종료(코드 0) |
| 복구 훈련 세기 | 백업 목차 2개 = 되살린 DB 2개(`drizzle.__drizzle_migrations=1`, `public.client_errors=0`) |
| 되돌림 훈련 이미지 | 만들어지는 Dockerfile을 확인했고, 가짜 `node`가 코드 0으로 끝난다 |
| 마이그레이션 보호 | 수정은 실패, 이름 변경도 실패, 새로 추가는 통과 |
| `drizzle-kit generate` 재실행 | "No schema changes" |

마이그레이션 보호의 삭제 경우는 시험하지 않았다. 판정은 수정과 같은 줄(`D` 상태)을 타지만, 시험용 지우기 명령이 안전 검사에 막혔다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/package.json`, `pnpm-lock.yaml` | 의존성, `db:generate`·`db:migrate` 스크립트 |
| `apps/server/src/db/*`, `src/migrate.ts`, `drizzle.config.ts`, `drizzle/` | DB 연결, 표 정의, 첫 마이그레이션 |
| `apps/server/src/app.ts`, `main.ts`, `config.ts`, `app.test.ts` | 헬스체크의 DB 상태, 연결·종료, 설정 |
| `apps/server/vite.config.ts`, `tsconfig.json` | 진입 파일 2개(main, migrate), 설정 파일 타입 검사 |
| `Dockerfile`, `ops/compose.yml`, `ops/deploy.sh` | 배포 5단계 마이그레이션 |
| `.github/workflows/rollback-drill.yml`, `ops/restore-check.sh` | 훈련이 새 단계에서도 의미를 갖게 |
| `.github/workflows/ci.yml` | DB 통합 테스트, 표 정의·마이그레이션 일치 |
| `scripts/check-docs.mjs`, `scripts/check-file-size.mjs`, `biome.json` | 마이그레이션 보호, 자동 생성 파일 제외 |
| `docs/adr/2026-10-28-db-access-and-migrations.md`, `docs/PROTECTED.md`, `docs/PLAN.md`, `AGENTS.md`, `ops/nas-setup.md` | 결정과 규칙 기록 |

## 함께 바꿔야 하는 파일
- 표 정의(`schema.ts`)를 바꾸면 마이그레이션(`apps/server/drizzle/`)을 `db:generate`로 함께 만든다.
- DB 이름·사용자·비밀번호 변수를 바꾸면: `ops/compose.yml`(`DATABASE_URL`), `ops/deploy.sh`, `ops/backup.sh`, `ops/restore-check.sh`, CI 서비스 컨테이너.
- 마이그레이션 폴더 경로를 바꾸면: `Dockerfile`, `src/migrate.ts`, `drizzle.config.ts`, `scripts/check-docs.mjs`, `scripts/check-file-size.mjs`, `biome.json`, CI 일치 검사.
- 배포 단계를 바꾸면 `rollback-drill.yml`의 가짜 `node`도 확인한다.

## 건드리지 말 것
- `apps/server/drizzle/`의 올라간 마이그레이션(PROTECTED).
- 마이그레이션 적용을 서버 시작 코드로 옮기지 않는다(ADR 22).

## 미검증·TODO·알려진 문제
- NAS 확인(Verified, 푸시 뒤):
  - ci #18(run 40662106229): CI에서 DB 통합 테스트가 PostgreSQL 18.6으로 돌았다(`db.test.ts` 3개 포함 22개 통과). 표 정의·마이그레이션 일치("No schema changes").
  - 같은 실행의 NAS 배포: 1회용 컨테이너 `tic-app-run-f60743309431`(운영 `tic-app`과 다른 이름)에서 `마이그레이션 적용: 20261028090116_client_errors`, 새 앱 healthy(`db: ok`).
  - 되돌림 훈련 2회차(run 40662509290): 마이그레이션 단계(가짜 `node`) 통과 → 앱 헬스체크 실패 → `sha-73fa00e5bc18`로 복귀, healthy. 출력 수정도 확인(`상태: none` 한 줄).
- 로컬 확인은 PostgreSQL 16으로 했다. 운영 버전 18.6은 CI에서 확인한다.
- Docker 이미지 빌드·동작은 이 컨테이너에서 돌릴 수 없다(Docker 없음). CI가 확인한다.
- 연결 풀 크기 10은 추정값이다(Assumed).
- 다음 작업:
  - 텔레메트리: 오류를 받는 API, 기기 쪽 보고, 성능 요약
  - tRPC: 타입만 가져오는 예외를 ADR로 남긴다
  - Better Auth

## 사용자 결정 대기
- 없음
