# 공용 시험 화폐 없애기: 주체의 돈 = 소속 국가 화폐, 외환 보유고·주식 표시

- 일시: 2026-11-23 22:05 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-23-nation-money.md`(새로 씀), `2026-11-07-play-flow.md` WP6(일부 대체 표시)

## 한 일
- 사용자 결정 2026-11-23 "기준통화란 소속한 국가의 화폐를 말한다", "테스트 중이니까 공용시험화폐 그냥 없애라"대로, 서버 돈을 공용 시험 화폐(`s3_test_credit`) 하나에서 주체마다 소속 국가 화폐로 바꿨다.
  - 원장마다 주체 화폐 해석기를 둔다(`world/money.ts` `moneyOf`). 세력 = 그 세력 화폐, 사용자 = 그 사람 나라 화폐, 나라가 없으면 기축 통화.
  - 기축 통화(환전 짝의 기준) = 첫 고정 나라 화폐(`npc/currency.ts` `hubCurrency`). 기축 통화는 환전 짝이 없다.
  - 고정 나라의 처음 국고는 자기 화폐로 한 번(`npc_start:<세력 ID>`), 기축 나라가 아니면 10%를 기축 통화로 더 받는다.
  - 돈을 다루는 서비스(융합·구인·신전·병원·폐허·사이보그·시민권·가문·노동·시설·채집·배·거주·물류·사업장·운영·순위)를 모두 주체의 돈·건물의 돈으로 바꿨다. 건물에서 오가는 돈은 그 도시 주인 나라 화폐다(`facilities/buildingMoney.ts`).
- 화면(사용자 요청 같은 날): 서버가 잔고마다 표시 정보(`AssetTag`)를 붙이고, 화면이 기준 통화 → 외환 보유고(화폐 뒤 국기) → 주식(동전 없이 증서 아이콘, "시설 이름 #건물 번호"·도시)으로 나눠 보인다(`ui/AssetGroups.tsx`). 국고·내 잔고(세력 화면), 지갑(창고 화면), 홈 경제 요약 카드의 보유 자금에 넣었다.
- 화면 문구: "기준 통화"는 소속 국가 화폐를 뜻하게 하고, 환전 화면의 기준은 "기축 통화"로 바꿨다. 옛 시험 화폐 이름은 "공용 화폐"(나라 없는 세계에서만 보인다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/money.ts`(새로)·`money.test.ts` | 주체의 돈 해석기·소각/발행 계정·돈 자산 판정 |
| `apps/server/src/npc/currency.ts`·`economy.ts`·`runtime.ts` | 기축 통화, 처음 국고(자기 화폐 + 기축 통화 몫), 기축 나라도 찍는 나라 표에 |
| `apps/server/src/world/world.ts`·`settlement.ts` | 해석기 걸기, 유지비·지급을 주체의 돈으로, 나라 없는 세계만 옛 자산으로 처음 국고 |
| `apps/server/src/facilities/buildingMoney.ts`(새로) | 건물의 돈 = 그 도시 주인 나라 화폐 |
| `apps/server/src/{fusion,recruit,temple,hospital,ruins,cyborg,citizenship,factionIdentity,governance,cityShares,diplomacy,labor,facilities,gather,boats,market,roster,residence,logistics,business}/…` | 고정 자산 대신 주체의 돈·건물의 돈 |
| `apps/server/src/ops/services.ts`·`factionProfiles.ts` | 운영 지급 자산 별칭 `money`(그 주체의 돈), 기축 통화가 나라 화폐면 "기준 통화" 이름 줄을 만들지 않음 |
| `apps/server/src/ranking/…`·`app.ts` | 기준 = 기축 통화, 세력 국고는 나라 화폐를 함께 센다 |
| `apps/server/src/economyView/assetTags.ts`(새로)·`services.ts`·`worldSource.ts`, `factionScreen/source.ts` | 잔고 표시 정보(기준 통화·외환·주식, 국기·사업장·도시), 보유 응답 `homeCurrency` |
| `packages/shared/src/economy.ts`·`faction.ts` | `AssetTag`·`AssetNation` 타입, `HoldingLine.tag`·`AssetBalance.tag`·`homeCurrency` |
| `apps/game/src/ui/AssetGroups.tsx`·`assetGroups.css`(새로) | 자산 묶음 표시 |
| `apps/game/src/faction/FactionSide.tsx`, `inventory/PlaceCard.tsx`, `home/cards/AssetsCard.tsx`, `sections/screenParts.*` | 국고·잔고·지갑·보유 자금에 적용, 표 한 줄을 다 쓰는 칸(`Fact wide`) |
| `apps/game/messages/{ko,en}.json` | 새 문구 11개, "기준 통화"·"기축 통화" 정리, 안 쓰는 `home_eco_cash_currencies` 지움 |
| `e2e/helpers/wsCommands.ts`·`labor.spec.ts`·`faction.spec.ts` | 지급은 `money` 별칭, 넣기는 내 화폐, 국고 표시 확인·사진 |
| `apps/server/src/market/market.db.test.ts`·`business/commands.test.ts`·`factionIdentity/gateway.test.ts` 등 | 새 규칙에 맞춤(환전 회차 6 → 4: 기축 통화는 짝이 없다) |

## 함께 바꿔야 하는 파일
- 새 서비스가 돈을 다룰 때는 `ASSET_CREDIT`을 쓰지 않고 `moneyOf(ledger, 주체)`나 건물의 돈을 쓴다. `ASSET_CREDIT`은 나라 없는 세계의 시험 잔고용으로만 남겼다.
- 잔고를 화면에 보일 때는 `createAssetTagger`로 표시 정보를 붙이고 `AssetGroups`로 그린다.

## 건드리지 말 것
- `packages/sim`의 `TEST_ASSET_CREDIT`(시뮬 출력이 바뀐다). 시뮬은 이번에 고치지 않았다.
- `market/books.ts` `LEGACY_MARKET_CURRENCY`(화폐 칸이 빈 옛 거래소 줄을 읽는 값).

## 미검증·TODO·알려진 문제
- **Verified**: `pnpm check` 통과(시험 913 파일 6,510개, `TEST_DATABASE_URL` 로컬 Postgres 포함). `pnpm build`·`pnpm check:bundle` 통과(첫 화면 JS 110,367 B / 상한 131,416 B).
- **Verified**(빌드한 서버를 빈 DB로 띄움, 고정 나라 4): 원장에 `s3_test_credit` 계정 0개, `npc_start:` 거래 4건(다시 켜도 4건), 환전 짝 3개, `check-world` 문제 없음. 시험 계정으로 강하 → 정착 지원금 108을 고른 나라 화폐(올더)로 받음, 홈 보유 자금 "108 올더", 세력 화면 국고가 기준 통화·외환 보유고(국기)·주식으로 보임(파스텔, 데스크톱·375px, 가로 넘침 0).
- **미실행**: 화면 시험(`pnpm e2e`) — 이 PC에 Playwright Chromium이 없다(내려받지 않는 규칙). `faction.spec.ts`에 더한 확인·사진, `labor.spec.ts`의 넣기 변경은 돌려 보지 못했다. 다크 테마는 눈으로 보지 못했다(대비 검사만 통과).
- **옛 세계는 새로 시작해야 한다**(`world-reset`). 옛 잔고를 옮기는 코드는 없다. 옛 자료로 켜 보지 않았다(Unknown).
- [임시] 사업장 이름을 사람이 짓는 기능은 없다. 겹치지 않는 이름은 "시설 이름 #건물 번호"다.
- [임시] 가문 금고는 화폐마다 따로이고, 해산 때 가문장의 돈으로 된 몫만 돌려준다. 순위의 세력 국고는 화폐를 환산하지 않고 더한다. 걸린 사업장 지분 사기 주문의 묶인 돈은 순위 셈에서 기축 통화로 친다.
- 지갑(창고 화면)에는 주식이 나오지 않는다(지금도 지분은 지갑에서 뺀다). 주식 표시는 세력 화면의 국고·내 잔고에만 있다.

## 사용자 결정 대기
- NAS 세계를 새로 시작(`world-reset`)할지: 이 변경을 올리기 전에 정해야 한다.
- 사업장 이름 짓기 기능(겹치지 않게 검사)을 따로 만들지.
