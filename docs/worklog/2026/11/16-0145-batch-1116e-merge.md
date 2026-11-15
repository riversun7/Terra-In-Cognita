# 2026-11-16 묶음 1116e 합치기 (전투 움직임 2단계 D-564·D-568 · 배 3 D-564·D-568)

- 일시: 2026-11-16 01:45 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0027-combat-moves-2`·`16-0030-boats-3`, 기획 D-564·D-568, ADR `2026-11-15-combat-moves.md` "바뀜 (D-564·D-568)"·`2026-11-15-shipyard-harbor.md` "바뀜 (D-564·D-568)"·`2026-11-13-boats.md`·`2026-11-15-sea-combat-routes.md`, 질문 1801~1815(`docs/questions/2026-11-16-combat-moves-2.md`)·1821~1832(`docs/questions/2026-11-16-boats-3.md`)

## 한 일
- 통합 가지(main 6bc4ee7 + 기획 미러 b7b7cff 커밋 5708981)에 줄기 둘을 차례로 `--no-ff`로 합쳤다(두 줄기 모두 바탕 c3cf6a0).
  1. `work/combat-moves-2`(bbcef15) → 634a56a: 점멸 아군 시야·도약 성벽·밀치기 부딪힘 피해·밀림 저항, 피해 방식은 계열과 별개(스킬 `damage`, 무기 칸 `damage`), 무기 곡선 `range_interval`, 설정 칸 9개.
  2. `work/boats-3`(eb3e6ad) → bf85386: 모듈 겹침, 남의 조선소 외주 주문, 보관료 밀림 압류·넘어감, 연료 아이템만(`boat_fuel_price` 지움), 배 단위 채집·배 창고, 명령 `boat_unload`.
- 화면 시험 기대 하나를 고쳤다(63a24a8, 아래 "화면 시험").
- 최종 판: 프로토콜 **43**(받는 가장 낮은 판 **42**), 팩 **core@111**, `SIM_VERSION` **54**(53 설명도 남김), 리플레이 형식 판 그대로(2). 마이그레이션 없음.

## 손으로 푼 곳
- `packages/sim/src/version.ts`(combat-moves-2): 53(건물 채집소, main)과 54(전투 움직임 2단계) 설명을 모두 남기고 값은 54. 54 줄 끝의 자리표시("53은 같은 묶음의 다른 줄기가 쓴다")는 "53은 앞 묶음(1116d)이 썼다"로.
- `packages/protocol/src/version.ts`(boats-3): 39·40·41(main)과 43(배) 설명을 모두 남기고, **42 줄을 새로 적었다** — "메시지 바뀜 없음. 1116e에서 43과 함께 올렸고 42판으로 나간 기기는 없다. 받는 가장 낮은 판을 원칙(현재 − 1)대로 42로 두어 41판 이하 기기는 새 앱을 받는다". 43 줄의 자리표시("39~42판 줄은 같이 합쳐지는 다른 줄기")는 "42판은 바뀜 없음, 위 줄"로. 최소 판 설명 줄은 "43부터 41판 이하"(boats-3 값), `MIN_SUPPORTED_PROTOCOL_VERSION = 42`.
- `content/core/manifest.json`(두 번): 110 → 111.
- `content/core/id-changes.json`(boats-3): main의 `house_found_cost`(since 109) 줄은 그대로 두고 그 뒤에 `boat_fuel_price`(since 111) 줄을 더했다. 이번에 처음 오르는 줄의 since가 이미 111이라 바꾸지 않았다.
- `content/core/tuning.json`(combat-moves-2): 충돌 표시는 끝에 서로 더한 칸끼리 났다 → 칸 id 기준 3방 합치기(바탕 c3cf6a0, 스크립트)로 main 칸 모두 + 새 칸 9개(`moves_knock_*`·`moves_resist_*`·`moves_body_*`)를 끝에. boats-3는 git이 저절로 합쳤고, 같은 스크립트 결과와 칸 집합이 같았다(710칸, Verified). JSON 서식은 원본과 같은 2칸 들여쓰기(왕복 비교로 확인).
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `apps/game/messages/{ko,en}.json`: 충돌 없이 합쳐짐. 키 7,881개 ko·en 일치. 합친 뒤 paraglide를 다시 만들지 않으면 oxlint `import(namespace)`가 새 키 21개에서 실패한다(첫 `pnpm check`가 그랬다) → `paraglide-js compile` 뒤 통과.

## 리셋 필요 여부: 필요 없음
- 마이그레이션 없음: 두 줄기 모두 표·열을 바꾸지 않았고, 합친 뒤 `db:generate`는 "No schema changes"(Verified). 직전 판 앱이 그대로 돈다.
- 전투(combat-moves-2): 진행 중 전투는 저장된 시작 자료를 새 판정으로 다시 셈한다. 지금 팩 자료는 새 칸(무기 `damage`·`curves`, 몸 저항, 이동 부품)을 쓰지 않아 결과가 같다(줄기의 지문 시험, Verified 줄기 기록).
- 배(boats-3): 배 창고는 원장 위치, 압류는 `boat_states.yard_since_ms`로 센다(새 열 없음). 압류는 보관료가 무료 시간 뒤 `shipyard_impound_days`(3)일 넘게 밀려야 하고, 도크 보관(`yard_since_ms`)은 1116b(2026-11-15 21:26 KST 무렵 배포)부터 생겼으므로 배포 직후 압류·넘어갈 배는 없다(Assumed: NAS DB의 도크 배는 보지 않았다).
- 옛 배 연료는 그대로, 다음 보급부터 아이템을 태운다. 옛 승객 화물은 승객이 든 채 그대로(줄기 기록).
- 프로토콜 최소 판이 42가 되어 41판 이하 기기(지금 배포된 앱)는 인사에서 `protocol_unsupported`를 받고 새 앱을 받는다(PWA 강제 적용).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/version.ts`, `packages/protocol/src/version.ts`, `content/core/manifest.json`·`id-changes.json`·`tuning.json`, `docs/WORKLOG.md` | 합치기 충돌 풀기(위) |
| `e2e/skills.spec.ts` | 행동별 소모의 검 지속 칸 기대를 Lv 30 "줄어듦"으로(아래) |
| `docs/worklog/2026/11/16-0145-batch-1116e-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 프로토콜 판(44)은 최소 판 43. 42 줄은 "바뀜 없음"으로 남긴다.
- 파일 크기: `apps/server/src/db/schema.ts` 998줄, `apps/server/src/app.ts` 985줄, `apps/server/src/gather/service.ts` 971줄 — 새 고리는 다른 파일로.
- 메시지 JSON을 합친 뒤에는 paraglide를 다시 만들고 린트한다(`pnpm --filter @terra/game typecheck`가 만든다).
- 고용하는 화면 시험을 여럿 한 번에 돌리면 같은 계정의 구인 카드가 모자란다(1116d 기록) — 이번에는 boats를 따로 돌렸다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 포맷·린트·타입·경계·크기·다국어(7,881키)·디자인 값·콘텐츠 통과, 시험 파일 738/738, 시험 5,569/5,569 통과.
- `pnpm check:content 6bc4ee7`: core@111 (d0e8567a6318) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 6bc4ee7`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,058 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- Verified: 통합 판(63a24a8 빌드)에서 두 번에 나눠 돌림(고용 spec 구인 카드 겹침을 피하려고).
  - skills·battleLab·items·battle-replay·battleReport 한 번에: 101개 중 99 통과·2 건너뜀(battle-replay 측정 시험 2개, `E2E_MEASURE` 없음)·실패 0(8.7분). spec별 통과 skills 13·battleLab 18·items 44·battle-replay 9·battleReport 15.
  - boats 따로: 2/2 통과(4.2분, pastel·dark).
  - 사진: `E2E_SHOTS_DIR`(작업 공간 밖 임시 폴더).
- skills "행동별 소모"의 `test_sword` drains(combat-moves-2 줄기 기록의 실패 1개) — **원인: 화면 시험 기대가 낡음, 앱 회귀 아님, 이번 두 줄기와 무관.**
  - main 0731ac1(2026-11-13, "무기 간격도 (AGI ÷ 적정)² 꼴과 적정 2배 상한")부터 보통 유닛 Lv 30의 검 간격이 상한 250ms까지 줄어 기본 공격 초당 소모 40 > 초당 회복 12가 된다. 화면 지속 칸은 레벨 하나라도 줄어들면 drains다(`StaminaBasis.tsx SustainCell`).
  - 서버 시험 `apps/server/src/contentEdit/staminaBasis.test.ts`는 그때 Lv 30 = `{ costMilli: 10000, intervalMs: 250 }`와 "Lv 30은 스태미나가 막는다(질문 1258)"로 맞췄고 사용자도 1258에 "극공속은 스태미나가 막는 것이 맞다"고 답했다(`12-2323-cyborg-sheet-3` 기록). 두 줄기 모두 이 파일·`staminaBasis.ts`·`StaminaBasis.tsx`를 건드리지 않았다(Verified: `git diff --stat`). main(6bc4ee7)에서 따로 돌리지는 않았다 — 같은 값을 단위 시험이 main에서 통과시키고 있어 그 판단으로 갈랐다.
  - 고침(63a24a8): 기대를 `data-sustain="drains"`, 값 글 "6.9 · 40"(Lv 1 10,000 ÷ 1,443ms, Lv 30 10,000 ÷ 250ms)으로. "drains 0개" 검사는 지웠다. 고친 뒤 통과.

## 미검증·TODO·알려진 문제
- 각 줄기의 TODO는 줄기 기록에 있다: 전투 — 몸 저항을 주는 사양 생성자 없음(1807), 크리쳐 편집기 타고난 무기 피해 방식 칸 없음, 가까이 쏘기 곡선·재능 계열 공격력(1811). 배 — 배를 잃은 옛 주인 알림 없음(1828), 교역 부두 바로 팔기 없음(1823), 지도 유닛 줄에 배 창고 무게 없음.
- 새 배 단추(주문하기·내리기·압류 표시)는 화면 시험 흐름에 들지 않는다(단위 시험만, 줄기 기록).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1801~1815(전투 움직임 2: 부딪힘 피해 기준·방어·막은 유닛·연사, 밀림 저항 방식·스탯·몸, 아군 시야 칸, 도약 시선, 데이터 모양, 재능 계열 공격력, 기본 공격 MP, 건물 피해, 무기 곡선 기본, 달리기 칸).
- 질문 1821~1832(배 3: 배 단위 일꾼 셈, 외주 요금, 교역소 팔기 모양, 배 창고가 찰 때, 배 창고 무게, 압류의 뜻, 배값, 옛 주인 알림, 연료 아이템·넣는 곳·사 넣기, 나포 때 배 창고).
- 모두 추천대로 [임시] 구현했다 — 기획 세션에 보낸다.
