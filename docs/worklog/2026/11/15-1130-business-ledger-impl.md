# 사업장 장부 구현(D-548·D-555)

- 일시: 2026-11-15 11:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-business-ledger.md`(확정 — "확정 (D-555)" 절), 질문 `docs/questions/2026-11-15-business-ledger-impl.md`(1621~1633),
  줄기 `work/business-ledger-impl`(base 5221c90f58), 팩 core@100, 프로토콜 34(최소 33), SIM_VERSION 그대로

## 한 일
- WP1 계정 기반: `@terra/shared/businessBooks`(장부 칸 분류·지분 나누기·소득세·적자 계정 코드·유닛 지갑 위치·장부 응답 타입), 서버 `business/core.ts`
  (금고 받기 + 소득세, 적자 미리 넣기·갚기·멈춤, 손·자동 정산, 판매 값), DB `business_states`·`business_prices`(더하기만), 건물 세계에 잇기
  (`facilities/world.ts` — world.ts·app.ts는 고치지 않았다).
- WP2 요금 → 사업장 금고: 신전 헌금·의식, 병원, 연구소(인큐베이터·변환), 정박료·교역 부두 시간·초과 요금, NPC 도시 숙박비. 제 시설도 제 금고로(1514).
- WP3 노동 돈: 임금 보증금·채우기·돌려받기·임대료가 사업장 금고로(`laborAccounts` 선택 인자 — 시뮬 기본값 그대로). 금고가 모자라면 적자, 임대료 소득세.
- WP4 장부 화면: tRPC `facilities.books`(누구나 — 1513), 건물 판(지도에서 건물 누름)에 접는 "장부" 칸(주인·소득세·금고·갚을 돈·멈춤, 1·7·30일 칸별 합계·이익·날마다
  막대, 창고 물건·값·사기, 주인 도구, 최근 거래).
- WP5 정산: `business_settle`(주인·대주주, 금액 선택), 자동 정산(설정 칸 `business_settle_period_ms`, 노화 정시에 판단), 지분 수대로(지금 주인 하나 1주 [임시]).
  `business_invest`(넣기 → 적자 바로 갚기).
- WP6 물건: 채집소 자동 옮김 끔(팩 `gather_obj_station_haul_ms` 0), 사업장 창고 판매 `business_buy`(최소 묶음 10·저급 도시 소매), 값 정하기 `business_price`,
  주인도 값을 내고 꺼냄(`storage_move out`·창고 시설 제외), 레벨업·수리·장비 수리 재료는 그 사업장 창고 먼저.
- WP7 NPC: 돈 흐름은 플레이어와 같다(NPC 건물 금고 → 자동 정산 몫 = 세력 국고, 제 세력 숙소 숙박비도 금고로). **NPC 생산 물건의 시설 창고·운반은 하지 않았다**
  (시뮬 판정이 바뀐다 — 질문 1626).
- WP8 숙박: 유닛 지갑(유닛 화물 위치의 화폐 계정)에서 숙박비, 못 내면 노숙 회복 [임시], `unit_gift`(유닛 화면 "용돈 주기").
- 세력 순위 국고에 그 세력 사업장 금고를 더했다(1512).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/businessBooks.ts`(+시험), `package.json` | 장부 공용 규칙·응답 타입 |
| `packages/sim/src/society/businessCoefficients.ts`, `tuningBusiness.ts`, `coefficients.ts`, `tuning.ts`, `tuningPages.ts`, `index.ts` | 설정 칸 `business_*` |
| `packages/sim/src/economy/laborContract.ts` | `laborAccounts` 시설 주인 쪽 계정 선택 인자(기본값 그대로) |
| `content/core/tuning.json`, `manifest.json` | core@100: 설정 칸 3개, 자동 옮김 0 |
| `packages/protocol/src/business.ts`(+시험), `messages.ts`, `index.ts`, `version.ts`, `facilities.ts` | 프로토콜 34 명령·결과, `insufficient_funds` |
| `apps/server/src/business/*`(core·commands·books·store + 시험 3) | 사업장 장부 서버 |
| `apps/server/src/db/businessSchema.ts`, `schema.ts`, `drizzle/20261115020216_business_ledger/` | 표 2개(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 |
| `apps/server/src/facilities/{world,service,state,catalog,gateway,screen,appSource}.ts` | 건물 세계에 잇기·멈춤·주기 판단·명령·장부 조회·수리 재료 차례·꺼내기 값 |
| `apps/server/src/session.ts` | 사업장 명령 → 건물 게이트웨이 |
| `apps/server/src/temple/places.ts`, `temple/service.ts`, `hospital/service.ts`, `fusion/geneCommands.ts` | 시설 요금 → 금고 |
| `apps/server/src/boats/{harbor,service,core,world}.ts` | 정박·교역 부두 요금 → 장부(소득세), 제 시설도 낸다 |
| `apps/server/src/labor/{service,jobBoard,workerRest}.ts`(+시험) | 보증금·임대료 금고, 적자, 숙박비 = 유닛 지갑 |
| `apps/server/src/npc/economy.ts`, `market/worldInput.ts` | NPC 숙박비 → 숙소 금고 |
| `apps/server/src/ranking/measures.ts` | 순위 국고 + 사업장 금고 |
| `apps/server/src/trpc/facilities.ts` | `facilities.books` |
| `apps/game/src/map/business/*`, `map/gather/GatherPanel.tsx`, `units/UnitDetail.tsx`, `map/mapFeed.ts`, `economy/facilityText.ts`, `messages/{ko,en}.json` | 장부 칸·용돈 주기·문구 |
| `e2e/business-books.spec.ts` | 장부 화면 시험·사진 |

## 함께 바꿔야 하는 파일
- 새 사업장 수입 종류(수업료 등)를 만들면 `business.receive`로 받고 `businessBooks.ts` 칸 표에 더한다.
- 프로토콜 판: 31~33은 같은 묶음 다른 줄기 몫. 합칠 때 `version.ts` 설명을 차례대로 맞춘다.

## 건드리지 말 것
- `apps/server/src/app.ts`(999줄)·`world/world.ts`(987줄): 건물 세계·세션으로 이었다.
- 원장 코어(`packages/sim/src/ledger/`): 바꾸지 않았다(건물 위치 계정·시스템 계정만 쓴다).

## 리셋 필요 여부
- **필요 없음.** 마이그레이션은 표 2개 더하기만. 이미 지갑에 든 돈은 그대로, 배포 뒤 수입부터 금고로. 배포 전 지갑에서 낸 임금 보증금도 돌려받을 때 금고로 간다(정산으로 꺼냄 — 질문 1633).
  직전 판 앱은 새 표를 모르고 그대로 돈다(건물 위치 화폐는 옛 화면이 건물 창고 줄로 보인다 — 돈은 사라지지 않는다).

## 미검증·TODO·알려진 문제
- (결과는 아래 "검사"에 채운다)
- NPC 생산 물건의 시설 창고·운반(1510), 물류 센터(1505), 전쟁 약탈(1511), 지분 매매(1621)는 하지 않았다 — 질문.
- 보증금 30일치 전부를 적자로 잡아 빈 금고 새 사업장은 하루 넘게 갚지 못하면 멈춘다(질문 1624 추천: 한 주기 임금만).
- 건물 짓기 화면의 재료 미리 셈(`materialStockAt`)은 사업장 창고를 세지 않는다(서버는 쓴다) — 화면이 단추를 막을 수 있다. Assumed 드묾.
- 경제 화면 "내 사업장" 묶음 없음(질문 1632).

## 검사

## 사용자 결정 대기
- 질문 1621~1633.
