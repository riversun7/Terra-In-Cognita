# 도시 화폐(도시의 기축 통화) 고르기

- 일시: 2026-11-24 12:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-24-city-money.md`, `2026-11-23-nation-money.md`, 작업 기록 `23-2205-nation-money.md`(같은 가지, 아직 커밋 전)

## 한 일
- 사용자 결정 2026-11-24 "도시는 기축통화로 화폐 한가지를 정해야하며 도시내 모든 사업장은 기축통화로 거래 및 세금을 낸다. … 다른나라 화폐를 고를 수 있으나 동맹국,연합을 화폐를 채택도 가능. 타국가 화폐이용시 국고에 100000개이상 보관필요"를 넣었다.
- 도시마다 화폐 하나(`npc/cityMoney.ts`). 고르지 않으면 주인 나라 화폐. 도시 안의 돈(거래소 값·거래세·사업장 임금·임대료·가게 값·지분·숙박비·집세·물류·배 요금·NPC 임금)은 모두 `economy.cityMoney.of(도시)`로 읽는다.
- 고르기 명령: WebSocket `city_currency` → `city_currency_result`(프로토콜 69, 가장 낮은 지원 판 68). 고르는 사람 = 도시 주인 나라 지도자. 다른 나라 화폐는 국고에 그 화폐가 100,000 이상일 때만.
- 고르면 그 도시 거래소를 새 화폐로 돌린다(걸린 주문은 돌려준다). 도시 주인이 바뀌면 고른 값은 쓰지 않는다.
- 정부 판에 [도시 화폐] 칸: 지금 화폐 + 국기, 지도자에게 고르기 목록(화폐·나라·국고 잔고).
- 화면 말 정리: 환전 짝의 기준을 "기축 통화" → "환전 기준 화폐"로 바꿨다("기축 통화"는 도시 화폐를 가리킨다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/cityMoney.ts`(새로)·`cityMoney.test.ts` | 도시 화폐 규칙·판정·부팅 읽기 |
| `apps/server/src/npc/economy.ts` | 거래소 설정·NPC 사업장·임금이 도시 화폐를 읽는다. `cityMoney`·`setCityMoney` |
| `apps/server/src/npc/npcWages.ts`·`npcLogistics.ts`·`houseCare.ts`·`aiBridge.ts` | 화폐를 도시로 읽는다(전에는 도시 주인) |
| `apps/server/src/facilities/buildingMoney.ts`·`world.ts`, `logistics/haulMoney.ts`, `residence/npcRentWorld.ts`, `roster/appSources.ts`, `cityShares/port.ts`, `market/appSource.ts`·`views.ts`·`service.ts` | 같은 까닭 |
| `apps/server/src/government/cityMoneyPolicy.ts`(새로) | 고르기 판정·저장·감사 기록 |
| `apps/server/src/government/reads.ts`, `packages/shared/src/government.ts` | 정부 판 `money` 칸 |
| `apps/server/src/factionIdentity/gateway.ts`·`attach.ts`, `sessionHouse.ts`, `session.ts` | 가문 소켓이 `city_currency`를 받는다 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261124032826_city_currency/` | `world_cities.currency`·`currency_owner_id`(더하기만) |
| `packages/protocol/src/cityMoney.ts`(새로)·`cityMoney.test.ts`·`messages.ts`·`index.ts`·`version.ts` | 메시지, 프로토콜 69 |
| `apps/game/src/government/CityMoneyPolicy.tsx`·`cityMoneyCommands.ts`(새로), `GovernmentDialog.tsx`, `government.css`, `map/mapFeed.ts` | 화면 칸·명령 |
| `apps/game/messages/{ko,en}.json` | `government_money_*` 13개, 환전 문구 5개 |
| `apps/server/src/market/market.db.test.ts` | 도시 화폐를 바꾸면 거래소가 따라오고 다시 켜도 남는지 |
| `docs/adr/2026-11-24-city-money.md`(새로), `docs/adr/2026-11-23-nation-money.md` | 결정. 앞 ADR은 아직 커밋 전이라 "건물에서 오가는 돈" 줄과 말만 맞췄다 |

## 함께 바꿔야 하는 파일
- 도시 안에서 돈을 다루는 새 코드는 세력 화폐(`economy.currencyOf`)가 아니라 `economy.cityMoney.of(도시)`를 읽는다.
- 가문 소켓 메시지를 더하면 `sessionHouse.ts`(종류·판 문턱·busy 답)와 `session.ts`(case), 기기 `map/mapFeed.ts`(무시할 답)를 같이 고친다.

## 건드리지 말 것
- `world_cities.currency_owner_id`: 고른 주인이다. 지금 주인과 다르면 값을 쓰지 않는 규칙이 여기에 기댄다.

## 미검증·TODO·알려진 문제
- **Verified**: `pnpm check` 통과(915 파일, 시험 6,519개, DB 시험 포함). 그 뒤 더한 DB 시험 1개(`market.db.test.ts` "도시 화폐")는 따로 돌려 통과. `pnpm build`·`pnpm check:bundle` 통과(첫 화면 110,394 B / 상한 131,416 B).
- **Verified**: 빌드한 서버를 빈 DB에 띄워 `world.government`가 도시마다 `money`(화폐 코드·국기·`reserveMin` 100000)를 주는 것, WebSocket `city_currency`가 가문 없는 계정에 `not_in_house`로 답하는 것을 봤다.
- **미실행**: 화면 시험(e2e — 개발 환경에 Playwright Chromium 없음). [도시 화폐] 칸을 눈으로 보지 못했다(정부 판은 2차맵에서 행정 건물을 눌러야 열린다). 지도자 계정으로 실제로 화폐를 바꾸는 흐름(판정 `cityMoneyPolicy.ts`의 가문·지도자 확인)은 시험이 없다 — 규칙 함수와 거래소 돌리기만 시험했다.
- [임시] 국고 조건은 고를 때만 본다. 사업장 금고의 옛 화폐는 그대로 남는다. 시뮬 안의 나라 단위 셈(유지비·도시 운영비 금고)은 주인 나라 화폐 그대로다(ADR "결과").
- 100,000은 코드 상수(`FOREIGN_CITY_MONEY_MIN`)다.

## 사용자 결정 대기
- 국고가 100,000 아래로 줄면 도시 화폐를 되돌릴지(지금은 그대로 둔다).
- NPC 나라도 도시 화폐를 고르게 할지(지금은 고르지 않는다).
