# NPC 지도자 창구·이름표·정부 판 하루 값 (WP-NPC3)

- 일시: 2026-11-08 14:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP-NPC3 (2026-11-08) 지도자 창구·이름표·정부 판 하루 값", 질문 `docs/questions/2026-11-08-npc-leader.md`(780~783, 확인 대기), 앞 줄기 "WP-NPC"(질문 742·743·747·748), 기획 정리 D-523 포인터(질문 720~763 모두 기술 추천), 가지 `work/npc-leader`(시작점 main `3d6ad70`)

## 한 일
- **748 나 — 지도자 이름표**: 유닛 전송(`unitMotionSchema`)에 표시 종류 칸 `kind`(선택, 지금 값 `npc_leader`)를 더했다 — 프로토콜 18, 최소 17. 서버는 종류 7(지도자) 유닛의 움직임에만 칸을 붙이고(`wireKindOf`·`motionToWire`), 시야 전송의 자른 경로에도 남기고, `setKind`가 표시 종류를 바꾸면 같은 움직임을 다시 보낸다. 17판 기기는 모르는 칸을 버린다(zod object, 시험으로 확인). 화면은 자료 흐름의 `unitKinds()`로 지도자를 찾아 머리 위에 왕관 꼴 표시 + 이름(한눈 정보로 한 번 받음) 이름표를 늘 놓는다(`map/leaderTags.ts`). 표시는 `pointer-events: none`, 누르기는 덧그림 층 `tap()`(채집 덧그림보다 먼저), 키보드는 단추.
- **742 나 — 지도자 = 정부 창구**: 지도자 유닛이나 이름표를 누르면 그 지도자를 고르고 아래 지도자 판(`government/LeaderSheet.tsx`) → [지도자와 이야기] → 그 나라 수도 정부 판(대화상자 `via="leader"`, 머리 = 지도자 이름·나라 `LeaderHead.tsx`). 서버 새 조회 `world.leaderGovernment({mapKey, unitId})` = 지도자가 지금 내 시야 안이면(한눈 정보와 같은 규칙) 수도 행정 건물의 `world.government`와 같은 답, 아니면 `unknown_unit`(시야 밖·지도자 아님·없는 유닛을 나누지 않음).
- **창구 자리**: 정부 대화상자(행정 건물·지도자 모두)에 외교(→ 세력 화면)·의뢰(아직 없음 → 처리할 일)·국적 상담(`CitizenshipSlot.tsx` — "준비 중", citizenship 줄기가 귀화 신청을 넣는 자리). 새 규칙 없음.
- **743 나 — 정부 판 하루 값**: `GovernmentCity.day` = 만족도(그 도시 휴먼 `satisfactionMilli` 평균 ÷ 1000)·발전도(거울 도시 `development`)·오늘 생필품 충족 ‰(도시 경제 `foodPmOf`, 오늘 낼 몫이 아직 없으면 null) — 서버 메모리 값을 읽기만(`government/cityDay.ts`). 화면 "도시 하루 값" 세 줄 + 언제 셈하는지 한 줄(`GovernmentDay.tsx`), 값이 없으면 "—".
- **747 나 — 대표 유닛 따로**: 팩 `leaderName`은 지도자만. 대표 유닛 목록 칸은 D-398 콘텐츠가 생길 때 — 스키마 주석 TODO만, 팩 판 그대로. 이름은 [임시] 그대로.
- **질문**: 780(이름표 보이기)·781(생필품 어느 날 값)·782(창구 외교·의뢰)·783(남의 나라 지도자 판).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/secondMap.ts`·`index.ts`·`version.ts`·`secondMap.test.ts` | 표시 종류 칸 `kind`, `UNIT_WIRE_KINDS`·`UNIT_KIND_PROTOCOL_VERSION`, 프로토콜 18·최소 17, 스키마 시험(17판 정의로 읽기 포함) |
| `apps/server/src/world/unitKinds.ts`·`wire.ts`·`wire.test.ts` | 종류 7 → `npc_leader`(`wireKindOf`), 전송 항목에 종류 칸 |
| `apps/server/src/world/secondMap.ts`·`secondMap.test.ts` | 유닛 만들 때·움직임 바뀔 때 종류, `setKind`가 표시 종류를 바꾸면 다시 보냄(가져오기 한 줄·`setKind` 두 줄) |
| `apps/server/src/world/vision.ts`·`gateway.test.ts` | 시야 전송 자른 경로도 종류를 남김(한 줄), 시야 안 지도자 스냅샷·자른 경로 시험 |
| `apps/server/src/government/cityDay.ts`(새)·`reads.ts`·`reads.test.ts` | 도시 하루 값, 지도자 창구 `governmentOfLeader`(수도 행정 건물 찾기) |
| `apps/server/src/worldMap/reads.ts`, `trpc/world.ts`·`context.ts` | 지도자가 보이는지(한눈 정보와 같은 규칙) 넘기기, `world.leaderGovernment` |
| `apps/server/src/npc/leaders.db.test.ts` | DB 세계에서 하루 값·지도자 창구 = 수도 정부 판 |
| `packages/shared/src/government.ts` | `GovernmentCityDay`·`city.day`, 상태 `unknown_unit` |
| `packages/content/src/schema/economy.ts` | `leaderName` 주석: 대표 유닛은 따로(747 나, TODO) |
| `apps/game/src/map/feedTypes.ts`·`mapFeed.ts`·`mapFeed.test.ts` | 자료 흐름 `unitKinds()`(스냅샷·바뀐 움직임·사라짐을 따라감) |
| `apps/game/src/map/leaderTags.ts`(새)·`leaderTags.css`(새)·`leaderTags.test.ts`(새) | 지도자 이름표 덧그림·상태·누르기 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 이름표 붙이기(채집 덧그림 전), 지도에서 고르기 함수 하나로, 지도자 판 한 줄 |
| `apps/game/src/government/LeaderSheet.tsx`·`LeaderHead.tsx`·`GovernmentDay.tsx`·`GovernmentDesk.tsx`·`CitizenshipSlot.tsx`(모두 새) | 지도자 판·지도자 머리·하루 값·창구·국적 상담 자리 |
| `apps/game/src/government/GovernmentDialog.tsx`·`governmentData.ts`·`governmentData.test.ts`·`government.css` | `via="leader"`, 하루 값·창구 블록, `loadLeaderGovernment`·하루 값 글, 모양 |
| `apps/game/messages/ko.json`·`en.json` | 문구 19개(ko·en) |
| `e2e/government.spec.ts` | 하루 값 줄, 지도자 이름표 → 지도자 판 → 지도자 정부 판 → 외교, 사진 |
| `docs/adr/2026-11-07-play-flow.md`, `docs/questions/2026-11-08-npc-leader.md`(새), `docs/PLAN.md` | WP-NPC3 절, 질문 780~783, 14장 줄 |

## 함께 바꿔야 하는 파일
- 표시 종류 값을 더하면: `packages/protocol` `UNIT_WIRE_KINDS`, 서버 `world/unitKinds.ts wireKindOf`, 기기에서 그 종류를 그리는 곳(`map/leaderTags.ts LEADER_WIRE_KIND`처럼). 스키마는 모르는 이름도 받으므로 옛 기기는 깨지지 않는다.
- 정부 판에 칸을 더하면(시장 줄 — npc-humans 줄기): `@terra/shared/government`, 서버 `government/reads.ts`(지도자 창구는 같은 `government()`를 부르므로 따로 고칠 것 없음), `trpc/world.ts`(준비 전 답 두 곳: `government`·`notReadyGovernment`), `GovernmentDialog.tsx`. 시장 사실 줄과 `mayor` 칸은 이 줄기가 건드리지 않았다.
- 귀화(citizenship 줄기): `apps/game/src/government/CitizenshipSlot.tsx`의 몸을 바꾼다(받는 값 = 정부 판 응답). 창구 줄(`GovernmentDesk.tsx`)은 그 컴포넌트를 부를 뿐.

## 건드리지 말 것
- 표시 종류는 지도에 따로 그리는 유닛에만 붙인다(모든 유닛에 붙이면 봇 1,000의 전송 바이트가 는다).
- 이름표는 손가락을 받지 않는다(`pointer-events: none`) — 누르기는 `tap()`(ADR `2026-11-08-map-input.md`).

## 검사·시험 (개발 컨테이너, Node 24.22.1, 시험 DB PostgreSQL 16)
- 작업 중(고친 꾸러미만): protocol `secondMap`·`codec`, 서버 `world/secondMap`·`wire`·`gateway`·`government`·`trpc`·`worldMap`, DB `npc/leaders.db.test.ts`, 게임 `map/leaderTags`·`mapFeed`·`mapUnits`·`government` 통과. 서버·게임·e2e 타입 검사, 고친 파일 oxlint(`--type-aware --deny-warnings`), 다국어·디자인 값·파일 크기·모듈 경계 검사 통과.
- 끝 검사(Verified, 무거운 잠금 안): `TEST_DATABASE_URL=… pnpm check` 통과 — 포맷·린트·타입·경계·파일 크기·다국어(4,739키)·디자인 값·콘텐츠(core@52)·단위·DB 시험 **523파일 4,010개 통과**. `pnpm check:docs origin/main` 통과, `pnpm check:content origin/main` 통과(core@52, 기준 3d6ad70).
- 화면 시험 `pnpm e2e government.spec.ts`: **8 통과**(1.8분) — 행정 건물 정부 판(하루 값 세 줄 더함), 지도자 이름표 → 지도자 판 → 지도자 정부 판(머리·하루 값·창구) → 외교 → `/faction`, `world.leaderGovernment` = 수도 행정 건물 판·내 사이보그로 물으면 `unknown_unit`, 사진 390 파스텔·다크(한국어)·파스텔 영어 각 7장(`E2E_SHOTS_DIR`, 저장소 밖). 사진을 직접 봄: 이름표가 지도자 머리 위(숲 속이라 몸은 나무에 가림 — 이름표는 보임), 넘침 없음, 누르는 곳 44px 이상, 긴 영어 부제목은 두 줄로 접힘. 화면 시험 서버는 봇이 없어 만족도 "—", 발전도 "0 / 100", 생필품 "—"(오늘 낼 몫 없음).

## 미검증·TODO·알려진 문제
- NAS에서 돌려 보지 않았다(미실행). 프로토콜 18이라 NAS의 17판 기기는 새 앱을 받기 전까지 지도자를 다른 유닛과 같은 모양으로 본다(그 밖은 그대로).
- 생필품 충족은 "오늘 지금까지"라 하루 안에서 움직이고 UTC 0시 직후 첫 정시 전은 "—"(질문 781). 화면 시험 서버는 봇이 없어 휴먼이 없으므로 만족도 "—".
- 이름표는 확대 단계와 상관없이 같은 크기다(질문 780). 행정 건물 표시(높이 4m)와 아주 멀리서 겹칠 수 있다 — 누르기는 이름표가 먼저.
- `SecondaryMapScreen.tsx` 704줄(600줄 경고). 다음에 이 화면에 더하는 줄기는 나눈다.

## 사용자 결정 대기
- 질문 780~783(기획 세션 경유).
