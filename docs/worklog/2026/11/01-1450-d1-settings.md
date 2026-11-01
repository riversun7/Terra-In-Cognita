# D1 개발자 설정 칸 패널: 세계마다 바로 드는 덮어쓰기, 묶음 적용, 내보내기, 49 칸 목록

- 일시: 2026-11-01 14:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-dev-settings-panel.md`(제안), 질문 `docs/questions/2026-11-01-d1.md`(204~206 사용자 답 = 기획 D-461, 207 = D-462), PLAN 7장·11장·13장(47), 기획 D-5032·D-5054·D-335·D-329·D-410, 49 §0·§9 X11·§10. 가지 `work/d1-settings`(origin/main `5981da7`에서)

## 한 일
- 왜: 출시 순서 ADR의 D1(설정 칸 패널). 기획 설정 칸(49)은 팩 `tuning`(125칸)에 있지만 보려면 JSON을 읽고 바꾸려면 배포해야 했다. 개발자·관리자가 보고 바로 바꿔(N1 준비 조정 등) 그 값을 팩에 되돌릴 수 있어야 한다.
- 설계 먼저(ADR 제안) → 질문 200~203(뒤에 R5 질문과 겹쳐 204~207로 옮김) → 사용자 답(204~206)으로 설계를 고쳐 만들었다.
  - 204 "실제 운영시에도 똑같이 가능… 꼬이거나 하는 문제도 있는지 찾아야한다": 모든 세계에서 바로 든다. 꼬임 점검 표를 ADR에 적고 가드마다 시험을 붙였다(아래).
  - 205 "실시간 조정 가능": N1 관문에서도 바꾼다. 잠금 스위치(`TUNING_EDIT`)는 처음 만들었다가 뺐다. 바꿀 때마다 서버 기록 `tuning change`, 1분 지표 줄·`/health`에 `tuningRevision`.
  - 206 "충돌나서 오류생기면 안된다": 가장 나중에 바꾼 것이 이긴다(저장 때의 팩 값으로 판정). 켤 때 오류·막힘 없음.
  - 207(기획 D-462 다): 팩은 코드가 읽는 칸만, 패널에 "49 칸 중 N개 연결" 읽기 전용 목록.
- 팩 형식·규칙(`packages/content`·`packages/sim`·`@terra/shared/tuning`)
  - `tuning` 항목에 선택 칸 `unit`·`min`·`max`(1단계 검사가 범위를 본다, `formatVersion` 그대로). 서버가 읽는 칸 26개와 C2(49 X11 30분 상한)에 범위·단위를 넣고 팩 판 15. 단위가 없는 칸은 화면이 영어 이름 끝 괄호에서 읽는다.
  - `@terra/sim` `tuningProblems`: 여러 칸 규칙 11개(N9 합·칸 범위, K·N39·붐빔·민심 문턱·수명·피로 구간·단가·고용주 조정·포만감 순서, N36 칸·점수). 팩 값(= 시험 계수표)은 문제가 없다.
  - 내보내기 차이 `terra-tuning-diff`(`@terra/content` `tuningDiffSchema`·`overlayTuningDiff`·`applyTuningDiff`), `pnpm tuning:apply`(`scripts/apply-tuning-diff.mjs`: value만 바꾸고 팩 판을 올림), 시뮬레이터 `--tuning <차이.json>`.
- 서버(`apps/server/src/tuning/`)
  - 표 `tuning_overrides`(저장 때 팩 값·단위·팩 판·메모·사람)와 `tuning_revision`(세계 설정 판, 줄 하나). 마이그레이션 `20261101051122_tuning_overrides`(더하기만).
  - 접근자 `TuningState`: 스냅숏(판·실효 값·덮어쓰기) 하나를 대입 한 번으로 바꿔 끼운다. `plan`은 묶음을 바꾼 뒤의 전체 값으로 범위·규칙을 본다. `selectAtBoot`는 가장 나중에 바꾼 것을 고르고 빠진 칸·단위·범위·규칙이 맞지 않는 줄을 지울 목록으로 낸다(던지지 않음).
  - tRPC `tuning.list`·`history`·`export`·`save`(묶음, `expectedRevision`)·`revertAll`. 이름이 `apply`가 아닌 까닭: tRPC 라우터는 함수 속성 이름(`apply`)을 쓰지 못한다(Verified: `Reserved words used in router({}) call: apply`). 권한 `tuning: read·write`(dev·admin, 두 겹), 속도 제한, 쓰기 차례(한 프로세스 안), 감사 기록 `tuning.apply`·`revert_all`·`pack_won`·`dropped`. 오류 `data.details`(규칙 문제 코드)를 `reasonedError`에 더했다.
  - 서버가 실효 값을 쓸 때마다 읽는 곳: 사이보그 만들기 규칙(N9·N6·D-6041·N36), 정착 지원금(N39), 사이보그 화면 환생 조건·만렙·생활비(N7·N34·N38, `rosterCatalog.society`는 읽을 때마다 접근자), 세력 화면 문턱·공물·주기(S26·N35·S33·D-130·D-443). 표는 `scope.ts` 하나.
  - 켤 때(`onReady`, 월드 부팅보다 먼저) DB에서 싣고, 지울 줄은 한 트랜잭션으로 지운다(실패해도 시작은 막지 않음).
  - 사이보그 명령은 시작할 때 받은 값 한 벌만 쓴다(`grantFor`에 규칙을 넘김). `/start` 화면은 굴림·분배가 거절되면 만들기 자료(규칙)를 다시 받는다.
- 화면(`apps/game/src/editor/tuning/`, `/dev/tuning`, 틀 안·촘촘)
  - 요약 칩(팩 판·세계 설정 판·칸 수·바꾼 칸·서버 즉시), 찾기·무리·거르기(전체·바꾼 것·서버 즉시), 49 무리 차례 칸 줄(코드·이름·구조 값·범위 칩, ID·단위·범위, 지금·팩·차이·범위 막대, 바꾼 사람·시각·메모), 줄 안 값 칸 → [담기], 화면 아래 담은 변경 막대(메모·[적용]·[비우기]), 구조 값 확인 창, 판 충돌이면 목록을 다시 받고 담은 것은 남김, [내보내기] 창(JSON·파일·복사), [모두 되돌리기] 확인 창, 최근 바꿈, "49 칸 중 N개 연결".
  - 49 칸 목록 자료: `pnpm settings:cells`(`scripts/build-settings-cells.mjs`)가 49 문서 칸 표(278칸, X 충돌 기록 뺌)에서 `settingsCells.json`을 만든다. 49가 바뀌었는데 다시 만들지 않으면 `scripts/build-settings-cells.test.mjs`가 실패한다.
  - 조각 `TuningPanelScreen-*`는 미리 캐시에서 뺐다(`DEV_ONLY_CHUNK` `[Tt]uningPanel`, `DEV_ONLY_SOURCE` `editor/tuning/`, `globIgnores`). 메시지 키 `dev_tuning_*` 등 132개(ko·en).

### 꼬임 점검(사용자 답 204) — 찾은 것과 막은 것
| 점검 | 결과 | 시험 |
|---|---|---|
| 여러 칸을 함께 바꿈 | 반쯤 바뀐 묶음을 볼 길이 없게: 검사 한 번·트랜잭션 한 번·스냅숏 대입 한 번 | `state.test.ts` "install은 스냅숏을 한 번에", `tuning.db.test.ts` "묶음 적용" |
| 여러 칸 규칙 | 찾음: N9 합만 바꾸면 `rollStatSpread`가 던져 사이보그 굴리기가 모두 실패. 바꾼 뒤 전체 값으로 검사해 거절, 함께 보내면 받음. 되돌리기도 검사 | `tuningChecks.test.ts`, `state.test.ts`, `tuning.db.test.ts` "함께 바꿔야", `e2e/tuning.spec.ts` |
| 굴림 도중 다시 굴리기 횟수를 줄임 | 남은 횟수는 이미 0에서 자르고 있었다(Verified). 늘리면 다시 굴린다 | `cyborgTuning.db.test.ts` |
| 만들기 한 명령 안에서 값이 둘 | 지원금 계산이 접근자를 한 번 더 불렀다(기다림이 없어 실제로 섞이지는 않았지만 규칙을 명시). 명령마다 한 벌 | `cyborgTuning.db.test.ts` "한 벌" |
| 만들기 화면에서 본 규칙과 만들 때 값이 다름 | 찾음: 분배(N36)·굴림 상한이 바뀌면 화면이 옛 규칙으로 같은 거절을 되풀이할 수 있었다 → 거절 뒤 규칙을 다시 받음. 지원금은 처리 순간 값(문서) | (화면 코드, 화면 시험 없음 — TODO) |
| 정시 유지비 | 정산은 설정 칸을 읽지 않는다(sim 상수). 효율 표시는 조회 순간 | — |
| 워커·캐시 | 워커는 설정 칸을 읽지 않는다(Verified: 진입 파일 가져오기). 계수표 캐시는 스냅숏마다 | `state.test.ts` |
| 다시 켜기·복구 | 메모리는 커밋 뒤에만 바뀐다. 켤 때 DB에서 다시 싣고 판을 이어 쓴다 | `tuning.db.test.ts` "다시 켜면" |
| 두 관리자 동시 편집 | 세계 설정 판 조건부 올림, 늦은 쪽 CONFLICT·아무것도 안 바뀜 | `tuning.db.test.ts` "두 관리자" |
| 범위 밖·틀린 값 | 입력 형식 → 칸 범위 → 규칙, 모두 400. 켤 때는 지우고 기록 | `tuning.db.test.ts` "받지 않음", "다시 켜면" |
| 새 팩에서 칸이 빠짐·단위가 바뀜 | 지우고 `tuning.dropped`, 시작을 막지 않음 | `state.test.ts`, `tuning.db.test.ts` |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-11-01-dev-settings-panel.md` | 설계(선택지·결정·사용자 결정·꼬임 점검·D-462) |
| `docs/questions/2026-11-01-d1.md` | 질문 204~207과 답(D-461·D-462) |
| `docs/PLAN.md`, `AGENTS.md` | 7장 설정값 형식 정함, 11장 D1, 13장 ADR 47, 명령 `pnpm tuning:apply`·`pnpm settings:cells` |
| `packages/shared/src/tuning.ts`, `packages/shared/package.json` | 단위·무리·범위 칩·까닭·문제 코드·화면 자료 모양(`@terra/shared/tuning`) |
| `packages/content/src/schema/tuning.ts`, `tuningDiff.ts`(+시험), `index.ts` | 단위·범위 칸과 검사, 내보내기 차이 형식·적용 |
| `content/core/tuning.json`·`manifest.json` | 서버가 읽는 칸·C2에 단위·범위, 팩 판 15 |
| `packages/sim/src/tuningChecks.ts`(+시험), `index.ts`, `cli/common.ts`·`cli/sim.ts` | 여러 칸 규칙 검사, 시뮬레이터 `--tuning` |
| `scripts/apply-tuning-diff.mjs`(+시험), `scripts/build-settings-cells.mjs`(+시험), `package.json` | 팩에 넣기, 49 칸 목록 만들기 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261101051122_tuning_overrides/` | `tuning_overrides`·`tuning_revision` |
| `apps/server/src/tuning/{state,store,services,scope}.ts`(+`state.test.ts`·`tuning.db.test.ts`) | 접근자·DB·tRPC 처리·반영 범위 |
| `apps/server/src/trpc/{tuning,router,context,createContext,init}.ts` | 라우터·맥락, 오류 `data.details` |
| `apps/server/src/auth/permissions.ts`(+시험) | 권한 문장 `tuning` |
| `apps/server/src/{app,main}.ts`, `world/combatCatalog.ts`, `roster/catalog.ts`, `factionScreen/overview.ts` | 접근자 연결, 켤 때 싣기, 지표·`/health`, 읽는 곳이 쓸 때마다 읽게 |
| `apps/server/src/cyborg/service.ts`(+`cyborgTuning.db.test.ts`) | 명령마다 값 한 벌 |
| `apps/game/src/editor/tuning/*`, `editor/DevHome.tsx`·`devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `packages/shared/src/routes.ts`(+시험), `apps/game/messages/{ko,en}.json` | 화면·주소·도구 줄·문구 |
| `apps/game/src/start/StartScreen.tsx` | 굴림·분배 거절 뒤 규칙 다시 받기 |
| `scripts/pwa-build.mjs`(+시험), `apps/game/vite.config.ts` | 패널 조각을 미리 캐시에서 뺌 |
| `e2e/tuning.spec.ts`, `e2e/dev.spec.ts` | 패널 화면 시험, 도구 다섯 줄 |

## 함께 바꿔야 하는 파일
- 서버에서 설정 칸을 새로 읽으면: `apps/server/src/tuning/scope.ts` `SERVER_LIVE_PATHS`에 경로, 팩 항목에 `unit`·`min`·`max`, 명령은 시작할 때 `rules()`를 한 번만 부른다(ADR 7절).
- 여러 칸이 함께 맞아야 하는 규칙을 더하면 `packages/sim/src/tuningChecks.ts`와 `@terra/shared/tuning` `TUNING_PROBLEMS`, 화면 문구 `dev_tuning_problem_*`(ko·en)를 함께.
- 49 미러를 동기화하면 `pnpm settings:cells`.
- R5가 팩에 칸을 더하면 목록은 저절로 보인다. 범위·단위는 팩 항목에 적는다.

## 건드리지 말 것
- 마이그레이션 `20261101051122_tuning_overrides`는 이 가지에서 한 번 다시 만들었다(올리기 전, 첫 판 `20261101045111`은 지웠다). 올라간 뒤에는 고치지 않는다.
- 설정 칸을 읽는 곳에서 계수표를 켤 때 한 번 받아 두지 않는다(받아 두면 덮어쓰기가 안 든다).
- `settingsCells.json`은 손으로 고치지 않는다.

## 미검증·TODO·알려진 문제
- 서버 전투는 팩 값을 아직 읽지 않는다(시험 계수표). 전투 시작 자료에 계수를 넣은 뒤 "전투를 시작할 때 고정"으로 연다.
- `/start`의 "거절 뒤 규칙 다시 받기"는 화면 시험이 없다(서버 쪽 가드는 DB 시험).
- 49 칸 목록 이름은 49의 한국어 이름이다(영어 화면에도 한국어, 49에 영어가 없음).
- 검사 결과는 아래에 적는다.

## 사용자 결정 대기
- 없음(204~207 모두 답).
