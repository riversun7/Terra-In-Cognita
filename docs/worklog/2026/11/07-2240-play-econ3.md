# 경제 마무리 — 기획 답 540·546·552~555·564 (플레이 흐름 WP10)

- 일시: 2026-11-07 22:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP10 경제 마무리", `docs/adr/2026-11-07-ruins-restoration.md` "바뀜 (기획 답 540)", 기획 D-518 포인터(기획 커밋 `451b5a7`), 질문 `docs/questions/2026-11-07-ruins.md`(540·546)·`2026-11-07-play-nations.md`(552~555, 새 600~601)·`2026-11-07-play-economy.md`(564), 가지 `work/play-econ3`(main `10b7055`에서)

## 한 일
- 540 나: 폐허가 된 도시 창고의 NPC 세력 물건도 유저와 같은 규칙으로 주인 세력의 가장 가까운 다른 도시 창고로 옮기고, 다른 도시가 없을 때만 소각한다. 규칙 함수를 시뮬 `simulator/ruinedGoods.ts`(`ruinedGoodsHome`·`nearestOtherCity`·`rehomeRuinedGoods`) 하나로 모았다. 시뮬 거리 = 정원사 합성 격자, 서버 거리 = 같은 2차맵 칸(`placeDistance`). econ16 시드 1~3 180일을 기준·540만·이 줄기(+ 시드 1은 "가장 오래된 도시" 판)로 재서 폐허 ADR에 적었다.
- 546 가: 폐허 조회 사업 칸에 `currencyCode`·`balance`(내 그 화폐 잔고), 폐허 카드에 "모금 화폐 · 내 잔고" 줄과 모자라면 [환전하러 가기](`/economy/exchange`).
- 552 다: 도시 이름을 다 쓰면 "<이름> 2"로 다시 돈다(쓴 이름 = 행성의 모든 도시·폐허). 폐허 줄에 이름(`world_ruins.name`, 마이그레이션 `20261107131255_ruin_city_names`)을 남기고, 복원하면 같은 ID 도시 줄의 이름만 고친다(쓰기 대기열 `cityNames` 몫). 폐허 카드 제목에 이름.
- 553 나: 건물이 그 시설의 특산 레시피를 특산 차례로 받는다(`@terra/sim planCityFacilities`, 서버 `syncCity`가 부름).
- 554 다: 팩 국가 프리셋 성격 칸 `startNecessityHours` + `startStock`(특산 고정 양만), `@terra/sim cityStartStock`. 팩 core@50(농업 72시간 + 곡물 60, 공업 48시간 + 철 주괴 20, 목재 48시간 + 소나무 원목 30).
- 555 나: 매입 호가가 같은 판단의 수입 주문(바로 체결 + 걸어 둔 양)을 모자란 양에서 뺀다(`importGoods`가 산 묶음 수를 돌려줌).
- 564 다: 환전 회차 = 회차 길이의 정시(`nextFxRoundAt`) — 처음 예약·다음 예약·거래소 끔 건너뛰기·화면 다음 체결 시각.
- 판: `SIM_VERSION` 18, 팩 core@50, 프로토콜 그대로(15).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/ruinedGoods.ts`(새), `economy.ts`, `economyRun.ts`, `run.ts`, `serverEconomy.ts` | 540 규칙 한 벌·시뮬 격자 거리, 564 `nextFxRoundAt` |
| `packages/sim/src/simulator/npcTrade.ts` | 555 수입한 양 빼기 |
| `packages/sim/src/simulator/cityPlan.ts`(새) | 553·554 도시 계획 함수(서버만 부름) |
| `packages/sim/src/version.ts` | SIM 18 |
| `packages/sim/src/simulator/{societyRestore,npcTrade,cityPlan,economyRun}.test.ts` | 540·555·553·554·564 시험 |
| `apps/server/src/npc/ruinsRuntime.ts` | 서버 갈 곳 = 시뮬 규칙 + 2차맵 거리 |
| `apps/server/src/npc/economy.ts` | 553 `planCityFacilities`, 554 `cityStartStock`, 564 정시 |
| `apps/server/src/npc/nations.ts`, `presets.ts`, `nations.test.ts` | 552 번호 이름·쓴 이름 범위, 554 성격 칸 |
| `apps/server/src/npc/{persist,state,ruinsState,ruinsPersist,runtime}.ts`, `world/persist/tables.ts`, `db/ruinsSchema.ts`, `drizzle/20261107131255_ruin_city_names/` | 552 폐허 이름 저장·복원 |
| `apps/server/src/ruins/service.ts` | 546 사업 잔고·화폐 코드, 552 폐허 이름, 시험 폐허가 이름을 물려받지 않음 |
| `apps/server/src/ruins/ruins.db.test.ts`, `market/market.db.test.ts` | 540 NPC 물건·552 이름·553·554 DB 시험 |
| `packages/shared/src/ruins.ts` | `RuinView.name`, 사업 `currencyCode`·`balance` |
| `packages/content/src/schema/economy.ts`, `content/core/nation_presets.json`, `content/core/manifest.json` | 554 칸, 팩 core@50 |
| `apps/game/src/economy/RuinsPanel.tsx`, `apps/game/messages/{ko,en}.json` | 546 모금 화폐 줄·[환전하러 가기], 552 카드 제목(문구 3개 ko·en) |
| `e2e/ruins.spec.ts` | 546 링크 확인·사진 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/adr/2026-11-07-ruins-restoration.md`, `docs/PLAN.md`, 질문 문서 셋 | 기록 |

## 함께 바꿔야 하는 파일
- 폐허가 된 도시 창고 규칙을 바꾸면 시뮬 `ruinedGoods.ts`만 고친다(서버는 거리·유저 나라만 준다).
- 도시 줄 쓰기(`tables.ts` `cities`)에 이름 칸을 넣지 않는다 — 이름은 켤 때(`nameNationCities`)와 복원 때(`cityNames`)만 쓴다.
- 팩 성격 칸을 바꾸면 `packages/content` 스키마·`apps/server/src/npc/presets.ts`·`nations.ts NationPersonality`를 함께.

## 건드리지 말 것
- 올라간 마이그레이션(앞 셋 갈래 포함)은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 553: 건물이 받지 못한 같은 시설 특산은 돌리지 않는다(목재국 벌목장 건물 하나 = 원목만) — 질문 600.
- 552: 반란·독립 세력이 실행 중에 세운 마을은 이름이 붙지 않는다 — 질문 601.
- 540 잰 값에서 폐허 2 줄기의 큰 하락이 나오지 않은 까닭(나라 성격의 매입 호가로 봄)은 가르지 않았다(Assumed). 수치 맞추기는 밸런싱 단계(D-515).
- 실제 서버 실행(빌드한 서버·NAS)에서 폐허 이름·정시 환전은 미실행.

## 검사
- 작업 중: `@terra/sim` 시험 87파일 686개 통과, 서버 `src/npc`·`src/ruins`·`src/market`·`src/world/persist` 10파일 38개(DB 포함) 통과. 처음 DB 시험은 공유 기계의 디스크 쓰기 막힘(다른 작업의 `git prune` — PostgreSQL 체크포인트 fsync가 몇 분 멈춤)으로 시험 DB 만들기가 10초를 넘겨 실패했고, 막힘이 풀린 뒤 같은 시험이 모두 통과했다(코드는 바꾸지 않음).
- 끝에 한 번: `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어·대비·콘텐츠, 시험 468파일 3,743개), `pnpm check:docs origin/main` 통과, 화면 시험 `pnpm e2e e2e/ruins.spec.ts` 4개 통과(첫 실행이라 빌드·행성 굽기 포함 59초).
- 사진(E2E_SHOTS_DIR, 저장소 밖): 폐허 칸 390 파스텔 한국어·390 다크 영어·1440 둘, [환전하러 가기] 카드 `ruins-short-*` 넷 — 넘침 없음(`horizontalOverflow` 빈 목록).
- econ16 잰 값(시드 1~3, 기준·540만·이 줄기, 시드 1은 "가장 오래된 도시" 판도): 폐허 ADR "바뀜 (기획 답 540)" 표. 불변 조건 위반 0.
- 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(지시 — 화면 시험 전역 준비가 빌드는 했다).

## 사용자 결정 대기
- 없음.
