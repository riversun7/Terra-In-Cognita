# 플레이 흐름 WP4: NPC 도시 경제가 돌고, 도시마다 물자 거래소에서 유저가 사고판다

- 일시: 2026-11-07 19:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP4 도시 경제·거래소"(새 문서, 이 절만), `2026-10-31-economy-core.md` "바뀜 (2026-11-07 …)", 질문 530~538 `docs/questions/2026-11-07-play-economy.md`(새), 사용자 지시(2026-11-07 원문 "풀레이 흐름대로 가능하게 제작해라 … 기본 npc국가 및 기본 건물들 및 도시경제 돌아가게 하자"), D-013·D-117·D-125·D-128·D-150·D-323·D-513·D-515, 가지 `work/play-economy`(main `cd2ceda` 위)

## 한 일
- 사용자 지시 D-515: 수치는 [임시](거래 판단 1시간·주문 10개·만료 1·3·7일·매입 90%·처음 창고 48시간·도시 직무 Lv1), 모양이 빈 것은 기본안 + 질문 530~538(모양만). 콘텐츠 켬·끔 스위치는 만들지 않았다. 운영 스위치는 기획에 있는 N53(`n53_market_enabled`·`n53_production_enabled`)만 읽는다.
- **1. NPC 도시 경제**(`apps/server/src/npc/economy.ts`, 런타임 `npc/runtime.ts`에 연결): 거울 세계에 시뮬 경제 자료를 차리고 시뮬과 같은 실행(`runEconomy`)으로 생산·생필품 유지비(정시)·NPC 거래 판단(1시간)·운송(즉시)을 같은 루프에서 돌린다. 세력·사회·NPC 판단에 경제 고리(생필품 충족·거래세 배당·세율 규칙식·도시 주인 바뀜·폐허·세력 사라짐). 생산 = 그 도시 NPC 시설(건물 서비스의 다 지은 시설, WP1 씨앗) + 그 종류 건물이 없는 기본 직무(농장 곡물·주방 배급 식량·벌목장 원목), 일꾼 = 휴먼을 시설마다 돌려 자리 수까지. 처음 창고 = 도시마다 한 번 생필품 48시간분(`npc_endow:<도시>`). 도시 매입 호가(서버만) = 자기 도시 모자란 물건을 지난 값 90%로. 하루 줄은 서버 기록 `npc economy day`(`npcEcon`), 1분 지표 `econProduced`·`econTrades`·`econBids`·`econExpired`·`econFacilities`.
- **시뮬**(`packages/sim`): `attachEconomy`에서 경제 실행을 `runEconomy`로 떼고(셈 그대로), `scheduleProduce`·`npcTrade`의 목표 재고 `cityTargets`·기준값 `marketRefPrice`를 내보냈다. 내보내기 추가: `Economy`·`EcoFacility`·`EVENT_*`·`checkEconomy`·`scheduleEconomy`·`runEconomy`·`onTrade`·`ScenarioEconomy`. 출력 그대로(시험·골든 해시 통과), `SIM_VERSION` 16 그대로.
- **2. 서버 물자 거래소**(`apps/server/src/market/`): `books.ts` 거래소 모음(도시 × 물건 처음 쓸 때 만들기, 시뮬 `createGoodsMarket`를 감싸 바꾸는 호출마다 주문·체결 줄 쓰기, 체결 알림, 만료, 부팅 복원, 없는 도시 닫기), `load.ts` 부팅 읽기, `catalog.ts` 서버 경제 목록(화면 목록 + 실효 아이템·시설·채집 확률표 → 시뮬 목록, 호가창 물건 = `marketKindOf` book), `service.ts` 유저 주문 넣기·취소(정산 뒤 내 도시 창고·지갑에서 묶음, 지정가·시장가, 주문 10개, 커밋 뒤 답), `gateway.ts` WebSocket(속도 제한·차례 처리·체결 알림 켠 연결), `views.ts` 화면 자료, `appSource.ts`·`worldInput.ts` 월드 잇기. 표 `market_books`·`market_orders`·`market_trades`(`db/marketSchema.ts`, 마이그레이션 `20261107092312_market`, 더하기만), 쓰기 대기열 표 셋(`world/persist/tables.ts`), 불변 조건 M1(`world/invariants.ts`).
- **프로토콜 14**(`packages/protocol/src/market.ts`, 최소 13): `market_place`·`market_cancel`·`market_watch` → `market_result`, `market_fill`. 판 숫자를 박은 시험(cyborg·facilities·ruins)을 14·13으로.
- **3. 경제 화면 실제 자료**(`economyView/services.ts`·`worldSource.ts`): 시안이 아니고 도시 경제가 돌면 거래 물건·도시별 값·호가창·체결·봉·내 몫·남은 주문 수·내 주문·기준 도시 생산이 `ready`. 환전은 `not_ready`(시험 화폐 하나 — 질문 534, 화면 문구에 적음).
- **4. 화면**(`apps/game/src/economy/`): 주문표 [매수 주문]·[매도 주문](`market/marketCommands.ts`, 결과 알림, 조건 주문 잠금, 보낸 뒤 수량 비움·다시 받기), 거래창·내 주문의 [취소](`market/CancelOrderButton.tsx`), 거래창을 연 동안 체결 알림, 생산 칸 = 기준 도시 생산(도시 직무 표, 반복 예약·급여·예약 단추는 시안에서만), 시험 화폐 이름(`economyText.ts` `currencyName`), 메시지 25개 ko·en(`market_*`)과 환전 곧 열림 문구. 1차맵 피드(`map/mapFeed.ts`)는 새 서버 메시지를 거른다(두 줄, WP2 파일).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/economyRun.ts`·`economy.ts`·`npcTrade.ts`·`index.ts` | 서버가 같은 경제 실행·NPC 거래 규칙을 쓰게 떼고 내보냄(셈 그대로) |
| `packages/protocol/src/market.ts`(새)·`messages.ts`·`index.ts`·`version.ts`·`market.test.ts`(새)·`cyborg.test.ts`·`facilities.test.ts`·`ruins.test.ts` | 거래소 메시지, 프로토콜 14(최소 13) |
| `apps/server/src/npc/economy.ts`(새)·`npc/runtime.ts` | NPC 도시 경제를 런타임 루프에 붙임(runtime 621 → 659줄) |
| `apps/server/src/market/*`(새) | 거래소 모음·부팅 읽기·목록·명령·게이트웨이·화면 자료·월드 잇기, 단위 시험 `books.test.ts`, DB 시험 `market.db.test.ts` |
| `apps/server/src/db/marketSchema.ts`(새)·`db/schema.ts`·`drizzle/20261107092312_market/` | 거래소 표 셋 |
| `apps/server/src/world/persist/tables.ts`·`world/invariants.ts` | 쓰기 대기열 표·불변 조건 M1 |
| `apps/server/src/world/world.ts` | 경제 목록 설정 칸 하나, NPC 런타임에 경제 입력 한 줄, 가져오기 두 줄 |
| `apps/server/src/app.ts`·`session.ts` | 경제 목록 접근자, 거래소 게이트웨이·WebSocket 나누기 |
| `apps/server/src/economyView/services.ts`·`worldSource.ts` | 실제 거래소·생산 자료 |
| `apps/game/src/economy/market/*`·`OrdersView.tsx`·`ProductionView.tsx`·`EconomyScreen.tsx`·`economyText.ts`·`market/market.css`, `apps/game/messages/{ko,en}.json` | 주문·취소·체결 알림·도시 생산 화면 |
| `apps/game/src/map/mapFeed.ts` | 새 서버 메시지 거르기(다 갈래 switch 타입 검사) |
| `e2e/economy.spec.ts` | 플레이어 시험을 실제 거래소로(거래소 곧 열림 → 물건 목록·도시 목록·보내기 단추·조건 잠금·내 주문·도시 생산) |
| `docs/adr/2026-11-07-play-flow.md`(새)·`2026-10-31-economy-core.md`·`docs/questions/2026-11-07-play-economy.md`(새)·`docs/PLAN.md` 14장 | 결정·질문·요약 |

## 함께 바꿔야 하는 파일
- 합칠 때(WP1~WP3): `docs/adr/2026-11-07-play-flow.md`는 WP마다 절을 쓴다(머리말은 하나로). 프로토콜 판은 WP3도 14를 쓸 수 있어 한 판으로 묶는다(`version.ts` 주석 14 줄을 합친다, 판 숫자 시험 셋은 같은 값). `world/world.ts`(WP1)·`map/mapFeed.ts`(WP2)·`session.ts`·`app.ts`는 연결 줄만 더했다. 마이그레이션이 여럿 생기면 갈래로 그대로 합친다(AGENTS 6장 Drizzle).
- WP1 씨앗 건물: NPC 시설 주인 = 그 세력 소유 주체, 시설 줄 `city_id` = 그 도시면 그 도시 생산이 된다(아니면 도시 직무만). 도시 이름 칸이 생기면 `market/views.ts` `cityLabel`을 바꾼다.
- WP3(플레이어 생산): 유저 산출이 그 도시 창고(원장 위치 = 도시)에 들면 바로 그 도시 거래소에 팔 수 있다(거래소는 정산을 먼저 부른다).

## 건드리지 말 것
- 거래소 ID(`market_books.id`)는 에스크로 계정 열쇠다. 지우거나 다시 매기지 않는다.
- `market_orders.locked`는 불변 조건 M1이 원장과 견준다(쓰기는 `books.ts` 한 곳).
- 시뮬 `runEconomy`의 셈을 바꾸면 시뮬 출력이 바뀐다(`SIM_VERSION`·골든 해시).

## 미검증·TODO·알려진 문제
- 검사(Verified, 이 작업 트리): 서버·시뮬 시험 214파일 1,594개 통과(TEST_DATABASE_URL, 화면 손보기 전), 거래소 DB 시험 1개·단위 시험 4개·프로토콜 시험 17파일 99개 통과, 서버·시뮬·게임 앱 타입 검사 통과. 끝 검사·화면 시험 결과는 아래 "끝 검사".
- 실제 NAS(봇 1,000·국가 4)의 생산·거래 양·쓰기 묶음 부하는 재지 않았다(미실행). 도시 하나(휴먼 약 250명)면 도시 직무 3개 × 자리 10명이라 시간당 생산 거래가 약 30~40번(Assumed: 셈).
- NPC 세율 규칙식이 바꾼 세율은 저장하지 않는다(다시 켜면 프리셋). 서버를 끈 동안 NPC 생산은 따라 돌리지 않는다.
- 유저 창고 보유의 묶인 양(`HoldingLine.locked`)은 아직 0. 처리할 일(인박스) 체결 알림 없음(질문 538). 도시 거리 76m/칸·운임 없음·시야 없음은 [임시].
- 콘텐츠 편집(아이템·건물 편집기)이 바꾼 목록은 NPC 런타임을 다시 켤 때 경제에 든다(서버 경제 목록은 런타임 시작 때 한 번).
- 모든 NPC 도시가 같은 것을 만들어 도시 사이 거래가 적다(질문 531 다).

## 끝 검사
- `TEST_DATABASE_URL=… pnpm check` 통과(Verified: 시험 454파일 3,652개, 포맷·린트·타입·경계·파일 크기·다국어 4,256키·디자인 값·콘텐츠 core@46). `pnpm check:docs` 통과(기준 `cd2ceda`). 처음 돌렸을 때 `packages/sim/src/index.ts`가 1,005줄로 상한을 넘어 경제 내보내기를 `simulator/serverEconomy.ts`로 모았다.
- 화면 시험(Verified): `pnpm e2e economy.spec.ts` 21개 통과(4.2분, 빌드 포함), 새 "실제 거래소 사진" 4개(파스텔·다크 × 한국어·영어, 390px — 거래창·내 주문·도시 생산, 가로 넘침·작은 누르는 곳 없음) + 플레이어 시험 1개 통과(35초). 사진 `economy-live-{book,orders,production}-{pastel,dark}-{ko,en}-390.png`(저장소 밖 E2E_SHOTS_DIR). 거래창 사진에서 NPC 도시 #1이 처음 창고의 배급 식량 48개를 값 3에 팔고 [매수 주문]이 보인다(시험 서버는 봇 0 = 휴먼 0이라 도시 직무 일꾼 0, 생산 칸은 "쉬는 중").
- 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(사용자 지시 — 합칠 때 조정자).

## 사용자 결정 대기
- 질문 530~538(`docs/questions/2026-11-07-play-economy.md`).
