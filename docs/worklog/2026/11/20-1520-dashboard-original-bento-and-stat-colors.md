# 홈 대시보드 테라 인코그니타 독자 비대칭 커맨드 벤토 개편 및 VIT·DEX 스탯 색상 분리

- 일시: 2026-11-20 15:20 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-design-system.md`, ADR `2026-10-29-app-shell.md`, ADR `2026-11-01-ui-visibility.md`

## 한 일
- **참고 시안 모방 요소 제거 및 테라 인코그니타 독자 비대칭 12열 커맨드 벤토 재설계**:
  - 모든 카드의 우상단 원형 글로우(`.home-card::before`), 3열 동일 세로 카드 배치, 중앙 3단 원색 그라데이션 박스, 시장 시세의 세로 택배 상자 목록을 모두 걷어냈다.
  - 상단을 **좌 5열(내 사이보그 바이오-텔레메트리 도시에) + 우 7열(경제 요약 가로 3분할 재무 데스크 + 2×3 거래소 시세 매트릭스)** 비대칭 12열 벤토로 재구성했다.
  - **내 사이보그 (`CyborgCard.tsx`)**: 이름·상태 칩 헤더, 클릭형 경험치 줄+상세 팝오버, 2열 병렬 `HP`/`MP` 전투 자원 포드, 6종 스탯 정밀 막대, 하단 3칸 장착 현황(`장비`·`인공장기`·`스킬`)으로 균형을 맞췄다.
  - **경제 요약 (`AssetsCard.tsx`)**: 중립 표면 위 2px 상단 포인트 바(골드·시안·바이올렛)를 쓰는 가로 3분할 기관 금융 데스크로 정돈(`data-metric="value"` 유지).
  - **시장 시세 (`MarketTickerCard.tsx`)**: `T0`/`T1` 티어 뱃지·품목명·등락 뱃지·가격·미니 스파크라인이 들어간 2열 × 3행 견적 타일 매트릭스로 재구성(택배 아이콘 제거).
  - **하단 작전 데크·슬림 푸터 (`home.css`·`MapsCard.tsx`)**: 데스크톱에서 `보유 유닛`·`세력`·`지도`(2행 컴팩트 액션 런처)가 3열 대칭을 이루고, `연결·성능` 카드는 맨 아래 1줄 하드웨어 텔레메트리 푸터 바로 접어 불필요한 여백을 없앴다.
- **VIT(주황) · DEX(순수 노랑) 스탯 색상 전역 분리 (`tokens.css`)**:
  - 다크(`dark`), 기본(`pastel`), 정거장(`station`), 선명(`contrast`), 개발 화면(`dev` 다크·라이트) 전 테마에서 `--color-stat-vit`(선명한 주황)과 `--color-stat-dex`(순수 노랑) 및 대시보드 막대 토큰(`--dash-stat-vit-base: #f97316`, `--dash-stat-dex-base: #facc15`/`#eab308`)의 색상 겹침을 완전히 해소했다.
- **검증(Verified)**:
  - `check-contrast.mjs` 4개 게임 테마 + 2개 개발 테마 대비 746쌍·화면 CSS 직접 색/px 0건 통과.
  - `oxlint --type-aware` 오류 0건·경고 0건, `check-boundaries.mjs`·`check-file-size.mjs`·`check-i18n.mjs` 통과.
  - `@terra/game` 단위 시험(홈·틀·테마 74/74 포함), `typecheck`, `vite build`, `check-pwa.mjs`, `check-bundle.mjs` 통과.
  - Playwright Chromium으로 다크·경험치 팝오버·라이트(`pastel`)·모바일(`390×844`, 가로 넘침 0)·사이보그 화면(`/cyborg`의 VIT 주황 vs DEX 노랑) 실렌더링 및 콘솔 오류 0건, `e2e/inventory.spec.ts`·`e2e/cyborg.spec.ts` 셀렉터 계약 확인.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css` | 전 테마 VIT(주황)·DEX(순수 노랑) 스탯 색상 분리, 원형 글로우 토큰 제거 및 커맨드 타일 토큰 정리 |
| `apps/game/src/home/CardGrid.tsx` | 비대칭 12열 커맨드 벤토(좌 5열 사이보그 · 우 7열 경제+시세) 및 하단 3열 작전 데크 구조 적용 |
| `apps/game/src/home/cards/CyborgCard.tsx` | 2열 병렬 HP/MP 포드, 컬러 점+스탯 막대, 하단 3칸 장착 현황(장비·인공장기·스킬) 추가 |
| `apps/game/src/home/cards/AssetsCard.tsx` | 상단 2px 포인트 바 기반 가로 3분할 재무 데스크로 개편 |
| `apps/game/src/home/cards/MarketTickerCard.tsx` | 2×3 거래소 견적 타일 매트릭스로 개편(택배 아이콘 제거) |
| `apps/game/src/home/cards/MapsCard.tsx` | 하단 3열 작전 바에 맞춘 2행 컴팩트 전술 지도 런처 |
| `apps/game/src/home/cards/icons.tsx` | 미사용 `ParcelIcon` 제거 |
| `apps/game/src/home/home.css` · `apps/game/src/home/dashboardPro.css` | 카드 우상단 원형 글로우 제거, 머리 구분선·비대칭 12열 벤토·하단 3열 작전 바·1줄 진단 푸터 스타일 반영 |

## 함께 바꿔야 하는 파일
- `apps/game/src/styles/tokens.css`의 `--color-stat-*`를 수정할 때는 4개 게임 테마와 2개 개발 테마를 모두 맞춰 `check-contrast.mjs` 4.5:1 대비를 유지한다.

## 건드리지 말 것
- `apps/game/src/home/cards/AssetsCard.tsx`의 `data-metric="value"` 및 `CardFrame.tsx`의 `.home-link-button`(`e2e/inventory.spec.ts` 계약).
- `packages/shared/src/dashboard.ts`의 `HOME_CARDS` 9종 ID 목록.

## 미검증·TODO·알려진 문제
- `station`(정거장) 및 `contrast`(선명) 테마의 대시보드 화면은 `check-contrast.mjs` 수치 검증은 통과했으나 브라우저 스크린샷 육안 확인은 미실행.

## 사용자 결정 대기
- 독자 개편된 비대칭 커맨드 대시보드 및 VIT·DEX 색상 확인과 `origin/main` 푸시 여부.
