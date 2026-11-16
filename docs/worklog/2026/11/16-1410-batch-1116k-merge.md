# 2026-11-16 묶음 1116k 합치기 (D-572 점검 · 배 4 · 거래소 건물 2 · 군단 명령 3)

- 일시: 2026-11-16 14:10 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-1200-fixes-572`·`16-1035-boats-4`·`16-1200-exchange-2`·`16-1300-legion-3`, 기획 D-570(1821·1823·1827·1830)·D-571·D-572, ADR "바뀜" 절(`2026-11-11-city-building-layout.md`·`2026-11-14-second-map-build.md`·`2026-11-15-combat-moves.md`·`2026-11-16-territory-judgement-map.md`·`2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`·`2026-10-31-combat-core.md`·`2026-11-07-temple-religion.md`·`2026-11-01-gardener-r5b.md`), 질문 2061~2075(`docs/questions/2026-11-16-boats-4.md`)·2081~2092(`exchange-2.md`)·2101~2112(`legion-3.md`)·2121~2130(`fixes-572.md`)

## 한 일
- main 4ef0cfc(묶음 1116j)에 줄기 넷을 차례로 `--no-ff`로 합쳤다.
  1. `work/fixes-572`(8fdd23f, 바탕 d53f183): 건설 땅 알박기 우선(`landRule.ts` — 정부 건물 없는 2차맵은 남의 영토여도 짓는다, `foreign_territory` 막음 걷음), 시가지 = 영향권 ÷ 3(D-104)로 되돌림, XL 밀림 적어도 1칸, 무기 사거리 예산은 기본 공격에만(`skillIntervalMs`), NPC 도시 성장 성향 변수(세력 평균 중립, 설정 칸 다섯).
  2. `work/boats-4`(21a1309, 바탕 a8fbaf1): 함포 칸 포획 장비·낚시 선원·정박한 항구 싣기/내리기·판매가 배값·내 배 시설 연료(D-570).
  3. `work/exchange-2`(c3cab82, 바탕 ddb2136): 거래소 개인 창고(`market_locker_expand`, 표 `exchange_lockers`)·거래 직무·NPC 거래소 운반·이용료(D-571).
  4. `work/legion-3`(25c98e8, 바탕 ddb2136): 작위 6단계(표 `user_nation_renown`)·정원 = 작위 + 환생·퇴각 승계·손으로 짠 진형(`custom`)·실시간 세계 전투 명령(`battle_list`·`battle_order`)·신전 축복·웨이브 수비 편성 통째로(D-571).
- 최종 판:
  - 프로토콜 **49**(최소 **48**) — 이번에 처음 오르는 판이라 boats-4의 55·exchange-2의 56·legion-3의 57 설명을 49 "합친 판" 하나로 묶었다. 낮춰 보내는 판 상수: `GEAR_PROTOCOL_VERSION` 55 → 49(`legacyGearCode`), `LOCKER_PROTOCOL_VERSION` 56 → 49(`locker_full` → `invalid_amount`), `BATTLE_ORDER_PROTOCOL_VERSION` 57 → 49. 시험(`market.test.ts`의 `toBe(56)`, `legion3.test.ts`의 판 기대값)도 맞췄다.
  - 팩 **core@117**(main 116 위로 네 줄기 팩 변경을 함께 — 125·122·123·124는 쓰지 않음). 이번에 처음 오르는 `id-changes.json` 줄은 legion-3의 `c7_command_tier_1~4` 넷 → `since` 124 → **117**. 이미 main에 있던 줄은 그대로.
  - `SIM_VERSION` **59**(main 58 위로 fixes-572의 67·legion-3의 66 설명을 59 하나로). 시범 전투 지문은 다시 셀 일이 없었다: fixes-572가 바꾼 `moves.test.ts` 지문(무기 예산)과 legion-3이 그대로 둔 `orders.test.ts` 옛 지문 넷이 합친 판정에서 모두 통과(Verified: sim·protocol 시험 147파일 1,169개).
- 마이그레이션 셋은 형제 그대로: `20261116010420_boat_gear_price`(43d61ca8)·`20261116023036_exchange_lockers`(8315ae4c)·`20261116024823_nation_renown`(98fc86ba). 셋 모두 `prevIds` = main의 두 끝(`facility_gather_tier` 22a71ad3·`house_units` e39360c4) — 1116j의 `npc_houses_home_notice`(31deac81)와도 형제(Verified). 합친 뒤 `db:generate` = No schema changes(Verified).

## 손으로 푼 곳
- `docs/WORKLOG.md`(네 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(네 번): 116 / 125·122·123·124 → **117**.
- `packages/protocol/src/version.ts`(세 번): 48 설명 main 그대로, 49 = "합친 판" 아래 배·거래소 건물 2·실시간 세계 전투 명령 세 항목, 상수 49, 최소 48, 최소 판 설명 줄에 "49부터 47판 이하 기기도". 줄기의 "48~54·48~55·48~56 자리" 줄은 지움.
- `packages/sim/src/version.ts`(두 번): 58 main 그대로, 59 = D-572 점검 + "같은 판 59에" 군단 명령 3단계, 상수 59.
- `apps/game/messages/{ko,en}.json`(두 번씩): exchange-2 — main(사업장 4) 키 끝에 거래소 키를 이어 붙임. legion-3 — `dev_lab_rank_hint`는 legion-3 문구(작위로만), 나머지 main 그대로. JSON 유효, paraglide 다시 만듦(첫 `pnpm check`가 린트에서 새 키를 못 찾아 멈춤 — 1116i·j와 같음).
- `packages/shared/src/businessBooks.ts`: 장부 종류 — 거래소 `exchange_fee`·`exchange_locker`(exchange-2)와 main의 NPC 판매 주석·`business_input`을 둘 다.
- `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`: 사업장 계수표 — main의 `npcBooks`(사업장 4)와 `exchange*` 여섯 칸을 둘 다, `business_service_fee_pm` 이름은 main("적정가 수수료").
- 판 번호를 담은 코드·주석(충돌은 아니나 판을 바꿈): `packages/protocol/src/boats.ts`·`market.ts`·`market.test.ts`·`battleOrder.ts`, `apps/server/src/session.ts`·`boats/gateway.ts`·`market/gateway.ts`·`world/battleOrders.ts`·`world/legion3.test.ts`, `apps/game/src/map/boats/boatCommands.ts`·`economy/market/marketCommands.ts`·`battle/liveBattleCommands.ts`·`map/mapFeed.ts`·`units/LiveBattlesPanel.tsx`·`units/UnitsScreen.tsx`, `e2e/live-battles.spec.ts` 머리 주석.
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): ADR 일곱 곳의 이번 "바뀜" 절, 질문 `2026-11-16-legion-commands-2.md` 답 줄 둘.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main 4ef0cfc, 각 줄기 바탕)으로 다시 셈해 봄: 기대 집합과 같음(칸 757개, main 734), 두 쪽이 함께 바꾼 칸 0, 지운 `c7_command_tier_*` 넷은 지운 채(Verified, 저장소 밖 스크립트).
- **`apps/server/src/labor/service.ts` 1,010줄**: main(사업장 4, 989줄) + exchange-2 거래 직무 21줄이 합쳐 넘침 → `assign`의 거래 직무 분기와 채집 시설 분기를 한 흐름(`site = desk ?? workplaceOf`, 자리 셈만 나눔 — 확인 차례·결과 코드 그대로)으로 묶고 머리 주석을 줄여 999줄.
- **파일 크기**(`wc -l`, 모두 1,000줄 이하): `packages/sim/src/index.ts` 999, `world/world.ts` 999, `labor/service.ts` 999, `db/schema.ts` 998, `app.ts` 997, `gather/service.ts` 983, `facilities/service.ts` 961.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 열 셋(배 상태 — 모두 null 허용)·표 둘(`exchange_lockers`·`user_nation_renown`) 더하기뿐이고 직전 판 앱은 모른 채 돈다. 세계를 지우지 않아도 되지만 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **건설 땅 알박기**: 정부 건물(도시) 없는 2차맵은 다른 세력 1차맵 영토 안이어도 누구나 짓는다(알림만). 남의 도시 2차맵은 그대로 막음. 이미 지은 건물은 그대로.
  - **시가지 원복**: 시가지가 영향권 ÷ 3(마을 47m ~ 대도시 940m)로 다시 좁아진다 — territory-3 동안 시가지라 막히던 자리가 열린다. 저장 값 없음(그때 셈).
  - **NPC 배 티어**: 배 채집은 장비를 맡은 낚시 선원만 일꾼이다. NPC 배·옛 배는 장비가 없어 이끄는 유닛 혼자 `boat_bare_catch_tier`(2)까지만 낚는다(깊은 바다 어군은 어선 + 주낙 장비 필요 — 질문 2075). 메모리의 채집 줄은 배포로 끊기고 다시 시키면 새 규칙.
  - **명성 0에서 시작 → 정원이 줄어든다**: 모든 사람 명성이 0이라 작위 민간인 → 지휘관 정원 3(+ 환생 1). D-558 때 전투 랭킹 등급으로 정원이 컸던 사이보그는 정원이 줄어든다(규칙대로). 진행 중 세계 전투는 SIM 59 판정이 다시 셈 — 명령 없는 전투는 결과 같음.
  - **개인 창고**: 거래소 건물 창고 물건은 이미 (주인, 물건, 건물 위치) 계정이라 각자 개인 창고(기본 200kg)로 읽힌다. 크기보다 많이 든 옛 창고는 물건은 그대로, 새 사기·반입만 막힌다(넓히면 풀린다). 옛 "3칸 안" 유닛은 이제 주문 한도를 늘리지 않는다(거래 직무로 새로 둔다). 물자 거래소 체결마다 이용료 0.5%(판 쪽 → 거래소 건물 금고).
  - **NPC 도시 성장 성향**: 저장 없이 (세계 시드, 세력)으로 셈. 상한이 줄어든 도시는 짓던 건물을 지우지 않고 새로 짓지 않을 뿐.
- 48판 기기는 그대로 붙는다(포획 장비 코드 → `forbidden`·`busy`, `locker_full` → `invalid_amount`, 새 메시지는 보내지 않음). 47판 이하는 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/protocol/src/version.ts`, `packages/sim/src/version.ts`, `apps/game/messages/{ko,en}.json`, `packages/shared/src/businessBooks.ts`, `packages/sim/src/society/businessCoefficients.ts`, `packages/sim/src/tuningBusiness.ts` | 합치기 충돌 풀기(위) |
| `content/core/id-changes.json` | legion-3 지운 칸 넷 `since` 117 |
| 프로토콜 판을 담은 코드·시험(위 목록) | 프로토콜 49·48 |
| `apps/server/src/labor/service.ts` | 1,000줄 안으로(위) |
| `e2e/economy.spec.ts`, `e2e/helpers/screen.ts` | 화면 시험 고침(아래 "화면 시험") — 호가창 물건 수 161 → 163, 큰 전체 사진은 화소 상한만큼만 |
| `docs/worklog/2026/11/16-1200-batch-1116j-merge.md` | 1116j 배포 절(코디네이터가 확인한 값)을 끝에 덧붙임 |
| ADR 일곱·질문 하나 | 판 번호 설명 49·117·59 |
| `docs/worklog/2026/11/16-1410-batch-1116k-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 50, 팩 118, SIM 60. 다음 마이그레이션의 `prevIds`는 네 끝 — `npc_houses_home_notice`(31deac81)·`boat_gear_price`(43d61ca8)·`exchange_lockers`(8315ae4c)·`nation_renown`(98fc86ba).
- 파일 크기가 1,000줄에 붙었다(위 목록). 새 일은 다른 모듈로.
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 첫 실행은 린트에서 멈춤(paraglide 생성 파일 오래됨 — 새 키 `live_battle_*`·`boat_post_fisher` 등) → `paraglide-js compile` 뒤 둘째 실행 통과: 포맷·린트·타입·경계·크기·다국어(8,081키)·디자인 값·콘텐츠(core@117) 통과, 시험 파일 763/763, 시험 5,738/5,738. DB 시간 초과 없음.
- 작업 중: `pnpm vitest run packages/sim packages/protocol apps/server/src/world/legion3.test.ts apps/server/src/labor` 147파일 1,169개 통과(시범 전투 지문 그대로).
- `pnpm check:content 4ef0cfc`: core@117 (aa757e99fe87) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 4ef0cfc`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,153 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- A build-mode·territory·boats: 14/14 통과(8.3분).
- B economy: 24 통과·1 실패(3.7분). 실패 = 플레이어 실제 거래소 호가창 물건 수 161 기대 → 163. boats-4가 팩에 포획 장비 아이템 둘(그물 `fishing_net`·주낙 장비 `longline_rig`, 장비 아닌 거래 물건)을 더했고 exchange-2 줄기는 그 팩 없이 161을 적었다 → 시험 기대값 163(앱 회귀 아님). 고친 뒤 그 묶음(`--grep 플레이어`) 2/2 통과.
- **economy 1440px 전체 사진(1116j·exchange-2에서 "Unable to capture screenshot")**: 시험 쪽 문제로 갈랐다. 이 시험 계정은 기기 배율 3이라 1440px에서 거래 목록·생산 화면 전체 사진이 4320 × 약 34,000화소(RGBA 약 5.9억 바이트 비트맵)가 되고 Chromium이 찍다 죽는다. 같은 화면 390px(1170 × 39,321 ≈ 4,600만 화소)은 찍힌다. 넘침·작은 누르는 곳 검사는 사진 전에 통과했고, 목록이 한 줄짜리라 길 뿐 화면 배치는 정상이다(사진 눈 확인). → `fullShot`이 기기 화소 6,000만을 넘으면 위에서부터 그만큼만 찍게 했다(`shot`에 `clip` 선택 칸). 1440px 넷 통과, 거래·생산 사진은 4320 × 13,887로 잘림.
- C battleLab·battleReport·live-battles·temple·skills: 61/61 통과(4.7분).
- 합: 아홉 spec 모두 통과(economy는 시험 고친 뒤). 대표 사진: 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116k-shots/` — `build-claim-390`(알박기 땅 안내), `boats-dock-390-{pastel,dark}`, `territory-neon-ko-390`, `economy-live-book-{pastel-ko,dark-en}-390`(개인 창고·거래 직무 칸), `economy-market-dark-ko-1440`(잘린 전체 사진), `live-battles-390-{pastel,dark}-ko`, `temple-dark-en-{390,1440}`. 나머지 사진·`test-results`는 지웠다(디스크).

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. fixes — 빈 2차맵 알박기 완성 없음(2122), 서버 세계 NPC 성장 성향 DB 시험 없음. boats — 새 칸(함포 칸·싣기) 눈 확인 없음, NPC 배 장비 없음(2075). exchange — 거래 직무 배치 서버 길 DB 시험 없음, NPC 운반 서버 DB 세계 미실행(2091). legion — 실시간 명령을 진짜 세계 전투로 화면에서 넣어 보지 않음, 내 작위·명성 화면 없음(2112).
- 네 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 2061~2075(배 4) — 추천대로 [임시].
- 질문 2081~2092(거래소 건물 2) — 추천대로 [임시].
- 질문 2101~2112(군단 명령 3) — 추천대로 [임시].
- 질문 2121~2130(D-572 점검) — 추천대로 [임시]. 1991·2009는 사용자 질문 중.

## 배포 (Verified)
- main 0e6c394, CI 357: 검사·이미지·NAS 배포 성공(2026-11-16 14:54 KST 앱 다시 켬, core@117, 프로토콜 49·최소 48, 마이그레이션 boat_gear_price·exchange_lockers·nation_renown 적용). 세계는 새로 시작하지 않았다.
- 켠 뒤 5분 nas-metrics(run 43813762933): RSS 548~561MB(컨테이너 메모리 56.9%), 루프 p99 첫 1분 3.9ms(최대 134ms) → 그 뒤 1.0~1.4ms(최대 9~31ms), CPU 5.5~6.3%(첫 1분 19.5%), DB 실패 0·커밋 평균 69~86ms·줄 5,928~7,083/분, 경로 대기 p95 첫 1분 1,147ms → 0.9~1.0ms, 조우 찾기 24~26ms/분. 도시 49·건물 1,011·휴먼 2,258, 2차맵 55·유닛 3,276, 세력 16. 기기 오류 0, 경고·오류 줄 0.
- 이 5분 동안 거래 체결 0(`econTrades`), NPC 판매 0→7 — 켠 직후라 산출이 막 쌓이는 중(Assumed). 거래소 이용료가 실제로 붙는지는 체결이 생긴 뒤 다시 본다(Unknown).
