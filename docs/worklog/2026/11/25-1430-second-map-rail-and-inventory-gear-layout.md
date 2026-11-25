# 2차맵 세로 사이드바 선택 표시 수정 및 인벤토리·착용 장비·인공장기 분리 개편

- **일시 (KST)**: 2026-11-25 14:30
- **작업 도구**: Antigravity

## 한 일

1. **2차맵 세로 사이드바 선택 표시 수정** (`apps/game/src/map/mapHud.css`)
   - 데스크톱(`64em` 이상) 왼쪽 세로 레일(`.map-nav`)에서 모바일 하단 가로 탭용 상단 가로 강조 막대(`box-shadow: inset 0 var(--border-strong-w) 0 var(--color-primary)`)가 그대로 보이던 문제를 제거하고, 앱 세로 사이드바(`.side-item`)와 같은 **왼쪽 세로 강조 막대(`inset var(--accent-bar) 0 0 var(--color-primary)`)**와 좌→우 그라데이션으로 교체했다.
2. **인벤토리 소지품 중심 개편 및 착용 장비 토글(넓은 화면 기본 확장)** (`UnitHoldings.tsx`, `HoldingsPanel.tsx`, `holdings.css`, `BagSheet.tsx`, `bag.css`, `UnitsTab.tsx`)
   - `UnitHoldings`에 `mode="inventory"`를 추가해 2차맵 `[가방]`(`BagSheet.tsx`)과 인벤토리 `[유닛별]`(`UnitsTab.tsx`)에서 **소지품(`HoldingsPanel`)을 기본으로 표시**하고, **`착용 장비 (착용/전체)` 버튼**을 눌러야 착용 장비 창이 열리도록 변경했다.
   - 데스크톱(`64em` 이상)에서는 착용 장비 창을 기본 확장 상태로 열어 소지품과 착용 장비를 2열로 나란히 보여주고, 2차맵 `[가방]` 패널 폭도 확장 상태에 맞춰 넓어진다.
3. **인공장기를 인벤토리에서 제거하고 유닛 정보·스탯창 전용으로 분리** (`UnitHoldings.tsx`, `HoldingsPanel.tsx`, `CyborgSheet.tsx`, `UnitControlPanels.tsx`)
   - `mode="inventory"`에서는 인공장기 슬롯 묶음을 렌더링하지 않으며, `HoldingsPanel`(`includeOrgans={false}`)에서도 이미 인공장기 칸에 이식된 아이템은 소지품 목록에서 제외한다.
   - 인공장기는 유닛 상세·스탯창(`UnitDetail.tsx`의 `mode="unit"`, `CyborgSheet.tsx`)에서만 표시하며, 2차맵 `[유닛]` 목록에서 고른 내 유닛 아래에 `[유닛 정보]` 단추를 추가해 스탯·인공장기 상세로 바로 열 수 있게 했다.

## 바꾼 파일과 이유

- `apps/game/src/map/mapHud.css` — 2차맵 세로 레일 활성 표시를 왼쪽 세로 강조 막대로 수정
- `apps/game/src/holdings/UnitHoldings.tsx`, `HoldingsPanel.tsx`, `holdings.css` — 인벤토리 모드(인공장기 제거, 소지품 기본, 착용 장비 토글/넓은 화면 기본 확장 2열) 추가
- `apps/game/src/map/BagSheet.tsx`, `bag.css`, `apps/game/src/inventory/UnitsTab.tsx` — `mode="inventory"` 적용 및 넓은 화면 가방 폭 확장
- `apps/game/src/cyborg/CyborgSheet.tsx` — 본체 인벤토리 목록에서 이식된 인공장기 중복 표시 제외
- `apps/game/src/map/UnitControlPanels.tsx`, `unitControl.css` — 2차맵 내 유닛 선택 시 `[유닛 정보]` 이동 버튼 추가
- `apps/game/messages/ko.json`, `apps/game/messages/en.json` — `holdings_carried_title`, `holdings_equipped_gear_toggle`, `map_unit_info` 키 추가
- `e2e/inventory.spec.ts` — 모바일 접힘→토글 펼침·데스크톱 기본 확장·인공장기 미노출 검증 반영
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 없음

## 건드리지 말 것

- `apps/game/src/units/UnitDetail.tsx`의 `mode="unit"` 기본 동작(유닛 정보·스탯창에서 인공장기 표시 유지)

## 검증

- `pnpm docs:index`, `biome format --write`, `pnpm -r typecheck && tsc -p e2e/tsconfig.json`, `oxlint --type-aware --deny-warnings`, `check-boundaries.mjs`, `check-i18n.mjs`, `check-contrast.mjs`, `pnpm --filter @terra/game test`, `pnpm --filter @terra/game build`, `check-pwa.mjs`, `check:bundle` 실행 — **Verified**

## 미검증 · TODO

- 실서버 Playwright `e2e/inventory.spec.ts` 시각 확인은 개발 서버 기동 시 필요에 따라 실행

## 관련 ADR

- `docs/adr/2026-11-14-inventory-screen.md`
- `docs/adr/2026-11-24-unit-cyborg-unify.md`
