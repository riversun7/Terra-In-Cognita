# 사업장 2차: 지급준비금·판매가·거래소 물건 자리·임금 사유재산·운영자 건설·외주 (D-564)

- 일시: 2026-11-15 23:50 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-564(질문 1623·1624·1625·1626·1627·1628·1631·1663·1682 답), ADR `docs/adr/2026-11-15-business-ledger.md` "바뀜 (D-564)",
  `docs/adr/2026-11-15-building-screen.md` "바뀜 (D-564)", `docs/adr/2026-11-07-unit-control.md` "바뀜 (2026-11-15, D-564 1663)", 질문 `docs/questions/2026-11-15-business-2.md`(1781~1790),
  가지 `work/business-2`(바탕 3855652), 프로토콜 40(최소 39), 팩 core@108, SIM_VERSION 그대로, 마이그레이션 `20261115132252_business_reserve`

## 한 일
1. **지급준비금(1623·1624) — 했음**: 정산(손·자동) 때 필요액(열린 임금형마다 다음 정산까지 임금 + 30일분 보증금 모자람) × (1 + 임금 상승 여유) × 지급준비율을 금고에 남기고,
   남긴 돈으로 모자란 보증금부터 채운 뒤 나머지를 지분대로 나눈다(`business/reserve.ts`, `core.ts`). 주인·대주주·운영자가 사업장마다 비율을 고른다(프로토콜 40
   `business_reserve`, `business_states.reserve_pm`, 건물 판 [관리] 칸 카드). 보증금은 있는 만큼만: 새 고용은 금고에 있는 만큼(한 주기 임금 ~ 30일분), 한 주기 임금도 없으면
   그만큼만 적자. 손 채우기는 적자 없이. 정산 구간 임금을 보증금이 못 덮으면 금고 → 적자로 채운다(멈춘 사업장은 채우지 않음). 설정 칸 `business_reserve_margin_pm`(200)·
   `business_reserve_default_pm`(1000).
2. **주인이 정한 판매가(1627) — 했음**: 주인 꺼내기(`storage_move out`·`business_buy`)도 주인이 정한 판매가를 낸다. 0·없음이면 팩 기준 값(질문 1781).
3. **거래소에는 실어 나른 물건만(1628) — 자리만**: 거래소 건물이 없어 지금 거래소 = 도시 창고(사업장 창고 물건은 이미 못 올린다). 규칙을 거는 자리를 `market/exchangeStock.ts`
   하나로 모았다(주문 확인·거래소 설정). 비켜 가는 길 셋(채집소 아닌 시설 꺼내기 즉시 이동, 채집소 고리 없는 산출의 도시 창고 직행, NPC 생산 직행)은 질문 1784.
4. **임금 = 유닛 사유재산(1631) — 했음**: 임금형 임금이 휴먼·사이보그 유닛·NPC 휴먼의 유닛 지갑으로 간다(`labor/wagePurse.ts`). 그 밖은 소유자(D-127). 질문 1782.
5. **운반(1625·1626) — 기록만**: 지금 상태(채집소 꺼내기만 보이는 운반꾼, NPC 물건 직행)와 다음 줄기 계획을 질문 1786에 적었다. NPC 운반은 SIM_VERSION·밸런스가 함께 바뀌는 큰 일.
6. **운영자 건설(1663) — 했음**: 운영자 모드 짓기·레벨 올리기 = 재료 없음 + 시간 0. 땅 규칙(다른 세력 도시)을 건너뛰던 것을 고쳤다(서버 `facilities/service.ts`, 건설 판
   `BuildSheet.tsx`, 안내 문구). 물가·행정 건물 자리·칸 검사는 원래도 봤다. 1665(배율로 나눔)는 3차 답이 대신한다고 읽었다(질문 1787).
7. **외주(1682) — 했음(공방 장비 수리)**: 남의 공방에서도 내 장인·내 재료로 장비를 고치고 요금(재료 기준 값 × `business_service_fee_pm` 200‰)은 그 공방 사업장 금고로(소득세,
   장부 칸 수입 `equipment_repair_fee`). 멈춘 사업장은 받지 않는다. 경제 화면 수리 줄에 내 유닛이 있는 2차맵의 남의 공방·요금이 보인다. 조선소는 boats-3 몫이라 건드리지 않았다.
   공방 일꾼이 맡는 꼴은 질문 1785.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/business/reserve.ts`(새), `core.ts`, `store.ts`, `books.ts`, `commands.ts` | 지급준비금 셈·정산·저장·장부 응답, `reserve` 명령, 주인 판매가, 외주 요금 |
| `apps/server/src/db/businessSchema.ts`, `drizzle/20261115132252_business_reserve/`, `world/persist/tables.ts` | `business_states.reserve_pm`(더하기만) |
| `apps/server/src/labor/service.ts`, `jobBoard.ts`, `wagePurse.ts`(새) | 보증금 있는 만큼·임금 채우기·필요액 고리, 임금 → 유닛 지갑 |
| `apps/server/src/facilities/world.ts`, `service.ts`, `gateway.ts`, `views.ts`, `appSource.ts` | 장부 ↔ 노동 고리, 운영자 건설, 외주 수리, `business_reserve` 받기 |
| `apps/server/src/facilities/serviceTypes.ts`(새) | `service.ts`가 1,000줄을 넘어(1,018) 입력·결과 타입을 나눔(service.ts가 다시 내보낸다, 959줄) |
| `apps/server/src/market/exchangeStock.ts`(새), `market/service.ts`, `market/books.ts` | 거래소 물건 자리 한 곳 |
| `apps/server/src/session.ts` | `business_reserve`(프로토콜 40) → 건물 게이트웨이 |
| `packages/sim/src/economy/laborContract.ts`, `laborJobs.ts`, `index.ts` | `deposit` 선택 칸, `fundLaborDeposit`(기본값은 예전과 같다 — SIM_VERSION 그대로) |
| `packages/sim/src/society/businessCoefficients.ts`, `tuningBusiness.ts`, `content/core/tuning.json`, `manifest.json` | 설정 칸 3개, core@108 |
| `packages/protocol/src/business.ts`, `version.ts`, `index.ts` | 프로토콜 40 `business_reserve`(최소 39) |
| `packages/shared/src/businessBooks.ts`(+시험), `facilities.ts` | `reserveKeep`·`ReserveView`·외주 요금 칸, 수리 공방 `fee`·자리 |
| `apps/game/src/map/business/ReserveTools.tsx`(새), `businessCommands.ts`, `map/building/BuildingPanel.tsx` | [관리] 칸 지급준비금 카드 |
| `apps/game/src/economy/FacilityCards.tsx` | 남의 공방·외주 요금 |
| `apps/game/src/map/construction/BuildSheet.tsx`, `apps/game/messages/{ko,en}.json` | 운영자 건설 땅 규칙, 문구(ko·en) |
| `e2e/labor.spec.ts`, `apps/server/src/roster/worldUnits.db.test.ts` | 새 보증금 규칙(빈 금고 보증금 0·채우기 막힘)·임금 유닛 지갑 |
| 시험: `business.db.test.ts`(지급준비금 새 시험), `commands.test.ts`(판매가), `facilities.db.test.ts`(운영자 땅·시간 0, 외주), `labor.db.test.ts`·`settlement.db.test.ts`·`gateway.test.ts`(새 보증금 규칙·임금 지갑), `e2e/building-screen.spec.ts`(지급준비금·사진) | 규칙이 바뀐 곳 |
| 문서: 질문 `2026-11-15-business-2.md`(새), ADR 셋 "바뀜" | 기록 |

## 함께 바꿔야 하는 파일
- 거래소 건물 줄기(D-561): `apps/server/src/market/exchangeStock.ts` `exchangeGoodsLocation`만 그 건물 창고로 바꾸고 옛 도시 창고 주문을 돌려준다(질문 1784).
- 프로토콜 판: 39는 같은 묶음 다른 줄기 몫으로 비워 두었다. 합칠 때 `version.ts` 설명 차례와 `MIN_SUPPORTED_PROTOCOL_VERSION`을 맞춘다. 팩 106·107도 같은 묶음 다른 줄기 몫.
- 새 사업장 서비스 요금을 만들면 `businessCommands.chargeService`로 받고 `businessBooks.ts` 칸 표에 종류를 더한다.

## 건드리지 말 것
- `apps/server/src/app.ts`(979줄)·`db/schema.ts`(999줄): 이번에 고치지 않았다(표는 `businessSchema.ts`, 명령은 건물 게이트웨이).
- 조선소·배(`apps/server/src/boats/`): boats-3 줄기 몫.

## 리셋 필요 여부
- **필요 없음.** 마이그레이션은 열 하나 더하기(`reserve_pm`, null = 기본값). 직전 판 앱은 이 열을 모르고 그대로 돈다(쓰기 대기열이 열을 쓰지 않음 — 기본값 null). 이미 맺은
  계약의 보증금은 그대로이고, 다음 정산부터 지급준비금이 남는다. 이미 지갑에 든 임금은 그대로(배포 뒤 임금부터 유닛 지갑). 기본 비율 100%라 배포 뒤 첫 정산에서 임금형이 있는
  사업장은 전보다 적게 나눈다(의도).

## 미검증·TODO·알려진 문제
- 멈춘 사업장이면 임금 채우기를 멈추는 길(`suspended`)은 단위 시험이 없다(Assumed: 같은 `core.suspended`를 쓰는 판매 멈춤은 DB 시험이 본다).
- 외주 수리 장인은 고객 유닛이고 위치를 보지 않는다(원래 수리도 장인 위치를 보지 않았다).
- 화면 문구 길이는 390 사진으로만 봤다(아래 검사).
- 검사 결과는 아래 "검사" 절.

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 있음): 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠 core@108 통과, 시험 파일 735개·시험 5,535개 중 5,534 통과·1 실패 →
  실패는 `roster/worldUnits.db.test.ts`(시험 휴먼의 첫 임금 20이 이제 유닛 지갑 = 화물 자리에 보인다 — 규칙 바뀜대로)라 기댓값을 고치고 그 파일만 다시 돌려 통과.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,071 B / 상한 131,416 B(main 110,049 B와 거의 같다 — 지급준비금 카드는 지도 조각).
- Verified `node scripts/check-content.mjs 3855652` 통과(core@108), `node scripts/check-docs.mjs 3855652` 통과.
- Verified 새·고친 시험: `business.db.test.ts` 지급준비금(빈 금고 고용 = 한 주기 임금 적자·임금 유닛 지갑·필요액 × 1.2 × 100% 남김·보증금 30일분 채움·나머지 나눔·비율 권한·0% 모두
  나눔·다시 켜도 비율 유지·null = 기본값), `commands.test.ts` 주인 판매가, `facilities.db.test.ts` 운영자 땅 규칙·시간 0·외주 수리(요금 → 공방 금고·소득세), `labor.db.test.ts`
  8(보증금 있는 만큼·금고 → 적자 채우기·손 채우기 적자 없음·유닛 지갑), `settlement.db.test.ts` 3, 공용 `businessBooks.test.ts`(reserveKeep).
- Verified 화면 시험(빌드한 앱, 헤드리스): `building-screen` 7/7(지급준비금 고르기·되돌리기 새 시험, 관리 칸 사진 새 시험 포함), `facilities` 5/5, `labor` 4/4 — 첫 실행에서
  `labor`가 옛 보증금(464)을 기대해 1개 실패(뒤 사진 3개는 그 시험이 남기는 상태에 기대어 함께 실패) → 새 규칙(빈 금고 보증금 0, 채우기 막힘 = 오류 알림)으로 고쳐 다시 4/4.
- 사진(저장소 밖 `scratchpad/business-2-shots/`, 390): `building-reserve-390-{pastel-ko,dark-en}.png`(지급준비금 카드 — 값은 견본 rewriteTrpc), `building-panel·books·shares·finance-390-*`,
  `labor-*`. 다크 사진은 카드가 판 스크롤 영역보다 길어 아래 고정 띠에 일부 가렸다(요소 사진 잘림, 화면 배치는 정상 — Assumed).
- 미실행: `build-mode`(운영자 건설 안내 문구만 바뀜 — 그 시험은 운영자 건설을 보지 않는다), `economy`(경제 화면 수리 줄은 `facilities`가 본다).

## 사용자 결정 대기
- 질문 1781~1790(`docs/questions/2026-11-15-business-2.md`).
