# 2026-11-21 npc-claim-3 — NPC 알박기 재료·운반(시뮬·서버 같은 규칙), 알박기 도시 = NPC 가문(D-580), 서버 3단계(설정 칸으로 끔)

- 일시: 2026-11-21 15:00 (KST)
- 작업 도구: Claude Code
- 관련: 빈틈 2243, 질문 `docs/questions/2026-11-21-npc-claim.md` 2331 가·2332 가·2333 가(순간이동 없이)·2334 가·2335 나(D-580)·2336 가, 기획 D-212·D-555 1505·1509·
  D-564 1626·D-554·D-572·D-574·D-575·D-580·D-5056, ADR `2026-11-01-npc-brain-r5.md` "바뀜 (2026-11-21, 줄기 npc-claim-3 …)", 새 질문
  `docs/questions/2026-11-21-npc-claim-3.md`(2381~2385), 앞 기록 `docs/worklog/2026/11/21-1400-npc-claim.md`
- 가지 `work/npc-claim-3`, 바탕 954fe231c4(main, 묶음 1116t)

## 한 일
- **재료·시간 규칙 하나**(`packages/sim/src/simulator/claimRules.ts`, 꾸러미 길 `@terra/sim/claim` — `index.ts`가 999줄이라 새 길로): 재료 = 팩 행정 건물(`government_hall`)
  레벨 1 재료(통나무 36·돌 28), 자리 = 알박기 자리에서 가장 가까운 내 도시 창고(레벨 0 재료는 T0~T1 받음). 운반 시간 = 옮김 셈 `haulMs`(무게 × 2차맵 거리 × 256칸 ÷ 그 도시
  일 없는 휴먼, 적어도 1). 짓는 시간 = 행정 건물 레벨 1 시간을 같은 사람들이 돕는다. 세력 상한·조건 `claimGate`.
- **시뮬(2331 가·2333 가)**: 국고 값 소각을 없애고 재료를 그 도시 창고에서 뺀다(`facility_build`). 창고에 모자라면 후보가 아니고, 판단 끝(`NpcClaimRun.prepare`, 증축 다음)에
  그 도시 목표 재고(`Economy.claimWants` → `npcTrade.ts cityTargets`)에 넣어 증축처럼 산다(국고가 재료 값 × 예비 ‰을 덮을 때만). 보이는 운반꾼이 없어 시간 셈 — 끝 = 시작 +
  운반 + 짓는 시간. `ClaimView.cost` = 재료 값. 경제 없는 시나리오는 재료 자리가 없어 알박기 없음(2381). 처음 판(재료가 있을 때만 후보, 사지 않음)은 econ16에서 알박기 0이었다
  (창고에 통나무·돌이 늘 0~20개 — 증축이 다 씀) → 사는 길을 넣었다.
- **D-580(2335 나, 조정 세션 전달)**: 시뮬은 다 지으면 지은 NPC 가문이 새 세력이 된다(`SocietyRun.claimHouse` — 봉신 | 독립 + 체제 = 가문 성향 규칙식 `foundingChoice`(마을
  세우기와 같다), 재료를 낸 도시의 부모 휴먼 founders명(경비대 빼고)이 가문원으로 옮김, 지분 1,000주 = 그 가문, 생김 원인 `claim`). 시뮬 세계의 "가문" = 마을 세우기처럼 세운
  자식 세력(kind house)이라, 가문은 다 지을 때 세운다(재료는 부모 창고 — 해석, 아래 미검증).
- **서버 3단계**(`apps/server/src/npc/npcClaims.ts`·`claimSites.ts`, 설정 칸 `npc_claim_server` 기본 0 = 끔): 후보 = 내 도시 2차맵에서 행성 칸 이웃 반경 겹 안의 도시·폐허
  없는 2차맵 가운데 띄웠거나 지금 띄울 수 있는 것(그때 띄우기 `hasRoom`·`canOpen`), 세계 상한 도시·폐허 2차맵 + 알박기 중 2차맵 < `MAX_CITY_MAPS` 64, 재료는 시뮬과 같은 함수
  (모자라면 `prepare`가 산다). 짓기 = 2차맵 띄우기(그때 띄우기 — 건물이 서면 쉬어도 안 내림) → 가운데부터 레벨 0·도시 없는 행정 건물 놓기 → 도시 창고 → 그 건물 창고로 빈 일꾼
  운반 일(`npcCarry.ts`, 열쇠 `k:<번호>` — 보는 2차맵은 화물을 진 휴먼이 출발 2차맵 변 쪽으로, 아니면 시간 셈, 운반꾼 없으면 기다림) → 닿으면 건물 서비스 `npcJob` kind `build`
  (그 건물 창고 재료로 짓기 작업) → 다 지으면 `landClaim.foundPending`. 모자라게 닿으면 다시 나르고, 그 2차맵에 도시가 서면 버린다. 다시 켜면 작업 없는 NPC 레벨 0 알박기
  건물을 다시 맡는다. 플레이어 자리 설정 칸 `npc_claim_avoid_players`(2332, 기본 0). 같은 세력만 같은 편(2336 가 — landClaim 그대로).
- 건물 서비스 `npcJob`에 kind `build`(레벨 0·도시 없는 행정 건물만, 재료 자리 = 그 건물 창고, `myFacility`의 도시 채우기를 끔 — 영토 지방 도시로 채우면 알박기가 아니게
  된다. DB 시험에서 그렇게 깨지는 것을 봄 → 플레이어 알박기에도 같은 문제가 있을 수 있어 제안 작업으로 넘김).
- 설정 칸: 없앰 `npc_claim_cost`·`npc_claim_build_hours`(`id-changes.json` 뒤에 추가, since 170), 새로 `npc_claim_server`·`npc_claim_avoid_players`(ko·en), `npc_claim_max_active` 설명.

## 이어서 한 일 (조정 세션 지시 — main 합침·서버 D-580·지표)
- main 497aba3e97(묶음 1116u) 합침: 충돌 `manifest.json`(줄기 판 170으로)·`WORKLOG.md`(main 것 + `pnpm docs:index`). `tuning.json`·`npcRun.ts`·`society.ts`는 저절로 합쳐짐.
- **서버 다 지음 D-580**(`apps/server/src/ruins/landClaim.ts foundNpcHouse`): 세력 주체(NPC)가 지은 알박기는 시뮬과 같은 `society.claimHouse`로 새 NPC 가문 세력을 세운다
  (봉신 | 독립 + 체제 = 가문 성향 규칙식, 재료를 낸 도시 = 그 2차맵에서 행성 칸 이웃 겹으로 가장 가까운 부모 도시의 휴먼 founders명이 가문원, 지분 1,000주 = 그 가문). 도시 행·
  자리는 가문 마을과 같은 길로 나눴다(`npc/houseRuntime.ts placeCity` — `foundVillage` = `placeCity` + 시설 고리 + 지분). 시설 줄 고르기 칸 = 가문이 고른 것, 알박기 도시 줄
  설립자 = 그 가문, 같은 동기 처리에서 가문 세력 행·도시 행을 쓰기 대기열에(`houses.flush`). 늦은 쪽 멈춤은 그 가문 기준(지은 부모의 다른 짓는 중도 다른 편 — 2336 가).
  "켜기 전에 바꿔야 함" TODO를 지웠다.
- **1분 지표**(`npcClaims.ts takeMetrics`, `runtime.ts` 한 줄 → 999줄): `npcClaimActive`(NPC 알박기 중 — 띄우는 중·나르는 중·짓는 중), `npcClaimStarted`·
  `npcClaimFounded`·`npcClaimAbandoned`(구간 수). `world.ts`·`app.ts`는 그대로(지표는 런타임 지표에 붙는다).
- DB 시험(`npcClaims.db.test.ts`): 새 도시 주인 = 새 가문(부모 아님, 태어날 때 부모 = 지은 세력, 상위 = 없음 | 지은 세력), 지분 1,000주 = 가문·부모 0, `claim_cities` 설립자 =
  가문, 지표 `npcClaimFounded` ≥ 1.

## 판·마이그레이션·리셋
- **SIM_VERSION 106**(줄기 판 = main 66 + 40 — 합칠 때 main 다음 판으로), 출력 형식 **23 그대로**(칸 모양 같음: `npc.claims.spent` = 뺀 재료, 세력 생김 원인 표에 새 열쇠 `claim`),
  팩 **core@170**(줄기 판 — 처음 169 = main 129 + 40, main 130(묶음 1116u)을 합친 뒤 170). 프로토콜 그대로. DB 표 그대로 — **마이그레이션 없음**. 리셋 필요 없음(서버 알박기는 꺼진 채 들어간다).

## 시뮬 전·후 (Verified — 30일, 전 = main 954fe231c4, 후 = 이 가지, 둘 다 출발값)
세계 = 요약 `world`(모든 세력), 시나리오 묶음 = 요약 `groups` 끝 합(알박기 가문·반란·마을 세력 빼고 — 후에는 알박기 도시가 가문 세력으로 가서 줄어든다).

| 시나리오·시드 | 알박기 새 도시 | 세계 도시 | 세계 휴먼 | 세계 세력 | 묶음 도시 | 묶음 휴먼 | 뺀 재료(통나무·돌) |
|---|---|---|---|---|---|---|---|
| econ16·1 | 8 → 9 | 76 → 80 | 2,253 → 2,239 | 44 → 54 | 48 → 42 | 1,760 → 1,579 | 324·252 |
| econ16·2 | 7 → 11 | 77 → 81 | 2,517 → 2,753 | 46 → 59 | 47 → 38 | 1,965 → 1,932 | 365·308 |
| econ16·3 | 10 → 15 | 79 → 83 | 2,012 → 2,216 | 45 → 58 | 50 → 41 | 1,446 → 1,509 | 540·420 |
| war16·1 | 25 → 0 | 83 → 67 | 2,575 → 2,773 | 27 → 31 | 72 → 52 | 2,292 → 2,307 | — |
| war16·2 | 19 → 0 | 77 → 63 | 2,492 → 2,556 | 27 → 31 | 66 → 48 | 2,182 → 2,083 | — |
| war16·3 | 25 → 0 | 85 → 63 | 2,788 → 2,697 | 28 → 31 | 73 → 48 | 2,363 → 2,161 | — |
| stub16·1 | 11 → 0 | 83 → 72 | 1,133 → 1,045 | 24 → 24 | 75 → 64 | 1,041 → 953 | — |
| stub16·2 | 8 → 0 | 79 → 71 | 1,101 → 1,037 | 23 → 23 | 72 → 64 | 1,017 → 953 | — |
| stub16·3 | 13 → 0 | 87 → 74 | 1,188 → 1,084 | 26 → 26 | 77 → 64 | 1,054 → 950 | — |

- 모든 실행 불변 조건 위반 0. war16·stub16(경제 없음)의 묶음 도시 52/48/48·64는 앞 기록의 "끔" 값과 같다(알박기 없음 = 끈 판, Verified 숫자 대조).
- econ16 알박기 9~15(전 7~10): 재료를 사서 짓고 모두 다 지었다(멈춤·잃음 0). 세계 세력 +10~13 = 알박기 가문(D-580). 가문의 봉신·독립 몫은 세지 않았다(Unknown).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/claimRules.ts`(새), `packages/sim/package.json` | 재료·운반·짓는 시간·상한 규칙(시뮬·서버 같은 함수), 꾸러미 길 `./claim` |
| `packages/sim/src/simulator/npcClaim.ts`·`npcClaim.test.ts` | 재료 자리(`ClaimSupply`)·사기(`prepare`)·운반 시간·D-580 가문 |
| `packages/sim/src/simulator/society.ts`·`societyTypes.ts` | `claimHouse`(D-580) |
| `packages/sim/src/simulator/npcRun.ts`, `economy.ts`, `npcTrade.ts`, `run.ts` | `prepare` 부름, `claimWants`·목표 재고, 붙이기 |
| `packages/sim/src/npc/coefficients.ts`, `tuningNpc.ts`, `content/core/tuning.json`·`id-changes.json`·`manifest.json` | 설정 칸 빼기 2·더하기 2, 팩 170 |
| `packages/sim/src/version.ts` | SIM 106 |
| `apps/server/src/npc/npcClaims.ts`(새)·`claimSites.ts`(새)·`claimSites.test.ts`(새)·`npcClaims.db.test.ts`(새) | 서버 3단계·자리 셈·시험 |
| `apps/server/src/npc/runtime.ts`(999줄) | 알박기 붙이기·틱·지표(4줄) |
| `apps/server/src/ruins/landClaim.ts`, `apps/server/src/npc/houseRuntime.ts` | 서버 다 지음 D-580(`foundNpcHouse`), `placeCity` 나눔 |
| `apps/server/src/npc/ruinsRuntime.ts`, `apps/server/src/ruins/runtimeInput.ts` | 그때 띄우기 고리(월드 저장 묶음 `spawn` — `world.ts` 그대로) |
| `apps/server/src/facilities/service.ts`(999줄)·`serviceTypes.ts` | `npcJob` kind `build` |
| ADR npc-brain-r5 "바뀜", 질문 `2026-11-21-npc-claim.md`(답 표시), 새 질문 `2026-11-21-npc-claim-3.md` | 기록 |

## 함께 바꿔야 하는 파일
- 합칠 때: SIM_VERSION 106 → main 다음 판, 팩 170 → main 다음 판(`manifest.json`, `id-changes.json`의 since 170도), `version.ts` 주석·ADR "바뀜"·이 기록의 판 설명.

## 건드리지 말 것
- `facilities/service.ts`·`npc/runtime.ts`는 999·998줄 — 더할 것은 새 파일로.
- `NpcClaimRun.prepare`는 증축(`buildPolicy`) 다음에 부른다(차례가 바뀌면 시뮬 결과가 바뀐다).

## 미검증·TODO·알려진 문제
- 서버 알박기는 끈 채로 들어간다(2382 — 켜기는 조정 세션이 NAS를 본 뒤 정한다).
- 서버 D-580: 가문원으로 옮긴 휴먼의 몸은 출발 2차맵에 남는다(NPC 마을 세우기와 같은 한계 — humanPlaces는 도시 2차맵에 있는 사람만 세운다). 몸을 옮기면
  사람 순간이동이라 옮기지 않았다(Assumed: 기획 확인 필요하면 다음 질문으로).
- NAS·화면에서 서버 알박기를 보지 않았다(미실행): 보이는 운반꾼이 변 쪽으로 걷는 모습, 2차맵 x·y = 행성 칸 i·j 방향(Assumed — `claimSites.ts edgeToward`), 그때 띄우기 수.
- 서버: 다시 켜면 쉬는 날 기억을 잃는다. 운반 중 다시 켜면 화물을 진 운반꾼의 짐은 운반꾼에게 남고(옛 TODO 2156) 모자란 만큼을 다시 나른다.
- 시뮬 D-580 해석: 가문은 다 지을 때 세우고 재료는 부모 창고에서 낸다(시뮬 세계의 가문 = 세력). 알박기 가문 도시 휴먼 = 옮긴 founders명.
- 버려진 NPC 알박기 건물(레벨 0)은 남는다(2384). 증축과 재료를 같이 사서 먼저 쓰는 쪽이 쓴다(2385).
- 발견(이 줄기 밖, 제안 작업으로 넘김): 플레이어 알박기 건물도 `myFacility`(알박기 고르기·수리)가 영토 지방 도시로 `cityId`를 채우면 알박기가 깨질 수 있다(Assumed — 코드 읽기).

## 검사
- 작업 중: `pnpm vitest run packages/sim` 117/117 파일·1,001 시험 통과, sim·server typecheck 통과, `claimSites.test.ts`·`npcClaims.db.test.ts`(DB) 통과,
  `pnpm settings:cells --check`·`pnpm check:content --no-compat`(core@169) 통과.
- 끝: `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번 통과 — 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠(core@169), 시험 파일 **813/813**,
  시험 **5,972/5,972**(처음 두 번은 타입 오류 1·린트 경고 1로 멈춰 고친 뒤 다시 돌림). 빌드·화면 시험은 돌리지 않았다(`apps/game` 바뀜 없음).
- main 합침·서버 D-580·지표 뒤: 고친 시험(`npcClaims.db.test`·`ruins/*`·`claimSites.test`) 통과, `pnpm check`(TEST_DATABASE_URL) 한 번 — 포맷·린트·타입·경계·크기·
  다국어·디자인 값·콘텐츠(core@170) 통과, 시험 파일 **815/816**, 시험 **5,986/5,987**: 실패 1 = `territory/territory.db.test.ts`의 `beforeEach`(시험 DB 만들기) 30초 시간
  초과(부하 — 이 줄기와 무관한 파일), 그 파일만 다시 돌려 5/5 통과.

## 사용자 결정 대기
- 질문 2381~2385(`docs/questions/2026-11-21-npc-claim-3.md`).
