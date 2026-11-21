# 2026-11-21 residence — 사는 곳 하나 고르기(유닛마다, 주민세 거주가 따름)·주민세 주기 고르기 목록·도시 몫 [임시]·폐허 빚 남김(2427 나 되돌림, D-585)

- 일시: 2026-11-21 22:05 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 답 D-585(코디네이터 전달 — 1 사는 곳, 2 주민세 주기, 3 도시 몫 답 없음, 4 2427 나 되돌림)·D-581 E·D-584(규칙 모양을 지어내지 말 것).
  ADR "바뀜 (residence …)": `2026-11-15-business-ledger.md`·`2026-11-21-credit.md`. 답 표시: `docs/questions/2026-11-21-tax-2.md`(2424·2427)·
  `docs/questions/2026-11-21-resident-tax.md`(2373·2375). 새 질문 2481~2486(`docs/questions/2026-11-21-residence.md`).
- 가지 `work/residence`, 바탕 154c22be52(main, 묶음 1116y)

## 한 일
1. **D-585 1 — 사는 곳 하나 고르기**(`apps/server/src/residence/`):
   - 고르는 쪽 = 유닛(지금 주민세 집 몫을 내는 쪽 — 유닛 지갑. 플레이어 자신 = 사이보그 본체). 주인은 옛 규칙대로 사는 유닛이 있는 도시의 주민(사업장 몫) — 새 모양 없음(질문 2481).
   - 새 표 `unit_residences`(유닛마다 한 줄: 주인·건물·고른 시각, 외래 키 없음). 장부 `book.ts`(원장마다 하나 — `registerResidenceBook`/`residenceBookOf`), 표 읽기·쓰기
     `store.ts`(월드 쓰기 대기열이 아니라 바로 — 나라 세금 표와 같은 꼴), 서비스 `service.ts`, 잇기 `attach.ts`(채집 세계가 일꾼 쉼터 다음에 만든다 — `gather/world.ts`).
   - 고를 수 있는 집: 다 지은 주거 건물(생활 단계)이 도시에 서 있고, 유닛 주인의 집이거나 그 유닛이 배정받은 숙소. 조건이 깨지면 고른 것은 쉬고 옛 길(숙소 배정)로(질문 2485).
   - 명령 WebSocket `residence_set { unitId, buildingId | null }` → `residence_result`(결과 코드 10개) — 채집 게이트웨이가 함께 받는다(app.ts 999줄이라 새 게이트웨이를 잇지
     않음, 서비스는 채집 서비스 객체에 붙여 `residenceServiceOf`로 찾는다). 조회 tRPC `gather.residence { unitId, buildingId? }`(`@terra/shared/residence`).
   - 주민세 거주(`npc/residentProperty.ts residentsIn`): 고른 곳이 쓸 수 있는 유닛은 그 집 도시에서만(집 몫 = 그 집 값 ÷ 사는 사람 수). NPC 사는 도시·숙소 배정으로는 세지 않는다.
   - 조회 함수 `residenceCityOf(유닛)`·`ownerResidenceCities(주인)` — 신용에 잇지 않았다(governance-5 줄기가 신용을 다시 만든다). 빚 계정 도시가 사는 도시라 지금 신용도 사는 곳을 따른다.
   - 화면: 건물 판 개요(주거 건물)에 [사는 곳] 카드(`map/building/ResidenceCard.tsx`·`residenceData.ts`) — 보내는 유닛의 지금 사는 곳 한 줄, [여기를 사는 곳으로]·[고른 것 풀기],
     막는 까닭 한 줄. 문구 ko·en 21키.
2. **D-585 2 — 주민세 주기는 정부가 목록에서**: `@terra/shared/government RESIDENT_TAX_PERIOD_DAYS`(하루·한 주 [임시] — 질문 2482). 정부 판 주기 칸을 입력 → 고르기(빈 = 기본값,
   전에 정해 둔 목록 밖 값도 보인다). 서버 `nationTaxPolicy.set`이 목록 밖으로 **바꾸는** 것을 `invalid_period`로 막는다(옛 값을 그대로 두면 받는다), 줄기 판 99 아래 연결은
   `internal_error`(`factionIdentity/gateway.ts`). 주기는 폭 셈(세율 안건)에 들지 않아 지도자가 바로 정한다(`taxChangeRule` 그대로). 고르지 않은 나라 = 설정 칸 7일 — 설명에 [임시].
3. **D-585 3 — 도시 몫 → D-304**: 바뀜 없이 [임시] 표시만(`societyPayouts.ts`·`residentTax.ts`·`businessCoefficients.ts` 주석, 설정 칸 `nation_resident_tax_nation_pm` 설명, 질문 2484).
4. **D-585 4 — 2427 나 되돌림**: `sim society.ts ruinCity`가 `payouts.cityMoved(도시)`(정산 기준점만)를 부르고 옛 나라를 넘기지 않는다 → 폐허가 되어도 빚이 남는다(복원되어도 그대로 —
   질문 2483). 나라가 바뀌는 길(`moveCity → cityMoved(…, from, now) → cancelResidentDebts`)은 그대로. 시험: 폐허 = 빚 남음, 점령(INTEGRATE) = 빚 사라짐.

## 판·마이그레이션·리셋
- 줄기 판(묶음 때 다시 붙인다): 프로토콜 **99**(최소 **98** — main 59 + 40), 팩 **core@177**(설정 칸 설명 둘 — [임시], 값 그대로), SIM_VERSION **그대로(68)**, 시뮬 출력 형식 그대로.
  `id-changes.json` 그대로.
- 마이그레이션 `20261121131627_unit_residences`(새 표만, prevIds `ee4d36aa-5559-4825-ab82-9ce79bf8db2c`·`ace6aeb5-b447-493e-affb-6e24cd0be200` — Verified 스냅숏). 직전 판 앱은 이 표를 모른 채 돈다.
- **리셋 필요 없음.** 배포 뒤 바뀌는 것: 주거 건물 판에 [사는 곳] 카드, 정부 판 주기 칸이 고르기(하루·한 주). 주민세율 기본 0이라 돈은 그대로. 폐허 도시의 주민세 빚이 남는다(지금 빚 없음).

## 시뮬 전·후
Verified — 실행, `node cli/sim.ts econ16 --seed N --days 30 --out … --summary …`. 바탕 = 같은 작업 트리에서 `packages/sim/src/simulator/society.ts`·`content/core/tuning.json`·
`manifest.json`만 154c22be52로 되돌린 코드(다른 sim 바뀜은 주석뿐). 줄 수 같음, 다른 칸은 머리·요약의 `content`(팩 판·해시)와 `linesHash`뿐.

| 시드 | 판 | jsonl md5 | `content`·`linesHash` 뺀 md5 | 줄 |
|---|---|---|---|---|
| 1 | 바탕 | 24c0d10eb1c319024412f16364512fcc | 82260cc05bf9f0d160c79d3a07746fb5 | 837 |
| 1 | 이 줄기 | 2acf15d7d0c2c03612a22497f4ab9dd8 | 82260cc05bf9f0d160c79d3a07746fb5 | 837 |
| 2 | 바탕 | 77fe739078906ed991ec7d7f220b21bc | 163effbdd94855470129605477f51ee7 | 950 |
| 2 | 이 줄기 | 17e88ce6c81dc19efb44248f94c0e72d | 163effbdd94855470129605477f51ee7 | 950 |

- 시뮬은 주민세 고리가 없어 폐허 길 탕감을 원래도 훑지 않았다 → **SIM_VERSION 그대로(68)**.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/society.ts`(+ `society.test.ts`)·`societyPayouts.ts`·`society/residentTax.ts`·`society/businessCoefficients.ts` | 폐허 = 빚 남김(2427 되돌림), [임시] 표시 |
| `packages/protocol/src/residence.ts`(새, + 시험)·`nationTax.ts`(+ 시험)·`messages.ts`·`index.ts`·`version.ts` | `residence_set`/`residence_result`, `invalid_period`, 판 99·최소 98 |
| `packages/shared/src/residence.ts`(새)·`government.ts`·`package.json` | 사는 곳 응답 타입, 주기 목록 |
| `apps/server/src/db/residenceSchema.ts`(새)·`schema.ts`·`drizzle/20261121131627_unit_residences/` | 표 `unit_residences` |
| `apps/server/src/residence/book.ts`·`store.ts`·`service.ts`·`attach.ts`(새, + `book.test.ts`·`residence.db.test.ts`) | 사는 곳 장부·저장·명령·조회 |
| `apps/server/src/gather/world.ts`·`gateway.ts`(+ 시험)·`reads.ts`, `trpc/gather.ts`, `session.ts`(952) | 잇기·명령 길·조회 |
| `apps/server/src/npc/residentProperty.ts` | 주민세 거주가 고른 곳을 먼저 |
| `apps/server/src/government/nationTaxPolicy.ts`, `factionIdentity/gateway.ts` | 주기 목록 검사·옛 판 코드 |
| `apps/game/src/map/building/ResidenceCard.tsx`·`residenceData.ts`(새, + 시험)·`BuildingPanel.tsx`, `map/mapFeed.ts` | 사는 곳 카드 |
| `apps/game/src/government/NationTaxPolicy.tsx`·`nationTaxData.ts`(+ 시험), `messages/{ko,en}.json` | 주기 고르기, 문구 |
| `content/core/tuning.json`·`manifest.json` | 설명 [임시], core@177 |
| `e2e/building-screen.spec.ts` | [사는 곳] 카드 확인·사진 |
| ADR 둘 "바뀜", 질문 답 표시 둘, 새 질문 `2026-11-21-residence.md` | 기록 |

## 함께 바꿔야 하는 파일
- 묶음과 합칠 때: 프로토콜 99/98 → 묶음 판(`version.ts`·`residence.ts RESIDENCE_PROTOCOL_VERSION`·`nationTax.ts NATION_TAX_PERIOD_PROTOCOL_VERSION`·`residence.test.ts`·
  `nationTax.test.ts`(판 = 지금 판 기대)·ADR business-ledger 판 줄·이 기록), 팩 core@177 → 묶음 판.
- governance-5 줄기(신용 점수 하나로): 사는 도시·나라로 신용 범위를 정하려면 `residenceBookOf(원장)?.residenceCityOf(유닛)`·`ownerResidenceCities(주인)`를 쓴다.
  세율 안건(`gov_propose tax_change`)의 주기 칸도 목록 검사를 하려면 `isResidentTaxPeriod`(@terra/shared/government)를 쓴다(지금 그 길은 검사하지 않는다 — governance 파일이라 건드리지 않음).
- 질문 2483 답이 나(다른 나라가 복원하면 지움)면 `societyRuins.ts` 복원 길에서 옛 나라와 다를 때 `cancelResidentDebts`.

## 건드리지 말 것
- `app.ts`(999)·`world/world.ts`(999)·`facilities/service.ts`(999) — 늘리지 않았다. 사는 곳은 채집 세계·게이트웨이에 붙였다.
- 폐허 길은 `cityMoved(도시)`(옛 나라 없이) — 옛 나라를 넘기면 빚이 다시 지워진다.
- 주민세 고리가 없으면 `cityMoved`가 원장을 훑지 않아야 한다(시뮬 바이트 같음).

## 검사
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) — 첫 판은 oxlint(`unbound-method` 셋·시험 `as` 경고 셋)로 실패해 고친 뒤 다시(Verified): 포맷·린트·타입·
  경계·크기·다국어(8,714키)·디자인 값(746쌍)·콘텐츠(core@177 0edc707e1aaa) 통과, 시험 파일 **853/853**·시험 **6,148/6,148**. 그 뒤 고친 것은 사는 곳 카드의 빈 단추 줄을 그리지 않게 한
  한 곳(포맷·타입만 다시 봄).
- `pnpm build` 통과, `pnpm check:bundle` 첫 화면 JS 110,745 B / 상한 131,416 B(남음 20,671 B — 카드는 건물 판 지연 조각 안).
- 화면 시험 `e2e/building-screen.spec.ts --grep "사는 곳"` 한 번: **2/2 통과**(390 파스텔 한국어·다크 영어 — NPC 숙소 판에 카드, 고를 단추 없음, 가로 넘침·작은 단추 없음).
  사진 `building-residence-390-{pastel-ko,dark-en}`(두 기본 테마 눈으로 확인 — 넘침 없음). 정부 판 주기 고르기는 지도자 고정 자료가 없어 화면 시험·사진 없음(미실행 — 단위 시험만).
- 시뮬 전·후 위 표(econ16 시드 1·2 × 30일).
- 작업 중: `@terra/sim` `society.test.ts`, 프로토콜 31파일, 서버 `residence`(DB 시험 포함)·`gather/gateway`·`npc/residentProperty`·`government`·`factionIdentity/gateway`, 게임
  `nationTaxData`·`residenceData`, 게임 타입 검사.

## 미검증·TODO·알려진 문제
- 실제 세계에서 사는 곳을 골라 주민세를 걷어 보지 않았다(미실행 — 단위·DB 표 시험만, 세율 기본 0).
- 2차맵 사이를 이동 중이라 2차맵에서 찾을 수 없는 유닛은 고른 사는 곳이 그동안 쉰다(`unitOwner` undefined — Assumed: 이동 중 유닛이 2차맵 목록에 없을 수 있다).
- 고른 숙소(남의 숙소)는 숙소 배정이 그대로일 때만 쓴다 — 쉼터 계획(30초)이 다른 숙소로 옮기면 쉰다(질문 2485).
- 세율 안건 길(`gov_propose tax_change`)은 주기 목록 검사를 하지 않는다(위 "함께 바꿔야").

## 사용자 결정 대기
- 새 질문 2481~2486(`docs/questions/2026-11-21-residence.md`).
