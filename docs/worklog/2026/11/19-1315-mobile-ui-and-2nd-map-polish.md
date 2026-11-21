# 모바일 UI 최적화 및 2차맵 이동 경로·인디케이터·3D 모델 개선

- 일시: 2026-11-19 13:15 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-11-19-path-backtrack-and-corner-pull.md`, `2026-11-15-path-smoothing.md`, `2026-11-11-character-3d.md`, `2026-11-08-building-art.md`

## 한 일
- **수정 1 — 모바일 UI·스탯 창 깨짐 최적화**:
  - `apps/game/src/home/home.css`: 모바일 1칸 카드에서 `.home-primaries`를 2열(`STR·VIT`, `INT·WIS`, `DEX·AGI` 짝 배치, 넓은 카드만 3열)로 바꾸고 약자·숫자에 `white-space: nowrap`을 적용해 `ST/R`, `1/0` 줄바꿈 깨짐을 없앴다. `.home-card-heading` 줄바꿈 문턱을 `8.5em`으로 낮추고 모바일 카드 안쪽 여백·아이콘 크기를 다듬어 카드 머리가 한 줄에 맞고 `.home-stat-tile`(`목록·파티·관리인`)이 가로 한 줄로 정리되게 했다.
  - `apps/game/src/roster/statPairs.css`, `roster.css`, `apps/game/src/cyborg/coreStats.css`, `combatSpecs.css`, `cyborg.css`, `apps/game/src/units/units.css`: 좁은 화면(37.5em 이하)에서 스탯 약자·수치·속성 값이 줄 중간에 깨지지 않게 하고 모바일 여백·전투 스펙 상세 여백·9×6 진형 격자 간격을 최적화했다.
- **수정 2A — 유닛 역행 제거 및 경로 직각 꺾임 개선 (`SIM_VERSION` 62 → 63)**:
  - `packages/sim/src/path/smooth.ts`, `waypoints.ts`: 출발 위치 `from`이 출발 기준 칸 중심과 다를 때 정수 격자선 교차 비교(`sweptAnchorsFromPoint`·`directSegmentPace`)로 다음 꺾이는 칸까지 장애물·비용 손해 없이 곧장 갈 수 있으면 출발 칸 중심으로 되돌아가지 않게 했다. `smoothCellPath`에 2차 모서리 당기기를 추가해 장애물 모서리 뒤 불필요한 L자 직각 꺾임을 줄였다.
  - `docs/adr/2026-11-19-path-backtrack-and-corner-pull.md`, `packages/sim/src/version.ts`: 결정 기록 추가 및 `SIM_VERSION` 63으로 올림.
- **수정 2B — 이동 인디케이터 끊김 해소 및 곡선·셰이더 개선**:
  - `packages/engine/src/units/routePath.ts`, `routeView.ts`, `secondMapEngine.ts`: `setMoveTarget`을 기준 칸 중심(`snapCellCenter`)으로 맞추고, 새 경로가 확정되면 목적지 고리를 경로 끝점(`motion.destination(slot)`)에 고정하고 대기 중 옛 경로 선은 숨겨 선과 목적지 고리 사이 끊김을 원천 제거했다. `drapeRoute`에 이차 베지에 모서리 둥글리기(`cornerRadius = 0.42`, 누적 길이는 원래 꺾인 선 길이와 동기화)를 넣고 `RouteView`에 진행 방향 화살 흐름·부드러운 외곽선·펄스 목적지 고리 셰이더를 적용했다.
- **수정 2C — 2차맵 3D 모델링 보강 (캐릭터·소품·건물 마감)**:
  - `packages/engine/src/characters/characterLayer.ts`, `characterBody.ts`, `characterHead.ts`: `LOD0_MIN_PX`를 `28 → 12`로 낮춰 기본 2차맵 확대에서도 자세한 LOD0 모델이 보이게 했고, LOD0에 목·골반 이음매·허리띠·깃·손/소매 끝단·눈썹·옆머리 입체감을 추가했다(LOD0 ≤ 600, LOD1 ≤ 150 삼각형 예산 유지). LOD1도 두 눈 분리 및 테이퍼 실루엣으로 개선했다.
  - `packages/engine/src/props/propParts.ts`, `propKits.ts`: 나무 줄기(`stem`)를 위로 가늘어지는 테이퍼 원기둥으로 바꾸고, 활엽수·자작나무·침엽수·야자수(방사형 4갈래 잎)·바위·덤불을 보강했다. 풀·갈대·덩굴(`vines`)을 수직 창 모양에서 방사형 포기·낮은 덩굴 수풀로 바꾸고, 웅덩이·갯벌(`disc`)을 윗면이 평평한 기둥으로 바꿔 다면체 각짐을 없앴다(부품 ≤ 8, 삼각형 ≤ 90, 평균 ≤ 45 유지).
  - `packages/engine/src/buildings/buildingParts.ts`, `buildingKindsStorage.ts`: 모든 `house()` 기반 건물에 석재 기단, 박공/모임 지붕 처마 밑 띠, 출입구 상단 차양을 더해 민무늬 박스 느낌을 줄였다(조각 ≤ 160, 꼭짓점 ≤ 8,000 유지).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/home/home.css`, `roster/{roster,statPairs}.css`, `cyborg/{cyborg,coreStats,combatSpecs}.css`, `units/units.css` | 모바일 2열 카드 스탯 깨짐 수정 및 모바일 여백·격자 최적화 |
| `packages/sim/src/path/{smooth,waypoints}.ts`, `{smooth,waypoints}.test.ts`, `version.ts`, `docs/adr/2026-11-19-path-backtrack-and-corner-pull.md` | 출발 칸 중심 역행 제거, 2차 모서리 당기기, `SIM_VERSION` 63 및 ADR 추가 |
| `packages/engine/src/units/{routePath,routeView}.ts`, `routePath.test.ts`, `secondMapEngine.ts` | 이동 인디케이터 끊김 제거, 이차 베지에 모서리 둥글리기, 셰이더 흐름·펄스 고리 |
| `packages/engine/src/characters/{characterLayer,characterBody,characterHead}.ts` | `LOD0_MIN_PX` 하향 및 LOD0/LOD1 캐릭터 3D 실루엣·얼굴·관절 보강 |
| `packages/engine/src/props/{propParts,propKits}.ts` | 테이퍼 줄기, 야자수·활엽수·침엽수·풀·덩굴·웅덩이 모델 보강 |
| `packages/engine/src/buildings/{buildingParts,buildingKindsStorage}.ts` | 공용 `house()` 기단·처마 띠·출입구 차양 추가 및 대규모 창고 조각 상한 맞춤 |
| `docs/worklog/2026/11/19-1315-mobile-ui-and-2nd-map-polish.md`, `docs/WORKLOG.md` | 이 작업 기록과 목차 갱신 |

## 함께 바꿔야 하는 파일
- `packages/sim/src/version.ts`의 `SIM_VERSION` 변경 시 `apps/server/src/config.ts`가 그대로 re-export한다.
- `packages/engine/src/characters/*` 수정 시 삼각형 예산(`characterModel.test.ts`: LOD0 ≤ 600, LOD1 ≤ 150)을 함께 검증해야 한다.
- `packages/engine/src/props/*` 수정 시 부품·삼각형 예산(`propParts.test.ts`: 부품 ≤ 8, 삼각형 ≤ 90, 평균 ≤ 45)을 함께 검증해야 한다.

## 건드리지 말 것
- `docs/adr/2026-11-15-path-smoothing.md` 본문은 확정된 ADR이므로 고치지 않는다.
- `packages/engine/src/secondMapEngine.ts`는 1,000줄 상한 근처(998줄)이므로 추가 로직은 별도 모듈로 분리한다.

## 미검증·TODO·알려진 문제
- Chrome(Playwright) 모바일(390×844)·데스크톱(1280×800) 화면에서 홈 대시보드 스탯 카드, `/cyborg`, 2차맵 이동 인디케이터·캐릭터·소품·건물 렌더링을 시각 확인함(Verified).
- `format:check`, `typecheck`, `lint`(경고/오류 0), `check:boundaries`(결정성 검사 포함), `check:size`, `check:i18n`, `check:contrast`(746쌍), `check:content --no-compat`, `vitest run --maxWorkers=2`, `apps/game build` + `check-pwa.mjs` + `check-bundle.mjs`(첫 화면 JS 110,311 B / 상한 131,416 B) 모두 통과함(Verified, 단 `TEST_DATABASE_URL` 미설정으로 DB 통합 시험은 건너뜀).
- 전체 E2E(`e2e/*.spec.ts`)는 미실행.

## 사용자 결정 대기
- 모바일 UI와 2차맵 개선 결과 검토 후 다음 UI 개편 단계 진행 여부 확인.
