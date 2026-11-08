# 2차맵 고정 카메라·근처 판·이웃 안개·로딩 없는 2차맵 이동

- 일시: 2026-11-08 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-seamless-second-map.md`(확정 — 사용자 답 Q1~Q5), 일부 대체: `2026-11-08-map-input.md`·`2026-11-07-gather-objects.md`·`2026-10-31-second-map-from-planet.md`·`2026-11-07-unit-control.md`(상태 줄만), 가지 `claude/kind-turing-2g2t45`(main `27f35c6`에서)

## 한 일
사용자 지적(2026-11-08): "문제1. 2차맵에서 인접한 맵은 포그가 적용되지 않는 문제", "개선1. 자원 오브젝트를 항상 표시하지 않는다 … 근처의 자원, 건물, 유닛 등의 탭을 선택하여 목록으로 보여주고 해당 탭에 해당하는 오브젝트를 보여주는 방식". 답: 고른 탭 표시만, 늘 유닛이 골라져 있고(기본 사이보그) 그 거리, 자유 시점부터 없앤다, 유닛 탭 = 내 유닛 + 보이는 유닛, 문제1은 로딩 없는 2차맵 이동으로. 그다음 답 "1. 카메라 회전 2. 자유시점 전환 버튼(운영자 기능은 빨간색 ui로 구분하자) 3. 못들어감 4. 20개씩 스크롤 5. 알아서".
- WP-1 고정 카메라: 따라가는 동안 한 손가락 끌기 = 돌리기(엔진 조작), 끌기로 따라가기를 끊지 않음. 기준 유닛(`anchorUnit.ts`) = 고른 내 유닛 → 마지막으로 고른 내 유닛 → 이 맵 내 사이보그 → 목록 첫 유닛. 늘 하나가 골라져 있다. [따라가기]·[선택 해제] 없앰, 남의 유닛을 살펴볼 때만 [내 유닛으로]. 내 유닛 없는 2차맵은 들어갈 수 없음 안내. 운영자만 [자유 시점]. 운영자 단추·표시는 빨강(`--color-danger`).
- WP-2 근처 판(`map/nearby/`): 자원·건물·유닛 탭, 기준 유닛에서 가까운 차례 20개씩(끝까지 내리거나 [N개 더 보기]). 지도에는 고른 탭 표시만, 닫으면 없음. [내 유닛 N] 목록을 유닛 탭으로 합침. 건물 이름·내 것: `facilities.mapLooks`에 `name`·`mine` 칸.
- WP-3 이웃 안개: 카메라 쪽 이웃(많아야 3장)을 같은 연결로 구독(`neighbourVision.ts`) → 그 vision을 이웃 지형 안개로(엔진 `setNeighbourExplored`). 거절 = 온통 어둡게. 전체 보기면 끔.
- WP-3 로딩 없는 넘기: 기준 유닛이 구독 중인 이웃에 나타나면(또는 사이보그 길 조회가 넘었다고 하면) 엔진 `rebase`(이웃 지형을 지금 2차맵으로, 옛 2차맵은 이웃으로, 카메라·다른 이웃을 새 틀로) → 2차맵 자료 모음(`mapSession.ts`)만 새로 켜고 주소를 바꾼다(화면·엔진을 다시 만들지 않음). 넘은 직후 "받는 중" 안내는 띄우지 않는다.
- 화면 파일 나누기(600줄): 엔진 효과 `useMapEngine.ts`, 2차맵 자료 `mapSession.ts`, 안내 판 `SecondMapNotices.tsx`, 표지 `mapHudData.ts`.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/camera/controls.ts`·`.test.ts` | 따라가는 동안 끌기 = 돌리기 |
| `packages/engine/src/secondMapEngine.ts` | 끌기로 따라가기 안 끊음, `setNeighbourExplored`, `rebase`, 지금 2차맵 탐사 칸 기억, 이웃 안개 모드 |
| `packages/engine/src/engineTypes.ts`·`engineParts.ts` | API 두 개(`setNeighbourExplored`·`rebase`) |
| `packages/engine/src/terrain/neighbourTerrains.ts`·`.test.ts` | 이웃 안개(`setFog`·`setExplored`), 넘기(`take`·`reframe`·`adopt`) |
| `packages/engine/src/terrain/rebase.ts`·`.test.ts`(새) | 놓는 자리 역·이어 놓기, 카메라 옮기기(순수 함수) |
| `packages/shared/src/mapLooks.ts`, `apps/server/src/facilities/mapLooks.ts`·`.test.ts`·`appSource.ts` | 건물 겉모습 응답에 시설 이름·내 것 |
| `apps/game/src/map/anchorUnit.ts`·`.test.ts`(새), `UnitFollow.tsx` | 기준 유닛 고르기·따라가기(끊기면 다시) |
| `apps/game/src/map/nearby/*`(새) | 근처 판 상태·줄 만들기·판·CSS·시험 |
| `apps/game/src/map/gather/gatherOverlay.ts` | 표시는 고른 탭일 때만, 기준 유닛에서 가까운 차례, 건물 표시 12 → 20 |
| `apps/game/src/map/UnitControlPanels.tsx`·`unitControl.css` | 내 유닛 목록·[내 유닛 N] 없앰(유닛 탭), [내 유닛으로], [자유 시점], 운영자 빨강 |
| `apps/game/src/map/neighbourVision.ts`·`.test.ts`(새) | 이웃 구독·vision·유닛 ID(넘기 신호) |
| `apps/game/src/map/secondMapNeighbourLoader.ts`·`.test.ts` | 카메라 쪽 이웃 알림(`onNear`), 넘은 뒤 seed, `terrains()` |
| `apps/game/src/map/mapSession.ts`(새), `useMapEngine.ts`(새), `SecondMapNotices.tsx`(새), `mapHudData.ts`(새) | 화면에서 나눔(엔진 하나 + 맵마다 자료 모음) |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 위 연결, 넘기(`crossRef`), 주소 바꿔도 다시 만들지 않기, 넘은 직후 안내 끄기 |
| `apps/game/src/map/useCyborgTravel.ts` | 넘을 때 `onCross`(화면 안 넘기) |
| `apps/game/src/map/useMapUnits.ts` | 답의 2차맵(`mapKey`) — 넘은 직후 옛 목록·범위를 쓰지 않게 |
| `apps/game/src/map/mapFeed.ts`·`feedTypes.ts` | `unitIds()`, 요청 번호 함께 쓰기(`defaultRequestId` 내보냄) |
| `apps/game/src/map/buildingLooks.ts`·`.test.ts` | 겉모습 답 알림(`onLooks`) |
| `apps/game/src/shell/routeViews.tsx` | 2차맵 화면 열쇠에서 주소 값을 뺌(화면이 스스로 정한다) |
| `apps/game/messages/{ko,en}.json` | 근처 판·안내·단추 문구, 쓰지 않는 `map_units_*`·`map_deselect` 지움 |
| `e2e/helpers/nearby.ts`(새), `e2e/seamless.spec.ts`(새), `e2e/{map-input,unit-control,control-move3,gather,gather-station,building-art,citizenship,government,play-map,vision}.spec.ts` | 근처 판·고정 카메라·넘기 시험 |
| `docs/adr/2026-11-08-seamless-second-map.md` 외 ADR 상태 줄 4개 | 결정·구현 기록, 일부 대체 표시 |

## 함께 바꿔야 하는 파일
- 근처 판 표시 규칙은 `gather/gatherOverlay.ts`와 `nearby/nearbyRows.ts`가 같은 차례(`rankByDistance`)를 써야 목록과 지도 표시가 같다.
- 엔진 이웃 id = 2차맵 키 글자(`String(key)`): 이웃 받기·이웃 안개·`rebase`가 같은 id를 쓴다.
- 서버 한 연결 구독 상한(`gateway.ts` `MAX_MAPS_PER_SOCKET = 4`)을 낮추면 `neighbourVision.ts` `MAX_NEIGHBOUR_SUBSCRIPTIONS`(3)도 낮춘다.

## 건드리지 말 것
- 서버 시야 규칙(`world/vision.ts` `canView`)·구독 상한은 그대로 썼다. 프로토콜 판 바뀜 없음(기존 subscribe·vision·unit_paths만).

## 미검증·TODO·알려진 문제
- 실제로 걸어서 2차맵을 넘는 장면은 화면 시험으로 보지 않았다(몇 분 걸림). `e2e/seamless.spec.ts`는 연결을 가운데서 고쳐 흉내 낸다(사이보그를 변 가까이로 보이게, 이웃 경로에 가짜로 나타나게).
- 올린 이웃 지형은 옛 2차맵 칸 크기로 그린 것(이웃끼리 1% 아래 차이)이라 새 지형 파일이 오면 조금 움직일 수 있다. 이웃 높이 밝기 범위도 옛 값. 낮밤 빛 위도·경도는 처음 2차맵 값(Assumed: 옆 2차맵은 거의 같다).
- 이웃 구독마다 서버가 그 2차맵 스냅샷·경로를 보낸다(전송 늘어남, 재지 않음). 이웃 유닛은 아직 그리지 않는다.
- 운영자 모드는 이웃을 구독하지 않아 넘기 신호가 사이보그 길 조회(0.9초 + 조회 간격)뿐이다.
- `SecondaryMapScreen.tsx` 600줄(경고선), `secondMapEngine.ts` 690줄(600줄 경고 — 이번에 rebase로 늘었다). 다음 줄기에서 나눈다.
- Node: 이 세션 컨테이너는 Node 22.23.4라 pnpm이 엔진 경고를 냈다(프로젝트 기준 24). 결과는 아래 "검사".

## 검사
- (작업 끝에 적는다)

## 사용자 결정 대기
- 없음(ADR Q1~Q5 답함).
