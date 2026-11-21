# NPC 판단 예약 저장 — 배포마다 판단이 4.5~7.5시간 밀려 NPC가 한 번도 판단하지 않던 것 고침

- 일시: 2026-11-21 15:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-npc-brain-r5.md` "바뀜 (2026-11-21, 서버 판단 예약 저장)", 기획 D-323(판단 간격)·D-469(인구는 구인 카드로만), 줄기 `work/npc-decide-fix`(바탕 `497aba3e97`)

## 까닭 (Verified: 코드·NAS 1분 지표)
- NAS 서버 1분 지표: 05:00 UTC 배포 뒤 8분, 05:58 UTC 배포 뒤 20분 창 모두 `npcDecisions` 0, `npcHumans` 3,451·`npcFactions` 17 그대로, 구인 없음.
- 판단 간격 `d323_decide_every` = 21,600,000ms(6시간). `packages/sim/src/simulator/npcRun.ts` `scheduleDecide`는 지금 + 간격 − ¼ + 난수(½ 간격 + 1) = 4.5~7.5시간 뒤에 건다.
- `apps/server/src/npc/runtime.ts`는 켤 때마다 살아 있는 세력 모두를 `scheduleDecide(ctx, faction, startMs)`로 걸었고, 다음 판단 시각은 어디에도 저장하지 않았다
  (`factions.ai_step`은 판단 횟수 = 난수 차례일 뿐 시각이 아니다. `npc_society`에도 없음). NAS 배포는 1~2시간마다 → 판단이 늘 배포 뒤로 밀렸다.
- 판단 사건에 묶인 것: 행동(치기·전쟁 선언·마을 세우기·연구·지분 팔기·강화·봉신 끊기·폐허 복원·알박기), 세율(`taxPolicy`), 구인 규칙식(`recruitPolicy` — 행정 건물 구인 카드,
  인구가 느는 유일한 길), NPC 증축(`buildPolicy`), 조우 전투, 가문 자동 구인(`houseRecruit.ts decide`). 하루 끝(만족도·수명·반란·독립·연구 진행)·경제·정원사는 판단과 따로라 돌고 있었다.
- 다른 다시 걸기 길: `runtime.ts` 판단 꺼짐 스위치(`npcAiEnabled` 0)와 판단 뒤 다시 걸기·`attachSociety scheduleFaction`(새 세력)·`houseRecruit.schedule`(실행 중 새로 들인 가문)은
  실행 중 이어 거는 길이라 시뮬과 같게 둔다. 켤 때 거는 곳은 `runtime.ts` 한 곳뿐이었다.

## 한 일
1. 새 `apps/server/src/npc/decideSchedule.ts`:
   - `createDecideClock()` — `NpcContext.loop`를 감싸 판단 예약(`EVENT_DECIDE`)의 예약 번호·시각을 세력마다 적어 둔다. 세력의 `eventId`가 그 번호일 때만 "걸려 있음"(취소·처리된 것은 없음).
   - `resumeDecideAt` — 켤 때 첫 판단 시각: 저장된 시각이 지금 이후·최대 지연(간격 × 1.25) 안이면 그대로, 지났으면 지금 + [0, 3분), 없거나 너무 멀면 지금 + [0, 간격).
     난수 = `streamRng(세계 시드, 101, 세력, 판단 차례)`(서버 전용 흐름, 시뮬 흐름 1~10과 겹치지 않음).
   - `resumeDecides` — 켤 때 살아 있는 세력(NPC·가문) 모두 위 시각으로 건다.
2. `factions.next_decide_ms`(int8, null 허용) 새 칸 + 마이그레이션 `20261121062521_npc_next_decide`(prevIds `2d53a6a4…`). 세력 상태 쓰기(`factionState`·`houseFactionState`)에 칸을 더하고,
   `persist.ts` 세력 모습(서명)에 다음 판단 시각을 넣었다(판단마다 `ai_step`과 함께 바뀌므로 쓰기 수는 거의 그대로).
3. 1분 지표 `npcNextDecideMin`(가장 이른 걸린 판단까지 남은 분, 소수 한 자리, 없으면 −1) — NAS 점검에서 판단이 다가오는지 본다.
4. `runtime.ts`: 지표 칸을 모듈 함수 `zeroMetrics()`로 옮겨 되돌리기를 한 줄로 줄였다(995 → 992줄).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/decideSchedule.ts` | 새: 판단 예약 기록·켤 때 첫 판단 시각 |
| `apps/server/src/npc/decideSchedule.test.ts` | 새: 잇기·지난 시각 흩기·[0, 간격) 고른 분포·결정성·감싼 루프 기록 (5개) |
| `apps/server/src/npc/decideSchedule.db.test.ts` | 새: 켜기 → 저장 → 다시 켜기 → 같은 시각, 지난 시각 → 3분 안에 국가 셋 판단·다음 시각 저장 (2개) |
| `apps/server/src/npc/runtime.ts` | 감싼 루프·켤 때 이어 걸기·지표 |
| `apps/server/src/npc/persist.ts` | 세력 행에 `next_decide_ms` 쓰기 |
| `apps/server/src/npc/state.ts` | 켤 때 `next_decide_ms` 읽기 |
| `apps/server/src/world/persist/tables.ts` | 세력 상태 쓰기 칸 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261121062521_npc_next_decide/` | 새 칸·마이그레이션(더하기만) |
| `docs/adr/2026-11-01-npc-brain-r5.md` | "바뀜" 추가 |

## 함께 바꿔야 하는 파일
- 판단 예약을 서버에서 새로 거는 곳을 더하면 `ctx.loop`(감싼 루프)로 건다 — 날 루프(`loop`)로 걸면 저장되지 않는다.

## 건드리지 말 것
- `packages/sim` `scheduleDecide`·판단 난수(시뮬 바이트 같음). econ16 시드 1 × 30일: 고치기 전·뒤 줄 md5 `7cd12ba20fedfbd5e9383b99bc86bd3a`, 요약 md5 `dc70180ead8ccf6e74c7b060992c28cb` 같음(Verified). SIM_VERSION 그대로.

## 검증
- `decideSchedule.test.ts` 5/5, `decideSchedule.db.test.ts` 2/2, `runtime.db.test.ts` 4/4 (TEST_DATABASE_URL, Verified).
- 전체 `pnpm check`(TEST_DATABASE_URL): 시험 파일 816/816, 시험 5,988/5,988 통과(Verified).

## 미검증·TODO·알려진 문제
- NAS에서는 미실행: 이 판 첫 배포 뒤에는 저장된 시각이 없어 [0, 6시간) 고른 점(17개 국가면 첫 판단이 대개 20~30분 안), 그 뒤 배포부터는 저장 시각을 잇는다. 배포 뒤 `npcNextDecideMin`이
  줄어들고 `npcDecisions`가 0이 아닌지 본다(Assumed).
- 직전 판 앱으로 되돌리면 그 앱은 `next_decide_ms`를 쓰지 않아 옛 값이 남는다 → 다시 이 판으로 오면 지난 시각이라 3분 안에 판단한다(문제 없음).
- 실행 중 새로 들인 가문(`houseRecruit.schedule`)·새 세력의 첫 판단은 시뮬처럼 4.5~7.5시간 뒤(실행 중이라 저장되어 이어진다).

## 사용자 결정 대기
- 없음
