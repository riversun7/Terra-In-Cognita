# 사이보그 초상을 3D 외형으로(강하 요약·사이보그 화면·위 띠 얼굴)

- 일시: 2026-11-12 02:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-character-3d.md` "바뀜 (2026-11-12, 초상)", 사용자 지적 2026-11-12("마지막 2d이미지는 만든 외형과 전혀 다른 옛날 이미지")

## 한 일
- 강하 요약(온몸)·강하 캡슐(머리)·사이보그 화면(온몸)·위 띠 얼굴(머리·어깨)을 3D 외형 썸네일 초상으로 바꿨다. 옛 2D 그림은 그리는 동안·WebGL 없음일 때만.
- 썸네일 렌더러에 구도 `face` 추가(`body`는 그대로).
- 초상 기억: 열쇠(구도·크기·배율·외형 표지)마다 한 번, 같은 틱 요청은 모아 그림, 48장 상한, 위 띠 얼굴은 기기 저장소에 한 장.
- 길잡이 상태에 3D 외형(look). 만들기·한 번 고르기가 넘겨 위 띠 얼굴이 바로 바뀐다.
- 미리 보기 엔진 받기를 `cyborg/previewEngine.ts`로 옮겼다(만들기 화면·초상이 함께 쓴다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/characters/characterPreview.ts`, `previewEntry.ts` | 썸네일 구도 `face`(넷째 인수), `pose`의 겨냥 높이 |
| `apps/game/src/cyborg/portrait.ts`, `portrait.test.ts` | 초상 열쇠·기억·모아 그리기·저장소, 훅 `usePortrait` |
| `apps/game/src/cyborg/CyborgPortrait.tsx`, `portrait.css` | 초상 칸(data-portrait 3d·2d, data-look = 3D 외형 표지) |
| `apps/game/src/cyborg/previewEngine.ts` | 엔진 조각 받기(옮김) |
| `apps/game/src/start/placeSteps.tsx`, `StartScreen.tsx` | 강하 요약이 3D 외형을 받아 초상으로 |
| `apps/game/src/cyborg/CyborgScreen.tsx` | 사이보그 화면 초상 |
| `apps/game/src/shell/TopBar.tsx`, `TopBarFace.tsx`, `Shell.tsx`, `shell.css` | 위 띠 얼굴(지연 조각) |
| `apps/game/src/start/cyborgGate.ts`(+시험), `cyborg/LookPick.tsx` | 길잡이 상태 look, mark 함수가 look을 넘김 |
| `apps/game/src/start/CharacterPreviewPane.tsx`, `LooksStep.tsx` | 엔진 받기 import 자리 |
| `e2e/first-login.spec.ts`, `e2e/character-3d.spec.ts` | 요약·사이보그 화면·위 띠 초상 확인, 다시 고르면 위 띠가 바로 바뀜 |

## 함께 바꿔야 하는 파일
- 초상을 그리는 새 자리는 `CyborgPortrait`를 쓴다(옛 2D `CyborgAvatar`는 fallback으로만).

## 건드리지 말 것
- `renderCharacterThumbnails`의 `body` 구도 값(프리셋 썸네일과 같다).

## 미검증·TODO·알려진 문제
- Verified: `pnpm vitest run` 초상·길잡이 시험 15개 통과. 빌드·`check-pwa`·`check:bundle`(첫 화면 108,894B / 131,416B, 초상 모듈은 첫 화면 소스 맵에 없음). e2e 4개 통과(first-login 일곱 단계, 390 파스텔·다크 ko 사진, character-3d 한 번 고르기).
- Assumed: 첫 화면 크기 증가는 `lazy`·`Suspense` 정도(기준 빌드와 비교하지 않음).
- Unknown: 실제 휴대폰에서 위 띠 얼굴 첫 그리기 시간(헤드리스 SwiftShader만 봄).
- 위 띠 얼굴 구도(머리 위쪽이 조금 잘린다)는 [임시] 값이다.

## 사용자 결정 대기
- 없음

## 사진
- `look-portrait-shots/first-login-7-descent-390-{pastel,dark}-ko.png`, `look-portrait-relook-390-pastel.png`(scratchpad)
