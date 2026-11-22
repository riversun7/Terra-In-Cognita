# 2026-11-22 묶음 1117i 합치기 (순간이동 없음: 쿠데타 세계 전투·진 유닛 걸어 돌아가기·NPC 2차맵 사이 이동 / 연맹 조항 카드 없앰·다른 도시 병원 다녀오기) — 리셋 필요 없음

- 일시: 2026-11-22 14:07~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-1225-no-teleport-b`·`22-1240-no-teleport-a`·`22-1238-league-3`,
  질문 `docs/questions/2026-11-22-no-teleport-a.md`(2691~2695)·`2026-11-22-no-teleport-b.md`(2696~2700)·`2026-11-22-league-3.md`(2701~2702),
  ADR `2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md`(no-teleport-a·b), `2026-11-21-npc-needs-drives.md`(league-3), 기획 D-591·D-593

## 한 일
- main 801e782fab(묶음 1117h 기록) 위에 줄기 셋을 차례로 합쳤다(합치기 커밋 `--no-ff`, 기본 메시지).
  1. `work/no-teleport-a`(1b1f2c941e): 이미 `work/no-teleport-b`(0ce23b84ba)를 품고 있다(no-teleport는 1117h로 main에 있음).
     - no-teleport-b: NPC 휴먼·지도자의 2차맵 사이 실제 이동(`travel/npcTravel.ts`·`npcJourney.ts`, `TravelService.startNpc`…), 쿠데타 NPC 병력 파견(`governance/coupNpcDispatch.ts`),
       지도자 수도 따라 걷기(`npc/leaderTravel.ts`), 일터까지 걸어가기(`labor/walkToWork.ts`). 마이그레이션·프로토콜 없음.
     - no-teleport-a: 쿠데타 전투 = 세계 전투 + 늦게 닿은 병력 참전(`governance/coupWorldBattle.ts`·`coupOutcome.ts`, `world/battles.ts withJoins`), 실제 몸·부상,
       진 유닛 걸어 돌아가기(`world/battleReturn.ts`, `secondMap.walkToSafety`, 칸 `world_units.returning_until_ms`), 공격 대상 목록의 먼 유닛(`farUnitIds`).
  2. `work/league-3`(aa25fd56a8, 바탕 5706cd0fd9): D-593 연맹 조항 카드 없앰(집행 고리 `world/leagueTies.ts` 지움, `clause_on`·`clause_off`는 늘 `invalid_clause`,
     설정 칸 `house_league_fee_discount_pm` 지움 + `id-changes.json` 기록), 연맹 화면은 이름·구성원만. 2645 다친 유닛이 다른 도시 병원 다녀오기
     (`labor/stewardCare.ts`, `hospital/service.ts careQuotes/treatBy`, 새 설정 칸 `house_unit_care_cost_cap_pm`, NPC 휴먼 포함).
  3. `work/size-policy`(339e4f465b, 바탕 801e782fab — 조정자 지시로 이 묶음에 더함, 사용자 결정): 파일 크기 검사를 5,000줄 경고만으로(`scripts/check-file-size.mjs`,
     AGENTS.md 4장, `docs/PLAN.md`, ADR `2026-11-22-file-size-warning-only.md`, 줄기 기록 `22-1400-size-policy`). 충돌 없음. 아래 전체 검사가 끝난 뒤 합쳤다(스크립트·문서만 —
     전체 검사를 다시 돌리지 않고 `node scripts/check-file-size.mjs`·`pnpm check:docs`만 다시 돌림, 조정자 지시).
- 충돌과 푼 방법:
  - `packages/protocol/src/version.ts`·`governance.ts`, `content/core/manifest.json`, `docs/WORKLOG.md`: 판 다시 매김·목차 다시 만들기로 풂.
  - `apps/server/src/db/schema.ts`(`world_units`)·`world/persist/tables.ts`·`world/persist/load.ts`: 1117f의 `guardian` 칸 + no-teleport-a의 `returning_until_ms` 칸 둘 다. tables.ts는 main의
    나눔(사업장 표 → `business/table.ts`)을 그대로 두고 칸 하나만 더했다(963줄). `world/secondMapTypes.ts`: `guardian` + `held` 둘 다.
  - `docs/adr/2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md`: main의 gov-fix-4·fixes-d592 절 뒤에 no-teleport-b → no-teleport-a 절(모두 남김).
  - `factionIdentity/attach.ts`: league-2(main)의 연맹 조항 집행 고리(`attachLeagueTies`)는 league-3대로 지우고, fixes-d592의 같은 가문원 공격 추방 고리(`attachHouseExpel`)는 남겼다.
  - 그 밖(`governance/coup.ts`·`portCoup.ts`·`view.ts`·`attach.ts`·`port.ts`, `npc/economy.ts`, 설정 칸 파일)은 저절로 합쳐졌고 타입 검사·시험 통과(Verified, 아래 전체 검사).
- 쿠데타 세계 전투(no-teleport-a) × 쿠데타 중 공격 벌점 없음(fixes-d592, main) — 함께 본 동작(Verified: 코드 읽기 `governance/coupTruce.ts refreshCoupTruce`·`coupStore.ts`):
  쿠데타 줄은 전투가 끝날 때까지 `gathering`(결과 칸 `battleId`)이라, 맞선 편 표가 전투 동안에도 이어진다 — 걸어가는 동안·전투 중 맞선 편끼리의 일부러 치기는 벌점이 없고,
  쿠데타가 끝나면(won·lost·cancelled) 표가 비어 다시 벌점이 붙는다. 1117h 기록의 "쿠데타가 끝난 뒤 늦게 닿은 유닛"은 이제 전투가 열려 있는 동안 닿으면 참전한다.
  합친 트리의 타입 검사가 fixes-d592 시험(`coupTruce.test.ts`)의 쿠데타 줄에 새 칸 `battleId`가 없다고 막아 `battleId: null`을 더했다(커밋 `test: …`).
- **NPC 이동 잇기**(league-3 × no-teleport-b): `apps/server/src/hospital/attach.ts`의 임시 `travel: () => undefined`를 `travel: () => npcTravelOf(p.travel)`로 바꿨다
  (league-3의 `CareNpcTravel` 꼴이 `NpcTravel`과 같아 그대로 들어간다 — 타입 검사가 본다). 이제 NPC 휴먼도 같은 도시에 알맞은 병원이 없으면 다른 도시 병원으로 걸어갔다 온다.
  시험: `travel/npcTravel.test.ts` +1("다친 NPC 휴먼 병원 다녀오기 길" — 실제 `npcTravelOf`를 `CareNpcTravel` 자리에 두고 보내기·도착 알림 꼴 확인). `labor/stewardCare.ts` 주석 고침.
- 파일 나누기: `world/secondMap.ts`가 no-teleport-b·a(`holdRoam`·`walkToSafety`·carry)로 1,006줄 → 건물 안 유닛 세기(`unitsInBuildings`의 몸)를
  `world/mapGeometry.ts countUnitsInBuildings`로 옮겼다(동작 그대로, 998줄). 커밋 `refactor: 2차맵 건물 안 유닛 세기를 mapGeometry.ts로 옮긴다`. size-policy 결정 전에 한 것이라
  그대로 둔다(조정자 지시 — 되돌리지 않음). 이제 줄 수만으로는 나누지 않는다.

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 67(최소 66) | no-teleport-a 165(164), no-teleport-b 그대로, league-3 그대로(뜻만 바뀜) | **68(최소 67)** |
| 팩 core | 146 | league-3 245, no-teleport-a·b 그대로 | **147** |
| SIM_VERSION | 75 | 모두 그대로 | **75** |

- 프로토콜: `version.ts` 68 항목 하나(두 줄기 — no-teleport-a의 쿠데타 전투 참전, league-3의 `clause_on`·`clause_off` 뜻 바뀜 = 늘 `invalid_clause`. PROTECTED 규칙대로 뜻이 바뀐 행동이라
  이 묶음 판에 넣었다)·지원 목록 줄, `governance.ts COUP_BATTLE_JOIN_PROTOCOL_VERSION` = 68, 시험 `governance.test.ts` `toBe(68)` + `PROTOCOL_VERSION ≥`. 메시지 모양 바뀜 없음.
- 팩: `manifest.json` 147. `id-changes.json`의 league-3 기록(tuning `house_league_fee_discount_pm`, 보상 없음) since 245 → **147**(뒤에 더한 줄 하나 — 다른 줄은 그대로).
- SIM: 시뮬 설정 칸 표(`tuningHouse.ts`·`society/coefficients.ts` — 칸 하나 빼고 하나 더함)만 바뀌고 판정은 그대로 — 합친 트리에서 `@terra/sim` 골든 통과(아래 전체 검사).
- ADR 판 줄: 묶음 판 + 괄호에 줄기 판(`governance.md`·`unloaded-second-maps.md` no-teleport-a 절, `npc-needs-drives.md` league-3 절). 줄기 작업 기록·질문 파일은 줄기 판 그대로.

## 마이그레이션
- 새 마이그레이션 하나, 고치지 않고 그대로 합쳤다: `20261122025444_unit_returning`(스냅숏 `92440859-bb93-4abb-8bfa-e82e44e30f4f`, prevIds = 1117e 끝 `7e79264e-…`) —
  `ALTER TABLE "world_units" ADD COLUMN "returning_until_ms" bigint;`. main의 다섯 끝과 같은 부모의 여섯째 형제. 다른 형제와 같은 칸·체크를 건드리지 않는다(Verified: SQL 읽기).
- league-3·no-teleport-b는 마이그레이션 없음(연맹 조항 표 `house_league_clauses`는 남는다 — 쓰지 않음, 줄기 기록).
- `db:generate` = "No schema changes"(Verified, 충돌 알림 없음).
- 다음 마이그레이션 `prevIds` = 여섯 끝 모두: **2110cf87-ab35-4e1e-9369-214a912806a9**, **dd3656c0-8f69-4d66-9e59-8428866e0b8b**, **a74a580d-0e90-4570-86de-a4d25e13f18a**,
  **58acae9a-00f8-4cfc-9eed-fe370f769b8e**, **79f15f68-68dc-45b0-b490-2cc41e6757fa**, **92440859-bb93-4abb-8bfa-e82e44e30f4f**.

## 질문 번호
- 2691~2695(no-teleport-a), 2696~2700(no-teleport-b), 2701~2702(league-3) — main(2685까지)·서로와 겹치지 않아 옮기지 않았다.

## 파일 크기
- 이 묶음부터 규칙은 5,000줄 경고만(size-policy). 나눈 파일: 위 `world/secondMap.ts` → `world/mapGeometry.ts`(결정 전). 그 밖 가장 큰 것(wc -l): `world.ts`·`app.ts`·`simulator/society.ts` 999, `secondMapEngine.ts`·`npc/runtime.ts` 998,
  `sim/src/index.ts`·`facilities/service.ts` 997, `npc/economy.ts` 996, `travel/encounterWorld.ts` 991, `labor/service.ts` 984, `travel/service.ts` 979, `persist/tables.ts` 963 —
  옛 상한(1,000) 안이고 새 규칙(5,000 경고)에 걸리는 것 없음(`node scripts/check-file-size.mjs` 통과).

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 칸 더하기만(직전 판 앱은 이 칸을 쓰지 않는다). 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0).
- 배포 뒤: 수도가 바뀐 NPC 지도자는 걸어서 간다. 새로 일을 맡은 플레이어 유닛은 시설까지 걸어간 뒤 일한다(이미 일하던 유닛은 그대로). 전투에서 진 유닛은 걸어서 돌아간다(닿을 때까지 쓰지 못함).
  연맹 조항 카드는 사라진다(붙어 있던 카드는 집행하지 않음 — 시야 나눔·요금 깎기 끝). 다친 유닛(플레이어 관리인 맡김·NPC 휴먼)은 상한 안이면 다른 도시 병원에 다녀온다(줄기 기록, Assumed — 운영에서 확인).
- 프로토콜 68(최소 67): 1117h 기기(67)는 그대로 들어온다. 67 기기가 `clause_on`·`clause_off`를 보내면 `invalid_clause`를 받는다.

## 바꾼 파일과 이유 (합치며 바꾼 것)
| 파일 | 이유 |
|---|---|
| `apps/server/src/db/schema.ts`, `world/persist/tables.ts`·`load.ts`, `world/secondMapTypes.ts`, `factionIdentity/attach.ts` | 충돌 풀기(둘 다 남김, 연맹 조항 고리만 league-3대로 지움) |
| `docs/adr/2026-11-21-governance.md`·`2026-11-15-unloaded-second-maps.md` | 충돌 풀기(절 모두), 판 줄 |
| `docs/adr/2026-11-21-npc-needs-drives.md` | 판 줄(core@147, 프로토콜 68) |
| `packages/protocol/src/version.ts`·`governance.ts`(+ `governance.test.ts`) | 프로토콜 68(최소 67) |
| `content/core/manifest.json`, `content/core/id-changes.json` | 팩 core@147, 설정 칸 지움 기록 since 147 |
| `apps/server/src/hospital/attach.ts`, `labor/stewardCare.ts`(주석), `travel/npcTravel.test.ts` | NPC 이동 잇기 + 시험 |
| `apps/server/src/world/secondMap.ts`, `world/mapGeometry.ts` | 1,000줄 상한 — 건물 안 유닛 세기 옮김 |
| `apps/server/src/governance/coupTruce.test.ts` | 쿠데타 줄 새 칸 `battleId`(no-teleport-a × fixes-d592 타입 검사) |
| `docs/worklog/2026/11/22-1219-batch-1117h-merge.md` | "## 배포 (Verified)" 덧붙임(조정자 배포 확인 메모) |
| `docs/worklog/2026/11/22-1407-batch-1117i-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 69(최소 68), 팩 148, SIM 76. 다음 마이그레이션 `prevIds` = 위 여섯 끝.
- 줄기 작업 기록·ADR의 "1,000줄 상한 때문에 나눔" 문구는 그때 사실이라 고치지 않는다(새 규칙은 ADR `2026-11-22-file-size-warning-only.md`).
- 1117f의 TODO 그대로: 운영 확인 뒤 `world/persist/load.ts`의 부팅 때 종류 6 → 4 바꾸기와 `LEGACY_UNIT_KIND_GUARDIAN` 읽기를 지운다.
- 쓰지 않는 연맹 조항 표(`house_league_clauses`)·스키마(`db/leagueSchema.ts`)는 다음 배포에서 정리(지우는 마이그레이션 — 직전 판 앱이 이 묶음 앱이 된 뒤).

## 건드리지 말 것
- 마이그레이션 `20261122025444_unit_returning`(이제 올라간다 — 고치지 않는다). 갈래는 다시 만들지 않는다.
- `id-changes.json`은 뒤에 더하기만 한다(since 147 기록은 이제 올라간다).

## 검사 (Verified)
- 첫 전체 `pnpm check`(no-teleport-a·league-3를 합치고 판을 다시 매긴 트리)는 서버 타입 검사에서 멈췄다: fixes-d592 시험 `coupTruce.test.ts`의 쿠데타 줄에 no-teleport-a의 새 칸
  `battleId`가 없음(TS2741) → `battleId: null`을 더한 커밋 뒤 다시 돌렸다.
- 두 번째 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — size-policy 합치기 전 트리) **통과**: 포맷(3,412파일)·린트·타입·모듈 경계·파일 크기(옛 1,000줄 규칙)·
  다국어(9,001키)·디자인 값(746쌍)·콘텐츠(core@147 62dc30fabd3c), 시험 파일 **901/901**, 시험 **6,432/6,432**(`@terra/sim` 골든 포함 — SIM 75 그대로). 흔들리는 DB 시험도 한 번에 통과.
- size-policy를 합친 최종 트리: `node scripts/check-file-size.mjs` 통과(5,000줄 경고 없음), `pnpm check:docs`·`pnpm docs:index --check` 통과(기록 커밋 뒤).
- `pnpm check:content origin/main`(호환 포함, core@147 62dc30fabd3c, 단계 1·2·4a·4b 기준 801e782), `pnpm wiki:index --check`(항목 40개), `pnpm settings:cells --check`,
  `db:generate` "No schema changes" 통과.
- `pnpm build` 통과(PWA 257항목), `pnpm check:bundle` 첫 화면 JS **110,772 B** / 상한 131,416 B(1117h 110,814 B에서 −42 B, 파일 7개 — 연맹 조항 카드 문구가 빠짐, Assumed).
- 화면 시험(빌드한 앱, 다섯 파일 한 번에, 2.7분): `governance.spec.ts` **16/16**(쿠데타 전투 중 화면 포함), `facilities.spec.ts` **6/6**, `house-league.spec.ts` **4/4**
  (league-3가 고치고 돌리지 않았던 "조항 카드 없음" 단계 — 이번에 처음 실행), `produce.spec.ts` **4/4**("일터로 가는 중" 포함), `faction.spec.ts` **28/28** — 합 **58/58**.
  흔들림·다시 돌림 없음. 빌드 결과·시험 결과 폴더는 지웠다.

## 미검증·알려진 문제
- 운영의 NPC 이동 수·병원 다녀오기 수·진 유닛 귀환 시간은 재지 않았다(Unknown — 줄기 기록). 쿠데타는 꺼져 있어 세계 전투 쿠데타는 운영에서 돌지 않는다.
- NPC 병원 다녀오기의 실제 2차맵 사이 이동은 위 단위 시험(가짜 시계)과 타입 검사로만 봤다 — NPC 런타임이 켜진 서버에서 돌려 보지 않았다(미실행).
- 운영 DB의 마이그레이션은 배포 때 확인.

## 사용자 결정 대기
- 질문 2691~2702, 그리고 앞 기록의 남은 대기(2651~2659, 2661~2668, 2671~2678, 2681~2685 …).

## 배포 (Verified)
## 배포 (Verified) — 대상 기록: docs/worklog/2026/11/22-1407-batch-1117i-merge.md

- CI `ci` 396 성공(main `2f0ad60f03`, 05:42~05:45 UTC). 앱 컨테이너 05:44:21 UTC 시작, 이미지 `sha-2f0ad60f0322`, 팩 core@147(nas-metrics 99, 06:09 UTC, 창 27분, 재시작 뒤 약 25분).
- 마이그레이션 오류 줄 없음, dbFailures 0(25줄 모두). 적용 줄은 로그 범위 밖(Unknown). NPC 이동·쿠데타 전투·병원 줄은 지표 로그가 모으지 않아 Unknown.
- RSS 578.1~604.6MB(처음 15분 +20MB, 06:03부터 604.3~604.6으로 평평), 루프 p99 1.0~1.7ms(첫 분 5.5), 최대 대부분 19~57ms이나 NPC 판단 분에 249·385.8ms(05:50·05:52 — npcDecideMs 203.9·340.3ms와 같은 분), DB 커밋 최대 233~620ms, 기기 오류 0, pathFailed 0.
- NPC: 판단 2회(구인 9·24), 휴먼 2,221 → 2,254, 세력 16, 도시 49, 건물 1,082, npcNextDecideMin 이어짐.
- 지켜볼 것: NPC 판단 한 번이 이벤트 루프를 막는 시간(1117h 302ms → 1117i 386ms)이 기능이 늘며 커지는 쪽(Assumed) — 판단 계산을 나눠 돌리는 개선 후보.
