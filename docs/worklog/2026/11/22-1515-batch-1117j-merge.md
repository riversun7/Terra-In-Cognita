# 2026-11-22 묶음 1117j 합치기 (NPC 휴먼 세 들기 / NPC 외교 판단에 호감·신뢰 / 같은 가문 공격 막기·기본 NPC 국가 강하게(D-593) / 1117i 고침·진 사이보그 귀환(D-594)) — 리셋 필요 없음

- 일시: 2026-11-22 15:15~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1430-npc-rent`·`22-1445-npc-diplo`·`22-1400-d593`·`22-1520-fixes-1117i`,
  질문 `docs/questions/2026-11-22-npc-rent.md`(2731~2735)·`2026-11-22-npc-diplo.md`(2721~2725)·`2026-11-22-d593.md`(2711~2715)·`2026-11-22-fixes-1117i.md`(2741~2745),
  ADR `2026-11-15-business-ledger.md`(npc-rent), `2026-11-21-diplomacy-treaties.md`·`2026-11-01-npc-brain-r5.md`(npc-diplo), `2026-11-11-faction-identity.md`·`2026-11-07-world-layout.md`(d593),
  `2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md`(d593·fixes-1117i), `2026-11-08-injury.md`·`2026-11-03-labor-contracts.md`(fixes-1117i), 기획 D-555 1509·D-255·D-593·D-594

## 한 일
- main 2f0ad60f03(묶음 1117i 기록) 위에 줄기 넷을 차례로 합쳤다(합치기 커밋 `--no-ff`, 기본 메시지). 앞 셋은 바탕 801e782fab(묶음 1117h), 넷째는 바탕 2f0ad60f03.
  1. `work/npc-rent`(3650bd89df): NPC 세력 휴먼이 플레이어 사는 곳(`unit_residences`)에 세 든다 — 고르기 규칙식·1분 훑기(`residence/npcRent.ts`), NPC 화폐 값 셈·걷기
     (`residence/npcRentWorld.ts`), 장부 건물 색인(`residence/book.ts`), 세 든 숙소의 밤 숙박비 건너뜀(`npc/npcWages.ts`), NPC 런타임 고리(`gather/world.ts`). 설정 칸 `npc_rent_*` 다섯.
  2. `work/npc-diplo`(0b52ee1a9b): NPC 새 선포·강화·참전 답에 호감·신뢰 몫(`packages/sim/src/npc/relationScore.ts`, `brain.ts`, `effectiveTraits.ts`, 고리 `SimHooks.relationOf` —
     서버만 붙임), 호감 오르는 길(`diplomacy/affinityRise.ts`). 설정 칸 `npc_relation_*` 여섯 + `dip_*` 넷.
  3. `work/d593`(25585d66bf — 조정자 지시로 이 묶음에 더함): 같은 가문 공격 막기(`factionIdentity/houseGuard.ts`, 추방 길 지움), 기본 NPC 국가 강하게(`packages/sim/src/npc/fixedNation.ts` — 경비대 ×2·
     억지·되찾기·반란 문턱, 시뮬 판정 바뀜), 기본 NPC 국가 쿠데타 막기·NPC 서열(`governance/coup.ts npcScore`·`launch → strongEnough`, `npcVote.ts`). 설정 칸 일곱(`npc_fixed_*` 넷·`gov_fixed_*` 셋).
  4. `work/fixes-1117i`(e05478a62d — 조정자 지시로 더함): 쿠데타 전투가 시청·둘레 시설을 깎음(`governance/coupWorldBattle.ts`), NPC 일꾼 작업 부상(`npc/npcWorkInjury.ts`, 지표 `npcWorkInjuries`),
     이동 중 죽은 NPC 길 버림, 도시에 있는 휴먼만 일꾼·웨이브 수비(`npc/economy.ts`·`runtime.ts`, 시뮬 선택 칸 `GardenerOptions.defends`), 일터 가는 길 저장(새 표 `unit_commutes`),
     D-594 진 사이보그 본체는 다쳐서 실제 이동으로 사는 곳에(`world/cyborgHome.ts`, `travel/service.ts`·`planner.ts`, `world/world.ts`).
- 충돌과 푼 방법:
  - `content/core/manifest.json`(세 번)·`docs/WORKLOG.md`(네 번): 판 다시 매김·목차 다시 만들기.
  - `content/core/tuning.json`(d593 × npc-diplo — 같은 자리에 `dip_*` 넷과 `gov_fixed_*` 셋): 둘 다(npc-diplo 다음 d593, 칸 ID 1,017개 겹침 없음 — Verified 실행).
  - `governance/rules.ts`·`tuning/scope.ts`·`packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`·`packages/sim/src/npc/brain.ts`(`RivalView`): npc-diplo 칸과 d593 칸 둘 다.
    `brain.ts attackScore`는 저절로 합쳐져 d593 되찾기 몫(`fixedRetakeBonus`)과 npc-diplo 관계 몫(`warRelationOffset`)이 함께 든다(npc-diplo 기록이 예고한 한 줄 겹침 — 둘 다 남김).
  - `factionIdentity/attach.ts`: d593은 같은 가문원 공격 추방 고리(`attachHouseExpel`)를 지우고, league-3(main)은 연맹 조항 고리(`attachLeagueTies`)를 지웠다 → 둘 다 없음.
  - **`factionIdentity/houseGuard.ts`(d593 × league-3)**: d593의 `sameHouseOwners`가 `world/leagueTies.ts houseOfOwner`를 가져오는데 league-3이 그 파일을 지웠다(저절로 합쳐진 뒤 남은 깨진 import).
    가문 찾기 함수 `houseOfOwner`(가문 소유 주체 → 그 가문, 사용자 주체 → `houseTies.houseOfUser`, 몸은 옛 파일 그대로)만 `houseGuard.ts`로 옮겼다. 연맹 조항 집행은 지운 그대로.
    ADR `2026-11-11-faction-identity.md` "바뀜 (d593)"의 가문 셈 위치 글을 고쳤다(묶음에서 옮김을 적음).
  - `governance/coup.test.ts`(d593 × no-teleport-a·b): 가짜 포트에 두 쪽 모두 — `fake` 옵션 `ruling`(no-teleport-b)·`fixed`(d593), 가문 유닛 `n:7`·`n:5`, `npcHousesOf`는 `fixed`를 따르고
    NPC 파견 포트 함수(`sendNpcTroop`·`npcTroopEta`)·세계 전투 포트는 main 그대로, `rules`에 `...options.fixed?.rules`, 돌려주는 값은 main의 것(`end`·`joins`·`wakes`·`npcSends`) + `sides`,
    `gatherTick`은 main의 것(시계 +10ms)을 `start` 나라로. 시험 묶음은 둘 다(no-teleport-a·b 다음 d593 묶음).
  - `governance/governance3.db.test.ts`: main(no-teleport-a — `() => world`, `coupBattleUnits: 200`)의 쿠데타 시험 머리에 d593의 `BASE_RULES`(기본 NPC 국가 지키기 끔)를 썼다. fixes-1117i의 넥서스 목표 확인은 저절로 합쳐짐.
  - ADR `2026-11-15-unloaded-second-maps.md`·`2026-11-21-governance.md`: 절 모두 남김(no-teleport-b → no-teleport-a → d593 → fixes-1117i).
  - 그 밖(`governance/coup.ts`·`npc/economy.ts`·`npc/runtime.ts`·`residence/*`·`diplomacy/*`·`travel/*`·`world/*`)은 저절로 합쳐졌고 타입 검사·시험 통과(Verified, 아래 전체 검사).
- 함께 본 동작(코드 읽기, Assumed — 운영에서 확인):
  - no-teleport-b(NPC 2차맵 사이 이동) × npc-rent: 휴먼이 다른 도시로 가면 npc-rent의 "다른 도시 → 고른 것 지움"이 다음 1분 훑기에 세 든 집을 놓는다.
  - fixes-1117i D-594(`cyborgHome.ts`가 `residenceBookOf(ledger).residenceOf`로 본체 사는 곳을 찾음) × npc-rent(같은 장부에 NPC 휴먼 줄, 건물 색인): 본체 유닛 ID로 찾으므로 NPC 줄과 섞이지 않는다.
  - d593 쿠데타 힘 비(`strongEnough` — 열 때만) × no-teleport-a 세계 전투·fixes-1117i 시청 피해: 여는 문만 다르고 전투·결과 길은 같다.

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 68(최소 67) | 넷 모두 그대로 | **68(최소 67)** 그대로 |
| 팩 core | 147 | npc-rent 206, npc-diplo 196, d593 186, fixes-1117i 그대로 | **148** |
| SIM_VERSION | 75 | d593 115, 나머지 그대로 | **76** |

- 프로토콜: 메시지 모양·행동 뜻 바뀜 없음. npc-rent는 사는 곳 조회 `occupants`에 NPC 휴먼이 함께 든다(모양 그대로). d593은 결과 코드 `own_target`·`coup_protected`를 다시 쓰고(뜻 넓힘 —
  낮은 판 기기도 아는 코드), tRPC `sameHouse` 칸 더하기. 그래서 올리지 않았다.
- 팩: `manifest.json` 148. 설정 칸 스물둘 더하기만(지운 ID 없음 → `id-changes.json` 그대로).
- SIM: `packages/sim/src/version.ts` 76 항목(d593 줄기 판 115 글을 옮김) + `SIM_VERSION = 76`. 합친 트리에서 `@terra/sim` 골든 통과(d593 줄기가 고친 시험 기대값 그대로 — 다시 만들 것 없음,
  npc-diplo 관계 몫·fixes-1117i `defends`는 시뮬에서 붙지 않아 0 / 넘기지 않음).
- ADR 판 줄: 묶음 판 + 대괄호에 줄기 판(`business-ledger.md` npc-rent "core@148 [줄기 판 206]", `diplomacy-treaties.md` npc-diplo "core@148 [줄기 판 196]",
  `governance.md` d593 "core@148 [줄기 판 186]", `world-layout.md` d593 "SIM 76 — 묶음 1117j [줄기 판 115]"). 줄기 작업 기록·질문 파일은 줄기 판 그대로.

## 마이그레이션
- 새 마이그레이션 하나, 고치지 않고 그대로 합쳤다: `20261122060411_unit_commutes`(fixes-1117i, 스냅숏 `6692c0a0-eba0-4ba6-96d6-b4933995d933`, prevIds = 1117i 여섯 끝 모두 — Verified: snapshot.json) —
  새 표 `unit_commutes`만(직전 판 앱은 모른 채 돈다). 다른 셋은 없음.
- `db:generate` = "No schema changes"(Verified).
- 다음 마이그레이션 `prevIds` = 끝 하나: **6692c0a0-eba0-4ba6-96d6-b4933995d933**.

## 질문 번호
- 2711~2715(d593), 2721~2725(npc-diplo), 2731~2735(npc-rent), 2741~2745(fixes-1117i) — main(2702까지)·서로와 겹치지 않아 옮기지 않았다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 표 더하기만. 배포 뒤: 집세를 정한 집이 있는 도시의 NPC 일꾼이 1분마다 최대 200명씩 세 든다(정원이 차면 플레이어 유닛도 `full`). NPC 선포·강화에 호감·신뢰 몫, 호감은 하루마다 0 쪽으로.
  기본 NPC 국가는 다음 판단부터 경비대를 더 산다(국고에서 구인 카드 값), 플레이어 가문은 그 나라 지도자 선출에 나서지 못한다. 같은 가문 유닛은 칠 수 없다(추방 길 없음).
  진 사이보그 본체는 사는 곳으로 실제 이동해 돌아간다. 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0).

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `content/core/tuning.json` | 충돌 풀기, 팩 core@148 |
| `apps/server/src/factionIdentity/houseGuard.ts` | 지워진 `world/leagueTies.ts`에서 `houseOfOwner`만 옮김(d593 × league-3) |
| `apps/server/src/factionIdentity/attach.ts`, `governance/rules.ts`, `tuning/scope.ts`, `governance/coup.test.ts`, `governance/governance3.db.test.ts` | 충돌 풀기(둘 다) |
| `packages/sim/src/npc/brain.ts`, `society/governanceCoefficients.ts`, `tuningGovernance.ts` | 충돌 풀기(둘 다) |
| `packages/sim/src/version.ts` | SIM 76 |
| `docs/adr/2026-11-15-business-ledger.md`·`2026-11-21-diplomacy-treaties.md`·`2026-11-21-governance.md`·`2026-11-07-world-layout.md`·`2026-11-11-faction-identity.md`·`2026-11-15-unloaded-second-maps.md` | 판 줄, 충돌 풀기(절 모두), 가문 셈 위치 |
| `docs/worklog/2026/11/22-1407-batch-1117i-merge.md` | "## 배포 (Verified)" 덧붙임(조정자 배포 확인 메모) |
| `docs/worklog/2026/11/22-1515-batch-1117j-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 69(최소 68), 팩 149, SIM 77. 다음 마이그레이션 `prevIds` = `6692c0a0-…` 하나.
- 줄기 기록의 "함께 바꿔야 하는 파일" 그대로(2731 다·2732 나(npc-rent), 2721·2723(npc-diplo), 2711~2714(d593), 2742~2745(fixes-1117i)).
- 1117i의 남은 일 그대로(쓰지 않는 연맹 조항 표 정리, `LEGACY_UNIT_KIND_GUARDIAN` 읽기 지우기). `factionIdentity/attach.ts` 머리 주석의 "연맹 조항 카드 집행 고리도 그때 붙인다(league-2)"는
  league-3 뒤 낡은 글이다(main부터 — 이 묶음에서 고치지 않음).

## 건드리지 말 것
- 마이그레이션 `20261122060411_unit_commutes`(이제 올라간다 — 고치지 않는다).
- 시뮬에 `relationOf`·`defends`를 붙이지 않는다(붙이면 판정이 바뀐다). 계수표 기본값(`TEST_NPC_COEFFICIENTS`·`START_GOVERNANCE`)은 팩 값과 같게 둔다(d593 기록).
- 호감 표 `diplomacy_affinity.updated_at_ms`는 하루 걸음 날을 정한다.

## 검사 (Verified)
- 첫 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — npc-rent·npc-diplo 두 줄기 트리) **한 번에 통과**: 시험 파일 903/903·시험 6,454/6,454. 그 뒤 조정자 지시로 d593·fixes-1117i를 더해
  아래를 최종 트리에서 다시 돌렸다(그사이 빌드·화면 시험을 하나 시작했다가 최종 트리가 아니라 멈춤 — 결과로 쓰지 않음).
- d593을 합친 트리(작업 중): 타입 검사 전체, `pnpm vitest run packages/sim`·`governance/coup.test.ts`·`factionIdentity`·`diplomacy`·`residence` 150/150 파일(10 건너뜀)·1,227/1,227 시험(`@terra/sim` 골든 포함).
- **최종 트리 전체 `pnpm check`**(TEST_DATABASE_URL, DB 시험 포함, 잠금 안, 네 줄기 + 판 다시 매김, 기록 커밋 전 — 문서만 다름) **한 번에 통과**: 포맷(3,424파일)·린트·타입·모듈 경계·파일 크기(5,000줄 경고 없음)·
  다국어(9,001키)·디자인 값(746쌍)·콘텐츠(core@148 37c1e1503290), 시험 파일 **906/906**, 시험 **6,471/6,471**(`@terra/sim` 골든 포함 — SIM 76, 544초). 흔들리는 DB 시험(`governance3.db.test`)도 한 번에 통과.
- `pnpm check:content origin/main`(호환 포함, core@148 37c1e1503290, 단계 1·2·4a·4b 기준 2f0ad60), `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm docs:index --check`·`pnpm check:docs`(기록 커밋 뒤), `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 257항목), `pnpm check:bundle` 첫 화면 JS **110,770 B** / 상한 131,416 B(1117i 110,772 B에서 −2 B, 파일 7개 — d593 문구 바뀜은 지연 조각, Assumed).
- 화면 시험(빌드한 앱, 다섯 파일 한 번에, 39.7분 — 소프트웨어 WebGL이라 느림): `building-screen.spec.ts` **11/11**(사는 곳 카드 포함), `diplomacy.spec.ts` **6/6**, `governance.spec.ts` **16/16**
  (쿠데타 병력·전투 중 포함), `produce.spec.ts` **4/4**("일터로 가는 중" 포함), `unit-control.spec.ts` **20/21** — 합 **57/58**.
  실패 하나 = `unit-control.spec.ts:252` "…[멈추기]로 세운다" 시험 시간 초과(120초, 이동 사진을 찍은 뒤 — 2026-11-14 stop-detach 기록의 느린 기계 경쟁과 같은 자리). 그 시험만 다시 돌려 **1/1 통과**(1.4분).
  같은 파일의 같은 가문 작은 창 사진(d593 문구)은 넷 모두 통과. 빌드 결과·시험 결과 폴더는 지웠다.

## 미검증·알려진 문제
- NPC 세 들기·호감 하루 걸음·NPC 작업 부상·도시에 없는 휴먼 수·기본 NPC 국가 경비대 구매는 운영에서 재지 않았다(Unknown — 배포 뒤 확인). NPC 런타임이 켜진 서버에서 돌려 보지 않았다(단위·DB 시험만, 미실행).
- D-594 다른 2차맵 귀환은 단위 시험으로만(fixes-1117i 기록). 쿠데타는 꺼져 있어 쿠데타 막기·시청 피해는 운영에서 돌지 않는다.
- 운영 DB의 마이그레이션은 배포 때 확인.

## 사용자 결정 대기
- 질문 2711~2715, 2721~2725, 2731~2735, 2741~2745, D-594 이동 방법 확인, 그리고 앞 기록의 남은 대기(2651~2659, 2661~2668, 2671~2678, 2681~2685, 2691~2702 …).
