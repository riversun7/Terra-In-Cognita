# 사이보그 판 버프 몫(질문 354)·꺼진 아이템을 입고 있을 때(355)·밸런스 화면 기여 조회 다시 묻기

- 일시: 2026-11-07 15:00 (KST, 컨테이너가 다시 켜진 뒤 14:10~ 마무리)
- 작업 도구: Claude Code
- 관련: 기획 D-515(질문 353~355 정리, 미러 `docs/design/02_Decision_Log.md`), 질문 `docs/questions/2026-11-07-equip-stats.md`, ADR `docs/adr/2026-11-03-item-holdings.md` "바뀜 (2026-11-07, 사이보그 판 버프 몫·꺼진 아이템 — 질문 354·355 답 D-515)", 앞 작업 기록 `07-1150-equip-stats.md`, `07-1240-test-infra.md`(기여 조회 429 원인), 가지 `work/sheet-buffs`

## 한 일
- **354 버프 몫**: 사이보그 화면 `cyborg.get` 몸의 2차 스탯 풀이·판정 값(`breakdown`·`combat`)을 걸린 효과를 뺀 몸으로 셈하고, 새 선택 칸 `buffs`(`RosterBuffs`)에 몫을 싣는다(`roster/unitBody.ts` `buffSharesOf`, 판정과 같은 함수만: 1차 스탯 버프가 바꾼 2차 행 몫 + 방어율·회피·크리 배율·쉴드 재생 전투 수치 버프, 실제 공격력은 공격 ‰ 버프 항까지, 관통·이동 속도, 효과 합). 화면은 1차·2차·판정 값 줄마다 기본값 옆 버프 알약(상태색 성공/위험)과 막대 빗금 몫 칸, 펼치면 "전투 수치 버프 +n%"·"버프 +n → 전투 m". 관통·이동 속도 줄은 값이 있을 때만. 1차 줄 디버프는 기본 막대 끝에서 깎인 몫(디버프 색).
- **355 꺼진 아이템**: 유닛 화면 자료에 `heldEquipment`(꺼진 아이템 포함 장비 정의) — 몸 묶음이 칸의 물건을 여기서 찾는다(사이보그 화면·유닛 상세·생명 수치 최대·세계 전투 시작 모두 같은 몸). 이름 표도 모든 아이템. 이미 걸린 효과도 사전 항목이 꺼져도 몸을 바꾼다(`gearOf`). 받기·고르는 목록·시뮬은 그대로 켜진 것만.
- **밸런스 화면 기여 조회**(`WeightTab.tsx`): 거절(속도 제한 429·연결·서버 일시 오류)이면 거절 문구 + "잠시 뒤 다시 묻습니다"를 보이고 2초 → 4초 → … 최대 30초 뒤 같은 입력으로 다시 묻는다(`balanceModel.ts` `contributionRetryMs`). 담은 칸·기준 1차가 바뀌면 새로 묻고(횟수 처음부터), 권한·세션·입력 문제는 다시 묻지 않는다. 화면을 떠나거나 입력이 바뀌면 기다리던 묻기를 그만둔다. 까닭 없는 429도 속도 제한 문구.
- 353(1차 스탯 버프는 고정값만)은 지금 코드 그대로라 손대지 않았다(효과 사전 편집기가 1차 스탯 ‰를 막는 일은 이 줄기 밖).
- **origin/main(`0faf14c`, core@38·프로토콜 9·SIM 13) 합침**: 충돌은 보유 물건 ADR(D-514·287 바뀜과 이 줄기 바뀜을 둘 다 둠), PLAN 상태 표(main의 새 두 줄 + 이 줄기 줄), sim `battleState.ts` import(탄·물약 + 시작 효과). main이 더한 부상 불이익(D-514, 1차 출처 효과 "injury")도 걸린 효과의 몫으로 센다: `withoutBuffs`가 `injuryPm`도 뺀다(1차 줄 몫 = 출처 effect 합과 2차 행 몫이 같은 것을 셈, 서버 시험 하나 더).
- main의 `hp_regen` 행(D-514, 켜진 행 17개)에 맞춰 `balance.spec`의 행 수 기대(16 → 17)를 고쳤다(main에서 이미 틀려 있던 기대).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/battleState.ts`, `packages/sim/src/index.ts` | 시작 효과 변환(`activeStartEffects`)과 `withAttackModifiers`·`withDefenseModifiers`·`EffectHolder`·`Modifiers` 내보내기(출력 그대로) |
| `packages/shared/src/roster.ts` | `RosterBuffs`·`ROSTER_MODIFIER_STATS`, `CyborgBody.buffs`, `breakdown`·`combat` 뜻(기본) |
| `apps/server/src/roster/unitBody.ts` | `buffSharesOf`·`withoutBuffs`(1차 버프·부상 불이익을 뺀 몸)·`BodyPair` |
| `apps/server/src/roster/cyborgBody.ts`·`services.ts` | 뺀 몸으로 풀이·판정 값, 몫, 읽는 시각 |
| `apps/server/src/roster/catalog.ts`·`body.ts` | `heldEquipment`(꺼진 아이템 포함), 이름 표 모든 아이템 |
| `apps/server/src/holdings/world.ts` | 꺼진 효과 사전 항목도 이미 걸린 효과는 몸에 든다 |
| `apps/server/src/roster/unitBody.test.ts` | 버프 몫 5개(부상 불이익 포함)·꺼진 아이템 1개 시험 |
| `apps/game/src/cyborg/BuffChip.tsx`(새)·`buffChip.css`(새) | 버프 몫 알약·막대 빗금(상태색) |
| `apps/game/src/cyborg/CoreStats.tsx`·`coreStats.css` | 1차 줄 기본 + 알약, 효과 칸 버프 색, 디버프 칸·범례 |
| `apps/game/src/cyborg/CombatSpecs.tsx`·`CombatAttack.tsx`·`combatSpecs.css` | 2차·판정 값 줄 몫, 관통·이동 속도 줄, 펼친 버프 줄, 알약 뜻 줄 |
| `apps/game/src/cyborg/cyborgText.ts`·`.test.ts`, `apps/game/src/roster/rosterText.ts`·`.test.ts` | `effectShare`·`coreSegments` 디버프 칸·`buffTone`·`barSplit`, `formatSigned`·`formatStatShare` |
| `apps/game/src/editor/balance/WeightTab.tsx`·`balanceModel.ts`·`.test.ts` | 기여 조회 다시 묻기, 까닭 없는 429 |
| `apps/game/messages/{ko,en}.json` | 사이보그 판 10개 + 밸런스 1개 |
| `e2e/sheet-buffs.spec.ts`(새), `e2e/balance.spec.ts`, `e2e/equip-stats.spec.ts` | 화면 시험(아래). equip-stats는 줄 기본값(`.combat-value-base`)을 읽는다(admin에 버프가 남아도 같게). balance는 기여 조회 거절 시험 + 켜진 행 17개 |
| `docs/adr/2026-11-03-item-holdings.md`, `docs/PLAN.md`(14장·상태 표), 이 기록, `docs/WORKLOG.md` | 결정·상태·기록 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안, main `0faf14c`를 합친 뒤)
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 426파일 3,522개(DB 시험 포함, 건너뜀 없음), 다국어 3,846키, 대비 738쌍(새 토큰 없음), 콘텐츠 core@38. 새 시험: 서버 `roster/unitBody.test.ts` 버프 몫 5개(버프 없음 = 0, 1차·전투 수치 버프 몫, 부상 불이익 몫, 이동 속도 하한, 목록 같음)·꺼진 아이템 1개, 게임 `cyborgText.test.ts` 2개·`rosterText.test.ts` 1개·`balanceModel.test.ts` 1개(+429 줄 하나).
  - 처음 돌렸을 때 린트가 지난 Paraglide 생성 파일(합친 main의 융합 문구가 없음)을 읽어 실패했다 → `paraglide-js compile` 뒤 다시 돌려 통과(코드 문제 아님).
- `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` 통과(첫 화면 JS 105,898 B / 상한 131,416 B — 새 화면 코드는 사이보그 지연 조각 안). `node scripts/check-docs.mjs origin/main` 통과, `pnpm docs:index` 다시 만듦.
- 화면 시험 `pnpm e2e sheet-buffs.spec.ts equip-stats.spec.ts balance.spec.ts`: sheet-buffs 9개·equip-stats 10개 통과, balance는 켜진 행 수 기대(16, main의 `hp_regen` 전 값) 하나만 실패 → 17로 고쳐 `pnpm e2e balance.spec.ts` 16개 모두 통과(새 "기여 조회 거절" 포함: 429 두 번 → 문구·"잠시 뒤 다시 묻습니다" → 손대지 않아도 표가 찬다). 그 전(합치기 전) 실행에서 cyborg·inventory 시험도 같이 돌려 통과(62/63, 실패 하나는 sheet-buffs 줄 고르기 — 판정 값 줄이 같은 `data-sec`을 써서 2차 줄은 `:not([data-real])`로 고름).
  - 시험 물약 효과량은 쓸 때 ±오차로 굴린다(D-501, 설정 칸 출발값 ±50%) → 처음 시험이 STR +3을 기대해 실패, 값을 화면에서 읽어 맞추게 고쳤다.
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/sheet-buffs-shots/` — `sheet-buffs-{core,offense,defense,mobility}-{390,1440}-{pastel,dark}-{ko,en}.png` 32장. 눈으로 확인: 390 파스텔 한국어 핵심 사양(STR 12 +6 알약·빗금 칸, AGI 20 −6 디버프 칸·범례), 1440 다크 영어 공격(실제 공격력 16 +11, "Combat buff +13.6%"·"Buffs +11 → in battle 27"), 390 다크 한국어 방어(방어율 +5.4% 버프, 회피 −1.7% 디버프).

## 함께 바꿔야 하는 파일
- 효과 사전 전투 수치 목록(`packages/content` `EFFECT_COMBAT_STATS`)을 바꾸면 `@terra/shared/roster` `ROSTER_MODIFIER_STATS`(서버 시험이 같은지 본다), `unitBody.ts` `buffSharesOf`(행 몫), 화면 `CombatSpecs.tsx` `ROW_MODIFIER`.
- 판정의 버프 얹기(`withAttackModifiers`·`withDefenseModifiers`·`shieldRegenPerMinute`·`moveIntervalMs` 하한)가 바뀌면 몫은 같은 함수라 따라가지만, 공격 ‰를 공격력 단위로 바꾸는 줄(`buffSharesOf` `effective`)은 판정 피해 사슬(버프 항 곱)을 따라 고친다.

## 건드리지 말 것
- 사이보그 판 줄 값은 기본(걸린 효과를 뺀 값)이다 — 랭킹이 버프를 뺀 값(D-7022)이라 맞춘 것. `stats.secondary`는 든 몸 값 그대로(생명 수치 최대 등이 읽는다).
- `combat.equipment`(전투 실험실·밸런스 무기 목록·시뮬)에 꺼진 아이템을 넣지 않는다(새로 생기는 길·고르는 목록은 그대로).

## 미검증·TODO·알려진 문제
- 유닛 상세 스탯 판에는 몫 표가 없다(든 몸 값). 같은 `buffs`를 `units.list`에 실으면 된다.
- D-512 "콘텐츠에 켜고 끄기를 두지 않는다" 자체(팩 `enabled` 칸·편집기 스위치 없애기)는 하지 않았다.
- NAS·실제 휴대폰에서 재지 않았다.

## 사용자 결정 대기
- 없음.
