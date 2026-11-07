# 창고·직무: 건물 재료 자리(도시 창고·창고 시설·화물), 창고 시설 4종·넣기·꺼내기, 작업 동안 직무 멈춤, 임대 유예 남은 물건

- 일시: 2026-11-07 15:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-buildings-runtime.md` "바뀜 (창고·직무)", `2026-11-03-labor-contracts.md` "바뀜 (시설 창고)", 질문 410~416 `docs/questions/2026-11-07-storage-jobs.md`(새), 기획 D-516(361·364·382 = 기술 추천대로)·D-100·D-117·D-121·D-149·D-171·D-508·D-509·49 N50, 가지 `work/storage-jobs`

## 한 일
- 사용자 지시 D-515("정확한 수치는 밸런싱 단계에서 하는거고 빠르게 시스템을 구축해라"): 수치는 [임시] 팩·설정 칸 값, 모양이 빈 것은 옛 규칙(D-507)이나 가장 단순한 기본값 + 질문 410~416(모양만). 콘텐츠 켬·끔 스위치는 만들지 않았다.
- **차이 목록 먼저**(ADR "바뀜" 표): 364 작업 일꾼 산출 겹침, 361 재료 = 모든 자리 합, 서버에 도시 창고 계정 없음, 382 팩에 창고 시설 없음·시설 창고에 물건 두기 없음, 노동 계약 유예 = 시각만, 개발 재료 = 위치 없음.
- **옛 규칙**: AntiGravt01 `seeds/building_seed.js`의 STORAGE 4종(야적장 1t·창고 10t·중앙창고 100t·대규모 창고 500t, raw·hp·칸 수, 분류 배율 1.0)과 `TerritoryEngine.js`(T0 야적장 영토 밖). 시킨 판 `0ea5299`를 `git show`로 읽는 것은 작업 환경이 막아(다른 저장소를 가리키는 git 명령 금지) 사본 작업 트리(`d13e978`)를 읽었다. 앞 ADR이 `0ea5299`로 적은 줄 번호와 같다(Assumed: 같은 내용).
- **물건 자리** `@terra/shared/goodsPlaces`(새, 순수): 원장 위치 코드(null 자리 없음 · 도시 ID · 10¹² + 건물 ID · −유닛 ID), 칸이 속한 도시 = 같은 2차맵의 가장 가까운 도시(D-100 영향력 경계를 같은 영향력으로 [임시]), 재료 자리 판단·차례(도시 창고 → 그 도시의 내 창고 시설 → 그 2차맵 화물). 화면 합 `materialStockAt`.
- **361 재료 자리**: 짓기·레벨업·수리·장비 수리 재료를 그 자리에서만 뺀다(`facilities/places.ts materialScope`, `materials.ts` scope). 위치 없는 옛 물자는 쓰지 않는다. 1차맵 비콘은 모든 자리 [임시](410). 시설 줄에 `city_id`(지을 때 정함, 직전 판 줄은 칸에서 다시 정해 적음).
- **382 창고 시설**: 팩 core@42 단계 `storage` + `stockpile`·`storehouse`·`warehouse`·`grand_warehouse`(옛 hp·상한·raw를 D-508 꼴로, 칸 크기 [임시]). `storage_move`(프로토콜 12): 넣기 = 그 도시의 내 도시 창고 → 화물 차례로 꺼내 내 창고 시설에(다 지었고 30% 이상, 물자만, 무게 ≤ N50 용량), 꺼내기 = 건물 창고의 내 몫 → 그 도시의 내 도시 창고. 사라진 건물의 물건은 분마다 그 도시 창고로(시설 줄이 없으면 위치 없음).
- **364 직무 멈춤**: 정산이 건물 서비스 `pausesFor`로 작업 구간을 받아 산출 구간에 겹쳐 버린다(`settlement.ts mergePauses`). 작업이 끝나거나 지워지기 전에 그 시각까지 정산(끄고 켜도 같다). 작업 중 유닛은 노동 계약·구인 받기 `unit_busy`.
- **노동 계약 유예**: 임대형 임차인 몫 산출 = 그 건물 창고, 유예가 끝나면 정산 뒤 고리(`afterSettle`)가 남은 몫을 시설 주인 계정(같은 위치)으로(kind `labor_leftovers`). 임금형은 그대로.
- **개발 재료 받기**: 짓는 칸(11판 `mapKey`·`x`·`y`, 없으면 첫 2차맵 가운데 칸)이 속한 도시 창고로. 도시가 없으면 내 첫 유닛 화물, 그것도 없으면 `no_place`.
- **화면**: 건물 칸 미리 셈·단추 막기가 그 자리의 물자로 센다(짓기 폼 "재료 자리" 한 줄), 창고 시설 카드 "창고 든/용량 kg" + 넣기·꺼내기 폼(`StorageParts.tsx`), 맨 아래 "내 창고·화물"(남의 건물 창고 몫은 [꺼내기]). 경제 → 창고 화면은 건물 창고를 "건물 창고 #ID"로. 노동 계약 유예 안내 문구를 실제 동작으로 고침. 문구 ko·en 23개 더함·2개 고침·쓰지 않게 된 2개 지움.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/goodsPlaces.ts`(새)·`.test.ts`(새, 4개), `facilities.ts`, `economy.ts`, `buildingEditor.ts`, `package.json` | 위치 코드·도시·재료 자리 규칙, 조회 모양(`cities`·`places`·`storage`·`storedKg`·`cityId`), 창고 화면 곳 종류, 단계 ID |
| `packages/content/src/schema/economy.ts`, `content/core/facilities.json`·`manifest.json` | 단계 `storage`, 창고 시설 4종, core@42 |
| `packages/protocol/src/facilities.ts`·`index.ts`·`version.ts`, `facilities.test.ts`·`cyborg.test.ts` | `storage_move`·새 코드 셋·개발 받기 자리 칸, 프로토콜 12(최소 11) |
| `apps/server/src/db/facilitySchema.ts`, `drizzle/20261107053945_facility_city/`(새), `world/persist/tables.ts`, `facilities/state.ts` | `world_facilities.city_id` 더하기만 |
| `apps/server/src/facilities/places.ts`(새)·`storage.ts`(새)·`materials.ts`·`service.ts`·`views.ts`·`screen.ts`·`world.ts`·`gateway.ts` | 재료 자리·창고 넣기·꺼내기·돌려놓기·직무 멈춤 구간·화면 자료 |
| `apps/server/src/world/settlement.ts`·`settlement.test.ts`(새, 3개)·`cities.ts`·`world.ts` | 멈춤 겹치기·정산 뒤 고리, 도시 자리(부팅 + NPC 런타임), 잇기 |
| `apps/server/src/labor/service.ts` | 임대 몫 = 건물 창고, 유예 끝 옮기기, 작업 중 유닛 막기 |
| `apps/server/src/session.ts`, `economyView/services.ts` | 11판 메시지 길(가지에서는 12판, 합칠 때 11로 묶음), 건물 창고 곳 |
| 시험: `facilities/facilities.db.test.ts`(1개 더)·`gateway.test.ts`, `labor/labor.db.test.ts`·`gateway.test.ts`, `territory/territory.db.test.ts` | 새 동작·바뀐 함수 모양 |
| `apps/game/src/economy/StorageParts.tsx`(새)·`FacilityPanel.tsx`·`FacilityCards.tsx`·`facilityText.ts`·`facilityCommands.ts`·`facilities.css`·`WarehouseView.tsx`·`economyText.ts`, `editor/buildings/buildingMessages.ts`, `messages/{ko,en}.json` | 화면 |
| `e2e/facilities.spec.ts` | 칸마다 그 도시 창고로 받고 짓기, 야적장 넣기·꺼내기 |
| `docs/adr/2026-11-07-buildings-runtime.md`·`2026-11-03-labor-contracts.md`, `docs/questions/2026-11-07-storage-jobs.md`(새), `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 시뮬 비교(Verified, 시드 1, 20일, 같은 작업 트리에서 바꾸기 전 ↔ 뒤): econ16 275줄·war16 170줄·stub16 83줄 모두 줄 수가 같고, 다른 것은 머리·요약의 팩 판(core@39 → core@42)·해시와 그것이 든 `linesHash`뿐이다 → `SIM_VERSION` 13 그대로(16으로 올리지 않음).
- 작업 중(Verified): 프로토콜 88개, 서버·공용·콘텐츠·게임 경제·건물 편집기 단위 1,115개 통과(DB 시험 211개 건너뜀), DB(`TEST_DATABASE_URL`) 건물·노동 계약·영토·정산 24개 통과, `pnpm check:content` 통과(core@42, 기준 fa2cbbd).
- 화면 시험(Verified, `pnpm e2e`, 빌드한 앱·서버, 헤드리스 Chromium): `facilities.spec.ts` 4개 통과(공방 짓기·레벨업 → 야적장 짓기 → 소나무 넣기 "창고 4/1000kg" → 하나 꺼내기 "2/1000kg", 390·1440 넘침 없음), `labor.spec.ts` 4개 통과(유예 안내 새 문구). 처음 돌림에서 건물 시험이 두 번 실패했다: 칸마다 시험 재료를 받아 사용자별 건물 명령 속도 제한(순간 10번·분당 30번)에 걸려 [바로 끝내기]·[넣기]가 `rate_limited` → 시험이 그 도시 창고에 재료가 모자랄 때만 받고, 창고 옮기기는 토큰이 찰 때까지 다시 누르게(`clickUntil`, 글이 이미 보이면 누르지 않음) 고쳤다. 사진(파스텔 한국어·다크 영어, 390·1440): 창고 시설 카드의 넣기·꺼내기 폼, "재료 자리" 줄(칸 120,120 = 도시 1, 공방·야적장 = 도시 2), "내 창고·화물" 목록. 첫 사진에서 물건 고르기가 좁아 이름이 잘려 폼 칸 비율을 2:1로 넓혔다.
- 끝 검사(Verified, 무거운 잠금 안): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어·대비·콘텐츠·시험 432개 파일 3,553개, DB 시험 포함). 파일 크기 경고에 `facilities/service.ts` 693줄이 더해졌다(실패 아님). `pnpm check:docs`는 커밋 뒤 통과(아래 커밋).

## 함께 바꿔야 하는 파일
- 위치 코드를 바꾸면 `@terra/shared/goodsPlaces`·서버 `world/invariants.ts`(I12 화물)·`holdings`(음수 = 화물)·`world/battleResults.ts cargoLocation`을 함께 본다.
- 재료 자리 규칙은 서버 `facilities/places.ts materialScope`와 화면 `materialStockAt`이 같은 `isMaterialSource`·`sourceOrder`를 쓴다(한쪽만 바꾸지 않는다).
- 프로토콜 11(유전자 줄기 `work/genes-2`)이 먼저 합쳐지면 `version.ts` 판 목록의 11 줄을 그 줄기 설명으로 바꾸고 `cyborg.test.ts`·`facilities.test.ts`의 판 시험을 맞춘다.

## 건드리지 말 것
- 정원사·융합·유전자 줄기 파일(`npc/gardener*`, `fusion/*`, 유전자) — 융합 개발 물자 받기(`dev_grant_goods`)는 위치 없는 계정 그대로다(378은 시설이 생길 때).
- 올라간 마이그레이션(`20261107034038_facilities_runtime`)은 고치지 않았다.

## 미검증·TODO·알려진 문제
- `apps/server/src/facilities/service.ts`가 693줄(600줄 경고, 1,000줄 실패 아님). 장비 수리 명령을 따로 떼면 줄일 수 있다.
- 사라진 건물의 물건 돌려놓기는 분마다라 그 사이 `check-world`에는 걸리지 않는다(건물 창고 위치 불변 조건은 넣지 않음).
- D-121 자동 수납(일을 마치면 가까운 창고로)은 서버 생산이 진짜 물자를 낼 때(지금 산출은 S3 시험 광석).
- 옛 NAS DB의 위치 없는 개발 물자는 짓기에 쓰지 않는다(개발 받기로 다시 받는다). 비콘(1차맵)은 계속 쓴다.

## 사용자 결정 대기
- 질문 410~416(모양만, 답이 없으면 지금 코드).
