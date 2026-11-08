# 2차맵 건물 모델(시설 종류별 로우폴리)

- 일시: 2026-11-08 11:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-building-art.md`(제안), 질문 `docs/questions/2026-11-08-building-art.md`(760~763), 가지 `work/building-art`(origin/main `a366ef2`에서), 사용자 지적 2026-11-08 "건물이 너무 단순하게 생김"

## 한 일
- 2차맵 건물을 상자 + 문에서 시설 종류별 로우폴리 모델로 바꿨다(엔진). 시설 16종(창고 넷은 크기만 다른 모델 셋) + 일반 집(모르는 시설·시설 줄 없는 시험 건물·겉모습을 받기 전). 종류마다 모양은 ADR 표.
- 레벨(2부터 덧붙임, 3부터 한 층씩 높아짐), 상태(짓는 중 뼈대·손상/멈춤 어둡게 + 돌 조각·폐허·레벨 올리는 중 비계), 주인 국가 색(깃발·박공 용마루 띠, 1차맵 도시 판과 같은 차례), 밤 창 불빛(용광로·가마 입구는 주황).
- 그리기: 도형(상자·박공·사각뿔·원기둥·원뿔·반구·창문 빛)마다 InstancedMesh 하나, 재질 둘을 모든 건물이 함께 쓴다. 정적이라 목록이 바뀔 때만 쓴다.
- 누르기: 조각마다 세계 경계 상자 ↔ 시선. 건물이 땅보다 앞이면 그 건물 판 안 칸을 `onGroundTap`으로(화면은 지금처럼 그 칸의 건물 판). 지붕을 눌러도 그 건물이 된다.
- 자료: 새 tRPC `facilities.mapLooks`(보는 건물만, 시야 전송과 같은 규칙) + 화면 `buildingLooks.ts`(처음·건물 목록이 바뀌면 0.8초 뒤·30초마다 묻고 엔진 앞에서 겉모습을 붙인다). 프로토콜·팩·SIM·DB 그대로.
- 모양 규칙이 빈 곳은 기본안으로 만들고 질문 760~763에 적었다(공개 범위·깃발 색 기준·레벨 표시·시설 없는 건물).

## 측정
- 빽빽한 도시 64채(시설 16종 돌려 쓰기, Node, three 0.186.1, `BuildingView`): 조각 1,560개, InstancedMesh 7개, 삼각형 24,048개(건물당 약 376), `set` 중앙값 2.0ms(첫 실행 29ms — 목록이 바뀔 때만), 누르기 1번 약 0.11ms.
- 같은 도시를 저장소 밖 임시 화면(Vite + 엔진, 평평한 땅)에서 헤드리스 Chromium(SwiftShader, 390×844, 픽셀 비율 1, 카메라를 계속 옮김)으로 잼. 옛 `buildingView.ts`를 잠깐 되돌려 같은 조건으로 잰 값과 비교:

| | 그리기 호출(장면 전체) | 삼각형(장면 전체) |
|---|---|---|
| 전(상자 + 문), 화면 짧은 변 70m·300m | 3·4 | 35,328 |
| 뒤(건물 모델), 70m·300m | 8·9 | 57,840 |

- 실제 도시 2차맵(화면 시험 `e2e/building-art.spec.ts`, NPC 시작 도시 건물 4~5채 — 행정 건물·창고·농장·벌목장 등, 운영자 모드, 헤드리스): 위 판 "그리기" 390×844 = 14회, 1440×900 = 13~15회(지형·이웃·소품·유닛·건물 도형 모두). 건물 몫은 쓰는 도형 수(이 도시 6~7)이고 전에는 2였다. 옛 판으로 같은 화면은 재지 않았다.

## 화면 시험·검사
- `TEST_DATABASE_URL=… pnpm e2e building-art.spec.ts`: 9개 통과(2.2분) — 시설 겉모습 응답(행정 건물·창고 있음), 건물 표시를 숨기고 그 자리(건물 모델 위)를 캔버스에서 누르면 그 건물 판, 사진 8장(390·1440 × 파스텔·다크 × 낮 11시·밤 22시, 사진에서만 채집 덧그림 표시를 숨김). 처음 두 번은 시험이 틀렸다(운영자 모드 없이 안개라 건물이 안 옴, 표시가 위 판 밑) → 운영자 모드 켜고 도시 칸으로 다시 열기·건물 무리를 화면 가운데로 끌기.
- 사진에서 찾아 고친 것: 마당·밭·벽 없는 헛간을 나무가 뚫고 나왔다 → 건물 판 안 칸에는 소품 모델을 세우지 않는다.
- `TEST_DATABASE_URL=… pnpm check`: 통과(단위 시험 510파일 3,954개). `pnpm check:docs origin/main`: 통과.
- 프레임 시간: 이 컨테이너는 부하 평균 5~9에 소프트웨어 WebGL이라 같은 장면에서 엔진 p95가 0.5~73ms로 흔들려 비교 값으로 쓰지 않았다(Unknown, 휴대폰 확인 필요). 건물은 프레임마다 하는 일이 없고, 늘어난 것은 그리기 호출 +5와 삼각형(64채에 약 +22,500)이다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/buildings/buildingPalette.ts`(새) | 3D 색 표 하나(벽·지붕·소품·국가 색 여섯·창문 낮/밤·상태 색 곱·밤 빛) |
| `packages/engine/src/buildings/buildingLook.ts`(새) | 겉모습 입력·시설 ID → 모델 종류 표·빠진 값 채우기 |
| `packages/engine/src/buildings/buildingParts.ts`(새) | 조각 모양·경계·씨앗 난수, 집·창문·깃발·상자·통나무·돌 조각·뼈대·비계 도우미 |
| `packages/engine/src/buildings/buildingModels.ts`(새)·`buildingKinds.ts`(새) | 상태·판 안 맞추기 / 종류별 몸체(파일 크기로 나눔) |
| `packages/engine/src/buildings/buildingGeometry.ts`(새) | 단위 도형 지오메트리(박공 지붕은 직접 만든 삼각 기둥) |
| `packages/engine/src/buildings/buildingView.ts` | 상자 그리기 → 도형별 인스턴싱·재질(몸 밤 빛 + 창문 빛)·누르기 |
| `packages/engine/src/buildings/footprint.ts`(+시험) | `BuildingFootprint.look`(선택), `footprintMask`(차지한 칸 표) |
| `packages/engine/src/picking.ts` | `rayBoxDistance`(slab) |
| `packages/engine/src/props/propView.ts` | `setBlocked`: 건물 판 안 칸에는 소품 모델을 세우지 않는다(나무가 마당·밭을 뚫고 나왔다) |
| `packages/engine/src/secondMapEngine.ts` | 누르기 순서(유닛 → 건물 → 땅), 밤 정도를 건물에 |
| `packages/engine/src/index.ts` | `BuildingLook`·`BuildingCondition` 타입 내보내기 |
| `packages/shared/src/mapLooks.ts`(새)·`package.json` | 응답 모양 `MapLooksResponse`, 진입점 `@terra/shared/mapLooks` |
| `apps/server/src/facilities/mapLooks.ts`(새) | 건물 겉모습 셈(상태는 건물 화면과 같은 셈, 시야 거르기) |
| `apps/server/src/facilities/screen.ts`·`appSource.ts` | `mapLooks` 서비스(전체 보기·소유 주체·아는 시야 칸, 주인 → 국가) |
| `apps/server/src/trpc/facilities.ts` | `facilities.mapLooks` 프로시저 |
| `apps/server/src/world/secondMap.ts` | `forEachBuilding`이 `placement`도 준다(시야 칸 셈) |
| `apps/server/src/world/vision.ts` | `buildingCell` 내보내기(시야 전송과 같은 셈) |
| `apps/game/src/map/buildingLooks.ts`(새) | 겉모습 묻기·붙이기(자료 받는 쪽 감싸기), 국가 색 번호 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 네 줄: import·만들기·`gatherSink(looks.sink, …)`·멈추기 |
| 시험: `buildingModels.test.ts`·`buildingView.test.ts`(새)·`picking.test.ts`·`mapLooks.test.ts`(새)·`buildingLooks.test.ts`(새)·`e2e/building-art.spec.ts`(새) | 판 안·결정성·꼭짓점 상한·종류별 조각·레벨·상태·국가 색 / 도형 수·누르기 / slab / 서버 셈·시야 / 화면 묻기 / 화면 시험 |

## 함께 바꿔야 하는 파일
- 시설을 더하면 `buildingLook.ts` `FACILITY_ART`(없으면 일반 집)와 `buildingKinds.ts`(새 모양이면).
- 국가 색 차례를 바꾸면 `apps/game/src/map/cityOverlay.css`(`data-nation`)와 `buildingPalette.ts` `NATION_ACCENTS`를 함께.
- 시야 전송의 건물 규칙(`vision.ts` `buildingVisible`)을 바꾸면 `facilities/mapLooks.ts`의 거르기도.

## 건드리지 말 것
- 건물 판·표시(채집 덧그림 `gather/`)는 그대로다. 엔진은 누른 건물 판 안 칸만 준다.

## 미검증·TODO·알려진 문제
- 휴대폰 프레임 시간(Unknown). 넘치면 먼 거리에서 작은 조각을 빼는 단계를 넣는다(ADR "다시 볼 조건").
- 겉모습을 받기 전 약 1초는 일반 집, 레벨·상태 바뀜은 최대 30초 늦다.
- 넓은 바닥 판(시설 바닥 = 판 전체)이 도시에서 서로 붙어 보일 수 있다.

## 사용자 결정 대기
- 질문 760~763(추천대로 만들어 둠).
