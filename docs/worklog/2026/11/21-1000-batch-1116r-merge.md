# 2026-11-21 묶음 1116r 합치기 (가문 9 · 물류센터 2차) — 리셋 필요 없음

- 일시: 2026-11-21 10:00~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `21-0920-house-9`·`21-0925-haul-2`, 질문 2311~2317(`docs/questions/2026-11-16-house-9.md`)·2301~2306(`2026-11-16-haul-2.md`), ADR "바뀜" 절
  (`2026-11-07-ranking.md`·`2026-11-11-faction-identity.md`·`2026-10-31-combat-core.md`·`2026-11-16-logistics-center.md`)

## 한 일
- main 305ba3d(묶음 1116q) 위에 가지 둘을 차례로 `--no-ff`로 합쳤다. 두 가지 모두 바탕 0efec8a에서 일한 뒤 새 main 3d66465를 이미 들인 상태였다(1116q의 leak-hunt·npc-wage·
  시험 9개 맞춤·미러 D-578은 없음).
  1. `work/house-9`(cfe5dff): 랭킹 전투력·자산 지표(`ranking/worth.ts`·`worthSource.ts`, 새 표 `ranking_worth`, `battleBodies.basePower`), 연 경로 `strongest`·`wealthiest`,
     NPC 지배 가문장 금고 꺼내기·가문원 배당·건설 투자(`npc/rulingSpend.ts`·`rulingVault.ts`, `cityHouses.ts` `headOf`·`membersOf`), 군단장 분대 명령(sim `combat/orders.ts`
     `party`, `battle_order` `legion` + `party`, 화면 "휘하 n분대"), 지도자 [임시] 문구(2254). 충돌 셋(`content/core/manifest.json`·`packages/sim/src/version.ts`·`docs/WORKLOG.md`) —
     모두 판 번호·목차.
  2. `work/haul-2`(f6bdf2d): 물류 요금 나라 화폐(`logistics/haulMoney.ts`, `chargeService` `asset`·`keep`), `storage_move` out·`business_buy` `via`(`station.haulOut` → `carry`),
     계정 자동 맡기기(열 `user_settings.auto_haul`, `logistics/autoHaul.ts`, tRPC `facilities.autoHaul`·`setAutoHaul`, `AutoHaulSetting.tsx`), NPC 맡기기(`logistics/npcOutsource.ts`,
     `npcCarry.ts` `outsource` 고리), `user_settings` 표 정의를 `db/settingsSchema.ts`로. 충돌 둘(`packages/protocol/src/version.ts`·`docs/WORKLOG.md`).
- 두 가지끼리 겹친 곳(`db/schema.ts` — house-9는 다시 내보내기를 `export *` 한 줄로, haul-2는 `userSettings`를 옮김)은 자동으로 합쳐졌다. `facilities/service.ts`·`world.ts`·
  `market/worldInput.ts`는 haul-2만 바꿨다(house-9는 건드리지 않음). 메시지 ko·en 8,491키(겹침 없음, JSON 유효), paraglide 다시 만듦.
- **1116q와 겹침(손으로 본 곳)**:
  - **지갑**: house-9 `rulingVault.ts`는 가문장(국가 지도자 유닛)·가문원 지갑을 npc-wage와 같은 계정 꼴(`ownerAccount(유닛 주인, 화폐, unitPurseLocation(유닛))`)로 쓴다. 가문원
    주인은 돈을 넣는 그때의 유닛 주인(`world.units`)을 읽으므로, npc-wage가 도시 주인 바뀜(`beforeCityTransfer` → `pursePlacesOf` — 그 도시에 사는 유닛 지갑)·새 마을
    (`unitsOwnerChanged` → `movePurses`)에서 지갑을 새 주인 밑으로 옮긴 뒤와 어긋나지 않는다. 가문원이 죽으면 npc-wage `inheritPurse`가 배당받은 돈까지 상속한다. 배당받은
    돈은 그 휴먼의 생필품 값(npc-wage `livingDay`)으로 먼저 쓰인다 — 같은 지갑이라 두 동작이 모두 산다. 남은 틈: 국가 지도자 유닛(유닛 종류 7)은 2차맵 유닛이라 sim 세계
    `units`에 없어 npc-wage 지갑 옮기기·상속 대상이 아니다 — 지도자 지갑은 그 나라 소유 주체 밑에 머문다(지도자 주인은 바뀌지 않으므로 지금은 문제가 없다. 지도자가 사라지는
    규칙이 생기면 그 지갑도 함께 — house-9 기록 "함께 바꿔야 하는 파일"). 코드 바뀜 없음.
  - **거래소 `get` 누수(leak-hunt 규칙)**: 새로 합친 코드의 시세 읽기를 모두 찾아 보았다 — 고칠 곳 없음.
    - house-9 자산 평가(`ranking/worthSource.ts worldWorthSource`): 물건 시세는 `econ.registry.books()`(있는 호가창만 도는 `byId.values()`)에서, 환율은 `economy.fx.get`
      (서버 `market/fx.ts`의 보통 `Map` — `get`이 만들지 않는다, 만드는 것은 `ensure`), 시작 시세·묶음은 팩 표 `catalog.*.get`. 도시 거래소 표(`books.ts cityMap`)는 읽지 않는다.
    - haul-2 요금 화폐·적정가(`logistics/haulMoney.ts`): `currencyOf.get`·`economy.fx.get`(위와 같은 보통 `Map`)·`cities.get`뿐. `npcOutsource.ts`·`npcCarry.ts`·`autoHaul.ts`는
      거래소를 읽지 않는다(`buildingCenterOf`만).
    - house-9 `rulingVault.ts`·`rulingSpend.ts`: 원장만(거래소 없음).
  - `npc/economy.ts`: haul-2의 `haulOutsource` 칸·`createCarryBoard` 줄과 npc-wage의 `chargeLodgingFees` 옮김이 다른 자리라 자동으로 합쳐졌다(946줄). sim `simulator/economy.ts`·
    `humanPurse.ts`는 두 가지 모두 건드리지 않았다.
  - **1116q 시험 9개 맞춤**: 두 가지는 그 네 파일(`facilities.db.test.ts`·`npcSeed.db.test.ts`·`cityRelayout.db.test.ts`·`buildingEdit.db.test.ts`)을 건드리지 않아 main의 고친
    기대값이 그대로 남았다(Verified: `git diff 305ba3d HEAD` 그 파일들 바뀜 없음, DB 시험 통과).
- 최종 판:
  - 프로토콜 **55**(최소 **54**) — 두 줄기(house-9 88, haul-2 84)를 한 판으로. `BATTLE_SQUAD_PROTOCOL_VERSION`·`HAUL_OUT_PROTOCOL_VERSION` = 55. `version.ts` 55 설명은 두 줄기를
    목록으로, 낮춤 기준 "55부터 53판 이하 기기도". 판 박은 주석·ADR·질문의 줄기 판은 괄호로 남겼다(`battleOrder.ts`·`facilities.ts`·`business.ts`·`gateway.ts`·
    `liveBattleCommands.ts`·`e2e/live-battles.spec.ts`, ADR combat-core·logistics-center, 질문 misc-574·logistics). 판 숫자를 박은 시험은 없다(꼴 시험은 "현재 − 1").
  - 팩 **core@127**(house-9 158 → 127 — 설정 칸 셋 `house_npc_vault_take_pm`·`house_npc_spend_dividend_pm`·`house_npc_spend_invest_pm` + 랭킹 경로 `strongest`·`wealthiest`). haul-2는
    팩 그대로. `id-changes.json` 그대로(새 줄 없음). `tuning.json`·`ranking_paths.json`은 house-9만 바꿨다(3방향 = 한쪽만), `facilities.json`은 둘 다 안 바꿈. ADR ranking·
    faction-identity의 판 줄을 127로(줄기 판 괄호).
  - `SIM_VERSION` **65**(house-9 98 → 65 "묶음 1116r 합친 판, 줄기 house-9의 98"). 64 설명(1116q)은 그대로. 판을 박은 시험 없음(`legion3.test.ts`는 "60 이상").
  - 시뮬 출력 형식 22 그대로.
- 마이그레이션 갈래 셋(모두 prevIds c6f2df91·9afdc6b8 — 이름·내용 그대로): `20261116150202_logistics_auto_haul`(41cf0481, 열 더하기), `20261116151003_ranking_worth`(ae46b32c, 표
  더하기), main의 `20261120035817_content_overrides_exp_table`(269797c2). 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 셋**:
  41cf0481·ae46b32c·269797c2.

## 리셋 필요 여부: 필요 없음
- 마이그레이션 둘 다 더하기(열 `auto_haul` 기본 false, 표 `ranking_worth`)라 직전 판 앱이 그대로 돈다. 팩은 설정 칸·경로 더하기. SIM 바뀜은 군단 입력의 선택 칸(없으면 옛 꼴).
- 54판 기기는 그대로 붙는다(군단장 분대 명령·꺼내기/사기 `via`·`own`만 보내지 않음). 53판 기기는 새 앱을 받는다.
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **랭킹**: 연 경로 둘(전투력·자산)이 생기고, 다음 랭킹 집계(UTC 0시)부터 `ranking_worth`가 채워져 점수가 쌓인다. 경로 판·가문 판 줄에 "전투력 n · 자산 n". 집계 부하는
    NAS 규모에서 재지 않았다 — 서버 기록 `ranking snapshot`의 `ms`·`worthRows`를 본다. 무력 경로가 하나 늘어 지휘 계급(D-558)이 `strongest` 등급도 본다.
  - **NPC 독재 나라**: 다음 배당 차례부터 지배 가문 금고의 남은 몫 절반(500‰)을 가문장(국가 지도자) 지갑으로 꺼내고 그중 가문원 배당·국고 건설 투자를 낸다 — 가문 금고가
    줄고 국고·NPC 휴먼 지갑·지도자 지갑이 는다. 원장 거래 `npc_house_vault_take`·`npc_house_dividend`·`npc_house_invest`.
  - **전투**: 군단장이 [전투] 칸 "휘하 n분대" 탭에서 정원 안 남의 분대 하나에 명령(소유주 명령이 서 있으면 거절).
  - **물류센터**: 요금이 그 도시 주인 나라 화폐로 보이고 받는다(정해 둔 숫자는 그대로 그 화폐로 읽힘 — 질문 2304). **자동 맡기기는 계정 설정으로 옮겨 다시 켜야 한다**(기기 값은
    옮기지 않음, 계정 기본 끔). 경제 [꺼내기]에 운반 고르기. 운반꾼이 없는 NPC 거래소 운반이 같은 도시 물류센터(플레이어 것 포함)에 맡겨진다 — 그 물류센터 금고에 NPC 국고에서
    요금이 들어온다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`: 126 / 158 → **127**.
- `packages/sim/src/version.ts`: 64 설명(1116q) 그대로 + house-9 98 설명을 "65: (묶음 1116r 합친 판, 줄기 house-9의 98)"로, 상수 65.
- `packages/protocol/src/version.ts`: house-9를 합칠 때 55/54로 고쳐 두고, haul-2 합칠 때 55 설명을 두 줄기 목록으로, 최소 54.
- 판 숫자 주석·문서(위 "최종 판").
- 파일 크기: 넘은 파일 없음(`pnpm check` 크기 규칙 통과). 큰 파일: `facilities/service.ts` 989, `db/schema.ts` 974, `npc/economy.ts` 946.
- `docs/worklog/2026/11/21-0920-batch-1116q-merge.md` 끝에 "## 배포 (Verified)" 절(1116q CI 369·NAS 배포·nas-metrics, 조정 담당이 보낸 값)을 넣었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/WORKLOG.md`, `content/core/manifest.json`, `packages/sim/src/version.ts`, `packages/protocol/src/version.ts` | 합치기 충돌 풀기·판 번호(프로토콜 55/54, core@127, SIM 65) |
| `packages/protocol/src/battleOrder.ts`·`facilities.ts`·`business.ts` | 줄기 판 상수 → 55, 판 주석 |
| `apps/server/src/facilities/gateway.ts`, `apps/game/src/battle/liveBattleCommands.ts`, `e2e/live-battles.spec.ts` | 판 주석 |
| ADR 넷·질문 둘 | 판 번호 설명 55·127·65(줄기 판 괄호) |
| `docs/worklog/2026/11/21-0920-batch-1116q-merge.md` | 1116q 배포 결과 절 |
| `docs/worklog/2026/11/21-1000-batch-1116r-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 56, 팩 128, SIM 66, 시뮬 출력 형식 23. 다음 마이그레이션 `prevIds` = 41cf0481·ae46b32c·269797c2.
- **거래소를 읽기만 할 때는 `peekMarket`(또는 `has` 먼저)** — 서버 도시 표(`books.ts cityMap`)는 `get`이 거래소를 만든다. 환전 표(`economy.fx`)와 호가창 목록(`registry.books()`)은
  만들지 않는다.
- 국가 지도자 지갑(house-9)은 npc-wage 지갑 옮기기·상속 밖이다 — 지도자가 사라지거나 주인이 바뀌는 규칙을 더하면 그 지갑도 함께.
- `user_settings` 표 정의는 `db/settingsSchema.ts`(haul-2). `settingsSchema.ts`의 `updatedAt`을 `schema.ts`에서 가져오지 않는다(TDZ).
- **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO 그대로).
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 마이그레이션 `20261116150202_logistics_auto_haul`·`20261116151003_ranking_worth`, 팩 경로 ID `strongest`·`wealthiest`.
- 군단 입력 `party`가 없으면 옛 꼴(저장된 전투 입력·명령 없는 전투 지문).
- 줄기 기록의 "건드리지 말 것"(`npc/economy.ts`는 늘리지 말고 새 모듈로).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) — 두 가지 합친 뒤(17816fa + 목차) 한 번: 포맷·린트·타입·경계·크기·다국어(8,491키)·디자인 값(746쌍)·콘텐츠
  (core@127 285b0d62d4e3) 통과, 시험 파일 **807/807**, 시험 **5,946/5,946**.
- `pnpm check:content 305ba3d`: core@127 (285b0d62d4e3) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 305ba3d`: 통과. `pnpm settings:cells --check` 최신, `pnpm --filter @terra/server db:generate` No schema changes.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,505 B / 상한 131,416 B(두 줄기 각각 110,217·110,187 B).
- 화면 시험(빌드한 앱, 헤드리스, 잠금 안, 새 DB 두 번 — ① `ranking`·`faction-identity`·`government` ② `live-battles`·`economy`·`building-screen`):
  - **있는 그대로 돌린 판: 실패.** ① 7 통과·12 실패·20 못 돎, ② 22 통과·22 실패. **실패는 모두 새 main(3d66465, 1116q에 이미 든 것)의 디자인 값 바뀜 탓이고 이 묶음 탓이 아니다**:
    - `smallTapTargets`(누르는 곳 ≥ `--tap-size` 44px): 홈 대시보드 개편(6cec509 "전역 타이포그래피 개편", 2026-11-20)이 `--control-h-sm` 44 → 38px·`--control-h` 52 → 46px로 줄여
      작은 단추가 모두 38px — 세력·정부·경제·건물·전투 화면의 "뒤로"·"기부"·"취소" 등. 그 밖에 건너뛰기 링크 "본문으로 건너뛰기"/"Skip to content" 43px, 세력 화면 라디오 label 25px,
      인벤토리 탭 "All" 42px(영어). 이 묶음 두 줄기는 `tokens.css`·셸·인벤토리·세력 화면 라디오를 건드리지 않았다(`git diff 305ba3d HEAD -- apps/game/src/styles apps/game/src/inventory`
      바뀜 없음).
    - `economy.spec.ts` 시세 색(D-442) 2개: 파스텔 `--color-danger` #b8283f → #b81d38·`--color-success` #226b33 → #166534(같은 커밋들)인데 시험 기대값은 옛 값.
  - **확인용 판(커밋 안 함)**: 위 토큰 넷을 옛 값으로 잠시 되돌리고 시험 도우미에서 건너뛰기 링크·라디오만 빼고 다시 돌렸다 — ① `government` 9/9(위 토큰만 되돌린 판), `ranking`·
    `faction-identity` **30/30**, ② `live-battles` **10/10**, `building-screen` **7/7**, `economy` 23/27(남은 4개 = 영어 인벤토리 탭 "All" 42px, 새 main 글꼴 탓). 그래서 이 묶음이
    바꾼 화면(전투력 판 줄의 전투력·자산 칸, "휘하 n분대" 탭·legion 명령, 정부 판 [임시] 문구, 물류센터 고르기 4줄·화폐 코드·계정 자동 맡기기 스위치·경제 처음 칸, 건물 판 [관리])의
    단언은 모두 통과했고 390px 가로 넘침 단언도 통과했다. 되돌린 두 파일은 `git checkout`으로 원래대로 돌렸다.
  - 사진(확인용 판, 눈으로 봄): `live-battles-390-pastel-ko`(휘하 1분대·휘하 2분대 · 주인 명령 중 탭 줄바꿈 정상, 2순위 안내), `economy-haul-pick-pastel-ko-390`(물류센터 고르기 값 뒤
    화폐 코드 — 긴 값은 고르기 안에서 잘림, 넘침 없음), `ranking-path-pastel-ko-390`, `building-haul-service-390-dark-en` — 저장소 밖
    `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116r-shots/`.
  - **알림**: 새 main의 토큰 바뀜으로 화면 시험 다수(작은 누르는 곳 단언이 있는 spec 전부로 보임)가 main에서 실패 상태다(Assumed — 여섯 spec만 돌림). 토큰을 되돌릴지 시험
    문턱(`--tap-size`)·기대값을 고칠지는 디자인 결정이라 이 묶음에서 고치지 않았다(조정 담당·새 main 작업자 판단).

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. house-9 — 랭킹 집계 부하(NAS 규모 미측정), 지도자 지갑·가문 금고는 가문 판 자산 밖(2313), NPC 휴먼 전투력 같음(2314), 다시보기 명령 줄(2317).
  haul-2 — NPC 맡기기는 단위 시험만(실제 세계 미실행), 닿은 양 셈 [임시], pump 틱마다 물류센터 훑기 부하 미측정, NPC 물류센터 짓기 없음(2301).
- 합친 판에서 house-9 가문원 배당 → npc-wage 생필품 값 흐름을 함께 돌린 시험은 없다(서버 실제 세계 미실행 — 두 쪽 단위 시험만).
- 시뮬(econ16 등)은 다시 돌리지 않았다 — SIM 바뀜은 군단 입력 `party`뿐이라 시뮬 시나리오 결과가 바뀌지 않는다(시뮬레이터 `simulator/`·`npc/`·`cli/`에 전투 명령 입력을 넣는 곳이 없다 — 검색으로 확인, 실행은 안 함).
- 1116q 메모리 누수 고침이 운영에서 듣는지는 아직 Unknown(위 1116q 배포 절).

## 사용자 결정 대기
- 질문 2311~2317(가문 9), 2301~2306(물류센터 2차), 앞 묶음의 2291~2295·2251~2259·2261~2270·2271~2278·2281~2285, 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.

## 배포 (Verified)
- 조정 담당이 보낸 값(2026-11-21, 묶음 1116s 합치기 중에 받음).
- main a83d59e, CI 370: 이미지·NAS 배포 성공(2026-11-21 02:12 UTC 앱 다시 켬, 이미지 `sha-a83d59ed916e`). 세계는 새로 시작하지 않았다.
- 켠 지 34~63분 nas-metrics(run 44860233597): RSS 551 → 559.5MB(앞 절반 +0.65·뒤 절반 +0.05MB/분, 마지막 13분 그대로), heapUsed 97.6~111.8MB(바닥 상승 없음) — 1116q
  메모리 누수 고침이 운영에서 듣는 것을 확인했다(고치기 전 +0.68~1.05MB/분). 컨테이너 메모리 55%. 루프 p99 1.0~1.8ms, DB 실패 0(커밋 평균 94~117ms·최대 282~1,544ms,
  dbPending 0~81), npcPersistMs 165~201ms. 도시 50·건물 1,191·휴먼 3,451·유닛 4,469. 서버 경고·오류 0줄, 기기 오류 0.
- core@판·마이그레이션 적용 줄은 출력에서 밀려 직접 보지 못했다(Unknown).
