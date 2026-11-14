# 사다리마다 채집 띠 표·어군 낚시 사다리 굴림·난파선 굴림표·고래와 자연 채집물

- 일시: 2026-11-14 09:50 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-540(1217 나·1222 다 + 나·1224 가·1231 다·그 밖 가), ADR `docs/adr/2026-10-31-economy-core.md` "바뀜 (2026-11-14, 사다리마다 채집 띠 표)", ADR `docs/adr/2026-11-07-gather-objects.md` "바뀜 (2026-11-14)", 질문 `docs/questions/2026-11-14-gather-ladders.md`(1301~1311), 가지 `work/gather-ladders`(main `9c5035c`에서), 팩 core@83, `SIM_VERSION` 36

## 한 일
1. **사다리마다 띠 표(1217 나)**: 팩 `gather_tiers`에 `ladder`(원자재 중분류) 칸. 사다리 전용 표가 있으면 그것만, 없으면 기본 표(`@terra/shared/gatherMath` `gatherLadderBands`). 기본 표 0~59는 옛 값(T0 700·T1 150 / T0 650·T1 220)으로 되돌리고, 광석 전용 표 14줄(`ore_band_*`)이 D-537 값(T0 500·T1 350 / T0 500·T1 350·T2 120)을 든다. 2단계 검사(표마다 0부터·늘어나기만, 기본 표 필수, 사다리는 원자재 중분류).
   - 쓰는 곳 모두 사다리 표: 시뮬 생산, 시뮬 CLI 팩 읽기, 서버 채집 직무·채집소(`facilities/world.ts`), NPC 경제 목록(`market/catalog.ts`), 아이템 편집기 미리 보기, 사이보그 판 효율 줄(`roster/gatherSheet.ts`), 생산 편집기(미리 보기·확률 분포·예상 확률 탭 — 띠 표 고르기 `ProductionLadderPicker`), 오브젝트 사다리 굴림. 읽기 모양 하나 `@terra/content` `gatherBandOfEntry`.
   - 유닛 추천(`recommendProduction`)은 띠를 보지 않는다(주 + 보조 합 차례) — 바꿀 것 없음(Verified: 코드).
   - 편집기 담음이 `ladder`를 잃던 자리(`gatherTierModel.ts editBand`)를 고쳤다 — 잃으면 광석 덮어쓰기가 기본 표로 옮겨 가 검사에 걸린다.
2. **바다 오브젝트(1222 다 + 나)**: 팩 `gather_objects`에 `table`(굴림표, 합 1000‰)·`ladder`(맡는 시설 사다리 굴림) 칸과 2단계 검사. 서버 직접 채집이 `gather/objectYield.ts`로 아이템을 고른다(시드 = 유닛·오브젝트·캐기 차례). 어군 넷 = 낚시 사다리 굴림, 난파선 = 구리 괴 450·철 괴 300·판자 150·은 괴 80·금 괴 20‰. 열수구는 그대로(질문 1305). 조회 `gather.objects` 종류에 `table`·`ladderName`, 판(새 GatherPanel 위)은 "나오는 것(하나를 뽑음): …"·"… 사다리 — 스탯에 따라 티어".
3. **고래(1231 다)·자연 채집물(1224 가)**: 새 원자재 중분류 `wild_goods`(시설 사다리 밖)에 T0 여덟(물·소금·식물 섬유·이탄·베리·야생 과일·조개·화석)과 고래 고기 T6·고래 기름 T7 [임시]. 고래 무리 = 고기 700·기름 300‰ 굴림표. 장식 소품 그림 아홉에 `source: "prop"` 채집 종류 여덟을 `gather_objects` 끝에 더함(생성기·지형 캐시 그대로, 소품 규칙 설명 글만 고침).
4. **나머지 가 답 확인(1211~1231)**:
   - 1213 가: 넣음 — NPC 시작 도시 약초원 = 약초 있음 비트, 목장 = 축산물 있음 비트(`npcSeed.ts landGather`). 출발값이 0개라 지금 세계에서는 바뀌지 않는다.
   - 1230 가: 넣음 — 도시 배치 땅(`cityLayoutGround.ts layoutObjectsOf`)이 채집과 같은 바이옴·물 비트를 넘겨 지형별 자리·어군도 본다.
   - 이미 들어 있음(Verified: 코드·팩): 1211(사막만 전략 자리 `STRATEGIC_SLOT_BIT`), 1212(빈터 노이즈 `resource_herb_clearing_pm`), 1214(숲 밖 목장 0 `resource_livestock_other_pm`), 1215(노이즈 격자 8·배율 250~1750), 1216(목재 바닥 300‰), 1218(벌목장 = 목재 몫 %), 1219(관목 땔감), 1225(지형별 자리 아이템), 1226(빙하 균열·절벽 바위 엄폐 2), 1227(갯바위·표류목 바닷가만), 1228(어군 수·빠르기), 1229(정산 시각 자리).
   - 1223(느려짐)은 `slow-props` 줄기 몫이라 손대지 않았다.
5. **측정 스크립트** `pnpm --filter @terra/server bench:gather-ladders`(새): 서버 채집 직무 함수로 원자재마다 전·뒤 시간당 양.

## 측정 (Verified: `bench:gather-ladders`, 일꾼 하나·시설 Lv1·컨디션 0·1,000시간, 개/시간, 전 = core@80 띠 하나 → 뒤)
| 원자재 | 유효 20 | 유효 30 | 유효 40 | 유효 50 |
|---|---|---|---|---|
| 석재(광산) | 0.85 → 0.85 | 0.85 → 0.85 | 1.28 → 1.28 | 1.28 → 1.28 |
| 잡석(광산) | 1.16 → 1.16 | 1.16 → 1.16 | 1.76 → 1.76 | 1.76 → 1.76 |
| 소나무 원목(벌목장) | 1.16 → 1.86 (+60%) | 1.16 → 1.86 | 1.76 → 2.59 (+47%) | 1.76 → 2.59 |
| 자생초(약초원) | 0.39 → 0.61 (+59%) | 0.39 → 0.61 | 0.58 → 0.86 (+49%) | 0.58 → 0.86 |
| 미꾸라지(낚시터) | 0.29 → 0.39 (+38%) | 0.30 → 0.42 | 0.48 → 0.64 (+32%) | 0.51 → 0.68 |

- 기본 건축 재료 어림(Verified: `node apps/server/bench/resourceOverlap.ts` "기본 건축 재료" 표, 일꾼 5명·유효 20 — 전 = `docs/worklog/2026/11/12-2120-resource-biome.md`의 "뒤" 값): 시작 도시 49곳 통나무/일 중앙 56.1 → 88.8(D-537 전 85.9), 석재 20.2 → 20.2, 창고 + 숙소 Lv1 날 중앙 0.8 → 0.8. 평원 칸 통나무 21.4 → 33.9, 석재 19.3 → 19.3. 사막 칸 통나무 21.6 → 34.3.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/economy.ts`, `index.ts`, `validate/gather.ts`(+시험) | `gather_tiers.ladder`, `gatherBandOfEntry`, 표마다 검사, 오브젝트 굴림표·사다리 굴림 검사 |
| `packages/content/src/schema/gatherObjects.ts` | `table`·`ladder` 칸 |
| `packages/shared/src/gatherMath.ts` | `GatherBand.ladder`, `gatherLadderBands`·`gatherBandLadders` |
| `packages/shared/src/buildingEditor.ts`, `gather.ts` | 화면 JSON `ladder`, 종류 보기 `table`·`ladderName` |
| `packages/sim/src/economy/gather.ts`(+시험), `simulator/economy.ts`, `index.ts`, `cli/common.ts`, `version.ts` | 시험 표 = 기본 + 광석, 생산이 사다리 표, `SIM_VERSION` 36 |
| `content/core/gather_tiers.json`, `gather_objects.json`, `items.json`, `item_subcategories.json`, `map_props.json`(설명만), `manifest.json` | 띠 표·바다 오브젝트·새 아이템 10·중분류 1, core@83 |
| `apps/server/src/facilities/{catalog,world}.ts`, `market/catalog.ts`, `itemEdit/{services,previewGather}.ts`(+시험), `roster/gatherSheet.ts`(+시험), `buildingEdit/views.ts`(+시험) | 사다리 표 |
| `apps/server/src/gather/{objectYield.ts(새, +시험),kinds.ts(+시험),service.ts,reads.ts}` | 직접 채집 아이템 고르기·조회 칸 |
| `apps/server/src/facilities/npcSeed.ts`(+시험), `cityLayoutGround.ts`(+새 시험) | 1213·1230 |
| `apps/server/bench/gatherLadders.ts`(새), `resourceOverlap.ts`, `apps/server/package.json` | 측정 |
| `apps/game/src/editor/production/*`(띠 표 고르기 새 파일 `ProductionLadderPicker.tsx`, `production.css` 눌림 모양 — `ProductionEditorScreen.tsx`는 616줄로 600줄 경고), `gatherTiers/gatherTierModel.ts`(+시험), `map/gather/GatherPanel.tsx`, `messages/{ko,en}.json` | 편집기 띠 표·판 문구 |
| `e2e/gather-tiers.spec.ts` | 기본 표 줄 수·광석 표 고르기 |
| ADR 둘 "바뀜", 질문 1301~1311 | 결정 기록·물음 |

## 함께 바꿔야 하는 파일
- 띠 구간을 읽는 새 코드는 `gatherBandOfEntry`로 읽고 `gatherLadderBands(bands, 주 중분류)`로 고른다(섞인 목록을 그대로 `gatherBandIndex`에 넘기지 않는다).
- 팩 `gather_tiers`를 바꾸면 `packages/sim/src/economy/gather.ts` `TEST_GATHER_BANDS`도(서버 `previewGather.test.ts`가 둘이 같은지 본다).
- 새 `gather_objects` 종류는 끝에 더한다(앞 차례가 오브젝트 번호·상태 줄에 든다).

## 건드리지 말 것
- 2차맵 생성기 판·지형 캐시: 소품 규칙의 설명 글만 바꿨다(생성기 사본 `testMapProps.ts`는 설명을 갖지 않는다).
- 느려짐 소품(1223, `slow-props` 줄기).

## 미검증·TODO·알려진 문제
- 배가 없어 고래·난파선·심해 어군은 아직 아무도 캐지 못한다(D-540 B1 다음 줄기).
- 어군 종류마다 티어 범위가 없다(질문 1307 추천 나 — 답이 오면 넣는다).
- 자연 채집물 소품 종류가 소품 단계에 서면서 뒤 단계 빈 칸이 조금 바뀔 수 있다(Assumed, 세계 새로 시작 뒤 맞음).
- 시뮬 전체 경제(econ16)에서 목재·약초 산출 변화는 재지 않았다(Unknown) — 띠만 바뀌어 위 표와 같은 방향(Assumed).

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL 있음) — 시험 파일 675/675, 시험 5,128/5,128 통과(건너뜀 없음).
- Verified: `pnpm check:content origin/main`(core@83, 호환 포함)·`pnpm check:docs origin/main`·`check:contrast` 통과.
- Verified: `pnpm build`(build-exit 0) + `node scripts/check-pwa.mjs` + `pnpm check:bundle` 통과.
- Verified: `pnpm e2e e2e/gather-expect.spec.ts e2e/gather-station.spec.ts e2e/gather-tiers.spec.ts e2e/terrain-objects.spec.ts e2e/cyborg.spec.ts` 56 통과·1 건너뜀(E2E_MEASURE 측정 전용), 9.1분.
- 그 뒤 고친 것: 띠 표 고르기 단추의 눌림 모양 CSS 한 규칙(`production.css .pd-ladders`) — `check:contrast`·포맷만 다시 돌림, 빌드·화면 시험은 다시 돌리지 않았다(Assumed: 개발 조각 CSS 한 규칙).
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/gather-ladders-shots/gather-tiers-light-ko-1440.png`(띠 표 고르기), `gather-tiers-neon-ko-390.png`, `gather-station-sheet-390-pastel-ko.png`, `cyborg-gather-390-dark.png`.

## 사용자 결정 대기
- 질문 1301~1311.
