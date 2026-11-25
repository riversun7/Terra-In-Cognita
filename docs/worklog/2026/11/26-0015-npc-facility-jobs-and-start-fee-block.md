# NPC 시설 일자리(자원 값 안의 임금), 가입비 나라 시작 막기, 본체 숙박비, 노동 표 화폐 제약

- 일시: 2026-11-26 00:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-npc-facility-jobs.md`(새로 씀), `2026-11-03-labor-contracts.md`, `2026-11-15-business-ledger.md`, `2026-11-23-nation-money.md`, `2026-11-24-house-membership-separation.md`

## 한 일

게임 흐름(시작 → 1차 생산)에서 찾은 막힘에 대한 사용자 답(2026-11-25)을 옮겼다.

1. **시작 NPC 나라는 가입비를 받지 않고, 가입비를 받는 나라에서는 시작할 수 없다**("시작 NPC국가는 무조건 지원이고, 가입비를 받는나라에서 시작을 할 수 없다. 경고창만 띄워라")
   - 고정 NPC 나라(시작 나라)의 가입 조건 규칙식이 가입비(양수)를 내면 0으로 친다. 지원금은 그대로다. 앞에는 상업 성향이 높은 시작 나라가 가입비를 받아, 그 나라에서 시작한 사람은 가입비가 없어 나라에 들지 못했다.
   - 지도자가 가입비를 정한 나라: 만들기 화면 카드에 "시작 불가"와 가입비를 보이고, 누르면 경고 창만 뜬다(고른 나라는 그대로). 추천에서 빠지고, 서버도 만들기를 거절한다(`unknown_faction`).
2. **NPC 시설 일자리**("NPC 시설에 일하는 기능을 구현해야한다 … 자원의 가치를 고려하여 손해보지 않는 임금")
   - NPC 나라가 자기 채집 시설(농장·벌목장·광산 등)에 구인 게시를 낸다. 플레이어 유닛·사이보그 본체가 기존 구인 게시판에서 받아 임금형 계약으로 일한다.
   - 임금 상한 = 기준 유닛이 그 시설에서 한 시간에 캐는 물건의 기대 금액(그 도시 시세)을 임금 주기로 바꾼 값 − NPC 몫 20%. 상한 안의 가장 큰 고용주 조정으로 낸다. 값이 안 되면 내지 않고 거둔다.
   - 보증금·임금은 시설 금고에서. 금고가 모자라면 NPC 주인이 국고에서 넣는다. 플레이어가 일하는 시설의 창고 물건은 점검(5분)마다 도시 창고로 보내고 나라가 사들인다.
   - 시험 세계에서 잰 값(팩 시작 시세, 임금 주기 하루): 농장 시간당 1.0 → 하루 임금 19(조정 990‰), 벌목장 2.67·광산 3.6 → 하루 임금 30(조정 위 끝 1500‰).
3. **노동 표의 화폐 칸 제약**: `labor_contracts`·`labor_rents`·`labor_postings`가 나라 화폐 코드(`cur:<ID>`)를 받지 않아, 나라 화폐 도시의 건물에서 계약·임대료·구인을 저장하면 DB 오류가 났다(통합 시험이 잡음). 원장 계정과 같은 형식으로 넓혔다.
4. **본체 숙박비**: 일꾼 숙박비는 쉬는 유닛의 유닛 지갑에서 걷는데, 사이보그 본체는 유닛 지갑이 없어 늘 "못 냄"(회복 불이익)이었다. 재산이 없는 유닛은 소유 주체 지갑에서 낸다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/factionIdentity/houseEntry.ts`, `houseEntry.test.ts` | 고정 NPC 나라의 규칙식 가입비는 0 |
| `apps/server/src/cyborg/service.ts`, `gateway.test.ts`, `cyborg.db.test.ts` | 나라마다 가입 조건 읽기(`startFees`), 조회에 `entryFee`·추천 빼기, 만들기 거절. 만들기 명령이 설정 값 한 벌을 맨 앞에서 읽는다 |
| `packages/shared/src/cyborgApi.ts` | `CreationFaction.entryFee` |
| `apps/game/src/start/FeeNationDialog.tsx`(새 파일), `placeSteps.tsx`, `StartScreen.tsx`, `start.css`, `apps/game/messages/{ko,en}.json` | "시작 불가" 표시와 경고 창 |
| `apps/server/src/npc/npcJobs.ts`·`npcJobValue.ts`(새 파일), `npcJobs.test.ts`·`npcJobs.db.test.ts`(새 파일) | NPC 일자리 판단(임금 상한·조정·게시 맞추기·보증금 채우기·창고 걷기), 임금 기준 값 |
| `apps/server/src/npc/economy.ts` | NPC 시설 목록·시세·금고 채우기·창고 걷기 |
| `apps/server/src/labor/service.ts`, `gateway.test.ts` | NPC 고용주용 구인 몫(`npcJobs`) |
| `apps/server/src/world/world.ts`, `apps/server/src/app.ts` | 연결(심장 박동 작업 "npc jobs", 임금 기준 값, 가입 조건 읽기) |
| `apps/server/src/db/laborSchema.ts`, `apps/server/drizzle/20261125145518_labor_asset_nation_money/` | 노동 표 화폐 형식 제약 넓힘(넓히기만 — 직전 판 앱 그대로 돈다) |
| `apps/server/src/labor/workerRest.ts`, `workerRest.test.ts` | 재산 없는 유닛의 숙박비는 소유 주체 지갑 |
| `e2e/first-login.spec.ts` | 가입비 나라 경고 창 |
| `docs/adr/2026-11-25-npc-facility-jobs.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- `CyborgService`·`LaborService`를 흉내 내는 시험은 `startFees`·`npcJobs`도 넣는다.
- NPC 몫·점검 주기를 설정 칸으로 옮기면 `npc/npcJobs.ts`의 상수 두 개(`NPC_JOB_MARGIN_PM`·`NPC_JOB_CHECK_MS`)를 지운다.

## 건드리지 말 것

- `cyborg/service.ts` `create`의 기다림은 맨 앞(가입 조건 읽기) 한 번뿐이어야 한다. 그 뒤 검사부터 커밋까지 기다림이 끼면 같은 사람의 두 번 만들기가 겹친다.
- `houseEntry.ts` `nationEntryTerms`의 고정 NPC 나라 0 처리: 빼면 시작 나라가 다시 가입비를 받는다.

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `89460cf4` + 이 변경): `pnpm check` 통과(시험 6,231개 통과·430개 건너뜀), `db:generate` 변경 없음.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 385파일 2,267개 통과(DB 시험 포함 — NPC 일자리 받기·임금 `npcJobs.db.test.ts`, 가입비 나라 시작 거절 `cyborg.db.test.ts`).
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/first-login.spec.ts` 12개 통과. 경고 창 사진(390·파스텔·한국어)을 눈으로 봤다. 다크·영어 경고 창 사진은 찍지 않았다(미실행).
- 구인 게시판 화면에서 NPC 일자리를 받는 것은 화면으로 보지 않았다(미실행). 서버 시험이 조회 → 받기 → 임금을 본다.
- **플레이어가 NPC 시설에서 일해 물건이 실제로 쌓이고 걷히는 것은 재지 않았다(미실행)**: 통합 시험 세계는 채집소 고리(오브젝트)가 없다. 임금·보증금·게시만 봤다.
- 임금은 기준 유닛으로 센다. 약한 유닛이 일하면 NPC 몫(20%)이 줄어든다.
- 맺은 계약의 임금은 그대로다. 시세가 내려도 그 계약을 끊지 않는다.
- 임금 주기는 하루다. 첫 임금은 맺을 때 먼저 받는다. 시험에서 본체 생활비는 한 시간에 1이 나갔다(하루 임금 19~30과 견줄 값 — 균형은 기획 몫).
- NPC 몫·점검 주기는 코드 상수다(임시).
- 가입 조건은 나라 값만 본다. 시작 도시가 따로 정한 도시 가입비는 보지 않는다.
- 고정이 아닌 NPC 나라의 규칙식 가입비는 그대로다.
- 사업장 표 등 다른 표에 같은 화폐 형식 제약이 있는지는 보지 않았다(Unknown).
- 기획에 없는 규칙이다(시작 나라 가입비 0, NPC 일자리 임금). 기획 세션에 전달이 필요하다.

## 사용자 결정 대기

- NPC 몫(지금 20%)과 점검 주기(5분)의 값, 설정 칸으로 옮길지.
- 시세가 내렸을 때 맺은 계약의 임금을 낮추거나 끊을지.
- 피로 구간 불이익(N23)을 채집·직무·이동에 실제로 걸지(앞 작업에서 넘어옴).
