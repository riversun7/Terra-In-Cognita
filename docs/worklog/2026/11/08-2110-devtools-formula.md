# 계산식 식 조각판·끌어 넣기

- 일시: 2026-11-08 21:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-formula-editor.md`(상태 확정, "바뀜 (2026-11-08 끌어 넣기)"), 질문 880~881 `docs/questions/2026-11-08-devtools-formula.md`, 가지 `work/devtools-formula`(바탕 `merge/integration` 07e08fa)

## 한 일
- 사용자 원문(2026-11-08 개발 도구 평가): "검증도 좋으나 STR 같은같은 명확한 상수는 드래그해서 쓸수있게 직관적으로 하면 오타없이 좋을듯"을 넣었다.
- 계산식 탭(/dev/balance [계산식]) 식 칸에 식 조각판: 칸 변수(1차 스탯 묶음 색)·지금 글의 중간값·함수 11개·연산자 13개 칩, 칩마다 한 줄 풀이(ko·en). [뜻 함께 보기](넓은 화면 처음 켬)를 끄면 가리키거나 누른 칩의 풀이를 도움 줄에.
- 마우스: 칩을 글 상자에 끌어 놓으면 놓은 자리에(놓은 점 → 줄 높이·캔버스로 잰 그 줄 앞부분 너비 → 글자 위치, 끄는 동안 글자 위치를 옮겨 보임·점선 테두리). 누르면 글자 위치(고른 범위)에. 휴대폰(손가락)은 누르기만, 글 상자에 초점을 주지 않는다(자판이 조각판을 가리지 않게).
- 넣는 규칙: 앞뒤 빈칸 맞춤, 입력하던 앞부분은 그 이름으로 바꿈, 함수는 자리표시 인자(`clamp(value, lower, upper)`)를 붙여 첫 인자를 고름, 고른 글 + 함수 = 감쌈, `( )` 한 쌍, `=` = 지금 줄 앞에 중간값 줄(고른 글은 중간값으로 뺌). 자리표시는 모르는 이름이라 지금 검사가 담기를 막고 "고치기" 권함은 붙지 않는다.
- 키보드: 조각판은 도구 막대(Tab 한 번, 화살표·Home·End, Enter·Space로 넣고 글 상자로 초점). 칩 풀이는 `aria-describedby`.
- 조각판은 늘 글 상자·오류 바로 아래(넓은 화면은 묶음 이름을 왼쪽 칸에, 옆 칸 배치는 사진으로 보니 글 상자 옆이 비어 버렸다). 옛 "쓸 수 있는 이름" 접기는 조각판과 겹쳐 지웠다(메시지 키 `dev_formula_vars_label`도 지움).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/balance/formulaInsert.ts` (새) | 칩 목록·넣기 규칙·놓은 점 → 글자 위치·끌기 자료 확인(순수 함수) |
| `apps/game/src/editor/balance/formulaInsert.test.ts` (새) | 넣기·감싸기·중간값 줄·자리표시가 검사에 막히고 권함이 없음·놓은 자리(넓은 글자)·끌기 자료 |
| `apps/game/src/editor/balance/FormulaPalette.tsx` (새) | 조각판 화면(묶음·칩·뜻 함께 보기·도움 줄·도구 막대 키보드·끌기 시작) |
| `apps/game/src/editor/balance/formulaPalette.css` (새) | 조각판 스타일(토큰만), 넓은 화면은 묶음 이름 왼쪽 칸 |
| `apps/game/src/editor/balance/useMediaQuery.ts` (새) | 가는 포인터·넓은 화면 듣기 |
| `apps/game/src/editor/balance/FormulaEditor.tsx` | 글 상자 끌어 놓기(dragover·drop), 칩 넣기, 조각판 붙임 |
| `apps/game/src/editor/balance/FormulaTab.tsx` | "쓸 수 있는 이름" 접기 지움(조각판이 대신) |
| `apps/game/src/editor/balance/formulaMessages.ts` | 연산자 풀이 표·칩 풀이 함수 |
| `apps/game/src/editor/balance/formulaTab.css` | 지운 접기의 `.fx-vars` 규칙 지움 |
| `apps/game/messages/{ko,en}.json` | 조각판·연산자 문구 23개 더함, `dev_formula_vars_label` 지움. 영어 함수 풀이 넷(clamp·if·curve·lerp)의 인자 이름을 자리표시와 같게 |
| `e2e/formulas.spec.ts` | 끌어 놓기(앞·끝)·누르기·감싸기·자리표시가 담기를 막음·중간값 줄·키보드·휴대폰 누르기 시험, 조각판 사진(390·1440 × 네온·라이트 × ko·en) |
| `docs/adr/2026-11-01-formula-editor.md` | 상태 확정(사용자 조건), "바뀜 (2026-11-08 끌어 넣기)" |
| `docs/PLAN.md` | 14장 표 한 줄 |
| `docs/questions/2026-11-08-devtools-formula.md` (새) | 질문 880~881 |

## 함께 바꿔야 하는 파일
- 식 칸 변수를 더하면 `formulaMessages.ts` `VAR_TEXT`에 뜻을 더한다(없으면 칩 풀이가 이름 그대로). 함수를 더하면 `formulaInsert.ts` `FUNCTION_PLACEHOLDERS`(타입이 막는다)와 `FUNCTION_TEXT`.

## 건드리지 말 것
- 검사·저장 흐름(`checkSource`·`parseFormula`·`tuning.save`)은 그대로다. 조각판은 글만 바꾼다.

## 검사 결과 (merge/integration fe3c4c4를 합친 뒤)
- `TEST_DATABASE_URL=… pnpm check` 통과(단위 시험 파일 548·시험 4,143 모두 통과), `pnpm check:docs origin/main`·`pnpm check:content origin/main` 통과.
- `pnpm e2e e2e/formulas.spec.ts e2e/balance.spec.ts` 31개 모두 통과(새 시험 셋: 끌어 놓기·누르기·감싸기·자리표시 막힘·중간값 줄, 키보드, 휴대폰 누르기 + 조각판 사진 390·1440 × 네온·라이트 × ko·en). 사진을 보고 넓은 화면 옆 칸 배치를 글 상자 아래로 바꿨다(옆 칸은 글 상자 옆이 비었다). 그 뒤 영어 함수 풀이 문구 넷만 바꿨다(시험이 보지 않는 글, `check:i18n` 다시 통과).

## 미검증·TODO·알려진 문제
- 실제 휴대폰·iOS Safari에서 손가락 누르기는 재지 않았다(헤드리스 Chromium 휴대폰 흉내만). 놓은 자리 셈은 줄을 접지 않는 글 상자(white-space: pre)와 탭 글자 없음에 기댄다(탭은 너비를 다르게 셀 수 있다).
- 끌어 넣은 글은 글 상자의 되돌리기(Ctrl+Z) 기록에 들지 않는다(되돌리려면 [고친 글 버리기]).

## 사용자 결정 대기
- 질문 880(휴대폰 끌기), 881(자리표시 모양).
