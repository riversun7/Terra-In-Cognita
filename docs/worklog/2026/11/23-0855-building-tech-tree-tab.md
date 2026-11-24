# 건물 편집기(/dev/buildings) 테크트리 시각화 탭 추가 및 UI 개편

- 일시: 2026-11-23 22:25 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-02-building-editor.md`

## 한 일
- `/dev/buildings` 건물 편집기에 `[시설 편집]` / `[테크트리]` 두 탭을 추가하고, 전략 게임형 다크 글래스 레이아웃 시안에 맞춰 UI를 개편했습니다(**Verified**: 타입·린트·단위 시험·빌드).
- **시각화 전용 테크트리 모델**(`apps/game/src/editor/buildings/buildingTechTree.ts`)을 작성했습니다(**Verified**):
  - 스키마 변경 없이 현재 `facilities.json` 실효 항목과 편집기의 담은 변경(`BuildingStage`)을 실시간으로 읽어 테크트리를 구성합니다.
  - 목적별 10개 열(`채집`·`가공`·`제조`·`창고·물류`·`주거`·`정부·행정`·`상업·금융`·`공공·연구`·`교통·항만`·`군사·방어`)로 구분하고, 선행 조건과 Lv1 건설 재료(원자재 vs 가공자재)의 위상 깊이에 따라 `T0(기초)`부터 아래로 배치합니다.
  - 명시적 선행 조건(실선, 로컬 시안 표 `TECH_TREE_DRAFT` — 추후 스키마 확장 시 그대로 교체 가능)과 Lv1 비원자재 건설 재료에서 레시피 산출 시설을 자동 역추적하는 연결선(점선, 토글)을 함께 계산합니다.
  - 둥근 모서리 직각(회로형) 연결선 경로(`buildOrthogonalPath`·`buildSideExitPath`), 카드 한 줄 요약(`summary`), 이름·ID·모듈·재료 검색(`matchesTechQuery`)을 제공합니다.
- **테크트리 시각화 UI & 우측 3D 상세 패널**(`BuildingTechTree.tsx`, `TechTreeInspector.tsx`, `TechTreeIcons.tsx`, `buildingTechTree.css`)을 구현했습니다(**Verified**):
  - **상단 조작 줄**: 아이콘·개수가 붙은 목적별 분류 알약 필터, 실시간 검색창, `[재료 점선]`·`[레벨 체인]` 토글 스위치.
  - **중앙 보드**: 컴팩트 아이소메트릭 건물 카드(썸네일·이름·한 줄 요약·건설 시간·자재 성격·`Lv1~N` 접기/펼치기) + 카드 바로 아래 세로로 붙는 슬림 레벨 알약 체인(`Lv1 → LvN`, 재료 전환·모듈 표시) + `ResizeObserver` 기반 직각 회로형 SVG 화살표.
  - **우측 고정 상세 패널**(`TechTreeInspector.tsx`): 기존 3D 건물 미리보기(`buildingEditorPreview.ts` `BuildingPreview`)를 지연 로딩해 선택한 건물의 실제 3D 모델을 레벨별로 돌려 볼 수 있으며, `Lv1~LvN` 탭·수치 3타일(용량/자리·내구도·모듈)·건설 비용·선행/해금 이동 칩·`[시설 편집에서 열기]` 버튼을 제공합니다.
  - **하단 상태 줄**: 실선/점선 범례, 총 시설·티어·연결선 수, 시안 배지.
- 단위 시험(`buildingTechTree.test.ts` 8건)과 한국어·영어 메시지 키 60쌍을 추가했습니다(**Verified**).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/buildings/buildingTechTree.ts` | 목적별 열 분류, 위상 티어 계산, 명시적 선행 시안·재료 자동 추론, 레벨 체인, 직각 경로·검색 순수 함수 |
| `apps/game/src/editor/buildings/buildingTechTree.test.ts` | 열 분류·티어 계산·담은 변경 반영·레벨 체인·연관 노드·직각 경로·검색 단위 시험 8건 |
| `apps/game/src/editor/buildings/TechTreeIcons.tsx` | 목적별 분류 아이콘, 아이소메트릭 건물 썸네일 SVG, 소형 UI 아이콘 |
| `apps/game/src/editor/buildings/TechTreeInspector.tsx` | 우측 고정 상세 패널(실제 3D `BuildingPreview`, Lv1~N 탭, 수치·모듈·건설 비용·선행/해금 칩) |
| `apps/game/src/editor/buildings/BuildingTechTree.tsx` | 상단 알약 필터·검색·스위치, 직각 SVG 연결선 보드, 슬림 레벨 체인 카드, 하단 범례 줄 |
| `apps/game/src/editor/buildings/buildingTechTree.css` | 다크 글래스 전략 UI 토큰 기반 스타일(네온 다크·라이트 테마 지원) |
| `apps/game/src/editor/buildings/BuildingEditorScreen.tsx` | 공용 `EditorTabs`로 `[시설 편집]`·`[테크트리]` 탭 추가 및 `[시설 편집에서 열기]` 연동 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 건물 편집기 탭 및 테크트리 시각화 문구 키 60쌍 추가 |

## 함께 바꿔야 하는 파일
- 추후 팩 스키마(`packages/content/src/schema/economy.ts`)에 건물 `tier`·`requires`·레벨별 모듈 칸을 추가할 때 `buildingTechTree.ts`의 `TECH_TREE_DRAFT` 조회를 항목 필드 읽기로 교체합니다.
- UI 문구를 고칠 때는 `apps/game/messages/ko.json`과 `apps/game/messages/en.json`을 함께 고칩니다.

## 건드리지 말 것
- `docs/PROTECTED.md` 보호 대상과 `docs/design/` 기획 미러 원본.
- `apps/game/src/editor/buildings/buildingTechTree.css`에는 직접 쓴 색·`px` 값을 넣지 않고 `styles/tokens.css`의 `var(--…)`만 씁니다.

## 미검증·TODO·알려진 문제
- Playwright 화면 시험(`e2e/buildings.spec.ts`)은 미실행.
- 선행 조건(실선)과 레벨별 모듈/차이점은 현재 시각화 전용 로컬 시안(`TECH_TREE_DRAFT`)이며, 추후 스키마 확장 및 편집 기능 추가 예정.

## 사용자 결정 대기
- 없음.
