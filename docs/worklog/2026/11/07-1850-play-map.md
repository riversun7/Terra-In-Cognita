# 플레이 흐름 WP2 지도 흐름: 1차맵 도시·국가 표시, 시작 도시를 1차맵에서 고르기, 2차맵을 내 사이보그 자리에서 열기

- 일시: 2026-11-07 18:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md`(새, 상태 제안 — "WP2 지도 흐름" 절), 질문 510~515 `docs/questions/2026-11-07-play-map.md`(새), 기획 60 §4.1(D-6017·D-6018)·§4.3·§7.1(D-6041)·D-515, 가지 `work/play-map`(main `cd2ceda` 위)

## 한 일
- 사용자 지시(2026-11-07 원문 "풀레이 흐름대로 가능하게 제작해라. 사이보그 생성부터 1차맵 기본도시 선택 및 2차맵 진입부터 만들어라. 기본 npc국가 및 기본 건물들 및 도시경제 돌아가게 하자") 중 WP2(지도 흐름). 같이 도는 WP1(세계 씨앗)·WP3(플레이어 생산)·WP4(NPC 경제) 파일은 건드리지 않았다(서버 world.ts·cities.ts·nations.ts·cyborg/service.ts는 읽기만).
- **차이 목록 먼저**(ADR "지금 코드와 기획의 차이"): 도시 단계 자원·기후 "곧", `/map`은 늘 시험 맵·카메라 가운데, 두 지도가 서로의 자리를 모름, 1차맵에 도시·영토 없음.
- **서버(조회만)**: tRPC `world.cities`·`world.myPosition`(`trpc/world.ts` 새, `worldMap/reads.ts` 새). 도시 = `world_cities`(사라진 세력 뺌) + 영토 셈(등급·영향권·껍질) + 행성 값의 그 2차맵 칸(둘레 땅) + 띄운 맵(`loaded`) + 내 시야(`viewable` = 구독과 같은 `canViewSecondMap`). 내 자리 = 사이보그 본체 유닛이 선 띄운 맵·지금 배치 칸(움직이는 중이면 지금 시각). `context.ts`·`createContext.ts`·`app.ts`·`router.ts`는 잇는 줄만.
- **엔진**: 1차맵 덧그림 투영(`packages/engine/src/planet/planetOverlay.ts` 새): 그린 프레임마다 `onOverlay(projector)`(위도·경도 → 화면 점, 지평선 너머 숨김, 보이는 높이 위), `requestFrame()`, `mapKeyAtLatLon`·`latLonOfMapKey`. 엔진 몫은 투영만이고 표시는 화면 DOM이다.
- **1차맵 화면**: 도시 표시(`map/CityOverlay.tsx` 새 — 국가 색 `--color-stat-*` 돌려 쓰기, 시작 도시 네모 점, 22px 안 겹침 = 묶음 "N"·누르면 다가감, 이름표는 떨어져 있을 때만, 영토 껍질 점선·영향권 원), 도시 판(`PlanetCityPanel.tsx` 새: 이름·국가·내 국가·둘레 땅·[들어가기]/까닭), [내 위치], 5단계에서 가운데 2차맵에 들어갈 수 있으면 [이 2차맵으로 들어가기]. 처음 볼 곳 = `?planet-view=` > `?key=` > 내 자리(`planetFocus.ts` 새). 제목 "1차맵 시험" → "1차맵".
- **첫 접속 도시 단계**: 고른 국가의 시작 도시를 1차맵 작은 보기(`start/StartCityMap.tsx` 새, 지연 조각)에서 눌러 고른다. 목록은 그대로 두고 줄마다 땅·기후, 고른 도시는 "주변 자원·기후" 판(`map/LandFacts.tsx`·`landText.ts` 새). "곧" 문구(`start_city_soon`)를 지웠다.
- **2차맵**: 주소 `?key=`(routes `map`·`map_planet` 둘 다). 키가 없으면 내 사이보그 맵, 없으면 띄운 첫 맵(`mapTarget.ts`·`MapTargetGate.tsx` 새). 카메라는 지형이 서면 내 사이보그에 맞춘다(그 맵에 있을 때). 화면의 `S1_TEST_MAP_KEY` 고정을 걷었다. `MapSwitch`는 `?key=`를 그대로 넘긴다. 대시보드 카드·아래 탭은 키 없이 = 내 맵. 제목 "2차맵 시험" → "2차맵".
- 문구 ko·en 26개 더함(`world_*` 18·`start_city_map_*`·`start_city_land_title` 5·`map_resolving`·`map_no_map`·`map_resolve_failed`), 1개 지움, 제목 2개 바꿈.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/worldMap.ts`(새)·`package.json` | 조회 응답 모양 |
| `packages/shared/src/routes.ts`·`routes.test.ts` | `map`·`map_planet`에 `?key=` |
| `apps/server/src/worldMap/reads.ts`(새)·`reads.db.test.ts`(새, DB 1개) | 도시·내 자리 조회 |
| `apps/server/src/trpc/world.ts`(새)·`world.test.ts`(새, 6개), `router.ts`·`context.ts`·`createContext.ts`, `app.ts` | 라우터·맥락·잇기 |
| `packages/engine/src/planet/planetOverlay.ts`(새)·`planetOverlay.test.ts`(새, 7개), `planetEngine.ts`·`planetTypes.ts`·`inertPlanetEngine.ts`·`index.ts` | 덧그림 투영 |
| `apps/game/src/map/CityOverlay.tsx`·`cityOverlay.css`·`PlanetCityPanel.tsx`·`LandFacts.tsx`·`landFacts.css`·`landText.ts`·`planetFocus.ts`·`worldMapData.ts`·`mapTarget.ts`·`MapTargetGate.tsx`·`worldMap.test.ts`(새, 14개) | 1차맵 도시 층·도시 판·둘레 땅·열 맵 고르기 |
| `apps/game/src/map/PlanetMapScreen.tsx`·`planetMap.css`·`SecondaryMapScreen.tsx` | 화면에 잇기 |
| `apps/game/src/start/StartCityMap.tsx`·`startCityMap.css`(새), `placeSteps.tsx`·`StartScreen.tsx`·`start.css` | 시작 도시를 1차맵에서 |
| `apps/game/src/shell/MapSwitch.tsx`·`routeViews.tsx`, `home/cards/MapsCard.tsx` | `?key=` 넘기기·주석 |
| `apps/game/messages/{ko,en}.json` | 문구 |
| `e2e/play-map.spec.ts`(새), `e2e/first-login.spec.ts` | 새 흐름 시험·도시 단계 지도·땅 확인 |
| `docs/adr/2026-11-07-play-flow.md`(새), `docs/questions/2026-11-07-play-map.md`(새), `docs/PLAN.md`(14장 한 줄), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 작업 중(Verified): 새 서버 시험(`trpc/world.test.ts` 6개 + `worldMap/reads.db.test.ts` DB 1개) 통과, 게임·엔진·공용 꾸러미 시험 170파일 1,537개 통과, 게임 앱·서버 타입 검사, oxlint(바꾼 곳) 0건.
- 끝 검사(Verified, 무거운 잠금 안): `TEST_DATABASE_URL=… pnpm check` 통과(포맷·린트·타입·경계·크기·다국어 4,256키·대비 738쌍·콘텐츠 core@46·시험 455파일 3,672개, DB 시험 포함·건너뜀 없음). `pnpm check:docs`는 커밋 뒤(아래).
- 첫 화면 JS(Verified, 화면 시험이 만든 빌드 = 지금 화면 소스): `pnpm check:bundle` 106,074 B / 상한 131,416 B(남음 25,342 B). 같은 날 다른 줄기 기록의 main 값 105,898~105,915 B보다 약 +160 B — `MapSwitch`가 주소 `?key=`를 읽는 몫과 주소 표 두 칸. 1차맵 덧그림·도시 판·시작 도시 지도·둘레 땅은 지연 조각(지도·첫 접속·`StartCityMap`)에만 든다.
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e play-map.spec.ts first-login.spec.ts shell.spec.ts vision.spec.ts`, 빌드한 앱·서버, 헤드리스 Chromium): 48개 통과·1개 건너뜀(측정 시험, `E2E_MEASURE` 없음), 5.9분. 처음 돌림에서는 play-map 8개 중 7개가 실패해 고쳤다: ① 도시 판 둘레 땅이 비었다(서버가 행성 값을 기다리지 않고 첫 조회에 null → 1.5초까지 기다리게), ② 도시 표시가 44px보다 조금 작게 재졌다(반 px 자리 → 정수 px), ③ 이웃 이름표가 점을 가려 누르기를 가로챘다(이름표 pointer-events 끔·이름표 간격 140×52px), ④ 앱 단추의 입술 그림자·눌림 움직임이 표시에 붙었다(끔). 다시 돌려 모두 통과.
  - play-map: 1차맵이 내 자리를 알고(`data-me`) [내 위치]가 있다 → 묶음 표시를 눌러 다가가 도시 판(이름·국가·땅·자원·기후 3줄) → [들어가기] = `/map?key=`(바꾸기, 기록 길이 그대로) → 2차맵이 그 키로 live·`data-focus`(내 사이보그) → [1차맵] = `/map/planet?key=같은 키`. 키 없는 `/map` = `world.myPosition`과 같은 키·`data-focus`. 390·1440 넘침·작은 누르는 곳 없음.
  - first-login: 도시 단계에서 1차맵 작은 보기 ready·도시 표시·고른 도시의 "주변 자원·기후" 3줄·목록 줄의 땅·기후 한 줄, 그 뒤 강하 → 홈 → 2차맵 live(전과 같음). 단계 사진(390 파스텔·다크·정거장 × ko·en, 1440 파스텔·다크 × ko·en). shell(지도 두 개 주소로 열기·초점·전환 바꾸기)·vision(시야·낮밤) 그대로 통과.
  - 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/play-map-shots/` — `play-map-planet-{390-pastel-ko,390-pastel-en,390-dark-ko,390-dark-en,1440-pastel-ko,1440-dark-ko}.png`, `play-map-planet-city-390.png`, `play-map-second-390.png`, `first-login-6-city-*.png`. 390 파스텔 한국어·390 다크 영어·1440 다크 한국어(1차맵 도시 판), 2차맵(내 사이보그가 가운데), 첫 접속 도시 단계 390 파스텔 한국어를 눈으로 봤다(겹침·넘침 없음).

## 함께 바꿔야 하는 파일
- 응답 모양은 `@terra/shared/worldMap` 하나(서버 `worldMap/reads.ts`, 화면 `map/worldMapData.ts`·`CityOverlay.tsx`·`PlanetCityPanel.tsx`·`LandFacts.tsx`·`start/placeSteps.tsx`).
- 국가 색 번호(0~5)는 `worldMapData.ts FACTION_COLORS` ↔ `cityOverlay.css [data-nation]` 여섯 줄.
- 세력 이름은 `worldMap/reads.ts`가 시험 NPC 세력 글자(`cyborg/service.ts FACTION_NAMES`와 같은 글자) + `npc/nations.ts nationName`을 쓴다. WP1이 국가 이름 길을 바꾸면 같이 본다.
- 2차맵 시야 규칙을 바꾸면 `viewable`(같은 `world/visibility.ts canViewSecondMap`)이 따라간다.
- 서버 맥락에 칸 하나(`worldMap`)를 더했다(`trpc/context.ts`·`createContext.ts`·`app.ts`). 다른 줄기가 같은 줄 근처를 고치면 조정자가 합친다.

## 건드리지 말 것
- WP1(`world/world.ts`·`cities.ts`·`npc/nations.ts`·config), WP3(`cyborg/service.ts`·노동·정산·보유·경제 화면), WP4(`npc/runtime.ts`·시장·경제 화면) 파일. 미러 `docs/design/`, 팩.
- 새 WebSocket 메시지는 없다(프로토콜 판 그대로).

## 미검증·TODO·알려진 문제
- 1차맵 ↔ 2차맵 자동 줌 전환(§4.1)은 하지 않았다(단추, 질문 511).
- 도시 표시는 시야로 거르지 않는다(질문 514). 표시가 수백 개가 되면 묶음 계산(O(n²))·안개를 다시 본다(Assumed).
- `?key=`로 연 맵에 내 사이보그가 없으면 카메라는 맵 가운데(질문 515).
- 1차맵 성능 줄(HUD 위 숫자)은 시험 화면 때 그대로 둔다.
- `PlanetMapScreen.tsx` 590줄, `SecondaryMapScreen.tsx` 569줄(600줄 경고 아래), `app.ts` 813줄.
- 휴대폰에서 도시 판 + 조작 판이 화면 아래 절반쯤을 덮는다(아래쪽 도시 표시가 가려질 수 있다). 고른 도시를 판 위로 옮기는 카메라 이동은 하지 않았다.
- 시험 서버(국가 넷, 시험 맵 하나)에서만 봤다. WP1이 국가를 여러 맵에 나눈 뒤의 띄우지 않은 맵 도시·여러 시작 도시 지도 보기는 합친 뒤에 본다(미실행).

## 사용자 결정 대기
- 질문 510~515(모양만, 답이 없으면 지금 코드).
