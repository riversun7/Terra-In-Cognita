# 국적 바꾸기(귀화)·같은 나라 시야 공유

- 일시: 2026-11-08 13:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-citizenship.md`(새, 제안), 질문 `docs/questions/2026-11-08-citizenship.md`(790~797, 확인 대기), 기획 정리 D-523 포인터(질문 745 나·746 나, `docs/questions/2026-11-08-npc-presence.md`), 가지 `work/citizenship`(시작점 main `3d6ad70`)

## 한 일
- **745 나 귀화(서버 권위)**: 받는 나라 도시의 행정 건물에서, 내 사이보그 본체가 그 도시에 와 있을 때 신청. 받는 나라 = 그 도시 주인(첫 접속 목록과 같은 나라만). 귀화 값(설정 칸 `citizenship_fee` [임시] 100) → 받는 나라 국고, 처음 받은 정착 지원금 전부 → 낸 나라 국고(한 번만 — 기록의 반환 합 0일 때), 쉬는 기간(`citizenship_rest_ms` [임시] 7일, 첫 접속은 세지 않음). 나라·내 도시(= 귀화한 도시)만 바뀌고 유닛·건물·직무·노동 계약·고용한 휴먼은 그대로(주인 = 내 소유 주체). 막는 까닭 차례 same_nation → not_joinable → captive → wrong_city → resting → insufficient_funds, 본 값과 다르면 terms_changed.
  - 한 번의 동기 처리: 원장 거래 `nationality_change`(키 `nationality_change:<사용자>:<시각>`) → 사이보그 행·`faction_members`·기록 한 줄 → `durable()` 뒤 답.
  - 저장: 새 표 `nationality_changes`(추가만, 감사 원본). 부팅이 사용자마다 마지막 시각·반환 합을 사이보그 기록에 얹는다(`cyborg/state.ts`). 마이그레이션 `20261108035507_nationality_changes`(새 표만).
  - 프로토콜 18(최소 17): `nationality_change` → `nationality_result`. 조회 tRPC `world.naturalization`(정부 판과 같은 안개). 설정 칸 2개(세력·사회 계수표 `cyborg.naturalizeFee`·`naturalizeRestMs`, 팩 core@53).
  - 화면: 정부 대화상자에 `NaturalizePanel` 한 칸(내 나라가 아닌 도시만, `GovernmentDialog`에는 가져오기 한 줄·칸 한 줄) — 받는 나라·지금 내 나라·귀화 값·지원금 반환·낼 값(잔고)·쉬는 기간, 그대로인 것 안내, 막는 까닭, [귀화 신청] → 확인 줄 → [귀화 확정], 결과 문구(코드마다), 조건 다시 받기. 문구 ko·en 37개.
- **746 나 같은 나라 시야 공유**: 소유 주체 → 나라(NPC 국가 주체 = 그 나라, 유저 = 사이보그가 든 나라, `world/nationVision.ts`). 남의 유닛·건물을 보는 덮개 = 같은 나라 소유 주체들의 유닛·건물 덮개(2차맵 전체). 나라 덮개는 2차맵·나라마다 시야 틱 하나에 한 번(무리 수와 무관), 소유 주체마다 나라를 한 번 묻는다. 같은 나라 유닛은 경로 전체를 한 번 보내고 경로가 바뀔 때만 다시(3초마다 잘라 보내지 않음, own 표시 없음). 탐사 기록은 내 시야로만(S3-Q2). `sighted`·`sees`도 공유 시야, `canView`에 "같은 나라 유닛·건물이 있음"(내 나라 다른 도시를 들어가 본다). 1분 지표 `visionGroupTicks`·`visionNationCovers`·`visionTickMs`·`visionTickMaxMs`.
- **비용 측정**(`pnpm --filter @terra/server bench:vision`, 새 측정 스크립트, Verified: 개발 컨테이너 Node 24.22.1 — 다른 줄기와 같은 기계라 값이 흔들린다): 나라 덮개는 모든 경우 틱마다 나라 수만큼(4 + 측정 중 시야 타이머 한 번 = 4.1). 60 유닛·5명(도시 둘레, NAS 2차맵 하나 꼴) 틱 평균 0.17ms(끔 0.25)·보낸 바이트 538/틱(끔 1,052), 1,000 유닛·20명 도시 넷 둘레 4.33ms(끔 7.21)·23.6KB(끔 46.0KB), 1,000 유닛·20명 2차맵 전체에 고르게(가장 나쁜 경우) 16.51ms·p95 30.31·최대 59.63(끔 4.95)·299KB(끔 19.6KB). 첫 구현(같은 나라 유닛도 잘라 다시 보냄)은 가장 나쁜 경우 18.37ms·p95 97.71ms였다 → 같은 나라 유닛을 경로 전체로 보내게 고쳤다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/citizenship.ts`(새)·`citizenship.test.ts`(새)·`messages.ts`·`index.ts`·`version.ts` | 국적 바꾸기 메시지, 프로토콜 18(최소 17) |
| `packages/shared/src/citizenship.ts`(새)·`package.json` | 귀화 조건 응답 모양 |
| `packages/sim/src/society/coefficients.ts`·`tuningCyborg.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `citizenship_fee`·`citizenship_rest_ms`(판정 코드는 쓰지 않음), core@53 |
| `apps/server/src/citizenship/`(새: `service.ts`·`gateway.ts`·`attach.ts`·`citizenship.db.test.ts`) | 귀화 판정·저장·게이트웨이·월드 잇기·조회, DB 시험 |
| `apps/server/src/db/citizenshipSchema.ts`(새)·`schema.ts`(내보내기 한 줄), `apps/server/drizzle/20261108035507_nationality_changes/`(새) | 기록 표 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 `nationalityChanges`(추가만, 사이보그 다음) |
| `apps/server/src/cyborg/state.ts`·`service.ts`·`gateway.test.ts`, `apps/server/src/roster/roster.test.ts`·`unitBody.test.ts` | 기록 칸(마지막 바꾼 시각·반환 합), `joinable`·`changeNation`·`naturalizationRules`, 시험 가짜 값 |
| `apps/server/src/session.ts`, `apps/server/src/app.ts` | `nationality_change` 받기(18판), 게이트웨이 잇기 |
| `apps/server/src/worldMap/reads.ts`, `apps/server/src/trpc/world.ts`·`context.ts` | `world.naturalization` 조회, 시야 보는 사람에 나라 |
| `apps/server/src/world/vision.ts`·`nationVision.ts`(새)·`visionShare.test.ts`(새)·`visibility.ts`·`gateway.ts`·`mapStream.ts`·`worldStats.ts`, `apps/server/src/facilities/appSource.ts` | 같은 나라 시야 공유·볼 수 있는 2차맵·지표, 건물 겉모습 아는 칸 |
| `apps/server/bench/visionShare.ts`(새)·`apps/server/package.json` | 시야 공유 비용 측정 `bench:vision` |
| `apps/game/src/government/NaturalizePanel.tsx`(새)·`naturalizeCommands.ts`(새)·`naturalizeData.ts`(새)·`naturalizeData.test.ts`(새)·`naturalize.css`(새)·`GovernmentDialog.tsx`(두 줄) | 귀화 칸 |
| `apps/game/src/map/mapFeed.ts` | 2차맵 흐름이 `nationality_result`를 건너뛴다(한 줄) |
| `apps/game/messages/ko.json`·`en.json` | 문구 37개(ko·en) |
| `e2e/citizenship.spec.ts`(새) | 귀화 칸 화면 시험·사진 |
| `docs/adr/2026-11-08-citizenship.md`(새), `docs/questions/2026-11-08-citizenship.md`(새), `docs/PLAN.md`(14장 한 줄), `AGENTS.md`(명령 한 줄) | 기록 |

## 함께 바꿔야 하는 파일
- 결과 코드를 더하면 `packages/protocol/src/citizenship.ts` `NATIONALITY_RESULT_CODES`, 서버 `citizenship/service.ts`, 화면 `naturalizeData.ts` `NATURALIZE_RESULT_TEXT`·문구(ko·en).
- 조건 칸을 더하면 `@terra/shared/citizenship`·`citizenship/service.ts terms`·`trpc/world.ts`(준비 전 답)·`NaturalizePanel.tsx`.
- 받는 나라 목록을 넓히면(유저 세력·유동 세력, 질문 790) `cyborg/service.ts joinable`(첫 접속 목록과 같은 함수).
- 나라를 정하는 길이 늘면(가문 독립 등) `world/nationVision.ts nationOfOwner` 한 곳.

## 건드리지 말 것
- `nationality_changes`는 추가만 한다(쉬는 날·한 번 반환의 원본 — 고치면 지원금을 두 번 돌려주거나 쉬는 날이 사라진다).
- 시야 공유는 탐사 기록을 건드리지 않는다(S3-Q2). 나라 덮개는 읽기만(여러 무리가 같은 배열을 든다).
- 정부 판 응답(`@terra/shared/government`·`government/reads.ts`)은 고치지 않았다(다른 줄기 npc-leader 몫) — 귀화는 따로 조회한다.

## 검사·시험 (개발 컨테이너, Node 24.22.1, 시험 DB PostgreSQL 16)
- 작업 중: 프로토콜 21파일 114개 통과, sim 설정 칸·콘텐츠 14파일 143개 통과, 서버 DB `citizenship.db.test.ts` 2개 통과, `visionShare.test.ts` 4개 통과, 게임 `government`·`mapFeed` 43개 통과, 서버·게임 타입 검사 통과, 고친 파일 oxlint(`--type-aware --deny-warnings`) 통과.
- 서버 전체(`pnpm vitest run apps/server`, DB 포함): 171파일 1,105개 가운데 1,103 통과·2 실패 — 실패 둘(`facilities/attack.db.test.ts`·`travel/travel.db.test.ts`)은 `createTestDatabase` 훅 30초 시간 초과(다른 줄기와 같은 기계 부하)였고, 따로 다시 돌려 2파일 5개 통과.
- 끝 검사: (아래에 채운다)

## 미검증·TODO·알려진 문제
- 실제 서버(봇 1,000·구독 클라이언트)의 1분 지표로 시야 틱을 재지 않았다(미실행) — 측정은 가짜 2차맵 스크립트다. NAS에 올린 뒤 `visionTickMaxMs`·`visionNationCovers`를 본다.
- 귀화 값은 시험 화폐다(세력 화폐·테라코인 없음, 질문 794).
- 화면 시험은 진짜 귀화 성공을 그리지 않는다(화면 시험 서버의 플레이어는 국가 1 수도에 있고 다른 나라 도시로 갈 길이 시험에 없다) — 칸은 응답을 고쳐 그리고, 명령은 진짜로 보내 서버의 same_nation 문구를 본다. 성공 경로는 서버 DB 시험이 본다.
- 나라 덮개는 시야 틱(1초) 동안 다시 써서 귀화 직후·새 휴먼은 길어야 1초 늦게 보인다.

## 사용자 결정 대기
- 질문 790~797(기획 세션 경유).
