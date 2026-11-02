# 아이템 편집기 3차: 소모품 효과량 = 적정 스탯 대비, 배타 묶음 교체 규칙 기록, 소모품 탄약 중분류 지움(질문 292·293·294, D-501)

- 일시: 2026-11-02 13:35 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md` 마지막 "바뀜 (… D-501 …)", 질문 `docs/questions/2026-11-01-item-editor-3.md`(292~294 답), 기획 D-501(미러 `01e0be8`), 가지 `work/item-editor-3`(main `01e0be8`에서)

## 한 일
- 292 소모품 효과량 식을 "스탯 1점당 ‰"에서 "적정 스탯 대비"(무기 효율 D-420 틀)로 바꿨다.
  - 효과량 = 기준 × min(상한, 쓰는 유닛의 그 1차 스탯 ÷ 적정 스탯) × (1 ± 오차).
  - 정수 셈: 비율‰ = min(상한, ⌊스탯 × 1000 ÷ 적정⌋)(스탯이 음수면 0), 가운데 = ⌊기준 × 비율 ÷ 1000⌋, 범위 = ⌊가운데 × (1000 ∓ 오차) ÷ 1000⌋(BigInt, 음수 기준도 아래로 내림, 안전 정수로 자름). 굴림 = [최소, 최대] 안 균등한 정수(시드 난수, `nextInt`).
  - 함수는 판정 쪽 하나: `@terra/sim` `useAmountRange`·`rollUseAmount`(`packages/sim/src/combat/useAmount.ts`). 비율은 `formula.ts`에서 꺼낸 `appropriateRatioPm`이고 무기 틀 `weaponScaled`도 이것을 쓴다(무기 값 그대로, `formula.test` 통과).
  - 상한 = 무기 효율과 같은 값: 설정 칸 N10 `n10_appropriate_cap`(구조 값, 팩 2000‰)의 실효 값 → 전투 계수표 `appropriateCapPm`(`combatCoefficientsFrom`). 전투 `resolveAttack`과 편집기 무기 효율 미리 보기가 읽는 것과 같다. 새 수는 만들지 않았다.
  - 효과 줄 칸: `scale {stat: 1차 6개, appropriate: 1~10,000,000}`(적정 스탯 범위는 무기 1차 적정 스탯과 같은 기술 범위, 0은 "비례 없음"과 겹쳐 1부터), `variancePm 250~500`. 설정 칸 `d496_use_variance` 250 → 500, 범위 0~1,000 → 250~500.
  - 서버 미리 보기(`previewUse.ts`)가 위 함수를 부르고 비율·상한·적정 스탯을 함께 보낸다. 화면 줄: "VIT 10 ÷ 적정 10 → 1000‰(상한 2000‰) → 30 (±500‰ → 15~45)".
  - 편집기 효과량 칸: 비례 스탯·적정 스탯(처음 고르면 10에서 시작)·±오차(250~500, 비우면 설정 칸).
  - 옛 모양 DB 줄 고쳐 읽기(`apps/server/src/contentEdit/legacy.ts`): core@25에서 저장한 items 줄의 옛 `scale {stat, pmPerPoint}`·범위 밖 `variancePm`은 켤 때 고르기와 싣기 전에 뺀다. DB 줄은 그대로, 고친 줄 키는 서버 기록 `content boot` `upgraded`.
- 293 배타 묶음 교체 규칙(D-501)을 기록만 했다: 같은 효과는 높은 값, 다른 효과는 확인 창 뒤 새 것, 자동 사용은 상황에 더 좋을 때만·같거나 더 좋은 것이 걸려 있으면 안 씀. 효과 사전 도움말(`dev_items_fx_exclusive_hint`)·스키마·공용 타입 주석. 전투·실행 바뀜 없음(보유 물건 뒤).
- 294 탄약 하나로: 팩 중분류 `ammo`(대분류 consumable)를 지우고 `id-changes.json`에 removed 1줄(since 26, 보상 none)을 뒤에 더했다. 그 중분류를 가리키던 DB 아이템 줄은 같은 고쳐 읽기에서 `subcategory`만 뺀다(팩 id-changes가 지웠고 지금 팩에 없는 중분류). 탄약 장비 칸 도움말에 "탄약은 이 보조 칸 장비 하나로만, 0이면 다른 탄약 장비로 바꿔 씀".
- 팩 core@25 → core@26(`tuning` d496_use_variance, `item_subcategories` ammo 지움, `id-changes` 1줄).

## 검증
- 효과량 예(Verified, 단위 시험 `useAmount.test.ts`·서버 `preview.test.ts`·e2e): 스탯 = 적정 스탯, ±500‰ → 기준 30·50·100 = 15~45·25~75·50~150(사용자 예). VIT 10 유닛: 기준 30·적정 10 → 1000‰ → 30(15~45), 기준 50·적정 40 → 250‰ → 12(6~18) — 적정 스탯이 낮은 30 물약이 더 낫다. VIT 39: 기준 50·적정 40 → 975‰ → 48(24~72), 적정 10 → 상한 2000‰ → 100(50~150), 줄 오차 250‰ → 75~125. 비례 없음 기준 40·±250‰ → 30~50. 상한 설정 칸을 3000으로 덮어쓰면 VIT 40·적정 5 → 3000‰.
- 옛 미리 보기 값(앞, 참고): 기준 40·VIT 10‰/점 → VIT 10이면 44(33~55), VIT 39면 55(41~68), 줄 오차 100‰면 49~60. 지금 식에서는 옛 칸이 없다(같은 줄을 적정 10으로 적으면 VIT 10 → 40(20~60), VIT 39 → 80(40~120)).
- 시뮬 앞·뒤(Verified, 시드 1, 각 한 번): 앞 = main `998ce1e`(core@25), 뒤 = 이 가지(core@26). war16 30일 230줄·stub16 180일 403줄·econ16 180일 2,200줄 모두 같은 줄 수이고, 다른 줄은 머리 줄의 `content.version`·`content.hash`와 요약 줄의 그 둘·`linesHash`뿐(본문·요약 나머지 같음, 위반 0). `linesHash` war16 b5177bbc → 01c497a6, stub16 f5bf617e → ca57fb34, econ16 66c9527b → 2cc967ad. 앞 값은 직전 작업 기록의 뒤 값과 같다. → `SIM_VERSION` 6 그대로.
- `pnpm check:content main`(Verified): core@26 (043c375d7b07) 통과, 단계 1·2·4a·4b(기준 `01e0be8`, 지운 ID `ammo` 기록·판 올림 확인).
- `TEST_DATABASE_URL=… pnpm check`(Verified): 포맷·린트·타입·경계·파일 크기(`packages/sim/src/index.ts` 709줄 경고, 1,000 아래)·다국어(3,251키, 키 하나 이름 바꿈 `dev_items_field_scale_pm` → `dev_items_field_scale_appropriate`)·대비(738쌍)·콘텐츠 통과. 단위 시험 372파일 3,126개 통과(main 369파일 3,111개 → +3파일·+15개).
- 새·바꾼 시험: sim `useAmount.test.ts` 9개(사용자 예·낮은 적정 물약·상한 = 무기 효율 값·weaponScaled와 같은 가운데 값·음수 기준·자름·굴림 범위·시드 같음·넓은 폭), 서버 `preview.test.ts`(효과량 예·N10 덮어쓰기·옛 모양과 범위 밖 오차 스키마 문제), `limits.test.ts`(적정 스탯·오차 범위 = 팩 스키마), `contentEdit/legacy.test.ts` 3개(고칠 칸만 빠짐·켤 때 지워지지 않음·싣기 뒤 실효 항목), DB 시험 `contentEdit/legacy.db.test.ts` 1개(core@25 줄 → 켤 때 `content.dropped` 없이 실림, DB 원본 그대로, 다시 싣기도 고쳐 읽음).
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e items.spec.ts`, 마지막 코드): 24개 통과(2.5분, 직전 16개 + 소모품 배치 8개). 효과량 시험: 30 → 15~45, 기준 50 → 25~75, 100 → 50~150, 기준 50·적정 40 → 250‰ · 12 · 6~18, VIT 39 → 975‰ · 48 · 24~72, 적정 10 → 상한 2000‰ · 100 · 50~150, 줄 오차 250 → 75~125. 소모품 배치(개발 테마 네온·라이트 × ko·en × 390·1440, 1440은 `VIEWPORTS.desktop`): 가로 넘침·작은 누르는 곳 없음.
- `pnpm check:bundle`(Verified, e2e 준비가 만든 빌드): 첫 화면 JS 105,401 B / 상한 131,416 B(직전 기록 105,395 B, +6 B). 아이템 편집기 조각 `ItemEditorScreen-*.js` 161,851 B(직전 160,844 B).
- 사진(저장소 밖, 요소 사진: 효과량 칸 구역·미리 보기 사용 효과 판, 개발 테마 네온·라이트 × ko·en × 390·1440 = 16장): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/item-editor-3/shots/items-use-fields-*.png`·`items-use-preview-*.png`. 같은 폴더에 기존 배치 사진(편집 판·목록·분류·효과 사전·대량 도구)도 다시 찍혔다. 네온·라이트 1440·390을 눈으로 봤다: 칸 셋(비례 스탯·적정 스탯·±오차)이 한 줄(넓은 화면)·세로(좁은 화면)로 놓이고 미리 보기 줄이 잘리지 않는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/useAmount.ts`(새)·`useAmount.test.ts`(새), `formula.ts`(`appropriateRatioPm` 꺼냄), `index.ts` | 효과량 식·굴림 하나, 무기와 같은 비율 |
| `packages/content/src/schema/items.ts`·`combat.ts`(주석) | `scale {stat, appropriate}`·오차 250~500, 배타 묶음 교체 규칙 주석 |
| `content/core/*`(manifest core@26·tuning·item_subcategories·id-changes) | 오차 500‰·범위, 소모품 탄약 중분류 지움과 기록 |
| `packages/shared/src/itemEditor.ts`·`itemEditorPreview.ts`·`itemEditorEffects.ts`(주석) | 화면·서버 공용 범위·효과 줄·미리 보기 모양 |
| `apps/server/src/itemEdit/previewUse.ts`·`preview.ts`·`services.ts`, 시험 `preview.test.ts`·`limits.test.ts` | 미리 보기가 sim 함수·N10 실효 값을 씀 |
| `apps/server/src/contentEdit/legacy.ts`(새)·`state.ts`·`boot.ts`·`services.ts`, 시험 `legacy.test.ts`·`legacy.db.test.ts`(새) | 옛 모양 DB 줄 고쳐 읽기, 켤 때 기록 |
| `apps/game/src/editor/items/ItemUseFields.tsx`·`itemEffectsText.ts`, `apps/game/messages/ko.json`·`en.json` | 적정 스탯 칸, 미리 보기 줄, 도움말(효과량·배타 묶음·탄약) |
| `e2e/items.spec.ts` | 효과량 숫자 시험, 소모품 효과량 칸·미리 보기 배치·사진 8조합 |
| ADR 아이템 편집기·PLAN 13·14장·질문 문서 상태 | 기록 |

## 함께 바꿔야 하는 파일
- 효과량 칸 범위: `packages/content/src/schema/items.ts` `ITEM_SCHEMA_LIMITS`(useAppropriateMax·useVariance*) ↔ `packages/shared/src/itemEditor.ts` `ITEM_LIMITS`(useAppropriate·variancePm) ↔ `apps/server/src/contentEdit/legacy.ts` `LEGACY_VARIANCE_RANGE`(시험 `limits.test.ts`·`legacy.test.ts`).
- 효과량 식을 바꾸면 `packages/sim/src/combat/useAmount.ts` 하나(서버 미리 보기·나중의 소비 실행이 같이 쓴다). 무기 틀 비율을 바꾸면 `appropriateRatioPm`이 두 곳에 같이 든다.
- 팩이 중분류를 또 지우면 `legacy.ts`가 그 중분류를 가리키는 DB 아이템 줄의 `subcategory`를 자동으로 뺀다(id-changes 기준). 다른 분류(태그·무기 종류·효과)를 지울 때는 따로 본다.

## 건드리지 말 것
- `SIM_VERSION` 6: 시뮬 출력 본문이 그대로다.
- 배타 묶음 교체·자동 사용 판단을 전투에 잇는 것은 보유 물건 줄기(D-501 "상황에 더 좋은 쪽" 판단식은 그때 정해 보인다, D-487).
- `id-changes.json`의 새 줄은 고치거나 지우지 않는다(PROTECTED).

## 미검증·TODO·알려진 문제
- 먹고 쓰는 실행(굴림 `rollUseAmount`의 첫 호출처)은 보유 물건 뒤다. 지금은 편집기 미리 보기만 범위를 셈한다.
- 옛 내보내기 파일(`tuning:apply`·`sim --tuning`의 `entries`에 옛 `scale`)은 고쳐 읽지 않고 스키마 문제로 알린다.
- 세계 DB(NAS)에 옛 모양 줄이 실제로 있는지는 모른다(Unknown). 있으면 켤 때 서버 기록 `content boot`의 `upgraded`에 키가 남는다.

## 사용자 결정 대기
- [임시] 값 셋(사용자 확인 D-487): ① 효과 줄 오차 범위 250~500‰(답 "기본 +-25~50%"를 줄마다 고를 수 있는 범위로 읽음, 설정 칸도 같은 범위), ② 적정 스탯 칸 시작값 10(입력 편의, 기준 유닛 1차 10에서 1000‰), ③ 적정 스탯 하한 1(0이면 나눌 수 없어 "비례 없음"으로 둠).
- 상한 = 무기 효율 값(N10)은 기술 해석이다(질문 정리·D-501 "효율 상한은 무기 효율과 같은 값, 사용자가 고르지 않음").
- 질문 295(옛 자원 변환본)는 검토 중.
