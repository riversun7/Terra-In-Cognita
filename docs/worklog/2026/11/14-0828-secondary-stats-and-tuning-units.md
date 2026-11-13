# `/dev/tuning` 시간 단위 편집 UX 및 2차 스탯 전용 에디터(`/dev/secondary-stats`) 구현

- 일시: 2026-11-14 08:28 (KST)
- 작업 도구: Antigravity
- 관련: 계획서(`plan_secondary_stats_and_tuning_units.md`), D-540(`walk_speed` 제외)

## 한 일
- **작업 A — `/dev/tuning` 긴 기간·수명(`ms`) 시간/분/초 단위 편집 UX**:
  - `apps/game/src/editor/tuning/tuningModel.ts`: `DURATION_EDIT_UNITS`, `DURATION_UNIT_MS`, `preferredDurationUnit`, `durationEditBounds`, `canEditDurationInUnit`, `defaultDurationUnitOf`, `msToDurationEdit`, `durationEditToMs`, `checkDurationInput`을 추가해 긴 수명·기간 `ms` 항목(1시간 이상)은 기본 시간(`hours`), 분 단위 항목은 분(`minutes`), 짧은 항목은 초(`seconds`)/`ms`로 편집·표시하고 나눗셈이 나누어떨어지지 않으면 더 정밀한 단위로 fallback 하도록 구현함. 저장 페이로드와 슬라이더·DB 값은 기존 `ms` 정수를 유지. **Verified**(`tuningModel.test.ts` 13/13 통과).
  - `TuningRow.tsx`, `TuningPendingBar.tsx`, `tuningMessages.ts`, `tuningRows.css`, `messages/ko.json`, `messages/en.json`: 행별 단위 전환 알약 버튼(`.tp-unit-switch`, 최소 터치 크기 `--dev-touch-tap`)과 변환 `ms` 보조 미리 보기를 추가하고, E2E 호환을 위해 `.tp-meta`의 `ms` 표기를 유지함. **Verified**(정적 검사·번역 검사·빌드 통과).
- **작업 B — 2차 스탯 전용 에디터(`/dev/secondary-stats`) 구현**:
  - `packages/shared/src/formulaApi.ts`, `apps/server/src/formulas/services.ts`: `FormulaListResponse.growth`(`FormulaGrowthSettings`: `growthPm`, `kMinPm`, `kMaxPm`, `maxLevel`)를 `roster.society.cyborg`에서 실어 전달하도록 확장. **Verified**(`tsc -b`, `oxlint` 통과).
  - `packages/shared/src/secondaryStatsSim.ts`, `packages/shared/src/secondaryStatsSim.test.ts`, `packages/sim/src/combat/secondaryStatsParity.test.ts`: 순수 결정적 2차 스탯 시뮬레이션 모델과 `@terra/sim` `computeSecondary` 1:1 동등성 검증을 추가함(총합 `30·60·100` × 4계열 × 레벨 `1·30·50` × 17개 활성 행 정확 일치). `crit_multiplier` 충돌 방지를 위해 전투 수식 키를 `combat:<id>`로 구분함. **Verified**(`secondaryStatsSim.test.ts` 4/4, `secondaryStatsParity.test.ts` 1/1 통과).
  - `packages/shared/src/routes.ts`, `packages/shared/src/routes.test.ts`, `apps/game/src/shell/routeViews.tsx`, `DevHome.tsx`, `scopeRoutes.ts`, `ComingSoon.tsx`, `BalancePanelScreen.tsx`, `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`: `/dev/secondary-stats` 라우트(`dev_secondary_stats`, `parent: "dev"`, `access: "dev_admin"`, `search: ["target"]`), 지연 로딩 조각, PWA 개발전용 제외 규칙(`[Ss]econdaryStats`), `/dev/balance` 바로가기 링크를 연결함. **Verified**(`routes.test.ts` 26/26, `pwa-build.test.mjs` 19/19, `check-bundle.mjs`, `check-pwa.mjs` 통과).
  - `apps/game/src/editor/secondaryStats/` (`secondaryStatsModel.ts`, `secondaryStatsMessages.ts`, `SecondaryStatEditCard.tsx`, `SecondaryStatsCharts.tsx`, `SecondaryStatsEditorScreen.tsx`, `secondaryStats.css`, `secondaryStatsModel.test.ts`):
    - `walk_speed`(D-540) 제외, 비활성 레거시 행 참고 안내, 가중치/수식 전환 편집 및 `tuning.save`/`tuning.export` 저장 흐름 구현.
    - 초기 스탯 합 프리셋(`30·40·50·60·70·80·100`) + `6~100` 직접 조정 및 계열 프리셋(**물리계·재능계·지능계·균형형 + 커스텀**), 실시간 SVG 그래프 3종(1차 스탯 영향력 & +10 한계효율, 계열별 레벨 성장 곡선, `K` 편차 밴드 & 확률 수확체감 곡선)과 선택 레벨 전체 2차 스탯 비교표(수정 전/후 차이) 구현. **Verified**(`secondaryStatsModel.test.ts` 3/3 통과, 정적 검사·빌드 통과).
  - `e2e/tuning.spec.ts`, `e2e/secondaryStats.spec.ts`, `e2e/dev.spec.ts`: 단위 전환 및 `/dev/secondary-stats` Playwright 스펙 보강(**미실행**: 타입검사·린트만 통과).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/tuning/tuningModel.ts` | `ms` 기간 단위 변환·정밀도 fallback·입력 검증 함수 추가 |
| `apps/game/src/editor/tuning/TuningRow.tsx` | 행별 시간 단위 전환 버튼 및 변환 입력·`ms` 미리 보기 연동 |
| `apps/game/src/editor/tuning/TuningPendingBar.tsx` | 대기 막대 변경값 시간/ms 형식 서식 반영 |
| `apps/game/src/editor/tuning/tuningMessages.ts` | 시간 단위 키(`dev_tuning_duration_*`) 매핑 |
| `apps/game/src/editor/tuning/tuningRows.css` | 단위 전환 버튼 스타일(`.tp-unit-switch`/`.tp-unit-btn`) 추가 |
| `apps/game/src/editor/tuning/tuningModel.test.ts` | 기간 단위 변환 및 fallback 단위 시험 2건 추가 |
| `packages/shared/src/formulaApi.ts` | `FormulaListResponse.growth` 타입 추가 |
| `packages/shared/package.json` | `@terra/shared/secondaryStatsSim` 서브패스 export 등록 |
| `packages/shared/src/secondaryStatsSim.ts` | 2차 스탯 영향력·성장곡선·K밴드·확률체감·비교표 시뮬레이터 모델 |
| `packages/shared/src/secondaryStatsSim.test.ts` | 시뮬레이터 모델 단위 시험 4건 |
| `packages/sim/src/combat/secondaryStatsParity.test.ts` | `secondaryStatsSim` ↔ `@terra/sim` `computeSecondary` 동등성 시험 |
| `apps/server/src/formulas/services.ts` | `formulas.list` 응답에 성장 설정(`growth`) 포함 |
| `packages/shared/src/routes.ts` | `/dev/secondary-stats` 라우트 추가 |
| `packages/shared/src/routes.test.ts` | 주소 표 스냅샷에 `dev_secondary_stats` 반영 |
| `apps/game/src/editor/secondaryStats/*` | 2차 스탯 전용 에디터 UI, SVG 차트 3종·비교표, 모델·CSS·시험 |
| `apps/game/src/editor/DevHome.tsx` | 개발자 홈 도구 목록(19번째)에 2차 스탯 에디터 추가 |
| `apps/game/src/editor/balance/BalancePanelScreen.tsx` | `/dev/secondary-stats` 바로가기 링크 추가 |
| `apps/game/src/shell/routeViews.tsx` | 지연 로딩 라우트 등록 |
| `apps/game/src/sections/ComingSoon.tsx` | 도구 메타데이터 연결 |
| `apps/game/src/scope/scopeRoutes.ts` | `dev_secondary_stats` 범위(`common`) 매핑 |
| `apps/game/vite.config.ts` | `sw.js` 미리 캐시에서 `[Ss]econdaryStats` 제외 |
| `scripts/pwa-build.mjs` | 개발전용 소스·조각 검사에 `secondaryStats` 패턴 등록 |
| `apps/game/messages/ko.json`, `en.json` | 한국어·영어 UI 메시지 키 추가 |
| `e2e/dev.spec.ts`, `e2e/tuning.spec.ts`, `e2e/secondaryStats.spec.ts` | 도구 수(19개), 시간 단위 전환, `/dev/secondary-stats` E2E 스펙 추가 |

## 함께 바꿔야 하는 파일
- `docs/WORKLOG.md` (`node scripts/build-worklog-index.mjs`로 생성)
- `apps/game/src/paraglide/*` (`paraglide-js compile` 자동 생성)

## 건드리지 말 것
- `/dev/balance` 기존 `[가중치 표]`·`[계산식]` 탭 및 `walk_speed`(D-540) 제외 규칙.
- `editor/secondaryStats/`에서 `editor/balance/`·`editor/tuning/`을 직접 import하지 않도록 유지(PWA 첫 화면·공용 조각 분리).

## 미검증·TODO·알려진 문제
- Playwright E2E(`e2e/tuning.spec.ts`, `e2e/secondaryStats.spec.ts`, `e2e/dev.spec.ts`)는 로컬 환경에 `chromium_headless_shell-1243` 및 `TEST_DATABASE_URL` Postgres 인스턴스가 없어 **미실행**(정적 검사·`e2e/tsconfig.json` 타입검사만 통과).
- `apps/server` DB 테스트 78개 파일(5개 `formulas.db.test.ts` 포함)은 `TEST_DATABASE_URL` 부재로 skip됨.
- `vitest run` 전체 실행에서 `apps/server/src/trpc/plugin.test.ts`, `system.test.ts` 2건은 샌드박스 `connect EPERM 127.0.0.1` 제한으로 실패(나머지 593개 파일 4,773개 테스트 통과).

## 사용자 결정 대기
- 없음
