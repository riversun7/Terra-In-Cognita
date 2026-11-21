# 건물 티어별 재료 2의 제곱수 밸런스 · 유닛 공통 경험치 테이블 및 시각화 에디터

- 일시: 2026-11-20 13:55 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-20-building-tier-and-exp-table.md`

## 한 일
1. **건물 티어별 요구 재료양 밸런스(`content/core/facilities.json`)**:
   - 기존 레벨 제곱(`L²`: 1·4·9·16·25배) 공식을 유지하고 30개 시설의 `mulPm`을 `1000`으로 통일했다.
   - 티어별 Lv 1 기본 재료 합계를 2의 제곱수 기준으로 정렬해 티어 역전(창고 10t > 중앙창고 100t, 주방 > 제련소·병원 등)을 해소했다:
     - **T0 (2)**: `stockpile`
     - **T1 (4)**: `farm`, `ranch`, `herb_field`, `territory_beacon`
     - **T2 (8)**: `lumber_camp`, `fishing_spot`, `mine`, `lodging`, `storehouse`, `dock`, `logistics_center`
     - **T3 (16)**: `sawmill`, `kiln`, `smelter`, `kitchen`, `workshop`, `city_wall`, `trade_dock`, `shipyard`, 거래소 4종(`goods_exchange`·`fx_exchange`·`unit_exchange`·`stock_exchange`)
     - **T4 (32)**: `hospital`, `temple`, `biotech_lab`, `warehouse`
     - **T5 (64)**: `grand_warehouse`, `government_hall`
   - 상위 레벨(제련소 Lv4+, T4~T5 고레벨)은 철 주괴(`iron_ingot`) 단계로 올라가도록 구성하되 초반 Lv1~2 기본 시설은 목재·석재·판자·벽돌 중심으로 유지했다.
2. **유닛 공통 경험치 테이블(`content/core/exp_table.json`, `core@125`)**:
   - 새 콘텐츠 분류 `exp_table`(Lv 1 → Lv 60, `lv_01`..`lv_59`, 59개 정수 구간)을 추가했다.
   - 기본값은 **Lv 1→50 누적 1,000,000 XP**(채집·NPC 기준 1,500 XP/h × 15h/일 = 22,500 XP/일일 때 약 44.4일, 2~3개월 수명 중 1~2개월 내 도달), **Lv 50→60 구간 합 1,000,000 XP**(1:1 비율, Lv 49→50 57,473 XP에서 Lv 50→51 61,093 XP로 매끄럽게 이어져 Lv 59→60 148,401 XP), **Lv 1→60 총 누적 2,000,000 XP**다.
   - `@terra/shared/expTable`에 순수 정수 계산 함수(`expSpanAt`, `cumulativeExpAt`, `expTableMilestones`, `levelFromTotalExp`, `applyExpGain`, `DEFAULT_EXP_TABLE`)를 두고, 서버 `RosterCatalog` 및 `apps/server/src/roster/cyborgBody.ts`·`preview.ts`가 실효 `exp_table`을 읽도록 연결했다.
   - DB 마이그레이션 `apps/server/drizzle/20261120035817_content_overrides_exp_table/`을 생성해 `content_overrides_category`·`content_retired_ids_category` CHECK 제약에 `'exp_table'`을 추가했다(넓히기만).
3. **개발자 경험치 테이블 에디터 및 시각화(`/dev/exp-table`)**:
   - tRPC `expTable.*`(`list`, `check`, `save`, `history`)와 `apps/server/src/expTableEdit/` 서비스를 추가해 기존 `content_overrides` 덮어쓰기·감사 기록·`tuning.export`·`pnpm tuning:apply` 흐름에 통합했다.
   - 개발자 홈(`/dev`) 밸런싱 구역에 `/dev/exp-table` 화면을 추가했다:
     - 상단 KPI 요약 카드 4종(1→50 누적·도달일, 50→60 구간·비율, 1→60 총 누적·수명 대비, 편집·검증 상태).
     - 곡선 생성기(프리셋 4종 + 목표 누적·지수·상위 비중·가파름 슬라이더 → 정수 일괄 배분) + 활동 속도 시뮬레이터(채집·NPC / 여유 채집 / 훈련 / 전투 + 시간당 XP·활동 시간).
     - 순수 SVG 시각화 차트 3종(유닛 수명 60~90일·1~2개월 목표 띠 대비 도달 기간 차트, 누적 경험치 곡선, 레벨당 필요 경험치 막대 차트 + 역전 경고 강조 + 포커스 레벨 연동).
     - 레벨별 인라인 편집 표(전체/1~50/50~60/변경됨 필터, 팩 대비 증감, 소요 기간, 개별/일괄 되돌리기, 실행 취소, 하단 고정 적용 막대, 최근 바꿈 기록).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/facilities.json` | 30개 시설 건설 재료를 `mulPm = 1000`, T0~T5 2의 제곱수(2·4·8·16·32·64) 기준으로 재조정 |
| `content/core/exp_table.json` | 유닛 공통 경험치 테이블(Lv 1→60, `lv_01`..`lv_59`, 1→50 = 100만, 50→60 = 100만) 신설 |
| `content/core/manifest.json` | 콘텐츠 팩 판 `124` → `125` |
| `packages/shared/src/expTable.ts`, `expTable.test.ts`, `package.json` | 경험치 테이블 공용 타입·상수·순수 정수 계산기·기본표 추가 및 단위 시험 |
| `packages/shared/src/contentEdit.ts`, `routes.ts`, `routes.test.ts` | `exp_table` 덮어쓰기 분류와 `/dev/exp-table` 주소 등록 |
| `packages/content/src/schema/expTable.ts`, `categories.ts`, `index.ts`, `tuningDiff.ts` | `exp_table` 스키마·분류·차이 내보내기 등록 |
| `packages/content/src/validate/expTable.ts`, `expTable.test.ts`, `pack.ts` | `exp_table` 2단계 검증(ID-레벨 짝·중복·1..N 연속성·역전 경고) 추가 |
| `scripts/apply-tuning-diff.mjs` | `pnpm tuning:apply` 대상에 `exp_table.json` 추가 |
| `apps/server/src/db/contentEditSchema.ts`, `drizzle/20261120035817_content_overrides_exp_table/` | `content_overrides`·`content_retired_ids` CHECK 제약에 `'exp_table'` 추가 |
| `apps/server/src/contentEdit/core.ts`, `state.ts` | 실효 팩 상태(`ContentEffective.expTable`)에 `exp_table` 연결 |
| `apps/server/src/roster/catalog.ts`, `cyborgBody.ts`, `preview.ts` | `[임시] 40 * Lv^1.9` 제거하고 실효 `exp_table`에서 구간 경험치를 조회 |
| `apps/server/src/expTableEdit/views.ts`, `services.ts`, `views.test.ts`, `trpc/expTable.ts`, `context.ts`, `createContext.ts`, `router.ts` | `expTable.*` tRPC 조회·검사·저장·이력 API 추가 |
| `apps/server/src/buildingEdit/views.test.ts` | 재조정된 제련소(T3) Lv2·Lv4 재료 기대값 갱신 |
| `apps/game/src/editor/expTable/*` | `/dev/exp-table` 화면, 곡선 생성기·시뮬레이터, SVG 시각화 3종, 레벨별 편집 표, 스타일 및 단위 시험 |
| `apps/game/src/editor/DevHome.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `scope/scopeRoutes.ts` | `/dev/exp-table` 라우트·개발자 홈·범위 줄 연결 |
| `apps/game/messages/ko.json`, `en.json` | `/dev/exp-table` 한국어·영어 UI 문구 추가 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`, `e2e/dev.spec.ts` | 개발자 전용 조각(`[Ee]xpTable`) PWA 미리 캐시 제외 및 E2E 도구 목록(19→20개) 반영 |
| `docs/adr/2026-11-20-building-tier-and-exp-table.md` | 이번 밸런스·경험치 테이블·편집기 결정 ADR 작성 |

## 함께 바꿔야 하는 파일
- `content/core/exp_table.json` 기본표를 바꿀 때는 `packages/shared/src/expTable.ts`의 `DEFAULT_EXP_SPANS`와 함께 맞춰 둔다(`apps/server/src/expTableEdit/views.test.ts`가 일치 여부를 검사한다).
- `exp_table` 분류나 스키마 범위를 바꿀 때는 `packages/shared/src/expTable.ts`, `packages/content/src/schema/expTable.ts`, `apps/server/src/trpc/expTable.ts`를 함께 확인한다.

## 건드리지 말 것
- 생성된 마이그레이션 `apps/server/drizzle/20261120035817_content_overrides_exp_table/migration.sql`은 적용 뒤 수정하지 않는다.
- `content/core/tuning.json`의 `n7_max_level` 기본값(50)은 환생 기본 상한이자 `tuning.db.test.ts` 기준값이므로 임의로 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- **Verified**: `pnpm format:check`, `pnpm typecheck`(전체 8개 꾸러미 + e2e), `pnpm lint`(0 warnings / 0 errors), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`(8,482키), `pnpm check:contrast`(746쌍), `pnpm check:content`(`core@125`), `pnpm build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 JS 110,169 B / 상한 131,416 B), `pnpm test` 단위 시험(전체 705개 파일 + CPU 경합으로 타임아웃 났던 5개 파일 재실행 포함 모두 통과; DB 시험 90개 파일은 로컬 DB 미기동으로 skip).
- **미실행**: PostgreSQL DB 통합 시험(`*.db.test.ts`) 및 Playwright 화면 시험(`e2e/dev.spec.ts`)은 로컬 DB·서버를 띄우지 않아 실행하지 않았다.
- **TODO**: 휴먼·크리쳐 경험치 획득 및 레벨업 런타임이 구현될 때 `@terra/shared/expTable`의 `applyExpGain`과 `contentEdit.effective().expTable`을 바로 연결한다.

## 사용자 결정 대기
- 없음(건물 레벨 제곱 `L²` 유지 및 전용 화면 `/dev/exp-table` 신설 모두 사용자 확인 완료).
