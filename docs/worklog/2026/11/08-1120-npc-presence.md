# NPC 국가 존재감: 지도자 사이보그·도시 둘레 NPC 휴먼·정부(행정 건물) 판

- 일시: 2026-11-08 11:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP-NPC (2026-11-08)", 질문 `docs/questions/2026-11-08-npc-presence.md`(740~749, 확인 대기), 가지 `work/npc-presence`(시작점 main `a366ef2`), 사용자 지적 2026-11-08(원문 "Npc사이보그 세력이 없어 기본 세력 npc존재도 없음 정부 건물의 기본 기능도 없음")

## 한 일
- **읽기**: 사용자에게 바로 물을 수 없어 추천 읽기로 만들었다(ADR·질문에 적음 — 다르게 읽었으면 바꾼다): ① NPC 국가가 2차맵에서 보이게, ② 고정 NPC 국가마다 지도자 사이보그, ③ 행정 건물을 누르면 정부 기본 기능.
- **조사(Verified)**: 새 DB(`npc_inv`, 시험 클러스터)에 이 줄기 전 서버를 `tsx src/main.ts`로 켬(`S1_TEST_BOTS=1000`·`S1_TEST_MAPS=6`·`NPC_SOCIETY=1`·`NPC_TEST_NATIONS=4`·`GARDENER_WAVES=0`·캐시된 시험 행성 — NAS `ops/compose.yml`과 같은 값). SQL로 본 것:
  - 국가 넷·시작 도시 11곳(`world_cities`, 국가마다 2·4·3·2, 이름 Highmoor…Timberlake), 도시마다 행정 건물·창고·농장·벌목장(`world_facilities`, 씨앗 44개), NPC 휴먼 646명(`world_humans`, 도시마다 58~59), 불변 조건 위반 0 — 씨앗은 돌았다.
  - 휴먼 유닛 자리(경로 끝 칸)와 그 도시 시청 칸의 체비셰프 거리: 사이보그 시야(24칸) 안이 도시마다 0~3명, 평균 약 90칸 → 시야 안개 아래에서 "NPC가 없다"로 보인다. 까닭: 시험 봇은 2차맵 아무 칸에 생기고 지금 자리 둘레 48칸을 떠돈다(`world/bots.ts`).
  - 지도자 유닛 없음(그런 개념이 코드에 없었다). 세력 화면 이름 = 세력 코드(e2e `faction.spec.ts`가 `s3_test_npc` 글자를 기대), 지도자 "모름"(`factionScreen/overview.ts leader: null`). 1차맵 국가 1 이름만 옛 "시험 NPC 세력"(`worldMap/reads.ts`, 사이보그 만들기는 16번째 프리셋). 2차맵 행정 건물 → 채집 판(이름·레벨·들어가기)뿐.
- **NPC 휴먼 집**: 봇에 집(도시 시청 칸)을 두면 집 둘레 32칸 [임시] 안에서 목적지를 고르고, 멀면 집 쪽으로 48칸씩 다가간다(`homeArea`). 부팅 들이기·NPC 구인(`spawnBotNear`)·휴먼 줄 바뀜이 집을 넣는다(저장하지 않음). 집 없는 봇(시험 줄)은 난수 차례까지 그대로.
- **지도자 사이보그**: 유닛 종류 7(`UNIT_KIND_NPC_LEADER`), 주인 = 국가 소유 주체, 수도(그 국가의 가장 작은 ID 시작 도시) 행정 건물 바로 곁. 켤 때 기본 시설 씨앗 다음에 띄운 2차맵 어디에도 없을 때만 세운다(`seedNpcAtBoot`). 이름 = 팩 국가 프리셋 `leaderName`(새 칸, 16개 모두 [임시] "임시 지도자 N", core@52). 세력 화면 지도자 칸·나라 이름(`label`·`leaderName`, 옛 글 칸 그대로), 지도 한눈 정보 "지도자 <이름>"(`npc_leader`).
- **정부 판**: tRPC `world.government`(건물 → 행정 건물 시설 줄 → 거울 도시·나라·지도자·거래세·행정 레벨·휴먼 수, 모르는 도시면 `unknown_building`) + 화면 `apps/game/src/government/`(채집 판 아래 "정부 · 도시" 한 장 → [정부 열기] 대화상자 지연 조각: 사실 여섯 줄·내 나라/수도/시작 도시 표·[창고]·[거래소]·구인 카드 [고용]). 구인은 경제 화면 `RecruitPanel`을 `cityId`로 그대로(같은 `recruit.board` → `recruit_hire`). 국적 바꾸기는 규칙·명령이 없어 넣지 않았다(질문 745). 시장은 늘 "없음"(질문 744).
- **1차맵 국가 이름**: 국가 1도 `nationName`(16번째 프리셋) — WP1 6절대로.
- **고친 뒤 다시 잼(Verified)**: 같은 DB를 이 줄기 서버로 다시 켬 → `world boot: seeded npc nation leaders` placed 4·missing 0, 지도자 넷이 각 수도 행정 건물(기준 칸 118,118·3×3) 곁 (117,117), 불변 조건 위반 0. 휴먼: 약 3분 뒤 시청 24칸 안 도시마다 9~25명(평균 약 45칸), 약 7분 뒤 24칸 안 29~39명·32칸 안 53~57명(58~59명 가운데)·평균 약 21칸. 조사 DB는 지웠다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/bots.ts`·`bots.test.ts`(새) | 집 둘레 목적지(`homeArea`, `pickDestination(area)`) |
| `apps/server/src/world/secondMap.ts`·`secondMap.test.ts` | 봇 집(`setHome`, 구인 휴먼은 세운 칸이 집), 목적지 고를 때 집 둘레 |
| `apps/server/src/npc/runtime.ts`·`persist.ts` | 들인 휴먼·바뀐 휴먼 줄의 집 = 그 도시 시청 칸 |
| `apps/server/src/world/unitKinds.ts` | 유닛 종류 7 = NPC 국가 지도자 |
| `apps/server/src/npc/leaders.ts`(새)·`leaders.test.ts`(새)·`leaders.db.test.ts`(새) | 수도·지도자 찾기·지도자 씨앗·부팅 씨앗 묶음(`seedNpcAtBoot`) |
| `apps/server/src/world/world.ts` | 부팅 씨앗 부르는 한 줄(가져오기 한 줄·주석 한 줄, 979줄 그대로) |
| `apps/server/src/npc/nations.ts`·`presets.ts`, `packages/content/src/schema/economy.ts`, `content/core/nation_presets.json`·`manifest.json` | 국가 프리셋 `leaderName`(선택 칸), `nationLeaderName`, core@52 |
| `apps/server/src/government/reads.ts`(새)·`reads.test.ts`(새), `packages/shared/src/government.ts`(새)·`package.json` | 정부 판 조회와 응답 모양 |
| `apps/server/src/worldMap/reads.ts`, `trpc/world.ts`·`context.ts` | `world.government`, 나라·지도자 이름(`nationNames`), 국가 1 이름 = 프리셋 |
| `apps/server/src/worldMap/mapUnits.ts`·`mapUnits.test.ts`, `packages/shared/src/mapUnits.ts` | 한눈 정보 `npc_leader`·지도자 이름 |
| `apps/server/src/factionScreen/source.ts`·`overview.ts`·`overview.test.ts`, `packages/shared/src/faction.ts`, `apps/server/src/app.ts`(한 줄) | 세력 화면 지도자 유닛 읽기·나라·지도자 이름 |
| `apps/game/src/government/`(새: `GovernmentSheet.tsx`·`GovernmentDialog.tsx`·`governmentData.ts`·`governmentData.test.ts`·`government.css`) | 정부 작은 판·대화상자 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 정부 판을 채집 판 아래에 두는 한 줄(+ 가져오기) |
| `apps/game/src/economy/RecruitPanel.tsx` | `cityId`(그 도시 카드만, 고르기·소개 숨김) |
| `apps/game/src/map/mapUnits.ts`, `apps/game/src/faction/FactionSide.tsx`, `apps/game/messages/ko.json`·`en.json` | 지도자 종류·이름 글, 세력 화면 나라·지도자 이름, 문구(ko·en) |
| `e2e/government.spec.ts`(새)·`e2e/faction.spec.ts` | 정부 판 화면 시험·사진, 세력 이름 기대값(코드 → 나라 이름·지도자) |
| `docs/adr/2026-11-07-play-flow.md`, `docs/questions/2026-11-08-npc-presence.md`(새), `docs/PLAN.md` | WP-NPC 절, 질문 740~749, 14장 줄 |

## 함께 바꿔야 하는 파일
- 국가 프리셋 형식을 바꾸면 `apps/server/src/npc/presets.ts`(서버 꼴)와 `NationPreset`(`npc/nations.ts`)을 함께.
- 유닛 종류를 더하면 `apps/server/src/world/unitKinds.ts` 번호를 다시 쓰지 않는다(7 = 지도자). 화면 종류는 `@terra/shared/mapUnits` `MAP_UNIT_KINDS`와 `apps/game/src/map/mapUnits.ts kindLabel`.
- 정부 판에 칸을 더하면 `@terra/shared/government`·`apps/server/src/government/reads.ts`·`apps/server/src/trpc/world.ts`(준비 전 답)·`apps/game/src/government/GovernmentDialog.tsx`.

## 건드리지 말 것
- 채집 판(`apps/game/src/map/gather/GatherPanel.tsx`)은 이 줄기가 고치지 않았다(다른 줄기 몫). 정부 판은 같은 채집 상태(`gatherState`)를 구독할 뿐이다.
- 지도자 유닛은 다시 켤 때 옮기지 않는다(멱등 — 운영자가 옮긴 자리 그대로). 없을 때만 새로 선다.

## 검사·시험 (개발 컨테이너, Node 24.22.1)
- 작업 중(고친 꾸러미만): 서버 `leaders.test.ts`·`government/reads.test.ts`·`bots.test.ts`·`secondMap.test.ts`·`mapUnits.test.ts`·`overview.test.ts`·`factionScreen`·`worldMap`·`nations`·`townSites`·`trpc/world.test.ts`·content 통과, DB `npc/leaders.db.test.ts` 통과(시험 DB PostgreSQL 16), 게임 `government`·`mapUnits`·`faction`·`recruit`·`economy` 시험 통과, 서버·게임·e2e 타입 검사 통과, 고친 파일 oxlint(`--type-aware --deny-warnings`) 통과, `pnpm check:content origin/main` 통과(core@52).
- 끝 검사: 아래 "끝 검사"에 적는다.

## 미검증·TODO·알려진 문제
- NAS에서 돌려 보지 않았다(미실행). NAS 세계는 이 줄기가 들어간 이미지로 켜면 지도자 넷이 서고, 휴먼은 몇 분에 걸쳐 도시로 모인다(세계를 다시 비울 필요 없음 — 표·마이그레이션 없음).
- 지도자는 다른 유닛과 같은 모양이다(유닛 전송에 종류가 없다, 질문 748). 누르면 한눈 정보에 "지도자 <이름>".
- 시험 줄 2차맵 6장의 봇(도시 없음)은 그대로 흩어져 걷는다(질문 749).
- 휴먼이 다른 2차맵의 도시로 옮겨 가면 집을 넣지 못한다(같은 2차맵 도시만, 드묾).
- 세율은 도시 경제가 도는 서버에서만 보인다(경제 입력이 없으면 "모름").

## 사용자 결정 대기
- 질문 740~749(기획 세션 경유 — 읽기가 맞는지 포함).
