# 사업장 3차: 주인 꺼내기 없앰(판매만)·거래소 반입은 실제 운반만·NPC 운반 시간 (D-569)

- 일시: 2026-11-16 02:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-569(1781 사용자 원문 "주인이 꺼내는 기능은 존재하지 않는다 무조건 판매이고 재무상태로 수익으로 잡혀야한다", 1782·1784·1787 기존 결정으로 답), D-564 1625·1626·1628,
  ADR `docs/adr/2026-11-15-business-ledger.md` "바뀜 (D-569)", `docs/adr/2026-11-15-building-screen.md` "바뀜 (D-569)", 질문 `docs/questions/2026-11-16-business-3.md`(1881~1887),
  답 반영 `docs/questions/2026-11-15-business-2.md`, 가지 `work/business-3`(바탕 5708981), 프로토콜 46(최소 45), 팩·SIM_VERSION 그대로, 마이그레이션 없음

## 한 일
1. **1781 주인 꺼내기 없앰 — 했음**: 주인이 제 사업장 창고(창고 시설이 아닌 시설 건물) 물건을 꺼내는 `storage_move out`은 새 결과 코드 `sale_only`(프로토콜 46, 45판 연결은
   `forbidden`)로 거절한다. 주인도 `business_buy`로 **누구나와 같은 판매가·최소 묶음**에 산다(값 0이면 주인도 못 산다). 주인 지갑 → 사업장 금고가 매출(`business_sale`, 장부 판매
   칸 = 손익계산서)로 잡히고 소득세가 붙는다(Verified: `commands.test.ts`·`business.db.test.ts` — 장부 응답 entries에 `business_sale`). 옛 주인 값 받기(`chargeTake`·`ownerPriceOf`)는
   지웠다. 채집소 자동 옮김(설정 칸, 기본 끔)은 켜면 주인 자동 구매다(`sellTo`, 판매가·지갑이 되는 만큼·최소 묶음). 화면: 건물 판 [장부] 창고 물건의 주인 단추 "값 내고 꺼내기"
   → [사기](값 0이면 없음) + 안내 한 줄, 채집소 판·경제 화면 채집소 카드 [도시 창고로 옮기기] → [판매가로 사서 도시 창고로](`business_buy`), 경제 화면 물건 자리의 내 사업장 창고 줄은
   [꺼내기] 대신 안내.
2. **1784 거래소는 실제 운반만 — 우회 셋 막음**: (가) 채집소가 아닌 시설 건물(창고 시설·임대 몫)의 꺼내기도 운반꾼이 걸어 나른다(`gather/station.ts` haulOut을 시설 건물 모두로
   넓힘 — 운반꾼 = 그 건물 일꾼 → 받을 사람의 그 2차맵 휴먼·사이보그 유닛, 사이보그 본체는 뺌). 운반꾼이 없으면 `unknown_unit`(모두 바쁘면 `unit_busy`). `business_buy`로 산 물건도 같은
   운반꾼이 판 사람 건물 창고 → 산 사람 도시 창고로 나른다(운반꾼 없으면 새 코드 `no_carrier`, 45판은 `busy`). (나) 임금형·직무 배치 산출은 채집소 고리가 없어도 늘 그 건물 창고로
   (`labor/workBook.ts` `businessReceiver`, 예전 `cityReceiver`). (다) NPC 도시 경제의 건물 시설 모두가 산출을 창고로 나르는 시간을 생산 시간에 더한다(예전: 채집소만,
   `npc/economy.ts`·`npc/cityRest.ts` `hauls`). 옮김 셈 끔(`haul_distance_mode` 0)·거리 0이면 예전처럼 바로(채집소와 같은 규칙).
3. **1786 NPC 운반 — 시간 자동 계산까지 했음, 보이는 운반꾼은 설계안·질문**: 위 (다). 보이는 NPC 운반꾼(보는 2차맵에만 휴먼 일정 "운반", 판정은 시간 셈)은 질문 1886 설계안.
   NPC 세력 시설 산출도 판매인가는 질문 1887(추천: 지금 모델 유지 — 바꾸면 SIM·밸런스가 함께 바뀐다).
4. **1782·1787 — 지금대로**, 질문 문서에 답 반영 표시.
5. **1783·1785·1788~1790**: 1783(D-564 2차 정리)·1788(D-555 1504 + D-564 "끊기지 않게")·1789(D-564 1624 "보증금은 있는 만큼만")·1790(D-555 1502)은 기존 결정으로 답이 된다고 보고
   표시했다(Assumed — 기술 판단). 1785(외주 꼴)는 결정 로그로 가를 수 없어 그대로 둔다(통합 쪽이 다시 보낸다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/facilities.ts`·`business.ts`·`index.ts`·`version.ts` | 프로토콜 46(최소 45): 결과 코드 `sale_only`·`no_carrier`, `SALE_ONLY_PROTOCOL_VERSION`·`BUSINESS_CARRY_PROTOCOL_VERSION` |
| `apps/server/src/facilities/gateway.ts` | 45판 연결에 `sale_only` → `forbidden`, `no_carrier` → `busy` |
| `apps/server/src/facilities/service.ts`·`serviceTypes.ts` | 주인 꺼내기 거절, `carryOut`(판매 물건 운반 고리)·`ownerSale`(자동 옮김 주인 구매), 꺼내기 고리에 `sellerId` (969 → 973줄) |
| `apps/server/src/business/commands.ts` | 주인도 같은 판매(같은 값·묶음), 운반꾼 실은 뒤 돈, `sellTo`, `chargeTake`·`ownerPriceOf`·`isStorage` 지움 |
| `apps/server/src/facilities/world.ts` | 장부 명령에 `carry` 잇기 |
| `apps/server/src/gather/station.ts`·`porter.ts`·`world.ts` | 시설 건물 모두의 운반(placeOf·routeOf), 판매 짐(`sourceOwnerId`, 거래 `business_sale_goods`), 운반꾼 후보 `ownUnits`, 자동 옮김 주인 구매 |
| `apps/server/src/labor/workBook.ts`·`service.ts` | 임금형·직무 배치 산출 → 건물 창고(`businessReceiver`) |
| `apps/server/src/npc/economy.ts`·`cityRest.ts` | NPC 건물 시설 모두 옮김 시간(`hauls`) |
| `apps/server/src/market/exchangeStock.ts` | 주석(들어오는 길이 모두 실제 운반) |
| `apps/server/src/facilities/views.ts`, `packages/shared/src/facilities.ts` | 물건 자리 `sale`(내 사업장 물건 — 화면이 [꺼내기] 대신 안내) |
| `apps/game/src/map/business/BooksParts.tsx`·`businessText.ts`, `map/gather/StationPanel.tsx`, `economy/StationParts.tsx`·`StorageParts.tsx`·`facilityText.ts`·`FacilityPanel.tsx`, `messages/{ko,en}.json` | 화면(위 1번), 꺼내기 운반꾼 없음 알림(`facility_move_no_carrier`), 문구 ko·en(새 7개, 안 쓰는 `books_take` 지움) |
| `e2e/facilities.spec.ts` | 야적장 꺼내기가 운반꾼 없이 막히는 것을 본다(예전: 바로 꺼내짐) |
| 시험: `commands.test.ts`(주인 같은 판매·매출 거래·no_carrier·sellTo), `gateway.test.ts`(46·45판 코드), `station.test.ts`(판매 짐·창고 시설 꺼내기 운반꾼·자동 옮김 주인 구매), `business.db.test.ts`(sale_only·주인 사기 = 매출), `station.db.test.ts`(자동 옮김 = 주인 구매), `produce.db.test.ts`(산출 → 건물 창고), `cityRest.test.ts`(`hauls`) | 규칙이 바뀐 곳 |
| 문서: 질문 `2026-11-16-business-3.md`(새), `2026-11-15-business-2.md`(답 반영), ADR 둘 "바뀜 (D-569)" | 기록 |

## 함께 바꿔야 하는 파일
- 프로토콜 판: 42~45는 같은 묶음 다른 줄기 몫으로 비워 두었다. 합칠 때 `version.ts` 설명 차례와 `MIN_SUPPORTED_PROTOCOL_VERSION`(지금 45)을 맞춘다. 45판 기기에 낮추는 코드는
  `facilities/gateway.ts` 두 줄.
- 거래소 건물 줄기(D-561): `market/exchangeStock.ts` `exchangeGoodsLocation`만 그 건물 창고로 바꾸고, 도시 창고 → 거래소 건물도 `station.haulOut` 길로 잇는다.
- 물류센터(운반 대행, D-555 1505): `gather/porter.ts` `pick` 후보 차례(일꾼 → 받을 사람 유닛)에 끼운다.

## 건드리지 말 것
- `apps/server/src/app.ts`·`db/schema.ts`: 고치지 않았다. `facilities/service.ts` 973줄(1,000줄 상한 가까움 — 다음에 더하면 나눈다).
- 시뮬(`packages/sim`): 판정 함수를 바꾸지 않았다(서버 NPC 경제의 옮김 칸 입력만 넓힘) — SIM_VERSION 그대로.

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션이 없다. 이미 도시 창고에 든 물건은 그대로, 배포 뒤 산출부터 건물 창고로 간다. 이미 사업장 창고에 쌓인 주인 몫은 판매로만 나간다(주인은 값을
  정하고 산다). 운반 중인 짐은 예전처럼 메모리라 다시 켜면 운반꾼 화물에 남는다(아래 알려진 문제).

## 미검증·TODO·알려진 문제
- 다시 켤 때 운반 중 짐: 채집소 운반꾼과 같이 메모리다. 판매 짐(산 사람 몫)이 판 사업장 일꾼의 화물에 남으면 자동 옮김(기본 끔)이 켜져 있지 않으면 다시 떠나지 않는다(예전 채집소 짐도
  같다). 산 사람 유닛이 나른 짐은 그 유닛 화물(재료 자리)에 남아 쓸 수 있다.
- NPC 건물 시설 옮김 시간이 늘어 NPC 가공품 생산이 느려진다(서버만 — 시뮬 시나리오는 옮김 칸을 쓰지 않아 그대로). 밸런스 측정은 안 했다(Unknown).
- 운반꾼 후보 `ownUnits`는 그 2차맵 유닛을 모두 돈다(실패·고를 때만 — 봇 1,000 2차맵에서도 한 번 훑기, Assumed 가벼움).
- 검사 결과는 아래 "검사" 절.

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 있음, 잠금 안): 포맷·린트·타입·경계·파일 크기·다국어(7,867키)·디자인 값·콘텐츠 통과, 시험 파일 736개·시험 5,555개 모두 통과. 그 뒤 고친 것
  (`FacilityPanel.tsx` 운반꾼 없음 알림·문구 1개, e2e 두 파일)은 게임 앱 타입·oxlint(그 파일)·다국어(7,868키)만 다시 돌려 통과.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,064 B / 상한 131,416 B(바탕 main 무렵 110,071 B와 거의 같다 — 바꾼 화면은 지연 조각).
- Verified 화면 시험(빌드한 앱, 헤드리스): `building-screen` 7/7(그 뒤 창고 칸 판매 단추 확인·사진을 더해 `--grep "칸·재무"` 2/2), `gather-station` 11/11,
  `facilities` 5/5 — 첫 실행에서 `facilities` 1개가 야적장 꺼내기를 바로 기대해 실패(규칙 바뀜대로: 운반꾼 없음) → 기대를 고치고 알림 문구(`facility_move_no_carrier`)를 더해 다시 5/5.
- 사진(저장소 밖 `scratchpad/business-3-shots/`, 390·1440): `building-goods-390-{pastel-ko,dark-en}.png`(창고 칸 판매 — 값 있는 줄만 [사기]), `building-books·panel·shares·finance·reserve-390-*`,
  `facilities-*`, `gather-station-*`. 견본 장부가 남의 사업장이라 주인 안내 한 줄(`books-sale-note`)은 사진에 없다(미검증 — 화면 그림). 판매 카드 요소 사진은 오른쪽이 잘려 보인다
  (가로 넘침 검사는 통과 — 판 스크롤 영역 잘림, business-2 기록과 같은 꼴, Assumed).
- 미실행: `labor`·`economy`·`market` spec(바꾼 화면이 아님 — 경제 화면 채집소 카드·물건 자리는 `facilities`·`gather-station`이 본다), `check:content`(팩을 바꾸지 않음).

## 사용자 결정 대기
- 질문 1881~1887(`docs/questions/2026-11-16-business-3.md`), 1785(`docs/questions/2026-11-15-business-2.md`).
