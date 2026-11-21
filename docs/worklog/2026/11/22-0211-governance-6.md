# 2026-11-22 governance-6 — 폐허 복원 빚·주민세 주기 목록·빈자리 자동 계승(후계자·서열)·독립 힘 비·사는 곳 정원·도시 운영비 몫·쉼 알림

- 일시: 2026-11-22 02:11 (KST)
- 작업 도구: Claude Code
- 관련: 기획 세션 답(2026-11-21 — 2482 나·2483 나·2491·2500, 코디네이터 전달), 사용자 결정 D-588(2491 = D-588 5·2481 가·2484 다·2485 가·2486 가, 코디네이터 전달 — 기획 미러
  eb8960a는 이 가지에 아직 없다). ADR `docs/adr/2026-11-21-governance.md` "바뀜 (governance-6)"·`docs/adr/2026-11-15-business-ledger.md` "바뀜 (governance-6)". 질문 표시
  `docs/questions/2026-11-21-governance-5.md`(2491·2497·2498·2500)·`docs/questions/2026-11-21-residence.md`(2481~2486), 새 질문 `docs/questions/2026-11-21-governance-6.md`(2531~2538).
- 가지 `work/governance-6`, 바탕 main 25273679b5(묶음 1117a)

## 한 일
1. **2483 나 — 폐허 복원 빚**: 옛 주인이 아닌 나라가 폐허를 복원하면 도시의 나라가 바뀐 것 → `societyRuins.ts restore`가 `cancelResidentDebts`(시뮬·서버 같은 함수 — 서버 `ruins/service.ts`도
   `society.ruins.fund`로 이 길을 탄다). 옛 나라가 복원하면 그대로. 주민세 고리가 없으면 훑지 않는다.
2. **2482 나 — 주민세 주기 목록**: `RESIDENT_TAX_PERIOD_DAYS` = 1·3·7·14·30일(기술 기본값 [임시] — 2533). 정부 판 고르기 이름 = 매일·3일마다·매주·14일마다·30일마다(`periodLabel`, ko·en 2키).
   서버 검사(`invalid_period`) 그대로 — DB 시험 더함.
3. **2491 — 빈자리 자동 계승(D-584·D-588 5)**: 지도자 = 지배 가문의 가문장. 자리가 비면 ① 가문장이 정해 둔 후계자 ② 서열(들어온 차례 [임시 — 2532])로 그 가문의 가문장을 세운다
   (`governance/succession.ts` → `factionIdentity/succession.ts succeedHouseHead` — 넘기기와 같은 몸통 `transferHead`). 이을 사람이 없을 때만 예전 자동 선출. 해임된 사람(`barredUser`)은 잇지
   못한다. 지배 플레이어 가문에 가문장이 없어지면 틱이 같은 길로 잇는다. 후계자 칸: 표 `house_heirs`, WebSocket `house_heir`(프로토콜 111) → `house_member_result heir_set`,
   가문 조회 `heirUserId`, 세력 화면 가문원 줄 [후계자로 정하기]·[후계자 풀기]·"후계자"(ko·en 4키). 처음 만든 대행(`acting_user_id`) 판은 D-588로 버렸다(커밋 전).
4. **2500 — 가문 독립 뒤**: 적대 = 자동 전쟁 아님. 세력 쌍 적대 상태가 세계에 없어 관계는 그대로 [임시 — 2531]. 힘 비 대상 = 기술 기본값 "옛 나라에 남는 군대(세력 유닛 − 그 가문 유닛)"
   (`independencePowerOk`, 2534), 설정 칸 `gov_house_independence_power_pm` 설명.
5. **2481 가 + D-588 — 사는 곳 정원**: 정원 = 건물 레벨(층 [임시] — 2535) × 새 설정 칸 `residence_capacity_per_level`(기술 기본값 4). 고른 차례로 앞에서 정원까지만 — 다 차면 `full`
   (프로토콜 111, 낮은 판은 `not_eligible`), 정원이 줄면 뒤에 고른 유닛부터 쉰다. 카드 문구 ko·en 1키.
6. **2484 다 + D-588 — 도시 운영비 몫**: 주민세 도시 몫은 D-304 이익 나눔에 넣지 않고 그 도시 운영비만 메운다(남은 몫은 다음 기간으로 — 메모리, 계정 없음 [임시 2537]). 시뮬 시험 고침.
7. **2485 가 + D-588 — 쉼 알림**: 1분마다 쉼 훑기(`sweepResidencePauses` → `unit_residences.paused_since_ms`), 처리할 일 `residence_paused`(멈춤, 계정마다 한 줄, ko·en 1키).
8. **2486 가 + D-588**: 사는 곳에 미리 내는 집세가 없어 몰수할 것이 없다 — 지어내지 않고 질문 2536.

## 판·마이그레이션·리셋
- 줄기 판(합칠 때 묶음 판으로): 프로토콜 **111**(최소 **110** — main 61/60 + 50), 팩 **core@189**(설정 칸 +1 `residence_capacity_per_level`, 설명 셋), SIM_VERSION **그대로 71**.
- 마이그레이션 `20261121172306_governance6_heirs_residence`(새 표 `house_heirs` + `unit_residences.paused_since_ms`, prevIds = 끝 셋 `90e99c42`·`e44a1520`·`8ccb7e3f` — Verified 스냅숏).
  직전 판 앱은 새 표·칸을 모른 채 돈다.
- **리셋 필요 없음.** 배포 뒤 바뀌는 것: 옛 빈자리 나라는 첫 틱에 그 가문에서 가문장(해임된 사람으로 보아 지금 가문장은 뺀다)을 세우려 하고, 없으면 예전대로 자동 선출. 이미 고른
  사는 곳이 정원(레벨 × 4)을 넘으면 뒤에 고른 유닛이 쉬고 처리할 일이 뜬다. 주민세율 기본 0이라 돈 흐름은 그대로.

## 시뮬 전·후
Verified — 실행, `node cli/sim.ts econ16 --seed 1 --days 30`. 바탕 = 같은 작업 트리에서 `packages/sim/src`·`content/core`만 25273679b5로 되돌린 코드. 줄 수 701 같음, `content`·`linesHash`를
뺀 md5 둘 다 `3c0c1db4bc2311ee47a9e92f2c112c4a`(전체 jsonl md5는 팩 판·해시만 달라 97dcba50… → 1d5130f0…). 시뮬은 주민세 고리가 없어 바뀐 길에 닿지 않는다 → SIM_VERSION 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/societyRuins.ts`·`societyPayouts.ts`·`society.test.ts`, `society/residentTax.ts`·`businessCoefficients.ts`, `tuningBusiness.ts` | 2483 복원 빚, 2484 도시 몫, 정원 칸 |
| `content/core/tuning.json`·`manifest.json` | 정원 칸, 설명 셋, core@189 |
| `packages/shared/src/government.ts`·`residence.ts`·`house.ts`·`inbox.ts` | 주기 목록, `full`, `heirUserId`, 처리할 일 종류 |
| `packages/protocol/src/house.ts`·`residence.ts`·`version.ts`·`index.ts`·`residence.test.ts` | `house_heir`·`heir_set`, `full`·`legacyResidenceCode`, 판 111/110 |
| `apps/server/src/governance/succession.ts`(새, + 시험)·`service.ts`(984줄)·`store.ts`·`leaderAgendas.ts`(+ 새 시험)·`governance3.db.test.ts` | 자동 계승, 힘 비 |
| `apps/server/src/factionIdentity/heir.ts`(새)·`succession.ts`·`gateway.ts`(+ 시험)·`houseView.ts`, `session.ts`(976줄) | 후계자 칸·가문장 세우기·명령 길 |
| `apps/server/src/db/houseSchema.ts`·`residenceSchema.ts`, `drizzle/20261121172306_governance6_heirs_residence/` | 표·칸 |
| `apps/server/src/residence/book.ts`·`attach.ts`·`store.ts`·`inbox.ts`(새)(+ 시험 둘), `gather/world.ts`·`gateway.ts`, `inbox/registry.ts`(+ 시험 둘) | 정원·쉼 훑기·처리할 일 |
| `apps/server/src/government/nationTaxPolicy.db.test.ts` | 주기 목록 DB 시험 |
| `apps/game/src/government/*`, `faction/identity/HouseSection.tsx`·`houseCommands.ts`·`houseText.ts`, `map/building/residenceData.ts`, `inbox/inboxText.ts`, `messages/{ko,en}.json` | 화면·문구(ko·en 8키) |
| ADR 둘·질문 셋·이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 합칠 때: 프로토콜 111/110 → 묶음 판(`version.ts`, `house.ts HOUSE_HEIR_PROTOCOL_VERSION`, `residence.ts RESIDENCE_FULL_PROTOCOL_VERSION`, `residence.test.ts`, ADR 판 줄), 팩 core@189 → 묶음 판.
  마이그레이션 prevIds는 끝 셋 그대로(다른 줄기와 형제 갈래면 그대로 합친다).
- gov-coup 줄기(쿠데타·신임도)와 같은 파일: `governance/service.ts`(빈자리 틱·close — 몇 줄), `governance/store.ts`(`barredUser`·`houseMembersOf`·`heirOf`), `leaderAgendas.ts`(NPC 독립 힘 비).
  쿠데타·신임도 코드는 건드리지 않았다.

## 건드리지 말 것
- `societyRuins.ts`·`societyPayouts.ts`의 바뀐 길은 주민세 고리가 있을 때만 닿아야 한다(시뮬 바이트 그대로).
- `app.ts`(1000)·`facilities/service.ts`(999)·`society.ts`(998)·`world/persist/tables.ts` — 늘리지 않았다.

## 검사
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — Verified 실행): 첫 판은 oxlint `unbound-method`(gather/world.ts `residence.stop`)로 멈춰 고쳤다. 둘째 판: 포맷·린트·타입·
  경계·크기·다국어(8,793키)·디자인 값(746쌍)·콘텐츠(core@189 e7529b595911) 통과, 시험 파일 **868/869**·시험 **6,228/6,230** — 실패 2개는 `packages/shared/src/inbox.test.ts`(새 종류
  `residence_paused`를 표 순서·live 목록에 넣지 않음). 종류 표에서 멈춤 분류 끝으로 옮기고 시험 목록을 고친 뒤 그 파일 **11/11**, 서버 `inbox` 28/28(DB 7 건너뜀)·게임 `inbox` 51/51,
  `format:check` 통과(시험 단계만 실패라 전체는 다시 돌리지 않았다).
- `pnpm check:docs 25273679b5`, `pnpm check:content 25273679b5`(단계 1·2·4a·4b), `pnpm settings:cells --check`, `pnpm wiki:index --check`, `db:generate` = "No schema changes" 통과.
- 작업 중(Verified — 실행): sim `society.test.ts` 20/20·`societyRestore.test.ts`, 프로토콜 33파일 194, 서버 `governance/succession`·`leaderAgendas`·`residence`(DB 포함)·`inbox`·`gather`·`factionIdentity/gateway`,
  DB `governance3.db.test.ts -t 빈자리` 2/2·`nationTaxPolicy.db.test.ts` 5/5·`factionIdentity/succession.db.test.ts`·`inbox.db.test.ts`, 게임 `inbox`·`faction/identity`·`map/building`·`government` 94/94,
  다섯 꾸러미 타입 검사.
- 화면 시험: 돌리지 않았다(미실행 — 세력 화면 후계자 단추·정부 판 주기 이름·처리할 일 줄은 단위 시험과 타입 검사만).

## 미검증·TODO·알려진 문제
- 실제 세계에서 해임 → 다시 뽑기 실패 → 자동 계승을 끝까지 돌려 보지 않았다(close 길은 단위 시험, 틱 길은 DB 시험).
- NPC 지배 가문 해임 뒤 계승 없음(자동 선출) [임시 2532].
- 도시 운영비 몫의 남은 값은 메모리(다시 켜면 국고 몫) [임시 2537].
- 세율 안건 길(`gov_propose tax_change`)은 여전히 주기 목록을 보지 않는다(residence 기록 그대로 — 정부 판 길은 본다).

## 사용자 결정 대기
- 새 질문 2531~2538(`docs/questions/2026-11-21-governance-6.md`), governance-5의 2492~2499(다른 줄기·사용자 답 기다림).
