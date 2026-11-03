# 스태미나 274: 적정 스탯 개념(D-511) — 적정 STA 레벨 식, 회복 = 기본 회복 × 적정 비율, 일반 공격이 이어지게

- 일시: 2026-11-03 13:30 (KST)
- 작업 도구: Claude Code
- 관련: 질문 `docs/questions/2026-11-03-stamina-274.md`(사용자 답 → 기획 D-511, 미러 `f530fbd` 48 §4.1), ADR `docs/adr/2026-10-31-combat-core.md` "바뀜 (274 스태미나 적정 스탯 개념)", 측정 기준 `docs/research/2026-11-03-gardener-stamina-measure.md`, 가지 `work/stamina`(main `f530fbd`에서 시작)

## 한 일
- 적정 STA 점수를 설정 칸 80에서 레벨 계산식 칸 `stamina_appropriate`로 바꿨다(맨손 적정과 같은 틀). 출발 식 `10 * (1 + 0.1 * (LV - 1))` = 보통 유닛(1차 처음 10, 성장률 N5 100‰, K 1)의 STA 점수라 보통 유닛은 어느 레벨이든 소모·회복 배율이 1이다(유도는 ADR 1절).
- 회복을 적정 스탯 개념으로: 새 계산식 칸 `real_stamina_regen` = 2차 스탯 스태미나 회복 × min(2, STA 점수 ÷ 적정). 2차 행 `stamina_regen`은 적정에서의 회복(분당 720 = 초당 12, 가중치 0)이 됐다. 소모 식 `stamina_cost`는 글 그대로(APP만 레벨 식 값).
- 출발값([임시], 값은 개발자 페이지에서 맞춘다 D-511): 회복 분당 720(가장 빠른 팩 무기 900ms·소모 10의 초당 11.1을 넘게), 회복 배율 상한 2배, 기본 공격 10·최소 소모 500‰·최대 스태미나 그대로. 설정 칸 `n13_appropriate`는 지웠다(팩 id-changes).
- 판정: 사양에 `staminaAppropriateMilli`(유닛 레벨), 기본 공격·스킬 소모는 `specStaminaCostMilli`. 시뮬 유닛(1차 40 + 기술 × 8)에 그 1차에 닿는 레벨 31 + 기술 × 8을 준다. `StatFighter.level`(선택). `SIM_VERSION` 9 → 10, 팩 core@31 → core@33(main의 보유 물건 core@32를 합친 뒤).
- 개발자 화면: 계산식 탭에 새 칸 둘과 "기본 공격 스태미나" 패널(표본 유닛의 적정 STA·점수·최대·초당 회복, 무기마다 한 번 소모·간격·초당 소모·이어짐/줄어듦, 담은 식이 바로 든다). 스킬 편집기 [행동별 소모]에 "보통 유닛 스태미나 기준"(Lv 1·30)과 무기 줄마다 "보통 유닛 초당 소모"(서버가 판정 함수로 셈, `skills.list`의 `stamina`). 아이템 편집기 무기 미리 보기에 실제 회복. 문구 ko·en.
- 측정 도구 `duel:stamina`를 새 규칙에 맞췄다(Lv 30 유닛에 레벨, 적정 비율 확인 유닛·대결 더함, 옛 `app10`·`old_doc`·`cap2` 설정은 뺌 — 옛 설정 칸·모양이라).

## 결과 (Verified: 시드 1, 개발 컨테이너, 각 한 번, 위반 0. 앞 = main `f530fbd` SIM 9 core@31, 뒤 = 이 가지)
- `duel:stamina`(20판, 제한 600초): 새 맨손 1:1 600(20/20 초과) → 21.8초, 새 검 1:1 600 → 11.0초, 새 맨손 3:3 600 → 31.2초, 새 검 3:3 600 → 15.9초, 새 검 대 맨손 600 → 12.2초(검 20승), Lv 30 검 3:3 109.6 → 17.4초. 시간 초과 0.
- 적정 비율: 같은 1차 39를 Lv 60(적정 69)으로 → 소모 17.69·회복 406, 이어 치는 수 분당 60 → 23.0. STA 점수 절반(AGI·VIT 19, 적정 39) → 소모 20.52·회복 350, 분당 17.1. Lv 60 대 Lv 30 검 3:3은 Lv 60 쪽 6승 14패.
- war16 30일: 줄 229 → 229, 해시 b34b5aab → 622b825f, 공격 쪽 승 63 → 63, 쓰러짐 433 → 435, 평균 전투 24.7 → 19.3초, 시간 초과 0.
- econ16 180일: 줄 1,943 그대로, 해시 5ce9c31b → d2593432, 웨이브 전투 186개 줄이 바이트까지 같다(웨이브 승 34 그대로).
- `gardener:cal` 시드 1~6(C16 5·C17 100 그대로): 목표 구간 625 → 792‰, 공성 제한 전투 5/36 → 0/36, CPU 최대 13.9 → 0.63초. 나눗수 150 → 625‰, 200 → 333‰(측정 보고 `basic_free` 격자와 같음). C16·C17은 바꾸지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formulaSlots.ts` | 식 칸 `stamina_appropriate`·`real_stamina_regen`, 기본 식, `staminaAppropriateScope`·`staminaRegenScope`, 소모 식 APP = 밀리점 |
| `packages/shared/src/formulaSample.ts` | 미리 보기도 적정 STA·실제 회복(판정과 같은 차례), 화면 계수에서 `staminaAppropriate` 뺌 |
| `packages/shared/src/skillEditor.ts` | `StaminaBasisView`(행동별 소모 화면 기준), 목록 응답 `stamina` |
| `packages/sim/src/combat/formulas.ts`·`coefficients.ts`·`battleTypes.ts`·`battleState.ts`·`skills.ts`·`unitSpec.ts` | 적정 STA·실제 회복 식, 사양 `staminaAppropriateMilli`, 유닛 기준 소모(`specStaminaCostMilli`), 계수표 `appropriateScore` 지움 |
| `packages/sim/src/combat/stats.ts` | 시험 표 `stamina_regen` = base 720(팩과 같은 값) |
| `packages/sim/src/combat/duels.ts` | `StatFighter.level` |
| `packages/sim/src/simulator/combatRun.ts` | 시뮬 유닛 레벨 `simUnitLevel`(31 + 기술 × 8) |
| `packages/sim/src/tuning.ts` | 설정 칸 `n13_appropriate` 지움 |
| `packages/sim/src/version.ts`·`index.ts` | `SIM_VERSION` 11, 내보내기 |
| `packages/sim/cli/stamina-duels.ts` | 새 규칙·레벨·적정 비율 확인 |
| `content/core/formulas.json`·`stat_rows.json`·`tuning.json`·`id-changes.json`·`manifest.json` | 새 식 둘, 회복 행 출발값, 설정 칸 지움(removed since 34), 판 34 |
| `apps/server/src/contentEdit/staminaBasis.ts`(새)·`services.ts`, `apps/server/src/app.ts` | 행동별 소모 화면 스태미나 기준(실효 자료·설정 칸·계산식, 판정 함수) |
| `apps/server/src/battleLab/build.ts`·`formulas/services.ts`·`itemEdit/preview.ts`·`itemEdit/previewWeapon.ts` | 새 소모 함수, 화면 계수, 아이템 미리 보기(레벨만 보는 식 뺌) |
| `apps/game/src/editor/balance/formulaModel.ts`·`StaminaTable.tsx`(새)·`FormulaTab.tsx`·`formulaMessages.ts`·`formulaTab.css` | 계산식 탭 스태미나 패널, 변수 R |
| `apps/game/src/editor/skills/StaminaBasis.tsx`(새)·`CostTable.tsx`·`SkillEditorScreen.tsx`·`skillEditor.css` | 행동별 소모 화면 기준 표·초당 소모 열 |
| `apps/game/src/editor/items/itemMessages.ts`, `apps/game/messages/{ko,en}.json` | 문구 ko·en |
| 시험: sim `stamina.test.ts`(새)·`formulaParity.test.ts`·`formulaSample.test.ts`·`stats.test.ts`, 서버 `staminaBasis.test.ts`(새)·`balance.test.ts`·`roster.test.ts`·`formulaState.test.ts`, 게임 `formulaModel.test.ts`, e2e `formulas.spec.ts`·`skills.spec.ts` | 식·이어짐·비율·화면 |
| `docs/adr/2026-10-31-combat-core.md`, `docs/PLAN.md`(14장), `docs/questions/2026-11-03-stamina-274.md`, 이 기록, `docs/WORKLOG.md` | 결정·상태·기록 |

## 시험 (CHECK_RESULTS)

## 함께 바꿔야 하는 파일
- 식 칸을 더하거나 지우면: `COMBAT_FORMULA_IDS`(shared) → sim `formulas.ts` `setOf`, 게임 `formulaModel.ts` `programsOf`, 팩 `formulas.json`, 시험의 칸 수(sim `formulaSample.test.ts` 11개, 서버 `formulaState.test.ts`).
- 시뮬 유닛 1차 식(`combatRun.ts` 40 + 기술 × 8)을 바꾸면 `simUnitLevel`도.

## 건드리지 말 것
- 정원사 C16·C17(`c16_strength_base`·`c17_physical_divisor`): 정원사 줄기가 이 스태미나에서 시드 24개로 다시 맞춘다(D-511 기술 전달).
- `settingsCells.json`은 손으로 고치지 않는다(`pnpm settings:cells`, 이번에 바뀜 없음).

## 미검증·TODO·알려진 문제
- 밸런스 화면 대결에 레벨 칸이 없다: 1차 39 기준 유닛도 적정 STA Lv 1(10)로 셈한다(소모 최소·회복 2배로 보임). 레벨 칸을 더하는 것은 따로(ADR "바뀜 (274 …)" 5절).
- 최대 스태미나는 절대값 그대로(100 + 점수). 사이보그 2차 스탯 풀이(게임 화면)는 회복 행 값(적정에서의 720)을 보인다.
- 결정성(같은 명령 두 번)은 다시 재지 않았다(줄 해시는 위).
- NAS에서 재지 않았다.

## 사용자 결정 대기
- 없음(값은 개발자 페이지에서 사용자가 맞춘다, D-511).
