# 가문 연맹 바로잡기(조약)·NPC 투자 판단·비접속 관리인 늘 켬 (사용자 답 D-587)

- 일시: 2026-11-22 01:24 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-npc-needs-drives.md` "바뀜 (2026-11-22, D-587 연맹 바로잡기·NPC 투자 판단·관리인 늘 켬)", 질문 `docs/questions/2026-11-21-npc-houses.md`(2461~2467 답 표시)·`docs/questions/2026-11-22-league-fix.md`(2501~2508 새 질문), 커밋 `6a91da1ad9`(고친 대상), `SIM_VERSION` 140(줄기 판), 팩 `core@180`(줄기 판)

## 한 일
- **연맹 = 가문끼리 맺는 조약**(2461 나·2462 다·2463·2464): 도시마다 저절로 있던 연맹(분담금·기금·대표 성향 투자 — 확장·생산 = 기금 → 국고, 군사 = 연맹 구인, 기술 = 도시 연구 레벨 +1)을 없앴다. 조약 규칙만 순수 함수로 남겼다(만든 가문 = 대표, 스스로 고를 때만 들기, 대표 위임, 대표는 위임 전 못 나감 [임시]). 투표는 [임시] 없음 + 질문 2503. 저장·명령·화면은 우호 기능이 정해진 뒤(2501·2502).
- **D-586 바로잡음**: "세력 확장이다 …"를 연맹에 붙인 ADR 절·질문지 표에 "대체됨/바로잡음"을 달았다.
- **NPC 투자 판단**(2465, 판정 바뀜): 세력 판단(D-323) 연구 시설 후보에 비용 몫(값 ÷ 국고 × 가중치)을 빼고, 막히지 않은 앞선 연구는 자본 배수에 비례한 도전 확률로 굴려 넘을 때만 후보로 했다(`npc/invest.ts`, 굴림 흐름 11). 설정 칸 3개 [임시]. 군사는 기존 구인 규칙식 그대로(질문 2508).
- **비접속 관리인 늘 켬·24시간 상한 없음**(2466 가): 스위치 칸 없앰, 대기 칸 상한 1시간. 남의 시설 임금형 계약으로 일하는 비접속 유저 유닛은 24시간 뒤에도 일하고 산출을 낸다(정산 고리 `exemptOffline` → sim `settleOwnerPeriod` `offlineExempt`, 부상 굴림도 같은 끝). 관리인은 일꾼 쪽이 돈을 내지 않는 임금형 받기만 한다(손실 위험 있는 길 없음, 코드 읽기로 확인).
- 2467: 기술 기본값 그대로(코드 안 바꿈).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/houseLeague.ts`·`.test.ts`, `packages/sim/src/npc/leagueBrain.ts`·`.test.ts` (지움) | 도시 연맹 기금·투자 없앰(2461·2464) |
| `apps/server/src/factionIdentity/houseLeague.ts`·`.test.ts` (새) | 연맹 조약 규칙(만들기·들기·나가기·위임) |
| `apps/server/src/npc/aiBridge.ts`, `npc/runtime.ts` | 연맹 고리·`ties.npc` 없앰, `houseDay`는 가문세·돌봄만 |
| `packages/sim/src/npc/aiIndex.ts`, `npc/aiCoefficients.ts`, `tuningNpcAi.ts`, `apps/server/src/tuning/scope.ts`, `apps/game/src/editor/npcAi/NpcAiUnitTab.tsx` | 칸 `npc_ai_league_dues_pm`·`npc_ai_league_lot`·`npc_ai_offline_steward_enabled` 없앰 |
| `packages/sim/src/npc/invest.ts`·`invest.test.ts` (새), `npc/brain.ts`, `npc/coefficients.ts`, `simulator/npcRun.ts`, `tuningNpc.ts`, `apps/game/src/editor/npcAi/npcAiModel.ts` | NPC 투자 판단(비용 몫·도전 확률), 칸 `npc_invest_cost_weight_pm`·`npc_invest_challenge_step_pm`·`npc_invest_challenge_max_pm`(/dev/npc-ai 연구 카드) |
| `packages/sim/src/version.ts` | `SIM_VERSION` 71 → 140(줄기 판 — 묶음이 다시 매긴다) |
| `packages/sim/src/settle/owner.ts`·`owner.test.ts`, `apps/server/src/world/settlement.ts`, `apps/server/src/labor/offlineSteward.ts`·`.test.ts` | 관리인 늘 켬, 24시간 상한 빼기(`stewardExemption`·`exemptOffline`·`offlineExempt`) |
| `content/core/tuning.json`, `id-changes.json`, `manifest.json` | 칸 3개 더함·3개 지움(뒤에 추가로 기록, `since: 180`), 대기 칸 상한 1시간·설명, 팩 138 → 180(줄기 판) |
| `docs/adr/2026-11-21-npc-needs-drives.md` | 옛 연맹·관리인 절에 대체 표시, 새 "바뀜" 절(전·후 비교 포함) |
| `docs/questions/2026-11-21-npc-houses.md`, `docs/questions/2026-11-22-league-fix.md` | D-587 답 표시, 새 질문 2501~2508 |

## 함께 바꿔야 하는 파일
- `SIM_VERSION`을 올리면 `packages/sim/src/version.ts` 한 곳(서버 `config.ts`는 다시 내보낸다). 묶음이 합칠 때 140을 다음 번호로 바꾼다.
- 투자 판단 칸을 바꾸면 `coefficients.ts`(출발값)·`tuningNpc.ts`·팩 `tuning.json`·`npcAiModel.ts` 넷을 같이.

## 건드리지 말 것
- 연맹 조약에 저장·명령·화면·효과를 지어 붙이지 않는다(2501·2502 답 전, D-584).
- 옛 연맹 기금 계정(`league:city:*`) 잔고를 옮기지 않는다(2505 답 전).

## 미검증·TODO·알려진 문제
- 서버 실제 세계에서 관리인 24시간 넘김(산출·임금·부상)을 실행으로 보지 않았다 — 단위 시험만(sim `owner.test.ts` 상한 빼기, 서버 `offlineSteward.test.ts` 고리). 서버 `settlement.ts`의 고리 연결은 시험이 없다(Unknown).
- 서버 실제 세계의 NPC 연구 빈도 변화는 재지 않았다(시뮬 econ16만, ADR 표).
- `stewardExemption`은 유닛마다 계약 표를 훑는다(비접속 주체 정산 때만).
- 옛 연맹 기금 잔고가 그대로 남는다(질문 2505).

## 사용자 결정 대기
- `docs/questions/2026-11-22-league-fix.md` 2501(연맹 우호 기능)·2502(들기 절차·NPC 가문)·2503(투표)·2504(대표 나가기·연맹 수)·2505(옛 기금)·2506(24시간 상한 빼기 범위)·2507(관리인 일 부상)·2508(투자 판단 넓히기).
