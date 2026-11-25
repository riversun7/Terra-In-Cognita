# 남은 2차 SF 메뉴 아이콘 시안(Part 2 · 8종 × 5안) 생성 및 개발자 시안 모음 반영

- **일시 (KST)**: 2026-11-25 13:58
- **작업 도구**: Antigravity

## 한 일

1. 이미지 생성 할당량 초기화 이후, 2차 피드백 중 미생성 상태였던 4개 시트(8종 × 5안 = 40종)를 생성했다.
   - `2차맵`·`1차맵`: 1안 보완 전술 지도·접이식 홀로맵·레이더 태블릿·등고선 타일·경로 핀 카드 및 행성 5종
   - `처리할 일`·`우편`: 체크리스트 5종, **정면 글래스 봉투**, **안테나+굵은 주파수**, 티타늄 봉인, 봉투+주파수, 홀로 메일창
   - `설정`·`관리자`: 고대비 슬라이더, SF 정밀 기어, 이중 기어, 토글 모듈, 육각 다이얼, 고대비 별방패, **가로·세로 보안카드**, **원테두리 없는 자물쇠**, 왕관 셰브론
   - `운영자 콘솔`·`메뉴 편집`: 굵은 심박 파형·막대+추세 차트·이중 파형·브래킷 펄스·게이지+부하 바, 디테일 강화 메뉴 편집 5종
2. 흰 배경 투영(valley) 자동 분할 스크립트로 40개 투명 PNG(96×96)를 추출하고, 다크 UI 18×18 미리보기 포함 보드(`board-r2-part2.png`)를 제작했다.
3. 개발자 시안 모음(`/dev/mockups`) 아이콘 탭에 `R2 · PART 2` 보드를 맨 위로 추가하고 보드 개수 문구를 4장으로 갱신했다.

## 바꾼 파일과 이유

- `apps/game/public/dev/mockups/icons/board-r2-part2.png` — 2차 완료분 8종 × 5안 시안 보드 저장
- `apps/game/src/editor/mockups/MockupsGalleryScreen.tsx` — `ICON_BOARDS`에 `r2-part2` 보드 추가
- `apps/game/messages/ko.json`, `apps/game/messages/en.json` — `dev_mockups_boards_title` 보드 수(3장 → 4장) 갱신
- `docs/WORKLOG.md` — `pnpm docs:index` 자동 갱신

## 함께 바꿔야 하는 파일

- 사용자가 Part 2에서 최종 교체 번호를 고르면 `apps/game/public/icons/nav/<id>.png`와 `MockupsGalleryScreen.tsx`의 `ICON_ENTRIES` 출처 표기를 함께 갱신한다.

## 건드리지 말 것

- `apps/game/public/dev/mockups/icons/legacy/` — 교체 전 기존 아이콘 21종 원본 보관본

## 검증

- `pnpm docs:index`, `biome format --write`, `pnpm --filter @terra/game typecheck`, `oxlint --type-aware --deny-warnings`, `node scripts/check-i18n.mjs`, `pnpm --filter @terra/game build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle` 실행 — **Verified**

## 미검증 · TODO

- 사용자가 Part 2 보드에서 교체할 아이콘 번호를 지정하면 `apps/game/public/icons/nav/`에 반영

## 관련 ADR

- 없음
