# 사이보그 초상에서 옛 2D 그림 지우기

- 일시: 2026-11-14 18:20 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 지적 2026-11-14 "내 사이보그를 들어가면 기존의 2d 사이보그 이미지가 빠르게 떳다가 사라진다 왜 구식 코드및 이미지가 남아있냐?". ADR `docs/adr/2026-11-11-character-3d.md` "바뀜 (2026-11-14, 2D 제거)"(앞 "바뀜 (2026-11-12, 초상)"). 질문 `docs/questions/2026-11-14-portrait-fix.md`(1421~1423). 가지 `work/portrait-fix`(바탕 `d0c7ece`). 판 올림 없음.

## 원인 (Verified: 코드 읽기 + 화면 시험)
- 사이보그 화면 초상(`CyborgPortrait`)은 3D 썸네일을 그리는 동안 `fallback`을 보였고, 사이보그 화면은 거기에 옛 2D 그림(`CyborgAvatar` — 옛 외형 부위 넷 + 색 둘의 SVG, 빛 고리)을 넣었다.
- 기기 저장소에는 위 띠 얼굴 한 장만 남겨(`persist`), 사이보그 화면은 새로 고침·다시 켤 때마다 엔진(three)을 받고 다시 그렸다 → 들어갈 때마다 옛 2D 그림이 잠깐 보였다. 앱 안 이동은 메모리 기억(48장)이 있어 바로 보였다.

## 한 일
1. **옛 2D 그림 지움**: `apps/game/src/cyborg/CyborgAvatar.tsx`(SVG 그림 전부와 `mixHex`). 쓰던 곳 다섯을 모두 바꿨다.
   | 자리 | 전 | 뒤 |
   |---|---|---|
   | 사이보그 화면 초상(그리는 동안·WebGL 없음·외형 없음) | 옛 2D 온몸 + 빛 고리 | 실루엣(구도 body) |
   | 강하 요약 초상(`placeSteps.tsx`) | 옛 2D 온몸 | 실루엣 |
   | 강하 캡슐 얼굴(`placeSteps.tsx`) | 옛 2D 얼굴 | 실루엣(구도 face) |
   | 외형 단계 3D 미리 보기를 받는 동안·WebGL 없음(`CharacterPreviewPane.tsx`) | 옛 2D 온몸 + 문구 | 실루엣 + 문구(받는 동안 깜박임) |
   | 외형 프리셋 썸네일을 만들기 전·못 만들 때(`LooksStep.tsx`) | 옛 2D 얼굴 24개 | 실루엣 24개(못 만들면 멈춤) |
2. **실루엣** `apps/game/src/cyborg/CyborgSilhouette.tsx`: 무늬 없는 한 색 덩어리(머리 + 몸 / 머리 + 어깨), 색 `--color-border`, 정사각 viewBox라 3D 초상 img와 같은 자리. 그리는 중이면 깜박임(`prefers-reduced-motion`이면 없음). 위 띠 얼굴은 전처럼 사이보그 아이콘.
3. **초상 상태 표지** `data-portrait`: `3d`·`pending`·`none`(`2d` 없앰). `usePortrait`가 `{ url, state }`를 준다.
4. **기기 저장소** `terra.portrait`: 한 장 → 최근 4장 목록(`PORTRAIT_STORED_MAX`, 옛 한 장 값도 읽음, 가득 차면 오래된 것부터 버리고 다시 씀). 사이보그 화면 초상도 `persist` → 새로 고침·다시 켬에도 첫 그림 틀부터 3D. img `decoding="sync"`(저장한 초상이 빈 틀 없이 바로).
5. 문구: `start_looks_unsupported` "그림으로" → "실루엣으로"(ko·en).
6. 옛 2D 남은 것 찾기(`apps/game` 전체, `appearance`·SVG 부위·CSS): 그림 코드는 `CyborgAvatar` 하나뿐이었다. 그 그림만을 위한 CSS 줄(`color: var(--color-text)` — SVG 테두리 색) 넷을 뺐다(`.cyborg-avatar`·`.start-summary-avatar`·`.start-scene-face`·`.start-preset-face`). 남긴 것은 아래 "사용자 결정 대기".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/cyborg/CyborgAvatar.tsx` (지움) | 옛 2D 그림 |
| `apps/game/src/cyborg/CyborgSilhouette.tsx` (새) | 그리는 동안·못 그릴 때의 무늬 없는 실루엣 |
| `apps/game/src/cyborg/CyborgPortrait.tsx` | fallback 선택 칸(기본 실루엣), 표지 3d·pending·none |
| `apps/game/src/cyborg/portrait.ts`(+시험) | 상태를 주는 `usePortrait`, 기기 저장 4장 목록·옛 값 읽기·가득 참 처리 |
| `apps/game/src/cyborg/portrait.css` | 실루엣 모양·깜박임 |
| `apps/game/src/cyborg/CyborgScreen.tsx`, `cyborg.css` | 2D 대신 그림 빼고 `persist` |
| `apps/game/src/start/placeSteps.tsx`, `CharacterPreviewPane.tsx`, `LooksStep.tsx`, `looks.css`, `start.css` | 2D 대신 실루엣, 프리셋 썸네일 실패 상태 |
| `apps/game/messages/{ko,en}.json` | 3D 미리 보기 없음 문구 |
| `e2e/cyborg.spec.ts` | 새 시험: 그림 틀마다 초상 상태를 적어 옛 2D 없음·다시 열면 첫 틀부터 3D(390 파스텔·다크, 새로 고친 바로 뒤 사진) |
| `docs/adr/2026-11-11-character-3d.md` | "바뀜 (2026-11-14, 2D 제거)" |
| `docs/questions/2026-11-14-portrait-fix.md` | 1421~1423 |

## 시험 (Verified: 실행)
- 단위: `apps/game/src/cyborg/portrait.test.ts` 13개 통과(새 셋: 4장 목록·옛 한 장 값·가득 참). 게임 앱 vitest 1,236개 중 1,231 통과·5 실패는 `apps/game`에서 돌렸을 때 CSS `?raw` 설정이 안 잡힌 것(`layout.test.ts`·`themeSources.test.ts`, 저장소 뿌리에서 돌리면 16개 통과 — 이 줄기와 상관없음).
- 화면 시험(`pnpm e2e cyborg.spec.ts first-login.spec.ts character-3d.spec.ts units.spec.ts play-map.spec.ts`): **73 통과, 2 건너뜀(측정 전용), 실패 0**(10.2분).
  - 새 시험 `cyborg.spec.ts` "초상에 옛 2D 그림 없음 (390 pastel·dark)": 그림 틀(requestAnimationFrame)마다 초상 칸 상태를 적어, 처음 들어갈 때는 `pending`·`3d`만, 새로 고친 뒤와 다른 화면에서 위 띠 얼굴로 돌아온 뒤에는 첫 틀부터 `3d`만, 실루엣이 아닌 svg(옛 2D 그림) 0.
  - `first-login.spec.ts`(강하 요약·캡슐·외형 단계 프리셋 썸네일 24개)·`character-3d.spec.ts`(한 번 고르기 뒤 초상·위 띠 얼굴)·`units.spec.ts`·`play-map.spec.ts` 그대로 통과.
- 사진(새로 고친 바로 뒤, 390): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/portrait-fix-shots/cyborg-portrait-revisit-390-pastel.png`·`…-dark.png`(임시 폴더) — 3D 초상이 바로 보인다.
- 빌드 + `node scripts/check-pwa.mjs` 통과. `pnpm check:bundle` 첫 화면 JS 109,203B / 상한 131,416B(초상 코드는 지연 조각이라 첫 화면과 상관없음).
- `pnpm check`(TEST_DATABASE_URL 있음) 통과: 시험 파일 693개·시험 5,229개.

## 함께 바꿔야 하는 파일
- 초상 상태 표지를 보는 시험(`e2e/first-login.spec.ts`·`character-3d.spec.ts`·`cyborg.spec.ts`)과 `apps/game/src/shell/shell.css`(`[data-portrait="3d"]`).

## 건드리지 말 것
- 옛 외형 자료 칸 `appearance`·`@terra/shared/cyborgLooks`·`legacyAppearanceOf`: 그림이 아니라 서버·프로토콜 자료다(질문 1421·1422).

## 미검증·TODO·알려진 문제
- 실제 휴대폰(NAS)에서 보지 않았다(Unknown). 헤드리스 Chromium(SwiftShader)에서만 봤다.
- 처음 한 번(또는 외형을 바꾼 직후)은 여전히 실루엣이 잠깐 보인다(그릴 때까지). 외형을 고르는 곳(만들기·한 번 고르기)에서 미리 그려 둘 수 있으나 하지 않았다.

## 사용자 결정 대기
- 1421 옛 외형 칸 `appearance` 뺄지, 1422 옛 부위 목록 지울지, 1423 실루엣 모양.
