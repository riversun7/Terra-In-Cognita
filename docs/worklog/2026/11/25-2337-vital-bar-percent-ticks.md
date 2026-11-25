# 생명·전투 자원 막대 % 비율 채움 + 10/50/100 절대값 눈금 공용 적용

- 일시: 2026-11-25 23:37 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-10-28-design-system.md`, `docs/adr/2026-11-01-battle-replay.md`

## 한 일

- 공용 눈금 모듈(`vitalTicks.ts`·`VitalTicks.tsx`·`vitalTicks.css`)을 추가해 생명·전투 자원 막대를 항상 `현재 ÷ 최대(%)` 비율로 채우고, 막대 위에 10(소눈금)·50(중눈금)·100(대눈금) 3단계 절대값 눈금을 겹쳐 표시하도록 통일했다. 최대치가 커지면 `10/50/100 → 50/100/500 → 100/500/1000 …` 순으로 자동 상향해 선이 뭉개지지 않게 했다.
- 홈 `[내 사이보그]` 카드(`CyborgCard.tsx`)에서 가득 찬 자원이 상대 축척(`vitalScale`) 때문에 비어 보이던 문제를 제거하고, 오른열 스태미나 아래에 피로도(`0/120`, 80% 이상 경고색)를 추가해 6개 자원(왼: HP·아머·쉴드 / 오른: MP·스태미나·피로도) 모두 `%` 채움 + 눈금으로 통일했다(상단 중복 피로 칩 제거).
- 사이보그·유닛 상세(`VitalsMeters` / `Meter`)의 HP·아머·쉴드 막대에 같은 눈금을 붙였다.
- 전투 화면(`BattleHud` 3D 머리 위 HP·아머·쉴드 막대, `BattleUnits` 선택 유닛 자원 막대 5종)에 같은 눈금을 적용하고, 머리 위 막대는 눈금이 또렷하게 보이도록 폭·높이를 토큰 범위에서 조정했다.

## 바꾼 파일과 이유

- `apps/game/src/ui/vitalTicks.ts`: 10/50/100 3단계 눈금 간격·고수치 자동 축척·CSS 변수 계산 및 DOM 적용 도우미 추가
- `apps/game/src/ui/VitalTicks.tsx`: React용 공용 눈금 오버레이 부품 추가
- `apps/game/src/ui/vitalTicks.css`: 토큰 기반 3단계 눈금 스타일(대·중·소 높이·굵기·대비 구분 및 끝선 클리핑) 추가
- `apps/game/src/ui/vitalTicks.test.ts`: 축척 상향·좁은 전투 막대(compact)·CSS 백분율 계산 단위 시험 추가
- `apps/game/src/styles/tokens.css`: `--dash-bar-vital`을 `5px → 7px`로 높여 3단계 눈금 높이 차이를 선명하게 함
- `apps/game/src/home/cards/CyborgCard.tsx`, `apps/game/src/home/dashboardPro.css`: 상대 축척 제거(`current / max` 100% 비율 채움) 및 `<VitalTicks>` 적용
- `apps/game/src/roster/parts.tsx`, `apps/game/src/roster/roster.css`: 생명 수치 `Meter`(`hp`·`armor`·`shield`)에 `<VitalTicks>` 및 8px 트랙 높이 적용
- `apps/game/src/battle/battleHud.ts`, `apps/game/src/battle/BattleUnits.tsx`, `apps/game/src/battle/battleReplay.css`: 전투 3D 머리 위 막대(compact 눈금)와 선택 유닛 자원 막대(HP·아머·쉴드·MP·스태미나)에 동일 눈금 적용

## 함께 바꿔야 하는 파일

- `docs/WORKLOG.md` (`pnpm docs:worklog`로 재생성)
- 향후 다른 화면에 생명·전투 자원 막대를 추가할 때는 `apps/game/src/ui/VitalTicks.tsx`(또는 DOM 전용 `applyVitalTicks`)를 함께 쓴다.

## 건드리지 말 것

- `apps/game/src/ui/vitalTicks.css`에 직접 hex·rgb·px 값을 넣지 않는다(`scripts/check-contrast.mjs` 검사 대상).
- `apps/game/src/battle/battleHud.ts`의 프레임당 `update()` 안에서는 눈금을 다시 계산하지 않는다(생성자에서 1회 설정, 프레임당 `scaleX`만 변경).

## 미검증 · TODO

- 아머 회복 규칙 변경안(전투 종료 후 자동 복구 + 아머 HP 10당 방어구 랜덤 내구도 1 감소)은 사용자 확인 뒤 별도 구현(전투/보유 물건/ADR·기획 정리 포함).
- 동시 세션이 작업 중인 `apps/game/src/home/city/`는 건드리지 않았으며, 이 작업 파일은 `oxlint --type-aware`, Vitest, `check-contrast`, `vite build`, `check-pwa`, `check:bundle`로 검증함.
