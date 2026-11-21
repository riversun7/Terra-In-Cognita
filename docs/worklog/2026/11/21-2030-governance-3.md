# 2026-11-21 governance-3 — 점령 통치자 지분만 몰수·지배 쪽 지분 따라가기·군사 쿠데타·빈자리 도시 독립·국고 지분 팔기·나라 단위 판단 멈춤

- 일시: 2026-11-21 20:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-governance.md` "바뀜 (governance-3)"(제안 — 고침), 질문 표시 `docs/questions/2026-11-21-governance-3.md`(2431~2440 + D-583), 새 질문
  `docs/questions/2026-11-21-governance-4.md`(2451~2460), 기획 D-293·D-298·D-346·D-338·D-344·D-580 1·6·D-582·D-574 10·D-575·D-252·D-128·D-5057·D-217·D-301·D-302·D-341·D-323·D-555 1509·D-576·
  D-256·D-326·D-583
- 가지 `work/governance-3`, 바탕 main 4d5e42ac56(묶음 1116x) + main 53f4350c3a(NPC 자율행동 290241aa68·누르는 곳 24px) 합침

## 한 일
- **2431 나 — 점령 몰수 = 통치자 지분만**: 시뮬 `settleShares`가 옛 통치자 국고 + 옛 통치자 지배 가문 계정(서버 고리 `rulerShareHousesOf`)만 몰수. 세운 가문·알박기 설립자 지분은 남고 독재
  점령국 과반 셈(D-346 — 모자라면 상장폐지, 원래 있던 길)에 든다.
- **2432 나·(다) — 지배 쪽 지분**: 새 표 `governance_share_houses`. 독재 나라 지배 가문이 바뀌면(수도 이전) 옛 가문 계정 지분 → 새 지배 가문. 지분 과반을 사서 독재가 되면 국고 지분은
  국고에 남는다(treasury_kept). 쿠데타는 바로 기록.
- **2433 — 군사 쿠데타 끝까지**: `gov_coup`(가문장)·NPC 성향 규칙식 → 참가 받기(누구나 `gov_coup_join`, NPC 가문 성향 규칙식) → 반란 전투 틀 전투(`@terra/sim runCoupBattle`) → 이기면 독재
  지배 가문·전 지분 몰수·만족도 벌칙, 지면 비용·만족도 벌칙, 이긴 편 명성(공훈)·신용 고리. 설정 칸 10개(`gov_coup_enabled` 출발값 0 — 꺼짐). 화면 쿠데타 칸.
- **2434 나·2440 나 — 나라 단위 판단 멈춤**: 빈자리·선출된 플레이어 지도자 나라는 NPC가 새 선포·강화·봉신 독립·거래세를 하지 않는다(`SimHooks.nationLocked`). 선출된 지배 가문장이 나라 세금
  명령으로 그 나라 세금을 정한다. 독재 지도자는 선전포고 직권.
- **2434 (가) — 빈자리 도시 독립 투표**: 빈자리가 설정 기간을 넘으면 시작 도시가 아닌 도시마다 안건 `city_independence`(그 도시 투표권, D-302 문턱), 가결 → 새 도시국가.
- **2435 — 자본주의 독립 투표에 가문 지분**: 합·찬성에 든다(고리 `houseIndependenceYes`). 가문 독립은 미룸.
- **2438 — 국고 지분 팔기 안건**: `treasury_share_sale`(독재 = 직권), 승인 → `approvedShareSale` 고리(시장 줄기 TODO).
- **2439 나 — 독재 지배 가문이 판다**: 시뮬 `sellShares` + 고리 `shareSellerOf`, 돈은 가문 금고, 과반 유지.
- **2436 다** — 이미 막혀 있음을 DB 시험으로 확인. 2436 가·나·2437·2435 가 — 기술 기본값 그대로 답 표시.
- main 합침(NPC 자율행동 7축): 충돌은 `tuning/scope.ts`·팩 `tuning.json`·`manifest.json`·메시지 ko·en(모두 둘 다 남김). 쿠데타 마이그레이션은 main 끝(`1efb9fa9` npc_unit_traits) 위로 다시
  만들었다(아직 어디에도 적용되지 않은 줄기 마이그레이션).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/occupation.ts`·`uprising.ts`·`coupBattle.ts`(새)·`houseShareApi.ts`, `simulator/society.ts`·`societyTypes.ts`·`npcRun.ts`, `npc/brain.ts`, 시험 셋 | 통치자 지분만 몰수, 독립 투표 가문 지분, 쿠데타 전투, 도시 독립, 독재 가문 지분 팔기, 나라 단위 판단 멈춤(서버 고리 넷 — 시뮬은 고리 없음) |
| `packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 10개, core@173(줄기 판) |
| `packages/shared/src/governance.ts` | 안건 종류 둘, 안건 도시·지분 팔기 칸, 쿠데타 조회 |
| `packages/protocol/src/governance.ts`·`index.ts`·`version.ts`, 시험 | `gov_coup`·`gov_coup_join`·결과 코드 5·행동 2·`treasury_share_sale` 칸, 프로토콜 98·97(줄기 판) |
| `apps/server/src/db/governanceSchema.ts`, `drizzle/20261121112634_governance_coups/` | 새 표 셋, 안건 종류 검사 넓힘 |
| `apps/server/src/governance/coup.ts`·`coupStore.ts`·`portCoup.ts`·`cityVotes.ts`(새), `service.ts`·`shareFixups.ts`·`port.ts`·`view.ts`·`store.ts`·`rules.ts`·`npcVote.ts`·`gateway.ts`·`attach.ts`, 시험 | 위 한 일 |
| `apps/server/src/npc/governanceHooks.ts`(새)·`rulingVault.ts`·`economy.ts`·`cityHouses.ts`, 시험 | 의결 고리 넷(점령·독립 투표·판단 멈춤·지분 팔기), `controlOf` |
| `apps/server/src/government/nationTaxPolicy.ts`, DB 시험 | 선출된 지배 가문장의 나라 세금(2440 나) |
| `apps/server/src/session.ts`, `tuning/scope.ts` | 쿠데타 메시지 받기(판 98), 새 칸 실시간 반영 |
| `apps/game/src/faction/governance/CoupSection.tsx`(새)·`GovernancePanel.tsx`·`governanceText.ts`·`governanceCommands.ts`·`governance.css`, `messages/{ko,en}.json` | 쿠데타 칸, 안건·결과 문구 24개(ko·en) |
| ADR·질문 둘·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 98·97 → 묶음 판(`version.ts`·`governance.ts COUP_PROTOCOL_VERSION`·ADR 판 줄·시험), 팩 core@173 → 묶음 판. 마이그레이션 prevIds = `1efb9fa9`(main 끝) — 다른 줄기가 같은 끝에
  더하면 형제 갈래로 그대로 합친다.
- 신용 줄기(work/credit)가 main에 오면 `attachGovernance({ rewardCredit })`을 잇는다. 정부 지분 시장 줄기는 `approvedShareSale`을 잇는다. 앱이 팩 전투 자료를 의결에 넘기려면
  `attachGovernance({ combat })`(지금은 시험 자료 — app.ts 줄 수 상한).

## 건드리지 말 것
- `governance_share_houses.treasury_kept`를 지우면 지분 과반 매수 독재의 국고 지분이 다음 틱에 지배 가문으로 옮겨진다.
- 시뮬 고리 넷(`rulerShareHousesOf`·`houseIndependenceYes`·`nationLocked`·`shareSellerOf`)은 시뮬이 붙이지 않아야 판정이 그대로다.

## 검사 (Verified — 실행)
- 시뮬 판정 그대로: econ16·war16 시드 1~3 30일, 바꾸기 전(main 4d5e42ac56)·뒤(이 줄기, main 합치기 전) 출력 줄·요약이 머리 줄의 팩 판·해시(core@133 → 173)와 linesHash 말고 모두 같다.
  linesHash 앞 → 뒤: econ16 9c591849·0aceacbd·3220f4f5 → 4fb85dc4·57f87bbe·4af5a016, war16 01fe699a·ab13da25·6c7171da → ff55a6bb·ff8d3780·7e223005(팩 머리만 다름). SIM_VERSION 그대로(67).
- 시뮬 `src/society`·`src/npc`·`src/tuning` 30 파일 266 시험, 프로토콜 30 파일 183 시험, 게임 `src/faction` 3 파일 21 시험 통과(합친 뒤).
- 서버 의결·세금·가문 정책·NPC 고리 DB 시험(TEST_DATABASE_URL) 15 파일 86 시험 통과 — 새 `governance3.db.test.ts` 4개: 쿠데타(시험 실행에서 혁명군 승리 길 — 독재·지분 몰수 확인), 지분
  과반 매수 독재의 국고 지분 400주 남음·독재 직권 선전포고·국고 지분 팔기, 지배 쪽 지분 따라가기·자본주의 발의 하한, 빈자리 도시 독립(가결 → 새 도시국가).
- `pnpm settings:cells --check` 통과.
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, main 합친 뒤) **통과**: 시험 파일 **846/846**, 시험 **6,120/6,120**.
- `pnpm build` 통과, `pnpm check:bundle` 첫 화면 110,747 B / 131,416 B.
- 화면 시험 `e2e/governance.spec.ts` **6/6 통과**(48.0초). 쿠데타 칸(설정 칸이 꺼져 있어 기본 화면에는 보이지 않는다)·새 안건 문구의 사진은 이 시험이 다루지 않는다(미검증).

## NAS 첫 켬 영향 (Assumed — 코드 읽기·DB 시험)
- 마이그레이션: 새 표 셋, 안건 종류 검사 넓힘(직전 판 앱 그대로).
- 독재 나라마다 `governance_share_houses` 줄이 생긴다(지금 지배 가문 — 옮김 없음). 국고 → 지배 가문 옮기기는 원래대로.
- 쿠데타는 꺼져 있다(`gov_coup_enabled` 0). 빈자리 도시 독립은 빈자리 14일 뒤라 첫 켬에는 없다(빈자리는 governance-2부터).
- 선출된 플레이어 지배 가문·빈자리 나라가 있으면 그 나라 NPC는 새 선포·강화·봉신 독립·거래세를 멈춘다.
- 점령 몰수 바로잡기: 가문 계정 지분은 governance-2(묶음 1116x)부터 생긴다. 그 뒤 점령(지분 유지)이 세운 가문 지분까지 몰수했을 수 있지만, 원장에서 그 거래를 가를 표지가 없고
  1116x 배포 뒤 시간이 짧아 바로잡기를 만들지 않았다(Unknown — 운영 확인 필요하면 감사 기록 governance.shares_to_house reason capitalism_founders 도시의 지금 가문 계정과 비교).

## 미검증·TODO·알려진 문제
- 화면: 쿠데타 칸·도시 독립·국고 지분 팔기 문구는 사진이 없다(미검증 — 의결 화면 시험 6/6은 통과).
- 쿠데타 전투는 시험 전투 자료, 거울 세계 유닛 부상만 남는다(2456). 플레이어 참가자의 사이보그·미니언은 대개 병력으로 들지 않는다(2455).
- 의결 NPC 규칙식(표·후보·쿠데타)은 나라 4축 성향 + 도시 만족도 그대로다 — main의 NPC 가문 7축 실효 성향(`npc/npcHouseAi.ts`)에 잇지 않았다(TODO).
- 화폐(중앙은행 공식)·강화·거래세를 지도자가 정하는 명령은 없다(2452·2453·2460).
- 선출로 바뀐 지배 가문은 선출 기록을 따르지만, 수도 이전 지분 따라가기는 독재 나라 틱에서만 본다.

## 사용자 결정 대기
- `docs/questions/2026-11-21-governance-4.md` 2451~2460.
