# 2026-11-16 묶음 1116j 합치기 (가문 5 · 좌표 이동 3 · 사업장 4차)

- 일시: 2026-11-16 12:00 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0930-house-5`·`16-1014-map-coords-3`·`16-1140-business-4`, 기획 답 1847·1848(D-569·D-212)·D-570(1845·1846, 1901~1908, 1783·1785·1788~1790·1822·1886·1887)·D-564(1641·1643), ADR `2026-11-11-faction-identity.md`·`2026-11-15-unloaded-second-maps.md`·`2026-11-15-business-ledger.md`의 "바뀜" 절, 질문 2011~2020(`docs/questions/2026-11-16-house-5.md`)·2021~2038(`docs/questions/2026-11-16-map-coords-3.md`)·2041~2057(`docs/questions/2026-11-16-business-4.md`)

## 한 일
- 통합 가지(main bb56c64 + 기획 미러 6ea0984(D-571)·e32ea4e(D-572) + 1116i 배포 기록 8c0ef83)에 줄기 셋을 차례로 `--no-ff`로 합쳤다.
  1. `work/house-5`(4a3f9a5, 바탕 406f299): 인큐베이터 휴먼 → 만든 사람 가문(1847), NPC 도시 가문(1848, 표 `npc_houses`·`npc_house_units`, 켤 때 멱등으로 세우고 채움), 가문 소속 도시 공고 이동·나라 가입비/지원금(D-570 1845·1846, `house_homes.pending_*`, `factions.house_entry_fee`). 정원사 스위치를 `npc/gardenerSwitch.ts`로 나눔.
  2. `work/map-coords-3`(d0b4bda, 바탕 2cc2edc): 띄운 2차맵 조우(1901), 실제 지형 조우 전투맵(1902), 강·비탈 감속(1903), 조우 AI 판단 회피·약탈·전투(1904), 설정 칸 `encounter_*` 12개(1905), 조우 뒤 다시 판단(1908).
  3. `work/business-4`(6e576b5, 바탕 a8fbaf1): 다음 임금 바닥(1783), 공방 일꾼 외주 수리·주인 시간당 요금(1785), 적자 → 한 주기 뒤 멈춤·자동 해고 없앰·임금 없으면 고용 막음(1788·1789), 지급준비율 주인 또는 대주주(1790), 보이는 NPC 운반꾼(1886), NPC 장부(1887), 적정가(1822). 장비 수리를 `facilities/equipmentRepair.ts`로 나눔.
- 최종 판: 프로토콜 **48**(최소 **47**) — 이번에 처음 오르는 판이라 house-5의 52·business-4의 54 설명을 48 하나로 묶었다(`home_announced`·`home_cancelled`, `no_shop_worker`·`service_closed`, unitIds 빈 목록, `service:equipment_repair`). 47판 연결에 낮춰 보내는 판 상수 둘: `HOUSE_HOME_NOTICE_PROTOCOL_VERSION` 52 → 48, `OUTSOURCE_PROTOCOL_VERSION` 54 → 48.
- 팩 **core@116**(main 115 위로 세 줄기 팩 변경을 함께 — house-5의 119·map-coords-3의 120·business-4의 121은 쓰지 않음). 세 줄기 모두 `id-changes.json`을 바꾸지 않아 `since`를 맞출 줄이 없다.
- `SIM_VERSION` **58**(main 57 위로 business-4 — 줄기의 63 설명을 58로. house-5·map-coords-3는 판정 그대로).
- 마이그레이션: house-5의 `20261115235802_npc_houses_home_notice` 하나. `prevIds` = main의 두 끝(`facility_gather_tier` 22a71ad3·`house_units` e39360c4)(Verified). 합친 뒤 `db:generate` = No schema changes(Verified).

## 손으로 푼 곳
- `docs/WORKLOG.md`(세 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(세 번): 115 / 119·120·121 → **116**.
- `packages/protocol/src/version.ts`(두 번): 47 설명은 main 그대로, 48 = "합친 판" 아래 가문 공고·사업장 4차 두 항목, 상수 48, 최소 47, 최소 판 설명 줄에 "48부터 46판 이하 기기도". 줄기의 "47~51·48~53 자리" 줄은 지움.
- `packages/sim/src/version.ts`: 57 설명 main 그대로, 58 = business-4 설명("57~62는 다른 줄기" 지움), 상수 58.
- 판 번호를 담은 코드·시험(충돌은 아니나 판을 바꿈): `packages/protocol/src/house.ts`·`house.test.ts`(52·51 → 48·47), `facilities.ts`·`business.ts` 주석, `apps/server/src/facilities/gateway.ts`·`gateway.test.ts`(54·53 → 48·47), `apps/server/src/factionIdentity/gateway.ts` 주석, `apps/game/src/map/business/RepairService.tsx` 주석.
- 판 번호 설명(내용 그대로): ADR 세 곳의 이번 "바뀜" 절, 질문 `2026-11-16-map-coords-3.md` 1905 답 줄, 줄기 기록 셋의 "함께 바꿔야 하는 파일"에 main 판 한 줄.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main bb56c64, 각 줄기 바탕)으로 다시 셈해 맞춰 봄: 기대 집합과 같음, main과 겹쳐 바뀐 ID 0, 칸 734개(Verified, 저장소 밖 스크립트).
- `apps/game/messages/{ko,en}.json`: 충돌 없이 자동 합쳐짐. 첫 `pnpm check`가 린트에서 새 키를 못 찾아 멈춤(paraglide 생성 파일 오래됨 — 1116i와 같음) → `paraglide-js compile` 뒤 둘째 실행 통과.
- **파일 크기**(`wc -l`, 모두 1,000줄 이하): `db/schema.ts` 998, `world/world.ts` 997, `packages/sim/src/index.ts` 997, `app.ts` 994, `npc/runtime.ts` 993, `labor/service.ts` 989, `travel/service.ts` 986, `facilities/service.ts` 961.

## 리셋 필요 여부: 필요 없음
- 마이그레이션은 표 둘·열 셋 더하기뿐이고 직전 판 앱은 새 표·열을 모른 채 돈다. 다만 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **NPC 가문이 켤 때 생긴다**: 첫 켬에 NPC 도시마다 가문 하나(`npc_houses`)를 세우고 휴먼 모두를 소속 줄로 넣는다(NAS 휴먼 약 2,258명 → 소속 줄 같은 수를 쓰기 대기열이 여러 줄 insert로). 멱등이라 다시 켜도 늘지 않는다. 첫 켬 서버 기록 `npc society started`의 `cityHouses`로 수를 본다.
  - **적자 사업장 멈춤 규칙**: 보증금·금고로 못 덮는 임금은 한 주기만 적자로 넣고 그 주기 끝에 멈춘다. 새 임금형 고용은 금고에 한 주기 임금이 없으면 막힌다(`insufficient_funds`·`employer_insufficient_funds`). 이미 멈춘 사업장·이미 맺은 계약은 그대로. 보증금 0 → 자동 해고 대신 일시 중지.
  - **조우 기본은 플레이어 회피**(`encounter_player_policy` 0, 질문 2021): 전쟁 중 플레이어끼리도 저절로 싸우지 않는다. NPC끼리·NPC 대 플레이어는 판단(전쟁 상대 전력 비 ≥ 0.8이면 전투, 짐이 있고 ≥ 1.5면 약탈). 지금 세계에 NPC 나라의 봇 아닌 전투 유닛이 거의 없어 실제 조우는 드물다(Assumed, 줄기 기록).
  - **NPC 장부 원장 거래 부하 주의**: NPC 시설 산출마다 원장 거래 3개(매출·재료비·정산)가 는다. NAS 부하는 재지 않았다(Unknown). 크면 설정 칸 `business_npc_books` 0으로 끈다. 배포 뒤 1분 지표 `econNpcSales`·DB 커밋 시간을 본다.
- 47판 기기는 그대로 붙는다(공고는 `home_set`, 외주 코드는 `unit_busy`·`cannot_repair`로 낮춤). 46판 이하는 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/protocol/src/version.ts`, `packages/sim/src/version.ts` | 합치기 충돌 풀기(위) |
| `packages/protocol/src/house.ts`·`house.test.ts`·`facilities.ts`·`business.ts`, `apps/server/src/facilities/gateway.ts`·`gateway.test.ts`, `apps/server/src/factionIdentity/gateway.ts`, `apps/game/src/map/business/RepairService.tsx` | 프로토콜 판 48·47 |
| `docs/adr/2026-11-11-faction-identity.md`·`2026-11-15-business-ledger.md`·`2026-11-15-unloaded-second-maps.md`, `docs/questions/2026-11-16-map-coords-3.md`, 줄기 기록 셋 | 판 번호 설명 48·116·58 |
| `e2e/labor.spec.ts`, `e2e/helpers/wsCommands.ts` | 화면 시험을 사업장 4차 규칙(빈 금고 고용 막기)에 맞춤(아래 "화면 시험") |
| `docs/worklog/2026/11/16-1200-batch-1116j-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 49, 팩 117, SIM 59. 다음 마이그레이션의 `prevIds`는 `npc_houses_home_notice`(31deac81).
- 파일 크기가 1,000줄에 붙었다(위 목록). 새 일은 다른 모듈로.
- 줄기 기록의 "함께 바꿔야 하는 파일"(플레이어 행동 설정이 생기면 `clashDecide.ts` `player` 분기, 가문 이동 정책 화면 등)을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 첫 실행 린트(paraglide 오래됨) → 다시 만든 뒤 둘째 실행 통과: 포맷·린트·타입·경계·크기·다국어(8,017키)·디자인 값·콘텐츠(core@116) 통과, 시험 파일 757/757, 시험 5,693/5,693.
- `pnpm check:content bb56c64`: core@116 (00bf4697da8f) 단계 1·2·4a·4b 통과.
- `pnpm check:docs bb56c64`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,072 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- 통합 판(빌드한 앱, 헤드리스, 잠금 안)에서 세 번에 나눠 돌림(고용하는 spec — recruit·labor — 는 서로 다른 실행). 사진: 저장소 밖 `scratchpad/1116j-shots/`.
  - Verified A faction-identity·government·recruit: 40/40 통과(7.9분).
  - B building-screen·facilities·economy: 33 통과·4 실패(12.9분) — 실패 넷은 모두 economy "배치·사진" 1440px 전체 사진(`page.screenshot` Target crashed / Unable to capture screenshot).
  - C labor·play-map·seamless: 30 통과·1 건너뜀·4 실패(11.9분) — 실패 넷은 모두 labor.
- **labor 실패 = 시험이 옛 규칙을 봄(앱 회귀 아님)**: 시험이 일반 건물(`place_building`)의 빈 금고로 임금형을 맺고 "한 주기 임금만 적자"를 기대했다. business-4(D-570 1789)부터 금고에 한 주기 임금이 없으면 고용을 막고, 일반 건물은 사업장이 아니라 금고를 채울 수 없다(`business_invest` → `not_business`). business-4 줄기는 labor spec을 돌리지 않았다(줄기 기록 "미실행"). → 시험 건물을 야적장(stockpile, 개발 재료로 짓고 다 지음 — 사업장)으로 바꾸고, 임금형 전에 금고에 16(한 주기), player가 구인을 받기 전에 24를 `business_invest`로 넣음. `sendCommands`가 `business_result`도 기다리게 함. Verified 다시 돌려 labor 4/4 통과(29.5초).
- **economy 1440px 전체 사진 실패 = 환경(Assumed)**: 같은 기계의 디스크가 거의 찼다(`/` 남음 193MB — 지난 묶음 사진 폴더를 지워 약 0.8GB로). 지운 뒤 economy만 다시: 390px 사진·실제 거래소 등 21 통과, 1440px 넷은 거래소 목록 화면 전체 사진(4320 × 약 34,000화소 비트맵)에서 "Unable to capture screenshot"로 다시 실패(두 번). 같은 시각 다른 줄기(exchange-2, 이 묶음 코드 없음)도 1440px 전체 사진이 production·market에서 빠졌다(사진 폴더에 없음). 이 묶음은 거래소 목록 화면을 바꾸지 않았고(`apps/game` 바뀜은 시설 카드·건물 판·가문·한눈 정보·항구), 390px 같은 화면 높이는 앞 묶음 사진과 같다(1170 × 39,321 ≈ 39,513). 1440px 거래소 화면은 이번에 눈으로 보지 못했다(미검증).
- 합: spec 아홉 가운데 여덟은 모두 통과(labor는 시험 고친 뒤 4/4). economy는 1440px 전체 사진 넷만 실패(환경, 위), 나머지 21 통과.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. house — 가문 이동 정책(`house_entry_fee`) 화면·명령 없음(2018), 공고 처리할 일 없음(2020). map-coords — 실제 월드에서 조우 → 전투 → 다시 판단을 끝까지 돈 시험 없음, 강·비탈 수치 [임시](2031·2032). business — NPC 운반꾼 실제 2차맵 걷기 눈으로 안 봄, NPC 장부 부하 안 잼, 경제 화면 외주 줄·배 주문 적정가 줄 사진 없음.
- 세 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 2011~2020(가문 5) — 추천대로 [임시].
- 질문 2021~2038(좌표 이동 3, **2021 플레이어 기본 회피**) — 추천대로 [임시].
- 질문 2041~2057(사업장 4차) — 추천대로 [임시].
