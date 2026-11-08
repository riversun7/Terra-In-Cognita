# 2차맵 지도 조작: 끌기·누르기 구분, 고른 유닛 따라가기, 확대 단계 표시

- 일시: 2026-11-08 10:45 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/map-input`(시작 main `a366ef2`, 통합 가지 `merge/integration` 06c675c·3b2d4d5를 합침 — 통합자 요청), ADR `docs/adr/2026-11-08-map-input.md`(제안), 질문 `docs/questions/2026-11-08-map-input.md`(720~725), ADR `2026-11-07-gather-objects.md`·`2026-11-07-unit-control.md`·`2026-11-07-planet-view.md`

## 한 일
- 사용자 지적(2026-11-08, NAS 빌드 휴대폰 사진, 원문 "맵조작시 오브젝트가 걸려 드래그가 안되고 계속 오브트가 잘못눌린다." / "화면은 선택된 유닛으로 고정되어야함." / "화면 축소확대배율 표시 없음") 세 가지를 고쳤다.
1. 끌기와 누르기
   - 원인 둘(Verified: 코드): ① 채집 오브젝트·건물 표시가 HTML 단추(`pointer-events: auto`)라 그 위에서 시작한 끌기를 캔버스가 받지 못함. ② 땅 누르기가 누른 칸 둘레 ±2칸(약 29m, 휴대폰 처음 보기 약 160px 네모) 안 오브젝트 판을 열어 유닛을 보내려던 누르기를 빼앗음.
   - 표시는 손가락을 받지 않고(`pointer-events: none`, 단추·포커스·읽는 이름은 그대로), 엔진 누르기 판정 뒤 유닛 → 새 덧그림 층 `tap()`(화면 거리 22px) → 땅 차례로 고른다. 땅 누르기는 건물 칸만 판을 연다. 엔진 조작은 끌기가 누르기 거리(10px)를 넘으면 `onDragStart`를 알린다. 두 손가락은 그대로 누르기가 아니다.
2. 고른 유닛 따라가기: 엔진 `follow()`(새 `camera/cameraGlide.ts`) — 프레임마다 유닛 보간 자리로 목표점이 붙는다(160ms). 끌기·`setView`가 끊고 `onFollowBreak`. 따라가는 동안 확대·회전은 화면 가운데 기준, 끌기 첫 10px는 화면을 움직이지 않는다. 화면 `map/UnitFollow.tsx`(훅 + [따라가기] 단추): 내 유닛·운영자 모드면 따라감, 끊기면 [따라가기](사이 이동과 같은 글·모양). 목록에서 고르면 날아가 따라감, [내 사이보그]는 고른 유닛이 사이보그면 다시 따라감.
3. 확대 단계: 엔진 `camera/secondMapZoom.ts` — 1차맵과 같은 식(거리 한계 로그 다섯 등분), `onZoomStage`·`stats().zoomStage`, `zoomStep`은 단계 대표 거리로 0.3초 미끄러짐(움직이는 중이면 그 목표에서). 사다리 "2차맵 3/5" + 점(새 키 `zoom_caption_local`). D-6018(가장 멀리에서 [−] = 1차맵 5단계) 그대로.
- 표시 보이기(가까이·가운데 40개)는 그대로 두고 ADR에 이유를 적었다(질문 720).
- 통합 가지 합치기(통합자 요청, 합치기 커밋만 — 리베이스 없음): 06c675c(건물 모델·옆 2차맵 이동·NPC 정부 판) → 3b2d4d5(채집소 판·반경 고리).
  - 충돌: `docs/PLAN.md` 14장 줄(둘 다), `docs/WORKLOG.md`(다시 만듦), `gather/gatherState.ts`(채집소 `StationRing`·`setRing` + 땅 누르기는 건물 칸만 — 통합 쪽 `tapCell`의 오브젝트 둘레 잡기는 넣지 않음), `gather/gatherOverlay.ts`(반경 고리 `ring.place` + 표시 자리 `hits`).
  - 누르기 차례가 합쳐져 유닛 → 덧그림 표시(화면 거리) → 건물 모델(조각 상자, 건물 모델 줄기) → 땅. 끌기는 누르기가 아니라 건물 판도 열리지 않는다.
- 화면 시험 고침(통합자 지적: 다른 줄기에서 `unit-control.spec.ts` 33·103행이 땅 누르기가 나무 표시에 걸려 실패):
  - `unit-control.spec.ts`: 땅 누르기 자리를 화면 가운데 둘레 고리(150·110px, 12방향)에서 캔버스 위이고 채집 표시 34px·건물 표시 80px 밖인 곳으로 고른다(`groundOffsets`). 33행은 따라가는 동안 헤드리스 소프트웨어 WebGL이 초당 4~5장이라(엔진 p95 1~3ms, 나머지는 GPU 프로세스 그리기 — Verified: 임시 측정 시험) 사진을 찍는 사이 사이보그가 닿아 [멈추기]가 사라졌다 → 닿았으면 다시 보내고 바로 멈춘다.
  - `gather.spec.ts`: 표시 누르기는 화면 가운데(사이보그)에서 먼 표시 먼저, 유닛이 골라지면 풀고 다시 잰다. 판에 가린 건물 표시는 지도를 아래로 끌어 다시(최대 6번).
  - `gather-station.spec.ts`(채집소 줄기): 건물 표시 누르기를 표시 자리 마우스 누르기로(표시가 포인터를 받지 않음).
  - `government.spec.ts`는 그대로(단추 누르기가 막히면 `dispatchEvent("click")`로 같은 판을 연다).
- 실험하고 버린 것: 표시에 `will-change: transform`(따라가는 동안 덧그림 판 다시 칠하기를 줄이려고) — 헤드리스에서 초당 프레임이 4.5 → 5.0으로 잴 수 있는 차이가 없어 넣지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/camera/controls.ts`·`controls.test.ts`(새) | 끌기 알림(`onDragStart`), 가운데 붙잡기(`centreLocked`) — 시험 5개(누르기·끌기·두 손가락·붙잡은 동안 떨림·가운데 확대) |
| `packages/engine/src/camera/cameraGlide.ts`·`cameraGlide.test.ts`(새) | 따라가기·확대 미끄러짐(시험 5개) |
| `packages/engine/src/camera/secondMapZoom.ts`·`secondMapZoom.test.ts`(새) | 2차맵 확대 단계 1~5(시험 3개) |
| `packages/engine/src/render/engineLayers.ts` | `EngineLayer.tap`·`EngineLayers.tap` |
| `packages/engine/src/secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts` | 누르기 차례(유닛 → 층 → 땅), `follow`·`onFollowBreak`·`onZoomStage`·`stats().zoomStage/following`, `zoomStep` 단계식, 빈 엔진 |
| `apps/game/src/map/gather/gatherOverlay.ts`·`gather.css` | 표시 손가락 지나보내기, 층 `tap()`(화면 거리 22px, `pickHit`) |
| `apps/game/src/map/gather/gatherState.ts`·`gatherState.test.ts` | 땅 누르기는 건물 칸만, 시험(표시 고르기 반경) |
| `apps/game/src/map/UnitFollow.tsx`(새) | 따라가기 훅·[따라가기] 단추·따라갈 수 있나(`followableOf`) |
| `apps/game/src/map/ZoomLadder.tsx` | 2차맵 단계·점, `data-stage` |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 위를 잇기(+26줄: 훅·엔진 옵션·목록 고르기·[내 사이보그]·`data-follow`·사다리 단계·[따라가기]) |
| `apps/game/messages/ko.json`·`en.json` | `zoom_caption_local` |
| `e2e/map-input.spec.ts`(새) | 표시 위 끌기·짧은 누르기, 따라가기·끊기·[따라가기], 사다리, 사진 390 × 파스텔·다크 × ko·en |
| `e2e/gather.spec.ts` | 표시 누르기 도우미: 표시 가운데 아래가 캔버스인 것을 마우스로 누름(표시가 손가락을 받지 않음), 사이보그에서 먼 표시 먼저, 유닛이 골라지면 풀고 다시, 가린 건물 표시는 지도를 끌어내려 다시 |
| `e2e/unit-control.spec.ts` | 땅 누르기는 표시를 피한 빈 땅(`groundOffsets`), 사진 찍는 사이 닿으면 다시 보내고 멈춤 |
| `e2e/gather-station.spec.ts` | 건물 표시를 표시 자리 마우스 누르기로 |
| `apps/game/src/map/gather/gatherState.ts`·`gatherOverlay.ts`(합치기) | 채집소 반경 고리와 표시 화면 거리 고르기를 함께 |
| `docs/adr/2026-11-08-map-input.md`(새), `docs/questions/2026-11-08-map-input.md`(새), `docs/PLAN.md` 14장 줄 | 기록 |

## 함께 바꿔야 하는 파일
- 2차맵 위에 HTML 표시를 새로 놓는 줄기(건물 모습·도시 표시 등)는 표시를 `pointer-events: none`으로 두고 누르기를 그 덧그림 층 `tap()`으로 받는다(`gather/gatherOverlay.ts`가 본보기). 표시를 단추로 받으면 이번 끌기 문제가 다시 생긴다.
- 화면에서 카메라를 옮기는 새 코드(`engine.setView`)는 따라가기를 끊는다(`onFollowBreak` → [따라가기]). 고른 유닛으로 가려면 `setView` 대신 `resumeFollow()`.
- 2차맵 화면 시험에서 채집 표시를 누를 때는 `locator.click()`이 아니라 표시 자리를 `page.mouse.click`(표시가 포인터를 받지 않아 Playwright 누르기 검사가 실패한다).

## 건드리지 말 것
- `planet/zoomStages.ts`(1차맵)는 그대로 — 2차맵 단계는 행성 모듈을 가져오지 않으려고 따로 둔다.

## 검사
- 작업 중: `packages/engine/src/camera` 5파일 39개, `apps/game/src/map` + `packages/engine/src` 560개 통과, 게임 타입 검사·oxlint·biome 통과.
- 화면 시험 `map-input.spec.ts` 7개: 첫 돌림 6 통과·1 실패(시험 잘못 — 지도 둘레 누르기 150px가 오른쪽 가운데 [1차맵] 단추를 눌러 화면이 바뀜 → 110px로) → 그 시험만 다시 1 통과.
- 끝 묶음: 아래 "끝 검사"에 적는다.

## 미검증·TODO·알려진 문제
- 실제 휴대폰 손가락으로는 재지 않았다(헤드리스 시험은 마우스 포인터). 터치 끌기도 같은 엔진 조작이라 같다고 보지만 Assumed. 누르기 거리 10px가 휴대폰에서 알맞은지 Unknown.
- 채집 중인 내 유닛 바로 옆 오브젝트 표시는 유닛이 먼저 골라진다(질문 722).
- 따라가는 동안 끊는 손짓은 끌기·`setView`만(질문 723). 고른 유닛이 이웃 2차맵으로 넘어가면 이 2차맵 목록에서 사라져 고르기가 풀린다(사이 이동 [따라가기]가 맡는다).
- `SecondaryMapScreen.tsx` 662줄·`secondMapEngine.ts` 612줄(600줄 경고, 1,000줄 실패 전). 다음 줄기는 나눈다.

## 사용자 결정 대기
- 질문 720~725(모양만, 답이 없으면 지금 코드).
