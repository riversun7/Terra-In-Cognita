# 사이보그 판 3: 기동 이동 속도 줄·효율 원자재별 채집 줄·맨손 크리(AGI + DEX)·맨손 명중 100%

- 일시: 2026-11-12 23:23 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-formula-editor.md`·`docs/adr/2026-11-01-cyborg-sheet-old-look.md` "바뀜 (2026-11-12)", 질문 `docs/questions/2026-11-12-cyborg-sheet-3.md`(1251~1256), 가지 `work/cyborg-sheet-3`(바탕 통합 `635a945`)

## 한 일
- 사용자 요청(2026-11-12, 휴대폰 사진): "기동에 이동속도가 왜 없는가? 효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌. 맨손인경우 크리확률이나 공격속도 공식을 제대로 구현하라". 같은 날 사용자 결정(통합 담당 전달): "맨손 크리확률은 agi+dex 을 퍼밀로쓰자 10,10이면 2%", 명중 "맨손 항상 100%", 공격 속도는 그대로.
- 무엇이 틀렸나(Verified, 코드·시험): 맨손 자료도 무기 틀(무기 값 × min(1, DEX ÷ (Lv × 1.5 + 10)))을 타서 맨손 크리는 늘 5% 이하·레벨이 오르면 떨어지고(적정만 오른다), 맨손 명중도 Lv 30 균형형 602‰까지 떨어졌다. 무기 크리 바탕이 0인 문제는 없었다(맨손 자료 크리 50‰).
- 공용 전투 식: 계산식 칸 `bare_crit`(기본 `max(0, AGI) + max(0, DEX)`)·`bare_hit`(기본 `1000`)을 더했다(11 → 13). 공격 사양 `AttackProfile.unarmed`가 참이면 `realCritPm`·`realHitPm`이 맨손 칸을 쓴다 → 시뮬·서버·전투 실험실·사이보그 판이 모두 같은 값. 고르기 `critFormulaIdOf`·`hitFormulaIdOf`(@terra/shared/formula)를 미리 보기·계산식 탭이 함께 쓴다. 팩 core@79, `SIM_VERSION` 33(통합 가지 c858d2d 합친 뒤 — resource-biome이 32·core@78을 썼다).
  - (중간에 옛 프로젝트 맨손 규칙 `bare_interval`(공속 min(2, AGI ÷ 적정), 최소 0.5)도 넣었다가 "공격 속도는 그대로" 지시로 뺐다 → 질문 1252.)
- 기동 묶음 이동 속도 줄: 서버가 쓰는 걷기 빠르기(`CyborgBody.move`: WALK_SPEED 437 ÷ CELL_UNITS 1024 = 0.426칸/초, 2차맵 256칸 약 10분, 전투 걸음 1,000ms). 기획 48 §3.2가 "이동 속도는 2차 스탯이 아니다, AGI 관계 미결"이라 1차 스탯·장비 몫은 "없음"으로 보이고 규칙은 바꾸지 않았다(질문 1251).
- 효율 묶음 원자재별 채집 여섯: 서버 `roster/gatherSheet.ts`가 @terra/sim `workerEffects`(채집 직무와 같은 함수)·@terra/shared `gatherBandIndex`(팩 gather_tiers)·`recommendProduction`(유닛 추천)으로 셈해 `CyborgBody.gather`로 보낸다. 화면 `CombatGather.tsx`: "광석 · 광산" / "T0–T3" / 최적 표, 펼치면 유효 스탯 셈·구간 티어별 %·T9 확률·진행·수확량·성공 확률.
- 맨손 크리·명중 풀이: "맨손 크리 = AGI(10) + DEX(10) = 20‰ = 2%", "맨손 명중 = 늘 100%(빗나감은 상대 회피만)".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formulaSlots.ts`·`formulaSample.ts` | 식 칸 `bare_crit`·`bare_hit`, 변수 함수 `bareCritScope`, 고르기 `critFormulaIdOf`·`hitFormulaIdOf`, 미리 보기 값 |
| `packages/sim/src/combat/formulas.ts`·`formula.ts`·`unitSpec.ts`·`index.ts` | 판정: `bareCritPm`, `AttackProfile.unarmed`, 맨손이면 맨손 칸 |
| `packages/sim/src/version.ts` | SIM_VERSION 32 → 33(통합 가지의 32 뒤) |
| `packages/sim/src/combat/unitSpec.test.ts`·`formulaParity.test.ts`·`formulaSample.test.ts` | 맨손 크리 20‰(10·10)·27‰(DEX 12·AGI 15)·200‰(100·100), 명중 1000‰(DEX 1·Lv 30도), 발톱은 무기 틀, 미리 보기 = 판정 |
| `content/core/formulas.json`·`manifest.json` | 새 식 칸 둘, 판 79 |
| `packages/shared/src/roster.ts` | `RosterCombat.crit.bare`·`hit.bare`, `RosterMove`, `RosterGather`, `CyborgBody.move`·`gather` |
| `apps/server/src/roster/gatherSheet.ts`(새)·`gatherSheet.test.ts`(새) | 원자재별 채집 예상(판정 함수만), 시험 |
| `apps/server/src/roster/unitBody.ts`·`cyborgBody.ts`·`preview.ts`·`services.ts`, `apps/server/src/app.ts` | 맨손 표지, `rosterMoveOf`, 채집 예상 출처(실효 팩) 연결 |
| `apps/server/src/roster/unitBody.test.ts`, `battleLab/build.test.ts`, `tuning/formulaState.test.ts` | 맨손 크리·명중·이동 값, 칸 수 13 |
| `apps/server/src/itemEdit/previewWeapon.ts` | 아이템 무기 미리 보기에서 맨손 칸 뺌 |
| `apps/game/src/editor/balance/formulaModel.ts` | 새 칸 묶기, 무기에 따라 맨손/무기 칸 "판정이 쓰지 않는 식" |
| `apps/game/src/cyborg/CombatAttack.tsx`·`CombatGather.tsx`(새)·`CombatSpecs.tsx`·`cyborgText.ts`(+시험)·`statIcons.tsx`·`combatSpecs.css` | 이동 속도 줄, 채집 줄, 맨손 풀이, 아이콘 일곱, 최적 표 |
| `apps/game/messages/ko.json`·`en.json` | 새 문구 21개(ko·en) |
| `e2e/cyborg.spec.ts` | 효율·기동 줄 차례, 최적 표 하나, 펼친 풀이, 390 × 파스텔·다크·정거장 묶음 사진 |

## 함께 바꿔야 하는 파일
- 맨손 규칙 식을 더 고치면: `DEFAULT_COMBAT_FORMULAS`(formulaSlots.ts) = 팩 `formulas.json` expression(서버 시험이 같은지 본다), 화면 문구 `cyborg_attack_bare_crit_formula`·`cyborg_attack_bare_hit_formula`.
- 채집 시설 스탯 짝·티어 구간을 바꾸면 `gatherSheet.test.ts`의 기대값(사진 유닛 STR 10·VIT 7 → 광산 17, 낚시터 27·성공 367‰).

## 건드리지 말 것
- 이동 규칙(WALK_SPEED·전투 걸음)은 바꾸지 않았다 — 기획 결정(질문 1251) 전.
- 맨손 공격 간격(attack_interval)은 지시대로 그대로다(질문 1252).

## 미검증·TODO·알려진 문제
- Verified(통합 가지 c858d2d를 합친 뒤): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 668·시험 5,092), `pnpm build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 JS 109,061 B / 상한 131,416 B), 화면 시험 `pnpm e2e cyborg.spec.ts formulas.spec.ts` 35개 통과(2.3분). `pnpm check:docs origin/main` 통과(합치기 전).
- Verified 사진(390, 한국어, 전역 준비의 Lv 1 맨손 사이보그): 기동·효율·공격 묶음 × 파스텔·다크·정거장 — `cyborg-move-390-*`·`cyborg-gather-390-*`·`cyborg-bare-offense-390-*`(E2E_SHOTS_DIR, 저장소 밖).
- 합치기 전 `pnpm check`의 실패 둘(엔진 `schoolView.test.ts` 타입, `world.ts` 1,000줄)은 바탕 가지 문제였고 c858d2d가 고쳤다.
- Assumed: 시뮬 시나리오(war16·econ16 등) 줄은 맨손 규칙과 상관없다(시험 칼·발톱) — 시나리오를 돌려 바이트를 견주지는 않았다(미실행).
- 화면 사진의 사이보그는 맨손이라 공격 간격이 느리다(AGI 5 → 2,304ms) — 맨손 공격 간격은 지시대로 그대로(질문 1252).
- 시설 레벨·광산 산지 티어 막기는 채집 예상에 넣지 않았다(질문 1255).

## 사용자 결정 대기
- 질문 1251~1256(이동 속도와 AGI, 맨손 공격 간격, 맨손 크리 상한, 맨손 스킬, 채집 예상 기준, 최적 기준).
