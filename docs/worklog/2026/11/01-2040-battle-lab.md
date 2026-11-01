# 밸런스·전투 실험실(/dev/balance): 팀 A·B 파티 전투, 실험 유닛·프리셋 DB, 한 판·몬테카를로, 가중치 표 탭

- 일시: 2026-11-01 20:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-balance-screen.md` "바뀜 (2026-11-01, 전투 실험실)"(뒤에 더함), 기획 D-414(스탯·전투 시뮬레이터 원문)·D-417·D-450·D-457·D-458·D-465·D-467, 가지 `work/battle-lab`(main b8a06f6에서, 4361533·27b25cd·5c621d3·b9a25a6(전투 다시보기)을 합침), ADR `docs/adr/2026-11-01-battle-replay.md`(판정 관찰자·리플레이). 옛 프로젝트 `AntiGravt01` `mock-battle/page.tsx`·`AdminBattleEngine.js`(읽기만)

## 한 일
- 사용자가 1차만 고르는 1대1 대결 화면을 받지 않아(“엉망이다”) 화면을 다시 만들었다. A·B를 각각 꾸리고, 유닛 스탯·속성 프리셋을 저장(샘플 포함)하고, 파티 대 파티로 싸운다(D-414 원문과 같다).
- PDCA: ADR 바뀜 절을 먼저 쓰고, 서버·sim은 시험 먼저(tdd: 관찰자·사양·전투장·지형·샘플·DB).
- **sim 전투 집계**(`packages/sim/src/combat/observe.ts`): 처음에는 자체 관찰자 고리를 `battle.ts`에 달았으나, main에 판정 관찰자 `BattleTrace`(전투 다시보기 기록기와 같은 고리)가 들어와 그 위에 얹었다(고리 두 벌을 두지 않음). `createBattleTally(units, { logMax, tick })` → `{ trace, report() }`: 유닛마다 준·받은 피해·회복·쓰러뜨림·공격·스킬 수 + 앞 N줄 사건. 피해 = 공격·스킬의 두 몫 합(넘친 피해 포함), 회복 = 오른 HP + 쉴드, 지속 피해 = 그 대상에 지속 피해 효과가 있는 스킬을 마지막으로 맞힌 유닛에게. 지속 피해 관찰자는 쓰러짐 표시 전에 불려(`effects.ts` `tickEffects`) 체력 0 이하도 쓰러짐으로 센다(합친 뒤 시험이 쓰러뜨림 4 ≠ 쓰러진 수 5로 잡아 고침). `runBattle`이 관찰자를 넘겨받는다. `BattleTrace`에 시전 시작·퇴각이 없어 사건 기록에서 두 종류를 뺐다. 관찰자 있음·없음 결과가 바이트까지 같다(시험). SIM_VERSION 그대로.
- **성장률 설정 칸 N5**(`n5_growth_rate`, 100‰): 서버 상수 `GROWTH_PM`이던 것을 팩 tuning·계수표 `cyborg.growthPm`으로. 유닛·사이보그 화면과 실험실이 D1 실효 값을 읽는다(값 그대로라 결과 같음). 팩 core@20(main core@19 위).
- **서버 `apps/server/src/battleLab/`**
  - `build.ts`: 실험 유닛 → 전투 사양·미리 보기. 성장(`primaryAtLevel`, N5)·장비(`loadoutOf`, 직접 값은 가상 칸 둘로 같은 묶음 검사)·2차(`explainSecondary`)·사양(`specFromStats`)·스킬(`skillFromData`, 스킬마다 등급, 칸 수 안). 맨손·적정치(기본 공격·물리 스킬·속성 스킬의 출처 = 든 무기/맨손, 명중·크리·행동 속도 점수 ÷ 적정 비율 — 비율 상한은 계수표 N10)를 미리 보기에 보인다. 팩에 없는 참조·맞지 않는 칸은 빼고 `dropped`.
  - `arena.ts`: 팀 A(ID 1~) 대 B(101~), 진형 전열·중열·후열(가운데에서 4·7·10칸), 막힌 칸이면 가장 가까운 빈칸. 한 판 = 사건 기록(앞 400줄) + 유닛 요약, 몬테카를로 = 짝수 판 A 서쪽·홀수 판 동쪽, 팀 승률·편별 승률·시간 초과·평균·중앙 시간·유닛 평균. 시간 초과는 남은 몫 판정(D-467 229).
  - `terrain.ts`·`worldTerrains.ts`: 빈 평지 + S1 시험 2차맵(지형 서비스 없으면 S1 임시 지형) + 시험 자리 종류 여섯(지형 서비스가 있을 때). 256² 배치 칸에서 통과 몫이 가장 큰 48칸 창.
  - `presets.ts`·`samples.ts`·`schema.ts`·`services.ts`, tRPC `battleLab.*`(D1 권한 두 겹·속도 제한): catalog·preview·presets·savePreset·deletePreset·battle·monteCarlo·replay. 쓰기는 `tuning:write`.
  - `replay`(3D 관람): 한 판과 같은 입력·검사·바쁨·속도 제한으로 같은 일을 `recordBattleReplay`로 기록해 base64로 돌려준다. 경기장 표지(`ReplayArenaRef`)는 자른 2차맵 창의 원점(빈 평지는 null → 보기 화면이 맨땅), 이름표는 유닛 표시 이름(없으면 A1·B3)·종류, 스킬·효과 이름은 팩에서. 같은 시드면 [한 판]과 같은 전투다(DB 시험이 끝 시각을 맞춰 본다).
  - 무거운 일은 밸런스 대결과 같은 워커 진입 파일(`balance/duelWorker.ts` → `jobs.ts` 일 종류 넷)과 같은 바쁨 표시(`balance/gate.ts`, 서버 전체 하나). 실험실 전투 사용자 속도 제한 순간 4·분당 8.
- **프리셋 DB**: 표 `battle_lab_presets`(종류 unit·party, 이름 ko·en 1~40자, jsonb 값, 줄 판, 만든·바꾼 사람), 감사 기록 `battle_lab_preset.save`·`delete`(바꾸기와 한 트랜잭션). 마이그레이션 `20261101113211_battle_lab_presets`(표 하나 추가만, main의 gardener 다음에 다시 만듦). 표 정의는 `db/devToolsSchema.ts`(schema.ts가 1,000줄 상한에 닿아 나눔, schema.ts가 다시 내보냄 — drizzle-kit "No schema changes" 확인).
- **샘플(코드, 읽기 전용, 수치 [임시])**: D-490(기본 무기·장비 + 무기 칸에 맞는 스킬 1~2개)대로 — 새 사이보그(시험 칼·조끼·강타), Lv 30 전사(시험 칼·투구·조끼·반지·강타·충격 강타), Lv 30 탱커(사이보그·시험 칼·투구·조끼·인공 심장·충격 강타·철피), Lv 30 마법사(불)(화염 지팡이·조끼·반지·불꽃 화살 등급 2·화염 폭발), Lv 30 치유사(빛 지팡이·투구·조끼·빛의 치유 등급 2·빛의 수호), 늑대·골렘(크리쳐: 타고난 발톱·반지·강타 / 충격 강타·철피), 파티 셋(Lv 30 혼성·크리쳐 무리·새 사이보그 넷). 마법 스킬·속성 지팡이는 main 27b25cd(core@20). [유닛 더하기] 기본값과 가중치 표 기준 유닛도 기본 무기를 든다.
- **화면**(`apps/game/src/editor/balance/`): 이름 "밸런스·전투 실험실", 탭 [전투 실험실](기본)·[가중치 표](지금 화면을 `WeightTab.tsx`로). 실험실 = 팀 판 둘(파티 프리셋 막대·유닛 줄·진형·차례·빼기·더하기·퇴각 기준), 유닛 편집(유닛 프리셋 막대·기본·1차 + K·속성(계열 합·생성 규칙 칩)·무기(타고난·팩·직접 값)·장비 칸·장비 직접 값·스킬), 미리 보기(1차 출처·2차 풀이·전투 사양·공격·적정치·레벨 선 그림·레벨 표), 전투장(지형·제한·판 수·시드, [3D 관람], [한 판], [몬테카를로]). [3D 관람]은 리플레이 → 경기장 지형(`loadReplayGround`) → 화면 전체 `<dialog>` 안 `BattleReplayView`(지연 조각, Esc·[닫기], 닫으면 단추로 초점). 가중치 표의 기준 유닛을 팀 A 유닛·유닛 프리셋에서 불러온다. 팀은 이 기기에 남긴다(localStorage, 읽기·쓰기 실패는 조용히). 문구 ko·en 225개(새 키).
- 검토: `web-design-guidelines`(펼침 표시·hover·첫 열 머리 정렬·빈 결과 안내를 고침), `break-ui`(아래 "나쁜 값" 화면 시험: 6 대 6·이름 40자·Lv 999·1차 10,000·K 10,000·속성 모두 10·스킬 칸 넘침·큰 직접 값 무기 — 가로 넘침·작은 누르는 곳 없음).

## 잰 값 (Verified: 개발 컨테이너 Xeon 2.1GHz 4 vCPU 공유, Node 24.22.1, 실제 팩·샘플 프리셋, 저장소 밖 스크립트. NAS 값 아님)
| 일 | 워커(띄우기 포함) | 같은 스레드 |
|---|---|---|
| 한 판, Lv 30 혼성 4 대 크리쳐 4, 120초(42초에 끝남) | 0.7초 | 0.08~0.16초 |
| 한 판, 새 사이보그 6 대 6, 600초(시간 초과) | 1.0초 | 0.7초 |
| 몬테카를로 20판, Lv 30 혼성 4 대 크리쳐 4, 120초 | 2.4초 | 1.5초 |
| 몬테카를로 20판, 새 사이보그 6 대 6, 600초(상한 12,000초, 모두 시간 초과) | 16.2초 | 13.9초 |
| 몬테카를로 200판, 전사 6 대 탱커 6, 60초(상한, 모두 시간 초과) | 15.0초 | 14.3초 |
- 한 판 비용은 대략 (유닛 수 × 전투 초)에 비례한다(12명 600초 ≈ 1초). 상한(판 수 × 제한 ≤ 12,000초) 최악이 이 컨테이너 약 16초, 워커 제한 시간 120초는 그 약 일곱 배(NAS Unknown).
- 첫 측정(같은 스레드, main 합치기 전): 마법사 6 대 치유사 6 300초 20판 3.3초(평균 97초에 끝남), 시험 2차맵 지형 4 대 4 20판 1.3초.

## 시험
- 단위(DB 포함 서버 시험): sim 집계 3개(바이트 같음·편마다 준 피해 합 = 상대 편 받은 피해 합·쓰러뜨림 = 쓰러진 수·쓰러진 유닛은 받은 피해 − 받은 회복 ≥ 최대 HP·사건 상한), 실험실 사양 8개, 전투장 5개, 지형 3개, 샘플 4개(D-490 규칙 포함), DB 통합 4개(권한·N5 덮어쓰기·프리셋 만들기/이름/복제/지우기/충돌/샘플 읽기 전용/맞지 않는 줄/감사 기록·한 판·몬테카를로·지형·리플레이 끝 시각 = 한 판 끝 시각), 화면 순수 코드 7개.
- 화면 시험(`TEST_DATABASE_URL=… pnpm e2e e2e/battleLab.spec.ts e2e/balance.spec.ts`, main 4361533 위): 27개 통과(5.1분 + 나쁜 값 둘 다시 0.3분). 첫 실행에서 가중치 표 배치 시험 8개가 새로 고친 뒤 탭을 다시 열지 않아 실패 → 시험 고침, 나쁜 값 시험 둘은 없는 제한 시간(30초)을 골라 실패 → 60초로 고침
- 전투 다시보기를 합친 뒤(3D 관람 연결) `pnpm e2e e2e/battleLab.spec.ts e2e/balance.spec.ts`: 27개 통과(3.8분, 개발자 흐름에 [3D 관람] 열기·닫기·초점 복귀 포함), 3D 관람 창 배치 시험 4개(파스텔·다크 × 390·1440, 언어 섞음) 통과(0.6분)
- 전투 다시보기를 합친 뒤 `pnpm e2e e2e/battle-replay.spec.ts e2e/dev.spec.ts`(합치며 바뀐 개발자 홈·경로·다시보기 화면): 21개 통과·2개 건너뜀(측정 시험), 6.1분
- 전투 다시보기를 합친 뒤 `TEST_DATABASE_URL=… pnpm check`: 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 파일 346개·시험 2,909개 가운데 2,908개 통과. 1개(`packages/planet/src/secondMap/seams.test.ts` 강 이음매, 이 줄기와 무관)가 다른 작업 부하(load 14, 4 vCPU)로 30초 제한을 넘겼고 따로 돌리면 통과(27.9초)
- 전체 `pnpm e2e`(가지 37765e4 = main 5c621d3 합친 뒤, D-490 반영 뒤): 241개 통과·1개 건너뜀(조건부 시험), 34.9분. 실험실·가중치 표 시험 29개 포함
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 통과(시험 파일 339개·시험 2,871개, DB 포함, main 27b25cd를 합친 뒤·D-490 반영 뒤). 파일 크기 권장(600줄)을 넘던 내 파일 둘(공용 모양·CSS)은 나눴다
- `pnpm check:bundle`: 첫 화면 JS 104,367 B → 다시보기 합친 뒤 104,574 B / 상한 131,416 B(실험실은 BalancePanelScreen 지연 조각, 미리 캐시 밖 — 빌드의 미리 캐시 검사 통과).
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/battle-lab/shots/` — battle-lab-{pastel,dark}-{ko,en}-{390,1440}.png, battle-lab-worst-{ko,en}-390.png, battle-lab-watch-{pastel-ko-390,dark-en-390,pastel-en-1440,dark-ko-1440}.png, balance-*.png.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/observe.ts`·`observe.test.ts`·`battle.ts`·`index.ts` | 판정 관찰자 위 집계(사건·유닛 통계), `runBattle` 관찰자 인자, `staminaCostMilli`·`staminaScore` 내보내기 |
| `packages/sim/src/society/coefficients.ts`·`tuningCyborg.ts`, `content/core/tuning.json`·`manifest.json` | 성장률 칸 N5, core@20 |
| `apps/server/src/roster/body.ts` | 성장률을 실효 값에서 |
| `packages/shared/src/battleLab.ts`·`package.json` | 실험실 공용 모양·상한·검사 |
| `apps/server/src/battleLab/*` | 사양·미리 보기·전투장·지형·샘플·프리셋·서비스와 시험(DB 포함) |
| `apps/server/src/balance/jobs.ts`·`gate.ts`·`runner.ts`·`duelWorker.ts`·`services.ts` | 워커 일 종류 셋, 서버 전체 바쁨 표시 공유 |
| `apps/server/src/trpc/battleLab.ts`·`router.ts`·`context.ts`·`createContext.ts`, `app.ts`·`main.ts`, `world/combatCatalog.ts` | tRPC·연결·유닛 종류 이름 |
| `apps/server/src/db/devToolsSchema.ts`·`schema.ts`, `drizzle/20261101113211_battle_lab_presets/` | 프리셋 표 |
| `apps/game/src/editor/balance/BalancePanelScreen.tsx`·`WeightTab.tsx`·`lab/*` | 탭 화면·실험실, `lab/ReplayOverlay.tsx` 3D 관람 창 |
| `apps/game/src/editor/DevHome.tsx`, `apps/game/messages/ko.json`·`en.json` | 이름·설명·문구 |
| `e2e/balance.spec.ts`·`e2e/battleLab.spec.ts` | 탭 구조, 실험실 흐름·권한·배치·나쁜 값 |
| `docs/adr/2026-11-01-balance-screen.md`·`docs/PLAN.md` | 바뀜·요약 |

## 함께 바꿔야 하는 파일
- 실험 유닛 모양(`LabUnit`)을 바꾸면 `apps/server/src/battleLab/schema.ts`(입력·DB 읽기)와 `samples.ts`, 화면 `labModel.ts` `isLabUnitShape`. 옛 DB 줄은 맞지 않으면 목록에서 빠지고 센다(지우지 않음).
- 무거운 일 종류를 더하면 `balance/jobs.ts`와 그 결과를 받는 서비스. 워커 빌드 입력(`dist/balanceWorker.js`)은 그대로다.
- 리플레이 형식·보기 화면(`@terra/protocol/battleReplay`, `apps/game/src/battle/BattleReplayView.tsx`)의 속성이 바뀌면 `lab/ReplayOverlay.tsx`·`BattleLab.tsx` `runWatch`와 서버 `battleLab/services.ts` `replay`.
- `BattleTrace`에 고리를 더하면(시전 시작·퇴각 등) `observe.ts` 집계와 서버 `arena.ts` `eventOf`, 화면 `LabResults.tsx` 사건 문구.

## 건드리지 말 것
- 팀 프리셋 ID 앞머리 `lab_`(DB 검사)·샘플 `sample_`(읽기 전용 판정). 올라간 마이그레이션.
- sim 관찰자는 상태·굴림을 바꾸면 안 된다(시험이 바이트 같음을 본다).
- `/dev/skills`(스킬 편집기·행동별 스태미나·MP, `work/skill-editor`)와 계산식 편집(`work/formulas`)은 다른 줄기다.

## 미검증·TODO·알려진 문제
- [임시] 수치 때문에 새 사이보그끼리·전사 대 탱커는 제한 시간 안에 거의 끝나지 않는다(스태미나에 묶임, `work/balance2` 진단과 같은 까닭). 실험실은 남은 몫 판정으로 결과를 낸다. 수치는 2차 스탯 기준 결정(질문 265~274) 뒤에 맞춘다.
- 3D 관람의 서버 시간은 따로 재지 않았다(Unknown). 화면 시험에서 단추 → 보기 화면 준비가 페이지 읽기 포함 시험 하나 5~10초(헤드리스)였다.
- 실험실 사건 기록에 시전 시작·퇴각 줄이 없다(판정 관찰자에 그 고리가 없음). 3D 관람의 기록 판에는 있다.
- D-490 "맨손은 맨손 스킬만, 스킬은 그 칸이 있는 무기를 들어야" 규칙은 `work/skill-editor`가 만든다(아직 main 밖). 사람형 샘플은 그 규칙에 맞게 골랐지만, 크리쳐 샘플(타고난 발톱 + 강타·충격 강타·철피)은 그 가지가 어느 스킬에 맨손 표지를 다는지에 따라 스킬이 막힐 수 있다. 합친 뒤 `samples.test.ts`의 D-490 시험에 맨손 표지 검사를 더한다.
- 가중치 표(옛 대결 도구)는 기본 무기만 든다(장비·스킬은 그 대결 모양에 없다). 그 탭은 `work/formulas`의 계산식 탭으로 바뀔 예정이라 더 손대지 않았다.
- 사건 기록의 버프 스킬(함성 등)은 HP 변화가 없어 "피해·회복 없음"으로 보인다(효과 이름은 아직 사건에 없음).
- 지속 회복 효과의 시전자는 세지 않는다(받은 회복으로만). 팩에 지속 회복 스킬이 아직 없다.
- 탭 상태는 주소에 남기지 않는다(앱 라우터가 해시를 다루지 않아 건드리지 않음). 설정 칸 패널의 "가중치 표 바뀐 칸" 고리는 실험실 탭으로 연다.
- NAS에서 몬테카를로 비용을 재지 않았다(Unknown). 상한(판 수 × 제한 ≤ 12,000초)은 이 컨테이너 값으로 정했다.

## 사용자 결정 대기
- 없음(질문 250~254는 쓰지 않았다).
