# 사이보그 유닛 융합(D-470)과 유전자 조각(D-478·D-481): 같은 유닛이 사이보그가 됨, 사망 조각·유전자 환생, 유닛 화면 [융합] 칸, 프로토콜 9

- 일시: 2026-11-07 13:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-cyborg-fusion-genes.md`, 질문 370~378 `docs/questions/2026-11-07-fusion-genes.md`, 기획 D-470·D-478·D-481·D-469·D-507·D-515·49 N46·N47, 가지 `work/fusion-genes`

## 한 일
- **옛 규칙 대조(D-507, AntiGravt01 main `0ea5299` 읽기만)**: 융합 `terra-server/repositories/CharacterRepository.js:512~610` craftCyborg(휴먼 + 안드로이드 둘 다 지움, 금화 5,000·티타늄 50·마이크로칩 20, STR·DEX·AGI = ⌊안드로이드 0.7 + 휴먼 0.3⌋, VIT·INT·WIS = ⌊휴먼 0.7 + 안드로이드 0.3⌋, × 1 + (5~15)/100 반올림, 레벨 1), 건물 `routes/building/building_production_routes.js:494~535`(고급 연구소·사이보그 공장). 사망 조각 `terra-server/game/LifeEngine.js:163~222`(그 종 `GENE_FRAG_{종}` 1개). 환생 `routes/character/character_routes.js:930~1068`(수명 끝 + 신앙도 100 + 종교 시설, 조각 max(1, ⌈레벨 ÷ 10⌉), 조각마다 무작위 +1, 레벨 1·수명 다시·K 리롤·환생 +1).
- **판정(sim)** `society/fusion.ts`: 융합 스탯·보너스 굴림·미리 보기 범위, 환생 조각 수·조각 보너스, 사망 조각·환생 조각 고르기, 유지비 무게. 계수표 `fusion` 칸 + 설정 칸 13개(`tuningFusion.ts`, N46·N47). 판정 고리 둘을 선택 칸으로(`attachSociety` `onDeath`, 정산 `upkeepWeightPm`) — 시뮬레이터는 넘기지 않는다.
- **팩 core@38**: 아이템 칸 `gene`(종류·종·얻는 길, `@terra/content` `geneSchema`), 중분류 `gene`, 아이템 `microchip`·`gene_stat_human`·`gene_skill_human`·`gene_stat_creature`·`gene_skill_creature`, 설정 칸 13개. 아이템 편집기 JSON이 `gene`을 그대로 넘긴다.
- **서버** `src/fusion/`: 서비스(융합·유전자 환생·개발 물자 받기·사망 조각·조회), 게이트웨이(속도 제한·차례·권한), 표 `cyborg_units`(마이그레이션 `20261107033018_cyborg_units`), 유닛 종류 5·2차맵 `setKind`, 유닛 화면 종류 cyborg, 보유 물건 칸 배치(사이보그), NPC 런타임 `onHumanDied` → 소유 세력에게 휴먼 스탯 조각, 정산 유지비 무게(사이보그 유닛 `n46_upkeep`), tRPC `fusion.overview`, 설정 칸 반영 범위 live 13개.
- **프로토콜 9**(min 8): `cyborg_fuse`·`unit_rebirth`·`dev_grant_goods` → `fusion_result`. 기존 시험의 판 숫자(사이보그 메시지 시험, 노동 계약 시험, 영토 화면 시험 hello 7 → 8)를 맞췄다.
- **화면**: 유닛 화면 일곱째 칸 [융합](`units/FusionPanel.tsx`·`fusion.css`·`fusionCommands.ts`) — 비용·비율·부품 스탯·유지비, 내 휴먼 카드(지금 → 융합 뒤 범위, 수명, [융합]·[유전자 환생]), 내 사이보그 유닛, 유전자 조각, dev·admin 시험 받기. 유닛 목록 종류 거르기에 "사이보그". 지도 연결은 `fusion_result`를 무시한다. 문구 58개 ko·en.
- **origin/main 합침**: `064fd98`(D-515 미러·시험 기반) 위. 충돌 없음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/fusion.ts`·`fusion.test.ts`(새), `tuningFusion.ts`(새), `society/coefficients.ts`, `tuning.ts`, `index.ts` | 판정·계수·설정 칸, 시험 9개 |
| `packages/sim/src/simulator/societyTypes.ts`·`society.ts` | `onDeath` 고리(선택) |
| `packages/sim/src/settle/owner.ts` | `upkeepWeightPm`(선택) |
| `packages/content/src/schema/items.ts`·`index.ts` | 아이템 `gene` 칸 |
| `content/core/items.json`·`item_subcategories.json`·`tuning.json`·`manifest.json` | 새 아이템·중분류·설정 칸, core@38 |
| `packages/shared/src/fusion.ts`(새)·`package.json`, `itemEditor.ts` | 조회 모양, `ItemJson.gene` |
| `packages/protocol/src/fusion.ts`·`fusion.test.ts`(새), `messages.ts`·`index.ts`·`version.ts`, `cyborg.test.ts`·`labor.test.ts` | 프로토콜 9, 판 숫자 시험 |
| `apps/server/src/fusion/service.ts`·`genes.ts`·`gateway.ts`·`gateway.test.ts`·`fusion.db.test.ts`(새) | 서비스·조각·게이트웨이, 시험 2 + DB 4 |
| `apps/server/src/db/fusionSchema.ts`(새)·`schema.ts`, `drizzle/20261107033018_cyborg_units/`(새) | 표 더하기만 |
| `apps/server/src/world/unitKinds.ts`·`secondMap.ts`·`settlement.ts`·`world.ts`·`persist/tables.ts` | 유닛 종류 5·`setKind`·유지비 무게·서비스·쓰기 표 |
| `apps/server/src/npc/runtime.ts` | `onHumanDied` |
| `apps/server/src/roster/worldUnits.ts`, `holdings/world.ts` | 화면 종류 cyborg, 칸 배치 |
| `apps/server/src/trpc/fusion.ts`(새)·`router.ts`·`context.ts`·`createContext.ts`, `session.ts`, `app.ts` | 조회·명령 잇기 |
| `apps/server/src/tuning/scope.ts`, `itemEdit/views.ts` | live 13칸, 편집기 JSON `gene` |
| `apps/game/src/units/FusionPanel.tsx`·`fusion.css`·`fusionCommands.ts`(새), `UnitsScreen.tsx`·`UnitList.tsx`, `roster/rosterText.ts`, `map/mapFeed.ts`, `messages/{ko,en}.json` | 화면 |
| `e2e/fusion.spec.ts`(새), `e2e/units.spec.ts`(칸 7개·←→), `e2e/territory.spec.ts`(hello 8) | 화면 시험 |
| `docs/adr/2026-11-07-cyborg-fusion-genes.md`(새), `docs/questions/2026-11-07-fusion-genes.md`(새), `docs/PLAN.md` 14장, 이 기록 | 결정·질문·상태 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 새 시험: sim `society/fusion.test.ts` 9개(옛 식 손계산 STR 17·DEX 20·AGI 23·VIT 34·INT 41·WIS 48, ×1.05 → 18·21·24·36·43·50, ×1.15 → 20·23·26·39·47·55, 몫 칸, 보너스 범위·시드, 조각 수 1·1·2·5, 조각 보너스 합, 사망·환생 조각 고르기, 유지비 무게), protocol `fusion.test.ts` 2개, 서버 `fusion/gateway.test.ts` 2개, DB `fusion/fusion.db.test.ts` 4개: ① 고용한 휴먼 → 본 값 다름 `cost_changed`·재료 없음 `insufficient_materials`·남의 유닛 `unknown_unit`·장비 받기 `unknown_item` → 개발 물자 받기 → 융합: 스탯 = `fuseStats`(굴린 보너스 1,050~1,150), 화폐 −5,000·재료 0, 다시 융합 `wrong_kind`, `world_units.kind` 5·휴먼 행 없음·`cyborg_units` 행(스탯·바탕 스탯·parts·보너스), 조회 휴먼 0·사이보그 유닛 1, 유닛 화면 종류 cyborg, 불변 조건 0, 다시 켜도 종류 5. ② 본체 + 사이보그 유닛 = 유지비 경계 하나에 유닛당 × 4. ③ 유전자 환생: 수명 남음 `alive` → 수명 끝(DB) → 조각 없음 `insufficient_genes`·본 조각 수 다름 `cost_changed` → 조각 3 받기 → 환생: 조각 1, 스탯 합 +1, 잔고 2, 행 레벨 1·환생 1·태어난 시각 = 지금·수명 ≥ T4 최소, 다시 `alive`. ④ 환생·신격화 0인 계수로 NPC 휴먼 12명 수명 끝 → 하루 끝에 모두 사망, 소유 세력 휴먼 스탯 조각 합 12(메모리·DB `ledger_accounts`), 크리쳐 조각 0, 불변 조건 0.
- 시뮬 비교(시드 1, 아래 결과): 판정 규칙 그대로(`SIM_VERSION` 12).
- origin/main(`064fd98`) 합친 뒤 `TEST_DATABASE_URL=… pnpm check` 통과: 시험 422파일 3,481개(DB 시험 포함, 건너뜀 없음), 다국어 3,829키, 대비 738쌍, 모듈 경계·파일 크기(`world.ts` 약 930줄). 첫 실행은 protocol 시험의 읽기 전용 배열 타입 오류(`fusion.test.ts`)로 멈췄고 고친 뒤 통과. `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` 통과(첫 화면 JS 105,900 B / 상한 131,416 B — 새 화면 코드는 유닛 화면 지연 조각 안, 개발 전용 조각 없음). `pnpm check:docs`·`pnpm check:content origin/main`(core@38, 4b 호환 포함)·`pnpm docs:index --check` 통과.
- 화면 시험 `pnpm e2e fusion.spec.ts units.spec.ts recruit.spec.ts` 33개 통과(1.0분). 새 `fusion` 10개: admin 시험 재료 두 번 → 구인 시험 화면에서 남은 가장 비싼 카드 고용 → [융합] 칸 새 휴먼(스탯 줄 2, 환생 단추 막힘) → [융합] → 성공 문구·사이보그 유닛 카드로 옮김 → 시험 유전자 조각 받기 → 휴먼 스탯 조각 +5 → 유닛 목록 종류 "사이보그" 줄. player: 빈 안내·개발 단추 없음·`fusion.overview` 200·누르는 곳 크기. 사진 8조합.
  - 처음 돌렸을 때 `recruit.spec`가 실패했다: 이 시험이 같은 창의 가장 싼 카드를 사서 구인 시험이 고를 카드가 "고용함"이었다 → 이 시험은 남은 가장 비싼 카드를 산다. 화폐는 시험 재료를 두 번 받아 남긴다.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/fusion-shots/fusion-{390,1440}-{pastel,dark}-{ko,en}.png`. 눈으로 확인: 390 파스텔 한국어, 1440 다크 영어(스탯 3 × 2 → 한 줄, 비용 셋 한 줄, 가로 넘침 없음).

## 결과(시뮬)
- main 팩(core@37 파일 넷을 잠깐 main 것으로 바꿔 이 가지 코드로 돌림): econ16 60일 해시 38524eb6, war16 30일 be74f1f5 = main 작업 기록(07-1150) 값 → 코드 바뀜은 시뮬 출력에 들지 않는다.
- core@38: 하루 줄(econ16 816줄·war16 235줄) 모두 같다(콘텐츠 판·해시 칸 뺌). 요약 줄만 팩 판·해시와 econ16 `economy.markets` 8,100 → 8,350·`ledger.accounts` 26,755 → 27,515·새 아이템 다섯 거래량 0(시장이 아이템마다 열린다)이 다르다. 줄 해시 econ16 a6a615d6·war16 aea62515.

## [임시] 값
- 부품 쪽 1차 스탯 10(`n46_parts_stat`), 사이보그 유닛 유지비 3,000‰(`n46_upkeep`), 화폐 = 시험 화폐, 재료·조각 = 장부 계정(위치 없음), 만드는 곳 = 공방 표시만(시설 배치 안 봄), 유전자 환생의 신앙도·종교 시설 조건 없음, 크리쳐 조각 = 유닛 종류 하나.

## 함께 바꿔야 하는 파일
- 유닛 종류 코드(`world/unitKinds.ts`)를 더하면 `roster/worldUnits.ts` `unitTypeOf`, `holdings/world.ts` 칸 배치, `world.ts` 유지비 무게.
- 아이템 `gene` 칸을 바꾸면 `@terra/shared` `ItemJson.gene`·`itemEdit/views.ts` `itemJsonOf`·`fusion/genes.ts` `geneItemsOf`.
- 유저 휴먼 수명·사망이 생기면 그 자리에서 `FusionService.dropOnDeath`(사망 조각)와 상속을 부른다. 휴먼 지갑이 생기면 융합(`service.ts` fuse)에서 상속.
- 서버 원장 물자 자산 = 아이템 ID(`fusion/genes.ts` `goodsAsset`). 거래소·창고가 물자를 다루게 되면 같은 함수를 쓴다.

## 건드리지 말 것
- 시뮬레이터에는 `onDeath`·`upkeepWeightPm`을 넘기지 않았다(넘기면 출력이 바뀌어 `SIM_VERSION` 13).
- 팩에 사이보그 시설을 더하지 않았다(시뮬 경제가 시설을 고를 수 있어 출력이 바뀐다 — 질문 378).

## 미검증·TODO·알려진 문제
- 유닛 상세의 사이보그 유닛 스탯은 아직 [임시] 기본 몸이다(저장된 유닛 스탯 줄기). [융합] 칸에는 저장 스탯이 보인다.
- 융합 중 전투에 든 휴먼을 막지 않는다(전투 중 유닛 표시가 서버에 없다). 끝 값은 같은 유닛 ID라 그대로 적힌다.
- 질문 번호 370~378(이 줄기 몫). 다른 줄기와 겹치면 조정자가 바꾼다.
- NAS·실제 휴대폰에서 재지 않았다.

## 사용자 결정 대기
- 질문 370~378 — 기획 세션(모양만, 수치는 묻지 않음 D-515).
