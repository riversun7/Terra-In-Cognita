# 지분 시장 2 — NPC 주문·사업장 남는 주문·거래세와 증권 거래소 이용료·국고 주문 거두기·도시마다 독재 과반·국고 지분 사기 (D-587)

- 일시: 2026-11-22 02:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-share-market-2.md`(제안 — 앞 ADR `2026-11-21-share-market.md` 일부 대체 표시), 질문 `docs/questions/2026-11-21-share-market.md`(2471~2480,
  답 반영 표시), 새 질문 `docs/questions/2026-11-21-share-market-2.md`(2521~2530), 줄기 `work/share-market-2`

## 한 일
- 기획 답 D-587(질문 2471~2480 — 코디네이터 전달 요약. 기획 미러에 원문이 아직 없다 **Unknown**)을 반영했다. 답이 정하지 않은 모양은 [임시] + 질문 2521~2530.
- **1. NPC 지분 주문(2471 다)**: 시뮬 고리 `marketShareSale`(@terra/sim SimHooks — 시뮬은 붙이지 않아 직접 양도 그대로, SIM 판 그대로). 서버는 NPC 판단의 지분 팔기를
  정부 지분 시장 팔 주문으로(`cityShares/npcTrade.ts placeNpcSale` — 원장마다 등록표, `npc/governanceHooks.ts`가 찾는다). NPC 나라는 회차마다 기준가 이하 팔 주문을 성향
  규칙식(국고 × 예산 ‰ × 상업 성향 배율)으로 산다(`npcBuyOrders`).
- **2. 사업장 지분 남는 주문(2472 나)**: `createFxMarket` 선택 칸 `rest`(서버만) — 체결된 몫만 정산, 남은 몫은 묶음·차례 그대로. 걸린 줄은 shares = 아직 걸린 주, filled =
  지금까지 체결. 부팅 때 filled도 읽는다(`business/store.ts`).
- **3. 거래세·증권 거래소 이용료(2474 다)**: `cityShares/levy.ts`(판 쪽 → 거래세는 그 도시 주인 나라 국고, 이용료는 그 도시 일하는 증권 거래소 금고 `share_fee`).
  도시 지분(정산 거래 안) + 사업장 지분(정산 뒤 `share_trade_tax`) 모두. 요율 = `business_price` `service:share_fee`(주인이 정함, 없으면 적정 요율 — 설정 칸 3개),
  건물 판 [관리]에 증권 거래소 이용료 칸. 정부 지분 주문 칸에 요율 줄. NPC는 상업 성향 배율 ≥ 설정 칸이면 도시마다 증권 거래소를 짓는다(`npc/cityBuild.ts`).
- **4. 국고 주문 거두기(2473 다)**: 승인된 국고 주문은 걸린 값에 남고 지도자가 `city_share_cancel`로 거둔다. 정부 지분 칸에 국고 주문 목록과 [거두기].
- **5. 도시마다 독재 과반(2477 나)**: 시장 과반 끝·회차 예산을 그 도시 지분으로(의결 셈 `rulingSharePm`은 나라 합 그대로 — 질문 2528).
- **6. 국고 지분 사기 안건(2479 나)**: 새 안건 `treasury_share_buy`(도시·주 수·한 주 가장 높은 값 — 제 나라·남의 나라). 열 때 국고 돈 확인(`not_enough_funds`), 독재 =
  직권, 승인되면 국고 사기 주문(agendaId). 칸 검사·집행은 `governance/shareAgendas.ts`(의결 서비스 상한 — 팔기도 옮겨 서비스는 983 → 960줄). 정부 지분 칸에 국고
  지분 사기 카드(`shares/TreasuryShares.tsx` — 국고 팔기 카드도 이리 옮김). 의결 판에 안건 줄.
- **7. 이름 가리기(2480 기술 기본값)**: 코드 그대로 — 주주 명부 공개, 호가창·회차 기록 이름 없음, 걸린 주문은 내 것·내 나라 국고 것만 [임시 2529].
- 판: 프로토콜 **101**(받는 가장 낮은 판 **100** — 줄기 판, 합칠 때 main + 1), 팩 core **179**(설정 칸 5개 + 회차 칸 설명), SIM 판 그대로(71).
- 마이그레이션 **`20261121170947_share_market_2`**(안건 종류 검사에 `treasury_share_buy` 더하기 — snapshot id `96600b4f-7a5b-4d2e-baa5-d735cd2c2d0c`,
  prevIds = 세 끝 `90e99c42…`·`e44a1520…`·`8ccb7e3f…`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/cityShares/{levy,levyWorld,npcTrade}.ts`(새)·`npcTrade.test.ts`(새) | 거래세·이용료, 세계 값 고리, NPC 주문 |
| `apps/server/src/cityShares/{market,service,port,view}.ts`(+시험) | 거래세·이용료 정산, 도시마다 과반, 지도자 거두기, 국고 사기, NPC 주문 등록·회차, 조회 칸 |
| `apps/server/src/business/{shares,store,books,commands}.ts`(+시험) | 사업장 남는 주문·거래세·이용료, filled 복원, 이용료 요율 조회·정하기 |
| `apps/server/src/governance/{shareAgendas}.ts`(새)·`{service,attach,store,gateway,view,npcVote}.ts` | 국고 지분 사기 안건, 팔기 집행을 모듈로 |
| `apps/server/src/db/governanceSchema.ts`·`drizzle/20261121170947_share_market_2/` | 안건 종류 검사 |
| `apps/server/src/facilities/{world,appSource}.ts`·`market/fxFee.ts` | 사업장 지분 고리, 증권 거래소 요율(`shareFeeOf`) |
| `apps/server/src/factionIdentity/{attach,rules}.ts` | 사기 안건 고리, NPC 지분 규칙 |
| `apps/server/src/npc/{cityBuild,governanceHooks,rulingVault}.ts`(+시험) | NPC 증권 거래소 짓기, 시장 팔기 고리 |
| `packages/sim/src/economy/fxMarket.ts`(+`callAuction.test.ts`)·`simulator/{npcRun,society}.ts`·`simulator/societyShareMarket.test.ts`(새) | 남는 주문 칸, NPC 팔기 고리(시뮬 출력 그대로) |
| `packages/sim/src/{tuningBusiness,society/businessCoefficients}.ts`·`content/core/{tuning,manifest}.json` | 설정 칸 5개, 팩 179 |
| `packages/protocol/src/{governance,business,cityShares,version}.ts` | 안건·필드·코드·이용료 item, 판 101 |
| `packages/shared/src/{cityShares,governance,businessBooks}.ts` | 조회 칸, 안건 종류, 이용료 item·장부 칸 |
| `apps/game/src/shares/{CityShareMarket,TreasuryShares}.tsx`·`map/business/FxFeeService.tsx`·`map/building/BuildingPanel.tsx`·`faction/governance/*`·`messages/{ko,en}.json` | 화면(요율 줄, 국고 주문·거두기, 국고 사기, 증권 거래소 이용료 칸, 안건 줄) — 메시지 18개 ko·en |
| `docs/adr/2026-11-21-share-market-2.md`(새)·`2026-11-21-share-market.md`(상태 줄)·`docs/questions/…` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 합칠 때 판 맞추기: `packages/protocol/src/version.ts`(101·100 → main + 1·main), `governance.ts SHARE_BUY_PROTOCOL_VERSION`, `business.ts` 주석의 101, 팩 core 179.
- 마이그레이션 prevIds는 지금 main의 세 끝 — 그 사이 main에 새 마이그레이션이 들어오면 갈래로 그대로 합친다(다시 만들지 않는다).
- 질문 번호 2521~2530이 main과 겹치면 옮긴다(질문 파일·ADR·코드 주석 `질문 252x`).

## 건드리지 말 것
- 시뮬 판정(`society.sellShares` 직접 양도) — 시뮬은 시장 고리를 붙이지 않는다(SIM 판 그대로).
- 올라간 마이그레이션.

## 검사 (Verified — 실행함)
- 고친 꾸러미 시험: `cityShares` 5파일(+DB 1), `business/shares.test.ts` 5, `npc/cityBuildCoast.test.ts`·`governanceHooks.test.ts`, `governance` DB 시험 묶음(10파일 37),
  `npc/cityBuild*.db.test.ts`, 시뮬 `economy`·`society`·`tuning*`·`societyShareMarket.test.ts`, protocol 192·shared 584 통과. `pnpm check:content --no-compat` core@179 통과.
- 전체 `TEST_DATABASE_URL=… pnpm check`: 포맷·타입·린트·경계·파일 크기·다국어·디자인 값·콘텐츠(core@179) 통과, 단위·DB 시험 **869/869 파일, 6225/6225 시험** 통과.
- `pnpm build` 통과(e2e 전역 준비), `pnpm check:bundle` 첫 화면 JS 110,775 B / 상한 131,416 B(올리지 않음).
- 화면 시험 `e2e/share-market.spec.ts` **9/9 통과**(10.3분 — 정부 지분 칸·사업장 호가창·증권 거래소 판, 390 파스텔·다크 한국어 + 파스텔 영어). 사진 폴더(`E2E_SHOTS_DIR`)는
  주지 않아 사진은 남기지 않았다.

## 미검증·TODO·알려진 문제
- 새 화면 칸(국고 지분 사기 카드·국고 주문 [거두기]·거래세 줄·증권 거래소 이용료 칸)은 화면 시험에 단언이 없다(시험 계정이 그 나라 지도자가 아니다) — 눈으로 보지 않았다(**미검증**).
  서버 길은 DB 시험(`cityShares.db.test.ts` — 직권 국고 사기·돈 모자람·지도자 거두기·남의 거두기 거절)으로 봤다.
- NPC 사기·팔기·이용료가 실제 운영 세계(NPC 경제 + 나라 화폐)에서 쌓이는 모양은 단위 시험·DB 시험(시험 세계)으로만 봤다 — **Unknown**.
- 사업장 지분은 여전히 서버 시험 화폐로 값을 매긴다(D-7010 — 앞 ADR 그대로).

## 사용자 결정 대기
- `docs/questions/2026-11-21-share-market-2.md` 2521~2530.
