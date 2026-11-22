# 2026-11-22 no-teleport-b — NPC 2차맵 사이 실제 이동·지도자 걷기·일터로 걸어가기 (D-591)

- 일시: 2026-11-22 12:25 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 **D-591**("어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다"), 질문 `docs/questions/2026-11-22-no-teleport.md` 2651 나·2654 가·2656 나·2658(상태 줄),
  새 질문 `docs/questions/2026-11-22-no-teleport-b.md`(2696~2700), ADR "바뀜 (no-teleport-b, D-591)": `docs/adr/2026-11-15-unloaded-second-maps.md`·`docs/adr/2026-11-07-play-flow.md`·
  `docs/adr/2026-11-03-labor-contracts.md`·`docs/adr/2026-11-21-governance.md`.
- 가지 `work/no-teleport-b`, 바탕 `work/no-teleport` 35cc916ee8(그 바탕 main 14537f2649)

## 한 일
1. **NPC 2차맵 사이 이동(2651 나)** — 끝남. 이동 서비스에 NPC 이동(`startNpc`·`onNpcDone`·`npcTrip`·`cancelNpc`·`restoreNpc`)을 더했다. NPC 휴먼(봇)·NPC 국가 지도자를 플레이어 이동과
   같은 길·시간(변까지 걷기 → 띄운 2차맵은 실제로 지나고 띄우지 않은 2차맵은 좌표 건너뛰기)으로 보낸다. 가는 동안 2차맵 스스로 걷기 멈춤(`SecondMap.holdRoam`, 봇도
   `transferOut`·`transferIn`에 carry), 정산·탐사·도중 습격·좌표 조우·좌표 유닛 목록 밖 [임시 2696]. 목적 2차맵은 띄운 것만. 저장 = 같은 `world_travels`(마이그레이션 없음).
   부팅: 봇 길은 NPC 사회 런타임이 휴먼을 읽은 뒤 `restoreNpc`(먼저 이으면 건너뛰는 봇을 런타임이 잃는다), 건너뛰는 동안 죽은 휴먼은 나타나지 않고 유닛 행을 지운다.
   - **다른 모듈이 쓰는 모양**: `apps/server/src/travel/npcTravel.ts` — `npcTravelOf(travelService)` →
     `send(unitId, { mapKey, x, y }, onDone?) → { ok: true, arriveAt } | { ok: false, code }`, `trip(unitId) → { mapKey, arriveAt, hidden } | undefined`, `cancel(unitId, drop?)`.
     `onDone({ unitId, state: "arrived" | "stopped", stop, mapKey })`은 메모리에만(다시 켜면 버린다 — 듣는 쪽은 자리로 다시 판단).
   - **쿠데타 NPC 병력**(`governance/coupNpcDispatch.ts`): 참가 받는 동안 쿠데타 틱마다 일으킨 NPC 가문·NPC 지배 가문·편을 든 NPC 가문의 가문원(봇)을 그 도시 시청 칸으로
     (그곳·가는 중이면 그대로, 지도자·경비대 빼고). 포트 `sendNpcTroop(unitId, place)`·`npcTroopEta(unitId, mapKey)`. 전투는 그대로 닿은 유닛만(`arrivedIn`) — 닿은 뒤 전투 중에 드는
     길은 줄기 no-teleport-a. NPC 힘 비 = 보낼 가문원 모두 [임시 2698].
   - NPC 전쟁 참전: 서버에 병력을 옮기는 NPC 참전이 없다(외교 참전 수락은 전쟁 상태만 — 점검 표 9줄). 바꿀 것 없음.
2. **지도자 수도 따라 걷기(2654 가)** — 끝남. `npc/leaderTravel.ts leaderToCapital`(world.ts `onCapitalMoved`) — 새 수도 행정 건물 곁까지 NPC 이동으로. `moveLeaderToCapital`(바로
   옮기기)·켤 때 옮기기 지움. 가는 중(건너뛰는 중)에 수도가 또 바뀌면 바라는 수도를 적어 두고 닿을 때 다시 보낸다. 못 떠나면 다음 수도 바뀜까지 [임시 2697].
3. **일터로 걸어가기(2656 나)** — 끝남(플레이어 유닛). `labor/walkToWork.ts`: 직무 배치·노동 계약·구인 받기·비접속 관리인(모두 `workBook.startJob` 한 곳)이 유닛을 시설 둘레
   (발자국 바깥 4칸 안 [임시 2699])로 걷게 한다. 가는 동안 산출 없음(정산 멈춤 구간 — 시설 작업 멈춤과 합침), 작업 중 부상 굴림 없음, 계약 임금·임대료는 도착부터
   (`shiftPayStart`). 화면: 시설 조회 일꾼 줄 `commuteUntil` → "일터로 가는 중 — 닿으면 일을 시작합니다 · 도착 …"(ko·en). NPC 휴먼은 스스로 오간다("WP-NPC4" 재사용 — 보내지 않음).
4. **배 정리 승객(2658 일부)** — 기술 판단: `boats/purge.ts`는 행성마다 한 번 도는 부팅 정리(`boat_resets` 표지)라 게임 중에 일어나지 않는다 → 운영·복구 도구로 두고 바꾸지 않음
   (확인 질문 2700). `world/secondMap.ts` 승객 다시 붙이기(배 없는 저장 승객)도 복구라 그대로.

## 성능 (NPC 이동)
- (Verified 실행 — 임시 측정 시험, 커밋하지 않음: 평평한 시험 2차맵 셋, 같은 스레드 길 찾기 `createInlinePathService`, 가짜 시계, 공유 개발 컨테이너라 값이 흔들린다)
  NPC 봇 1,000개를 K0 → K2(약 270칸)로 동시에 보냄:
  - 셋 다 띄움(지나는 2차맵을 걸어서): 보내기 합 522ms(하나 0.52ms — 첫 구간 길 찾기 포함), 모두 닿을 때까지 시계 10초씩 87번 밀기에 메인 스레드 4.9초(구간 길 찾기 3,000번이 같은 스레드
    — 서버는 경로 워커 풀). 1,000개 모두 K2에 닿음.
  - 가운데를 띄우지 않음(좌표 건너뛰기): 보내기 619ms, 끝까지 1.06초. 1,000개 모두 닿음.
- 싸게 한 것: 걷는 구간은 2차맵 길 찾기(봇 우선순위와 같은 경로 워커 예산·대기열 — 명령 우선순위 "command"로 묻는다), 띄우지 않은 2차맵은 길 찾기 없이 시각 하나(타이머 하나를 모든 길이 함께 쓴다).
  남은 비용: 확인 때마다 가는 길 전체를 훑는다(`runDue` — 길 수에 비례). 수천 개를 한꺼번에 보내면 길 찾기 대기열이 밀린다(명령 우선순위라 플레이어 명령과 같은 줄) — 쿠데타 파견은 가문원 수만큼이라
  지금 규모(가문당 수십)에서는 문제없다(Assumed). 1만 개 이상 동시 파견은 재지 않았다(Unknown).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| 새 `apps/server/src/travel/npcJourney.ts`·`npcTravel.ts`(+시험 `npcTravel.test.ts` 6개) | NPC 이동 안쪽 몫·바깥 모양 |
| `travel/service.ts`·`serviceTypes.ts`·`restore.ts`·`coordReads.ts`·`planner.ts`, 새 `travel/haltOn.ts` | NPC 이동, 봇 길 둘째 복구, 좌표 목록에서 NPC 빼기. 1,000줄 상한으로 조우 멈춤·좌표 읽기·확인 한 줄을 나눔 |
| `world/secondMap.ts`·`secondMapTypes.ts` | `holdRoam`, `transferOut`·`transferIn` carry(봇), held 봇은 스스로 걷지 않음·`halt` 받음 |
| 새 `npc/leaderTravel.ts`, `npc/leaders.ts`(+`leaders.test.ts` 옛 시험 지움) | 지도자 걷기, 바로 옮기기 지움 |
| `world/world.ts` | `onCapitalMoved` → `leaderToCapital`, `restoreNpc`, 정산 멈춤·부상 고리에 일터 가는 길(줄 수 그대로 999) |
| 새 `governance/coupNpcDispatch.ts`, `governance/coup.ts`·`port.ts`(+`coup.test.ts` 2개) | 쿠데타 NPC 가문원 파견·힘 비 |
| 새 `labor/walkToWork.ts`(+시험 3개), `labor/workBook.ts`·`service.ts`·`rules.ts`(규칙 값 셈 옮김)·`gateway.test.ts` | 일터로 걸어가기 |
| `facilities/views.ts`·`appSource.ts`, `packages/shared/src/facilities.ts` | 일꾼 줄 `commuteUntil`(선택 칸) |
| `apps/game/src/economy/WorkerParts.tsx`·`facilities.css`, `apps/game/messages/{ko,en}.json` | "일터로 가는 중" 줄(문구 1개 ko·en) |
| `world/settlement.db.test.ts` | 시험 건물을 유닛 곁으로(걸어가지 않고 바로 일하는 오프라인 정산 시험 그대로) |
| `e2e/produce.spec.ts` | 배치 → "일터로 가는 중" 확인, 파스텔·한국어 + 다크·영어 390 사진 |
| 문서: ADR 넷 "바뀜", 질문 둘, 이 기록 | |

## 판·마이그레이션·리셋
- 프로토콜 **그대로**(바탕 줄기 125/124 — 메시지 모양·뜻 그대로, 시설 조회는 tRPC 선택 칸). 팩 **그대로**(설정 칸 바뀜 없음). SIM_VERSION **그대로**(시뮬 코드 바뀜 없음). 마이그레이션 **없음**.
- 리셋 필요 없음. 배포 뒤: 수도가 바뀐 NPC 지도자는 걸어서 간다. 새로 일을 맡은 플레이어 유닛은 시설까지 걸어간 뒤 일한다(이미 일하던 유닛은 그대로). 쿠데타는 여전히 꺼져 있다(`gov_coup_enabled` 0).

## 함께 바꿔야 하는 파일
- 줄기 no-teleport-a(쿠데타 닿으면 참전): 전투 쪽에서 `npcTroopEta`·`sendNpcTroop` 포트나 `npcTravelOf(...).trip`·`onDone`을 쓴다. `coup.ts`의 이 줄기 변경은 틱 갈래(`sendNpcSides`)·NPC 힘(`comingUnits`)
  두 곳 — 합칠 때 겹치면 둘 다 살린다.
- 진 유닛 돌아가기(no-teleport-a)도 NPC 유닛이면 `npcTravelOf(travel).send`로 보낼 수 있다(봇·지도자만, 띄운 2차맵만).

## 건드리지 말 것
- `travel/service.ts`(979줄)·`world/world.ts`(999줄)·`labor/service.ts`(984줄)는 상한 가까이다 — 새 코드는 나눈 모듈에.
- 시뮬 판정(`runCoupBattle` 등)은 바꾸지 않았다.

## 검사
- (작업 중 — Verified 실행) 서버 타입 검사·oxlint, `travel/` 전체·`npcTravel.test.ts` 6/6, `coup.test.ts` 5/5, `walkToWork.test.ts` 3/3, `leaders.test.ts`, `secondMap.test.ts`.
  DB 시험 묶음(labor·governance·travel·settlement·hospital·business·station·facilities·roster 58파일): 처음 `settlement.db.test.ts` 3개가 실패(시험 건물이 유닛에서 멀어 걸어가는 동안
  산출·첫 임금이 늦어짐 — 이 줄기의 뜻대로) → 시험 건물을 유닛 곁으로 옮겨 3/3.
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): **통과** — 포맷 3,379파일·타입·린트·경계·파일 크기·다국어 8,923키·디자인 값·콘텐츠, 시험 파일 **890/890**·시험 **6,363/6,363**.
- 화면 시험(Verified 실행): `pnpm e2e e2e/produce.spec.ts` **4/4 통과**(배치한 본체 → "일터로 가는 중 · 도착 …" 파스텔·한국어 / 다크·영어 390, 가로 넘침 없음). 사진 `produce-workers-pastel-ko-390`·
  `produce-workers-dark-en-390`(다크·영어를 눈으로 확인 — "Walking to work — starts on arrival · arrives in 3 minutes").

## 미검증·TODO·알려진 문제
- 실행 중 건너뛰는 동안 죽은 NPC 휴먼은 나타날 때까지 모른다(나타난 뒤 다음 저장에서 지워짐 — 다시 켤 때만 미리 거른다, 2696).
- 가는 중·다른 도시에 간 NPC 휴먼도 집 도시의 경제 일꾼 수·정원사 웨이브 수비에 든다(거울 세계 기준, 2697 나 — `npc/economy.ts`·`runtime.ts` 상한으로 따로).
- 일터 가는 길은 메모리에만(다시 켜면 남은 길 멈춤 사라짐), 닿은 뒤 떠나도 같은 2차맵이면 일함(2699).
- 지도자 "못 떠남"은 다음 수도 바뀜까지 둔다. 켤 때 수도 밖에 선 지도자(옛 세계 — 예전에는 바로 옮겨 없었다)는 다음 수도 바뀜 때 걷는다(2697 다).
- 쿠데타 NPC 파견은 가짜 포트 시험(`coup.test.ts`)과 NPC 이동 시험으로만 봤다 — 실제 포트 DB 시험(두 도시 2차맵)은 돌리지 않았다(DB 시험 세계는 띄운 2차맵 하나).

## 사용자 결정 대기
- `docs/questions/2026-11-22-no-teleport-b.md` 2696~2700, 앞 질문 2652~2659 나머지.
