# 2026-11-16 묶음 1116o 합치기 (NPC 경제 6 · 빈 2차맵 알박기 2 · 기획 미러 D-576) — 리셋 필요 없음

- 일시: 2026-11-16 20:40 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-1940-npc-econ-6`·`16-1940-alpak-2`, 기획 미러 a822c95(D-576), 기획 대조 2152·2153·2155·2157·2158·2161·2163·2167(NPC 경제 6), D-572·D-574·D-575(알박기 2), ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`·`2026-11-14-second-map-build.md`), 질문 2231~2240(`docs/questions/2026-11-16-npc-econ-6.md`)·2241~2244(`2026-11-16-alpak-2.md`)

## 한 일
- main 78bc437(묶음 1116n) 위에 가지 셋을 차례로 `--no-ff`로 합쳤다.
  1. `work/npc-econ-6`(815dd8a, 바탕 8ca0fbc): NPC 시설 판매가(`npc/npcShopPrice.ts`, 값 표 `business_prices` 줄), NPC 재료비 적자 멈춤(`stopAfter`·`npcDelivery.ts resume`), 운반꾼이 없으면 기다림(`npc/npcCarry.ts` 운반 일 판 — `post`가 닿는 시각/undefined, `stateOf`·`pump`, 요청 `atMs`·`durMs`), 거래소 → 도시 창고 돌려보내기 운반꾼(`market/npcHaul.ts`, `cityCell`), 외주 수리 적정가 재료비(`facilities/equipmentRepair.ts repairMaterialsHourly`), 조선소 수리 재료는 조선소 사업장 부담·적정가 나라 화폐(`@terra/shared/fairPrice convertFair`), `labor_paused` 계약마다 [기다림]·[해지].
  2. `work/alpak-2`(048991e, 바탕 8ca0fbc): 늦은 쪽 정부 건물 멈춤(`facilities/service.ts haltBuild`), 무소속 → 1인 가문(`ruins/claimHouse.ts`), 짓기 때 귀속/독립 고르기(`facility_build.claim`, `DEFAULT_LAND_CLAIM_MODE`), 봉신 가문 독립 선언(WebSocket `house_independence`, `factionIdentity/houseIndependence.ts`), 소식 `claim_halted`·`city_gained`, 건축 시트 라디오.
  3. `work/mirror-d576`(d66835c, 바탕 78bc437, 문서만): 기획 미러 a822c95(D-576) 동기화 — `docs/design/` 미러(`00_README.md`·`02_Decision_Log.md`·`03_Planning_Rules.md`), `docs/design/README.md` 원본 커밋·시각, `docs/PLAN.md` §14 머리 문장, `docs/worklog/2026/10/31-0910-design-mirror-aadab42.md` 한 줄. 충돌 없이 합쳐졌다. 49 설정 칸 미러는 바뀌지 않았다(`pnpm settings:cells --check` 최신).
- 1116n과 겹친 곳: npc-econ-6은 1116n의 `gather/station.ts`·`porter.ts`(boats-5·exchange-3 운반 이음)를 건드리지 않았다. 겹친 것은 같은 선택 칸 목록 끝에 두 쪽이 칸을 더한 자리뿐이라 두 쪽을 모두 두었다(아래 "손으로 푼 곳"). npc-econ-6의 운반 일 판 API(`npcCarry`)는 1116n 쪽이 부르지 않아 그대로 맞는다(서버 타입 검사·시험 통과).
- 최종 판:
  - 프로토콜 **53**(최소 **52**) — alpak-2의 62(최소 61)를 53 "합친 판"으로. 낮춰 보내는 판 상수: `LAND_CLAIM_PROTOCOL_VERSION`·`HOUSE_INDEPENDENCE_PROTOCOL_VERSION` 62 → 53(52판 기기는 `claim`·`house_independence`를 보내지 않는다 — 서버는 기본 선택, `session.ts`는 52판 연결의 `house_independence`를 막는다). npc-econ-6은 프로토콜을 바꾸지 않았다.
  - 팩 **core@121**(main 120 위, npc-econ-6의 130 → 121). 두 줄기 모두 `id-changes.json`을 건드리지 않았다.
  - `SIM_VERSION` **61**(npc-econ-6의 70 → 61) — 사업장 계수표에 NPC 시설 판매가 칸 셋(서버만 읽음), 시뮬 판정·출력 그대로. `world/legion3.test.ts`는 npc-econ-6이 "SIM 60 이상"으로 바꾼 꼴 그대로 통과(최소 = 지금 − 1도).
- 마이그레이션 하나(형제 갈래):
  - `20261116100840_land_claim_choice`(95bd9580, `prevIds` = 1116l 끝 다섯 bd0d640e·7f14a324·98fc86ba·8315ae4c·43d61ca8) — 열 `world_facilities.claim_choice` + 표 `claim_cities` 더하기. 1116n의 `exchange_unit_lockers`(2d4ed532)·`ranking_unit_scores`(58f17376)와 형제가 된다. 이름·내용 그대로(AGENTS.md 6장 갈래 규칙).
  - 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 셋**: `exchange_unit_lockers`(2d4ed532)·`ranking_unit_scores`(58f17376)·`land_claim_choice`(95bd9580)(Verified: 스냅숏 전체에서 다른 `prevIds`에 없는 id).

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 열·표 더하기뿐이라 직전 판 앱이 그대로 돈다(그 판이 지은 알박기 = 기본 선택). npc-econ-6은 DB 표가 없다(판매가는 값 표 새 줄, 운반 일은 메모리, 접힘은 기기 저장소). 팩은 칸 더하기뿐(지운 ID 없음). 줄기 기록 둘 다 "필요 없음"이고 합쳐도 겹치는 저장 상태가 없다.
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **NPC 시설 물건 값이 팩 기준 값에서 움직인다**(그 도시 거래소 시세·상업 성향·재고). 산출마다 값 표·원장 쓰기가 0~1줄 는다.
  - **NPC 운반은 그 도시 운반꾼(경비대 뺀 휴먼) 수만큼만 떠나고 나머지는 기다린다** — 휴먼이 적은 도시는 NPC 거래소 운반이 늦게 닿고, 휴먼 0인 도시는 짐이 남는다. 거래소에 남은 NPC 물건을 도시 창고로 돌려보내는 휴먼도 화물을 지고 걷는다(약탈 대상).
  - NPC 국고가 재료비도 못 내면 적자로 넣고 그 시설 산출을 멈춘다(국고가 회복되면 다시 돈다).
  - **공방 외주·조선소 수리 적정가가 재료비만큼 오르고 나라 화폐로 보인다**. 조선소 수리 재료가 조선소 쪽(사업장 창고 → 주인 자리)에서 빠진다 — 재료가 없으면 `insufficient_materials`.
  - 멈춘 노동 계약 처리할 일이 계약마다 한 줄 + [기다림]·[해지].
  - **빈 2차맵 알박기**: 무소속 플레이어도 정부 건물로 도시를 세운다(1인 가문 독재 도시). 짓기 때 "소속 국가로 귀속(기본) | 독립"을 고른다. 도시가 서면 같은 2차맵 다른 편의 짓는 중 정부 건물은 멈춘다(재료 돌려주지 않음). 알박기로만 선 가문 도시를 가진 봉신 가문장은 세력 화면에서 [독립 선언]을 할 수 있다(그 사이 1116n 판에서 선 알박기 도시는 `claim_cities`에 없어 막힌다 — Assumed: 거의 없다).
- 52판 기기는 그대로 붙는다(`claim` 없이 기본 선택, 독립 선언은 보내지 않는다). 51판 이하는 새 앱을 받는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`: 120 / 130 → **121**.
- `apps/server/src/facilities/world.ts`(exchange-3 `fxShop` + npc-econ-6 `materialsHourly`), `apps/server/src/market/worldInput.ts`(exchange-3 `fxExchanges`·`fxFeeBp` + npc-econ-6 `cityCell`·`unitPriceOf`), `apps/server/src/npc/economy.ts`(`NpcEconomyInput`의 같은 칸 넷 선언): 두 쪽 칸을 모두 둠(main → 줄기 차례). import는 자동으로 합쳐짐.
- `apps/game/messages/{ko,en}.json`(npc-econ-6): fixes-1116l의 `fid_house_vault*` 뒤에 npc-econ-6 키 일곱(`harbor_repair_fair`·`harbor_repair_fee_fair`·`inbox_action_*`). alpak-2는 자동으로 합쳐짐. JSON 유효, 겹친 키 없음(8,206키), paraglide 다시 만듦.
- ADR `2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`: 같은 자리에 붙은 "바뀜" 절 둘(1116n boats-5·exchange-3 → npc-econ-6)을 차례로 모두 둠.
- `packages/protocol/src/version.ts`: 52 설명 main 그대로, 53 = "합친 판" 아래 알박기 2 항목(52판 기기 표현), 상수 53, 최소 52, 최소 판 설명 줄에 "53부터 51판 이하 기기도". 줄기 쪽 62 설명·"62부터 60판 이하" 줄은 지움.
- `packages/sim/src/version.ts`: npc-econ-6의 70 설명을 61 "묶음 1116o 합친 판, 줄기 70"으로, 상수 61.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main 78bc437, 줄기 바탕 8ca0fbc·끝)으로 다시 셈: 기대 집합과 같음(칸 774개, main 771), main(8ca0fbc 이후)과 줄기가 함께 바꾼 칸 0(Verified, 저장소 밖 스크립트). 줄기가 더한 칸: `business_npc_price_temper_pm`·`business_npc_price_stock_pm`·`business_npc_price_stock_lots`.
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): `packages/protocol/src/facilities.ts`·`house.ts`, `apps/server/src/session.ts`·`facilities/serviceTypes.ts`·`factionIdentity/houseIndependence.ts`·`factionIdentity/gateway.test.ts`, `apps/game/src/faction/identity/HouseCityBlock.tsx`·`houseCommands.ts`, `apps/game/src/map/construction/BuildSheet.tsx`(주석 "프로토콜 53"), ADR `2026-11-14-second-map-build.md`·`2026-11-15-business-ledger.md`의 이번 "바뀜" 절, 질문 `2026-11-16-alpak-2.md`·`alpak-2122.md`의 이번 줄. 줄기 작업 기록은 줄기 판 그대로 둔다(이 기록이 대응을 적는다).
- 파일 크기: 넘은 파일 없음. 큰 파일: `world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts` 999, `npc/runtime.ts`·`labor/service.ts` 992, `travel/service.ts` 986, `world/persist/tables.ts` 985, `facilities/service.ts` 984, `npc/economy.ts` 972.
- `docs/worklog/2026/11/16-1915-batch-1116n-merge.md` 끝에 "## 배포 (Verified)" 절(1116n CI 360·NAS 배포·nas-metrics 결과, 조정 담당이 보낸 값)을 넣었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `apps/server/src/facilities/world.ts`·`market/worldInput.ts`·`npc/economy.ts`, `apps/game/messages/{ko,en}.json`, ADR 둘(shipyard-harbor·exchange-buildings), `packages/protocol/src/version.ts` | 합치기 충돌 풀기(위) |
| 프로토콜·SIM 판을 담은 코드·시험(위 목록), `packages/sim/src/version.ts` | 프로토콜 53·52, SIM 61 |
| ADR 둘(second-map-build·business-ledger)·질문 둘 | 판 번호 설명 53·121·61 |
| `docs/worklog/2026/11/16-1915-batch-1116n-merge.md` | 1116n 배포 결과 절 |
| `docs/worklog/2026/11/16-2040-batch-1116o-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 54, 팩 122, SIM 62. 다음 마이그레이션 `prevIds` = 위 끝 셋.
- **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO 그대로 — 마이그레이션 + `db/marketSchema.ts` 정의 + `world/persist/tables.ts` 줄).
- 999줄 파일(`world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts`)과 `npc/economy.ts`(972)·`facilities/service.ts`(984)에 더하는 일은 다른 모듈로.
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다(기본 선택 2241 → `DEFAULT_LAND_CLAIM_MODE` 한 줄 + `e2e/build-mode.spec.ts`, 2154 NPC 휴먼 임금 → `npcDelivery.ts`).

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다(올라간 마이그레이션은 고치지 않는다, "알박기 중" = 도시가 비어 있는 행정 건물, 늦은 쪽 멈춤은 도시를 세우는 같은 동기 처리 안에서만).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번 — 두 줄기 합친 뒤(8324c5f — 판 번호는 합치기 커밋 안에): 포맷·린트·타입·경계·크기·다국어(8,206키)·디자인 값(738쌍)·콘텐츠(core@121 df27a572925e) 통과, 시험 파일 **779/779**, 시험 **5,827/5,827**.
- `pnpm check:content 78bc437`: core@121 (df27a572925e) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 78bc437`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,787 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.
- 그 뒤 합친 `work/mirror-d576`은 문서만이라 전체 검사·화면 시험은 다시 돌리지 않았다: `pnpm settings:cells --check`(최신), `pnpm check:wiki`(40항목 통과), `pnpm wiki:index --check`(최신), `pnpm check:docs 78bc437` 통과.

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- 네 spec 한 번에(boats·inbox·build-mode·building-screen, 한 DB, 22.7분): **35/35 통과**.
- `faction-identity`는 새 DB로 따로(ranking 등과 한 DB면 시험 사이 상태로 실패하므로): **21/21 통과**(1.0분).
- 사진을 눈으로 봤다(가로 넘침 없음): 건축 시트 정부 건물 "소속 국가로 귀속 | 독립" 라디오·독립 체제 고르기(가문, pastel ko)와 1인 독재 도시 안내(personal), 조선소 주인 판 수리 적정가 안내 줄(pastel·dark — 화폐 글자 `placeholder_cur_16`은 시험 팩 화폐 이름, 예전과 같다), 공방 [관리] 외주 수리 적정가 줄 "materials 0 · labor 100 · fee 20 · tax 6"(dark en — 시험 공방은 수리 재료 기준 값이 0이라 재료비 0), 세력 화면 가문 도시 봉신/독립 고르기(pastel ko), 처리할 일(dark en 390), 가문 금고 공지(dark en).
- 대표 사진: 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116o-shots/` — `build-gov-house-390`, `build-gov-personal-390`, `boats-repair-fair-390-{pastel,dark}`, `building-repair-service-390-dark-en`, `house-city-pastel-ko-390`, `inbox-dark-en-390`, `fid-house-home-notice-dark-en-390`. 나머지 사진·`test-results`는 지웠다(디스크).
- 미실행: `labor`·`economy` spec. `labor_paused` [기다림]·[해지] 단추, 세력 화면 [독립 선언](알박기 도시를 가진 봉신 가문 상태)은 시험이 그 상태를 만들지 않아 사진에 없다(줄기도 미검증 — 단위·DB 시험만).

## 미검증·TODO·알려진 문제
- **TODO: 옛 `exchange_lockers` 표는 다음 배포에서 지운다**(1116n에서 이어짐).
- 줄기 TODO는 줄기 기록에 있다. npc-econ-6 — 2154 NPC 휴먼 일꾼 임금 빈틈, 보는 2차맵에서 시설 일꾼이 짬을 내 화물을 지는 모습·`labor_paused` [기다림]·[해지] 단추는 단위 시험만, 판매가 쓰기의 NAS 부하 Unknown. alpak-2 — 다른 길로 도시가 선 2차맵의 짓는 중 알박기 정부는 멈추지 않음, 1인 가문 만들기 실패 로그 없음, 이름 없는 1인 가문 이름 붙이기 길 없음, NPC 알박기 없음, 세력 화면 [독립 선언]은 화면 시험 없음(DB 시험만).
- 합친 세계(NPC 운반꾼 기다림 + 1116n 배·거래소 운반)를 NAS에서 오래 돌려 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 2231~2240(NPC 경제 6), 2241~2244(알박기 2 — 2241 기본 선택은 기획이 사용자에게 다시 확인 중), 1116n의 2201~2207·2211~2215·2221~2224.

## 배포 (Verified)
- main 7b34039, CI 361: 검사·이미지·NAS 배포 성공(2026-11-16 12:41 UTC 앱 다시 켬, 이미지 sha-7b34039f2749, core@121). 세계는 새로 시작하지 않았다.
- 켠 뒤 nas-metrics(run 43869608208, 켠 지 1~5분): RSS 577~589MB(컨테이너 메모리 58.6%), 루프 p99 1.0~6.5ms(첫 1분 최대 160ms → 그 뒤 최대 4~43ms), DB 실패 0(커밋 평균 72~89ms·최대 174~381ms, dbPending 9~20), 경로 대기 p95 첫 1분 875ms → 0.9~1.1ms. econProduced 24·econNpcSales 7(켠 직후). 도시 49·건물 1,011·휴먼 2,258·유닛 3,276. 기기 오류 0. 마이그레이션 land_claim_choice 뒤 오류 징후 없음(적용 로그 줄은 nas-metrics가 모으지 않음).
