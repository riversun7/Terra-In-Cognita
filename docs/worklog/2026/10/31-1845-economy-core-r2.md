# R2 경제 코어: 위치 있는 원장, 물자 호가창·환전 동시호가, 생산·생필품 유지비·NPC 중앙은행, 시뮬 econ16

- 일시: 2026-10-31 18:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-31-economy-core.md`(제안, 이번에 씀), `2026-10-31-roadmap-to-launch.md`(R2 행), `2026-10-31-rules-simulator.md`(R1), `2026-10-28-economy-ledger.md`(8), `2026-10-31-space-layer-data-model.md`(43 5절), 가지 `work/rules-r2-economy`(main `6b11e88`에서)

## 한 일
- 콘텐츠 팩 판 5(임시 데이터): `items`에 대분류·티어·기준 가치·`enabled`를 더하고, `facilities`·`recipes`·`necessities`·`nation_presets` 분류를 새로 두었다(국가 프리셋 16, 화폐 16).
- 경제 코어(`packages/sim/src/economy/`): 물자 호가창(연속 체결, 가격·시간 우선, 자기 체결 방지, 부팅 복원), 물자 거래소(장부 에스크로·거래세·차액 환불·취소·만료·도시 주인 바뀜), 동시호가 체결가와 환전 시장(회차 하나 = 거래 하나), 생산(레시피 = 거래 하나, Lv → 최고 티어), 생필품 유지비(정시, 나눠 주기), NPC 중앙은행 공식(시중 통화량 기준 조절 + 발행 이자 소각, 처음 발행 E6).
- 원장: 계정 = (주체, 자산, 위치). 감사에 시스템 계정 사건 규칙(발행·소멸·생산원·에스크로·운송 중을 정한 거래 종류만 건드림)을 더했다. 서버 원장은 위치 계정을 막는다(위치 열이 아직 없다).
- 시뮬레이터: 시나리오 `economy` 칸·`cityPlan`·`stock`, 경제 사건(생산·유지비·거래 판단·환전 회차·운송 도착)과 하루 끝 중앙은행, [임시] 거래 대리 판단, 하루 `econ` 줄과 요약 `economy` 칸(출력 형식 판 2), 실행 도구가 팩에서 경제 목록을 만든다. 시나리오 `econ16.json`(농업 8 + 공업 8).
- 조율자 결정: 서버 커밋 방식 = 동기 묶음 커밋(U2), 주문 응답 p95 NAS HDD ≤ 150ms·SSD ≤ 50ms. ADR 5절, PLAN 4.7에 한 줄로 닫았다.
- 문서: ADR(제안), PROTECTED 원장·거래소 줄에 경로, S3 ADR의 "큐는 넣은 차례" 줄에 바뀜 메모, AGENTS.md 7장 시뮬 명령 두 줄.

## 확인 (Verified)
- 불변 조건 시험(tdd): 호가창 체결 차례·부분 체결·자기 체결 방지·복원, 거래소 묶음·체결·세금 버림·취소·만료, 무작위 3,000건 뒤 물건·돈 합 그대로 + 에스크로 = 걸린 주문 합 + 감사 위반 0, 동시호가 체결가 규칙·부분 체결·무작위 200회차 뒤 화폐 합 그대로, 생산·유지비·중앙은행 계산 예, 위치 계정, 경제 시나리오 같은 시드 바이트 같음·30일 위반 0·나라끼리 거래와 환전이 실제로 일어남.
- econ16 180일(시드 1, 두 번): 줄·요약 `cmp` 같음(해시 `0a295cc7`), 하루마다 180번 검사 위반 0. 시드 2·3도 180일 위반 0.
- 전체 검사: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과(시험 파일 226개, 시험 2,143개, 건너뜀 없음).

속도(Verified: 개발 컨테이너 Intel Xeon 2.1GHz 4 vCPU 공유, 부하 평균 0.7, Node 24.22.1, `sim:speed`, 줄마다 새 프로세스. NAS 값이 아니다)

| 시나리오 | 유닛 | 날 | 걸린 시간 s | 예약 | 예약/초 | 가상 시간/실제 초 | 배속 | 최대 RSS MB | 위반 |
|---|---|---|---|---|---|---|---|---|---|
| stub16 | 640 | 180 | 0.42 | 20,157 | 48,512 | 10,397 h | 37,429,169 | 142 | 0 |
| econ16 | 640 | 180 | 18.13 | 1,728,432 | 95,321 | 238.2 h | 857,672 | 274 | 0 |
| synthetic | 1,008 | 30 | 0.84 | 670,822 | 799,119 | 857.7 h | 3,087,727 | 132 | 0 |
| synthetic | 10,000 | 7 | 4.20 | 1,541,664 | 367,466 | 40.0 h | 144,158 | 311 | 0 |
| synthetic | 100,000 | 2 | 18.44 | 4,369,632 | 236,938 | 2.6 h | 9,370 | 407 | 0 |

- R1과 견줌: synthetic은 같은 세션에서 R1 코드(`git stash`)와 번갈아 재 보니 1만 3.67초(R1) / 3.81~4.07초(R2), 10만 17.03초(R1) / 15.46~15.94초(R2)로 흔들림 안이다(R1 작업 기록 값 3.26·14.27초는 다른 때 잰 값). econ16은 새 줄: 예약 하나가 장부 거래를 내서 예약/초가 stub16보다 낮지만 180일이 약 18초라 조정을 하루 여러 번 돌리기에 넉넉하다(ADR `n1-real-time-gate`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/{items,facilities,recipes,necessities,nation_presets,manifest}.json` | 경제 분류 임시 데이터, 팩 판 5 |
| `packages/content/src/schema/economy.ts`(새)·`categories.ts`·`index.ts` | 분류 스키마(모든 항목 `enabled` 필수, D-398) |
| `packages/content/src/testFixtures.ts`, `fixtures/valid/items.json`, 시험 4개, `scripts/check-content.test.mjs` | 아이템 필수 칸이 늘어 시험 자료에 칸을 붙임(`ITEM_FIELDS`·`itemNamed`) |
| `packages/sim/src/ledger/ledgerBook.ts`·`audit.ts` | 위치 계정, 시스템 계정 사건 규칙 |
| `packages/sim/src/economy/*`(새) | 호가창·거래소·동시호가·환전·생산·유지비·중앙은행 + 시험 |
| `packages/sim/src/simulator/{catalog,economy,economyStub,economyRun}.ts`(새), `testEconomy.ts`·`economyRun.test.ts`(새) | 시뮬 경제 |
| `packages/sim/src/simulator/{run,world,stubRules,scenario,metrics}.ts` | 경제 붙이기(고리), `econ` 줄, 형식 판 2 |
| `packages/sim/cli/{common,sim,speed}.ts`, `scenarios/econ16.json`(새) | 팩 → 경제 목록, econ16 속도 줄 |
| `apps/server/src/economy/ledger.ts`, `world/persist/load.ts` | 계정 위치(null), 위치 계정 막기 |
| `docs/adr/2026-10-31-economy-core.md`(새), `docs/PLAN.md` 4.7, `docs/PROTECTED.md`, S3 ADR 한 줄, `AGENTS.md` | 결정·닫은 항목·경로·명령 |

## 함께 바꿔야 하는 파일
- 경제 분류 필드를 바꾸면: `packages/content/src/schema/economy.ts`, 팩 JSON, `packages/sim/cli/common.ts`(목록 만들기), `simulator/catalog.ts`, `simulator/testEconomy.ts`.
- 장부 계정 열쇠·위치를 바꾸면 서버 원장(`apps/server/src/economy/ledger.ts`)과 DB 표(위치 열은 서버가 물건을 다룰 때 마이그레이션).
- 출력 줄 모양(`econ` 칸)을 바꾸면 `SIM_OUTPUT_FORMAT`(`simulator/run.ts`)을 올린다.
- 시스템 계정 앞머리를 더하면 `simulator/economyRun.ts` `SYSTEM_KINDS`에 그 계정을 건드려도 되는 거래 종류를 적는다(안 적으면 감사가 위반으로 센다).

## 건드리지 말 것
- `simulator/economyStub.ts`의 결과(시세·모자람·통화량)를 기획 판단에 쓰지 않는다. 대리 판단이라 균형이 맞지 않는다(아래).
- 원장·거래소 코드는 PROTECTED다: 바꾸면 ADR + 불변 조건 시험.

## 미검증·TODO·알려진 문제
- econ16(대리 판단) 180일 값(Verified, 시드 1): 공업 나라 생필품 모자람 하루 약 3천 유닛·시간(필요량의 약 4할), 식량 시세가 기준 가치 아래(판매 과잉), 기준 통화 통화량 약 12배·다른 화폐 약 3배. 대리 판단의 가격이 돈에 반응하지 않아서다(Assumed). R5 규칙식으로 조정한다.
- 서버는 아직 경제를 돌리지 않는다: 거래소 주문 표·부팅 복원·주문 응답 측정(목표 NAS ≤ 150ms)은 서버가 거래소를 열 때(R5·L1). 위치 열 마이그레이션도 그때.
- 총량 자원(채굴 감쇠·`reserve:<천체>:<자산>`), 테라코인 짝, 휴먼 지갑·자율 구매(D-148)·급여(D-097)는 넣지 않았다(R4·BM 단계).
- 다른 세금 종류(재산·소득·관세 등)는 대상이 생길 때.
- ADR 8 상태의 "일부 대체됨" 표시는 이 ADR을 확정할 때 한다.

## 사용자 결정 대기
- 없음. 커밋 방식(5절)은 조율자가 정했다. 기술 기본안 넷(기준 통화 짝, 판 쪽 거래세, 생필품 나눠 주기, 휴먼 자율 구매는 R4)은 ADR에 적었다.
