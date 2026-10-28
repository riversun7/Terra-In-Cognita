# AGENTS.md

이 파일은 이 저장소에서 일하는 모든 AI 에이전트(Claude Code, Antigravity, Gemini CLI 등)와 사람을 위한 공통 지침이다.
`CLAUDE.md`는 이 파일을 불러온다. 지침은 여기 한 곳에서만 고친다.

## 1. 프로젝트

**Terra In-Cognita** — 사이보그·미니언 기반 전략 게임. 단일 월드(EVE식 통합 경제), 3D 행성 지도(1차맵) + 주 활동 공간(2차맵), 자동 행동·자동전투 + 유저 개입, HTS급 거래창, 개발자용 행성 편집기.
모바일 웹 1순위, 데스크톱 2순위(PWA). 한국어 기본, 영어 필수.

## 2. 작업 전에 읽을 것

1. `docs/PLAN.md` — 계획서(무엇을, 왜). 구조·기술스택·규칙의 기준.
2. `docs/PROTECTED.md` — 승인 없이 바꾸면 안 되는 것.
3. `docs/worklog/` 최근 항목 — 직전 작업 상태와 남은 일.
4. 관련 `docs/adr/` — 그 영역의 결정과 이유.

기획(게임 규칙·수치)은 `docs/design/`에 있다. 다른 세션이 관리하므로 고치지 않는다.

## 3. 작업 흐름

- 기본은 `main`에서 바로 작업한다(트렁크 기반). 여러 에이전트가 동시에 큰 작업을 할 때만 짧은 브랜치·worktree를 쓰고 빨리 합친다. 같은 브랜치를 동시에 쓰지 않는다.
- 푸시 전 `git pull --rebase`. **main의 CI가 실패 상태면 다른 일보다 먼저 고친다.**
- 커밋 메시지는 Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `perf:`, `build:`, `ci:`, `chore:`. 커밋 하나에 목적 하나.
- 한 작업이 끝나면 작업 기록을 남긴다(5장).

## 4. 코드 규칙

- 주석은 **한국어**, 이름(변수·함수·타입·파일)은 **영어**. 파일명은 영문 ASCII만.
- TypeScript strict. 의존성 버전은 **정확히 고정**한다(`^`, `~` 금지).
- **새 런타임 의존성 추가는 ADR 필수**(이유·대안·라이선스). 버전 올림·개발 도구는 제외.
- 파일 크기: 600줄 초과 경고, 1,000줄 초과 CI 실패(자동 생성 파일 제외). 넘으면 나눈다.
- 모듈 경계(도구로 강제):
  - `apps/*` → `packages/*` 방향만 허용.
  - `packages/engine`은 `apps/server`·`packages/sim`을 import하지 않는다.
  - `packages/sim`은 `packages/engine`·DOM API를 쓰지 않는다.
  - `apps/game`은 `packages/sim`을 import하지 않는다(판정 코드를 기기로 보내지 않음).
  - `packages/protocol`·`packages/shared`는 다른 내부 패키지를 import하지 않는다.
- **서버 권위**: 자원 획득, 전투 결과, 거래·잔고, 아이템 생성, 조우, 소유권 판정은 서버만 한다.
- 판정 코드(`packages/sim` 등)에서는 `Math.random`, `Date.now`, `Math.sin/cos/tan/exp/log/pow` 같은 초월함수를 쓰지 않는다. 시드 난수와 `packages/shared`의 결정적 수학 함수를 쓴다.
- 금액은 최소 단위 정수(`BigInt`, DB `int8`). 소수점 실수 계산 금지.
- 게임 상태를 바꾸는 명령은 WebSocket 프로토콜(`packages/protocol`)로만 보낸다. tRPC는 조회와 비실시간 기능용.
- UI 문자열은 메시지 키로만 쓰고, 한국어와 영어를 **함께** 추가한다(영어 누락 시 빌드 실패).
- 비밀값(비밀번호, 토큰, `.env`)을 커밋하지 않는다. 관리자 화면 코드에도 비밀값·시드를 넣지 않는다.

## 5. 기록 규칙

| 문서 | 언제 | 규칙 |
|---|---|---|
| `docs/worklog/YYYY/MM/DD-HHMM-<slug>.md` | 작업이 끝날 때마다 1개 | 일시(KST), 작업 도구, 한 일, 바꾼 파일과 이유, 함께 바꿔야 하는 파일, 건드리지 말 것, 미검증·TODO, 관련 ADR. 템플릿: `docs/worklog/TEMPLATE.md` |
| `docs/WORKLOG.md` | 자동 생성 | 직접 고치지 않는다(목차) |
| `docs/adr/YYYY-MM-DD-<slug>.md` | 결정할 때 | 확정된 ADR은 고치지 않는다. 바꾸려면 새 ADR을 쓰고 옛 ADR에 "대체됨" 표시만 한다. 템플릿: `docs/adr/README.md` |
| `docs/PLAN.md` | 결정이 바뀔 때 | 요약 문서. 이유는 ADR에 |
| `docs/DECISION_LOG.md` | 수정 금지 | 계획 세션의 질문·답변 원문. 새 결정은 ADR로 |
| `CHANGELOG.md` | 버전 태그 때 | git-cliff로 자동 생성 |

확인 표기: 확인한 사실은 **Verified**, 추정은 **Assumed**, 모르면 **Unknown**. 실행하지 않은 코드는 "동작한다"고 쓰지 않는다("미실행").

## 6. 버전 주의 (AI 학습 데이터보다 새로운 것)

아래는 확인된 사항만 적는다. 새로 확인하면 출처와 날짜를 붙여 추가한다.

- **TypeScript 7.0** (2026-10 기준 7.0.2): Go로 다시 만든 컴파일러. 컴파일러 API가 필요한 도구는 `@typescript/typescript6` 별칭을 쓴다.
- **Node.js**: 24 LTS 사용. 26은 LTS 전환 릴리스가 나온 뒤 전환한다. Node 25+는 corepack을 포함하지 않으므로 pnpm은 `npm i -g pnpm@<버전>`으로 설치한다.
- **PostgreSQL 18 Docker 이미지**: 데이터 경로가 `/var/lib/postgresql/18/docker`로 바뀌었다. 볼륨은 `/var/lib/postgresql`에 마운트한다(또는 `PGDATA`를 명시).
- **Drizzle ORM**: 1.0 RC(`1.0.0-rc.x`)로 시작한다. 0.x 문서의 관계형 쿼리 예제는 1.0에서 바뀌었으니 1.0 문서를 본다.
- **tRPC 11**: Fastify 어댑터는 Fastify 5 이상이 필요하다.
- **watchtower**: 개발이 중단됐다. 쓰지 않는다.

## 7. 명령어

모노레포 골격이 만들어지면 여기에 적는다(`pnpm install`, `pnpm check`, `pnpm test`, `pnpm dev` 등).
