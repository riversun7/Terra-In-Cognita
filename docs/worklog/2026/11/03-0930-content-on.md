# 콘텐츠 켬·끔 없앰(시설 늘 켜짐, 꺼진 아이템·레시피 켬)과 건물 화폐 유지비 없앰 (core@32)

- 일시: 2026-11-03 09:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-02-building-editor.md` "바뀜 (2026-11-03 …)"·`docs/adr/2026-11-01-item-editor.md` "바뀜 (2026-11-03 …)"·`docs/adr/2026-10-31-economy-core.md` "바뀜 (2026-11-03 …)", 질문 `docs/questions/2026-11-02-gather-tier.md` 끝 절(사용자 답 2026-11-03), 기획 정정 미러 `80272e5`(원본 3b0e949: D-508 정정·D-171·49 M14·N50), 가지 `work/content-on`

## 한 일
- 사용자 답(원문) "켜고 끄는건 말이 안된다. 다른 재료로 바꾸면 되지 왜 복잡하게 만드나?"를 반영했다.
  - 시설: 팩 스키마에서 `enabled`를 뺐다(늘 켜짐). 시뮬·서버의 시설 거르기를 지웠다. 옛 덮어쓰기 줄(core@31)의 `enabled`는 `legacy.ts`가 빼고 읽는다(꺼 둔 줄도 켜진 시설로, 다른 고친 칸은 남음).
  - 건물 편집기 `/dev/buildings`: 편집 판의 [켜기] 칸, 시설 표의 "꺼짐" 표지, 그 메시지 키 둘을 지웠다.
  - 팩 core@32: 꺼진 채 넣었던 아이템 138개와 제련 레시피 7개를 켰다(아래 목록).
- 조정자 전달(기획 정정, 미러 `80272e5`를 main에서 합침): 건물 화폐 유지비 없음(D-171, 49 N50). 설정 칸 `m14_upkeep_pm`·`m14_upkeep_min`, 계수표·공용 식(`buildUpkeepAt`)·서버 응답·레벨 표 "유지비/일" 열을 뺐다. 제재소·가마 레시피는 49 N50의 기본 시간·수량과 같음을 확인했다(성공 확률·스탯 시간 식은 모델에 없어 다음 줄기).
- `SIM_VERSION` 9 → 10.

### 켠 것
| 분류 | 항목 | 수 |
|---|---|---|
| items | `plank`·`brick` | 2 |
| items | 옛 자원(광석 `silver_ore`·`titanium_ore`·`gold_ore`·`platinum_ore`·`mithril`·`orichalcum`, 목재 `maple_log`~`ebony_log` 7, 작물 30, 약초 30, 어류 26, 목축 산물 13, 목축 부산물 17) | 129 |
| items | 괴 `copper_ingot`·`silver_ingot`·`titanium_ingot`·`gold_ingot`·`platinum_ingot`·`mithril_ingot`·`orichalcum_ingot` | 7 |
| recipes | `smelt_copper`·`smelt_silver`·`smelt_titanium`·`smelt_gold`·`smelt_platinum`·`smelt_mithril`·`smelt_orichalcum` | 7 |
| facilities | `sawmill`·`kiln`(칸 자체를 없애 늘 켜짐, 다른 시설 여섯도 칸 지움) | 2 |
- `saw_planks`·`fire_bricks`는 이미 켜져 있었다. effects·skills·unit_kinds·weapon_types·nation_presets·necessities·item_subcategories에는 꺼진 항목이 없었다(item_tags는 비어 있음).

### 끈 채 둔 것(까닭)
| 분류 | 항목 | 까닭 |
|---|---|---|
| items | `dev_placeholder` | 팩 형식 확인용 임시 아이템(문서 대분류, 2026-10-28 처음 팩). 콘텐츠가 아니다 |
| stat_rows | `hit`·`crit_chance`·`action_speed` | 사용자 답 297·298로 명중·크리·공격 간격이 무기 값 × 1차 비율이 되어 판정이 쓰지 않는 옛 점수 행(ADR `2026-10-31-combat-core.md` "바뀜 (D-502)", 켜면 사이보그 풀이·밸런스 표에 판정과 상관없는 수가 보임) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/items.json`·`recipes.json`·`facilities.json`·`manifest.json`(32) | 아이템 138·레시피 7 켬, 시설 `enabled` 칸 지움 |
| `content/core/tuning.json`·`id-changes.json` | M14 유지비 칸 둘 지움 + 지움 기록(since 32) |
| `packages/content/src/schema/economy.ts` | 시설 스키마에서 `enabled` 뺌 |
| `packages/content/src/validate/facilities.ts`·`.test.ts` | `build_material_disabled`가 모든 시설을 봄(켜진 시설 조건 뺌), 시험: 시설 `enabled`는 스키마 오류 |
| `packages/shared/src/facilityBuild.ts`·`.test.ts`, `buildingEditor.ts` | 유지비 규칙·`buildUpkeepAt` 뺌, `FacilityJson.enabled` 뺌 |
| `packages/sim/src/simulator/catalog.ts`·`testEconomy.ts`, `cli/common.ts` | 시뮬 경제 목록의 시설 `enabled` 뺌(거르지 않음) |
| `packages/sim/src/tuningBuild.ts`, `society/coefficients.ts` | M14 유지비 설정 칸 둘 뺌 |
| `packages/sim/src/version.ts` | `SIM_VERSION` 10 |
| `apps/server/src/contentEdit/legacy.ts`·`legacy.test.ts` | 옛 시설 줄 `enabled` 빼고 읽기(`upgradeFacility`) |
| `apps/server/src/economyView/catalog.ts`, `roster/catalog.ts`, `itemEdit/previewGather.ts` | 시설 거르기 지움 |
| `apps/server/src/itemEdit/previewGather.test.ts` | 은·작물이 켜져 확률이 바뀜(철 Lv5 7 → 6%, 감자 T1 셋이 나눔, 은 끄면 0) |
| `apps/server/src/buildingEdit/views.ts`·`services.ts`·시험 둘 | 시설 JSON `enabled` 뺌, `rules` 유지비 칸 뺌, 꺼진 재료 권고 시험은 `dev_placeholder`로 |
| `apps/server/src/tuning/scope.ts` | 유지비 경로 둘 뺌 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`·`BuildingList.tsx`·`BuildingLevels.tsx`·`buildingModel.ts`·`.test.ts` | [켜기] 칸·꺼짐 표지·유지비 열 지움 |
| `apps/game/messages/ko.json`·`en.json` | `dev_buildings_field_enabled`·`_hint`·`dev_buildings_col_upkeep` 지움, 화면 머리글(`dev_buildings_lead`: 늘 켜짐·유지비 뺌)·레벨 표 풀이 고침 |
| `scripts/apply-tuning-diff.test.mjs` | 시설 시험 고정값에서 `enabled` 뺌, 옛 `enabled` 시설 줄은 invalid로 건너뜀 |
| `e2e/buildings.spec.ts`·`items.spec.ts`·`economy.spec.ts` | 꺼짐 표지 없음·켜기 칸 없음, 광산 Lv5 철 6%, 거래할 물건 12 → 150 |
| `docs/PLAN.md` | D-398 줄에 "바뀜" 한 줄 |
| `docs/adr/…`(셋), `docs/questions/2026-11-02-gather-tier.md` | "바뀜" 절, 끝 절 반영 줄 |

## 검증
- 시뮬 앞·뒤(Verified, 시드 1, 각 한 번. 앞 = main `0c77944`/core@31/SIM 9, 뒤 = 이 가지 마지막 팩/core@32/SIM 10, 팩 해시 e1b8b132…)

| | war16 30일 | stub16 180일 | econ16 180일 |
|---|---|---|---|
| `linesHash` | b34b5aab → 75186202 | 9af47d1a → 574771f5 | 5ce9c31b → 74a652fe |
| 줄 수 | 230 → 230 | 403 → 403 | 1,944 → 1,944 |
| 머리 칸 뺀 본문 줄 | 모두 같음 | 모두 같음 | 요약 줄 하나만 다름 |
| 철광석 · 철 주괴 생산 | — | — | 19,986,000g · 13,902 → 같음 |
| 판자 · 벽돌 생산 | — | — | 0 · 0 → 같음(도시 계획에 제재소·가마 없음) |
| 재료 모자람 · 배급 · 생활용품 모자람 | — | — | 214,236 · 575,569 · 122,017 → 같음 |
| 체결 · 거래소 | — | — | 565 · 768 → 565 · 5,184 |
| 끝 유닛 | 1,068 → 같음 | 1,064 → 같음 | 474 → 같음 |
| 위반 | 0 | 0 | 0 |
  - econ16 걸린 시간: 앞 81.9초, 뒤 141.1초(다른 일 없이 한 번 더 잼. 처음 잰 207.8초는 단위 시험과 겹침). 같은 기계를 다른 가지들이 함께 써서 값이 흔들린다(Assumed: 거래소 6.75배가 주 원인).
  - 본문이 같은 까닭: econ16 도시 계획(시나리오 `cityPlan`)에 새 레시피(제련 7·제재·소성)가 없고, 광부 STR + VIT 20은 0~39 구간이라 T3까지만 뽑는다. 거래소만 도시 × 켜진 물건으로 늘었다.
- 단위 시험·검사: 아래 "마지막 검사" 칸.
- 화면 시험: 아래 "마지막 검사" 칸.

## 마지막 검사
- `pnpm check:content origin/main`(Verified): core@32 (e1b8b132131f) 통과, 단계 1·2·4a·4b(기준 `80272e5`).
- `pnpm check:contrast`(Verified): 테마 4개 + 개발 화면 2개 738쌍 통과, 직접 쓴 값 없음.
- `pnpm settings:cells --check`(Verified, main `80272e5` 미러를 합친 뒤): 최신. M14는 남은 칸(시간 kg당·레벨 계수)으로 계속 연결.
- `pnpm check:bundle`(Verified, e2e 빌드): 첫 화면 JS 105,575 B / 상한 131,416 B. 건물 편집기 조각 `BuildingEditorScreen-*.js` 40,683 B(원본).
- 화면 시험(Verified, `TEST_DATABASE_URL=… E2E_SHOTS_DIR=… pnpm e2e e2e/buildings.spec.ts e2e/items.spec.ts e2e/economy.spec.ts --workers=1`, 헤드리스 Chromium): 73개 모두 통과(10.9분). 그 뒤 화면 머리글 문구(`dev_buildings_lead`)를 고쳐 `e2e/buildings.spec.ts`만 다시 돌림: 11개 통과(1.8분).
- `TEST_DATABASE_URL=… pnpm check`(Verified, 마지막 코드·main `80272e5` 합친 뒤): 포맷·린트·타입·경계·크기·다국어(3,429키)·대비·콘텐츠(core@32)·단위 시험 381파일 3,203개 통과. 첫 판에서 `previewGather.test.ts` 셋이 실패(은·작물이 켜져 확률이 바뀜) → 고침.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/content-on/shots/` — `buildings-{neon,light}-{ko,en}-{390,1440}.png`(편집 판에 [켜기] 칸 없음, 표에 꺼짐 표지 없음), `buildings-levels-*`(레벨 표에 유지비 열 없음, 판자·벽돌 꺼짐 표지 없음), `buildings-list-*-390`, `items-gather-preview-*`(광산 Lv5 철 6%). 눈으로 본 것: 네온 한국어 1440, 라이트 영어 1440, 라이트 한국어 390 레벨 표.

## 함께 바꿔야 하는 파일
- 시설 칸을 더하거나 뺄 때: 팩 스키마(`economy.ts`) ↔ `@terra/shared` `FacilityJson` ↔ 서버 `facilityJsonOf` ↔ 화면 `cleanFacility`·`mergeFacility`(시험 `views.test.ts`가 팩 줄 = 화면 JSON을 본다).
- 옛 모양 덮어쓰기 줄을 읽는 규칙은 `apps/server/src/contentEdit/legacy.ts` 한 곳.
- 설정 칸을 지우면 `tuning.json`과 `id-changes.json` `removed`를 같이, 계수표·`tuning/scope.ts` 경로도 같이.

## 건드리지 말 것
- 아이템 편집기의 [켜기]·끄기·새 아이템을 꺼진 채 만드는 규칙(조정자 확인 전).
- `dev_placeholder`·옛 점수 행 셋의 끔.

## 미검증·TODO·알려진 문제
- NAS 세계 DB에 core@31 시설 덮어쓰기 줄(`enabled` 포함)이 있는지는 모른다(Unknown). 있으면 켤 때 서버 기록 `content boot` `upgraded`에 키가 남는다. M14 유지비 설정 칸 덮어쓰기 줄이 있으면 켤 때 `unknown_entry`로 버려진다.
- 옛 PWA 기기(새 서버, 옛 화면)의 건물 편집기는 저장할 때 시설 `enabled`를 보내 스키마 오류가 난다. 개발 화면이라 새로 고침으로 푼다(미실행).
- 제재소·가마의 성공 확률(95%·92%), 레시피 스탯(DEX·STR), 스탯·유닛 수 시간 식(clamp 0.3~2.0·√유닛 수), "유닛 필요"는 레시피 모델에 없어 넣지 않았다(49 N50, 다음 줄기: 레시피 편집기·가공 규칙).
- N50 수리 비용 미리 보기(건설 재료 × 10%)는 최대 내구도(M15)와 수리 설정 칸이 없어 넣지 않았다.
- 거래소 수가 도시 × 물건으로 늘어 econ16이 느려졌다. 쓰이지 않는 물건 시장을 늦게 여는 것은 다음 줄기(시뮬 성능).

## 사용자 결정 대기
- 아이템 편집기의 끄기(지우기 = ID 은퇴 대신 세계에서 쉬게 함)와 "새 아이템·복제는 꺼진 채 만듦"을 남길지(사용자 말은 콘텐츠 켬·끔 전체를 겨냥). 효과 사전 끄기·아이템·레시피 팩 칸 `enabled`도 같은 물음.
- `SIM_VERSION` 10: 본문 판정은 그대로라 기존 규칙("같은 입력의 결과가 바뀌면")으로는 9로 둘 수도 있었다. 조정자 요청대로 올렸다.
