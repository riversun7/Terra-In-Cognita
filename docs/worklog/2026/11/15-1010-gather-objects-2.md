# 채집 확률표 하나·오브젝트마다 티어 범위·채집 오브젝트 편집기(D-552)

- 일시: 2026-11-15 10:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-gather-object-tiers.md`(확정), 질문 `docs/questions/2026-11-15-gather-objects-2.md`(1561~1566), 기획 D-552(계획 커밋 b2be470, 미러 전), 가지 `work/gather-objects-2`(시작 d28b3ae)

## 한 일
- 설계 먼저(ADR·질문 커밋 4e8518b) → 구현 → 편집기 → 측정.
- 확률표 하나: 팩 `gather_tiers`의 광석 전용 표 14줄을 지우고(`id-changes.json`) 스키마에서 `ladder` 칸을 뺐다. `@terra/shared/gatherMath gatherLadderBands`·`gatherBandLadders`를 지우고 쓰는 곳(시뮬 생산·서버 채집 직무·NPC 경제·아이템 편집기 미리 보기·사이보그 판·생산 편집기·띠 표 편집기·오브젝트 굴림)이 표 하나를 쓴다.
- 오브젝트 = 원자재 종류(대표 아이템 중분류) + 양 + 티어 범위: `gather_objects` `ladder` 칸을 지우고 굴림표가 아닌 47종에 `tierRange`(core@98 [임시], ADR 6절 표). 없으면 대표 아이템 티어 하나.
- 같은 규칙: `@terra/sim rollGatherOutputs`에 대표 아이템(`prefer`)·굴림표(`table`), 범위는 선택 방식에도. 서버 `gather/objectYield.ts objectRollOf`가 오브젝트 규칙을 만들고 직접 채집(`objectYieldItem`)과 채집소 일꾼(`StationPlan.lotRoll` → `labor/gatherWork.ts gatherLots`)이 같이 쓴다.
- 흡수: 플레이어 광산 칸 산지 막기(`gatherSiteOf tierCap`)와 플레이어 낚시터 물 종류 범위(`facilities/fishWater.ts` 지움)를 지웠다. NPC 배후지 쪽은 그대로(질문 1562).
- 편집기 `/dev/gather-objects`(새 지연 조각 `GatherObjectsScreen-*`): 목록·판(3D 모델·대표 아이템·양·티어 범위·바이옴·지표·천분율·미리 보기), 차이 내보내기(entries `gather_objects`). 자료는 `planetEditor.definitions`에 `gatherRefs`(원자재 아이템·중분류·확률표)를 더해 받는다. 미리 캐시 밖(`globIgnores`·`DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`), 개발 홈 도구 20개.
- 판: 팩 core@98, `SIM_VERSION` 45. 프로토콜 그대로.

## 추가: 기획 D-556(조율자 전달, 계획 커밋 ce1202e)
- 사용자 원문(1301·1302): "멋대로 개판을 만들어 놨네. 고래 같은 어류는 다 fishing 계열이지 뭘 또 새로 만든거냐?", "맞는 분류에 넣기". 중분류 `wild_goods`를 지우고 열 아이템을 어류(고래 고기·고래 기름·조개)·작물(베리·야생 과일·식물 섬유)·광석(소금·화석·이탄)·음료(물)로 옮겼다. ID 그대로, `id-changes.json`에 `item_subcategories/wild_goods`. 민물 고래는 오브젝트 범위(민물 T0~T2)로 막힌다. 경제 e2e 물건 수 161은 그대로(주석만).
- 1255·1256(유닛 추천 = 일터 레벨·오브젝트 범위, 최적 = 예상 티어 × 시세): WP-G1·질문 1569로 남김(구현 안 함).
- 질문 1567(물·섬유·이탄 분류)·1568(광산 T0 잡석이 1/4로) 추가.
- 측정(econ16 30일, Verified): 잡석 169,818 → 66,174, 소금·화석·이탄 각 약 67,000, 석재 118,842 → 57,024, 목재 그대로, NPC 짓기 836 → 863. ADR "바뀜 (D-556)".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/gather_tiers.json`·`gather_objects.json`·`id-changes.json`·`manifest.json` | 표 하나, 오브젝트 범위, 지운 ID 기록, core@98 |
| `content/core/items.json`·`item_subcategories.json` | D-556 자연 채집물 분류 없앰(아이템 분류만 옮김) |
| `apps/server/src/facilities/catalog.test.ts`·`itemEdit/previewGather.test.ts`·`e2e/economy.spec.ts` | 어류 사다리 29개·미꾸라지 같은 티어 셋, 주석 |
| `packages/content/src/schema/economy.ts`·`schema/gatherObjects.ts`·`validate/gather.ts`(+시험) | `ladder` 칸 지움, `gather_tier_range_table` 검사, 사다리 검사 지움 |
| `packages/shared/src/gatherMath.ts`·`buildingEditor.ts` | 띠 표 사다리 지움 |
| `packages/sim/src/economy/gather.ts`(+시험)·`simulator/economy.ts`·`index.ts`·`cli/common.ts`·`version.ts` | 표 하나, prefer·table·선택 방식 범위, SIM 45 |
| `apps/server/src/gather/objectYield.ts`(+시험)·`station.ts`·`kinds.ts`·`reads.ts` | 오브젝트 규칙 하나, 일꾼 묶음마다 오브젝트, 범위 조회 |
| `apps/server/src/labor/gatherWork.ts`(+시험)·`workBook.ts` | `lotRoll`, 시설 칸 tierCap·tierRange 지움 |
| `apps/server/src/facilities/world.ts`·`catalog.ts`·`fishWater.ts`(지움)·`world/world.ts` | 플레이어 산지 막기·물 종류 범위 지움, `itemTier` |
| `apps/server/src/planetEditor/*`·`content.ts` | 편집기 참고 자료 `gatherRefs` |
| `apps/server/src/{roster,itemEdit,buildingEdit}/*`(+시험) | 표 하나 |
| `apps/server/bench/gatherObjects.ts`(옛 `gatherLadders.ts`)·`resourceOverlap.ts`·`package.json` | 오브젝트 규칙 측정 벤치 |
| `apps/game/src/editor/gatherObjects/*`(새) | 채집 오브젝트 편집기 |
| `apps/game/src/editor/{production,gatherTiers,terrainObjects}/*` | 띠 표 고르기 지움, 지형 편집기 범위 칸 조건 |
| `apps/game/src/{shell/routeViews.tsx,scope/scopeRoutes.ts,sections/ComingSoon.tsx,editor/DevHome.tsx}`·`packages/shared/src/routes.ts`(+시험) | 새 경로 |
| `apps/game/messages/{ko,en}.json` | 편집기 문구 70개(ko·en), 띠 표 고르기 문구 2개 지움 |
| `apps/game/vite.config.ts`·`scripts/pwa-build.mjs`(+시험) | 개발 조각 미리 캐시 밖 |
| `scripts/apply-tuning-diff.test.mjs` | 채집 오브젝트 차이 적용 시험 |
| `e2e/gather-objects.spec.ts`(새)·`e2e/dev.spec.ts` | 편집기 화면 시험, 도구 20개 |
| `docs/adr/*`(새 1, 바뀜 3)·`docs/questions/2026-11-15-gather-objects-2.md` | 설계·질문 |

## 측정 (Verified)
- 시뮬 econ16 30일 시드 1(전 core@95/SIM 42 → 뒤 core@98/SIM 45, 위반 0): 목재 사다리 모두 그대로(소나무 85,884). 잡석 169,818 → 268,286, 석재 118,842 → 57,430(−52%), 광석 T0~T1 합 +12.8%, 구리 +13.5%, 철 +10.8%. NPC 짓기 836 → 850, 레벨 올림 450 → 468, 재료 모자람 165,290 → 137,547. 기본 건축 재료 T0~T1 합은 줄지 않았고 짓기도 줄지 않았다. 석재만 보면 준다(질문 1564).
- 채집소 일꾼(`pnpm --filter @terra/server bench:gather-objects`): 침엽수 곁 소나무 +12 ~ 21%, 바위 곁 석재 ×2.3 ~ 3.4, 두 곳 T0~T1 합은 같거나 늘었다(바위 곁 −1% 안쪽은 T1 진행이 길어서). 자세한 표는 ADR "구현하며 정한 것·측정".

## 시험 (Verified, 실행)
- 단위: content 136, sim 857(전체), server 관련 묶음 254 통과(+DB 84 건너뜀 — 아래 전체 검사 참고), game 편집기 묶음 82(그 가운데 layout.test 3개는 `apps/game`에서 vitest를 따로 돌린 탓 — 루트 설정으로 9/9), 편집기 모델 12, 적용 스크립트·pwa-build 28.
- e2e: `gather-objects`(6)·`dev`(15) 21 통과. `gather`·`gather-station`·`terrain-objects`·`gather-objects` 31 통과·1 건너뜀(측정, `E2E_MEASURE` 없음). D-556 뒤 `economy` 13 통과(물건 수 161 시험 포함), 배치·사진 12개는 공유 기계 디스크가 가득 차(0 MB, 다른 줄기와 함께 씀) 사진을 찍지 못해 실패 — 판정 실패가 아니다(Verified: `Page.captureScreenshot`·`Target crashed`·`ENOSPC`). 다시 돌려야 한다.
- 전체 `pnpm check`(TEST_DATABASE_URL): 시험 파일 709·시험 5,322 통과(D-556 뒤).
- 빌드·`check-pwa`·`check:bundle` 통과(첫 화면 JS 109,752 B / 상한 131,416 B).
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/gather-objects-2-shots/gather-objects-{neon,light}-{390,1440}.png`.

## 함께 바꿔야 하는 파일
- 오브젝트 규칙을 바꾸면 서버 `gather/objectYield.ts objectRollOf`와 편집기 `gatherObjectsModel.ts chancePreview`(같은 셈의 확률 판)를 함께 고친다.
- 팩 지표 이름이 늘면 편집기 `SURFACES`(게임 앱이 `@terra/content`를 가져오지 않아 옮겨 적음 — 시험이 팩 값이 목록 안인지 본다).

## 건드리지 말 것
- NPC 배후지의 산지 막기(`ore_flat_high_pm`·`ore_low_tier_max`)·물 종류 범위(`fish_tier_*`): 질문 1562 답 전까지 그대로.
- 건물 비용(D-551은 다른 줄기).

## 리셋 필요 여부
- 필요 없음: 팩·규칙 바뀜은 다음 굴림부터 든다. DB 표·저장 모양은 그대로다(Verified: 마이그레이션 없음).

## 미검증·TODO·알려진 문제
- 390px에서 판이 목록(49줄) 아래에 있어 고른 뒤 내려가야 한다(개발 화면이라 그대로 둠).
- 편집기 미리 보기는 선택 방식(농장·목장) 해금 티어와 목장의 함께 내는 중분류를 보지 않는다(문구로 알림).
- 일꾼 묶음이 쓰는 오브젝트는 정산 때 반경 안 상태로 정한다 — 오브젝트가 그 사이 바뀌면 "나눠 정산해도 같다"가 깨질 수 있다(Assumed, ADR 결과).

## 사용자 결정 대기
- 질문 1561~1569(대표 아이템 우선, NPC 배후지 규칙, D-551 전 소나무 오브젝트 범위, NPC 석재, 선택 방식 범위, 바다 물터, 물·섬유·이탄 분류, 광산 T0 잡석, 유닛 추천 시세 — WP-G1).
