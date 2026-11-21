# NPC 자율행동 · AI 1~2단계 구현(7축 성향·조직 합성·충성도 곡선·`/dev/npc-ai` 에디터)

- 일시: 2026-11-20 22:25 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-npc-autonomous-ai.md`, `docs/worklog/2026/11/20-2040-npc-ai-design-plan.md`

## 한 일
- **1단계(데이터 모델 · 7축 분산 공식 · 튜닝 키 · DB 마이그레이션)**:
  - 무손실 양극 7축 성향(`belligerence`, `greed`, `boldness`, `communalism`, `autonomy`, `openness`, `discipline`, `0~1000`, 중립 `500`), 직군별 생성 범위, 체제별·축 성격별(결단 vs 문화) 조직 합성기, 충성도(=만족도, D-253) 연동 개성 개입 곡선 및 AI 작전 합성 함수를 `@terra/shared/unitTraits`로 구현했다.
  - 7축 분산 전략 판단 점수 분해(`explainActions7`), 탐색 온도 선택(`chooseActionWithTemp`), 정책 규칙식(`tradePolicy7`, `foundingChoice7`, `occupationChoice7`, `answerOffer7`, `independenceYes7`, `npcHouseEntryFee7`, `npcRulingVaultReturnPm7`)과 66개 `npc_ai_*` 튜닝 키를 `@terra/sim/npcAi` 및 `content/core/tuning.json`에 추가했다.
  - 교차 검사 `ai_range_order`(11개 최소≤최대 구간)와 `ai_blend_sum`(10개 합=1000‰ 합성 묶음)을 추가하고, 서버 실시간 반영 경로(`SERVER_LIVE_PATHS`)에 66개 키를 등록했다.
  - DB에 `world_units.traits`, `npc_houses.traits_override` 컬럼(모두 nullable `smallint[]`, 길이 7·`0~1000` CHECK)을 추가하고 하위 호환 Drizzle 마이그레이션(`20261121104017_npc_unit_traits`)을 생성했다. `apps/server/src/db/schema.ts`가 1,000줄 상한을 넘어 `tuningOverrides`·`tuningRevision`을 기존 `devToolsSchema.ts`로 옮기고 `schema.ts`에서 재내보내기했다.
- **2단계(`/dev/npc-ai` 에디터 · 공용 `RangeControl` · 서버 판단 실험실 tRPC)**:
  - 공용 양쪽 손잡이 구간 조작 컴포넌트 `RangeControl`(`contentEditorRange.tsx` · `contentEditorRange.css`)을 추가했다(의존성 추가 없음, 포인터·키보드·팩 기본 눈금·`low <= high` 강제).
  - 서버 tRPC 라우터 `npcAi.previewDecision`(`tuning:read` 권한)을 추가해 게임 앱이 `@terra/sim`을 직접 가져오지 않고도 담은 변경값 기반 실제 서버 점수 분해표를 미리 볼 수 있게 했다.
  - `/dev/npc-ai` 5탭 에디터 화면(① 성향 생성·200명 분포 히스토그램·체제별 조직 합성·원클릭 프리셋 3종·충성도 곡선, ② 유닛 일상·순찰·가문 주기·비상 스위치, ③ 국가·가문·도시 전략, ④ 전투·조우·가상 유닛 충성도 작전 미리보기, ⑤ 서버 판단 실험실)을 구현하고 라우트·DevHome·PWA 제외·다국어(ko/en 38키)를 연결했다.
- **검증(Verified)**:
  - 단위 시험 8개 파일 91건 통과(`unitTraits`, `routes`, `effectiveTraits`, `tuning`, `tuningChecks`, `tuningPages`, `npcAiModel`, `trpc/npcAi`).
  - `pnpm typecheck`, `pnpm lint`(0 경고 0 오류), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`(8,522키), `pnpm check:contrast`(746쌍), `pnpm check:content --no-compat`(`core@125`), `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 gzip 110,484 B / 상한 131,416 B) 모두 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/unitTraits.ts`, `unitTraits.test.ts`, `package.json` | 7축 성향, 직군 생성, 체제별 합성, 충성도 개입 곡선, AI 작전 변환 및 시험 |
| `packages/shared/src/tuning.ts` | `ai_range_order`, `ai_blend_sum` 교차 문제 코드 추가 |
| `packages/shared/src/routes.ts`, `routes.test.ts` | `/dev/npc-ai`(`dev_npc_ai`) 화면 주소 등록 및 표 시험 |
| `packages/sim/src/npc/aiCoefficients.ts`, `effectiveTraits.ts`, `effectiveTraits.test.ts`, `aiIndex.ts`, `package.json` | 7축 계수표, 분산 판단·점수 분해·정책 규칙식 및 `@terra/sim/npcAi` 서브경로 내보내기 |
| `packages/sim/src/tuningNpcAi.ts`, `tuning.ts`, `tuningPages.ts`, `tuningChecks.ts`, `society/coefficients.ts` | 66개 `npc_ai_*` 키, `npc` 페이지 배치, `ai_range_order`·`ai_blend_sum` 교차 검사 |
| `content/core/tuning.json` | 66개 `npc_ai_*` 팩 기본값·범위·설명 추가 |
| `apps/server/src/tuning/scope.ts` | 66개 `npcAi.*` 경로를 서버 실시간 반영 목록에 등록 |
| `apps/server/src/db/schema.ts`, `devToolsSchema.ts`, `houseSchema.ts`, `drizzle/20261121104017_npc_unit_traits/*` | `world_units.traits`, `npc_houses.traits_override` 추가 및 `schema.ts` 1,000줄 상한 정리 |
| `apps/server/src/trpc/npcAi.ts`, `npcAi.test.ts`, `router.ts` | 판단 실험실 `npcAi.previewDecision` tRPC 라우터와 권한·판정 시험 |
| `apps/game/src/editor/content/contentEditorRange.tsx`, `contentEditorRange.css` | 공용 양쪽 손잡이 구간(`RangeControl`) 입력 조작기 |
| `apps/game/src/editor/npcAi/*` | `/dev/npc-ai` 5탭 에디터 화면, 순수 모델·시험, 토큰 기반 스타일 |
| `apps/game/src/editor/DevHome.tsx`, `tuning/tuningMessages.ts`, `shell/routeViews.tsx`, `scope/scopeRoutes.ts`, `sections/ComingSoon.tsx` | `/dev/npc-ai` 라우트·허브 카드·범위 안내·교차 오류 문구 연결 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`, `e2e/dev.spec.ts` | `/dev/npc-ai` 지연 조각 PWA 미리 캐시 제외 및 E2E 도구 목록 갱신 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | `/dev/npc-ai` 및 교차 검증 문구 한·영 동시 추가 |

## 함께 바꿔야 하는 파일
- 3단계 진행 시 `apps/server/src/npc/runtime.ts`, `apps/server/src/world/bots.ts`, `apps/server/src/world/humanPlaces.ts`, `apps/server/src/npc/leaders.ts`에 유닛 8상태 FSM·가문 AI·지도자 순회·`world_units.traits` 영속화를 연결한다.
- 4단계 진행 시 `packages/sim/src/combat/moveAi.ts`와 `apps/server/src/travel/clashDecide.ts`에 7축 작전·충성도 개입률을 연결한다.

## 건드리지 말 것
- 작업 트리에 함께 있는 미커밋 `exp_table` 작업(`apps/game/src/editor/expTable/`, `content/core/exp_table.json` 등)과 `docs/design/` 미러는 건드리지 않는다.
- 이미 생성된 `apps/server/drizzle/20261121104017_npc_unit_traits/` 마이그레이션 파일은 고치지 않는다.

## 미검증·TODO·알려진 문제
- Playwright E2E(`e2e/dev.spec.ts`)와 실제 PostgreSQL 마이그레이션 실행은 아직 돌리지 않음(미실행).
- 3단계(유닛 8상태 FSM · NPC 가문 자율 AI · 지도자 순회 · 2차맵 연결), 4단계(전투 이동 AI · 조우 충성도 작전 연결), 5단계(1차맵 상단/원정 · 180일 D-391 장기 시뮬)는 아직 미착수.

## 사용자 결정 대기
- 3단계(유닛 개별 자율행동 8상태 FSM · NPC 가문 자율 AI · 지도자 순회)를 바로 이어서 구현할지 여부.
