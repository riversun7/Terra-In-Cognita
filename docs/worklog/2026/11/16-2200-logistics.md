# 물류센터(운반 대행 사업장): 시설·요금·고른 물류센터 운반·자동 맡기기 (D-576 2213)

- 일시: 2026-11-16 22:00 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 답 D-576(질문 2213 "다"), 기획 D-555 1505·D-560·D-564 1682·D-548·D-570 1822, 질문 `docs/questions/2026-11-16-boats-5.md` 2213(답 표시)·
  `2026-11-16-boats-4.md` 2067, 새 ADR `docs/adr/2026-11-16-logistics-center.md`, 새 질문 `docs/questions/2026-11-16-logistics.md`(2271~2278).
  가지 `work/logistics`(바탕 7b34039 — 묶음 1116o). 프로토콜 70(최소 69), 팩 core@140, SIM_VERSION 80(모두 줄기 판 — 묶을 때 다시 매긴다), 마이그레이션 없음.

## 한 일
1. **시설·데이터**: 팩 시설 `logistics_center`(물류센터 / Logistics center — 교통 단계, 분류 `storage` = 저장·물류(D-560), 최고 레벨 3, 레벨당 일꾼 자리 4, 크기 3×3,
   내구도 250, 짓는 재료 Lv1 소나무 통나무 10·돌 6 / Lv2 판자 10·벽돌 6 [임시], 모습 storehouse). 팩 칸 `logistics: true`(스키마 `packages/content`, 2단계 검사
   `logistics_needs_transport`·`logistics_needs_slots`). 건물 편집기·서버 덮어쓰기 길은 칸을 그대로 돌려보낸다(`buildingModel.ts`·`buildingEdit/views.ts`·
   `@terra/shared/buildingEditor`). 일터 = 병원처럼 산출 없는 자리(`facilities/world.ts medicalSiteOf`) — 직무 배치·노동 계약(임대형·임금형)이 그대로 쓴다.
   설정 칸 둘 `business_haul_unit_g`(100,000g)·`business_haul_unit_cells`(10칸) — 요금 한 단위(질문 2213 요금 단위 나, [임시]).
2. **운반 대행**(`apps/server/src/logistics/haulService.ts` 새 모듈 + `gather/station.ts carry`·`porter.ts pick` 이음):
   - 명령의 `via`가 물류센터 건물 ID면 그 물류센터 일꾼만 운반꾼(누구의 배치·계약이든 — `pick(…, service)`), 내 유닛으로 넘어가지 않는다. 고를 수 있는 곳 = 다 지음·일함·
     멈추지 않음·같은 도시·같은 2차맵·주인 있음, 한 단위 요금 0이면 받지 않음(`service_closed`). 나를 일꾼이 없으면 `no_shop_worker`.
   - 떠날 때 요금 = 한 단위 요금 × ⌈무게 ÷ 100kg⌉ × ⌈칸 ÷ 10⌉(`@terra/shared/logistics`)을 물건 주인 지갑(서버 기준 화폐 [임시])에서 그 사업장 금고로(장부 수입
     `haul_service`, 소득세 — `business/commands.ts chargeService`). 모자라면 `insufficient_funds`(짐은 그대로). 짐의 건물 = 그 물류센터(합치기·닿는 시각·나르는 중
     무게 셈 그대로).
   - 요금은 주인·대주주가 정한다(`business_price` item `service:haul`, 물류센터만, 0 = 받지 않음, 정하지 않으면 적정가). 적정가 = 운반꾼 한 명 시간당 인건비(일꾼 인건비
     합 ÷ 일꾼 수) × 한 단위 나르는 시간(`haulMs`) + 수수료 + 세금(D-570 1822).
   - 맡기는 명령: 거래소 넣기(`storage_move` in → `haulIn`), 배 내리기·싣기(`boat_unload`·`boat_load` → `boats/cargo.ts`). 배 쪽 코드는 `no_shop_worker` → `no_carrier`,
     `service_closed` → `unavailable`, `insufficient_funds` 그대로.
3. **자동 맡기기**: `via: "auto"`면 내 운반꾼(그 건물 일꾼 → 내 유닛)이 없을 때만 같은 도시·2차맵의 받는 물류센터를 한 단위 요금이 싼 차례(같으면 건물 ID)로 보고 나를
   일꾼이 있는 첫 곳에 맡긴다(질문 2271). 설정은 기기 설정 `autoHaul`(기본 끔 — 시세 색과 같은 기기 저장, 질문 2272). 맡길 곳이 없으면 예전 코드(`unknown_unit`·`unit_busy`).
4. **화면**: 경제 > 생산의 내 물건 자리(도시 창고 줄 [거래소로])에 운반 고르기(내 유닛 / 내 유닛, 없으면 물류센터 / 물류센터 #id · 단위당 값 · 일꾼 수, 받지 않는 곳은
   막음)와 "1단위 = 100kg × 10칸"(`StorageParts.tsx ExchangeMoves`, 서버 `facilities.overview` 도시 자리의 `haulCenters`). 건물 판 [관리] "운반 대행 요금" 칸
   (`map/business/HaulService.tsx` — 지금 단위당·적정가·단위·나를 일꾼·[요금 정하기]·[적정가로], 장부 응답 `haulService`). 설정 화면 "물류센터 자동 맡기기" 스위치. 새 문구
   21개·바꾼 문구 3개(`facility_error_no_shop_worker`·`service_closed`·`insufficient_funds`를 공방·물류센터 모두에 맞게) ko·en.
5. **프로토콜 70**(최소 69): `storage_move`·`boat_unload`·`boat_load`의 선택 칸 `via`(건물 ID | `"auto"` — `haulViaSchema`, `LOGISTICS_PROTOCOL_VERSION`),
   `business_price` item `service:haul`. 새 결과 코드 없음. 69판 기기는 `via`를 보내지 않는다(서버는 내 운반꾼으로).
- 못 한 것(질문 문서): 창고 꺼내기·사업장 판매 운반(`haulOut`)은 맡기지 않는다(2273), NPC는 맡기지도 짓지도 않는다(2274), 배 판 고르기 화면 없음(2275 — 서버·프로토콜만).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/facilities.json`·`tuning.json`·`manifest.json`(core@140) | 물류센터 시설, 요금 단위 설정 칸 둘 |
| `packages/content/src/schema/economy.ts`, `validate/facilities.ts` | 팩 칸 `logistics`·2단계 검사 |
| `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`·`version.ts`(SIM 80) | 계수표 칸 `haulUnitG`·`haulUnitCells`(서버만 읽음) |
| `packages/shared/src/logistics.ts`(새)·`.test.ts`(새), `package.json`(내보내기) | 요금 단위 셈·고르기 줄 꼴·가장 싼 곳 |
| `packages/shared/src/businessBooks.ts`, `facilities.ts`, `buildingEditor.ts` | `HAUL_SERVICE_ITEM`·장부 칸 `haul_service`·`HaulServiceView`, 도시 자리 `haulCenters`, 편집기 칸 |
| `packages/protocol/src/facilities.ts`·`boats.ts`·`business.ts`·`index.ts`·`version.ts`·`facilities.test.ts` | 프로토콜 70 `via`·`service:haul` |
| `apps/server/src/logistics/haulService.ts`(새)·`.test.ts`(새) | 고를 수 있는 곳·요금·적정가·판 칸 |
| `apps/server/src/gather/station.ts`·`porter.ts`·`world.ts`·`station.test.ts` | carry의 `via`(고른 곳·자동), 물류센터 일꾼 고르기·나를 수 있는 일꾼 수, 이음 |
| `apps/server/src/boats/cargo.ts`·`service.ts`·`gateway.ts` | 배 내리기·싣기 `via`, 코드 낮춤 |
| `apps/server/src/facilities/world.ts`·`catalog.ts`·`gateway.ts`·`storage.ts`·`views.ts`·`appSource.ts`, `buildingEdit/views.ts` | 일터·haul 서비스 잇기·`service:haul` 값 정하기 고리·도시 자리 고르기 줄·장부 칸 |
| `apps/server/src/business/commands.ts`·`books.ts`·`commands.test.ts` | `service:haul` 값 정하기(물류센터만), 장부 응답 칸 |
| `apps/game/src/economy/StorageParts.tsx`·`facilities.css`, `map/business/HaulService.tsx`(새), `map/building/BuildingPanel.tsx`, `settings/storage.ts`·`settings.ts`·`SettingsPage.tsx`, `editor/buildings/buildingModel.ts`, `messages/{ko,en}.json` | 화면 |
| `e2e/economy.spec.ts`·`building-screen.spec.ts` | 운반 고르기·자동 맡기기 스위치·[관리] 요금 칸 사진 |
| 문서: ADR 새, 질문 2213 답 표시·새 질문 | 기록 |

## 함께 바꿔야 하는 파일
- 판 번호(줄기 판): 프로토콜 70(최소 69)·팩 core@140·SIM 80. 묶을 때 `packages/protocol/src/version.ts` 설명·`LOGISTICS_PROTOCOL_VERSION`·`MIN_SUPPORTED_PROTOCOL_VERSION`,
  `content/core/manifest.json`, `packages/sim/src/version.ts`, ADR·질문의 판 설명을 맞춘다.
- misc-574(운반꾼이 없으면 기다림)와 겹치는 곳: `gather/station.ts carry`(운반꾼을 못 고를 때 — 이 줄기는 그 앞에 `via` 건물 ID 길, 그 자리에 자동 맡기기 한 줄을 넣었다),
  `boats/cargo.ts`(`carried()` 코드 낮춤·`via` 넘기기), `gather/porter.ts pick`(선택 인자 `service`). 기다림을 넣으면 "자동 맡기기 → 그래도 없으면 기다림" 차례로 맞춘다.
- 창고 꺼내기·사업장 판매 운반에 맡기기를 넣으면(2273) `haulOut`을 `carry`로 옮기며 `via`를 넘긴다.

## 건드리지 말 것
- `world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts` 999줄 — 이 줄기는 손대지 않았다. 자동 맡기기 설정을 계정에 두려면 `user_settings` 열(=`db/schema.ts`)이라 새 모듈 파일로.
- 물류센터를 창고 단계로 바꾸지 않는다(창고 단계 = 물건을 넣는 창고·채집소 옮김 목적지로 읽힌다).

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션이 없다(요금은 사업장 값 표의 새 줄, 운반 중 짐은 예전처럼 메모리). 팩은 시설·칸 더하기뿐(지운 ID 없음, `id-changes.json` 그대로).
  배포 뒤 바로 느껴질 바뀜: 건축 목록에 물류센터가 생긴다, 거래소로 옮기기에 그 도시 물류센터 고르기가 보인다(물류센터가 있을 때만), 공방 외주 수리 오류 문구가 넓어진다.
- 69판 기기는 70 서버에 붙는다(`via` 없이 예전처럼). 68판 이하는 새 앱을 받는다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·경계·크기·다국어(8,227키)·디자인 값(738쌍)·콘텐츠(core@140 2d784d45c96a) 통과,
  시험 파일 **781/781**, 시험 **5,836/5,836**. 그 뒤 바꾼 것은 e2e 단언 한 줄(`toBeDisabled` → `toHaveAttribute("disabled")`)·이 기록뿐(biome check 통과).
- `pnpm check:content 7b34039f27`: core@140 단계 1·2·4a·4b 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,836 B / 상한 131,416 B.
- 작업 중: 새 시험 `logistics/haulService.test.ts`(4)·`station.test.ts` 물류센터 길(1)·`business/commands.test.ts` service:haul(1)·`packages/shared/src/logistics.test.ts`(3)·
  `packages/protocol/src/facilities.test.ts` via·service:haul, 서버·게임 타입 검사.
- 화면 시험(빌드한 앱, 헤드리스, 잠금 안): `building-screen.spec.ts --grep 관리` 4/4 통과, `economy.spec.ts --grep 물류센터` 첫 실행 2 실패(Playwright `toBeDisabled`가
  `<option disabled>`를 enabled로 읽음 — 화면 자료 트리에는 `[disabled]`로 바르게 그려짐) → 속성 단언으로 고쳐 다시 2/2 통과.
- 사진(눈으로 봄, 가로 넘침 단언 통과): 건물 판 [관리] 운반 대행 요금 칸(pastel ko·dark en 390), 거래소로 옮기기 운반 고르기(pastel ko·dark en 390), 설정 자동 맡기기
  스위치(pastel ko·dark en 390) — 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/logistics/shots/`. 390px에서 닫힌 고르기 칸은
  긴 물류센터 줄 끝(일꾼 수)이 잘려 보인다(펼치면 다 보임 — 기존 고르기와 같은 꼴). dark [관리] 사진은 판 머리·아래 줄에 칸이 일부 가려진다(외주 수리 사진과 같음).
- 미실행: `boats`·`labor`·`facilities` spec(배 판은 바꾸지 않음), `pnpm check:docs`는 커밋 뒤.

## 미검증·TODO·알려진 문제
- 물류센터 일꾼이 실제로 맡긴 짐을 지고 걷는 모습은 단위 시험(station carry via — 가짜 2차맵)만, 화면에서 눈으로 보지 않았다(미검증).
- 배 내리기·싣기 `via`는 서버 길만 있다(배 판 고르기 화면 없음 — 2275). 배 상하역 `via` 단위 시험은 없다(station carry 시험이 같은 길을 본다).
- 싣기가 두 자리(거래소 건물·도시 창고)에서 꺼내면 운반마다 요금을 따로 낸다 [임시](2276).
- 물류센터 일꾼 수가 많아도 짐 하나 = 운반꾼 하나(2278).

## 사용자 결정 대기
- 질문 2271~2278(`docs/questions/2026-11-16-logistics.md`).
