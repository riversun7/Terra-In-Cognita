# 밸런스 화면 완전 개편: 분포 상성·스탯 영향도

- 일시: 2026-11-08 21:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-balance-screen.md` "바뀜 (2026-11-08 완전 개편)", 질문 875~879(`docs/questions/2026-11-08-devtools-balance.md`), 가지 `work/devtools-balance`(로컬 `merge/integration` `07e08fa` 위)

## 한 일
- 사용자 판정(원문 "굉장히 허접한 밸런스 테스트이다 고작 스탯+10만 비교하는게 아니라, 동일한 총스탯합도 각 스탯 분포마다 어떤 상성을 가지는지, 스탯마다 영향도 등 다방면에서 평가를 해야한다. 완전 개편 세밀한 테스트가능하게 개편필요")을 넣었다.
- **[분포 상성] 탭(첫 탭)**: 같은 총합의 1차 분포 2~10개(출발값 7개 [임시] + 직접, 분포마다 유닛 틀 따로 가능) × 총합 1~4개. 짝마다 시드 몬테카를로 → 승률 열지도(숫자 + 95% 윌슨 구간, 확실한 칸 굵게), 칸 풀이(승·판정승·같음·판정패·패, 평균·중앙 시간, 편 초당 피해, 생존율), 상성 요약(순위·평균 승률·확실히 이김/짐·가장 잘 이기는 상대·천적·가위바위보 고리·우세·열세), 분포별 사양 표.
- **[스탯 영향도] 탭**: 기준 분포·총합에서 1차마다 단계(옮기기 = 총합 그대로 / 더하기 = +k). 변형마다 2차 스탯 전체·사양 요약, 판 수가 있으면 변형 vs 기준 승률·시간과 기준 vs 기준 대조. 지표(승률‰p, 공격 지수·버팀·실제 공격력·전투 시간 ‰ 비율) × 단계로 순위 막대(구간 수염), 단계별 곡선(SVG, 줄 모양·끝 이름표·범례·값 풍선), 2차 변화 표, 변형 전체 표.
- **조건**(두 탭): 유닛 틀(샘플·팀 프리셋·팀 A 유닛), 무기 바꿈, 레벨, 총합 기준(성장 끔 / N5·K 성장), 속성값, 스킬 켬/끔, 장비 켬/끔, 편 인원 1~6, 한 판 제한.
- **서버 일**: tRPC `balanceAnalysis.start`·`status`·`list`·`cancel`(dev·admin, `tuning:read` 두 겹). 계획(`battleLab/analysis.ts`) → 묶음 칸(`analysisBatch.ts`, 전투 실험실 `runArenaMonteCarlo` 그대로) → 워커(`balance/duelWorker.ts` 일 종류 `batch`, 판마다 진행) 또는 같은 스레드(칸마다 양보). 최악 비용 ≤ 600,000 전투 초, 한 번에 하나(실험실 바쁨과 따로), 시작·조회 속도 제한 따로, 취소, 제한 시간, 감사 기록 `balance_analysis.start`·`cancel`, 메모리 보관 30분·20개, 화면 재접속 때 최근 일 이어 보기.
- **내보내기**: CSV 복사·받기, JSON(입력 + 결과) 복사.
- [가중치 표]·[전투 실험실]·[계산식] 탭은 그대로다(가중치 덮어쓰기·검사·감사 그대로). 판정 코드는 바꾸지 않았다(SIM_VERSION 그대로), `runArenaMonteCarlo`에 진행 알림 선택 인자만 더했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/balanceAnalysis.ts`(+ 시험), `packages/shared/package.json` | 분석 입력·결과 모양, 점수 나누기·옮기기, 윌슨 구간, 상성 요약, 비용·입력 검사, 분포 출발값 |
| `apps/server/src/battleLab/analysis.ts`·`analysisBatch.ts`·`analysisRunner.ts`·`analysisJobs.ts`·`analysisSchema.ts`(+ `analysis.test.ts`·`analysis.db.test.ts`) | 계획·묶음 일·워커/같은 스레드 돌리기·일 서비스·입력 형식 |
| `apps/server/src/battleLab/arena.ts` | `runArenaMonteCarlo`의 판 진행 알림(선택, 결과 그대로) |
| `apps/server/src/battleLab/services.ts` | 전투 실험실 공유 묶음에 분석 서비스(같은 실효 규칙) |
| `apps/server/src/balance/duelWorker.ts` | 워커가 `batch` 일을 돌고 진행을 보낸다 |
| `apps/server/src/trpc/balanceAnalysis.ts`·`router.ts`, `apps/server/src/app.ts` | 라우터, 묶음 돌리는 쪽(워커/같은 스레드)·시험용 제한 연결 |
| `apps/game/src/editor/balance/analysis/*` | 두 탭·조건·일 막대·열지도·막대·곡선·문구·CSS·순수 코드(+ 시험) |
| `apps/game/src/editor/balance/BalancePanelScreen.tsx` | 탭 둘 더함(첫 탭 = 분포 상성), `?tab=` |
| `apps/game/messages/{ko,en}.json` | 화면 문구 157개(ko·en) |
| `e2e/balance.spec.ts`, `e2e/battleLab.spec.ts` | 분석 시험·배치 사진·나쁜 자료·권한, 실험실 시험은 `?tab=lab`으로 연다 |
| ADR·PLAN 14장·질문 875~879 | 기록 |

## 함께 바꿔야 하는 파일
- 판정 함수(`buildLabUnit`·`runArenaMonteCarlo`)의 모양이 바뀌면 `battleLab/analysis.ts`·`analysisBatch.ts`도 본다.
- 분석 결과 모양(`@terra/shared/balanceAnalysis`)을 바꾸면 화면 `analysisModel.ts`의 CSV·저장 모양 검사, JSON 판(1)을 함께 바꾼다.

## 건드리지 말 것
- 칸 시드 규칙(`cellSeed`)을 바꾸면 같은 시드의 옛 결과·내보낸 JSON을 다시 낼 수 없다.
- 열지도 색 섞기 상한 45%(글자 대비).

## 미검증·TODO·알려진 문제
- NAS에서 분석 비용을 재지 않았다(Unknown). 상한·제한 시간은 개발 컨테이너 잰 값 기준.
- 결과는 서버 메모리에만 있다(다시 켜면 사라짐 — 같은 시드로 다시 돌리면 같다).
- 같음을 반 승으로 센 점수의 윌슨 구간은 근사다. 공격 지수는 방어 전 값이다.
- 여러 사람이 동시에 분석하면 한 사람만 돈다(나머지 `busy`).

## 사용자 결정 대기
- 질문 875~879(분포 출발값·상성 목표 범위·대표 조건·시간 초과 판정·약한 1차 기준).
