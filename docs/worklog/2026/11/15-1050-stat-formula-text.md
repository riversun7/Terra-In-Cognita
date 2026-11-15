# 2차 스탯 식 글·영향 막대 나눔 (D-556)

- 일시: 2026-11-15 10:50 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 D-556(질문 1253), ADR `docs/adr/2026-11-01-formula-editor.md` "바뀜 (2026-11-15)", 질문 1611~1613
  (`docs/questions/2026-11-15-stat-formula-text.md`), 줄기 `work/stat-formula-text`(기준 `24f91102f1`)
- 리셋 필요 여부: 필요 없음 (세계 자료·팩·SIM·프로토콜을 바꾸지 않았다. tRPC 사이보그 판에 선택 칸 하나를 더했을 뿐)

## 한 일
- 사용자: "2차스탯 페이지에 공식이 안써있고 dex가 영향이 더큰것아닌가? 공식이 뭐냐? 만렙기준 확률은 적당하고 좋다." → 수치는 그대로, 식을 글로 보이고
  오해를 부른 "기여 비중" 막대를 나눴다.
- `@terra/shared/formulaText`(새 진입점): 읽은 식(구문 나무) → 글. 값을 내는 같은 식에서 글이 나와 어긋날 수 없다. `plain` 글은 다시 읽혀 값이 같다(시험).
  1차의 `max(0, X)`는 X로 줄이고 `floored`에 적어 화면이 "0보다 작으면 0으로 셈"을 붙인다.
- `primaryInfluence`에 식의 가중치(`equalPlus10`, 1차 여섯을 모두 평균으로 두고 +10)를 더했다. 2차 스탯 에디터 영향 카드 = 식의 가중치 판 +
  "이 분포에서의 기여 몫" 판(옛 기여 비중, 빗금 막대) + "+10 시 Δ" 한 줄 설명.
- 2차 스탯 에디터: 편집 카드·영향 카드·성장 곡선 카드 머리·목록 줄·비교표 줄에 식 글(그래프 값을 낸 담은 식 `programs`).
- 사이보그 판: 2차 스탯 줄 공식 상자 첫 줄이 식 글(가중치 행 → `statRowExpression`, 행 식 → 그 식). 공격력·명중·크리·간격·실제 스태미나 회복은 서버가
  판정 식을 `RosterCombat.formulas`(식 ID + plain 글)로 보내고 화면이 이름표(무기 크리·적정 DEX·비율 상한 …)를 붙여 푼다. 옛 서버면 옛 문구.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formulaText.ts`(새)·`formulaText.test.ts`(새)·`formula.ts`·`package.json` | 식 → 글, `./formulaText` 진입점(사이보그 조각이 식 묶음 전체를 끌지 않게) |
| `packages/shared/src/formulaEval.ts`·`formula.test.ts`·`secondaryStatsSim.ts` | 식의 가중치(`equalPlus10`·`equalLevel`) |
| `packages/shared/src/roster.ts`·`apps/server/src/roster/unitBody.ts` | 사이보그 판 전투 줄의 판정 식 글(`RosterCombat.formulas`, 선택 칸) |
| `apps/game/src/roster/formulaLabels.ts`(새)·`formulaLabels.test.ts`(새) | 이름표·한 줄 글·뜻 줄(사이보그 판·에디터 공용) |
| `apps/game/src/cyborg/FormulaTextLines.tsx`(새)·`CombatSpecs.tsx`·`CombatAttack.tsx`·`combatSpecs.css` | 공식 상자 첫 줄 식 글 |
| `apps/game/src/editor/secondaryStats/*` | 식 글(편집 카드·차트·목록·비교표), 영향 카드 두 판 |
| `apps/game/messages/{ko,en}.json` | 변수 이름표·확률곡선·뜻 줄·영향 카드 문구(옛 "기여 비중" → "기여 몫") |
| `e2e/secondaryStats.spec.ts`·`e2e/cyborg.spec.ts` | 식 글·가중치 50%/50%·기여 몫 DEX > AGI, 사이보그 판 HP·회피·크리·간격 식 글 |
| ADR formula-editor "바뀜", 질문 파일 | 결정 기록·[임시] 정한 것 |

## 함께 바꿔야 하는 파일
- 식 문법(`formulaParse.ts`)에 함수·연산자를 더하면 `formulaText.ts`의 그리기와 `formulaText.test.ts`의 다시 읽기 시험도 함께.
- 전투 식 칸에 변수를 더하면 사이보그 판에 보이는 식이면 `formulaLabels.ts` `formulaVarLabel`에 이름표(메시지 ko·en).

## 건드리지 말 것
- 수치(가중치·식)는 그대로 둔다(사용자: 만렙 기준 확률 적당).
- `RosterCombat.formulas`는 선택 칸이다: 옛 서버·시안 몸은 없을 수 있다(화면이 옛 문구로 돌아간다).

## 미검증·TODO·알려진 문제
- 검사 결과는 아래 "검사"에 적는다.
- 사이보그 판 무기 크리·명중 식 글은 길다(줄 바꿈으로 보인다). 질문 1613.
- 크리 결과 줄(`cyborg_attack_bare_crit_line` "AGI(10) + DEX(10) = 20‰")은 기존 그대로 AGI + DEX 꼴을 가정한다(식을 바꾸면 식 글은 따라가지만 이 줄은 아니다 — 기존 문제).

## 검사
(아래에 채움)

## 사용자 결정 대기
- 질문 1611~1613(추천대로 구현).
