# 크리처 편집기(`/dev/creatures`) 구현 및 구형 도감 91종·이미지 통합

- 일시: 2026-11-08 16:50 (KST)
- 작업 도구: Antigravity
- 관련: 기획서 `41_Time_Units.md` §4~§5, `50_Content_Rules.md` §3~§4, `48_Stats_Formulas.md` §4.3·§5, D-094, D-427, D-494, D-5023~D-5026

## 한 일
- **구형 `AntiGravt01` 91종 도감·이미지 1회성 이관**:
  - 1회성 스크립트 `scripts/oneoff-import-creatures.mjs`(추후 단일 파일만 삭제 가능)로 구형 `creature_seed.js` 91종과 대표 이미지 91개(`.webp`·`.png`)를 `content/core/creatures.json` 및 `apps/game/public/creatures/`로 변환·복사.
  - 이미지 확장자(`.webp`, `.png`, `.jpg` 등)에 구애받지 않도록 `resolveCreatureImageUrl`과 서버 이미지 스캔(`listCreatureImageFiles`)을 구현.
- **구형 + 신규 기획서 통합 스키마(`@terra/content` · `@terra/shared`)**:
  - 불필요한 기원(`origin`) 필드를 제외하고 14개 종족 주분류(`category`) + 다중 태그(`tags`: 성향 6종·세트 7종·자유 태그) 체계로 일원화.
  - 6단계 등급(`common`, `rare`, `epic`, `boss`, `legendary`, `mythic`, D-5025) 및 4단계 크기(`S`, `M`, `L`, `XL` + `giant3Tile` 3타일 거대 판정, D-5023) 적용.
  - 목장 부산물은 제외하고 전투 전리품(`drops`)과 아이템 무기 방식의 고유 무기(`naturalWeapon`: 기준 공격력 `attack` + 랜덤 지급 범위 `min~max`, 추가 스탯 범위 `stats: [{ stat, min, max }]`)를 적용.
- **원본 이미지 위 원형 초상화 영역 선택기(`CreaturePortraitCropper`) & 얼굴 자동 인식**:
  - 별도 크롭 이미지 파일을 복제·생성하지 않고 원본 이미지 위 정규화 원 좌표(`portraitCrop: { cxPm, cyPm, radiusPm }`, 0~1000‰)만 저장해 목록·상세·맵 원형 토큰(`CreatureTokenBadge`)에 투영.
  - 크리처 추가 또는 이미지 선택 시 128×128 캔버스 전경 실루엣 상단 대역 + 윤곽 대비 밀도 분석으로 머리·얼굴 부위를 자동 인식해 원을 맞추고, 드래그·핸들로 연속 미세 조정 가능.
- **특성 기반 6스탯 자동 배분 생성기 & 세트 내 6스탯 분포 분석기(`CreatureStatsTab`)**:
  - 등급 예산·크기·성향·주력/부주력 스탯을 조합해 합계가 예산과 정확히 일치하는 6대 스탯 자동 배분(`allocateCreatureStats`, D-094·D-5024).
  - 같은 종족·등급·세트 태그 집단 내 6스탯 최소·평균·최대 분포 막대 비교(`summarizeCreatureStatDistribution`).
- **실시간 덮어쓰기·내보내기(`tRPC creatures.*`, `ContentEditShared`, `pnpm tuning:apply`)**:
  - DB `content_overrides` / `content_retired_ids`의 `category` 체크 제약에 `'creatures'`를 추가(마이그레이션 `20261108070312_content_overrides_creatures`).
  - `/dev/creatures` 화면(`CreatureEditorScreen`)을 개발자 도구 허브(`DevHome`), 라우터(`routes.ts`, `routeViews.tsx`), PWA 빌드 제외 목록(`vite.config.ts`, `scripts/pwa-build.mjs`)에 연결.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `scripts/oneoff-import-creatures.mjs` | 구형 AntiGravt01 크리처 91종 및 이미지 91개 1회성 변환·복사 스크립트(단독 삭제 가능) |
| `content/core/creatures.json`, `content/core/manifest.json` | 91종 크리처 도감 데이터 추가 및 콘텐츠 팩 버전 `55`로 상향 |
| `apps/game/public/creatures/*` | 크리처 원본 일러스트 91개(`.webp`·`.png`) |
| `packages/content/src/schema/creatures.ts`, `categories.ts`, `tuningDiff.ts`, `index.ts` | `creatures.json` Zod 스키마, 카테고리 등록, 튜닝 diff 내보내기·적용 지원 |
| `scripts/apply-tuning-diff.mjs` | `pnpm tuning:apply`에서 `creatures.json` 덮어쓰기 반영 지원 |
| `packages/shared/src/creatureEditor.ts`, ` creatureEditor.test.ts` | 크리처 편집기 공용 타입, 6스탯 자동 배분, 세트 분포 요약, 고유 무기·전리품 시뮬레이터 및 단위 시험 |
| `packages/shared/src/contentEdit.ts`, `routes.ts`, `routes.test.ts`, `package.json` | `creatures` 편집 카테고리 및 `/dev/creatures`(`dev_creatures`) 라우트 추가 |
| `apps/server/src/db/contentEditSchema.ts`, `drizzle/20261108070312_content_overrides_creatures/migration.sql` | DB 덮어쓰기·은퇴 ID 표에 `creatures` 분류 허용 |
| `apps/server/src/contentEdit/core.ts`, `state.ts` | 서버 콘텐츠 편집 스냅숏·검증에 `creatures` 연결 |
| `apps/server/src/creatureEdit/views.ts`, `views.test.ts`, `services.ts` | 크리처 편집기 뷰 변환(91종 무손실 왕복 시험 포함) 및 `list`/`check`/`save`/`history` 서비스 |
| `apps/server/src/trpc/creatures.ts`, `context.ts`, `createContext.ts`, `router.ts` | `creatures.*` tRPC 프로시저 등록 |
| `apps/game/src/editor/creatures/*` | 크리처 편집기 화면(`CreatureEditorScreen`, `CreatureList`, `CreatureDetail`, `CreaturePortraitCropper`, `CreatureStatsTab`, `CreatureCombatTab`, `CreatureLootTab`, `creatureModel`, `creatureEditor.css`) |
| `apps/game/src/editor/DevHome.tsx`, `devIcons.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx` | 개발자 도구 허브 카드·아이콘·지연 로딩 화면 연결 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`, `scripts/pwa-build.test.mjs` | 개발자 도구 전용 조각(`[Cc]reatureEditor*`) 미리 캐시 제외 규칙 반영 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 한국어·영어 UI 문자열(`shell_route_dev_creatures`, `dev_tool_creatures_desc`) 추가 |

## 함께 바꿔야 하는 파일
- `packages/content/src/schema/creatures.ts`의 필드를 바꿀 때는 `packages/shared/src/creatureEditor.ts`, `apps/server/src/creatureEdit/views.ts`, `apps/game/src/editor/creatures/creatureModel.ts`(`cleanCreature`·`mergeCreature`)를 함께 맞춘다(`apps/server/src/creatureEdit/views.test.ts`가 누락을 잡는다).

## 건드리지 말 것
- 이미 생성된 마이그레이션 `apps/server/drizzle/20261108070312_content_overrides_creatures/migration.sql`은 수정하지 않는다.

## 미검증·TODO·알려진 문제
- Verified: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:content --no-compat`, `packages/shared/src/creatureEditor.test.ts`, `apps/server/src/creatureEdit/views.test.ts`, `scripts/pwa-build.test.mjs`, `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle` 통과.
- 추후 2차맵 야생 스폰·테이밍 런타임 연동 시 `CreatureTokenBadge`의 `portraitCrop` 투영 규격을 공용 맵 토큰 렌더러에서도 그대로 재사용할 수 있다.

## 사용자 결정 대기
- 없음.
