# 도시(정부) 지분 시장·증권 거래소 주기능·지분 호가창 (D-583, 질문 2438)

- 일시: 2026-11-21 22:16 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-share-market.md`(제안), 질문 `docs/questions/2026-11-21-governance-3.md` 2438(답 반영 표시), 새 질문 `docs/questions/2026-11-21-share-market.md`(2461~2470), 줄기 `work/share-market`

## 한 일
- 사용자 답(질문 2438 — "정부건물 내 전체지분 조회기능, 호가창처럼 거래가능 … 사업장들도 마찬가지 … 증권거래소 건물의 주기능", 체결은 "기존기술을 그대로")을 반영했다.
- **도시 지분 시장(서버)** `apps/server/src/cityShares/`: 도시마다 동시호가(@terra/sim `clearCallAuction` 그대로 — `market.ts matchRound` 한 곳), 회차 = 설정 칸
  `city_share_round_ms`. 사는 돈만 에스크로(`escrow:cityshare:<도시>:<화폐>`), 파는 지분은 묶지 않고 낼 때·회차 때 다시 본다(의결권·배당·과반·상장폐지가 계정 잔고로
  센다 — ADR 2절). 체결되지 않은 몫은 거둘 때까지 남는다(호가창). 내 계정(`o:`)·내가 이끄는 가문(`h:` — 가문 지분 계정·가문 금고, 가문장만)으로 주문.
  값 화폐 = 도시 주인 나라 국고 화폐, 화폐가 바뀌거나 도시가 사라지면 회차 때 옛 주문을 거둔다.
- **독재 과반(D-344)**: 지배 쪽 팔기·국고 팔기를 `rulingSharePm`과 같은 셈으로 과반이 남는 데까지(`majorityCaps`, 주문 때·회차 때 — 회차는 나라마다 한 예산).
- **의결 고리**: 승인된 국고 지분 팔기(`approvedShareSale` — 독재 직권·가결 안건) → 국고 팔 주문(승인 값·승인 수, 다 팔릴 때까지, 주문 수 한도 밖). 사람은 국고 지분을 직접 못 판다.
- **명령·조회**: WebSocket `city_share_order`·`city_share_cancel` → `city_share_result`(프로토콜 줄기 판 99, 받는 가장 낮은 판 98), 가문·의결 소켓에 묶음(`withCityShares` —
  `app.ts` 그대로). tRPC `shares.city`·`shares.hub`.
- **사업장 지분**: 엔진 그대로, 조회에 호가창(`book`)·지금 닫으면 날 값(`expected`)을 더했다.
- **증권 거래소**: 잠금(D-393·D-409)을 풀었다(`EXCHANGE_LOCKS`에서 securities 뺌). 건물 판 개요 칸에 거래소 판(그 나라 도시 정부 지분 시장 + 사업장 지분 시장 목록, 줄을 누르면 같은 판에서 연다).
- **화면**: 정부 대화상자 [정부 지분 시장] 칸(주주 전체 — 이 도시·나라 전체, 종류·몫 막대·지배 가문, 호가창·다음 체결 시계, 주문·내 주문 거두기, 국고 지분과 국고 팔기 — 독재 직권·안건),
  사업장 [지분] 칸 호가창(값 줄을 누르면 주문 값), 증권 거래소 판. 토큰만, ko·en.
- **저장**: 새 표 `city_share_orders`·`city_share_rounds`(마이그레이션 `20261121125203_city_share_market`, snapshot id `90e99c42-2912-427e-b53e-b00329f24354`, prevIds = 두 끝
  `ee4d36aa…`·`ace6aeb5…`). 더하기만 — 옛 앱은 그대로 돈다. 세계 초기화(world-reset)는 세계 표라 비운다(남길 표 목록에 넣지 않음).
- **설정 칸**: `city_share_round_ms`(30분)·`city_share_order_max`(10) — 팩 core 175, 시뮬 계수표 선택 칸(시뮬은 쓰지 않음, SIM 판 그대로 68).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/cityShares/{market,service,view,port,gateway,attach,store,table}.ts` | 도시 지분 시장(체결·묶기·과반·의결 고리·조회·소켓·부팅 읽기·쓰기 표) |
| `apps/server/src/cityShares/{market,view,gateway}.test.ts`·`cityShares.db.test.ts` | 단위·DB 통합 시험 |
| `apps/server/src/db/cityShareSchema.ts`·`schema.ts`·`drizzle/20261121125203_city_share_market/` | 새 표 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 2개(펼쳐 넣기 — 996줄) |
| `apps/server/src/factionIdentity/{attach,rules}.ts`·`governance/attach.ts` | 시장을 가문·의결 묶음에 잇기, 의결 포트·표 내보내기, 설정 값 |
| `apps/server/src/session.ts` | `city_share_*` 길(판 검사 → 가문 소켓) |
| `apps/server/src/trpc/{shares,router,context,createContext}.ts` | 조회 |
| `apps/server/src/business/shares.ts`(+시험) | 사업장 지분 호가창·미리 보기 |
| `apps/server/src/governance/{service,view}.ts` | 주석(고리를 시장이 받는다) |
| `packages/protocol/src/{cityShares,messages,index,version}.ts`(+시험) | 새 메시지·판 99 |
| `packages/shared/src/{cityShares,shareBook}.ts`(+시험)·`businessBooks.ts`·`exchange.ts`(+시험)·`package.json` | 조회 모양·호가창 모으기·증권 잠금 풀기 |
| `packages/sim/src/{tuningBusiness,society/businessCoefficients}.ts` | 설정 칸 2개(선택 칸, 판정 그대로) |
| `content/core/{tuning,manifest}.json` | 설정 칸 2개, 판 175 |
| `apps/game/src/shares/*`·`map/business/ShareMarket.tsx`·`map/building/BuildingPanel.tsx`·`government/GovernmentDialog.tsx`·`faction/governance/governanceCommands.ts`·`map/mapFeed.ts`·`messages/{ko,en}.json` | 화면 |
| `e2e/share-market.spec.ts`(새)·`e2e/build-mode.spec.ts` | 화면 시험(잠긴 거래소 예 = 유닛 거래소로) |

## 함께 바꿔야 하는 파일
- 프로토콜 판을 합칠 때 맞추기: `packages/protocol/src/version.ts`(99 → main 판 + 1), `cityShares.ts CITY_SHARE_PROTOCOL_VERSION`, `MIN_SUPPORTED_PROTOCOL_VERSION`.
- 팩 판(core 175)도 합칠 때 맞춘다.
- 새 세계 밖 표가 아니므로 `apps/server/src/cli/resetWorld.ts` 남길 표 목록은 그대로.

## 건드리지 말 것
- 사업장 지분 엔진(`business/shares.ts` 체결·발행) — 옛 걸린 주문 복원과 시험이 그 꼴을 쓴다(질문 2462 답 전까지).
- 올라간 마이그레이션.

## 검사 (Verified — 실행함)
- `TEST_DATABASE_URL=… pnpm check`: 포맷·타입·린트·경계·파일 크기·다국어(8748 키)·디자인 값(대비 746쌍)·콘텐츠(core@175) 통과. 단위 시험 855개 파일 중 852 통과,
  3개(`cyborg.db`·`facilities.db`·`nationTiers.db` — 다른 줄기와 같은 DB·CPU를 함께 쓴 동안 30초 훅 시간 초과)는 따로 다시 돌려 3/3·25/25 통과 → 855/855 파일, 6155/6155 시험.
- 새 시험: `cityShares/market.test.ts` 9, `view.test.ts` 3, `gateway.test.ts` 3, `cityShares.db.test.ts` 1(독재 직권 국고 팔기 → 체결 → 복원·거두기·불변 조건), `protocol/cityShares.test.ts` 4, `shared/shareBook.test.ts` 2, 사업장 호가창 단언(`business/shares.test.ts`).
- `pnpm build` 통과, `pnpm check:bundle` 첫 화면 JS 110,770 B / 상한 131,416 B(올리지 않음).
- 화면 시험 `e2e/share-market.spec.ts` 9개 통과(첫 실행 8/9 — 거래소 판 시험이 견본 도시 번호를 판이 열린 뒤 정해 실패 → 도시를 먼저 찾게 고쳐 다시 7/7), `e2e/build-mode.spec.ts` 9/9(잠긴 거래소 예 = 유닛 거래소).
  사진 15장(390 파스텔·다크 한국어 + 파스텔 영어 — 정부 지분 주주·호가창·주문, 증권 거래소 판): 세션 임시 폴더 `share-shots/`.

## 미검증·TODO·알려진 문제
- NPC 가문·NPC 나라의 지분 주문은 없다(NPC 팔기는 시뮬 직접 양도 그대로) — 질문 2461.
- 팔 지분을 묶지 않아 회차 때 판 쪽이 모자라면 체결량이 줄 수 있다(호가창의 팔 주와 다를 수 있다).
- 거래 세금·수수료 없음(질문 2464). 증권 거래소 건물은 목록일 뿐 주문 조건이 아니다(질문 2465).
- 실제 운영 세계(NPC 경제가 있는 세계)에서 나라 화폐로 산 끝-끝 거래는 DB 시험(경제 런타임 없는 시험 세계 — 서버 기준 화폐)과 화면 시험(서버 거절 길)만 봤다 — **Unknown**.

## 사용자 결정 대기
- `docs/questions/2026-11-21-share-market.md` 2461~2470.
