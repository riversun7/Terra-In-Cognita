# 홈 내 사이보그 카드에 아머·쉴드·스태미나 추가 및 회복량·스탯 출처(장비·버프) 팝오버 구현

- 일시: 2026-11-25 23:12 (KST)
- 작업 도구: Antigravity

## 한 일

1. **전투 자원 5종 확장** (`apps/game/src/home/cards/CyborgCard.tsx`, `dashboardPro.css`)
   - 기존 `HP | MP` 2칸 구성을 왼쪽 열(**HP · 아머 · 쉴드**) / 오른쪽 열(**MP · 스태미나**) 2열 구조로 확장했다.
   - `useVitals()`를 연결해 실제 세계 사이보그의 `HP·아머·쉴드` 현재/최대 값과 실시간 분당 회복량을 반영한다.
2. **바이탈 포드 클릭·마우스오버 시 회복량 상세 표시**
   - 5종 포드(`HP·아머·쉴드·MP·스태미나`)에 마우스를 올리거나 클릭하면 현재/최대 값, 분당 회복량(`+N/분` 또는 자동 회복 없음), 버프 보정치를 팝오버로 보여준다.
3. **1차 6스탯 기본·장비·인공장기·버프 구분 표시**
   - `body.primarySources[stat]`를 기본(몸 값)·장비 추가·인공장기 추가·버프(효과) 추가로 분해해 막대 구간과 우측 버프 태그로 구분하고, 클릭·마우스오버 시 상세 출처(착용 장비별 기여 포함) 팝오버를 표시한다.

## 바꾼 파일과 이유

- `apps/game/src/home/cards/CyborgCard.tsx` — 아머·쉴드·스태미나 포드, 회복량 팝오버, 6스탯 장비/인공장기/버프 출처 분해 팝오버 구현
- `apps/game/src/home/dashboardPro.css` — 2열 바이탈 컬럼, 아머·쉴드·스태미나 색상, 호버/클릭 상세 팝오버, 장비·버프 막대 세그먼트 스타일 추가
- `apps/game/messages/ko.json`, `apps/game/messages/en.json` — 신규 메시지 키 11쌍 추가
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 없음

## 건드리지 말 것

- `apps/game/src/styles/tokens.css` — 기존 대시보드·2차 스탯 색 토큰 유지

## 검증

- `pnpm docs:index`, `biome format`, `pnpm --filter @terra/game typecheck`, `oxlint --type-aware --deny-warnings`, `check-i18n.mjs`, `check-contrast.mjs`, `pnpm --filter @terra/game build`, `check-pwa.mjs`, `check:bundle` 실행 — **Verified**

## 미검증 · TODO

- 없음

## 관련 ADR

- `docs/adr/2026-11-01-ui-visibility.md`
