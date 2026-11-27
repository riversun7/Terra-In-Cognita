# 개발자 페이지 경제 흐름 모식도(/dev/economy-flow) 추가

- 일시: 2026-11-26 23:00 (KST)
- 작업 도구: Antigravity
- 관련: `docs/design/40_Systems/44_Economy.md`, `docs/adr/2026-11-15-business-ledger.md`, `docs/adr/2026-11-16-exchange-buildings.md`, `docs/adr/2026-11-21-share-market.md`

## 한 일
- 개발자 허브(`/dev`)의 밸런싱 섹션에 **경제 흐름 모식도(`/dev/economy-flow`)** 도구를 추가했다.
- 게임 전체 경제 주체 8개(중앙은행·발행/소각, 정부·국고, 거래소, 건물·사업장, 유닛, 항구·물류·신전·연구소, 플레이어·가문, 기획 예정 요소)와 20개 돈 흐름 경로를 인터랙티브 SVG 모식도로 구성했다.
- 각 주체별 손익 수식 카드(`매출 − 비용 = 수익 − 세금 → 정산/배당` 등)와 팩(`content/core/tuning.json`, `nation_presets.json`, `necessities.json`)·코드 기본값 45개 항목, 검색 가능한 전체 일람 표를 구현했다.
- `api.tuning.list`를 조회해 라이브 서버에서 덮어쓴 튜닝 값이 있으면 기본값과 함께 표시하고 `/dev/tuning`으로 이동할 수 있게 연결했다.
- `economyFlowData.test.ts`에서 모식도 노드·화살표 무결성과 `tuningId`가 붙은 항목의 팩(`content/core/tuning.json`) 기본값 1:1 일치를 검증했다(**Verified**).
- `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:content --no-compat`, 관련 단위 시험 3개(32 tests), `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle` 모두 통과(**Verified**).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/routes.ts` | `/dev/economy-flow`(`dev_economy_flow`) 주소 추가 |
| `packages/shared/src/routes.test.ts` | 새 개발자 주소 계약 시험 추가 |
| `apps/game/src/sections/ComingSoon.tsx` | 구현된 화면 목록에 `dev_economy_flow` 반영 |
| `apps/game/src/scope/scopeRoutes.ts` | `dev_economy_flow` 범위를 모든 행성 공통으로 등록 |
| `apps/game/src/shell/routeViews.tsx` | `EconomyFlowScreen` 지연 로딩 조각 연결 |
| `apps/game/src/editor/DevHome.tsx` | 개발자 홈 밸런싱 섹션에 경제 흐름 모식도 카드 추가 |
| `apps/game/vite.config.ts` | `[Ee]conomyFlow*.{js,css}`를 PWA 미리 캐시 제외 목록에 추가 |
| `scripts/pwa-build.mjs` | 개발자 전용 조각(`DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`)에 `economyFlow` 추가 |
| `apps/game/messages/ko.json` | 경제 흐름 모식도 한국어 UI 문구 키 42개 추가 |
| `apps/game/messages/en.json` | 경제 흐름 모식도 영어 UI 문구 키 42개 추가 |
| `apps/game/src/editor/economyFlow/economyFlowData.ts` | 8대 경제 주체·20개 흐름·45개 기본값 항목·단위 포맷터 정의 |
| `apps/game/src/editor/economyFlow/EconomyFlowDiagram.tsx` | 주체 선택·흐름 카테고리 필터가 되는 SVG 경제 흐름 모식도 |
| `apps/game/src/editor/economyFlow/EconomyFlowScreen.tsx` | 모식도·손익 수식 카드·전체 기본값 검색 표·라이브 튜닝 동기화 화면 |
| `apps/game/src/editor/economyFlow/economyFlow.css` | 개발자 화면 층(네온 다크·라이트) 토큰 기반 스타일 |
| `apps/game/src/editor/economyFlow/economyFlowData.test.ts` | 모식도 무결성·`content/core/tuning.json` 기본값 일치 단위 시험 |
| `docs/worklog/2026/11/26-2300-dev-economy-flow.md` | 작업 기록 추가 |
| `docs/WORKLOG.md` | `pnpm docs:index`로 목차 갱신 |

## 함께 바꿔야 하는 파일
- `content/core/tuning.json`의 경제 관련 기본값을 바꾸면 `apps/game/src/editor/economyFlow/economyFlowData.ts`의 `packValue`와 기본값 설명도 함께 맞춘다(`economyFlowData.test.ts`가 불일치를 감지한다).

## 건드리지 말 것
- `apps/game/src/editor/economyFlow/`는 `@terra/sim`이나 Node 내장 모듈을 import하지 않는다(모듈 경계 규칙).
- `apps/game/vite.config.ts`와 `scripts/pwa-build.mjs`의 `[Ee]conomyFlow` 제외 규칙을 지우지 않는다(일반 플레이어 PWA 미리 캐시 방지).

## 미검증·TODO·알려진 문제
- 실제 브라우저에서 화면 렌더링과 SVG 라벨 겹침 육안 확인은 미실행(단위 시험·빌드·PWA·대비 검사만 통과).
- 은행 예금·담보 대출, 국가 채권, 유닛/운송 경매장, 필지 토지세, 테라코인 동시호가는 기획(`44_Economy.md`) 기준으로 "기획 예정" 카드에 표시해 두었으며, 추후 구현 시 `status`와 실제 `tuningId`를 연결한다.

## 사용자 결정 대기
- 없음

- 커밋 때(2026-11-27, Claude Code가 대신 확인·커밋): 깨끗한 작업 복사본에서 `pnpm check`·`check-pwa`·`check:bundle` 통과. `e2e/dev.spec.ts`는 개발자 홈 도구 수(21 → 22)와 범위 줄 표(`/dev/economy-flow` = 모든 행성 공통)를 이 화면에 맞춰 고쳐 15개 통과.
