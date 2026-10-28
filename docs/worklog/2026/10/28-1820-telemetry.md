# 텔레메트리: 기기 오류·성능 요약 수집, 성능 오버레이, 서버 지표 로그

- 일시: 2026-10-28 18:20 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: PLAN 9.5(관측)·11장(M0 "성능 오버레이·텔레메트리", S1 측정 기준), ADR `2026-10-28-db-access-and-migrations.md`

## 한 일
- 공용 형식(`packages/protocol/src/telemetry.ts`): 기기 오류 보고, 성능 요약, 길이·크기 상한(본문 16KB), 경로 `POST /api/telemetry/errors`·`/perf`.
  - WebSocket 메시지가 아니라서 `PROTOCOL_VERSION`은 올리지 않았다(기존 메시지 의미 변경 없음).
- 서버
  - `src/telemetry.ts`: 형식 검사 → DB 기록. 응답은 받으면 204, 형식 오류 400, 크기 초과 413, 너무 잦으면 429, DB 문제 503.
  - `src/rateLimit.ts`: 토큰 버킷. 주소별로 오류는 분당 30건, 성능 요약은 분당 6건. 전체는 분당 600건.
  - 접속 프로그램 정보(User-Agent)는 기기가 보낸 값이 아니라 요청 머리글에서 읽는다. 접속 주소는 저장하지 않는다(속도 제한에만 메모리로 씀).
  - `src/metrics.ts`: 1분마다 로그 한 줄(`"metric":"server"`). 이벤트 루프 지연 p50·p99·최대, 메모리, WebSocket 접속 수를 남긴다.
  - 새 표 `client_perf_samples`와 두 번째 마이그레이션.
- 기기
  - `perf/frameMonitor.ts`: 프레임 시간을 잰다. 화면이 숨겨졌다 돌아오면 첫 간격을 버린다.
  - `perf/frameStats.ts`: fps, p50·p95·최대, 50ms 넘는 프레임 수를 계산한다(순수 함수, 시험).
  - `perf/device.ts`: 메모리(크롬 계열만)와 기기 정보를 읽는다.
  - `telemetry/reporter.ts`: 처리되지 않은 오류와 Promise 거부를 바로 보낸다. 같은 오류는 1번만, 화면당 최대 20건. 성능 요약은 1분마다와 화면을 숨길 때 보낸다(5초 미만 구간은 버림). sendBeacon을 쓰고, 안 되면 fetch(keepalive)로 보낸다.
  - 성능 오버레이: fps · 프레임 p95 · 메모리. `useFps.ts`를 `usePerfStats.ts`로 바꿨다(같은 측정기를 텔레메트리와 함께 씀).
  - 메시지 키 `frame_p95`, `memory`(ko·en). 개발 서버 프록시에 `/api` 추가.

## 확인 (Verified)
| 항목 | 결과 |
|---|---|
| 전체 검사(로컬 PostgreSQL 16 연결) | 시험 42개 통과, 다국어 키 12개 일치 |
| 서버 시험 | 정상 204, 형식 오류 400, 16KB 초과 413, 31번째 오류 보고 429, DB 기록(머리글의 User-Agent 포함) |
| 브라우저(Chromium, 390×844, 빌드한 앱 + 서버 + DB) | 오버레이 "화면 갱신: 59 fps · 프레임 p95: 17ms · 메모리: 10MB" |
| 〃 | 일부러 낸 오류·거부 → 2건 전송 → 204 → `client_errors` 2줄(스택 포함) |
| 〃 | 화면 숨김 → 성능 요약 전송 → 204 → `client_perf_samples` 1줄(8초, 480프레임, p95 16.7ms, 기기 정보) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/telemetry.ts`(+시험), `index.ts` | 기기·서버 공용 보고 형식 |
| `apps/server/src/telemetry.ts`, `rateLimit.ts`, `metrics.ts`(+시험), `testFixtures.ts`, `app.ts` | 수신, 속도 제한, 서버 지표 |
| `apps/server/src/db/schema.ts`, `drizzle/20261028091420_client_perf_samples/`, `db/db.test.ts` | 성능 요약 표 |
| `apps/game/src/perf/*`, `telemetry/reporter.ts`, `main.tsx`, `App.tsx` | 측정, 보고, 오버레이 |
| `apps/game/messages/{ko,en}.json`, `vite.config.ts` | 문구, 개발 프록시 |
| `docs/PLAN.md`(9.5), `ops/nas-setup.md`(9. 관측) | 구현 메모, 보는 법 |
| `docs/worklog/2026/10/28-1810-db-layer.md` | NAS 확인 결과 추가 |

## 함께 바꿔야 하는 파일
- 보고 형식(`packages/protocol/src/telemetry.ts`)을 바꾸면: 서버 표(`schema.ts`) + 마이그레이션, 기기 보고(`reporter.ts`).
- 속도 제한 값은 `apps/server/src/telemetry.ts`에만 있다. 기기의 보내는 주기(`reporter.ts`의 1분)를 줄이면 성능 요약 제한(분당 6건)도 본다.

## 건드리지 말 것
- 텔레메트리 경로를 tRPC로 옮기지 않는다. sendBeacon은 일반 POST만 보낸다.

## 미검증·TODO·알려진 문제
- NAS 미확인: 배포 후 두 번째 마이그레이션 적용, 실제 휴대폰에서의 보고. 휴대폰 확인은 M0 통과 기준 확인 때 함께 한다.
- 오래된 기록 정리(예: 30일)는 아직 없다. 사용자가 적어 급하지 않다. 사용자가 늘기 전에 넣는다.
- 메모리 값은 크롬 계열에서만 나온다(사파리·파이어폭스는 비표준 API가 없음).
- 서버 지표는 로그로만 남는다. 관리자 대시보드는 인증(Better Auth) 다음.
- `toSorted` 같은 ES2023 배열 함수는 기기 코드에서 쓰지 않았다(오래된 휴대폰 브라우저). 지원 브라우저 기준은 아직 정하지 않았다 → PWA 작업 때 함께 정한다.

## 사용자 결정 대기
- 없음
