# 2026-11-21 묶음 1116z 합치기 (도시 지분 시장·증권 거래소 / 낡은 화면 시험 고치기) — 리셋 필요 없음

- 일시: 2026-11-21 23:08~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-2216-share-market`·`21-2205-e2e-fix`, 질문 `docs/questions/2026-11-21-share-market.md`(2471~2480), ADR `2026-11-21-share-market.md`(제안)

## 한 일
- main 154c22be52(묶음 1116y 기록) 위에 두 줄기를 차례로 `--no-ff`로 합쳤다. 검사 뒤 main에 다른 세션 커밋 6a91da1ad9(NPC 유닛 욕구·가문 일 지시·가문 금고·가문 연맹·
  비접속 관리인 — SIM 70, 팩 136, 질문 2461~2467)가 올라와 그것도 합쳤다(충돌 없음 — 아래 "손으로 푼 곳"). 첫 푸시가 거절된 사이 또 올라온 5cf0d2d89a(광석 1g·10kg 묶음·
  g 단위 채집, 화석·이탄·소금 제거 — SIM 71, 팩 137)도 합쳤다.
  1. `work/e2e-fix`(f3ed44e849, 안에 main 154c22be52 합침): 시험만 고침 — economy 시세 색을 토큰에서 읽기, labor 임대형에서 시험 건물 고르기, buildings 건설 재료 기대값을 팩에서
     세기, boats 동쪽 바다와 이어진 물가만 고르기, dev `TOOL_SCOPES` `/dev/terrain-objects` = planet, operator-speed `operator_pace` 100, sheet-buffs 이동 속도 "n칸/초". 앱·판 바뀜 없음.
  2. `work/share-market`(07d1f57657, 바탕 main 154c22be52): 도시(정부) 지분 시장(`apps/server/src/cityShares/`, 동시호가 = `market.ts matchRound`의 `clearCallAuction`, 사는 돈만 에스크로,
     파는 지분은 주문 때·회차 때 다시 봄, 체결 안 된 몫은 회차를 넘어 남음), 독재 과반 상한(D-344), 의결 `approvedShareSale` → 국고 팔 주문, 정부 건물 [정부 지분 시장] 칸, 사업장 지분
     호가창, 증권 거래소 잠금 풀기(`EXCHANGE_LOCKS`에서 securities 뺌)와 거래소 판, WS `city_share_order`·`city_share_cancel` → `city_share_result`, tRPC `shares.city`·`shares.hub`.
- 최종 판:
  - 프로토콜 **60**(최소 **59**): share-market 줄기 판 99(최소 98) → 묶음 판. `CITY_SHARE_PROTOCOL_VERSION` 99 → **60**. e2e-fix는 프로토콜 바뀜 없음.
  - 팩 **core@138**(main core@137 + 1, 줄기 판 175 → 묶음 판 — 처음 136으로 맞췄다가 main 6a91da1ad9가 136을, 5cf0d2d89a가 137을 먼저 써서 138). `tuning.json`은 저절로 합쳐졌다(칸 919 → **935**: share-market
    `city_share_round_ms`·`city_share_order_max` + main 6a91da1ad9 열넷, 같은 ID 없음). `id-changes.json` 바뀜 없음.
  - `SIM_VERSION` **71**(main 5cf0d2d89a가 올린 값 그대로 — 이 묶음은 시뮬 계수표에 선택 칸 둘만 더했고 시뮬은 쓰지 않는다). 시뮬 출력 형식 그대로.
  - 마이그레이션: 줄기 것 그대로. `20261121125203_city_share_market`(스냅숏 id `90e99c42-2912-427e-b53e-b00329f24354`, prevIds = 1116y 끝 둘 `ee4d36aa`·`ace6aeb5`).
    합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified). 다음 마이그레이션 `prevIds` = 끝 하나 **90e99c42-2912-427e-b53e-b00329f24354**.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표 둘(`city_share_orders`·`city_share_rounds`)뿐이다. 직전 판 앱은 표를 모른 채 그대로 돈다. 둘 다 세계 표라 시험 세계 새로 시작에서 지워진다(남길 표 목록에 넣지 않음).
- 팩은 설정 칸 2개 더하기. 프로토콜은 메시지·코드 더하기뿐이고 최소 59라 59판 기기는 그대로 들어온다(60판 앱은 PWA로 받는다).

## NAS 첫 켬 동작 (Assumed — 코드 읽기·줄기 DB 시험, NAS에서는 아직 못 봄)
- 두 표가 비어 시작한다: 걸린 주문 없음, 회차 기록 없음. 도시마다 첫 회차는 `city_share_round_ms`(30분) 뒤.
- 이미 승인된 국고 지분 팔기(1116y 이후 독재 직권·가결 안건)가 있으면 그 국고 팔 주문이 걸린다.
- 증권 거래소 건물 판이 "잠김" 대신 거래소 판(정부 지분 시장 + 사업장 지분 시장 목록)을 연다.
- 배포 뒤 볼 것: `city_share_orders`·`city_share_rounds` 행 수, 서버 경고·오류, 1분 지표.

## 손으로 푼 곳
- `docs/WORKLOG.md`: 들어오는 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤 다시). 다른 충돌은 없었다(두 줄기가 같이 바꾼 파일 = `docs/WORKLOG.md` 하나).
- 판 번호: `packages/protocol/src/version.ts` 60 절(줄기 판 99)·`PROTOCOL_VERSION` 60·MIN 설명 "60부터 58판 이하"·`MIN_SUPPORTED_PROTOCOL_VERSION` 59, `cityShares.ts`
  `CITY_SHARE_PROTOCOL_VERSION` 60(주석 "합칠 때 판을 맞춘다" 지움), `content/core/manifest.json` 138, ADR `2026-11-21-share-market.md` 명령·조회 줄(프로토콜 60/59).
  줄기 기록은 고치지 않았다(줄기 판 그대로, 이 기록이 묶음 판 — 앞 묶음과 같은 방식).
- main 6a91da1ad9 합치기: 충돌 없음. 두 쪽이 `manifest.json`을 똑같이 135 → 136으로 바꿔 저절로 136이 되어 **137**로 올렸다. 질문 번호가 겹쳤다 — main의
  `docs/questions/2026-11-21-npc-houses.md`가 2461~2467을 먼저 써서 share-market 질문 2461~2470을 **2471~2480**으로 옮겼다(질문 파일·governance-3 질문 표 줄·ADR·`cityShares/service.ts`
  주석·이 기록). 줄기 기록 `21-2216-share-market`의 2461~2470은 줄기 번호 그대로 두었다(= 지금 2471~2480). 손으로 푼 코드 충돌이 없어 전체 검사는 다시 돌리지 않았다(푸시 전 훅이 한 번 돈다).
- main 5cf0d2d89a 합치기: `docs/WORKLOG.md`만 충돌(들어오는 쪽 + `pnpm docs:index`). `manifest.json`은 저절로 137이 되어 **138**로 올렸다. `e2e/economy.spec.ts`는 두 쪽이 다른 곳을
  바꿔 저절로 합쳐졌다(e2e-fix = 시세 색, main = 광석 10 kg 묶음 문구). 손으로 푼 코드 충돌이 없어 전체 검사는 푸시 전 훅에서만 돈다.
- 저절로 합쳐진 곳: 메시지 ko·en(8,748키씩, main 6a91da1ad9 합친 뒤 8,750키씩 — paraglide 다시 만듦), `tuning.json`, 서버 `tables.ts`·`schema.ts`·`session.ts`.
- 파일 크기: 넘은 파일 없음. 큰 파일(main 6a91da1ad9 합친 뒤): `apps/server/src/app.ts` 999, `world/world.ts` 998, `npc/economy.ts` 997, `world/persist/tables.ts` 996, `sim/src/simulator/society.ts` 991, `db/schema.ts` 960,
  `session.ts` 952. 시장 새는 규칙: 새 코드에 `cityMap.get` 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@138 |
| `docs/questions/2026-11-21-share-market.md`, `docs/questions/2026-11-21-governance-3.md`, `docs/adr/2026-11-21-share-market.md`, `apps/server/src/cityShares/service.ts` | 질문 번호 2461~2470 → 2471~2480 |
| `packages/protocol/src/version.ts`, `cityShares.ts` | 프로토콜 60(최소 59), `CITY_SHARE_PROTOCOL_VERSION` 60 |
| `docs/adr/2026-11-21-share-market.md` | 명령·조회 줄 판 번호 |
| `docs/worklog/2026/11/21-2103-batch-1116y-merge.md` | 1116y 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/21-2308-batch-1116z-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 61(최소 60), 팩 139, SIM 72. 다음 마이그레이션 `prevIds` = **90e99c42-2912-427e-b53e-b00329f24354**(끝 하나).
- `apps/server/src/app.ts`(999)·`world/world.ts`(998)·`npc/economy.ts`(997)·`world/persist/tables.ts`(996)·`sim/src/simulator/society.ts`(991)를 늘리면 새 모듈로 나눈다.
- 화면 범위를 바꾸면 `apps/game/src/scope/scopeRoutes.ts`와 `e2e/dev.spec.ts` `TOOL_SCOPES`를 같이 바꾼다(e2e-fix).
- 줄기 기록 `21-2216-share-market`의 "함께 바꿔야 하는 파일"·"건드리지 말 것"을 따른다. 앞 묶음 TODO 그대로: 거래소를 읽기만 할 때는 `peekMarket`, 다음 배포에서 옛
  `exchange_lockers` 표를 지운다(1116n TODO).

## 건드리지 말 것
- 마이그레이션 `20261121125203_city_share_market`(올라간 뒤 고치지 않는다).
- 사업장 지분 엔진(`business/shares.ts` 체결·발행 — 질문 2472 답 전까지), 디자인 토큰·누르는 곳 규칙(`--tap-min`).

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,748키)·디자인 값(746쌍)·콘텐츠
  (core@136 f8910427f14f) 통과, 시험 파일 **854/855**, 시험 **6,154/6,155**(`@terra/sim` 골든 포함 — SIM 68, main 6a91da1ad9 합치기 전). 실패 1개는 `governance/governance.db.test.ts` "선출 → … → 독재는 표 없음"의
  체제 전환 안건이 `passed`가 아니라 `failed`로 닫힌 것(223줄). 그 파일만 따로 7번 돌려 **7/7 통과**(4/4씩). 다른 줄기 검사·화면 시험과 DB·CPU를 함께 쓴 동안 한 번 났고, 이 묶음은
  의결 판정을 바꾸지 않았다(share-market은 의결 묶음에 시장을 잇기만 함) → 부하 때 흔들리는 시험으로 본다(Assumed, 원인 미확인 — 아래 미검증 절). 푸시 전 훅의 `pnpm check`가 한 번 더 돈다.
- `pnpm check:content 154c22be52`(core@136 f8910427f14f, 단계 1·2·4a·4b), `pnpm check:docs 154c22be52`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- main 6a91da1ad9 합친 뒤(core@137): `pnpm check:content 6a91da1ad9`(core@137 45611b7e1a40, 단계 1·2·4a·4b), `pnpm check:docs 6a91da1ad9`, 다국어(8,750키), `settings:cells --check`,
  `wiki:index --check`, `db:generate` = "No schema changes" 통과. 이 상태(6a91da1ad9 합친 65769434ab)로 푸시 전 훅의 전체 `pnpm check`(TEST_DATABASE_URL) 통과: 시험 파일
  **862/862**, 시험 **6,190/6,190**(앞서 흔들린 `governance.db.test.ts`도 통과) — 푸시는 main이 또 바뀌어 거절됐다.
- main 5cf0d2d89a 합친 뒤(core@138): `pnpm check:content 5cf0d2d89a`(core@138 b17a0ec26895, 단계 1·2·4a·4b), `pnpm check:docs 5cf0d2d89a`, 다국어(8,750키), `settings:cells --check`,
  `db:generate` = "No schema changes" 통과. 전체 `pnpm check`는 푸시 전 훅에서 다시 돈다.
- `apps/game`이 바뀌어(정부 지분 시장 칸·거래소 판·사업장 호가창) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,768 B** / 상한 131,416 B(파일 7개,
  1116y 110,735 B에서 +33 B).
- 화면 시험(한 번씩, 빌드한 앱): `share-market.spec.ts` **9/9**(10.3분), `build-mode.spec.ts` **9/9**(6.1분), `economy.spec.ts` **27/27**(4.1분 — 1116y의 시세 색 두 실패가 e2e-fix로 풀림),
  `labor.spec.ts` **4/4**(35.5초), `buildings.spec.ts` **14/14**(1.8분). 합 **63/63**. 결과 폴더는 읽은 뒤 지웠다.

## 미검증·알려진 문제
- **실제 NPC 경제 세계에서 끝-끝 사고팔기를 보지 못했다**: 나라 화폐로 산 끝-끝 거래는 DB 시험(경제 런타임 없는 시험 세계 — 서버 기준 화폐)과 화면 시험(서버 거절 길)만 봤다 — Unknown.
- 증권 거래소 판의 "ok" 화면은 단위 시험·가짜 응답 화면 시험으로만 봤다(실제 지분 시장이 있는 세계의 판은 못 봄).
- 화폐 표시가 팩 임시 코드(PLACEHOLDER)로 보인다(팩이 임시 데이터).
- NPC 지배 가문·NPC 나라의 지분 팔기는 시장을 거치지 않는다(시뮬 직접 양도 그대로) — 질문 2471.
- 줄기가 고른 설계 둘(사용자 확인 전): ① 파는 지분은 묶지 않는다(의결권·배당·과반·상장폐지가 계정 잔고로 세므로) — 회차 때 판 쪽이 모자라면 체결량이 호가창의 팔 주보다 줄 수 있다.
  ② 체결 안 된 도시 지분 주문은 회차를 넘어 남는다(거둘 때까지 호가창). 거래 세금·수수료 없음(2474), 증권 거래소 건물은 주문 조건이 아니다(2475).
- e2e-fix: 화면 시험 31개 파일(대부분 3D 지도 — `terrain-objects`·`planet-view`·`map-*`·`gather-*` 등)은 줄기에서 돌리지 않았다. `terrain-objects.spec.ts`는 `/dev/terrain-objects`가
  2차맵 시험 화면으로 합쳐진 뒤(`c7b69b19`) 낡았을 가능성이 크다(Assumed). `/dev/terrain-objects`의 범위 줄이 "행성 하나"로 보이는 것이 맞는지(합친 화면 기준)는 확인할 일.
- `governance.db.test.ts` 체제 전환 안건이 전체 검사(부하) 때 한 번 `failed`로 닫혔다(따로 7/7 통과). 의결 코드에 난수·벽시계는 없다(검색) — DB 줄 차례 같은 다른 원인일 수 있다(Unknown).
- NAS 첫 켬 동작은 위 절 그대로 Assumed.

## 사용자 결정 대기
- 질문 2471~2480(share-market), 2461~2467(npc-houses — main 6a91da1ad9), 앞 묶음의 2451~2460·2441~2448·2431~2440·2421~2427·2381~2385·2401~2410·2371~2375·2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·
  2301~2306·2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.
