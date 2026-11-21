# 지형 오브젝트 3D 로우폴리 모델 표시 및 2차맵 시험 화면 PC 통합

- 일시: 2026-11-20 00:30 (KST)
- 작업 도구: Antigravity
- 관련: 기획 D-536·D-398, ADR `2026-10-31-second-map-from-planet.md`, ADR `2026-11-07-gather-objects.md`, 작업 기록 `docs/worklog/2026/11/12-2050-terrain-objects.md`

## 한 일
- **지형 오브젝트 3D 로우폴리 미리 보기·썸네일 렌더러(`@terra/engine/propPreview`) 추가**:
  - `packages/engine/src/props/propPreview.ts`, `previewEntry.ts`: 실제 2차맵 엔진과 같은 부품 기하(`propParts.ts` 6종 + 어군 늘인 팔면체)·조형 규칙(`buildShape`·`buildKit`)·고정 낮 빛(`FIXED_SECOND_MAP_LIGHT`)을 써서, 대화형 3D 회전·확대 뷰어(`PropPreview`)와 단일 오프스크린 WebGL 컨텍스트 썸네일 렌더러(`PropThumbnailRenderer`)를 만들었다. 물 위 소품·어군(`fish_school`·`fish_school_big`·`whale_pod`)과 바이옴 바탕(눈·모래·바위·습지·풀·물), 1칸(`5.86m`) 기준 테두리, 변형 씨앗·눈 효과를 지원한다.
  - `packages/engine/src/secondMapEngine.ts`: 카메라 목표 높이를 `groundAt`에서 `unitGroundAt`(물 위면 수면, 땅이면 땅)로 바꿔 심해(`-454m`)·호수 2차맵에서 카메라가 해저로 잠기지 않고 수면 위 빙산·해류·고래 무리를 바로 보도록 고쳤다.
- **14개 바이옴 대표 2차맵 찾기 및 편집 비율 즉석 미리 보기**:
  - `packages/planet/src/secondMap/presets.ts`: 결정적 정수 연산으로 14개 바이옴마다 서로 떨어진 대표 2차맵 후보(최대 8개)를 찾는 `findBiomeMapKeys`·`findBiomeMapKey`를 추가했다(생성기 출력·골든 해시는 변경 없음).
  - `apps/server/src/world/secondMapLab.ts`, `trpc/planetEditor.ts`: `planetEditor.secondMap`에 `{ kind: "biome", biomeId, variant? }`를 더하고, 편집 중인 `map_props` 배열로 월드 행성 2차맵을 즉석 생성해 gzip TCTR2로 돌려주는 `planetEditor.secondMapPreview` 프로시저를 추가했다(2분 유휴 캐시, 캐시·세계 상태 변경 없음). 기기 워커(`secondMapPreviewWork.ts`·`labSource.ts`)도 바이옴 이동과 편집 `map_props` 재생성을 지원한다.
  - `apps/game/src/editor/secondMapLab/labGatherPreview.ts`: 서버 `apps/server/src/gather/terrainObjects.ts`와 같은 결정적 배치 규칙으로 편집 중인 `gather_objects`(`site`·`school`)를 2차맵 3D 화면에 즉시(`setObjectProps`·`setSchools`) 반영하고, 현재 2차맵의 오브젝트별 배치 개수·안쪽 대표 좌표(`[맵에서 찾기]`)를 계산한다.
- **`/dev/terrain-objects`와 `/dev/second-map` PC 2열 통합 화면**:
  - `apps/game/src/editor/secondMapLab/SecondMapLabScreen.tsx`, `TerrainObjectsPanel.tsx`, `PropModelInspector.tsx`, `LabPanel.tsx`, `secondMapLab.css`: 왼쪽에 실시간 3D 2차맵(하단 퀵 툴바: 가까이/보통/넓게·채집/어군 표시·격자·낮밤·과장 ×1~4), 오른쪽에 탭 전환 패널(`[지형 오브젝트 · 3D 모델]` / `[맵 · 조명 · 칸 상세]`)을 한 화면에 합쳤다(PC 전용 전체 화면 `frame: "hidden"`).
  - 모든 오브젝트 행에 3D 로우폴리 썸네일·비율 슬라이더/숫자 입력·현재 맵 배치 수·`[맵에서 찾기]`(카메라 바로 이동, 어군은 실시간 헤엄 위치 추적)를 넣었고, `map_props` 비율 변경 시 같은 2차맵 키에서 카메라를 유지한 채 디바운스(280ms) 재생성으로 즉시 반영된다.
  - `/dev/terrain-objects`(기본 `objects` 탭)와 `/dev/second-map`(기본 `lab` 탭) 두 주소 모두 이 통합 화면을 열며, 개발자 홈(`/dev`)에는 통합 카드 하나로 정리했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/props/propPreview.ts`, `previewEntry.ts`, `propPreview.test.ts`, `packages/engine/package.json` | 2차맵 소품·어군 3D 로우폴리 미리 보기(`PropPreview`)와 단일 컨텍스트 썸네일 렌더러(`PropThumbnailRenderer`) 추가 |
| `packages/engine/src/secondMapEngine.ts` | 물 위(심해·호수) 카메라 목표 높이를 해저 대신 수면(`unitGroundAt`)으로 보정 |
| `packages/planet/src/secondMap/presets.ts`, `index.ts`, `presets.test.ts` | 14개 바이옴 대표 2차맵 후보 찾기(`findBiomeMapKeys`·`findBiomeMapKey`) 추가 |
| `apps/server/src/planetEditor/types.ts`, `trpc/context.ts`, `trpc/planetEditor.ts`, `world/secondMapLab.ts`, `secondMapLab.test.ts`, `planetEditorRouter.test.ts` | 바이옴 이동 타깃 및 편집 `map_props` 즉석 2차맵 미리 보기(`secondMapPreview`) 추가 |
| `apps/game/src/editor/planet/secondMapPreviewProtocol.ts`, `secondMapPreviewWork.ts`, `map/secondMapBuildClient.ts` | 기기 워커 바이옴 타깃·편집 `map_props` 지원 |
| `apps/game/src/editor/secondMapLab/labSource.ts`, `labSource.test.ts`, `labGatherPreview.ts`, `labGatherPreview.test.ts` | 서버·기기 `preview` 경로, `gather_objects`(`site`·`school`) 즉석 미리 보기·현재 맵 개수/안쪽 좌표 요약 |
| `apps/game/src/editor/secondMapLab/PropModelInspector.tsx`, `TerrainObjectsPanel.tsx`, `LabPanel.tsx`, `SecondMapLabScreen.tsx`, `secondMapLab.css` | PC 2열 통합 워크벤치(3D 2차맵 + 3D 모델 인스펙터 + 썸네일·비율 슬라이더·실시간 반영·맵에서 찾기) |
| `packages/shared/src/routes.ts`, `routes.test.ts`, `apps/game/src/shell/routeViews.tsx`, `SideMenu.tsx`, `start/cyborgGate.ts`, `scope/scopeRoutes.ts`, `editor/DevHome.tsx` | `/dev/terrain-objects`·`/dev/second-map` 통합 화면 연결 및 `frame: "hidden"` 전환, 옛 `TerrainObjectsScreen.tsx`·`terrainObjects.css` 제거 |
| `apps/game/messages/{ko,en}.json`, `scripts/pwa-build.mjs`, `e2e/dev.spec.ts`, `e2e/terrain-objects.spec.ts` | 한국어·영어 문구 추가, `propPreview` 개발 전용 소스 규칙 추가, E2E 선택자 갱신 |
| `docs/worklog/2026/11/20-0030-terrain-objects-3d-and-lab-merge.md`, `docs/WORKLOG.md` | 이 작업 기록과 목차 갱신 |

## 함께 바꿔야 하는 파일
- `packages/engine/src/props/propPreview.ts`·`previewEntry.ts`는 개발 전용 조각에만 묶이도록 `scripts/pwa-build.mjs` `DEV_ONLY_SOURCE`에 등록돼 있다.
- `apps/game/src/editor/terrainObjects/terrainObjectsModel.ts`는 `/dev/gather-objects`와 공유하므로 경로를 유지한다(`assets/[Tt]errainObjects*` 제외 규칙).

## 건드리지 말 것
- `packages/planet/src/secondMap/generate.ts`·`placement.ts`의 생성기 출력과 `SECOND_MAP_GENERATOR_VERSION`(1)은 건드리지 않았다.
- `packages/engine/src/secondMapEngine.ts`는 998줄(1,000줄 상한 직전)이므로 추가 코드는 별도 모듈로 둔다.

## 미검증·TODO·알려진 문제
- Chrome(Playwright, PC 1600×960)으로 로컬 서버(`localhost:5173`)에 접속해 `/dev/terrain-objects` 초기 화면(초지 16종 3D 썸네일·3D 모델 인스펙터·2차맵 651소품), 사막 선인장 비율 45→650 실시간 반영(`2131개 → 3920개`, 88ms)과 `[맵에서 찾기]`, 심해 고래 무리 2→10 실시간 반영(`어군 16떼`)과 수면 고래 무리 렌더링, `[맵 · 조명 · 칸 상세]` 탭 및 `/dev/second-map` 주소 호환, 콘솔·페이지 오류 0건을 시각 확인함(Verified).
- 정적 검사(`format:check`, `typecheck`, `lint` 0 경고/오류, `check:boundaries`, `check:size`, `check:i18n`, `check:contrast` 746쌍, `check:content --no-compat`), `vitest run --maxWorkers=2`(706파일 5,526건 통과, DB 통합 시험 90파일은 `TEST_DATABASE_URL` 미설정으로 건너뜀), `@terra/game build` + `check-pwa.mjs` + `check-bundle.mjs`(첫 화면 JS 110,300 B / 상한 131,416 B) 모두 통과 확인함(Verified).
- 전체 Playwright E2E(`e2e/dev.spec.ts`, `e2e/terrain-objects.spec.ts`, `e2e/second-map-lab.spec.ts`)는 미실행.

## 사용자 결정 대기
- 없음.
