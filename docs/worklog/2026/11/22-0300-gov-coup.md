# 2026-11-22 gov-coup — 모든 도시 쿠데타·신임도 오르내림·같은 나라 유닛 공격 신용·목표 물가 상한

- 일시: 2026-11-22 03:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-governance.md` "바뀜 (gov-coup)"·`docs/adr/2026-11-21-credit.md` "바뀜 (gov-coup …)"(둘 다 제안 — 덧붙임), 질문 표시 `docs/questions/2026-11-21-governance-5.md`
  (2492~2496·2499 답함), 새 질문 `docs/questions/2026-11-21-gov-coup.md`(2541~2550), 사용자 결정 D-588(기획 전달), 기획 D-585·D-131·D-256·D-341·D-570
- 가지 `work/gov-coup`, 바탕 main 25273679b5(묶음 1117a)

## 한 일
- **쿠데타 = 일으킨 도시의 전투(D-588 2492 가 "모든 도시에서 누구나")**: `gov_coup cityId`(그 나라 도시 아무 곳, 없으면 가문 자리 도시 → 수도), NPC 가문은 그 가문 도시에서(같은 `open` 길).
  쿠데타 줄에 도시(`governance_coups.city_id`). 병력·방어는 그 도시에 있는 것만(혁명군 = 일으킨 가문 + 참가자 병력, 정부군 = 지배 가문원 + **그 도시 경비대** + 참가자 병력). NPC 힘 비도 그 도시
  안. 이기면 **싸운 도시**가 새 독재 나라(D-585), 시작 도시면 옛 나라 전체 [임시 2542]. "누구나" = 편 들기는 누구나, 일으키기는 그 나라 플레이어 가문의 장(어느 가문이든)·NPC 가문(질문 2544).
  의결 칸에 도시 고르기·쿠데타 카드 "싸우는 곳".
- **신임도 오르내림(D-588 2493 기술에 맡김)**: 새 순수 모듈 `governance/approvalFactors.ts` — 세금 수준 1‰마다 ∓3, 새 전쟁 −30, 전쟁 하루마다 −10(전쟁당), 끝난 전쟁 +40, 얻은 도시 +50, 잃은 도시
  −80, 하루마다 만족도 쪽 10%. 기준값은 `governance_approval` 새 칸 넷. 고리는 기준점 500 아래에서만(해임 폭 300‰·반란 폭 15점 — 옛 출발값 0). 의결 칸 사실 줄에 "지도자 신임도".
- **같은 나라 유저 유닛 공격 신용(2496 가)**: `credit/hooks.ts creditUnitAttack` — 2차맵 유닛 교전을 연 뒤 공격 편 주인마다(수비 편에 같은 나라 소속 주인) 전투마다 한 번 `credit_same_nation_attack`.
  조우가 다른 나라끼리만 만나 지금은 드물게만 걸린다(질문 2543).
- **2494 나·2495 나**: 지금 동작 확정 — 코드 주석의 [임시] 표시를 뗌(코드 바뀜 없음).
- **목표 물가 상한(2499 — D-131)**: `nation_monetary.price_cap_milli`, `gov_propose currency_stage monetaryCapMilli`(칸 범위로 자름, 같은 단계면 지도자 바로), 경제 `bankPriceCap` →
  `manualBankStep` 지수 ≥ 상한이면 발행 0(소각 그대로).
- **흔들리던 시험 고침(코디네이터 요청)**: `governance.db.test.ts` "NPC 도전자" — 원인 = 나라 성향이 새 DB마다 무작위 세계 시드(`npc/runtime.ts randomInt`)로 굴려져, 공격이 낮고 신앙이 높은
  판(예: 공격 229·신앙 980 → 출마 점수 (101 − 60) × 2 − 27 − 48 = 7 < 문턱 20)은 도전자가 나서지 않았다(재현: 실패 판 기록으로 확인 — Verified). 시험이 성향을 가운데(500)로 두게 고쳤다
  (점수 82, 단언은 그대로). 고친 뒤 그 파일 전체 6번 연속 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/governance/coup.ts`·`portCoup.ts`·`coupStore.ts`·`service.ts`(+1·2줄)·`gateway.ts`·`view.ts` | 쿠데타 도시(일으키기·병력·방어·분리), 도시 이름·경비대 포트, 조회 |
| `apps/server/src/governance/approvalFactors.ts`(새)·`approval.ts`·`leaderAgendas.ts`·`leaderStore.ts`·`portLeader.ts`·`rules.ts`·`store.ts` | 신임도 오르내림·기준점, 목표 물가 상한 |
| `apps/server/src/credit/hooks.ts`·`book.ts`·`table.ts`, `travel/encounterWorld.ts`, `packages/shared/src/credit.ts` | 유닛 공격 신용 고리, [임시 2494·2495] 뗌 |
| `apps/server/src/db/governanceSchema.ts`, `drizzle/20261121172002_gov_coup/` | 칸 여섯·검사 하나 |
| `packages/sim/src/economy/centralBank.ts`·`simulator/economy.ts` | `manualBankStep` 상한 인수·`Economy.bankPriceCap`(시뮬은 붙이지 않음) |
| `packages/sim/src/society/governanceCoefficients.ts`·`tuningGovernance.ts`, `apps/server/src/tuning/scope.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 +11, 출발값 바꿈 2, core@199(줄기 판) |
| `packages/protocol/src/governance.ts`·`version.ts`·`index.ts` | 프로토콜 121·120(줄기 판), `GOV_COUP_PROTOCOL_VERSION` |
| `packages/shared/src/governance.ts` | 조회 칸 `nation.approval`·`coupCities`·쿠데타 `city`(선택 칸) |
| `apps/game/src/faction/governance/CoupSection.tsx`·`GovernancePanel.tsx`·`governanceCommands.ts`, `messages/{ko,en}.json` | 쿠데타 도시 고르기·싸우는 곳·신임도 줄(문구 5개 ko·en) |
| 시험: `approvalFactors.test.ts`(새 5)·`approval.test.ts`(+1)·`governance5.db.test.ts`(+1 시험, 쿠데타 도시·상한 단언)·`governance.db.test.ts`(흔들림)·`credit/book.test.ts`(+1)·sim `economyRules.test.ts`(+1)·프로토콜 `governance.test.ts`(+1) | |
| ADR 둘·질문 둘·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 121·120 → 묶음 판(`version.ts`, `governance.ts GOV_COUP_PROTOCOL_VERSION`, ADR 판 줄, 시험 이름), 팩 core@199 → 묶음 판. 마이그레이션 prevIds = 세 끝 `90e99c42`·`e44a1520`·`8ccb7e3f`
  (다른 줄기와 형제 갈래 — 그대로 합친다). 질문 번호 2541~2550이 겹치면 옮긴다.
- governance-6(계승·사는 곳) 줄기가 `service.ts`(986줄)·`port.ts`·`leaderAgendas.ts`를 건드리면 1,000줄 상한에 주의(이 줄기는 `service.ts`에 3줄만 더했다).

## 건드리지 말 것
- 시뮬 고리 셋(`Economy.bankOverride`·`bankPriceCap`·`SimHooks.rebellionThresholdShift`)은 시뮬이 붙이지 않아야 판정이 그대로다.

## 검사 (Verified — 실행)
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 바탕 25273679b5 위) **통과**: 시험 파일 **868/868**, 시험 **6,225/6,225**(`@terra/sim` 골든 포함 — 시뮬 판정 그대로, SIM_VERSION 올리지 않음).
  처음 한 번은 oxlint `no-duplicate-type-constituents`(`manualBankStep` 선택 인수의 `| undefined`)로 멈춰 고친 뒤 다시 돌렸다.
- `governance.db.test.ts` 전체 6번 연속 통과(흔들림 고친 뒤), `governance5.db.test.ts` + `governance3.db.test.ts` 3번 연속 8/8.
- `pnpm check:content 25273679b5`(core@199 12187393d01a, 단계 1·2·4a·4b), `pnpm settings:cells --check`, `pnpm --filter @terra/server db:generate` = "No schema changes" 통과.
- 빌드·`check:bundle`·화면 시험은 돌리지 않았다(미실행 — 아래).

## NAS 첫 켬 영향 (Assumed — 코드 읽기·DB 시험)
- 마이그레이션: 칸 더하기 여섯·검사 하나(직전 판 앱 그대로).
- 신임도: 첫 틱에 기준값만 적는다(값 그대로). 그 뒤 NPC 나라도 세율·전쟁·도시·만족도로 오르내리고, 500 아래로 내려가면 반란 문턱이 최대 +15까지 오른다(옛 폭 0 → NPC 반란이 늘 수 있다 — 질문 2550).
  선출된 플레이어 지도자(300)는 반란 +6·해임 문턱 666 → 546.
- 쿠데타는 여전히 꺼져 있다(`gov_coup_enabled` 0).

## 미검증·TODO·알려진 문제
- 화면: 화폐 단계·목표 물가 상한 칸은 의결 화면에 없다(서버·프로토콜만 — governance-5 그대로). 쿠데타 병력 고르기 화면 없음(기본 = 그 도시의 내 유닛 모두).
- 화면 시험(`e2e/governance.spec.ts`)은 돌리지 않았다(미실행 — 디스크·시간). 쿠데타 칸은 설정 칸이 꺼져 있으면 보이지 않는다.
- 같은 나라 유저 유닛 교전은 조우 규칙상 거의 일어나지 않는다(2543).

## 사용자 결정 대기
- `docs/questions/2026-11-21-gov-coup.md` 2541~2550, governance-5의 2491·2497·2498·2500.
