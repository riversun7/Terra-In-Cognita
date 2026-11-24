# 모바일·태블릿·PC 반응형 앱 틀·2차맵 HUD 밀도 개편 및 다채널 채팅 도크 추가

- 일시: 2026-11-24 12:40 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-24-compact-responsive-shell-and-chat.md`, `docs/adr/2026-10-29-app-shell.md`, `docs/adr/2026-10-28-design-system.md`

## 한 일
- 사용자 요청과 승인된 모바일·태블릿·PC 시안에 맞춰 게임 앱 전역 타이포그래피·조작부 밀도, 상단·사이드·하단 내비게이션, 컬러 시그니처 아이콘, 상단 상태 요약 띠, 반응형 다채널 채팅 도크, 2차맵(`/map`) 하단 내비게이션·HUD를 일괄 개편했다(**Verified**: 정적 검사·단위 시험·프로덕션 빌드·번들·PWA 검사).
- **컴팩트 디자인 토큰 및 다크 테마 정돈**(`apps/game/src/styles/tokens.css`, `theme.ts`, `theme-init.js`, `styles.css`, `dev.css`):
  - 본문 글자(`13.5px`), 보조(`12px`·`11px`), 탭 라벨(`10.5px`), 조작부 높이(`34px` / 소형 `28px`), 위 띠(`40px`), 상태 요약 띠(`36px`), 플랫 하단 탭(`48px`), 접은 레일(`64px`), 사이드바·모바일 우측 드롭다운(`216px`), 1줄 채팅바(`30px`), PC 채팅 열(`280px`)로 축소·정돈했다.
  - 기본 테마(`pastel`)는 그대로 두고 `dark` 테마를 심우주 슬레이트 네이비(`#070d14` 바탕 · `#0d1622` 표면 · `#26e0b8` 청록 강조)로 다듬어 746개 대비 쌍을 통과했다(**Verified**: `check-contrast.mjs`).
- **컬러 게임 이미지 아이콘(`SignatureIcon.tsx` · `public/icons/nav/*.png`) 및 상단·사이드·플랫 하단바 개편**:
  - 메뉴·시스템·2차맵·상태 요약 항목 21종에 각기 다른 색과 실루엣의 96×96 투명 PNG 게임 아이콘을 생성·적용해 다크·라이트·개발 네온 테마 어디서나 즉시 구분되게 했다.
  - 상단바와 사이드바 머리에 기존 게임 이미지 로고(`/favicon.svg`)와 전체 제목(`TERRA IN-COGNITA`)을 복원했다.
  - `TopBar.tsx`를 `40px` 컴팩트 규격(모바일은 오른쪽 끝에 `☰` 서랍 단추)으로, 모바일 `dialog.frame-drawer`를 기존처럼 전체 높이로 옆에서 슬라이드 인하는 서랍으로, `SideMenu.tsx`의 지도를 `2차맵 | 1차맵` 한 줄 가로 2분할로, `TabBar.tsx`·`tabbar.css`를 위로 솟는 원 없는 `48px` 플랫 바(`380px+` 표준 스마트폰에서 C 5칸+지도=6탭 배치)로 개편했다.
  - 일반 게임 화면 위 띠 아래에 자금·물자·유닛·시설·알림을 보여 주는 `StatusStrip.tsx`(지연 조각)를 붙였다.
- **반응형 다채널 채팅 도크(`apps/game/src/shell/chat/`) 및 2차맵(`/map`) 적용**:
  - 기획 D-480의 4채널(`시장` · `장소` · `세력` · `파티`)과 외국어 `[번역]` 토글(D-6046 미리 보기)을 지원하는 `chatStore.ts`·`ChatDock.tsx`·`chatDock.css`를 구현했다.
  - 모바일(`< 37.5em`)과 2차맵(`< 64em`)은 하단 탭 바로 위 `30px` 1줄 바(누르면 시트 펼침), 태블릿(`37.5em~63.99em`)은 하단 인라인 입력 바, PC(`≥ 64em`) 앱 틀은 우측 `280px` 고정 열(접기 가능), 2차맵 데스크톱은 우하단 도크로 동작한다.
  - `MapBottomNav.tsx`·`SecondaryMapScreen.tsx`·`mapHud.css`·`map.css`에도 `48px` 슬림 플랫 바·시그니처 아이콘·채팅 도크 여백을 맞췄다.
- 단위 시험(`layout.test.ts`, `chatStore.test.ts`), E2E 스펙(`e2e/shell.spec.ts`), 한국어·영어 메시지 32쌍, ADR을 갱신했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css`, `styles.css`, `styles/dev.css`, `settings/theme.ts`, `public/theme-init.js` | 컴팩트 글자·조작부·틀 치수 토큰 적용, 옛 돌출 탭 여백 제거, `dark` 테마 팔레트(`#070d14`) 정돈 |
| `apps/game/src/ui/SignatureIcon.tsx` | 메뉴·시스템·2차맵·채팅·상태 요약용 다층 컬러 SVG 시그니처 아이콘 |
| `apps/game/src/shell/TopBar.tsx`, `SideMenu.tsx`, `TabBar.tsx`, `menuItems.ts`, `layout.ts`, `Shell.tsx`, `shell.css`, `tabbar.css` | `40px` 상단바, 모바일 우측 `☰` 컴팩트 드롭다운(`216px`), 태블릿 `64px` 레일, 돌출 없는 `48px` 플랫 하단바, `StatusStrip`·`ChatDock` 연결 |
| `apps/game/src/shell/StatusStrip.tsx`, `statusStrip.css` | 위 띠 아래 실시간 자금·물자·유닛·시설·알림 요약 띠(모바일 5열, 태블릿·PC 가로 상세) |
| `apps/game/src/shell/chat/chatStore.ts`, `ChatDock.tsx`, `chatDock.css`, `chatStore.test.ts` | 시장·장소·세력·파티 다채널 반응형 채팅 도크 및 단위 시험 |
| `apps/game/src/shell/NavigationSettings.tsx`, `navigationSettings.css`, `units/units.css` | 메뉴 설정 미리 보기 시그니처 아이콘·플랫 지도 알약 반영, 유닛 다중 선택 띠 하단 여백(`--chatbar-offset`) 보정 |
| `apps/game/src/map/MapBottomNav.tsx`, `SecondaryMapScreen.tsx`, `mapHud.css`, `map.css` | 2차맵 하단 내비게이션 시그니처 아이콘 전환, 채팅 도크 연결 및 하단 HUD 여백 맞춤 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 상단 상태 요약 띠·다채널 채팅 한국어·영어 문구 추가 |
| `apps/game/src/shell/layout.test.ts`, `e2e/shell.spec.ts` | 슬림 플랫 하단 탭 칸 수 계단·여백·우측 드롭다운 바깥 클릭 좌표 갱신 |
| `docs/adr/2026-11-24-compact-responsive-shell-and-chat.md`, `2026-10-29-app-shell.md`, `2026-10-28-design-system.md` | 반응형 밀도·채팅 도크 결정 기록 및 기존 ADR 일부 대체 표시 |

## 함께 바꿔야 하는 파일
- `tokens.css`의 `--tabbar-map-size`·`--space-4`나 `layout.ts`의 `TAB_CELL_MIN_EM`·`TAB_MAP_CELL_EM`·`TAB_SLOT_STEPS`를 바꿀 때는 `tabbar.css`와 `layout.test.ts`를 함께 맞춘다.
- `tokens.css`의 `dark` 배경색(`--color-bg`)을 바꿀 때는 `apps/game/src/settings/theme.ts`와 `apps/game/public/theme-init.js`의 `THEME_COLORS.dark`도 함께 바꾼다(`themeSources.test.ts`).

## 건드리지 말 것
- 첫 화면 묶음에 들어가는 `Shell.tsx`·`TopBar.tsx`·`ChatDock.tsx`에서 `@trpc/client`·`net/api.ts`·`net/homeQueries.ts`를 정적으로 import하지 않는다(`firstScreen.test.ts`·`check-bundle.mjs`).

## 미검증·TODO·알려진 문제
- 다채널 채팅(`ChatDock`)은 프론트엔드 UI·상태 저장소 시안(`[UI 시안]` 배지 표시)이며, 실시간 WebSocket 채팅 프로토콜·스팸 제한·서버 번역 연동은 후속 작업이다.
- Playwright 실서버 화면 시험(`e2e/shell.spec.ts`)은 로컬 DB·서버 기동이 필요한 E2E 묶음이라 이번 턴에서는 코드·단위 시험으로 맞췄다(미실행).

## 사용자 결정 대기
- 없음.
