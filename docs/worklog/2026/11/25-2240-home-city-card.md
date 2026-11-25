# 홈 [도시 활동] 카드: 2차맵에 들어가지 않고 건물 목록·건물 판

- 일시: 2026-11-25 22:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-home-city-card.md`(새로 씀), `2026-10-29-app-shell.md`(홈 카드), `2026-11-15-building-screen.md`(건물 판)

## 한 일

사용자 요청(2026-11-25 "대시보드의 2차맵 없이 빠른 도시활동 메뉴")을 옮겼다. 애매한 네 가지는 물어서 답을 받았다(ADR 표): 건물 팝업 = 2차맵 건물 판 그대로, 명령 = 2차맵과 같은 규칙, 유닛 고르기 = 내 보유 유닛(그 유닛의 2차맵을 보이고 그 유닛이 상호작용), 카드 자리 = 새 카드 + 기존 계정에도 자동 추가.

- **새 홈 카드 `city`(도시 활동, 2×2)**: 기본 카드에서 처리할 일 다음. 이미 카드 구성을 저장한 계정에도 한 번 끼워 넣는다(저장값 `offered`).
- **기준 유닛 고르기 상자**: 내 보유 유닛 전체(사이보그 본체 먼저, 기본 = 사이보그). 고른 유닛이 있는 2차맵을 보인다.
- **탭 네 개**: 건물(기본, 거르기 칩 + 줄)·유닛·자원·정보. 유닛·자원 조회는 탭을 눌러야 보낸다. 주기 타이머 없음(진행 줄이 보이는 동안만 5초).
- **건물 줄 → 건물 판 대화상자**: 2차맵 건물 판(개요·일꾼·창고·장부·지분·관리, 행정 건물은 정부 몫, [들어가기]·[닫기])을 지도 없이 연다. 위 줄에 [2차맵에서 보기]·[경제 화면]. 명령은 2차맵과 같은 WebSocket 명령이고 서버 규칙은 그대로다.
- **명령 뒤 진행 줄**: 대화상자를 닫으면 그 유닛의 줄("○○에 들어가는 중", 방금 끝났으면 결과)을 카드에 보인다.
- **도시가 아닌 2차맵**: 같은 목록 + "도시 밖 지역", 정부 건물을 지으면 새 도시가 되는 곳이면 작은 표시(2차맵으로 가는 링크).
- 프로토콜·DB 변경은 없다.

사용자 요청 2(첫 판을 본 뒤, 같은 날): "1. 유닛 탭에는 npc 유닛들도 보여지며 누르고 상호작용 가능. 2. 자원탭에서는 자원 누르고 채집 기능, 가까운순으로 접근함 3. 정보탭에는 2차맵의 2차원 미니맵" — ADR "바뀜" 9~11.

- **유닛 탭**: 내 유닛 아래에 "주변 유닛"(시야 안 남의 유닛 — NPC 휴먼·경비대·지도자·남의 사이보그, 가까운 차례 60줄까지). 줄을 누르면 2차맵과 같은 한눈 판 대화상자(세력·가문, 지도자 몫, [공격]).
- **자원 탭**: 종류별 줄을 가까운 차례로, 거리(칸)와 [채집]. [채집]은 그 종류의 가장 가까운 캘 수 있는 곳으로 기준 유닛을 보낸다. 진행 줄에 [멈추기]. 홈을 열 때 돌고 있는 채집도 보인다.
- **정보 탭**: 2차맵 미니맵(지형 그림 + 건물·내 유닛·주변 유닛). 사용자 지적 3("유닛위치보다 건물 위치가 잘보이게 해야한다")으로 처음에는 건물 둘레로 당겨 보이고([2차맵 전체 보기] 단추), 건물은 굵은 테두리의 큰 네모로 유닛 점 위에, 남의 유닛 점은 작고 옅게 그린다.
- **서버**: 새 조회 `world.nearbyUnits`(시야 규칙은 한눈 정보와 같다), `MapVision.seer`(시야를 한 번만 세는 묶음 판정), `facilities.mapLooks` 건물 줄에 `rect`(건물 칸 네모).
- 대화상자는 바탕을 눌러도 닫힌다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/shared/src/dashboard.ts`, `dashboard.test.ts` | 카드 `city`, 기본 카드 차례, 자동 추가(`HOME_AUTO_ADD_CARDS`, `parseHome`이 끼우고 `mergeHome`이 `offered`에 적는다) |
| `apps/game/src/home/cards/CityCard.tsx` | 카드 몸: 기준 유닛 고르기, 있는 곳 줄, 탭, 조회 고르기, 진행 줄, 대화상자 열기 |
| `apps/game/src/home/city/cityCardData.ts`, `cityCardData.test.ts` | 순수 도우미: 유닛 고르기, 건물 줄·거르기, 정부 건물 건설 가능, 자원 세기, 진행 줄 고르기 |
| `apps/game/src/home/city/useCityQuery.ts` | 열쇠 하나에 조회 하나(열쇠 null이면 묻지 않음), 조회 함수들 |
| `apps/game/src/home/city/CityPanels.tsx` | 탭 몸 넷(건물·유닛·자원·정보) |
| `apps/game/src/home/city/CityBuildingDialog.tsx` | 건물 판 대화상자(지연 조각 — 2차맵 건물 판·정부 판을 건물을 누를 때 받는다) |
| `apps/game/src/home/city/cityCard.css`, `cityDialog.css` | 카드·대화상자 모양(토큰만) |
| `apps/game/src/home/cards/registry.tsx`, `icons.tsx` | 카드 등록, 머리 아이콘 |
| `apps/game/messages/{ko,en}.json` | 문구 30쌍(`card_city`, `home_city_*`) |
| `apps/game/src/home/homeRender.test.ts`, `edit/reorder.test.ts` | 카드 수 9 → 10 |
| `packages/shared/src/mapUnits.ts` | `NearbyUnit`·`NearbyUnitsResponse`·`NEARBY_UNITS_MAX` |
| `packages/shared/src/mapLooks.ts`, `apps/server/src/facilities/mapLooks.ts`(+ 시험) | 건물 줄 `rect` |
| `apps/server/src/world/vision.ts`, `visionShare.test.ts` | `MapVision.seer`(= `sees`와 같은 답인지 시험) |
| `apps/server/src/worldMap/mapUnits.ts`(+ 시험), `reads.ts`, `apps/server/src/trpc/world.ts`, `context.ts` | `world.nearbyUnits` |
| `apps/game/src/home/city/CityUnitDialog.tsx` | 남의 유닛 대화상자(지연 조각 — 한눈 판·지도자 몫·공격) |
| `apps/game/src/home/city/CityMinimap.tsx`, `cityMinimap.ts`, `cityMinimap.test.ts` | 미니맵 캔버스, 지형 → 화소(순수 함수) |
| `e2e/home-city.spec.ts` | 화면 시험(건물 줄 → 대화상자, 탭을 눌러야 받는 조회, 390 두 테마 사진) |
| `docs/adr/2026-11-25-home-city-card.md` | 결정 기록 |

## 함께 바꿔야 하는 파일

- 홈 카드를 더할 때: `dashboard.ts` `HOME_CARDS` → `messages`의 `card_<id>` → `cards/registry.tsx` → `cards/icons.tsx`. 기존 계정에도 넣으려면 `HOME_AUTO_ADD_CARDS`.
- 2차맵 건물 판(`map/gather/GatherPanel.tsx`·`map/building/BuildingPanel.tsx`)의 입력을 바꾸면 `home/city/CityBuildingDialog.tsx`도 본다(지도 없이 같은 판을 쓴다).
- 시설 무리 색을 바꾸면 `map/mapHud.css`와 `home/city/cityCard.css`, 미니맵의 `CityMinimap.tsx` `GROUP_TOKEN` 셋 다(같은 짝을 세 곳에 적었다).
- 남의 유닛을 보는 규칙을 바꾸면 `MapVision.sees`와 `seer` 둘 다(시험 `visionShare.test.ts`가 같은 답인지 본다).
- 2차맵 한눈 판(`map/UnitControlPanels.tsx` `PeekCard`)·`UnitAttack`·`LeaderSheet`의 입력을 바꾸면 `home/city/CityUnitDialog.tsx`도 본다.
- 지형 지표 종류(`@terra/protocol` `TERRAIN_SURFACE`)를 더하면 `cityMinimap.ts`의 색 표에도 더한다(없으면 풀 색).

## 건드리지 말 것

- 카드 ID `city`와 홈 저장값 칸 `offered`: 계정에 남는다. 다른 뜻으로 다시 쓰지 않는다(`docs/PROTECTED.md`).
- `mergeHome`이 카드 목록을 저장할 때 `offered`에 적는 줄: 빼면 유저가 뺀 [도시 활동] 카드가 다시 들어온다.

## 미검증·TODO·알려진 문제

- Verified(`pnpm check`, 작업 트리, 마지막 판): 통과 — 포맷·타입·린트·모듈 경계·파일 크기·다국어(9,617키)·디자인 값·콘텐츠, 단위 시험 6,224개 통과·428개 건너뜀(DB 시험). 첫 판 때는 `packages/planet/src/secondMap/seams.test.ts`가 시간 초과로 한 번 실패했다(바꾸지 않은 꾸러미, 기계 부하 평균 87~106 — 제한 시간만 늘리면 통과). 마지막 실행(부하 46~58)에서는 통과했다. 푸시 전 훅이 같은 시험에서 걸리면 부하가 내린 뒤 다시 돌린다.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): `apps/server/src/worldMap`(DB 시험 포함)·시야 시험 5파일 34개 통과.
- Verified(`pnpm build` → `pnpm check:bundle`): 첫 화면 JS 114,309 B / 상한 131,416 B(남음 17,107 B). 첫 판 114,104 B에서 +205 B — 지연 조각이 늘어 공용 조각 나눔이 바뀐 몫이다(대화상자 둘은 지연 조각).
- Verified(`pnpm e2e home-city.spec.ts`, 로컬 PostgreSQL 15·설치된 Chrome, 마지막 판): 4개 통과 — 건물 줄 → 건물 판 대화상자, 탭을 눌러야 받는 조회, 주변 유닛 줄 → 한눈 판 대화상자([공격] 단추 보임), [채집] → 진행 줄 → [멈추기], 미니맵(건물 둘레 → 전체 보기), 도시 밖 지역 견본(응답을 고쳐 모양만 봄), 390 파스텔 한국어·다크 영어 사진(카드·건물 판·유닛·자원·정보 탭). 앞선 실행에서는 내 시험의 틀린 단정(건물 판도 유닛·오브젝트를 묻는다)으로 1개 실패 → "닫힌 뒤의 수와 견주기"로 고쳤고, 한 번은 서버가 90초 안에 뜨지 않아 준비 단계에서 멈췄다(부하).
- Verified(로컬 개발 서버 `localhost:5173`, dev 계정, 브라우저 1280·375 폭):
  - 카드가 처리할 일 다음에 뜨고, 행정 건물·창고·벌목장 판이 대화상자로 열린다. [들어가기] → 대화상자가 닫히고 "DevCyborg · 내 사이보그: 벌목장에 들어가는 중".
  - 유닛 탭: 주변 유닛 89 가운데 60줄(이름·경비대·이동 중·거리), 줄을 누르면 한눈 판(세력·가문·[공격] 단추), [닫기]·바탕 누르기로 닫힘. [공격]은 누르지 않았다.
  - 자원 탭: 가까운 차례(활엽수 4칸 → 밭 5칸 …), 밭은 "시설 일꾼만 거둡니다"로 단추 없음. [채집] → "오브젝트로 가는 중 [멈추기]" → 새로고침 뒤에도 "캐는 중" 줄이 보임 → [멈추기] → "채집을 멈췄습니다".
  - 정보 탭: 미니맵이 건물 둘레로 뜨고 건물이 분류 색 네모로 또렷하다. [2차맵 전체 보기]로 전체.
- 미검증: 진짜 도시 밖 2차맵에서의 [정부 건물 건설 가능] 표시(견본 응답·단위 시험만). 유닛이 여럿인 계정의 고르기 상자(로컬·시험 계정은 사이보그 하나). 서버가 띄우지 않은 2차맵 안내 문구. NPC 지도자 줄 → 지도자 몫(로컬 2차맵의 가까운 60줄에 지도자가 없었다 — 서버 시험은 지도자 이름·종류를 본다). [공격] 명령의 결과(있던 `UnitAttack`을 그대로 쓴다). 배에 탄 유닛의 자원 줄(단위 시험만). 시야로 거른 플레이어 계정에서 `world.nearbyUnits`의 비용(시야를 한 번 센다 — 재지 않았다).
- 미실행: 선명·정거장 테마 사진(자동 대비 검사만 — AGENTS 8장), `web-design-guidelines`·`break-ui` 검토.
- 알려진 것: 좁은 화면에서 대화상자가 화면 세로 가운데에 놓인다. 건물 줄에 거리는 아직 없다. 기준 유닛 고르기는 저장하지 않는다. 주변 유닛 목록·미니맵 점은 받은 때의 자리다(주기 조회 없음). 미니맵 지형은 판 표지 없이 묻고 서버의 넘김(307)에 기댄다.
- 작업 트리에 다른 에이전트의 변경(크리쳐 편집기 등)이 함께 있다. `apps/game/messages/{ko,en}.json`에는 그쪽 키도 섞여 있다(내 키 = `card_city`·`home_city_*` 46쌍) — 커밋할 때 본다.

## 사용자 결정 대기

- 없음(첫 판의 물음 "유닛 탭에 시야 안 남의 유닛도 보일지"는 사용자 요청 2로 정해졌다 — 보인다).
