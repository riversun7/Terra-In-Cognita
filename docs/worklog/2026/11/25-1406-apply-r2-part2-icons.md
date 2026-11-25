# 2차 시안 Part 2 선택 아이콘 7종 메뉴 반영

- **일시 (KST)**: 2026-11-25 14:06
- **작업 도구**: Antigravity

## 한 일

1. 2차 시안 Part 2 보드(`board-r2-part2.png`)를 개발자 시안 모음(`/dev/mockups`) 아이콘 탭에 보관 유지한 상태에서, 사용자가 선택한 7종 아이콘을 실제 메뉴 아이콘(`apps/game/public/icons/nav/`)으로 교체했다.
   - `map.png` ← 2차맵 1 (보완 전술 지도)
   - `globe.png` ← 1차맵 1 (황금 궤도 행성)
   - `inbox.png` ← 처리할 일 1 (홀로 클립보드)
   - `mail.png` ← 우편 2 (안테나+주파수)
   - `settings.png` ← 설정 3 (이중 기어)
   - `admin.png` ← 관리자 2 (가로 보안카드)
   - `edit.png` ← 메뉴 편집 3 (순서 변경 바)
2. `/dev/mockups` 비교 표(`MockupsGalleryScreen.tsx` `ICON_ENTRIES`)의 출처 표기를 교체한 7종에 맞게 갱신했다.

## 바꾼 파일과 이유

- `apps/game/public/icons/nav/{map,globe,inbox,mail,settings,admin,edit}.png` — 2차 Part 2 선택본 7종 교체
- `apps/game/src/editor/mockups/MockupsGalleryScreen.tsx` — 교체한 7종 출처 표기 동기화
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 없음

## 건드리지 말 것

- `apps/game/public/dev/mockups/icons/legacy/` — 교체 전 기존 아이콘 21종 원본 보관본
- `apps/game/public/dev/mockups/icons/board-*.png` — 시안 보드 4장 보관본

## 검증

- `pnpm docs:index`, `biome format`, `pnpm --filter @terra/game typecheck`, `oxlint --type-aware --deny-warnings`, `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle` 실행 — **Verified**

## 미검증 · TODO

- 없음

## 관련 ADR

- 없음
