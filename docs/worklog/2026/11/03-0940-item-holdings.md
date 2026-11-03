# 보유 물건(아이템 인스턴스) 층: 표·얻는 때 굴림·입기·전투 닳기·수리·탄약 보충 고리·소모품 쓰기·물약·요리 쿨·자동 물약 고르기·썩기·프로토콜 6

- 일시: 2026-11-03 09:40 ~ 13:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-item-holdings.md`(제안), 대조 `docs/research/2026-11-03-old-item-holdings.md`, 질문 `docs/questions/2026-11-03-item-holdings.md`(320~331), 기획 D-496·D-497·D-501·D-509·D-510·D-5031·49 N49(미러 `80272e5`·`662b63f`·`f530fbd`), 가지 `work/holdings`(main `f530fbd` 합침)

## 한 일
- 옛 프로젝트(AntiGravt01 `0ea5299`)의 `user_items`·`user_equipments`·`ItemRollEngine`·`ItemUseEngine`·`BattleResult.processDurability`·수리 라우트 둘·`spoilageCron`·옛 문서 신선도 장을 줄 번호와 함께 대조했다. 조율자가 기획에 물은 285·286·288·289는 기획 답(49 N49)으로, 탄약 보충·물약 쿨(D-509)과 요리 쿨·물약 고르기(D-510)는 사용자 답으로 받았고, 그 밖 엇갈린 것 12개를 질문 320~331로 적었다.
- 판정(`@terra/sim` `items/holding.ts`): 보유 모양(장비 하나하나·신선도 묶음·쌓이는 소모품·원장 물자), 얻는 때 굴림(자리 ‰·점수 D-5006), 전투 닳기(확률·양, 난수 두 번), 입을 수 있나(0이면 못 입음), 수리 재료 양(옛 식), 탄약 보충(D-509: 최대 ‰ 감소·파괴 문턱), 자동 물약(D-510: 문턱 아래·가장 덜 넘치는 물약), 신선도(숙성 ms·보존 배율·썩는 시각·사슬·꺼진 대상 버림), 효과 교체(D-501). 수리 감소는 인공장기 `repairOrgan`에서 `repairDurable`을 꺼내 같이 쓴다(인공장기 값 그대로).
- 서버(`apps/server/src/holdings/`): 메모리 표 + 쓰기 대기열(표 `holdings`·`unitEffects`·`unitCooldowns`), 부팅 읽기, 서비스(얻기·입기·벗기·쓰기·물약 30초·요리 5분 쿨·전투 닳기·탄약 소모·탄약 보충·수리·썩기·효과/쿨 정리·자동 사용 후보·자동 물약 고르기), 월드 잇기(전투 결과 apply와 같은 동기 처리, 1분 타이머), 설정(실효 콘텐츠·설정 칸·사이보그 1차 스탯), tRPC `holdings.list`, WebSocket 게이트웨이(프로토콜 6).
- DB: 표 `item_holdings`·`unit_effects`·`unit_cooldowns`(마이그레이션 `20261103035624_item_holdings`, 더하기만. 같은 가지에서 처음 만든 `20261103001228_item_holdings`는 올리기 전이라 지우고 다시 만들었다).
- 팩 `core@32`: 설정 칸 `n49_wear_chance` 250‰·`n49_wear_loss_chance` 150‰·`d509_ammo_refill_loss` 50‰ [임시]·`d509_potion_cooldown` 30,000ms·`d510_food_cooldown` 300,000ms·`d510_potion_hp_threshold` 400‰ [임시] 더함, `d496_wear_battle`·`d496_wear_loss` 코드 N49. 여덟 칸 다 계수표 칸(TUNING_KEYS), 닳기 넷·물약·요리 쿨은 반영 범위 live.
- 프로토콜 5 → 6(최소 4 → 5): `item_equip`·`item_unequip`·`item_use`·`dev_grant_item` → `item_result`(실패 코드에 `cooldown` + `readyAt`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/items/holding.ts`·`.test.ts` | 보유 판정 한 벌(서버·뒤에 시뮬이 같이 쓴다) |
| `packages/sim/src/society/cyborgUpkeep.ts` | `repairDurable`(인공장기·장비 공용 수리 감소)을 꺼냄, `repairOrgan`은 그 위에 비용 |
| `packages/sim/src/society/coefficients.ts`·`tuningCyborg.ts`·`index.ts` | 계수표 `durability`에 닳기·탄약 보충 칸, 새 묶음 `consumables`(물약·요리 쿨·물약 문턱), TUNING_KEYS, 내보내기 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 넷 더함·코드 N49, 판 32 |
| `apps/server/src/db/holdingsSchema.ts`·`schema.ts`·`drizzle/20261103035624_item_holdings/` | 표 셋(schema.ts는 1,000줄 상한 때문에 다시 내보내기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 셋·쓰는 차례 |
| `apps/server/src/holdings/*` | 서비스·상태·규칙·게이트웨이·조회·월드 잇기·설정·시험 자료·시험 |
| `apps/server/src/world/world.ts` | 부팅 읽기, 서비스 만들기, 전투 apply에서 닳기, 끌 때 타이머 |
| `apps/server/src/world/secondMap.ts` | `unitInfo`에 유닛 종류 코드(칸 배치) |
| `apps/server/src/cyborg/service.ts`·`gateway.test.ts` | `userOfUnit`(본체 유닛 → 사용자, 쓰는 유닛 1차 스탯) |
| `apps/server/src/app.ts`·`session.ts` | 월드 설정·게이트웨이·조회, item 메시지 넘기기(6판 연결만) |
| `apps/server/src/trpc/holdings.ts`·`router.ts`·`context.ts`·`createContext.ts`(+ 시험 맥락 셋) | 조회 `holdings.list` |
| `apps/server/src/tuning/scope.ts` | 닳기 칸 넷·물약·요리 쿨 live |
| `packages/protocol/src/items.ts`·`messages.ts`·`index.ts`·`version.ts`·`items.test.ts`·`cyborg.test.ts` | 메시지 넷 + 결과, 판 6(최소 5), 왕복·모양 시험, 판 시험 고침 |
| `apps/game/src/map/mapFeed.ts` | 2차맵 흐름이 `item_result`를 받지 않고 넘긴다(모든 서버 메시지를 다루는 never 검사) |
| `packages/shared/src/holdings.ts`·`package.json` | 조회 응답 모양 `@terra/shared/holdings`(물건·효과·쿨) |
| `docs/adr/2026-11-03-item-holdings.md`, `docs/research/2026-11-03-old-item-holdings.md`, `docs/questions/2026-11-03-item-holdings.md`, `docs/PLAN.md`(13장 51, 14장 줄) | 기록 |

## 함께 바꿔야 하는 파일
- 프로토콜 판을 다시 올리는 줄기는 `MIN_SUPPORTED_PROTOCOL_VERSION`도 같이 본다(지금 6·5).
- 보유 칸에 새 열을 더하면 `holdingsSchema.ts` + `tables.ts` 열 목록 + `state.ts` `holdingRow`·`loadHoldings`를 함께.
- 닳기·보충·쿨 칸을 바꾸면 `coefficients.ts` 시험 값 = 팩 값, `tuningCyborg.ts`, `tuning/scope.ts`.
- 쿨 종류를 더하면 DB 검사(`unit_cooldowns_kind`)·`COOLDOWN_KINDS`를 함께(새 마이그레이션).

## 건드리지 말 것
- 이 가지가 main에 들어간 뒤에는 마이그레이션 `20261103035624_item_holdings`를 고치지 않는다(새로 더한다).
- 보유 칸 `location` 뜻은 원장 `ledger_accounts.location`과 같다(음수 = −유닛 [임시]). 한쪽만 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- 시험(Verified, 실행): sim `holding.test.ts`·tuning·society, 프로토콜 `items.test.ts`·`cyborg.test.ts`, 서버 `holdings/*`(서비스 18개·게이트웨이 4개·DB 3개: 얻기·입기·쓰기 저장과 다시 켜기, 72시간 뒤 썩은 생선, 물약 쿨이 다시 켜도 이어짐, 전투 닳기 99·95가 다시 켜도 한 번만)·tuning. 전체 검사(Verified, main `f530fbd` 위): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 386·시험 3,251), `pnpm check:docs f530fbd`, `pnpm check:content f530fbd`(4b 호환 포함, core@32), `pnpm docs:index --check`.
- 시뮬 출력: 시뮬 규칙 코드는 새 계수표 칸(`durability.wear*`·`ammoRefillLossPm`·`consumables.*`)을 읽지 않는다(Verified: 코드 찾기). 팩 판·해시 줄만 바뀐다고 본다(Assumed, war16·stub16·econ16을 돌려 비교하지 않음 — 미실행) → `SIM_VERSION` 그대로.
- 첫 화면 JS 크기(Verified, `pnpm build` 뒤 `pnpm check:bundle`): 105,585 B(gzip 9단계, 파일 8개) / 상한 131,416 B — 통과. 프로토콜 메시지 넷이 첫 화면 묶음에 든다.
- 화면 없음: 사이보그 화면 인벤토리·장비 칸, 쓰기·확인 창(D-501)·쿨 표시는 다음 줄기. e2e 미실행(화면을 바꾸지 않음).
- 다음 줄기(ADR 6절·결과): 전투 판정 탄약·물약(SIM_VERSION, 같은 쿨 표), 전투 시작 자료에 입은 물건·버프, 285 소급 명령, 수리·보충 시설과 명령·재료 차감, 보존 배수(322), 소켓(329), 거래소 입출고(포장 D-289).

## 사용자 결정 대기
- 없음(요리 쿨·물약 고르기는 D-510으로 답 받음). 유닛마다 물약 문턱(AI 작전 슬라이더 D-5039)은 그 화면이 생길 때.
- 질문 320~331(기획에 보냄).
