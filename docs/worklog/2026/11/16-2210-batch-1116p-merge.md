# 2026-11-16 묶음 1116p 합치기 (가문 8 · 기타 D-574 · 기획 미러 D-577 · 물류센터 · 1116o 고침) — 리셋 필요 없음

- 일시: 2026-11-16 22:10~ (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-2100-house-8`·`16-2045-misc-574`·`16-2200-logistics`·`16-2210-fixes-1116o`, 기획 미러 b7c5ed2(D-577), 기획 D-574·D-576(가문 8), D-574 1·4·5·8번과 기획 대조 1116n(기타), D-576 2213(물류센터 — 새 ADR `2026-11-16-logistics-center.md`), 기획 대조 2237·2242·D-577(1116o 고침), ADR "바뀜" 절(`2026-11-15-business-ledger.md`·`2026-11-14-second-map-build.md`·`2026-11-11-faction-identity.md`·`2026-11-15-shipyard-harbor.md`·`2026-10-31-combat-core.md`·`2026-11-16-exchange-buildings.md`·`2026-11-15-unloaded-second-maps.md`·`2026-11-11-city-building-layout.md`), 질문 2251~2259(`docs/questions/2026-11-16-house-8.md`)·2261~2270(`2026-11-16-misc-574.md`)·2271~2278(`2026-11-16-logistics.md`)·2281~2285(`2026-11-16-fixes-1116o.md`)

## 한 일
- main 7b34039(묶음 1116o) 위에 가지 다섯을 차례로 `--no-ff`로 합쳤다(넷째 logistics·다섯째 fixes-1116o는 조정 담당이 합치는 중에 더 보냈다 — 미러 뒤).
  1. `work/house-8`(ca833f0, 바탕 78bc437): 도시 짓기 정책(`facilities/landRule.ts` 까닭 `house_policy`, WebSocket `house_build_policy`, 정부 판 `HouseBuildPolicy.tsx`), 가입비 도시 몫·나라 몫 따로(`chargeHouseEntry`), 정부 판 체제·이끄는 방식(`leaderRuleOf`), 가문세(`factionIdentity/houseTax.ts` — 배당·임금형 임금에서)·기부 `house_donate`·꺼내기 `house_vault_take`·해산 때 가문장 지갑·금고 장부, NPC 지배 가문 금고(`npc/rulingVault.ts`, sim 고리 `rulingVaultPaid`), NPC 가문 점수에 도시 산출·시설 몫(`ranking/unitScores.ts`).
  2. `work/misc-574`(2c3ebce, 바탕 78bc437): 어선 개인 낚시(`gather/boatCrew.ts`), 명령 순위(sim `combat/orders.ts`), 물자 거래소 이용료 요율(`service:exchange_fee`, `market/fxFee.ts exchangeFeeOf`, `FxFeeService.tsx` 카드 하나로), 환전 이용료 아래 끝, 조우 접속 = 유닛 소유주·유닛마다 판단(`engagedUnits`), 개인 창고 크기에 좌표 유닛(`market/lockers.ts`), NPC 거래소 거래 직무 자리 값(`labor/deskRent.ts`), 배 상하역 운반꾼 기다림(`boats/cargo.ts`, `boat_result.waiting`), NPC 건물 수 상한 바닥 1(sim `npc/build.ts buildingCapOf`).
  3. `work/mirror-d577`(430f48f, 바탕 7b34039, 문서만): 기획 미러 b7c5ed2(D-577 — 독립은 가문 단위, 알박기 귀속·독립 고르는 때) 동기화. 충돌 없이 합쳐졌다. 49 설정 칸 미러는 바뀌지 않았다(`pnpm settings:cells --check` 최신).
  4. `work/logistics`(f791b3b, 바탕 7b34039): 물류센터(운반 대행 사업장) — 팩 시설 `logistics_center`·칸 `logistics: true`·설정 칸 둘(`business_haul_unit_g`·`business_haul_unit_cells`), `logistics/haulService.ts`(고를 수 있는 곳·요금·적정가), `gather/station.ts carry`·`porter.ts pick`의 `via`(건물 ID | `"auto"`), 배 내리기·싣기 `via`(`boats/cargo.ts`·`service.ts`·`gateway.ts`), `business_price` item `service:haul`, 화면 경제 운반 고르기·건물 판 `HaulService.tsx`·설정 자동 맡기기.
  5. `work/fixes-1116o`(3e0293c, 바탕 7b34039): 처리할 일 [기다림]을 계정에 저장(WebSocket `labor_wait`, `labor/pauseWait.ts`·`pausedInbox.ts`, 열 `labor_contracts.paused_waited_due_ms`, 기기 `inbox/folded.ts` 지움), 이름 없는 1인 가문 자리표시 정체성·[이름 정하기](`ruins/claimHouse.ts nameUnnamedHouses`, `IdentityCard.tsx`), D-577 가문 단위 독립(`houseIndependence.ts independenceOpen` — 알박기 도시가 하나라도 있으면), 짓는 중 귀속/독립 바꾸기(`facility_claim`, `facilities/claimChoice.ts`, `economy/ClaimChoiceParts.tsx`, tRPC `facilities.overview` 시설 줄 `landClaim`), 건축 시트 경고 한 줄.
- **house-8 × fixes-1116o**: `factionIdentity/houseIndependence.ts`·`app.ts`(fixes는 한 줄 안에 `pool` 칸 — 999줄 그대로)·메시지는 자동으로 합쳐졌다(겹친 키 없음). 손으로 푼 곳은 ADR `2026-11-11-faction-identity.md`(같은 자리에 붙은 "바뀜" 절 둘 — house-8 → fixes-1116o 차례로 모두 둠)뿐. logistics와는 `facilities/views.ts`(`haulCenters` + `claimOf`·`claimLockedOf` 칸)·`packages/protocol/src/facilities.ts`(판 상수 둘)·`index.ts`(내보내기 둘)를 두 쪽 다 둠.
- **misc-574 × logistics 겹침(손으로)**: `boats/cargo.ts`는 misc-574 꼴(내리기·싣기를 `unloadNow`·`loadNow`로 나누고 `orWait`로 기다림 줄)을 바탕으로 logistics의 `via` 넘기기와 `carried()` 코드 낮춤(`insufficient_funds` 그대로, `service_closed` → `unavailable`, 나머지 → `no_carrier`)을 넣었다. 기다리는 줄은 같은 `via`로 다시 해 본다. 차례 = via 건물 ID면 그 물류센터 일꾼만(`station.ts`) → 아니면 내 운반꾼 → 없으면 자동 맡기기(via `auto`) → 그래도 없으면 `no_carrier` → 배는 기다림 줄(`orWait`, 요금 모자람·받지 않음은 줄을 세우지 않는다), 거래소 넣기는 예전 규칙. 고른 물류센터에 나를 일꾼이 없을 때(`no_shop_worker` → `no_carrier`)도 배는 줄을 서서 그 물류센터 일꾼을 기다린다. `boats/service.ts`는 두 쪽(`cargoWaiting` + `via`)을 다 둠. `gather/station.ts`·`porter.ts`·`boats/gateway.ts`는 자동으로 합쳐졌다(misc-574가 station·porter를 건드리지 않았고, gateway는 다른 줄 — 기다림 낮춤과 `via` 넘기기가 모두 산다).
- 1116o와 겹친 곳: npc-econ-6이 바꾼 NPC 경제 입력(`npc/economy.ts` `NpcEconomyInput`·`market/worldInput.ts`·`facilities/world.ts`)에 misc-574가 같은 목록 끝에 칸을 더해(물자 거래소 이용료 `exchangeFeeBp`·`goodsExchange`) 부딪쳤다. 두 쪽 칸을 모두 두었다(main → 줄기 차례). misc-574의 체결 이용료 고리(`startServerEconomy` fee.of — 그 건물 요율, 없으면 설정 칸 적정 요율)는 npc-econ-6의 운반·판매가 고리와 다른 자리라 자동으로 합쳐졌고 두 동작이 모두 산다(서버 타입·시험 통과). `market/npcHaul.ts`·sim 사업장 계수표는 misc-574가 건드리지 않았다(계수표는 같은 파일의 다른 칸 — 자동 합침).
- 최종 판:
  - 프로토콜 **54**(최소 **53**) — house-8의 64(최소 63)·misc-574의 66(최소 65)·logistics의 70(최소 69)·fixes-1116o의 72(최소 71)를 54 "합친 판"으로. 판 상수: `LOGISTICS_PROTOCOL_VERSION` 70 → 54, `LABOR_WAIT_PROTOCOL_VERSION`·`FACILITY_CLAIM_PROTOCOL_VERSION` 72 → 54(53판 기기는 `labor_wait`·`facility_claim`을 보내지 않는다 — `session.ts`가 막음)(53판 기기는 `via`를 보내지 않는다 — 서버는 내 운반꾼으로), `HOUSE_POLICY_PROTOCOL_VERSION` 64 → 54(53판 연결의 `house_donate`·`house_vault_take`·`house_tax`·`house_build_policy`는 `session.ts`가 `invalid_message`로 막는다), `BOAT_WAIT_PROTOCOL_VERSION` 66 → 54(53판 연결은 기다림 대신 예전 `no_carrier`, 51판 아래는 `unavailable`). `service:exchange_fee`·`service:haul`은 53판 기기가 보내지 않는다(꼴 그대로).
  - 팩 **core@122**(main 121 위, house-8 134·misc-574 136·logistics 140 → 122, fixes-1116o는 팩 그대로). 네 줄기 모두 `id-changes.json`을 건드리지 않았다.
  - `SIM_VERSION` **62**(misc-574의 76 → 62) — 명령 순위(소유주 파티 명령이 선 파티는 군단 명령을 건너뜀)와 건물 수 상한 바닥 1. house-8은 SIM을 올리지 않았다(새 고리·선택 칸은 서버만). logistics의 80(사업장 계수표 칸 둘 `haulUnitG`·`haulUnitCells`, 서버만 읽음)도 62 설명에 넣었다. `world/legion3.test.ts`는 main 꼴("SIM 60 이상") 그대로 두었다.
- 마이그레이션 둘(형제 갈래):
  - `20261116112742_house_tax_build_policy`(9afdc6b8, `prevIds` = 1116n 끝 둘 58f17376·2d4ed532) — 표 `house_policies` + 열 `city_policies.house_build`. 1116o의 `land_claim_choice`(95bd9580)와 형제가 된다. 이름·내용 그대로(AGENTS.md 6장 갈래 규칙).
  - `20261116124625_labor_pause_wait`(c6f2df91, `prevIds` = 2d4ed532·58f17376·95bd9580, fixes-1116o) — 열 `labor_contracts.paused_waited_due_ms` 더하기. `house_tax_build_policy`와 형제(서로를 모른다). 이름·내용 그대로.
  - 합친 뒤 `db:generate` = No schema changes(Verified). **다음 마이그레이션이 `prevIds`에 적을 끝 둘**: `house_tax_build_policy`(9afdc6b8)·`labor_pause_wait`(c6f2df91)(Verified: 스냅숏 전체에서 다른 `prevIds`에 없는 id — `land_claim_choice` 95bd9580은 c6f2df91이 가리킨다).

## 리셋 필요 여부: 필요 없음
- 마이그레이션 둘은 표·열 더하기뿐이라 직전 판 앱이 그대로 돈다(새 표·열은 비어 시작 — 가문세율 0, 짓기 정책 = 기본값 허용). misc-574·logistics는 DB 표가 없다(기다림 줄·운반 중 짐은 메모리, 요율·운반 요금은 값 표 새 줄). 팩은 시설·칸 더하기뿐(지운 ID 없음). 줄기 기록 셋 다 "필요 없음"이고 합쳐도 겹치는 저장 상태가 없다.
- 배포 뒤 운영 세계에서 바로 느껴질 바뀜:
  - **독재 NPC 나라의 도시 남은 이익 국고 몫이 지배 가문 금고로 가고, 배당 차례 뒤 성향 몫(300~900‰)만 국고로 돌아온다** — NPC 국고 유입이 그만큼 준다(NAS 하루 양 Unknown — 원장 `npc_house_vault_return`).
  - NPC 가문 점수에 도시 산출·시설 몫이 더해져 랭킹이 다음 집계(하루)부터 움직인다.
  - 가문 화면: 금고에 가문세율·[기부]·[꺼내기](가문장)·장부. 정부 판: 체제·이끄는 방식 덧말, 가문 도시엔 [다른 가문 짓기] 칸. 같은 나라 다른 가문 도시에 짓기는 그 도시 정책(기본 허용). 봉신 가문원이 자기 가문 도시에 못 짓던 것이 풀린다.
  - 가문 이동 가입비가 도시 몫·나라 몫으로 둘 다 매겨질 수 있다(공고 칸 = 합).
  - **장비 없는 배는 탄 유닛 모두가 낚는다**(수확·피로 늘어남, NPC 어선도). 배 상하역이 "운반꾼 없음"으로 실패하지 않고 줄을 서 기다린다(다시 켜면 줄은 사라지고 물건은 제자리).
  - 조우에서 판단 유닛마다 따로 걸고 건 유닛만 공격 편으로 든다(전투 수가 늘 수 있다). 가문 주민 유닛은 가문장 접속을 본다.
  - 2차맵에 유닛이 없던 주인의 거래소 개인 창고가 0이 아니다. NPC 도시 거래소 거래 직무 자리를 적정가로 빌릴 수 있다. 물자 거래소 주인이 이용료 요율(0~10%)을 정한다.
  - **건축 목록에 물류센터(교통 단계)가 생긴다.** 경제 화면 [거래소로]에 운반 고르기(그 도시에 물류센터가 있을 때), 건물 판 [관리] 운반 대행 요금, 설정 "물류센터 자동 맡기기"(기본 끔, 기기 저장). 공방 외주 수리 오류 문구 셋이 공방·물류센터 모두에 맞게 넓어졌다.
  - 처리할 일 `labor_paused` [기다림]이 기기가 아니라 계정에 남는다(다른 기기에서도 접힘 — 옛 기기 저장소 접힘은 읽지 않으니 한 번 다시 보인다). 이름 없던 1인 가문은 첫 알박기 틱에 "가문 #ID" 자리표시 이름을 받고 세력 화면에 [이름 정하기]. 알박기 도시가 하나라도 있는 봉신 가문은 [독립 선언]을 할 수 있다(가문 전체가 떨어진다). 짓는 중 알박기 정부의 귀속/독립을 경제 화면 시설 카드에서 바꿀 수 있고, 건축 시트에 "완성 때 발효" 경고.
  - NPC 건물 수 상한이 0이던 도시가 다시 짓는다. 진행 중 전투 다시 계산은 SIM 62 규칙.
- 53판 기기는 그대로 붙는다(새 명령·`via`·`labor_wait`·`facility_claim`은 보내지 않고, 배 기다림은 예전 코드로 받는다). 52판 이하는 새 앱을 받는다.

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`(세 번): 121 / 134 / 136 / 140 → **122**.
- `apps/game/messages/{ko,en}.json`(세 번): house-8 — 1116o 키 일곱(`harbor_repair_*`·`inbox_action_*`)을 두고 `fid_house_vault_hint`는 house-8 문구(기부·가문세·꺼내기)로. misc-574·logistics — 끝자리 키를 두 쪽 다 둠(logistics는 키 기준 3방향으로 다시 셈: HEAD 위에 줄기 바뀜을 얹은 기대값과 같음, 함께 바꾼 키 0). JSON 유효, 겹친 키 없음, ko·en 키 같음, paraglide 다시 만듦.
- `apps/server/src/facilities/world.ts`(npc-econ-6 `materialsHourly` + misc-574 `goodsExchange`), `apps/server/src/market/worldInput.ts`(`cityCell`·`unitPriceOf` + `exchangeFeeBp`), `apps/server/src/npc/economy.ts`(`NpcEconomyInput`의 `cityCell` + `exchangeFeeBp` 선언): 두 쪽 칸을 모두 둠.
- `apps/server/src/world/legion3.test.ts`: main 쪽("SIM 60 이상", `toBeGreaterThanOrEqual(60)`) — 줄기의 `toBe(76)`은 버림.
- logistics와: `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`(misc-574 선택 칸 넷 + logistics 칸 둘), `packages/shared/src/businessBooks.ts`(`EXCHANGE_FEE_ITEM`·`FxFeeView` 별칭 + `HAUL_SERVICE_ITEM`·`HaulServiceView`), `packages/protocol/src/business.ts`(item `service:exchange_fee` + `service:haul`), `apps/server/src/business/books.ts`·`facilities/appSource.ts`(장부 칸 `exchangeFee` + `haulService`), `business/commands.test.ts`(`goodsExchange` + `haulShop`), `apps/game/src/map/building/BuildingPanel.tsx`(`ExchangeFeeService` + `HaulService` 카드): 두 쪽을 모두 둠. `boats/cargo.ts`·`service.ts`는 위 "겹침".
- ADR `2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`: 같은 자리에 붙은 "바뀜" 절 둘(1116o npc-econ-6 → misc-574)을 차례로 모두 둠.
- `packages/protocol/src/version.ts`(두 번): 53 설명 main 그대로, 54 = "합친 판" 아래 가문 8·기타 D-574 항목(53판 기기 표현), 상수 54, 최소 53, 최소 판 설명 줄에 "54부터 52판 이하 기기도". 줄기 쪽 64·66 설명, "53~65 자리" 줄, "64부터 62판…"·"66부터 64판…"은 지움.
- `packages/sim/src/version.ts`: misc-574의 76 설명을 62 "묶음 1116p 합친 판, 줄기 76"으로(logistics 80 항목을 같은 판 아래에), "61~75 자리" 줄은 지움, 상수 62.
- `content/core/tuning.json`: house-8·misc-574는 충돌 없이 자동 합쳐짐, logistics는 같은 자리 충돌 → 칸 ID 기준으로 HEAD 위에 줄기 바뀜을 얹어 다시 씀(저장소 밖 스크립트). 그 뒤 3방향(main 7b34039, 줄기 바탕 78bc437·78bc437·7b34039와 끝 셋)으로 다시 셈: 기대 집합과 같음(칸 784개, main 774), main(78bc437 이후 — npc-econ-6 칸 셋)과 줄기가 함께 바꾼 칸 0(Verified, 저장소 밖 스크립트). 더한 칸: house-8 `house_city_build_default`·`house_tax_max_pm`·`house_npc_vault_return_min_pm`·`house_npc_vault_return_max_pm`, misc-574 `exchange_fee_min_bp`·`exchange_fee_max_bp`·`exchange_fx_fee_min_bp`·`exchange_npc_desk_rent_pm`, logistics `business_haul_unit_g`·`business_haul_unit_cells`.
- 판 번호 설명(내용 그대로, 줄기 판은 괄호로 남김): house-8 — `packages/protocol/src/housePolicy.ts`(+ 시험)·`house.ts`, `apps/server/src/session.ts`·`factionIdentity/gateway.ts`·`housePolicy.ts`, `apps/game/src/faction/identity/HouseVaultBlock.tsx`·`houseCommands.ts`, `apps/game/src/government/HouseBuildPolicy.tsx`, ADR `2026-11-11-faction-identity.md`의 이번 "판" 줄. misc-574 — `packages/protocol/src/boats.ts`·`business.ts`, `apps/server/src/boats/gateway.ts`, `apps/game/src/map/boats/boatCommands.ts`·`map/business/FxFeeService.tsx`, ADR `2026-10-31-combat-core.md`·`2026-11-15-shipyard-harbor.md`·`2026-11-16-exchange-buildings.md`의 이번 줄, 질문 `2026-11-16-misc-574.md`·`exchange-2.md`·`legion-3.md`·`boats-5.md`의 이번 줄. logistics — `packages/protocol/src/facilities.ts`(`LOGISTICS_PROTOCOL_VERSION`·주석 — 없는 `legacyHaulCode`를 가리키던 주석을 서버 `boats/cargo.ts`로 고침)·`boats.ts`·`business.ts`, `apps/server/src/facilities/gateway.ts`, `apps/game/src/map/business/HaulService.tsx`, 새 ADR `2026-11-16-logistics-center.md`의 "판" 줄, 질문 `boats-5.md` 2213 줄. 줄기 작업 기록은 줄기 판 그대로 둔다(이 기록이 대응을 적는다).
- fixes-1116o 판 번호(줄기 72 → 54): `packages/protocol/src/labor.ts`·`facilities.ts`, `apps/server/src/session.ts`·`facilities/claimChoice.ts`·`facilities/gateway.ts`(+ 시험)·`labor/gateway.ts`(+ 시험)·`labor/pauseWait.ts`, `apps/game/src/economy/ClaimChoiceParts.tsx`·`laborCommands.ts`·`inbox/liveActions.ts`·`map/construction/BuildSheet.tsx`, ADR `2026-11-14-second-map-build.md`·`2026-11-15-business-ledger.md`, 질문 `fixes-1116o`·`alpak-2`·`npc-econ-6`의 이번 줄.
- 파일 크기: 넘은 파일 없음. 큰 파일: `world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts`·`engine/secondMapEngine.ts` 999, `labor/service.ts`·`npc/runtime.ts`·`shared/battleReport.ts` 995, `travel/service.ts` 986, `world/persist/tables.ts` 985, `facilities/service.ts` 984.
- `docs/worklog/2026/11/16-2040-batch-1116o-merge.md` 끝에 "## 배포 (Verified)" 절(1116o CI 361·NAS 배포·nas-metrics 결과, 조정 담당이 보낸 값)을 넣었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`·`tuning.json`, `docs/WORKLOG.md`, `apps/server/src/facilities/world.ts`·`views.ts`·`market/worldInput.ts`·`npc/economy.ts`·`world/legion3.test.ts`·`boats/cargo.ts`·`boats/service.ts`·`business/books.ts`·`business/commands.test.ts`·`facilities/appSource.ts`, `apps/game/src/map/building/BuildingPanel.tsx`, `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`, `packages/shared/src/businessBooks.ts`, `packages/protocol/src/business.ts`·`facilities.ts`·`index.ts`, ADR `2026-11-11-faction-identity.md`, `apps/game/messages/{ko,en}.json`, ADR 둘(shipyard-harbor·exchange-buildings), `packages/protocol/src/version.ts`, `packages/sim/src/version.ts` | 합치기 충돌 풀기(위) |
| 프로토콜 판을 담은 코드·시험(위 목록) | 프로토콜 54·53, SIM 62 |
| ADR 일곱·질문 일곱 | 판 번호 설명 54·122·62 |
| `e2e/economy.spec.ts` | NPC 거래소 거래 직무 자리 칸 기대를 2204 나(적정 자리 값)로 — misc-574 규칙 바뀜을 따라감 |
| `docs/worklog/2026/11/16-2040-batch-1116o-merge.md` | 1116o 배포 결과 절 |
| `docs/worklog/2026/11/16-2210-batch-1116p-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 판: 프로토콜 55, 팩 123, SIM 63. 다음 마이그레이션 `prevIds` = 위 끝 둘(9afdc6b8·c6f2df91).
- **다음 배포에서 옛 `exchange_lockers` 표를 지운다**(1116n TODO 그대로 — 마이그레이션 + `db/marketSchema.ts` 정의 + `world/persist/tables.ts` 줄).
- 999줄 파일(`world/world.ts`·`app.ts`·`sim/index.ts`·`db/schema.ts`·`engine/secondMapEngine.ts`)과 995줄 파일(`labor/service.ts`·`npc/runtime.ts`·`battleReport.ts`)에 더하는 일은 다른 모듈로.
- 운반 대기가 세 곳에 있다(npc-econ-6 `npc/npcCarry.ts`, misc-574 `boats/cargo.ts`, 1116n `gather/station.ts`) — 한 곳으로 모을 때 같이 본다(misc-574 기록). 거래소 넣기는 아직 기다리지 않는다(물류센터 자동 맡기기 뒤에도 운반꾼이 없으면 예전 코드).
- 줄기 기록의 "함께 바꿔야 하는 파일"을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"을 그대로 따른다(올라간 마이그레이션 `house_tax_build_policy`, 금고 계정 앞머리 `vault:house:npc:`, 군단 명령 건너뛰기 조건 `party.order?.legion !== false`, `lockerUnitsOf`의 coords, NPC 자리 값은 주인 줄이 없을 때만, 물류센터를 창고 단계로 바꾸지 않음, `world/persist/tables.ts`의 `laborContracts` 열 목록에 `paused_waited_due_ms`를 넣지 않음).

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안) — 다섯 가지를 모두 합친 뒤(fixes-1116o 합치기 커밋 위) 한 번: 포맷·린트·타입·경계·크기·다국어(8,271키)·디자인 값(738쌍)·콘텐츠(core@122 245b66a7a5c8) 통과, 시험 파일 **791/791**, 시험 **5,874/5,874**.
  - 그 앞: 셋(house-8·misc-574·mirror) 합친 뒤 한 번 통과(786/786 파일, 5,860/5,860). logistics를 합친 뒤 한 번은 포맷 단계에서 실패 — `packages/shared/src/businessBooks.ts`에서 두 쪽 블록을 이을 때 주석 여는 `/**`가 빠짐(공통 앞줄이 HEAD 쪽에 들어감). 고쳐 logistics 합치기 커밋에 넣었다(`format:check`·`typecheck` 통과). 그 다음 전체 실행은 fixes-1116o를 받으려고 도중에 멈췄다.
- `pnpm check:content 7b34039`: core@122 (245b66a7a5c8) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 7b34039`: 통과. `pnpm check:wiki`(40항목)·`pnpm wiki:index --check`·`pnpm settings:cells --check` 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,228 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험 (Verified, 빌드한 앱, 헤드리스, 잠금 안)
- 다섯 가지를 모두 합친 빌드로 넷을 차례로(묶음마다 새 DB):
  - `inbox` + `build-mode`(한 DB): **26/26 통과**(6.4분).
  - `building-screen` + `boats` + `economy`(한 DB): **35/36** — 실패 1은 `economy.spec.ts` "실제 거래소" 시험이 NPC 도시 거래소의 거래 직무 자리 칸을 "이 거래소 주인이 거래 직무 자리를 내지 않았습니다"로 보던 것(받은 값 "자리 값 시간당 2"). misc-574가 기획 대조 2204 나로 NPC 거래소도 적정 자리 값으로 자리를 내게 바꿨는데(`labor/deskRent.ts`), 그 줄기는 `economy` spec을 돌리지 않았다. 코드가 아니라 시험의 옛 기대라 시험을 "자리 값 시간당 …"을 보고 "내지 않음"이 아닌지로 고쳤다(`e2e/economy.spec.ts`). `economy`만 새 DB로 다시: **27/27 통과**(3.8분).
  - `faction-identity`(새 DB): **21/21 통과**(58초).
  - `government`(새 DB): **9/9 통과**(8.0분).
- 사진을 눈으로 봤다(시험이 390px 가로 넘침을 본다): 건축 시트 정부 건물 귀속/독립 라디오와 "완성 때 발효" 경고(pastel ko), 세력 화면 "내 가문" 금고 칸 — 가문세율·[기부]·[꺼내기]·장부(pastel ko, 긴 화면), 정부 판 지도자 칸 "민주주의: 소속 가문들의 투표로 정함"(pastel ko), 건물 판 [관리] 운반 대행 요금 칸(pastel ko — 적정가 1,250,000 = 인건비·수수료·세금, 나를 일꾼 3명), 경제 [거래소로] 운반 고르기 "Logistics center #9003 · 1,250,000"(dark en), 처리할 일(dark en). 물자 거래소 이용료 칸은 여전히 그 [관리]를 여는 spec이 없어 사진이 없다.
- 대표 사진: 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/1116p-shots/` — `build-gov-house-390`, `build-claim-390`, `fid-house-home-notice-pastel-ko-390`, `government-dialog-390-pastel-ko`, `building-haul-service-390-pastel-ko`, `economy-haul-pick-dark-en-390`, `settings-auto-haul-dark-en-390`, `inbox-dark-en-390`, `boats-repair-fair-390-dark`, `market-exchange-note`. 나머지 사진·`test-results`는 지웠다(디스크).
- 미실행: `labor`·`ranking`·`dev` spec.

## 미검증·TODO·알려진 문제
- **TODO: 옛 `exchange_lockers` 표는 다음 배포에서 지운다**(1116n에서 이어짐).
- 줄기 TODO는 줄기 기록에 있다. house-8 — NPC 국고 흐름 NAS 하루 양 Unknown, 가문세 표는 세계 준비 뒤 5초 안에 붙음(Assumed), 정부 판 [다른 가문 짓기] 누르는 화면 시험 없음(DB 시험만), 해산 때 세계 미준비면 금고에 남음. misc-574 — 실제 월드에서 배 기다림 → 운반꾼 생김 → 나름을 끝까지 본 시험 없음, 조우에서 걸지 않은 유닛이 하던 길을 가는지 끝까지 본 시험 없음, 가문장이 바뀐 직후 1분은 옛 가문장 기준(Assumed), 플레이어 가문 주체 거래소도 NPC 자리 값을 받음(Assumed), 거래창에 물자 이용료 요율 안 보임(질문 2268), `waiting` 옛 판 낮춤 시험 없음. logistics — 물류센터 일꾼이 짐을 지고 걷는 모습은 단위 시험만, 배 `via`는 서버 길만(배 판 고르기 화면 없음 — 2275, 배 `via` 단위 시험 없음), 싣기 두 자리면 요금 두 번(2276). 합친 뒤 "배 기다림 줄 + via" 조합(고른 물류센터 일꾼을 기다렸다가 다시 해 봄)은 시험이 없다(미실행 — 코드만 읽음). fixes-1116o — 짓는 중 고르기 칸·[이름 정하기]·`labor_paused` [기다림]은 화면 시험이 그 상태를 만들지 않아 사진 없음(단위·DB 시험만), 고르기 바꾸기는 경제 화면 시설 카드에만(2283), TODO 2236 NPC 휴먼 임금·2243 NPC 알박기(별도 줄기 제안).
- 합친 세계(NPC 지배 가문 금고 + 1116o NPC 운반꾼 기다림 + 배 기다림)를 NAS에서 오래 돌려 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 2251~2259(가문 8, 추천대로 [임시]), 2261~2270(기타 D-574, 추천안), 2271~2278(물류센터), 2281~2285(1116o 고침), 1116o의 2231~2244, 1116n의 2201~2207·2211~2215·2221~2224.
