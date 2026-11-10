# 크리처 편집기 초상화 선택 범위 오차 고침: 고르는 쪽·그리는 쪽이 같은 계산을 쓴다

- 일시: 2026-11-10 21:50 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 보고(2026-11-10, 원문) "문제2. 크리쳐에디터에 초상화 선택범위가 오차가 심하다", ADR `2026-11-10-creature-portrait-crop.md`, 작업 기록 `08-1650-creature-editor.md`(편집기를 만든 기록), 줄기 `work/creature-portrait`

## 한 일
- 고치기 전 오차를 화면에서 쟀다(아래 "원인과 측정").
- 초상화 좌표 계산을 `@terra/shared/portraitCrop` 한 곳에 두고, 선택기(원 테두리·포인터)와 배지(목록·상세 머리·미리보기)가 그것만 쓰게 했다. 저장 형식(`cxPm`·`cyPm`·`radiusPm`, 정수 ‰)은 그대로다 → 팩 91종·그 세계 덮어쓰기를 옮기지 않았다.
- 선택기를 다시 만들었다(`CreaturePortraitCropper.tsx`).
  - 원 안을 끌면 잡은 자리 그대로 옮긴다. 원 밖을 누르면 그 자리가 가운데가 된다. 원 안을 누르기만 하면 그대로다.
  - 크기: 원 테두리의 손잡이(잡은 자리 그대로), 두 손가락, [원 크기] 막대, 그림을 누른 뒤 휠(한 칸 = 너비의 1%, Shift = 1화소).
  - 키: 화살표 = 그림 1화소(Shift 10화소), `+` `−` = 반지름, Ctrl+Z = 되돌리기.
  - 수치 칸: 가운데 X·Y, 반지름(‰, 공용 `NumberField`). 칸 아래에 그림 화소 값을 같이 적는다.
  - 실제 크기 미리보기 96·48·32px(끄는 동안 따라온다).
  - [되돌리기](50걸음, 한 번 끈 것 = 한 걸음, 같은 곳에서 0.7초 안에 이어진 키·휠·칸 입력 = 한 걸음), [적용된 값으로](그 세계에 든 값), [기본 원], [얼굴·머리 자동 인식].
  - 끄는 동안은 선택기 안에서만 값을 들고 손을 뗄 때 한 번 올린다.
  - 문구를 메시지 키(ko·en 26개)로 옮겼다.

## 원인과 측정
고치기 전(main `9427ed1`, 빌드한 앱, 헤드리스 Chromium. 단위는 그림 화소. Verified — 임시 측정 시험을 돌린 값, 시험 파일은 지웠다):

| 본 것 | 512화소 그림(wolf) | 1,024화소 그림(king_cobra) |
|---|---|---|
| 선택기에 보이는 원의 가운데 − 저장 값의 가운데 | (+153.59, +153.58) | (+307.19, +307.17) |
| 보이는 원의 가운데를 목표 점으로 끈 뒤, 저장 값 − 목표 | (−0.51, +0.51) | (−1.02, +1.02) |
| 같은 때, 보이는 원의 가운데 − 목표 | (+153.08, +154.09) | (+306.16, +308.17) |
| 손잡이를 끈 뒤 반지름 | 그대로(바뀌지 않음) | 그대로 |
| 배지가 그린 가운데 − 저장 값 | 0.16 이하 | 0.32 이하 |

- 첫 줄 값은 1440(기기 화소 비율 1), 960(1.5 = 확대 150%), 720(2 = 확대 200%), 390(3) 네 크기와 스크롤 여부에서 모두 같았다. 반지름 300‰ = 153.6화소(512) 그대로다.
- 원인 1(보고된 오차의 거의 전부): 선택기의 원(`.ce-crop-circle`)이 `left·top`에 원의 **가운데** 좌표를 넣고 당기지 않았다 → 원의 왼쪽 위 모서리가 가운데 자리에 놓였다. 보이는 원은 저장되는 원보다 오른쪽 아래로 반지름만큼 어긋난다. 배지는 저장 값대로 그리므로 "고른 곳과 초상화가 다르다".
- 원인 2: 그 어긋남 때문에 손잡이(원의 오른쪽 아래)가 그림 상자 밖으로 나가 잘렸다(가운데 + 2 × 반지름 > 1000‰, 팩 91종 모두 해당). 잡히더라도 반지름을 "저장 값의 가운데에서 포인터까지"로 재서 값이 튄다.
- 원인 3: 포인터 위치는 테두리를 포함한 상자(`getBoundingClientRect`)로 재고 원은 테두리 안쪽 상자의 %로 놓았다 → 테두리 1px만큼 어긋남(표 둘째 줄의 0.51·1.02에 든다).
- 원인 4: 선택기는 그림을 정사각 상자에 늘려 그리고(`object-fit: fill`) 배지는 잘라 채웠다(`cover`). 정사각이 아닌 그림이면 서로 다른 곳이다. 지금 그림 91장은 모두 정사각(512×512 89장, 1024×1024 2장)이라 드러나지 않았다.
- 원인 5: 배지는 반지름을 80‰ 아래로 내리지 않았다(저장 범위는 50‰부터).
- 원인 6(390): 처음 고친 순간 위쪽 "담김" 표지와 담은 변경 막대가 생겨 끄는 중에 그림이 손가락 밑에서 밀렸다(측정에서 세로 33 CSS px = 59.9화소).
- 원인 7: TSX가 쓰는 클래스(`ce-portrait-workbench`·`ce-crop-controls`·`ce-slider-row` 등)가 CSS에 없었다(CSS에는 `ce-portrait-body`·`ce-portrait-controls`·`ce-slider-label`) → 그림과 조작부가 나란히 놓이지 않았다.
- Assumed: 옛 휠 처리(`onWheel` 안 `preventDefault`)는 React가 휠을 passive로 달아 쪽 스크롤을 막지 못했을 것이다(재지 않았다).
- 화면 화소·기기 화소 비율·스크롤 혼동은 없었다(네 크기에서 값이 같다).

고친 뒤(`e2e/creatures.spec.ts`, Verified): 누른 화면 점 밑의 그림 화소와 저장 값 가운데 사이 거리.

| 경우 | 거리(그림 화소) |
|---|---|
| 1440 마우스, 원 밖 누르기, 512화소 그림 | 0.25 |
| 1440 마우스, 1,024화소 그림 | 0.49 |
| 1440, 쪽을 57px 스크롤한 뒤 누르고 [즉시 반영]한 서버 값 | 0.17 |
| 960 × 기기 화소 비율 1.5(확대 150%) | 0.27 |
| 390 터치 두드리기 | 0 |
| 390 터치 끌기(원 가운데를 잡아 놓기) | 0.31 |
| 300×200 그림(가짜) | 0.05 |

보이는 원 = 저장 값(가운데·반지름 0.5화소 미만), 배지 그림 자리 = `portraitImageRect`(0.1 CSS px 미만)도 같은 시험이 본다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/portraitCrop.ts`, `portraitCrop.test.ts`, `package.json` | 초상화 좌표 계산 한 곳(‰ ↔ 그림 화소 원, 화면 상자 ↔ 그림 화소, 원 테두리, 배지 그림 자리·CSS, 화소만큼 옮기기)과 단위 시험 21개. 하위 경로 `@terra/shared/portraitCrop` |
| `packages/shared/src/creatureEditor.ts`, `packages/content/src/schema/creatures.ts` | 주석만: ‰가 무엇의 ‰인지, 기준 모듈 |
| `apps/game/src/editor/creatures/CreaturePortraitCropper.tsx` | 선택기를 다시 만듦(위 "한 일") |
| `apps/game/src/editor/creatures/CreatureTokenBadge.tsx` | 배지를 따로 떼고 `portraitImageStyle`만 쓰게 함. 선택기 파일이 다시 내보내 목록·상세의 import는 그대로 |
| `apps/game/src/editor/creatures/creaturePortraitDetect.ts` | 머리 자리 어림을 따로 뗌(계산은 그대로). 그림을 못 읽으면 기본 원을 돌려준다. 주석의 "FaceDetector 먼저 시도"는 코드에 없어 지웠다 |
| `apps/game/src/editor/creatures/creatureEditor.css` | 초상화 배지·선택기 절만: 그림 상자는 테두리 없이(테두리는 바깥 틀), 원은 상자 끝이 곧 원(테두리는 안쪽 그림자), 손잡이 누르는 곳 `--dev-touch-tap`, TSX와 클래스 이름 맞춤 |
| `apps/game/src/editor/creatures/CreatureDetail.tsx` | 선택기에 `appliedCrop`(그 세계에 든 값) 한 줄 |
| `apps/game/messages/ko.json`, `en.json` | `dev_creature_crop_*` 26개(크리처 키 바로 뒤에 넣음) |
| `e2e/creatures.spec.ts` | 새 화면 시험 8개(마우스·확대·터치·키·휠·수치 칸·되돌리기·적용·정사각 아닌 그림·사진) |
| `docs/adr/2026-11-10-creature-portrait-crop.md` | 단위와 "계산은 한 곳" 결정 |

## 함께 바꿔야 하는 파일
- 초상화 좌표 범위: 팩 스키마 `creaturePortraitCropSchema` ↔ `PORTRAIT_CROP_LIMITS`(`portraitCrop.ts`) ↔ `CREATURE_LIMITS.portraitCoordPm`·`portraitRadiusPm`(`creatureEditor.ts`). 뒤 둘은 `portraitCrop.test.ts`가 견준다.
- 크리처 초상화를 새로 그리는 곳(맵 토큰 등)은 `portraitImageRect`·`portraitImageStyle`을 쓴다. 직접 계산하지 않는다.
- 선택기의 클래스·`data-crop`·`data-natural`·`data-ready`·`data-dragging`을 바꾸면 `e2e/creatures.spec.ts`도 바꾼다.

## 건드리지 말 것
- `.ce-crop-stage`에 테두리·안쪽 여백을 주지 않는다(포인터 계산이 "상자 끝 = 그림 끝"에 기대고 있다). 테두리는 `.ce-crop-frame`에 준다.
- `.ce-crop-circle`에 `border`를 주지 않는다(상자 끝 = 원). 테두리는 안쪽 그림자다.
- 배지 그림에 `object-fit`·`height`를 주지 않는다(`height: auto`로 그림 비율을 따른다).

## 미검증·TODO·알려진 문제
- Verified: `pnpm check`(TEST_DATABASE_URL 포함, 시험 파일 570개·시험 4,348개 통과), `pnpm build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 JS 107,713 B / 상한 131,416 B), `pnpm e2e creatures`(8개 통과), `pnpm check:docs origin/main`.
- Verified(사진, 헤드리스 Chromium): 1440 네온·라이트, 390 네온.
- Unknown: 실제 휴대폰(iOS Safari·Android Chrome)에서의 두 손가락 손짓. 시험은 Chromium에 CDP로 보낸 터치다.
- Unknown: Firefox·Safari에서의 휠·포인터 동작(재지 않았다).
- 알려진 한계: 너비가 1,000화소를 넘는 그림은 1화소가 1‰보다 작다(1,024화소 그림에서 화살표 한 번 = 1.02화소).
- 알려진 한계: 그림 상자에는 `touch-action: none`이라 휴대폰에서 그림 위를 쓸어서는 쪽이 스크롤되지 않는다(옆·아래를 쓴다. 고치기 전과 같다).
- 범위 밖이라 그대로 둔 것: 크리처 편집기의 다른 문구는 여전히 코드 안 한국어·영어 글이다(메시지 키 아님). 파일 이름 칸에 글자를 칠 때마다 그림을 새로 읽고 머리 자리를 어림한다(원래 동작).
- TODO: 크리처를 게임 화면(2차맵 토큰 등)에 그릴 때 `portraitImageRect`로 그린다(아직 그리는 곳이 없다).

## 사용자 결정 대기
- 없음. 정사각이 아닌 그림에서 반지름을 너비 기준으로 한 것은 ADR에 적었다(지금 그림은 모두 정사각이라 값이 같다).
