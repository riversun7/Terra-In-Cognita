# 2026-11-22 residence-3 — 주거 건물 층 올리기 공사(정원 = 층)·집세·미리 내는 숙박비(D-591)

- 일시: 2026-11-22 10:30 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 D-591(2026-11-22, 기획 커밋 88eda2d — 코디네이터 전달, 미러에는 아직 없다): 1 = 질문 2535 나, 2 = 질문 2536 다. D-584(규칙 모양을 지어내지 말 것).
  ADR "바뀜 (residence-3 …)": `docs/adr/2026-11-15-business-ledger.md`·`docs/adr/2026-11-07-buildings-runtime.md`. 답 표시: `docs/questions/2026-11-21-governance-6.md`(2535·2536)·
  `docs/questions/2026-11-21-residence.md`(2486). 새 질문 2671~2678(`docs/questions/2026-11-22-residence-3.md`).
- 가지 `work/residence-3`, 바탕 main 14537f2649(묶음 1117e)

## 한 일
1. **D-591 1 — 층 올리기 공사**(2535 나):
   - 시설 줄 `world_facilities.floors`(기본 1)·작업 종류 `floor`. 명령 WebSocket `facility_floor { buildingId, unitIds? }` → `facility_result`(새 코드 `floor_full`, 프로토콜 145).
   - 판정·작업은 `apps/server/src/facilities/floors.ts`(면적 모듈 `plots.ts`의 고리 `PlotDeps`를 같이 쓴다 — 소유·작업 겹침·일꾼·재료 자리·운영자 모드). 끝나면 층 + 1(`service.ts finish → addModule`).
     `service.ts`(999줄 상한)는 면적 모듈 명령을 `plotCommands`로 펼쳐 줄을 줄였다(989줄).
   - 재료·시간 = 지금 레벨 짓기 재료·시간 × 지금 층 수 × 설정 칸 `residence_floor_cost_pm`·`residence_floor_time_pm` ÷ 1000, 최고 층 `residence_floor_max`(5) — [임시] 기술 기본값(질문 2671).
   - 정원 = 층 × `residence_capacity_per_floor`(옛 칸 `residence_capacity_per_level`을 이름만 바꿈, 값 4 그대로 — `content/core/id-changes.json` renamed 뒤에 더함). 레벨은 정원에 들지 않는다.
   - 이미 있던 숙소: 마이그레이션이 층 = 레벨로 채운다(옛 정원 레벨 × 4 그대로 — 아무도 쉬지 않는다, 질문 2677).
2. **D-591 2 — 집세·미리 내는 숙박비**(2536 다):
   - 내는 길(`residence/book.ts payKindOf`): 배정받은 숙소 = `lodging`(하룻밤 숙박비 × 한 기간의 밤 수 — `labor/workerRest.ts periodFee`), 내 집 = `own`, 주인이 세를 놓은 남의 집 = `rent`(주인 집세).
     남의 집은 세를 놓아야 고를 수 있다. own이 아니면 미리 낸 기간(`unit_residences.paid_until_ms`) 안에서만 산다(세를 거두거나 배정이 바뀌어도 그 기간 끝까지).
   - 한 기간 = 설정 칸 `residence_rent_period_ms`(하루 [임시] — 2672). 고를 때 첫 기간을 유닛 지갑에서 바로 낸다(모자라면 `residence_result insufficient_funds`, 145 아래 판은 `not_eligible`).
     같은 집을 기간 안에 다시 고르면 unchanged, 다른 집을 고르면 새로 내고 옛 집의 남은 몫은 버린다(2486 가).
   - 받는 곳 = 그 건물 사업장 금고(`BusinessCore.receive` — 소득세 포함, 거래 종류 `residence_rent`·`lodging_prepay`, 장부 "수입" 칸). 화폐 = 숙박비와 같은 서버 시험 화폐 [임시 2673].
   - 다음 기간: 1분 훑기(`residence/rent.ts renewResidenceRents` → 쉼 훑기)가 걷는다. 모자라면 걷지 않고 쉰다(숙소 배정 + 처리할 일 `residence_paused`), 빚 없음, 돈이 생기면 다시 산다 [임시 2676].
   - 미리 낸 숙소 몫이 덮는 동안 일꾼 쉼터는 그 숙소 숙박비를 밤마다 걷지 않는다(`workerRest.ts` — `residenceBookOf(원장).prepaidAt`).
   - 주인 집세: 표 `residence_rents`, WebSocket `residence_rent { buildingId, rent | null }` → `residence_rent_result`(결과 코드 8개 — 채집 게이트웨이가 함께 받는다). 다음 기간부터 든다. 정할 때 주인이 아니게 되면 쓰지 않는다(2678).
   - NPC: 사는 곳을 고르지 않는다 — NPC 숙박비 하루 끝 길(`npc/npcWages.ts`)·NPC 계획의 플레이어 숙소 침대 요금 그대로. NPC가 플레이어 집을 세 드는 길은 없다 [임시 2674].
3. **화면**: 건물 판 [사는 곳] 카드(`map/building/ResidenceCard.tsx`) — 정원 한 줄(사는 수/정원 · 층 · 최고 층), 여기 살면 기간마다 낼 집세·숙박비(일찍 바꾸면 손해), 미리 낸 기간 남은 시간·못 내 쉬는 줄.
   내 건물이면 주인 칸(`ResidenceOwner.tsx` — 집세 입력·[집세 정하기]·[세 거두기], 다음 층 재료(가진 수/필요 수)·시간·[층 올리기], 올리는 중 남은 시간, 최고 층). 문구 ko·en 24키 더함 + 1키 고침(`residence_block_not_eligible`).
   조회 tRPC `gather.residence` 응답에 `periodMs`·`choice`·건물 칸(`floors`·`maxFloors`·`capacity`·`occupants`·`rent`·`mine`·`payKind`·`price`·`floor`)을 더했다(모두 선택 칸 — 옛 기기는 무시).
   주인 칸은 보내는 유닛을 고른 때만 보인다(조회가 유닛 기준이라 — 건물 판의 보내는 유닛 줄).

## 판·마이그레이션·리셋
- 줄기 판(묶음 때 다시 매긴다): 프로토콜 **145**(최소 **144** — main 65/64 + 80), 팩 **core@223**(설정 칸 +4·1개 이름 바꿈), SIM_VERSION **그대로(74)**, 시뮬 출력 형식 그대로.
  `id-changes.json` renamed에 `residence_capacity_per_level → residence_capacity_per_floor`(since 223 — 묶음 판으로 바꿀 때 since도 같이).
- 마이그레이션 `20261122012636_residence3_floors_rent`(prevIds `7e79264e-c94f-43c1-b1a3-9e2f1ba61755` — Verified 스냅숏): 새 표 `residence_rents`, 칸 `unit_residences.paid_until_ms`·
  `world_facilities.floors`(기본 1, 검사 1~100), `facility_jobs_kind` 검사에 `floor`, 숙소(`lodging`, 레벨 ≥ 1) 층 = 레벨 채우기(손으로 더한 UPDATE 한 줄). 직전 판 앱은 새 표·칸을 모르고, `floor` 작업 줄은 건너뛴다.
- **리셋 필요 없음.** 배포 뒤 바뀌는 것: 숙소 정원은 그대로(층 = 레벨). 이미 배정받은 숙소를 사는 곳으로 골라 둔 유닛은 첫 1분 훑기에 한 기간 숙박비를 미리 낸다(지갑이 모자라면 쉬고 처리할 일이 뜬다 —
  그동안 숙소 배정으로 사니 주민세 거주는 같은 도시). 남의 집 세 들기는 주인이 집세를 정해야 시작된다.

## 시뮬 전·후
Verified — 실행, `node cli/sim.ts econ16 --seed N --days 30 --out … --summary …`. 바탕 = 같은 작업 트리에서 `packages/sim/src`·`content/core`만 git stash로 되돌린 코드(main 14537f2649).
줄 수 같음, 다른 칸은 머리·요약의 `content`(팩 판·해시)와 `linesHash`뿐.

| 시드 | 판 | jsonl md5 | `content`·`linesHash` 뺀 md5 | 줄 |
|---|---|---|---|---|
| 1 | 바탕 | 3f235b02f9e66196ace8a53ade952d1f | 08872f09183f62b4376ab26d9d7dfe13 | 770 |
| 1 | 이 줄기 | ef1d5563e28093548dd2bc8249197685 | 08872f09183f62b4376ab26d9d7dfe13 | 770 |
| 2 | 바탕 | 02b7eb79fe242d12abfab0060646dbe3 | b93665bf40c7e99452bbf2ec35a8f402 | 836 |
| 2 | 이 줄기 | 62e8012be3fa2a1ca278888bf882306d | b93665bf40c7e99452bbf2ec35a8f402 | 836 |

- 시뮬은 사는 곳·층·집세를 갖지 않는다(설정 칸 이름만 읽어 둔다) → **SIM_VERSION 그대로(74)**.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/tuning.json`·`manifest.json`·`id-changes.json`, `packages/sim/src/tuningBusiness.ts`·`society/businessCoefficients.ts` | 설정 칸(정원 이름 바꿈·최고 층·재료·시간 배율·집세 기간), core@223 |
| `packages/protocol/src/facilities.ts`·`residence.ts`(+ 시험)·`index.ts`·`version.ts` | `facility_floor`·`floor_full`, `residence_rent`·`residence_rent_result`·`insufficient_funds`, 판 145/144 |
| `packages/shared/src/residence.ts`·`facilities.ts`·`businessBooks.ts` | 응답 칸, 작업 종류 `floor`, 장부 칸 |
| `apps/server/src/db/facilitySchema.ts`·`residenceSchema.ts`·`schema.ts`, `drizzle/20261122012636_residence3_floors_rent/` | 표·칸 |
| `apps/server/src/facilities/floors.ts`(새, + 시험·DB 시험)·`plots.ts`·`service.ts`(989)·`state.ts`·`gateway.ts`(+ 시험), `world/persist/tables.ts`(998) | 층 올리기 공사 |
| `apps/server/src/residence/book.ts`·`rent.ts`(새)·`floorQuote.ts`(새)·`service.ts`·`attach.ts`·`store.ts`(+ 시험·DB 시험) | 내는 길·미리 내기·다음 기간·주인 집세·층 견적 |
| `apps/server/src/labor/workerRest.ts`, `gather/world.ts`·`gateway.ts`(+ 시험), `session.ts` | 밤마다 숙박비 건너뜀·기간 값, 잇기, 명령 길 |
| `apps/game/src/map/building/ResidenceCard.tsx`·`ResidenceOwner.tsx`(새)·`residenceData.ts`(+ 시험)·`building.css`, `economy/facilityText.ts`, `messages/{ko,en}.json` | 화면·문구 |
| `e2e/building-screen.spec.ts` | 정원 줄 확인, 주인 칸 견본 사진 |
| ADR 둘 "바뀜", 질문 답 표시 둘, 새 질문 `2026-11-22-residence-3.md`, 이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 묶음과 합칠 때: 프로토콜 145/144 → 묶음 판(`version.ts`, `facilities.ts FLOOR_PROTOCOL_VERSION`, `residence.ts RESIDENCE_RENT_PROTOCOL_VERSION`, `residence.test.ts`(판 = 145 기대), ADR 판 줄, 이 기록),
  팩 core@223 → 묶음 판(`manifest.json`, `id-changes.json` renamed의 since도 같은 판으로 — 아직 올라가지 않은 기록이라 고쳐도 된다), 마이그레이션 prevIds는 그대로(형제 갈래면 그대로 합친다).
- 숙박비 화폐를 나라 화폐로 옮기면(2673) `residence/attach.ts feeAsset`·`gather/world.ts`도 같이.

## 건드리지 말 것
- `app.ts`(999)·`world/world.ts`·`facilities/service.ts`(989)·`world/persist/tables.ts`(998) — 늘리지 않았거나 한 줄만.
- 마이그레이션의 숙소 층 채우기는 팩 시설 ID `lodging`을 직접 쓴다(지금 생활 단계 시설은 그것 하나).

## 검사
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안 — Verified 실행): 첫 판은 프로토콜 시험 타입(`as const` 읽기 전용 배열)으로, 둘째 판은 oxlint 둘(`no-useless-fallback-in-spread`·
  `react(purity)` — 그리는 중 `Date.now`)로 멈춰 고쳤다. 셋째 판: 포맷·린트·타입·경계·크기·다국어(8,933키)·디자인 값(746쌍)·콘텐츠(core@223 636c009c7132) 통과,
  시험 파일 **890/890**·시험 **6,366/6,366**.
- `pnpm check:docs 14537f2649`·`pnpm check:content 14537f2649`(단계 1·2·4a·4b)·`pnpm settings:cells --check`·`pnpm wiki:index --check` 통과, `db:generate` = "No schema changes".
- 화면 시험 `e2e/building-screen.spec.ts --grep "사는 곳"` 한 번(빌드 포함): **4/4 통과**(390 파스텔 한국어·다크 영어 — 실제 NPC 숙소 카드의 정원 줄·주인 칸 없음, 견본 주인 칸(집세 줄·입력·
  [집세 정하기] 빈 입력 막힘·[세 거두기]·다음 층 재료·재료 모자라 [층 올리기] 막힘), 가로 넘침·작은 단추 없음). 사진 `building-residence-owner-390-{pastel-ko,dark-en}`·
  `building-residence-390-*`(두 기본 테마 눈으로 확인 — 넘침 없음). 그 뒤 고친 것은 린트 두 곳(펼침 빈 값·서버 시각 도우미)뿐.
- 작업 중(Verified — 실행): 프로토콜 34파일 204 + 새 시험, 서버 `residence`(DB)·`facilities/floors`(단위·DB)·`facilities/gateway`·`facilities.db`·`gather/gateway`·`labor`·`npc/residentProperty`·`inbox`
  24파일 129, sim `tuning`·`tuningPages`, 게임 `map/building`·`economy` 6파일 34, 게임·서버 타입 검사.

## 미검증·TODO·알려진 문제
- 실제 세계에서 세 들기·다음 기간 걷기·층 공사를 끝까지 돌려 보지 않았다(미실행 — 단위·DB 시험만).
- 다음 기간을 걷은 뒤 표 쓰기가 실패하면 돈은 이미 옮겨졌다: 메모리는 먼저 적어 그 켬 동안은 다시 걷지 않지만, 다시 켜면 표의 옛 기간으로 한 번 더 걷을 수 있다(드문 경우 — Assumed).
- 기간이 끝난 뒤 다음 훑기까지(최대 1분) 그 유닛은 쉬는 것으로 보인다(주민세 거주·정원 셈에서 잠깐 빠짐).
- NPC가 층을 올리지 않는다(NPC 숙소는 레벨 = 층으로 시작한 채).

## 사용자 결정 대기
- 새 질문 2671~2678(`docs/questions/2026-11-22-residence-3.md`).
