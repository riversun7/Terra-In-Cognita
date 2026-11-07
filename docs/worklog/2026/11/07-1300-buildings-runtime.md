# 건물 런타임: 짓기·레벨업·노화·수리·장비 수리(서버·화면), 영토 비콘도 건물 규칙

- 일시: 2026-11-07 13:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-buildings-runtime.md`(새), `2026-11-02-building-editor.md`·`2026-11-03-item-holdings.md` "바뀜 (2026-11-07 …)", `2026-11-03-territory-layer.md` 상태(일부 대체됨), 질문 360~369·379~382 `docs/questions/2026-11-07-buildings-runtime.md`, 기획 49 N50·M14·M15·N54·N51, D-171·D-508·D-509·D-512(336)·D-513·D-514(351), 가지 `work/buildings-runtime`

## 한 일
- 사용자 지시(2026-11-07) "정확한 수치는 밸런싱 단계에서 하는거고 빠르게 시스템을 구축해라": 수치는 모두 [임시] 설정 칸·건물 편집기 값, 모양이 없는 규칙은 옛 규칙(D-507)이나 가장 단순한 기본값으로 넣고 질문 360~369·379~382에 적었다(답 전에도 지금 코드로 간다).
- **옛 규칙 대조(AntiGravt01 로컬 사본, 읽기만)**: 짓기 재료 확인·차감·관리자 즉시(`terra-server/routes/building/building_core_routes.js:155~181·231~232`), 시간 식(`game/ConstructionEngine.js:10~21`), 일꾼 가속 일꾼당 20%(`:119~120`), 수리 10%씩·⌈재료 × 비율⌉·즉시(`building_core_routes.js:293~325`), 창고 = 기본 × (1 + (레벨 − 1) × 0.2)(`utils/item/inventory.js:47~51`), 건물 hp(`seeds/building_seed.js`, 주방 `database_init/schema.js:4071~4075`).
- **공용 셈** `@terra/shared/facilityRuntime`: 상태 ppm·문턱(70%·30%·0%), 노화(30%까지 멈춤)·사용 닳음(30% 아래로), 레벨별 최대 내구도·창고 용량, 일꾼 단축(min(50%, 일꾼 × 20%)), 수리 양·재료·시간, 장비 수리 시간(D-514 351 장인 보정).
- **팩 core@39**(합칠 때 38 → 39): 시설 선택 칸 `footprint`·`durability`·`storageKg`(시설 8개에 칸 크기 [임시]·옛 hp), 설정 칸 14개(N50 12·M15 1·N54 1, 계수표 `facilityRuntime`, live), F11·F12 칸에 단위·범위(장비 수리 명령이 생겨 live).
- **서버** `apps/server/src/facilities/`: 표 `world_facilities`·`facility_jobs`(+ 비콘 열 셋, 원장 자산 코드 `item:<ID>` 허용), 서비스(짓기·레벨업·수리·장비 수리·개발 시험 재료·바로 끝내기, 작업 끝 1초·노화 1분), 원장 물자 빼기(`materials.ts`), 조회 `facilities.overview`, WebSocket 게이트웨이(프로토콜 9). 노동 계약 정산이 시설이 일하는지 묻는다(30% 미만·짓는 중 = 산출 없음). 보유 물건: 고치는 중인 물건은 입기·벗기 `busy`.
- **영토 비콘(336)**: 놓을 때 레벨 1 재료를 빼고 건설 시간 뒤에 꼭짓점, 노화(30%에서 멈춤), 30% 미만이면 꼭짓점 아님, 수리 작업. 개발 대신 놓기는 재료 없이 바로(옛 관리자). `beacon_result.insufficient_materials`(8판 연결은 forbidden).
- **프로토콜 10(최소 9, 합칠 때 9 → 10)**: `facility_build`·`facility_upgrade`·`facility_repair`·`equipment_repair`·`dev_facility_grant`·`dev_facility_finish` → `facility_result`.
- **화면**: 경제 → 생산 칸, 노동 계약 위 "건물"(일꾼 고르기, 시설 카드 상태 막대·작업·레벨업·수리, 새로 짓기, 장비 수리, 비콘 수리, 내 재료), 문구 96개 ko·en. 건물 편집기 기본 칸에 칸 크기·레벨 1 최대 내구도·창고 용량(문구 7개), 영토 화면 결과 문구 1개.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityRuntime.ts`(새)·`.test.ts`(새, 11개), `facilities.ts`(새), `buildingEditor.ts`, `territoryApi.ts`, `package.json` | 공용 셈·조회 모양, 시설 JSON 칸 셋, 비콘 상태·건설 시간 칸 |
| `packages/content/src/schema/economy.ts` | 시설 선택 칸 셋 |
| `content/core/facilities.json`·`tuning.json`·`manifest.json` | 칸 크기·내구도, 설정 칸 14개, F11·F12 단위·범위, core@39 |
| `packages/sim/src/society/coefficients.ts`·`tuningBuild.ts` | 계수표 `facilityRuntime`·설정 칸 키(시뮬은 읽지 않음) |
| `packages/protocol/src/facilities.ts`(새)·`.test.ts`(새, 3개), `messages.ts`·`index.ts`·`version.ts`·`territory.ts`, `cyborg.test.ts`·`labor.test.ts` | 프로토콜 10, 비콘 재료 코드, 판 시험 |
| `apps/server/src/db/facilitySchema.ts`(새)·`schema.ts`·`territorySchema.ts`, `drizzle/20261107034038_facilities_runtime/` | 표 둘·비콘 열 셋·자산 코드 검사 넓힘(더하기·넓히기만) |
| `apps/server/src/world/persist/tables.ts`, `world/world.ts` | 쓰기 대기열 표, 부팅 복구·잇기(건물 ↔ 노동 계약 ↔ 보유 물건 ↔ 영토) |
| `apps/server/src/facilities/*`(새: `state`·`catalog`·`materials`·`service`·`views`·`screen`·`appSource`·`gateway`·`world`·`testFacilities`, 시험 `facilities.db.test.ts` 5개·`gateway.test.ts` 2개) | 건물 서비스 |
| `apps/server/src/labor/service.ts`·`gateway.test.ts` | `buildingWorks`(30% 미만 산출 없음)·`unitBusy`·`buildingInUse` |
| `apps/server/src/holdings/service.ts`·`serviceTypes.ts`·`world.ts` | 고치는 중 잠금 `locked`·`busy`, `primariesOf`·`statTable`·`setLocked` |
| `apps/server/src/territory/service.ts`·`gateway.ts`·`facility.ts`·`gateway.test.ts`·`territory.db.test.ts` | 비콘 건물 규칙, 9판 연결 코드, 건설 시간, 시험(재료 지급·새 시험 1개) |
| `apps/server/src/tuning/scope.ts` | live 경로(N50·M15·N54·F11·F12·적정 점수) |
| `apps/server/src/buildingEdit/views.ts` | 시설 JSON에 칸 셋(저장 때 사라지지 않게) |
| `apps/server/src/trpc/facilities.ts`(새)·`router.ts`·`context.ts`·`createContext.ts`, `app.ts`, `session.ts` | 조회·게이트웨이·월드 설정 잇기 |
| `apps/game/src/economy/FacilityPanel.tsx`(새)·`FacilityCards.tsx`(새)·`facilityCommands.ts`(새)·`facilityText.ts`(새)·`facilities.css`(새)·`ProductionView.tsx`·`queries.ts` | 건물 칸 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`, `editor/territory/territoryMessages.ts`, `map/mapFeed.ts`, `messages/{ko,en}.json` | 편집기 칸, 결과 코드 표, 새 결과 메시지 거르기, 문구 |
| `e2e/facilities.spec.ts`(새), `e2e/territory.spec.ts` | 화면 시험, 인사 판 = 지금 판(`PROTOCOL_VERSION`) |
| `docs/adr/…`, `docs/questions/2026-11-07-buildings-runtime.md`(새), `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 시뮬 비교(시드 1, 이 가지 코드에 이 가지 팩 core@38 ↔ main 팩 core@37 `--pack`): war16 30일 236줄·stub16 180일 421줄·econ16 60일 817줄 모두 줄 수가 같고, 다른 줄은 머리(팩 판·해시)와 요약의 팩 판·해시·`linesHash`뿐이다(본문 줄 바이트까지 같음). main → 이 가지 `linesHash` war16 be74f1f5 → f93bacee, stub16 d4421787 → c834bcd2, econ16 38524eb6 → 9e7c68e3(머리가 바뀐 몫). 시뮬은 건물 셈·새 칸을 읽지 않는다 → `SIM_VERSION` 12 그대로.
- 새 시험: 공용 셈 `facilityRuntime.test.ts` 11개, 프로토콜 `facilities.test.ts` 3개, 서버 `facilities/gateway.test.ts` 2개, DB `facilities/facilities.db.test.ts` 5개(공방 짓기 = 소나무 12·철광석 7·일꾼 하나 20% 단축·짓는 동안 일하지 않음·일꾼 바쁨·레벨업 판자 48 / 5일 65%·35일 30% 멈춤·임금형 계약 하루 23%·기능 정지·그 계약 산출 없음 / 수리 65% → 끝까지 = 소나무 ⌈12 × 0.35⌉ = 5·시간 87.36초·끝나면 가득 − 고치는 동안 노화 70ppm / 조끼 내구도 40/100 → 철 주괴·사슴 가죽 1씩·10분 × 0.6 = 360초·고치는 동안 입기 busy·끝나면 최대 감소(F11)·끝까지 / 짓다가 끄고 5일 뒤 켜면 작업이 돌아와 그 시각으로 끝나고 65%), `territory.db.test.ts` 새 1개(재료 모자람·소나무 9개 빠짐·짓는 동안 꼭짓점 아님·개수는 셈·30일 뒤 30%·내구도 3·수리). 기존 영토 DB 시험은 놓는 사람에게 재료를 준다(건물 규칙).
- 처음 돌렸을 때 실패를 고쳤다: ① DB 원장 자산 코드 검사가 `item:<ID>`를 막았다 → 검사를 넓힘(마이그레이션 같은 폴더에 다시 만듦, main에 올라가기 전). ② 설정 칸 반영 범위 시험: live 칸은 단위·범위가 있어야 한다 → F11·F12 칸에 `pct`·`points`. ③ 화면 시험: 일꾼 고르기 칸 32px(작은 누르는 곳) → `--tap-size`. ④ 노동 계약 화면 시험이 admin의 첫 시설을 시험 건물로 여겼다(건물 시험이 먼저 공방을 지음) → 시험 건물을 골라 쓴다(계약·구인·임대료 줄).
- `TEST_DATABASE_URL=… pnpm check` 통과(origin/main `064fd98`을 합친 뒤): 시험 422파일 3,486개(DB 시험 포함, 건너뜀 없음), 다국어 3,874키, 대비 738쌍, 모듈 경계·파일 크기(`world.ts` 926줄·`db/schema.ts` 984줄 — 다음에 표를 더하면 `<영역>Schema.ts`로). `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` 통과(첫 화면 JS 105,930 B / 상한 131,416 B — 건물 칸은 경제 생산 지연 조각 안). `pnpm check:content origin/main` 통과(core@38, 4b 호환 포함). `pnpm check:docs`·`pnpm docs:index` 통과.
- 화면 시험 `pnpm e2e facilities.spec.ts labor.spec.ts territory.spec.ts economy.spec.ts`: 35개 통과(3.7분). 새 `facilities` 4개: 개발 [시험 재료 받기] → 빈 칸 찾아 공방 짓기(짓는 중·작업 줄) → [바로 끝내기] → Lv1·정상·100%·300/300 → Lv2 올리기 → Lv2·360/360, 고칠 장비 없음 안내, 넘침 없음, 사진 4장.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/facility-shots/facilities-{pastel-ko-390,dark-en-390,pastel-ko-1440,dark-en-1440}.png`(건물 칸) + 같은 실행의 economy·labor·territory 사진. 눈으로 확인: 390 파스텔 한국어, 390 다크 영어, 1440 다크 영어(이때 "0% 수리"로 보이던 작은 닳음은 올림으로 고쳤다).

## 함께 바꿔야 하는 파일
- 시설 칸을 더하면 `packages/content` 스키마 ↔ `@terra/shared/buildingEditor` `FacilityJson` ↔ `apps/server/src/buildingEdit/views.ts` `facilityJsonOf`(빠지면 편집기 저장 때 그 칸이 사라진다) ↔ `facilities/catalog.ts`.
- 원장에 새 앞머리 자산을 쓰면 DB 검사 `ledger_accounts_asset_format`(앞머리:ID 하나까지).
- 세계 전투가 건물 피해를 내게 되면(질문 381) 결과 적용 같은 동기 처리에서 건물 서비스·영토 서비스 상태를 줄인다.

## 건드리지 말 것
- 노화는 분 단위 고정(작업 끝은 1초). 저장은 ‰가 바뀔 때만 — 저장한 (값, 시각) 짝을 깨지 않는다.
- 관리자 시험 건물(시설 줄 없음)은 늘 일한다(노동 계약 시험이 그것에 기댄다).

## 미검증·TODO·알려진 문제
- 필지·창고 자리·일꾼 직무 멈춤·공격 피해·시설 창고 물건 두기는 다음 줄기(질문 360·361·364·381·382).
- 휴대폰 실기기에서 건물 칸을 보지 않았다(헤드리스 390·1440 사진만).

## 사용자 결정 대기
- 질문 360~369·379~382(모양만, 수치 없음).
