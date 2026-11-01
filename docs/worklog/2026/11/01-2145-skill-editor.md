# 스킬 편집기·행동별 소모 개발자 화면(/dev/skills), 맨손은 스킬 못 씀, 쉴드 재생은 맞아도 계속

- 일시: 2026-11-01 21:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-skill-editor.md`(제안), `2026-11-01-dev-settings-panel.md`, `2026-11-01-balance-screen.md`, `2026-10-31-combat-core.md`, 기획 D-490·D-491·D-487·D-461, 가지 `work/skill-editor`(main 5c621d3 위)

## 한 일
- **전투 규칙(D-490)**, `tdd`로 시험부터
  - 쉴드 재생은 맞는 중에도 일정하게 찬다: `shieldRegenDelayMs`·`lastHitMs` 없앰, 팩 `n40_shield_regen_delay` 지움 + `id-changes.json` `removed`(since 21)를 뒤에 더함(세계에 남은 덮어쓰기는 D1이 켤 때 `unknown_entry`로 지움).
  - 효과 사전 수치 `shield_regen`(버프·디버프 ‰, 분당 재생 × max(0, 1000 + ‰) ÷ 1000, `shieldRegenPerMinute`): 재생 단계가 쓴다. 팩 스킬은 그대로.
  - 맨손은 스킬을 쓸 수 없다(맨손 스킬 제외): 스킬 선택 칸 `weaponField`(physical·elemental·any, 없으면 기반)·`bareHand`, 사양 `weaponFields`·`bareHandAttack`, 판정 `skillUsable`(AI `pickSkill`·지속형 `applyPassives`가 거름). "맞는 칸이 없으면 맨손 자료로 셈"을 없앰. 맨손 스킬은 늘 타고난 무기·맨손 속성 자료로 센다(든 무기 계수 없음). 스킬 명령은 아직 없다(같은 함수로 거절할 자리).
  - 유닛 종류 선택 칸 `naturalWeaponIsWeapon`: 팩에 크리쳐 참, 사이보그·휴먼·안드로이드 거짓(적지 않으면 무기 칸 없는 종류만 참). `loadoutOf`가 `bareHanded`를 낸다.
- **팩 항목 덮어쓰기(D-461 바로 듦)**: 새 표 `content_overrides`·`content_override_revision`(마이그레이션 `20261101120613_content_overrides`, 더하기만, 표 정의 `db/contentEditSchema.ts`). 접근자 `contentEdit/state.ts`(실효 항목·묶음 검사 = 실효 팩 전체를 `validatePack`·켤 때 고르기 = 저장 때 팩 항목 해시), 저장 `store.ts`(판·감사 `content.apply`·`content.pack_won`·`content.dropped`), 요청 `services.ts`, 화면 자료 `views.ts`. tRPC `skills.list`·`skills.history`·`skills.save`(권한·속도 제한 = D1 `tuning:*`). `/health` `contentOverrides`·`contentRevision`.
- **읽는 곳을 실효 항목으로**: 유닛·사이보그 화면 자료(`rosterCatalogOf` `combat`·`names`·`baseValue` 접근자), 정원사 웨이브 전투(`combatCatalog`를 함수로: 월드·NPC 런타임·정원사), 밸런스 화면(같은 `roster.combat`).
- **내보내기 → 팩**: 차이 형식에 선택 칸 `entries`(`from` = 팩 항목 해시, 만든 항목 null), `pnpm tuning:apply`가 분류 파일 항목을 통째로 바꾸거나 끝에 붙임(`@terra/content/node` `applyEntriesDiff`·`hashEntry`), 판은 한 번.
- **화면 `/dev/skills`**: [스킬](목록·찾기·거르기·새 스킬, 모든 칸: 이름·설명·켜기, 기반·피해·필요한 무기 칸·맨손 스킬, 모양·발동·대상·사거리·반지름·연쇄, 자원·소모·시전·쿨, 공식 부품·조건·특수 효과(효과 사전)·등급, 저장·편집 취소·복제·끄기/켜기·팩 값으로·지우기) · [행동별 소모](걷기·퇴각 무료, 무기별·유닛 종류별 기본 공격 스태미나·MP, 건물 공격 = 기본 공격 값, 회피 기동 미구현, 스킬별 자원·소모, 줄마다 [적용]). 지연 로딩·미리 캐시 밖(`[Ss]killEditor`), 개발자 홈 줄, 메시지 185개(ko·en).
- 팩 core@20 → core@21. `SIM_VERSION` 4 → 5(아래 시뮬).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/{battle,battleState,battleTypes,coefficients,effects,skills,unitSpec,equipment,catalog,packCatalog}.ts`, `simulator/combatRun.ts`, `tuning.ts`, `index.ts`, `version.ts` | 쉴드 재생 지연 없앰·`shield_regen` 효과, 맨손 규칙(`skillUsable`·`weaponFields`·`bareHandAttack`·`bareHanded`·`naturalWeaponIsWeapon`), SIM_VERSION 5 |
| `packages/sim/src/combat/{battle,effects,skills,unitSpec}.test.ts`, `tuning.test.ts` | 새 규칙 시험(쉴드 계속·저주·버프, 칼·지팡이·마검·맨손·크리쳐, AI·지속형 거름) |
| `packages/content/src/schema/combat.ts`, `validate/combat.test.ts` | 스킬 `weaponField`·`bareHand`, 유닛 종류 `naturalWeaponIsWeapon`, 효과 `shield_regen` + 규칙 시험 |
| `packages/content/src/tuningDiff.ts`, `index.ts`, `node/{hash,entriesDiff,index}.ts` | 차이 `entries` 칸, 항목 해시·적용 함수 |
| `scripts/apply-tuning-diff.mjs`(+test) | `pnpm tuning:apply`가 `entries`를 분류 파일에 |
| `content/core/{manifest,tuning,id-changes,unit_kinds}.json` | core@21, N40 지연 칸 지움(+ID 변경표), 유닛 종류 칸 |
| `apps/server/src/contentEdit/*`, `db/contentEditSchema.ts`, `db/schema.ts`, `drizzle/20261101120613_content_overrides/` | 팩 항목 덮어쓰기 층(접근자·저장·요청·화면 자료·시험 2개) |
| `apps/server/src/trpc/{skills,router,context,createContext}.ts`, `tuning/services.ts`, `app.ts`, `main.ts` | `skills.*` 라우터, 내보내기 `entries`, 켤 때 싣기, `/health` |
| `apps/server/src/roster/catalog.ts`, `world/{world,combatCatalog}.ts`, `npc/{runtime,gardener}.ts` | 전투 자료를 실효 항목으로 쓸 때마다 읽음 |
| `packages/shared/src/skillEditor.ts`, `tuning.ts`, `routes.ts`(+test), `package.json` | 공용 모양, 차이 `entries` 모양, 주소 줄 `dev_skills` |
| `apps/game/src/editor/skills/*`, `editor/{DevHome,devIcons}.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx`, `messages/{ko,en}.json`, `vite.config.ts`, `scripts/pwa-build.mjs`(+test) | 화면·문구·지연 로딩·미리 캐시 규칙 |
| `e2e/skills.spec.ts` | 화면 시험 |
| `docs/adr/2026-11-01-skill-editor.md`, `docs/PLAN.md`(ADR 표 49) | 결정 기록 |

## 시험·검사
- 시뮬레이터(시드 1, 두 번씩, 위반 0. 앞 = main 5c621d3을 저장소 밖에 풀어 돌림, 뒤 = 이 가지)
  - war16 30일: 하루·전투 줄이 모두 같다(머리·요약 줄의 팩 판·해시·SIM_VERSION만 다름). 전투 123(조우 123), 공격 쪽 승 55, 쓰러짐 428, 틱 132,068 그대로. 줄 해시 `88edea7d` → `459bae3a`.
  - stub16 180일: 하루 줄 모두 같다. 줄 해시 `6db997de` → `4e9f2147`.
  - econ16 180일: 13일 웨이브 전투(틱 750 → 700)부터 달라진다 — 시뮬 정원사 마법형 크리쳐(물리 스킬 셋 + 지팡이 = 속성 칸만)가 물리 기반 스킬을 더는 쓰지 않는다(D-490). 웨이브 예고 529 → 494, 웨이브 전투 383 → 342, 웨이브 승 31 → 38, 끝 세력 19 → 18·도시 58 → 56·유닛 838 → 809, 도시 몫 최대 1,666 → 1,578bp. 줄 해시 `67b687fa` → `2ccc72e8`. 같은 입력의 결과가 바뀌어 SIM_VERSION 4 → 5.
  - 두 번 돌린 결과: 앞·뒤 모두 세 시나리오가 두 번 바이트까지 같다(줄·요약 파일 SHA-256 같음), 위반 0. 뒤 줄 해시는 SIM_VERSION 5 머리로 다시 돌린 값.
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 통과(시험 파일 335·시험 2,864, 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠). 새 시험: 서버 `contentEdit/state.test.ts`(7)·`contentEdit.db.test.ts`(5), sim 쉴드·맨손·팩 칸 기본값, 콘텐츠 스키마 3, `apply-tuning-diff` entries 1, 화면 모델 `skillModel.test.ts`(6).
- 화면 시험(Playwright 1.63, 헤드리스 Chromium, `TEST_DATABASE_URL` 개발 DB): `skills`·`dev`·`tuning`·`units`·`cyborg`·`balance` 함께 83개 중 82 통과·1 실패(`dev.spec.ts` 개발자 도구 줄 수 6 → 7, 시험을 고침) → 고친 뒤 `skills`·`dev` 24개 모두 통과. 줄기별: skills 12, dev 12, tuning 16, units 13, cyborg 17, balance 13. 처음 돌렸을 때 skills 6개가 실패했다(data-* 값 "true", 390px 가로 넘침 10px — 그리드 칸 `minmax(0, 1fr)`로 고침).
- 사진(파스텔·다크 × ko·en × 390·1440, 스킬 칸·행동별 소모 표 16장): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/skill-editor/shots/` (저장소 밖). 넘침·작은 누르는 곳 검사 통과.
- `pnpm check:bundle`: 첫 화면 JS 104,409 B / 상한 131,416 B(편집기는 지연 조각). `pnpm check:content 5c621d3`: core@21 통과(호환 4b 포함).

## main 합치기 (b9a25a6: 전투 다시보기·마법 스킬, 통합 담당 요청)
- 충돌 18파일을 풀었다. 판정 코어(`combat/battle.ts`·`skills.ts`)는 둘 다 둔다: 다시보기 기록기(`trace`) 칸·훅(`resolveSkill`·`applyParts`·`tickEffects`·기본 공격)과 이 가지의 `takeDamage` nowMs 없앰·`skillUsable` 거름. 목록 파일(주소 표·시험, `routeViews`, `ComingSoon`, 개발자 홈, `vite.config` globIgnores, PWA 규칙·시험, tRPC router·context·createContext, `app.ts`, 문구 ko·en)은 둘 다. `docs/WORKLOG.md`는 다시 만들었다. `e2e/dev.spec.ts`는 개발자 도구 여덟 줄(스킬 편집기·전투 다시보기).
- 시범 6 대 6(`packages/sim/src/combat/replayDemo.ts`): 맨손 규칙 아래에서 전사·수호자(칼 = 물리)와 마법사(속성 지팡이 = 속성)는 스킬을 그대로 쓴다. 사제는 빛 지팡이(속성 칸만)라 물리 기반 응급 처치를 쓸 수 없어 빼고, 빛 치유(heal)·빛 보호막(buff)은 그대로라 일곱 모양이 모두 나온다(시험 `replay.test.ts`). 장비 `bareHanded`·`naturalIsWeapon`을 사양에 넘긴다. 무기를 새로 쥐여 준 유닛은 없다.
- 합친 뒤 검사
  - 시뮬레이터(main b9a25a6 앞 · 합친 가지 뒤, 시드 1, 두 번씩 바이트 같음, 위반 0): war16 `88edea7d` → `459bae3a`(하루·전투 줄 같음, 머리·요약만), stub16 `6db997de` → `4e9f2147`(같음), econ16 `67b687fa` → `2ccc72e8`(13일 웨이브 전투부터 다름, 위와 같은 까닭). main b9a25a6의 시뮬 줄 해시는 5c621d3과 같다(다시보기는 판정을 바꾸지 않음). SIM_VERSION 5, 팩 core@21 그대로.
  - 화면 시험: skills 12·dev 12·battle-replay 9·tuning 16 = 49 통과, 2 건너뜀(다시보기 측정 시험, `E2E_MEASURE=1`일 때만).
  - `pnpm check:bundle` 첫 화면 JS 104,554 B / 131,416 B. `pnpm check:content origin/main` core@21 통과(4b 기준 b9a25a6).
  - `TEST_DATABASE_URL=… pnpm check`: 통과(시험 파일 342·시험 2,903). 시뮬 두 개를 함께 돌리던 첫 번은 `packages/planet` 2차맵 이음매 시험 하나가 부하로 30초 제한을 넘어 실패했고(합친 것과 상관없는 꾸러미), 쉬는 기계에서 다시 돌려 모두 통과.

## main 합치기 2 (0fa5d2e: 전투 실험실) · 합치기 전 관문 WP-0(통합 담당 요청, 아이템 편집기 설계안 4.5·6절)
- 합치기: 서버 app·main·tRPC router·context·createContext(둘 다), PLAN ADR 표(48 = main, 49 = 이 가지). 팩은 main core@21(N5 성장률)과 이 가지 core@21이 합쳐 core@22(formulas가 22를 쓰면 마지막 합치기에서 23으로).
- 전투 실험실 유닛 사양(`apps/server/src/battleLab/build.ts`)에 맨손 규칙: 장비 `naturalIsWeapon`(유닛 종류 칸)·사양 `bareHanded`(직접 값 무기면 맨손 아님). `samples.test.ts`에 시험 하나: 모든 샘플 스킬을 실제 사양에서 쓸 수 있다(크리쳐 늑대·골렘은 발톱을 스킬용 무기로, `weaponFields = ["physical"]`), 전사에서 무기를 빼면 맨손이라 못 쓴다. `build.test.ts` 새 사이보그 기대 사양에 `bareHanded: true`.
- WP-0 a 켤 때 잠재우기: 지금 팩보다 새 판(`core@N+1`)에서 저장한 줄은 해시가 다른 팩 항목이면 팩이 이기고, 그 밖은 검사를 통과하면 쓰고 못 통과하면 지우지 않고 잠재운다(감사 `content.slept` 까닭 `newer_pack`, 모르는 분류 줄은 `unknown_category`). 잠든 줄은 뒤의 install에서도 넣지 않고, 그 판을 다시 켜면 다시 든다. 지울 줄이 없으면 판을 올리지 않는다. DB 시험 셋(`contentEdit/contentEditBoot.db.test.ts`).
- WP-0 b 꺼진 참조 거르기: `@terra/sim` `combatCatalogFrom`이 켜진 장비의 꺼진(없는) 스킬 ID와 켜진 스킬의 꺼진(없는) 효과 줄을 뺀다(`droppedReferences`). 서버는 스냅숏마다(켤 때·저장 뒤) 한 줄 `content references dropped`. 시험 둘(`apps/server/src/world/combatCatalog.test.ts`, 실제 팩: `fire_bolt`를 끄면 시험 지팡이 장비 스킬에서 빠지고 던지지 않음, `burn`을 끄면 화염 폭발·불꽃 화살 효과에서 빠짐). 지금 팩의 꺼진 참조는 없음(같은 시험).
- 확인: 시뮬(시드 1) war16·stub16·econ16을 거르기 앞(c3ab843)·뒤에서 한 번씩 돌려 줄·요약 파일이 바이트까지 같다(war16 `77530457`, stub16 `2d938320`, econ16 `c8d4fdd9`, 위반 0. 팩 core@22라 앞 합치기의 해시와 머리만 다르고 하루·전투 줄은 같다. ID 변경표 since를 22로 고치기 전 팩으로 잰 값이라 지금 팩 해시와는 머리가 다르다). 서버 DB 시험 contentEdit·battleLab·battleReplay 10파일 50개 통과. 그다음 main b57a2b3(설계안 문서)도 합치고 `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 350·시험 2,943), `pnpm check:content origin/main` core@22 통과(ID 변경표 n40 기록의 since를 22로 — main 판 다음).

## main 합치기 3 (ff87874: 계산식 편집기, 통합 담당 요청)
- 충돌 15파일을 풀었다. 서버 `app.ts`(정원사 웨이브 전투 자료는 이 가지의 실효 항목 접근자, 전투 계수는 main의 계산식 `combatFormulas()`를 싣는다)·`main.ts`(설정 칸 상태 = 팩 tuning·가중치 표·계산식, 그 뒤 팩 항목 상태)·tRPC `context.ts`·`tuning/services.ts`(내보내기 = `entries` + `formulas`)·`world/combatCatalog.ts`. 콘텐츠 `tuningDiff.ts`(선택 칸 `entries` + `formulas`, 겹침 검사 둘)·공용 `tuning.ts`. sim `coefficients.ts`(계산식 칸 `formulas`는 받고 `shieldRegenDelayMs`는 없앤 채)·`packCatalog.ts`(행 식 `statRowFrom` + 꺼진 참조 거르기)·`unitSpec.ts`(아래)·`index.ts`·`version.ts`. `pnpm tuning:apply`(`entries` + `formulas`, 판은 한 번, 건너뜀 까닭 `invalid`는 식과 항목의 문구를 나눔)와 시험. `docs/WORKLOG.md`는 다시 만들었다.
- 맨손 식과 맨손 규칙: main의 맨손 식(`bare_attack`, D-488)은 맨손 기본 공격(무기 `unarmed`)에만 쓴다. 맨손 유닛(사람형)은 그대로 스킬을 못 쓰고(D-490), 맨손 스킬은 타고난 무기 틀로 센다. 든 무기가 `unarmed`면 같은 칸 스킬의 사양은 무기 틀(main의 `!attack.unarmed` 조건을 이 가지 `skillProfile`에 옮김).
- 팩: main core@22(계산식 `formulas`, 사람형 타고난 무기 `unarmed`) 다음이라 core@23, ID 변경표 n40 기록의 since 23. 스킬 편집기의 유닛 종류 소모 저장은 `naturalWeapon`을 펼쳐 바꾸므로 `unarmed`가 남는다.
- 마이그레이션: main이 `20261101113211_battle_lab_presets`·`20261101121828_formula_overrides`(둘 다 gardener 위 갈래)를 더했다. 이 가지의 `20261101120613_content_overrides`(gardener 위)도 그대로 두어 gardener 위 갈래 셋이다(AGENTS 6장 Drizzle: 적용은 이름만 보므로 차례와 상관없고, 다시 만들지 않는다, 통합 담당 지시). 합친 뒤 `db:generate`는 "No schema changes". 다음 마이그레이션의 `prevIds`에 세 끝을 모두 적게 된다.
- 켤 때 잠재우기 DB 시험은 팩 판을 manifest에서 읽는다(22 고정 → N, 새 판 = N + 1).
- 시뮬레이터(main ff87874 앞 · 합친 가지 뒤, 시드 1, 두 번씩 바이트 같음, 위반 0)
  - war16 30일·stub16 180일: 하루·전투 줄이 모두 같다(머리·요약 줄의 팩 판·해시·SIM_VERSION만). 줄 해시 war16 `95243fc1` → `fd0d1c00`, stub16 `2985e911` → `2b878a6a`.
  - econ16 180일: 13일 웨이브 전투(틱 750 → 700)부터 달라진다(시뮬 정원사 마법형 크리쳐가 물리 기반 스킬을 못 씀, 앞 합치기들과 같은 까닭과 같은 수). 웨이브 예고 529 → 494, 웨이브 전투 383 → 342, 웨이브 승 31 → 38, 끝 세력 19 → 18·도시 58 → 56·유닛 838 → 809, 도시 몫 최대 1,666 → 1,578bp. 줄 해시 `e9d92ab9` → `b06e63b7`.
  - main이 `SIM_VERSION` 5(계산식)를 먼저 써서 같은 입력의 결과가 main 5와 다르므로 6으로 올렸다(`version.ts`에 5 = 계산식, 6 = 이 가지).
- `TEST_DATABASE_URL=… pnpm check`: 통과(시험 파일 356·시험 3,008). `pnpm check:content origin/main`: core@23 통과(4b 기준 ff87874). `pnpm check:bundle` 첫 화면 JS 104,731 B / 131,416 B.
- 화면 시험(Playwright 1.63, 빌드한 합친 가지): skills·dev·battle-replay·tuning·formulas·battleLab 79개 중 73 통과, 2 건너뜀(다시보기 측정, `E2E_MEASURE=1`일 때만), 4 실패 = battleLab 배치·사진의 1440px 넷(전체 화면 사진에서 Chromium "Unable to capture screenshot"). battleLab만 한 번 다시 돌리니 17개 중 16 통과, 1 실패(dark·en·1440: 사진은 찍힌 뒤 렌더러가 죽음 "Target crashed"). 이 사진은 기기 배율 3이라 4,320 × 약 23,000px(약 1억 화소)이고, 그때 기계는 디스크가 거의 차고(남은 곳 약 0.5~0.9GB) 다른 줄기 작업으로 부하가 컸다. 전투 실험실 화면 코드는 이 합치기에서 바뀌지 않았다. 환경 탓으로 보지만(Assumed) main에서 같은 기계로는 재지 않았다(Unknown).
- 기계 디스크가 거의 찼다(다른 줄기 작업 트리 포함). 이 가지의 옛 기준 복사본(시뮬 비교용)과 지난 화면 시험 결과 폴더는 지웠다.

## 함께 바꿔야 하는 파일
- 스킬 칸을 더하면: `packages/content/src/schema/combat.ts` → `packages/sim/src/combat/{skills,packCatalog}.ts` → `apps/server/src/contentEdit/views.ts`(`skillJsonOf`) → `packages/shared/src/skillEditor.ts`(`SkillJson`) → 화면 `editor/skills/SkillForm.tsx`.
- 효과 사전 수치를 더하면: 팩 스키마 `stat` 목록 + `effects.ts ModifierStat`·`modifiersOf`.

## 건드리지 말 것
- 올라간 마이그레이션 `20261101120613_content_overrides`는 고치지 않는다.
- `id-changes.json`은 뒤에 더하기만.

## 미검증·TODO·알려진 문제
- 스킬 명령(유저 개입)이 없어 "명령 거절"은 `skillUsable` 함수만 있다(명령이 생기면 같은 함수로 거절).
- 시뮬레이터 `--tuning`이 차이의 `entries`를 아직 얹지 않는다(서버·시뮬 실효 항목이 다를 수 있음).
- 시뮬 정원사 마법형 크리쳐는 같은 물리 스킬 셋에 지팡이만 들어 이제 스킬을 못 쓴다(시뮬 [임시] 장비, `work/battle-lab` 프리셋과 같이 정리).
- 유닛·사이보그 화면은 "든 무기로 못 쓰는 스킬"을 아직 따로 보이지 않는다.
- NAS 실행·NAS 부하는 재지 않았다(Unknown).
- 다른 줄기와 겹침: `work/formulas`는 main ff87874로 합쳤다(아래 "main 합치기 3"). `work/battle-replay`(스킬 `shape`·연쇄 칸은 그대로).

## 사용자 결정 대기
- 없음(스킬 세부는 편집기에서 정한다, D-490). 기술 기본값으로 정한 것: 맨손 스킬은 무기를 들어도 늘 타고난 무기로 센다, 지속형 스킬도 든 무기로 거른다, `naturalWeaponIsWeapon`(크리쳐 참·사람형 거짓).
