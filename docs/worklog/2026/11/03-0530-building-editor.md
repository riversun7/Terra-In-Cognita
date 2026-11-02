# 건물 편집기(/dev/buildings)와 건설 재료 레벨 구간(D-508)

- 일시: 2026-11-03 05:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-02-building-editor.md`(새), `docs/adr/2026-10-31-economy-core.md` "바뀜 (… D-508 …)", 질문 `docs/questions/2026-11-02-gather-tier.md` 끝 절, 기획 D-508·49 M14(미러 `a239a59`), 가지 `work/building-editor`

## 한 일
- 옛 관리자 건물 편집기(AntiGravt01 `0ea5299` `terra-client/src/app/admin/editor/buildings/page.tsx`)와 옛 시드(`seeds/building_seed.js`)·옛 판자·벽돌 자료(`database_init/schema.js` 3170~3310줄)를 읽고, 우리 자료에 있는 칸만 옮겼다(ADR 5절 표, 안 옮긴 칸 목록 포함).
- 팩 core@31: `facilities.build`를 레벨 구간(`levels: [{from, materials}]`)으로, `maxLevel`(선택) 더함. 출발값 [임시] = 옛 raw를 Lv1 1차 원자재·Lv2부터 가공품으로(ADR 2절 표). 판자·벽돌 아이템, 제재소·가마 시설(꺼짐), 레시피 원목 제재·벽돌 소성(켬, 시설·아이템이 꺼져 세계에 안 나옴) 더함. 설정 칸 M14 여덟 개(시간 kg당 ms·레벨 계수 L1~L5·유지비 ‰·최소).
- 팩 검사(2단계 `validate/facilities.ts`): 구간 차례·최고 레벨·같은 아이템 한 줄·처음 짓기 구간의 꺼진 재료 알림. 식 하나 `@terra/shared/facilityBuild`(비용·시간·유지비, BigInt).
- 덮어쓰기 층에 분류 `facilities`(공용 분류 목록·DB 검사 제약 마이그레이션·내보내기·`pnpm tuning:apply`). 경제 목록·유닛 화면 시설 이름·아이템 편집기 채집 미리 보기가 실효 시설을 읽는다(바로 듦).
- tRPC `buildings.list·check·save·history`, 화면 `/dev/buildings`(시설 표·편집 판·레벨 구간·레벨 표·채집·레시피·담은 변경 막대), 개발자 홈 줄.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/facilityBuild.ts`(새)·`.test.ts` | 건설 비용·시간·유지비 식 하나(49 M14 옛 식), 범위 상수 |
| `packages/shared/src/buildingEditor.ts`(새), `package.json` | 서버·화면 공용 자료 모양·범위·까닭, 내보내기 경로 둘 |
| `packages/shared/src/contentEdit.ts` | `CONTENT_EDIT_CATEGORIES`에 `facilities` |
| `packages/shared/src/routes.ts`·`.test.ts` | 주소 줄 `dev_buildings`(`?facility=`) |
| `packages/content/src/schema/economy.ts` | `build.levels`·`maxLevel` |
| `packages/content/src/validate/facilities.ts`(새)·`.test.ts`, `gather.ts`, `pack.ts` | 건설 재료 검사를 옮기고 구간 규칙 더함 |
| `packages/content/src/tuningDiff.ts`, `scripts/apply-tuning-diff.mjs`·`.test.mjs` | 내보내기·적용 분류 `facilities` |
| `packages/sim/src/tuningBuild.ts`(새), `tuning.ts`, `society/coefficients.ts` | 설정 칸 M14 ↔ 계수표 `facilityBuild`(시뮬은 읽지 않음) |
| `content/core/facilities.json`·`items.json`·`recipes.json`·`tuning.json`·`manifest.json` | 레벨 구간 재료, 제재소·가마, 판자·벽돌, 두 레시피, M14 칸, 판 31 |
| `apps/server/src/db/contentEditSchema.ts`, `drizzle/20261102194948_content_overrides_facilities/` | 분류 검사 제약 넓히기(직전 판 앱은 시설 줄을 잠든 줄로 둔다) |
| `apps/server/src/contentEdit/core.ts`·`state.ts`·`store.ts` | 실효 시설, 분류만으로 최근 바꿈 거르기 |
| `apps/server/src/buildingEdit/`(새: `services.ts`·`views.ts`·시험 둘), `trpc/buildings.ts`(새), `trpc/router.ts`·`context.ts`·`createContext.ts` | tRPC `buildings.*` |
| `apps/server/src/economyView/catalog.ts`, `main.ts`, `roster/catalog.ts`, `itemEdit/services.ts`·`itemEdit.db.test.ts` | 실효 시설을 읽게(경제 목록·이름·채집 미리 보기) |
| `apps/server/src/tuning/scope.ts` | M14 칸 반영 범위 live |
| `apps/game/src/editor/buildings/`(새) | 화면·모델·문구·CSS |
| `apps/game/src/editor/DevHome.tsx`·`devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `messages/{ko,en}.json` | 개발자 홈 줄·지연 화면·문구 129개(ko·en) |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`·`.test.mjs` | 조각 `BuildingEditorScreen-*` 미리 캐시 밖 |
| `e2e/buildings.spec.ts`(새), `e2e/dev.spec.ts` | 화면 시험, 개발자 홈 도구 10줄 |
| `docs/adr/2026-11-02-building-editor.md`(새), `2026-10-31-economy-core.md`, `docs/PLAN.md` 14장, `docs/questions/2026-11-02-gather-tier.md`, `docs/research/2026-11-02-old-primary-production.md` | 결정·상태 기록 |

## 검사·시험 (Verified, 개발 컨테이너)
- `TEST_DATABASE_URL=… pnpm check` 통과, `pnpm check:content main` 통과(4b 기준 `a239a59`, core@31 해시 `ad730c5b27c6`), `pnpm check:contrast` 통과(대비 738쌍, 화면 CSS 51개), `pnpm check:bundle` 통과(첫 화면 JS 105,573 B / 상한 131,416 B — 건물 편집기는 지연 조각이라 첫 화면에는 주소 줄·개발자 홈 문구만), `pnpm settings:cells` 다시 만들어도 바뀜 없음(49 미러 `a239a59` 그대로).
- 새 시험: `facilityBuild.test.ts`(옛 Math.round와 같음·큰 값), `validate/facilities.test.ts`, `buildingEdit/views.test.ts`(화면 JSON = 팩 줄, 범위 = 스키마), `buildingEdit/buildingEdit.db.test.ts`(권한·검사·저장 → 경제 목록·이름 바로 듦·entry_changed·만들기 거절·내보내기·다시 켜도 남음·되돌리기), `buildingModel.test.ts`, `apply-tuning-diff.test.mjs` 시설 칸.
- 화면 시험(`--workers=1`): `e2e/buildings.spec.ts` 11개 통과(53초, 마지막 CSS), `e2e/dev.spec.ts` 12개 통과(개발자 홈 10줄). 사진 `buildings-*` 20장(네온·라이트 × ko·en × 390·1440, 1440은 `VIEWPORTS.desktop`: 편집 판·레벨 표, 390은 시설 표도)과 `dev-home-*` 4장. 사진을 보고 고친 것: 390에서 담은 변경 막대가 하단 탭에 가림(탭 높이만큼 띄움), 시설 표 낱말이 쪼개짐(줄 바꿈 없이 가로로 밈), 고른 줄 표시가 칸마다 세로줄(첫 칸만).
- 시뮬레이터(시드 1): econ16 180일·war16 30일을 이 팩과 "더한 것을 뺀 팩"으로 돌려 본문 줄이 바이트까지 같다(머리·요약의 팩 판·해시만 다름) → `SIM_VERSION` 9 그대로.

## 함께 바꿔야 하는 파일
- 시설 칸을 더하면: `packages/content/src/schema/economy.ts`, `packages/shared/src/buildingEditor.ts`(`FacilityJson`·`FACILITY_LIMITS`), `apps/server/src/buildingEdit/views.ts`(`facilityJsonOf` — 빠지면 저장이 칸을 지운다, `views.test.ts`가 잡는다), 화면 `BuildingDetail.tsx`.
- 건설 식을 바꾸면 `@terra/shared/facilityBuild` 하나만(팩 검사·서버·화면이 같이 쓴다).
- 덮어쓰기 분류를 더하면: `CONTENT_EDIT_CATEGORIES`·`ENTRY_DIFF_CATEGORIES`·`ENTRY_FILES`·`contentEdit/core.ts rawOf`·DB 검사 제약(마이그레이션).

## 건드리지 말 것
- 올라간 마이그레이션은 고치지 않는다(`20261102194948_content_overrides_facilities`).
- 실제 팩은 검사 알림 0이어야 한다(`apps/server/src/content.test.ts`). 위 구간의 꺼진 가공품은 알리지 않게 정했다(ADR 1절).

## 미검증·TODO·알려진 문제
- 짓기·레벨 올림·수리·유지비를 셈하는 곳은 없다(편집기 미리 보기만). 유지비를 무엇으로 내는지 미정.
- 판자·벽돌·제재소·가마는 꺼져 있다. 켜면 econ16 거래 목록이 바뀐다(`SIM_VERSION` 올림 필요) — 켤지 사용자 확인.
- 건물 만들기·지우기, HP·주거·영토·군사·업그레이드 칸은 없다(우리 자료에 없음, 레시피 편집기 없음).
- 아이템·스킬·설정 칸 편집기의 담은 변경 막대도 390px에서 하단 탭 뒤에 걸린다(이 화면만 고쳤다).

## 사용자 결정 대기
- [임시] 값 전부(ADR 2절 출발값 표, 판자·벽돌 시세·티어·무게는 옛 값, 레시피 수량·시간은 옛 값, 제재소·가마 오염 2·4, M14 L4·L5 시간 계수 2500‰).
- 옛 티어 → 시설 레벨 해석(⏳, 49 M14), 판자·벽돌을 켤 때.
