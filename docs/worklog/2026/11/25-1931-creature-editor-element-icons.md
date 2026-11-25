# 크리쳐 편집기 속성 아이콘을 유닛창과 동일한 스타일로 통일

- **일시 (KST)**: 2026-11-25 19:31
- **작업 도구**: Antigravity

## 한 일

- 크리쳐 편집기(`creatureBits.tsx`, `creatureEditor.css`)에서 강화형 6속성(`빙결·폭렬·번개·크리스탈·성·사령`)에만 씌우던 이중 원형 테두리·색 바탕 래퍼(`.ce-el-icon`)와 인라인 하드코딩 색을 제거했다.
- 유닛창(`cyborg/CyborgExtras.tsx`, `cyborg/cyborg.css`)과 완전히 동일한 `ElementIcon`(`1.125rem`) 크기와 12속성 디자인 토큰(`--element-color`)을 그대로 적용해 도감 주속성 필터·표·상세 탭 모두 일관되게 표시되도록 고쳤다.

## 바꾼 파일과 이유

- `apps/game/src/editor/creatures/creatureBits.tsx` — `.ce-el-icon` 원형 래퍼 및 인라인 색 제거, `ElementIcon` 직접 렌더링
- `apps/game/src/editor/creatures/creatureEditor.css` — 이중 원형 테두리·배경 제거, 유닛창과 동일한 12속성 `--element-color` 토큰·아이콘 크기(`1.125rem`) 적용
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 없음

## 건드리지 말 것

- `apps/game/src/ui/elementIcons.tsx` — 공용 12속성 SVG 원본

## 검증

- `pnpm docs:index`, `biome format`, `pnpm --filter @terra/game typecheck`, `oxlint --type-aware --deny-warnings`, `node scripts/check-contrast.mjs`, `pnpm --filter @terra/game build` 실행 — **Verified**

## 미검증 · TODO

- 없음

## 관련 ADR

- `docs/adr/2026-11-25-creature-codex-groups.md`
