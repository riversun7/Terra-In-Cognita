# 홈 대시보드 프로 터미널 개편 및 전역 타이포그래피·사이드바 정돈

- 일시: 2026-11-20 13:00 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-design-system.md`, ADR `2026-10-29-app-shell.md`, ADR `2026-11-14-inventory-screen.md`

## 한 일
- **전역 타이포그래피·배경·사이드바 정돈 (`tokens.css`·`shell.css`)**:
  - 제목 글꼴(`--font-display`)을 둥근 `Jua`에서 정밀한 기하학 산세리프 `Pretendard`(`600`, 자간 `-0.025em`)로 전환하고, 버튼 턱(`--lip`)을 `0px`로 줄여 앱 전반의 장난감 인상을 없앴다.
  - 다크(옵시디언)·기본(데이라이트)·정거장(네온) 테마에 미세한 설계 격자 배경(`--dash-grid`)과 대시보드 전용 틴트 토큰(`--dash-*`)을 추가했다(선명 테마는 격자 없음).
  - 사이드바(`.side-item`·`.side-head`·`.side-icon`)의 이중 테두리·카드 그림자를 걷어내 정갈한 플랫 커맨드 레일로 개편하고, 현재 페이지 항목에만 좌측 포인트 바·틴트를 부여했다.
- **상단 3열 프로 커맨드 데크 (`CardGrid.tsx`·`CyborgCard.tsx`·`AssetsCard.tsx`·`MarketTickerCard.tsx`)**:
  - **내 사이보그 (`CyborgCard.tsx`)**: 이름·`Lv.` 배지·경험치 진행 바 + 클릭/Esc로 열고 닫는 **경험치 상세 팝오버**(현재 구간 획득·다음 레벨 필요·환생 횟수·남은 EXP), 장착 스킬·생활/피로 칩, `HP`/`MP` 풀폭 게이지, 1차 스탯 6종(`STR·VIT·INT·WIS·DEX·AGI`) 기본+보너스 2단 수평 막대로 전면 개편.
  - **경제 요약 (`AssetsCard.tsx`)**: 앰버(보유 자금)·코발트(자산·화폐 환산, `data-metric="value"` 유지)·바이올렛(일일 급여·가동 시설·진행 주문) 3단 틴트 KPI 블록으로 재구성(BigInt 정수 계산 유지).
  - **실시간 시장 시세 (`MarketTickerCard.tsx`)**: `economy.marketItems` + `economy.catalog` 실시간 자료 기반 상위 6종 티커(아이콘·이름·티어·초소형 SVG 스파크라인·체결가/기준가·24시간 등락률) 추가, 각 줄 클릭 시 해당 품목 거래창(`/economy/market/:itemId`)으로 이동.
- **카드 틀·처리할 일·하단 운영 카드 정리 (`CardFrame.tsx`·`PinnedTodo.tsx`·`ServerCard.tsx`·`MapsCard.tsx`·`dashboardPro.css`)**:
  - 카드 하단의 중복 큰 버튼을 없애고 오른쪽 위 은은한 원형 글로우 위의 `상세 ↗` / `시장 ↗` 링크로 통일(`assets` 카드에 `.home-link-button` 클래스 유지해 `e2e/inventory.spec.ts` 호환).
  - 처리할 일이 0건일 때 `PinnedTodo`를 1줄 상태 리본(`data-empty="true"`)으로 접어 상단 3열 데크가 첫 화면에 바로 들어오게 했다.
  - 하단 운영 카드 격자(`.home-grid`)를 2열 대칭으로 맞춰 `보유 유닛`·`세력`이 빈 열 없이 딱 맞고, `지도`(2차맵·1차맵 2열 전술 런처)·`연결·성능`이 가로 전체 폭을 채우게 했다.
- **검증(Verified)**:
  - `node scripts/check-contrast.mjs` 4개 게임 테마 + 2개 개발 테마 대비 746쌍·화면 CSS 117개 직접 색/px 0건 통과.
  - `vitest` 홈·화면 틀·테마 시험 74개 통과.
  - Playwright Chromium으로 다크(기본·경험치 팝오버)·라이트(`pastel`)·모바일(`390×844`, 가로 넘침 0)·사이보그 화면 실렌더링 및 콘솔 오류 0건, `e2e/inventory.spec.ts` 계약(`[data-metric="value"]`, `.home-link-button`) 확인.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css` | 전역 표시 글꼴 `Pretendard` 전환, `--lip: 0px`, 다크 옵시디언 팔레트 정돈, 테마별 `--dash-*` 토큰 추가 |
| `apps/game/src/shell/shell.css` | 플랫 프로 사이드바·미니멀 상단 바·본문 미세 설계 격자 배경 적용 |
| `apps/game/src/home/HomeScreen.tsx` | `dashboardPro.css` 연결 |
| `apps/game/src/home/CardGrid.tsx` | 상단 3열 프로 커맨드 데크(내 사이보그·경제 요약·시장 시세) + 하단 운영 격자 구성 |
| `apps/game/src/home/PinnedTodo.tsx` | 빈 상태(`data-empty="true"`) 1줄 상태 리본 전환 |
| `apps/game/src/home/cards/CardFrame.tsx` | 오른쪽 위 원형 글로우 + `상세 ↗` 링크 프로 카드 틀 |
| `apps/game/src/home/cards/CyborgCard.tsx` | 레벨·경험치 바·상세 팝오버·HP/MP·2단 1차 스탯 수평 막대 카드 신설 |
| `apps/game/src/home/cards/AssetsCard.tsx` | 3단 틴트 KPI(보유 자금·자산/화폐 환산·일일 급여/거래) 경제 요약 카드 개편 |
| `apps/game/src/home/cards/MarketTickerCard.tsx` | 실시간 시장 시세 6종 티커·미니 스파크라인 카드 신설 |
| `apps/game/src/home/cards/ServerCard.tsx` | `UnitsCardBody`·`FactionCardBody` 미니 KPI 카드화 및 중복 하단 버튼 제거 |
| `apps/game/src/home/cards/MapsCard.tsx` | 2차맵·1차맵 2열 전술 런처 타일 개편 |
| `apps/game/src/home/cards/icons.tsx` | 칩·지갑·추세 차트·품목 상자·`↗` 아이콘 추가 |
| `apps/game/src/home/cards/registry.tsx` | `CyborgCardBody` 연결 및 `assets` 카드 머리 제목 `경제 요약` 표시 |
| `apps/game/src/home/home.css` · `apps/game/src/home/dashboardPro.css` | 프로 대시보드 레이아웃·카드 스타일 분리(1,000줄 상한 준수) |
| `apps/game/messages/ko.json` · `apps/game/messages/en.json` | 대시보드 신규 문구 26쌍(ko·en) 추가 |

## 함께 바꿔야 하는 파일
- `apps/game/src/home/cards/CardFrame.tsx`의 `.home-link-button` 클래스는 `e2e/inventory.spec.ts`가 `.home-card[data-card="assets"] .home-link-button`으로 클릭하므로 유지한다.
- `apps/game/src/styles/tokens.css`의 `--dash-*` 토큰을 추가·수정할 때는 4개 게임 테마(`pastel`·`dark`·`contrast`·`station`) 모두 함께 맞춘다.

## 건드리지 말 것
- `packages/shared/src/dashboard.ts`의 `HOME_CARDS` 9종 ID 목록(계정 저장값·`homeRender.test.ts`·`homeMessages.test.ts` 계약).
- `apps/game/src/styles/tokens.css`의 4개 테마 `--color-bg` 값(`themeSources.test.ts`가 `theme.ts`·`theme-init.js`·`index.html`·`vite.config.ts`와 일치 검사).

## 미검증·TODO·알려진 문제
- `station`(정거장) 및 `contrast`(선명) 테마의 대시보드 화면은 `check-contrast.mjs` 수치 검증은 통과했으나 브라우저 스크린샷 육안 확인은 미실행.
- 실제 거래 체결량이 풍부한 운영 월드 데이터에서의 시장 시세 스파크라인·등락률 색상은 시세 상승/하락 표본이 쌓인 환경에서 추가 확인 권장.

## 사용자 결정 대기
- 대시보드 및 전역 UI 개편 방향 확인과, 로컬 `main`에 쌓인 커밋 묶음의 `origin/main` 푸시 여부.
