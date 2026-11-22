# 2026-11-22 no-teleport-a — 쿠데타 세계 전투(늦은 병력 참전·실제 몸·부상)·진 유닛 걸어 돌아가기·공격 대상 먼 유닛 표시

- 일시: 2026-11-22 12:40 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 **D-591**("어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다"), 기획 정리 2652 다·2653 나·2655 나·2657 가·2659 가(코디네이터 전달 — 질문 `docs/questions/2026-11-22-no-teleport.md`
  상태 줄), D-099·D-176·D-351·D-381. ADR `docs/adr/2026-11-21-governance.md`·`docs/adr/2026-11-15-unloaded-second-maps.md` "바뀜 (no-teleport-a, D-591)", 새 질문 `docs/questions/2026-11-22-no-teleport-a.md`(2691~2695).
- 가지 `work/no-teleport-a`, 바탕 `work/no-teleport` 35cc916ee8(그 바탕 main 14537f2649), 뒤에 `work/no-teleport-b` 0ce23b84ba를 합침

## 한 일
1. **2652 늦게 닿은 병력 참전** — 끝남. 쿠데타 전투를 세계 전투로 옮겼다(새 `governance/coupWorldBattle.ts`). 참가 받기 끝 틱에 그 도시 2차맵에 닿은 병력으로 공성 전투를 열고(혁명군이 없으면 전투 없이 짐),
   쿠데타는 전투가 끝날 때까지 `gathering`(결과 칸 `battleId`). 진행 중인 전투에 그사이 닿은 병력을 참전 입력(`join`)으로 넣는다 — 보낸 병력 도착 시각 + 1초 깨우기(`wakeAt`)와 1분 틱. 편 들기·병력 보내기는
   전투가 끝날 때까지 받는다. 쿠데타 틱·깨우기는 하나씩(같은 유닛 두 번 넣기 막음).
   - 전투 서비스의 참전 길 점검(건물 공격·웨이브에도 같은 빈틈): 참전 입력은 판정이 받았지만 **결과 적용이 시작 자료 유닛만 셌다**(참전 유닛은 부상 단계 0·생명 수치 저장 안 됨). 고침: `world/battles.ts withJoins`
     — 결과 적용에 시작 자료 + 참전 입력을 합친 것을 넘긴다. 건물 공격·웨이브의 지원 참전 명령·화면(D-176 아이콘)은 아직 없다(같은 `addInput(join)` 길로 붙인다).
2. **2653 실제 몸·부상** — 끝남. 쿠데타 전투 유닛(플레이어·NPC 모두)은 `battleBodies.build`(입은 장비·버프)·남은 생명 수치·물약·탄으로 싸우고, 끝 시각 결과 적용(부상·생명 수치·장비 닳기·돌아가기)이 다른 세계
   전투와 같다. `portCoup.ts`의 `troopUnit`(기술 단계 스탯)·`runCoupBattle` 호출을 지웠다(시뮬 함수는 그대로 — 시뮬 판정 바뀜 없음). 내전이라 편 faction 0(포로·탈취·방어 명성 없음 [임시 2694]).
3. **2655 진 유닛·포로 걸어 돌아가기** — 끝남. `world/battleResults.ts`가 `relocateToSafety`(바로 옮김) 대신 `world/battleReturn.ts walkBack` → `secondMap.walkToSafety`(새 — 같은 자리, 2차맵 안 길 찾기,
   포로·부상이어도 이 걸음은 간다). 돌아갈 곳은 그대로(D-351·D-381 — 같은 2차맵의 안전 도시라 2차맵 사이 이동이 필요 없다: 플레이어 이동 서비스·NPC 이동 길 모두 안 씀, 플레이어·NPC 같은 길).
   걷는 동안 쓰지 못함 = 유닛 상태 `returningUntilMs`(`unavailable`이 본다), 저장 `world_units.returning_until_ms`(새 마이그레이션). 길이 없으면 그 자리에 남는다.
4. **2659 공격 대상 먼 유닛 표시** — 끝남. `facilities/targets.ts`가 대상마다 `unitIds`(32칸 안)·`farUnitIds`(같은 2차맵 32칸 밖)로 나누고, 화면 `economy/AttackParts.tsx`가 고른 유닛 가운데 먼 것을 누르기 전에
   "멀어서 못 칩니다(대상 32칸 밖): #…"로 알리고 공격에서 뺀다(모두 멀면 [공격] 꺼짐 + 까닭). 서버 판정(`out_of_reach`)은 그대로.
5. **2657 서버 NPC 공격** — 계획만(구현 없음, [임시] 그대로). 계획·차례·일정은 ADR `2026-11-15-unloaded-second-maps.md` "바뀜 (no-teleport-a)": ① NPC 2차맵 사이 이동(no-teleport-b) ② 원정군 편성·저장
   ③ 실제 행군(진군 표시·처리할 일) ④ 닿으면 도시 공성 세계 전투(웨이브·쿠데타와 같은 길, 늦은 원정군 참전) ⑤ 이기면 점령·지면 걸어 돌아가기. no-teleport-b가 main에 오른 다음 묶음에서 ①②, 그다음 ③~⑤.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| 새 `apps/server/src/governance/coupWorldBattle.ts` | 쿠데타 세계 전투 열기·상태·참전·깨우기(의결 포트 `GovernancePortCoupBattle`) |
| 새 `apps/server/src/governance/coupOutcome.ts` | 쿠데타 결과·보상·도시 떼기(coup.ts 600줄 넘어 뗌), 보상 = 병력이 전투에 든 참가자 |
| `apps/server/src/governance/coup.ts` | 참가 받기 끝 → 전투 열기, 진행 중 → 참전·결과, 전투 중 편 들기, 깨우기·하나씩 돌기 |
| `apps/server/src/governance/portCoup.ts` | `coupBattle`·`troopUnit`·`runCoupBattle` 지움, 세계 전투 포트 합침 |
| `apps/server/src/governance/coupStore.ts` | `markBattle`, `CoupRow.battleId`(결과 칸에서 읽음 — 표 모양 그대로) |
| `apps/server/src/governance/view.ts`, `packages/shared/src/governance.ts` | 쿠데타 카드 `battleEndsAtMs` |
| `apps/server/src/governance/attach.ts` | 시험(manual)은 서버 타이머 깨우기를 끈다 |
| `apps/server/src/world/battles.ts` | `withJoins` — 참전 유닛도 결과 적용 |
| 새 `apps/server/src/world/battleReturn.ts`, `world/battleResults.ts`, `world/secondMap.ts`·`secondMapTypes.ts` | 진 유닛 걸어 돌아가기(`walkToSafety`) |
| `apps/server/src/world/unitCondition.ts`, `world/persist/load.ts`·`tables.ts`, `db/schema.ts`, 새 `drizzle/20261122025444_unit_returning` | 돌아가는 중 상태·저장 칸 |
| `apps/server/src/facilities/targets.ts`, `packages/shared/src/facilities.ts`, `apps/game/src/economy/AttackParts.tsx` | 먼 유닛 표시(`farUnitIds`) |
| `apps/game/src/faction/governance/CoupSection.tsx`·`CoupJoin.tsx`, `apps/game/messages/{ko,en}.json` | 전투 중 표시·늦은 병력 문구(더함 5: `gov_coup_fighting`·`gov_coup_fighting_hint`·`gov_coup_troop_joins_late`·`facility_attack_far`·`facility_attack_needs_near`, 고침 2: `gov_coup_troops_hint`·`gov_coup_troop_late`) |
| `packages/protocol/src/version.ts`·`governance.ts`·`index.ts` | 프로토콜 165/164(줄기 판), `COUP_BATTLE_JOIN_PROTOCOL_VERSION` |
| 시험: `governance/coup.test.ts`(가짜 포트 세계 전투, +2 시험), `governance/governance3.db.test.ts`(실제 세계 전투 열기 → 전투 중 편 들기로 참전 → 다시 켜 결과 적용 → 쿠데타 결과, 참전 유닛도 결과 기록), `governance/governance5.db.test.ts`(NPC 쿠데타 전투가 열림), `world/battleResults.db.test.ts`(진 유닛은 걸어감·쓰지 못함·저장), 새 `world/battleJoins.test.ts`, `facilities/attack.db.test.ts`(먼 유닛 `farUnitIds`), 프로토콜 `governance.test.ts`, 화면 `e2e/governance.spec.ts`(+1 시험·사진 4)·`e2e/facilities.spec.ts`(+1 시험) | |
| ADR 둘·질문 둘·이 기록 | 문서 |

## 판·마이그레이션·리셋
- 프로토콜 **165(최소 164)** — 줄기 판(바탕 no-teleport 125/124). 메시지 모양 그대로(`gov_coup_join`을 전투 중에도 받음). 묶을 때 다시 매긴다(`version.ts`, `governance.ts COUP_BATTLE_JOIN_PROTOCOL_VERSION`,
  `governance.test.ts toBe(165)`, ADR 판 줄).
- 마이그레이션 **`20261122025444_unit_returning`**(`world_units.returning_until_ms bigint` 더하기만 — 직전 판 앱은 이 칸을 쓰지 않는다). prevIds = 바탕 끝 `7e79264e-…`(묶는 사람이 다른 줄기 갈래를 함께 적는다).
- 팩 그대로(core@143 — 설정 칸 바뀜 없음, `gov_coup_battle_units`는 뜻만 "시작 + 참전 합"으로). SIM_VERSION 그대로(시뮬 코드 바뀜 없음).
- **리셋 필요 없음.** 배포 뒤: 쿠데타는 여전히 꺼져 있다(`gov_coup_enabled` 0). 켜면 쿠데타 전투가 세계 전투(전투 목록·다시보기에 보임). 진 유닛은 걸어서 돌아간다(닿을 때까지 이동 중·쓰지 못함).

## 함께 바꿔야 하는 파일
- 묶을 때: 프로토콜 판(위), 마이그레이션 prevIds 갈래, 질문 번호 2691~2695가 겹치면 옮긴다(질문 파일·ADR·이 기록).
- no-teleport-b(NPC 2차맵 사이 이동)와 맞출 곳(아래 "no-teleport-b 맞춤").

## no-teleport-b 맞춤(묶는 사람에게)
- **이 가지에 `work/no-teleport-b`(0ce23b84ba)를 합쳤다**(코디네이터 안내 — 두 줄기가 같은 `coup.ts`를 고쳐서). 손으로 푼 충돌: `governance/coup.ts`(머리 주석 둘 다, import, `CoupPort`에 `npcTroopEta`·`openCoupBattle` 둘 다,
  `sendNpcSides`(b) + `armies`(a) 둘 다 — b의 `seize`·`seizedCityOf`는 a가 `coupOutcome.ts`로 옮겨 뺐다, 틱 = a의 세계 전투 틱 + 참가 받는 동안·전투 중 NPC 참가 뒤 `sendNpcSides`), `coup.test.ts`(가짜 포트 둘 다,
  시험 둘 다 + b 시험에 "전투 중에 닿은 NPC 가문원은 참전" 한 줄 더함), `world/secondMap.ts`(a `walkToSafety` + b `transferOut(carry)` 둘 다 — 993줄), ADR 둘(b 절 → a 절 차례), `docs/WORKLOG.md`(다시 만듦).
- 결과: NPC 가문원은 b의 NPC 파견(`travel/npcTravel.ts`)으로 쿠데타 도시로 걷고, 닿으면 전투 전이면 시작 유닛, 전투 중이면 a의 참전 길(`fight` → `joinCoupBattle`, 1분 틱 — NPC 도착 깨우기는 없음 [임시])로 든다.
- 2655(진 유닛 돌아가기)는 **같은 2차맵 안**이라 NPC 2차맵 사이 이동이 필요 없었다 — `npcTravel`을 쓰지 않고 NPC 봇도 `secondMap.walkToSafety`로 걷는다(닿으면 원래처럼 다시 돌아다닌다).
- 돌아가는 중인 유닛은 `unavailable`(`returningUntilMs`)이다: NPC 파견·일터 걷기(b)가 유닛을 고를 때 `unavailable`을 보면 걷는 중 유닛을 빼앗지 않는다(`secondMap.moveUnit`은 이미 막는다) — NPC 파견도 `travel/planner.ts planFor`의 `unavailable` 검사를 거친다(코드 읽기 Verified).
- 2657 계획 ①(NPC 2차맵 사이 이동)은 b로 생겼다 — 다음 줄기는 ②부터.

## 건드리지 말 것
- 시뮬 `runCoupBattle`·`attachCombat` — 바꾸지 않았다(서버가 더 부르지 않을 뿐).
- `world/world.ts`(998줄)·`app.ts`·`travel/service.ts`는 건드리지 않았다(세계 전투 길은 `persistence.startBattle`·`battles`·`bodies`·`vitals`·`items`로 읽는다). `world/secondMap.ts`는 983줄.
- `world/persist/tables.ts` 998줄(칸 이름 한 줄 더함) — 더 늘리지 않는다.
- 다른 줄기: gov-fix-4(`governance/service.ts`·`leaderAgendas.ts`·`port.ts` 등 — 이 줄기는 `service.ts`·`port.ts`를 건드리지 않았다, `attach.ts`는 한 줄), fixes-d592, no-teleport-b.

## 검사
- (작업 중 — Verified 실행) 서버·게임 타입 검사, `governance/coup.test.ts` 5/5, `world/battleJoins.test.ts` 1/1.
- (작업 중 — Verified 실행, TEST_DATABASE_URL) `governance3.db.test.ts`·`governance5.db.test.ts`·`world/battleResults.db.test.ts`·`facilities/attack.db.test.ts`·`world/battles.db.test.ts`·`world/persist.db.test.ts`·
  `travel/travel.db.test.ts` 통과.
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안, 이 가지 위 — Verified 실행): 첫 판은 린트 경고 1개(`governance3.db.test.ts` 이름 가림)로 멈춰 고쳤다. 둘째 판 **통과** — 포맷(3,375파일)·타입·린트·
  경계·크기(1,000줄 넘는 파일 없음 — `tables.ts` 999·`secondMap.ts` 984)·다국어(8,927키)·디자인 값(746쌍)·콘텐츠(core@143), 시험 파일 **889/889**·시험 **6,356/6,356**.
- `work/no-teleport-b`를 합친 뒤(충돌을 손으로 풀어 다시 — Verified 실행): 전체 `pnpm check`(TEST_DATABASE_URL) **통과** — 시험 파일 **891/891**·시험 **6,366/6,366**(`coup.test.ts` 7/7 포함), 1,000줄 넘는 파일 없음
  (`world.ts` 999·`secondMap.ts` 993).
- 화면 시험(Verified 실행, 합친 뒤): `pnpm e2e e2e/governance.spec.ts e2e/facilities.spec.ts` **22/22 통과** — 새: 쿠데타 전투 중(끝 예정·"닿으면 참전"·끝난 뒤 도착만 "싸우지 못함"·전투 중 편 들기 전송),
  공격 대상 먼 유닛("멀어서 못 칩니다 #…"·[공격] 꺼짐), 사진 390 × 파스텔·다크 × ko·en `governance-coup-fighting-*` 4장(가로 넘침 없음, 다크·영어 사진을 눈으로 확인). 빌드 산출물은 지웠다.

## 미검증·TODO·알려진 문제
- 쿠데타 DB 시험 세계는 띄운 2차맵이 하나라 "다른 2차맵에서 걸어와 늦게 닿는" 길은 가짜 포트(`coup.test.ts`)로만 봤다. DB 시험은 그 도시에 이미 있는 새 유닛을 전투 중에 보내 참전시키는 길(실제 전투 서비스 `addInput(join)`)을 본다.
- 참전 자리 = 그 편 변의 다음 시작 자리(앞 자리를 다시 고른 뒤) — 이미 움직인 유닛과 겹칠 수 있다(판정은 겹침을 막지 않는다) [임시].
- 깨우기 타이머는 메모리에만 — 다시 켜면 1분 틱이 대신 본다(늦은 병력은 최대 1분 늦게 참전).
- 돌아가는 중 상태를 기기 유닛 목록에 따로 보이지 않는다(이동 중으로 보인다) [임시].
- 편마다 유닛 수 상한이 차면 늦은 병력이 참전하지 못한다 [임시 2691].

## 사용자 결정 대기
- `docs/questions/2026-11-22-no-teleport-a.md` 2691~2695, 앞 질문 2651·2654·2656·2658(no-teleport).
