# 목장 사다리 중분류 여럿·낚시터 물가 조건(질문 946 나·947 나)

- 일시: 2026-11-11 19:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-production-six.md` "바뀜 (2026-11-11, 946·947)", 질문 `docs/questions/2026-11-11-production-six.md`(946~960 답 옴 — 기획 D-529 포인터, 모두 추천대로), 앞 줄기 `work/production-six`(작업 기록 `11-1700-production-six.md`), 가지 `work/production-six-2`

## 한 일
- 946 나: 팩 채집 칸에 선택 칸 `gather.extraSubcategories`(함께 내는 중분류 1~4개)를 더하고, 사다리 = 주 + 함께 내는 중분류(티어마다 한데, 팩 차례)로 시뮬·서버·편집기 미리 보기를 넓혔다. 목장 = 축산물 + 목축 부산물(30개, 팩 core@63). 칸이 없는 시설은 앞 판 그대로.
- 947 나: 시설 칸 `needsWaterWithin`(배치 칸 반경, 낚시터 5)을 더했다. 서버 짓기·NPC 씨앗이 같은 함수(`facilities/water.ts` → `@terra/shared/waterNearby`)로 회전한 건물 칸 둘레 N칸 안 물 칸을 보고, 없으면 `needs_water`(프로토콜 21, 20판 연결은 `blocked_terrain`). 짓기 폼은 tRPC `facilities.waterMask`로 받은 물 표로 미리 보고 물이 없으면 [짓기]를 막는다.
- 설정 칸이 아니라 시설 칸을 고른 까닭: 조건이 시설마다 다르고, 건물 놓기 코드가 이미 시설 칸(칸 크기)을 읽으며, 설정 칸이면 물가 시설 ID를 코드에 박아야 한다(ADR "바뀜").
- 서버가 물을 읽는 길을 먼저 봤다: 서버 2차맵은 배치 칸 지형 비용(물·벼랑·바위가 모두 0)만 들고 있다(Verified: `world/mapTerrain.ts`, `@terra/sim` `layerCosts.ts`). 새 자료 없이 기기에 보내는 지형 파일(TCTR)의 지표 층을 처음 부를 때 한 번 풀어 물 표를 만든다(`world/waterMask.ts`).
- 질문 파일에 답을 적었다(946·947 나 넣음, 948~959 가, 960 사용자 대기). PLAN 14장 줄 하나.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/gatherMath.ts` | `gatherSubcategories`·`gatherLadderKey`·상한 — 사다리 중분류 규칙 한 곳 |
| `packages/shared/src/waterNearby.ts`(새)·`package.json` | 물 표(1비트)·둘레 N칸 판정·돌린 칸·16진수 — 서버·화면 같은 함수 |
| `packages/shared/src/facilityRuntime.ts`·`buildingEditor.ts`·`facilities.ts` | `needsWaterWithin` 범위·편집기 JSON 칸·시설 목록 칸, `extraSubcategories` 편집기 칸, 물 표 응답 타입 |
| `packages/content/src/schema/economy.ts`·`validate/gather.ts` | 두 칸 스키마, 함께 내는 중분류 검사(원자재·겹침 `gather_subcategory_duplicate`) |
| `content/core/facilities.json`·`manifest.json` | 목장 `extraSubcategories: ["livestock_byproduct"]`, 낚시터 `needsWaterWithin: 5`, core@63 |
| `packages/sim/src/simulator/catalog.ts`·`economy/gather.ts`·`economy/production.ts`·`index.ts`·`cli/common.ts` | 사다리 키로 붙잡기, 사다리 산출 레시피 = 산출이 그 중분류들 가운데, CLI 팩 읽기 |
| `apps/server/src/facilities/catalog.ts`·`world.ts` | `gatherLadder(gather)`(중분류 여럿), 정의에 `needsWaterWithin` |
| `apps/server/src/economyView/catalog.ts`·`market/catalog.ts`·`itemEdit/previewGather.ts`·`buildingEdit/views.ts` | 같은 사다리 규칙·칸 싣기 |
| `apps/server/src/world/waterMask.ts`(새)·`world/secondMap.ts` | 2차맵 물 표(지형 파일 지표 층, 처음 부를 때 한 번) |
| `apps/server/src/facilities/water.ts`(새)·`service.ts`·`npcSeed.ts`·`gateway.ts` | 물가 판정, 짓기 거절, 씨앗 자리 고르기, 20판 연결 코드 낮추기 |
| `apps/server/src/facilities/screen.ts`·`appSource.ts`·`views.ts`·`trpc/facilities.ts` | tRPC `facilities.waterMask`, 시설 목록 `needsWaterWithin` |
| `packages/protocol/src/facilities.ts`·`version.ts`·`index.ts` | 결과 코드 `needs_water`, 프로토콜 21(최소 20) |
| `apps/game/src/economy/FacilityPanel.tsx`·`queries.ts`·`facilityText.ts` | 짓기 폼 물가 줄(`data-part="facility-water"`, 물 없으면 경고·[짓기] 막힘), 오류 문구 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`·`buildingModel.ts`·`buildingMessages.ts` | 함께 내는 중분류 고르기, 물가 조건 칸, 검사 문구, 칸 보존 |
| `apps/game/src/editor/production/*` | 사다리 = 중분류 여럿(`ladderOf(items, gather)`), 사다리 중분류 줄 |
| `apps/game/messages/{ko,en}.json` | 새 문구 10개(한·영) |
| 시험: `waterNearby.test.ts`·`content validate/gather.test.ts`·`sim productionSix.test.ts`·`server facilities/catalog.test.ts`·`water.test.ts`·`gateway.test.ts`·`facilities.db.test.ts`·`itemEdit/previewGather.test.ts`·`productionModel.test.ts`·`e2e/facilities.spec.ts`·`e2e/production.spec.ts` | 사다리 여럿·물가 규칙 |

## 함께 바꿔야 하는 파일
- 물 지표 번호를 바꾸면 `@terra/shared/waterNearby` `WATER_SURFACE_CODES`와 `@terra/protocol` `TERRAIN_SURFACE`가 같아야 한다(`world/waterMask.ts` `WATER_CODES_MATCH`, 시험이 본다).
- 배치 칸·지형 칸 비(`PLACEMENT_PER_TERRAIN` 2)를 바꾸면 `WATER_CELLS_PER_TERRAIN`도.
- 다른 줄기가 프로토콜을 21로 올리면 판 하나로 합친다(이 줄기 = 21, 최소 20). 팩도 core@63을 다른 줄기와 합친다.

## 건드리지 말 것
- 확정 ADR 본문(이 줄기는 "바뀜" 구역만 더했다).

## 미검증·TODO·알려진 문제
- Verified: 타입 검사(shared·content·sim·protocol·server·game·e2e), 단위 시험(아래 "검사"), DB 시험(`facilities.db.test.ts`·`npcSeed.db.test.ts` 11개 통과), 시뮬 econ16·war16 시드 1·30일 본문·요약이 core@62와 같음(팩 판·해시·줄 해시만 다름) → `SIM_VERSION` 그대로(22).
- Assumed: 옛 "반경 5칸"의 칸 크기가 새 배치 칸(약 5.9m)과 같다고 봤다(Unknown — 옛 칸 크기를 재지 않았다).
- 낚을 때 물 확인은 따로 하지 않는다(지형이 바뀌지 않아 놓을 때 한 번으로 같다). 어종을 물 종류로 가르는 것(947 다)은 없다.
- 목장 선택은 해금 티어 안 아이템을 고르게 고르므로 축산물·부산물 몫은 티어마다 아이템 수 비율이다(옛 `RANDOM()`과 같은 뜻, 옛 정확한 비율은 Unknown).
- 검사·화면 시험 결과는 아래에 적는다.

## 검사
- (작업 끝에 채움)

## 사용자 결정 대기
- 960(옛 `/dev/gather-tiers` 주소·건물 편집기 채집 구역): 추천 나, 사용자가 화면을 본 뒤.
