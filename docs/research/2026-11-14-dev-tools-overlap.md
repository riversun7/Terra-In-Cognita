# 개발자 도구 겹침 조사 — `/dev/secondary-stats`를 기준으로 `/dev/balance`와 다른 개발 화면 정리

> 출처: 기술 세션(Claude Code), 2026-11-14 KST, 줄기 `balance-report`(가지 `work/balance-report`, 기준 `703a018`).
> 사용자 지시(2026-11-14): "새로만든 /dev/secondary-stats가 메인이고 /dev/balance의 계산식은 필요없다. 또 불필요해진게 무엇인지 찾아보아라. 추가 가능한 기능을 2차스탯페이지로 옮겨라. /밸런스 페이지는 실제 전투시뮬레이션을 통해 다중반복, 공성전, 유닛 스탯 및 아이템 등의 비교 테스트를 위한 페이지로 개편해라 …"
> 방법: 화면 소스(`apps/game/src/editor/**`), tRPC 라우터(`apps/server/src/trpc/*.ts`), 기기 호출(`api.<router>.<proc>` grep)을 읽었다(**Verified**: 파일을 열어 읽음, 실행 아님). 판정: 유지 / 2차 스탯으로 옮김 / 지움.
> 이 줄기에서 지워도 되는 것은 사용자 지시가 정한 둘뿐이다: 계산식 탭과 그것만 쓰는 코드, 2차 스탯 화면이 완전히 겹치는 것(가중치 표 탭). 나머지 "지움 권장"은 **권장만** 하고 지우지 않는다(사용자가 정한다).

## 1. 판정 표 — 개발 화면

| 화면 | 판정 | 까닭·무엇과 겹치나 |
|---|---|---|
| `/dev` 개발자 홈 | 유지 | 목록. 밸런싱 묶음 설명 문구만 새 역할(2차 스탯 = 스탯·식, 밸런스 = 전투 보고서)에 맞춘다 |
| `/dev/secondary-stats` 2차 스탯 에디터 | 유지(기준) | 가중치·식 편집, 성장·K 띠, 그래프 3종, 비교표. 아래 "옮김" 기능을 받는다 |
| `/dev/balance` 밸런스 | 유지 → **전투 보고서 화면으로 개편** | 실제 전투 판정 N회 반복(파티·공성·A/B)과 보고서 기록. 스탯 편집·식은 빠진다 |
| `/dev/tuning` 설정 칸 패널 | 유지 | 49 설정 칸 전부(공성 제한·웨이브·경제 등). 2차 스탯 화면은 스탯 행·식만 다룬다. 겹치는 것은 "설정 칸 패널에도 스탯 행 칸이 보이는가" 정도이며 패널은 행을 따로 보이지 않는다(Verified: `TuningExtras.tsx`·`tuningModel.ts`에 stat_rows 편집 없음) |
| `/dev/battle-replay` 전투 다시보기 | **지움 권장**(지우지 않음) | 고정 시범 6 대 6(시드만 바꿈)을 3D로 본다. 밸런스 화면의 [3D 관람](`battleLab.replay`)이 같은 보기 화면(`src/battle/BattleReplayView`)으로 아무 파티·지형·시드를 보여 준다 → 기능이 그 부분집합이다. 지우면 `battleReplay.demo`·`apps/server/src/battleReplay/{services,compute,arena,jobRunner,replayWorker,names}.ts` 중 실험실이 쓰지 않는 것과 `e2e/battle-replay.spec.ts`, 미리 캐시 규칙 `[Bb]attleReplayLab`이 함께 빠진다(실험실이 `battleReplay/arena`·`names`를 쓰는지 지울 때 다시 본다) |
| `/dev/skills`·`/dev/items`·`/dev/effects`·`/dev/buildings`·`/dev/production`·`/dev/gather-tiers`·`/dev/creatures`·`/dev/recruit` | 유지 | 콘텐츠 편집기. 스탯·전투 보고서와 겹치지 않는다(보고서는 아이템을 고르기만 한다) |
| `/dev/planet-editor`·`/dev/star-system`·`/dev/nations`·`/dev/world-layout`·`/dev/territory`·`/dev/second-map`·`/dev/terrain-objects` | 유지(이번 조사 밖) | 세계 편집. 이번 지시와 겹침 없음(깊이 보지 않음 — **Unknown**: 서로의 겹침) |
| `/dev/gpu-bench`·`/dev/ops-grants` | 유지 | 진단·권한 |

## 2. 판정 표 — `/dev/balance` 탭

| 탭 | 판정 | 까닭·무엇과 겹치나 |
|---|---|---|
| [분포 상성] `analysis/MatrixTab` | 유지 | 같은 총합의 1차 분포끼리 전투 판정으로 승률표. 전투 시뮬레이션이라 새 밸런스 화면의 목적에 맞는다 |
| [스탯 영향도] `analysis/SensitivityTab` | 유지(밸런스에 남김) | 1차 옮기기·더하기 → 2차 스탯·사양 변화 + **전투 판정 승률·시간**. 2차 스탯 변화 표는 2차 스탯 화면의 그래프(1차 영향력·+10 한계효율·비교표)와 반쯤 겹치지만, 핵심 값(승률)은 서버 전투 일(`balanceAnalysis.*`)이다. 2차 스탯 화면으로 옮기면 분석 공용 모듈(`analysisModel`·`ConditionsPanel`·`JobBar`·`charts`·`lab/fields`·`useLabData`)이 두 지연 조각에 걸쳐 이름을 모르는 공용 조각이 생겨 미리 캐시 검사(`DEV_ONLY_SOURCE`)가 깨질 위험이 있다 → 밸런스에 둔다(질문 1376) |
| [전투 실험실] `lab/BattleLab` | 개편 → [전투 보고서] | 팀·유닛 편집·장비·미리 보기·프리셋·한 판·3D 관람은 그대로 쓰고, 몬테카를로 단추를 서버 보고서 일(N회·공성·A/B·기록)로 바꾼다 |
| [가중치 표] `WeightTab` | 2차 스탯으로 옮김 → **지움** | ① 가중치 칸 편집·[적용] = 2차 스탯 화면 편집 카드(`SecondaryStatEditCard`, 같은 `tuning.save` statRows)와 완전히 겹침. ② 1차 +10 기여 표(`balance.contribution`) = 2차 스탯 화면의 "1차 영향력 & +10 한계효율" 그래프와 레벨별 비교표가 같은 값을 기기에서 셈(`secondaryStatsSim`, sim과 1:1 시험 `secondaryStatsParity.test.ts`)해 겹침. ③ **1차 +10 대결 승률**(`balance.duels`, 지금 표 vs 고친 표)은 2차 스탯 화면에 없다 → 2차 스탯 화면으로 옮긴다(담은 가중치 칸으로 대결) |
| [계산식] `FormulaTab` | **지움**(사용자 지시) | 식 편집은 2차 스탯 화면(행 식·`combat:<id>` 전투 식, 함수 이름 자동 완성)이 맡는다. 계산식 탭에만 있던 **무기별 스태미나 표**(D-511, 일반 공격이 이어지나)와 **무기 적정치 표**(D-502)는 스탯 이야기라 2차 스탯 화면으로 옮긴다. 끌어 넣기 팔레트·식 풀이 미리 보기는 함께 지운다(2차 스탯 화면에 식 오류 위치·자동 완성이 있다) |

## 3. 서버 tRPC와 공용 코드

| 대상 | 쓰는 곳(지금) | 판정 |
|---|---|---|
| `formulas.list` | 계산식 탭, 2차 스탯 화면 | 유지(2차 스탯 화면) |
| `balance.table` | 가중치 표, 2차 스탯 화면 | 유지(2차 스탯 화면) |
| `balance.contribution` + `balance/services.ts` `contribution` | 가중치 표만 | 가중치 탭과 함께 **지움**(그 탭만 쓰는 코드) |
| `balance.duels` + `balance/compute.ts` 대결 | 가중치 표 | 유지(2차 스탯 화면으로 옮긴 대결 판이 쓴다) |
| `battleLab.catalog`·`preview`·`presets`·`savePreset`·`deletePreset`·`battle`·`replay` | 실험실 | 유지(전투 보고서가 쓴다) |
| `battleLab.monteCarlo` | 실험실 몬테카를로 단추 | **지움 권장**(지우지 않음): 새 보고서 일(`battleReport.*`)이 같은 일을 더 많은 수치·기록과 함께 한다. 화면에서는 단추가 빠진다. 지우면 `balance/jobs.ts`의 `monte` 일·`LabMonteCarlo*` 타입·`battleLab.db.test.ts` 몬테카를로 시험이 함께 빠진다 |
| `balanceAnalysis.*` | 분포 상성·영향도 | 유지 |
| `battleReplay.demo` | `/dev/battle-replay` | 화면과 함께 지움 권장 |
| `apps/game/src/editor/balance/formula*.ts`·`Formula*.tsx`·`formula*.css`·`useMediaQuery.ts`·`StaminaTable.tsx` | 계산식 탭만 | **지움**(스태미나·적정치 계산은 2차 스탯 쪽으로 옮겨 씀) |
| `WeightTab.tsx`·`BalanceTable.tsx`·`BalanceResults.tsx`(기여·대결 보기)·`balanceModel.ts`의 가중치 표 몫 | 가중치 탭만 | **지움**(대결 보기는 2차 스탯 쪽으로 옮겨 씀). `balanceMessages.ts`·`balanceModel.ts`의 오류 풀이(`balanceErrorOf`)는 분석·실험실이 써서 남김 |
| `@terra/shared/formula`(해석기·식 칸) | 서버, 2차 스탯 화면, sim | 유지 |
| `@terra/shared/balance` `BalanceContributionResponse` 등 | contribution | contribution과 함께 지움 |
| e2e `formulas.spec.ts` | 계산식 탭 | 지움(2차 스탯 시험이 식 편집을 본다) |
| e2e `balance.spec.ts`(가중치 표) | 가중치 탭 | 전투 보고서 시험으로 바꿈 |

## 4. 지움 권장(이 줄기에서 지우지 않음 — 사용자가 정함)

1. `/dev/battle-replay` 화면과 `battleReplay.demo`(1절). 밸런스 화면 [3D 관람]이 같은 일을 한다.
2. `battleLab.monteCarlo` tRPC와 그 워커 일(3절). 전투 보고서 일이 대신한다.
3. [스탯 영향도]의 "2차 스탯 변화 표"(승률 몫은 남기고 2차 스탯 몫만 2차 스탯 화면 그래프로 넘기는 정리, 질문 1376).
4. 개발자 홈 밸런싱 묶음의 옛 설명(계산식·6v6 다시보기) — 이 줄기에서 문구만 고친다.

## 5. 옮김 목록(3단계, `/dev/secondary-stats`에 더함)

| 기능 | 옛 자리 | 새 자리 |
|---|---|---|
| 1차 +10 대결 승률(지금 표 vs 담은 가중치 칸) | 가중치 표 [승률 돌리기] | 2차 스탯 화면 아래 "전투 승률 영향" 판(`balance.duels`) |
| 무기별 스태미나 표(D-511) | 계산식 탭 | 2차 스탯 화면 아래 "스태미나·적정치" 판(기기 계산, 담은 식이 바로 든다) |
| 무기 적정치 표(D-502) | 계산식 탭 | 같은 판 |
