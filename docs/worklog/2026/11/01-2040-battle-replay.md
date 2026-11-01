# 3D 전투 다시보기: 판정을 바꾸지 않는 기록기, 이진 리플레이 형식, 2차맵 엔진 위 보기 화면, 개발자 주소 /dev/battle-replay

- 일시: 2026-11-01 20:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-battle-replay.md`(새, 제안), `docs/adr/2026-10-31-combat-core.md`(전투 코어, "리플레이 굽기·보관"을 미뤘던 것), `docs/adr/2026-11-01-balance-screen.md`(워커·권한 틀). 가지 `work/battle-replay`(main `b8a06f6`에서, 도중에 main `4361533` R5b·core@19 위로 다시 얹음). 함께 가는 줄기: `work/battle-lab`(이 기록기·화면을 끼운다), `work/mage-skills`(스킬 `shape`·`chain` 칸, 아래 "합칠 때")

## 한 일
- PDCA: ADR을 먼저 쓰고 형식·기록기·해석은 시험 먼저(tdd) 썼다.
- 형식(`packages/protocol`, 진입점 `@terra/protocol/battleReplay`): `BattleReplay` 모양 + 이진 부호화 `TCBR` 1판(가변 길이 정수·지그재그·틱 차이·층 연속 길이·자원 사건은 앞 값과의 차이, UTF-8·base64는 전역 없이 `bytes.ts`), 읽기 검사(마법 값·판·잘림·남은 바이트·번호 범위 → `ProtocolError`). 상태 되짚기(`battleReplayState.ts`: 키프레임 + 사건 → 틱 처음 상태)를 형식 옆에 두어 기기 해석과 sim 시험이 같은 뜻을 쓴다.
- 기록기(`packages/sim/src/combat/replay.ts` `recordBattleReplay`): 판정 코어에 읽기 전용 관찰자(`battleTrace.ts`)를 달았다 — `createBattle(init, c, trace?)`, `resolveSkill(…, trace?)`, `tickEffects(…, onTick?)`. 관찰자는 상태를 바꾸지 않고 굴림을 뽑지 않는다. 걸음·효과·시전·쓰러짐·퇴각·시야는 틱마다 차이, 자원은 1초마다 막대에 보이는 만큼(2%) 바뀌었을 때·키프레임 앞·끝에 정확히. 바라보는 쪽은 기록기가 정한다.
  - 크기를 줄인 것: 처음엔 1초마다 모든 자원을 보내 리플레이의 57%가 `vitals`였다(22,150 B) → 2% 문턱 + 차이 부호화로 15,564 B.
- 경기장(`combat/arena.ts`): 2차맵 지형 비용·엄폐·꼭짓점 높이 → 전투맵(ADR 35 "구역 복사"), 창 고르기. 서버 `battleReplay/arena.ts`가 월드 시험 2차맵에서 만들어 판 표지마다 기억한다.
- 시범 6 대 6(`combat/replayDemo.ts`): 앞 줄 전사 2·수호자, 뒤 줄은 팩 속성 지팡이로 편마다 다르게(편 1 화염·번개·사제, 편 2 냉기·어둠·땅) — 스킬 모양 일곱(strike·projectile·area·chain·heal·buff·debuff)이 모두 나온다. 사제를 두 편 모두 두면 10분 시간 초과(시드 1 6,000틱·59 KB)라 한 편에만 둔다.
- 서버(`apps/server/src/battleReplay/`, tRPC `battleReplay.demo`): 권한·D1 조회 제한은 밸런스 화면과 같고, 사용자마다 순간 5·분당 12, 서버 전체 한 번에 하나, 요청마다 워커(`replayWorker.ts` → `dist/battleReplayWorker.js`, 30초). 일반 워커 틀 `jobRunner.ts`(전투 실험실도 쓸 수 있다). 효과 이름은 팩 effects(`names.ts`).
- 엔진: `addLayer`·`requestFrame`·`setUnitLook`·`setView`(`render/engineLayers.ts`), 따로 진입점 `@terra/engine/battle` `BattleFxLayer`(편 색 고리·바라보는 쪽 표·투사체·범위 고리·빛기둥·빔·번쩍임, 묶음 돌려쓰기).
- 보기 화면(`apps/game/src/battle/`): 순수 해석 `replayTimeline.ts`(t → 유닛·효과·숫자·기록·요약, 기준점 50틱 + 바로 앞 계산 이어 쓰기), 시계 `replayClock.ts`, 장면 `battleScene.ts`(엔진 + 효과 층 + HTML 덧층 `battleHud.ts`), 화면 `BattleReplayView.tsx`(위 줄·지도·조작·유닛 줄·시야·기록 판·끝 요약). 개발자 주소 `/dev/battle-replay`(`editor/battleReplayLab/`, 미리 캐시 밖).
- 화면을 찍어 보며 고친 것: 막대·이름이 겹침(폭 40px·막대 가늘게, 이름은 가까이 볼 때·고른 유닛만), 유닛이 너무 작음(처음 보기 26칸 → 10칸), 시야 고르기의 화살표가 글자에 겹침(`.input` 패딩), 끝 요약 표가 0 높이(카드 자식이 줄지 않게), 숫자 겹침(사건마다 옆으로 비킴·더 높이 뜸), 투사체가 안 보임(지름 1.5m), 조작 줄이 두 줄(처음부터를 아이콘 버튼으로).
- `work/mage-skills`(조율자 알림 → 도중에 main `27b25cd`로 합쳐짐): 스킬 모양에 `debuff`, 모양은 `CombatSkill.shape`(`single` = `strike`), 회복 사건에 채운 쉴드(`shieldGain`)·회복 뒤 쉴드, 관찰자 `heal`이 `{ hp, shield }`를 받는다. 그 위로 다시 얹으며 `skills.ts`·`battle.ts`는 main 쪽을 받고 관찰자 호출을 새 코드에 다시 넣었다(연쇄 대상마다 튄 차례로 `skillHit`, 아군 하나·무리의 회복·쉴드 채움에 `heal`).

## 잰 값 (Verified: 개발 컨테이너 Xeon 2.1GHz 4 vCPU 공유, Node 24.22.1, main `27b25cd`(마법 스킬) 위. NAS·휴대폰 값이 아니다)
- 시범 6 대 6 시드 1(팩 core@20, 199.7초 = 1,997틱, 사건 1,678개): 빈 평지 이진 14,964 B, 시험 2차맵 경기장 15,697 B(서버 시험)·15,870 B(e2e 서버의 시험 2차맵), base64 20,932 B, gzip(9) 6,745 B. 같은 내용 JSON은 약 10배(마법 스킬 전 시범: 이진 15,564 B ↔ JSON 160,852 B). 시드 2·3: 12,797 B(1,558틱)·17,224 B(2,694틱).
- 크기를 줄인 것: 처음엔 1초마다 모든 자원을 보내 `vitals`가 바이트의 57%(마법 스킬 전 시범 22,150 B) → 쉴드 2%·MP·스태미나 5% 문턱 + 앞 값과의 차이 부호화. 사제를 두 편 모두 둔 시범은 10분 시간 초과(6,000틱·59,316 B)라 한 편에만 둔다.
- 기록 + 부호화 약 0.5초(서버 시험, 64칸 경기장). 서버 응답(워커 띄우기 포함, 화면 바이트 줄): 420~1,170ms(e2e 서버, 부하에 따라).
- 헤드리스 Chromium 1배속 재생(SwiftShader 소프트웨어 WebGL, 엔진 픽셀 비율 상한 2): 390px(DPR 3) 엔진 한 프레임 p95 3.7~11.6ms·초당 그린 프레임 5~8·그리기 호출 49~51, 1440px(DPR 1) p95 4.3ms·4fps·53회. 초당 프레임은 SwiftShader가 그리기 버퍼(약 0.5~0.9 Mpx)를 CPU로 채우는 데 묶여 있다(엔진 한 프레임 CPU 시간은 작다) — 휴대폰 GPU 값 아님(AGENTS.md 6장).
- 첫 화면 JS(`pnpm check:bundle`, gzip 9): main `27b25cd` 104,259 B → 이 가지 104,423 B(+164 B: 주소 표 한 줄·화면 이름 메시지 하나, 소스 맵 확인), 상한 131,416 B 그대로. 다시보기 화면·해석·효과 층·형식은 개발자 조각 `BattleReplayLabScreen-*.js` 48,323 B(gzip 16,253 B) + CSS 10,306 B에만 든다. 엔진 층(`engineLayers.ts`)은 지도 화면과 같이 쓰는 엔진 조각에 든다.

## 시험
- 단위: protocol 형식 9(전 사건 왕복·base64·평지·마법 값·판·잘림·남은 바이트·번호·틱 차례·방향·바이트 도우미), sim 기록기 7·경기장 3, 서버 8(+ DB 2), 기기 해석 6·시계 4. 기존 sim 전투 시험 103개 그대로 통과(관찰자를 단 뒤에도).
- 판정 그대로임: 시범 6 대 6 시드 1·2·3·7·42와 명령·참전 입력이 있는 전투에서 `recordBattleReplay`의 결과·끝 상태 JSON = `runBattle`(바이트까지). 사건만 적용한 끝 상태 = 판정 끝 상태, 앞 키프레임 + 사건 = 다음 키프레임. SIM_VERSION은 4 그대로.
- e2e: 아래 "검사".

## 검사
- e2e(빌드한 앱·서버, 헤드리스 Chromium, `E2E_MEASURE=1`): `e2e/battle-replay.spec.ts` 11개 통과(4.1분: 기능 1·측정 2·사진 8), `e2e/dev.spec.ts` 12개 통과(49.6초). 사진은 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/battle-replay/shots/`(390·1440 × 파스텔·다크 × 한국어·영어, 싸움 중 2장 + 끝 요약).
- `TEST_DATABASE_URL=postgres://…(PG16 시험 DB) pnpm check`: 통과(main `5c621d3` 위, 시험 파일 339·시험 2,875 모두 통과, 포맷·린트·타입·경계·크기·다국어·디자인 값·콘텐츠 core@20). 그 뒤 쉴드 채움 기록 줄(`battle_log_shield`) 하나를 더해 게임 타입·린트·다국어·포맷·다시보기 시험만 다시 돌렸다(통과).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/battleReplay.ts`·`battleReplayCodec.ts`·`binaryStream.ts`·`bytes.ts`·`battleReplayState.ts`·`battleReplayEntry.ts`·`battleReplayCodec.test.ts`·`package.json` | 리플레이 모양·이진 형식·상태 되짚기·진입점 |
| `packages/sim/src/combat/battleTrace.ts`·`battle.ts`·`skills.ts`·`effects.ts` | 읽기 전용 관찰자(판정 결과 그대로) |
| `packages/sim/src/combat/replay.ts`·`replayDemo.ts`·`arena.ts`·`replay.test.ts`·`arena.test.ts`·`index.ts`·`package.json` | 기록기·시범 6 대 6·경기장, protocol 의존(경계 표가 허용) |
| `packages/shared/src/battleReplay.ts`·`package.json`·`routes.ts`·`routes.test.ts` | 응답 모양·주소 줄 `dev_battle_replay` |
| `apps/server/src/battleReplay/*`·`trpc/battleReplay.ts`·`trpc/router.ts`·`trpc/context.ts`·`trpc/createContext.ts`·`app.ts`·`main.ts`·`vite.config.ts` | 서비스·워커·경기장·라우터·연결·빌드 입력 |
| `packages/engine/src/render/engineLayers.ts`·`secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts`·`index.ts`·`battle/*`·`package.json` | 덧그림 층·유닛 모습·카메라 목표·전투 효과 층 진입점 |
| `apps/game/src/battle/*` | 보기 화면(해석·시계·장면·덧층·문구·CSS·시험) |
| `apps/game/src/editor/battleReplayLab/*`·`shell/routeViews.tsx`·`sections/ComingSoon.tsx`·`editor/DevHome.tsx` | 개발자 주소·개발자 홈 줄 |
| `apps/game/messages/ko.json`·`en.json` | 문구 70개(ko·en 함께) |
| `scripts/pwa-build.mjs`·`pwa-build.test.mjs`·`apps/game/vite.config.ts` | 미리 캐시 밖(`[Bb]attleReplayLab`) |
| `e2e/battle-replay.spec.ts`·`e2e/dev.spec.ts` | 화면 시험·사진·측정, 개발자 홈 일곱 줄 |
| `docs/adr/2026-11-01-battle-replay.md` | 결정 |

## 함께 바꿔야 하는 파일
- 형식을 바꾸면 `BATTLE_REPLAY_FORMAT_VERSION`과 `battleReplayCodec.ts`·`battleReplayState.ts`·`replayTimeline.ts`를 같이. 새 모양은 `REPLAY_SKILL_SHAPES` 끝에 더한다(코드 번호).
- 판정 코어에 새 피해·회복 길을 만들면 관찰자 호출도 넣는다(`trace.skillHit`·`trace.heal`). 빠지면 리플레이 체력은 1초 `vitals`로만 따라간다(시험 "사건만 적용한 끝 상태"가 잡는다).

## 건드리지 말 것
- 관찰자는 상태를 바꾸거나 굴림을 뽑으면 안 된다(판정 결과가 바뀌면 SIM_VERSION·ADR). 시험 "기록해도 판정 결과·끝 상태가 바이트까지 같다"를 지운다면 그 전에 멈춘다.

## 합칠 때 (`work/mage-skills`·`work/battle-lab`)
- mage-skills: `CombatSkill`에 `shape`를 실으면 `skillShape`가 읽는다(지금은 `"shape" in skill`로 본다). 연쇄 대상마다 `trace.skillHit`(튄 차례대로), 쉴드를 채우면 `trace.heal(source, target, { hp, shield }, effect)`. 시범 6 대 6의 마법사는 적 범위 속성 스킬이 팩에 생기면 자동으로 쓴다.
- battle-lab: 서버에서 `recordBattleReplay(init, { coefficients, arena, units, names })` → `encodeBattleReplay` → `replayToBase64`. 기기는 `replayFromBase64` → `decodeBattleReplay` → `loadReplayGround(replay.arena)` → `<BattleReplayView replay ground />`(ground 객체는 바꿀 때만 새로 — 바뀌면 엔진을 다시 만든다). 경기장은 `createArenaSource`, 워커는 `jobRunner.ts`.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기 프레임은 재지 않았다(Unknown). 헤드리스 값은 SwiftShader라 비교용이 아니다.
- 시범 데이터에는 적 범위·연쇄·약화 스킬이 없다(팩에 없음) → 범위 고리·빔·약화 그림은 해석 시험(`replayTimeline.test.ts`)으로만 봤고 화면 사진에는 투사체·시전 고리·회복 빛·쓰러짐이 보인다.
- 시야 고르기(편마다)는 적 유닛·막대만 숨긴다. 숨은 적의 효과·기록 줄은 그대로 보인다(개발자 화면). 플레이어 다시보기(D-6037)는 서버에서 편 시야로 잘라 보내야 한다(보관·공유와 함께, 뒤 단계).
- 유닛 크기(키 2.4m·반지름 0.6m)·이름 표시 기준은 [임시] 표시 값이다.
- `secondMapEngine.ts` 627줄(권장 600줄 넘음, 경고).

## 사용자 결정 대기
- 없음(질문 255~259는 쓰지 않았다).
