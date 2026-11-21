# 2026-11-22 묶음 1117c 합치기 (모든 도시 쿠데타·신임도 오르내림 / 지도자끼리 조약) — 리셋 필요 없음

- 일시: 2026-11-22 03:40~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `22-0300-gov-coup`·`22-0300-diplomacy`, 질문 `docs/questions/2026-11-21-gov-coup.md`(2541~2550)·`2026-11-21-diplomacy.md`(2551~2560)·
  `2026-11-21-governance-5.md`(상태 줄), ADR `2026-11-21-governance.md` "바뀜 (gov-coup)"·"바뀜 (diplomacy)", `2026-11-21-credit.md` "바뀜 (gov-coup …)", `2026-11-21-diplomacy-treaties.md`

## 한 일
- main 8fc76aee7c(묶음 1117b 기록) 위에 두 줄기를 차례로 합쳤다(둘 다 바탕 25273679b5, 합치기 커밋 `--no-ff`).
  1. `work/gov-coup`(f58427ba64): 쿠데타 = 그 나라 아무 도시에서(`gov_coup cityId`, 병력·경비대 = 그 도시), 이기면 싸운 도시가 새 독재 나라. 신임도 오르내림(`governance/approvalFactors.ts`),
     같은 나라 유저 유닛 공격 신용 고리, 손 조절 목표 물가 상한(`nation_monetary.price_cap_milli`). 설정 칸 +11, 출발값 바꿈 2(`gov_approval_removal_ease_pm` 0 → 300, `gov_approval_rebellion_ease` 0 → 15).
  2. `work/diplomacy`(9ef3111650): 지도자끼리 조약(`apps/server/src/diplomacy/`, 표 `diplomacy_treaties`·`diplomacy_war_joins`, `dip_*` 메시지, 안건 종류 `treaty`), 동맹·보호 효과·참전 요청,
     세력 화면 조약 칸(`apps/game/src/faction/diplomacy/`). 설정 칸 +4.
- governance-6(1117b에 이미 들어감)과 겹친 곳을 둘 다 살렸다. 확인한 것(코드 읽기):
  - 계승(governance-6 `succession.ts`)은 지배 가문이 비었을 때만 돌고, gov-coup의 신임도는 지배 가문 키가 바뀌면 시작값으로 다시 잡는다(`leaderAgendas.approvalOf`) — 쿠데타·계승 어느 쪽으로
    바뀌어도 같은 길이다.
  - 가문 독립 힘 비(`independencePowerOk` — governance-6: 가문 힘 vs 옛 나라 군대 − 가문 유닛)와 gov-coup의 NPC 쿠데타 힘 비(`coup.ts` — 그 도시 안의 가문 유닛 vs 그 도시 정부군)는 다른 함수라
    서로 바꾸지 않았다.
  - 외교 서비스의 `enact`·`peaceOffer`는 의결 사슬 안에서 불리고 `governance.service.run`을 부르지 않는다(줄기 그대로, 합치며 손대지 않음).

## 판 번호 다시 매김
| 무엇 | main | 줄기 판 | 묶음 판 |
|---|---|---|---|
| 프로토콜 | 62(최소 61) | gov-coup 121/120, diplomacy 131/130 | **63(최소 62)** — 두 줄기를 한 판에. `GOV_COUP_PROTOCOL_VERSION`·`DIPLOMACY_PROTOCOL_VERSION` = 63 |
| 팩 core | 140 | gov-coup 199, diplomacy 209 | **141** |
| SIM_VERSION | 72 | 둘 다 그대로 | **72** 그대로 — 시뮬 판정 바뀜 없음(계수표 칸만 더함, `bankPriceCap`은 시뮬이 붙이지 않음). 전체 검사의 `@terra/sim` 골든 통과 |

- 프로토콜: `version.ts` 63 절에 두 줄기를 함께 적고 최소 62. 시험은 `toBe(63)` + `PROTOCOL_VERSION ≥`(`governance.test.ts`·`diplomacy.test.ts`).
- 팩: `manifest.json` 141. `tuning.json` 칸 954 → **969**(gov-coup +11, diplomacy +4, 차례 = gov-coup 다음 diplomacy, 계수표·`GOVERNANCE_TUNING_KEYS`·`SERVER_LIVE_PATHS`도 같은 차례).
  계수표 출발값은 gov-coup이 바꾼 값(300·15)을 남겼다.
- ADR 판 줄을 묶음 판으로(`2026-11-21-governance.md` gov-coup 절, `2026-11-21-diplomacy-treaties.md` 제목·판 줄 — 줄기 판은 괄호). 줄기 작업 기록은 줄기 판 그대로 두었다.

## 마이그레이션
- `20261121172002_gov_coup`(스냅숏 `ad6ac753-e016-4b68-b71c-9abb631d2332`) 그대로 — prevIds = 1117a 끝 셋, main의 `share_market_2`·`governance6_heirs_residence`와 형제 갈래.
- `20261121173236_diplomacy_treaties`(스냅숏 `3fe47edd-9548-4d6c-8d20-019b46f25026`): **안건 종류 검사 바꿈을 뺐다.** main의 `share_market_2`가 같은 검사(`governance_agendas_kind`)를
  `treasury_share_buy`로, 이 줄기가 `treaty`로 따로 넓혀서 ① drizzle-kit `generate`가 "Conflicting migrations"로 멈췄고(`--fix-conflicts`는 두 갈래를 지우라고 함) ② 이름순 적용이면 뒤에 오는
  diplomacy가 `treasury_share_buy`를 지웠다(새 DB에서 국고 지분 사기 안건이 검사에 걸림). 이 마이그레이션은 main에 올라간 적이 없어(줄기 가지뿐, NAS 미적용) `migration.sql` 끝 문장과
  `snapshot.json`의 alter_check footprint·delta 하나만 지웠다(id·prevIds 그대로).
- 새 `20261121185411_batch1117c_agenda_kinds`(스냅숏 `1e0baccb-fd0f-4de9-b479-ad67274e5a40`, prevIds = 끝 넷 `3fe47edd`·`9ef728d3`·`ad6ac753`·`96600b4f`): 검사를 두 종류 모두로 다시 건다
  (`schema` 정의 `governanceSchema.ts`도 둘 다). 넓히기만이라 직전 판 앱 그대로.
- 그 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified).
- 다음 마이그레이션 `prevIds` = 끝 하나 **1e0baccb-fd0f-4de9-b479-ad67274e5a40**.

## 질문 번호
- 2541~2550(gov-coup)·2551~2560(diplomacy) — main(2538까지)과 겹치지 않아 옮기지 않았다. `governance-5.md` 상태 줄은 세 줄기(governance-6·gov-coup·diplomacy) 답 표시를 한 줄로 합쳤다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 칸 더하기(null 허용)·새 표·검사 넓히기뿐이다. 프로토콜은 더하기만이고 최소 62라 62판 기기는 그대로 들어온다.
- 팩: 설정 칸 더하기와 두 출발값. NAS 첫 켬 뒤 신임도가 오르내리고 500 아래면 반란 문턱이 최대 +15(질문 2550). 쿠데타는 여전히 꺼짐(`gov_coup_enabled` 0). 조약은 처음엔 없다.

## 손으로 푼 곳
- gov-coup: `leaderAgendas.ts`(머리 주석), `content/core/manifest.json`, `docs/WORKLOG.md`, ADR `governance.md`(governance-6 절 뒤에 gov-coup 절), 질문 `governance-5.md` 상태 줄,
  `packages/protocol/src/governance.ts`(상수 둘 — 갈라진 `/**`를 되살림), `version.ts`.
- diplomacy: 메시지 ko·en(끝 칸 둘 다, 8,896키), `governanceText.ts`·`npcVote.ts`·`view.ts`·`shared/governance.ts`(안건 종류 `treasury_share_buy` + `treaty`), `governanceSchema.ts`(검사 둘 다),
  `factionIdentity/attach.ts`(국고 사기 고리 + 외교 고리), `governance/rules.ts`·`store.ts`·`service.ts`·`tuning/scope.ts`, sim `governanceCoefficients.ts`·`tuningGovernance.ts`, manifest·WORKLOG·ADR·질문·`version.ts`.
- 파일 크기: 넘은 파일 없음, 나눈 파일 없음. `governance/service.ts`는 **971**줄(1117b에서 share-market-2가 `shareAgendas.ts`로 덜어 냈다). 큰 파일: `app.ts` 999·`sim/simulator/society.ts` 999·
  `world/persist/tables.ts` 997·`sim/src/index.ts` 996·`session.ts` 985.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts`, `governance.ts`, `diplomacy.ts`, `governance.test.ts`, `diplomacy.test.ts` | 프로토콜 63(최소 62) |
| `content/core/manifest.json` | 팩 core@141 |
| `apps/server/drizzle/20261121173236_diplomacy_treaties/`, `apps/server/drizzle/20261121185411_batch1117c_agenda_kinds/` | 안건 종류 검사 갈래 충돌 풀기(위) |
| `docs/adr/2026-11-21-governance.md`, `docs/adr/2026-11-21-diplomacy-treaties.md` | 판 줄·마이그레이션 줄 |
| `docs/questions/2026-11-21-governance-5.md` | 상태 줄 합치기 |
| `docs/worklog/2026/11/22-0340-batch-1117c-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 64(최소 63), 팩 142, SIM 73. 다음 마이그레이션 `prevIds` = `1e0baccb-fd0f-4de9-b479-ad67274e5a40`.
- 안건 종류를 더하는 줄기가 둘 이상이면 같은 검사를 따로 넓히지 말고 합칠 때 한 마이그레이션으로 모은다(이번처럼 drizzle-kit이 갈래 충돌로 막는다).
- `app.ts`(999)·`society.ts`(999)·`tables.ts`(997)·`sim/src/index.ts`(996)·`session.ts`(985)를 늘리면 새 모듈로 나눈다.

## 건드리지 말 것
- 마이그레이션 `20261121172002_gov_coup`·`20261121173236_diplomacy_treaties`·`20261121185411_batch1117c_agenda_kinds`(이제 올라간다 — 고치지 않는다).
- 외교 서비스 안에서 `governance.service.run`을 부르지 않는다(멈춤). 시뮬 고리 셋(`bankOverride`·`bankPriceCap`·`rebellionThresholdShift`)은 시뮬이 붙이지 않는다.

## 검사 (Verified)
- 두 줄기를 다 합친 뒤(판 손질·마이그레이션 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷(3,344파일)·린트·타입·모듈 경계·파일 크기·다국어(8,896키)·
  디자인 값(746쌍)·콘텐츠(core@141 7634409eb245) 통과, 시험 파일 **876/876**, 시험 **6,272/6,272**(건너뜀 0, `@terra/sim` 골든 포함).
- `pnpm check:content origin/main`(호환 포함, core@141 7634409eb245, 단계 1·2·4a·4b 기준 8fc76ae), `pnpm check:docs`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `db:generate` "No schema changes" 통과. `pnpm docs:index`로 목차를 다시 만들었다.
- `pnpm build` 통과(PWA 포함), `pnpm check:bundle` 첫 화면 JS **110,778 B** / 상한 131,416 B(1117b 110,766 B에서 +12 B, 파일 7개).
- 화면 시험(빌드한 앱, 한 번, 1.4분): `diplomacy.spec.ts` **6/6**, `faction.spec.ts` **28/28**, `governance.spec.ts` **6/6** — 합 **40/40**(흔들림 없음). gov-coup의 쿠데타 도시 고르기·신임도 줄은
  `governance.spec.ts`에 단언이 없다(쿠데타 칸은 설정 칸이 꺼져 있으면 안 보임 — 미검증). 결과 폴더는 지웠다.

## 미검증·알려진 문제
- gov-coup: 화폐 단계·목표 물가 상한 화면 칸 없음, 쿠데타 병력 고르기 화면 없음(줄기 그대로). 같은 나라 유닛 교전은 조우 규칙상 드물다(2543).
- diplomacy: 세력 화면 외교 표(관계·신뢰)는 시안 자료, 영토·배상 등 카드 없음(2551 …). 강화 안건 → 조약 제안 길은 DB 시험으로만.
- 새 DB에서 국고 지분 사기·조약 비준 안건이 함께 들어가는 것은 전체 DB 시험(새 DB에 마이그레이션 전체 적용)으로 봤다. 운영 DB 적용은 배포 때 확인.

## 사용자 결정 대기
- 질문 2541~2550(gov-coup), 2551~2560(diplomacy), 그리고 1117b 기록의 대기 목록(2531~2538·2521~2530·2501~2508·2511 …).

## 배포 (Verified)

- 1117b 8fc76aee7c는 CI 389 성공, 그 컨테이너 시작은 nas-metrics 창 밖이라 따로 못 봄.
- CI `ci` 390 성공(main `3c6fbcdd50`, 19:16~19:19 UTC). 앱 컨테이너 19:18:36 UTC 시작, 이미지 `sha-3c6fbcdd5005`, 팩 core@141(nas-metrics 93, 19:33 UTC, 창 45분, 재시작 뒤 14분).
- 마이그레이션 오류 줄 없음, dbFailures 0(14줄 모두). 적용 여부는 로그로 직접 확인 못 함(Unknown) — 앱이 켜지고 세계 복구까지 됨.
- RSS 595.1~612.0MB(분당 약 +1.3MB, 14분이라 추세 판단 못 함), 루프 p99 1.0~1.5ms(첫 분 5.7ms), 최대 31.9~64.1ms(첫 분 255.5ms), DB 커밋 최대 219~553ms, 기기 오류 0.
- NPC: 휴먼 2,095, 세력 16, 도시 49, 건물 1,041, npcNextDecideMin 29.4 → 16.4(재시작 뒤에도 이어짐).
- 경고: 다시 "market escrow differs after restore" — 이번에는 시장 9곳(242·419·434·440·452·453·454·464·466), 모두 물건 보증금 불일치. 1117a 때(254·274·276·279·440·442·445·447)와 440만 겹침 → 재시작마다 다른 시장에서 새로 생김(Assumed: 옛 데이터만의 문제가 아니라 코드 쪽 원인 가능성) → 원인 조사 줄기 escrow-fix.
