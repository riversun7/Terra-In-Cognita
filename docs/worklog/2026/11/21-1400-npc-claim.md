# 2026-11-21 npc-claim — NPC 빈 2차맵 알박기 1·2단계(시뮬 행동 `claim`·짓는 중 정부·새 도시), 서버 3단계는 질문으로

- 일시: 2026-11-21 14:00 (KST)
- 작업 도구: Claude Code
- 관련: 빈틈 2243(질문 `docs/questions/2026-11-16-alpak-2.md` 2243 가, 일정 `docs/worklog/2026/11/16-2210-fixes-1116o.md`), 기획 D-212·D-555 1509·D-554·D-572·D-574·D-575,
  ADR "바뀜" 절(`2026-11-01-npc-brain-r5.md`·`2026-11-14-second-map-build.md`), 새 질문 2331~2336(`docs/questions/2026-11-21-npc-claim.md`)
- 가지 `work/npc-claim`, 바탕 835fee603b(main, 묶음 1116s)

## 한 일
- **1단계 — 판단 행동 `claim`**(`packages/sim/src/npc/brain.ts`): `FactionView.claims`(부르는 쪽이 고른 빈 2차맵 후보)·`ClaimView`·행동 `{ kind: "claim", site }`.
  점수 = `npc_claim_score` + 상업 × `npc_claim_commerce` ÷ 1000 − 공격 × `npc_claim_aggression` ÷ 1000 − 가진 도시 × `npc_claim_city_penalty` − 바깥 전쟁(반란 소탕 빼고) ×
  `npc_claim_war_penalty` + 붐빔 `npc_claim_crowded_bonus` − 남이 짓는 중 `npc_claim_contest_penalty`. 예비금 없음·생필품 500‰ 아래면 후보 아님. 후보 목록 맨 끝(다른 행동
  점수·차례·굴림 수 그대로).
- **실행 자리 `NpcClaimRun`**(`simulator/npcRun.ts`): `options`·`act`. `factionView`가 후보를, `decide`의 `claim`이 실행을 부른다. 서버는 붙이지 않는다(후보 없음 → 서버 판단 그대로).
- **2단계 — 시뮬 짓는 중 정부**(`simulator/npcClaim.ts` 새): 자리 모형 = 합성 격자 칸(2차맵 하나), 빈 2차맵 = 도시·폐허·자리 칸이 아닌 칸, 인접 = 내 도시 칸 체비쇼프 반경.
  상한(동시 1·도시 6·세계 128·쉬기 10일·휴먼 (도시 + 1) × 12) → 값 소각(5,000) → 끝 예약 `claim_done`(짓는 시간 = 팩 행정 건물 Lv1 + 일 없는 휴먼 돕기, 경제 없으면 24시간)
  → 그 칸이 비었으면 새 도시(가문 마을 모양, 지분 1,000주 설립자 국고), 같은 칸 다른 세력 짓는 중은 멈춤(값 돌려주지 않음). 불변 조건 C1~C3. 요약 `npc.claims`.
- **도시 자리 함수 옮김**: run.ts의 `simCityXY`·거리·웨이브 변·공성 변을 `simulator/simGrid.ts`(새)로(값 그대로). 알박기 도시는 지은 칸(`createSimSites().place`) — 정원사 칸·
  공성·웨이브 변·폐허 창고 물건이 그 자리를 쓴다. `simSiegeEdge`는 run.ts에서 다시 내보낸다(시험 그대로).
- 설정 칸 15개(`npc_claim_*`, NPC 두뇌 페이지, 모두 [임시]) — 팩 `tuning.json`·`tuningNpc.ts`·계수표.
- 3단계(서버 `npcBuild`)는 하지 않았다 — 까닭은 아래 TODO·질문 2333.

## 판·마이그레이션·리셋
- **SIM_VERSION 106**(줄기 판 — 합칠 때 main 다음 판으로), 출력 형식 **23**(요약 `npc.actions.claim`·`npc.claims`, 줄기 판 — 합칠 때 main 다음), 팩 **core@166**(줄기 판, main 128).
- 프로토콜·DB 표 그대로 — 마이그레이션 없음. **리셋 필요 없음**(서버 판정 그대로 — 서버 NPC는 알박기하지 않는다. 서버 세계에는 새 설정 칸만 보인다).

## 시뮬 전·후 (Verified — 30일, 같은 코드에서 `npc_claim_max_active` 0(끔) ↔ 출발값(켬))
- 끔 = main: econ16 시드 1 × 30일, main 코드(stash)와 끔의 머리·요약 밖 줄 md5 같음(9a631f27…). 사건 수 1,090,938 같음.
- 표(끔 → 켬). 도시·휴먼 = 시나리오 세력 묶음이 끝에 가진 것(반란으로 갈라진 세력 빼고), 건물 = NPC 도시 등급 표 건물 합.

| 시나리오·시드 | 알박기 새 도시 | 도시 | 휴먼 | 끝 세력 | 건물 | 증축 | 구인 | 공격 행동 | 기술 평균(‰) | 만족도 |
|---|---|---|---|---|---|---|---|---|---|---|
| econ16·1 | 8 | 40 → 48 | 1,652 → 1,760 | 45 → 44 | 1,162 → 1,238 | 874 → 950 | 1,835 → 1,868 | 431 → 437 | 2,333 → 2,272 | 52 → 56 |
| econ16·2 | 7 | 40 → 47 | 1,884 → 1,965 | 46 → 46 | 1,127 → 1,203 | 839 → 915 | 2,083 → 2,080 | 294 → 344 | 2,326 → 2,369 | 52 → 54 |
| econ16·3 | 10 | 40 → 50 | 1,637 → 1,446 | 45 → 45 | 1,206 → 1,318 | 918 → 1,030 | 1,874 → 1,615 | 399 → 280 | 2,400 → 2,422 | 53 → 61 |
| war16·1 | 25(+1 짓는 중) | 52 → 72 | 2,307 → 2,292 | 31 → 27 | — | — | 1,622 → 1,424 | 450 → 379 | 2,870 → 3,074 | 66 → 67 |
| war16·2 | 19 | 48 → 66 | 2,083 → 2,182 | 31 → 27 | — | — | 1,298 → 1,234 | 516 → 547 | 2,870 → 3,074 | 65 → 66 |
| war16·3 | 25 | 48 → 73 | 2,161 → 2,363 | 31 → 28 | — | — | 1,540 → 1,631 | 191 → 54 | 3,032 → 3,071 | 71 → 71 |
| stub16·1 | 11 | 64 → 75 | 953 → 1,041 | 24 → 24 | — | — | 660 → 748 | 0 → 0 | 3,666 → 3,666 | 74 → 74 |
| stub16·2 | 8 | 64 → 72 | 953 → 1,017 | 23 → 23 | — | — | 600 → 664 | 0 → 0 | 3,782 → 3,782 | 74 → 74 |
| stub16·3 | 13 | 64 → 77 | 950 → 1,054 | 26 → 26 | — | — | 687 → 791 | 0 → 0 | 3,461 → 3,461 | 74 → 74 |

- 모든 실행 불변 조건 위반 0, 늦어 멈춘 짓기 0(후보가 남이 짓는 중인 칸을 뒤로 미룬다).
- 빠르기: econ16(처음 64도시) 30일 새 도시 7~10, war16(49) 19~25, stub16(64) 8~13. war16은 경제가 없어 짓는 시간이 24시간 고정이고 세력마다 휴먼이 많아 조건을 쉽게 넘는다.
  econ16 시드 3은 휴먼 −12%·공격 행동 −30%(새 도시가 국고·구인을 나눠 씀 — Assumed). 처음 출발값(점수 450·값 2,000·휴먼 6·쉬기 5)에서는 econ16 시드 1이 **첫날 16세력 모두**
  알박기하고 30일 25곳이라 지금 값으로 낮췄다(점수 350·값 5,000·휴먼 12·쉬기 10). 세계 상한 128은 시나리오가 이미 49~64도시라 64로 두면 알박기가 없어서 크게 두었다 —
  서버(3단계)는 도시 2차맵 상한 64를 따로 본다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/brain.ts`·`brain.test.ts` | 행동 `claim`·점수·시험 |
| `packages/sim/src/npc/coefficients.ts`, `packages/sim/src/tuningNpc.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 15개, 팩 166 |
| `packages/sim/src/simulator/npcClaim.ts`(새)·`npcClaim.test.ts`(새) | 시뮬 짓는 중 정부·새 도시·상한 |
| `packages/sim/src/simulator/simGrid.ts`(새), `run.ts` | 도시 자리 함수 옮김, 알박기 붙이기·예약·요약·불변 조건, 출력 형식 23 |
| `packages/sim/src/simulator/npcRun.ts` | `NpcClaimRun`·후보·실행·행동 수 |
| `packages/sim/src/simulator/npcBuild.ts` | `lotWeightOf` 내보내기(짓는 시간) |
| `packages/sim/src/simulator/npcBuild.test.ts` | 건물 수 상한 시험은 도시 수가 그대로여야 해 알박기를 끈다 |
| `packages/sim/src/version.ts` | SIM 106 |
| ADR 둘 "바뀜", 질문 `alpak-2`(2243 진행), 새 질문 `2026-11-21-npc-claim.md` | 기록 |

## 함께 바꿔야 하는 파일
- 합칠 때: SIM_VERSION 106 → main 다음 판, 출력 형식 23 → main 다음, 팩 166 → main 다음 판(`manifest.json`). `version.ts` 주석·ADR npc-brain-r5 "바뀜"·이 기록의 판 설명.
- `packages/sim/src/index.ts`는 999줄이라 새 이름을 내보내지 않았다. 서버(3단계)는 `NpcContext["claims"]`로 타입을 얻는다(`NpcClaimRun`·`ClaimView`를 따로 내보내려면 줄을 줄여야 한다).
- 서버가 알박기를 붙이면(3단계) `NpcContext.claims`에 서버 실행 자리를 넣는다 — `options`는 띄운 빈 2차맵·도시 2차맵 상한, `act`는 건물 서비스, 다 지음은 `landClaim.foundPending`.

## 건드리지 말 것
- `npcClaim.ts`는 서버가 쓰지 않는다(시뮬 자리 모형 = 합성 격자). 서버 거울 세계에 붙이면 가짜 칸에 도시가 선다.
- 후보 목록에서 `claim`은 맨 끝이어야 한다(앞에 넣으면 같은 점수 굴림 차례가 바뀐다 — 끈 판 = 옛 판이 깨진다).

## 미검증·TODO·알려진 문제
- **TODO 3단계(서버 `npcBuild`, 다음 줄기 `npc-claim-3` 제안, 질문 2333)**: ① NPC 도시 2차맵 이웃(행성 `neighbors8`) 가운데 빈 2차맵을 고르고 짓는 동안 띄워 둔다(그때 띄우기 상한·쉬면
  내리기에서 빼기), ② 건물 서비스에 NPC 행정 건물 짓기 길(지금 `npcBuild`는 단계 government를 막는다 — `facilities/service.ts` 989줄이라 새 모듈로), 재료 자리 = 가장 가까운 내 도시 창고,
  ③ 도시 없는 2차맵의 건물 자리(전략 배치 함수는 도시가 있어야 돈다 — 가운데부터 빈 4×4 찾기), ④ `npc/runtime.ts`(995줄)에는 `ctx.claims = …` 한 줄만, ⑤ DB 시험(짓기 → 틱 → 새 도시 →
  같은 2차맵 유저 짓는 중 멈춤). 다 짓기는 `landClaim.foundPending` 그대로(세력 주체 → `kindOf` "faction").
- 시뮬 재료 = 국고 값 [임시](질문 2331) — 유저·서버는 창고 재료. 같은 규칙으로 바꾸면 SIM 판을 다시 올린다.
- 시뮬은 플레이어가 없어 NPC가 플레이어 자리를 덮는지 못 본다(질문 2332).
- 시뮬 배후지(`catchment`)는 알박기 도시를 모른다(새 마을과 같다 — 받는 몫 = 다 받음).
- 행정 건물 레벨 1 짓는 시간(경제 있는 시나리오)의 실제 ms는 적어 두지 않았다(Unknown — 끝 예약 시각으로 셈).

## 검사 (Verified)
- 작업 중: `pnpm vitest run packages/sim` 117파일 999시험 통과(npcBuild 시험 하나 고친 뒤), `pnpm --filter @terra/sim typecheck`·`pnpm --filter @terra/server typecheck` 통과.
- 끝: `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·경계·크기·다국어(8,492키)·디자인 값(746쌍)·콘텐츠(core@166 c3a025601f4a) 통과,
  시험 파일 **810/810**, 시험 **5,957/5,957**. `pnpm check:docs 835fee603b` 통과. 빌드·화면 시험은 돌리지 않았다(`apps/game` 바뀜 없음).

## 사용자 결정 대기
- 질문 2331~2336(`docs/questions/2026-11-21-npc-claim.md`).
