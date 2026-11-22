# 2026-11-22 return-home — 적색 부상으로 진 유닛은 사는 곳 → 소속 도시 → 정부 건물 → 적대 아닌 가까운 도시로 순간이동(D-594 보충, D-591의 유일한 예외)

- 일시: 2026-11-22 17:40 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 D-594("부상입고 주거지 귀환")와 보충 넷(코디네이터 전달 — 미러에는 아직 없음): 696a053 "유닛도 동일. 적색부상 사망은 주거지 귀환 없으면 소속도시, 없으면 소속국가 정부건물로 귀환",
  13d2b37 "적색부상을 입고 전투에 패배했다는 의미이다. 수명 영구사망과 다르다. 적색부상이 아닌 다른 부상은 강제 귀환되지 않고 다시 싸울 수 있다", 14c5b11 "나. 적색부상은 주거지로 순간이동 귀환된다고. 주거지가 없으면
  소속도시, 소속도시도 없으면 소속국가", 989a9f2 "소속국가도 없으면 근처 도시(적대세력 아닌곳)". 기획 D-099·D-351·D-381·D-521·D-585·D-588·D-591.
  ADR "바뀜 (return-home, D-594 보충)": `docs/adr/2026-11-15-unloaded-second-maps.md`(본문)·`2026-11-08-injury.md`·`2026-11-21-governance.md`. 질문 상태 줄 2655·2693·2744, 새 질문 `docs/questions/2026-11-22-return-home.md`(2751~2755).
- 가지 `work/return-home`, 바탕 main 334f0cc429(묶음 1117j)

## 한 일
1. **누가 돌아가나(보충 2)**: `world/battleResults.ts` — 진(포로 아님) 유닛 가운데 끝난 때 부상이 **빨강**(D-521 3단계 `INJURY_CRITICAL`)인 유닛만, 모든 종류(사이보그 본체·휴먼·사이보그 유닛·NPC 휴먼·NPC 지도자).
   흰·노랑·초록은 그 자리에 남는다(다시 싸울 수 있다). 포로는 D-381(질문 108 "전쟁이면 지금처럼 포로")대로 잡은 쪽 안전 도시로 걷는다(`battleReturn.ts walkBack` — 이제 포로만). 결과 요약에 `sentHome`.
2. **어디로(보충·보충 4)** — 새 `world/unitHome.ts`(옛 `cyborgHome.ts`를 이름 바꿔 다시 씀)·`world/unitHomeWorld.ts`(세계 자료 잇기):
   1) 사는 곳(`unit_residences` — `residenceOf`: 고른 집 → 숙소 배정) 건물 가운데 칸,
   2) 소속 도시 — 플레이어 유닛 = 주인 사이보그의 내 도시(`cyborgs.start_city_id`, 가문원은 가문 소속 도시), NPC 휴먼 = 거울 세계 사는 도시(`SimUnit.city`, 노숙 0 제외) — 시청 칸,
   3) 소속 국가 정부 건물 — 나라 = 시민권 나라(플레이어)·주인 세력(NPC), 수도 = NPC 런타임 `capitalOf`(없으면 부팅 도시 표 `capitalsOf`), 그 수도 `government_hall` 칸(없으면 수도 시청 칸),
   4) 적대 세력이 아닌 가까운 도시 — 적대 = 거울 세계 `faction.wars`(도시 주인이나 위 나라)와 지금 전쟁 중(기술 기본값, 호감도 띠 제외 [임시 2753]), 같은 2차맵 칸 거리 → 다른 2차맵 가운데 행성 위 거리 → 작은 ID.
   띄운 2차맵·폐허 아닌 도시만. 넷 다 없으면 그 자리 [임시 2751].
3. **어떻게(보충 3 — 순간이동, D-591의 유일한 예외)**: `UnitHome.teleport` — 가던 길 버림(플레이어 `travel.cancel`, NPC `cancelNpc`), 같은 2차맵 `relocateToSafety`, 다른 2차맵 `transferOut(carry)` → `transferIn(carry)`
   (봇은 `holdRoam(false)`), 못 세우면 되돌림. `returningUntilMs` 안 씀(빨강이 이미 `unavailable`).
4. **지운 것**: fixes-1117i의 이동 서비스 돌아가는 길(`TravelService.start` `returning`, `planFor` `returning`, `beginLeg` `ignoreCondition`, `secondMap.moveUnit` `ignoreCondition`)과 그 시험 1개(`git apply -R`로 그 커밋 몫만 되돌림),
   "떠돌이·못 보냄 → 가장 가까운 안전 도시로 걷기"(질문 2744 답함).
5. 세계 `persistence.unitHome`(시험·조회용)을 더했다.

중간에 코디네이터가 세 번 방향을 고쳤다(보충 2 빨강만 → 보충 3 순간이동 → 보충 4 4번 차례). 처음 만든 실제 이동판(NPC 이동 `returning` 옵션 등)은 커밋 전에 걷어 냈다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/unitHome.ts`(← `cyborgHome.ts` 이름 바꿈) | 돌아갈 곳 차례 1~4·순간이동 |
| 새 `apps/server/src/world/unitHomeWorld.ts` | 소속 도시·나라 수도·행정 건물·적대 아닌 가까운 도시를 세계 자료에 잇기 |
| `apps/server/src/world/battleReturn.ts` | `returnHome` = 순간이동(지금 자리로 4번을 잰다), `walkBack`은 포로만 |
| `apps/server/src/world/battleResults.ts` | 빨강만 귀환, 포로는 걷기, `sentHome` |
| `apps/server/src/world/battleStart.ts`·`world.ts` | `unitHome` 잇기(사이보그·건물·이동 서비스 뒤), `persistence.unitHome` |
| `apps/server/src/travel/service.ts`·`planner.ts`·`serviceTypes.ts`·`service.test.ts`, `world/secondMap.ts`·`secondMapTypes.ts` | fixes-1117i 돌아가는 길 지움 |
| `apps/server/src/world/unitHome.test.ts`(← `cyborgHome.test.ts`) 12개, 새 `world/returnHome.db.test.ts` 2개 | 시험 |
| ADR 셋 "바뀜 (return-home, D-594 보충)", 질문 셋 상태 줄, 새 질문 파일, 이 기록 | 문서 |

## 판·마이그레이션·설정 칸
- 프로토콜 **그대로**(68/67 — 메시지 바뀜 없음). 팩 **그대로**(core@148 — 설정 칸 없음, 찾는 반지름 16칸·위 나라 깊이 8은 코드 상수 [임시]). **SIM_VERSION 그대로(76)** — 시뮬 코드 바뀜 없음(서버 전투 결과 적용만).
- 마이그레이션 **없음**(표 바뀜 없음 — `returning_until_ms` 칸은 포로 걷기가 계속 쓴다). 리셋 필요 없음.

## 함께 바꿔야 하는 파일
- 묶을 때: 질문 번호 2751~2755가 겹치면 옮긴다(질문 파일·ADR·이 기록). `world/battleResults.ts`·`world/world.ts`를 다른 줄기가 고쳤으면 둘 다 살린다.
- D-594 보충 넷을 기획 미러(`docs/design/02_Decision_Log.md`)에 동기화하면 이 기록의 원문 인용과 맞춰 본다.

## 건드리지 말 것
- 포로 규칙(D-381 — 걷기), 수호신(그 도시에 머묾), 부상 굴림·단계표(D-521).

## 미검증·TODO·알려진 문제
- 서버가 꺼진 동안 끝난 전투는 켤 때 NPC 런타임보다 먼저 적용될 수 있어, 그때 NPC 휴먼은 소속 도시를 몰라 정부 건물로 간다 [임시 — 질문 2754].
- 다른 2차맵으로 옮길 때 소유 주체 정산(운영자 텔레포트의 `settle`)을 부르지 않았다(빨강은 일하지 못한다 — Assumed 영향 없음).
- 순간이동한 NPC 휴먼의 집·일터(봇 `home`)는 NPC 런타임이 다음에 맞출 때까지 옛 값일 수 있다(Assumed — 미실행: 런타임 틱 뒤 모습은 보지 않음).
- 기기 화면은 바꾸지 않았다(순간이동 연출 없음 — 화면 시험 돌리지 않음).

## 검사
- (작업 중 — Verified 실행) 서버 타입 검사, oxlint(`world`·`travel`), `world/unitHome.test.ts` 12/12, `world/returnHome.db.test.ts` 2/2, `world`·`travel`·`governance3.db` 71파일 427/427(TEST_DATABASE_URL).
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — 최종 트리) **통과**: 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠(core@148), 시험 파일 **907/907**·시험 **6,480/6,480**
  (`@terra/sim` 골든 포함 — SIM 76 그대로). 화면은 바꾸지 않아 화면 시험은 돌리지 않았다.

## 사용자 결정 대기
- 새 질문 2751~2755(`docs/questions/2026-11-22-return-home.md`).
