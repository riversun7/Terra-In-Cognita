# 전투 움직임 판정 토대(1단계): 달리기·이동 부품·은신·계수 곡선·리플레이 사건

- 일시: 2026-11-15 10:35 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-combat-moves.md`(제안), 기획 **D-557**(기획 커밋 4eba6f2 — 이 줄기를 쓸 때 `docs/design` 미러에 아직 없음, 미러 뒤 어긋나면 D-557이 이긴다), 질문 `docs/questions/2026-11-15-combat-moves.md` 1581~1600, 줄기 `work/combat-moves`(기준 `24f91102f1`)

## 한 일
- 사용자 요청 "시작 (판정 토대부터)" — 전투 개편 1단계만(`packages/sim` 판정). 수치는 모두 설정 칸 `moves_*`(19칸, [임시], 49에 칸 없음).
- 달리기: 유닛 상태 `running`(켜졌을 때만), 걷기 간격 × 600‰, 초당 스태미나 15(STA 배율), 모자라면 꺼짐·3초 몫 차야 다시. 켜는 곳 = 대기 명령 `run` 칸(sim 입력)과 AI 고리 `wantsRun`. 걷기는 그대로 무료.
- 이동 부품(스킬 칸 `move`): 돌진(곧은 줄, 막히면 멈춤, 끝에서 hitRange 안이면 붙음)·도약(길 무시, 건물은 못 넘음)·점멸(자기 시야·시선 안, toward/away)·뒷걸음·은신(적 편 시야에서 빠짐, 공격·들킴으로 깨짐)·감지. 대상 옮김(`displace`): 밀치기·끌어오기·묶기(`move_root` 상태이상).
- 곡선(`combat/curves.ts`, 스킬 칸 `curves`·`shots`): 사거리 ↔ 간격 예산, 마법 거리, 마법 대상 수, 지속 피해 합, 연사(발마다 따로 굴림), 가까이 쏘기. 고른 스킬만 걸린다. 계열 사이 고정 상성 고리는 넣지 않았다(통합 담당 전달 — D-557의 "상성 고리"는 해석, D-181).
- AI 고리 `combat/moveAi.ts`: `wantsRun`·`moveSkillAllowed`(지금 늘 참)·`STEALTH_BREAKS_ON_DAMAGE`(거짓). 4단계가 몸통을 바꾼다.
- 리플레이 형식 2(`@terra/protocol`): 사건 `motion`(dash·leap·blink·backstep·knockback·pull)·`stealth`(까닭 넷)·`run`·`multishot`, 스킬 모양 `move`, 키프레임 은신·달리기 표지(상태 바이트 비트). 읽기는 1·2 둘 다. **WebSocket PROTOCOL_VERSION은 그대로**(리플레이는 WS 메시지가 아니다).
- 팩 스킬 항목 선택 칸 `move`·`displace`·`curves`·`shots` + 모양 `move` + 검사(`checkSkillMoves`). `@terra/shared` 스킬 JSON 모양에도 칸. 스킬 편집기 모양 고르기에 "움직임만"(ko·en).
- 게임 앱 보기 화면: 움직임 사건을 자리표시로(돌진 등 한 틱 미끄러짐·지나간 줄, 점멸 바로 옮김·번쩍임 둘, 밀치기 약화 번쩍임, 은신 시작·끝 빛, 우리 은신 유닛은 흐린 색). 연사·달리기는 그림 없이 넘긴다.
- 판: SIM_VERSION 46, 팩 core@99. 프로토콜(WS) 판은 쓰지 않음.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/curves.ts`(새) | 곡선 함수·움직임 계수 모양·출발값 |
| `packages/sim/src/combat/moveParts.ts`(새) | 이동 부품 자료 모양 |
| `packages/sim/src/combat/moves.ts`(새) | 이동 부품·달리기·은신 판정 |
| `packages/sim/src/combat/moveAi.ts`(새) | AI 고리 자리 |
| `packages/sim/src/combat/battle.ts` | 달리기 간격·소모, 은신 깨기(공격·들킴), 이동 부품 스킬 풀기, 틱 점유 격자 |
| `packages/sim/src/combat/skills.ts` | 스킬 자료·전투 스킬 칸, 곡선·연사·onHit, 사거리 예산, 지속 피해 곡선, AI 고리 |
| `packages/sim/src/combat/battleTypes.ts`·`battleTrace.ts`·`sight.ts`·`coefficients.ts`·`packCatalog.ts`·`replay.ts` | 상태 칸·관찰자 선택 칸·은신 시야·계수표 `moves`·팩 칸 싣기·리플레이 사건 |
| `packages/sim/src/tuningMoves.ts`(새)·`tuning.ts`·`version.ts` | 설정 칸 19개, SIM 46 |
| `packages/protocol/src/battleReplay*.ts` | 형식 2 사건·표지·부호화·되짚기 |
| `packages/content/src/schema/combat.ts`·`index.ts` | 스킬 칸·모양 move·검사 |
| `packages/shared/src/skillEditor.ts` | 스킬 JSON 모양 칸·모양 move |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 `moves_*` 19개(뒤에 더함), core@99 |
| `apps/game/src/battle/replayTimeline.ts`·`replayTypes.ts`·`battleScene.ts` | 움직임 사건 자리표시·은신 표지 |
| `apps/game/src/editor/skills/skillMessages.ts`·`messages/{ko,en}.json` | 모양 move 문구 |
| 시험 `moves.test.ts`(새)·`testMovesBaseline.ts`(새)·`magic.test.ts`·`battleReplayCodec.test.ts`·`validate/combat.test.ts`·`replayTimeline.test.ts` | 아래 검사 |

## 검사(Verified = 실행함)
- Verified: 새 부품 없는 전투의 지문이 기준 커밋과 같다 — 시범 6 대 6(시드 1·7·42) 끝 상태 + 리플레이(시드 3) 사건 지문(`testMovesBaseline.ts`, 바꾸기 전 코드에서 뜬 값), 파티·군단 명령 줄기의 옛 지문 시험(`orders.test.ts`)도 그대로 통과.
- Verified: `moves.test.ts` 24개(곡선 값·곧은 줄·돌진/막힘·도약/성벽·점멸 시야/away·뒷걸음·밀치기/끌어오기/묶기·은신 들킴/공격·NPC 편 같은 판정·달리기 빠르기/소모/지침/명령 끝·결정성 시드 셋·스냅숏 다시 켜기·리플레이 끝 상태·사건 되짚기 자리·은신 표지·부호화 왕복). sim 전투·설정 칸 시험 묶음 통과.
- Verified: 프로토콜 리플레이 시험 11개(모든 사건 종류를 시험 자료가 씀, 형식 1 읽기), 팩 검사 시험 17개, 게임 앱 `src/battle` 시험 통과, 게임 앱 typecheck, `pnpm check:content --no-compat`.
- 전체 `pnpm check`·빌드·check-pwa·check:bundle·전투 보고서 e2e 결과는 아래 "마지막 검사"에 적는다.

## 함께 바꿔야 하는 파일
- 스킬 모양을 더하면 `@terra/content` SKILL_SHAPES·`@terra/shared` SKILL_SHAPE_IDS·sim `SkillShape`·프로토콜 REPLAY_SKILL_SHAPES(끝에)·스킬 편집기 문구를 함께.
- 리플레이 사건을 더하면 REPLAY_EVENT_KINDS 끝에 + 코덱 + `applyReplayEvent` + 코덱 시험 자료(모든 종류 시험이 막는다).
- 곡선 이름은 `curves.ts SKILL_CURVES`와 `@terra/content SKILL_CURVE_IDS`가 같아야 한다.

## 건드리지 말 것
- `apps/server/src/app.ts`(999줄) — 손대지 않았다.
- 상태 칸은 켜졌을 때만 둔다(`running`·`stealthUntilMs`·`detect*`, 스킬 `move`·`displace`·`curves`·`shots`). 늘 두면 옛 전투 스냅숏·지문이 바뀐다.

## 미검증·TODO·알려진 문제
- 움직임 부품으로 옮긴 틱의 걸음 몫은 리플레이에서 따로 그리지 않는다(그 틱 처음 자리 → 움직임 시작 자리가 바로 바뀐다).
- 기본 AI는 이동 스킬을 목록 차례로 쓴다(질문 1598) — 팩에는 이동 스킬을 넣지 않았다.
- 프로토콜 대기 명령에 `run` 칸이 없다(WP-5). 스킬 편집기에 이동 부품 입력 칸이 없다(WP-6, 항목은 통째 저장이라 칸은 잃지 않음 — Assumed: 편집기가 초안을 펼쳐 복사함, 코드로 확인).
- 행동별 소모 표의 "회피 기동(미구현)" 줄은 그대로다(달리기 소모는 설정 칸).
- 뒤 작업: WP-2 절차적 움직임, WP-3 스킬 생성기, WP-4 AI 슬라이더, WP-5 스킬 명령·run 프로토콜, WP-6 편집기 칸, WP-7 무기 곡선, WP-8 실시간 전송, WP-9 밀치기 저항(ADR "뒤 작업").

## 리셋 필요 여부
- **세계 새로 시작 필요 없음.** DB 표·마이그레이션을 바꾸지 않았다. 지금 팩 스킬은 새 칸을 쓰지 않아 진행 중·다음 전투 결과가 그대로다(지문 시험). 설정 칸 19개는 팩에 더한 것이라 켤 때 그대로 든다.

## 사용자 결정 대기
- 질문 1581~1600(달리기 켜는 주체·은신 깨짐·점멸 시야·도약 범위·곡선 값·곡선 자동 여부·AI 기본값·스킬 명령 칸 등).
