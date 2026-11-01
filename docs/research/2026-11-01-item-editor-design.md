> 출처: 기술 세션(Claude Code), 2026-11-01 KST. 사용자 지시 "아이템 편집기도 해보자. 장비류나 자원류 소모품 등 잘해야한다"에 따라 조사 3(지금 코드·기획 문서·옛 프로젝트) → 설계 → 비판 검토 → 고친 판 순서로 만든 설계안이다(다중 에이전트 워크플로). 코드는 실행하지 않았고, 표기 [V]·[A]는 본문 머리말을 따른다. 규칙 결정은 `docs/questions/2026-11-01-item-editor.md`(285~290)로 사용자에게 직접 묻는다.

# 아이템 편집기 설계안 (개발자 모드, D2 첫 묶음), 고친 판

- 기준 [V `git log`, `git worktree list`, `git merge-base`. 이번 판에서 다시 봤다]
  - main은 `0fa5d2e`이고 origin/main과 같다.
    - 앞 판의 기준은 `5c621d3`이었다. 그 뒤에 세 가지가 들어왔다.
      - 전투 다시보기 `b9a25a6`
      - 전투 실험실 `e77837f`
      - 기획 미러 D-494·D-495 `0fa5d2e`
    - main은 이 판을 쓰는 동안에도 움직였다.
  - 팩
    - main은 `core@21`이다. 전투 실험실이 설정 칸 N5를 더하면서 판이 올랐다. `placeholder: true`다 [V `content/core/manifest.json`, `git diff b9a25a6 main -- content/core/tuning.json`].
    - SE와 FM도 각자 `core@21`이다(20에서 올림).
    - `SIM_VERSION`은 main 4, SE 5, FM 5다 [V 세 곳의 `packages/sim/src/version.ts`].
  - `work/skill-editor`(아래 SE)
    - 커밋 `e4d316b`, 작업 트리는 깨끗하다.
    - 경로: `/home/user/terra-in-cognita/.claude/worktrees/agent-a0dc0a9c46291329d`
    - `b9a25a6`까지 합쳤고 전투 실험실은 아직 합치지 않았다.
  - `work/formulas`(아래 FM)
    - 커밋 `7b33cf4`, 작업 트리는 깨끗하다.
    - 경로: `/home/user/terra-in-cognita/.claude/worktrees/agent-acf96a683fbc9a21c`
    - SE와 같은 상태다.
- 표기
  - [V]: 이번 판에서 직접 읽었거나 쟀다.
  - [V앞]: 앞 판(같은 날)에서 읽었고, 이번에는 다시 읽지 않았다.
  - [V조사]: 조사 보고가 읽었다고 했다.
  - [A]: 추정이나 제안이다.
- 경로 앞머리
  - 앞머리가 없으면 main `0fa5d2e` 작업 트리다.
  - `SE:`·`FM:`은 그 작업 트리다.
  - `OLD:`는 AntiGravt01 `origin/main`이다.
- 코드는 실행하지 않았다. 팩 검사 시간만 읽기 전용 스크립트로 다시 쟀다(5.3).

## 0. 한눈에

- 주소는 `/dev/items`다. 9대분류 아이템을 한 화면에서 만들고, 고치고, 끄고, 복제한다.
- 바로 적용(D-461)에 새 저장소를 만들지 않는다. SE가 만든 `content_overrides`를 그대로 쓴다. 이 표는 항목을 통째로 jsonb에 담는다 [V SE:`apps/server/drizzle/20261101120613_content_overrides/migration.sql`].
- 새 칸은 모두 선택 칸이다.
  - 지금 팩의 19개 항목과 직전 판 앱이 그대로 돈다.
  - 칸이 없으면 지금처럼 동작하므로 시뮬 출력이 같다 [A. WP마다 바이트 비교로 확인한다].
- 먼저 할 일은 WP-0이다. SE를 합치기 전에 끝내야 하는 관문이다.
  - 되돌림 배포 때 직전 판 앱이 새 칸이 든 세계 줄을 지운다. 지우지 않고 잠재우게 고친다.
  - 켜진 장비가 꺼진 스킬을 가리키거나, 켜진 스킬이 꺼진 효과를 가리키면 전투 자료를 만들다 던진다. 전투 자료가 꺼진 참조를 걸러 내게 고친다.
- 그다음은 합치는 차례(M단계)다.
  - 차례: main(전투 실험실) → SE → FM.
  - `SIM_VERSION`, 팩 판, ID 변경표 `since`, 마이그레이션 갈래를 미리 정해 둔다.
- SE가 이미 한 것
  - 내보내기 `entries`와 그것을 받는 `pnpm tuning:apply`
  - `/dev/skills` 화면
  - 남은 것은 하나다. 시뮬 `--tuning`이 `entries`를 얹지 않는다 [V SE:`packages/sim/cli/common.ts:166,187`].
- 이 판을 쓰는 중에 미러된 사용자 결정 D-494가 편집기 범위를 넓힌다 [V `docs/design/02_Decision_Log.md:8563-8578`].
  - 무기에는 1차 스탯 요구치를 적고, 2차 적정치는 그 요구치로 셈한다. 질문 276의 답 "둘 다"다.
  - 크리쳐 전용 장비가 3종(무기·방어구·장신구)이다. 개체마다 무작위로 가지고, 희귀한 것도 있다. 훔치기로 얻을 확률이 따로 있다.
- 첫 판에 넣는 것
  - 장비: 지금 칸 전부. 더하는 칸은 무기 종류, 1차 요구치, 양손, 최대 내구도, 속성값, 전투 직접 값, 입을 수 있는 유닛 종류, 크리쳐 보유 무게, 훔치기 확률.
  - 자원류: 공통 칸(무게·거래 가능·계정 귀속), 보관 창고(중분류에서 정함), 식재료 계열, 신선도.
  - 소모품: 효과 줄, 신선도, 미리보기.
  - 분류 자료: 중분류, 태그, 무기 종류.
- 첫 판에서 빼는 것: 보석·소켓 규칙, 탄약, 유물, 고정 관통, 하나하나의 물건(등급·소켓·지금 내구도), 추가 언어 칸(WP-L로 따로 뗀다).
- 사용자에게는 규칙 5개를 묻고, 식 하나를 확인받는다. 어느 것도 편집기 작업을 막지 않는다. 그 규칙을 쓰는 줄기를 열 때 묻는다(7장).

## 1. 범위

| 묶음 | 첫 판 | 까닭 |
|---|---|---|
| 장비(대분류 4): 무기·보조·머리·몸·장신구·인공장기·안드로이드 부품·안장 | 지금 칸 전부. 더하는 칸: 무기 종류, 1차 요구치, 양손, 최대 내구도, 속성값 연결, 전투 직접 값(속성 저항·고정 방어·비율 관통), 입을 수 있는 유닛 종류 | 스키마·sim 판정·서버 전투 자료가 이미 있다 [V `packages/content/src/schema/combat.ts:331-398`, `packages/sim/src/combat/packCatalog.ts:79-95`]. 바로 적용이 지금 실제로 드는 곳은 유닛 화면, 밸런스·전투 실험실, 정원사 웨이브, 전투 다시보기다 [V SE:`apps/server/src/app.ts:339`, `apps/server/src/battleLab/services.ts:182`, SE:`apps/server/src/battleReplay/services.ts:71`] |
| 크리쳐 전용 장비(D-494) | 장비 칸 두 개를 더한다: 입을 수 있는 유닛 종류, 크리쳐 보유 무게·훔치기 확률. 크리쳐 칸 3종으로 바꾸는 것은 WP-C | 사용자가 "아이템 편집기에서 반영"을 정했다 [V `02_Decision_Log.md:8575-8578`]. 조우 때 굴리기와 훔치기 스킬은 크리쳐·전투 줄기의 일이다 |
| 자원류(1·2·3·7·9): 원자재·가공 재료·부품·건축 자재·귀금속 | 공통 칸, 보관 창고(중분류), 식재료 계열·신선도 | 레시피·생필품·경제 시안이 읽는다 [V `apps/server/src/economyView/catalog.ts:33-107`]. 재료에는 품질이 없다(D-282) [V `docs/design/50_Content_Rules.md:27`] |
| 식품·소모품(5): 요리·음료·약·버프 | 칸, 효과 고르기, 미리보기. 실제로 먹고 쓰는 규칙은 질문 2~4 뒤 | 사용 규칙이 기획에 없다 [V앞 45·48을 찾아봄] |
| 설계도·문서(8) | 공통 칸만 | 가지는지·쓰는지·배우는지 정해지지 않았다 [V조사] |
| 분류 자료: 중분류·태그·무기 종류 | 첫 판에 넣는다 | 거래소는 대분류 → 중분류 → 태그 순서로 거른다(D-5033) [V `02_Decision_Log.md:9213-9239`]. 무기 종류는 48 §5.5의 장비 칸이다 [V `docs/design/40_Systems/48_Stats_Formulas.md:411`] |
| 보석·스킬석(6), 소켓 규칙 | 나중(WP-8) | 옵션 목록과 합성 규칙이 미결이다 [V `50_Content_Rules.md:69`]. 소켓 수는 만들 때의 등급으로 정한다(D-5008) [V `02_Decision_Log.md:8754-8773`] |
| 탄약 | 나중(질문 3) | 칸 이름만 있다 [V `48:411`] |
| 휴먼 생명공학 칸, 안장 이동·적재 보정 | 나중. ADR에 미뤘다고 적는다 | 칸 종류가 없다 [V `combat.ts:11-20`, `content/core/unit_kinds.json`: 휴먼 6칸]. 무엇을 올리는지, 운송 규칙이 먼저다 [V `48:370,388`] |
| 유물·유전자·신앙·유료 보조·뽑기권·꾸미기·우주 | 나중 | 시스템마다 규칙이 먼저다 [V조사] |
| 하나하나의 물건(등급·소켓·지금 내구도·각인·지금 신선도) | 편집기 범위 밖 | 보유 표가 없다. 진짜 사이보그도 장비·보유가 비어 있다 [V `apps/server/src/roster/cyborgBody.ts:39,60`]. 질문 1의 답 뒤 별도 줄기 |
| 추가 언어(ja·zh-Hant) | WP-L로 따로 하고 ADR을 쓴다 | 모든 분류의 이름 칸과 팩 형식 ADR에 걸린다(2.10) |
| 아이콘 | 칸(에셋 키)만 둔다 | 에셋 저장소가 없다 [V앞] |
| 드롭 표, 조우 장비 표 | 나중 | 크리쳐 편집기(D-5024)의 일이다 |
| 레시피 편집 | 읽기와 연결만 | D2 레시피 편집기가 맡는다 [V `docs/adr/2026-10-31-roadmap-to-launch.md:68`] |
| 운송 수단·유닛·주식·채권·세력 화폐 | 넣지 않는다 | 아이템이 아니다 [V `50:243-245`] |

- 대분류 9개는 코드 목록 `ITEM_CATEGORIES`로 둔다 [V `packages/content/src/schema/economy.ts:10-20`].
  - 대분류마다 붙는 칸 묶음이 정해져 있어서다.
  - D-5033의 해석은 대분류도 늘린다고 했다 [V `02:9235`]. 나중에 `item_majors` 자료로 바꿀 수 있다. 저장되는 JSON 값이 같아 호환된다 [A].

## 2. 데이터 모델

### 2.1 모양
- 항목 하나는 공통 칸과 대분류별 묶음(`equip`·`perish`·`use`)으로 이룬다.
  - 묶음은 모두 선택 칸이다.
  - 분류 파일을 새로 만들지 않고 `itemEntrySchema` 하나를 넓힌다 [V `economy.ts:30-41`].
- 이렇게 하는 까닭
  - 레시피·생필품·장비 스킬이 모두 `ref("items")` 하나를 가리킨다 [V `economy.ts:44`, `combat.ts:347`].
  - 덮어쓰기와 내보내기도 분류 하나로 끝난다.
- 대분류와 묶음이 맞는지는 `superRefine`으로 본다.
  - Zod 4.6.7은 필드 검사가 실패해도 이것을 부른다.
  - 그래서 값의 모양을 다시 확인한다 [V AGENTS 6장].

### 2.2 공통 칸

| 칸 | 형·단위 | 필수 | 검사 | 지금 | 첫 판에 읽는 곳 |
|---|---|---|---|---|---|
| `id` | contentId | 필수 | 형식, 분류 안에서 하나, 은퇴 ID 금지(2.9) | 있음 | 모두 |
| `name` | `{ko, en}` | 필수 | 빈 글 금지 | 있음 [V `packages/content/src/schema/common.ts:22-31`] | 화면 |
| `description` | `{ko, en}` | 선택 | 빈 글 금지 | 칸은 있고 쓴 항목은 0 [V `content/core/items.json`] | 화면 |
| `category` | 9개 중 하나 | 필수 | 묶음 규칙, 바꾸기 제한(2.7) | 있음 | 묶음 규칙, 거래 방식, 생산 단계, 화면 |
| `subcategory` | `ref("item_subcategories")` | 선택(권고) | 그 대분류의 중분류만 | 새 칸 | 거르기, 보관 창고, 식품 판정 |
| `tags` | `ref("item_tags")[]`, 16개까지 | 선택 | 겹침 금지 | 새 칸 | 거르기 |
| `tier` | 정수 0~9 | 필수 | 범위 | 있음 [V `economy.ts:26`] | 레시피 티어(sim·서버) |
| `baseValue` | 정수 > 0, 화폐 최소 단위, [임시] | 필수 | 범위 | 있음 [V `economy.ts:36-37`] | sim 처음 시세·NPC 값, 서버 시안 |
| `weight` | 정수 g, 0~100,000,000 | 선택(권고) | 범위 | 새 칸 | 아직 없음 |
| `stackMax` | 정수 1~1,000,000 | 선택 | 장비면 1만 | 새 칸 | 아직 없음(보유 표 뒤) |
| `tradable` | 참·거짓. 없으면 참 | 선택 | `bound`가 참이면 거짓만 | 새 칸 | `marketKindOf` |
| `bound` | 참·거짓. 없으면 거짓 | 선택 | — | 새 칸 | `marketKindOf`. 나중에 우편·이적 |
| `icon` | 에셋 키(contentId 형식) | 선택 | 형식 | 새 칸 | 아직 없음 |
| `enabled` | 참·거짓 | 필수 | — | 있음 [V `economy.ts:27-28`] | 모두 |

- `tradable`과 `bound`는 뜻이 다르다.
  - `tradable: false`는 거래소에 올리지 못한다는 뜻이다. 우편과 이적은 된다 [A].
  - `bound: true`는 계정 귀속이다. 거래소·이적·우편 모두 안 된다(D-7014·D-270) [V `02_Decision_Log.md:10772-10780`, `02:5235-5249`].
  - `bound`가 참이면 `tradable`은 없거나 거짓이어야 한다.
- 생필품 표시는 칸으로 두지 않는다.
  - `necessities` 분류가 그 아이템을 가리키는지로 판단한다 [V `economy.ts:73-86`].
  - 48 §5.5는 이것을 칸으로 적었다 [V `48:410`]. 같은 사실을 두 곳에 두지 않으려는 기술 선택이다 [A].
- 보관 창고는 아이템 칸이 아니라 중분류의 `storage` 칸에서 온다(2.6).
  - D-121에 식량 창고·무기고·일반 창고가 있고, 원유는 저장 탱크가 있어야 보관한다 [V `02:2486-2495`, `docs/design/40_Systems/49_Settings.md:96`].
  - 중분류가 없으면 대분류 기본값을 쓴다 [A].
- 무게
  - D-117은 "모든 아이템에 무게가 있다"고 했다 [V `02:2376`].
  - 지금은 무게를 읽는 곳이 없어 권고로만 둔다.
  - 창고·운송 규칙이 들어오면 팩 단위 검사 `checkItemWeights`로 올린다. 켜진 아이템은 무게가 필수가 된다.
  - 스키마에서 필수로 만들지 않는 까닭이 있다. 그러면 무게 없는 세계 줄이 새 앱에서 검사에 걸려 켤 때 지워진다 [A].
- 단위는 게임 규칙 단위로 저장한다. 시간은 ms, 비율은 ‰, 돈은 최소 단위 정수다 [V앞 PLAN 7장, AGENTS 4장].
  - 무게를 g 정수로 둔 것은 기술 선택이다. 기획은 "무게(정수)"라고만 적었다 [V `48:410`] [A].

### 2.3 대분류별 묶음

| 대분류 | `equip` | `perish` | `use` | 비고 |
|---|---|---|---|---|
| raw 원자재 | 없음 | 선택(식재료) | 없음 | 식재료 계열은 중분류에 둔다(2.6) |
| processed 가공 재료 | 없음 | 선택(훈제·절임) | 없음 | |
| part 부품 | 없음 | 없음 | 없음 | 안드로이드 부품 칸에 끼우는 장비와 다르다. 그것은 equipment에 `slot: part`다 |
| equipment 장비 | **필수** | 없음 | 없음 | |
| consumable 식품·소모품 | 없음 | 선택(음식) | 선택 | |
| gem 보석 | 없음 | 없음 | 없음 | `gem` 묶음은 WP-8 |
| construction 건축·설치물 | 없음 | 없음 | 없음 | 설치물과 건물의 연결은 건물 편집기가 맡는다 |
| document 설계도·문서 | 없음 | 없음 | 없음 | 규칙 미정 |
| precious 귀금속·총량 자원 | 없음 | 없음 | 없음 | 총량은 감사가 남는 매장량 조정(D-333)으로만 바뀐다 |

- 지금 팩은 이 규칙을 이미 지킨다. `equip`는 장비 12개에만 있고, 장비는 모두 `equip`를 가진다 [V `content/core/items.json`을 셈].

### 2.4 장비 `equip`

- 그대로 두는 칸 [V `combat.ts:331-398`]
  - `slot`, `stats[{stat, min, max}]`(16줄까지), `weapon?`, `skills?`(4개까지), `elements?`
  - 규칙도 그대로다.
    - 칸 묶음(D-423): 장신구·인공장기·부품·안장은 1차 스탯만 올리고, 나머지 칸은 2차 수치만 올린다 [V `combat.ts:21-22`].
    - 2차 공격력 두 행은 장비로 올리지 않는다 [V `combat.ts:23-24`].
    - `min ≤ max`.
    - weapon 칸일 때만 무기 사양이 있다.
    - 속성 줄은 겹치지 않는다.
- 무기 `weapon` [V `combat.ts:228-297`]
  - 지금 칸: 물리·속성 공격 칸, `basic`, 명중‰과 적정치, 크리‰와 적정치, 공격 간격 ms와 속도 적정치, 사거리, 곡사, 스태미나·MP 소모, 속성 계수 12칸.
  - 스태미나·MP 소모는 행동별 소모 화면이 고치는 칸과 같다 [V SE:`apps/server/src/contentEdit/services.ts:150-169`].
- 1차 요구치 `weapon.req`(D-494, 질문 276 "둘 다")
  - 무기에 1차 스탯 요구치(`{str?, dex?, agi?, vit?, int?, wis?}`, 각 0~10,000,000, 적어도 하나)를 적는다.
  - 2차 적정치는 이 값으로 셈한다 [V `02:8569,8574`, FM:`docs/questions/2026-11-01-formulas.md:80`].
    - FM은 "무기 자료 모양이 바뀌므로 아이템 편집기로 옮기고 이 가지에서는 구현하지 않는다"고 적었다.
  - 요구치는 착용 조건이 아니다. 착용에 스탯 요구가 없다는 D-424는 그대로다 [V `48:392-394`]. 요구치는 성능 배율의 기준인 적정치를 셈하는 재료일 뿐이다.
  - `req`가 있으면 적정치 칸(`attackAppropriate`·`hitAppropriate`·`critAppropriate`·`speedAppropriate`)을 적지 않는다. 둘 중 하나만 적는다. 옛 무기는 지금처럼 적정치를 직접 든다 [A].
  - 셈하는 식은 출발 식으로 제안한다. 확인을 받아야 한다(7장 식 확인 A, D-487).
    - 요구치를 1차로 가진 유닛(나머지 1차 0, 장비·버프 0, LV 1)에 실효 가중치 표·행 식을 넣는다.
    - 그 유닛의 2차 행 값을 적정치로 쓴다: 물리 칸 → `physical_attack`, 속성 칸 → `elemental_attack`, 명중 → `hit`, 크리 → `crit_chance`, 속도 → `action_speed` [A. 행 이름은 V `content/core/stat_rows.json`].
  - 셈하는 때는 전투 자료를 만들 때다. 실효 가중치 표나 행 식이 바뀌면 다시 셈한다 [A].
  - 무기 입력 칸은 칸 정의 표 하나(`@terra/shared/itemEditor`의 `WEAPON_FIELDS`)에서 그린다. 모양이 바뀌어도 표 하나만 고친다.
  - 적정치를 따로 보여 주는 화면은 만들지 않는다. 계산식 탭의 "무기마다 적정치"로 연결한다 [V FM:`docs/adr/2026-11-01-formula-editor.md:97`].
- 더하는 칸

| 칸 | 형·단위 | 검사 | 읽는 곳 | 근거 |
|---|---|---|---|---|
| `weaponType` | `ref("weapon_types")` | weapon·offhand 칸만 | 거르기, 나중에 스킬 조건 | 48 §5.5 "무기 종류" [V `48:411`]. D-5033의 장비 중분류(무기·보조 무기·방어구·장신구·임플란트)와는 따로 둔다 [V `02:9225`, `50:231`] |
| `weapon.req` | 위 | 위 | 전투 자료가 적정치를 셈함(WP-5) | D-494 [V] |
| `maxDurability` | 정수 1~1,000,000 | 권고: 실효 F12보다 커야 함 | 아직 없음(내구도 규칙 뒤) | F12 [V `49_Settings.md:204`, `content/core/tuning.json` `f12_destroy_at` = 10]. 프리셋 내구도(D-7040) [V조사] |
| `twoHanded` | 참·거짓 | weapon 칸만 | sim 장착. 양손 무기를 든 동안 보조 칸 장비를 무시한다(아래) | 칸은 `48:411` [V]. 뜻은 양손의 보통 뜻으로 잡았다 [A] |
| `combat.resistPm` | 정수 12칸, −1000~1000‰ | 길이 12 | sim `resistPm` | D-421, 48 §3.4 [V `48:182-183`] |
| `combat.defenseFlat` | 정수 0~10,000,000 | — | sim `defenseFlat` | 같음 |
| `combat.penetrationPm` | 정수 0~1000‰ | — | sim `penetrationPm` | 같음 |
| `elements`(이미 있음) | 12속성, 칸마다 1~10 | 겹침 금지 | 지금은 sim이 옮기지 않는다 → 옮긴다. 출처를 더한 뒤 칸마다 10에서 자른다 | D-450 [V `combat.ts:348-355`, `packCatalog.ts:79-95`] |
| `kinds` | `ref("unit_kinds")[]`, 1~8개 | 겹침 금지. 그 종류에 이 칸이 없으면 권고 | 미리보기·실험실·장착 검사가 거른다(WP-5·WP-C) | D-494 "전용" [V `02:8575`]. 없으면 그 칸을 가진 모든 종류 |
| `creature` | `{weight 0~1,000,000, stealPm 0~1000}` | `kinds`에 크리쳐가 없으면 권고 | 아직 없음(조우·훔치기 줄기) | D-494: 개체마다 무작위로 보유하고 희귀할 수도 있음, 훔치기 획득률이 드롭률보다 높음 [V `02:8575`]. 무게는 후보끼리의 상대 빈도다. 종마다 다른 풀은 크리쳐 편집기(D-5024)가 맡는다 [A] |

- 여러 장비의 값은 더한다.
  - 기획에 "같은 종류 보너스는 더한다"(D-178)가 있다 [V `48:269`].
  - sim 유닛 사양에 칸이 이미 있다 [V `packages/sim/src/combat/unitSpec.ts:63-66`].
- 더할 때 주의할 것 둘
  - 속성 저항 합이 1000‰ 이상이면 그 속성 피해가 0이다. 곧 면역이다 [V `packages/sim/src/combat/formula.ts:142-151,196-199`].
    - 합을 자를지는 규칙이다. 계산식 줄기에서 사용자에게 묻는다(7장 다음 묶음).
    - 그때까지 편집기는 권고만 낸다.
  - 1차 스탯 합이 `MAX_STAT_INPUT`(10,000,000)을 넘으면 2차 스탯 계산이 던진다 [V `packages/sim/src/combat/stats.ts:35-48`].
    - 칸 하나의 범위가 ±10,000,000이라 [V `combat.ts:340-341`] 여러 장비를 더하면 넘을 수 있다.
    - 편집기는 권고를 내고, 미리보기는 오류를 잡아 칸 오류로 보인다.
    - 판정 쪽에서 자를지는 WP-5에서 정한다 [A].
- 양손은 기술 동작이라 묻지 않는다. 계산 중에는 던지지 않게 한다.
  - 지금 `loadoutOf`는 틀린 조합에서 RangeError를 던진다 [V `packages/sim/src/combat/equipment.ts:131,139,141-142`].
  - 부르는 쪽은 맞지 않는 장비를 건너뛴다 [V `apps/server/src/roster/body.ts:163`, `packages/sim/src/simulator/combatRun.ts:76-80`, `packages/sim/src/simulator/waveBattle.ts:150-159`, `apps/server/src/battleLab/build.ts:175-181`].
  - 그래서 이렇게 한다.
    - 장착 명령이 생기면, 그 명령을 검사할 때만 거절한다.
    - 계산은 양손 무기를 든 동안 보조 칸 장비를 정해진 규칙으로 무시한다. 화면에는 "양손 무기라 보조 칸 꺼짐"을 보인다.
    - 시험: 장착된 아이템의 `twoHanded`나 `slot`을 바꿔도 미리보기·웨이브 사양·실험실이 던지지 않는다.
- 넣지 않는 칸
  - 강화 단계(D-275), 재료 품질(D-282) [V `48:412`].
  - 착용 스탯 요구(D-424). `req`는 착용 조건이 아니다(위).
  - 막기·반격: 공식이 없다 [V조사].
  - 고정 관통
    - 48에는 있다 [V `48:182,263,274`]. sim에는 비율 관통 칸만 있다 [V `formula.ts:52-66,190-191`].
    - 넣으면 판정이 바뀌어 ADR과 `SIM_VERSION`이 필요하다. WP-8에서 한다.
  - 탄약 연결: 질문 3 뒤.
  - 소켓 규칙
    - D-5008은 소켓 수를 만들 때의 등급으로 정한다 [V `02:8758-8760`, `49:200` F8].
    - 프리셋마다 덮어쓰는 칸을 두면 이 규칙이 바뀐다. 그래서 편집기 칸이 아니라 보석 질문 묶음으로 보낸다(7장).
  - 휴먼 생명공학 칸, 안장 이동·적재 보정: 1장 표대로 미룬다.

### 2.5 식품·소모품

- 신선도 `perish: { shelfLifeMs }`
  - 정수 3,600,000(1시간)~31,536,000,000(365일).
  - 출발값은 개발자가 넣는다. 기획 예: 생선 3일, 육류 5일, 채소·약초·요리 7일, 곡류 14일, 훈제·절임 21일 [V `49:97` P26].
  - 보존 배율(냉장 ×2 등, P27)은 창고·가공 규칙이라 아이템 칸이 아니다 [V `49:98`] [A].
  - 신선도가 0이 된 뒤는 질문 4다.
- 사용 효과 `use: { effects: [{ effect: ref("effects"), value, chancePm?, durationMs? }] }`
  - 1~8줄. 효과 사전 코드만 쓴다(D-425) [V `02:7676-7685`].
  - 스킬 효과 줄과 모양이 같다 [V `combat.ts:198-208`]. 화면 부품도 같이 쓴다 [V SE:`apps/game/src/editor/skills/SkillParts.tsx:255` `EffectSection`].
  - 범위 칸(질문 2가 나·다일 때)과 전투 사용 조건 칸(질문 3이 나·다일 때)은 답을 받은 뒤 선택 칸으로 더한다. 옛 자료도 통과한다 [A].
- 요리 버프(D-472)
  - 재료 계열이 버프 스탯을 정한다. 농작물은 INT·WIS, 목축은 STR·VIT, 낚시는 DEX·AGI다.
  - 요리 버프는 하나만 걸리고, 더 센 것이 이긴다 [V `02:8357`, `50:238-239`].
  - 계열은 아이템 칸이 아니라 식재료 중분류의 `foodFamily` 칸에 둔다(2.6).
  - 지금 효과 사전은 이 둘을 나타내지 못한다.
    - `stat`에 1차 스탯이 없다. 전투 수치 6개뿐이다 [V `combat.ts:36-39`].
    - 중첩은 같은 효과 안에서만 refresh·stack·ignore다 [V `combat.ts:45`, `packages/sim/src/combat/effects.ts:32-34,100-101`]. "다른 요리 효과끼리 하나만, 센 것이 이김"을 적을 칸이 없다. 앞 판의 "`stacking`·`capCode`로 나타낸다"는 틀렸다.
  - 그래서 WP-6에서 효과 사전을 넓힌다. ADR이 필요하고, 판정이 바뀌면 `SIM_VERSION`도 올린다 [A].
    - `stat`에 1차 6개를 더한다.
    - 배타 묶음 칸(예: `exclusive: "food"`)과 "센 것이 이김" 규칙을 더한다.
  - 권고(WP-6): 요리의 버프 스탯이 레시피 재료 계열과 맞지 않는다.
- 효과 `durationMs`의 상한은 1시간이고, 0은 "전투 내내"다 [V `combat.ts:41-42`].
  - 더 긴 음식 버프가 필요하면 범위를 넓힌다. 값의 범위라 기술이 정한다 [A].
  - 질문 3 가의 "드는 일"에 들어간다.

### 2.6 새 분류

- `item_subcategories`: `{ id, name, major(9개 중 하나), order?, storage?, food?, foodFamily?, enabled }`
  - `storage`: `food`·`armory`·`general`·`tank`(D-121). 없으면 대분류 기본값을 쓴다. 장비는 무기고, 식품·식재료는 식량 창고, 나머지는 일반 창고다 [A].
  - `food`: 식품인지. 거래 방식과 보관이 이 값을 본다.
  - `foodFamily`: `crop`·`livestock`·`fishing`(D-472). 작물·약초는 농작물, 축산물은 목축, 어류는 낚시로 잡았다 [A].
  - 출발 목록은 D-5033 표의 중분류 예를 그대로 쓴다. 장비 줄은 무기·보조 무기·방어구·장신구·임플란트다 [V `02:9222-9230`, `50:228-236`].
  - 영어 이름, `storage`·`foodFamily` 짝은 기술이 짓고 사용자에게 보인다(D-487) [A].
- `item_tags`: `{ id, name, enabled }`. 빈 목록으로 시작한다.
- `weapon_types`: `{ id, name, order?, enabled }`.
  - 출발 후보는 옛 자료의 무기 종류에서 뽑아 보인다 [V조사].
- 세 분류 모두 바로 적용 대상이다(4.1).
- 분류 파일은 없어도 된다. 없으면 빈 목록으로 읽는다. 꼭 있어야 하는 파일은 manifest와 id-changes뿐이다 [V앞 `packages/content/src/validate/schema.ts:84-119`].

### 2.7 검사: 오류와 권고

- 모든 문제는 코드와 값(`code`, `params`)을 단다(3.9).
- 오류는 저장을 막는다. 팩 검사기 하나로 본다.
  - 형식, 범위, ko·en 필수, ID 형식.
  - 대분류별 묶음(2.3), 장비 규칙(2.4).
  - `twoHanded`는 weapon 칸만, `weaponType`은 weapon·offhand 칸만.
  - `req`와 직접 적은 적정치 칸 중 하나만.
  - 장비의 `stackMax`는 1.
  - `bound`가 참인데 `tradable`도 참.
  - `combat.resistPm`의 길이는 12.
  - 참조가 있는가: 스킬, 스탯 행, 효과, 중분류, 태그, 무기 종류, 유닛 종류.
  - 중분류의 대분류가 아이템의 대분류와 같은가. 팩 단위 검사 `checkItemTaxonomy`를 새로 둔다.
  - 대분류 바꾸기 제한
    - 팩 항목은 팩의 대분류와 같아야 한다. 서버가 `category_locked`로 거절한다.
    - 편집기에서 만든 항목은 다른 항목이 가리키지 않고 보유가 없을 때만 바꾼다. `precious`로 바꾸거나 `precious`에서 바꾸는 것은 안 된다.
  - 은퇴 ID 다시 쓰기, 같은 ID 둘, DB가 못 담는 글자 [V SE:`apps/server/src/contentEdit/state.ts:262-268`].
  - 묶음 크기와 글 크기 상한(3.8).
- 권고는 저장을 막지 않는다. 서버가 셈해 목록에 개수로 보인다.
  - 무게·중분류·설명이 없다.
  - 이름 길이가 F19 범위(한글 2~8자, 영문 3~16자) 밖이다. 대상이 "크리쳐 등"이라 권고로만 둔다 [V `49:211`].
  - 꺼진 스킬·효과·스탯 행을 가리킨다.
    - 참조 검사는 켬·끔을 보지 않는다 [V `packages/content/src/validate/references.ts`를 찾아봄].
    - 전투 자료는 이런 참조를 걸러 내고 돈다(WP-0).
  - 그 칸을 가진 켜진 유닛 종류가 없다. `kinds`에 적은 종류에 그 칸이 없어도 같다.
  - 이 무기의 칸으로는 그 장비 스킬을 쓸 수 없다(D-490) [V SE:`packages/sim/src/combat/skills.ts:201-209`].
  - 장비 스킬 수가 입을 수 있는 유닛 종류의 기본 스킬 칸 수보다 많다. 넘는 스킬은 말없이 잘린다 [V `equipment.ts:154,160`].
  - 적정치가 0이다. 실효 식이 `if(A <= 0, W, …)`라서 유닛 스탯과 상관없이 무기 값 그대로 쓴다 [V FM:`content/core/formulas.json` `real_attack`·`real_hit`·`real_crit`, `combat.ts:229-231`, `combat.ts:237-239`].
  - 완제품 티어가 주재료 티어와 다르다. D-5001 "완제품의 티어 = 주재료의 티어"다 [V `50:16`]. 주재료의 정의가 없어서 레시피 입력 가운데 가장 높은 티어와 견준다 [A].
  - `maxDurability`가 실효 F12 이하다.
  - 속성 저항 합이 1000‰ 이상이라 면역이 된다(2.4).
  - 1차 스탯 합이 `MAX_STAT_INPUT`에 가깝거나 넘는다(2.4).
  - 코드가 ID로 쓰는 아이템이다(3.6). 끄기, 칸 바꾸기, 무기 칸 바꾸기는 확인 창을 띄운다.
  - 끄면 레시피·생필품이 함께 멈춘다.
  - 기준 가치가 레시피 원가보다 낮거나 10배를 넘는다. 문턱은 코드 상수다 [A].
  - 생필품이 쓰는 아이템인데 `tradable: false`이거나 `bound`다. 휴먼은 생필품을 직접 산다(D-148) [V조사].
  - 식품 중분류인데 신선도가 없다 [A].

### 2.8 지금 팩과의 대응, 옮기는 순서

- 지금 19개 항목은 바꾸지 않아도 통과한다. 쓰는 칸은 `id, name, category, tier, baseValue, enabled, equip`뿐이다 [V `content/core/items.json`].
- 칸 값을 기술이 채우지 않는다. 무게 같은 값은 개발자가 편집기에서 넣는다(D-398·D-487).
- 순서
  1. 형식에는 선택 칸만 더한다. 기존 팩이 그대로 통과하므로 `formatVersion`은 그대로다 [V앞 dev-settings ADR 2절].
  2. 팩은 서버 이미지에 함께 들어간다. 그래서 직전 판 앱은 새 팩을 보지 않는다 [V `docs/PLAN.md:333`].
  3. WP-2는 지금 팩 항목 19개를 고치지 않는다. 중분류 채우기도 하지 않는다.
     - 팩 항목의 해시가 바뀌면, 그 항목의 세계 덮어쓰기가 배포 때 통째로 진다 [V SE:`state.ts:307-312`].
     - 기존 항목의 칸은 세계 편집기에서 채우고, 내보내기로 팩에 넣는다.
  4. DB 마이그레이션은 하나다(WP-1).
     - 은퇴 ID 표를 더한다.
     - `content_overrides_category` 검사를 effects·item_subcategories·item_tags·weapon_types까지 한 번에 넓힌다.
     - 직전 판 앱은 모르는 분류의 줄을 읽을 때 거른다 [V SE:`apps/server/src/contentEdit/store.ts:46-48`].
     - 갈래가 셋이다. main `battle_lab_presets`, SE `content_overrides`, FM `formula_overrides`가 모두 gardener 위에 있다 [V 세 `snapshot.json`의 `prevIds`]. 그래서 이 마이그레이션의 `prevIds`에 세 끝이 모두 들어간다(AGENTS 6장 Drizzle 갈래).
  5. 되돌림: 새 판에서 저장한 줄은 직전 판 앱이 지우지 않는다(WP-0, 4.5).
  6. 읽는 곳은 칸마다 따로 붙인다. 칸이 없으면 지금 동작 그대로라 시뮬 출력이 같다.
     - 확인 1: 바꾸기 전과 뒤에 `sim econ16`·`war16` 요약을 바이트로 비교한다.
     - 확인 2: `apps/server/src/world/combatCatalog.test.ts:14-25`(팩 = sim 시험 자료)가 그대로 통과한다 [V].
  7. 겹친 규칙을 하나로 모은다. 출력은 바뀌지 않는다.
     - 장비 칸 목록 3벌: `combat.ts:11-20`, `packages/sim/src/combat/equipment.ts:14-22`, `packages/shared/src/roster.ts:68-77` [V].
     - 호가창 규칙 3벌(5.1).
  8. 시뮬과 서버 시안의 호가창 규칙이 다르다.
     - 시뮬은 켜진 모든 물건에 호가창을 만든다. 장비도 포함이다 [V `packages/sim/src/simulator/economy.ts:161-182`].
     - 서버 시안은 장비·문서를 뺀다 [V `apps/server/src/economyView/previewWorld.ts:110-112`].
     - 첫 판은 시뮬을 그대로 둔다. 둘을 맞추는 일은 판정이 바뀌므로 ADR과 `SIM_VERSION`을 두고 따로 한다 [V `docs/PROTECTED.md:14`].

### 2.9 ID

- 형식은 `^[a-z][a-z0-9_]{1,47}$`이고, 분류 안에서 하나다 [V `common.ts:6`].
- 은퇴 ID는 두 가지다.
  - 팩 id-changes에 있는 ID.
  - 그 세계에서 지운 "만든 항목"의 ID. 새 표 `content_retired_ids`에 남긴다(WP-1).
  - 둘 다 새 항목에 쓸 수 없다(`retired_id`).
  - 지금은 id-changes만 본다 [V SE:`state.ts:190-195,266-268`].
  - 지금은 만든 항목을 되돌리면 줄이 지워지고 흔적이 없다 [V SE:`state.ts:274-284`, SE:`store.ts:99-102`]. 그래서 같은 ID를 다른 뜻으로 다시 만들 수 있다. PROTECTED는 한 번 쓴 ID를 다시 쓰지 않는다고 한다 [V `docs/PROTECTED.md:23`].
- 만든 항목은 이럴 때만 지운다.
  - 다른 항목이 가리키지 않는다(팩 검사가 본다).
  - 보유가 없다. 보유 표가 생기면 서버가 본다.
  - 그 밖에는 끄기만 한다. 지우면 은퇴 ID 표에 남는다.
- 저장한 ID는 바꾸지 않는다. 편집기에 이름 바꾸기가 없다.
  - 바꾸려면 새로 만들고 옛 것을 끈다.
  - 팩에서 지우는 일은 팩 커밋으로만 한다. id-changes에 뒤에 추가만 하고 판을 올린다 [V AGENTS 4장, `packages/content/src/validate/idChanges.ts:3,80`].
- 켤 때 팩에 세계가 만든 ID가 생기면
  - 지금은 팩이 이기고 그 줄을 바로 지운다 [V SE:`state.ts:307-312`].
  - 팩 항목이 세계 항목과 같으면, 내보내기를 그대로 넣은 것이다. 조용히 지운다.
  - 다르면 지우지 않고 잠재운다. 크게 알린다.
    - 서버 기록과 감사 `content.slept`(까닭 `id_collision`)를 남긴다.
    - 편집기에 [새 ID로 옮기기]와 [버리기]가 있는 띠를 보인다.
- 내보내기에는 만든 항목(`from: null`)과 은퇴 ID(선택 칸 `retiredIds`)를 싣는다.
  - `pnpm tuning:apply`는 은퇴 ID를 새 항목으로 넣지 않는다. 팩에 이미 그 ID가 있으면 종료 코드 1로 알린다 [A].
- ID는 영어 이름에서 snake_case로 제안한다. 겹치면 `_2`를 붙인다 [A].

### 2.10 이름과 다국어

- ko·en은 필수이고, 빈 글은 안 된다 [V `common.ts:22-31`].
- 추가 언어는 이 줄기에서 하지 않고 WP-L로 뗀다. D-484는 "데이터 구조는 지금부터 여러 언어 칸으로"라고 했다 [V `02:8451-8456`].
  - `localizedText`는 모든 분류가 같이 쓴다 [V `common.ts:22`].
  - 팩 형식 ADR과 PLAN 8장이 이름을 `{ko, en}`으로 정했다 [V `docs/adr/2026-10-28-content-pack-format.md:38`, `docs/PLAN.md:342`].
  - 이름 표 타입 `LocalizedName`도 ko·en뿐이다. 추가 키는 빠진다 [V `packages/shared/src/roster.ts:54-58`, SE:`packages/shared/src/skillEditor.ts:10-13`].
  - 앱에 ja·zh 화면 언어가 없다 [V `apps/game/messages/`에 en·ko만 있음].
  - WP-L에서 할 일
    - 형식 ADR을 대체하는 새 ADR을 쓴다.
    - 언어 목록은 하나만 두고, 선택 칸과 이름 표 타입을 넓힌다.
    - 화면 언어가 생기기 전에는 "다른 언어" 입력을 숨긴다.
- 화면에는 고른 언어(ko·en)를 보인다.
- 이름 칸 도움말에 적을 것
  - 실존 종교·국가·인물을 쓰지 않는다(R9).
  - 다른 게임 고유의 이름을 쓰지 않는다(D-067).
  - 창작 이름은 출시 전에 상표를 검색한다 [V `50:380-381`].

## 3. 편집기 화면

### 3.1 주소, 공용 틀, 조각

- `/dev/items`
  - 주소 ID `dev_items`, 부모 `dev`, 틀 보임, 권한 `dev_admin`, 검색 칸 `item`(한 항목 바로 열기) [A].
  - 지금 개발자 도구가 모두 이 모양이다 [V `packages/shared/src/routes.ts:147-201`].
- `/dev/skills` 안에 넣지 않고 따로 둔다. 두 화면은 서로 연결 단추로 오간다.
  - 개발자 홈은 "부모가 dev인 주소"로 도구 목록을 만든다 [V `apps/game/src/editor/DevHome.tsx:18-20`].
  - 미리 캐시에서 빼는 규칙이 화면 파일 이름의 앞머리로 걸린다 [V `scripts/pwa-build.mjs:119-130`].
  - 스킬 쪽에는 "이 스킬을 주는 장비" 목록이 있다 [V SE:`apps/server/src/contentEdit/views.ts:89-106`].
- 공용 틀은 스킬 편집기에서 꺼내 만든다. 리팩터링이다(WP-4a).
  - 스킬 편집기 화면은 이미 있다 [V SE:`apps/game/src/editor/skills/`, 10개 파일].
  - 꺼낼 것 [V SE 해당 파일]
    - 입력 칸 부품: `SkillFields.tsx`의 NumberField·TextField·SelectField·CheckField·RemoveButton
    - 효과 줄 편집: `SkillParts.tsx:255`
    - ID 제안, 숫자 읽기, 오류 키 바꾸기: `skillModel.ts:61,151,175`
    - 목록 판, 담기 막대, 최근 바꿈
  - 꺼낸 파일은 `apps/game/src/editor/content/contentEditor*.tsx`로 짓는다.
  - 스킬 편집기 동작은 그대로다. `e2e/skills.spec.ts`가 고치지 않고 통과해야 한다.
- 조각과 미리 캐시
  - 화면 파일 `apps/game/src/editor/items/ItemEditorScreen.tsx`는 조각 `ItemEditorScreen-*.js`가 된다.
  - 두 화면이 같이 쓰는 모듈은 rolldown이 따로 한 조각으로 묶는다. 그 이름은 묶인 모듈에서 정해진다 [V `docs/adr/2026-10-31-star-system-editor.md:61-64`]. 그래서 공용 파일 이름을 `contentEditor`로 시작하게 한다.
  - 세 곳을 고친다. SE가 스킬 편집기로 같은 세 곳을 고친 방식을 따른다 [V SE:`scripts/pwa-build.mjs:120-131`, SE:`apps/game/vite.config.ts:118-128`].
    - `DEV_ONLY_CHUNK`에 `[Ii]temEditor`·`[Cc]ontentEditor`
    - `apps/game/vite.config.ts`의 `globIgnores`에 같은 두 무늬
    - `DEV_ONLY_SOURCE`에 `items`·`content`
  - 빌드로 확인한다. 미리 캐시 목록에 두 무늬가 없고, `DEV_ONLY_SOURCE` 검사가 통과해야 한다.
- 게임 앱은 `@terra/content`를 가져오지 않는 관례를 지킨다 [V `apps/game/src/editor/planet/stableJson.ts:4`]. 형식 검사는 서버가 한다.

### 3.2 배치
- D-6048 틀을 쓴다 [V `02:10461-10472`].
  - 왼쪽은 표다. 거르기와 정렬을 한다.
  - 오른쪽은 편집 판이다.
  - 바꾼 기록과 되돌리기가 있다.
  - 아이템에는 분포가 없어 지도 겹치기는 두지 않는다.
- 넓은 화면
  - 목록 2 : 편집 3.
  - 머리 줄: 팩 판, 덮어쓰기 판, 바뀐 항목 수, 잠든 줄 수, [내보내기], [새로 만들기].
- 390px
  - 목록은 카드로 보인다. 누르면 편집 화면이 전체로 쌓인다(뒤로 가기).
  - 거르기는 아래에서 올라오는 판이다.
  - 담은 변경 막대는 화면 아래에 붙는다. 설정 칸 패널과 같다 [V앞 dev-settings ADR 12절].

### 3.3 목록
- 줄에 보이는 것
  - 대분류 모양(아이콘 대신), 지금 언어의 이름과 작은 글씨 ID.
  - 중분류 칩, 티어 칩(T0~T9). 장비면 칸과 무기 종류, 자원이면 보관 창고.
  - 한 줄 요약
    - 무기: 공격 칸과 요구치(또는 적정치)
    - 방어구: 주요 스탯 범위
    - 소모품: 효과
    - 자원: 무게와 기준 가치
  - 출처 칩(팩 / 고침 / 새로 만듦 / 잠듦), 꺼짐, 코드 참조, 권고 수.
- 찾기: ID, 이름(ko·en), 태그로 찾는다. 입력을 멈추고 300ms 뒤에 거른다 [V조사].
- 거르기
  - 대분류 타일: 개수가 붙고, 누르면 거른다 [V조사].
  - 중분류, 티어 범위, 장비 칸, 입을 수 있는 유닛 종류, 출처, 켬·끔, 권고 있음, 담은 변경 있음.
- 정렬: 이름, ID, 티어, 기준 가치, 무게, 최근 바꿈.
- 등급으로는 거르지 않는다.
  - 등급은 프리셋의 성질이 아니다. 만든 물건마다 서버 백분위로 정한다(D-5003) [V `50:33-56`].
- 줄이 1,000개를 넘으면 보이는 줄만 그린다. 새 의존성은 쓰지 않는다 [A].

### 3.4 편집 칸(접히는 구역)
- 기본
  - ID는 새 항목만 입력한다. 영어 이름에서 제안하고, 겹침과 은퇴 ID를 바로 확인한다.
  - 이름 ko·en(필수). "다른 언어"는 WP-L 전까지 숨긴다.
  - 설명, 켬·끔.
  - 새 항목은 꺼진 채로 만든다. 덜 만든 항목이 세계에 나오지 않게 하려는 것이다 [A].
- 분류
  - 대분류는 팩 항목이면 잠긴다. 바꾸려면 팩 커밋으로 한다.
  - 만든 항목은 가리키는 항목도 보유도 없을 때만 바꾼다. 귀금속으로·귀금속에서는 막는다.
  - 대분류를 바꾸면 맞지 않는 묶음을 지운다고 먼저 묻는다.
  - 중분류(그 대분류 것만)와 태그.
- 값·무게·거래
  - 티어(0~9).
  - 기준 가치: 최소 단위, [임시] 표시.
  - 무게: g로 입력하고 kg·t로도 보인다 [V조사].
  - 스택 상한: 장비면 1로 고정한다.
  - 거래 가능, 계정 귀속. 계정 귀속을 켜면 거래 가능이 꺼진다.
  - 보관 창고: 중분류에서 온 값이다. 읽기만 한다.
- 장비
  - 칸: 그 칸을 가진 유닛 종류를 함께 보인다. 사이보그 9칸, 휴먼 6칸, 안드로이드 9칸, 크리쳐 2칸이다 [V `content/core/unit_kinds.json`]. 크리쳐는 WP-C 뒤에 3칸이 된다.
  - 입을 수 있는 유닛 종류, 크리쳐 보유 무게, 훔치기 확률.
  - 무기 종류(weapon·offhand 칸만).
  - 스탯 줄
    - 1차를 올리는 칸이면 1차 6개만, 아니면 2차 행만 고를 수 있다. 공격력 두 행은 보이지 않는다 [V `combat.ts:21-24`].
    - 최소·최대와 중간 값을 보인다. 16줄까지.
  - 속성값 12칸(1~10), 전투 직접 값(저항 12칸·고정 방어·관통‰), 최대 내구도, 장비 스킬(4개까지).
- 무기(칸이 weapon일 때). 칸 정의 표 `WEAPON_FIELDS`에서 그린다.
  - 공격 칸 둘(물리·속성)을 켜고 끈다. 둘 다 켜면 기본 공격 칸을 고른다 [V `combat.ts:251-286`].
  - 1차 요구치 또는 적정치를 고른다. 요구치를 고르면 셈한 적정치가 읽기 전용으로 보이고, "계산식 탭에서 보기"로 연결한다.
  - 명중‰, 크리‰, 공격 간격 ms, 사거리, 곡사.
  - 스태미나·MP 소모: 행동별 소모 화면과 같은 값이라고 표시한다.
  - 속성 계수 12칸, 양손.
- 소모품
  - 효과 줄: 공용 효과 줄 편집으로 효과 사전에서 고르고, 값·확률‰·지속을 넣는다.
  - 신선도: 유통기한을 일·시간으로 넣는다.
- 칸마다 단위·범위·쓰는 곳 칩을 붙인다. 쓰는 곳은 전투 / 경제 / 화면 / 아직 없음이다.
  - 설정 칸 패널의 범위 칩과 같은 생각이다 [V앞 dev-settings ADR 7·12절].
  - 칩 표는 `@terra/shared/itemEditor`에 하나만 둔다 [A].
- 대분류별 안내 띠
  - 총량 자원: 정의만 바꾼다. 총량은 매장량 조정으로만 바뀐다.
  - 설계도·보석: 규칙 미정.
- 코드 참조 아이템을 끄거나, 칸이나 무기 칸을 바꾸면 확인 창을 띄운다(3.6).

### 3.5 고르기 창
- 효과 사전
  - 찾기, 종류 거르기.
  - 줄마다 종류·대상 수치·값 방식·기본 지속·중첩·상태이상을 보인다.
  - 꺼진 효과는 흐리게 보인다.
  - WP-6 뒤에는 실효 효과를 읽는다. 스킬 편집기의 효과 고르기도 같이 바꾼다. 지금은 팩 효과만 본다 [V SE:`state.ts:106-107`].
- 스킬
  - 모양·기반·필요한 무기 칸·맨손 스킬 여부(D-490)를 보인다 [V SE:`packages/shared/src/skillEditor.ts:23-25`].
  - 이 무기로 못 쓰는 스킬은 경고한다.
- 스탯 행: 1차와 2차로 묶는다. 2차는 가중치 표의 이름으로 보인다.
- 중분류·태그·무기 종류·유닛 종류: 고를 수 있고, 앞의 셋은 [새로 만들기]도 있다. 새로 만든 것은 같은 묶음에 담긴다.

### 3.6 쓰이는 곳(읽기와 연결만)
- 이 아이템을 만드는 레시피와 쓰는 레시피 [V `economy.ts:61-70`]. 생필품 줄 [V `economy.ts:73-86`].
- 장비 스킬은 `/dev/skills`로 연결한다.
- 입을 수 있는 유닛 종류.
- 드롭과 조우 보유는 크리쳐 편집기가 생기기 전까지 "없음"이다.
- 끄면 멈추는 것: 레시피·생필품 연쇄 목록.
- 코드 참조. ID를 코드나 시나리오에 박은 곳이다 [V 모두 main]

| 곳 | 아이템 | 쓰임 | 없거나 바뀌면 |
|---|---|---|---|
| `packages/sim/src/simulator/combatRun.ts:66-70` | test_sword·test_helmet·test_vest·test_ring | 시뮬 유닛 장비 | 그 칸이 빈다 [V `combatRun.ts:76-80`] |
| `packages/sim/src/simulator/waveBattle.ts:33,150-159` | test_staff | 정원사 마법형 무기 | 마법형이 칼 몸으로 돌아가 건물 피해가 0이 된다. 공성 30분을 다 쓴 적이 있다(전투 하나 CPU 약 20초) [V `waveBattle.ts:8-11`] |
| `packages/sim/src/combat/replayDemo.ts:41-77` | test 장비 넷, 속성 지팡이 6, test_staff(대신 쓰는 것) | 전투 다시보기 시범 6 대 6 | 대신 쓰는 지팡이를 쓰거나 빈 칸 [V] |
| `apps/server/src/battleLab/samples.ts:32-134` | test 장비, fire_staff·light_staff | 전투 실험실 샘플(D-490 기본 장비). 크리쳐 샘플은 칸 0 = 장신구를 전제한다 | 빠진다. `samples.test.ts`가 실제 팩에서 본다 [V `samples.ts:4`] |
| `packages/sim/src/combat/gems.ts:39` | gem_protector(팩에 없음) | 보석 보호 자산 | — |
| `apps/server/src/roster/preview.ts:81-220, 399-403` | test_sword·test_staff·test_vest·test_helmet·test_ring·test_heart | 유닛·사이보그 시안 몸 | 그 칸을 건너뛴다 [V `body.ts:163`] |
| `apps/server/src/roster/preview.ts:227-228, 433-440` | 자원 6종, test_staff·test_heart | 시안 짐·보유 | 이름 대신 ID [A] |
| `apps/server/src/roster/preview.ts:429` | test_heart의 속성값 `{fire: 2, frost: 3}`을 코드에 박음 | 사이보그 속성값 시안 | WP-5에서 `equip.elements`를 이으면 두 번 센다. 팩으로 옮기고 이 줄을 같은 커밋에서 지운다 |
| `apps/server/src/economyView/previewWorld.ts:130-146, 209-219` | 자원 5종, test_sword·test_vest | 경제 시안 보유·주문 | 빠진다 [V `previewWorld.ts:130`] |
| `apps/server/src/economyView/previewProduction.ts:153,155` | ration·iron_ingot | 생산 시안 반복 조건 | [A] |
| `packages/sim/scenarios/econ16.json:33-42, 78-87` | ration·household_goods | 시작 재고 | [A] |
| `packages/sim/src/combat/catalog.ts:262-311`, `catalogMagic.ts:185-220` | 시험 장비 12개 | 팩 = 시뮬 시험 자료(시험이 같다고 본다) | 같은 커밋에서 함께 고친다 [V `combatCatalog.test.ts:14-25`] |

- 보호
  - sim이 쓰는 ID를 상수로 내보낸다. 예: `SIM_ITEM_REFS`(장비 묶음, `MAGIC_WEAPON`, 다시보기 묶음, `PROTECTOR_ASSET`).
  - 서버는 시안·실험실 ID 표를 더해 편집기에 보낸다.
  - 시험이 이 표와 코드에 적힌 문자열을 맞춰 본다 [A].
  - 끄기, 칸 바꾸기, 무기 칸 바꾸기는 확인 창을 띄운다. D-5054 구조 값의 확인 창과 같은 방식이다 [V `02:9552-9560`].
  - 나중에 `MAGIC_WEAPON`과 시뮬 묶음을 팩 자료로 옮긴다(WP-8).

### 3.7 미리보기(서버가 셈한다)
- 장비
  - 기준 유닛은 전투 실험실의 기본 유닛을 쓴다. 새 사이보그 평균(1차 모두 10, Lv 1)에 기본 무기·장비와 스킬이 붙은 유닛이다(D-467 ①, D-490 ②) [V `02:8289`, `apps/server/src/battleLab/samples.ts:32-39`].
  - 종류·레벨·1차 스탯은 바꿀 수 있다.
  - 담은 초안(저장 전)을 범위의 0·500·1000‰ 자리로 입힌다.
  - 1차·2차 스탯을 입기 전, 입은 뒤, 차이로 표에 보인다.
  - 유닛 화면과 같은 함수로 셈한다: `bodyView`·`loadoutOf`·`itemAt` [V `body.ts:82,157-209`, `equipment.ts:86-97`].
  - FM을 합친 뒤에는 `loadoutOf`가 레벨을 받아 행 식의 LV로 쓴다 [V `git diff b9a25a6 work/formulas -- packages/sim/src/combat/equipment.ts`]. 기준 유닛의 레벨을 넘긴다.
  - 기기는 계산하지 않는다. 게임 앱은 sim을 가져올 수 없다 [V `scripts/check-boundaries.mjs:20-21`].
  - 1차 스탯 합이 넘쳐 계산이 던지면, 500으로 끝내지 않고 칸 오류로 보인다(2.4).
- 무기
  - 칸마다 실제 공격력, 명중, 크리, 공격 간격을 그 세계의 실효 계산식으로 셈한다. 식을 이 문서나 코드에 박지 않는다.
    - 실효 식은 FM의 `TuningState.combatFormulas()`다 [V FM:`docs/adr/2026-11-01-formula-editor.md:91`].
    - 변수는 판정과 같은 함수가 만든다 [V FM ADR:66, FM:`packages/shared/src/formulaSample.ts:113` `runFormulaSample`].
    - 팩 식을 썼는지, 덮어쓴 식을 썼는지 보인다.
  - 요구치가 있으면 셈한 적정치와 그 풀이를 보인다. 예: `physical_attack` = STR 25 × 2 + DEX 15 × 0.6 = 59.
  - 장비 스킬마다 쓸 수 있는지 보인다 [V SE:`skills.ts:201-209`].
  - 승률(선택)
    - 전투 실험실의 한 판·몬테카를로 일에 초안 무기를 직접 값 무기로 넣어 돌린다 [V `packages/shared/src/battleLab.ts:62-83`, `apps/server/src/battleLab/build.ts:172`, `apps/server/src/trpc/battleLab.ts:57-59`].
    - 앞 판의 "밸런스 대결 워커" 대신 이미 main에 들어온 실험실을 쓴다.
- 소모품
  - 효과 줄마다 문장을 만든다. 예: "공격력 +12%, 30초, 다시 걸면 새로 시작".
  - 기준 유닛의 수치로도 보인다 [A: 문장 틀].
- 값
  - 기준 가치를 나라마다 보인다.
  - 레시피 원가 = 입력 기준 가치 합 ÷ 출력 수량. 기준 가치와의 차이도 보인다.
  - 생필품이면 유닛 하나의 하루 비용을 보인다.
  - 금액은 BigInt 정수로 셈하고, 보낼 때는 글자로 보낸다 [V AGENTS 4장].

### 3.8 대량 도구
- 복제
  - ID는 `_copy`를 붙여 제안하고, 이름에 "(복사)"·"(Copy)"를 붙인다.
  - 꺼진 채로 만든다 [V조사].
- 여러 개 고르기
  - 켜기·끄기, 티어, 중분류, 태그 더하기·빼기, 기준 가치 ‰를 바꾼다.
  - 이 바꿈은 항목 통째로 보내지 않는다. 서버가 지금 실효 항목에 그 칸만 고치는 명령(`patch_items`)으로 보낸다.
    - 행동별 소모의 `set_cost`와 같은 방식이다 [V SE:`services.ts:187-203`].
    - 그래서 낡은 초안이 다른 칸을 덮지 않는다.
  - 기준 가치 바꿈
    - 정수 ‰(−900~+10,000)를 받는다.
    - 서버가 BigInt로 `max(1, (값 × (1000 + ‰) + 500) ÷ 1000)`을 셈한다. 0.5는 올림이다.
    - 상한은 스키마 범위다 [A].
- JSON 내보내기·가져오기
  - 팩 파일과 같은 모양(`{"entries": […]}`)이다.
  - 가져온 것은 담은 변경(초안)에만 들어간다(PLAN 6.4) [V `docs/PLAN.md:305`].
  - 새로 / 고침 / 같음으로 나눈 차이를 먼저 보인다.
- CSV
  - 평평한 공통 칸만 다룬다: `id, category, subcategory, tier, baseValue, weight, stackMax, tradable, bound, enabled, name.ko, name.en, description.ko, description.en, tags`.
  - 장비와 효과는 JSON으로 다룬다.
  - 모르는 열과 틀린 값은 줄 번호로 알린다.
- 크기 상한 [A: 값]
  - 가져오기 글은 900 KiB까지다. tRPC 본문 상한 1 MiB 안이다 [V AGENTS 6장 tRPC "Fastify 본문 상한(1MiB)"].
  - 항목 하나는 4 KiB까지다. 지금 가장 큰 항목은 534바이트다 [V `items.json` `light_staff`를 잼].
  - 묶음은 300개까지, CSV는 300줄까지다.
  - 상수는 `@terra/shared/itemEditor`에 하나만 두고, 서버가 다시 본다.
  - 행성 초안 가져오기와 같은 방식이다 [V `apps/game/src/editor/planet/draftExport.ts:6-7,36`].
- 묶음 상한은 300이다 [A]. 지금 SE는 100이다 [V SE:`skillEditor.ts:220`]. 검사는 묶음마다 한 번 한다.
- 세계에서 만드는 항목은 분류마다 500개까지다 [A].
  - 대량 콘텐츠는 팩 파일로 넣는다.
  - 내보내기 `entries` 상한 2,000은 그대로다 [V SE:`packages/content/src/tuningDiff.ts:25,81`].
- 옛 1차 자원 136개 [V `OLD:terra-server/scripts/seed_primary_materials.js`를 셈]
  - 기술이 변환본을 만든다. 영어 이름, ID, g 무게, 대분류·중분류 매핑, 식재료 계열을 채운다. 은·금·백금을 대분류 9로 보낼지도 정한다.
  - 이름 바꿈 목록을 붙인다.
    - `MINERAL_T8_MITHRIL 미스릴`은 다른 작품의 창작 이름이라 바꾼다(D-067) [V 그 파일 13행, `50:381`].
    - 오리할콘(14행)은 옛 문헌의 이름이라 상표 검색 뒤 정한다 [A].
  - 출처를 확인한다. 옛 값(티어·무게)을 옛 코드·옛 문서와 대조하고, 다른 판이 있으면 적는다(03 §11 11-01 교훈) [V `docs/design/03_Planning_Rules.md:509`].
  - 사용자가 확인한 뒤(D-487) 팩 커밋으로 넣는다.

### 3.9 검사 메시지
- 바로 보이는 검사(기기): 필수 칸, 범위, 형식.
  - `@terra/shared/itemEditor`의 범위 상수를 쓴다.
  - 서버 스키마와 같은지 시험이 본다. SE의 `SKILL_LIMITS`와 같은 방식이다 [V SE:`skillEditor.ts:99-117`].
- 서버 검사 `items.check`
  - 입력이 1초 멈추거나 [검사]를 누르면 돈다.
  - 저장과 같은 코드로, 묶음을 얹은 실효 팩 전체를 팩 검사기로 본다 [V SE:`state.ts:218-235,251-297`].
- 문제는 `{file, id, path, level, code, params}` 모양으로 와서 그 입력 칸에 붙는다.
  - 지금 SE는 사람이 읽는 줄 20개만 준다 [V SE:`state.ts:84-92,130,226-230`].
- 코드 붙이기
  - `ContentIssue`에 선택 칸 `code`·`params`를 더한다. 지금은 이 칸이 없다 [V `packages/content/src/issue.ts:6-21`].
  - 스키마 단계는 zod 문제 코드와 한계 값(최솟값·최댓값)을 그대로 싣는다.
  - 새 팩 단위 검사(2.7)는 저마다 코드를 단다.
  - 화면은 메시지 키(ko·en)로만 보인다. AGENTS 4장, 그리고 PLAN 8장 "서버는 문장 대신 코드를 보낸다"를 따른다 [V `docs/PLAN.md:343`].
- 남은 빚
  - 코드가 없는 옛 검사 문구는 칸 경로와 코드 `content_other`로 보인다. 한국어 원문은 "자세히"에만 둔다.
  - ADR에 빚으로 적는다.
  - 스킬 편집기도 같은 틀로 옮긴다. 지금은 원문 줄을 그대로 보인다 [V SE:`skillModel.ts:138-157`].
- 오류(빨강)는 저장을 막고, 권고(노랑)는 막지 않는다.

### 3.10 담기, 적용, 충돌, 최근 바꿈
- 담은 변경 막대
  - 담은 항목 수, 메모(200자) [V SE migration `note ≤ 200`], [적용], [비우기].
  - 담은 것 안에서 되돌리기·다시하기를 한다. 기기 안에서만 돈다 [V `docs/PLAN.md:300`].
- [적용]은 `items.save` 한 묶음으로 보낸다. 항목마다 `baseHash`를 싣는다.
  - `baseHash`는 초안을 시작할 때의 실효 항목 해시다. 새 항목은 null이다.
  - 서버는 지금 실효 해시가 `baseHash`와 다르면 그 묶음을 받지 않는다. `entry_changed`와 지금 항목을 돌려준다.
  - 판(`content_override_revision`)이 달라도, 묶음의 모든 `baseHash`가 맞으면 받는다. 다른 항목만 바뀐 경우다.
    - 검사는 늘 차례(serial) 안에서, 그때의 실효 팩 전체로 한다 [V SE:`services.ts:222-226`].
    - 그래서 서로 가리키는 항목도 맞게 본다 [A: 규칙].
  - 충돌이 나면 기기는 바뀐 칸만 새 항목 위에 다시 얹는다(3방향 합치기). 같은 칸을 양쪽이 바꿨으면 둘을 보여 고르게 한다.
  - 같은 규칙을 스킬 편집기에도 쓴다.
    - 지금 스킬 편집기는 판 충돌 뒤에 목록만 다시 받고, 낡은 통째 초안을 그대로 다시 보낸다 [V SE:`apps/game/src/editor/skills/SkillEditorScreen.tsx:114-141`].
    - 행동별 소모의 `set_cost`는 아이템 항목의 소모 칸을 고친다 [V SE:`services.ts:150-169,198-201`]. 이 규칙이 없으면, 아이템 초안을 다시 보낼 때 그 바꿈이 되돌려진다.
- 비교: 팩 값과 실효 값의 칸 차이를 보인다. 고친 칸을 강조한다.
- 최근 바꿈
  - 목록은 요약만 받는다. 감사 줄마다 시각, 사람, 메모, 판, `(분류, ID, 만듦/고침/되돌림)`을 보인다.
    - SQL에서 `after->'changes'`를 풀어 항목 통째는 빼고 보낸다 [A].
    - 지금 SE는 앞뒤 jsonb를 통째로 읽는다 [V SE:`store.ts:223-236`].
  - 항목 통째는 [펼치기]나 [이 판으로 되돌리기]를 누를 때, 감사 줄 ID로 하나만 받는다.
  - 항목별 기록
    - `content.*` 줄 가운데 그 키를 가진 줄을 jsonb 포함 검사로 찾는다.
    - 감사 표에는 `target_id` 색인만 있다 [V `apps/server/src/db/schema.ts:188-207`].
    - `content.%` 부분 색인은 줄이 쌓인 뒤 재 보고 더한다 [A].
    - 색인 추가는 되지만 추가만 하는 트리거는 건드리지 않는다 [V `docs/PROTECTED.md:26`].
  - [이 판으로 되돌리기]는 그 `content.apply` 줄의 항목을 담는다 [V SE:`store.ts:117-140`].
  - "팩이 이김"이나 "지움"으로 사라진 줄에는 [다시 담기]가 있다.
    - `content.pack_won`·`content.dropped` 감사에는 항목이 없다. 팩 해시와 까닭뿐이다 [V SE:`store.ts:157-184`].
    - 그래서 그 키의 마지막 `content.apply` 줄에서 항목을 찾아 담는다.

### 3.11 디자인·문구·접근성
- 스타일
  - `data-density="compact"`. `tokens.css`의 `var(--…)`만 쓴다 [V AGENTS 8장].
  - 티어·등급 색 토큰은 아직 없다 [V `apps/game/src/styles/tokens.css`를 찾아봄]. 티어는 중립 토큰의 숫자 칩으로 보인다.
  - 등급 색(50 §1.3)은 등급이 생길 때 테마 4개의 대비 검사와 함께 더한다.
  - 스탯 색은 기존 `--color-stat-*`·`--color-sec-*`를 쓴다 [V `tokens.css:204`].
- 문구
  - 새 문구는 `dev_items_*` 키로, ko·en을 함께 쓴다.
  - 대분류는 기존 `economy_cat_*`를 쓴다 [V `apps/game/src/economy/economyText.ts:77-85`].
  - 칸은 기존 `roster_slot_*`를 쓴다 [V `apps/game/messages/ko.json:1057-1065`].
- 검토
  - 파스텔·다크 두 테마에서 사진을 찍는다.
  - `break-ui`(390px, 긴 한국어·영어, 빈 값, 큰 숫자)와 `web-design-guidelines`로 본다 [V AGENTS 8장].
- 접근성: 입력 칸마다 이름표를 단다. 오류는 `aria-describedby`로 그 칸에 잇는다. 판은 Esc로 닫힌다 [A].

## 4. 바로 적용(D-461)

### 4.1 저장소는 `content_overrides` 하나
- 표 모양 [V SE migration]
  - `(category, id)` 주키, `entry jsonb`, `pack_hash`, `content_version`, `note`, `updated_by`, `updated_at`.
  - 판 표 `content_override_revision`.
- 실효 항목 = 팩 항목 위에 덮어쓰기를 얹은 것이다. 팩에 없는 ID는 분류 끝에 ID 차례로 붙는다 [V SE:`state.ts:198-215`].
- 분류 목록은 SE의 `skills·items·unit_kinds`에 `effects·item_subcategories·item_tags·weapon_types`를 더한다(WP-1 DB, WP-3 코드).
- 설정 칸 표(`tuning_overrides`)는 정수만 담는다 [V `apps/server/src/db/schema.ts:935-962`]. 이름·목록·새 항목을 담을 수 없어서, 따로 저장소를 만들 까닭이 없다.
- 계산식 덮어쓰기는 이 표와 다르다. 설정 판(`tuning_revision`)과 `tuning.save`를 쓴다 [V FM ADR:88].
- `skills.*`와 `items.*` 라우터는 `ContentEditShared` 하나를 같이 쓴다.
  - 쓰기 차례 큐와 스냅숏이 하나라야 경합이 없다 [V SE:`services.ts:37-60`].
- 권한은 설정 칸과 같다.
  - `tuning: read·write` 두 겹이고, dev·admin에게만 준다.
  - 이어서 사용자별 속도 제한을 건다 [V SE:`apps/server/src/trpc/skills.ts:51-60`].

### 4.2 묶음 하나가 도는 흐름
1. 차례 큐에 들어간다.
2. 판과 `baseHash`를 확인한다.
3. 묶음을 얹은 실효 팩 전체를 검사한다(`plan`).
4. DB 트랜잭션 하나로 판 +1, 덮어쓰기 쓰기, 감사 기록을 한다.
5. 스냅숏을 대입 한 번으로 바꿔 끼운다 [V SE:`services.ts:219-258`, SE:`store.ts:85-143`, SE:`state.ts:336-354`].
- 읽는 쪽은 앞 스냅숏 전체나 뒤 스냅숏 전체만 본다.
- 명령 하나는 시작할 때 받은 값 한 벌로 끝까지 돈다 [V앞 dev-settings ADR 7절].

### 4.3 감사, 기록, 지표
- 감사 기록
  - `content.apply`: 앞뒤 항목 통째, 메모, 판.
  - 켤 때 남기는 `content.pack_won`·`content.dropped`: 항목은 없다 [V SE:`store.ts:20-24,117-184`].
  - 새로 `content.slept`를 둔다(4.5).
  - 감사 기록은 추가만 된다 [V `docs/PROTECTED.md:26`].
- 서버 기록 `content change`: 항목 키와 앞뒤 해시 [V SE:`services.ts:242-255`].
- `/health`에 `contentOverrides`·`contentRevision`이 있다 [V SE:`app.ts:215-216`].
- 1분 지표 줄에는 아직 없다. 설정 판만 있다 [V SE:`app.ts:514-521`]. WP-1에서 `contentRevision`을 더한다. 관문 지표를 바꾼 시각으로 나눠 보기 위해서다 [V앞 dev-settings ADR 9절].

### 4.4 팩과 세계: 가장 나중에 바꾼 것이 이긴다
- 켤 때 저장 때의 팩 항목 해시가 지금 해시와 다르면 팩이 이긴다. 덮어쓰기를 지우고 감사 기록을 남긴다 [V SE:`state.ts:307-312`].
- 설정 칸은 칸마다 판정한다 [V `docs/adr/2026-11-01-dev-settings-panel.md:67-73`]. 항목은 항목 통째로 판정한다.
  - 그래서 팩이 그 항목의 다른 칸(예: 영어 이름 오타)만 고쳐도, 세계에서 고친 값 전체가 진다.
- 배포 전 확인
  - 기존 팩 항목을 고치는 팩 커밋을 만들기 전에, NAS 세계의 덮어쓰기를 내보낸다.
  - 그것을 `pnpm tuning:apply`로 먼저 넣는다.
  - AGENTS 7장 `tuning:apply` 줄과 작업 기록에 이 차례를 적는다.
- 사라진 줄은 [다시 담기](3.10)로 되살린다.
- 나중에는 저장 때의 팩 항목도 함께 저장해 칸 단위로 3방향 합치기를 한다 [A].

### 4.5 켤 때(WP-0)
- 지금 SE가 하는 일 [V SE:`state.ts:299-334`]
  - 해시가 다르면 팩이 이기고 그 줄을 지운다(307-312).
  - 저장 때 팩에 있던 항목이 지금 팩에 없으면 `unknown_entry`로 지운다(313-317).
  - 검사에 실패하면 `invalid_entry`로 지운다(318-332). 한꺼번에 틀리면 저장 차례로 하나씩 다시 검사한다(324-332).
  - 지우기는 `cleanupContentAtBoot`가 한다 [V SE:`store.ts:146-187`]. 시작은 막지 않는다 [V SE:`services.ts:83-97`].
- 문제
  - 아이템 스키마는 엄격한 객체다 [V `economy.ts:30`]. 그래서 새 칸이 든 줄은 직전 판 앱에서 `invalid_entry`가 된다.
  - 배포가 점검에 실패하면 직전 이미지로 자동으로 되돌린다 [V `ops/deploy.sh:86-94`, `docs/PLAN.md:333-334`].
  - 그러면 편집기에서 만든 항목이 지워지고, 다시 배포해도 돌아오지 않는다.
- 고침. 이 검사를 맨 앞에 둔다.
  - 줄의 판(`content_version`, `core@N`)이 지금 팩보다 새로운지 본다. 팩 ID가 같고 @ 뒤 정수가 더 크면 새롭다.
    - 지금 팩에 그 항목이 있고 해시가 저장 때와 다르면, 팩이 이긴다. 되돌림 배포가 그 항목을 바꿨기 때문이다(D1 6절). 지금과 같다.
    - 그 밖이면(만든 항목, 해시가 같은 고친 항목, 지금 팩에 없는 항목), 검사를 통과하면 쓴다. 못 통과하면 지우지 않고 잠재운다.
    - 잠재운 줄은 적용하지 않고 DB에 둔다. 감사 `content.slept`(까닭 `newer_pack`)와 서버 기록을 남긴다.
  - 줄의 판이 같거나 옛것이면 지금 규칙 그대로다.
- 판이 돌아오면(N+1을 다시 켜면) 잠든 줄을 보통 규칙으로 다시 고른다. 해시가 같으니 다시 든다.
  - ADR에 적을 것
    - 자동으로 다시 드는 것은 되돌림이 그 팩 항목을 바꾸지 않은 줄뿐이다. 곧 만든 항목과 해시가 같은 고친 항목이다.
    - 되돌림이 바꾼 항목은 D1처럼 팩이 이기고, [다시 담기]로만 되살린다.
  - D1 설정 칸도 되돌림이 그 칸을 바꾸지 않으면 덮어쓰기가 남는다. 결과가 같다.
- 왜 SE 안에서 하나
  - main은 이 표를 모른다. 그래서 SE 첫 배포의 되돌림은 안전하다.
  - 위험은 SE가 운영에 올라간 뒤, 그다음 배포가 팩 항목 형식을 넓힐 때 시작한다. 예: FM의 `unit_kinds.naturalWeapon.unarmed` [V FM ADR:83], WP-2의 아이템 칸.
  - 되돌아갈 판에 이 규칙이 있어야 한다. 그래서 SE를 합치기 전의 관문으로 둔다.
- 시험(DB)
  - N+1이 저장한 세 가지 줄(만든 항목, 해시가 같은 고친 항목, N에 없는 항목)이 N을 켜도 남고, 적용되지 않는다.
  - N+1을 다시 켜면 다시 든다.
  - N+1에서 바뀐 팩 항목의 줄은 N에서 팩이 이긴다.
- 켤 때 시간
  - 하나씩 다시 검사하는 길은 줄 수 × 15~100 ms다 [A, 5.3].
  - 배포는 헬스체크 약 90초 안에 준비돼야 하고, 못 하면 되돌린다 [V `ops/deploy.sh:86-94`].
  - 그래서 WP-1 f에서 반씩 나눠 처음 틀리는 줄을 찾게 고친다.

### 4.6 내보내기 → 팩
- SE가 이미 한 것 [V]
  - 형식: `entries`(분류, ID, `from`, 항목) [V SE:`packages/content/src/tuningDiff.ts:51-81`].
  - `pnpm tuning:apply`가 적용한다 [V SE:`packages/content/src/node/entriesDiff.ts:24-56`, SE:`scripts/apply-tuning-diff.mjs:51-82`].
    - `from`이 지금 해시와 같으면 그 항목을 바꾼다.
    - `from`이 null이고 팩에 없으면 끝에 붙인다.
    - 그 밖은 건너뛴다. `--force`면 넣는다.
    - 판은 한 번만 올린다.
- 남은 것
  - 시뮬 `--tuning`이 `entries`를 얹지 않는다.
    - 같은 파일을 읽지만 설정 칸과 가중치 칸만 쓴다 [V SE:`packages/sim/cli/common.ts:166,187`]. SE ADR도 TODO로 적었다 [V SE:`docs/adr/2026-11-01-skill-editor.md:58,72`].
    - WP-1 b에서 `effectiveSource()`로 얹는다. 얹지 못한 항목(검사 실패, 모르는 분류)이 있으면 종료 코드 2로 끝낸다.
  - FM도 같은 파일에 `formulas` 칸을 더했다 [V FM:`packages/content/src/tuningDiff.ts:65`]. 합칠 때 두 선택 칸을 모두 둔다(M단계).
  - 새 분류를 세 곳에 한 번에 더한다(WP-3).
    - `ENTRY_DIFF_CATEGORIES` [V SE:`tuningDiff.ts:52`]
    - 적용 스크립트의 `ENTRY_FILES` [V SE:`apply-tuning-diff.mjs:24-28`]
    - 서버의 `FILE_OF` [V SE:`state.ts:124-128`]
  - 은퇴 ID와 만든 항목 목록을 싣는다(2.9).
- 붙이는 차례를 서버 실효 차례와 같게 한다. 팩 차례 다음에 만든 항목을 ID 차례로 둔다.
  - 그러면 팩에 넣은 뒤에도 시뮬 시장 번호가 같다 [V `packages/sim/src/simulator/economy.ts:161-170`, SE:`state.ts:198-215`].
  - 내보내기 차례는 스냅숏 정렬을 따른다 [V SE:`services.ts:127-136`, SE:`state.ts:338`].
- 그 팩이 배포되면 해시가 달라져 덮어쓰기는 저절로 정리된다(4.4) [V앞 dev-settings ADR 11절].

### 4.7 살아 있는 경제와 진행 중인 일
- 지금 세계에는 아이템 보유가 없다.
  - 원장 자산 형식 검사가 `item:<id>`를 받지 않는다 [V `apps/server/src/db/schema.ts:809`].
  - 세계는 시험 자산 둘만 쓴다 [V `packages/sim/src/settle/owner.ts:20-21`].
  - 경제 화면의 보유·시세는 시안이다 [V `previewWorld.ts:130-146`].
- 그래서 지금 바로 적용이 드는 곳은 셋이다.
  - 전투 자료: 유닛 화면 미리보기, 밸런스 무기 목록, 전투 실험실, 정원사 웨이브, 전투 다시보기.
  - 경제 목록과 시안(WP-3 뒤).
  - 시뮬(내보낸 차이로 돌릴 때, WP-1 뒤).
- 끄기
  - 끈 아이템은 새로 나오지 않는다.
  - 그 아이템을 쓰는 레시피·생필품은 함께 멈춘다. 지금도 이 규칙이다 [V `economyView/catalog.ts:58-63,86-89`, `packages/sim/src/simulator/catalog.ts:72-104`]. 편집기는 저장 전에 연쇄 목록을 보인다.
  - 이미 가진 물건이 어떻게 되는지는 질문 1이다.
- 기준 가치를 바꾸면 시뮬의 처음 시세와 NPC 값에 든다 [V조사]. 서버 시안 값에도 든다 [V `previewWorld.ts:115-119`]. 시안 캐시 키에 판을 넣는다 [A].
- 진행 중인 전투에는 들지 않는다.
  - 시작 자료 `BattleInit`에 계산을 마친 유닛 사양이 다 들어 있다.
  - 저장하고 복구할 때도 그것을 쓴다 [V `packages/sim/src/combat/battleTypes.ts:77-87`, `apps/server/src/world/battles.ts:82-106`].
  - 바꾼 값은 다음 전투부터 든다.

## 5. 서버·시뮬 영향

### 5.1 읽는 곳

| 곳 | main | 두 줄기(SE·FM) | 아이템 줄기가 할 일 |
|---|---|---|---|
| 유닛 화면 전투 자료·이름 `apps/server/src/roster/catalog.ts:62-101` | 켤 때 한 번 만든다(가중치 표만 접근자). 이름은 켜진 것만 [V] | SE: 실효 항목 접근자 [V SE:`roster/catalog.ts:76-125`] | 가진 물건을 보이려고 꺼진 아이템 이름도 담는다(보유 표 줄기) [A] |
| 정원사 웨이브 `apps/server/src/app.ts:336`, `apps/server/src/npc/runtime.ts:435` | 켤 때 받은 묶음으로 고정 [V] | SE: 웨이브마다 `rosterCatalog.combat` [V SE:`app.ts:339`] | 코드 참조 보호(3.6) |
| 전투 다시보기 `apps/server/src/battleReplay/` | 팩 + 가중치 표 [V `battleReplay/compute.ts:2`] | SE: `roster.combat`(실효) [V SE:`battleReplay/services.ts:71`] | WP-0 b. 꺼진 스킬로 던진다 [V `packages/sim/src/combat/replayDemo.ts:188`] |
| 전투 실험실 `apps/server/src/battleLab/` | `roster.combat` [V `battleLab/services.ts:182`]. 모르는 스킬은 건너뛰고, 모르는 효과에서는 던진다 [V `build.ts:233-240`, `packages/sim/src/combat/skills.ts:166`] | 실효(SE 뒤) | WP-0 b, `kinds` 거르기, 미리보기 승률 |
| 밸런스 무기 목록 `apps/server/src/balance/services.ts:101-106` | 요청마다 roster를 읽는다 [V] | 실효 | 없음 |
| 계산식 탭 무기 표 | — | FM: roster에서 무기를 읽는다 [V FM:`apps/server/src/formulas/services.ts:11-13,63-67`] | 합친 뒤 실효 항목이 그대로 보인다. 요구치로 셈한 적정치도 |
| 경제 목록 `apps/server/src/main.ts:137`, `economyView/catalog.ts:33-107`, `economyView/services.ts:117-135` | 켤 때 한 번 [V] | 손대지 않음 [V 두 줄기 `git diff --name-only`] | 접근자로 바꿔 판마다 다시 만든다. `market` 칸을 더하고, 시안 캐시 키에 판을 넣는다 |
| 호가창 규칙 3벌 `previewWorld.ts:110-112`, `apps/game/src/economy/WarehouseView.tsx:30-31`, `apps/game/src/economy/market/MarketItemsView.tsx:21-22` | [V] | — | `@terra/shared`의 `marketKindOf` 하나로 모은다. 서버가 결과 `market`을 보낸다. 기기는 칸이 없으면 옛 규칙을 쓴다. PWA 기기는 서버보다 옛것이거나 새것일 수 있다 |
| 미리보기 몸 `roster/body.ts:157-209` | 요청마다 [V] | FM: `loadoutOf`가 레벨을 받는다 [V] | 미리보기 API가 같은 함수를 쓴다 |
| 내보내기 | changes·statRows [V] | SE: entries [V], FM: formulas [V] | 은퇴 ID와 만든 항목 목록 |
| sim 전투 자료 `packCatalog.ts:79-95` | 켜진 장비만 옮긴다. elements는 옮기지 않고, 꺼진 스킬 참조는 그대로 둔다 [V] | SE: weaponField·bareHand [V SE:`packCatalog.ts:49-80`], FM: 행 식·전투 식 [V] | WP-0 b 거르기. WP-5에서 elements·combat·twoHanded·req·kinds |
| sim 유닛 계산 `equipment.ts:120-162`, `unitSpec.ts:46-75` | [V] | SE: bareHanded, FM: level | 더하기, 10에서 자르기, 양손이면 보조 칸 무시 |
| sim 경제 `simulator/catalog.ts:72-104` | [V] | — | 첫 판은 그대로 |
| sim 거래소 `simulator/economy.ts:161-182` | 모든 물건에 호가창 [V] | — | 그대로(위험 9) |
| sim `--tuning` | changes·statRows [V] | FM: formulas를 얹는다 [V FM:`packages/sim/cli/common.ts:178-216`], SE: entries를 얹지 않는다 [V] | WP-1 b |
| 기기 화면 | 서버 자료만 받는다 [V] | — | `market` 칸을 쓰고, 기기 쪽 규칙 사본 둘을 지운다 |

### 5.2 결정성
- 실효 내용은 팩 파일과 덮어쓰기 줄의 순수 함수다.
  - 차례는 팩 차례 다음에 만든 항목을 ID 차례로 둔다.
  - 해시는 정규 JSON의 SHA-256이다 [V SE:`state.ts:121-122,198-215`, SE:`packages/content/src/node/hash.ts:14-18`].
- 이 함수를 `@terra/content/node`의 `effectiveSource()`로 옮긴다.
  - 해시가 `node:crypto`를 쓴다 [V SE:`node/hash.ts:2`]. Node API는 `src/node/`에서만 쓴다(AGENTS 4장).
  - 서버, 시뮬 실행 도구, 적용 스크립트가 같이 쓴다. 그래서 같은 차이 파일이면 서버와 시뮬이 같은 자료로 돈다.
- 판정 코드 규칙은 그대로다(`Math.random`·초월함수 금지 등).
- 미리보기 굴림은 서버가 `itemAt`이나 시드 난수로 한다 [V `equipment.ts:72-97`].
- 진행 중인 전투는 시작 자료로 고정된다(4.7).

### 5.3 성능
- 팩 전체 검사 `validatePack`은 저장과 검사 한 번마다 1회 돈다. 이번에 두 번 다시 쟀다.
  - 환경: Node 22.22.0, 컨테이너 Xeon 2.1GHz 4스레드, 읽기 전용 스크립트 [V].

| 아이템 | 이번 측정 | 앞 판 측정 |
|---|---|---|
| 지금 팩 | 약 15~18 ms | 약 15 ms |
| 2,000개 더함 | 약 33~36 ms | 약 70~80 ms |
| 5,000개 더함 | 약 84~116 ms | 약 100 ms |

  - 공유 CPU라 값이 흔들린다.
  - 운영은 Node 24이고, NAS는 Ryzen R1600 4스레드다 [V `ops/nas-facts.md:10`]. NAS에서의 값은 모른다.
- 검사는 그동안 주 스레드를 막는다. 규모 계단 시험은 루프 p99 50 ms를 실패 기준으로 쓴다 [V AGENTS 7장 `s3-ramp`].
  - 대응: 입력이 1초 멈출 때만 검사, 사용자별 속도 제한, NAS에서 재 보기. 넘으면 `plan`을 워커로 옮긴다 [A].
- 켤 때 대체 경로는 4.5에 적었다. 배포 헬스체크 창 안에 끝나야 한다.
- 실효 자료(파싱, 전투 자료, 이름 표, 경제 목록)는 판이 바뀔 때만 다시 만든다. SE roster 접근자와 같은 방식이다 [V SE:`roster/catalog.ts:105-125`].
- 목록 응답은 요약만 싣고, 상세는 `items.get`으로 받는다 [A]. 최근 바꿈도 요약만 받는다(3.10).

## 6. 작업 순서

**WP-0 SE 안에서 하는 관문**
- a) 켤 때 잠재우기(4.5). 감사 `content.slept`, DB 시험 셋.
- b) 꺼진 참조 거르기
  - `combatCatalogFrom`이 두 가지를 빼게 한다.
    - 켜진 장비가 가리키는, 꺼졌거나 없는 스킬 ID
    - 켜진 스킬이 가리키는, 꺼졌거나 없는 효과 줄
  - 스냅숏마다 한 번 서버 기록을 남긴다.
  - 시험 둘: 장비 → 스킬, 스킬 → 효과.
  - 지금 SE에서 일어나는 일
    - 스킬 편집기로 `fire_bolt`를 끄면 웨이브(test_staff)가 던진다.
    - `flame_burst`를 끄면 다시보기 시범(fire_staff)이 던진다 [V SE:`packCatalog.ts:81-97`, SE:`packages/sim/src/combat/catalog.ts:355-362`, SE:`skills.ts:181-182`, SE:`apps/server/src/npc/gardener.ts:212-235`, `apps/server/src/world/scheduler.ts:51-56`, SE:`replayDemo.ts:190`].
    - 웨이브 이벤트는 스케줄러가 잡아 기록만 하고 사라진다.
  - 시뮬 요약을 바이트로 비교한다. 지금 팩에는 꺼진 것이 없어 같아야 한다.
- SE ADR은 아직 "제안"이다. 2절 "켤 때"에 이 규칙과 "다시 드는 범위"를 적는다.

**M단계: 합치기**
- 겹치는 파일 수 [V `git diff --name-only b9a25a6..`의 교집합]
  - main(전투 실험실·N5·미러) ∩ SE: 17개
  - main ∩ FM: 17개
  - SE ∩ FM: 29개
  - 예: `packages/sim/src/version.ts`, `content/core/{manifest,unit_kinds,tuning}.json`, `apps/server/src/{app,main}.ts`, `db/schema.ts`, `trpc/{context,createContext,router}.ts`, `tuning/services.ts`, `world/combatCatalog.ts`, `packages/content/src/{index,tuningDiff}.ts`, `schema/combat.ts`, `packages/sim/src/combat/{battle,catalog,coefficients,equipment,packCatalog,unitSpec}.ts`, `packages/sim/src/{index,tuning}.ts`, `packages/shared/{package.json,src/tuning.ts}`, `scripts/apply-tuning-diff{.mjs,.test.mjs}`, ko·en 메시지.
- 차례: 두 줄기는 먼저 지금 main을 합친다. 그다음 SE, 그다음 FM으로 들어간다 [A. 차례는 통합 담당이 정한다].
- `SIM_VERSION`
  - main은 4이고, 두 줄기는 각자 다른 뜻으로 5다 [V].
  - 먼저 들어가는 쪽이 5, 뒤에 들어가는 쪽이 6이다.
  - `version.ts` 주석, 그리고 SIM_VERSION을 박은 시험을 같이 고친다 [V `docs/PROTECTED.md:14`, `packages/protocol/src/battleReplayCodec.test.ts:106`, `apps/game/src/battle/replayTimeline.test.ts:142`].
  - 서버는 sim 값을 다시 내보내므로 따로 고칠 곳이 없다 [V `apps/server/src/config.ts:8`].
- 팩 판
  - main이 이미 `core@21`이다. 먼저 들어가는 쪽이 22, 뒤가 23이다.
  - SE의 새 ID 변경표 기록(`n40_shield_regen_delay`, since 21) [V SE:`content/core/id-changes.json`]
    - "새 기록의 since는 (기준 판, 지금 판] 안" 규칙이 있다 [V `packages/content/src/validate/compat.ts:149-161`].
    - 그래서 SE가 먼저면 22로, 뒤면 23으로 바꾼다.
  - FM에는 새 기록이 없다 [V FM:`content/core/id-changes.json`].
- 마이그레이션
  - gardener 위에 갈래가 셋이다 [V].
  - 다시 만들지 않고 그대로 합친다(AGENTS 6장).
- `tuningDiff.ts`·`apply-tuning-diff.mjs`: SE의 `entries`와 FM의 `formulas`를 둘 다 둔다.
- 확인: `pnpm check`, DB 시험, e2e(skills·formulas·battleLab), 시뮬 econ16·war16·stub16 요약. 차이가 SIM_VERSION·팩 판·해시뿐인지 본다.
- 두 줄기는 아직 움직인다. 예: FM의 D-495 회피 자르기 [V `02:8590`].

**WP-1 공용 덮어쓰기 층 보강**(합친 뒤)
- 할 일
  - a) `effectiveSource()`를 `@terra/content/node`에 둔다.
  - b) 시뮬 `--tuning`이 `entries`를 얹는다. 못 얹으면 종료 코드 2.
  - c) `plan` 결과에 코드가 붙은 문제와 권고를 싣는다. `ContentIssue`에 `code`·`params`를 더한다.
  - d) `baseHash`와 `entry_changed`. 기기는 3방향으로 다시 얹는다. 대량 바꿈은 `patch_items` 명령으로 한다. 스킬 편집기에도 같은 규칙을 쓴다.
  - e) 은퇴 ID 표를 둔다. `plan`이 다시 쓰기를 거절한다. 켤 때 팩에 세계 ID가 생기면 잠재운다. 내보내기에 은퇴 ID를 싣는다.
  - f) 켤 때 대체 경로는 반씩 나눠 처음 틀리는 줄을 찾는다. 틀린 줄 하나에 검사 log₂(줄 수)번이면 된다 [A].
  - g) 1분 지표에 `contentRevision`·`contentOverrides`를 더한다.
  - h) 라우터 둘이 `ContentEditShared` 하나를 쓴다. 일반 타입은 `@terra/shared/contentEdit`로 옮긴다.
  - i) 최근 바꿈은 요약만 보낸다. [다시 담기]는 마지막 `content.apply`에서 항목을 찾는다.
  - j) 마이그레이션은 하나다. 은퇴 ID 표를 만들고, 분류 검사를 effects·item_subcategories·item_tags·weapon_types까지 넓힌다. 뒤 WP에서 다시 넓히지 않는다.
- 시험
  - 단위: 실효 차례·해시가 서버 계산과 같다. entries 적용. baseHash 충돌과 다시 얹기. 은퇴 ID.
  - DB: 은퇴 ID가 남는다. 새 분류 줄을 저장한다. 옛 판 앱이 새 분류 줄을 건드리지 않는다.
  - 시뮬: `--tuning` entries로 돌린 요약이, 그 entries를 팩에 넣고 돌린 요약과 바이트로 같다.
- 다 됨: 스킬 편집기 시험이 그대로 통과하고, `pnpm check`가 통과한다.

**WP-2 팩 형식·분류**(M 뒤)
- 할 일
  - 2.2~2.6의 칸과 분류(item_subcategories·item_tags·weapon_types)를 더한다.
  - `req`·`kinds`·`creature` 칸을 더한다.
  - 장비 칸 목록을 하나로 모은다.
  - 팩 판을 올린다(core@24 근처) [A].
  - 지금 팩 항목은 고치지 않고, 새 분류 파일만 더한다.
- 시험
  - 옛 팩이 그대로 통과한다.
  - 새 칸의 맞는 값과 틀린 값. 묶음. 중분류와 대분류. `bound`와 `tradable`. `weaponType`·`twoHanded`의 칸. `req`와 직접 적은 적정치 중 하나만.
  - 호환 검사 4b. 시뮬 바이트 비교. `combatCatalog.test.ts`.
- 다 됨: `check`·`check:content`가 통과한다. 출발 목록(중분류·무기 종류, 영어 이름, `storage`·`foodFamily`)을 사용자에게 보였다.

**WP-3 서버 API·실효 읽기**(WP-1·2 뒤)
- 할 일
  - `items.list`·`get`·`check`·`preview`·`save`·`history`.
  - 새 분류를 코드 목록 세 곳에 더한다.
  - 경제 목록 접근자, `market` 칸, 이름 표.
  - 코드 참조 표(sim 상수 + 서버 시안·실험실).
  - 대분류 잠금, 크기 상한, 만든 항목 상한.
  - 미리보기는 실효 계산식으로 셈한다.
- 시험
  - 단위: 미리보기 값이 같은 장비를 `bodyView`로 셈한 값과 같다. 식을 덮어쓰면 미리보기 값이 바뀐다. `marketKindOf`. 권고.
  - DB: 감사, 충돌, 은퇴 ID, 저장 못 하는 글자, 잠재우기.
  - tRPC: 기본 거부, 속도 제한, 묶음 상한, 크기 상한.
- 다 됨: 아이템을 바꾸면 다음 요청부터 새 값을 쓴다. 대상은 유닛 화면, 밸런스 무기 목록, 실험실, 경제 목록, 정원사의 다음 웨이브, 다시보기다. 시험으로 확인한다.

**WP-4 화면**(WP-3 뒤)
- 할 일
  - 4a: 스킬 편집기의 공용 부품을 `editor/content/contentEditor*`로 꺼낸다. 스킬 e2e는 그대로 통과해야 한다.
  - 4b: `/dev/items`. 주소 표, 개발자 홈 줄, `routeViews`, 미리 캐시 세 곳, 그리고 3장 전부.
- 시험
  - 단위: 화면 모델(담기, 되돌리기, 거르기, 복제 ID, JSON 차이, 3방향 다시 얹기).
  - e2e
    - dev로 열기 → `test_sword` 복제 → 공격력 바꿈 → **켜기** → 적용 → "새로 만듦" 표시 확인 → `/dev/balance` 무기 목록에 보임 → 되돌리기.
    - player는 권한 없음 화면을 본다.
    - 두 탭에서 고치기: 다른 항목이면 충돌이 없고, 같은 항목이면 다시 얹는다.
    - 390px·파스텔·다크 사진.
  - `pnpm check:bundle`은 상한 안이어야 한다. 잰 값과 바뀐 까닭을 작업 기록에 적는다. 지연 조각이 늘면 공용 조각 나눔이 바뀌어 수백 바이트가 오르내린다 [V AGENTS 6장].
  - 빌드로 미리 캐시 목록을 확인한다.
- 다 됨: e2e 결과를 작업 기록에 남겼다. `break-ui` 검토를 마쳤다.

**WP-5 장비 전투 연결**(WP-2, M 뒤. `req` 연결은 식 확인 A 뒤)
- 할 일
  - elements, 전투 직접 값, 양손, `req`로 셈한 적정치, `kinds`를 `EquipDef` → `loadoutOf` → 유닛 사양으로 잇는다.
  - 양손이면 보조 칸을 무시한다. 던지지 않는다.
  - test_heart의 속성값을 팩으로 옮긴다. 같은 커밋에서 세 가지를 함께 고친다.
    - `apps/server/src/roster/preview.ts:429`의 박힌 값을 지운다.
    - 시뮬 시험 자료(`catalog.ts:311`)를 고친다.
    - `combatCatalog.test.ts`를 고친다.
    - 그 항목의 해시가 바뀌므로 배포 전에 내보내기를 먼저 넣는다(4.4).
  - 1차 스탯 합이 넘칠 때의 처리를 정한다.
- 시험
  - 속성값 합을 10에서 자른 결과가 `sumElementSources`와 같다.
  - 저항·고정 방어·관통을 더한다.
  - 양손 무기에 보조 칸 장비를 끼우면 무시되고, 화면에 표시된다.
  - `twoHanded`나 `slot`을 바꿔도 던지지 않는다.
  - 요구치로 셈한 적정치가 실효 행 식 값과 같다.
  - 팩 = 시험 자료. 출력이 같다.
- 다 됨: 전투 코어 ADR에 "바뀜"을 적었다. 출력이 바뀌면 `SIM_VERSION`을 올린다(PROTECTED).
- 고정 관통은 넣지 않는다.

**WP-C 크리쳐 장비 칸**(D-494, WP-5 뒤)
- 할 일
  - 팩 `unit_kinds`의 크리쳐 칸을 무기·방어구·장신구로 바꾼다. 방어구는 `body`로 잡았다 [A].
    - 지금 크리쳐 칸은 `accessory`·`saddle`이다 [V `content/core/unit_kinds.json`].
    - 칸 수는 구조 값이라 확인 창이 필요하다(D-5054) [V `48:373`].
  - 칸 번호에 기대던 곳을 같은 커밋에서 고친다.
    - 시안 크리쳐 장비 [V `roster/preview.ts:120,137`]
    - 실험실 크리쳐 샘플 [V `battleLab/samples.ts:30,123,134`]
    - 시험 자료
  - 시뮬 출력을 확인한다. 시뮬 크리쳐는 휴먼 묶음을 쓴다 [V `waveBattle.ts:4-6`] [A: 출력이 같을 것].
- 다 됨: 크리쳐 전용 장비를 만들어 크리쳐 미리보기에 입힐 수 있다.
- 범위 밖: 조우 때 굴리기, 종마다 장비 풀, 훔치기 스킬. 크리쳐 편집기(D-5024)와 전투 줄기가 맡는다.

**WP-6 소모품·식품·효과 사전**(WP-4 뒤)
- 할 일
  - `use`·`perish` 화면.
  - 효과 사전 탭: 효과 덮어쓰기와, 그 효과를 쓰는 아이템·스킬 보기(D-425 도감) [V `02:7685`].
  - 스킬 편집기의 효과 고르기도 실효 효과를 읽게 한다.
  - 효과 사전을 넓힌다(ADR): `stat`에 1차 6개, 배타 묶음과 "센 것이 이김" 규칙(D-472).
  - 권고: 요리 버프 스탯과 재료 계열, 식품 중분류인데 신선도 없음.
  - 질문 2의 답이 나·다면, 범위 칸을 더하고 식품 아닌 소모품의 거래 방식을 바꾼다.
- 시험: 스키마, 서버 효과 참조, e2e(물약 만들기 → 효과 고르기 → 미리보기 문장).
- 다 됨: 실제로 먹고 썩는 실행 규칙은 이 WP가 아니라, 질문 2~4 답 뒤의 별도 규칙 줄기에서 한다.

**WP-7 대량 도구·옛 자원**(WP-4 뒤)
- 시험: CSV 왕복, 틀린 머리·값의 줄 번호, 300개 묶음 한 번 검사, 크기 상한, BigInt ‰ 반올림, e2e 가져오기.
- 다 됨: 옛 자원 변환본을 이름 바꿈 목록·출처 확인과 함께 사용자가 확인했다. 그다음 팩 커밋으로 넣었다.

**WP-8 나중 묶음**(규칙이 정해질 때마다)
- 보석·소켓(규칙은 보석 질문 묶음), 설계도, 탄약, 유물·유전자·신앙·유료 보조·뽑기권·꾸미기·우주.
- 휴먼 생명공학 칸, 안장 이동·적재.
- 창고·운송 규칙과 무게 필수 검사.
- 계정 귀속·거래 불가를 우편·이적에서 막기.
- 고정 관통(ADR·`SIM_VERSION`).
- 아이콘 저장소, 드롭 표, 레시피 편집기.
- 보유 물건 표(질문 1)와 원장 물건 자산 코드(ADR, 원장 보호 대상).
- 시뮬 거래소 맞추기, `item_majors`.
- `MAGIC_WEAPON`과 시뮬 묶음을 팩 자료로 옮기기.

**WP-L 추가 언어**(따로)
- 형식 ADR을 대체하는 ADR을 쓴다.
- `@terra/shared` 언어 목록 하나, `localizedText` 선택 칸, `LocalizedName`을 넓힌다.
- 화면 언어가 생기기 전에는 입력을 숨긴다.

**문서**
- ADR `docs/adr/2026-11-xx-item-editor.md`(제안)를 WP-1·2에서 쓴다.
- SE ADR은 WP-0에서 고친다(아직 제안).
- WP마다 작업 기록을 남긴다.
- PLAN 7장에 한 줄을 더한다.
- AGENTS 7장 `tuning:apply` 줄에 entries, 은퇴 ID, 배포 전 내보내기를 적는다.

## 7. 사용자 질문(규칙과 식만. 값은 편집기에서)

- 값과 세부는 편집기에서 정한다(D-398, D-490 원문, 03 §11) [V `02:8523`, `03_Planning_Rules.md:510`].
- 아래 다섯 규칙은 어느 것도 편집기 작업(WP-0~7)을 막지 않는다.
- 답이 없으면 그 규칙을 쓰는 줄기를 열지 않는다. 편집기는 칸만 둔다. 기술이 규칙을 대신 정하지 않는다(D-487) [V `02:8488-8494`].
- 묻는 때는 그 규칙을 쓰는 줄기를 열 때다. 사용자는 D-490에서 "짜증나게 하지말고"라고 했다.

**질문 1. 아이템을 고치면, 이미 있는 물건과 주문에도 드나요?**
- 장면
  - 철검 공격력 범위를 20~40에서 18~36으로 낮췄다. 어제 만든 철검은 범위의 70% 자리라 34였다.
  - 생선 유통기한을 3일에서 2일로 줄였다. 창고에 이미 있는 생선은?
  - 물약을 거래 불가로 바꿨다. 거래소에 걸린 주문은?
  - 스택 상한을 100에서 50으로 줄였다. 이미 80개짜리 묶음은?
  - 아이템을 껐다. 이미 가진 것은?
- 가) 모두 지금 값으로 바뀐다. 물건은 범위 안 자리만 기억한다(34 → 30). 주문은 취소되고, 묶음은 나뉜다. 끈 것도 가진 것은 그대로 쓴다.
- 나) 이미 있는 것은 만들 때 그대로다. 고친 값은 새로 생기는 것부터 든다.
- 다) 가처럼 바뀌고, 끈 아이템은 가진 것도 효과가 꺼진다.
- 라) 기본은 나다. 잘못된 값을 이미 퍼진 물건까지 고쳐야 할 때만, 개발자가 "이미 있는 것도 고침"을 골라 다시 셈한다. 감사 기록과 공지를 남긴다. 매장량 조정(D-333)과 같은 방식이다.
- 추천: 라
  - D-5008의 근거에 "산 물건의 성능이 나중에 줄지 않는다"가 있다 [V `02:8765`].
  - 코드 규칙도 "끈 항목은 새로 나오지 않는다(있는 것은 그대로)"다 [V `economy.ts:27`].
  - 그러면서 "잘못된걸 끝까지 기다릴 필요 없다"(D-461 205)를 개발자 명령으로 지킨다 [V `02:8195`].
- 답이 없으면: 보유 표 줄기를 열지 않는다. 지금은 가진 물건이 없다.

**질문 2. 물약이나 버프 아이템처럼 식품이 아닌 소모품도, 같은 것은 효과가 모두 같은가요?**
- 이미 정해진 것
  - 식품(요리·음료)은 거래소에서 모두 같고, 호가창으로 사고판다(D-289, 44 §3.1) [V `02:5546-5558`, `44_Economy.md:82`].
  - 완제품은 프리셋마다 범위가 있고, 경매로 판다 [V `50:28,30`].
  - 물약이 어느 쪽인지가 정해지지 않았다.
- 장면: 회복 물약 10개를 샀다. 하나하나 회복량이 다른가?
- 가) 모두 같다. 호가창으로 사고판다. 질의 차이는 하급·상급 물약처럼 다른 아이템으로 낸다.
- 나) 장비처럼 범위가 있고, 만들 때 자리와 등급이 정해진다. 경매로 판다.
- 다) 아이템마다 편집기에서 고른다. 범위를 쓰면 경매, 안 쓰면 호가창이다.
- 추천: 가
  - 식품과 같은 규칙이라 단순하다.
  - 물약 수백 개를 하나씩 경매하는 일을 피한다.
- 답이 없으면: 지금처럼 호가창으로 두고, 효과 값은 고정 값만 받는다.

**질문 3. 전투 중에 물건(물약·탄약)을 쓰나요?**
- 장면: 자동전투 중 아군 HP가 30% 아래로 떨어졌다. 들고 간 물약을 마시나? 화살이 떨어지면 활을 못 쏘나?
- 가) 전투 중에는 쓰지 않는다. 물약·음식은 전투 밖에서 쓰고, 버프는 실제 시간 동안 남아 다음 전투에 든다. 탄약은 두지 않는다.
  - 드는 일: 유닛 버프 저장(DB), 전투 시작 자료에 버프 넣기, 화면 표시, 랭킹 계산에서 버프 빼기(D-7022) [V `02:10900-10907`].
  - 효과 지속 상한(지금 1시간, 0은 "전투 내내") [V `combat.ts:41-42`]도 넓혀야 한다.
- 나) 쓴다. AI가 정한 때에 파티 화물에서 물약을 자동으로 마신다. 탄약은 쏠 때마다 1개 쓴다.
  - 드는 일: 전투 화물, 전투 중 원장 기록, AI 판단, 저장·복구.
- 다) 물약만 전투 중에 자동으로 쓰고, 탄약은 두지 않는다. 나에서 탄약을 뺀 일이 든다.
- 추천: 가
  - 전투 판정 안을 바꾸지 않아 나·다보다 일이 적다.
  - 요리 버프(D-472)가 어차피 버프 저장을 요구한다.
- 답이 없으면: 소모품 사용 줄기를 열지 않는다. 편집기는 효과 칸만 둔다.

**질문 4. 음식 신선도가 0이 되면 어떻게 되나요?**
- 장면: 창고의 생선이 3일이 지나 신선도가 0이 됐다.
- 가) 사라진다.
- 나) "상한 음식" 같은 다른 아이템으로 바뀐다. 무엇으로 바뀌는지는 아이템마다 편집기에서 정한다.
- 다) 남지만 효과가 신선도만큼 줄고, 0이면 효과가 없다.
- 추천: 가
  - 가장 단순하고, "같은 식품은 같다"와 맞는다.
  - 나는 나중에 "썩으면 바뀌는 아이템" 칸으로 더할 수 있다.
- 답이 없으면: 창고·식품 줄기를 열지 않는다. 편집기는 유통기한만 받는다.

**질문 5. 장비는 쓰면서 닳나요?**
- 장면: 철검으로 전투를 100번 이겼다. 내구도가 줄었나?
- 가) 진 전투에서만 닳는다(설정 칸 C20) [V `49:166`]. 인공장기만 시간이 지나며 닳는다(D-453) [V `02:8072-8078`].
- 나) 이겨도 전투마다 조금씩 닳는다. 양은 설정 칸으로 정한다. 지면 더 닳는다.
- 다) 장착한 시간만큼 닳는다(인공장기처럼).
- 추천: 나
  - "드롭 장비는 내구도 소모로 사라진다"(D-471)는 쓰면서 닳는다는 것을 전제로 한다 [V `50:52`].
  - 수리(D-5031)와 제작 수요가 꾸준히 생긴다.
- 답이 없으면: 내구도 줄기를 열지 않는다. 편집기는 최대 내구도만 받는다.

**식 확인 A. 무기의 1차 요구치로 2차 적정치를 어떻게 셈하나요?**
- 이것은 D-494의 "둘 다"를 반영하는 출발 식이다. WP-5에서 `req`를 판정에 잇기 전에 보여 주고 확인받는다(D-487 "출발값과 공식 모양은 보여 주고 정한다").
- 장면: 칼에 요구 STR 25·DEX 15를 적었다.
- 가) 요구치만 가진 유닛의 2차 값을 모든 적정치로 쓴다.
  - 계산(지금 가중치 표) [V `content/core/stat_rows.json`]
    - 물리 공격력 = 25 × 2 + 15 × 0.6 = 59
    - 명중 = 15 × 1.2 = 18
    - 크리 = 15 × 1.5 = 22
    - 속도 = 50 + 15 × 0.3 = 54
  - 요구치에 없는 스탯이 드는 칸은 적정치가 0이 된다. 그러면 그 칸은 유닛 스탯을 타지 않는다.
- 나) 요구치로는 공격력 적정치만 셈한다. 명중·크리·속도 적정치는 지금처럼 직접 적는다.
- 추천: 가
  - D-494의 "2차 적정치는 그것으로 계산"을 글자 그대로 따른다.
  - 명중이 스탯을 타게 하려면 요구치에 DEX·AGI를 적으면 된다.

**다음 묶음에서 물을 것(지금은 묻지 않는다)**
- 보석 수치 규칙과 합성 [V `50:69`].
- 프리셋마다 소켓 수를 따로 정할지. D-5008의 "등급으로 정함"과 엇갈린다.
- 설계도를 가지는지, 쓰는지, 배우는지.
- 안드로이드 부품을 어느 거래소에서 파는지(엇갈림 C5).
- 보석 등급의 뜻.
- 여러 장비의 속성 저항 합을 자를지. 지금은 1000‰ 이상이면 면역이다. 계산식 줄기와 함께 묻는다.
- 휴먼 생명공학 칸이 무엇을 올리는지, 안장 이동·적재.
- 크리쳐가 가진 장비의 등급 상한. 드롭처럼 희귀까지인지(D-471) 크리쳐 줄기와 함께 묻는다.

## 8. 위험·미확인

### 8.1 위험

| # | 위험 | 근거 | 대응 |
|---|---|---|---|
| 1 | 켜진 장비가 꺼진 스킬을, 켜진 스킬이 꺼진 효과를 가리키면 전투 자료를 만들다 던진다. 웨이브 이벤트가 사라지고, 다시보기·실험실 요청이 실패한다 | SE:`packCatalog.ts:81-97`, SE:`catalog.ts:355-362`, SE:`skills.ts:181-182`, `scheduler.ts:51-56`, `battleLab/build.ts:233-240` [V]. 실행은 안 했다 | WP-0 b |
| 2 | 시뮬 `--tuning`이 entries를 얹지 않는다. 그래서 서버 세계와 다른 자료로 말없이 돈다 | SE:`packages/sim/cli/common.ts:166,187`, SE ADR:58,72 [V] | WP-1 b |
| 3 | 되돌림 배포 때 편집기에서 만든 항목이 지워진다 | SE:`state.ts:313-332`, SE:`store.ts:146-187`, `economy.ts:30`, `ops/deploy.sh:86-94` [V] | WP-0 a. SE 합치기 관문이다 |
| 4 | 항목 통째로 "나중에 바꾼 것이 이긴다" | SE:`state.ts:307-312` [V] | 4.4의 배포 전 내보내기, [다시 담기] |
| 5 | 검사가 이벤트 루프를 막는다 | 5.3 [V]. NAS 값은 모른다 | 1초 대기, 속도 제한, 워커 |
| 6 | 코드·시나리오가 ID로 쓰는 아이템이 열 곳이 넘는다 | 3.6 [V] | 상수 표, 확인 창, 나중에 자료로 옮김 |
| 7 | 팩 장비 = sim 시험 자료라는 시험이 있다 | `combatCatalog.test.ts:14-25` [V] | 팩에 넣는 커밋에서 시험 자료도 함께 고친다 |
| 8 | 아이템과 스킬 편집기가 판 하나를 같이 쓴다 | SE migration [V] | baseHash 규칙. 같은 항목을 고쳤을 때만 충돌한다 |
| 9 | 시뮬과 서버 시안의 호가창 규칙이 다르다 | 2.8의 8 [V] | ADR과 `SIM_VERSION`을 두고 따로 맞춘다 |
| 10 | 살아 있는 물건이 없어 바로 적용의 효과가 좁다 | 4.7 [V] | 보유 표, 자산 코드 ADR |
| 11 | 같은 ID가 다른 뜻으로 다시 쓰인다 | SE:`state.ts:190-195,274-284`, `PROTECTED.md:23` [V] | 은퇴 ID 표, 잠재우기(WP-1 e) |
| 12 | 검사 문구가 한국어뿐이다 | `issue.ts:6-21` [V] | code·params. 남은 것은 ADR의 빚으로 적는다 |
| 13 | 대분류 9개 고정은 D-5033 해석과 다르다. 해석은 대분류도 늘린다 | `02:9235` [V] | `item_majors`로 옮긴다(같은 JSON 값) |
| 14 | 옛 자료에 LICENSE 파일이 없다(소유자 자료). 다른 작품의 이름(미스릴)이 있다 | [V조사], OLD 시드 13행 [V] | 이름 바꿈 목록, 에셋 ADR |
| 15 | 세 갈래 합치기에서 충돌이 난다(SIM_VERSION·팩 판·since·마이그레이션 갈래, 파일 17/17/29개) | 6장 M단계 [V] | M단계 규칙 |
| 16 | 1차 스탯 합이 `MAX_STAT_INPUT`을 넘으면 계산이 던진다 | `stats.ts:35-48`, `combat.ts:340-341` [V] | 권고, 미리보기에서 잡음, WP-5에서 판정 쪽을 정함 |
| 17 | "요리 버프는 하나만, 센 것이 이김"을 지금 효과 사전으로 나타낼 수 없다 | `combat.ts:45`, `effects.ts:32-34` [V] | WP-6 ADR |
| 18 | 켤 때 대체 검사가 헬스체크 창(약 90초)을 넘기면 자동으로 되돌린다 | SE:`state.ts:324-332`, `ops/deploy.sh:86-94` [V] | WP-1 f, NAS에서 재기 |
| 19 | [다시 담기]에 필요한 항목이 `pack_won` 감사에 없다 | SE:`store.ts:157-170` [V] | 마지막 `content.apply`에서 찾는다 |
| 20 | 크리쳐 칸을 바꾸면 칸 번호에 기댄 시안·샘플이 말없이 빠진다 | `preview.ts:120,137`, `samples.ts:30,123,134` [V] | WP-C에서 같은 커밋에 고친다 |

### 8.2 기획 문서의 엇갈림과 이 설계의 처리
- C1 바로 적용과 배포 반영: D-461(나중 결정)을 따른다.
- C2·C10 품질 칸: 두지 않는다.
- C3 총량 자원: 편집기는 수량을 바꾸지 않는다.
- C4 음식·물약의 등급: 음식은 D-289로 모두 같다. 물약은 질문 2다.
- C5 안드로이드 부품: 장비 `slot: part`로 둔다. 어느 거래소인지는 다음 묶음에서 묻는다.
- C6 장비의 속성값: `equip.elements`를 sim에 잇는다.
- C7 소켓 규칙: 보석 질문 묶음으로 보낸다. 프리셋별 소켓은 D-5008 규칙을 바꾼다.
- C8 쓰면서 닳는가: 질문 5.
- C9 인공장기와 장비 파괴의 차이: 내구도 줄기에서 둘 다 그대로 따른다.
- C11 내구도 상품: 프리셋 값까지만 되돌린다.
- C12 "강화석": 장비 강화에는 쓰지 않는다.
- C13 생필품 표시: 48 §5.5는 칸으로 적었다. 이 설계는 necessities로 판단한다(2.2).
- C14 크리쳐 칸: 48 §5.1 표(371행)는 아직 2칸(장신구·안장)이다. D-494는 3칸(무기·방어구·장신구)이다 [V `48:250,371`]. 나중 결정인 D-494를 따른다(WP-C).
- C15 요구치와 D-424: 요구치는 착용 조건이 아니라 적정치를 셈하는 재료로 읽는다(2.4) [A].

### 8.3 모르는 것(Unknown)
- NAS에서의 검사 시간.
- 2,000개 검사 시간이 두 측정에서 33~80 ms로 흔들린 까닭.
- 세 갈래를 합친 뒤의 최종 모양. 두 줄기 모두 아직 커밋이 이어진다.
- 질문 1~5와 식 확인 A의 답.
- 출발 목록(중분류·무기 종류)과 영어 이름에 대한 사용자 확인.
- 감사 표 부분 색인의 효과. 재지 않았다.

### 8.4 확인 표기 요약
- [V]
  - 스키마, 팩 내용, 읽는 곳, DB 검사, 보호 규칙.
  - SE의 `content_overrides`·`contentEdit/*`·entries 적용·화면.
  - FM의 계산식·질문 답 기록.
  - main의 전투 실험실·D-494·D-495 미러.
  - 세 갈래의 마이그레이션 `prevIds`, 겹치는 파일 수.
  - 측정값.
- [V앞]: dev-settings ADR의 일부 절, 45·48 찾기, 팩 형식 파일 규칙.
- [V조사]: 옛 편집기의 세부 버그·UX 대부분, D-148·D-7040.
- [A]
  - 화면 배치, 상한(300·500·4 KiB·900 KiB·10배), 무게 g, 유통기한 범위.
  - baseHash 판 규칙, 잠재우기의 감사 모양.
  - 요구치 → 적정치 출발 식, 방어구 = `body`.
  - 미리보기 문장의 틀.
- 측정 스크립트(읽기 전용)
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/itemeditor/time-validate.mts`
  - `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/itemeditor/time-validate-subset.mts`

관련 경로(절대)
- `/home/user/terra-in-cognita/packages/content/src/schema/economy.ts`
- `/home/user/terra-in-cognita/packages/content/src/schema/combat.ts`
- `/home/user/terra-in-cognita/packages/sim/src/combat/packCatalog.ts`
- `/home/user/terra-in-cognita/apps/server/src/battleLab/build.ts`
- `/home/user/terra-in-cognita/docs/design/02_Decision_Log.md` (D-494 8563행)
- `/home/user/terra-in-cognita/.claude/worktrees/agent-a0dc0a9c46291329d/apps/server/src/contentEdit/state.ts`
- `/home/user/terra-in-cognita/.claude/worktrees/agent-a0dc0a9c46291329d/apps/server/src/contentEdit/store.ts`
- `/home/user/terra-in-cognita/.claude/worktrees/agent-a0dc0a9c46291329d/packages/content/src/tuningDiff.ts`
- `/home/user/terra-in-cognita/.claude/worktrees/agent-acf96a683fbc9a21c/docs/adr/2026-11-01-formula-editor.md`
- `/home/user/terra-in-cognita/.claude/worktrees/agent-acf96a683fbc9a21c/docs/questions/2026-11-01-formulas.md`

## 9. 비판 처리

1. 고침: 켤 때 잠재우기를 WP-0으로 만들었다. 새 판 줄을 먼저 보고, 팩이 바꾼 항목만 팩이 이긴다. 감사 `content.slept`를 남기고, SE 합치기 관문으로 둔다. DB 시험 셋과 "다시 드는 범위"를 ADR에 적는다(4.5).
2. 고침: 기준을 main `0fa5d2e`, SE `e4d316b`, FM `7b33cf4`로 다시 잡았다. SE가 한 entries 적용과 화면을 반영했다. WP-1 b는 시뮬 `--tuning`으로 줄였고 위험 2를 새로 썼다. 공용 틀은 스킬 편집기 리팩터링(WP-4a)으로 만든다.
3. 고침: M단계를 더했다. 겹치는 파일 17/17/29개, SIM_VERSION 5·6, 팩 22·23(main이 이미 21), since 22 또는 23을 정했다. gardener 위 마이그레이션 세 갈래는 다시 만들지 않고, 다음 마이그레이션 prevIds에 세 끝을 적는다.
4. 고침: WP-0 b에서 전투 자료가 꺼졌거나 없는 스킬·효과 참조를 걸러 낸다. 웨이브·다시보기·실험실 경로를 모두 덮고, 두 시험을 둔다.
5. 고침: 항목마다 `baseHash`를 싣고 `entry_changed`로 거절한다. 기기는 3방향으로 다시 얹고, 대량 바꿈은 서버 `patch_items` 명령으로 한다. 두 편집기 모두에 적용한다(3.10).
6. 고침: 세계 은퇴 ID 표를 둔다. 만든 항목은 참조·보유가 없을 때만 지우고, 팩에 같은 ID가 생기면 잠재우고 크게 알린다. 내보내기에 은퇴 ID를 싣는다(2.9).
7. 고침: D-5033 중분류는 그대로 두고, 무기 종류를 따로 `weaponType: ref("weapon_types")` 목록으로 두었다.
8. 고침: 질문 276이 D-494 "둘 다"로 답해졌다. `weapon.req`와 셈한 적정치, 칸 정의 표 하나, 계산식 탭 연결을 넣었다. 셈하는 식은 식 확인 A로 보여 준다.
9. 고침: 무기 미리보기는 그 세계의 실효 계산식(`combatFormulas()`)과 같은 변수 함수로 셈하고, 팩 식인지 덮어쓴 식인지 보인다. 문서에서 박힌 식을 뺐다.
10. 고침: 양손은 장착 명령 검사에서만 거절한다. 계산에서는 보조 칸을 무시하고 화면에 보인다. 바꿔도 던지지 않는다는 시험을 둔다.
11. 고침: sim이 참조 ID를 상수로 내보내고 서버가 시안·실험실 ID를 더한다. 끄기·칸·무기 칸 바꾸기는 확인 창을 띄운다. `MAGIC_WEAPON`은 나중에 자료로 옮긴다.
12. 고침: 팩 항목은 대분류를 잠근다. 만든 항목은 참조·보유가 없을 때만 바꾸고, 귀금속으로·귀금속에서는 막는다.
13. 고침: 휴먼 생명공학 칸과 안장 이동·적재를 ADR에 미뤘다고 적고, WP-8과 다음 묶음 질문에 넣었다.
14. 고침: 보관 창고를 중분류 `storage`(D-121)로 정했다. 무게는 지금 권고로 두고, 창고·운송 규칙이 오면 팩 단위 필수 검사로 올린다.
15. 고침: `bound`(계정 귀속: 거래소·이적·우편 금지)를 `tradable`(거래소만 금지)과 따로 두었다.
16. 고침: 고정 관통은 WP-8로 미뤘다(ADR·SIM_VERSION). "저항 합 ≥ 1000‰ = 면역" 권고를 더하고, 자르기 규칙은 계산식 줄기 질문으로 보냈다.
17. 고침: 식재료 계열을 중분류 `foodFamily`로 두고, 요리 버프 스탯 권고를 WP-6에 더했다.
18. 고침: 질문 2를 식품 아닌 소모품으로 좁혔다. 식품은 D-289로 이미 정해졌다고 밝혔다. `marketKindOf`는 중분류 `food`로 가른다.
19. 고침: "답이 없으면 가로"를 모두 지웠다. 답이 없으면 그 규칙을 쓰는 줄기를 열지 않는다. 다섯 질문 모두 막지 않음으로 두고, 그 줄기를 열 때 묻는다.
20. 고침: 질문 1을 "이미 있는 물건·주문에 드나요"로 넓혔다(유통기한·거래 불가·스택·끄기). D-5008 근거와 `economy.ts:27`을 넣고 선택지 라를 더했다.
21. 고침: 질문 3의 선택지마다 드는 일을 적었다. 가에는 버프 저장, 시작 자료, 화면, 랭킹 제외, 지속 상한을 적었다.
22. 고침: 프리셋별 소켓 규칙을 편집기 칸에서 빼고 보석 질문 묶음으로 옮겼다.
23. 고침: 추가 언어를 WP-L(형식 ADR을 대체하는 새 ADR)로 뗐다. 화면 언어가 생기기 전에는 입력을 숨긴다.
24. 고침: 공용 파일을 `contentEditor` 앞머리로 짓는다. `DEV_ONLY_CHUNK`·`globIgnores`·`DEV_ONLY_SOURCE` 세 곳을 고치고 빌드로 확인한다.
25. 고침: 코드 참조 표를 채웠다. previewProduction, preview 짐·보유, test_heart 박힌 속성값, econ16 재고를 넣었고, 다시보기 시범과 실험실 샘플도 더했다. test_heart는 WP-5에서 팩으로 옮기며 박힌 값을 같은 커밋에서 지운다.
26. 고침: e2e에 "켜기" 단계를 넣었다.
27. 고침: check:bundle 기준을 "상한 안, 잰 값과 까닭을 작업 기록에"로 바꿨다.
28. 고침: `ContentIssue`에 code·params를 더하고 zod 문제 코드를 싣는다. 화면은 메시지 키로만 보인다. 남은 원문은 ADR의 빚으로 적는다.
29. 고침: 대량 콘텐츠는 팩 파일로 넣는다. 세계에서 만드는 항목은 분류마다 500개까지로 두고, entries 상한 2,000은 그대로다.
30. 고침: 최근 바꿈은 SQL에서 요약만 풀어 보내고, 항목 통째는 감사 줄 ID로 하나씩 받는다. 부분 색인은 재 보고 정한다.
31. 고침: 가져오기 상한을 정했다. 글 900 KiB, 항목 4 KiB, 300개·300줄이다. 기기와 서버가 같은 상수를 쓴다.
32. 고침: WP-7 변환 보고에 이름 바꿈 목록(미스릴, 오리할콘 확인)과 옛 코드·문서 출처 확인을 넣었다.
33. 고침: DB 분류 검사는 WP-1 마이그레이션 한 번에 effects까지 넓힌다. 코드 목록 셋(`ENTRY_DIFF_CATEGORIES`·`ENTRY_FILES`·`FILE_OF`)은 WP-3에서 한 번에 더한다.
34. 고침: WP-2는 지금 팩 항목을 고치지 않는다. 배포 전 "내보내기 → tuning:apply" 차례를 4.4와 AGENTS 7장에 넣었다.
35. 고침: 권고 셋을 더했다. 완제품 티어와 주재료 티어, 스킬 칸 수를 넘는 장비 스킬, 적정치 0 = 비율 없음이다.
36. 고침: 기준 가치 대량 바꿈은 정수 ‰를 받아 서버가 BigInt로 셈하고, 0.5는 올린다.
37. 고침: `effectiveSource()`를 `@terra/content/node`에 둔다(해시가 `node:crypto`를 쓴다).
38. 고침: 서버는 `market` 칸을 보내고, 기기는 그 칸이 없으면 옛 호가창 규칙을 쓴다.