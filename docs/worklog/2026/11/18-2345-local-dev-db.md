# 로컬 개발 서버·교차 PC 테스트 DB 시드 구성

- 일시: 2026-11-18 23:45 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-db-access-and-migrations.md`, `2026-11-08-world-reset.md`, `ops/compose.yml`

## 한 일
- 다른 컴퓨터에서도 같은 구조·계정·결정적 세계 데이터를 유지하고, NAS·원격 DB에는 절대 닿지 않도록 로컬 개발 서버·DB 스크립트를 추가했다:
  - `.env.example`: 로컬 전용 설정 틀(`127.0.0.1:5432/terra_dev`, `BETTER_AUTH_URL=http://localhost:5173`, `NPC_SOCIETY=1`, `NPC_TEST_NATIONS=16`, `S1_TEST_MAPS=6`, `S1_TEST_BOTS=100`, `GARDENER_WAVES=0`).
  - `scripts/dev-env.mjs`: `.env` 자동 생성(비밀값·테스트 비밀번호 무작위 생성, git에 올리지 않음)과 로컬 전용 DB 호스트 검사(`127.0.0.1`/`localhost`/`::1`만 허용).
  - `scripts/dev-db.mjs`(`pnpm dev:db`, `pnpm dev:reset`): 로컬 PostgreSQL 기동 확인 → `terra_dev` DB 생성 → `db:migrate`(git pull 뒤 새 마이그레이션 자동 반영) → 표준 개발 계정 `dev`(`player,dev,admin`)·`player`(`player`) 생성·역할 동기화. `--reset`은 `reset-world --confirm RESET-WORLD`로 세계 표만 비운다.
  - `scripts/dev-local.mjs`(`pnpm dev:local`): `dev:db` 실행 후 백엔드(`4100`)·프론트엔드(`5173`)를 함께 띄우고, 준비가 끝나면 실제 HTTP·WebSocket 프로토콜로 `dev`(`DevCyborg`)·`player`(`TestPlayer`) 기본 사이보그와 샘플 영토 비콘 1개를 멱등하게 만든다.
- 이 Mac의 Homebrew `postgresql@15`를 켜고 `pnpm dev:local`을 기동해 `http://localhost:5173/dev/buildings?facility=territory_beacon` 화면까지 확인했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `.env.example` | 여러 PC에서 같은 환경 변수 기본값을 공유하는 틀(비밀값 없음) |
| `scripts/dev-env.mjs` | `.env` 생성·읽기 및 로컬 DB 호스트 강제 검사 |
| `scripts/dev-db.mjs` | 로컬 DB 생성·마이그레이션·표준 계정(`dev`, `player`) 준비 및 `--reset` |
| `scripts/dev-local.mjs` | 로컬 서버·프론트 동시 실행 및 프로토콜 기반 멱등 샘플 시드 |
| `package.json` | `dev:db`, `dev:reset`, `dev:local` 스크립트 추가 |
| `docs/worklog/2026/11/18-2345-local-dev-db.md`, `docs/WORKLOG.md` | 이 기록과 자동 생성 목차 |

## 함께 바꿔야 하는 파일
- `ops/compose.yml`의 기본 NPC 국가 수·시험 2차맵 수가 크게 바뀌면 `.env.example` 기본값도 맞춰 준다.

## 건드리지 말 것
- `scripts/dev-env.mjs`의 `assertLocalDatabaseUrl` 로컬 호스트 검사(`127.0.0.1`, `localhost`, `::1` 외 차단)는 지우지 않는다.
- `.env`는 `.gitignore`와 `scripts/check-secrets.mjs`가 막으므로 커밋하지 않는다.

## 미검증·TODO·알려진 문제
- 이 Mac에서 `pnpm dev:db`, `pnpm dev:local`(--seed-only 2회 연속 멱등 실행 포함), Chrome으로 `http://localhost:5173/dev/buildings?facility=territory_beacon` 로그인·3D 렌더링까지 확인했다(Verified: 도시 49, 건물 933, 유닛 1993, 사용자 2, 비콘 1).
- `pnpm check`·`pnpm check:docs`·`node scripts/check-secrets.mjs` 통과(Verified).
- 다른 OS(Linux·Windows)나 Docker 기반 PostgreSQL에서는 실행하지 않았다(미실행).

## 사용자 결정 대기
- 없음.
