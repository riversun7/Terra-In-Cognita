# 전투 움직임 2단계: 점멸 아군 시야·도약 성벽·부딪힘 피해·밀림 저항·피해 방식은 계열과 별개

- 일시: 2026-11-16 00:27 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-combat-moves.md` "바뀜 (D-564·D-568)", 기획 **D-564**·**D-568**·D-557, 질문 `docs/questions/2026-11-15-combat-moves.md` 1581~1600(답 반영)·`docs/questions/2026-11-16-combat-moves-2.md` 1801~1815(새 질문), 줄기 `work/combat-moves-2`(바탕 `c3cf6a0`)

## 한 일
1. 은신(D-564 1583 "맞아도 은신 유지"): 1단계가 이미 그렇게 만들었다(Verified: 새 시험 — 범위 스킬에 맞아도 은신 그대로). `STEALTH_BREAKS_ON_DAMAGE`를 AI 고리가 아니라 규칙 값으로 주석을 바꿈.
2. 점멸(1585 "사정거리 존재, 아군 시야 내"): 사정거리 = 부품 `cells`, 갈 칸 = 산 아군(자기 포함) 누구라도 시야 반지름(높이 보너스)·시선 안인 칸(`moves.ts seenBySide`). 옛 "자기 시야"를 바꿈.
3. 도약(1586·D-568 "성벽도 넘음"): 성벽·성문 칸을 후보에서 빼던 검사를 없앰. 도약 스킬은 목표까지 시선 없이 거리만 본다(`skills.ts skillReaches`, pickSkill·시전 끝 둘 다) — 시선을 요구하면 성벽 너머 목표에 쓸 수 없어서. 돌진은 1단계대로 아군에도 막힌다(1596).
4. 밀치기 부딪힘 피해(1587): 벽(못 지나가는 칸·건물·모서리 규칙)에 막히면 한 방 피해 × `moves_knock_wall_pm`(200‰), 다른 유닛에 막히면 밀린 대상과 막은 유닛(시전자의 적만)이 × `moves_knock_unit_pm`(150‰, 사용자 제안 10~20%). 방어 없이 체력에서(아머·쉴드 그대로). 관찰자 선택 칸 `collision` → 리플레이는 지속 피해 사건(효과 `move_collision`, 서버 이름 "부딪힘/Impact")이라 리플레이 형식 판 그대로, 실험실 기록·전투 보고서도 받는다. 피해 없는 밀치기는 0.
   밀림 저항(1588): STR·VIT 점수(상태이상 저항 D-429 모양) + 몸 저항(크기 L·XL·보스 등급, 사양 칸 `displaceResistPm` — `UnitBody.size`·`boss`로 셈), 1000에서 자름. 굴림 없이 칸 수·묶기 지속을 줄인다. 설정 칸 9개(`moves_knock_*`·`moves_resist_*`·`moves_body_*`, [임시]).
5. 기존 결정으로 답한 것: 1581 달리기는 AI가 정함(프로토콜 `run` 칸 안 넣음, `wantsRun` 주석), 1594 사거리 ↔ 공격 간격(D-557) → 무기 칸 `curves: ["range_interval"]`(기본 공격 간격 × 사거리 예산, 무기마다 고름, 아이템 편집기 체크), 1595 곡선은 스킬마다(1단계 그대로), 1599·1600은 뒤 작업(WP-5·보기 화면) 그대로, C* 1598(팩 이동 스킬은 4단계 뒤)은 그대로. 수치 질문은 설정 칸 그대로.
6. 피해 방식은 계열과 별개(D-568): 판정에서 계열이 피해 방식을 정하던 두 곳을 옮김 —
   - 스킬: `skillAttack`이 공격 종류를 기반(`base`)으로 정하던 것을 피해 종류(`damage`)로. 팩 검사 "피해 스킬은 damage = base"를 없앰(필요한 무기 칸 = 기반 검사는 그대로).
   - 기본 공격: 무기 공격력 칸에 선택 칸 `damage`(없으면 칸 종류). 칸 종류 = 계열(스탯 공격력·적정 1차), `damage` = 피해 방식. 기본 공격 MP는 무기 `mpCost`만큼(옛: 속성 칸 무기만). 건물 피해는 피해 방식(물리)만.
   - 화면: 스킬 편집기 기반 칸 = "STR·VIT 계열 / INT·WIS 계열", 기반·피해 종류가 서로 따라 바뀌던 것을 없앰. 아이템 편집기 무기 칸마다 "기본 공격 피해 방식"·"사거리 예산" 체크, 전투 실험실 직접 값 무기 칸마다 "피해 방식"(ko·en 메시지).
   - 기존 자료는 기본값으로 이어진다: 팩 스킬은 모두 damage = base, 무기에 `damage` 칸 없음, MP를 적은 무기는 속성 칸 무기뿐.
- 판: **SIM_VERSION 54**, **팩 core@110**(설정 칸 9개를 tuning.json 끝에 더함), 프로토콜(WS) 판 그대로, 리플레이 형식 판 그대로(2).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/moves.ts` | 점멸 편 시야, 도약 성벽, 부딪힘 피해(`impact`·`pushStop`), 밀림 저항(`unitDisplaceResistPm`), `MOVE_COLLISION` |
| `packages/sim/src/combat/curves.ts`·`coefficients.ts`·`tuningMoves.ts` | 계수 `knockback`·`resist`·`body`, `bodyDisplaceResistPm`·`displaceResistPm`, 설정 칸 9개 |
| `packages/sim/src/combat/skills.ts`·`battle.ts` | onHit에 한 방 피해, `skillReaches`(도약은 거리만) |
| `packages/sim/src/combat/formula.ts` | `skillAttack` 종류 = 피해 종류(D-568) |
| `packages/sim/src/combat/unitSpec.ts` | 무기 칸 `damage`·무기 `curves`, 몸 저항 칸(`size`·`boss`) |
| `packages/sim/src/combat/battleState.ts` | 기본 공격 MP = 무기 mpCost |
| `packages/sim/src/combat/battleTypes.ts`·`battleTrace.ts`·`replay.ts`·`observe.ts`·`moveAi.ts`·`version.ts` | 사양 칸 `displaceResistPm`, 관찰자 `collision`, 리플레이 지속 피해 사건, 실험실 기록, 주석, SIM 54 |
| `apps/server/src/battleReport/play.ts`·`battleReplay/names.ts` | 보고서 부딪힘 피해, 리플레이 이름(묶임·부딪힘) |
| `apps/server/src/battleLab/schema.ts`·`build.ts`, `packages/shared/src/battleLab.ts`·`itemEditor.ts` | 무기 칸 `damage`, 무기 `curves` 모양 |
| `packages/content/src/schema/combat.ts`·`index.ts` | 무기 칸 `damage`·무기 `curves`(`WEAPON_CURVE_IDS`), damage = base 검사 없앰 |
| `apps/game/src/editor/skills/SkillForm.tsx`·`skillMessages.ts`, `editor/items/ItemWeaponFields.tsx`, `editor/balance/lab/UnitGear.tsx`, `messages/{ko,en}.json` | 화면(위 6) |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 9개, core@110 |
| 시험 `movesImpact.test.ts`(새)·`moves.test.ts`·`validate/combat.test.ts` | 아래 검사 |
| `docs/adr/2026-11-15-combat-moves.md`(바뀜 절)·`docs/questions/2026-11-16-combat-moves-2.md`(새) | 기록 |

## 검사(Verified = 실행함)
- 작업 중: sim `src/combat`·`src/tuning` 37파일 325개 통과, content 141개 통과, 서버 battleLab·battleReplay·battleReport·tuning 103개 통과(DB 없이), 게임 앱 editor skills·items·balance·tuning 70개 통과.
- 지문: 새 부품이 없는 시범 전투 지문(`moves.test.ts` 기준 커밋 지문)이 그대로 통과 — D-568 판정 바뀜이 지금 자료 결과를 바꾸지 않는다.
- 마지막 검사(Verified):
  - `pnpm check`(TEST_DATABASE_URL, DB 시험 포함): 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 736파일 5,547개 모두 통과.
  - `pnpm check:content c3cf6a0`: 통과(core@110, 단계 1·2·4a·4b).
  - `pnpm build` + `node scripts/check-pwa.mjs` + `pnpm check:bundle`: 통과(첫 화면 JS 110,058 B / 상한 131,416 B).
  - e2e `skills.spec.ts`·`battleLab.spec.ts`·`items.spec.ts`: 75개 중 74 통과. 실패 1개 = `skills.spec.ts` "행동별 소모"(`test_sword` 지속 칸이 ok가 아니라 drains). 이 값은 `staminaBasisOf` → `specFromStats`의 공격 간격·소모·회복으로 셈하고, 이 줄기가 바꾼 몫(무기 칸 `damage`·무기 `curves`·몸 저항)은 `test_sword`에 칸이 없어 값이 그대로다 — 이 줄기 탓이 아니다(Assumed: 기준 커밋에서 돌리지 않음, 코드 경로로 판단. 1단계 기록의 battle-replay 실패처럼 D-553 걸음·간격 식 뒤 바뀐 기준 값으로 짐작). 다른 줄기로 넘긴다.
  - 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/combat-moves-2-shots/`(spec이 찍는 전투 실험실·스킬·아이템 화면, 네온·라이트 × ko·en × 390·1440). 새 고르기 칸(무기 칸 피해 방식·사거리 예산)만 따로 찍은 사진은 없다.

## 함께 바꿔야 하는 파일
- 무기 곡선을 더하면 sim `WeaponCurve`·`@terra/content WEAPON_CURVE_IDS`·`@terra/shared ItemWeaponJson.curves`를 함께.
- 판정이 새 효과 이름을 리플레이에 실으면 `apps/server/src/battleReplay/names.ts MOVE_EFFECT_NAMES`에 이름을.

## 건드리지 말 것
- `apps/server/src/app.ts`·`db/schema.ts` — 손대지 않았다.
- 몸 저항·무기 칸 `damage`·무기 `curves`는 있을 때만 칸을 둔다(옛 상태 JSON·지문 그대로).

## 미검증·TODO·알려진 문제
- 몸 저항(크기·보스)을 주는 사양 생성자가 아직 없다(크리쳐 도감 항목을 전투에 싣는 곳이 없음, 질문 1807).
- 크리쳐 편집기 타고난 무기 칸에는 피해 방식 고르기를 넣지 않았다(Assumed: 편집기가 무기 객체를 통째로 다뤄 칸은 잃지 않음 — 미확인).
- 가까이 쏘기 무기 곡선(WP-7 나머지), 재능 계열 스탯 공격력(질문 1811)은 하지 않았다.

## 리셋 필요 여부
- **세계 새로 시작 필요 없음.** DB 표·마이그레이션 없음. 진행 중 전투는 저장된 시작 자료를 새 판정으로 다시 계산하는 기존 방식(`world/battles.ts`)이고, 지금 자료는 새 칸을 쓰지 않아 결과가 같다(지문 시험). 설정 칸 9개는 팩에 더한 것이라 켤 때 그대로 든다.

## 사용자 결정 대기
- 질문 1801~1815(부딪힘 피해 기준·방어, 막은 유닛, 연사 밀치기, 저항 방식·스탯·몸, 아군 시야 칸, 도약 시선, 데이터 모양, 재능 계열 공격력, MP, 건물 피해, 무기 곡선 기본, 달리기 칸).
