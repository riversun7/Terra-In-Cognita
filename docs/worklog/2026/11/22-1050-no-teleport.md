# 2026-11-22 no-teleport — 쿠데타 병력 실제 파견·서버 순간이동 점검·건물 공격 근처 조건

- 일시: 2026-11-22 10:50 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 **D-591**(2026-11-22, 기획 커밋 88eda2d — 원문 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다. 누가또 마음대로 정했냐"), D-555 1505(실제 이동 원칙),
  ADR `docs/adr/2026-11-21-governance.md`·`docs/adr/2026-11-15-unloaded-second-maps.md` "바뀜 (no-teleport, D-591)", 질문 표시 `docs/questions/2026-11-22-gov-fix-2.md`(2571 답함),
  새 질문 `docs/questions/2026-11-22-no-teleport.md`(2651~2659).
- 가지 `work/no-teleport`, 바탕 main 14537f2649(묶음 1117e)

## 한 일
1. **쿠데타 병력 실제 파견(D-591)** — 끝남. 새 모듈 `governance/coupDispatch.ts`(의결 포트 `GovernancePortTroops` — 도시 자리·유닛이 선 2차맵·보낼 수 있는 내 유닛·보내기·도착 예정·확인 단계 시간).
   - 전투(참가 받기 끝)에는 그때 **쿠데타 도시 2차맵에 서 있는 유닛만** 든다 — 혁명군(일으킨 가문 + 참가자)·정부군(지배 가문 + 경비대 + 참가자), 플레이어·NPC 모두. 늦은 유닛은 빠진다 [임시 2652].
   - 플레이어: 고른 유닛(`gov_coup_join unitIds`)을 이동 서비스 `start`(kind move)로 그 도시 시청 칸으로 보낸다. 이미 그 2차맵이면 보내지 않음, 못 보내면 빠짐. 고르지 않으면 그 도시에 있는 내 유닛만.
     일으킨 사람도 처음엔 그 도시에 있는 내 유닛만(더 보내려면 혁명군 참가로 고름). 보상 = 병력이 하나라도 닿은 참가자만.
   - NPC: 2차맵 사이 이동 길이 없어 그 도시에 있는 것만 [임시 2651]. NPC 일으키기 힘 비·NPC 참가 힘도 그 도시 안 힘.
   - 발견·고침: 플레이어 유닛은 그동안 **쿠데타 전투에 하나도 들지 못했다**(`portCoup.ts userUnits`가 거울 세계에서 사용자 소유 주체 유닛을 찾았는데, 거울 세계에는 NPC 휴먼만 있다 — 코드 읽기:
     `npc/runtime.ts` 휴먼은 `UNIT_KIND_BOT`만, `governance5.db.test.ts`의 참가 줄 `units: []`). 도착한 플레이어 유닛을 거울 유닛 모양으로 넣는다(`portCoup.ts troopUnit` — 기술 단계 스탯, 부상 없음 [임시 2653]).
   - 화면: 쿠데타 카드에 보낼 병력 고르기(`apps/game/src/faction/governance/CoupJoin.tsx` — 유닛마다 "그 도시에 있음"·"가는 중 · 도착 …"·"보내면 도착 …"·"전투 뒤 도착 — 싸우지 못함", 처음 고름 = 그 도시에 있거나 보낸 유닛).
     조회 `GovernanceCoupView.troops`(참가 받는 중일 때만, 확인 단계 길 찾기는 앞 40개).
2. **서버 순간이동 점검** — 끝남(아래 표 30줄). (a) 고침 3줄(쿠데타 병력·쿠데타 경비대·건물 공격 — 고친 곳 둘), (b) 괜찮음(유닛 움직임이 아니거나 걸어서 닿음) 19줄, (c) 결정 필요 8줄(질문 2654~2658, 쿠데타 남은 것 2651~2653).
3. **건물·비콘 공격 근처 조건** — 끝남. `facilities/attack.ts checkAttackers`: 공격 유닛도 대상 기준 칸 둘레 `ATTACK_DEFENDER_RADIUS`(32칸 — 수비와 같은 값, C29 참전 '근처') 안이어야 한다(아니면 `out_of_reach`).
   화면 문구 `facility_error_out_of_reach`(ko·en)를 "근처(32칸 안)에 없습니다. 가까이 보낸 뒤 다시"로. 대상 목록은 그대로 [임시 2659].

## 순간이동 점검 표 (유닛이 걷지 않고 전투·도시·건물·2차맵·직무에 나타나는 곳)
분류: **(a)** 이번에 고침, **(b)** 괜찮음(유닛 움직임이 아님 — 새로 만든 유닛을 그 자리에 세움, 지정만 바꿈, 반경 안에서만 참전, 실제로 걸음·좌표 이동 등), **(c)** 결정 필요 → 질문.
(Verified = 코드 읽기, 줄 번호는 바탕 main 14537f2649 기준)

| # | 곳 | 파일:줄 | 무엇 | 분류 |
|---|---|---|---|---|
| 1 | 쿠데타 병력(편 들기·일으킨 가문·지배 가문·NPC 가문) | `governance/coup.ts` 135~142(`troopsOf`)·355~389(`resolve`), `portCoup.ts` 125~132(`userUnits`) | 어디에 있든 이동 시간 없이 전투에 넣었다(gov-fix-2 2549·2571) | **(a)** `coupDispatch.ts` — 실제 파견·도착한 유닛만 |
| 2 | 쿠데타 경비대 | `governance/portCoup.ts` 133(`cityGuards`) | 그 도시가 집인 경비대(거울 `unit.city`)를 실제 자리와 상관없이 넣었다 | **(a)** 도착 판정(그 도시 2차맵)을 거친다 |
| 3 | 건물·비콘 공격의 공격 유닛 | `facilities/attack.ts` 278~302(`checkAttackers`) | 같은 2차맵이면 먼 곳 유닛도 전투 구역 변에 바로 놓였다 | **(a)** 대상 32칸 안만(2659 확인 질문) |
| 4 | 건물 공격 수비 유닛 | `facilities/attack.ts` 157~180(`pickDefenders`) | 대상 32칸 안의 주인 유닛만 | (b) |
| 5 | 조우 전투(좌표·띄운 2차맵) | `travel/encounterWorld.ts` 머리 주석·`open` | 만난 자리 둘레 반경 안 유닛만, 그 자리 둘레 전투맵 | (b) |
| 6 | 일부러 치기(unit_attack) 공격·수비 | `travel/encounterWorld.ts` 727~751(`strike`) | 공격·수비 모두 대상 둘레 조우 거리 안만(gov-fix-3) | (b) |
| 7 | 정원사 웨이브 수비 휴먼 | `packages/sim/src/simulator/gardenerRun.ts` 226, `npc/gardener.ts` 313 | 그 도시가 집인 거울 휴먼 — NPC 휴먼은 그 도시 2차맵 안에서만 걷는다(`world/bots.ts` 같은 2차맵 안 걷기) | (b) |
| 8 | 도시 방어 수호신 | `temple/cityDefense.ts` 206(`prepare`) | 그 도시에 머무는 수호신(주인이 옮기지 못함 — D-311) | (b) |
| 9 | 외교 참전 요청 수락 | `diplomacy/service.ts` 427~463 | 전쟁 상태만 바뀐다(유닛 움직임 없음) | (b) |
| 10 | 구인 휴먼 생성 | `recruit/service.ts` 209 | 산 행정 건물 둘레에 새로 세움 | (b) |
| 11 | 첫 사이보그 생성 | `cyborg/service.ts` 345 | 시작 도시 둘레에 새로 세움 | (b) |
| 12 | 유전자 배양 휴먼 생성 | `fusion/geneCommands.ts` 369 | 연구소·사이보그 둘레에 새로 세움 | (b) |
| 13 | NPC 구인·경비대 채우기 | `npc/runtime.ts` 540(`spawn`), sim `simulator/world.ts` 431 | 그 도시에 새로 세움 | (b) |
| 14 | 융합·신격화(같은 유닛 ID 종류만 바뀜) | `fusion/service.ts`, `temple/` | 자리 그대로 | (b) |
| 15 | NPC 국가 지도자 첫 세우기 | `npc/leaders.ts` 174 | 수도 행정 건물 곁에 새로 세움 | (b) |
| 16 | **NPC 국가 지도자 수도 따라 옮기기** | `npc/leaders.ts` 119~144(`moveLeaderToCapital`)·155(켤 때), `world/world.ts` 860(`onCapitalMoved`) | 2차맵에서 빼서 새 수도 2차맵에 바로 넣는다(질문 865 [임시]) | **(c)** 2654 |
| 17 | **전투 진 유닛·포로 즉시 귀환** | `world/battleResults.ts` 94 → `world/secondMap.ts` 778(`relocateToSafety`) | 같은 2차맵 가장 가까운 안전 도시 칸으로 바로(D-351·D-381) | **(c)** 2655 |
| 18 | **직무 배치·노동 계약** | `labor/service.ts` 650·974(`onSiteMap`) | 같은 2차맵이면 걷지 않고 그 시설 일을 한다(움직임 없음 — 떨어져서 일함) | **(c)** 2656 |
| 19 | **비접속 관리인 일자리** | `labor/offlineSteward.ts` 86~124 | 18과 같은 길(acceptJob) | **(c)** 2656 |
| 20 | **서버 NPC 공격** | `npc/runtime.ts` 18(머리 주석) | 병력 이동·전투 없이 도시를 점령 | **(c)** 2657 |
| 21 | **운영자 텔레포트** | `travel/teleport.ts` 150 | 기획 D-560 1239 운영 도구 | **(c)** 2658(추천 남김) |
| 22 | **운영 도구 옮기기·안전한 곳으로** | `ops/world.ts` 227·240~246 | 같은 2차맵 안 옮기기(운영·복구) | **(c)** 2658 |
| 23 | **배 정리 승객** | `boats/purge.ts` 82, `world/secondMap.ts` 649(배 없는 승객 다시 붙이기) | 내릴 땅이 없으면 안전한 곳으로(정리·복구) | **(c)** 2658 |
| 24 | 2차맵 사이 이동(좌표 이동·건너뛰기) | `travel/service.ts` | 곧은 거리 ÷ 속도로 시간이 흐른다(D-559 1619 — 실제 이동, 좌표로 계산) | (b) |
| 25 | 2차맵 내리기·띄우기(좌표 유닛) | `travel/unloadPark.ts` 47 | 그 자리 그대로 장부로 옮김(자리 바뀜 없음) | (b) |
| 26 | 채집·운반(플레이어·NPC·물류센터) | `gather/station.ts`·`porter.ts`, `logistics/haulService.ts`·`npcOutsource.ts` | 운반꾼이 실제로 걷는다(D-555 1505) | (b) |
| 27 | NPC 휴먼 출퇴근 | `npc/humanPlaces.ts`, `world/bots.ts` | 같은 2차맵 안에서 실제로 걷는다 | (b) |
| 28 | 보이지 않는 2차맵의 NPC 운반 | `npc/humanPlaces.ts` 머리 주석(2155) | 운반꾼 모습 없이 같은 시각에 물건이 닿는다(물건 — D-564 1626·D-570 1886 "부하가 크면 보이지 않는 곳만 시간 계산") | (b) |
| 29 | 배 타기·내리기 | `boats/service.ts` 6~7(머리 주석) | 멀면 배 둘레로 걸어가 탄다 | (b) |
| 30 | 사는 곳(residence)·가문·연맹 | `residence/`, `factionIdentity/npcLeague.ts` | 기록만 바뀐다(유닛 움직임 없음) | (b) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| 새 `apps/server/src/governance/coupDispatch.ts` | 쿠데타 병력 파견·도착 판정·화면 병력 줄 |
| `apps/server/src/governance/coup.ts` | 도착한 유닛만, 플레이어 파견, NPC 힘 비, 보상 조건 |
| `apps/server/src/governance/portCoup.ts` | `userUnits` 지움, 도착한 플레이어 유닛을 전투에(`troopUnit`), 세계 몫에 `maps` |
| `apps/server/src/governance/port.ts`·`attach.ts`·`view.ts` | 병력 포트 합치기, 세계 몫 `maps`, 조회 `troops` |
| `apps/server/src/facilities/attack.ts` | 공격 유닛 근처 조건 |
| `packages/shared/src/governance.ts` | `GovernanceCoupTroop`, 쿠데타 조회 `troops`(선택 칸) |
| `packages/protocol/src/governance.ts`·`version.ts`·`index.ts` | 프로토콜 125/124(줄기 판), `COUP_DISPATCH_PROTOCOL_VERSION`, `unitIds` 뜻 |
| 새 `apps/game/src/faction/governance/CoupJoin.tsx`, `CoupSection.tsx`·`governanceCommands.ts`·`governance.css`, `apps/game/messages/{ko,en}.json` | 보낼 병력 고르기·도착 예정(문구 13개 더함·1개 고침 ko·en) |
| 시험: `governance/coup.test.ts`(+1 시험, 가짜 포트 바꿈), `governance/governance3.db.test.ts`(실제 포트 — 보낼 수 있는 내 유닛·조회 troops·그 2차맵의 유닛은 보내지 않고 참가 줄에), `facilities/attack.db.test.ts`(먼 공격 유닛 out_of_reach, 근처로 옮긴 뒤 침), 프로토콜 `governance.test.ts`(+1), 화면 `e2e/governance.spec.ts`(+1 시험 + 사진 4) | |
| ADR 둘·질문 둘·이 기록 | 문서 |

## 판·마이그레이션·리셋
- 프로토콜 **125(최소 124)** — 줄기 판(main 65+60). 메시지 모양 그대로, `gov_coup_join unitIds`의 뜻이 바뀜. 묶을 때 다시 매긴다(`version.ts`, `governance.ts COUP_DISPATCH_PROTOCOL_VERSION`, `governance.test.ts toBe(125)`,
  ADR 판 줄).
- 팩 **그대로**(core@143 — 설정 칸 바뀜 없음). SIM_VERSION **그대로 74**(시뮬 코드 바뀜 없음). 마이그레이션 **없음**(참가 줄 `units` 칸 그대로).
- **리셋 필요 없음.** 배포 뒤: 쿠데타는 여전히 꺼져 있다(`gov_coup_enabled` 0). 켜면 그 도시 2차맵 밖 병력은 싸우지 않는다. 건물 공격은 대상 32칸 밖 유닛이면 `out_of_reach`.

## 함께 바꿔야 하는 파일
- 묶을 때: 프로토콜 판(위). 질문 번호 2651~2659가 겹치면 옮긴다(질문 파일·ADR·코드 주석 `2651`·`2652`·`2653`·`2659`).
- 2651 나(NPC 파견)·2654 가(지도자 걷기)는 같은 NPC 2차맵 사이 이동 길이 필요하다(이동 서비스는 `ownerOf(userId)`로만 유닛을 찾고 봇을 막는다 — `travel/planner.ts ownUnit`). 2652 다·2653 나는 쿠데타 전투를 세계 전투
  서비스(`world/battles.ts` — 참전 입력 `join`이 이미 있다)로 옮기는 줄기.
- 2659 다면 `facilities/attack.ts`가 먼 유닛을 이동 서비스로 보내고 닿을 때 전투를 연다.

## 건드리지 말 것
- 시뮬 판정(`runCoupBattle`·`attachCombat`) — 바꾸지 않았다(플레이어 유닛은 거울 유닛 모양으로만 넘긴다).
- `travel/service.ts`(986줄)·`world/world.ts`(998줄)는 늘리지 않았다. 병력 코드는 `governance/coupDispatch.ts`에만.
- 다른 줄기: gov-fix-4(`governance/service.ts`·`leaderAgendas.ts` 등 — 이 줄기는 `service.ts`를 건드리지 않았다), residence-3, league-2, fixes-1117e.

## 검사
- (작업 중 — Verified 실행) 서버 타입 검사, `governance/coup.test.ts` 3/3, 프로토콜 꾸러미 34파일 205/205.
- (끝 — Verified 실행) touched DB 시험: `governance3.db.test.ts`·`governance5.db.test.ts`·`govFix2.db.test.ts` 3파일 11/11, `facilities/attack.db.test.ts` 통과.
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안, 바탕 14537f2649 위): 첫 판은 프로토콜 시험 타입(`unitIds` readonly)으로 멈춰 고쳤다. 둘째 판 **통과** — 포맷(3,371파일)·타입·린트·경계·크기·
  다국어(8,922키)·디자인 값(746쌍)·콘텐츠(core@143), 시험 파일 **888/888**·시험 **6,353/6,353**(`@terra/sim` 골든 포함 — 시뮬 판정 그대로).
- 화면 시험(Verified 실행): `pnpm e2e e2e/governance.spec.ts e2e/facilities.spec.ts` **16/16 통과**(새: 쿠데타 병력 고르기 → `gov_coup_join unitIds:[101,102,103]`, 사진 390 × 파스텔·다크 × ko·en 4장
  `governance-coup-troops-*` — 가로 넘침 없음, 다크·영어 사진을 눈으로 확인).

## 미검증·TODO·알려진 문제
- 다른 2차맵에서 실제로 걸어 보내는 길은 DB 시험으로 돌리지 않았다: 쿠데타 DB 시험 세계(`governance3.db.test.ts`)는 띄운 2차맵이 하나라 두 나라 시작 도시가 한 2차맵에 있다(531m 떨어진 다른 나라 사람의 본체도 "그 도시 2차맵에 있음"으로 든다 — 도착 판정이 2차맵 단위인 [임시 2651]의 모습). 보내기·도착 판정은 `coup.test.ts`(가짜 포트), 이동 서비스 자체는 기존 시험.
- 칠 수 있는 대상 목록(`facilities/targets.ts`)은 먼 유닛도 그대로 보인다 — 고르면 `out_of_reach`(2659).
- 진 유닛 즉시 귀환·지도자 옮기기·떨어져서 일하기·NPC 병력 없는 점령은 결정 대기로 남겼다(2654~2657).

## 사용자 결정 대기
- `docs/questions/2026-11-22-no-teleport.md` 2651~2659, 앞 질문 2575·2611~2614·2574(질문 8).
