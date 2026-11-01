# 개발자 모드 계산식 편집기(사용자 결정 D-488)

- 일시: 2026-11-01 21:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-formula-editor.md`(제안), 질문 `docs/questions/2026-11-01-formulas.md`(275~279), `docs/questions/2026-11-01-secondary-stats-baseline.md`(265~274), 기획 D-488·D-490·D-491, 가지 `work/formulas`(main `5c621d3` 위, 합치지 않음 — 통합 담당이 합친다)

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
- 탭 끼우기: `work/battle-lab`이 밸런스 화면을 탭으로 바꾸는 중이라 나는 화면 끝에 `<FormulaTab />` 한 줄(+ import)만 넣었다. 통합 때 그 탭 자리로 옮기고 이 줄을 지운다.
- 행 식이 있는 행은 가중치 칸이 듣지 않는다. 밸런스 화면 가중치 표에 그 표시가 아직 없다(통합 때).
- 무기마다 적정치를 화면에서 바로 고치는 칸: 질문 276 답 뒤.
- 시뮬 유닛은 레벨이 없어 행 식 LV = 1.
- NAS 미배포.

## 사용자 결정 대기
- 275 크리쳐 발톱도 맨손 규칙?, 276 적정 스탯 단위, 277 맨손 명중·크리·속도 적정, 278 맨손 숫자 [임시], 279 맨손 건물 피해(`docs/questions/2026-11-01-formulas.md`).
