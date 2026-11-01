# 개발자 밸런스 화면(/dev/balance), 가중치 칸 바로 바꾸기(D1 덮어쓰기), 전투 틱 편 쏠림 고침(SIM_VERSION 4)

- 일시: 2026-11-01 17:50 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 요구 D-458(48 §3.2 "어느 1차 스탯도 가치 없어지지 않게 하고, 개발자 페이지 밸런스 화면에서 1차 스탯별 기여도를 시험·조정"), D-461(바로 듦·관문 중 조정·가장 나중에 바꾼 것이 이김). ADR `docs/adr/2026-11-01-balance-screen.md`(새, 제안), `docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-01, 밸런스 화면 — 틱 안 행동 차례, SIM_VERSION 4)"(뒤에 더함), `docs/adr/2026-11-01-dev-settings-panel.md`(D1, 넓힘). 질문 227~229 `docs/questions/2026-11-01-balance.md`. 가지 `work/balance`(main `380ff2a`에서, 도중에 main `f89f723` D-465·core@18 합침)

## 한 일
- PDCA: ADR을 먼저 쓰고(선택지·꼬임 점검 표) 코드를 썼다. 서버·sim 로직은 시험 먼저(tdd).
- 편 쏠림 진단(diagnosing-bugs, 저장소 밖 짧은 스크립트 — 시드 고정): 같은 유닛 6 대 6(1차 40·시험 칼, 지도 32, 300판) 편 1 : 편 2 = 93 : 207. 편 2 유닛 ID를 작게 바꾸면 결과가 정확히 뒤집히고(3 대 3, 30판 10:20 → 20:10), 거리 9로 세우면 방향이 바뀌고(18:12), 좌우 자리를 맞바꿔도 같았다 → 자리·방향이 아니라 **틱 안 ID 차례**. 걸음·피해가 곧바로 상태에 들어, 거리가 짝수면 앞 차례가 걸어 맞닿은 그 틱에 뒤 차례가 바로 치고, 홀수면 다음 틱에 ID가 작은 쪽이 먼저 친다. 같은 유닛끼리도 ID·거리 홀짝이 선공·막타를 정했다 → 판정 버그로 보고 고쳤다.
  - 시험(빨강 → 초록): "한 방에 쓰러지는 같은 1 대 1"을 거리 8·9에서 시드 40개 — 고치기 전 0/40·40/40, 고친 뒤 10~30 안. 행동 차례 순열이 고른지, 스냅숏 재생이 바이트까지 같은지.
  - 고침: 틱마다 행동 차례를 (시드, 틱)에서 만든 흐름으로 섞는다(`battle.ts` `actionOrder`, 공격 굴림과 다른 흐름, 상태에 들지 않음). 고친 뒤 같은 6 대 6 300판 147 : 153(좌우 바꿈 146 : 154). SIM_VERSION 3 → 4(서버 `config.ts`는 sim 값을 그대로 씀).
  - 화면은 그래도 두 편 차례(기준 + 10이 편 1·편 2)를 반씩 돌려 합친다(수비 쪽이 시간 초과를 이기는 규칙 같은 남은 비대칭).
- `runStatDuels` 선택 `mapSize`·`limitMs`(기본 64·계수표 그대로), 보고에 `aTimeoutLeads`·`bTimeoutLeads`(시간 초과에서 남은 몫이 큰 편)·`shareLeadPmSum`(끝났을 때 남은 몫 차의 합).
- 가중치 칸 덮어쓰기 = D1 덮어쓰기의 한 종류(키 `<행 ID>.<칸>`, 칸 = 1차 6·`base`·`cap`·`half`): 같은 표 `tuning_overrides`·같은 판·같은 감사 기록·같은 `tuning.save`/`revertAll`. 마이그레이션 `20261101075739_tuning_stat_cells`(칸 ID 검사를 넓히기만, 직전 판 앱은 이 줄을 팩에 없는 칸으로 지운다). 단위·범위 = 팩 스키마·sim 입력 범위(`@terra/shared/tuning` `STAT_CELL_*`). 여러 칸 규칙에 `stat_primary_unused`(모든 행에서 가중치가 0인 1차) — 새로 생기면 묶음 거절, 켤 때는 지움.
  - 서버 접근자 `TuningState`: `statCell`·`slot`·`statTable()`(스냅숏마다 한 번, 얼린 배열)·`statTableWith`(미리 보기)·`statOverrideCount`. `plan`·`selectAtBoot`·`install`이 설정 칸과 가중치 칸을 같이 본다(팩 이김·빠짐·모양 바뀜·단위·범위·규칙).
  - 서버 읽는 곳: 유닛·사이보그 화면(`rosterCatalogOf`의 `combat`이 접근자 속성, 표가 같으면 같은 묶음). `main.ts`가 `statRowsOf`로 팩 행을 넘긴다.
  - 내보내기 차이에 `statRows`(있을 때만), `pnpm tuning:apply`가 `stat_rows.json`에도 넣고 판은 한 번, 시뮬레이터 `--tuning`도 스탯 표에 얹는다(`@terra/content` `applyStatRowsDiff`·`overlayStatRowsDiff`). `/dev/tuning` 머리에 "가중치 표 바뀐 칸 N · 밸런스" 고리, [모두 되돌리기] 확인 창 칸 수에 가중치 칸 포함.
- tRPC `balance.table`·`contribution`·`duels`(조회, D1 권한 `tuning:read` 두 겹·조회 속도 제한). 기여는 주 스레드, 대결은 요청마다 워커(`balance/duelWorker.ts` → `dist/balanceWorker.js`, 제한 120초), 사용자마다 대결 속도 제한(순간 2·분당 4)·서버 전체 한 번에 하나(`busy`). 담은 변경은 `tuning.save`가 받을지 미리 검사해 함께 돌려준다.
- 화면 `/dev/balance`(주소 줄 `dev_balance`, 개발자 홈 도구 줄, 촘촘): 기준 유닛(1차 6·무기(맨손 + 팩 무기, D-465 두 칸이면 두 칸 다 보임)·인원·판 수·제한), 가중치 표(칸 입력, 담음·세계 값 표시, 칸마다 되돌리기, 모두 비우기, 표 안에서만 가로 스크롤·첫 열 고정), 1차 +10 기여(지금 → 고침, 가치 없는 1차 칩), 승률(지금·고침 막대 50% 눈금, 승·패·시간 초과 앞섬·뒤짐, 남은 몫 차 %p, 약한 1차 칩), 담은 변경 막대(받지 않을 묶음 미리 알림·메모·[적용]). 미리 캐시 밖(`DEV_ONLY_CHUNK` `[Bb]alancePanel`, `DEV_ONLY_SOURCE` `src/editor/balance/`, `globIgnores`).
- 화면을 찍어 보며 고친 것: 되돌리기 버튼을 입력 아래로(열마다 입력 자리가 같게), 새 유닛 +10은 어느 1차든 승률 100%라 "남은 몫 차"(판 평균 %p)를 더함, 영어 복수형 문구(`Staged: {count}`), 기본·반감 입력 폭(±10,000,000), 팩과 다른 칸의 읽는 이름에 팩 값.
- 검토 스킬: `web-design-guidelines`(입력 이름·inputmode·aria-invalid·초점 표시·tabular-nums·스크롤 영역 키보드·Intl 숫자 — 위 마지막 항목만 고침), `break-ui`(긴 ko·en 이름은 행 이름 칸에서 줄바꿈, 1차 10,000·가중치 100,000·반감 10,000,000은 e2e로 넘침 없음, 빈 상태(승률 안 돌림·기여 불러오는 중), 단수 문구).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/battle.ts`·`battle.test.ts` | 틱 안 행동 차례 섞기(`actionOrder`), 쏠림 시험 |
| `packages/sim/src/version.ts` | SIM_VERSION 4 |
| `packages/sim/src/combat/duels.ts`·`duels.test.ts` | `mapSize`·`limitMs`, 시간 초과 앞섬·남은 몫 차 |
| `packages/sim/src/tuningChecks.ts`·`tuningChecks.test.ts`·`index.ts` | `statTableProblems`(가치 없는 1차) |
| `packages/sim/cli/common.ts`·`sim.ts` | `--tuning` 차이의 가중치 칸을 스탯 표에 얹음 |
| `packages/shared/src/tuning.ts` | 가중치 칸 키·칸 이름·단위·범위, 문제 코드, 목록 `statOverrides`, 차이 `statRows` |
| `packages/shared/src/balance.ts`·`package.json` | 밸런스 화면 자료 모양·상한·승률 셈(새 `@terra/shared/balance`) |
| `packages/content/src/tuningDiff.ts`·`tuningDiff.test.ts`·`index.ts` | 차이 `statRows` 형식, `applyStatRowsDiff`·`overlayStatRowsDiff`·`statRowCell`·`withStatRowCell` |
| `scripts/apply-tuning-diff.mjs`·`.test.mjs` | `pnpm tuning:apply`가 `stat_rows.json`에도 |
| `apps/server/src/tuning/state.ts`·`state.test.ts` | 가중치 칸 덮어쓰기(접근자·검사·켤 때 고르기) |
| `apps/server/src/tuning/services.ts`·`trpc/tuning.ts` | 저장 때 팩 값·단위를 칸 종류에 맞게, 목록 칸 수, 내보내기 `statRows`, 칸 키 입력 |
| `apps/server/src/db/schema.ts`·`drizzle/20261101075739_tuning_stat_cells/` | 칸 ID 검사 넓힘(추가만) |
| `apps/server/src/balance/compute.ts`·`runner.ts`·`duelWorker.ts`·`services.ts`·`balance.test.ts`·`balance.db.test.ts` | 기여·대결 계산, 워커, 서비스, 시험(꼬임 가드 포함) |
| `apps/server/src/trpc/balance.ts`·`router.ts`·`context.ts`·`createContext.ts`·`app.ts`·`main.ts`·`vite.config.ts` | `balance.*` 라우터·연결·워커 빌드 입력 |
| `apps/server/src/roster/catalog.ts`·`world/combatCatalog.ts` | 화면 자료가 실효 가중치 표를 읽음, `statRowsOf` |
| `packages/shared/src/routes.ts`·`apps/game/src/shell/routeViews.tsx`·`sections/ComingSoon.tsx`·`editor/DevHome.tsx`·`editor/devIcons.tsx` | 주소 줄·조각·개발자 홈 도구 줄(저울 아이콘) |
| `apps/game/src/editor/balance/*` | 화면·표·결과·문구 표·순수 코드·CSS·시험 |
| `apps/game/src/editor/tuning/TuningPanelScreen.tsx`·`tuningMessages.ts` | 가중치 칸 수 고리, 새 문제 문구 |
| `apps/game/messages/ko.json`·`en.json` | 밸런스 화면 문구(ko·en 함께) |
| `scripts/pwa-build.mjs`·`.test.mjs`·`apps/game/vite.config.ts` | 미리 캐시 밖 |
| `e2e/balance.spec.ts` | 화면 시험(기능·권한·배치·큰 숫자) |
| `docs/adr/2026-11-01-balance-screen.md`·`2026-10-31-combat-core.md`·`docs/PLAN.md`·`AGENTS.md`·`docs/questions/2026-11-01-balance.md` | 결정·바뀜·요약·명령 설명·질문 227~229 |

## 꼬임 가드와 시험
| 가드 | 시험 |
|---|---|
| 묶음은 한 번에(표 스냅숏 바꿔 끼우기, 얼린 배열) | `state.test.ts` "install은 표를 한 번에" |
| 가치 없는 1차 거절·켤 때 지움 | `state.test.ts` plan·selectAtBoot, `balance.db.test.ts`, `tuningChecks.test.ts` |
| 범위 밖·모양에 없는 칸·없는 행 | `state.test.ts` plan, `balance.db.test.ts` |
| 지금 HP 등 > 새 최대(전투 밖 저장값 없음 Verified, 전투 안은 사양 고정·현재 ≤ 최대) | `balance.test.ts` "진행 중인 전투" |
| 진행 중인 전투(표를 바꿔도 복구 계산이 같음) | `balance.test.ts` "진행 중인 전투" |
| 캐시(화면 자료 다음 읽기부터 새 표) | `balance.test.ts` "캐시" |
| 워커(요청 때 표를 일에 담음, 워커 = 같은 스레드 결과, 제한 시간) | `balance.test.ts` "요청 때 표"·"대결 워커" |
| 다시 켜기·새 팩(팩 이김·빠짐·단위·범위·규칙) | `state.test.ts` selectAtBoot, `balance.db.test.ts` "다시 켜면" |
| 무거운 대결(사용자 제한·한 번에 하나) | `balance.test.ts` "duels 거절"·"서버 전체 한 번에 하나" |

## 확인 (Verified, 개발 컨테이너 Xeon 2.1GHz 4 vCPU 공유, Node 24.22.1)
- war16 30일 시드 1, 같은 명령 두 번 바이트 같음, 위반 0(`pnpm --filter @terra/sim sim war16 --seed 1 --days 30`):

| 지표 | 고치기 전(SIM 3) | 고친 뒤(SIM 4) |
|---|---|---|
| 전투(공성·조우) | 123(0·123) | 123(0·123) |
| 공격 쪽 승 | 59(48.0%) | 55(44.7%) |
| 시간 초과 | 2 | 0 |
| 쓰러짐(전투당) | 437(3.55) | 428(3.48) |
| 평균 전투 시간 | 116.4초 | 107.4초 |
| 줄 해시(core@17 / core@18) | `08191406` / `d97256b4` | `1a0d9fef` / `0138f0c1` |

  - core@18(D-465 합친 뒤)에서 다시 돌려도 지표는 같고 줄 해시만 팩 해시만큼 다르다(D-465는 SIM 3 그대로, 한 칸 무기 셈이 같아서).
- 대결 요청 하나(빌드한 워커 띄우기 포함 / 같은 스레드): 기본(1차 10·맨손·1명·10판·120초) 표 1벌 5.1초 / 4.5초, 표 2벌 7.3초 / 8.0초, 1차 40·시험 칼 표 2벌 6.8초, 상한(판 수 × 제한 = 2,400초, 표 2벌) 1명 20판 14.5초·3명 20판 16.4초·3명 8판 300초 17.2초. 고치기 전 대결 한 판: 지도 64 틱당 약 215µs, 지도 32 약 55µs(흐름장·점유 배열이 칸 수에 비례) → 지도 32를 쓴다. 주 스레드는 기다리기만 한다.
- 첫 화면 JS(`pnpm check:bundle`): 104,250 B / 상한 131,416 B(밸런스 화면은 지연 조각 `BalancePanelScreen-*.js` 9.3 kB gzip·`.css` 1.8 kB, 미리 캐시 밖 — `sw.js`에 없음, `node scripts/check-pwa.mjs` 통과).
- 화면 시험 `e2e/balance.spec.ts` 13개 통과(기능 2·권한 1·배치 8(390·1440 × 파스텔·다크 × ko·en)·큰 숫자 2), 사진은 저장소 밖 `E2E_SHOTS_DIR`.
- 전체 화면 시험(`pnpm e2e`)·`pnpm check`: 아래 "최종 검사".

## 함께 바꿔야 하는 파일
- 가중치 칸 범위를 바꾸면 `packages/shared/src/tuning.ts` `STAT_CELL_LIMITS`·팩 스키마 `packages/content/src/schema/stats.ts`·sim `MAX_WEIGHT_PM`·`MAX_STAT_INPUT`과 DB 검사(칸 이름)를 같이.
- 칸 이름(`STAT_CELL_FIELDS`)을 바꾸면 `tuning_overrides_id_format` 검사(마이그레이션)·`trpc/tuning.ts`·`trpc/balance.ts` 입력 정규식을 같이.
- 차이를 팩에 넣어 `stat_rows.json`이 바뀌면 `TEST_STAT_TABLE`(sim)도 같이(서버 시험이 팩 표 = 시험 표를 본다).

## 건드리지 말 것
- `actionOrder`의 흐름(시드 섞는 상수)을 바꾸면 같은 입력의 전투 결과가 바뀐다 → SIM_VERSION.
- 직전 판 앱과의 호환: 마이그레이션은 검사를 넓히기만 했다. 올라간 마이그레이션은 고치지 않는다.

## 미검증·TODO·알려진 문제
- NAS에서 대결 비용을 재지 않았다(Unknown). 상한 17초(이 컨테이너)가 NAS에서 두세 배면 워커 제한 120초 안이지만 코어 하나를 그동안 쓴다.
- 새 유닛(1차 10)은 지금 [임시] 수치에서 10분 안에 거의 승부가 나지 않는다(스태미나·피해). 그래서 판정승·남은 몫 차를 쓴다(질문 229). 기준 유닛 기본값은 질문 228.
- 세계에서 전투를 여는 곳(R5)이 생기면 사양을 그 명령 순간 `TuningState.statTable()`로 만든다(ADR 꼬임 점검). 지금 서버 전투는 시험만 연다.
- 담은 칸은 화면을 떠나면 사라진다(D1 패널과 같음, 떠날 때 경고 없음).
- 대결 판 수가 적어(기본 10판) 승률이 흔들린다(±15%p쯤). 남은 몫 차가 덜 흔들린다.

## 최종 검사
- 전체 화면 시험 `TEST_DATABASE_URL=… pnpm e2e`(228개): 214 통과·13 실패·1 건너뜀(측정 시험, `E2E_MEASURE` 없음), 25.2분. 실패 13개는 모두 이 작업 탓이었다 — `dev.spec.ts` 도구 줄 수(5 → 6, 밸런스 줄), `tuning.spec.ts` 배치 12개(머리의 "가중치 표 바뀐 칸 · 밸런스" 고리가 16px 높이라 작은 누르는 곳). 시험 수를 고치고 고리를 44px로 만든 뒤 `dev.spec.ts`·`tuning.spec.ts`를 다시 돌려 28/28 통과. `balance.spec.ts` 13/13 통과(전체 실행 안).
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 처음 실행에서 `routes.test.ts`(주소 표 줄 목록에 `dev_balance` 없음) 1개 실패 → 고친 뒤 통과(포맷·린트·타입·경계·크기·다국어 2,110키·디자인 값·콘텐츠 core@18, 시험 파일 324·시험 2,790, DB 시험 포함).
- `pnpm check:bundle`: 첫 화면 JS 104,250 B / 상한 131,416 B.

## 사용자 결정 대기
- 질문 227(가치 없는 1차의 기준·어디까지 막나), 228(기준 유닛 기본값), 229(시간 초과 판정). 모두 기술 추천 가를 코드에 넣었다.
