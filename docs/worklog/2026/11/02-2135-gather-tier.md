# 채집·채굴 티어 추첨, 광석 1g과 거래 묶음 (질문 300~302, D-506)

- 일시: 2026-11-02 21:35 (KST)
- 작업 도구: Claude Code
- 관련: 질문 `docs/questions/2026-11-02-gather-tier.md` 300~302(사용자 답), 기획 D-506·설정 칸 49 N43(미러 `e885b97`, main `880575e`), ADR `docs/adr/2026-10-31-economy-core.md` "바뀜 (2026-11-02, 300~302·D-506 …)"·`docs/adr/2026-11-01-item-editor.md` "바뀜 (2026-11-02, 300~302·D-506 …)", 앞 작업 기록 `docs/worklog/2026/11/02-2130-old-resources.md`(철광석 보류), 가지 `work/gather-tier`(main `880575e`에서 시작)

## 한 일
- **채집 티어 추첨(300)**: 팩 시설 칸 `gather {primary, secondary, subcategory}` — 광산 STR + VIT · 광석(`ore`), 벌목장 DEX + STR · 목재(`wood`). 추첨 시설의 레시피 가운데 산출이 모두 그 중분류인 것(지금은 `mine_iron_ore` 하나)은 한 번 돌릴 때마다 산출 묶음(10개)마다 티어를 뽑는다(`packages/sim/src/economy/gather.ts`).
  - 유효 스탯 = 일꾼 1차 + 2차 + N43 레벨 보너스 × (Lv − 1). 구간 = `from`이 유효 스탯 이하인 마지막 구간. 그 구간 ‰ 가중치로 티어 하나(시드 흐름 7 = 시설·생산 차례). 그 티어의 켜진 같은 중분류 아이템, 없으면 더 낮은 티어, T0까지 없으면 그 묶음은 빈다. 같은 티어에 여럿이면 고르게 하나(Assumed).
  - 시뮬 유닛에는 스탯이 없다 → 시나리오 시설 계획 칸 `gatherStat`(선택), 없으면 새 유닛 평균 2 × ⌊N9 초기 합 60 ÷ 6⌋ = **20**(econ16 광산 전부).
  - 확률표 = 새 팩 분류 `content/core/gather_tiers.json`(12구간, 20 단위, ‰): 아래 표. 팩 2단계 검사(`packages/content/src/validate/gather.ts`): 구간 합 1000, 첫 구간 0·늘어나기만, 추첨은 채집 단계 시설·원자재 중분류만, 추첨 시설이 있는데 표가 비면 오류.
  - 철광석 `iron_ore` 티어 1 → **3**(옛 값).
- **시설 레벨의 몫(301)**: 채집 단계 시설은 레벨 티어 상한(D-5001)을 받지 않는다(`tierCappedByLevel`, 제작 시설은 그대로 — 시험이 Lv1 제련소 T3 산출을 막는 것을 본다). 레벨이 올리는 것: 동시 작업 유닛 = 지금 `slotsPerLevel`(Lv × 10) 그대로, 상위 확률 = 새 설정 칸 `n43_level_bonus`(코드 N43, [임시] 10점/레벨, 세력·사회 계수표 `gatherLevelBonus`, 반영 범위 live — 아이템 편집기 미리 보기가 읽는다), 창고 = 새 설정 칸 `d506_storage_per_level`([임시] 1,000,000g = 레벨당 1t, 새 단위 `grams`, **아무도 읽지 않음** — 시설 창고가 없다).
- **광석 1g과 거래 묶음(302)**: 아이템 칸 `lotSize`(없으면 1). 금속 원석 8개(`iron_ore` 포함) 무게 1·묶음 1,000(1kg). 원장(창고)·운송·나누기는 기본 단위(g), 레시피·생필품 수량과 거래소 주문 수량·값은 묶음. 시뮬 `prepareCatalog`가 레시피·생필품 수량 × 묶음 크기, 물자 거래소(`goodsMarket`)가 `lotSize`로 묶음 ↔ 기본 단위, NPC 거래는 팔 때 버림·살 때 올림. 철광석 값 8 = 1kg 묶음당(정수 그대로). 새 제련 7개는 원석 1,000(g) → 1묶음. `smelt_iron` 10묶음(10kg) → 철 주괴 7개(7kg)는 그대로 읽었다(손실 30% = P7 수율 30%).
- `SIM_VERSION` 7 → 8, 출력 형식 7 → 8(econ 줄·요약 `economy`에 `produced`). 팩 core@28 → core@29.
- 서버·화면
  - 경제 목록(`economy.catalog`): 아이템 `lotSize`·`weight`, 레시피 `gather`(추첨이면). 경제 화면: 레시피 수량에 "(묶음 1 kg)", 추첨 레시피는 "묶음마다 티어 추첨 · STR+VIT"와 "T 추첨" 표시, 철광석 호가창에 "가격·수량은 묶음(1 kg) 단위", 창고 줄에 "거래 묶음 1 kg · N묶음", 창고 용량 안내 문구(묶음 수로 셈). 시안 창고 철광석 = g(310kg = 310,000, 묶인 양 40kg), 시안 용량은 묶음 수, 호가창 팔 수 있는 양은 묶음.
  - 아이템 편집기: 값 구역 "거래 묶음(개)" 칸(무게를 알면 "묶음 하나 = 1 kg"), 대량 도구 CSV 열 `lotSize`, 서버 항목 JSON에 `lotSize`(빠뜨리면 저장 때 사라짐 — 팩 모든 아이템 왕복 시험 더함), 미리 보기 "채집 티어 추첨"(시설·스탯 짝·기준 유닛 스탯, 시설 Lv1~5 유효 스탯과 묶음당 나올 확률, 확률표 전체 접힘 — 읽기만).
  - 옛 덮어쓰기 줄: core@28까지 저장한 items 줄에 `lotSize`가 없고 팩 항목에 있으면 팩 값(`legacy.ts`). 판을 모르는 감사 옛 판 항목도 넣는다.
  - 설정 칸 패널: N43이 "연결됨"(목록 `settingsCells.json`은 `pnpm settings:cells`로 다시 만들었으나 main 것과 같아 바뀐 줄 없음).

### 확률표(팩 `gather_tiers`, ‰, 구간마다 합 1000)
| 유효 스탯 | T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0~19 [임시] | 700 | 150 | 100 | 50 | | | | | | |
| 20~39 [임시] | 700 | 150 | 100 | 50 | | | | | | |
| 40~59 | 650 | 220 | 100 | 30 | | | | | | |
| 60~79 | 530 | 260 | 140 | 60 | 10 | | | | | |
| 80~99 | 430 | 290 | 170 | 80 | 25 | 5 | | | | |
| 100~119 | 350 | 280 | 200 | 110 | 40 | 15 | 5 | | | |
| 120~139 | 290 | 260 | 210 | 140 | 60 | 25 | 10 | 5 | | |
| 140~159 | 250 | 230 | 200 | 160 | 90 | 40 | 17 | 9 | 4 | |
| 160~179 | 223 | 210 | 200 | 170 | 110 | 50 | 23 | 10 | 4 | |
| 180~199 | 204 | 200 | 190 | 170 | 120 | 60 | 35 | 15 | 6 | |
| 200~219 | 190 | 190 | 180 | 160 | 130 | 80 | 45 | 20 | 5 | |
| 220 이상 | 195 | 180 | 170 | 160 | 130 | 80 | 40 | 25 | 15 | 5 |

- 옛 표 %를 × 10 한 값이 모두 정수이고 구간마다 정확히 1000이라 반올림하지 않았다(22.3 → 223, 20.4 → 204, 2.5 → 25, 0.5 → 5, 1.7 → 17, 0.9 → 9, 0.4 → 4, 3.5 → 35, 4.5 → 45, 19.5 → 195). 0~39는 20 단위 두 줄(0~19·20~39)로 두고 둘 다 [임시] 값이다(20 단위 모양을 지키고 따로 고칠 수 있게). 옛 표의 마지막 구간 "220~240"은 위 끝 없이 220 이상으로 읽었다.
- 광석 사다리: T0 잡석 `rubble`, T1 석재 `stone`, T2 구리 `copper_ore`, T3 철 `iron_ore`, T4 은 `silver_ore`, T5 티타늄 `titanium_ore`, T6 금 `gold_ore`, T7 백금 `platinum_ore`, T8 미스릴 `mithril`, T9 오리할콘 `orichalcum`. 켜진 것은 철광석뿐이다.

## 검증
- 시뮬 앞·뒤(Verified, 시드 1, 각 한 번. 앞 = main `880575e`/core@28, 뒤 = 이 가지/core@29, SIM 8)
  - war16 30일: `linesHash` 298e64ca → 4dbba2b2, stub16 180일: ad19690d → ce3ec385. 머리 줄 판·요약 팩 해시 말고 본문 줄이 모두 같다(경제 없음).
  - econ16 180일: fe804508 → f592cdc5(요약 앞 줄 1,932 → 1,786), 위반 0.
  - econ16 생산(앞 수치는 main 코드 사본에 생산 합만 더해 다시 돌림, 줄 해시 fe804508 같음 확인)

| 180일 합 | 앞(core@28) | 뒤(core@29) |
|---|---|---|
| 철광석 | 1,125,520kg(1개 = 1kg) | 65,295kg = 65,295,000g (5.8%) |
| 철 주괴 | 393,904 | 45,591 (11.6%) |
| 생활용품 | 112,488 | 22,783 (20.3%) |
| 원목 | 1,754,420 | 1,796,600 |
| 배급 식량 | 3,575,100 | 3,439,560 |
| 재료 모자람(생산 못 함) | 64번 | 165,736번(1일째부터 하루 약 1,960) |
| 생활용품·배급 모자람(유닛·시간) | 34,883 · 464,193 | 100,098 · 542,471 |
| 체결 | 4,358번 | 346번 |
| 반란 성공 · 폐허 · 끝 유닛 | 36 · 34 · 774 | 70 · 36 · 415 |

  - 철광석 1일째 782kg(30일 단위 23,073 → 15,817 → 8,203 → 6,755 → 5,687 → 5,760kg). 기대값 = 광산 32곳 × 48번(2명, 30분) × 10묶음 × 5% = 768kg.
  - **NPC 경제는 돌지만(위반 0) 공업 사슬이 철에 굶는다**: 제련은 10kg를 기다리고, 생활용품이 80% 줄고, 공업 나라가 팔 것이 없어 배급 식량을 못 사 반란·인구 감소가 커졌다. [임시] 값 밖으로 맞추지 않았다(D-487).
- `TEST_DATABASE_URL=… pnpm check`(Verified, 마지막 코드): 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 검사 통과, 단위 시험 376파일 3,164개 통과. 새 시험: `packages/sim/src/economy/gather.test.ts`(구간 찾기, 10만 번 분포 ±0.4%p, 가장 낮은 구간 T3 50‰, 레벨 보너스, 더 낮은 티어로 내려감·빈 묶음·같은 티어 고르게, 묶음 → 기본 단위, 나올 확률), `simulator/gatherEconomy.test.ts`(묶음 → 기본 단위 레시피, Lv1 광산이 T3 철광석을 캠·1kg 배수, Lv1 제련소 T3 산출은 막힘), `goodsMarket.test.ts` 묶음(수량·값 묶음, 창고·에스크로 g), 서버 `previewGather.test.ts`(팩 표 = `TEST_GATHER_BANDS`, 철광석 Lv1 5.00%·Lv3 3.00%·Lv5 7.00%, 꺼진 구리 0·켜면 10%, 곡물 null), `views.test.ts`(팩 아이템 JSON 왕복), `legacy.test.ts` 묶음 2개, `economyView.test.ts` 2개, `itemEditorBulk.test.ts` 1개, `limits.test.ts` 범위.
- `pnpm check:content main`(Verified): core@29 (2d2c9148bf7d) 통과, 단계 1·2·4a·4b(기준 880575e).
- 포맷·린트(oxlint `--deny-warnings`)·`pnpm typecheck`·`check:boundaries`·`check:i18n`(3,284키)·`check:contrast`(738쌍)·`check:size`(경고만: `packages/sim/src/simulator/economy.ts` 680줄·`packages/sim/src/index.ts` 726줄, 1,000 아래) 통과(Verified).
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e`, 헤드리스 Chromium): `items.spec.ts`·`economy.spec.ts`·`tuning.spec.ts` 82개 중 77개 통과(6.1분). 실패 5개는 1440 전체 화면 사진에서 브라우저가 죽거나(Target crashed) 사진을 못 찍은 것(Unable to capture screenshot)이다. 다시 돌린 1440 묶음은 10개 통과·2개 같은 이유로 실패, 그 둘(economy dark·ko·dark·en 1440)을 일꾼 하나로 돌리자 통과 — 시험이 모두 한 번 이상 통과했다. 일꾼 여럿이 큰 사진(4320 × 6384px)을 함께 찍을 때의 자원 문제로 본다(Assumed: 생산 화면 높이는 앞 기록 6,321 → 6,384px로 거의 같다).
  - 고친 시험: 대량 가져오기가 철광석 티어를 3으로 고치던 것은 이제 같은 값이라 4로 바꿈. 새 시험: 아이템 편집기 채집·묶음(네온·라이트 × ko·en × 390·1440, 1440은 `VIEWPORTS.desktop`: 묶음 칸 1000·"묶음 하나 = 1 kg", Lv1 5.00%·Lv5 7.00%, 확률표 12줄, 가로 넘침·작은 누르는 곳 없음), 경제 묶음·추첨(광산 레시피 "묶음마다 티어 추첨 · STR+VIT"·"T 추첨", "철광석 ×10 (묶음 1 kg)" 두 줄, 호가창 묶음 알림, 창고 "거래 묶음 1 kg · 310묶음"), 설정 칸 N43 연결·채집 칸 줄 사진.
  - 첫 실행에서 찾아 고친 것: 확률표 펼침 줄(summary)이 17px라 작은 누르는 곳 → `--tap-size` 높이.
- `pnpm check:bundle`(Verified, e2e가 만든 빌드): 첫 화면 JS 105,379 B / 상한 131,416 B(앞 기록 105,399 B). 아이템 편집기 조각 `ItemEditorScreen-*.js` 167,348 B(앞 기록 161,962 B, 채집 미리 보기·묶음 칸).
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/gather-tier/shots/` — `items-gather-preview-{neon,light}-{ko,en}-{390,1440}.png`(채집 미리 보기·확률표), `items-lot-size-…png`(값 구역 묶음 칸), `tuning-n43-…png`(설정 칸 N43 줄), 경제 화면 `economy-{production,warehouse,book,…}-{pastel,dark}-{ko,en}-{390,1440}.png`(게임 화면이라 파스텔·다크). 눈으로 본 것: 네온 1440·라이트 390 채집 미리 보기(390은 확률표가 칸 안에서 가로로 밀림), 네온 1440 묶음 칸, 라이트 1440 N43 줄("서버 즉시", "49 칸 283개 중 61개 연결"), 다크 390 생산 화면(추첨 레시피 줄).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/items.ts`·`economy.ts`·`categories.ts`·`index.ts`, `validate/gather.ts`·`pack.ts` | `lotSize`, 시설 `gather`, 새 분류 `gather_tiers`(합 1000), 2단계 검사 |
| `content/core/items.json`·`recipes.json`·`facilities.json`·`gather_tiers.json`(새)·`tuning.json`·`manifest.json`(core@29) | 철광석 T3·1g·묶음, 원석 묶음, 제련 1묶음, 광산·벌목장 추첨, 확률표, N43·창고 칸 |
| `packages/shared/src/tuning.ts` | 설정 칸 단위 `grams` |
| `packages/sim/src/economy/gather.ts`(새, +시험)·`production.ts`·`goodsMarket.ts`(+시험) | 추첨 함수·표, 제작 시설만 레벨 상한, 산출 바꿔 넣기, 묶음 거래 |
| `packages/sim/src/simulator/catalog.ts`·`economy.ts`·`economyRun.ts`·`npcTrade.ts`·`scenario.ts`·`run.ts`·`gatherEconomy.test.ts`(새) | 묶음 → 기본 단위, 사다리, 생산 때 추첨(흐름 7), `gatherStat`, `produced`, 출력 형식 8 |
| `packages/sim/src/society/coefficients.ts`·`tuning.ts`·`version.ts`·`index.ts`, `cli/common.ts` | `gatherLevelBonus`·N43 칸, SIM 8, 내보내기, 팩 읽기 |
| `packages/shared/src/economy.ts`, `apps/server/src/economyView/catalog.ts`·`previewWorld.ts`·`services.ts`(+시험) | 경제 목록 `lotSize`·`weight`·`gather`, 시안 창고 g·묶음 용량·팔 수 있는 묶음 |
| `apps/game/src/economy/economyText.ts`·`ProductionView.tsx`·`WarehouseView.tsx`·`market/MarketBookView.tsx`, `messages/ko.json`·`en.json` | 묶음·추첨 표시, 문구 |
| `packages/shared/src/itemEditor.ts`·`itemEditorPreview.ts`·`itemEditorBulk.ts`(+시험) | `lotSize` 칸·범위·쓰임, 미리 보기 `gather`, CSV 열 |
| `apps/server/src/itemEdit/previewGather.ts`(새, +시험)·`preview.ts`·`services.ts`·`views.ts`(+`views.test.ts`)·`limits.test.ts`, `tuning/scope.ts` | 채집 미리 보기, `lotSize` JSON, 레벨 보너스 live |
| `apps/server/src/contentEdit/legacy.ts`(+시험) | 옛 줄 `lotSize` 채움 |
| `apps/game/src/editor/items/ItemForm.tsx`·`ItemPreview.tsx`·`ItemGatherPart.tsx`(새)·`itemEditor.css`, `editor/tuning/tuningMessages.ts` | 묶음 칸, 채집 미리 보기, `grams` 단위 글 |
| `e2e/items.spec.ts`·`economy.spec.ts`·`tuning.spec.ts` | 묶음 칸·채집 미리 보기·경제 묶음 표시·N43 연결 확인과 사진 |
| ADR 경제 코어·아이템 편집기, PLAN 14장, 질문 300~302 상태 | 기록 |

## 함께 바꿔야 하는 파일
- 확률표: 팩 `gather_tiers.json` ↔ 시뮬 `TEST_GATHER_BANDS`(`packages/sim/src/economy/gather.ts`, 서버 시험이 맞춰 본다).
- 레벨 보너스: 팩 `tuning.json` `n43_level_bonus` ↔ `TEST_SOCIETY_COEFFICIENTS.gatherLevelBonus`(서버 `combatCatalog.test.ts`가 계수표 = 팩을 본다).
- 묶음 범위: `ITEM_SCHEMA_LIMITS.lotSizeMax` ↔ `ITEM_LIMITS.lotSize`.
- 추첨 레시피 판단(시설 `gather` + 산출이 모두 그 중분류): 시뮬 `prepareCatalog` ↔ 서버 경제 목록 `economyCatalogFrom` ↔ 편집기 미리 보기 `previewGather`(사다리). 바꾸면 셋을 같이.
- 서버가 물자 거래소·생산을 열면 `goodsMarket` `lotSize`, `runRecipe` `outputs`, `rollGatherOutputs`를 그대로 쓴다.

## 건드리지 말 것
- 팩 `gather_tiers`·N43·창고·묶음의 [임시] 값과 econ16 시나리오(광산 Lv1·`gatherStat` 없음): 사용자 확인 전에는 맞추지 않는다(D-487).
- `smelt_iron` 10 → 7 읽기(10kg → 7개, 손실 30%).

## 미검증·TODO·알려진 문제
- 창고 용량 칸 `d506_storage_per_level`은 아무도 읽지 않는다(시설 창고가 없다: 시뮬 산출은 바로 도시 창고 계정). 시설 창고가 생기면 읽는다.
- 확률표는 팩 파일로만 고친다(세계 덮어쓰기·편집 화면 없음). 아이템 편집기 미리 보기는 읽기만 보인다. 편집 화면(가중치 표 편집처럼)은 다음 줄기.
- 칸(땅)의 최대 티어 상한(D-506 "칸의 최대 티어만 상한")은 넣지 않았다(시뮬 시설에 칸이 없다).
- 벌목장은 추첨 칸이 있지만 레시피 `cut_timber`의 산출 원목(`timber`)은 목재 중분류 밖이라 추첨하지 않는다(목재 사다리 10개는 꺼짐·레시피 없음). 약초원·낚시터 시설과 레시피는 팩에 없다. 농장은 옛 규칙이 "선택 + 효율"(추첨 아님)이라 추첨 칸을 두지 않았다. 농장의 스탯 해금(⌊합 ÷ 20⌋)도 시뮬 유닛 스탯이 없어 넣지 않았다.
- 같은 티어 여럿일 때 고르게 고르는 것은 옛 규칙을 확인하지 않은 기술 해석(Assumed). 지금 켜진 사다리(광석)는 티어마다 하나라 영향 없다.
- [임시] 0~39 구간 T3 5%가 옛 40~59 구간 T3 3%보다 높아, 유효 스탯 39 → 40(예: 새 유닛 + Lv3 보너스)에서 철 확률이 내려간다.
- 옛 PWA 기기(새 서버, 옛 화면)는 아이템 편집기 항목의 `lotSize`를 모르는 칸으로 두고(항목 모양 검사는 통과) 미리 보기 `gather`를 보이지 않는다(미실행).

## 사용자 결정 대기
- [임시] 값: 가장 낮은 구간(0~19·20~39 = T0 700·T1 150·T2 100·T3 50‰), N43 레벨 보너스 10점/레벨, 창고 레벨당 1,000,000g(읽는 곳 없음), 금속 원석 묶음 1,000(1kg), 시뮬 일꾼 스탯 20(새 유닛 평균).
- econ16 철 공급 약 94% 감소(위 표). 손잡이: ① 가장 낮은 구간 T3 가중치, ② 일꾼 스탯(구간별 T3 이상 몫 5·3·7·11·17·24·32·36.7·40.6·44·45.5%), ③ 레벨 보너스(econ16 광산 Lv1), ④ 캐기 레시피 묶음 수(10).
