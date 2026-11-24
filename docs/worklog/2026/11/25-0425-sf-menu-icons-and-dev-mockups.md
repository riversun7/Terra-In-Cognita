# SF 메뉴 아이콘 15종 교체 적용 및 개발자 시안 모음(/dev/mockups) 페이지 추가

- 일시: 2026-11-25 04:25 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-24-compact-responsive-shell-and-chat.md`

## 한 일
- 사용자 선택에 따라 미래 SF·전술 HUD 컨셉의 메뉴 아이콘 15종을 `apps/game/public/icons/nav/`에 교체 적용했다(**Verified**: 정적 검사·빌드·PWA·번들 크기 검사).
  - 2차 보완 시안 적용(8종): `홈 1`(정면 전략판), `인벤토리 3`(2×2 자원 슬롯), `유닛 3`(순화 스쿼드), `경제 5`(코인+상승), `세력 2`(1차 3안 육각 문장), `개발자 2`(1차 1안 터미널), `로그아웃 1`(1차 2안 전원 링), `관리자 1`(원형 테두리 제거 자물쇠).
  - 1차 시안 적용(7종): `2차맵 2`, `1차맵 4`, `처리할 일 1`, `우편 1`, `설정 2`, `운영자 콘솔 1`, `메뉴 편집 4`.
- 교체 전 기존 아이콘 21종(`apps/game/public/dev/mockups/icons/legacy/*.png`)과 시안 비교 보드 3장(`board-r2-part1.png`, `board-r1-main.png`, `board-r1-system.png`)을 보관 폴더에 저장했다.
- 개발자 전용 **시안 모음(`/dev/mockups`)** 페이지(`MockupsGalleryScreen.tsx`, `mockupsGallery.css`)를 추가하고 `[아이콘]` 탭에서 시안 보드 3장(클릭 확대 라이트박스 `<dialog>`)과 현재 적용·기존 보관 아이콘 21종 비교 그리드를 볼 수 있게 했다.
- `dev_mockups` 주소를 라우트 표(`packages/shared/src/routes.ts`), `DevHome.tsx`, `routeViews.tsx`, `scopeRoutes.ts`, `SideMenu.tsx`, `vite.config.ts`·`scripts/pwa-build.mjs`(개발 전용 조각 미리 캐시 제외)에 연결하고 한국어·영어 메시지 14쌍을 추가했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/public/icons/nav/*.png` | 사용자 선택 15종 SF 메뉴 아이콘 교체 반영 |
| `apps/game/public/dev/mockups/icons/board-*.png`, `legacy/*.png` | 시안 보드 3장과 교체 전 기존 아이콘 21종 보관 |
| `apps/game/src/editor/mockups/MockupsGalleryScreen.tsx`, `mockupsGallery.css` | 개발자 시안 모음 화면 및 `[아이콘]` 탭(보드 확대 보기·현재/기존 비교) |
| `packages/shared/src/routes.ts`, `apps/game/src/editor/DevHome.tsx`, `apps/game/src/shell/routeViews.tsx`, `apps/game/src/shell/SideMenu.tsx`, `apps/game/src/scope/scopeRoutes.ts` | `/dev/mockups` 개발자 라우트 등록·메뉴 연결·범위 표시 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs` | `MockupsGalleryScreen-*` 개발 전용 조각을 PWA 미리 캐시에서 제외 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 시안 모음 페이지 한국어·영어 문구 추가 |

## 함께 바꿔야 하는 파일
- 개발 전용 화면을 추가할 때는 `apps/game/vite.config.ts`의 `workbox.globIgnores`와 `scripts/pwa-build.mjs`의 `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`를 함께 갱신한다.

## 건드리지 말 것
- `apps/game/public/dev/mockups/icons/legacy/`의 기존 아이콘 보관본은 비교용으로 유지한다.

## 미검증·TODO·알려진 문제
- 이미지 생성 할당량 초기화(`2026-11-25 08:39 KST`) 이후 나머지 2차 시안 보드(`2차맵`·`1차맵` 추가안, `처리할 일`·`우편` 정면/주파수, `설정` 고대비 슬라이더·`관리자` 1/2 고대비, `운영자 콘솔` 두꺼운 그래프·`메뉴 편집` 디테일)를 추가 생성해 `/dev/mockups` `[아이콘]` 탭에 더할 예정이다.

## 사용자 결정 대기
- 없음.
