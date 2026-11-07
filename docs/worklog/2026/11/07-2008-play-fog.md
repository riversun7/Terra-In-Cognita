# 플레이 흐름 WP7: 1차맵 도시 안개·볼 수 없는 맵 들어가기·들어갈 때 카메라, unknown_map 고리 고침

- 일시: 2026-11-07 20:08 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP7 도시 안개·들어가기·카메라 (play-fog)", 질문 `docs/questions/2026-11-07-play-map.md`(513~515 답, 새 질문 570~572), 기획 정리 D-518(미러 `c79d6bd`), 가지 `work/play-fog`(main `d5a320b`에서)

## 한 일
- 514 다(도시 안개, 서버 권위): `world.cities`가 아는 도시만 보낸다. [임시] 아는 도시 = 시작 도시 · 내 국가 도시 · 그 시청 칸이 든 시야 칸을 본 적 있음(탐사 기록) 또는 지금 내 유닛·건물 시야 안 · 전체 보기 권한(확인 대기 570). "도시 N" 차례는 모르는 도시까지 세어 이름이 바뀌지 않는다. 영토 껍질은 그 덩이 도시를 모두 알 때(또는 내 국가)만.
- 513 다(볼 수 없는 맵): 1차맵 도시 판에 [정찰 보내기] → 1차맵 명령 판(대상·정찰/이동·보낼 유닛 = 내 사이보그 + 큰 원 거리, [확정]은 막고 까닭 — 2차맵 사이 이동 명령이 서버에 없다, 확인 대기 571). 2차맵을 주소로 열었는데 볼 수 없으면(`not_visible`) 까닭 + [1차맵에서 보기].
- 515 나(카메라): `/map?key=&at=<x>,<y>`. 1차맵 [들어가기] = 도시 시청 칸, [이 2차맵으로 들어가기] = 화면 가운데 배치 칸. 내 사이보그가 없는 맵은 `?at=` > 그 2차맵 도시 시청 > 맵 가운데(내 사이보그가 있으면 내 사이보그 먼저, 확인 대기 572).
- 버그: 서버 `world/secondMap.ts` `onRoute`가 경로 워커의 `unknown_map`(판 −1)을 "그사이 건물이 놓였다"로 보고 곧바로 다시 물어 마이크로태스크가 끝없이 돌던 것을 고쳤다(WP1 9절이 남긴 일). 명령 결과 코드는 `unknown_map`. 기기 구독은 전에도 `unknown_map`을 다시 묻지 않았다(`mapFeed.ts` `RETRYABLE`, Verified: 코드) — 지시문의 "apps/game 고리"는 서버 쪽이었다. 2차맵 화면은 `unknown_map`이면 "이 2차맵은 아직 열려 있지 않습니다"(WP2 문구) + [1차맵에서 보기], [다시 시도] 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/worldMap/knownCities.ts`(새)·`knownCities.test.ts`(새) | 아는 도시·껍질 판정(순수 함수)과 시험 |
| `apps/server/src/worldMap/reads.ts` | `world.cities`가 아는 도시만·차례는 모든 도시로·껍질 거르기, DB 탐사 기록 + 띄운 맵 `sighted` |
| `apps/server/src/worldMap/reads.db.test.ts` | 도시 안개 DB 시험(시작 도시만, 사이보그 곁 마을, 탐사 기록 마을, 전체 보기, 차례) |
| `apps/server/src/world/vision.ts` | `MapVision.sighted`(탐사 기록 ∪ 지금 덮는 칸, 사본) — 탐사 기록은 구독하는 동안만 쌓여서 |
| `apps/server/src/world/secondMap.ts`·`secondMap.test.ts` | `unknown_map` 답은 다시 찾지 않음, 결과 코드 `unknown_map`, 시험 |
| `packages/shared/src/routes.ts`·`routes.test.ts` | `map` 주소 칸 `at` |
| `packages/engine/src/planet/planetOverlay.ts`·`index.ts`·`planetOverlay.test.ts` | `placementAtLatLon`(위도·경도 → 2차맵 키·배치 칸) |
| `apps/game/src/map/mapTarget.ts`·`MapTargetGate.tsx`·`worldMap.test.ts` | 카메라 고르기(내 사이보그 > `?at=` > 도시 시청), 필요할 때만 `world.cities` |
| `apps/game/src/map/SecondaryMapScreen.tsx`·`secondMapNotice.ts`(새, 화면에서 나눔) | 고른 곳에 카메라, `unknown_map`·`not_visible` 안내 + [1차맵에서 보기] |
| `apps/game/src/map/PlanetMapScreen.tsx`·`planetNotice.ts`(새, 화면에서 나눔 — 600줄 아래로) | `?at=` 넘기기, 명령 판 열기 |
| `apps/game/src/map/PlanetCityPanel.tsx`·`PlanetCommandPanel.tsx`(새) | [정찰 보내기], 1차맵 명령 판 |
| `apps/game/src/map/map.css` | 안내 단추 줄 |
| `apps/game/src/map/cityOverlay.css` | 덧그림 쌓임 맥락(고른 도시 표시가 아래 판 위로 올라오지 않게) |
| `apps/game/src/shell/routeViews.tsx` | `?at=`를 2차맵 화면에 넘김(화면 열쇠에 넣음) |
| `apps/game/messages/{ko,en}.json` | 명령 판·[1차맵에서 보기] 문구 |
| `e2e/play-map.spec.ts` | WP7 화면 시험(볼 수 없는 맵 → 명령 판, 열리지 않은 맵, 카메라 `?at=`·도시 시청, 사진) |
| `docs/adr/2026-11-07-play-flow.md`·`docs/questions/2026-11-07-play-map.md`·`docs/PLAN.md` | WP7 절, 답 상태·새 질문 570~572, 14장 줄 |

## 함께 바꿔야 하는 파일
- 2차맵 사이 이동 명령이 생기면(질문 571) `PlanetCommandPanel.tsx`의 [확정]이 그 WebSocket 명령을 보낸다(프로토콜 판 올림).
- 우편·거래로 도시를 알게 되는 길(질문 570 나)이 생기면 `worldMap/knownCities.ts` 규칙에 더한다.

## 건드리지 말 것
- 시야 규칙(`world/visibility.ts` `canViewSecondMap`)은 그대로다. 들어가기·구독·지형 파일은 여전히 그것으로 막는다.
- `world.cities` 응답 모양(`@terra/shared/worldMap`)은 바꾸지 않았다(안 보내는 도시가 생겼을 뿐).

## 미검증·TODO·알려진 문제
- 시험 결과는 아래 "검사"에 적는다.
- 아는 도시의 주인·등급은 지금 값이다(D-152 마지막 관측값 아님, 570 다).
- 탐사 기록은 구독하는 동안만 쌓여, 보지 않는 동안 지나간 도시는 지금 시야 안일 때만 안다.
- 1차맵 [이 2차맵으로 들어가기]는 아는 도시가 있는 2차맵만 고른다(내 유닛이 있어 볼 수 있어도 도시를 모르면 뜨지 않는다).

## 검사
- `TEST_DATABASE_URL=… pnpm check` 한 번: 통과(Verified) — 단위·DB 시험 464파일 3,711개 통과, 포맷·린트·타입·경계·크기(600줄 경고는 이 줄기 파일 아님)·다국어·디자인 값·콘텐츠. `pnpm check:docs` 통과.
- 화면 시험 `pnpm e2e e2e/play-map.spec.ts e2e/first-login.spec.ts`: 첫 실행 28 통과·1 실패(내 시험 잘못 — 구독 수 칸은 1초마다 서는 요약이라 처음 값이 없었다. 처음 값을 기다리게 고침), 명령 판 사진에서 고른 도시 이름표가 판 위로 올라온 것을 보고 `cityOverlay.css`에 `isolation: isolate`(쌓임 맥락)를 더한 뒤 다시 실행 29 통과(Verified, 빌드 다시 함).
- 사진(390, 파스텔·다크): 1차맵 명령 판 한국어·영어(`play-fog-command-390-{pastel,dark}-{ko,en}.png`), 열리지 않은 2차맵 안내(`play-fog-not-open-390-{pastel,dark}.png`), WP2 도시 판 사진도 다시 찍힘. 저장소 밖 세션 임시 폴더. 넘침·작은 누르는 곳 없음(시험이 본다). 명령 판이 오른쪽 가운데 [2차맵] 전환 단추(틀 단추, 판보다 위 층)와 판 오른쪽 위 모서리에서 겹친다 — 글자는 가리지 않음(WP2부터 있던 배치, 고치지 않음).
- 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(합치는 쪽이 돌린다). 새 화면 코드는 모두 1차맵·2차맵 지연 조각 안이다(첫 화면 묶음에 더한 import 없음, Assumed: 소스로 확인, 빌드 크기는 재지 않음).

## 사용자 결정 대기
- 질문 570~572(기획 세션, 모양만).
