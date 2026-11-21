# 2026-11-21 묶음 1116x 합치기 (지배 가문 지분 계정·국고 지분 과반 제외·NPC 도전자·빈자리·세율 안건) — 리셋 필요 없음

- 일시: 2026-11-21 18:42~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1745-governance-2`, 질문 2431~2440(`docs/questions/2026-11-21-governance-3.md`), ADR "바뀜" 절(`2026-11-21-governance.md` "바뀜 (governance-2)"·
  `2026-11-11-faction-identity.md` "바뀜 (governance-2 …)")

## 한 일
- main b59df417cf(묶음 1116w ed25b71 위에 회색 2차맵 고침 한 커밋) 위에 `work/governance-2`(17cfd6e68f, 커밋 다섯, 안에 main ed25b71 합침)를 `--no-ff`로 합쳤다.
  - 지배 가문 지분 계정(D-338, `shares:house:…`): 독재 나라 도시의 국고 지분 → 지배 가문 계정(의결 틱마다 멱등, 감사 기록 `governance.shares_to_house`).
  - 지분 과반에서 국고 빼기(D-581 비례 나눔): 지배 ÷ (합 − 국고).
  - NPC 도전자(2404 나), 선출된 지배 가문을 NPC 런타임·정부 판·지도·랭킹·나라 이동 정책에 반영(2406), 빈자리(D-582 2403, `governance_state.vacant_since_ms`).
  - 자본주의 NPC 나라 처음 지분: 도시마다 한 번 국고 → 세운 NPC 가문(수도 → 지배 가문), 새 표 `governance_share_fixups`.
  - 쿠데타 결과 도우미만(부르는 곳 없음), 세율 크게 바꾸기 안건(2407 가, 폭 문턱 설정 칸), 일찍 끝내기(2410 가).
  - 시뮬 `index.ts` 나눔(`society/houseShareApi.ts`, 995줄).
- 최종 판:
  - 프로토콜 **58**(최소 **57**): 줄기 판 98(최소 97) → 묶음 판. `GOVERNANCE_PROTOCOL_VERSION`은 56 그대로(`tax_change`는 같은 메시지에 더한 종류). 판 시험은 `MIN = 현재 − 1`이라
    고칠 것 없음.
  - 팩 **core@133**(줄기 판 172 → 묶음 판). `tuning.json`은 저절로 합쳐졌다(칸 836개, 새 칸 다섯 `gov_npc_run_score`·`gov_npc_run_max`·`gov_vacancy_split_ms`·
    `gov_coup_satisfaction_drop`·`gov_tax_agenda_width_pm`). `id-changes.json` 바뀜 없음.
  - `SIM_VERSION` **67** 그대로(시뮬은 가문 계정을 만들지 않아 출력이 바이트까지 같다 — 골든 시험 통과). 시뮬 출력 형식 **23** 그대로.
  - 마이그레이션 `20261121084410_governance_vacancy_tax`(스냅숏 id `13002149-32f1-42b0-b099-24026612317f`, prevIds = 세 끝 74cfa5b9·8ba706b5·6429529b) 그대로.
    합친 뒤 `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified). 다음 마이그레이션 `prevIds` = 끝 하나 **13002149**.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표(`governance_share_fixups`) 하나, 칸(`governance_state.vacant_since_ms`, null 허용) 하나를 더하고 안건 종류 검사를 넓힐(`tax_change` 더함) 뿐이다.
  직전 판 앱은 표·칸을 모른 채 그대로 돈다. 직전 판 앱으로 되돌리면 `tax_change` 안건을 모르는 종류로 읽는다(줄기 ADR — Assumed 해 없음).
- 팩은 설정 칸 다섯 더하기. 프로토콜은 칸·종류 더하기뿐이고 최소 57이라 57판 기기는 그대로 들어온다(58판 앱은 PWA로 받는다).

## NAS 첫 켬 동작 (Assumed — 코드 읽기·DB 시험, NAS에서는 아직 못 봄)
- 세계가 준비된 뒤 첫 의결 틱(약 5초 안): 지배 가문에 알림, **독재 나라 모든 도시**의 국고 지분 → 지배 NPC 가문 계정, **자본주의 NPC 나라 도시**의 국고 지분 → 세운 NPC 가문(수도 → 지배
  가문, 도시마다 한 번 — `governance_share_fixups`에 기록, 가문 없는 도시는 나중 틱). 감사 기록 `governance.shares_to_house`.
- 민주주의 나라와 플레이어 가문 자본주의 나라는 바뀌지 않는다.
- 배포 뒤 볼 것: 감사 기록 `governance.shares_to_house` 줄 수, `governance_share_fixups` 행 수, 지분 합(소각·몰수 없이 그대로인지), 서버 경고·오류.

## 손으로 푼 곳
- `apps/game/messages/{ko,en}.json`: 끝 키 충돌 — main `gather_phase_entering_named`와 줄기 세 키(`gov_kind_tax_change`·`gov_tax_target`·`government_tax_agenda_opened`)를 모두 남김
  (8,618키씩, 같은 키 없음).
- `docs/WORKLOG.md`: 들어오는 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤).
- `content/core/manifest.json`: 172 → **133**.
- 판 번호: `packages/protocol/src/version.ts` 58 절(줄기 판 98), `PROTOCOL_VERSION` 58, MIN 설명 "58부터 56판 이하", `MIN_SUPPORTED_PROTOCOL_VERSION` 57. 주석 판 번호
  (`governance.ts`·`nationTax.ts`·`governance.test.ts`·`nationTax.test.ts`·`apps/server/src/factionIdentity/gateway.ts`), ADR `2026-11-21-governance.md` "바뀜 (governance-2)" 판 줄
  (프로토콜 58/57·core@133). 줄기 기록은 고치지 않았다(줄기 판 그대로, 이 기록이 묶음 판).
- 저절로 합쳐진 곳: main의 채집·지형 길 고침(`gather/service.ts`·`stand.ts`·`terrainRoute.ts`·`SecondaryMapScreen.tsx` 등)과 줄기의 의결 파일은 겹치지 않았다.
- 파일 크기: 넘은 파일 없음. 큰 파일: `facilities/service.ts` 999, `labor/service.ts` 997, `npc/runtime.ts` 997, `packages/sim/src/index.ts` 995, `npc/economy.ts` 985,
  `db/schema.ts` 983.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@133 |
| `packages/protocol/src/version.ts`, `governance.ts`, `nationTax.ts`, `governance.test.ts`, `nationTax.test.ts` | 프로토콜 58(최소 57), 주석 판 번호 |
| `apps/server/src/factionIdentity/gateway.ts` | 주석 판 번호 |
| `apps/game/messages/{ko,en}.json` | 합침 충돌 |
| `docs/adr/2026-11-21-governance.md` | "바뀜 (governance-2)" 판 줄 |
| `docs/worklog/2026/11/21-1556-batch-1116v-merge.md`, `21-1658-batch-1116w-merge.md` | 배포 확인(Verified) 절 |
| `docs/worklog/2026/11/21-1842-batch-1116x-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 59(최소 58), 팩 134, SIM 68, 시뮬 출력 형식 24. 다음 마이그레이션 `prevIds` = **13002149-32f1-42b0-b099-24026612317f**(끝 하나).
- `facilities/service.ts`(999)·`labor/service.ts`(997)·`npc/runtime.ts`(997)·`packages/sim/src/index.ts`(995)를 늘리면 새 모듈로 나눈다.
- 앞 묶음들의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO).
- 줄기 기록 `21-1745-governance-2`의 "함께 바꿔야 하는 파일"·"건드리지 말 것"을 그대로 따른다(`shares:house:`와 `vault:house:`를 합치지 않는다, `governance_share_fixups` 기록을 지우지 않는다).

## 건드리지 말 것
- 마이그레이션 `20261121060714_governance`·`20261121061433_nation_taxes`·`20261121062521_npc_next_decide`·`20261121084410_governance_vacancy_tax`.

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,617키)·디자인 값(746쌍)·콘텐츠
  (core@133 e4c7e0a943a5) 통과, 시험 파일 **831/831**, 시험 **6,063/6,063**(`@terra/sim` 골든 포함 — SIM 67).
- `pnpm check:content b59df417cf`(core@133 e4c7e0a943a5, 단계 1·2·4a·4b), `pnpm check:docs b59df417cf`·`ed25b71a3c`, `pnpm settings:cells --check`, `pnpm wiki:index --check`
  (항목 40개), `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌어(의결 칸·나라 세금 칸 문구, main의 2차맵 고침) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,522 B** / 상한 131,416 B
  (파일 7개, 1116w 110,519 B와 거의 같음).
- 화면 시험(한 번씩): `e2e/governance.spec.ts` **6/6 통과**(24.1초). `e2e/government.spec.ts` **1/9 통과**(7.0분) — 실패 8개 모두 `smallTapTargets`(누르는 곳 38px, 가로 넘침 단언은
  그 앞에서 통과): 1116w와 같은 8개(경비대 시험만 이 단언이 없다). 알려진 문제(사용자 결정 대기).

## 미검증·알려진 문제
- **쿠데타 일으키는 길 없음**: 결과 도우미(몰수·만족도 벌칙)만 있고 부르는 곳이 없다(질문 2433).
- **빈자리 가르기 절차 빈틈**: 설정 칸 `gov_vacancy_split_ms`만 있고 가르는 절차는 질문 2434.
- **지분 사는 길 없음(2438)**: 국고에만 지분이 있는 나라는 지배 가문이 독재 지분 과반에 닿을 수 없다(국고는 과반 셈에서 빠짐).
- 독재 청원(2409) 만들지 않음. 세율 안건 카드·나라 세금 칸 안내 화면은 사진을 찍지 않았다(미검증).
- **화면 누르는 곳 38px**: `smallTapTargets` 실패는 그대로(사용자 결정 대기).
- NAS 첫 켬 동작은 위 절 그대로 Assumed.

## 사용자 결정 대기
- 질문 2431~2440(governance-3), 앞 묶음의 2421~2427·2381~2385·2401~2410·2371~2375·2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·2291~2295·2251~2259·
  2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224. 화면 누르는 곳 38px.
