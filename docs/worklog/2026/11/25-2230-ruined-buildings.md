# 상태 0% 건물은 폐허: 고칠 수 없고 원래 건물로 치지 않는다

- 일시: 2026-11-25 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-ruined-buildings.md`(새로 씀), `2026-11-25-vacant-government-and-city-vote.md`, 앞 작업 기록 `25-2140-vacant-government-take-and-city-vote.md`(커밋 `b2e9fcdf`)

## 한 일

사용자 결정(2026-11-25 "0%건물은 폐허이고 수리가 불가능하고 원래 건물이 아닌 폐허로 친다 … 폐허가된 정부건물은 사실상 2차맵에 존재하지 않기에 정부건물건설가능")을 옮겼다.

- **폐허는 고칠 수 없다**: 상태 0%인 다 지은 건물의 수리·레벨 올리기를 `target_ruined`로 거절한다(플레이어·NPC 모두). 앞에는 0%에서도 수리가 됐다.
- **폐허는 원래 건물로 치지 않는다**:
  - 폐허가 된 정부 건물은 그 2차맵의 정부 건설을 막지 않고, 주인 없는 정부여도 차지할 수 없다.
  - NPC 도시의 건설 판단이 폐허를 시설 수에 넣지 않는다(없는 것으로 보고 새로 짓고, 수리 대상에서도 뺀다).
- **화면**: 시설 카드가 폐허에 수리·레벨 올리기 단추를 보이지 않고 안내 한 줄을 보인다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/service.ts` | 수리·레벨 올리기·NPC 작업에서 상태 0% 거절(`target_ruined`) |
| `apps/server/src/facilities/views.ts` | 폐허는 조회의 수리·올리기 칸을 비운다 |
| `apps/server/src/ruins/landClaim.ts` | 폐허가 된 정부 건물은 "정부 건물 있음"에서 뺀다 |
| `apps/server/src/npc/cityBuild.ts` | NPC 건설 판단이 폐허를 시설로 세지 않는다 |
| `apps/game/src/economy/FacilityCards.tsx`, `apps/game/messages/{ko,en}.json` | 폐허 안내 한 줄(`facility_ruined_note`), 단추 숨김 |
| `apps/server/src/facilities/attack.db.test.ts`, `apps/server/src/npc/cityBuildUpgrade.db.test.ts`, `apps/server/src/ruins/landClaim.db.test.ts` | 옛 기대(0%에서 수리)를 새 규칙으로, 폐허 정부 건물 시험 |
| `docs/adr/2026-11-25-ruined-buildings.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- 건물을 "있다"로 세는 규칙을 새로 만들 때는 폐허(레벨 1 이상 + 상태 0%)를 빼야 하는지 본다(`landClaim.ts` `governmentOn`, `npc/cityBuild.ts` `site`가 본보기).

## 건드리지 말 것

- `facilities/service.ts`의 `target_ruined` 세 곳(수리·레벨 올리기·NPC 작업): 빼면 폐허를 다시 고칠 수 있게 된다.

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `b2e9fcdf` + 이 변경): `pnpm check` 통과(시험 6,198개 통과·428개 건너뜀).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 383파일 2,252개 통과(DB 시험 포함 — 폐허 수리·올리기 거절 `attack.db.test.ts`, NPC가 폐허를 고치지 않음 `cityBuildUpgrade.db.test.ts`, 폐허 정부 건물 `landClaim.db.test.ts`).
- 화면 시험(같은 복사본, `E2E_BROWSER_CHANNEL=chrome`): `e2e/facilities.spec.ts` 6개 중 2개 통과. 실패 4건("no free cell for workshop"과 그 뒤 사진 시험)은 이 변경을 뺀 상태(`b2e9fcdf`)에서도 똑같이 실패한다(Verified). 이번에 고치지 않았다. 폐허 안내 줄을 보는 화면 시험은 쓰지 않았다.
- 화면은 눈으로 보지 않았다(시설 카드의 폐허 안내 — 파스텔·다크 사진 미실행).
- 폐허는 지도에 남아 칸을 차지한다. 치우는 방법(철거 명령·저절로 사라짐)은 없다.
- 폐허가 된 창고 등에 든 물건은 그대로 남는다.
- 도시의 정부 건물이 폐허가 됐을 때의 처리(도시 폐허 복원 규칙)는 바꾸지 않았다.
- 거주·노동 계약·접근 범위·지분 같은 다른 계통은 폐허를 따로 가르지 않는다(기능 정지 규칙이 대부분 막는다).
- 영토 비콘의 수리(`beacon_repair`)는 바꾸지 않았다.
- 주인 없는 정부는 쓰지 않으면 30%에서 노화가 멈춰, 공격받지 않으면 폐허가 되지 않는다.
- 기획 49 N50에는 폐허의 수리 불가가 없다. 기획 세션에 전달이 필요하다.

## 사용자 결정 대기

- 폐허를 치우는 규칙(철거 명령, 시간이 지나면 사라짐).
- 폐허 안 물건의 처리.
