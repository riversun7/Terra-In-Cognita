# 2026-11-16 묶음 1116l 합치기 (조우 4 · 가문 6)

- 일시: 2026-11-16 15:40 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-1453-encounter-4`·`16-1510-house-6`, 기획 D-570·D-573(미러 ae93bcc)·D-5039·D-5040, ADR "바뀜" 절(`2026-11-15-unloaded-second-maps.md` "바뀜 (encounter-4)"·`2026-11-11-faction-identity.md` "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)"), 질문 2131~2140(`docs/questions/2026-11-16-encounter-4.md`)·2141~2150(`docs/questions/2026-11-16-house-6.md`)

## 한 일
- main 161f1aa(= 0e6c394 묶음 1116k + 기획 미러 ae93bcc + 1116k 배포 기록) 위에 줄기 둘을 차례로 `--no-ff`로 합쳤다(둘 다 바탕 4ef0cfc).
  1. `work/encounter-4`(cef50ba): 조우 판단 = AI 작전(새 `@terra/shared/aiTactics`, 표 `unit_tactics`, `unit_tactics` 메시지, 유닛 화면 [AI 작전]), 채집 줄 다시 잇기, 창고·거점 복귀, 조우 전투맵 건물 부서짐, D-573 2022 빠져나가기.
  2. `work/house-6`(31f39a9): 지도자 = 지배 가문의 장(2012), NPC 가문 랭킹(2014), 도시 정책 표 `city_policies`·`house_entry_policy` 명령(2018), NPC 도시 등급별 가문 여럿(D-573 2011), 가입비는 가문이 한꺼번에(D-573 2017).
- 최종 판:
  - 프로토콜 **50**(최소 **49**) — encounter-4의 50, house-6의 51 설명을 50 "합친 판" 하나로 묶었다. 낮춰 보내는 판 상수: `HOUSE_ENTRY_POLICY_PROTOCOL_VERSION` 51 → 50, `legacyHouseMemberCode`의 문턱 51 → 50(`entry_fee_short` → 49판 연결에 `busy`). `UNIT_TACTICS_PROTOCOL_VERSION`은 50 그대로. 시험(`packages/protocol/src/house.test.ts`)도 50·49로 맞췄다.
  - 팩 **core@118**(main 117 위로 두 줄기 팩 변경을 함께 — 119는 쓰지 않음). 두 줄기 모두 `id-changes.json`을 건드리지 않았다(이번에 처음 오르는 줄 없음).
  - `SIM_VERSION` **59** 그대로(두 줄기 모두 판정 코드를 바꾸지 않음).
- 마이그레이션 둘(형제, main 끝 넷 위):
  - `20261116051806_unit_tactics`(7f14a324, `prevIds` = `npc_houses_home_notice` 31deac81) — **이름을 바꿨다**: 줄기의 `20261116051806_purple_lockjaw`는 아직 어느 DB에도 적용되지 않은 새 마이그레이션이라 폴더 이름을 내용대로 고쳤다(Drizzle은 폴더 이름으로 적용 여부를 본다 — 스냅숏 안에는 이름 참조가 없다, Verified: grep). 줄기 기록 `16-1453-encounter-4.md`의 이름도 같이 고쳤다.
  - `20261116052201_city_policies_npc_houses`(bd0d640e, `prevIds` = 31deac81) — 이름 그대로.
  - 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 다섯**: `boat_gear_price`(43d61ca8)·`exchange_lockers`(8315ae4c)·`nation_renown`(98fc86ba)·`unit_tactics`(7f14a324)·`city_policies_npc_houses`(bd0d640e).

## `npc_houses_city_id_key` 고유 제약 지우기 판단 — 그대로 둔다
- 직전 판(main 0e6c394) 서버가 `npc_houses`를 만지는 곳은 `npc/cityHouses.ts` 둘뿐이다(Verified: `git grep npc_houses 0e6c394 -- apps/server/src`): 켤 때 `select id, city_id, name, founded_at_ms from npc_houses order by id`, 새 가문은 월드 쓰기 대기열 `upsert("npcHouses", …)`. 쓰기 대기열의 upsert는 표 정의의 키(`world/persist/tables.ts` `npcHouses.key = ["id"]`)로 `on conflict ("id")`를 만든다(`world/persist/writer.ts`). **`ON CONFLICT (city_id)`는 어디에도 없다**.
- 직전 판으로 되돌렸을 때: 도시에 가문이 여럿이어도 켤 때 읽기는 그대로 되고 `byCity`(도시 → 가문 하나)는 id 차례로 마지막 가문을 든다. 그 도시는 이미 `byCity`에 있어 새 가문을 만들지 않고, 가문원 줄(`npc_house_units`)은 가문 id로 가문을 찾으므로(`houses` 맵은 모든 가문) 소속도 그대로 읽힌다. 오류 없이 도는 쪽으로 낮아질 뿐이다(Assumed: 코드 읽기, 되돌린 판을 실제로 띄우지는 않았다).
- 그래서 "제약을 두고 새 색인을 더하는" 두 단계로 나누지 않았다. 고유 제약이 있으면 이번 판 코드가 한 도시에 둘째 가문을 넣지 못해 기능 자체가 서지 않는다.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 표 둘 더하기(`unit_tactics`·`city_policies`)와 `npc_houses.city_id` 고유 제약 풀기 + 색인뿐이고, 직전 판 앱은 위처럼 그대로 돈다. 세계를 지우지 않아도 되지만 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **플레이어 유닛이 전쟁 상대를 먼저 칠 수 있게 된다**: 작전을 저장한 적이 없는 플레이어 유닛은 균형 프리셋(교전 6, 퇴각 30%)으로 판단한다 — 설정 칸 `encounter_player_policy` 새 기본 2(작전대로). 그래서 조우에서 전쟁 상대(전력 비 문턱 이상)를 60% 확률로 먼저 건다. 주인이 오프라인이거나 유닛이 직무 중이면 먼저 걸지 않는다(D-144). 옛 "늘 회피"로 돌리려면 설정 칸 0(질문 2132).
  - **NPC 도시 가문이 켤 때 나뉜다**: 첫 맞추기가 도시 등급마다 목표 가문 수(설정 칸 `house_npc_city_houses_l1`~`l6`, [임시] 1·1·2·3·4·5)에 모자란 가문을 세우고 가장 큰 가문의 늦게 든 사람부터 옮긴다(가문장·시장은 빼고, 멱등). 등급 1 도시(시험 도시 대부분)는 그대로 가문 하나. NAS 도시 등급 분포는 재지 않았다(Unknown).
  - 지배 가문·가문장은 저장하지 않고 읽을 때 정한다(기존 지도자·시장 기록은 그대로). 가문 이동 정책 칸이 비면 플레이어 나라 0, NPC 나라는 상업 성향 규칙식.
  - 메모리의 채집 줄·조우 멈춤은 배포로 끊긴다(다시 켠 뒤 조우부터 새 규칙).
- 49판 기기는 그대로 붙는다(새 메시지는 보내지 않고, `entry_fee_short`는 `busy`로 받는다). 48판 이하는 새 앱을 받는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(두 번): 117 / 118·119 → **118**.
- `packages/protocol/src/version.ts`(두 번): 49 설명 main 그대로, 50 = "합친 판" 아래 AI 작전·가문 이동 정책 두 항목, 상수 50, 최소 49, 최소 판 설명 줄에 "49부터 47판 이하 기기도, 50부터 48판 이하 기기도". 줄기의 "49 자리"·"49·50 자리" 줄은 지움.
- `apps/game/messages/{ko,en}.json`(두 번씩): 끝에 붙인 키 묶음끼리(main 거래소 2 → encounter-4 `tactics_*` → house-6). JSON 유효, 겹친 키 없음(8,129키).
- `apps/server/src/gather/service.ts`: encounter-4가 `Action` 꼴·새 줄 만들기를 `gather/action.ts`(`freshAction`)로 옮겼고 main(배 4)은 같은 꼴의 `yieldCarryPm`을 일꾼마다 `yieldCarry: Map`으로 바꿨다 → encounter-4 쪽(옮긴 것)을 받고 `action.ts`의 칸을 `yieldCarry`(새 줄 = `new Map()`)로 고침.
- `docs/questions/2026-11-16-house-5.md` 2015·2016 답 줄: house-6 쪽(기획 답, 2143 예외 표시)을 받음.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(바탕 4ef0cfc, main 0e6c394, 두 줄기)으로 다시 셈: 기대 집합과 같음(칸 765개, main 757), 두 쪽이 함께 바꾼 칸 0(Verified, 저장소 밖 스크립트).
- 판 번호를 담은 코드·주석(충돌은 아니나 판을 바꿈): `packages/protocol/src/house.ts`·`house.test.ts`, `apps/server/src/factionIdentity/gateway.ts`, `apps/game/src/faction/identity/houseCommands.ts`·`government/HouseEntryPolicy.tsx`.
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): ADR `2026-11-11-faction-identity.md` 이번 "바뀜" 절 두 줄, 질문 `2026-11-16-house-5.md` 2018 답 줄.
- **파일 크기**: `apps/server/src/app.ts`가 main 997 + 두 줄기 4줄로 1,001줄 → 같은 모듈 import 둘(`nationEdit/emblems.ts`)을 한 줄로, 빈 줄 하나 지움 → 999. `packages/sim/src/index.ts` 1,000줄(크기 검사는 끝 줄바꿈 뒤까지 세어 1,001) → 빈 줄 하나 지움 → 999. 그 밖 큰 파일: `db/schema.ts` 998, `npc/runtime.ts` 997, `world/persist/tables.ts` 970, `gather/service.ts` 955.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/protocol/src/version.ts`, `apps/game/messages/{ko,en}.json`, `apps/server/src/gather/service.ts`·`action.ts`, `docs/questions/2026-11-16-house-5.md` | 합치기 충돌 풀기(위) |
| `apps/server/drizzle/20261116051806_unit_tactics/`(이름 바꿈), `docs/worklog/2026/11/16-1453-encounter-4.md` | 마이그레이션 이름을 내용대로 |
| 프로토콜 판을 담은 코드·시험(위 목록) | 프로토콜 50·49 |
| `apps/server/src/app.ts`, `packages/sim/src/index.ts` | 1,000줄 안으로 |
| `apps/server/src/world/legion3.test.ts` | 판 번호 시험을 프로토콜 50에 맞춤 |
| `e2e/units.spec.ts` | 유닛 화면 칸 여덟(1116k [전투] 칸) |
| ADR 하나·질문 하나 | 판 번호 설명 50·118 |
| `docs/worklog/2026/11/16-1540-batch-1116l-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 51, 팩 119, SIM 60. 다음 마이그레이션의 `prevIds`는 위 다섯 끝.
- `app.ts`·`sim/index.ts`가 999줄이다(검사는 1,000까지 — 끝 줄바꿈을 한 줄로 센다). 새 일은 다른 모듈로.
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) 한 번: 포맷·린트·타입·경계·크기·다국어(8,129키)·디자인 값·콘텐츠(core@118 042a5e4a3431) 통과, 시험 파일 765/766, 시험 5,768/5,769. 실패 하나 = `apps/server/src/world/legion3.test.ts` "판 번호·목록"이 프로토콜 49·최소 48을 그대로 적어 둠(1116k 시험) → 실시간 전투 명령 판 49는 그대로 보고 지금 판은 `≥ 49`, 최소 = 지금 판 − 1로 고쳐 그 파일 10/10 통과(oxlint `--deny-warnings` 통과). 그 한 파일만 바뀌어 전체는 다시 돌리지 않았다.
- 그 전 작업 중(잠금 안): 포맷·타입 통과, `check:size`에서 `app.ts`·`sim/index.ts` 1,001 → 위처럼 999로.
- `pnpm check:content 0e6c394`: core@118 (042a5e4a3431) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 0e6c394`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,170 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- 일곱 spec 한 번에(units·government·faction-identity·ranking·play-map·seamless·gather-station, 한 DB, 32.0분): 92 통과·3 실패·1 건너뜀(play-map 좌표 유닛 — 그 2차맵이 이미 떠 있으면 건너뜀, 시험 규칙).
  - `ranking` "세력 화면 세력 순위 칸…": 작은 누르는 곳 = 가문 도시 칸의 봉신·독립 라디오(322×25). 한 DB에서 faction-identity가 먼저 돌아 player를 가문장으로 남기므로(`ensureHouse`) 세력 화면에 가문 도시 고르기가 보인다 — 시험 사이 상태. 두 줄기 모두 그 화면·시험을 건드리지 않았다. **새 DB로 ranking만 다시: 9/9 통과**.
  - `units` "보유 유닛 0"(사이보그 판): government 시험이 player로 구인 카드를 고용해 유닛이 하나 생긴 뒤라 1 — 시험 사이 상태. 새 DB에서 통과.
  - `units` "유닛이 없으면 빈 안내…": 칸 수 7 기대 → 8. 묶음 1116k(legion-3)가 유닛 화면에 [전투] 칸을 더했는데 이 시험은 1116k에서 돌지 않았다 → 시험을 칸 여덟·←→ 차례(포로 → 융합 → 전투 → 목록)로 고침(앱 회귀 아님). **새 DB로 units 다시: 15/15 통과**(AI 작전 시험 포함).
- 합: 일곱 spec 모두 앱 회귀 없음. 대표 사진(눈 확인, 가로 넘침 없음): 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116l-shots/` — `unit-tactics-390-{pastel-ko,dark-en}`, `government-entry-390-{pastel,dark}-ko`(가문 이동 정책 칸), `ranking-house-{pastel-ko-390,dark-en-1440}`, `npc-house-peek-390-pastel-ko`, `leader-sheet-390-dark-ko`, `gather-station-390-pastel-ko`, `play-map-planet-390-dark-en`. 나머지 사진·`test-results`는 지웠다(디스크).

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. encounter-4 — 걷기 빠르기는 마지막 이동 때 잰 값(2136), 조우 전투맵 건물을 일부러 치지 않음(2135), 먼 2차맵 창고 도착 확인 약 3분(2138). house-6 — 정부 판 [정하기]·[비우기]를 화면에서 누르는 시험 없음(e2e player는 도시를 가진 가문이 아니다), 가문 이동 공고 처리할 일은 다음 줄기.
- 직전 판으로 되돌려 띄워 보지는 않았다(제약 판단은 코드 읽기).
- 두 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 2131~2140(조우 4, 추천안으로 만듦 — 특히 2132 저장 없는 플레이어 유닛 = 균형), 2141~2150(가문 6, 추천대로 [임시]).
