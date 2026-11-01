# 아이템 편집기 개발자 화면(/dev/items): 팩 형식 넓힘(분류 자료·묶음), 덮어쓰기 층 보강(baseHash·은퇴 ID·잠든 줄), 서버가 셈하는 미리 보기

- 상태: 제안
- 날짜: 2026-11-01
- 관련: docs/PLAN.md 7장(설정값)·11장(개발자 페이지), 설계안 `docs/research/2026-11-01-item-editor-design.md`(이 ADR의 근거, 1~6장), ADR `2026-11-01-skill-editor.md`(덮어쓰기 층·감사·켤 때 고르기·내보내기 `entries` — 이 ADR 3절이 넓힌다), `2026-11-01-dev-settings-panel.md`(권한·속도 제한·`pnpm tuning:apply`), `2026-11-01-formula-editor.md`(실효 계산식), `2026-10-31-economy-core.md`(대분류·거래 방식), `2026-10-28-content-pack-format.md`(선택 칸 더함·ID 변경표), 질문 `docs/questions/2026-11-01-item-editor.md`(285~290, 사용자 답 D-496)·`docs/questions/2026-11-01-item-editor-2.md`(291), 기획 D-461·D-487·D-494·D-496·D-5001~D-5054

## 배경
- 아이템은 콘텐츠 팩 `items.json`이고 바꾸려면 팩 커밋·배포가 필요했다. 스킬 편집기(ADR `2026-11-01-skill-editor.md`)가 만든 항목 덮어쓰기 층은 `items`를 무기 소모 칸 때문에만 받았다.
- 사용자 답(D-496, 2026-11-01): 285 고친 값은 새로 생기는 것부터 + 필요할 때만 개발자 소급 명령, 286 같은 물약·요리는 같은 아이템이고 효과량은 쓰는 이의 수치(VIT→HP, WIS→MP)와 ±25%[임시], 287 전투 중에 물건을 쓴다(화살·탄약은 보조 칸, 원거리 1회 1개, 없으면 원거리 못 함), 288 신선도 0이면 아이템마다 고른 다른 아이템으로, 289 장비는 전투마다 닳고 지면 더 닳는다, 290 착용 요구치는 없고 1차 적정 스탯에 못 미치면 효율이 준다(2차 적정치는 그 1차 적정 스탯으로 셈). D-494 크리쳐 전용 장비 3칸.
- 설계안의 일 묶음: WP-1 덮어쓰기 층 보강, WP-2 팩 형식, WP-3 서버 API, WP-4 화면. 전투 연결(WP-5)·크리쳐(WP-C)·소모품 실행(WP-6)·대량 도구(WP-7)는 이 묶음 밖이고 자료 모양만 준비한다.

## 선택지
### 팩 형식
1. **선택 칸만 더한다(기존 항목은 그대로 통과)** — 새 분류 셋(`item_subcategories`·`item_tags`·`weapon_types`)과 아이템 묶음(`equip` 넓힘·`perish`·`use`).
2. 대분류마다 다른 스키마(판별 합집합) — 기존 팩·시뮬 자료를 한꺼번에 옮겨야 하고 시뮬 출력이 흔들린다.

### 적정 스탯(290)
- 가. **`equip.weapon.appropriate {str?,dex?,agi?,vit?,int?,wis?}` = 착용 제한 없는 1차 적정 스탯.** 2차 적정치는 그것으로 셈해 미리 보기에 보이고, 전투는 지금처럼 직접 적은 2차 적정치를 읽는다(전투 연결 WP-5).
- 나. 요구치(착용 막기) — 사용자 답 290이 막았다.

### 화면 담기
- 가. **고친 칸이 바로 담은 변경에 든다(실효 값과 같아지면 빠진다), [적용]이 한 묶음** — 여러 아이템·분류 자료를 고친 뒤 한 번에 검사·적용한다.
- 나. 항목마다 [담기] 단추 — 담지 않은 초안을 잃기 쉽다.

## 결정
### 1. 팩 형식(WP-2, 팩 `core@24`)
- 아이템 공통 선택 칸: `subcategory`(→ `item_subcategories`, 그 대분류 것), `tags`(→ `item_tags`, 16개, 겹침 없음), `weight`(g 정수), `stackMax`(장비는 1), `tradable`, `bound`(켜면 `tradable: true` 금지), `icon`.
- 묶음: `equip`(장비만, 장비는 필수), `perish {shelfLifeMs 1시간~365일, spoilsTo → items}`(자원·가공품·소모품만, 자기 자신·돌고 도는 바뀜 금지, 288), `use {effects 1~8}`(소모품만, 스킬 효과 줄과 같은 모양 D-425).
- `equip` 넓힘(모두 선택): `weaponType`(→ `weapon_types`, 칸이 맞아야), `maxDurability`, `combat {resistPm[12], defenseFlat, penetrationPm}`, `kinds`(입을 수 있는 유닛 종류), `creature {weight, stealPm}`(D-494 보유). `equip.weapon`에 `appropriate`(290 가), `twoHanded`, `ammo`(→ 보조 칸 무기 종류). 장비 칸 목록은 `@terra/shared/roster` `EQUIP_SLOTS` 하나(크리쳐 3칸은 WP-C).
- 새 분류: 중분류(`major`·`order`·`storage`·`food`·`foodFamily` — 식재료 계열은 식품만), 태그, 무기 종류(`slot` weapon|offhand). 처음 목록은 [임시]: 중분류 36, 무기 종류 14(무기 11 + 보조 3: 방패·화살통·탄창), 태그 0.
- 규칙 검사마다 코드(`params.rule` → `ContentIssue.code`)를 단다. 스키마 문제는 zod 코드와 한계 값을 싣는다. 화면은 코드로 메시지 키를 고른다(코드 없는 옛 문구는 `content_other`).

### 2. 덮어쓰기 층 보강(WP-1)
- 고칠 수 있는 분류 = `skills`·`items`·`unit_kinds`·`item_subcategories`·`item_tags`·`weapon_types`(DB 검사는 `effects`까지 넓혀 둠).
- 묶음의 바꿈마다 `baseHash`(고치기 시작할 때의 실효 항목 해시, 새 항목 null). 판이 달라도 모든 바꿈의 해시가 맞으면 받는다. 해시가 다르면 `entry_changed`(details = 키)로 묶음 전체를 거절한다. 해시 없는 바꿈(잠든 줄 버리기 등)이 끼면 예전처럼 `revision_conflict`.
- 만든 항목을 지우면 ID를 은퇴시킨다(표 `content_retired_ids`, 마이그레이션 `20261101161223_content_retired_ids` — 추가만, 갈래 셋의 끝을 `prevIds`에). 목록은 팩 `id-changes` + 그 세계 은퇴 ID를 보내고, 새 항목은 다시 쓰지 못한다.
- 켤 때 적용하지 않고 DB에 두는 잠든 줄: 더 새 팩에서 저장(`newer_pack`), 만든 항목과 같은 ID가 팩에 생김(`id_collision`), 모르는 분류(`unknown_category`). 화면은 띠로 보이고 `discard_sleeping`으로 지운다. 감사 `content.slept`.
- 실효 팩 = 팩 항목(파일 차례) + 만든 항목(ID 차례). 서버·`pnpm --filter @terra/sim sim --tuning`(`entries`)·`pnpm tuning:apply`가 같은 함수(`@terra/content` effective)를 쓴다. 내보내기는 `entries`와 `retiredIds`.
- 최근 바꿈은 감사 줄 요약(SQL에서 바꾼 항목 목록만), 항목 통째는 감사 줄 ID로 하나만(`items.historyEntry`).

### 3. 서버 API(WP-3, tRPC `items.*`, tuning:read·write + 사용자별 속도 제한)
- `list`(요약 줄·권고 수·코드 참조 표시·분류 자료·고르기 창 자료·은퇴 ID·잠든 줄), `get`(항목·팩 항목·덮어쓰기·쓰는 곳·권고), `check`(묶음을 얹은 실효 팩 검사의 코드가 붙은 문제 + 아이템마다 권고 + 끄면 멈추는 레시피·생필품), `preview`, `save`(baseHash 묶음), `history`, `historyEntry`.
- 미리 보기는 서버가 셈한다(게임 앱은 sim을 가져오지 않는다): 장비 = 유닛 화면과 같은 함수(`loadoutOf`·`itemAt`)로 범위 0·500·1000‰ 자리를 입힌 1차·2차 수치, 무기 = 그 세계의 실효 계산식(덮어쓴 식 표시)과 1차 적정 스탯으로 셈한 2차 적정치, 소모품 = 효과 줄, 값 = 레시피 원가(BigInt).
- 아이템을 읽는 서버 자리는 모두 실효 자료를 읽는다: 유닛·전투 자료(`roster/catalog.ts`)·전투 실험실·정원사 웨이브·전투 서비스(스킬 편집기 때부터), 경제 목록(`economyCatalogAccessor`, 거래 방식 `marketKindOf` 하나).
- 코드·시나리오가 ID로 쓰는 아이템 표(`SIM_ITEM_REFS`·`MAGIC_WEAPON`·다시보기 시범·전투 실험실 샘플·유닛/경제 시안)를 보내고, 화면은 그 아이템을 끄거나 칸·무기 공격 칸을 바꾸면 [적용] 전에 묻는다.

### 4. 화면(WP-4, `/dev/items`, `?item=<ID>`)
- 스킬 편집기에서 공용 부품을 꺼냈다: 입력 칸·효과 줄·최근 바꿈·모델(`editor/content/contentEditor*`). 스킬 편집기도 baseHash와 3방향 다시 얹기를 쓴다(`e2e/skills.spec.ts`는 고치지 않음).
- 왼쪽 목록(대분류 타일·찾기 300ms·거르기·정렬·200줄씩), 오른쪽 접히는 구역(기본·분류·값 → 장비·무기 → 사용 효과 → 신선도), 칸마다 쓰는 곳 칩(`ITEM_FIELD_USES`), 미리 보기·검사·쓰이는 곳 판, [아이템 분류] 칸(중분류·태그·무기 종류 고치기·새로 만들기).
- 담은 변경 막대: 수·칩·검사 상태(1초 멈춤 → `check`)·메모 200자·[적용]·되돌리기·다시하기(기기 안 50칸)·[비우기]. 새 아이템과 복제는 꺼진 채로(복제 이름 꼬리 "(복사)"·"(Copy)"는 두 언어 콘텐츠 값), 분류 자료는 켠 채로 만든다.
- entry_changed면 다시 받은 항목 위에 내 칸만 다시 얹고(`itemRebase.ts`), 양쪽이 같은 칸을 바꿨으면 칸마다 내 값·서버 값을 고른다.
- 조각 `ItemEditorScreen-*`·공용 `contentEditor…`는 미리 캐시 밖(`DEV_ONLY_CHUNK`·`globIgnores`·`DEV_ONLY_SOURCE`).

## 이유
- 선택 칸만 더하면 기존 팩·시뮬 자료가 그대로 통과한다. 시뮬 출력은 머리 줄(팩 판·해시)만 바뀌었다: war16 30일·stub16·econ16 180일, 시드 1, 두 번씩 — 본문 줄 같음, SIM_VERSION 6 유지(Verified, 작업 기록).
- baseHash가 있으면 다른 항목만 바뀐 판 충돌을 받아 주고(설계안 3.10), 행동별 소모의 무기 소모 칸 바꿈을 아이템 초안이 덮지 않는다.
- 은퇴 ID는 AGENTS 4장 "한 번 쓴 ID는 다시 쓰지 않는다"를 세계 안에서도 지킨다(내보내기 `retiredIds` → 팩 `id-changes`).
- 화면은 계산하지 않고 서버가 실효 자료·식으로 셈해야 판정과 같은 값을 보인다(서버 권위, 모듈 경계).

## 결과
- 하지 않은 것(이 묶음 밖이거나 미룸)
  - WP-5: 새 장비 칸(`appropriate`·`combat`·`kinds`·`twoHanded`·`elements`·`maxDurability`)을 전투에 잇기. 지금은 미리 보기와 쓰는 곳 칩("아직 없음")만.
  - WP-C 크리쳐 3칸, WP-6 소모품 실행(286 스탯 비례·±25%, 287 전투 중 물약·탄약 소모), 289 내구도 닳기, 285 소급 명령.
  - WP-7 대량 도구(여러 개 고르기 `patch_items`, JSON·CSV 가져오기). 감사 표 `content.%` 부분 색인은 줄이 쌓인 뒤 재 보고 더한다.
  - 잠든 줄 `id_collision`의 [새 ID로 옮기기]: 잠든 줄 항목을 화면에 보내지 않아 지금은 [버리기]만 있다.
  - 효과 고르기 창의 찾기·종류 거르기: 지금은 고르기 칸(이름·종류) + 줄마다 풀이 문장.
- 탄약 모양은 질문 291(가·나·다) 답 뒤에 정한다. 지금은 `weapon_types` 보조 칸 종류와 `equip.weapon.ammo` 연결만 있다.
- 처음 중분류·무기 종류 목록과 [임시] 표시 값은 기획 확인(D-487) 뒤 팩 커밋으로 바꾼다.
