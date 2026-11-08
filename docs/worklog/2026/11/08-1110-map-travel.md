# 2차맵에서 옆 2차맵으로(사용자 지적 "2차맵 넘어서 이동이 되지 않음")

- 일시: 2026-11-08 11:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP14 2차맵에서 옆 2차맵으로 (map-travel)", ADR `docs/adr/2026-11-07-world-layout.md`, 질문 `docs/questions/2026-11-08-map-travel.md`(730~736), 가지 `work/map-travel`(main `a366ef2`에서)

## 한 일
- **까닭 찾기**(Verified: 코드·시험)
  1. 2차맵 안에 변을 넘는 명령이 없었다. 땅 누르기는 그 2차맵 안 `move_unit`(변에서 멈춤)이고, 엔진 `pickGround`는 2차맵 밖(경계 너머 보기로 그린 이웃 지형) 누름을 null로 버린다. 2차맵 사이 이동(`travel_start`)은 1차맵 명령 판에서만 보냈다.
  2. 1차맵 명령 흐름([정찰 보내기])은 볼 수 없는 도시에만 있었다. 볼 수 있는 도시(내 유닛이 있거나 한 칸이라도 탐사한 2차맵)는 [들어가기](카메라만)뿐 — 한 번 걸어가 본 이웃 시작 도시로는 다시 보낼 길이 없었다.
  3. 2차맵 줄 상한 64장: 시험 행성 세계 배치의 국가 수도 넷(0:92,228·0:52,204·0:100,276·0:68,260) 사이 줄 49~121장 가운데 65·73·121장이 `no_route`(국가 2는 모든 국가와 길이 없었다). 시험 줄 ↔ 국가 235~355장도 없음.
  - 그대로 맞는 것: 같은 국가 붙은 2차맵(띄움)으로 넘기, 띄우지 않은 2차맵 건너뛰기(DB 시험으로 81장 길 확인).
- **먼 2차맵 줄**(`route.ts`): 상한 1,024장. 64장 안이면 옛 방식(둘레 전체 너비 우선 — WP11 규칙 그대로), 더 멀면 큰 원 둘레 띠(반폭 8칸, 못 찾으면 32칸) 안 너비 우선. 잰 값(같은 스레드, vitest, 2026-11-08): 옛 방식으로 상한만 512로 올리면 121장 36ms·355장 434ms, 띠는 121장 3ms·355장 10ms·65장(옛 방식 실패 뒤) 27ms(첫 호출 JIT 포함).
- **2차맵 [옆 2차맵으로]**(새 `EdgeTravel.tsx`·`edgeTravelData.ts`·`edgeTravelOverlay.ts`·`edgeTravel.css`): 고른 내 유닛(없으면 이 2차맵의 내 사이보그) → 변 넷(나침반 이름·가장 가까운 변)마다 서버 확인(`world.travelPlan`, 그 유닛) → 열린 옆 2차맵 [보내기](`travel_start`, 변 너머 8번째 칸), 열리지 않은 옆 2차맵은 까닭("설 수 없습니다") + 1차맵 안내·[1차맵에서 고르기]. 판은 화면 아래에 붙는 판(지도 화면 밖, 층 6 — 첫 사진에서 오른쪽 가운데 전환 단추가 판 글자를 가려 옮김). 변에서 40칸 안이면 변 위 화살표 단추(덧그림). 가는 동안 유닛 머리 위 이름표·아래 한 줄(남은 시간·도착 예상·[멈추기]), 넘어가면 0.9초 안내 뒤 그 2차맵 `?at=`(D-139). 닿음·멈춤·실패는 까닭 한 줄.
- **1차맵 도시 판**: 볼 수 있는 도시에도(내 사이보그가 다른 2차맵이면) [내 사이보그 보내기] → 같은 명령 판(이동이 먼저).
- 판: 프로토콜 17·팩 core@51·SIM 그대로, 마이그레이션 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/route.ts` | 줄 상한 1,024, 먼 길은 큰 원 둘레 띠 안 너비 우선(`OPEN_SEARCH_MAPS`·`BAND_CELLS`) |
| `apps/server/src/travel/route.test.ts` | 국가 수도·시험 줄 사이 가장 짧은 줄, 옛 상한이면 null |
| `apps/server/src/travel/layoutTravel.db.test.ts`(새) | 세계 배치(가짜 행성 값) 위: 수도 → 붙은 시작 도시 옆 2차맵 넘기, 열리지 않은 옆 2차맵 `unknown_map`, 다른 국가 가장 먼 도시(81장) 건너뛰기 + 다시 켬 |
| `apps/game/src/map/EdgeTravel.tsx`(새)·`edgeTravelData.ts`(새, +시험)·`edgeTravelOverlay.ts`(새)·`edgeTravel.css`(새) | 2차맵 [옆 2차맵으로] 판·변 화살표·가는 중 이름표 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 판을 넘기는 줄(가져오기 둘 + 요소 하나 + 머리 주석 한 줄) |
| `apps/game/src/map/travelData.ts` | `loadTravelPlan`에 보낼 유닛(`unitId`) |
| `apps/game/src/map/travelCommands.ts` | 머리 주석(2차맵 화면도 쓴다) |
| `apps/game/src/map/PlanetCityPanel.tsx`·`PlanetMapScreen.tsx`·`PlanetCommandPanel.tsx` | 볼 수 있는 도시 [내 사이보그 보내기], 명령 판 기본 = 볼 수 있으면 이동 |
| `apps/game/messages/ko.json`·`en.json` | `map_edge_*` 19개·`world_city_send` |
| `e2e/map-travel.spec.ts`(새) | 수도 2차맵 판 열림·닫힘 → 보내기 → 가는 중·이름표 → 멈추기, [1차맵에서 고르기], 사진 |
| `docs/adr/2026-11-07-play-flow.md` | "WP14" 절 |
| `docs/questions/2026-11-08-map-travel.md`(새) | 질문 730~736 |
| `docs/PLAN.md` | 14장 줄 |

## 함께 바꿔야 하는 파일
- 보낼 수 있는 유닛·결과 코드를 바꾸면 `EdgeTravel.tsx`의 까닭 문구(`edgeProblemText`)와 `travelData.ts` `travelProblemText`를 함께.
- 경계 너머 보기의 놓는 자리(`secondMapNeighbours.ts` `neighbourSpots`)를 바꾸면 `edgeTravelData.ts`(거꾸로 쓴다)와 그 시험을 함께.

## 건드리지 말 것
- 엔진 입력(`packages/engine`의 땅 누름)·카메라는 고치지 않았다(다른 줄기). 변 너머 땅 누르기 손짓은 질문 733.

## 미검증·TODO·알려진 문제
- 넘는 순간의 D-139 화면 바꿈(2차맵 화면이 옆 2차맵 `?at=`로 바뀜)은 화면 시험으로 보지 않았다(변까지 걷기 몇 분). 서버 넘기는 DB 시험, 화면은 가는 중·멈추기까지.
- 1차맵 [내 사이보그 보내기]는 화면 시험이 없다(시험 계정이 볼 수 있는 다른 2차맵을 만들려면 먼저 걸어가 탐사해야 한다) — 타입·단위 시험만.
- 띄우지 않은 옆 2차맵은 여전히 설 수 없다(질문 730 — 추천 다: 서버가 그때 띄우기, 593 다).
- NAS 실제 세계에서 돌려 보지 않았다(미실행). 시험 행성 세계 배치의 수도 좌표는 2026-11-08 world-layout 작업 기록 값(같은 행성·같은 시드면 같다 — Assumed: NAS도 같은 배치).

## 사용자 결정 대기
- 없음(질문 730~736은 기획 세션).
