# 나라 의결(governance): 안건·투표·선출·체제 전환 첫 판, 서버 의결 서비스 + 프로토콜 56

- 상태: 제안
- 날짜: 2026-11-21
- 관련: 질문 `docs/questions/2026-11-21-governance.md`(2351~2365, 사용자 답 D-580·D-581, 기획 대조 1116t), 남은 질문 `docs/questions/2026-11-21-governance-2.md`(2401~), 기획 D-217·D-221·D-5057·D-574 10·D-344·D-349·D-293·D-298·D-131·D-302·D-304·D-338·D-323·D-554·D-555 1509·D-256, 46 §1.3, 50 §10.3, 49 S34, ADR `2026-11-11-faction-identity.md`(가문·지배 가문 = 수도 가문 질문 2012), `2026-11-11-house-village.md`(가문을 거울 세계 세력으로), `2026-11-01-faction-society-core.md`(체제·지분 = 원장 자산), `2026-11-01-npc-brain-r5.md`(NPC 판단 틀 D-323)

## 배경
- 지금 코드(Verified: 코드 읽기, main `497aba3e97`): 체제(`factions.regime`)는 세울 때 정하고 바뀌지 않는다. 어느 체제든 지배 가문의 장이 정책을 정하고 정부 판이 민주주의·자본주의에 "투표가 열리기 전까지 [임시] 대표"라고 적는다(`packages/shared/src/government.ts`). 투표 탭(`FactionVotes.tsx`)은 시안 자료만 있다.
- 기획 결정: 체제 셋(D-217 — 독재 = 지배 가문장이 정함, 민주주의 = 소속 가문 투표, 자본주의 = 지분 의결권), 안건 목록·정족수·기간은 설정값·독재는 투표 없음·실제 시간(D-5057), 체제 전환 7일 유예(D-131), 독재 = 지배 가문 지분 과반, 나머지 지분은 의결권 없음(D-344·D-349), NPC도 똑같이(D-555 1509).
- 사용자 답(D-580): 2351 가(지도자는 늘, 민주주의 = 소속 가문장, 자본주의 = 의결권 ≥ 설정값), 2355 가(가문마다 한 표, 가문장이 던짐, 무소속 표 없음), 2356 가(나라 모든 도시 지분의 합, 한 주 한 표), 2357(민주주의·자본주의 2주~1달마다 다시 뽑음, 해임 안건은 언제든, 독재는 임기 없음), 2358 가(다른 가문 사람이 뽑히면 지배 가문이 그 가문으로), 2361 나(NPC = 점수 고르기 + 성향 프리셋 + 규칙식, 따로 무게 칸 없음), 2362 가(독재 → 다른 체제 = 지배 가문장 직권, 반란은 옛 나라 체제를 바꾸지 않음 D-256), 2363(지분 과반을 사서 독재 — 나머지 지분은 남고 의결권만 잃음, 군사 쿠데타는 정해지지 않음).
- 사용자 답(D-581): 2356 국고 지분 표 = 기권이 아니라 그 의결권을 다른 주주에게 지분 비례로 나눈다. 2357 확정(민주주의·자본주의 2주~1달 설정, 독재 임기 없음).
- 기술 기본값(기획 합의): 2352 나(기간·정족수 설정 칸, 급한 안건 짧게), 2353(정족수 있음 — 기권을 고른 표는 들고 불참은 안 듦), 2354(통화 단계 2/3, 그 밖은 설정 칸 — 출발값 나), 2359 가(단순 다수), 2360(동점 현상 유지 → 가문 판 점수 → 먼저 등록), 2364(체제·통화 7일 유예, 전쟁 즉시), 2365 가(공개 투표·위임 없음·불참은 안 셈).

## 선택지
1. 서버 의결 서비스(새 모듈 `apps/server/src/governance`) + 새 표 넷 + 거울 세계 세력의 체제를 바꾼다. 시뮬은 그대로.
2. 시뮬(`packages/sim/src/society`)에 의결 층을 넣고 서버가 같은 함수를 부른다. — 시뮬에는 플레이어·가문 투표자가 없고(가문은 서버만, ADR house-village), 지금 시뮬 체제는 바뀌지 않아 의결 층이 판정에 필요한 곳이 없다. 넣으면 시뮬 출력이 바뀌어 SIM_VERSION을 올려야 한다.
3. 정부 판·세력 화면 조회 안에 의결을 섞는다. — 정부 판(`government/reads.ts`)은 2차맵 건물 판이고 크다. 따로 둔다.

## 결정
선택지 1.

### 1. 표(마이그레이션 `20261121060714_governance`, prevIds `2d53a6a4`, 새 표만)
- `governance_agendas`(안건: 나라·종류·열 때 체제·올린 가문/주주 열쇠·payload·열림·등록 끝·닫힘·상태·셈 결과·집행 시각), `governance_votes`(안건 × 투표자 열쇠, 닫힐 때까지 바꿀 수 있다), `governance_candidates`(선출 후보 가문), `governance_state`(나라마다 선출로 정한 지배 가문·임기 끝·의결권 정지 표시). 모두 세계 표(시험 세계 새로 시작에서 지운다). 직전 판 앱은 모른 채 돈다.
- 열쇠: 가문 `p:<플레이어 가문 세력 행>`·`n:<NPC 가문 ID>`, 주주 `o:<소유 주체 ID>`.

### 2. 세계 포트(`port.ts`)
- 나라 = 거울 세계에서 살아 있고 위 세력이 없는 세력(NPC 나라·독립 플레이어 가문 나라). 봉신은 위 나라의 가문으로 든다.
- 처음 지배 가문 = NPC 나라는 수도에서 처음 세운 NPC 가문(D-574 10 — `cityHouses.rulingHouseOf`), 플레이어 가문 나라는 그 가문. 선출 기록이 있으면 그 가문.
- 지분 = 그 나라 모든 도시의 원장 자산 `share_<도시 ID>` 주체별 합(`@terra/sim holdingsOf`).
- 체제를 바꾸면 거울 세계 세력의 `regime`을 바꾸고 세력 행을 바로 쓰기 대기열에(`npc.houses.flush`). 선전포고는 세력·사회 `declareWar`(무명분 비용 포함 — NPC와 같은 길) + 런타임 틱 한 번.

### 3. 투표권(`electorate.ts`)
- 독재: 없다. 민주주의: 그 나라 소속 플레이어 가문(가문장 — houseTies.ts 소속 규칙: 그 가문 자신·도시를 가진 봉신·도시 없는 가문의 소속 도시 나라)과 그 나라 도시의 NPC 가문마다 1. 자본주의: 주주 = 소유 주체(사용자 = 그 사람, 플레이어 가문 국고 = 가문장, 다른 NPC 나라 국고 = NPC 규칙식). **그 나라 국고 지분은 표를 던지지 않고 다른 주주에게 비례로 나눈다(D-581)**: 무게 = 가진 주 + ⌊국고 주 × 가진 주 ÷ 다른 주주 주 합⌋. 다른 주주가 없으면 투표권이 비어 정족수를 못 채운다(현상 유지).
- 지도자 = 지배 가문의 장(플레이어 가문이면 그 가문장 계정, NPC 가문이면 없음).
- 지배 쪽 지분 몫(D-344) = (그 나라 국고 + 지배 플레이어 가문 국고) ÷ 그 나라 도시 지분 합. 국고를 지배 쪽으로 치는 것은 시뮬 `rulingFamilyOf`(국고 = 지배 가문 금고 [임시])와 같다. 지분이 없으면 과반으로 본다.

### 4. 명령(WebSocket, 프로토콜 56(묶음 1116v, 줄기 판 94) — 받는 가장 낮은 판 55)
- `gov_propose { kind, regime?, targetNationId? }`·`gov_vote { agendaId, choice }`·`gov_candidate { agendaId }` → `gov_result`(ok: agendaId·action proposed | decided | voted | registered, 실패 코드 19개). 가문 소켓과 한 소켓(`governance/gateway.ts withGovernance` — app.ts를 키우지 않으려고 가문 묶음 `factionIdentity/attach.ts`에 얹었다). 속도 제한 순간 10번·분당 30번.
- 발의(2351 가): 지도자는 늘, 민주주의 = 소속 가문장, 자본주의 = 내 표 무게 ≥ 투표권 × `gov_propose_share_pm`. 한 발의자가 열어 둔 안건 수 ≤ `gov_open_per_proposer`. 같은 종류(선전포고는 같은 상대) 안건이 열려 있으면 `already_open`.
- 독재: 투표 안건이 없다(`dictatorship`). 지도자가 체제 전환을 직권으로 정한다(안건 줄은 바로 passed, 집행 = 지금 + `gov_grace_regime_ms` — D-217·D-131·2362 가). NPC 독재자는 지금 직권을 쓰지 않는다.
- 독재로(2363 가 — D-344·D-349): 지배 쪽 지분이 과반이 아니면 `no_majority`. 과반이면 지도자는 직권(유예 뒤 집행), 다른 사람이 올리면 투표. 집행 때 다시 본다(과반이 깨졌으면 취소). 집행되면 다른 지분은 남고 의결권만 잃는다(`share_votes_suspended` — 독재에는 표가 없어 표시만, 독재가 끝나면 되찾는다 [임시 2405]).
- 표: 내가 던지는 투표자 열쇠(가문·주주) 모두에 같은 표. 선출은 등록된 후보(해임된 가문 빼고) 또는 기권. 후보 등록(2358 가)은 등록 기간(`gov_register_ms`) 안, 그 나라 소속 플레이어 가문장만(자본주의는 발의 하한도).

### 5. 틱(1분, `service.ts`)
- 임기: 민주주의·자본주의 나라를 처음 보면 지금부터 임기(`gov_term_ms`)를 센다(배포 때 선출이 한꺼번에 열리지 않게). 임기 끝 − 지도자 투표 기간이 되면 선출을 저절로 연다(`gov_auto_elections`). 독재는 임기를 지우고 열린 투표를 취소한다.
- NPC 표(2361 나 — `npcVote.ts`): 찬반 안건은 열린 다음 틱, 선출은 등록 기간 뒤. 점수 고르기: 만족도 차(그 가문 도시 휴먼 평균 만족도 − `gov_npc_keep_satisfaction`)·나라 성향(팩 국가 프리셋 성향이 얹힌 값). 선출 = 자기 가문이 후보면 자기, 만족하면 현직, 아니면 먼저 등록한 도전자. 해임·체제 전환 = 만족도 낮으면 찬성(신앙은 유지 쪽, 상업은 자본주의 쪽, 공격은 독재 쪽). 선전포고 = 공격 성향 ≥ `gov_npc_war_trait_pm`. NPC 지배 가문은 선출이 열리면 스스로 후보로 나선다 [임시 2404]. 무게는 플레이어와 같다(D-555 1509).
- 닫기: 셈은 닫는 때의 투표권(그 사이 떠난 가문·판 지분은 빠진다). 찬반 = `@terra/shared/governance tallyMotion`(정족수 → 문턱), 선출 = `tallyElection`(단순 다수, 동점 현직 → 가문 판 점수 [임시 2402] → 먼저 등록). 투표 중 체제가 바뀌면 취소.
- 집행: 선출 = 이긴 가문이 지배 가문(다른 가문이면 바뀜, 2358 가), 임기 = 닫은 때 + 임기 칸. 정족수 미달·후보 없음이면 현직 그대로·임기 새로. 해임 가결 = 바로 다시 뽑기(해임된 가문은 못 나섬, 결과까지 임시로 남음 [임시 2403]). 체제 전환 = 유예 뒤. 선전포고 = 바로 전쟁.
- 감사 기록: `governance.propose`·`governance.regime_decree`·`governance.ruling_house`·`governance.regime_enacted`·`governance.war_declared`.

### 6. 설정 칸(core@131(묶음 1116v) — 16개, 모두 [임시] 출발값, 서버 실시간 반영)
- 49 S34: `gov_period_leader_ms`(72시간)·`gov_period_war_ms`(6시간)·`gov_quorum_leader_pm`(500)·`gov_quorum_war_pm`(300).
- 문턱: `gov_threshold_pm`(500 — 선전포고)·`gov_threshold_regime_pm`(666)·`gov_threshold_removal_pm`(666). 2354 출발값 나(체제 전환·해임 2/3).
- `gov_term_ms`(14일)·`gov_register_ms`(24시간)·`gov_grace_regime_ms`(7일)·`gov_propose_share_pm`(50)·`gov_open_per_proposer`(1)·`gov_auto_elections`(1)·`gov_war_agenda`(1)·`gov_npc_keep_satisfaction`(50)·`gov_npc_war_trait_pm`(600).
- 계수표 `governance` 칸(`packages/sim/src/society/governanceCoefficients.ts`, 키 `tuningGovernance.ts`). 시뮬은 읽지 않는다(SIM_VERSION 그대로).

### 7. 조회·화면
- tRPC `governance.view`(`@terra/shared/governance GovernanceResponse`): 내 나라 이름·체제·지배 가문·임기 끝·지배 쪽 지분 몫·의결권 정지, 올릴 수 있는 안건, 지도자인가, 열린 안건 + 최근 끝난 10개(찬반 합·투표권·정족수·문턱·후보와 표·당선·해임으로 막힌 가문·던진 표 공개·내 자격), 선전포고 상대. 다른 나라 안건은 보이지 않는다.
- 화면: 세력 화면 투표 탭 위에 나라 의결 칸(`apps/game/src/faction/governance/GovernancePanel.tsx`) — 사실 칸, 안건 올리기(종류·체제·상대), 안건 카드(찬반 막대·정족수 눈금, 후보 줄, 찬성·반대·기권·후보로 나서기), 던진 표 펼침. 문구 86개(ko·en). 시안 자료를 켜면 보이지 않는다(옛 시안 투표 목록 그대로).

## 이유
- 체제가 바뀌는 판정은 서버 거울 세계의 세력 칸 하나라(배당·독립 경로·지분 양도 검사가 이미 `regime`을 읽는다) 시뮬을 바꾸지 않고 서버에서 바꾸면 그 뒤 규칙이 그대로 따라온다(Verified: `npc/persist.ts saveFaction`이 regime을 쓴다, `@terra/sim` 배당·독립이 regime을 읽는다).
- 국고 지분의 비례 나눔(D-581)은 몫 비율을 바꾸지 않으므로 가결·정족수·발의 하한 판정은 "국고 빼기"와 같고, 화면의 표 무게만 다르다. 무게를 그대로 보이려고 실제로 나눈 값을 쓴다(버림 — 합이 몇 주 모자랄 수 있다).
- 가문 소켓에 얹은 것은 app.ts(999줄)를 키우지 않으려는 것이다. 의결 메시지는 가문장·가문 단위라 가문 게이트웨이 곁이 자연스럽다.

## 결과
- 민주주의·자본주의 나라는 2주마다 지도자를 다시 뽑고, 플레이어 가문이 NPC 가문 표를 얻어 지배 가문이 될 수 있다. 지도자는 체제를 바꾸고(유예), 지분 과반이면 독재로 갈 수 있다. 선전포고 안건이 가결되면 전쟁이다.
- 감수할 점·빈틈(질문 2401~): 선출로 바뀐 지배 가문은 의결(발의·직권)과 화면에만 쓰인다 — 독재 남은 이익(D-338 `rulingVault`)·NPC 국가 지도자 유닛·정부 판 지도자·나라 정책(가문 이동 정책 등)은 아직 처음 규칙(수도 가문)을 따른다(2406). 군사 쿠데타(2401)·세율 안건(나라 세율 저장 = 다른 줄기 tax-2, TODO 2407)·강화·동맹·채권·도시 매각 등 나머지 D-5057 안건, 독재 청원(2362 나 기술 기본값 — 화면 줄기), 일찍 끝내기(2352 — 남은 표가 뒤집지 못하면), 봉신 가문의 체제 따라가기(나라 체제가 바뀌어도 봉신 가문 거울 세력 체제는 그대로 [임시 1039])는 다음 줄기.
- NPC 나라 선거는 지금 NPC 지배 가문만 스스로 나서므로 플레이어가 나서지 않으면 현직이 이어진다.
- 시뮬 판정·출력 그대로(SIM_VERSION 그대로). 프로토콜 더하기만.

## 바뀜 (governance-2, 2026-11-21 — 기획 대조 2401~2410·사용자 답 D-582, 제안 상태라 이 ADR을 고친다)
- 근거: 기획 대조(코디네이터 전달 2026-11-21) — D-338·D-298·D-581·D-580 6·D-555 1509·D-580 7·D-344·D-217·D-572·D-577·D-509, 사용자 답 D-582(2401·2403·자본주의 처음 지분).
  질문 표시 `docs/questions/2026-11-21-governance-2.md`, 새 질문 `docs/questions/2026-11-21-governance-3.md`(2431~2440). 위 3절의 "지배 쪽 지분 몫(D-344) = (그 나라 국고 + 지배 플레이어
  가문 국고) ÷ …"와 "국고를 지배 쪽으로 치는 것은 시뮬 rulingFamilyOf와 같다", 5절의 "[임시 2403]·[임시 2404]·[임시 2405]", 결과의 "선출로 바뀐 지배 가문은 의결과 화면에만
  쓰인다 … (2406)"·"세율 안건 TODO"·"일찍 끝내기 다음 줄기"를 아래가 대신한다.
- **가문 지분 계정(D-338 "독재 나라 도시의 주식 1000주 = 지배 가문 계정 소유", "국고" 대안 기각)**: 원장 시스템 계정 `shares:house:<가문 꼬리><share_도시>`(가문 꼬리 = 플레이어 가문
  `<세력 행>:`·NPC 가문 `npc:<ID>:` — 가문 돈 금고 `vault:house:<가문 꼬리><자산>`과 같은 꼬리). `@terra/sim` `houseHoldingsOf`·`moveSharesToHouse`; 지분 합·소각·배당(가문 몫 → 그 가문
  돈 금고)·점령 몰수(지분 유지 = 그 도시 가문 지분도 몰수 [임시 2431])가 주체 계정과 함께 센다. 시뮬은 가문 계정을 만들지 않아 시뮬 결과 그대로(SIM_VERSION 그대로 — 시뮬 시험 통과).
  계정 앞머리를 돈 금고(`vault:house:`)와 따로 둔 까닭: 랭킹 자산·금고 음수 검사·가문 장부 칸이 `vault:house:%`를 돈으로 읽는다.
- **독재 나라 지분 정리(`governance/shareFixups.ts`)**: 의결 틱(1분, 켤 때 세계가 준비되면 곧바로 한 번)마다 독재 나라 도시의 국고 지분 → 지금 지배 가문 계정(멱등, 감사 기록
  `governance.shares_to_house` reason dictatorship). 체제 전환으로 독재가 되면 집행 때 바로. 지배 가문이 바뀌어도 이미 가진 지분은 그 가문에 남는다 [임시 2432].
- **자본주의 NPC 나라 처음 지분(D-582)**: 도시마다 한 번(새 표 `governance_share_fixups`) 국고 지분 → 그 도시를 처음 세운 NPC 가문(그 도시에서 먼저 세운 가문), 수도 → 지배 가문. 그 뒤
  국고에 생긴 지분(점령 몰수 D-298·재발행 D-444)은 국고에 둔다. 가문 계정 지분은 자본주의 주주다(플레이어 가문 = 가문장, NPC 가문 = NPC 규칙식 — 그 가문 도시 만족도) → 국고만 지분이라
  투표권이 비던 문제(옛 결과 줄)가 풀린다. 민주주의·플레이어 가문 나라의 자본주의 지분은 그대로.
- **지분 과반(3절 대신, D-298·D-581·D-580 6)**: 지배 쪽 = 지배 가문의 지분(가문 계정 + 지배 플레이어 가문 소유 주체 계정 — 그 나라 국고가 아닐 때)만. 국고 지분은 D-581 비례 나눔으로
  센다 = 지배 쪽 ÷ (합 − 국고). 국고만 지분을 가지면 0‰(지분을 사야 한다 — 사는 길은 아직 없다, 2438). 지분이 하나도 없으면 1000‰(그대로).
- **NPC 도전자(2404 나)**: 선출이 열리면 현직 NPC 지배 가문에 더해 그 나라 NPC 가문 가운데 출마 점수(그 가문 도시 만족도가 현직 편 문턱보다 낮은 만큼 × 2 + 공격 − 신앙 성향, 각 −50~50)
  ≥ `gov_npc_run_score`(20 [임시])인 가문을 점수 차례로 `gov_npc_run_max`(1 [임시])개까지 등록한다(자본주의는 플레이어 후보와 같은 의결권 하한). NPC만 있는 나라도 지배 가문이 바뀐다.
- **지배 가문 반영(2406)**: 틱마다 나라의 의결 지배 가문(선출 기록·빈자리)을 `npc/cityHouses.ts setRuling`으로 NPC 런타임에 알린다. NPC 가문이면 그 가문이 지배 가문(가문장 = NPC 국가 지도자
  유닛, 그 가문 도시가 그 나라 것일 때), 플레이어 가문이면 NPC 지배 가문이 없다 → 독재 남은 이익 국고 몫 = 그 플레이어 가문 금고(`npc/rulingVault.ts`), 정부 판 지도자 = 그 가문장 사이보그
  (`government/reads.ts`), NPC 국가 지도자 유닛은 남지만 어느 가문도 이끌지 않는다(퇴임, 기술 기본값 가 — 지도 한눈 정보의 가문 줄 없음, 랭킹 지도자 자산에서 빠짐), 나라 이동 정책을 그
  가문장이 정한다(`factionIdentity/houseEntryPolicy.ts electedNationOf`). 처음 규칙(D-574 10 수도 첫 가문)은 처음 값.
- **빈자리(2403 답 D-582)**: 해임 뒤 다시 뽑기(barred가 있는 선출)가 당선 없이 끝나면 `governance_state.vacant_since_ms`(새 칸, 감사 기록 `governance.vacant`). 빈 동안 지배 가문·지도자가
  없다. 선출로 채우면 지운다. 빈자리가 길어질 때 나라가 갈라지는 절차는 빈틈(2434) — 설정 칸 `gov_vacancy_split_ms`는 읽기만.
- **의결권 되찾기(2405 가 확정)**: 독재가 끝나면 정지 표시를 지운다(지금 코드 그대로, [임시] 표시만 뗌).
- **일찍 끝내기(2410 가, `governance/early.ts`)**: 확정 표 = NPC 표만(플레이어 표는 닫힐 때까지 바뀔 수 있다 — 2365). 정족수를 지금 던진 표로 채웠고, 흔들리는 무게(플레이어 표 + 안 던진
  투표권)를 모두 찬성·모두 반대로 줘도 결과가 같으면(선출은 후보마다 몰아줘도 당선이 같으면) 그 틱에 닫는다. 선출은 등록 기간 뒤.
- **세율 크게 바꾸기(2407 가, tax-2 위)**: 안건 종류 `tax_change`(payload `taxes` = 나라 세금 한 줄). 민주주의·자본주의 독립 가문 나라의 가문장이 나라 세금 명령(`nation_tax`)으로 칸
  하나라도 `gov_tax_agenda_width_pm`(50‰ [임시], 소득세는 bp ÷ 10, null = 0 [임시 2436]) 이상 바꾸면 바로 정하지 않고 안건을 연다(`nation_tax_result` ok + `agendaId`). 폭 아래·독재는
  바로. 가결되면 `applyNationTaxes`(DB `nation_taxes` + 메모리 표, set_by null). NPC 표 = 만족하면 찬성 [임시 2436]. 의결 칸 올리기 목록에는 없다(gov_propose로는 올릴 수 있다).
- **군사 쿠데타(2401 답 D-582)**: 결과 도우미만(`governance/houseShares.ts confiscateSharesToHouse`·`coupSatisfactionAfter`, 설정 칸 `gov_coup_satisfaction_drop`). 일으키는 길(군사력 판정·
  반란 전투 틀·명령·NPC 판단)은 세부를 묻는다(2433) — 부르는 곳 없음.
- 만들지 않음: 독재 청원(2409 — 화면·프로토콜 줄기), 다음 안건 묶음(2408 — 기술 차례, 외교 먼저), 동점 경로(2402 나 — 경로 질문 2437), 가문 100% 지분 독립(D-582 해석 — 2435).
- 판: 마이그레이션 `20261121084410_governance_vacancy_tax`(prevIds = 세 끝 `74cfa5b9`·`8ba706b5`·`6429529b` — 새 표 `governance_share_fixups`, 칸 `governance_state.vacant_since_ms`,
  안건 종류 검사에 `tax_change`를 더함 — 넓히기만 해서 직전 판 앱 그대로. 직전 판 앱으로 되돌리면 `tax_change` 안건을 모르는 종류로 읽는다 — Assumed 해 없음: 선출로 읽혀 후보 없이 실패),
  프로토콜 58(묶음 1116x, 줄기 판 98 — 받는 가장 낮은 판 57, gov_propose `tax_change`·`taxes`, nation_tax_result `agendaId`, 더하기만), 팩 core@133(묶음 1116x, 줄기 판 172 — 설정 칸 5개 `gov_npc_run_score`·
  `gov_npc_run_max`·`gov_vacancy_split_ms`·`gov_coup_satisfaction_drop`·`gov_tax_agenda_width_pm`), SIM_VERSION 그대로.

## 바뀜 (governance-3, 2026-11-21 — 기획 대조 2431~2440·사용자 답 D-583, 제안 상태라 이 ADR을 고친다)
- 근거: 기획 대조(코디네이터 전달 2026-11-21) — D-293·D-298·D-346·D-338·D-344·D-580 1·6·D-582·D-574 10·D-575·D-252·D-128·D-5057·D-217·D-301·D-302·D-341·D-323·D-555 1509·D-576·D-256·D-326,
  사용자 답 D-583(2432 (다)·2433 나·2434 (가)·2438). 질문 표시 `docs/questions/2026-11-21-governance-3.md`, 새 질문 `docs/questions/2026-11-21-governance-4.md`(2451~2460).
  위 "바뀜 (governance-2)"의 "점령 몰수(지분 유지 = 그 도시 가문 지분도 몰수 [임시 2431])"·"지배 가문이 바뀌어도 이미 가진 지분은 그 가문에 남는다 [임시 2432]"·"군사 쿠데타 — 결과
  도우미만"·"빈자리가 길어질 때 … 빈틈(2434)"·"가문 100% 지분 독립(2435)"을 아래가 대신한다.
- **점령 몰수 = 통치자 지분만(2431 나)**: `@terra/sim settleShares`가 옛 통치자 국고 + 옛 통치자 지배 가문의 가문 계정(`SimHooks.rulerShareHousesOf` — 서버 `npc/governanceHooks.ts`: NPC 나라 =
  지배 가문 `npc:<ID>:` 또는 선출된 플레이어 가문 `<행>:`, 플레이어 가문 나라 = `npc/economy.ts`가 그 가문 `<행>:`)만 몰수한다. 세운 가문(D-582)·알박기 설립자(D-575) 지분은 남고, 독재 점령국
  과반 셈(D-346)에 그 남은 몫이 든다(과반이 안 되면 상장폐지 — 원래 길). 시뮬은 고리가 없어(가문 계정 없음) 판정 그대로.
- **지배 쪽 지분 따라가기(2432 나)·지분 과반 매수 독재의 국고 지분(2432 (다) 답 D-583 나)**: 새 표 `governance_share_houses`(나라마다 지배 쪽 지분 가문·treasury_kept). 독재 나라 틱에서
  지배 가문이 기록과 다르면(수도 이전으로 처음 규칙 가문이 바뀜) 옛 가문 계정의 그 나라 도시 지분을 새 지배 가문으로 옮긴다(감사 기록 `governance.shares_follow_ruler`, [임시] 옛 가문의
  세운 가문 몫과 가르지 않는다). 체제 전환으로 독재가 되면(지분 과반 매수 길뿐 — D-344) treasury_kept = 참 → 국고 지분은 국고에 남는다(배당은 국고, 의결권 없음). 원래 독재 NPC 나라는 그대로
  국고 → 지배 가문(D-338). 독재가 아니게 되면 기록을 비운다. 선출(민주주의·자본주의)은 지배 쪽 지분이 따로 없어 옮기지 않는다.
- **군사 쿠데타(2433 기술 기본값 가·다·라·마 + 답 D-583 나 가)**: `governance/coup.ts`·`portCoup.ts`·`coupStore.ts`, 새 표 `governance_coups`·`governance_coup_sides`.
  - 일으키기: 그 나라 소속 플레이어 가문의 장(WebSocket `gov_coup`, 지배 가문이 아닐 때) 또는 NPC 가문(틱 — 출마 점수와 같은 성향 규칙식 ≥ `gov_coup_npc_score`, 가문 유닛 힘 ≥ 정부군 힘 ×
    `gov_coup_npc_power_pm`). 가문마다 쿨타임 `gov_coup_cooldown_ms`, 나라마다 하나. 플레이어 가문 나라는 뺀다 [임시 2457]. 켬 = `gov_coup_enabled`(출발값 0 — 꺼짐).
  - 참가 받기 `gov_coup_gather_ms`: 누구나 `gov_coup_join`으로 혁명군·정부군(그 사람 개인 유닛이 싸운다 [임시 2455]), NPC 가문은 틱마다 성향 규칙식(점수 ≥ 문턱 혁명군, ≤ −문턱 정부군).
  - 전투 = 반란 전투 틀 D-256(`@terra/sim runCoupBattle` — `attachCombat().rebellion`, 빨리감기, 편마다 `gov_coup_battle_units`): 혁명군 = 일으킨 가문 + 혁명군 참가자, 정부군 = 지배 가문 +
    수도 경비대 + 정부군 참가자. 힘(2433 가) = 유닛 전투력 몸(battleBodies basePower, D-576 같은 몸) 합. 전투 자료는 시험 자료 [임시 2456 — 앱이 아직 팩 전투 자료를 넘기지 않는다].
  - 이기면: 그 가문이 지배 가문(governance_state — 임기 없음·빈자리 끝), 체제 독재, 그 나라 도시의 다른 모든 지분(국고 포함) → 그 가문 계정(D-582), 지배 쪽 지분 기록, 나라 휴먼 만족도
    − `gov_coup_satisfaction_drop`. 지면: 일으킨 가문 금고 → 나라 국고 `gov_coup_fail_cost`(있는 만큼) + 그 가문 유닛 만족도 − `gov_coup_fail_satisfaction_drop`.
  - 보상(이긴 편 플레이어): 나라 명성 `gov_coup_merit_renown`(공훈 — D-326), 신용 `gov_coup_credit_reward`는 고리 `rewardCredit`만(신용 줄기 work/credit TODO). 감사 기록
    `governance.coup_started`·`coup_won`·`coup_lost`·`coup_cancelled`.
- **빈자리 나라·선출된 플레이어 지도자 나라의 NPC 판단(2434 나·2440 나)**: `SimHooks.nationLocked`(서버 `npc/governanceHooks.ts` — `cityHouses.controlOf` player·vacant)면 NPC 판단이 새
  선전포고·강화(제안·받기)·봉신 독립·거래세를 하지 않는다(이미 하는 전쟁의 공격은 잇는다 [임시]). 도시 세금(시장)·짓기·구인은 그대로(D-252). 선출된 플레이어 지배 가문장이 나라 세금 명령
  (`nation_tax`)으로 그 나라 세금을 정한다(`government/nationTaxPolicy.ts` — electedNationOf). 독재 지도자는 선전포고를 직권으로(바로, D-217). 화폐(중앙은행 공식)는 멈추지 않았다(2453).
- **빈자리 도시 독립(2434 (가) 답 D-583 가)**: `governance/cityVotes.ts` — 빈자리가 `gov_vacancy_split_ms`를 넘으면 시작 도시(D-341)가 아닌 도시마다 안건 `city_independence`(그 빈자리 동안
  도시마다 한 번). 투표권 = 그 도시만 든 나라 모양(민주주의 = 그 도시 NPC 가문 + 그 나라 플레이어 가문 [임시 2451], 자본주의 = 그 도시 지분), 문턱 = 민주주의 과반·자본주의
  `independencePassPm`(D-302). NPC 표 = 그 도시 불만이면 찬성. 가결 → `society.cityIndependence`(새 도시국가, 체제 = 옛 나라 체제 [임시 2459]).
- **자본주의 독립 투표의 가문 지분(2435)**: `@terra/sim capitalistIndependence` houses 칸 — 가문 계정 지분이 합과 찬성에 든다(고리 `houseIndependenceYes` — NPC 가문 = 그 도시 불만이면 찬성,
  옛 통치자 지배 가문·플레이어 가문은 반대). 가문 계정은 투표를 열지 않는다(100% 가문 독립 D-300·D-577은 다음 줄기 — 2454).
- **국고 지분 팔기(2438 답 D-583 나)**: 안건 `treasury_share_sale`(gov_propose cityId·shares·minPrice, 지도자 묶음 기간·정족수·기본 문턱), 독재는 지배 가문장 직권(바로). 국고 지분이
  모자라면 `not_enough_shares`. 승인되면 `approvedShareSale` 고리(정부 지분 시장 줄기 TODO — 지금은 승인·감사 기록 `governance.share_sale_approved`만). 의결 칸 올리기 목록에는 넣지 않았다(칸 입력 화면은
  시장 줄기).
- **독재 지분 팔기(2439 나)**: `SimHooks.shareSellerOf`(NPC가 이끄는 독재 NPC 나라의 지배 가문 계정) — NPC 판단의 "지분 팔기"가 가문 계정에서 팔고 돈은 그 가문 금고, 판 뒤 가문 과반을 못
  지키면 팔지 않는다(D-344).
- **2436 다**: 자본주의 발의는 의결권 하한 이상만(D-580 1) — 지금 코드(`mayPropose`)가 이미 막고 있어 DB 시험으로 확인만.
- 화면: 의결 칸에 쿠데타 칸(`apps/game/src/faction/governance/CoupSection.tsx` — 일으키기·편 들기·결과), 안건 종류 둘·결과 코드 다섯 문구, 도시·지분 팔기 줄(문구 24개 ko·en).
- 7축 성향(main 290241aa68 — NPC 가문 7축 실효 성향 `npcHouseAi.ts`)은 아직 의결(NPC 표·후보·쿠데타)에 잇지 않았다: 의결 NPC 규칙식은 governance-2와 같은 나라 4축 성향 + 도시 만족도다(TODO —
  가문 7축 성향으로 바꾸는 줄기).
- 판: 마이그레이션 `20261121112634_governance_coups`(prevIds = main 끝 `1efb9fa9`(npc_unit_traits))(새 표 셋 + 안건 종류 검사 넓히기 — 직전 판 앱 그대로. 되돌리면 새 종류 안건을 모르는 종류로 읽는다 — Assumed 해 없음), 프로토콜 59(묶음 1116y, 줄기 판 98 — 받는 가장 낮은
  판 58, `gov_coup`·`gov_coup_join`·결과 코드 5·행동 2·`treasury_share_sale` 칸, 더하기만, `COUP_PROTOCOL_VERSION`), 팩 core@135(묶음 1116y, 줄기 판 173 — 설정 칸 10개 `gov_coup_*`), SIM_VERSION 그대로
  (econ16·war16 시드 1~3 30일 출력이 머리 줄의 팩 판·해시 말고 같다).

## 바뀜 (governance-5, 2026-11-21 — 질문 2451~2460 답·사용자 결정 D-584·D-585, 제안 상태라 이 ADR을 고친다)
- 근거: 코디네이터 전달(2451~2460 답), 사용자 결정 D-584(신용 한 점수·빈자리는 독립이 아니라 후임·자동 선출·"모르면 물어보라"), D-585(쿠데타 어느 가문이든·쿠데타 성공 = 차지한
  도시만 새 나라·가문 독립 전력 비교·신임도 = 새 값). 질문 표시 `docs/questions/2026-11-21-governance-4.md`, 새 질문 `docs/questions/2026-11-21-governance-5.md`(2491~2500).
  위 "바뀜 (governance-3)"의 "빈자리 도시 독립(2434 (가))"·"쿠데타 이기면 그 나라 전체 독재"·"신용 고리 rewardCredit"·"화폐·강화·거래세 지도자 명령 없음"을 아래가 대신한다.
- **빈자리(D-584 — D-583 3 대신)**: 빈자리는 도시 독립 투표로 이어지지 않는다(`cityVotes.ts` 지움, 열려 있던 `city_independence` 안건은 틱이 취소, 집행도 취소). 빈자리가 되면 누구나
  나설 수 있는 선출을 바로 연다(기간 `gov_vacancy_election_ms` — 옛 칸 `gov_vacancy_split_ms`는 `id-changes.json`에 지움). 빈 동안 NPC 나라 단위 판단은 멈춘다(원래 `nationLocked`).
  국가 지도자 가문에서 후임·대행을 고르는 규칙은 정해지지 않아 만들지 않았다(질문 2491).
- **강화(2452)**: 안건 `peace`(전쟁 묶음 — 짧은 기간·정족수, 독재 = 직권). 집행(`leaderAgendas.ts`): 받는 쪽이 NPC가 이끄는 나라면 NPC 강화 규칙식(`@terra/sim peaceScore` — npcRun
  proposePeace와 같은 셈, NPC 맥락은 `houseRecruit.context()`), 받으면 세력·사회 `makePeace`(불가침), 안 받으면 failed. 받는 쪽이 플레이어가 이끄는 나라·빈자리면 그쪽도
  `gov_peace_offer_ms` 안에 같은 강화를 정해야 맺는다 [임시 2497]. 동맹·보호 조약은 세계에 조약 체계가 없어 만들지 않았다(질문 2498).
- **화폐 단계(2453)**: 표 `nation_monetary`(공식 | 손 조절 + 하루 조절 만분율). 안건 `currency_stage`(문턱 `gov_threshold_currency_pm` 2/3 — D-131, 독재 직권), 손 조절 단계 안의
  조절량만 바꾸는 것은 지도자 바로(직권 줄). 의결 틱이 플레이어가 이끄는 나라의 손 조절을 경제 `bankOverride`(시뮬 `Economy` 선택 칸 — 시뮬은 붙이지 않음)에 걸고, 하루 끝
  `bankDay`가 그 나라만 `manualBankStep`(발행 이자 소각 그대로, 조절 = 시중 × 만분율, 상한 E5)으로 돈다 [임시 2499].
- **거래세(2460)**: `nation_taxes.trade_tax_bp`(더하기, null = 정하지 않음), `nation_tax`·세율 안건 `taxes.tradeTaxBp`(칸이 없으면 앞 값 그대로 — 옛 기기). 세율 안건 폭에 bp ÷ 10으로
  든다. 의결 틱이 플레이어가 이끄는 나라(플레이어 가문 나라·선출된 플레이어 지배 가문)의 거래소에 경제 고리 `setTax`(NPC 세율 규칙식과 같은 길)로 건다. NPC가 이끄는 나라는 규칙식.
- **가문 독립 선언(2454 — D-300)**: 안건 종류 `house_independence`(기록 줄 — 투표 없이 바로). 자본주의 나라의 시작 도시가 아닌 도시에서 그 도시 지분 50% 이상을 가진 가문(가문
  계정 지분 ÷ 그 도시 전체 지분). 플레이어 = `gov_propose house_independence cityId`(가문장, 결과 agendaId = 새 나라 행), NPC = 틱에서 성향 점수(쿠데타와 같은 식) ≥
  `gov_house_independence_npc_score` + 가문 힘 × 1000 ≥ 옛 나라 세력 유닛 힘 × `gov_house_independence_power_pm`(D-585) [임시 2500]. 집행 = 세력·사회 `cityIndependence`(새 도시국가,
  체제 = 옛 나라 체제 [임시 2459]) + 새 나라 지배 가문 기록(선출 기록 자리). 감사 기록 `governance.house_independent`.
- **쿠데타(2455·2456·2457·2458·D-585)**: 어느 가문이든 일으킨다("군사력 1위" 조건은 코드에 없었다 — 확인). 지배 가문이 바뀐 뒤 `gov_coup_protect_ms`(출발값 0) 동안 막는다(`coup_protected`).
  플레이어 병력 = 수도에 있는 그 사람 유닛(`gov_coup_join unitIds`로 고름), 참가 줄 `governance_coup_sides.units`(더하기), 전투 때 그 가운데 아직 그 사람 것인 유닛만, 병력 없이 편만 든
  사람은 보상 없음. 이기면 쿠데타 가문의 자리 도시(NPC = 가문 도시, 플레이어 = 소속 도시)만 새 독재 나라로(지배 가문 = 쿠데타 가문, 그 도시 다른 지분 몰수, 그 도시 만족도 벌칙), 자리가
  시작 도시·모름이면 옛 나라 전체 [임시 2492]. 결과는 부상만·포로 없음(2456 가), 실패 벌칙 그대로(2458 가). 쿠데타 전투 자료 = NPC 런타임 정원사가 쓰는 팩 전투 자료(`gardener.combat()` —
  app.ts를 키우지 않음, 없으면 시험 자료). 신용: 혁명군 가담 = 벌점, 이긴 편 = 새 나라 신용 시작 가산(credit ADR).
- **지도자 신임도(D-585)**: 표 `governance_approval`(나라마다 지금 지배 가문 신임도 0~1000). 지배 가문이 바뀌면 시작값(`gov_approval_player_start` 300·`gov_approval_npc_start` 500). 고리:
  해임 가결 문턱(`approval.ts removalThresholdWithApproval`, 폭 `gov_approval_removal_ease_pm`)·반란 만족도 문턱(`SimHooks.rebellionThresholdShift` — 서버 `npc/governanceHooks.ts`,
  폭 `gov_approval_rebellion_ease`), 두 폭 출발값 0 = 효과 없음. 오르내림 규칙 없음(질문 2493).
- 판: 마이그레이션 `20261121130732_governance5_credit_standing`(prevIds = 끝 둘 `ee4d36aa`·`ace6aeb5` — 새 표 넷 `credit_standings`·`nation_monetary`·`governance_approval` + 칸 둘
  `nation_taxes.trade_tax_bp`·`governance_coup_sides.units` + 검사 넓히기 둘(안건 종류 `peace`·`currency_stage`·`house_independence`, 신용 종류). 직전 판 앱 그대로 — 되돌리면 새 종류
  안건을 모르는 종류로 읽는다, Assumed 해 없음), 프로토콜 61(묶음 1117a, 줄기 판 99 — 받는 가장 낮은 판 60, `GOVERNANCE5_PROTOCOL_VERSION`, 더하기만, 낮은 판에는 새 결과 코드 대신 not_eligible), 팩 core@139(묶음 1117a, 줄기 판 176 —
  설정 칸 더하기 19·빼기 3), SIM_VERSION 그대로(시뮬은 새 고리 둘 — `bankOverride`·`rebellionThresholdShift` — 을 붙이지 않는다).
## 바뀜 (governance-6, 2026-11-22 — 질문 2491·2500 답·사용자 결정 D-588 5, 제안 상태라 이 ADR을 고친다)
- 근거: 기획 세션 답(2026-11-21 — 2491·2500), 사용자 결정 D-588 5(코디네이터 전달). 질문 표시 `docs/questions/2026-11-21-governance-5.md`, 새 질문 `docs/questions/2026-11-21-governance-6.md`
  (2531~2538). 위 "바뀜 (governance-5)"의 "후임·대행 규칙 없음(2491)"·"독립 뒤 전쟁으로 만들지 않음·힘 비 = 옛 나라 군대 전체(2500)"를 아래가 대신한다.
- **빈자리 자동 계승(2491 — D-584·D-588 5)**: 국가 지도자 = 지배 가문의 가문장(그대로). 자리가 비면 먼저 지배 가문에서 ① 가문장이 미리 정한 후계자 ② 서열(가문에 먼저 들어온
  차례 [임시 — 질문 2532])로 이을 사람을 골라 그 가문의 가문장으로 세운다(`apps/server/src/governance/succession.ts` → `factionIdentity/succession.ts succeedHouseHead` — 가문장
  넘기기와 같은 몸통 transferHead, 옛 가문장은 가문원, 정체성 줄·소식 같이). 그 사람이 곧 지도자라 대행이 없다. 이을 사람이 없을 때만 예전 길(누구나 나서는 자동 선출,
  `gov_vacancy_election_ms`). 해임된 사람(해임 가결 때의 지도자 — 다시 뽑기 안건 칸 `barredUser`)은 잇지 못한다. 빈자리가 되는 길: 해임 뒤 다시 뽑기 실패(D-582), 지배 플레이어
  가문에 가문장이 없어짐(틱이 본다). NPC 지배 가문은 이 길을 타지 않는다(자동 선출) [임시]. 감사 기록 `governance.successor`·`faction.house_succession`.
- **후계자 칸**: 새 표 `house_heirs`(가문마다 한 줄 — 가문·계정·정한 시각, 외래 키 cascade), WebSocket `house_heir { userId | null }` → `house_member_result`(한 일 `heir_set`, 가문장만,
  가문원만 — `factionIdentity/heir.ts`), 가문 조회 `heirUserId`, 세력 화면 가문원 줄 [후계자로 정하기]·[후계자 풀기]·"후계자" 표시. 후계자가 가문장이 되면 줄을 지운다.
- **NPC 가문 독립 뒤(2500 — D-585 2 "독립함으로써 기존 국가와 적대관계")**: 자동 전쟁이 아니다(사용자 답). 거울 세계·시뮬에 세력 쌍 관계(적대·중립)를 담는 상태가 없어(전쟁·불가침만,
  세력 쌍 호감 D-255는 화면 시안뿐) 새 관계 체계를 지어내지 않고 관계는 그대로 둔다 [임시 — 질문 2531]. 힘 비 대상 = 기술 기본값 "옛 나라에 남는 군대(세력 유닛 − 그 가문
  유닛)"(`leaderAgendas.ts independencePowerOk` — 앞 판은 가문 유닛이 든 군대 전체와 견주어 넘을 수 없었다, 질문 2534).
- 판: 마이그레이션 `20261121172306_governance6_heirs_residence`(prevIds = 끝 셋 `90e99c42`·`e44a1520`·`8ccb7e3f` — 새 표 `house_heirs` + `unit_residences.paused_since_ms`, 직전 판 앱 그대로),
  프로토콜 111(줄기 판 — 받는 가장 낮은 판 110, `HOUSE_HEIR_PROTOCOL_VERSION`, 더하기만), 팩 core@189(줄기 판 — 설정 칸 `gov_house_independence_power_pm` 설명), SIM_VERSION 그대로
  (시뮬에 가문·의결이 없다).
