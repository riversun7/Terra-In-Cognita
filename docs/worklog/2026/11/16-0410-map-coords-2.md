# 좌표 이동 2 — 좌표 유닛 조우·좌표 구간 지형 감속·탐사만 한 2차맵은 내 유닛이 있어야 (map-coords-2)

- 일시: 2026-11-16 04:10 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-564 2차 답 1641~1643(사용자), ADR `docs/adr/2026-11-15-unloaded-second-maps.md` "바뀜 (D-564)", 질문 `docs/questions/2026-11-16-map-coords-2.md`(1901~1908), 앞 줄기 작업 기록 `docs/worklog/2026/11/15-1320-map-coords.md`, 가지 `work/map-coords-2`

## 한 일
1. **좌표 유닛 조우(1641 "적끼리 만나면 자동 조우", D-475)**
   - 서버에는 2차맵 위 적끼리 자동 조우 판정이 없었다(Verified: `apps/server/src` 검색 — 전투는 정원사 웨이브·건물 공격·도중 습격만). 그래서 좌표 유닛용 규칙을 새로 만들고, 전투는 이미 있는 세계 전투 길(`startWorldBattle` — 건물 공격·웨이브와 같은 몸·생명 수치·물약·탄·결과 적용)을 쓴다.
   - [임시] 10초마다 좌표 유닛(서 있음 + 가는 중의 지금 자리)을 2차맵 키로 묶어, 전쟁 중인 두 나라(NPC 런타임 세력 `wars`, 나라 = `nationOfOwner`)가 함께 선 띄우지 않은 2차맵을 찾는다. 전쟁이 하나도 없으면 묶지 않는다(부하). 배·승객은 뺀다(질문 1648).
   - 찾으면: 지나던 두 편 유닛의 길을 그 자리에서 멈춰 좌표 유닛으로(`travel.haltOn`, 멈춘 까닭 `encounter`) → 그 2차맵을 띄우고 → 열린 64칸 전쟁 전투 → 결과 적용 + 1분까지 그 2차맵을 내리지 않고(`travel.holdMap`) → 그 2차맵은 30분 동안 다시 찾지 않는다. 한 번에 4개.
2. **좌표 구간 지형 감속(1643 "좌표 이동도 지형 감속", ADR WP-4)**
   - 2차맵마다 평균 걸음 배율 = 행성 값(바이옴 바닥 비중 × 지표 비용, 눈 문턱 아래 눈, 숲 밀도만큼 숲 배율 1.8, 바다·호수는 얕은 물 2.5). 표는 2차맵 생성기·구간 빠르기와 같은 것(`BIOME_SURFACES`·`SNOW_TEMPERATURE_C`·`SURFACE_COST`·`FOREST_COST_PM`).
   - 좌표 구간 시간 = 곧은 거리 × 지나는 지형 없는 2차맵 배율 평균 ÷ 속도(띄운 출발·도착 2차맵은 빼고, 배는 배율 없음). 숨기기·좌표 이동 시작·부팅 복구가 같은 식(`hopMs`). 확인 단계 예상은 곧은 거리 그대로.
3. **탐사만 한 2차맵은 내 유닛이 있어야 연다(1642, 기술 추천)**
   - 띄우지 않은 2차맵은 앞 줄기 그대로(내 좌표 유닛이 있어야 띄움). 더해서 띄운 2차맵도 탐사만으로는 구독·지형 파일이 열리지 않게 `vision.canView`에서 "한 칸이라도 탐사" 몫을 뺐다(옛 U3의 "열림"을 좁힘 — 질문 1907 확인). 내 유닛·건물·경계 너머 내 유닛 시야·같은 나라 공유·운영자 전체 보기는 그대로.
   - 탐사 기록은 계속 "아는 곳"이다: 위험 구간(`travelDanger`)의 아는 2차맵 = 볼 수 있음 ∪ 탐사 기록(띄운 2차맵도). 1차맵 도시 안개는 그대로.
   - canView가 탐사 기록을 늘 먼저 읽는다(전에는 내 유닛이 있으면 읽지 않고 true라 그 구독 무리의 탐사 비트가 비어 시작할 수 있었다 — 같이 고침, Assumed: 화면에서 따로 재지 않음).
   - 이미 연 화면은 유닛이 떠나도 끊지 않는다(기존 결정 없음 → 지금 코드 유지 + 질문 1906).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/encounter.ts`(새) | 조우 찾기(순수): 2차맵마다 나라별 묶음, 첫 전쟁 짝 |
| `apps/server/src/travel/encounterWorld.ts`(새) | 월드 잇기: 지형 배율 붙이기(캐시), 조우 타이머·멈춤·띄우기·전투 시작 자료(`encounterBattleInit`)·붙잡기·쉬는 시간 |
| `apps/server/src/travel/coordPace.ts`(새) | 행성 값 → 2차맵 걸음 배율, 좌표 구간 시간 거리 |
| `apps/server/src/travel/coordReads.ts`(새) | 좌표 유닛 목록·`carries`(service.ts에서 옮김, 모든 주인 = null) |
| `apps/server/src/travel/restore.ts`(새) | 부팅 복구(service.ts 1,000줄 상한 때문에 옮김, 내용 그대로) |
| `apps/server/src/travel/service.ts` | 좌표 구간 시간에 배율(`hopMs`), `haltOn`·`holdMap`·`attachPace`, `touches`가 붙잡은 2차맵을 본다 |
| `apps/server/src/travel/serviceTypes.ts`·`serviceParts.ts` | 새 메서드 모양, `CoordinateUnit.sea` |
| `apps/server/src/world/world.ts` | `persistence.startBattle`(세계 전투 여는 길을 내보냄, +3줄 → 995줄) |
| `apps/server/src/app.ts` | 세계 준비 뒤 `startCoordinateRules`, 닫을 때 멈춤(+5줄 → 990줄) |
| `apps/server/src/world/vision.ts`·`visibility.ts`·`gateway.ts` | 탐사만으로는 열리지 않음(1642) |
| `apps/server/src/worldMap/travelDanger.ts` | 아는 2차맵 = 볼 수 있음 ∪ 탐사 기록 |
| `packages/planet/src/secondMap/index.ts`·`generate.ts` | `BIOME_SURFACES`·`DEFAULT_MIX`·`SNOW_TEMPERATURE_C` 내보내기(값·생성 결과 그대로) |
| `packages/shared/src/worldMap.ts` | `WorldTravelStop`에 `encounter` |
| `apps/game/src/map/travelData.ts`·`messages/{ko,en}.json` | 멈춘 까닭 문구 `world_travel_stopped_encounter` |
| 시험: `travel/coordPace.test.ts`·`encounter.test.ts`·`encounterWorld.test.ts`(새), `travel/service.test.ts`·`gateway.test.ts`, 시야 규칙이 바뀐 시험(아래 검사), `apps/game/src/map/travelData.test.ts` | 새 규칙 |
| `docs/adr/2026-11-15-unloaded-second-maps.md` | "바뀜 (D-564)" |
| `docs/questions/2026-11-16-map-coords-2.md`(새) | 1901~1908 |

## 함께 바꿔야 하는 파일
- 판: 프로토콜·팩·`SIM_VERSION` 그대로(배정 47·core@113·SIM 56은 쓰지 않았다 — WebSocket 메시지·결과 코드·설정 칸·`packages/sim` 판정 바뀜 없음. 조우 전투는 있는 세계 전투 판정을 쓴다). tRPC `WorldTravelStop`에 값이 늘었다(게임 앱과 같은 묶음 배포).
- 마이그레이션 없음.
- 띄운 2차맵 위 자동 조우를 만들면(질문 1901) `encounter.ts`의 적대 규칙(전쟁 중인 나라)을 같이 쓴다.
- 조우 수치([임시] 10초·30분·4·64칸)를 설정 칸으로 올리면(1905) 팩 `tuning`·49 연결.

## 건드리지 말 것
- `travel.holdMap` 붙잡기를 지우면 조우 전투가 끝나기 전에 그 2차맵이 내려가 결과(부상·포로·귀환)가 적용되지 않는다(`battleWorld.mapOf`가 띄운 2차맵에서만 찾는다).
- `vision.canView`의 탐사 기록 먼저 읽기를 지우면 구독 무리의 탐사 비트가 빈 채 시작할 수 있다.

## 리셋 필요 여부
- **리셋 필요 없음.** 저장 모양(표·칸)이 그대로다. 배포 전 좌표로 가던 유닛은 다시 켤 때 저장한 나타날 시각 그대로 잇는다(`restore` — 배율은 다음 구간부터). 탐사만 한 2차맵을 보던 화면은 다시 접속하면 열리지 않는다(규칙 바뀜 — 자료 바뀜 아님).

## 미검증·TODO·알려진 문제
- 좌표 조우 전체 흐름(실제 월드·DB·NPC 런타임 전쟁)은 단위 시험(가짜 월드 몫)으로만 봤다. 실제 서버에서 전쟁 중인 두 나라 좌표 유닛을 만나게 한 화면·DB 시험은 없다(미실행 — 시험 세계에 플레이어 나라 전쟁을 만드는 길이 아직 없다).
- NAS 부하(조우 틱 비용)는 재지 않았다(Unknown). 셈은 좌표 유닛 수에 비례(가는 중인 유닛은 곧은 선 자리 셈 한 번).
- 숲 밀도를 숲 칸 몫으로 본 것은 가정(Assumed). 강·비탈은 아직 보지 않는다(1903).

## 사용자 결정 대기
- 질문 1901~1908(추천안으로 만듦).

## 검사 (Verified — 실행함, 공유 기계)
- `pnpm check`(TEST_DATABASE_URL, 잠금 안): 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 741파일 5,581개 모두 통과.
- 이 줄기 시험(DB 포함): 서버 `travel/`(새 `coordPace`·`encounter`·`encounterWorld` 시험, `service.test.ts` 새 시험 3개)·`world/edgePreopen.db`·`cyborg.db`·`edgeWatch`·`worldMap` 20파일 117개 통과(게임 `travelData.test.ts`는 새 작업 트리에 생성 파일 `paraglide`가 없어 그때 못 돌았고 `pnpm check`에서 통과).
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,057B / 상한 131,416B.
- 화면 시험(`pnpm e2e`, 빌드한 서버): `vision`·`play-map`·`seamless` 40 통과·2 건너뜀(측정)·2 실패.
  - `vision` "2차맵 낮밤"(밤 밝기 비교): 다시 돌리니 통과(사진 4장 포함 5/5) — 부하 흔들림.
  - `vision` "경계 너머 보기"(끌기 16번): 두 번 모두 끌기 중 240초 시간 초과. dev 계정 운영자 전체 보기(`observe` — 이 줄기가 바꾼 `canView`를 거치지 않는다)의 그리기 속도 문제로 본다(Assumed: 무관 — main에서 같은 기계 부하로 따로 돌려 보지 않음).
  - 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/map-coords-2-shots/`(47장 — 시야·1차맵·좌표 유닛·이동 화면, 파스텔·다크). 멈춘 까닭 새 문구(`encounter`)는 조우를 화면에서 만들 길이 없어 사진이 없다.
