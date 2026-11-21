# 2026-11-21 묶음 1116q 합치기 (서버 메모리 누수 고침 · NPC 휴먼 임금·생활비 + 새 main 3d66465) — 리셋 필요 없음

- 일시: 2026-11-21 09:20~ (KST). 합치기는 11-17에 시작해 사용량 제한으로 멈췄다가 이어서 했다.
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `17-0015-leak-hunt`·`17-0040-npc-wage`, 질문 2291~2295(`docs/questions/2026-11-16-npc-wage.md`), 빈틈 2236(`2026-11-16-npc-econ-6.md`), ADR "바뀜" 절(`2026-10-31-economy-core.md`·`2026-11-15-business-ledger.md`), 새 main의 ADR `2026-11-18-ci-local-and-nas.md`·`2026-11-19-path-backtrack-and-corner-pull.md`

## 한 일
- main 0efec8a(묶음 1116p) 위에 가지 둘을 차례로 `--no-ff`로 합친 뒤, 그사이 움직인 origin/main(3d66465, 0efec8a 위 15커밋 — 다른 작업자)을 들였다.
  1. `work/leak-hunt`(f41429a, 바탕 7b34039): 서버 RSS 증가 원인 고침 — 시뮬 `simulator/economy.ts peekMarket`(있는 거래소만 읽기). 읽기만 하는 곳(`priceIndexMilli`·`marketRefPrice`·`importGoods`·`economyRun` 시세 요약)은 peek, 주문 거는 곳(`onTrade` 4단계·`placeCityBids`)은 팔 양·살 양·예산을 확인한 뒤 `get`. 회귀 시험 `npcTrade.test.ts`. `docs/WORKLOG.md`만 충돌(받은 쪽 → `pnpm docs:index`).
  2. `work/npc-wage`(e3ffbc2, 바탕 0efec8a): NPC 휴먼 지갑 임금·생필품 값·숙박비 — sim `simulator/humanPurse.ts`(하루 끝 일꾼 임금 = 기준 임금 × 포만감 효율 × `business_npc_wage_pm`, 먹은 생필품 값을 지갑 → 국고, 모자란 몫은 현물 부양, 지갑 옮기기·상속), 서버 `npc/npcWages.ts`(임금은 시설 사업장 금고에서, 숙박비는 일꾼 지갑에서 — `chargeLodgingFees` 옮김), 설정 칸 둘. `docs/WORKLOG.md`만 글자 충돌, `simulator/economy.ts`·`economyRun.ts`는 자동으로 합쳐졌다(아래 "겹침").
  3. `origin/main`(3d66465): CI를 로컬 훅·NAS로 옮김(ADR `2026-11-18-ci-local-and-nas.md`, AGENTS.md 3장), 홈 대시보드·1차맵 4X 개편·건물 3D 모델 31종·2차맵 경로 역행 제거(SIM 63)·경험치 표 `/dev/exp-table`, 팩 core@125(`exp_table.json`·`facilities.json`), 마이그레이션 `20261120035817_content_overrides_exp_table`. 충돌 셋(`manifest.json`·`sim/src/version.ts`·`docs/WORKLOG.md`) — 모두 판 번호·목차.
  4. `work/mirror-d578`(e14aef5, 바탕 3d66465, 문서만): 기획 미러 eaa9a8f(D-578) 동기화 — `docs/design/`(결정 기록·계획 규칙·README 원본 커밋·시각), PLAN §14 머리 문장, 미러 기록 한 줄. 충돌 없이 합쳐졌다. 49 설정 칸 미러는 바뀌지 않았다(`pnpm settings:cells --check` 최신).
- **leak-hunt × npc-wage 겹침(손으로)**: 글자 충돌은 없었지만 npc-wage의 새 생필품 값 함수 `humanPurse.ts necessityCost`가 시세를 `economy.markets.get(cityId)?.get(asset)`로 읽었다. 서버 도시 표(`market/books.ts cityMap`)에서는 이 `get`이 거래소를 만든다 — 하루 끝 `livingDay`가 도시마다 모든 생필품 거래소를 만들어 leak-hunt가 막은 누수가 그대로 되살아난다(생필품 수만큼 작게). `has`로 먼저 보게 고쳤다(`peekMarket`과 같은 꼴 — `economy.ts`가 `humanPurse.ts`를 값으로 가져오므로 고리를 피해 그 자리에서 본다). 시뮬은 모든 거래소가 있어 결과가 같다. 회귀 시험 `humanPurse.test.ts` "생필품 값은 거래소를 읽기만 한다"(없는 거래소는 `get`하지 않고 팩 시작 시세) 하나 더함. 나머지: leak-hunt의 `peekMarket`·`get` 차례(`priceIndexMilli`·`npcTrade.ts`·`economyRun` 시세 요약)와 npc-wage의 `today.served`·`noteServed`·`beforeCityTransfer` 지갑 옮기기·`endOfDay` `livingDay`는 다른 자리라 두 동작이 모두 산다. npc-wage가 더한 코드에 다른 거래소 읽기는 없다(diff에서 `markets` 검색). `apps/server/src/npc/economy.ts`는 leak-hunt가 건드리지 않았다(942줄 그대로).
- **새 main이 가져온 시험 9개 기대값 맞춤** — 새 main의 DB 시험 9개가 실패 상태였다(합친 판 전에도): 3d66465(건물 티어 재조정, 팩 core@125)은 DB 시험을 돌리지 않고 올라왔다(그 작업 기록 "미실행"). 새 main 단독(저장소 밖에 `git archive`로 풀어 실행)에서도 같은 9개가 실패함을 확인(Verified)하고, 시험 기대값을 새 팩 값에 맞췄다(코드는 그대로 — 따로 커밋 `test:`). AGENTS.md 3장("main이 실패 상태면 먼저 고친다")과 푸시 전 훅이 DB 시험을 돌리기 때문이다.
  - `facilities/facilities.db.test.ts`(6): 공방 Lv1 배율 1200‰ → 1000‰ — 재료 소나무 12·철광석 7 → 10·6, 짓기 312초 → 260초(`WORKSHOP_L1_MS`·`WORKSHOP_L1_PINE`), 레벨 2 판자 48 → 40, 수리 재료 소나무 5 → 4·고치는 동안 노화 70 → 58 ppm, 창고 시설 든 무게 16 → 20kg, 재료 자리 시험의 철광석 받기 7 → 6. 노화 65%·`not_damaged` 실패는 짓기 시간 상수가 옛 값이라 52초 일찍 낡기 시작한 탓(상수만 고쳐 풀림).
  - `buildingEdit/buildingEdit.db.test.ts`(1): 광산 짓기 칸 기대 = 새 팩(배율 1000, 재료 4·4).
  - `facilities/npcSeed.db.test.ts`(1)·`cityRelayout.db.test.ts`(1): 행정 건물이 3×3 → 4×4라 가운데 = x + 1이 아니다 → sim `cityLayout rectCenter`와 같은 x + ⌊너비 ÷ 2⌋로(시험이 `world_buildings` 너비·높이를 읽는다). 다시 놓기 결과 `moved`(91)는 같은 자리에서 방향만 바뀐 건물도 세는데 시험은 자리만 봐서 90 → 방향 바뀜도 옮김으로 센다.
- 새 main과 겹친 곳: 판 번호만. 새 main은 `tuning.json`·`id-changes.json`·`npc/economy.ts`·sim `simulator/`를 건드리지 않았고, 우리 줄기는 `facilities.json`·`exp_table.json`·`apps/game`을 건드리지 않았다 — `tuning.json`(칸 ID)·`facilities.json`(항목 ID) 3방향 = 한쪽만 바뀜(함께 바꾼 칸·항목 0, Verified: `git diff --stat 0efec8a` 양쪽).
- 최종 판:
  - 프로토콜 **54**(최소 **53**) 그대로 — 두 줄기·새 main 모두 프로토콜 바뀜 없음.
  - 팩 **core@126**(새 main 125 위, npc-wage 150 → 126 — 설정 칸 둘 `business_npc_wage_mode`·`business_npc_wage_pm`). `id-changes.json` 그대로.
  - `SIM_VERSION` **64**(새 main 63 위, npc-wage 90 → 64 "묶음 1116q 합친 판"). 63 설명(새 main, 2차맵 경로)은 그대로 두었다. leak-hunt는 판을 올리지 않는다(시뮬 결과 같음). 판을 박은 시험은 없다(`world/legion3.test.ts`는 "60 이상").
  - 시뮬 출력 형식 **22**(npc-wage — 새 main은 21 그대로라 겹치지 않음).
- 마이그레이션: 이 묶음엔 없다. 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 하나**: `content_overrides_exp_table`(269797c2 — 1116p 끝 둘 9afdc6b8·c6f2df91을 이미 가리킨다, Verified: 스냅숏 전체에서 다른 `prevIds`에 없는 id).

## 리셋 필요 여부: 필요 없음
- 두 줄기 모두 DB 표·마이그레이션이 없다(휴먼 지갑 = 이미 있는 원장 계정 꼴, 위치 = −유닛 ID). 팩은 설정 칸 더하기뿐. 운영 세계 이행: NPC 휴먼 지갑은 0에서 시작하지만 첫 하루 끝에 임금이 먼저 들어오고(임금 → 생필품 값 → 숙박비) 그 안에서 낸다(시작 돈 없음). 새 main의 `content_overrides_exp_table`은 새 main 쪽 마이그레이션(직전 판 호환은 그쪽 판단 — 표 더하기).
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **서버 RSS가 켠 뒤 줄곧 오르던 것이 멈춰야 한다**(leak-hunt — 1116o·1116p nas-metrics에서 +0.7MB/분 남짓). 이미 만들어진 빈 거래소 줄(`market_books`)은 DB에 남지만, 다시 켜면 주문·체결이 있는 거래소만 되살린다.
  - **NPC 휴먼 숙박비를 국고가 아니라 일꾼 휴먼 지갑이 낸다**. 일꾼은 하루 끝에 시설 사업장 금고(모자라면 NPC 주인이 국고에서 운영 자금)에서 임금을 받고, 먹은 생필품 값을 국고에 낸다. 출발값(임금 20 < 생활비 136)에서는 임금이 그날 국고로 돌아와 국고 흐름이 거의 그대로 — 원장 거래가 도시마다 하루 1 + 숙소마다 1 늘어난다. 금고·국고가 빈 일꾼은 숙박비를 못 낸다(기록 `npcLodgingFees.short`, 회복 불이익 없음).
  - 새 main 쪽(홈 대시보드·1차맵 4X·건물 3D 모델·2차맵 경로 등)은 그쪽 작업 기록을 따른다.
- 53판 기기는 그대로 붙는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(세 번): 받은 쪽 → `pnpm docs:index`.
- `packages/sim/src/simulator/humanPurse.ts`(`necessityCost` — 위 "겹침")·`humanPurse.test.ts`(시험 하나 더함): npc-wage 합치기 커밋에 넣었다.
- `content/core/manifest.json`: 150 / 125 → **126**.
- `packages/sim/src/version.ts`: 새 main의 63 설명 그대로 + npc-wage 90 설명을 "64: (묶음 1116q 합친 판, 줄기 npc-wage의 90)"로, 상수 64.
- 판 번호 설명: ADR `2026-10-31-economy-core.md`("바뀜" 제목에 "→ 묶음 1116q 합친 판 64")·`2026-11-15-business-ledger.md`(SIM 64·core@126 줄), 질문 `2026-11-16-npc-econ-6.md` 2236 고침 줄. 줄기 작업 기록은 줄기 판 그대로 둔다(이 기록이 대응을 적는다).
- 파일 크기: 넘은 파일 없음. 이 묶음이 건드린 큰 파일: `simulator/economy.ts` 962, `npc/economy.ts` 942.
- `docs/worklog/2026/11/16-2210-batch-1116p-merge.md` 끝에 "## 배포 (Verified)" 절(1116p CI 362·NAS 배포·nas-metrics 두 번, 조정 담당이 보낸 값)을 넣었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/facilities.db.test.ts`·`npcSeed.db.test.ts`·`cityRelayout.db.test.ts`, `apps/server/src/buildingEdit/buildingEdit.db.test.ts` | 새 main(core@125 건물 재조정·크기)에 맞춘 DB 시험 기대값 — 새 main이 실패 상태로 올라옴 |
| `docs/WORKLOG.md`, `content/core/manifest.json`, `packages/sim/src/version.ts` | 합치기 충돌 풀기·판 번호(core@126, SIM 64) |
| `packages/sim/src/simulator/humanPurse.ts`·`humanPurse.test.ts` | npc-wage 생필품 값이 서버에서 거래소를 만들지 않게(leak-hunt 규칙) + 회귀 시험 |
| ADR 둘·질문 하나 | 판 번호 설명 64·126 |
| `docs/worklog/2026/11/16-2210-batch-1116p-merge.md` | 1116p 배포 결과 절 |
| `docs/worklog/2026/11/21-0920-batch-1116q-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 55, 팩 127, SIM 65, 시뮬 출력 형식 23. 다음 마이그레이션 `prevIds` = 269797c2(`content_overrides_exp_table`).
- **시뮬 경제 규칙에서 거래소를 읽기만 할 때는 `peekMarket`(또는 `has` 먼저)** — 서버 도시 표는 `get`이 거래소를 만든다. 새 규칙을 더할 때 같이 본다(이번 `necessityCost`가 그 예).
- **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO 그대로).
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다(일꾼 나눔 `humanPlaces.ts` ↔ `cityWorkerUnits`, 기준 임금 `labor/rules.ts` ↔ `npcBaseDailyWage`).

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다(`npc/economy.ts`는 942줄 — 늘리지 말고 새 모듈로, 생필품 받는 차례 `cityUnitOrder`).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) — 새 main까지 합친 뒤(9fc08e5 + 미러 합치기 전) 한 번: 포맷·린트·타입·경계·크기·다국어(8,482키)·디자인 값(746쌍)·콘텐츠(core@126 0e42bd1310d1) 통과, 시험 파일 798/802·시험 5,919/5,928 — 실패 9개는 모두 새 main 단독에서도 실패하는 위 DB 시험 넷(Verified). 그 넷만 고쳐 다시: **20/20 통과**, 서버 `typecheck`·고친 파일 oxlint 통과. 그래서 합친 판 전체 = 시험 파일 802/802·시험 5,928/5,928(넷은 다시 돌린 값). 미러 합치기는 문서만이라 따로 돌리지 않았다. 푸시 전 훅(8880af2 위, DB 시험 포함 — `pnpm check`·`db:generate`·`check:docs`·`check:content`·목차·위키): 시험 파일 **802/802**, 시험 **5,928/5,928**, 모두 통과(Verified). main = 8880af2.
- `pnpm check:content 3d66465c94`: core@126 (0e42bd1310d1) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 3d66465c94`: 통과.
- `pnpm settings:cells --check` 최신, `pnpm --filter @terra/server db:generate` No schema changes.
- 합친 판에서 `apps/game`은 새 main(3d66465)과 같다(바뀐 파일 0) → 빌드·`check-pwa`·`check:bundle`·화면 시험은 건너뛰었다(AGENTS.md 3장).
- 시뮬 `econ16` 시드 1 × 30일(`node cli/sim.ts econ16 --seed 1 --days 30`): 새 main 3d66465 단독(저장소 밖에 `git archive`로 풀어 실행)과 합친 판을 견줬다. 하루 줄 779줄이 `living` 칸을 빼면 바이트까지 같고, 요약은 `living`·출력 형식(21 → 22)·SIM 판(63 → 64)·팩 해시·원장 계정 수(30,271 → 30,405 — 휴먼 지갑 계정)만 다르다. 인구 2,220·도시 69·세력 45·건물 1,162·국고 합 34,333·사건 1,090,938, 불변 조건 위반 0으로 같다 → leak-hunt(와 출발값 npc-wage)는 판정 결과를 바꾸지 않는다. npc-wage 보고 값(0efec8a 바탕: 인구 2,202·건물 1,161·국고 합 44,681·사건 1,064,388)과 다른 것은 새 main의 SIM 63·`facilities.json` 바뀜 때문이다(새 main 단독도 같은 값). 합친 판 임금 누적 574,192(= 지갑 → 국고 생필품 값), 지갑 합 0.

## 미검증·TODO·알려진 문제
- leak-hunt 고침이 운영 RSS를 실제로 멈추는지는 배포 뒤 nas-metrics로 본다(로컬 재현에서는 Verified — 줄기 기록).
- `necessityCost` 고침은 단위 시험만(서버 실제 세계에서 하루 끝 뒤 `market_books` 줄 수가 늘지 않는지는 재지 않음 — 미실행).
- 줄기 TODO는 줄기 기록에 있다. npc-wage — 서버 실제 세계 미실행(하루 끝 지갑 거래·숙박비가 운영 DB에 쌓이는 양), 지갑은 전투 탈취에 함께 털림, NPC 휴먼 지갑 보는 화면 없음(2294), econ16·war16·build16 30일만.
- 새 main을 들인 뒤 화면 시험은 돌리지 않았다(우리 줄기는 화면을 바꾸지 않음 — 새 main 화면은 그쪽 검증, 그쪽 기록상 `e2e/dev.spec.ts`도 미실행). 건물 재조정·크기 바뀜이 다른 화면 spec(`build-mode`·`building-screen`·`economy` 등)의 기대값을 깨는지 모른다(Unknown).
- **운영 세계 주의(새 main 쪽)**: 행정 건물·거래소·신전·조선소 3×3 → 4×4, 바이오 실험실 2×2 → 3×3. 이미 지어진 건물은 DB에 옛 너비·높이로 남는다 — 새 크기가 이미 선 건물에 어떻게 적용되는지(겹침·다시 놓기)는 이 묶음에서 보지 않았다(Unknown, 새 main 작업자 확인 필요).

## 사용자 결정 대기
- 질문 2291~2295(NPC 휴먼 임금, 추천안 [임시]), 앞 묶음의 2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.
