# 운영 서버 RSS 증가 원인 — NPC 거래 판단이 읽기만 해도 도시 × 물건 거래소를 모두 만듦

- 일시: 2026-11-17 00:15 (KST)
- 작업 도구: Claude Code
- 관련: nas-metrics(1116n·1116o 판 RSS·heapUsed 증가), `apps/server/src/market/books.ts`(거래소 모음, 처음 쓸 때 만들기), ADR `2026-10-31-economy-core.md` 4절, `docs/adr/2026-11-07-play-flow.md` "WP4"

## 한 일
- NAS 운영 서버의 RSS가 켠 뒤 줄곧 오르는 증상(1116o: 켠 지 18~47분 614→636MB, heapUsed 바닥 109~113 → 120~124, 유닛·휴먼 수 고정)의 원인을 찾아 고쳤다.
- **원인 (Verified)**: 서버 거래소 모음의 도시 표(`market/books.ts` `cityMap`)는 `get`이 없으면 거래소를 만든다(메모리에 `createGoodsMarket` + 감싸기 객체, `market_books` 줄). 시뮬 경제 규칙은 이 표를 그대로 보는데, 값을 **읽기만** 하는 곳도 `get`을 불렀다:
  - `npcTrade.ts` `onTrade` 4단계(남는 것 팔기): 팔 양(lots)을 보기 전에 도시마다 모든 물건 거래소를 `get` → 세력 도시 × 모든 물건 거래소가 생김(주된 원인, 할당 표본 스택 `book ← map.get ← onTrade`).
  - `marketRefPrice`(시세 읽기 — `npcGatherTier`·`npcBuild`·도시 매입 호가가 부름), `importGoods`(남의 도시 매도 호가 읽기 — 모든 도시를 훑음), `priceIndexMilli`(하루 끝 물가 지수), `placeCityBids`(예산 확인 전에 `get`), `economyRun` 시세 요약.
  - 시뮬은 도시마다 모든 물건 거래소를 미리 만들어 두어(`createEconomy`) 차이가 없고, 서버만 켤 때부터 거래소를 하나씩 만들어 **도시 수 × 물건 수(로컬 49 × 163 = 7,987개)** 에 닿을 때까지 힙이 오른다. 다시 켜면 걸린 주문·최근 체결이 있는 거래소만 되살리므로 켤 때마다 같은 증가가 되풀이된다. 갓 만든 거래소는 체결·호가가 없어 읽은 값은 "없음"과 같았다(결과에는 영향 없음, 메모리·CPU·DB 줄만 씀).
- **고침**: 시뮬에 `peekMarket(perItem, asset)`(있는 거래소만 읽기 — `has`로 먼저 봄)을 두고 읽기만 하는 곳은 이것을 쓴다. 주문을 거는 곳(`onTrade` 4단계, `placeCityBids`)은 팔 양·살 양·예산을 확인한 **뒤에** `get`한다. 시뮬은 모든 거래소가 있어 `has`가 늘 참이라 결과가 같다(sim 시험 142개 그대로 통과). 서버 쪽 코드는 바꾸지 않았다.
- 회귀 시험: `npcTrade.test.ts` "읽기만 하는 길은 거래소를 만들지 않는다" — 서버 도시 표처럼 `get`이 거래소를 만드는 표를 씌우고 모든 세력 거래 판단 + 물가 지수 + 시세 읽기를 6번 돌려, 주문을 건 적 없는 거래소가 생기지 않고 수가 첫 회 뒤로 늘지 않는지 본다. 고치기 전 실패(주문 없이 만들어진 거래소 24개), 고친 뒤 통과.

### 재현 방법
- 빌드한 서버를 운영과 같은 설정으로 띄움: 새 DB + `migrate.js`, `S1_TEST_BOTS=1000 S1_TEST_MAPS=6 NPC_SOCIETY=1 NPC_TEST_NATIONS=16 WORLD_RELAYOUT=0 GARDENER_WAVES=0`, `node --inspect`, 보는 연결 0.
- CDP(전역 `WebSocket`, 새 의존성 없음)로 3분마다 강제 GC 뒤 `process.memoryUsage()`를 적고(GC 톱니를 뺀 남은 힙), 샘플링 힙 프로필(`HeapProfiler.startSampling`)을 15분마다 받아 할당 위치별로 살아 있는 바이트를 비교. 힙 스냅숏 2장(켠 지 10·27분) 비교. 거래소 수는 `market_books` 줄 수로 셈. 도구 스크립트는 저장소 밖(scratchpad)에 두었다가 지웠다.

### 증거 (고치기 전, Verified)
- 강제 GC 뒤 힙: 켠 지 10분 83.2MB → 25분 95.9 → 40분 107.2 → 55분 116.4(약 +0.7~1.1MB/분, NAS heapUsed 기울기와 같은 크기) → **거래소가 7,987개(= 49 도시 × 163 물건)로 다 찬 뒤 평탄**(55~70분 116.4~117.7).
- 샘플링 프로필(15→30분 사이 늘어난 살아 있는 바이트 12.4MB 가운데): `createGoodsMarket` 5.21MB, 감싸기 `wrap` 4.36, `createOrderBook` 1.10, `create` 0.69, … 모두 `book ← map.get(cityMap) ← onTrade` 스택. 그 밖의 늘어난 할당은 0.1MB 안팎(유닛 이동 `createMotion` 등 — 유닛 수만큼이라 늘지 않음).
- 거래소 1개 ≈ 4~6KB 힙. 다 차면 약 35~45MB.
- 힙 스냅숏 비교(10→27분): 새로 생긴 클로저 `place`·`cancel`·`expire`·`best`·`orders` 각 약 2,450개(거래소 하나에 시뮬 거래소 + 서버 감싸기 = 두 벌).

### 전·후 (같은 설정, 새 DB, 켠 뒤 분 기준)
| 켠 뒤 | 거래소 수 전 | 거래소 수 후 | GC 뒤 힙 전 | GC 뒤 힙 후 |
|---|---|---|---|---|
| 약 10분 | 2,104 | — | 83.2MB | 72.1MB(9분) |
| 약 25분 | 4,219(22분) | 62(15분) | 95.9MB | 72.8MB(24분) |
| 약 40분 | 6,260 | — | 107.2MB | 73.1MB(39분) |
| 약 55분 | 7,830 | 193(53분) | 116.4MB | 74.6MB(51분) |
| 약 70분 | 7,987(다 참) | — | 117.6MB | — |

- 힙 기울기(강제 GC 뒤): 전 +0.7~1.1MB/분(켠 지 10~55분, 거래소가 다 찰 때까지) → 다 찬 뒤 0. 후 +0.07MB/분(9~51분, 남은 것은 주문을 건 거래소 193개 + 유닛 이동 값 흔들림).
- RSS: 전 런은 첫 행성 굽기와 힙 스냅숏 두 장 때문에 RSS가 계단으로 튀어 스냅숏 사이만 본다(12분 +12.7MB, 42분 +20MB ≈ +0.5~1.0MB/분, 다 찬 뒤 평탄). 후(행성 캐시로 켬, 스냅숏 없음): 강제 GC 뒤 RSS 15분 609.9 → 51분 612.3MB(+0.07MB/분), 서버 1분 지표 rssMb 622.9 → 627.9MB(48분, 621~632 사이에서 흔들림).
- NAS 실측과 견줌(코디네이터 전달, nas-metrics): 1116p 켠 지 25~54분 RSS +0.68MB/분, heapUsed +0.66MB/분(바닥 111 → 127~137), 1116o +0.81, 1116n +1.05MB/분. 로컬 고치기 전 힙 +0.7~1.1MB/분과 같은 크기이고, 로컬은 켠 지 약 56분에 거래소가 다 차 평탄해졌다. NAS 도시 수가 로컬(49)과 다르면 다 차는 시각도 다르다(Unknown).
- 경제 동작: 첫 17분 NPC 판매 213·생산 352로 전·후 같다(매입 호가 수는 30·41 — 새 DB마다 세계 시드가 달라 흔들림).
- 검사: `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 779·시험 5,828, DB 시험 포함).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/economy.ts` | `peekMarket` 추가, `markets` 주석, `priceIndexMilli`가 읽기만 하게 |
| `packages/sim/src/simulator/npcTrade.ts` | `marketRefPrice`·`importGoods`는 `peekMarket`, 4단계 팔기·`placeCityBids`는 걸 양을 확인한 뒤 `get` |
| `packages/sim/src/simulator/economyRun.ts` | 시세 요약이 `peekMarket` |
| `packages/sim/src/simulator/npcTrade.test.ts` | 회귀 시험(get이 만드는 표 흉내) |

## 함께 바꿔야 하는 파일
- 없음. 시뮬 규칙에 새로 `economy.markets`를 읽는 코드를 넣을 때는 읽기만 하면 `peekMarket`, 주문을 걸 때만 `get`을 쓴다(서버 도시 표는 `get`이 거래소를 만든다).

## 건드리지 말 것
- `market/books.ts` `cityMap`의 "get이 없으면 만든다"는 그대로 둔다(시뮬 NPC가 주문을 걸 때 그 길로 거래소가 생긴다).

## 미검증·TODO·알려진 문제
- NAS에서는 아직 재지 않았다(Unknown). 기대: 켠 뒤 거래소가 주문 건 것만 생겨 힙이 수십 MB 덜 오르고 1시간 안팎에 평탄. 배포 뒤 nas-metrics로 RSS·heapUsed를 다시 본다.
- 이미 쌓인 `market_books` 줄(옛 판이 만든 빈 거래소)은 그대로 둔다(줄만 있고 메모리에는 쓸 때만 올라온다).
- NAS 1116o 기울기를 "약 8시간 뒤 1GiB"로 본 것은 직선 연장이었다. 로컬에서는 거래소가 다 찬 뒤 평탄해졌다. 거래소 말고 늘어나는 것은 로컬 70분 안에서는 보이지 않았다(샘플링 프로필 다른 위치 모두 0.1MB 안팎). NAS에는 실제 체결(최근 8일 창, `TRADE_WINDOW_MS`)이 있어 그만큼은 창 길이까지 늘 수 있다(설계대로).

## 사용자 결정 대기
- 없음
