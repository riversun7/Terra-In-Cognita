# 건물 런타임: 짓기·레벨업·노화·수리·장비 수리(서버·화면), 영토 비콘도 건물 규칙

- 일시: 2026-11-07 13:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-buildings-runtime.md`(새), `2026-11-02-building-editor.md`·`2026-11-03-item-holdings.md` "바뀜 (2026-11-07 …)", `2026-11-03-territory-layer.md` 상태(일부 대체됨), 질문 360~373 `docs/questions/2026-11-07-buildings-runtime.md`, 기획 49 N50·M14·M15·N54·N51, D-171·D-508·D-509·D-512(336)·D-513·D-514(351), 가지 `work/buildings-runtime`

## 한 일
- 사용자 지시(2026-11-07) "정확한 수치는 밸런싱 단계에서 하는거고 빠르게 시스템을 구축해라": 수치는 모두 [임시] 설정 칸·건물 편집기 값, 모양이 없는 규칙은 옛 규칙(D-507)이나 가장 단순한 기본값으로 넣고 질문 360~373에 적었다(답 전에도 지금 코드로 간다).
- **옛 규칙 대조(AntiGravt01 로컬 사본, 읽기만)**: 짓기 재료 확인·차감·관리자 즉시(`terra-server/routes/building/building_core_routes.js:155~181·231~232`), 시간 식(`game/ConstructionEngine.js:10~21`), 일꾼 가속 일꾼당 20%(`:119~120`), 수리 10%씩·⌈재료 × 비율⌉·즉시(`building_core_routes.js:293~325`), 창고 = 기본 × (1 + (레벨 − 1) × 0.2)(`utils/item/inventory.js:47~51`), 건물 hp(`seeds/building_seed.js`, 주방 `database_init/schema.js:4071~4075`).
- **공용 셈** `@terra/shared/facilityRuntime`: 상태 ppm·문턱(70%·30%·0%), 노화(30%까지 멈춤)·사용 닳음(30% 아래로), 레벨별 최대 내구도·창고 용량, 일꾼 단축(min(50%, 일꾼 × 20%)), 수리 양·재료·시간, 장비 수리 시간(D-514 351 장인 보정).
- **팩 core@38**: 시설 선택 칸 `footprint`·`durability`·`storageKg`(시설 8개에 칸 크기 [임시]·옛 hp), 설정 칸 14개(N50 12·M15 1·N54 1, 계수표 `facilityRuntime`, live), F11·F12 칸에 단위·범위(장비 수리 명령이 생겨 live).
- **서버** `apps/server/src/facilities/`: 표 `world_facilities`·`facility_jobs`(+ 비콘 열 셋, 원장 자산 코드 `item:<ID>` 허용), 서비스(짓기·레벨업·수리·장비 수리·개발 시험 재료·바로 끝내기, 작업 끝 1초·노화 1분), 원장 물자 빼기(`materials.ts`), 조회 `facilities.overview`, WebSocket 게이트웨이(프로토콜 9). 노동 계약 정산이 시설이 일하는지 묻는다(30% 미만·짓는 중 = 산출 없음). 보유 물건: 고치는 중인 물건은 입기·벗기 `busy`.
- **영토 비콘(336)**: 놓을 때 레벨 1 재료를 빼고 건설 시간 뒤에 꼭짓점, 노화(30%에서 멈춤), 30% 미만이면 꼭짓점 아님, 수리 작업. 개발 대신 놓기는 재료 없이 바로(옛 관리자). `beacon_result.insufficient_materials`(8판 연결은 forbidden).
- **프로토콜 9(최소 8)**: `facility_build`·`facility_upgrade`·`facility_repair`·`equipment_repair`·`dev_grant_goods`·`dev_facility_finish` → `facility_result`.
- **화면**: 경제 → 생산 칸, 노동 계약 위 "건물"(일꾼 고르기, 시설 카드 상태 막대·작업·레벨업·수리, 새로 짓기, 장비 수리, 비콘 수리, 내 재료), 문구 96개 ko·en. 건물 편집기 기본 칸에 칸 크기·레벨 1 최대 내구도·창고 용량(문구 7개), 영토 화면 결과 문구 1개.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityRuntime.ts`(새)·`.test.ts`(새, 11개), `facilities.ts`(새), `buildingEditor.ts`, `territoryApi.ts`, `package.json` | 공용 셈·조회 모양, 시설 JSON 칸 셋, 비콘 상태·건설 시간 칸 |
| `packages/content/src/schema/economy.ts` | 시설 선택 칸 셋 |
| `content/core/facilities.json`·`tuning.json`·`manifest.json` | 칸 크기·내구도, 설정 칸 14개, F11·F12 단위·범위, core@38 |
| `packages/sim/src/society/coefficients.ts`·`tuningBuild.ts` | 계수표 `facilityRuntime`·설정 칸 키(시뮬은 읽지 않음) |
| `packages/protocol/src/facilities.ts`(새)·`.test.ts`(새, 3개), `messages.ts`·`index.ts`·`version.ts`·`territory.ts`, `cyborg.test.ts`·`labor.test.ts` | 프로토콜 9, 비콘 재료 코드, 판 시험 |
| `apps/server/src/db/facilitySchema.ts`(새)·`schema.ts`·`territorySchema.ts`, `drizzle/20261107034038_facilities_runtime/` | 표 둘·비콘 열 셋·자산 코드 검사 넓힘(더하기·넓히기만) |
| `apps/server/src/world/persist/tables.ts`, `world/world.ts` | 쓰기 대기열 표, 부팅 복구·잇기(건물 ↔ 노동 계약 ↔ 보유 물건 ↔ 영토) |
| `apps/server/src/facilities/*`(새: `state`·`catalog`·`materials`·`service`·`views`·`screen`·`appSource`·`gateway`·`world`·`testFacilities`, 시험 `facilities.db.test.ts` 5개·`gateway.test.ts` 2개) | 건물 서비스 |
| `apps/server/src/labor/service.ts`·`gateway.test.ts` | `buildingWorks`(30% 미만 산출 없음)·`unitBusy`·`buildingInUse` |
| `apps/server/src/holdings/service.ts`·`serviceTypes.ts`·`world.ts` | 고치는 중 잠금 `locked`·`busy`, `primariesOf`·`statTable`·`setLocked` |
| `apps/server/src/territory/service.ts`·`gateway.ts`·`facility.ts`·`gateway.test.ts`·`territory.db.test.ts` | 비콘 건물 규칙, 8판 연결 코드, 건설 시간, 시험(재료 지급·새 시험 1개) |
| `apps/server/src/tuning/scope.ts` | live 경로(N50·M15·N54·F11·F12·적정 점수) |
| `apps/server/src/buildingEdit/views.ts` | 시설 JSON에 칸 셋(저장 때 사라지지 않게) |
| `apps/server/src/trpc/facilities.ts`(새)·`router.ts`·`context.ts`·`createContext.ts`, `app.ts`, `session.ts` | 조회·게이트웨이·월드 설정 잇기 |
| `apps/game/src/economy/FacilityPanel.tsx`(새)·`FacilityCards.tsx`(새)·`facilityCommands.ts`(새)·`facilityText.ts`(새)·`facilities.css`(새)·`ProductionView.tsx`·`queries.ts` | 건물 칸 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`, `editor/territory/territoryMessages.ts`, `map/mapFeed.ts`, `messages/{ko,en}.json` | 편집기 칸, 결과 코드 표, 새 결과 메시지 거르기, 문구 |
| `e2e/facilities.spec.ts`(새), `e2e/territory.spec.ts` | 화면 시험, 인사 판 9 |
| `docs/adr/…`, `docs/questions/2026-11-07-buildings-runtime.md`(새), `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- (마지막 검사 결과는 아래 "마지막 검사"에 적는다)

## 함께 바꿔야 하는 파일
- 시설 칸을 더하면 `packages/content` 스키마 ↔ `@terra/shared/buildingEditor` `FacilityJson` ↔ `apps/server/src/buildingEdit/views.ts` `facilityJsonOf`(빠지면 편집기 저장 때 그 칸이 사라진다) ↔ `facilities/catalog.ts`.
- 원장에 새 앞머리 자산을 쓰면 DB 검사 `ledger_accounts_asset_format`(앞머리:ID 하나까지).
- 세계 전투가 건물 피해를 내게 되면(질문 372) 결과 적용 같은 동기 처리에서 건물 서비스·영토 서비스 상태를 줄인다.

## 건드리지 말 것
- 노화는 분 단위 고정(작업 끝은 1초). 저장은 ‰가 바뀔 때만 — 저장한 (값, 시각) 짝을 깨지 않는다.
- 관리자 시험 건물(시설 줄 없음)은 늘 일한다(노동 계약 시험이 그것에 기댄다).

## 미검증·TODO·알려진 문제
- 필지·창고 자리·일꾼 직무 멈춤·공격 피해·시설 창고 물건 두기는 다음 줄기(질문 360·361·364·372·373).
- 휴대폰 실기기에서 건물 칸을 보지 않았다(헤드리스 390·1440 사진만).

## 사용자 결정 대기
- 질문 360~373(모양만, 수치 없음).
