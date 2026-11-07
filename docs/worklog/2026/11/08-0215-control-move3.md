# 유닛 조종·이동 후속(기획 답 630~637·610~612)

- 일시: 2026-11-08 02:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-unit-control.md` "바뀜 (기획 답 630~637)", `docs/adr/2026-11-07-play-flow.md` "WP13 이동 3 (control-move3)", 질문 `docs/questions/2026-11-07-unit-control.md`(630~637 넣음, 새 701·702)·`docs/questions/2026-11-07-play-map.md`(610~612 넣음, 새 700·703), 가지 `work/control-move3`(`merge/integration` `9f32385`에서), 기획 커밋 `4de8c68`(D-519 포인터)

## 한 일
기획 정리(D-519 포인터, 사용자 결정 아님)를 넣었다. 630만 바뀐 답, 나머지는 추천대로. 633·634·635는 다음 줄기(파티·쓰러짐/포로 흐름·관리자 화면)라 넣지 않았다.
- 630(바뀐 답): 플레이어 2차맵 카메라 목표점을 내 유닛(엔진의 지금 자리)·내 건물마다의 원 안으로 묶는다(엔진 `setViewArea`·`CameraLimits.area`, 반지름 = 서버가 준 시야 + 여유 [임시], 가장 멀리 줄이기도 가장 큰 원 지름 두 배까지). 내 유닛·건물이 없는 2차맵은 탐사 칸 둘레. 운영자 모드는 자유. 서버 시야 전송은 그대로(이미 시야 밖 남의 유닛·탐사 안 한 칸의 건물을 보내지 않는다 — 코드로 확인).
- 631 다: 운영자 모드를 이 기기에서 기억(`localStorage`, try/catch).
- 632 다: 목록 끝 "다른 곳에 내 유닛 N — 유닛 화면에서 보기"(`world.mapUnits` `elsewhere` = 다른 띄운 2차맵 + 건너뛰는 중, 주체마다 15초 캐시).
- 636 나: 남의 유닛을 누르면 지금 내 시야 안일 때 세력·종류(새 tRPC `world.unitGlance`, `MapVision.sees`, 시야 밖·없는 유닛은 같은 답).
- 637 나: 목록 차례 = 사이보그 본체 먼저 + 유닛 화면 `sortUnits`와 같은 손이 필요한 순(기기가 늘어놓음).
- 610 나: 띄우지 않은 2차맵을 건너뛰던 유닛이 나타날 때 건너뛴 2차맵마다 확률(설정 칸 `travel_raid_*` [임시], 오염이 높을수록)로 굴리고, 났으면 정원사 크리쳐(웨이브 몸)와 넥서스 없는 보통 전투를 빨리감기(@terra/sim `runBattle`) — 지면 부상으로 그 자리에 멈춤(멈춘 까닭 `raided`). 습격 규칙은 앱이 세계가 준비된 뒤 붙인다(`attachRaids`, `world.ts`는 고치지 않음).
- 611 나: 확인 단계 전쟁 위험 = 내 국가와 전쟁 중인 세력의 아는 도시가 선 2차맵 + 아는 2차맵의 그 세력 영토 칸(영토 셈). 문구 "나와 전쟁 중".
- 612 나: 처리할 일 `scout_returned`(제안·결정, 누르면 본 2차맵 지도) + 접속 중 화면 알림(지연 조각 `ScoutWatch`, 가는 정찰이 있을 때만 15초마다 `world.travels`) [들어가기]·[닫기].

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/camera/cameraMath.ts`(+시험) | 카메라 한계에 보기 범위(원 목록), `clampToArea` — 630 |
| `packages/engine/src/secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts` | `setViewArea`(배치 칸 원 → m, 줄이기 상한), 빈 엔진에도 |
| `packages/shared/src/mapUnits.ts` | 목록 응답 `elsewhere`·`view`(`MapViewArea`), 한눈 정보 `MapUnitGlance(Response)` |
| `packages/shared/src/worldMap.ts` | 멈춘 까닭 `raided` |
| `packages/shared/src/inbox.ts` | 처리할 일 종류 `scout_returned`(planned false) |
| `packages/sim/src/gardener/coefficients.ts`·`tuningGardener.ts` | 계수표 칸 `travelRaid*` 넷 + 설정 칸 키(서버만 읽음, 시뮬 출력 같음) |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 `travel_raid_base`·`_pollution_div`·`_max`·`_creatures` [임시], 팩 판 51 |
| `apps/server/src/tuning/scope.ts` | 서버가 쓸 때마다 읽는 칸에 넷 더함 |
| `apps/server/src/world/vision.ts` | `sees(viewer, unitId)` — 시야 전송과 같은 규칙으로 지금 보이는지 |
| `apps/server/src/worldMap/mapUnits.ts`(+시험)·`reads.ts`·`trpc/world.ts`·`trpc/context.ts` | `elsewhere`·`view`·`world.unitGlance`(세력 = 주체 세력 또는 가입 국가, 팩 이름) |
| `apps/server/src/worldMap/travelDanger.ts`(+시험) | 611: 내 국가의 적만, 영토 칸 |
| `apps/server/src/travel/raid.ts`(새, +시험) | 610: 굴림(시드 난수)·습격 전투 시작 자료·빨리감기·부상 |
| `apps/server/src/travel/service.ts`·`serviceTypes.ts`(+시험)·`gateway.test.ts` | 나타날 때 습격 판정, `attachRaids`, 가짜 서비스 칸 |
| `apps/server/src/travel/scoutInbox.ts`(새, +시험)·`inbox/registry.ts`(+시험)·`home/services.ts`·`trpc/createContext.ts` | 612 처리할 일 제공 함수와 이동 서비스 넘기기 |
| `apps/server/src/app.ts` | 세계 준비 뒤 습격 규칙 붙이기(팩 전투 자료·설정 칸·NPC 오염), 처리할 일에 이동 서비스 |
| `apps/game/src/map/cameraArea.ts`(새, +시험)·`useCameraArea.ts`(새) | 630 원 목록·1초마다 엔진에 |
| `apps/game/src/map/operatorMode.ts`(새) | 631 기억 + `useOperatorMode` |
| `apps/game/src/map/useUnitGlance.ts`(새)·`mapUnits.ts`(+시험)·`useMapUnits.ts` | 636 문구, 637 차례, 632 문구·수 |
| `apps/game/src/map/UnitControlPanels.tsx`·`unitControl.css` | 다른 곳 줄 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 훅 연결(597줄 — 600 아래로 운영자 모드 상태를 훅으로 뺌) |
| `apps/game/src/map/ScoutWatch.tsx`(새)·`scoutNotice.ts`(새, +시험)·`scoutWatch.css`(새)·`shell/Shell.tsx` | 612 접속 중 알림(지연 조각) |
| `apps/game/src/map/travelData.ts`(+시험)·`inbox/inboxText.ts` | `raided` 문구, 처리할 일 제목 |
| `apps/game/messages/{ko,en}.json` | 새 문구 11개, 전쟁 위험 문구 "나와 전쟁 중" |
| `e2e/control-move3.spec.ts`(새) | 630·631·632·636·612 화면 시험 + 사진 |
| `e2e/unit-control.spec.ts`·`play-map.spec.ts`·`vision.spec.ts` | 카메라 묶기에 맞춤: 남의 유닛 시험은 건물 원도 비움, 572 다 시험은 고른 곳을 내 사이보그 둘레 안으로, 경계 너머 끌기는 운영자 모드를 켬 |

## 판·마이그레이션
- 팩 core@51(설정 칸 넷). 프로토콜 17 그대로(메시지·결과 코드 없음). `SIM_VERSION` 그대로(계수표에 서버만 읽는 칸 — 시뮬 규칙·출력 그대로). 마이그레이션 없음.

## 검사 (끝에 한 번)
- 작업 중: 서버 `travel/*`·`worldMap/mapUnits`·`travelDanger`·`inbox/registry`·`tuning` 시험, 게임 `map/*`(바꾼 것)·`inbox`, 엔진 `camera`, 시뮬 `tuning` 시험 통과(Verified).
- 화면 시험 `pnpm e2e control-move3.spec.ts unit-control.spec.ts play-map.spec.ts`: 결과는 아래 "끝 검사".
- 사진(390): `control-move3-list-390-{pastel,dark}`(목록 + 다른 곳 줄), `control-move3-scout-notice-390-{pastel,dark}`(정찰 알림) — 눈으로 봄: 넘침 없음, 글 줄바꿈, 위 띠 아래 판.

## 함께 바꿔야 하는 파일
- 엔진 `SecondMapEngine` 인터페이스를 구현하는 곳(`engineParts.ts inertEngine`)에 `setViewArea`가 있어야 한다.
- 처리할 일 종류를 더하면 `inboxText.ts KIND_TITLES`·`messages`·`registry.test.ts`(planned 맞춤)도.
- 설정 칸을 더하면 `tuningGardener.ts`·`content/core/tuning.json`·`tuning/scope.ts`가 함께.

## 건드리지 말 것
- `apps/server/src/world/world.ts`(982줄, 1,000줄 상한) — 습격 규칙은 `app.ts`가 `attachRaids`로 붙인다.
- `apps/game/src/map/mapFeed.ts` — 탐사 비트는 `useCameraArea`의 받는 곳(tap)이 옆에서 듣는다.

## 미검증·TODO·알려진 문제
- 610 습격은 시험 세계(띄운 2차맵 6장이 한 줄)에서 일어나지 않는다(건너뛰기가 없다) — 서버 시험만 본다. 습격 전투 기록·생명 수치는 남지 않는다(질문 700).
- 630 카메라 범위 반지름·줄이기 상한은 화면 값 [임시]. 같은 국가 시야는 범위에 없다(질문 701).
- 612 처리할 일은 돌아온 뒤 10분·서버 다시 켜기에 사라진다(질문 703). 화면 알림은 기기마다 한 번.
- 1차맵에서 고른 곳(`?at=`)이 범위 밖이면 카메라가 가장 가까운 가장자리로 간다(630이 572 다보다 나중 답).

## 사용자 결정 대기
- 없음(확인 대기 질문 700~703은 기획 세션 몫, 모양만).
