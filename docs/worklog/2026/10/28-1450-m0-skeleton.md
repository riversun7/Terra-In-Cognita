# M0 골격: 모노레포·검사 도구·접속 핸드셰이크·배포 준비

- 일시: 2026-10-28 14:50 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-m0-toolchain.md`(새), `dev-workflow`, `deploy-and-ops`, `time-and-session-protocol`, `i18n` / `docs/PLAN.md` v1.2

## 한 일
- pnpm 모노레포 골격: `apps/server`(Fastify), `apps/game`(Vite + React), `packages/protocol`, `packages/shared`.
- 접속 핸드셰이크를 서버·기기 양쪽에 구현: hello → welcome/reject(프로토콜 버전 확인), ping/pong 5회로 시계 차이 측정, 하트비트 25초, 메시지 64KB 상한, 끊기면 재접속, 앱 복귀 시 시계 다시 맞춤.
- 다국어 골격(Paraglide, 한국어·영어 메시지 10개), 화면 fps 표시, 언어 선택.
- 검사 도구: 포맷(Biome), 타입 인식 린트(oxlint), 타입 검사(TS 7), 단위 테스트(Vitest), 모듈 경계·파일 크기·다국어·비밀값·문서 규칙 스크립트, git 훅(lefthook), 커밋 메시지 규칙(commitlint).
- 배포 준비: Dockerfile, NAS용 compose와 `deploy.sh`(백업 → 기동 → 헬스체크 → 실패 시 되돌림), 실행기(runner) compose, CI(검사 → gitleaks → 이미지 → NAS 배포), NAS 사양 수집 워크플로, NAS 설치 안내.
- 문서: PLAN v1.2(도구 변경 반영), AGENTS.md 6장(확인된 버전 주의점)·7장(명령어), PROTECTED에 `packages/protocol` 추가, ADR 1건 추가, dev-workflow ADR에 "일부 대체됨" 표시, ADR 규칙에 "일부 대체됨" 추가.
- 첫 작업 기록의 시각을 실제 커밋 시각으로 고침(15:00 → 14:20 KST, 파일 이름도 변경). 15:00은 잘못 적은 값이었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `tsconfig.base.json` | 작업공간·버전 고정·공급망 보호·공통 TS 설정 |
| `biome.json`, `.oxlintrc.json`, `commitlint.config.mjs`, `lefthook.yml`, `vitest.config.ts` | 포맷·린트·커밋 규칙·훅·테스트 설정 |
| `packages/shared/src/*` | 시드 난수(mulberry32), 시계 차이 추정 + 테스트 |
| `packages/protocol/src/*` | 메시지 타입(Zod)·버전·코덱 + 테스트 |
| `apps/server/*` | Fastify 앱(/health, /ws, 정적 파일), 세션 처리, 설정, 종료 처리 + 테스트 |
| `apps/game/*` | 접속·시계 표시 화면, fps, 다국어 메시지 |
| `scripts/*.mjs` | 모듈 경계·파일 크기·다국어·비밀값·문서 규칙 검사, 작업 기록 목차 생성 |
| `Dockerfile`, `.dockerignore` | 게임 앱 + 서버 단일 이미지 |
| `ops/compose.yml`, `ops/deploy.sh`, `ops/runner/compose.yml`, `ops/nas-setup.md` | NAS 배포와 설치 안내 |
| `.github/workflows/ci.yml`, `.github/workflows/nas-facts.yml` | CI·배포, NAS 사양 수집 |
| `.gitignore` | Paraglide 생성 폴더 제외 |
| `AGENTS.md`, `docs/PLAN.md`, `docs/PROTECTED.md`, `docs/adr/*` | 실제 구성 반영(위 "한 일") |
| `docs/WORKLOG.md` | 자동 생성 목차로 전환 |

## 함께 바꿔야 하는 파일
- 메시지를 추가하면 `apps/game/messages/ko.json`과 `en.json`을 함께(키·`{변수}` 일치).
- 프로토콜 메시지를 바꾸면 `packages/protocol/src/version.ts`의 버전과 ADR을 함께, 서버(`apps/server/src/session.ts`)·기기(`apps/game/src/net/connection.ts`) 양쪽을 함께.
- 새 패키지를 만들면 `scripts/check-boundaries.mjs`의 `ALLOWED`, 그리고 `Dockerfile`의 package.json 복사 줄.
- 컨테이너 이름·경로를 바꾸면 `ops/compose.yml`, `ops/deploy.sh`, `ops/runner/compose.yml`, `.github/workflows/nas-facts.yml`, `ops/nas-setup.md`를 함께.
- 서버 포트(4100)를 바꾸면 `apps/server/src/config.ts`, `Dockerfile`, `ops/compose.yml`, `apps/game/vite.config.ts`를 함께.

## 건드리지 말 것
- `biome.json`의 Markdown 제외(지우면 보호 문서가 포맷돼 바뀐다).
- `pnpm-workspace.yaml`의 `minimumReleaseAge`, `allowBuilds`(공급망 보호).
- 보호 문서: `docs/DECISION_LOG.md`, `docs/research/`, `docs/design/`, 확정 ADR 본문.

## 확인한 것 (Verified, 2026-10-28)
- `pnpm check` 통과: 포맷·린트·타입 검사(패키지 4개)·모듈 경계·파일 크기·다국어·단위 테스트 18/18.
- `pnpm build` 성공. 빌드된 서버를 실행해 `/health`, 정적 파일, 화면 경로 대체(SPA), `/api` 404, WebSocket 핸드셰이크, SIGTERM 정상 종료를 확인.
- `pnpm deploy --prod` 결과물로 서버를 실행해 `/health` 응답 확인.
- `deploy.sh`: 가짜 docker 명령으로 4가지 흐름 확인(첫 배포, 정상 배포 + 백업, 앱 실패 → 직전 버전으로 되돌림, DB 준비 실패 → 중단).
- 이미지 태그 존재(Docker Hub API): `node:24.22.1-trixie-slim`, `postgres:18.6-trixie`, `myoung34/github-runner:2.338.2-ubuntu-noble`, `zricethezav/gitleaks:v8.30.1`.
- 실행기 이미지에 docker CLI와 compose 플러그인이 들어 있음(해당 저장소의 빌드 스크립트·설정 확인). 실행기 환경변수 이름은 그 저장소 README로 확인.
- gitleaks 기본 설정이 `pnpm-lock.yaml`을 검사에서 뺀다(v8.30.1 `config/gitleaks.toml`).

## 미검증·TODO·알려진 문제
- 미실행: Docker 이미지 빌드, gitleaks, NAS 배포. 이 환경에 Docker가 없어 CI 결과로 확인한다.
- 미실행: 휴대폰 HTTPS 접속, 백그라운드 복귀 후 연결 유지(역방향 프록시 설정 후 M0 통과 기준으로 확인).
- NAS에서 포트 4100이 비어 있는지 미확인 → `nas-facts` 결과로 확인.
- `deploy.sh`의 마이그레이션 단계는 자리만 있다. 서버는 아직 DB에 연결하지 않는다.
- 커밋 훅의 비밀값 검사는 흔한 형태만 잡는다(전체는 CI의 gitleaks).
- 기기 쪽에는 죽은 연결 감지(ping 응답 시간 초과)가 없다. 서버 하트비트(25초)와 브라우저의 끊김 이벤트에 의존한다 → 실기기 시험 때 필요하면 추가.
- git 훅이 처음에는 일부만 설치돼 있었다(`lefthook.yml`보다 설치가 먼저 실행됨). `pnpm exec lefthook install`로 다시 설치했다. 새로 받은 저장소는 `pnpm install` 때 자동 설치된다.
- 커밋의 `Co-Authored-By` 줄에 모델 이름을 쓰지 않는다(CLAUDE.md 규칙). 앞선 커밋 2개에는 남아 있다(이력은 고치지 않음).
- 조사 문서 `docs/research/2026-10-27-legacy-server-inventory.md`에 기존 프로젝트의 개발용 JWT 기본값 문자열이 남아 있다(비공개 저장소, 기존 저장소와 같은 노출 범위). 보호 문서라 고치지 않았다. 첫 작업 기록의 "민감 문자열 제거"는 이 한 곳이 빠진 상태였다. 교체는 PLAN 9.6대로 정식 서비스 직전.
- M0 남은 일: PWA(vite-plugin-pwa), 매일 백업 + 주 1회 복구 훈련, 서버 지표·기기 텔레메트리, 콘텐츠 검증(1·2·4단계), DB 마이그레이션(Drizzle), 인증(Better Auth), tRPC(Zod 4 연동 확인 포함 — stack-baseline ADR), git-cliff 설정, Dependabot 주간 업데이트 PR, 야간 CI.

## 사용자 결정 대기
- NAS 실행기 설치와 `NAS_DEPLOY_ENABLED` 켜기(`ops/nas-setup.md` 1~4단계).
- 외부 접속 주소(호스트 이름·포트)와 기존 DB 포트(5439·5440) 외부 포워딩 여부 — 역방향 프록시 설정 때.
