# 2026-11-21 묶음 1116w 합치기 (나라 세금 칸·주민세 재산 = 건물 값·세후 임금) — 리셋 필요 없음

- 일시: 2026-11-21 16:58~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-1600-tax-2`, 질문 2421~2427(`docs/questions/2026-11-21-tax-2.md`), ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-03-labor-contracts.md`·
  `2026-11-16-logistics-center.md`·`2026-11-07-ranking.md` — 줄기 tax-2)

## 한 일
- main f3ff55b(묶음 1116v) 위에 `work/tax-2`(8a23f8e, 커밋 셋, 바탕 497aba3)를 `--no-ff`로 합쳤다.
  - 나라 세금 표 `nation_taxes`(마이그레이션 `20261121061433_nation_taxes`) + 지도자가 정하기: WS `nation_tax` → `nation_tax_result`(가문 게이트웨이를 거쳐
    `government/nationTaxPolicy.ts`), 정부 판 세금 칸 화면(`apps/game/src/government/NationTaxPolicy.tsx`).
  - 주민세 재산 = 건물 값(지은 값 × 값‰ × 감가), D-581 주민세 내는 사람(유닛 집 몫 + 주인 사업장 몫, 거주자만), 도시가 넘어갈 때 빚 탕감.
  - 세후 임금 보기(`wageNetView`, `net` 칸) — 경제·건물 노동 화면.
  - NPC 운반꾼 배부름 배수(서버만, 새 sim 고리 `NpcLivingHooks.foodPm` — 시뮬 판정 그대로).
  - 랭킹: 시험 봇을 시험 NPC 세력 전투력에서 뺌.
- 최종 판:
  - 프로토콜 **57**(최소 **56**): 줄기 판 95(최소 94) → 묶음 판. `NATION_TAX_PROTOCOL_VERSION` 57. 판 시험은 `MIN = 현재 − 1`이라 고칠 것 없음.
  - 팩 **core@132**(줄기 판 170 → 묶음 판). `tuning.json`은 칸 ID로 3방향 합침 — 저절로 합쳐졌다. 칸 831개, 같은 ID 두 번 없음(Verified), 새 칸 다섯
    (`npc_resident_tax_min_pm`·`npc_resident_tax_max_pm`·`resident_building_value_pm`·`resident_building_depreciation_pm`·`resident_building_floor_pm`). `id-changes.json` 바뀜 없음.
  - `SIM_VERSION` **67** 그대로(tax-2는 시뮬 출력을 팩 해시 밖에서 바이트까지 같게 둔다 — 줄기 기록). 시뮬 출력 형식 **23** 그대로.
  - 마이그레이션: 형제 셋 그대로(셋 다 prevIds = 2d53a6a4) — `20261121060714_governance`(스냅숏 id `74cfa5b9-26db-4497-a517-6d62ca86c3f7`)·
    `20261121061433_nation_taxes`(`8ba706b5-4e3d-4b0c-bb3d-742111c9a039`)·`20261121062521_npc_next_decide`(`6429529b-49e0-4cd0-ab48-8bf2fd73fba0`). 합친 뒤
    `pnpm --filter @terra/server db:generate` = "No schema changes"(Verified). 다음 마이그레이션 `prevIds` = 세 끝 모두 **74cfa5b9**·**8ba706b5**·**6429529b**
    (AGENTS.md 6장 Drizzle 갈래 규칙).

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 새 표(`nation_taxes`) 하나를 더할 뿐이다. 직전 판 앱은 그 표를 모른 채 그대로 돈다.
- 팩은 설정 칸 다섯 더하기 + 설명 넷 고침. 프로토콜은 메시지 더하기뿐이고 최소 56이라 56판 기기는 그대로 들어온다(57판 앱은 PWA로 받는다).
- 배포 뒤 바뀌는 돈: 없음(Assumed — 줄기 기록). 나라 주민세 기본값 0이고 소득세 기본값 = 그 나라 거래세율(옛 판)이라 지도자가 값을 정하기 전까지 더 걷는 세금이 없다.

## 손으로 푼 곳
- `packages/protocol/src/version.ts`: 56 절 뒤에 57 절(줄기 tax-2), `PROTOCOL_VERSION` 57, MIN 설명에 "57부터 55판 이하", `MIN_SUPPORTED_PROTOCOL_VERSION` 56.
- `packages/protocol/src/messages.ts`·`index.ts`: 의결(governance)과 나라 세금(nationTax) 둘 다 남김(머리 주석 한 줄로 합침, index는 `export { … }` 덩이 둘).
- `apps/game/src/map/mapFeed.ts`: `gov_result`·`nation_tax_result` 둘 다 남김.
- `apps/server/src/db/schema.ts`: `export * from "./governanceSchema.ts"`·`export { nationTaxes } from "./nationTaxSchema.ts"` 둘 다.
- `content/core/manifest.json`: 131·170 → **132**.
- `apps/game/messages/{ko,en}.json`: 두 쪽 키를 모두 남김(같은 키 없음, 8,614키씩) → paraglide 다시 컴파일.
- `docs/WORKLOG.md`: 들어오는 쪽을 받은 뒤 `pnpm docs:index`(이 기록을 더한 뒤 다시).
- 판 번호 설명: 줄기 판 95 → 프로토콜 57(`nationTax.ts`·`nationTax.test.ts`·`apps/server/src/session.ts`·`factionIdentity/gateway.ts`·`government/nationTaxCommands.ts`·
  `NationTaxPolicy.tsx` 주석), ADR `2026-11-15-business-ledger.md` "바뀜 (tax-2 …)" 판 줄(core@132·프로토콜 57/56), 줄기 기록 판 줄에 묶음 판 한 마디.
- 저절로 합쳐진 곳: `npc/runtime.ts`(`npcRulingHooks`에 `econ` 넘김, 997줄), `factionIdentity/attach.ts`(의결 + 나라 세금 정하기 둘 다 가문 묶음에), `session.ts`,
  `tuning.json`, `packages/sim`(`index.ts` 993줄·`npcRun.ts`·`society.ts`).
- 의결 ↔ 세금 고리: governance의 세율 바꿈 TODO와 tax-2의 `taxChangeRule()`("leader")은 그대로 둔다(governance-2 줄기가 잇는다). 함께 타입 검사를 지난다(Verified: `pnpm check`).
- 파일 크기: 넘은 파일 없음. 큰 파일: `facilities/service.ts` 999, `labor/service.ts` 997, `npc/runtime.ts` 997, `packages/sim/src/index.ts` 993, `npc/economy.ts` 985,
  `db/schema.ts` 983.
- 거래소 표 누수 규칙: tax-2의 시세 읽기는 `necessityCost`(바깥 도시 표 `get` 뒤 물건 표는 `has` 먼저 — `npcTrade.ts`·`peekMarket`과 같은 틀). 새 `cityMap.get` 호출 없음(Verified: 줄기 바뀜 검색).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json` | 팩 판 core@132 |
| `packages/protocol/src/version.ts`, `nationTax.ts`, `nationTax.test.ts`, `messages.ts`, `index.ts` | 프로토콜 57(최소 56), 합침 충돌, 주석 |
| `apps/server/src/session.ts`, `apps/server/src/factionIdentity/gateway.ts`, `apps/server/src/db/schema.ts` | 주석 판 번호, 합침 충돌 |
| `apps/game/src/map/mapFeed.ts`, `apps/game/src/government/nationTaxCommands.ts`, `NationTaxPolicy.tsx`, `apps/game/messages/{ko,en}.json` | 합침 충돌, 주석 판 번호 |
| `docs/adr/2026-11-15-business-ledger.md`, `docs/worklog/2026/11/21-1600-tax-2.md` | 판 줄 |
| `docs/worklog/2026/11/21-1658-batch-1116w-merge.md`, `docs/WORKLOG.md` | 이 기록·목차 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 58(최소 57), 팩 133, SIM 68, 시뮬 출력 형식 24. 다음 마이그레이션 `prevIds` = 74cfa5b9·8ba706b5·6429529b(세 끝).
- `facilities/service.ts`(999)·`labor/service.ts`(997)·`npc/runtime.ts`(997)·`packages/sim/src/index.ts`(993)를 늘리면 새 모듈로 나눈다.
- 앞 묶음들의 "함께 바꿔야 하는 파일" 그대로: 거래소를 읽기만 할 때는 `peekMarket`, **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO).
- 줄기 기록 `21-1600-tax-2`의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 마이그레이션 `20261121060714_governance`·`20261121061433_nation_taxes`·`20261121062521_npc_next_decide`(갈래는 다시 만들지 않고 그대로 합친다).
- `taxChangeRule()`("leader")와 governance 세율 TODO — governance-2 줄기 몫.
- 줄기 기록의 "건드리지 말 것".

## 검사 (Verified)
- 합친 판(판 손질 뒤) 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·모듈 경계·파일 크기·다국어(8,613키)·디자인 값(746쌍)·콘텐츠
  (core@132 3d8c5d225ed4) 통과, 시험 파일 **826/826**, 시험 **6,034/6,034**(`@terra/sim` 골든 포함 — SIM 67).
- `pnpm check:content f3ff55b412`(core@132 3d8c5d225ed4, 단계 1·2·4a·4b), `pnpm check:docs f3ff55b412`, `pnpm settings:cells --check`, `pnpm wiki:index --check`(항목 40개),
  `pnpm --filter @terra/server db:generate` = "No schema changes" 모두 통과.
- `apps/game`이 바뀌어(정부 판 세금 칸·세후 임금) `pnpm build` 통과, `check-pwa` 통과, `pnpm check:bundle` 첫 화면 JS **110,519 B** / 상한 131,416 B(파일 7개, 1116v 110,512 B와
  거의 같음 — 세금 칸은 정부 판 지연 조각).
- 화면 시험 한 번(`pnpm e2e e2e/government.spec.ts e2e/economy.spec.ts e2e/labor.spec.ts`, 8.7분): **9/40 통과**, 실패 31개를 셋으로 나눴다.
  - `smallTapTargets`(누르는 곳 38px — 닫기·뒤로·탭·고용 등 `--control-h-sm` 높이) **25개**: `government.spec.ts` **8개**(줄기 기록이 말한 8개 그대로, 1/9 통과 —
    경비대 시험만 이 단언이 없다), `economy.spec.ts` **17개**. 가로 넘침 단언은 그 앞에서 통과했다. 알려진 문제(사용자 결정 대기).
  - `economy.spec.ts` 시세 색 **2개**: 시험 상수(`PASTEL.danger` `rgb(184, 40, 63)`·`success` `rgb(34, 107, 51)`)와 지금 토큰(`rgb(184, 29, 56)`·`rgb(22, 101, 52)`)이 다르다.
    이 묶음은 `tokens.css`를 바꾸지 않았다(Verified: `git diff 497aba3e97 HEAD -- apps/game/src/styles` 비어 있음) — 앞선 토큰 바뀜(`db1e404545` 등)의 시험 상수가 낡은 것.
  - `labor.spec.ts` **4개 모두**: 첫 시험(106행)이 임대 계약 칸의 기본 시설을 시험 건물(332)로 기대했는데 9가 골라져 있다(180행). 나머지 셋(257행)은 그 시험이 만드는
    유예 계약을 찾다 실패(차례 의존). tax-2는 노동 화면에 세후 임금 줄만 더했고 시설 고르기 칸·임대 목록은 건드리지 않았다(Verified: 줄기 바뀜) → 앞선 묶음의 세계 시드
    (도시 시설 임대료 등)로 시설 9가 임대 목록 맨 앞에 온 것으로 본다(Assumed, main에서 따로 돌리지 않았다). labor 시험은 1116j(11-16) 뒤로 돈 기록이 없다.

## 미검증·TODO·알려진 문제
- 세율 기본값이 0(주민세)·거래세율(소득세)이라 배포 뒤 실제로 걷히는 새 세금이 없다 — 지도자가 값을 정해야 돈다.
- 지도자가 정하기 경로(`nation_tax` → DB 저장)는 DB 시험이 없다(줄기 기록 — 단위 시험·화면 시험만).
- 2391(운반꾼 배부름 배수)은 서버에만 적용했다 — 시뮬에는 물류센터가 없다.
- **화면 시험 누르는 곳 38px**: 정부 판·경제 화면 시험의 `smallTapTargets` 실패는 알려진 문제(사용자 결정 대기 — 토큰 `--control-h-sm` 되돌리기 또는 시험 문턱 고치기).
- **화면 시험 낡음(앱 회귀 아님으로 봄)**: `economy.spec.ts` 시세 색 상수 2개, `labor.spec.ts` 임대 기본 시설(시험 건물을 고르게 고쳐야 함) — 다음 줄기에서 시험을 고친다.

## 사용자 결정 대기
- 질문 2421~2427(tax-2), 앞 묶음의 2381~2385·2401~2410·2371~2375·2391~2392·2344·2331~2336·2341~2348·2321~2327·2311~2317·2301~2306·2291~2295·2251~2259·2261~2270·
  2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224. 화면 누르는 곳 38px.
