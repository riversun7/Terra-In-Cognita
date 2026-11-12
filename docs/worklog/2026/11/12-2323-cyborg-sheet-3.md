# 사이보그 판 3: 기동 이동 속도 줄·효율 원자재별 채집 줄·맨손 크리(AGI + DEX)·맨손 명중 100%

- 일시: 2026-11-12 23:23 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-formula-editor.md`·`docs/adr/2026-11-01-cyborg-sheet-old-look.md` "바뀜 (2026-11-12)", 질문 `docs/questions/2026-11-12-cyborg-sheet-3.md`(1251~1256), 가지 `work/cyborg-sheet-3`(바탕 통합 `635a945`)

## 한 일
- 사용자 요청(2026-11-12, 휴대폰 사진): "기동에 이동속도가 왜 없는가? 효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌. 맨손인경우 크리확률이나 공격속도 공식을 제대로 구현하라". 같은 날 사용자 결정(통합 담당 전달): "맨손 크리확률은 agi+dex 을 퍼밀로쓰자 10,10이면 2%", 명중 "맨손 항상 100%", 공격 속도는 그대로.
- 무엇이 틀렸나(Verified, 코드·시험): 맨손 자료도 무기 틀(무기 값 × min(1, DEX ÷ (Lv × 1.5 + 10)))을 타서 맨손 크리는 늘 5% 이하·레벨이 오르면 떨어지고(적정만 오른다), 맨손 명중도 Lv 30 균형형 602‰까지 떨어졌다. 무기 크리 바탕이 0인 문제는 없었다(맨손 자료 크리 50‰).
- 공용 전투 식: 계산식 칸 `bare_crit`(기본 `max(0, AGI) + max(0, DEX)`)·`bare_hit`(기본 `1000`)을 더했다(11 → 13). 공격 사양 `AttackProfile.unarmed`가 참이면 `realCritPm`·`realHitPm`이 맨손 칸을 쓴다 → 시뮬·서버·전투 실험실·사이보그 판이 모두 같은 값. 고르기 `critFormulaIdOf`·`hitFormulaIdOf`(@terra/shared/formula)를 미리 보기·계산식 탭이 함께 쓴다. 팩 core@79, `SIM_VERSION` 33(통합 가지 c858d2d 합친 뒤 — resource-biome이 32·core@78을 썼다).
  - 맨손 공격 간격은 사용자 답 1252(아래)로 계산식 칸 `bare_interval`(2,000 ÷ (AGI ÷ 그 레벨 보통 유닛 AGI)², 250~5,000ms)이 됐다(칸 14개).
- 기동 묶음 이동 속도 줄: 서버가 쓰는 걷기 빠르기(`CyborgBody.move`: WALK_SPEED 437 ÷ CELL_UNITS 1024 = 0.426칸/초, 2차맵 256칸 약 10분, 전투 걸음 1,000ms). 기획 48 §3.2가 "이동 속도는 2차 스탯이 아니다, AGI 관계 미결"이라 1차 스탯·장비 몫은 "없음"으로 보이고 규칙은 바꾸지 않았다(질문 1251).
- 효율 묶음 원자재별 채집 여섯: 서버 `roster/gatherSheet.ts`가 @terra/sim `workerEffects`(채집 직무와 같은 함수)·@terra/shared `gatherBandIndex`(팩 gather_tiers)·`recommendProduction`(유닛 추천)으로 셈해 `CyborgBody.gather`로 보낸다. 화면 `CombatGather.tsx`: "광석 · 광산" / "T0–T3" / 최적 표, 펼치면 유효 스탯 셈·구간 티어별 %·T9 확률·진행·수확량·성공 확률.
- 맨손 크리·명중·간격 풀이: "맨손 크리 = AGI(10) + DEX(10) = 20‰ = 2%", "맨손 명중 = 늘 100%(빗나감은 상대 회피만)", "= 2,000 ÷ (AGI(10) ÷ 10)² = 2,000ms"(공식 줄 0.25~5초).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formulaSlots.ts`·`formulaSample.ts` | 식 칸 `bare_crit`·`bare_hit`·`bare_interval`, 변수 함수 `bareCritScope`·`bareIntervalScope`, 고르기 `critFormulaIdOf`·`hitFormulaIdOf`·`intervalFormulaIdOf`, 미리 보기 값 |
| `packages/sim/src/combat/formulas.ts`·`formula.ts`·`unitSpec.ts`·`index.ts` | 판정: `bareCritPm`·`bareIntervalMs`, `AttackProfile.unarmed`, 맨손이면 맨손 칸 |
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

## 맨손 비교표(사용자 답 1252 요청 "공격특화와 재능특화 그리고 골고루10인 유닛의 비교")
- Verified: 실제 코드로 셈했다(스크립트가 @terra/sim `rollStatSpread`·`specFromStats`·`realCritPm`·`realHitPm`·`realAttackOf`·`critMultiplierPm`·`specStaminaCostMilli`와 옛 식 `attackIntervalMs`·`dexFrameValue`를 부른다).
- 초기 스탯 = 성향마다 실제 굴림(`rollStatSpread`, TEST 계수표 = 팩 값: 합 60, 치우침 +4, 표준편차 3, 성향 칸 바닥 12) 2,000번의 평균을 반올림: 공격특화(combat) STR·VIT 14, 나머지 8 / 재능특화(tech) DEX·AGI 14, 나머지 8 / 골고루 10.
- 레벨 성장: 1차 6개 모두 `primaryAtLevel`(성장률 N5 100‰, K 1000 = 평균). 장비·버프 없음. 2차 스탯은 sim 시험 가중치 표(`TEST_STAT_TABLE`), 계수는 `TEST_COMBAT_COEFFICIENTS`(기본 식).
- "전" = 이 줄기 전(맨손도 무기 틀: 간격 1,000 ÷ min(1, AGI ÷ (Lv × 1.5 + 10)), 크리 50 × min(1, DEX ÷ 같은 적정), 명중 850 × 같은 비율). "후" = 지금(간격 bare_interval, 크리 AGI + DEX, 명중 1000).
- 10초 공격 = 10,000 ÷ 간격 · 스태미나가 바닥난 뒤 지속 가능 수(분당 회복 ÷ 6 ÷ 한 번 소모, 더 작은 쪽). 모두 간격이 정한다(스태미나가 남는다).
- DPS = 한 대 공격력 × (1 + 크리 확률 × (가운데 크리 배율 − 1)) × 명중 ÷ 간격, 골고루 10 Lv 1(후)을 1.00으로. 방어·회피는 같은 상대라 뺐다.

| 유닛 | Lv | STR/VIT/DEX/AGI | 간격 전→후(ms) | 10초 공격(간격·스태미나 지속) | 크리 전→후(‰) | 명중 전→후(‰) | 한 대 공격력 | 맨손 DPS 전→후(균형 Lv1 = 1.00) |
|---|---|---|---|---|---|---|---|---|
| combat (공격특화) | 1 | 14/14/8/8 | 1438 → 3125 | 3.2 · 3.2 | 34 → 16 | 590 → 1000 | 14 | 1.16 → 0.89 |
| combat (공격특화) | 10 | 26/26/15/15 | 1666 → 3215 | 3.1 · 3.1 | 30 → 30 | 510 → 1000 | 26 | 1.61 → 1.63 |
| combat (공격특화) | 30 | 54/54/31/31 | 1776 → 3174 | 3.2 · 3.2 | 28 → 62 | 478 → 1000 | 54 | 2.94 → 3.57 |
| tech (재능특화) | 1 | 8/8/14/14 | 1000 → 1020 | 9.8 · 9.8 | 50 → 28 | 850 → 1000 | 8 | 1.40 → 1.58 |
| tech (재능특화) | 10 | 15/15/26/26 | 1000 → 1068 | 9.4 · 9.4 | 50 → 52 | 850 → 1000 | 15 | 2.63 → 2.91 |
| tech (재능특화) | 30 | 31/31/54/54 | 1019 → 1044 | 9.6 · 9.6 | 49 → 108 | 833 → 1000 | 31 | 5.30 → 6.65 |
| balanced (골고루 10) | 1 | 10/10/10/10 | 1150 → 2000 | 5.0 · 5.0 | 43 → 20 | 738 → 1000 | 10 | 1.31 → 1.00 |
| balanced (골고루 10) | 10 | 19/19/19/19 | 1315 → 2000 | 5.0 · 5.0 | 38 → 38 | 646 → 1000 | 19 | 1.90 → 1.93 |
| balanced (골고루 10) | 30 | 39/39/39/39 | 1410 → 2000 | 5.0 · 5.0 | 35 → 78 | 602 → 1000 | 39 | 3.41 → 4.18 |

## 함께 바꿔야 하는 파일
- 맨손 규칙 식을 더 고치면: `DEFAULT_COMBAT_FORMULAS`(formulaSlots.ts) = 팩 `formulas.json` expression(서버 시험이 같은지 본다), 화면 문구 `cyborg_attack_bare_crit_formula`·`cyborg_attack_bare_hit_formula`.
- 채집 시설 스탯 짝·티어 구간을 바꾸면 `gatherSheet.test.ts`의 기대값(사진 유닛 STR 10·VIT 7 → 광산 17, 낚시터 27·성공 367‰).

## 건드리지 말 것
- 이동 규칙(WALK_SPEED·전투 걸음)은 바꾸지 않았다 — 기획 결정(질문 1251) 전.
- 무기·발톱의 공격 간격(attack_interval)은 그대로다. 맨손만 bare_interval.

## 미검증·TODO·알려진 문제
- Verified(통합 가지 c858d2d를 합친 뒤): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 668·시험 5,092), `pnpm build`, `node scripts/check-pwa.mjs`, `pnpm check:bundle`(첫 화면 JS 109,061 B / 상한 131,416 B), 화면 시험 `pnpm e2e cyborg.spec.ts formulas.spec.ts` 35개 통과(2.3분). `pnpm check:docs origin/main` 통과(합치기 전).
- Verified 사진(390, 한국어, 전역 준비의 Lv 1 맨손 사이보그): 기동·효율·공격 묶음 × 파스텔·다크·정거장 — `cyborg-move-390-*`·`cyborg-gather-390-*`·`cyborg-bare-offense-390-*`(E2E_SHOTS_DIR, 저장소 밖).
- 합치기 전 `pnpm check`의 실패 둘(엔진 `schoolView.test.ts` 타입, `world.ts` 1,000줄)은 바탕 가지 문제였고 c858d2d가 고쳤다.
- Assumed: 시뮬 시나리오(war16·econ16 등) 줄은 맨손 규칙과 상관없다(시험 칼·발톱) — 시나리오를 돌려 바이트를 견주지는 않았다(미실행).
- 화면 사진의 사이보그(AGI 5)는 새 맨손 간격으로 5,000ms(상한)다.
- 시설 레벨·광산 산지 티어 막기는 채집 예상에 넣지 않았다(질문 1255).

## 사용자 결정 대기
- 질문 1251·1253~1256(이동 속도와 AGI, 맨손 크리 상한, 맨손 스킬, 채집 예상 기준, 최적 기준). 1252는 답함(맨손 간격).
