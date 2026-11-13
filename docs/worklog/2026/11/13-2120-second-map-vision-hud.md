# 2차맵 시야 밖 오브젝트 가림 및 하단 HUD·정보창 UI 개선

- 일시: 2026-11-13 21:20 (KST)
- 작업 도구: Antigravity
- 관련: 사용자 요청("시야범위 밖의 오브젝트가 지저분하게 보인다", "건물 등 선택시 정보창이 공백이 너무 길게 UI가 엉망이다", "하단바 버튼 4개도 불필요하게 길게 늘어져있다", "전반적으로 UI 개선 필요")

## 한 일
- **시야 밖 오브젝트 가림 (`packages/engine`)**:
  - `fogBits.ts`(`isPlacementExplored`)를 추가해 배치 칸(256²) 기준 32×32 탐사 비트 판정을 공통화함. **Verified**.
  - `PropView`(`propView.ts`)의 `PropSource`에 `explored`를 받고, 안개 모드일 때 미탐사 칸의 나무·바위·땅 잔소품·노두를 세우지 않도록 함. **Verified**(`propView.test.ts`).
  - `NeighbourTerrains`(`neighbourTerrains.ts`)의 `propLayers()`에 이웃 탐사 비트를 포함하고 `isPlacementExplored`를 추가해 이웃 2차맵 소품·건물도 같은 시야 규칙을 따르게 함. **Verified**(`neighbourTerrains.test.ts`).
  - `BuildingView`(`buildingView.ts`)에 `setVisibleCell`을 추가해 발자국 전체가 미탐사 칸인 건물(공유 시야·이웃 포함)은 그리지 않고 누르기(`pick`)에서도 제외함. **Verified**(`buildingView.test.ts`).
  - `SchoolView`(`schoolView.ts`)에 `setExplored`를 추가해 미탐사 칸의 어군을 그리지 않게 함. **Verified**(`schoolView.test.ts`).
  - `secondMapEngine.ts`에서 `setExplored`·`setNeighbourExplored`·`setNeighbours`·`adopt` 시 위 3개 뷰의 시야 상태를 함께 갱신함.
- **2차맵 정보창·하단바·HUD 레이아웃 개선 (`apps/game`)**:
  - `mapHud.css`·`citySheet.css`: 48em 이상 넓은 화면에서 `.map-nav`를 화면 전체 너비로 늘리지 않고 가운데 모인 둥근 플로팅 독(`inline-size: min(26rem, calc(100% - var(--space-6)))`)으로 정리하고, `.map-hud-bottom`·`.map-city`를 그 위로 띄워 겹치지 않게 함.
  - `map.css`·`gather.css`·`unitControl.css`·`nearby.css`·`government.css`: 48em 이상 화면에서 `.map-screen[data-nav="bottom"] .map-hud-bottom`을 왼쪽 열 스택(`min(26rem, 100%)`)으로 맞추고 `.map-hint`·`.gather-panel`·`.map-units`·`.map-peek`·`.map-nearby`·`.gov-sheet`가 화면 끝까지 늘어나 큰 공백이 생기지 않도록 통일함.
  - `GatherPanel.tsx`·`gather.css`: 건물·오브젝트 정보창을 머리줄(`.gather-sheet-head`, 제목 + 소유/남은 수량 알약 배지 `.gather-badge`), 안쪽 구획(`.gather-section`, 안에 있는 유닛), 바닥줄(`.gather-footer`, 선택 유닛 + 액션 버튼)로 재구성해 공백을 줄이고 위계를 뚜렷하게 함.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/terrain/fogBits.ts` | 배치 칸 ↔ 32×32 탐사 비트 판정 공통 도우미 추가 |
| `packages/engine/src/terrain/neighbourTerrains.ts` | 이웃 소품 층 탐사 비트 전달 및 이웃 배치 칸 시야 판정 |
| `packages/engine/src/props/propView.ts` | `PropSource.explored` 기준 미탐사 칸 소품·잔소품 제외 |
| `packages/engine/src/props/schoolView.ts` | 미탐사 칸 어군 그리지 않음 |
| `packages/engine/src/buildings/buildingView.ts` | `setVisibleCell`로 시야 밖 건물 숨김·누르기 제외 |
| `packages/engine/src/secondMapEngine.ts` | `setExplored`·`setNeighbourExplored`·`adopt` 시 소품·건물·어군 시야 동기화 |
| `packages/engine/src/props/propView.test.ts` | `PropView` 시야 필터 단위 시험 추가 |
| `packages/engine/src/buildings/buildingView.test.ts` | `BuildingView.setVisibleCell` 단위 시험 추가 |
| `packages/engine/src/props/schoolView.test.ts` | `SchoolView.setExplored` 단위 시험 추가 |
| `packages/engine/src/terrain/neighbourTerrains.test.ts` | 이웃 소품·시야 판정 단위 시험 추가 |
| `apps/game/src/map/mapHud.css` | 48em 이상 `.map-nav` 가운데 컴팩트 독 + 하단 여백 |
| `apps/game/src/map/map.css` | 48em 이상 `.map-hud-bottom` 왼쪽 열 스택·`.map-hint` 최대 너비 제한 |
| `apps/game/src/map/gather/gather.css` | `.gather-panel`·`.gather-sheet` 너비 제한 및 머리줄·구획·바닥줄 스타일 |
| `apps/game/src/map/gather/GatherPanel.tsx` | 건물·오브젝트 정보창 머리 알약 배지·내부 구획·바닥줄 구조 정리 |
| `apps/game/src/map/unitControl.css` | 48em 이상 `.map-units`·`.map-peek` 왼쪽 열 너비 규칙 통일 |
| `apps/game/src/map/nearby/nearby.css` | 48em 이상 `.map-nearby` 왼쪽 열 너비 규칙 통일 |
| `apps/game/src/map/city/citySheet.css` | 48em 이상 `.map-city` 아래 여백 조정 |
| `apps/game/src/government/government.css` | 48em 이상 독립 `.gov-sheet` 왼쪽 열 너비 규칙 통일 |

## 함께 바꿔야 하는 파일
- `docs/WORKLOG.md` (`node scripts/build-worklog-index.mjs`로 생성)

## 건드리지 말 것
- 1차맵 하단 HUD(`.planet-bottom`)는 이번 열 스택 변경에서 분리되어 있으므로 기존 레이아웃을 유지함.
- `e2e/map-hud.spec.ts`·`e2e/unit-control.spec.ts`의 `.gather-sheet`·`.map-hint`·`.map-nav` 선택자와 `data-*` 속성은 유지해야 함.

## 미검증·TODO·알려진 문제
- Playwright E2E(`e2e/vision.spec.ts`, `e2e/map-hud.spec.ts`)는 로컬 서버·브라우저 실행 없이 정적 검사·단위 시험·빌드만 마침 (**미실행**).
- `@terra/engine`·`@terra/game` 외 서버·심 등 나머지 워크스페이스 테스트는 변경 범위 밖이라 별도 실행하지 않음.

## 사용자 결정 대기
- 없음
