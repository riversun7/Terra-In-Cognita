# 아이템 편집기(/dev/items): 팩 형식 넓힘, 덮어쓰기 층 보강, 서버 API, 화면(WP-1~WP-4)

- 일시: 2026-11-02 02:57 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md`(제안), 설계안 `docs/research/2026-11-01-item-editor-design.md`, 질문 `docs/questions/2026-11-01-item-editor.md`(285~290, 사용자 답 D-496)·`docs/questions/2026-11-01-item-editor-2.md`(291, 답 기다림), 브랜치 `work/item-editor`(main `d310fe6`에서), 커밋 `4b0906b`(WP-1·WP-2)·`fb82058`(WP-3)·이 기록과 같은 커밋(WP-4)

## 한 일
- WP-1 덮어쓰기 층 보강
  - 고칠 수 있는 분류에 `item_subcategories`·`item_tags`·`weapon_types`를 더했다(DB 검사는 `effects`까지).
  - 묶음의 바꿈마다 `baseHash`. 판이 달라도 모든 해시가 맞으면 받고, 그 항목이 그새 바뀌었으면 `entry_changed`(키 목록)로 묶음 전체를 거절한다. 스킬 편집기도 싣는다.
  - 은퇴 ID 표 `content_retired_ids`(마이그레이션 `20261101161223_content_retired_ids`, 추가만, `prevIds` = 갈래 셋의 끝). 만든 항목을 지우면 ID를 다시 못 쓴다. 내보내기 `retiredIds`.
  - 켤 때 잠든 줄(`newer_pack`·`id_collision`·`unknown_category`)과 `discard_sleeping`, 감사 `content.slept`. 최근 바꿈은 요약 SQL, 항목 통째는 감사 줄 ID로 하나만.
  - 실효 팩 차례(팩 파일 차례 + 만든 항목 ID 차례)를 서버·`sim --tuning`(`entries`)·`pnpm tuning:apply`가 같이 쓴다(`@terra/content` effective).
  - 하지 않음: 여러 개 고치기 `patch_items`(WP-7), 감사 `content.%` 부분 색인(줄이 쌓인 뒤 재 보고).
- WP-2 팩 형식(`core@24`, 모두 선택 칸 — 기존 항목 그대로 통과)
  - 아이템 공통 칸(`subcategory`·`tags`·`weight` g·`stackMax`·`tradable`·`bound`·`icon`), 묶음 `perish`(288)·`use`, `equip` 넓힘(`weaponType`·`maxDurability`·`combat`·`kinds`·`creature`), `equip.weapon.appropriate`(290: 착용 제한 아닌 1차 적정 스탯)·`twoHanded`·`ammo`.
  - 새 분류 셋, 처음 목록 [임시]: 중분류 36(자원 7·가공품 5·부품 3·장비 5·소모품 5·보석 1·건설 4·문서 2·귀금속 4), 무기 종류 14(무기 11 + 보조 3: 방패·화살통·탄창), 태그 0.
  - 규칙 검사마다 코드(`params.rule`), 스키마 문제는 zod 코드·한계 값.
- WP-3 서버 API(`items.list/get/check/preview/save/history/historyEntry`)
  - 미리 보기는 서버가 셈한다: 장비 = 유닛 화면과 같은 함수로 0·500·1000‰ 자리, 무기 = 그 세계의 실효 계산식(덮어쓴 식 표시)과 1차 적정 스탯으로 셈한 2차 적정치, 소모품 = 효과 줄, 값 = 레시피 원가(BigInt).
  - 아이템을 읽는 서버 자리 모두 실효 자료: 경제 목록을 접근자로(`economyCatalogAccessor`, 거래 방식 `marketKindOf` 하나). 전투·유닛·실험실·정원사는 스킬 편집기 때부터 실효 자료.
  - 코드·시나리오가 ID로 쓰는 아이템 표(`codeRefs.ts`)·권고(`advice.ts`)·끄면 멈추는 것.
- WP-4 화면
  - 스킬 편집기 공용 부품을 `editor/content/contentEditor*`로 꺼냈다(입력 칸·효과 줄·최근 바꿈·모델). 스킬 편집기도 3방향 다시 얹기. `e2e/skills.spec.ts`는 고치지 않았다.
  - `/dev/items`(`?item=<ID>`): 목록(대분류 타일·찾기·거르기·정렬·200줄씩), 접히는 구역(기본·분류·값·장비·무기·사용 효과·신선도), 쓰는 곳 칩, 효과 줄 + 풀이 문장, 미리 보기, 검사·쓰이는 곳 판(레시피·생필품·스킬 편집기·전투 실험실 프리셋·코드 참조), 담은 변경 막대(검사 1초·메모·적용·되돌리기·다시하기·비우기), 충돌 칸 고르기, 최근 바꿈 + 다시 담기, 내보내기, 잠든 줄 띠, 새 아이템·복제·팩 값으로·지우기, [아이템 분류] 칸.
  - 검사가 entry_changed를 알리면 화면이 바로 다시 얹는다(적용 전에). 충돌 칸이 남아 있으면 [적용]을 막는다. 코드 참조 아이템을 끄거나 칸·무기 공격 칸을 바꾸면 적용 전에 묻는다.
  - 390px은 목록 → 편집이 한 칸씩 쌓이고 막대는 아래에 붙는다. 토큰만, `data-density="compact"`, 문구 ko·en.
- 질문 291(탄약 모양)을 썼고 그 부분(탄약 아이템 모양·소모)은 멈췄다. 지금은 `weapon_types` 보조 칸 종류와 `equip.weapon.ammo` 연결만.

## 검증
- `TEST_DATABASE_URL=… pnpm check`(Verified): 통과 — 시험 파일 367·시험 3,076(DB 시험 포함). 새 시험: `contentEditorModel.test.ts` 6개(3방향 합치기·점 경로·ID 제안·오류 코드), `itemModel.test.ts` 14개(거르기·정렬·칸 맞추기·다듬기·묶음·다시 얹기·충돌·코드 참조), 서버 `itemEdit/limits.test.ts` 2개(화면 범위 = 팩 스키마).
- 시뮬 앞·뒤(Verified, 시드 1, 각 두 번 돌려 바이트 같음): war16 30일·stub16 180일·econ16 180일을 main `d310fe6`과 `fb82058`(WP-1~3)에서 비교. 바뀐 줄은 머리 줄의 팩 판·해시(core@23 → core@24)와 요약 줄의 `linesHash`뿐이고 본문 줄(230·403·2,200줄)·요약 파일(팩 칸 빼고)은 같다. `linesHash` war16 fd0d1c00 → b48481e1, stub16 2b878a6a → 0efb59b1, econ16 b06e63b7 → 4923c676. SIM_VERSION 6 유지. WP-4는 sim을 건드리지 않는다.
- `pnpm check:bundle`(Verified): 첫 화면 JS 104,976 B / 상한 131,416 B(직전 기록 104,731 B, +245 B = 주소 표 `dev_items` 줄·개발자 홈 아이콘과 공용 조각 나눔). 아이템 편집기 조각 `ItemEditorScreen-*.js` 113,289 B(gzip 30,747 B)·`.css` 11,200 B, 공용 `contentEditorEffects-*.js` 9,410 B(gzip 3,574 B) — 모두 `sw.js` 미리 캐시에 없음(빌드 산출 검색).
- `pnpm --filter @terra/server db:generate`(Verified): No schema changes. `pnpm check:content d310fe6`(Verified): core@24 통과(4b 호환 포함).
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e`): `e2e/items.spec.ts` 12개 통과(마지막 CSS 수정 뒤, 1.1분) — 복제·공격력·켜기·적용 → items.get·전투 실험실 무기 목록에 바로 듦, 서버 미리 보기의 실효 식 값, 지우기, 저장을 막는 문제·되돌리기·다시하기·비우기, 두 탭(다른 칸은 다시 얹어 적용 [2, 9], 같은 칸은 고르는 판·서버 값 쓰기), 플레이어 403, 배치 8개(가로 넘침·작은 누르는 곳 없음). 함께 돌린 `skills` 12·`balance` 14·`battleLab` 17·`dev` 12·`tuning` 16도 모두 통과(83개, 7.3분, 아이템 편집기 CSS 고치기 전 실행 — 그 뒤 바꾼 것은 아이템 편집기 조각 CSS·시험뿐).
- 사진(390 전체 쪽·1440 보이는 화면 × 파스텔·다크 × ko·en, 390은 목록 칸도, 분류 칸): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/item-editor/shots/items-*.png`(저장소 밖). 처음 돌린 사진에서 390 편집 칸에 목록이 같이 보이는 CSS 잘못(나누다 깨진 규칙)과 1440 미리 보기 표가 좁은 것을 찾아 고쳤다(1440은 편집 판을 한 줄로 쌓고, 120em부터 나란히).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/items.ts`·`combat.ts`·`categories.ts`·`economy.ts`·`common.ts`·`issue.ts`, `validate/*`, `effective.ts`, `node/entriesOverlay.ts`·`entriesDiff.ts`, `tuningDiff.ts` | WP-2 팩 형식·규칙 코드, WP-1 실효 차례·내보내기 `retiredIds` |
| `content/core/manifest.json`(core@24)·`item_subcategories.json`·`weapon_types.json`·`item_tags.json` | 새 분류 셋 처음 목록 [임시] |
| `packages/shared/src/contentEdit.ts`·`itemEditor.ts`·`skillEditor.ts`·`economy.ts`·`tuning.ts`·`routes.ts` | 서버·화면 공용 모양, 범위 상수, 쓰는 곳 칩, `dev_items` 주소(`?item=`) |
| `packages/sim/src/combat/equipment.ts`·`packCatalog.ts`·`appropriate.ts`·`replayDemo.ts`, `packages/sim/src/itemRefs.ts`, `packages/sim/src/simulator/combatRun.ts`·`waveBattle.ts`, `packages/sim/cli/common.ts`·`sim.ts` | 칸 목록 하나, 무기 사양·장비 정의, 1차 적정 → 2차 적정, 코드 참조 상수, `--tuning` entries |
| `apps/server/src/contentEdit/*`, `db/contentEditSchema.ts`·`schema.ts`, `drizzle/20261101161223_content_retired_ids/` | WP-1 덮어쓰기 층 보강, 은퇴 ID 표 |
| `apps/server/src/itemEdit/*`, `trpc/items.ts`·`router.ts`·`context.ts`·`createContext.ts`, `app.ts`·`main.ts`, `economyView/*` | WP-3 API·미리 보기·권고·코드 참조, 경제 목록 실효 자료 |
| `apps/game/src/editor/content/*` | 두 편집기 공용 부품(꺼냄) |
| `apps/game/src/editor/skills/*`(`SkillFields.tsx` 지움) | 공용 부품으로 옮김, baseHash 3방향 다시 얹기 |
| `apps/game/src/editor/items/*` | 아이템 편집기 화면·모델·시험 |
| `apps/game/src/shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `editor/DevHome.tsx`·`devIcons.tsx` | 주소 붙이기·개발자 홈 줄 |
| `apps/game/messages/ko.json`·`en.json` | `dev_items_*`·`dev_content_*` 문구, 옮긴 `dev_skills_*` 정리(`dev_skills_field_chance`는 e2e가 써서 둠) |
| `scripts/pwa-build.mjs`(+시험)·`apps/game/vite.config.ts` | 아이템 편집기·공용 조각 미리 캐시 밖 |
| `scripts/apply-tuning-diff.mjs`(+시험) | 분류 셋 entries·`retiredIds` |
| `e2e/items.spec.ts`(새)·`e2e/dev.spec.ts` | 화면 시험, 개발자 도구 9줄 |
| `AGENTS.md` 7장, `docs/PLAN.md` 13·14장, ADR·질문 | 기록 |

## 함께 바꿔야 하는 파일
- 범위: `packages/content/src/schema/items.ts` `ITEM_SCHEMA_LIMITS` ↔ `packages/shared/src/itemEditor.ts` `ITEM_LIMITS`·목록 상수(시험 `apps/server/src/itemEdit/limits.test.ts`).
- 새 규칙 코드 → `apps/game/src/editor/items/itemMessages.ts` `ISSUE_TEXT` + `dev_items_issue_*`·`dev_items_advice_*` 키(ko·en).
- 장비 칸을 전투에 이으면(WP-5·C·6) `ITEM_FIELD_USES`(쓰는 곳 칩)와 ADR 결과 절.
- 코드가 아이템 ID를 새로 박으면 `apps/server/src/itemEdit/codeRefs.ts`(sim 상수 `SIM_ITEM_REFS` 등).
- 화면 파일 이름을 바꾸면 `scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`, `apps/game/vite.config.ts` `globIgnores`.

## 건드리지 말 것
- 올라간 마이그레이션 `apps/server/drizzle/20261101161223_content_retired_ids/`.
- `content/core/id-changes.json`은 뒤에 추가만.
- 메시지 `dev_skills_field_chance`: 코드는 `dev_content_field_chance`를 쓰지만 `e2e/skills.spec.ts`가 이름표로 찾는다(같은 글).

## 미검증·TODO·알려진 문제
- 하지 않은 일: WP-5(새 장비 칸 전투 연결·`kinds` 거르기·양손), WP-C(크리쳐 3칸), WP-6(소모품 실행·286 스탯 비례 ±25%·287 전투 중 물약·탄약), 289 내구도 닳기, 285 소급 명령, WP-7 대량 도구, 잠든 줄 `id_collision`의 [새 ID로 옮기기](지금은 [버리기]만), 효과 고르기 창의 찾기·종류 거르기, 목록 "최근 바꿈" 정렬, 화면의 아이템별 기록(서버 `items.history({id})`는 있음).
- 휴대폰 실기기는 보지 않았다(헤드리스 390px만).

## 사용자 결정 대기
- 291 탄약 모양(가·나·다, 추천 가).
- [임시] 처음 목록(중분류 36·무기 종류 14)과 [임시] 값은 기획 확인(D-487) 뒤 팩 커밋.
