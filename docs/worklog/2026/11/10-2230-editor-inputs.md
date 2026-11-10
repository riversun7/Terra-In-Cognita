# 편집기 입력 조작: 수 조작 칸·분포 막대·표 묶음 바꾸기

- 일시: 2026-11-10 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-10-editor-input-controls.md`(제안), ADR `2026-11-01-dev-settings-panel.md`·`2026-11-01-item-editor.md`·`2026-11-01-skill-editor.md`·`2026-11-02-building-editor.md`·`2026-11-01-balance-screen.md`의 "바뀜 (2026-11-10)", PLAN 14장 "편집기 입력 조작" 줄, 브랜치 `work/editor-inputs`

사용자 지적(2026-11-10, 원문): "에디터 편집기들이 전체적으로 ux,ui가 직관적이지 않고 조작이 매우 불친절하다. 확률을 수치를 직접하나하나 써야하는 등 밸런스조절 어려움."

## 한 일

- 공용 조작부를 만들었다(`apps/game/src/editor/content/`, 새 의존성 없음).
  - 수 조작 칸: − / + 단추(누르고 있으면 잇달아), 막대(팩 값 눈금 — 누르면 팩 값), 이름표 끌기, ↑↓·PageUp/PageDown, 초점이 있을 때 휠. Shift = 10배, Alt = 1. 넓은 범위는 로그 눈금이나 값 둘레 창. 범위 밖 정수는 칸을 떠날 때 끝 값으로 맞추고 까닭을 적는다.
  - 분포 막대: 쌓은 막대의 경계 끌기, 칸마다 막대·값·잠금, 균등·정규화·팩 값으로. 한 칸을 바꾸면 잠그지 않은 나머지가 지금 몫대로 따라 움직여 합이 그대로다.
  - 표 묶음 바꾸기: 칸 여러 개 고르기(Shift·Ctrl, 머리 = 열 전체) → 값으로·더하기·곱하기(%)·선형 채우기·등비 채우기, 칸 모서리 끌어 채우기, 열마다 작은 곡선.
  - 사다리(레벨·등급마다 값 하나), 마지막 고침 되돌리기(Ctrl+Z).
- 공용 정수 칸 `NumberField`가 수 조작 칸을 쓴다 → 그 칸을 쓰는 편집기(아이템·스킬·건물·효과 사전·크리쳐)에 한꺼번에 들었다. 새 국가 편집기(`/dev/nations`, 다른 줄기)도 공용 칸을 쓰면 그대로 든다(`NumberField`의 기존 속성은 그대로, 새 속성 `slider`·`scale`·`soft`·`step`·`pack`은 선택).
- 화면마다:
  - 설정 칸 패널: 값 칸 = 수 조작 칸(이름 끌기 포함). 조작한 값은 바로 담기고 담은 값 옆에 팩 대비 차이. ↑↓는 값 한 걸음(줄은 Enter·Shift+Enter).
  - 1차 생산 티어 확률: 표 위에 구간 조절 판(분포 막대, 평균 티어·권장 밖 몫 읽기). 행렬 칸을 고치면 나머지가 따라 움직여 합이 늘 1000‰. 묶음 바꾸기·끌어 채우기·티어마다 구간별 곡선. 합 열 → 평균 티어 열.
  - 건물: 건설 재료에 구간 × 재료 표(묶음 바꾸기, [레벨마다 나누기]), 레벨 표에 곡선 줄·합계 줄.
  - 스킬: 등급 배율이 사다리 표(값 칸 + 막대 + 묶음 바꾸기).
  - 밸런스: 가중치 표·기준 유닛 1차·전투 실험실 수 칸에 ↑↓·휠(단추·막대 없이).
- Ctrl+Z(마지막 고침 되돌리기)를 티어 확률·설정 칸·건물·스킬·효과 사전·크리쳐·아이템 편집기에 넣었다. 기존 담은 변경 모델에 맞아 단순 구현이 들어갔다(담은 변경 값을 통째로 쌓는다). 다시하기는 아이템 편집기에만 있다(전부터 있던 단추).

### 수 칸 목록(어느 조작부를 쓰는가)

| 화면 | 수 칸 묶음 | 조작부 |
|---|---|---|
| `/dev/tuning` | 설정 칸 값(칸마다 범위) | 수 조작 칸(단추·막대·이름 끌기·키·휠). 합이 정해진 묶음 없음 |
| `/dev/gather-tiers` | 구간 12 × T0~T9 가중치(‰, 구간마다 합 1000) | 분포 막대(구간 조절 판) + 행렬(자동 맞춤·묶음 바꾸기·곡선) |
| `/dev/items` | 값(티어·시작 시세·무게·묶음·겹침), 장비(내구도·스탯 최소/최대·속성 값·방어·관통·내성 4), 무기(적정 1차·공격·명중·치명·간격·사거리·소모·속성 배율), 사용 효과(효과량·확률·지속·적정 스탯·편차·유통 기한), 분류 차례, 대량 도구(티어·시세 ‰), 미리 보기 유닛 | 수 조작 칸(`NumberField`). 합이 정해진 묶음 없음(내성·속성 배율은 칸마다 따로) |
| `/dev/skills` | 사거리·반경·연쇄·소모·시전·재사용, 계산 조각(‰·값), 조건 %, 행동별 소모 표 | 수 조작 칸(표 칸은 단추만) |
| `/dev/skills` | 등급 배율 `gradePm[]` | 사다리(값 칸 + 막대 + 묶음 바꾸기·끌어 채우기·곡선) |
| `/dev/buildings` | 최고 레벨·자리·오염·내구도·창고, 채집 수확량 3칸, 2차맵 칸 크기·높이, 분류 배율, 구간 시작 레벨, 수리 재료 수량 | 수 조작 칸 |
| `/dev/buildings` | 구간 × 재료 수량 | 구간 × 재료 표(묶음 바꾸기·끌어 채우기·레벨별 곡선) + 구간 판의 수 조작 칸 |
| `/dev/creatures` | 1차 6·총합 예산, 전투 탭 14칸, 전리품(확률 ‰·최소·최대 — 줄마다 따로 굴리는 확률이라 합 묶음이 아님) | 수 조작 칸(`NumberField`). 속성 점수 막대(`type="range"`)와 초상화 자르기는 그대로 |
| `/dev/effects` | 저항 상한·반감 상수·1차 가중치 6, 지속·주기·최대 겹침 | 수 조작 칸 |
| `/dev/recruit` | 수 칸 없음(카드 보기·고용. 카드 확률은 설정 칸에 있다) | — |
| `/dev/balance` | 가중치 표(행 × 1차 6 + 기본·상한·반감), 기준 유닛 1차, 전투 실험실·분석 수 칸 | 수 조작 칸(단추·막대 없이 ↑↓·PageUp/PageDown·휠) |

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/content/contentEditorNumeric.ts`(+ `.test.ts`) | 순수 셈: 막대 범위·로그 눈금·걸음, 다시 나누기·경계 옮기기·균등·합 맞춤, 묶음 바꾸기·끌어 채우기·곡선 |
| `…/content/contentEditorNumber.tsx` | 수 조작 칸 `NumberControl`, 막대 `SliderTrack`, 끄는 값 `useDragCommit` |
| `…/content/contentEditorDistribution.tsx` | 분포 조작 `DistributionControl` |
| `…/content/contentEditorGrid.tsx`·`contentEditorLadder.tsx` | 표 칸 고르기·묶음 바꾸기 막대·곡선, 사다리 |
| `…/content/contentEditorUndo.ts` | 되돌리기 칸·Ctrl+Z·칸 열쇠 |
| `…/content/contentEditorInputs.css` | 조작부 스타일(토큰만) |
| `…/content/contentEditorFields.tsx`·`contentEditorLayout.tsx` | `NumberField`가 수 조작 칸을 쓴다(범위 밖 맞춤 문구, 단위는 칸 오른쪽), 키 안내 두 줄 |
| `…/tuning/TuningRow.tsx`·`TuningPanelScreen.tsx`·`tuningRows.css` | 값 칸 조작·키·되돌리기, 줄 다시 그리기 줄이기(`memo`) |
| `…/gatherTiers/*`(`GatherBandPanel.tsx` 새 파일) | 구간 조절 판, 행렬 자동 맞춤·묶음 바꾸기·곡선, 되돌리기 |
| `…/buildings/BuildingBandMatrix.tsx`(새 파일)·`BuildingLevels.tsx`·`buildingModel.ts`(+ 시험)·`BuildingEditorScreen.tsx`·`buildingEditor.css` | 구간 × 재료 표, 레벨 곡선·합계, 되돌리기 |
| `…/skills/SkillParts.tsx`·`SkillEditorScreen.tsx`·`skillEditor.css` | 등급 사다리, 되돌리기 |
| `…/effects/EffectDictionaryScreen.tsx`·`creatures/CreatureEditorScreen.tsx`·`items/ItemEditorScreen.tsx` | Ctrl+Z |
| `…/balance/BalanceTable.tsx`·`WeightTab.tsx`·`lab/fields.tsx`·`balancePanel.css` | 칸 키 조작 |
| `apps/game/messages/{ko,en}.json` | 조작부 문구(ko·en), 안 쓰게 된 티어 확률 문구 4개 지움 |
| `e2e/helpers/inputs.ts`·`e2e/{gather-tiers,tuning,items,skills,buildings,effects}.spec.ts` | 막대 끌기 도우미, 새 조작 시험, 바뀐 동작에 맞춘 시험 |
| `docs/adr/…`·`docs/PLAN.md` | 새 ADR, "바뀜" 절, 14장 줄 |

## 함께 바꿔야 하는 파일

- 수 칸을 새로 만들 때는 `NumberField`(이름표 있는 칸·표 칸) 또는 `NumberControl`(글자 상태를 화면이 들 때)을 쓴다. 맨 `<input inputMode="numeric">`을 새로 두지 않는다.
- 합이 정해진 묶음을 새로 만들면 `DistributionControl`을, 레벨·등급 줄은 `LadderEditor`를 쓴다.
- 조작부 문구는 `dev_input_*`·`dev_dist_*`·`dev_grid_*`(메시지 파일 가운데, `dev_content_hint_toggle` 뒤).

## 건드리지 말 것

- 막대는 `<input>`이 아니다(`role="slider"` div). 칸 안의 `input`은 글자 칸 하나라는 것을 화면 시험이 본다(`.칸 input`).
- `.ce-num > .ce-num-row > .input` 규칙의 선택자 깊이(`.ce-field .input`의 `min-width: 0`보다 앞서야 좁은 칸에서 글자 칸이 사라지지 않는다).
- 끄는 동안 바깥에 알리는 간격(80ms)과 되돌리기 묶음 시간(1초)은 `contentEditorNumber.tsx`·`contentEditorUndo.ts` 한 곳.

## 검증

- Verified: `pnpm check`(`TEST_DATABASE_URL` 있음) 통과 — 시험 파일 571개·시험 4,389개. 새 단위 시험: `contentEditorNumeric.test.ts` 39개(막대 범위·로그 눈금·걸음, 다시 나누기·경계·균등, 묶음 바꾸기·채우기·곡선), `buildingModel.test.ts`에 구간 × 재료 표 2개.
- Verified: `pnpm build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle` 통과(main `6bb226d`을 합친 뒤). 새 조각은 `contentEditor…` 이름이라 미리 캐시 밖이다(개발 도구 화면이 늘지 않아 `DEV_ONLY_CHUNK`·도구 수는 그대로).
- Verified: 화면 시험(main을 합친 뒤 한 번에) — `gather-tiers`·`tuning`·`items`·`skills`·`buildings`·`effects`·`creatures`·`balance`·`battleLab`·`dev-stagebar`·`recruit`·`formulas`·`dev` 232개 중 231개 통과, 1개 실패(`dev.spec.ts` "플레이어 … 권한 없음 화면": `/dev`로 간 뒤에도 홈이 보임 — 이 줄기가 고치지 않은 길. 아래 "알려진 문제").
  - 새 시험: 막대 끌기 → 담김(아이템·설정 칸), 경계 끌기 → 두 칸이 바뀌고 합 1000·잠근 칸 그대로·키보드만 조작·균등·팩 값으로·Ctrl+Z(티어 확률), 열 고르기 → 더하기·선형 채우기·끌어 채우기 후 구간마다 합 1000(티어 확률), 등급 사다리 선형 채우기·곱하기·막대 끌기·Ctrl+Z(스킬), 레벨마다 나누기 → 재료 열 선형 채우기 → 레벨 표·합계(건물), 키보드만으로 ↑·Shift+↑·PageDown·Ctrl+Z(효과 사전), 범위 밖 값 맞춤(아이템·설정 칸).
  - 바꾼 시험: 티어 확률 "합이 1000이 아니면 막는다" → "나머지가 따라 움직여 합 1000 그대로", 설정 칸 "↑↓ 줄 옮기기" → "Enter·Shift+Enter 줄, ↑ 값 한 걸음", "범위 밖 값은 떠나도 담기지 않는다" → "끝 값으로 맞춰 담긴다".
  - 초상화 영역 선택기(다른 줄기, main에서 옴)의 수 칸 3개는 새 수 조작 칸으로 그대로 돈다(`creatures.spec.ts` 통과). 선택기의 Ctrl+Z와 편집기 Ctrl+Z가 겹치지 않게 했다(이미 받은 키는 건드리지 않는다).
- Verified: 사진(네온·라이트 × 1440, 네온 390)으로 봄 — `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-inputs-shots/final/`(`inputs-number-*`·`inputs-dist-*`·`inputs-ladder-*`·`inputs-matrix-*`·`inputs-levels-*`, 18장).
- 검토: `web-design-guidelines`(키보드 대안·초점·aria·끄는 동안 글 고르기 막기·`Intl` 수 글·움직임 없음) → 팩 눈금·잠금 단추 hover, 백분율을 `Intl`로, 긴 칸 이름 줄바꿈을 고쳤다. `break-ui` 관점(390px·긴 ko/en·빈 값·큰 수)은 사진과 넘침 시험으로 봤다 — 좁은 칸에서 수 칸 줄이 옆 칸을 덮던 것(스킬 390px), 팩 값 눈금이 손잡이를 가려 끌 수 없던 것, 분포 칸 격자가 깨지던 것(`fit-content`를 `minmax` 안에 씀)을 찾아 고쳤다.

## 미검증·TODO·알려진 문제

- 알려진 문제: `e2e/dev.spec.ts` "플레이어 › 사이드 메뉴에 [개발자]가 없고 … 권한 없음 화면" 1개가 마지막 묶음 실행(13개 파일을 이어 돌림)에서 실패했다(`/dev`로 간 직후 홈 화면이 보임). `dev.spec.ts`만 따로 다시 돌리면 12개 모두 통과했다(Verified). 이 줄기는 길 찾기·권한·개발자 홈을 바꾸지 않았다 — 까닭은 Unknown(부하나 앞 시험의 영향으로 보임, Assumed).

- 남은 것(하지 않음):
  - 크리쳐 속성 점수 막대(`type="range"`)는 그대로다. 크리쳐 편집기 문구는 전처럼 코드에 직접 적혀 있다(다른 줄기 몫).
  - 아이템 목록의 거르기 칸(티어 최소·최대)은 자료 칸이 아니라 그대로 글자 칸이다.
  - 밸런스 가중치 표에는 묶음 바꾸기·막대가 없다(키 조작만). 설정 칸 패널에는 여러 줄 묶음 바꾸기가 없다.
  - 행성·항성계·2차맵 실험실 편집기는 범위 밖이라 보지 않았다.
  - 표 칸(이름표 숨김)에는 이름표 끌기가 없다. 끌어 채우기는 포인터 전용이다(키보드는 범위를 고르고 [값으로]).
  - 분포 막대는 티어 확률표 하나에만 든다. 다른 편집기에서 합이 정해진 묶음을 찾지 못했다(Verified: `sum`·`합`·`_TOTAL`로 편집기·공용 규칙을 찾아봄).
- Unknown: 실제 휴대폰에서의 끌기 느낌(헤드리스 Chromium의 마우스로만 시험했다). 터치 끌기는 `touch-action: pan-y`로 세로 굴리기와 나눴다(미실행: 실제 터치).
- Assumed: 80ms 간격의 담기가 큰 목록(설정 칸 수백 줄)에서도 가볍다 — 줄은 `memo`로 자기 칸만 다시 그리게 했다(잰 값 없음).

## 사용자 결정 대기

- 설정 칸 패널의 ↑↓가 줄 옮기기에서 값 한 걸음으로 바뀌었다(줄은 Enter·Shift+Enter). 싫으면 되돌릴 수 있다.
- 범위 밖 정수를 칸을 떠날 때 끝 값으로 맞춰 담는 것(전에는 담지 않았다).
- 수 칸마다 막대 한 줄이 늘어 편집 판이 길어졌다. 막대를 표 칸처럼 접어 두기를 원하면 `slider={false}`로 끌 수 있다.
