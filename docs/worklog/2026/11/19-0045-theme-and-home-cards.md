# 홈 대시보드 카드·쉘·테마 토큰 디자인 정돈

- 일시: 2026-11-19 00:45 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-28-design-system.md`, `2026-10-29-app-shell.md`

## 한 일
- 기본(주간)·다크·선명·정거장 테마 색상 토큰(`apps/game/src/styles/tokens.css`, `apps/game/src/settings/theme.ts`, `apps/game/public/theme-init.js`, `apps/game/index.html`, `apps/game/vite.config.ts`)과 테마 안내 문구(`ko.json`, `en.json`)를 정돈했다.
- 앱 쉘(`shell.css`, `tabbar.css`, `styles.css`, `screenParts.css`), 설정 화면(`SettingsPage.tsx`, `settings.css`), 홈 대시보드 카드(`AssetsCard.tsx`, `MapsCard.tsx`, `ServerCard.tsx`, `home.css`, `todo.css`)의 레이아웃·간격·카드 표시를 다듬었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css`, `styles.css`, `sections/screenParts.css` | 기본·다크 테마 배경(`#eef2f7` / `#0b0f19`) 및 표면·테두리 토큰 정돈 |
| `apps/game/index.html`, `public/theme-init.js`, `vite.config.ts`, `src/settings/theme.ts` | `<meta name="theme-color">`·PWA manifest·초기 테마 색상 일치 |
| `apps/game/src/settings/SettingsPage.tsx`, `settings.css`, `messages/{ko,en}.json` | 테마 선택 카드 및 설명 문구 개선 |
| `apps/game/src/shell/shell.css`, `tabbar.css` | 사이드바·하단 탭바·상단 막대 여백 및 구분선 정돈 |
| `apps/game/src/home/cards/{AssetsCard,MapsCard,ServerCard}.tsx`, `home.css`, `todo.css` | 홈 대시보드 카드 정보 계층 및 상태 표시 개선 |
| `docs/worklog/2026/11/19-0045-theme-and-home-cards.md`, `docs/WORKLOG.md` | 이 기록과 자동 생성 목차 |

## 함께 바꿔야 하는 파일
- 기본 테마 배경색(`--color-bg`)을 바꿀 때는 `tokens.css`, `theme.ts`, `public/theme-init.js`, `index.html`, `vite.config.ts`를 함께 맞춰야 `themeSources.test.ts`와 `check-pwa.mjs`를 통과한다.

## 건드리지 말 것
- `tokens.css`의 대비 비율 규칙(`check:contrast`가 검사하는 텍스트·배경 조합)을 깨뜨리지 않는다.

## 미검증·TODO·알려진 문제
- `pnpm check:contrast`, `pnpm check:i18n`, `apps/game/src/home`·`apps/game/src/settings` 단위 테스트(14파일 133건), `pnpm --filter @terra/game build` + `check-pwa.mjs` + `check-bundle.mjs` 통과(Verified).

## 사용자 결정 대기
- 없음.
