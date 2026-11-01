# 마법 스킬 일곱·속성 지팡이 여섯, 스킬 모양 칸(shape)·연쇄·아군 하나·쉴드 회복·느리게

- 일시: 2026-11-01 20:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-01, 마법 스킬)". 질문 260~264 `docs/questions/2026-11-01-mage-skills.md`. 기획 48 §6(D-426~D-429), D-415·D-457·D-459·D-463·D-465·D-466, 50 §2·§6, D-5032. 가지 `work/mage-skills`(main `b8a06f6`에서, 올리기 전 `e9582d1` 위로 옮김)

## 한 일
- 시험 먼저(tdd, 새 `packages/sim/src/combat/magic.test.ts`): 연쇄(튐 거리 안 가장 가까운 적으로 차례로, 줄임 배율, 다음 적이 없으면 멈춤) → 아군 하나 회복(사거리 안 체력 비율 최저, 대상 체력 조건) → 쉴드 회복(쉴드 비율 최저, 최대에서 멈춤) → 느리게(이동 간격) 순으로 한 조각씩 빨강을 본 뒤 구현.
- 판정(`skills.ts`·`effects.ts`·`battle.ts`):
  - 스킬 자료에 `shape`(보는 쪽 모양 7가지)·`chain`(최대 대상 수·튐 거리·줄임 배율 ‰). `resolveSkill`의 적 대상이 `chain`이면 `chainTargets`(빗나가도 튐, 시야·시선 안 봄, 질문 261 가).
  - `pickSkill`이 스킬과 대상을 함께 고른다(`SkillPick`). 대상 `ally` + 반지름 0 + 사거리 ≥ 1 = 아군 하나(`singleAlly`·`chooseAlly`, 질문 260 가). `finishCast`는 아군 하나도 사거리·시선을 다시 본다.
  - 조건 부품 `target_hp_below`, 공식 부품 `shield`(대상 최대 쉴드 ‰, 질문 263 가), 효과 수치 `move_speed`(`moveIntervalMs`: 간격 × 1000 ÷ max(100, 1000 + 합), 걷기만, 질문 262 가). 회복 부품은 그대로(질문 264 가).
- 팩 형식(`packages/content/src/schema/combat.ts`): `shape` 필수 + `checkSkillShape`(모양과 대상·피해·사거리·반지름·연쇄·회복 부품이 맞는지, 지속형은 buff, 반지름 0 아군은 사거리 ≥ 1), `chain`, `shield`·`target_hp_below` 부품, 효과 `move_speed`. `@terra/content`가 `SKILL_SHAPES`를 내보낸다.
- 팩 core@18 → core@19: 옛 스킬 여섯에 모양, 효과 `chill`, 스킬 일곱(`frost_bolt` projectile·`chain_lightning` chain·`flame_burst` area·`stone_spike` single·`light_heal` heal·`radiant_ward` buff·`dark_curse` debuff, 모두 속성 기반·MP), 지팡이 여섯(`fire_staff`·`water_staff`·`wind_staff`·`earth_staff`·`light_staff`·`dark_staff`, 속성 칸만·옵션 계수 그 계열 기본형 50‰·그 계열 스킬). 수치는 모두 [임시](D-5032). ID는 새것만(지운 것·바꾼 것 없음 → `id-changes.json` 그대로).
- `TEST_COMBAT_CATALOG`(팩과 같은 값)에 마법 몫을 새 파일 `catalogMagic.ts`로 더했다(서버 시험 `combatCatalog.test.ts`가 팩 = 시험 자료를 본다).
- `@terra/sim`이 `singleAlly`·`moveIntervalMs`(유닛·간격 → 이동 속도를 얹은 간격)·`MIN_MOVE_SPEED_PM`·`SkillShape`·`SkillChain`·`SkillPick`를 내보낸다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/skills.ts` | 모양·연쇄 칸, 연쇄 대상·줄임, 아군 하나 고르기, `target_hp_below`, `shield` 부품, `pickSkill`이 대상도 고름 |
| `packages/sim/src/combat/effects.ts` | 효과 수치 `move_speed`, `moveIntervalMs`·하한 |
| `packages/sim/src/combat/battle.ts` | 새 `pickSkill`(대상 함께), 아군 하나 시전 끝 확인, 걸음 간격에 이동 속도 |
| `packages/sim/src/combat/packCatalog.ts` | 팩 `shape`·`chain`을 스킬 자료로 |
| `packages/sim/src/combat/catalog.ts`·`catalogMagic.ts`(새) | 옛 스킬 모양, 마법 효과·스킬·지팡이 시험 자료(팩과 같은 값) |
| `packages/sim/src/combat/magic.test.ts`(새) | 연쇄·아군 하나 회복·쉴드 회복·느리게·마법 자료·섞인 전투 결정성 |
| `packages/sim/src/index.ts` | 새 타입·함수 내보내기 |
| `packages/content/src/schema/combat.ts`·`index.ts` | `shape`·`chain`·새 부품·`move_speed`·모양 검사, `SKILL_SHAPES` |
| `packages/content/src/validate/combat.test.ts` | 마법 모양 통과·모양 어긋남 실패 시험, 옛 시험 자료에 모양 |
| `content/core/skills.json`·`effects.json`·`items.json`·`manifest.json` | 위 팩 내용, 판 19 |
| `docs/adr/2026-10-31-combat-core.md` | "바뀜 (2026-11-01, 마법 스킬)" 절(뒤에 더함): 모양 칸 표, 새 판정, 콘텐츠 표, 결과 |
| `docs/questions/2026-11-01-mage-skills.md`(새) | 질문 260(아군 하나 대상)·261(연쇄)·262(느리게)·263(쉴드 회복)·264(회복량 기준) |

## 확인 (Verified, 개발 컨테이너)
- 시뮬레이터(시드 1, 전 = main `b8a06f6` core@18, 뒤 = 이 가지 core@19, 같은 명령 두 번씩 바이트 같음, 위반 0): 날마다 줄은 모두 바이트까지 같고, 머리·요약 줄의 콘텐츠 판·해시·`linesHash`만 다르다. econ16 요약은 거래소가 도시마다 물건마다 열려 시장 768 → 1,152, 원장 계정 4,728 → 5,622, 새 지팡이 거래량 0이 더해진다. 시뮬레이터 유닛은 마법 스킬·지팡이를 쓰지 않고 옛 스킬의 고르기·굴림 차례가 그대로라 → `SIM_VERSION` 4 그대로.

  | 시나리오 | 날 | 줄 해시 전 → 뒤 | 줄 수 | 비고 |
  |---|---|---|---|---|
  | war16 | 30 | `0138f0c1` → `a643f75f` | 196·196 | 전투 123(조우 123, 공성 0)·공격 쪽 승 55·시간 초과 0·쓰러짐 428·틱 132,068 그대로 |
  | stub16 | 180 | 앞 → `2afe4f9a` | 223·223 | 같음 |
  | econ16 | 180 | 앞 → `693f04b0` | 1,443·1,443 | 거래·가격·잔고 같음(위 시장·계정 수만) |

- 섞인 전투 확인(작업용 스크립트, 6 대 6, 유닛마다 마법 스킬 하나 + 어둠의 저주): 일곱 스킬이 모두 쓰였다(서리 화살 45·연쇄 번개 37·화염 폭발 25·바위 가시 36·치유의 빛 36·빛의 보호막 14·어둠의 저주 159번), 냉기·방어 약화·화상·기절이 걸렸다.
- `pnpm check:content origin/main`: 통과(core@19 `59cb4faab763`, 단계 1·2·4a·4b, 기준 `e9582d1`).

## 검사
- 새·바꾼 시험: sim `magic.test.ts` 9개(새), 팩 `combat.test.ts` 11개(+2). 기존 sim 전투 시험·서버 `combatCatalog.test.ts`(팩 = `TEST_COMBAT_CATALOG`) 그대로 통과.
- `TEST_DATABASE_URL=… pnpm check`: 통과(포맷·린트·타입·경계·크기·다국어·대비·콘텐츠, 시험 파일 325개·시험 2,802개 통과, DB 시험 포함 건너뜀 0). 처음 한 번은 린트 경고 2개(시험 도우미 함수 위치, `unicorn(consistent-function-scoping)`)로 실패해 고친 뒤 다시 돌렸다.
- 그 뒤 걸음 간격 계산을 합 객체 없이 바꿨다(`moveIntervalMs(유닛, 간격)`, perf 커밋): sim 전투 시험 112개 통과, war16 30일 줄·요약이 바꾸기 전과 바이트까지 같음(cmp).
- e2e(`pnpm e2e e2e/balance.spec.ts e2e/cyborg.spec.ts e2e/units.spec.ts`, 빌드 포함 5.4분): 43개 통과·실패 0(밸런스 13·사이보그 17·유닛 13). 밸런스 화면 무기 고르기에 지팡이 여섯이 더해져도 390px ko·en·파스텔·다크에서 가로 넘침·작은 누르는 곳 없음(시험이 봄), 화면에 "core@19". 사이보그·유닛 화면은 유닛이 가진 스킬 이름만 보여서(새 스킬을 가진 시안 유닛 없음) 그대로다. 사진은 저장소 밖(작업용 폴더).

## 함께 바꿔야 하는 파일
- 팩 `skills`에 스킬을 더하면 `shape`를 꼭 적는다(모양 검사가 대상·피해·사거리·반지름·연쇄와 맞춰 본다). 시험 자료 `TEST_COMBAT_CATALOG`(`catalog.ts`·`catalogMagic.ts`)도 같은 값으로.
- `pickSkill`이 `SkillPick | null`을 돌려준다(옛 −1/번호 대신). 부르는 곳은 `battle.ts`뿐이다.
- 보는 쪽(`work/battle-replay`)은 `shape`로 그림을 고르고, `range`·`radius`·`chain`·`castMs`·속성 부품을 크기·색에 쓴다. 전투 상태에 스킬 사건 기록이 없으니 연쇄 차례 등은 사건 기록을 더해야 그릴 수 있다.
- `work/battle-lab` 프리셋: 마법사 = 속성 지팡이(장비 스킬 하나) + 고유 스킬, 치유사 = 빛 지팡이(치유의 빛·빛의 보호막). 밸런스 화면 대결(`runStatDuels`)은 무기만 쓰고 스킬은 쓰지 않는다.

## 건드리지 말 것
- 옛 여섯 스킬의 판정·굴림 차례(시뮬레이터 결과가 같은 근거). 자기·아군 무리 스킬의 대상 조건이 적을 보는 것도 옛 그대로다.
- 팩 ID는 다시 쓰지 않는다(새 ID만 더함).

## 미검증·TODO·알려진 문제
- 질문 260~264 답 기다림(지금은 가). 다른 답이면 `skills.ts`·`effects.ts`와 팩을 고친다.
- 치유사는 보이는 적이 있을 때만 스킬을 쓴다(파티 AI가 "보이는 가장 가까운 적"일 때만 행동, [임시] AI 그대로).
- 등급 4·7·10 추가 효과(D-5036), 덧쉴드, 공격 속도 느리게, 연쇄의 시선 판정은 하지 않았다.
- 콘텐츠 판이 다른 가지와 겹칠 수 있다(core@19). 합치는 쪽이 판을 다시 매긴다.
- PLAN 14장에 260~264를 적지 않았다(다른 가지와 한 줄 충돌을 피함). 기획 답이 오면 미러 동기화 때 적는다.

## 사용자 결정 대기
- 질문 260~264(기획 세션).
