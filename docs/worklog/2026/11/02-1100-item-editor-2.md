# 아이템 편집기 2차: 장비 전투 연결·크리쳐 3칸·효과 사전·소모품 효과량·대량 도구(WP-5·WP-C·WP-6·WP-7)

- 일시: 2026-11-02 11:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md`·`docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-02)", 설계안 `docs/research/2026-11-01-item-editor-design.md` 6장, 질문 `docs/questions/2026-11-01-item-editor-3.md`(292~295, 답 기다림), 옛 자원 변환본 `docs/research/2026-11-02-old-resources-draft.md`·`.json`, 가지 `work/item-editor-2`(main `ce6b763`에서, main `266cdbc` 개발 화면 층을 합침), 커밋 `a9da9f5`(기능)·`6574919`(main 합침)·`253d959`(개발 화면 층 모양·e2e)·`2dd1fc1`(DB 시험)·이 기록과 같은 커밋(문서)

## 한 일
- WP-5 장비 → 전투
  - 장비 정의·입은 물건에 속성값·직접 값(속성 저항 ‰·고정 방어·비율 관통 ‰)·양손·입을 종류·1차 적정 스탯을 나르고 `loadoutOf`가 셈한다(유닛 화면·사이보그·전투 실험실·시뮬 `combatRun`이 같은 함수). 속성값은 `sumElementSources`(칸마다 10, D-450). 양손 무기를 들면 보조 칸, 입을 종류가 아니면 그 물건을 빼고 셈한다(던지지 않음).
  - 1차 적정 스탯(290) → 그 세계의 실효 가중치 표로 셈한 2차 적정치를 전투가 쓴다(`equipmentAppropriate.ts`, 표가 바뀌면 `withStatTable`). 예: STR 25·DEX 15 → 물리 59·명중 18·크리 22·속도 54.
  - 미리 보기 무기 판에 셈한 2차 적정치·기준 유닛 효율(예: 기준 유닛 1차 모두 10 → 물리 공격 26 ÷ 59 = 440‰, 시험 검 실제 공격 8. 직접 적정 40이면 650‰·13)·상한, 장비 판에 빠진 물건.
  - `test_heart` 속성값(불 2·냉기 3)을 팩으로 옮기고 `roster/preview.ts`의 하드코딩 줄을 지웠다(시뮬 시험 자료·`combatCatalog.test` 같은 값).
- WP-C 크리쳐 장비 3칸(D-494): 팩 creature 칸 = 무기·방어구·장신구. 유닛 화면 시안(Rex 반지 칸 2)·전투 실험실 늑대·골렘 샘플(장신구 칸 2)·시험 자료를 같은 커밋에서 고쳤다. 크리쳐 전용 장비를 편집기에서 만들고 미리 보기·전투 실험실에 입힌다(사람형에 입히면 `dropped` `unit_kind`).
- WP-6 소모품·효과 사전
  - `use` 줄 `scale {stat, pmPerPoint}`·`variancePm`, 미리 보기 효과량(BigInt 내림, 오차 기본 = 설정 칸 `d496_use_variance` 250‰). 예: 기준 40·VIT 10‰/점 → VIT 10이면 44(33~55), VIT 39면 55(41~68), 줄 오차 100‰면 49~60.
  - 신선도·바뀌는 아이템(288) 칸. [효과 사전] 탭(고치기·새로·끄기·되돌리기, 쓰는 아이템·스킬), 덮어쓰기 분류 `effects`, 스킬 편집기 효과 고르기도 실효 효과. 효과 사전 `stat` 1차 6개·`exclusive`(D-472) — 판정은 아직 안 읽음.
- WP-7 대량 도구: JSON·CSV 내보내기·가져오기(줄 번호 문제, 새로 / 고침 / 같음, 담은 변경에만, 묶음 검사 한 번), 여러 개 고치기(`patch` 명령, 서버가 지금 항목에 그 칸만, 기준 가치 BigInt 0.5 올림). 상한: 글 900 KiB, 300줄·300개, 항목 4 KiB, 고르기 300개, ‰ −900~+10,000. 옛 1차 자원 136개 변환본(문서만, 팩 밖).
- 탄약·내구도(291·289, 자료만): 무기 종류 `ammo: true`(화살통·탄창) → 그 장비의 최대 내구도 = 담는 탄 수로 적는다. 설정 칸 `d496_wear_battle` 1·`d496_wear_loss` 4([임시], 연결 없음).
- 개발 화면 층(main `266cdbc`)에 맞춤: 목록 한 줄 줄(카드 약 75px → 넓은 화면 한 줄, e2e가 34px 이하를 본다. 터치 크기 줄 32px + 테두리, 마우스는 28px + 테두리), 네모 표지, 효과 표 `.dev-table`, 분류 줄무늬, 버튼 글자 폭. e2e 사진은 개발 테마 네온·라이트, 보이는 화면 크기.
- 팩 core@24 → core@25(`items` test_heart 속성값, `unit_kinds` 크리쳐 칸, `weapon_types` 화살통·탄창 `ammo`, `tuning` 설정 칸 셋). `id-changes.json`은 그대로(지우거나 바꾼 ID 없음).
- 질문 292~295를 썼다(소모품 효과량 식, 배타 묶음 세기 비교, 탄약 대분류, 옛 자원 변환본 확인). 그 부분만 기술 추천 가로 두고 멈췄다.

## 검증
- 시뮬 앞·뒤(Verified, 시드 1, 각 두 번 돌려 줄·요약 바이트 같음, 위반 0): 앞 = main `fb57c9d`(core@24, 아이템 편집기 1차 합친 뒤), 뒤 = 이 가지 마지막 코드(core@25). war16 30일 230줄·stub16 180일 403줄·econ16 180일 2,200줄 모두 같은 줄 수이고, 다른 줄은 머리 줄의 `content.version`·`content.hash`와 요약 줄의 `linesHash`뿐이다(본문·요약 나머지 같음). `linesHash` war16 b48481e1 → b5177bbc, stub16 0efb59b1 → f5bf617e, econ16 4923c676 → 66c9527b. 시뮬레이터 유닛(휴먼, 시험 검·투구·조끼·반지)은 새 장비 칸을 쓰지 않고 `test_heart`를 입지 않는다 → `SIM_VERSION` 6 그대로.
- `pnpm check:bundle`(Verified, `pnpm build` 뒤): 첫 화면 JS 105,395 B / 상한 131,416 B(직전 기록 105,396 B, −1 B). 아이템 편집기 조각 `ItemEditorScreen-*.js` 160,844 B(gzip 43,455 B)·`.css` 14,790 B(1차 113,289 B·gzip 30,747 B·11,200 B에서 효과 사전·대량 도구·미리 보기 판만큼 늘었다), `sw.js` 미리 캐시에 없음(검색 0건).
- `pnpm check:content origin/main`(Verified): core@25 (f5719bd5e1eb) 통과, 단계 1·2·4a·4b(기준 `266cdbc`). `pnpm --filter @terra/server db:generate`(Verified): No schema changes(마이그레이션 없음).
- 옛 자원 변환본(Verified): 지금 팩 복사본에 얹어 팩 검사기 문제 0개(새로 135·고침 1), 가져오기 해석기 `parseItemsJson` 문제 0개.
- `TEST_DATABASE_URL=… pnpm check`(Verified): 포맷·린트·타입·경계·파일 크기·다국어(3,251키, main 3,115 → +136)·대비(738쌍)·콘텐츠 통과. 단위 시험 369파일 3,110개(main 367파일 3,080개 → +2파일·+30개) 중 1개 실패 → 고침: DB 시험 "모르는 분류의 줄"이 `effects`를 모르는 분류로 썼는데 효과 사전이 고칠 수 있는 분류가 되어 `newer_pack`으로 잠들었다. 시험 DB에서만 분류 검사 제약을 떼고 `recipes` 줄로 모르는 분류를 흉내 내고, 효과 줄은 `newer_pack`·아이템 편집기 목록·버리기로 본다. 다시 돌린 itemEdit·contentEdit DB 시험 5파일 31개 통과.
- 새 시험(이 가지): sim `equipmentGear.test.ts`(속성값 합·직접 값·양손·입을 종류·적정치 59/18/22/54·`withStatTable`·넘침 자름)·`equipment.test.ts`(크리쳐 3칸·전용 장비), shared `itemEditorBulk.test.ts` 8개(CSV 왕복·줄 번호·BigInt ‰ 반올림·patch), 서버 `preview.test`(셈한 적정치·효율·효과량·빠진 물건)·`advice.test`·`combatCatalog.test`(1차 적정 → 59, 가중치 3000 → 84)·`battleLab/build.test`(양손·입을 종류 dropped·속성값)·`samples.test`·`limits.test`, DB 시험 `itemEdit.db.test.ts` 1개 더함(효과 줄을 아이템 묶음으로 고침 → 효과 사전 줄·쓰는 곳·스킬 편집기 `skills.list` 효과, `patch` 티어·기준 가치 ‰(5 × 1.1 → 6)·없는 ID `unknown_entry`, `items.export`). 이 시험은 위 전체 실행 뒤에 더해 그 파일만 다시 돌렸다(9개 통과).
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e`, 마지막 코드): 113개 통과(8.0분) — items 16·skills 12·balance 14·battleLab 17·units 13·cyborg 17·dev 12·tuning 12. items: 복제·적용·전투 실험실 목록, 저장 막힘·되돌리기, 두 탭 다시 얹기, 효과 사전(burn 지속·이름 → `items.list` 효과 줄 edited·`skills.list` 효과 이름), 소모품 효과량(44 · 33~55 → VIT 39 55 · 41~68 → 줄 오차 100 · 49~60), CSV 가져오기(2줄 `not_int` 문제 → 새로 1·고침 1 담기·적용, 새 줄 꺼짐), 크리쳐 전용 방어구(사이보그 미리 보기 "입지 않음" → 크리쳐는 입음, 전투 실험실 늑대 dropped 없음·마법사 `unit_kind`), 플레이어 403, 배치 8개(개발 테마 네온·라이트 × ko·en × 390·1440, 가로 넘침·작은 누르는 곳 없음, 넓은 화면 목록 줄 ≤ 34px).
- 사진(보이는 화면 크기, 개발 테마 네온·라이트 × ko·en × 390·1440: 편집 판·390 목록·분류·효과 사전·대량 도구 36장): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/item-editor-2/shots/items-*.png`(저장소 밖). 처음 사진에서 넓은 화면 목록 줄 끝 표지가 잘리는 것(목록 격자 칸이 줄임표 글의 최소 폭만큼 넓어짐 → `minmax(0, 1fr)`), 좁은 폭에서 줄 글이 가운데 정렬되는 것(기본 단추 `justify-content: center`), 대량 도구 단추가 늘어나는 것, 가져오기 글 칸이 기본 모양인 것을 찾아 고쳤다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/equipment.ts`·`equipmentAppropriate.ts`(새)·`packCatalog.ts`·`catalog.ts`·`replayDemo.ts`, `simulator/combatRun.ts`, `cli/common.ts`, `index.ts` | WP-5 장비 전투 칸·1차 적정 → 2차 적정·`withStatTable`, WP-C 크리쳐 칸 |
| `packages/sim/src/combat/equipmentGear.test.ts`(새)·`equipment.test.ts` | 속성값 합·직접 값·양손·입을 종류·적정치 셈·크리쳐 전용 장비 |
| `packages/content/src/schema/items.ts`·`combat.ts`·`tuningDiff.ts`, `scripts/apply-tuning-diff.mjs` | `use` 효과량 칸, 무기 종류 `ammo`, 효과 사전 `stat`·`exclusive`, 내보내기·`tuning:apply`에 `effects` |
| `content/core/*`(manifest core@25·items·unit_kinds·weapon_types·tuning) | test_heart 속성값, 크리쳐 3칸, 탄약 표시, 설정 칸 셋 |
| `packages/shared/src/itemEditor*.ts`(`Bulk`·`Effects`·`Preview` 새)·`contentEdit.ts`·`battleLab.ts` | 화면·서버 공용 모양·상한·CSV/JSON 해석·`patch` 셈 |
| `apps/server/src/itemEdit/*`, `contentEdit/state.ts`·`core.ts`, `trpc/items.ts`, `main.ts` | 미리 보기(무기·장비·소모품), 효과 사전 줄·쓰는 곳, `patch`·`export`, 덮어쓰기 분류 `effects` |
| `apps/server/src/roster/*`, `battleLab/build.ts`·`samples.ts` | 실효 전투 자료·장비 전투 칸, 크리쳐 칸 차례, `dropped` 두 이유 |
| `apps/game/src/editor/items/*`(`ItemEffects`·`ItemBulk`·`ItemTabPanel`·`itemEditorTabs.css`·`itemEffectsText`·`itemRestage` 새) | 효과 사전·대량 도구 탭, 효과량 칸, 미리 보기 판, 개발 화면 층 모양 |
| `apps/game/messages/ko.json`·`en.json` | `dev_items_fx_*`·`dev_items_bulk_*`·미리 보기·권고·문제 문구 |
| `e2e/items.spec.ts` | 개발 테마 사진, 효과 사전·효과량·CSV 가져오기·크리쳐 전용 장비 시험 |
| ADR 둘·질문·PLAN 13·14장·AGENTS 7장(`tuning:apply` 효과 항목)·`docs/research/2026-11-02-old-resources-draft.*` | 기록 |

## 함께 바꿔야 하는 파일
- 장비·효과 칸 범위: `packages/content/src/schema/items.ts`·`combat.ts` ↔ `packages/shared/src/itemEditor.ts` `ITEM_LIMITS`·`itemEditorEffects.ts` `EFFECT_LIMITS`(시험 `apps/server/src/itemEdit/limits.test.ts`).
- 팩 전투 자료 ↔ `packages/sim/src/combat/catalog.ts` `TEST_COMBAT_CATALOG`(시험 `apps/server/src/world/combatCatalog.test.ts`).
- 크리쳐 칸 수·차례를 바꾸면: `apps/server/src/battleLab/samples.ts`(WOLF·GOLEM 칸 번호), `roster/preview.ts`(Rex), `packages/sim/src/combat/catalog.ts`, 시험 자료.
- 대량 도구 상한: `@terra/shared` `ITEM_BULK_LIMITS` 하나(서버 `services.ts`가 다시 봄).
- 새 효과 사전 칸 → `apps/game/src/editor/items/ItemEffects.tsx`·`itemEffectsText.ts`와 문구(ko·en).

## 건드리지 말 것
- 옛 자원 변환본을 팩에 넣지 않는다(질문 295 답 뒤, 사용자 확인 D-487).
- 효과 사전 `exclusive`·1차 스탯 버프를 판정에 잇는 것은 질문 293 답과 판정 ADR 뒤.
- `SIM_VERSION` 6: 시뮬 출력이 그대로라 올리지 않았다.

## 미검증·TODO·알려진 문제
- 보유 물건(인스턴스)이 있어야 하는 실행은 하지 않았다: 285 소급 명령, 286 먹기·쓰기(효과량은 미리 보기만), 287 전투 중 물약·원거리 타격마다 탄 1 줄이기·0이면 원거리 못 함, 288 시간이 지나 썩어 바뀌기, 289 전투마다 닳기(설정 칸만).
- 크리쳐 조우 때 장비 굴리기·훔치기 스킬(크리쳐·전투 줄기, 자료 `creature {weight, stealPm}`만).
- 1차 스탯 버프·배타 묶음 판정(질문 293), 탄약 아이템 대분류(질문 294, 지금 장비), 소모품 효과량 식(질문 292, 지금 가 모양).
- e2e 1440 사진은 처음에 Playwright 기본 기기(터치, 390 phone `hasTouch`)라 `pointer: coarse` 크기(줄 32px·조작부 32px)로 찍혔다. 합칠 때 1440을 `VIEWPORTS.desktop`(마우스·터치 없음)으로 바꿔 개발 화면 층의 촘촘한 값(28·26px)으로 다시 찍었다(배치 8개 통과, 30.8초, 커밋 `d049069`).

## 사용자 결정 대기
- 질문 292~295(`docs/questions/2026-11-01-item-editor-3.md`).
