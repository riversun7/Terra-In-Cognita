# 밸런스 화면을 전투 보고서로 개편, 피해 흐름도, 2차 스탯 화면으로 스탯 기능 옮김

- 일시: 2026-11-14 16:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-14-battle-report.md`(새), `docs/adr/2026-11-01-balance-screen.md`·`docs/adr/2026-11-01-formula-editor.md`("바뀜 (2026-11-14)"),
  조사 `docs/research/2026-11-14-dev-tools-overlap.md`, 질문 `docs/questions/2026-11-14-balance-report.md`(1376~1385), 가지 `work/balance-report`

## 한 일
- **1단계 — 겹침 조사**(`docs/research/2026-11-14-dev-tools-overlap.md`): 개발 화면·밸런스 탭·tRPC마다 유지/옮김/지움 판정. **Verified**(소스·호출 grep).
- **2단계 — 전투 보고서**(`/dev/balance`):
  - 서버 `apps/server/src/battleReport/`: 설정 셋(파티 대 파티 = 실험실 `arenaInit`, 파티 공성 = `siegeArena`·`siegePlacer`·`simCitySiegeLayout`,
    웨이브 공성 = `waveBattleInit` + `runWaveToEnd`와 같은 50틱 멈춤), N판 시드 재현, A/B(같은 판 시드, B 팀·웨이브 값·설정 칸/가중치 칸 바꿈),
    집계(승패·윌슨 95% 구간·전투 시간 분포·쓰러뜨리기까지·편/유닛 물리·속성·지속 피해·명중·빗나감·회피·크리·크리 피해 몫·초당 공격·스태미나로 늦은 공격·
    쓰러짐·공성 넥서스/성벽 피해), 워커 일(진행·멈춤·제한 시간, 서버 전체 하나), 기록 표 `battle_reports`(추가만, 마이그레이션 `20261114063847_battle_reports`),
    세계 새로 시작 남길 표, tRPC `battleReport.start·status·jobs·cancel·list·get·trace`, 감사 기록 `battle_report.start·cancel`.
  - 사용자 추가 지시(피해 계산 흐름도): sim `attackStages.ts` — `resolveAttack(…, stages?)`가 단계 값을 적고, 기본 공격·스킬은 관찰자에 `attackStages`가
    있을 때만 칸을 만든다(실제 플레이 비용 0). 결과·끝 상태가 칸 있음·없음에서 바이트까지 같음을 시험이 본다. 단계 차례는 엔진 그대로이며 사용자 목록과
    다른 점(굴림이 먼저, 크리 배율은 방어 뒤)을 ADR 3절에 적었다. 편·짝 흐름(합·막대), 첫 판 표본 8줄, 한 대 풀이(저장된 시드로 그 판 다시).
  - 화면: [전투 보고서](옛 실험실 팀·유닛 편집 + 설정 판 + 한 판·3D 관람 + 보고서), [보고서 기록](날짜·이름·종류 찾기·열기·다시 돌리기·둘 견주기),
    흐름도(넓은 화면 가로 사슬·390px 세로, 가장 크게 줄인/늘린 단계 표시), 한 대 풀이(단계마다 식 글). 몬테카를로 단추는 보고서로 바뀜.
- **3단계 — 2차 스탯 화면으로 옮김**: `origin/merge/integration`(0bfbc5b, dev-ui-fix 포함)을 합침(충돌 없음). 2차 스탯 화면 아래 판
  `SecondaryStatsExtras`: 무기별 스태미나·적정치 표(옛 계산식 탭, 담은 식·가중치 반영), 1차 +10 대결 승률(옛 가중치 표, 담은 가중치 칸으로 `balance.duels`).
  밸런스 [가중치 표]·[계산식] 탭과 그 코드, `balance.contribution`(+ `contributionOf`·공용 타입), 쓰이지 않게 된 메시지 키 244개를 지웠다.
- 잰 값(**Verified**, 개발 컨테이너 Node 24.22.1, 실제 팩, 샘플 Lv 30 혼성 5 대 5, 120초 제한, 워커): 1,000판 **23.2초**(판 23ms, 판정 CPU 22.9초),
  주 스레드 루프 지연 최대 6ms, 프로세스 RSS 248MB, 보고서 JSON 약 60KB. 4 대 4 100판 3.5초. NAS 값은 **Unknown**.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/attackStages.ts`(새)·`formula.ts`·`battle.ts`·`skills.ts`·`battleTrace.ts`·`index.ts` | 공격 단계 기록 칸(선택, 결과 불변) |
| `packages/sim/src/combat/attackStages.test.ts`(새) | 칸 있음·없음 같은 결과, 단계 이어짐, 반영 합 |
| `packages/shared/src/battleReport.ts`(새)·`package.json` | 보고서 입력·결과·흐름 모양, 상한, 윌슨 구간, 막대 칸 |
| `packages/shared/src/balance.ts` | contribution 타입 지움 |
| `apps/server/src/battleReport/*`(새) | 설정·판·집계·일·워커·기록·서비스·시험 |
| `apps/server/src/trpc/battleReport.ts`(새)·`router.ts` | tRPC |
| `apps/server/src/battleLab/services.ts`·`app.ts`·`appOptions.ts`·`balance/duelWorker.ts` | 보고서 서비스 붙이기, 워커 일 종류 |
| `apps/server/src/db/devToolsSchema.ts`·`schema.ts`·`drizzle/20261114063847_battle_reports/` | `battle_reports` 표(추가만) |
| `apps/server/src/cli/resetWorld.ts` | 남길 표에 `battle_reports` |
| `apps/server/src/balance/{services,compute}.ts`·`trpc/balance.ts`·`trpc/context.ts`·`balance*.test.ts` | contribution 지움 |
| `apps/game/src/editor/balance/report/*`(새) | 보고서 화면·흐름도·한 대 풀이·기록·모델·시험·CSS |
| `apps/game/src/editor/balance/BalancePanelScreen.tsx`·`lab/BattleLab.tsx`·`lab/ArenaPanel.tsx`·`lab/LabResults.tsx`·`lab/labModel.ts`·`balanceMessages.ts` | 탭 개편, 몬테카를로 → 보고서 |
| `apps/game/src/editor/balance/{Formula*,formula*,WeightTab,BalanceTable,BalanceResults,StaminaTable,useMediaQuery,balanceModel}*` | 지움(사용자 지시·겹침) |
| `apps/game/src/editor/secondaryStats/SecondaryStatsExtras.tsx`·`secondaryExtrasModel.ts`·`secondaryExtras.css`(새)·`SecondaryStatsEditorScreen.tsx` | 옮긴 판 |
| `apps/game/src/editor/DevHome.tsx`·`apps/game/messages/{ko,en}.json` | 문구(키 추가·지움, 밸런싱 묶음 설명) |
| `e2e/battleReport.spec.ts`(새)·`battleLab.spec.ts`·`balance.spec.ts`·`secondaryStats.spec.ts`, `e2e/formulas.spec.ts` 지움 | 화면 시험 |

## 함께 바꿔야 하는 파일
- `docs/WORKLOG.md`(`pnpm docs:index`)

## 건드리지 말 것
- 판정 코어의 단계 기록 칸은 관찰자에 `attackStages`가 있을 때만 만든다(실제 플레이·시뮬레이터에 넘기지 않는다). 결과가 바뀌면 SIM_VERSION 문제다.
- `editor/secondaryStats/`에서 `editor/balance/`를 가져오지 않는다(조각 분리, 옮긴 판은 자기 모델을 쓴다).
- `battle_reports`는 세계 밖 표다(`WORLD_RESET_KEEP`).

## 미검증·TODO·알려진 문제
- 시험(**Verified**): sim 850개, 보고서 서버 단위 10개·DB 3개, 화면 모델 55개(balance·secondaryStats 폴더), e2e `battleReport.spec.ts` 7/7(사진 12장).
  `pnpm check`·빌드·check-pwa·check:bundle·나머지 e2e 결과는 아래 "마무리 검사"에 적는다.
- `e2e/battleLab.spec.ts`의 "공격력 = 스탯 공격력 + 무기 몫(D-502) … 명중 73.8%"는 기대값이 2026-11-12~13 규칙(맨손 명중 100%, 물리 공격력 STR + ⌊VIT÷2⌋)보다 옛 값이라
  실패한다(받은 값 15·1000). 이 줄기의 변경과 무관하다고 본다(**Assumed**: 그 줄들은 실험실 미리 보기 `battleLab.preview`만 부르고 이 줄기는 미리 보기를 바꾸지 않았다).
- NAS 1,000판 시간·메모리 **Unknown**(재지 않음). 웨이브 공성 한 판은 크리쳐가 많으면 수 초(ADR gardener 4절) → 공성 상한 200판.
- 피해 흐름 p10·p90은 막대(4분의 1 옥타브) 근사.

## 사용자 결정 대기
- 질문 1376~1385(`docs/questions/2026-11-14-balance-report.md`): 영향도 탭 자리, `/dev/battle-replay`·`battleLab.monteCarlo` 지우기, 스태미나 정의, 공성 배율, 기록 상한 등.
