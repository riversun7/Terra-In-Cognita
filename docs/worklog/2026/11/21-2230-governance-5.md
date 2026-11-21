# 2026-11-21 governance-5 — 신용 한 점수·빈자리 자동 선출·강화·화폐 단계·거래세·가문 독립·쿠데타 새 나라·병력·신임도

- 일시: 2026-11-21 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-governance.md` "바뀜 (governance-5)"·`docs/adr/2026-11-21-credit.md` "바뀜 (governance-5)"(둘 다 제안 — 고침), 질문 표시
  `docs/questions/2026-11-21-governance-4.md`(2451~2460)·`docs/questions/2026-11-21-credit.md`(2441~2448), 새 질문 `docs/questions/2026-11-21-governance-5.md`(2491~2500),
  사용자 결정 D-584·D-585(코디네이터 전달), 기획 D-128·D-131·D-252·D-300·D-302·D-323·D-341·D-5057·D-217·D-582·D-583·D-099·D-187·D-150·D-147
- 가지 `work/governance-5`, 바탕 main 154c22be52(묶음 1116y)

## 한 일
- **신용 = 한 점수(D-584)**: 도시·나라 신용 둘 → 그 사람이 속한 나라에 대한 점수 하나. 낮게 시작(`credit_start` 100), 소속 기간마다 오름(10/일, 상한 300), 돌아가는 사업장
  하루마다(2/사업장), 주민세 빚·사업장 적자·유지비 체납(2447 나 — 못 낸 시간마다 2, 다 내면 되돌림)·쿠데타 가담(100)·같은 나라 유저 건물 공격(50)으로 내림. 빚은 다 갚아야 돌아옴
  (2443 가). 건물이 사라지면 사업장 적자 빚 탕감(2445 나). 새 표 `credit_standings`, 소속 훑기 `credit/standing.ts`(의결 1분 틱), 도시 몫 칸 둘 뺌. 경제 [신용] 카드 다시 만듦.
- **빈자리(D-584)**: 도시 독립 투표 길(`cityVotes.ts`) 지움 — 빈자리면 누구나 나서는 선출을 바로 연다(`gov_vacancy_election_ms`, 옛 `gov_vacancy_split_ms` 뺌). 열려 있던 도시 독립
  안건은 취소. 후임 규칙은 질문 2491.
- **강화(2452)**: 안건 `peace`(전쟁 묶음, 독재 직권). NPC 상대 = NPC 강화 규칙식, 플레이어 지도자끼리 = 양쪽이 정하면 [임시 2497]. 동맹·보호 = 조약 체계 없음(2498).
- **화폐 단계(2453)**: 표 `nation_monetary`, 안건 `currency_stage`(공식 ↔ 손 조절, 문턱 2/3, 독재 직권, 손 조절 안의 조절량은 지도자 바로). 시뮬 `manualBankStep`·`Economy.bankOverride`
  (서버만 붙임) [임시 2499].
- **거래세(2460)**: `nation_taxes.trade_tax_bp`, `nation_tax`·세율 안건 `tradeTaxBp`(같은 폭 규칙), 플레이어가 이끄는 나라 거래소에 틱이 건다.
- **가문 독립 선언(2454)**: `gov_propose house_independence`(자본주의·지분 50% 이상·시작 도시 아님 → 새 도시국가 + 지배 가문), NPC는 성향 점수 + 옛 나라와 힘 비(D-585) [임시 2500].
- **쿠데타**: 어느 가문이든(D-585 — 1위 조건 없음 확인), 보호 기간 칸(`gov_coup_protect_ms` 0), 병력 = 수도에 있는 내 유닛(`gov_coup_join unitIds`, 참가 줄 `units`, 병력 없으면 보상
  없음), 이기면 쿠데타 가문 자리 도시만 새 독재 나라(D-585 — 시작 도시·모름이면 옛 나라 전체 [임시 2492]), 이긴 편 새 나라 신용 시작 가산, 전투 자료 = 팩 전투 자료(정원사 `combat()` —
  app.ts 그대로). 2456·2458 가 = 그대로.
- **지도자 신임도(D-585)**: 표 `governance_approval`, 시작값 칸 둘(플레이어 300·NPC 500), 해임 문턱·반란 문턱 고리(폭 칸 둘 — 출발값 0 = 효과 없음, 반란은 시뮬 `SimHooks.rebellionThresholdShift`
  — 서버만). 오르내림은 질문 2493.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/credit.ts`, `apps/server/src/credit/book.ts`·`store.ts`·`table.ts`·`view.ts`·`hooks.ts`·`standing.ts`(새), 시험 둘 | 한 점수 신용·소속·벌점·유지비·새 나라 시작 |
| `apps/server/src/business/core.ts`·`store.ts`, `facilities/world.ts`·`attack.ts`, `world/settlement.ts`, `economyView/services.ts`, 시험 | 탕감(2445 나)·돌아가는 사업장 수·유지비 고리·같은 나라 공격 고리·조회 |
| `apps/server/src/governance/service.ts`·`coup.ts`·`coupStore.ts`·`rules.ts`·`store.ts`·`view.ts`·`attach.ts`·`gateway.ts`·`port.ts`·`portCoup.ts`, 새 `leaderAgendas.ts`·`leaderStore.ts`·`portLeader.ts`·`approval.ts`, 지움 `cityVotes.ts`(+시험) | 위 한 일 |
| `apps/server/src/government/nationTax.ts`·`nationTaxPolicy.ts`, `factionIdentity/gateway.ts` | 거래세 칸 |
| `apps/server/src/npc/governanceHooks.ts`·`houseRecruit.ts`·`gardener.ts` | 반란 문턱 고리, NPC 맥락(강화 규칙식), 전투 자료 |
| `apps/server/src/db/governanceSchema.ts`·`nationTaxSchema.ts`·`creditSchema.ts`·`schema.ts`, `drizzle/20261121130732_governance5_credit_standing/`, `world/persist/tables.ts` | 새 표 셋·칸 둘·검사 넓히기 둘 |
| `packages/sim/src/economy/centralBank.ts`·`simulator/economy.ts`·`simulator/society.ts`·`simulator/npcRun.ts`·`index.ts`, 시험 | 손 조절·반란 문턱 고리(시뮬은 붙이지 않음) |
| `packages/sim/src/society/governanceCoefficients.ts`·`businessCoefficients.ts`, `tuningGovernance.ts`·`tuningBusiness.ts`, `apps/server/src/tuning/scope.ts`, `content/core/tuning.json`·`manifest.json`·`id-changes.json` | 설정 칸 +19 −3, core@176(줄기 판) |
| `packages/protocol/src/governance.ts`·`nationTax.ts`·`version.ts`·`index.ts`, 시험 | 프로토콜 99·98(줄기 판) |
| `apps/game/src/economy/CreditCard.tsx`, `faction/governance/governanceText.ts`, `messages/{ko,en}.json`, `e2e/economy.spec.ts`·`governance.spec.ts` | 신용 카드·새 안건·결과 문구(ko·en 12개 더함·5개 고침) |
| ADR 둘·질문 셋·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 99·98 → 묶음 판(`version.ts`, `governance.ts GOVERNANCE5_PROTOCOL_VERSION`, `nationTax.ts` 주석, ADR 판 줄, 시험 이름), 팩 core@176 → 묶음 판(`id-changes.json` since 176도
  같이). 마이그레이션 prevIds = 끝 둘 `ee4d36aa`·`ace6aeb5`(share-market 줄기와 형제 갈래 — 그대로 합친다).
- share-market 줄기의 `approvedShareSale`는 건드리지 않았다(`attach.ts` 옵션 그대로).
- 의결 NPC 규칙식은 아직 나라 4축 성향(7축 가문 성향 TODO — governance-3 그대로).

## 건드리지 말 것
- 시뮬 고리 둘(`Economy.bankOverride`·`SimHooks.rebellionThresholdShift`)은 시뮬이 붙이지 않아야 판정이 그대로다.
- `credit_marks.city_points`는 옛 줄 호환으로만 남았다(0을 적는다). 점수는 `nation_points` 하나.

## 검사 (Verified — 실행)
- 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, main 합치기 전 741310aed4) **통과**: 시험 파일 **850/850**, 시험 **6,141/6,141**(`@terra/sim` 골든 포함 — 시뮬 판정 그대로, SIM_VERSION
  올리지 않음). 처음 한 번은 oxlint `no-shadow`(새 DB 시험 변수 이름)로 멈춰 고친 뒤 다시 돌렸다.
- main 6a91da1ad9(NPC 욕구·가문 연맹, 팩 136·SIM 70) 합침 — 충돌은 `content/core/tuning.json`(양쪽 칸 다 남김, 내 칸 고침·뺌을 main 판 위에 다시 얹음)·`manifest.json`(줄기 판 176). 손으로
  푼 충돌이라 전체 `pnpm check`를 한 번 더 돌렸다: 포맷·린트·타입·경계·크기·다국어(8,703키)·디자인 값·콘텐츠(core@176 8363902a18ba) 통과, 시험 파일 **856/857**, 시험 **6,175/6,176** — 실패
  1개 `npc/npcClaims.db.test.ts`(알박기 새 도시 주인이 새 가문이 아니라 지은 세력, 다른 줄기가 함께 돌던 부하 중)는 따로 다시 돌리니 **1/1 통과**(흔들리는 시험으로 봄 — Assumed, 이 줄기는
  알박기 코드를 건드리지 않음).
- 새·바꾼 시험: `governance5.db.test.ts` 3(직권 강화·화폐 단계·거래세·신임도 / 가문 독립 플레이어·NPC / 쿠데타 보호·병력·새 나라), `governance3.db.test.ts` 빈자리 시험을 자동 선출로 바꿈,
  `credit/book.test.ts` 10, `credit.db.test.ts` 1, `approval.test.ts` 2, `business/core.test.ts` +1(탕감), sim `economyRules.test.ts` +1(손 조절), 프로토콜 `governance.test.ts` +1.
- `pnpm check:content`(core@176, 단계 1·2·4a·4b 기준 ea76f0e), `pnpm check:docs 154c22be52`, `pnpm settings:cells --check`, `pnpm wiki:index --check`, `pnpm --filter @terra/server db:generate` =
  "No schema changes" 모두 통과.
- `pnpm build` 통과(check-pwa 포함), `pnpm check:bundle` 첫 화면 JS **110,770 B** / 131,416 B(1116y 110,735 B에서 +35 B — 신용 카드 문구 키).
- 화면 시험(한 번씩): `e2e/economy.spec.ts` + `e2e/governance.spec.ts` **31/33 통과**(4.8분). 실패 2개는 시세 색(D-442) 둘 — 호가창 매수 색 `rgb(184, 29, 56)` ≠ 기대 `rgb(184, 40, 63)`(영어
  `rgb(22, 101, 52)` ≠ `rgb(34, 107, 51)`), 묶음 1116y 기록과 같은 알려진 실패(이 줄기는 토큰·호가창을 건드리지 않음). 신용 카드 줄(시작값 100) 시험 통과.

## NAS 첫 켬 영향 (Assumed — 코드 읽기·DB 시험)
- 마이그레이션: 새 표 셋·칸 둘·검사 넓히기(직전 판 앱 그대로).
- 신용: 옛 `credit_marks` 줄은 `nation_points`만 점수에 든다. 첫 의결 틱에 사용자 주인마다 `credit_standings` 줄이 생기고 소속 기간은 그때부터 센다(옛 소속 기간은 모른다). 시작값이 1000 →
  100으로 내려 화면 점수가 크게 바뀐다.
- 빈자리 나라가 있으면 첫 틱에 자동 선출이 열린다. 열린 `city_independence` 안건은 취소된다.
- 지배 가문이 있는 나라마다 `governance_approval` 줄이 생긴다(효과 없음 — 폭 0).
- 쿠데타는 여전히 꺼져 있다(`gov_coup_enabled` 0). NPC 가문 독립은 자본주의 나라에서 지분 50% 이상 NPC 가문이 있고 점수·힘 비를 넘으면 일어난다(D-582 처음 지분이 세운 가문에
  있어 자본주의 비시작 도시에서 일어날 수 있음 — Assumed).

## 미검증·TODO·알려진 문제
- 화면: 강화·화폐 단계·가문 독립을 올리는 칸이 의결 화면에 없다(서버·프로토콜만 — `canPropose`에 넣지 않음). 거래세 칸도 나라 세금 화면에 없다. 쿠데타 병력 고르기 화면 없음(기본 = 수도의
  내 유닛 모두).
- 2차맵 유닛 교전은 같은 나라 공격 벌점에 들지 않는다(건물·비콘 공격만 — 2496).
- 동맹·보호 조약(2498), 빈자리 후임(2491), 신임도 오르내림(2493)은 만들지 않았다.
- 대출 연체 신용(대출 없음), 2444·2446은 D-584로 없어짐.

## 사용자 결정 대기
- `docs/questions/2026-11-21-governance-5.md` 2491~2500, governance-4의 2459(독립 도시 체제)·2456·2458 진 편 처벌 종류, 신용 보상 구조.
