# 주인 없는 빈 정부 건물과 차지하기, 정부 건물은 2차맵마다 하나, 현상금 안건은 도시 단위 투표

- 일시: 2026-11-25 21:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-vacant-government-and-city-vote.md`(새로 씀), `2026-11-25-blacklist-bounty-vote.md`·`2026-11-14-second-map-build.md`(일부 대체 표시), 앞 작업 기록 `25-2015-bounty-vote-and-vacant-government.md`(커밋 `8bd10dd6`)

## 한 일

앞 작업(`8bd10dd6`)을 사용자 답(2026-11-25)에 맞게 고쳤다.

- **가문 없는 정부 건물 = 주인 없는 비활성 건물**("정부 건물을 건설가능하나 비활성상태, 소유가 없는 빈상태"):
  - 앞 작업은 "지은 사람이 가문을 만들면 그 가문이 도시를 세운다"였다. 이제 가문 없는 사람이 다 지은 정부는 서버가 건물 주인을 없앤다. 도시가 서지 않고 아무도 고치거나 올리지 못한다.
  - 지은 사람에게 우선권은 없다. 가문을 뒤에 만들어도 저절로 갖지 않는다.
  - 가문이 있는 사람이 지으면 다 지을 때 저절로 그 가문 도시가 되는 것은 그대로다.
- **차지한 가문이 소유한다**: 새 명령 `house_hall`. 가문장이 그 2차맵에 사이보그 본체로 와서 [차지하기]를 누르면 그 가문이 이 정부로 도시를 세우고 건물 주인이 된다. 귀속·독립과 체제를 고른다(나라에 들지 않은 가문은 독립만). 건물 판에 [주인 없는 정부 건물] 카드를 더했다.
- **정부 건물은 2차맵마다 하나**("정부건물이 존재하면 다른 정부건물은 건설할 수없고 … 경고"): 그 2차맵에 아직 도시가 되지 않은 정부 건물이 있으면(짓는 중·주인 없음 포함) 다른 정부를 짓지 못한다. 짓기 화면이 "해당 2차맵에 이미 정부 건물이 존재합니다"를 알리고 짓기 단추를 막는다.
- **도시 단위 투표**("투표는 도시단위 나라단위 따로 있다"): 의결의 투표권 계산에 도시 범위를 더했다(민주주의 = 그 도시 가문, 자본주의 = 그 도시 지분 주주). 현상금 안건은 나라 단위가 아니라 도시 단위 투표다. 다른 안건은 나라 단위 그대로다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/world/secondMap.ts`, `secondMapTypes.ts` | 건물 주인 바꾸기 `setBuildingOwner`(저장·시야 다시 내기) |
| `apps/server/src/ruins/landClaim.ts`, `service.ts`, `gateway.test.ts` | 가문 없는 정부 → 주인 없음, 빈 정부 조회·차지하기, 정부 건물 중복 건설 막기 |
| `apps/server/src/factionIdentity/houseCity.ts`, `gateway.ts`, `gateway.test.ts`, `apps/server/src/sessionHouse.ts` | 차지하기 명령 `hall` |
| `apps/server/src/facilities/screen.ts`, `appSource.ts`, `apps/server/src/business/books.ts` | 땅 규칙 `governmentExists`, 건물 주인 조회 `vacantHall` |
| `apps/server/src/governance/electorate.ts`, `store.ts`, `service.ts`, `view.ts` | 도시 범위 투표권, 현상금 안건 = 도시 단위 |
| `packages/protocol/src/house.ts`, `index.ts`, `version.ts` | 메시지 `house_hall`, 프로토콜 74(최소 73) |
| `packages/shared/src/facilities.ts`, `businessBooks.ts`, `governance.ts` | 응답 칸 `governmentExists`·`vacantHall`, 안건 설명 |
| `apps/game/src/map/building/VacantHallCard.tsx`(새 파일), `BuildingPanel.tsx` | [주인 없는 정부 건물] 카드와 [차지하기] |
| `apps/game/src/map/construction/BuildSheet.tsx`, `apps/game/src/economy/ClaimChoiceParts.tsx` | 정부 건물 있음 경고·짓기 막기, 가문 없는 사람의 고르기 없앰 |
| `apps/game/src/faction/identity/houseCommands.ts`, `apps/game/messages/{ko,en}.json` | 명령 타입, 문구(ko·en) — `build_claim_personal_regime`은 없앴다 |
| `apps/server/src/ruins/landClaim.db.test.ts`, `apps/server/src/governance/governance.db.test.ts`, `e2e/build-mode.spec.ts` | 새 규칙 시험 |
| `docs/adr/…` | 새 ADR, 앞 ADR 둘에 일부 대체 표시 |

## 함께 바꿔야 하는 파일

- 도시 단위 안건을 더할 때: `governance/service.ts` `electorateOf`(안건 종류 → 도시), 표 던지기의 투표권 고르기, `view.ts`의 도시 투표권 셈.
- 2차맵 가짜 구현(시험)을 만들 때 `setBuildingOwner`도 넣는다.

## 건드리지 말 것

- `ruins/landClaim.ts` `foundPending`의 "가문 없는 플레이어 → `setBuildingOwner(null)`": 여기서 도시를 세우거나 1인 가문을 만들지 않는다(사용자 결정).
- `ruins/service.ts` 짓기 검사의 `governmentOn`: 빼면 같은 2차맵에 정부를 여럿 짓게 된다.
- 차지하기의 "가문장 본체가 그 2차맵에 있어야 한다"(`houseCity.ts` `hall`): 순간이동 없는 규칙(D-591)이다.

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `8bd10dd6` + 이 변경): `pnpm check` 통과(시험 6,198개 통과·428개 건너뜀), `db:generate` 변경 없음.
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 383파일 2,252개 통과(DB 시험 포함 — 빈 정부·차지하기·중복 건설 막기 `landClaim.db.test.ts`, 도시 단위 투표 `governance.db.test.ts`).
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/build-mode.spec.ts`(정부 건물 있음 경고 시험 포함)·`e2e/faction-identity.spec.ts` 44개 통과.
  - 같이 돌린 `e2e/buildings.spec.ts`는 333줄 "공방 수리 줄 넷" 1건이 실패한다. 이 변경을 뺀 상태(`8bd10dd6`)에서도 똑같이 실패한다(Verified). 이번에 고치지 않았다.
  - 앞 작업 기록에 적은 낡은 화면 시험 7건(`faction`·`governance`·`government`·`ruins`)은 그대로다(이번에 다시 돌리지 않았다).
- 화면은 눈으로 보지 않았다([주인 없는 정부 건물] 카드, 짓기 화면 경고 — 파스텔·다크 사진 미실행). 카드의 [차지하기]를 누르는 화면 시험은 쓰지 않았다(서버 시험이 명령을 본다).
- 주인 없는 정부는 상태가 깎여도 고칠 사람이 없다. 상태가 0%면 차지할 수 없고 그 자리는 계속 막힌다(철거 규칙 없음).
- 차지하기는 무료이고, 먼저 누른 가문이 갖는다.
- 건물 주인을 바꾸면 그 건물이 기기에서 잠깐 사라졌다 다시 나타난다(시야를 뺐다가 다시 낸다).
- 도시 단위 투표는 현상금 안건 하나뿐이다. 의결 화면은 도시 안건임을 도시 번호 줄로만 보인다.
- 앞 작업이 배포된 약 한 시간 동안 가문 없이 다 지은 정부가 있었다면, 다음 틱에 주인 없는 건물이 된다.
- 기획 D-574·D-572와 다르다. 기획 세션에 전달이 필요하다(미러는 고치지 않았다).

## 사용자 결정 대기

- 주인 없는 정부의 철거·노화 규칙.
- 차지하기에 값이나 조건을 둘지.
