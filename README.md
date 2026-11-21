# Terra In-Cognita

사이보그·미니언 기반 전략 게임. 2026-10 전면 재작성(리부트)을 시작한 저장소다.

- 계획서: [`docs/PLAN.md`](docs/PLAN.md)
- 결정 기록: [`docs/adr/`](docs/adr/), 계획 세션 질문·답변: [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md)
- 작업 기록: [`docs/WORKLOG.md`](docs/WORKLOG.md)
- 에이전트·기여 규칙: [`AGENTS.md`](AGENTS.md)

## 현재 단계

**M0 기반 작업 중** — 모노레포 골격, CI, 배포, 백업, 결정 기록(ADR). 로드맵은 `docs/PLAN.md` 11장.

## 로컬 개발 서버

로컬 PostgreSQL(`127.0.0.1:5432`)만 사용하며, 스크립트가 `127.0.0.1`·`localhost`·`::1` 외 DB 주소를 차단해 NAS·운영 DB에 영향을 주지 않는다.

- `pnpm dev:local` — 로컬 DB 준비(`dev:db`) 후 백엔드(`4100`)·프론트엔드(`5173`)를 함께 띄우고, 기본 사이보그(`DevCyborg`, `TestPlayer`)와 샘플 영토 비콘을 멱등하게 시드한다.
- `pnpm dev:db` — `.env`가 없으면 `.env.example`로 생성한 뒤 로컬 DB(`terra_dev`) 생성, `db:migrate`(최신 마이그레이션 적용), 표준 계정(`dev`, `player`) 준비를 수행한다.
- `pnpm dev:reset` — `.env`와 계정(`dev`, `player`)은 남기고 세계 표만 비운 뒤(`reset-world`) 마이그레이션을 다시 맞춘다. 다음 `pnpm dev:local` 때 최신 `content/core/` 기준으로 세계가 새로 생성된다.
- `pnpm dev:server` / `pnpm dev:game` — 백엔드(`4100`)·프론트엔드(`5173`)를 각각 따로 실행한다.

### 다른 컴퓨터와 같게 유지되는 것·달라지는 것
- **아이디**: 모든 로컬 PC에서 `dev`(`player,dev,admin`)·`player`(`player`)로 같다.
- **비밀번호**: 비밀값을 Git에 올리지 않으므로 처음 실행 시 각 PC의 `.env`(`DEV_USER_PASSWORD`)에 무작위로 만들어진다. 여러 PC에서 같은 비밀번호를 쓰려면 `.env`의 `DEV_USER_PASSWORD`를 같은 값으로 맞추면 된다(이미 계정이 만들어진 뒤 바꿀 때는 `apps/server/src/cli.ts set-password` 사용).
- **데이터셋**: 스키마, 콘텐츠 팩, 16개 NPC 국가·시작 도시·시설 골격은 `.env.example`과 `content/core/` 기준으로 같게 생성된다. 다만 UUID·생성 시각(`nowMs`), `cyborg_roll` 무작위 스탯, 실행 중 NPC·봇의 실시간 변화는 PC·시점마다 달라진다.

## 이전 버전

- 2025-09 프로토타입: 이 저장소의 이전 이력(사용자 결정으로 2026-10-28 삭제).
- 2026 버전: `riversun7/AntiGravt01` (보관, 변경하지 않음).
