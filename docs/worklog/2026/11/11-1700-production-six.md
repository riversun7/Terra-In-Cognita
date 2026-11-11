# 1차 생산 여섯 가지·생산 편집기·유닛 추천(생산 직군·전투 클래스)

- 일시: 2026-11-11 17:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-production-six.md`(제안), 질문 `docs/questions/2026-11-11-production-six.md`(946~960), 기획 D-513·D-529·D-507·43 §4, 조사 `docs/research/2026-11-02-old-primary-production.md`, 앞 작업 기록 `docs/worklog/2026/11/02-2135-gather-tier.md`·`02-2330-primary-production.md`, 가지 `work/production-six`(main `8370909`에서 시작)
- 사용자 원문(2026-11-11): "개선2. 생산에디터 : 예전 에디터가 아직 더 낫다. 3가지만 적용하는게 아니라 낚시 채집 등 6가지 전부에 적용하며 각각의 스탯이 주력 보조로 골고루 쓰이게 해야한다. 유닛 정보창에는 스탯에 따라 적합한 1차 생산직군 추천도 보이게 한다. 또한 전투계 스탯조합배열로도 적합한 클래스 추천 및 설명 추가."

## 한 일
- **1차 생산 여섯 가지(자료 + 규칙)** — 팩 core@61 → core@62
  - 새 시설 셋: 약초원 `herb_field`(INT/WIS, 확률 추첨, 약초 사다리, 수확량 1·100‰·8), 목장 `ranch`(WIS/AGI, 선택 + 효율, 축산물 사다리, 1·80‰·6), 낚시터 `fishing_spot`(AGI/DEX, 성공 확률 뒤 확률 추첨, 어류 사다리, 1·100‰·5). 앞 셋(광산 STR/VIT·벌목장 DEX/STR·농장 VIT/INT)과 합쳐 여섯 스탯이 주 한 번·보조 한 번씩 쓰인다(사용자 표 = 옛 `gather_type_config` = 기획 43 §4).
  - 낚시 성공 확률: 채집 칸 `catch {basePm 300, maxPm 800, statPm 500, fullStat 200}`(옛 `fishing_config` 0.30·0.80·0.50, 합 200). `@terra/shared/gatherMath` `gatherCatchPm`, 시뮬 `rollGatherOutputs` `successPm`, 서버 `gatherLots`, 아이템 편집기 채집 미리 보기. 팩 검사 `gather_catch_range`(상한 < 기본이면 오류).
  - 건설 재료·칸·내구도·창고: 약초원·낚시터 = 옛 `building_seed.js` HERB_GARDEN·FISHING_DOCK 값, 목장 = 농장 값([임시], 옛 시드에 목장 건물 없음). 겉모습 모델은 있는 것(`farm`·`lumber`)에 색만.
  - 레시피 셋(`gather_herbs`·`raise_livestock`·`catch_fish`, 한 번에 10번 캠 [임시]). 약초 덤불 오브젝트를 약초원이 맡음(오브젝트 채집소). 목장·낚시터는 농장처럼 시설 안 생산.
  - NPC 씨앗: 시설 표를 여섯 가지 한 표로(`npcSeed.ts` `SEED_GATHER`). 새 설정 칸 셋 `npc_seed_herb_fields`·`npc_seed_ranches`·`npc_seed_fishing_spots`(출발값 0 = 짓지 않음).
  - 난수 없는 1차 생산 셈을 `@terra/shared/gatherMath`로 옮기고 `@terra/sim`이 다시 내보낸다(식은 한 곳). `packages/sim/src/index.ts`는 990줄(1,000 상한 가까움 — 새 내보내기를 더하지 않았다).
- **생산 편집기 `/dev/production`**(`apps/game/src/editor/production/`)
  - 옛 편집기 짜임: 묶음 탭 줄 — 필드채집(벌목장 10·광산 10·약초원 30)·건물생산(농장 30·목장 13·낚시터 26)·2차가공(제련소 8·주방 1·공방 1·제재소 1·가마 1)·공용(확률 분포 12·스탯 매핑 6·전투 클래스 36·개요). 수 = 사다리 아이템·레시피·구간.
  - 생산 종류 탭: 주·보조 스탯, 방식, 수확량 칸(수 조작 칸 + 막대), 성공 확률 켜기·네 칸, 자리·창고, 사다리 표, 미리 보기(유닛 주·보조 스탯·시설 레벨 → 유효 스탯 → 구간/해금 티어 → 성공 확률·진행 속도·한 번에 N개·한 번 평균 분·시간당 기대 산출, 티어 확률 띠).
  - 스탯 매핑 탭: 여섯 시설 주·보조 스탯 한 표 + 스탯마다 쓰임 표. 스탯마다 주 하나·보조 하나가 아니면 알림(막지 않음).
  - 확률 분포 탭: 옛 `/dev/gather-tiers` 화면(전체 구간 프리셋·구간 조절 판·행렬)을 탭으로 옮김. `GatherTierScreen.tsx`는 지웠고 부품(`editor/gatherTiers/`)은 그대로 쓴다. 주소 `/dev/gather-tiers`는 이 탭으로 열린다(주소 줄의 부모 = `dev_production`).
  - 전투 클래스 탭: 분류 규칙·분류 미리 보기(여섯 스탯 → 클래스), 클래스마다 이름·주요 역할·설명(ko·en) 고치기.
  - 개요 탭: 여섯 가지 한 표 + 표본 스탯 10·30·60·100의 시간당 기대 산출.
  - 서버: 건물 편집기 묶음 `buildings.*`에 `put_combat_class`·`revert_combat_class`, 목록 칸 `gatherRules`(N32·N44·새 유닛 평균)·`combatClasses`·`classRule`. 담기 → 검사 → 적용, 내보내기·최근 바꿈 그대로.
  - 개발자 홈: 1차 생산 티어 확률 줄 → 생산 편집기 줄(도구 수 17 그대로). 미리 캐시 밖 조각 규칙 `[Pp]roductionEditor`·소스 `production`.
- **전투 클래스 표**(기획 D-529): 새 분류 `content/core/combat_classes.json` 36줄 — 2스탯 15(분류·주요 역할 = 옛 문서 §6.2), 3스탯 20(조합 = 옛 코드 `class_detector.js`), 범용. 설명 = 옛 화면 `classDetection.ts`. 설정 칸 `class_three_stat_pm` 600·`class_generalist_pm` 800(계수표 `combatClass`). 덮어쓰기 분류에 `combat_classes`(마이그레이션 `20261111070857_content_overrides_combat_classes`, 검사 넓히기만).
- **유닛 추천**(`@terra/shared/unitGuide`, tRPC `units.guide`, `roster/UnitAdvice.tsx`)
  - 추천 1차 생산: 유효 스탯(주 + 보조) 위 둘 + 까닭("STR 주력 43 · VIT 보조 40 (유효 스탯 83)").
  - 추천 전투 유형: 클래스 이름·조합·주요 역할·설명. 분류는 정수 곱(S3 × 1000 ≥ S1 × 600, S6 × 1000 ≥ S1 × 800), 같은 값은 STR·VIT·INT·WIS·DEX·AGI 차례.
  - 보이는 곳: 유닛 상세, 사이보그 화면, 구인 카드(한 줄), 2차맵 내 유닛 목록의 고른 유닛(한 줄 — `MapUnit.stats` 칸을 더함). 풀이 줄: 제안일 뿐이고 전투 유형은 규칙 효과 없음.

## 검증
- 시뮬(Verified, 실행): `pnpm --filter @terra/sim sim econ16 --seed 1 --days 30` 앞(작업 트리 stash)·뒤 — 위반 0, 본문 줄 620개 같음(머리·요약 줄의 팩 판·해시만 다름: `linesHash` d06dfa41 → 0f2ab684). `SIM_VERSION` 그대로(22).
- `pnpm check:content origin/main`(Verified): core@62 통과, 단계 1·2·4a·4b.
- 단위·DB 시험(Verified, `TEST_DATABASE_URL=… pnpm test`, 편집기 화면을 쓰기 전 판): 583파일 중 582 통과·4,511개 통과, 실패 1 = `scripts/apply-tuning-diff.test.mjs`(가져오기 빠뜨림 — 고친 뒤 그 파일 통과). 그 뒤 더한 시험은 아래 "마지막 검사"에서 다시 돌렸다.
- 새·고친 시험
  - `packages/shared/src/unitGuide.test.ts`(12): 추천 차례·같을 때·스탯 짝 고르게, 분류 문턱 경계(딱 0.60·하나 모자람), 범용, 같은 값 차례, 표에 없는 조합.
  - `packages/sim/src/economy/gather.test.ts`(+3 성공 확률), `simulator/productionSix.test.ts`(5: 세 시설 일꾼 효과·시뮬 경제 산출·결정적).
  - `packages/content/src/validate/gather.test.ts`(3: `catch` 범위·스키마).
  - `apps/server/src/labor/gatherWork.test.ts`(+2: 약초원·목장, 낚시터 성공 확률·나눠 셈해도 같음), `facilities/npcSeed.test.ts`(+1: 여섯 가지 씨앗 표), `gather/station.db.test.ts`(+1 DB: 목장·낚시터 직무 배치 → 채집소 창고), `roster/guide.test.ts`(5: 팩 스탯 짝 = 사용자 표, 클래스 36 = 2스탯 15 + 3스탯 20 + 범용, 옛 예시 이름), `buildingEdit/buildingEdit.db.test.ts`(+1 DB: 스탯 짝·클래스 이름 고치면 `units.guide`가 바뀜, 겹치는 조합 거절, 만들기 거절, 되돌리기), `itemEdit/previewGather.test.ts`(+1: 약초·축산물·어류 미리 보기).
  - `apps/game/src/editor/production/productionModel.test.ts`(11: 담은 변경·미리 보기 기대값·탭 주소).
- 화면 시험(Verified, `pnpm e2e e2e/production.spec.ts --workers=1`, 헤드리스 Chromium): 8개 통과(1.5분) — 탭 줄·수, 스탯 매핑을 바꿔 담고 적용 → `units.guide`·광산 탭 미리 보기 바뀜 → 되돌림, 낚시터 성공 350‰, 개요·가공 시설, 전투 클래스 분류 미리 보기·이름 고치기, 플레이어 권한 없음, 유닛 상세·사이보그 추천(파스텔·다크), 넘침·작은 누르는 곳 없음(네온 1440·라이트 1440·네온 390).
- 마지막 검사(Verified, 커밋 `36f4395` 코드): `TEST_DATABASE_URL=… pnpm check` — 포맷·린트·타입·경계·크기(경고만)·다국어(6,221키)·대비(738쌍, 화면 CSS 93개)·콘텐츠(core@62)·단위·DB 시험 583파일 4,521개 통과.
- 화면 시험 넓게(Verified, `pnpm e2e e2e/production.spec.ts e2e/gather-tiers.spec.ts e2e/dev.spec.ts e2e/buildings.spec.ts e2e/units.spec.ts e2e/recruit.spec.ts e2e/unit-control.spec.ts --workers=1`, 26.7분 — 여섯 줄기가 한 기계를 같이 써 느렸다): 90개 중 88 통과, 실패 2.
  - `gather-tiers.spec.ts` 끌어 채우기(둘째 줄 값이 696, 기대 692): 진짜 버그 — 확률 분포 탭이 그림 때의 담음으로 고쳐 한 그림 안에 이어진 고침의 앞 것을 잃었다. 가장 새 담음에서 고치게 바꿨다(`ProductionTiersPanel` `onStage`가 함수를 받는다).
  - `production.spec.ts` 첫 시험: 시험 기대가 틀렸다(유효 스탯 20은 둘째 구간 20~39 = 번호 1).
  - 고친 뒤 두 파일 다시(Verified, `pnpm e2e e2e/production.spec.ts e2e/gather-tiers.spec.ts --workers=1`, 1.7분): 20개 중 19 통과 — `production.spec.ts` 8개 모두 통과. `gather-tiers.spec.ts` 끌어 채우기는 또 실패(같은 값 696): 모델을 같은 차례로 돌려 보니 692가 나온다(임시 시험으로 확인 — 더하기 10 → 선형 → 세 줄 채우기) → 셈이 아니라 끌기 자리 문제다. 생산 편집기 탭이 되어 표가 화면 아래로 내려가 셋째 줄이 아래 담은 변경 막대에 가려 끌기가 둘째 줄에서 끝났다. 시험이 끌기 전에 줄을 화면 가운데로 올리게 고쳤다. 그 시험 하나를 다시 돌린 결과는 "미검증" 절 첫 줄.
- 빌드 검사(Verified, 위 화면 시험이 만든 빌드): `node scripts/check-pwa.mjs` 통과(미리 캐시에 `ProductionEditorScreen-*` 없음 — `sw.js`에서 확인), `pnpm check:bundle` 첫 화면 JS 108,202 B / 상한 131,416 B. 생산 편집기 조각 `ProductionEditorScreen-*.js` 약 82kB(gzip 24kB).
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/production-six-shots/` — `production-mine-neon-1440.png`, `production-overview-neon-1440.png`, `production-mapping-light-1440.png`, `production-classes-light-1440.png`, `production-fishing_spot-neon-390.png`, `unit-advice-detail-pastel-390.png`, `unit-advice-detail-dark-390.png`, 확률 분포 탭 `gather-tiers-{neon,light}-{ko,en}-{390,1440}.png`. 눈으로 본 것: 광산 네온 1440, 개요 네온 1440, 스탯 매핑 라이트 1440, 전투 클래스 라이트 1440(그 뒤 줄 왼쪽 맞춤·스탯 칸 여섯 한 줄로 CSS를 고쳤다 — 고친 뒤 사진은 보지 않음), 낚시터 네온 390, 유닛 추천 파스텔 390, 확률 분포 네온 1440.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/facilities.json`·`recipes.json`·`gather_objects.json`·`tuning.json`·`combat_classes.json`(새)·`manifest.json` | 새 시설 셋·레시피 셋·약초 덤불 시설·설정 칸 다섯·전투 클래스 표, core@62 |
| `packages/content/src/schema/economy.ts`·`combatClasses.ts`(새)·`categories.ts`·`index.ts`·`tuningDiff.ts`, `validate/gather.ts`·`combatClasses.ts`(새)·`pack.ts`, `scripts/apply-tuning-diff.mjs` | 채집 칸 `catch`, 새 분류와 검사, 내보내기·넣기 분류 |
| `packages/shared/src/gatherMath.ts`(새)·`unitGuide.ts`(새, +시험)·`buildingEditor.ts`·`contentEdit.ts`·`mapUnits.ts`·`routes.ts`(+시험)·`package.json` | 공용 셈, 추천 함수·표 모양, 편집기 묶음 모양, 덮어쓰기 분류, 목록 줄 스탯, 주소 줄 |
| `packages/sim/src/economy/gather.ts`(+시험)·`simulator/catalog.ts`·`economy.ts`·`productionSix.test.ts`(새)·`society/coefficients.ts`·`worldSeed.ts`·`tuning.ts`·`tuningWorldSeed.ts`·`index.ts`, `cli/common.ts` | 성공 확률, 다시 내보내기, 계수·설정 칸 |
| `packages/engine/src/buildings/buildingLook.ts` | 겉모습 자료가 없을 때의 모델(새 세 시설) |
| `apps/server/src/labor/gatherWork.ts`·`facilities/catalog.ts`·`npcSeed.ts`·`market/catalog.ts`·`itemEdit/previewGather.ts`·`tuning/scope.ts`(+시험들) | 성공 확률 넘김, 씨앗 표, 미리 보기, 반영 범위 |
| `apps/server/src/buildingEdit/services.ts`·`views.ts`, `trpc/buildings.ts`, `contentEdit/core.ts`·`state.ts`, `db/contentEditSchema.ts`, `drizzle/20261111070857_content_overrides_combat_classes/` | 전투 클래스 바꿈·목록 칸, 실효 `combatClasses`, DB 검사 넓힘 |
| `apps/server/src/roster/guide.ts`(새, +시험)·`services.ts`, `trpc/roster.ts`·`context.ts`, `app.ts`, `worldMap/mapUnits.ts`·`reads.ts` | `units.guide`, 2차맵 내 유닛 줄의 스탯 |
| `apps/game/src/editor/production/*`(새), `editor/gatherTiers/GatherTierScreen.tsx`(지움), `editor/DevHome.tsx`, `editor/buildings/buildingModel.ts`·`buildingMessages.ts`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `vite.config.ts`, `scripts/pwa-build.mjs`(+시험) | 생산 편집기, 옛 화면을 탭으로, 홈 줄·조각 규칙 |
| `apps/game/src/roster/UnitAdvice.tsx`·`unitAdvice.css`·`useUnitGuide.ts`(새), `units/UnitDetail.tsx`, `cyborg/CyborgScreen.tsx`, `economy/RecruitPanel.tsx`, `map/UnitControlPanels.tsx` | 유닛 추천 칸 |
| `apps/game/messages/ko.json`·`en.json` | 문구 143개(ko·en) |
| `e2e/production.spec.ts`(새)·`gather-tiers.spec.ts`·`dev.spec.ts` | 화면 시험 |
| ADR 새 하나 + 바뀜 셋, PLAN 14장, 질문 946~960 | 기록 |

## 함께 바꿔야 하는 파일
- 여섯 가지 스탯 짝: 팩 `facilities.json` `gather` ↔ 시험 `apps/server/src/roster/guide.test.ts`(사용자 표) ↔ ADR 표.
- 전투 클래스 문턱: 팩 `tuning.json` `class_*` ↔ `TEST_SOCIETY_COEFFICIENTS.combatClass` ↔ `@terra/shared/unitGuide` `OLD_COMBAT_CLASS_RULE`(시험이 셋이 같은지 본다).
- 덮어쓰기 분류: `@terra/shared` `CONTENT_EDIT_CATEGORIES` ↔ `@terra/content` `ENTRY_DIFF_CATEGORIES` ↔ `scripts/apply-tuning-diff.mjs` `ENTRY_FILES` ↔ `db/contentEditSchema.ts` 검사(마이그레이션).
- 묶음(필드채집·건물생산) 판단: `@terra/shared/unitGuide` `productionGroupOf`(서버 `roster/guide.ts`와 편집기 `productionModel.ts`가 같이 쓴다).
- 성공 확률 칸을 옮기는 곳: 서버 `facilities/catalog.ts`·`market/catalog.ts`·`buildingEdit/views.ts`, 시뮬 `cli/common.ts`, 화면 `buildings/buildingModel.ts` `cleanGather`(빠뜨리면 저장 때 칸이 사라진다).
- 생산 편집기 조각 이름: `vite.config.ts` `globIgnores` ↔ `scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`.

## 건드리지 말 것
- 사용자 표의 스탯 짝(팩 값). 편집기에서 시험 삼아 바꿔도 팩 파일은 사용자 확인 전에는 그대로 둔다.
- 전투 클래스의 한국어 이름·조합(옛 표 그대로, D-529). 영어 이름은 질문 952·953 답 뒤.
- `packages/sim/src/index.ts`(990줄): 새 내보내기를 더하면 1,000줄 상한에 걸린다(나눌 때까지 `@terra/shared/gatherMath`에서 바로 가져온다).

## 미검증·TODO·알려진 문제
- (Verified) 끌어 채우기 시험을 고친 뒤 그 하나만 다시(`pnpm e2e e2e/gather-tiers.spec.ts --grep "행렬 묶음" --workers=1`): 통과(16.1초). 고친 뒤 `production.spec.ts`·`gather-tiers.spec.ts` 전체를 한 번에 다시 돌리지는 않았다(앞 회차에서 그 밖의 19개 통과).
- 낚시터 물가 조건 없음(놓기 규칙에 땅 조건이 없다, 질문 947). 목장 사다리는 축산물만(질문 946).
- 약초·어류·축산물을 쓰는 레시피·생필품이 없다(질문 951). NPC 도시는 새 세 시설을 짓지 않는다(씨앗 0, 질문 950).
- 새 세 시설의 전용 2차맵 모델 없음(약초원·목장 = 농장 모델, 낚시터 = 벌목장 모델에 색만) — 건물 그림 후속.
- 2차맵 내 유닛 목록의 추천 한 줄은 화면 시험이 없다(미실행: 서버 목록에 `stats`가 실리는 것은 타입·코드로만 확인). 구인 카드의 한 줄도 화면 시험에서 따로 보지 않았다.
- 사람이 아닌 기본 스탯 유닛(스탯을 저장하기 전)은 스탯이 고르면 추천이 표 차례·범용으로 나온다.
- 건물 편집기 채집 구역에는 성공 확률 칸이 없다(생산 편집기에서만 고친다. 건물 편집기는 그 칸을 지키기만 한다). 같은 스탯 짝을 두 화면에서 고칠 수 있다(질문 960).
- 미리 보기 기대값은 채집소 버프·피로·창고 상한·오브젝트 번수를 넣지 않는다(화면에 적음).
- 옛 PWA 기기(새 서버, 옛 화면)는 `units.guide`를 부르지 않아 추천이 없고, 목록의 `stats`·편집기 목록의 새 칸은 모르는 칸으로 둔다(미실행).

## 사용자 결정 대기
- 질문 946~960(`docs/questions/2026-11-11-production-six.md`): 목장 사다리(축산물·부산물), 낚시 물가, 새 시설 값, NPC 씨앗, 가공 사슬, 클래스 영어 이름·수행 사제 이름, 상성·고유 스킬, 3스탯 표와 문서 예시의 차이, 같은 값 차례, 범용 문턱, 추천을 보일 곳·기준, 건물 편집기 채집 구역.
