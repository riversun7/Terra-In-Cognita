# 2026-11-16 묶음 1116m 합치기 (NPC 경제 5 · 전투 4 · 군단 4 · 알박기) — 리셋 필요 없음

- 일시: 2026-11-16 17:40 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-1600-npc-econ-5`·`16-1512-combat-4`·`16-1530-legion-4`·`16-1545-alpak-2122`, 기획 D-570·D-572·D-573·D-558·D-571·D-326, ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`·`2026-11-01-npc-brain-r5.md`·`2026-11-15-combat-moves.md`·`2026-10-31-combat-core.md`·`2026-11-01-gardener-r5b.md`·`2026-11-14-second-map-build.md`), 질문 2151~2167(`docs/questions/2026-11-16-npc-econ-5.md`)·2171~2174(`2026-11-16-combat-4.md`)·2181~2183(`2026-11-16-legion-4.md`)·2191~2200(`2026-11-16-alpak-2122.md`)

## 한 일
- main 72990f9(묶음 1116l) 위에 줄기 넷을 차례로 `--no-ff`로 합쳤다.
  1. `work/npc-econ-5`(54a9482, 바탕 6fec68f): NPC 시설 금고·실제 운반(`npc/npcDelivery.ts` 새, `npcBooks.ts` 지움), 보이는 운반꾼 화물(`npc/npcCarry.ts`), 조선소 배 판매가(`business_price` item `boat:<종류>`), 적자 멈춤(`labor/wageFunding.ts`), 멈춘 계약 처리할 일 `labor_paused`, 사업장 관리 권한(주인 또는 대주주), 외주 수리 재료는 공방이, 국가 프리셋 `temper`·국가 편집기 "성향" 구역.
  2. `work/combat-4`(d899917): 공격 스킬 사거리 예산 기본 켬, 스킬 행동 간격 = max(시전, 예산 전 공격 간격) × 예산, 보스도 밀림 0칸 아님(999 상한), 스킬 편집기 "사거리 예산" 체크, `skillJsonOf`가 `move`·`displace`·`curves`·`shots`를 버리던 것 고침.
  3. `work/legion-4`(4c12ae9): 웨이브 수비 편성은 군단을 통째로 넣거나 건너뜀(`waveDefenderPick`), 납품 명성(`world/deliveryRenown.ts`, 설정 칸 `d326_renown_delivery_value`·`d326_renown_quest`).
  4. `work/alpak-2122`(76a42d0): 빈 2차맵에 정부 건물 → 다 지으면 그 편의 새 도시(`ruins/landClaim.ts`, 틱마다 `liftGovernments`), tRPC `facilities.landRule` 선택 칸 `claim`, 건축 시트 편 안내·무소속 막음.
- 최종 판:
  - 프로토콜 **51**(최소 **50**) — npc-econ-5의 52를 51 "합친 판"으로 묶었다(main의 50 설명은 그대로). 낮춰 보내는 판 상수: `BOAT_PRICE_PROTOCOL_VERSION` 52 → 51, `legacyOrderCode`는 51판 결과 코드 → 50판 연결(`order_closed` → `forbidden`). 최소 판 설명 줄에 "51부터 49판 이하 기기도". 판 번호를 담은 주석: `packages/protocol/src/boats.ts`·`boats.test.ts`·`business.ts`, `apps/server/src/boats/gateway.ts`, `apps/game/src/map/boats/BoatPriceRow.tsx`, `packages/shared/src/harbor.ts`.
  - 팩 **core@119**(npc-econ-5 120·legion-4 122 → 119). 네 줄기 모두 `id-changes.json`을 건드리지 않았다(처음 오르는 줄 없음).
  - `SIM_VERSION` **60** — "합친 판" 아래 npc-econ-5(62, 지도자 기질 칸)·combat-4(63, 사거리 예산)·legion-4(64, 군단 통째로) 세 항목. 판 번호를 박은 시험: 서버 `world/legion3.test.ts`는 `SIM_VERSION` 60(프로토콜은 main 꼴 그대로 `≥ 49`, 최소 = 지금 − 1), sim `combat/moves.test.ts`·`testMovesBaseline.ts`는 이름·주석만.
- 마이그레이션 없음(네 줄기 모두). 다음 마이그레이션 `prevIds`의 끝 다섯은 1116l 기록 그대로.

## 리셋 필요 여부: 필요 없음
- 표·마이그레이션 없음, 팩은 칸 더하기·뜻 바꿈뿐(지운 ID 없음). 줄기 기록 넷이 모두 "필요 없음"이고 합쳐도 겹치는 저장 상태가 없다. 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **NPC 시설 산출이 도시 창고로 바로 가지 않는다**: 산출은 그 시설 건물 창고에 쌓이고 그 시설 일꾼이 도시 창고로 실제로 나른다(닿은 만큼 나라가 사서 시설 금고로, 하루 끝 정산으로 국고). 켤 때 NPC 시설 창고에 남은 NPC 물건은 도시 창고로 옮긴다. 보는 2차맵에서는 운반꾼이 화물을 지고 걷는다(약탈 대상). 원장 거래가 산출마다 3~4개 늘어난다(NAS 부하 Unknown — 크면 설정 칸 `business_npc_books` 0).
  - **조선소 배 주문 요금 = 판매가**(주인이 정하지 않으면 적정가). 외주 요금 배수 고정 셈은 없어졌다.
  - **금고가 빈 사업장의 노동 계약이 바로 멈춘다**(진행 중 생산 주기가 있을 때만 한 주기 적자로 돌림). 플레이어에게 처리할 일 "일이 멈춘 내 유닛 N명"이 생긴다.
  - **원거리 공격 스킬이 느려진다**(사거리 4~6 스킬 행동 간격 130~150%, 시범 6 대 6 승률 168/32 → 159/41). 진행 중 전투는 시작 자료 그대로(옛 셈).
  - **빈 2차맵에 정부 건물을 지을 수 있다**(가문 없는 플레이어는 막음 — 질문 2192). 다 지으면 그 편의 새 도시가 선다.
  - NPC 나라에서 유저가 정부 사기 주문에 팔면 명성이 쌓인다(배포 뒤 체결부터).
  - 웨이브 수비 편성 바뀜은 지금 세계 휴먼이 모두 혼자인 유닛이라 결과가 그대로다.
- 50판 기기는 그대로 붙는다(배 판매가는 보내지 않고 `order_closed`는 `forbidden`으로 받는다). 49판 이하는 새 앱을 받는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(네 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(두 번): 118 / 120·122 → **119**.
- `packages/protocol/src/version.ts`: 50 설명 main 그대로, 51 = "합친 판" 아래 배 판매가 항목, 상수 51, 최소 50. 줄기의 "50·51 자리" 줄은 지움.
- `packages/sim/src/version.ts`(두 번): 60 = "합친 판" 아래 세 줄기 항목, 상수 60. 줄기의 "60·61 자리"·"SIM 60~63은 다른 줄기 몫" 문구는 지움.
- `apps/server/src/world/legion3.test.ts`(세 번): main 꼴(프로토콜 `≥ 49`·최소 = 지금 − 1)을 두고 SIM만 60.
- `apps/game/messages/{ko,en}.json`(npc-econ-5): 끝에 붙인 키 묶음끼리(main AI 작전·가문 이동 정책 → npc-econ-5 배 판매가 등). JSON 유효, 겹친 키 없음(8,153키). paraglide 다시 만듦.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main 72990f9, 각 줄기 바탕·끝)으로 다시 셈: 기대 집합과 같음(칸 768개, main 765), 두 쪽이 함께 바꾼 칸 0(Verified, 저장소 밖 스크립트). 줄기가 바꾼 칸: `business_npc_books`·`business_npc_wait_days`·`d326_renown_delivery_value`·`d326_renown_quest`.
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): ADR `2026-10-31-combat-core.md`·`2026-11-01-gardener-r5b.md`·`2026-11-01-npc-brain-r5.md`·`2026-11-15-business-ledger.md`·`2026-11-15-shipyard-harbor.md`·`2026-11-15-combat-moves.md`의 이번 "바뀜" 절, 질문 `2026-11-16-boats-4.md`·`business-4.md`·`combat-3.md`·`combat-4.md`·`legion-3.md`의 이번 답 줄. 줄기 작업 기록은 줄기 판 그대로 둔다(이 기록이 대응을 적는다).
- **파일 크기**: `apps/server/src/npc/runtime.ts`가 main 997 + npc-econ-5(+1)·alpak-2122(+2)로 1,000줄 → `recruitOf`(구인 카드 휴먼의 레벨·스탯·속성)를 `npc/state.ts`(`NpcHumanRow` 옆)로 옮기고 쓰지 않게 된 import 둘을 지움 → 992. 그 밖 큰 파일: `world/world.ts`·`labor/service.ts`·`app.ts`·`sim/index.ts` 999, `db/schema.ts` 998, `facilities/service.ts` 965.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/protocol/src/version.ts`, `packages/sim/src/version.ts`, `apps/game/messages/{ko,en}.json`, `apps/server/src/world/legion3.test.ts` | 합치기 충돌 풀기(위) |
| 프로토콜 판을 담은 코드·시험(위 목록) | 프로토콜 51·50 |
| `packages/sim/src/combat/moves.test.ts`·`testMovesBaseline.ts` | SIM 판 이름 |
| `apps/server/src/npc/runtime.ts`·`state.ts` | 1,000줄 안으로(`recruitOf` 옮김) |
| `apps/game/src/map/boats/boats.css`, `e2e/boats.spec.ts` | 조선소 판 390px 넘침 고침·회귀 검사(화면 시험) |
| `docs/worklog/2026/11/16-1540-batch-1116l-merge.md` | 1116l 배포 결과 절(코디네이터 전달) |
| ADR 여섯·질문 다섯 | 판 번호 설명 51·119·60 |
| `docs/worklog/2026/11/16-1740-batch-1116m-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 52, 팩 120, SIM 61. 마이그레이션 `prevIds` 끝 다섯은 1116l 기록 그대로.
- `world/world.ts`·`labor/service.ts`·`app.ts`·`sim/index.ts` 999줄, `db/schema.ts` 998줄(검사는 끝 줄바꿈까지 세어 1,000까지). 새 일은 다른 모듈로.
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다(무소속 알박기 답 2192가 오면 `ruins/landClaim.ts sideOf`만, 시뮬 경제에 시설 창고를 넣을 때 `npc/npcDelivery.ts` 덧붙임 걷기 등).

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·경계·크기·다국어(8,153키)·디자인 값(738쌍)·콘텐츠(core@119 28b3da26848d) 통과, 시험 파일 **772/772**, 시험 **5,790/5,790**. npc-econ-5가 마지막 고침 뒤 돌리지 않았던 전체 검사도 이것으로 덮었다.
- `pnpm check:content 72990f9`: core@119 (28b3da26848d) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 72990f9`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,166 B / 상한 131,416 B(고친 CSS는 지연 조각).
- 전체 검사 뒤 바뀐 것: `boats.css`(`pnpm check:contrast` 통과)·`boats.spec.ts`(biome·oxlint 통과)·문서뿐이라 전체 검사는 다시 돌리지 않았다(푸시 전 훅이 한 번 더 돈다).

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- 여덟 spec 한 번에(boats·building-screen·nations·facilities·inbox·build-mode·skills·battleLab, 한 DB, 24.1분): **81/81 통과**.
- **사진에서 찾은 앱 회귀 하나 — 고침**: 조선소 판(`boats-dock-390-*`)이 390px에서 오른쪽이 잘렸다(설명 글·도크 줄이 판 밖으로, 1116k 같은 사진은 맞음). 원인(Verified: 시험 안에서 잰 값): npc-econ-5가 배 종류 줄에 더한 배 판매가 줄(`BoatPriceRow`)의 값 칸이 폭 규칙 없이 줄바꿈 flex 줄 안에 들어가 기본 폭(size 20)을 최소 폭으로 들고 왔다 → 판 최소 폭 366px > 시트 338px. `.harbor-price`에는 CSS 규칙이 없었다. → `apps/game/src/map/boats/boats.css`에 `.harbor-price`(제 줄·세로·`min-inline-size: 0`)와 그 안 값 칸 `inline-size: 0`(늘어나는 폭은 공용 `flex: 1 1 7em` 그대로). 고친 뒤 판 338px = 시트, 판을 300px로 줄여도 넘치는 요소 없음. `e2e/boats.spec.ts`에 회귀 검사(판 폭 ≤ 시트)와 판매가 줄 사진 `boats-price-390-{pastel,dark}`을 더했다. **다시 빌드해 boats만: 2/2 통과**(4.2분). 시험은 통과했는데 사진에서만 보인 문제라 시험 자체로는 못 잡았다(줄기 기록도 "배 판매가 줄은 사진에 없다"고 적었다).
- 대표 사진(눈 확인, 고친 뒤 가로 넘침 없음): 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116m-shots/` — `boats-dock-390-{pastel,dark}`·`boats-price-390-{pastel,dark}`(고친 뒤), `build-gov-nation-390`·`build-gov-no_house-390`(알박기 편 안내·무소속 막음), `building-repair-service-390-pastel-ko`, `building-reserve-390-dark-en`, `inbox-pastel-ko-390`, `nations-neon-ko-390`, `skills-light-ko-390`. 나머지 사진·`test-results`는 지웠다(디스크).
- 미실행: `labor`·`economy` spec(적자 멈춤·멈춘 계약 화면 — 줄기도 미실행), 성향 칸 입력·`labor_paused` 줄은 시험이 그 상태를 만들지 않아 사진에 없다.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. npc-econ-5 — 보이는 운반꾼 모습은 단위 시험만, 다시 켤 때 운반꾼 화물에 실린 NPC 물건(2156), 원장 부하(Unknown). combat-4 — 서버 세계 NPC·웨이브 승률은 재지 않음. legion-4 — 실제 NPC 도시 사기 주문 경로의 납품 명성은 DB·런타임으로 돌려 보지 않음(Assumed). alpak-2122 — 새 도시 소식 없음(2197), 가문 편 알박기 DB 시험 없음(Assumed).
- 네 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 2151~2167(NPC 경제 5), 2171~2174(전투 4), 2181~2183(군단 4)·앞 질문 2107·2110, 2191~2200(알박기 — 특히 2192 무소속 플레이어).

## 배포 (Verified)
- main 8ca0fbc, CI 359: 첫 시도는 검사 단계에서 `npc/cityBuildUpgrade.db.test.ts` 한 시험 실패(5,789/5,790, 배포 건너뜀) → 실패 잡만 한 번 다시 돌려 통과, 이미지·NAS 배포 성공(2026-11-16 10:19 UTC 앱 다시 켬, 이미지 sha-8ca0fbc11190, core@119). 세계는 새로 시작하지 않았다. 그 시험의 원인은 줄기 flaky-upgrade가 찾는 중(흔들림 3회째).
- 켠 뒤 nas-metrics(run 43848705552, 켠 지 1~5분 구간): RSS 557~573MB(컨테이너 메모리 58.4%), 루프 p99 1.0~4.5ms(첫 1분 최대 137.9ms → 그 뒤 최대 2.3~35.6ms), DB 실패 0(커밋 평균 69~79ms·최대 184~319ms, dbPending 0~33), 경로 대기 p95 첫 1분 1,074ms → 0.9~1.0ms. 도시 49·건물 1,011·휴먼 2,258, 2차맵 55, 유닛 3,276, 세력 16. 기기 오류 0.
- NPC 운반·원장 부하는 이 창에서 판단 못 함(econProduced 0~21, econTrades 0 — 켠 직후라 산출 주기가 거의 돌지 않음, Unknown). 더 늦게 다시 잰다.
