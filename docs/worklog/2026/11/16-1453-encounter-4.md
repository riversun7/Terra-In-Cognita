# 조우 4 — AI 작전으로 조우 판단·회피 빠져나가기(D-573)·돌아갈 곳 창고/거점·채집 줄 다시 잇기·전투맵 건물 피해 (encounter-4)

- 일시: 2026-11-16 14:53 (KST)
- 작업 도구: Claude Code
- 관련: 기획·사용자 답 질문 `docs/questions/2026-11-16-map-coords-3.md` 2021~2038(D-570 1904·1908·1803, D-174, D-5039·D-5040, D-144), 2022 = D-573(기획 ae93bcc, 미러는 아직 바탕에 없음), house-5 2015·2016, ADR `docs/adr/2026-11-15-unloaded-second-maps.md` "바뀜 (encounter-4)", 앞 줄기 `docs/worklog/2026/11/16-1014-map-coords-3.md`, 새 질문 `docs/questions/2026-11-16-encounter-4.md`(2131~2140), 가지 `work/encounter-4`(바탕 main 4ef0cfc, 묶음 1116j)

## 한 일
1. **조우 판단 입력 = AI 작전(2021·2023)** — 새 교전 규칙 없이 기획 D-5039·D-5040 AI 작전(7항목 슬라이더 0~10 + 4프리셋 + 목표 우선순위)을 쓴다. 구현된 슬라이더가 없어(Verified: sim `combat/moveAi.ts`는 고리 자리만, 파티 `retreatHpPct`만 있음) 값 모양·프리셋 출발값(49 C39·X15)을 `@terra/shared/aiTactics`에 두고 저장 칸을 만들었다.
   - 저장: 새 표 `unit_tactics`(유닛당 한 줄, 외래 키 없음, 월드 쓰기 대기열), 서버 메모리 저장소 `tactics/store.ts`(세계 저장 층에 붙음), 프로토콜 50 `unit_tactics` → `travel_result`(이동 게이트웨이로 받음). 유닛 화면 상세에 [AI 작전] 판(`units/TacticsPanel.tsx` — 프리셋 넷 + 접어 둔 7항목·목표, 판단하는 세계 유닛만, 로스터 조회가 `unit_tactics`를 붙여 준다).
   - 판단(`travel/encounterSides.ts`·`clashDecide.ts`): 플레이어 유닛 = 저장한 작전(없으면 균형), NPC = 공격 성향 → 프리셋. 편 = 한 파티로 보고 판단 유닛 평균. ① 교전 n × 10% 서버 난수 한 번 + 교전이 전력 비 문턱을 옮김, ⑦ 퇴각 기준 아래면 걸지 않음·조우 전투 파티 퇴각 기준. 오프라인 주인(접속 상태 `offlineSince`)·직무 중 유닛은 먼저 걸지 않는다(D-144). 설정 칸 `encounter_player_policy` 새 기본 2(작전대로, 0 = 늘 회피, 1 = 옛 성향 500).
2. **회피 편 빠져나가기(2022 → D-573)** — 한쪽만 걸고 상대가 판단 끝에 회피했으면 가장 느린 유닛의 걷기 빠르기(실효 AGI·이동 버프)를 견준다. 더 빠르면 전투 없이 빠져나가고(쉬는 시간, 1분 지표 `encounterEscaped`), 아니면 전투가 열리고 그 편 파티는 시작 틱에 퇴각 명령(D-190). 봇만인 편은 맞선다. 좌표 유닛 목록에 유닛 행 빠르기(`CoordinateUnit.speed`)를 더했다.
3. **채집 줄은 조우로 끝나지 않는다(2035)** — 조우가 멈추기 전에 채집 줄을 멈춤으로 둔다(`gather suspend`). 전투 뒤 다시 판단: 그 오브젝트로 다시(`resume`), 가방이 찼으면(`encounter_full_pm` 85%) 그 유닛 화물 모두를 가장 가까운 넣는 곳에 넣고 다시 캔다, 다쳤으면 줄을 끝내고 거점으로, 서 있지 않았으면 끝. 채집 서비스는 app.ts를 거치지 않고 세계 저장 층 등록(`gather/registry.ts`)으로 찾는다.
4. **돌아갈 곳(2033)** — 정리 → 가장 가까운 내 창고 시설(같은 2차맵이면 들어가기로 바로 넣고, 다른 2차맵이면 간 뒤 닿으면 들어가기), 재정비 → 가장 가까운 거점(내 나라 도시·시작 도시), 둘 다 없을 때만 출발 자리(`travel/encounterPlaces.ts`·`encounterHome.ts`, 가까움 = 행성 위 2차맵 가운데 거리 → 칸 거리).
5. **조우 전투맵 건물(2030)** — 부서지지 않는 막힘 대신 공성 전투맵과 같은 전투 건물(지금 내구도, 보통 건물 breakable·성벽 wall), 받은 피해는 결과 적용 때 세계 시설 상태로(`siegeFacilityTargets`). 시작 자리는 건물 칸을 피한다.
6. **질문 문서 답 반영 표시** — map-coords-3 2021~2024·2027~2030·2033·2035·2036·2038, house-5 2015·2016(지금대로). 2022는 D-573으로 반영.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/aiTactics.ts`(새)·`package.json`·`roster.ts` | AI 작전 값 모양·프리셋 출발값·검사·NPC 성격 → 프리셋, 유닛 화면 칸 `tactics` |
| `packages/protocol/src/travel.ts`·`index.ts`·`version.ts` | `unit_tactics` 메시지, 프로토콜 50(받는 가장 낮은 판 49) |
| `apps/server/src/db/travelSchema.ts`·`schema.ts`, `drizzle/20261116051806_unit_tactics/` | 표 `unit_tactics`(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 `unitTactics`(유닛 다음) |
| `apps/server/src/tactics/store.ts`(새) | 작전 저장소(읽기·소유 검사·쓰기) |
| `apps/server/src/travel/gateway.ts`·`session.ts`·`app.ts` | `unit_tactics` 받기(판 50 검사), 게이트웨이에 저장소(app.ts +2줄 → 996줄) |
| `apps/server/src/travel/clashDecide.ts`·`encounterSides.ts`(새) | 작전·접속·빠르기로 편 판단, 빠져나가기·퇴각 시도 |
| `apps/server/src/travel/encounterWorld.ts` | 판단 값·굴림, 빠져나감, 채집 줄 멈춤, 파티 퇴각 기준·퇴각 명령, 전투맵 건물 목표, 돌아갈 곳 출처 |
| `apps/server/src/travel/encounterArena.ts`·`encounterInit.ts` | 부술 수 있는 전투 건물·건물 ID 대응, 파티 퇴각 기준 |
| `apps/server/src/travel/afterEncounter.ts`·`encounterHome.ts`(새)·`encounterPlaces.ts`(새) | 창고·거점, 채집 줄 다시 판단, 다른 2차맵 창고 도착 뒤 들어가기 |
| `apps/server/src/travel/serviceParts.ts`·`serviceTypes.ts` | 좌표 유닛 빠르기 |
| `apps/server/src/gather/service.ts`·`serviceTypes.ts`·`action.ts`(새)·`registry.ts`(새)·`world.ts` | `suspend`·`resume`·`drop`, 줄 모양을 나눔(1,000줄 상한 — 941줄) |
| `apps/server/src/roster/worldUnits.ts`·`services.ts` | 유닛 목록에 저장한 작전(판단하는 내 유닛만) |
| `apps/game/src/units/TacticsPanel.tsx`(새)·`tactics.css`(새)·`UnitDetail.tsx`, `map/travelCommands.ts`, `messages/{ko,en}.json` | [AI 작전] 판(문구 28개 ko·en) |
| `packages/sim/src/society/encounterCoefficients.ts`·`tuningEncounter.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 이름·`encounter_player_policy` 2·범위 0~2, 팩 core@118 |
| 시험: `travel/clashDecide·afterEncounter·encounterArena·encounter·encounterWorld·gateway.test.ts`, `gather/service·gateway.test.ts`, `tactics/store.test.ts`(새), `shared/aiTactics.test.ts`(새), `protocol/travel.test.ts`, `e2e/units.spec.ts` | 새 규칙 |
| `docs/adr/2026-11-15-unloaded-second-maps.md` | "바뀜 (encounter-4)" |
| `docs/questions/2026-11-16-map-coords-3.md`·`2026-11-16-house-5.md`·`2026-11-16-encounter-4.md`(새) | 답 반영 표시, 새 질문 2131~2140 |

## 함께 바꿔야 하는 파일
- 판: 프로토콜 **50**(MIN 49 — `version.ts`에 "49: 같은 묶음의 다른 줄기" 자리만 두었다, 합칠 때 그 줄기 설명을 넣는다), 팩 **core@118**, `SIM_VERSION` 그대로(sim 판정 코드 바뀜 없음 — 조우 전투맵 건물·파티 퇴각 기준·퇴각 명령은 기존 판정의 입력).
- 마이그레이션 하나: `20261116051806_unit_tactics`(`unit_tactics` 표 추가). 직전 판 앱은 이 표를 모른 채 돈다.
- AI 작전 목록(프리셋·목표)을 바꾸면 `@terra/shared/aiTactics`·`packages/protocol/src/travel.ts`(`UNIT_TACTICS_*`)·`travelSchema.ts` 검사 조건을 같이(마이그레이션).
- 전투 AI 줄기(sim `moveAi.ts` WP-4)가 ②~⑥·목표를 읽게 되면 같은 `unit_tactics`(세계 전투 시작 자료의 파티 칸)로 넘긴다.

## 건드리지 말 것
- 채집 줄 `suspend`는 조우가 유닛을 세우기(`haltOn`·`map.halt`) **전에** 건다 — 뒤에 걸면 다음 확인에서 길 벗어남(interrupted)으로 끝난다.
- 작전 저장소는 `world.persistence`에 붙는다(`attachUnitTactics`의 key) — 게이트웨이·로스터가 `unitTacticsOf(world.persistence)`로 찾는다. 새 객체에 붙이면 저장이 늘 busy(이번 e2e 첫 돌림에서 잡음).
- 조우 판단 유닛 종류(`DECIDER_KINDS`)와 작전 종류(`TACTICS_KINDS`)는 같다.

## 리셋 필요 여부
- **리셋 필요 없음.** 표는 더하기만(`unit_tactics`), 저장 줄이 없으면 균형 프리셋으로 읽는다. 다시 판단·채집 멈춤 자료는 메모리라 배포 중이던 조우의 멈춘 유닛은 옛 동작처럼 그 자리에 서고 채집 줄은 끝난다(다시 켠 뒤 시작한 조우부터 새 규칙). 설정 칸 `encounter_player_policy`를 DB 덮어쓰기로 1로 둔 세계는 뜻이 그대로(옛 판단)다.

## 미검증·TODO·알려진 문제
- 실제 월드·DB·NPC 런타임에서 조우 → 빠져나가기/퇴각 → 다시 판단(창고·거점·채집 다시 잇기)을 끝까지 돌린 시험은 없다(미실행 — 단위 시험은 가짜 월드 몫). 운영에서 플레이어 유닛이 기본 균형으로 전쟁 상대를 먼저 칠 수 있게 됐다(Assumed: NPC 나라의 봇 아닌 전투 유닛이 적어 드묾).
- 걷기 빠르기는 2차맵이 마지막 이동 때 잰 값이라 서 있던 유닛은 그 뒤 버프 바뀜을 모른다(질문 2136).
- 보통 전투라 유닛이 조우 전투맵 건물을 일부러 치지 않는다 — 밀치기 등으로만 깎인다(질문 2135).
- 다른 2차맵 창고는 도착 확인이 30초 × 6번(약 3분)뿐이라 아주 먼 길이면 닿아도 들어가지 않는다(주인이 넣는다, 질문 2138).

## 사용자 결정 대기
- 질문 2131~2140(추천안으로 만듦). 특히 2132(저장 없는 플레이어 유닛 = 균형 → 전쟁 상대를 먼저 칠 수 있음).

## 검사 (Verified — 실행함, 공유 기계)
- 화면 시험 `e2e/units.spec.ts --grep "AI 작전|구인 카드"`: 3개 통과(27.8초). 첫 돌림은 2개 실패(저장소를 다른 객체에 붙여 저장이 busy) → 고친 뒤 통과. 사진 `unit-tactics-390-pastel-ko.png`·`unit-tactics-390-dark-en.png`(저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/encounter-4-shots/`)을 눈으로 확인(가로 넘침 없음).
- `pnpm build`(화면 시험 전역 준비) 뒤 `pnpm check:bundle`: 첫 화면 JS 110,081 B / 상한 131,416 B.
- 전체 `pnpm check`(TEST_DATABASE_URL, 잠금 안): 포맷·린트(타입 인식)·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 759파일 5,708개 모두 통과(한 번에).
- `pnpm check:content 4ef0cfc`(호환 포함): core@118 통과.
