# main CI 빨강 고침: 구인 카드 개발 화면 조각을 미리 캐시에서 뺌

- 일시: 2026-11-03 15:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-29-planet-editor-stage1.md` 1절(개발자 도구 조각은 미리 캐시하지 않음), 구인 카드 합치기(main `146d898`)

## 한 일
- main `146d898`·`de836bb`의 CI `check` 단계가 `node scripts/check-pwa.mjs`에서 실패했다: sw.js가 `assets/RecruitLabScreen-*.js`·`.css`를 미리 캐시함.
- 원인: 구인 카드 가지가 `scripts/pwa-build.mjs`의 `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`에는 `RecruitLab`·`recruit`를 넣었지만, 같은 목록을 두는 `apps/game/vite.config.ts` workbox `globIgnores`에는 넣지 않았다.
- 고침: `globIgnores`에 `assets/[Rr]ecruitLab*.{js,css}`를 더하고 주석 목록에 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/vite.config.ts` | 구인 카드 시험 화면 조각을 미리 캐시에서 뺌 |

## 함께 바꿔야 하는 파일
- 새 개발자 화면 조각을 더하면 `apps/game/vite.config.ts` `globIgnores`와 `scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`를 함께 고친다.

## 검사
- (Verified) `pnpm build` → `node scripts/check-pwa.mjs` 통과 → `pnpm check:bundle` 통과.
- 놓친 까닭: 로컬 `pnpm check`와 화면 시험에는 `check-pwa`가 없다(CI는 `pnpm build` 뒤 `check-pwa`·`check:bundle`을 돈다). 합치기 전 검사에 `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle`을 더한다.

## 건드리지 말 것
- 없음.

## 미검증·TODO
- 없음.
