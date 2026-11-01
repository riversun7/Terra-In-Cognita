# 개발자 모드 계산식 편집기(사용자 결정 D-488)

- 일시: 2026-11-01 21:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-formula-editor.md`(제안), 질문 `docs/questions/2026-11-01-formulas.md`(275~279), `docs/questions/2026-11-01-secondary-stats-baseline.md`(265~274), 기획 D-488·D-490·D-491, 가지 `work/formulas`(main `5c621d3` 위에서 만들고 main `b57a2b3`까지 합침, main에는 합치지 않음 — 통합 담당이 합친다). 합치기·마무리는 아래 "합치기·마무리" 절(2026-11-01 23:30)

## 한 일
- 식 언어(`@terra/shared/formula`): 손으로 쓴 해석기(중간값 줄, 비교, 함수 11개, `× ÷ −` 받음, `#` 설명), 1000배 정수 고정 소수점(곱·나눗셈 음의 무한대 쪽 내림, BigInt 넘침 보호, 0으로 나눔 = 0), 모르는 이름 위치·비슷한 이름 권함, 풀이(항마다 "VIT(10) × 3"), 1차 스탯 영향(비중·+10 차이), 식 칸 표(2차 스탯 행 식 18 + 전투 식 9)와 변수 값 함수, 표본 미리 보기. 결정성 검사 대상에 넣었다.
- 판정 코드: 무기 틀(실제 공격력·명중·크리)·크리 배율·공격 간격·STA 점수·스태미나 소모·최종 회피를 계수표의 식 묶음으로 셈한다(기본 식 = 바꾸기 전과 같은 결과). 2차 스탯 행에 식이 있으면 그 식(LV 인자). 사람형 맨손 기본 공격은 옛 프로젝트 맨손 규칙(10 상한 없음, 피해 자리 굴림은 맨손일 때만 하나 더). `SIM_VERSION` 5.
- 팩 core@21: 분류 `formulas`(전투 식 9개), `stat_rows` 선택 칸 `formula`, `unit_kinds.naturalWeapon.unarmed`(사이보그·휴먼·안드로이드). 팩 검사가 식을 칸 변수로 읽어 본다. 내보내기 차이 `formulas`와 `pnpm tuning:apply`·시뮬 `--tuning`.
- 서버: 표 `formula_overrides`(마이그레이션 하나), D1 묶음(`tuning.save`의 `formulas`)·같은 판·감사·켤 때 고르기(팩 이김, 읽히지 않는 식 `invalid_formula`로 지움, 시작을 막지 않음)·모두 되돌리기·최근 바꿈·내보내기. tRPC `formulas.list`(dev·admin). 실효 전투 식은 밸런스 대결·정원사 웨이브 계수에, 행 식은 유닛·사이보그 화면 표에.
- 화면: 계산식 탭(`apps/game/src/editor/balance/FormulaTab.tsx`, 기본 내보내기). 고정폭 입력·자동 완성·오류 위치·고치기 단추·미리 보기(결과·굴림 범위·범위 경고·항마다·1차 영향)·무기마다 적정치 표·담은 변경 막대. 밸런스 화면 끝에 임시로 한 줄 끼움. 사이보그 화면 2차 스탯 풀이는 식 행이면 식 글과 항을 보인다.
- 장비 없는 유닛의 VIT 방어(D-488): 이미 그렇다(Verified: 크리쳐도 같은 행을 탄다. 물리 방어율 = STR × 0.6 + VIT × 1.2 점수, 아머 HP = STR × 0.5 + VIT, 속성 방어율에도 VIT). 코드는 바꾸지 않고 시험만 더했다(`formulaParity.test.ts` "장비 없는 유닛도 VIT로 방어").
- 무기마다 적정치(D-488 "장비별로 제대로"): 지금 적정치는 2차 스탯 단위다(D-438 1). 화면에 모든 무기(맨손 포함)의 적정치와 표본 비율을 보인다. 1차 스탯 단위(옛 REQ_STR) 뜻인지는 질문 276으로 물었고, 답에 따라 무기 자료 모양이 바뀌어 화면에서 바로 고치는 칸은 답 뒤로 미뤘다(지금은 팩에서 고친다).

## 맨손 일반 공격 앞뒤(물리 방어 전, 굴림 최소 / 중간 / 최대, Verified: 스크립트로 sim 함수 실행)
| Lv | 균형형(10에서 자람) 전 → 뒤 | STR형(STR 20·DEX 10) 전 → 뒤 | DEX형(STR 10·DEX 20) 전 → 뒤 |
|---|---|---|---|
| 1 | 6 → 4 / 6 / 8 | 10 → 8 / 13 / 17 | 8 → 8 / 11 / 14 |
| 5 | 9 → 5 / 8 / 11 | 10 → 11 / 16 / 22 | 10 → 11 / 16 / 20 |
| 10 | 10 → 7 / 10 / 14 | 10 → 14 / 21 / 28 | 10 → 14 / 21 / 28 |
| 15 | 10 → 8 / 13 / 17 | 10 → 17 / 26 / 35 | 10 → 17 / 26 / 35 |
| 20 | 10 → 10 / 15 / 21 | 10 → 20 / 31 / 42 | 10 → 21 / 31 / 42 |
| 25 | 10 → 12 / 18 / 24 | 10 → 24 / 36 / 48 | 10 → 24 / 36 / 48 |
| 30 | 10 → 13 / 20 / 27 | 10 → 27 / 41 / 55 | 10 → 27 / 41 / 55 |

## 같은 결과 증명 (Verified)
- 시뮬(시드 1, main `5c621d3` 압축본 vs 이 가지): war16 30일 230줄·stub16 180일 403줄·econ16 180일 2,355줄이 `simVersion`(4 → 5)·팩 판·해시(core@20 `73e2d7bd…` → core@21 `ce35d584…`)·`linesHash`(war16 `88edea7d` → `36bff8e6`, stub16 `6db997de` → `ef366de3`, econ16 `67b687fa` → `90b577c3`) 말고 바이트까지 같다. war16을 18행 모두 식으로 덮어쓴 차이(`--tuning`)로 돌린 줄도 이 가지 줄과 바이트까지 같다(`cmp`).
- 시험: 기본 전투 식 = 옮겨 둔 바꾸기 전 공식(무작위 3,000번씩), 18행 식 표 = 가중치 표(2,000번), 행 식 생성기 = 가중치 계산(500번), 미리 보기 = 판정(300번), 팩 formulas = 기본 식, 맨손 식 = 옛 실수 공식의 내림 ± 1(2,000번).

## 검사·시험
- `TEST_DATABASE_URL=… pnpm check`(Verified): 통과 — 포맷·린트·타입·경계·결정성·파일 크기·다국어(2234키)·디자인 값·콘텐츠, 단위·DB 시험 338파일 2,898개 통과
- `pnpm check:bundle`(Verified): 첫 화면 JS 104,273 B / 상한 131,416 B. 식 코드는 `BalancePanelScreen-*` 조각에만 들고(빌드 산출 검색), 미리 캐시(`sw.js`)에 그 조각이 없다.
- `pnpm check:content`(Verified): core@21 통과, 단계 1·2·4a·4b(기준 27b25cd).
- 새 시험 62개: `packages/shared/src/formula.test.ts` 25, `packages/sim/src/combat/formulaParity.test.ts` 13·`formulaSample.test.ts` 1, `apps/server/src/tuning/formulaState.test.ts` 10, `apps/server/src/formulas/formulas.db.test.ts` 5(DB), `apps/game/src/editor/balance/formulaModel.test.ts` 6. 더함: `combatCatalog.test.ts`(팩 formulas = 기본 식), `scripts/apply-tuning-diff.test.mjs`(식 차이 적용).
- 화면 시험(Verified, `pnpm e2e e2e/formulas.spec.ts e2e/balance.spec.ts e2e/tuning.spec.ts`): 40개 통과(4.7분) = 계산식 11·밸런스 13·설정 칸 16. 사진 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/formulas/shots/`(`formulas-{pastel,dark}-{ko,en}-{390,1440}.png`, 오류 상태 `formulas-error-…`, 밸런스 화면 `balance-…`). 처음 돌릴 때 두 가지를 고쳤다: 펼침 단추(`summary`) 누르는 곳 22px → `--tap-size`, 탭이 밸런스 화면의 `bp-*` 이름을 같이 써서 밸런스 시험 고르기(`.bp-staged` 등)가 둘을 잡음 → 탭은 `fx-*`만 쓰고 스타일도 탭 CSS에 둔다(혼자 서는 부품). `state.ts` 나눔(`formulaSlots.ts`)은 이 화면 시험 빌드 뒤에 했다(단위·DB 시험으로 확인).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/formula*.ts`, `package.json` | 식 언어·고정 소수점·풀이·식 칸·미리 보기, 진입점 `./formula` |
| `scripts/check-boundaries.mjs` | 결정성 검사 대상에 `formula*.ts` |
| `packages/sim/src/combat/formulas.ts`(새), `formula.ts`, `unitSpec.ts`, `coefficients.ts`, `stats.ts`, `equipment.ts`, `battle.ts`, `catalog.ts`, `packCatalog.ts`, `tuning.ts`, `tuningChecks.ts`, `simulator/run.ts`, `version.ts`, `index.ts` | 전투 식·행 식으로 셈, 맨손 규칙, 피해 자리 굴림, 가치 없는 1차 검사에 식 변수, SIM_VERSION 5 |
| `packages/sim/cli/*` | 팩 formulas·차이의 식을 시뮬에 |
| `packages/content/src/schema/{formulas,stats,combat,categories}.ts`, `validate/formulas.ts`, `formulaDiff.ts`, `tuningDiff.ts`, `index.ts` | 분류·선택 칸·식 검사·차이 |
| `content/core/{formulas.json,unit_kinds.json,manifest.json}` | core@21 |
| `scripts/apply-tuning-diff.mjs` | 식 차이를 팩에 |
| `apps/server/src/tuning/{state,formulaSlots,store,services}.ts`, `db/schema.ts`, `drizzle/20261101121828_formula_overrides/` | 식 덮어쓰기 층 |
| `apps/server/src/formulas/services.ts`, `trpc/{formulas,tuning,context,createContext,router}.ts`, `app.ts`, `main.ts`, `world/combatCatalog.ts`, `balance/services.ts`, `roster/body.ts` | `formulas.list`, 묶음 입력, 실효 식을 쓰는 곳, LV |
| `packages/shared/src/{tuning,roster}.ts` | 까닭 `invalid_formula`, 최근 바꿈·내보내기·풀이의 식 칸 |
| `apps/game/src/editor/balance/Formula*.tsx`, `formula*.ts`, `formulaTab.css`, `BalancePanelScreen.tsx`(임시 한 줄), `balanceMessages.ts`, `editor/tuning/tuningMessages.ts`, `cyborg/CombatSpecs.tsx`, `messages/{ko,en}.json` | 계산식 탭, 까닭 문구, 사이보그 화면 식 행 |
| `e2e/formulas.spec.ts` | 화면 시험 |

## 함께 바꿔야 하는 파일
- 전투 식 기본을 바꾸면 `packages/shared/src/formulaSlots.ts` `DEFAULT_COMBAT_FORMULAS`와 `content/core/formulas.json`을 같이(서버 시험 `combatCatalog.test.ts`가 본다). 판정 결과가 바뀌면 `SIM_VERSION`.
- 식 칸 변수를 바꾸면 그 칸의 `…Scope` 함수와 판정 부르는 곳, 화면 문구 `dev_formula_var_*`.

## 건드리지 말 것
- 결정성: `formula*.ts`에 Math 초월함수·`**`·정규식 리터럴을 쓰지 않는다(경계 검사). 맨손 굴림은 맨손 일반 공격일 때만 뽑는다(무기 전투 굴림 흐름을 지킨다).

## 미검증·TODO·알려진 문제
- ~~탭 끼우기~~ → 했음(합치기·마무리): 밸런스 화면 `TABS`의 [계산식] 탭.
- ~~가중치 표에 행 식 표시가 없음~~ → 했음(합치기·마무리): "계산식(팩)"·"계산식(이 세계)" 표시·흐린 칸·범례.
- 계산식 탭의 표본 유닛은 서버의 두 표본(새 사이보그 Lv 1·Lv 30 균형형)뿐이다. 전투 실험실 팀 A 유닛을 표본으로 쓰는 것은 하지 않았다(실험 유닛의 레벨·장비·GEAR를 서버 미리 보기에서 받아야 해서 단순하지 않다).
- 무기마다 적정치를 화면에서 바로 고치는 칸: 질문 276 답 뒤.
- 시뮬 유닛은 레벨이 없어 행 식 LV = 1.
- NAS 미배포.

## 사용자 결정 대기
- 279 맨손 건물 피해(`docs/questions/2026-11-01-formulas.md`). 275~278은 답함(275·276은 아이템 편집기·크리쳐 작업으로 옮김), 277 뒤따름 둘도 답함(아래).

## 합치기·마무리 (2026-11-01 23:30 KST, Claude Code)

### 한 일
- main을 두 번 합쳤다: `e77837f`(전투 실험실 탭·`battle_lab_presets`·core@21·BattleTrace) → `b57a2b3`(문서만: 기획 미러 D-494·D-495, 아이템 편집기 설계안). 겹침 풀이:
  - `BalancePanelScreen.tsx`: main의 `TABS` 구조를 받고 임시 `<FormulaTab />` 끼움을 지웠다. [계산식]을 `TABS` 세 번째 줄로(`dev_lab_tab_formulas` 계산식·Formulas). [가중치 표]는 그대로.
  - 메시지 ko·en: 두 쪽 키를 모두 둔다(글자 그대로 합쳐 `\u00a0` 표기를 지켰다).
  - 팩: 두 가지가 모두 core@21(내용 다름) → **core@22**(`fa2099aa…`).
  - 마이그레이션: `20261101113211_battle_lab_presets`·`20261101121828_formula_overrides`는 같은 부모(`0cdfc981`)의 갈래 → 다시 만들지 않고 그대로 둔다. `db:generate` = "No schema changes"(합친 뒤, 표 정의를 옮긴 뒤 두 번 Verified).
  - 서버 `app.ts`·`main.ts`·`trpc/context.ts`·`world/combatCatalog.ts`: 두 쪽 가져오기·함수를 모두 둔다. `docs/WORKLOG.md`는 `pnpm docs:index`로 다시 만들었다.
  - 합친 뒤 `schema.ts`가 1,002줄(상한 1,000)이라 `formula_overrides` 정의를 `db/devToolsSchema.ts`로 옮기고 다시 내보낸다(전투 실험실 프리셋과 같은 자리, 표 모양 그대로).
- 합치며 생긴 빈틈 고침: main의 전투 실험실·3D 리플레이는 이 가지보다 먼저 만들어져 계수표에 식 묶음을 싣지 않고 유닛 레벨을 넘기지 않았다 → 세계의 실효 전투 식(`TuningState.combatFormulas()`)을 싣고, 실험 유닛 레벨을 행 식 LV·맨손 식에 넘긴다. 실험실 요약의 실제 공격력·명중·크리도 판정과 같은 식(`realAttackOf`·`frameValue`, 맨손은 굴림 가운데 값). 시험 `battleLab/build.test.ts` 하나 더함.
- 가중치 표의 계산식 행 표시: 서버 `balance.table` 행마다 `formula`("pack"·"world"·null), 화면은 행 머리 "계산식(팩)"·"계산식(이 세계)" + 읽는 이름 안내, 칸은 점선·흐린 글, 범례 한 줄(그런 행이 있을 때만). 계산식 탭 제목은 탭 단추와 같은 이름이라 읽는 이름으로만 둔다.
- 사용자 답(2026-11-01, 질문 277 뒤따름, 묶임, `docs/questions/2026-11-01-formulas.md`): Lv 1 맨손 명중 "현재 나쁘지 않음 70~80정도" → 그대로(76.5%). 회피 "기존 기획서를 참고하라 …" → 옛 기획 회피율 §6과 지금 식은 최종 범위 하나 말고 같았다 → **최종 회피 1%~85%** 범위를 더했다: 기본 식 `evade_chance` = `… rel = …; clamp(E + rel, 10, 850)`(팩 `formulas.json`도), 코드 모양 `evadeFinalPm`·`EVADE_FINAL_MIN_PM`·`MAX_PM`(`packages/sim/src/combat/formula.ts`). 판정은 계수표의 식(`evadeChancePm`)으로 셈하고 코드가 따로 자르지 않는다(계산식 탭 미리 보기 = 판정을 지키려고, 범위는 식에서 바꿀 수 있다). 같은 결정이 기획 D-495로 미러에 들어왔다(main `0fa5d2e`).
- 시험: `formulaParity.test.ts` 최종 회피 = `evadeFinalPm`(무작위 3,000번, 두 끝을 모두 지나는지 셈) + 옛 기획 Lv60 매칭 표 25칸(±1%p). 방어 69 ÷ 공격 35 = 474‰(표 48%), 35 ÷ 69 = 10‰(범위 전 −93‰), 162 ÷ 35 = 734‰(표 73%). 표의 방어 104 ÷ 공격 162 칸(8%)은 그 문서 자신의 공식(25.0% − 14.3% = 10.7%)과 맞지 않아 공식 값(106‰)으로 본다.

### 시뮬레이터 (Verified, 시드 1, 각 두 번 바이트까지 같음, 불변 조건 위반 0)
| 시나리오 | main `e77837f` (SIM 4, core@21) | 이 가지 범위 전 (SIM 5, core@22) | 이 가지 범위 뒤 (SIM 5, core@22 `fa2099aa`) |
|---|---|---|---|
| war16 30일 (230줄) | `b6938f28` | `d4f8b340` | `95243fc1` |
| stub16 180일 (403줄) | `90f6dcb5` | `1b98ad5d` | `2985e911` |
| econ16 180일 (2,355줄) | `80b0131d` | `2d7d7d15` | `e9d92ab9` |
- main ↔ 범위 전: 세 시나리오 모두 머리·요약의 `simVersion`·팩 판·해시와 `linesHash` 말고 바이트까지 같다(맨손 규칙이 시뮬 유닛에 닿지 않음, 앞 절 증명을 새 main 위에서 다시 확인).
- 범위 전 ↔ 범위 뒤: stub16·econ16은 팩 해시·`linesHash`만 다르다. war16은 조우 전투 `battle` 줄 12개가 `ticks`만 다르다(이긴 쪽·쓰러짐 수 같음, 대부분 2~8틱 길어지고 하나는 4틱 짧아짐, 두 줄은 144·142 → 175). 요약 `combat.ticks` 132,068 → 132,168(+100). 회피가 1% 아래(음수 = 늘 맞음)이던 공격이 1%는 피하게 된 몫이다(Assumed: 시뮬 유닛은 AGI가 낮아 85% 위에는 닿지 않는다 — 어느 끝이 걸렸는지 따로 세지 않았다). `SIM_VERSION`은 5 그대로(이 가지가 이미 4 → 5).

### 검사·시험
- `TEST_DATABASE_URL=… pnpm check`(Verified): 통과 — 포맷·린트·타입·경계·결정성·파일 크기·다국어(2,536키)·디자인 값(460쌍)·콘텐츠(core@22), 단위·DB 시험 352파일 2,974개 통과. 첫 번째 실행은 파일 크기(`schema.ts` 1,002줄)로 실패 → 표 정의를 옮긴 뒤 통과. 시간 초과로 실패한 시험은 없었다.
- `pnpm check:content origin/main`(Verified): core@22 통과, 단계 1·2·4a·4b.
- `pnpm check:bundle`(Verified): 첫 화면 JS 104,585 B / 상한 131,416 B.
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e e2e/formulas.spec.ts e2e/balance.spec.ts e2e/battleLab.spec.ts e2e/tuning.spec.ts`, 빌드한 `c4aaba3`): 58개 통과(6.1분) = 계산식 11(먼저 [계산식] 탭을 연다, 가중치 표의 HP 행 "계산식(이 세계)" 표시 포함)·밸런스 14·전투 실험실 17·설정 칸 16. 사진 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/fin/e2e1/shots/`(`formulas-{pastel,dark}-{ko,en}-{390,1440}.png` 등).

### 바꾼 파일(이 절)
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/balance/BalancePanelScreen.tsx`, `apps/game/messages/{ko,en}.json` | [계산식] 탭, 합치기 |
| `apps/game/src/editor/balance/{BalanceTable.tsx,WeightTab.tsx,balancePanel.css,balanceModel.test.ts}`, `packages/shared/src/balance.ts`, `apps/server/src/balance/{services.ts,balance.test.ts}` | 가중치 표의 계산식 행 표시 |
| `apps/game/src/editor/balance/{FormulaTab.tsx,formulaTab.css}` | 탭 안 제목은 읽는 이름으로만 |
| `apps/server/src/battleLab/{services.ts,build.ts,build.test.ts}`, `apps/server/src/battleReplay/services.ts` | 세계 계산식·유닛 레벨 |
| `packages/shared/src/formulaSlots.ts`, `content/core/formulas.json`, `content/core/manifest.json`, `packages/sim/src/combat/{formula.ts,formulaParity.test.ts}`, `packages/sim/src/version.ts` | 최종 회피 1%~85%, core@22 |
| `apps/server/src/db/{schema.ts,devToolsSchema.ts}` | 파일 크기 상한(표 모양 그대로) |
| `e2e/formulas.spec.ts` | [계산식] 탭을 먼저 연다, 가중치 표의 계산식 행 표시 |
| `docs/questions/2026-11-01-formulas.md`, `docs/adr/2026-11-01-formula-editor.md` | 사용자 답 기록, ADR "바뀜" |

### 함께 바꿔야 하는 파일(덧붙임)
- 회피 범위를 바꾸면 기본 식(`formulaSlots.ts` `DEFAULT_COMBAT_FORMULAS.evade_chance`)·팩 `formulas.json`·`formula.ts` `EVADE_FINAL_*`를 같이(시험이 셋을 견준다).
- 밸런스 화면 탭을 더하면 `BalancePanelScreen.tsx` `TABS` 한 줄과 `dev_lab_tab_*` 메시지.

### 남은 일
- 279 맨손 건물 피해(아직 물음). 계산식 탭에서 전투 실험실 팀 A 유닛을 표본으로 쓰기(하지 않음). `PLAN.md` 질문 처리 줄에 275~279 답은 통합 담당 몫(이 가지는 고치지 않았다). NAS 미배포.
