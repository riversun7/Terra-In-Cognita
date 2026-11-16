# 2026-11-16 묶음 1116n 합치기 (고침 1116l · 거래소 3 · 배 5 · 기획 미러 D-574·D-575 · 흔들리는 시험 고침) — 리셋 필요 없음

- 일시: 2026-11-16 19:15 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-1748-fixes-1116l`·`16-1745-exchange-3`·`16-1730-boats-5`, 기획 D-338·D-213·D-555 1509·D-569·D-570 1908·D-558 1547(고침 1116l), D-571 1943·1944·D-564 1682(거래소 3), D-555 1505·1514·D-559 1523·D-570 1830(배 5), ADR "바뀜" 절(`2026-11-11-faction-identity.md`·`2026-11-07-ranking.md`·`2026-11-15-unloaded-second-maps.md`·`2026-11-16-exchange-buildings.md`·`2026-11-15-shipyard-harbor.md`), 질문 2221~2224(`docs/questions/2026-11-16-fixes-1116l.md`)·2201~2207(`2026-11-16-exchange-3.md`)·2211~2215(`2026-11-16-boats-5.md`)

## 한 일
- main 8ca0fbc(묶음 1116m) 위에 가지 다섯을 차례로 `--no-ff`로 합쳤다.
  1. `work/fixes-1116l`(3aa98f6, 바탕 72990f9): 가문 금고(원장 시스템 계정 `vault:house:…`, `factionIdentity/houseVault.ts`, 불변 조건 I2), 독재 가문 나라 도시 남은 이익 국고 몫 → 가문 금고(@terra/sim `payCityProfit` 선택 칸 `rulingAccount`·`SimHooks.rulingVaultOf`, 서버 `npc/economy.ts`), NPC 가문 점수 = 가문원 실제 점수 합(표 `ranking_unit_scores`, `ranking/unitScores.ts`·`houseBoard.ts`), 정리 뒤 원래 목표로(`travel/afterEncounter.ts` `afterUnloadGoal`, `GatherService.enter`의 `then`), 조우 전투 파티 크기 1.
  2. `work/exchange-3`(a0c7247, 바탕 54a9482): 유닛마다 개인 창고(표 `exchange_unit_lockers`, `market/lockers.ts`), 남의 거래소 거래 직무 = 노동 계약(`labor/workerEntry.ts`, `rentOf`), 거래 직무 유닛이 반입·반출을 먼저·빨리 나름, 환전 이용료(`fx_fee`, `FxFeeService.tsx`), 거래창 `ExchangeDesk.tsx`.
  3. `work/boats-5`(c76fca5, 바탕 54a9482): 정박 = 시간을 산 교역 부두·집 정박장(`boats/port.ts`, 조선소 빼기), 배 내리기·싣기는 운반꾼이 실제로(`boats/cargo.ts`, `gather/station.ts` `carry`·`inbound`, `porter.ts` `redirect`), 배에 탄 유닛은 운반꾼에서 뺌, 결과 코드 `no_carrier`.
  4. `work/mirror-d574`(7daf9bf, 바탕 8ca0fbc, 문서만): 기획 미러 9ed9276(D-574)·8314bbd·0acaa1b(D-575) 동기화 — `docs/design/` 미러, `docs/design/README.md` 원본 커밋·시각, `docs/PLAN.md` §14 머리 문장, `docs/worklog/2026/10/31-0910-design-mirror-aadab42.md`. 충돌 없이 합쳐졌다. 49 설정 칸 미러는 바뀌지 않았다(`pnpm settings:cells --check` 최신).
  5. `work/flaky-upgrade`(7a0f29c, 바탕 8ca0fbc): `npc/cityBuildUpgrade.db.test.ts`가 세계 시드(새 DB마다 무작위)에 기대는 성향 몫으로 상한이 0이 되던 것(시드 여섯에 하나꼴, 부하 무관 — main CI 359 첫 시도 실패 원인)을 시험 규칙 `buildCapTemper: 0`으로 고정(줄기 기록 `16-1925-flaky-upgrade`). 앱 코드·판 번호 바뀜 없음. WORKLOG 충돌만(받은 쪽 → `pnpm docs:index`).
- 최종 판:
  - 프로토콜 **52**(최소 **51**) — exchange-3의 56(최소 55)·boats-5의 58(최소 57)을 52 "합친 판" 하나로 묶었다(main의 50·51 설명은 그대로). 낮춰 보내는 판 상수: `UNIT_LOCKER_PROTOCOL_VERSION` 56 → 52(`unknown_unit` → 51판 연결에 `locker_max`), `BOAT_CARRY_PROTOCOL_VERSION` 58 → 52(`no_carrier` → 51판 연결에 `unavailable`). `BOAT_PRICE_PROTOCOL_VERSION`은 main 51 그대로. boats-5가 `legacyOrderCode`를 `legacyCarryCode`로 이어 둔 것은 그대로 둔다(게이트웨이가 52 → 51 → 49 … 차례로 낮춘다 — 51판 아래로 order_closed와 no_carrier가 함께 낮아진다). 시험: `packages/protocol/src/market.test.ts`·`boats.test.ts`가 52.
  - 팩 **core@120**(main 119 위, exchange-3의 126 → 120). 세 줄기 모두 `id-changes.json`을 건드리지 않았다(처음 오르는 줄 없음).
  - `SIM_VERSION` **60** 그대로 — fixes-1116l은 sim에 선택 칸·고리만(시뮬은 주지 않아 결과 같음), exchange-3은 sim 쪽 설정 칸 정의(서버만 읽음)만 바꿨다. 판정 시험·골든이 그대로 통과했다(아래 `pnpm check`). `world/legion3.test.ts`는 SIM 60·프로토콜 `≥ 49`·최소 = 지금 − 1 그대로 통과.
- 마이그레이션 둘(형제):
  - `20261116083949_ranking_unit_scores`(58f17376, `prevIds` = 1116l 끝 다섯 bd0d640e·7f14a324·98fc86ba·8315ae4c·43d61ca8) — 표 더하기.
  - `20261116082232_exchange_unit_lockers`(2d4ed532, `prevIds` = 98fc86ba·8315ae4c·43d61ca8·31deac81 — 바탕이 1116l 앞이라 `unit_tactics`·`city_policies_npc_houses`의 부모 31deac81을 가리킨다) — 표 더하기 + 손으로 넣은 옮기기 SQL(옛 주인마다 넓힌 칸 → 대표 유닛 창고, 멱등). 옛 `exchange_lockers`는 남김.
  - 둘 다 이름·내용 그대로. 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 둘**: `exchange_unit_lockers`(2d4ed532)·`ranking_unit_scores`(58f17376)(Verified: 스냅숏 전체에서 다른 `prevIds`에 없는 id).

## exchange-3 × boats-5 운반 이음 (손으로 푼 곳의 판단)
- 두 줄기가 같은 `gather/station.ts` 거래소 넣기(`haulIn`)를 서로 다르게 바꿨다: exchange-3은 `haulIn` 안에서 운반 시간을 `haulTime`(운영자 빠르기 × 거래 직무 배율)으로, boats-5는 `haulIn`의 운반 몸통을 공통 `carry(spec)`로 옮겨 배 상하역과 함께 쓰게 했다.
- 합친 꼴: **`haulIn`은 boats-5대로 `carry`를 부르고, `carry`가 exchange-3 규칙을 품는다.**
  - 시간: `carry`의 `timeMs`를 `haulTime(haulMs(…), spec.mapKey, spec.buildingId, porter)`로 바꿨다(옛 boats-5 꼴은 빠르기만). `haulTime`은 그 건물이 물자 거래소(`deskHaulPm` 있음)이고 운반꾼이 그 건물 일꾼이면 `exchange_desk_haul_pm`배.
  - 운반꾼 고르기: `porters.pick`은 exchange-3대로 거래 직무 자리면 "그 일의 몫을 받는 주체(`forOwnerId ?? workerOwnerId`) = 물건 주인"인 일꾼만(사이보그 본체도 — 일꾼 줄이라 본체를 빼지 않는다), 다른 건물은 예전대로. `carry`는 `spec.buildingId`로 고르므로 거래소 넣기(건물 = 거래소)에는 이 규칙이, 배 상하역(건물 = 배 시설)에는 boats-5 규칙(배 시설 일꾼 → 배 주인의 그 2차맵 유닛, 배에 탄 유닛 빼기)이 걸린다.
  - 운반꾼이 없을 때 결과(`unit_busy`·`unknown_unit`): boats-5는 "건물 일꾼 + 주인 유닛" 가운데 누가 맵에 있으면 `unit_busy`였다. 거래 직무 자리에서는 남의 몫 일꾼을 후보에서 빼도록 `pick`과 같은 걸러내기를 넣었다(남의 거래 직무 유닛이 있다고 `unit_busy`가 되지 않게).
  - 판단(Assumed — 기획에 없음): 배를 항구 옆 거래소 건물 창고로 내리는 짐은 배 시설 일꾼·배 주인 유닛이 나르고, 그 거래소의 거래 직무 유닛은 쓰지 않는다(지시대로 boats-5 규칙. 거래 직무 유닛을 끼울지는 질문 2213 물류 답과 함께 볼 일).
  - 거래소 꺼내기(`haulOut` 등 정시 운반)는 boats-5가 건드리지 않았고 exchange-3의 `haulTime`이 그대로 걸린다.
- `porter.ts` 머리 주석은 두 쪽 문단을 모두 둠. `station.test.ts`는 두 쪽 새 시험(거래 직무 운반·`carry`/`inbound`/`redirect`)을 모두 둠 — 둘 다 통과.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 표 둘 더하기와 멱등 옮기기 SQL뿐이고 옛 표 `exchange_lockers`를 남겨 직전 판 앱이 그대로 돈다. 가문 금고는 원장 시스템 계정이라 표가 바뀌지 않는다. 팩은 칸 더하기·설명 바꿈뿐(지운 ID 없음). 줄기 기록 셋이 모두 "필요 없음"이고 합쳐도 겹치는 저장 상태가 없다(운반 중 짐은 메모리 — 예전과 같은 알려진 문제).
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **거래소 개인 창고 크기 = 내 유닛 수 × 기본(200kg) + 유닛마다 넓힌 칸**. 옛 넓힌 칸은 대표 유닛(사이보그 본체 먼저)으로 옮겨진다. 2차맵에 유닛이 없는 주인은 창고 크기 0 → 새 사기 주문·반입이 막힌다(이미 든 것은 그대로).
  - **환전에 이용료가 붙는다**(적정 요율 0.5% — 그 화폐 나라에서 가장 싼 외환 거래소 금고로). 서버 NPC 환전 결과가 시뮬과 조금 갈라진다.
  - 옛 남의 거래소 직무 배치(줄기 exchange-2)는 다음 정산에 풀린다. NPC 거래소는 거래 직무 자리를 내지 않아 빌릴 수 없다(질문 2204).
  - **배 상하역·연료·장비는 시간을 산 교역 부두나 그 배의 집 정박장에서만**(조선소 둘레에서는 `not_moored`). 내리기·싣기는 운반꾼이 걸어 나르고 쓸 유닛이 없으면 `no_carrier`. 땅의 창고 연료·장비는 먼저 배에 실어야 보급·달기가 된다.
  - **NPC 가문은 첫 랭킹 집계 전까지 가문 판에서 빠지고**, 그 뒤에도 전투를 이긴 가문원이 있는 가문만 전투 계열 판에 보인다(질문 2221). 조우 전투 파티가 유닛 하나씩이라 퇴각이 유닛마다 따로 난다. 가문 이동 가입비는 가문 금고 먼저, 지원금은 금고로.
- 51판 기기는 그대로 붙는다(unitId 없이 넓히면 서버가 고르고, `unknown_unit` → `locker_max`, `no_carrier` → `unavailable`, `service:fx_fee`는 보내지 않는다). 50판 이하는 새 앱을 받는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(세 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`: 119 / 126 → **120**.
- `packages/protocol/src/version.ts`(두 번): 50·51 설명 main 그대로, 52 = "합친 판" 아래 거래소 3·배 5 두 항목, 상수 52, 최소 51, 최소 판 설명 줄에 "52부터 50판 이하 기기도". 줄기의 "50·51 자리"·"53~55 자리"·"53~57 자리" 줄과 줄기 쪽 52(npc-econ-5) 설명은 지움.
- `packages/protocol/src/business.ts`: main 51(배 판매가) 줄 + "52부터 환전 이용료 요율(service:fx_fee)".
- `packages/protocol/src/boats.ts`·`apps/server/src/boats/gateway.ts`: main 51 `order_closed` 설명 + 52 `no_carrier`, `legacyCarryCode` 꼴은 boats-5 그대로.
- `apps/server/src/gather/station.ts`·`porter.ts`·`station.test.ts`: 위 "운반 이음".
- `apps/game/messages/{ko,en}.json`(fixes-1116l·exchange-3): 끝에 붙인 키 묶음끼리(main → 줄기 차례). boats-5는 자동으로 합쳐짐. JSON 유효, 겹친 키 없음(8,182키), paraglide 다시 만듦.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main 8ca0fbc, 각 줄기 바탕·끝)으로 다시 셈: 기대 집합과 같음(칸 771개, main 768), 두 쪽이 함께 바꾼 칸 0(Verified, 저장소 밖 스크립트). 줄기가 바꾼 칸: `exchange_desk_haul_pm`·`exchange_fx_fee_bp`·`exchange_fx_fee_max_bp`(새), `exchange_locker_g`·`exchange_locker_max_steps`·`exchange_locker_step_price`·`exchange_trade_slots`(설명).
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): `packages/protocol/src/market.ts`·`market.test.ts`·`boats.test.ts`, `apps/server/src/market/gateway.ts`, `apps/game/src/map/business/FxFeeService.tsx`, ADR `2026-11-16-exchange-buildings.md`·`2026-11-15-shipyard-harbor.md`의 이번 "바뀜" 절, 질문 `2026-11-16-exchange-2.md`·`exchange-3.md`·`boats-4.md`의 이번 줄. 줄기 작업 기록은 줄기 판 그대로 둔다(이 기록이 대응을 적는다).
- 파일 크기: 넘은 파일 없음. 큰 파일: `world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts` 999, `labor/service.ts`·`npc/runtime.ts` 992, `gather/service.ts` 957, `npc/economy.ts` 938, `gather/station.ts` 915.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/protocol/src/version.ts`·`business.ts`·`boats.ts`, `apps/server/src/boats/gateway.ts`, `apps/server/src/gather/station.ts`·`porter.ts`·`station.test.ts`, `apps/game/messages/{ko,en}.json` | 합치기 충돌 풀기(위) |
| 프로토콜 판을 담은 코드·시험(위 목록) | 프로토콜 52·51 |
| ADR 둘·질문 셋 | 판 번호 설명 52·120 |
| `docs/worklog/2026/11/16-1915-batch-1116n-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 53, 팩 121, SIM 61. 다음 마이그레이션 `prevIds` = 위 끝 둘.
- **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(마이그레이션 + `db/marketSchema.ts` 정의 + `world/persist/tables.ts` 줄 — 줄기 기록 exchange-3 "함께 바꿔야 하는 파일").
- 999줄 파일(`world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts`)에 더하는 일은 다른 모듈로.
- 운반에 새 운반꾼 규칙(물류센터 등, 질문 2213)을 넣을 때는 `gather/station.ts` `carry` 한 곳과 `porter.ts` `pick`.
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다(마이그레이션 둘은 올라간 뒤 고치지 않는다, 금고 계정 꼴 `vault:house:<가문>:<자산>`, 조우 파티 ID 꼴).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번 — 줄기 셋 합친 뒤(09ec8bb): 포맷·린트·타입·경계·크기·다국어(8,182키)·디자인 값(738쌍)·콘텐츠(core@120 9a3a56d37acb) 통과, 시험 파일 **776/776**, 시험 **5,808/5,808**. `npc/cityBuildUpgrade.db.test.ts`도 이 실행에서 통과했다(flaky-upgrade 합치기 전).
- `work/flaky-upgrade` 합친 뒤 그 시험 파일만 혼자 3번(TEST_DATABASE_URL): 4/4 × 3 통과.
- 그 뒤 합친 `work/mirror-d574`는 문서만이라 전체 검사는 다시 돌리지 않았다: `pnpm settings:cells --check`(최신), `pnpm check:wiki`(40항목 통과), `pnpm wiki:index --check`(최신) 통과. `check:wiki --stale`이 알리는 두 항목(`transfer-market` D-7023, `warehouse` D-5030)은 이번 미러가 건드리지 않은 결정이다(앞서부터 있던 알림).
- `pnpm check:content 8ca0fbc`: core@120 (9a3a56d37acb) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 8ca0fbc`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,142 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- 네 spec 한 번에(economy·boats·faction-identity·building-screen, 한 DB, 24.5분): **55/55 통과**.
- `ranking`은 faction-identity와 한 DB에서 돌면 시험 사이 상태(player가 가문장으로 남아 가문 도시 라디오가 보임 — 1116l·fixes-1116l 기록과 같은 것)로 실패하므로 새 DB로 따로: **9/9 통과**(44초). NPC 가문 줄은 시험 자료로 채운 판이라 가문원 점수 합 길(`unitScores`)은 화면으로 보지 않았다.
- 사진을 눈으로 봤다(가로 넘침 없음): 거래창 거래소 칸(유닛 창고 고르기·거래 직무 자리·"자리를 내지 않았다", ko·en), 환전 화폐 카드 "환전 이용료 0.5%"(라이브 시험), 조선소 판·정박장 판, 세력 화면 "가문 금고 1,234,567"·지원금 문구(dark en), 가문 랭킹 판, 건물 판. 영어 거래 탭 줄 끝 [Exchange] 단추가 잘려 보이는 것은 가로로 밀리는 탭 줄(`economy.css` `overflow-x: auto`)이라 앞 줄기 사진(exchange-2)과 같다 — 회귀 아님.
- 대표 사진: 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116n-shots/` — `economy-live-book-{pastel-ko,dark-en}-390`, `economy-live-exchange-pastel-ko-390`, `boats-dock-390-dark`, `boats-berth-390-pastel`, `fid-house-home-notice-dark-en-390`, `ranking-house-pastel-ko-390`, `building-panel-390-pastel-ko`. 나머지 사진·`test-results`는 지웠다(디스크).
- 미실행: `labor`·`facilities` spec. 남의 거래소 [자리 빌리기]·건물 판 환전 이용료 칸·배 내리기·싣기 운반 칸(판 아래 스크롤 밖)은 시험이 그 상태를 만들지 않아 사진에 없다(줄기도 미검증).

## 미검증·TODO·알려진 문제
- **TODO: 옛 `exchange_lockers` 표는 다음 배포에서 지운다.**
- 줄기 TODO는 줄기 기록에 있다. fixes-1116l — 실제 NPC 런타임에서 독재 가문 배당이 금고로 가는 것·정리 뒤 다시 가기는 단위 시험만(미실행). exchange-3 — 유닛 창고 크기 셀 때 모든 2차맵 유닛을 훑는 비용(NAS 규모 Unknown), 남의 거래소 [자리 빌리기]·건물 판 환전 이용료 칸은 화면에서 보지 않음. boats-5 — 보이는 운반꾼 걸음(배 시설 ↔ 거래소)은 단위 시험만, 여러 물건 합한 무게로 개인 창고가 넘칠 수 있음 [임시].
- 합친 운반 이음(거래 직무 유닛 + carry)은 단위 시험(`station.test.ts` 두 쪽 시험)만 — 실제 월드에서 거래소 넣기를 거래 직무 유닛으로 끝까지 돌려 보지 않았다(미실행).
- 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 2221~2224(고침 1116l)·앞 질문 2139·2140·2142·2144·2147·2150, 2201~2207(거래소 3), 2211~2215(배 5 — 특히 2213 물류·운반 대행).
