# 가문 도시 가입(정부 방문·승인), 탈퇴·추방, 블랙리스트(2단계)

- 일시: 2026-11-25 00:50 KST
- 작업 도구: Antigravity
- 관련 ADR: [2026-11-25-house-city-approval-and-blacklist.md](../../../adr/2026-11-25-house-city-approval-and-blacklist.md), [2026-11-24-house-membership-separation.md](../../../adr/2026-11-24-house-membership-separation.md)

## 한 일

1. **DB 스키마·마이그레이션(더하기만, 직전 판 앱 호환)**:
   - `city_policies`에 `join_approver`(시장/원수/자동 승인)와 `join_min_standing`(자동 승인 최소 우호도) 열을 추가하고, `city_house_applications`(가입 신청 대기줄)와 `nation_blacklist`(국가 블랙리스트) 표를 만들었다.
2. **프로토콜 70(최소 69)**:
   - 새 WebSocket 메시지 6종(`house_city_apply`, `house_city_decide`, `house_join_policy`, `house_city_leave`, `house_city_expel`, `nation_blacklist`)과 결과 행동 8개·실패 코드 6개를 추가하고 69판 연결 호환 낮추기(`legacyHouseMemberAction`, `legacyHouseMemberCode`)를 연결했다.
3. **정부 방문 가입 신청·승인·정책, 도시 탈퇴·추방(`houseCityJoin.ts`)**:
   - 가문장이 해당 도시 행정 건물(`government_hall`)에 사이보그 본체가 방문한 상태에서 가입을 신청하도록 구현했다(`wrong_city`·`not_government` 검증).
   - NPC 도시는 기본 자동 승인(최소 우호도 기본 `-20` 미만 차단, 블랙리스트 차단), 플레이어 도시는 기본 시장 승인(정책으로 시장/국가 원수/자동 변경 가능). 승인 후 1인 가문은 즉시 가입, 2인 이상은 공고 기간을 둔다.
   - 소속 도시 탈퇴(`house_city_leave`)는 재가입 대기(`set_at_ms = now`)와 가문원 전원의 옛 나라 우호도 하락을 적용하고 국적을 미소속으로 푼다.
   - 도시 추방(`house_city_expel`)은 우호도 변화 없이 국적을 미소속으로 풀며, `houseTies.ts`의 `align`이 소속 도시를 잃은 가문원 국적 해제를 메모리에도 반영하도록 맞췄다.
4. **국가 블랙리스트와 무패널티 PVP·현상금·기여도(`blacklist.ts`, `blacklistReward.ts`, `credit/hooks.ts`)**:
   - 시장·국가 원수가 사이보그 이름 또는 사용자 ID로 블랙리스트를 등록·해제하고 현상금·사유를 지정할 수 있게 했다.
   - 원장 WeakMap 고리(`blacklistCheckOf`)로 블랙리스트 유저 공격 시 같은 나라 공격 신용 벌점(`same_nation_attack`)을 면제했다.
   - 전투 결과 적용(`battleApply.onApplied`)에 `blacklistReward`를 붙여, 블랙리스트 유저 유닛을 격파(귀환·포로)한 승자에게 그 나라 국고에서 현상금(있는 만큼)을 지급하고 국가 명성(`addRenown`)과 가문 기여도(`house_members.contribution`)를 적립한다.
5. **정부 판·세력 화면 UI**:
   - 정부 대화상자(`GovernmentDialog.tsx`)에 [가문 도시 가입 · 추방 · 블랙리스트] 패널(`CityHousePanel.tsx`)을 붙였다(가입 신청·적대 거주 유닛 경고·정책 설정·대기 신청 승인/거절·소속 가문 추방·블랙리스트 공개 조회 및 등록/해제).
   - 세력 화면 소속 도시 칸(`HouseHomeBlock.tsx`)에 2단계 확인 [소속 도시 탈퇴] 단추를 추가하고 한국어·영어 메시지를 함께 넣었다.

## 바꾼 파일과 이유

- `docs/adr/2026-11-25-house-city-approval-and-blacklist.md`: 2단계 설계·프로토콜 70·스키마 결정 기록.
- `apps/server/src/db/houseSchema.ts`, `apps/server/drizzle/20261124152839_house_city_approval_blacklist/*`: 2단계 열·표 정의 및 마이그레이션.
- `packages/protocol/src/version.ts`, `house.ts`, `index.ts`, `house.test.ts`: 프로토콜 70 메시지·결과 코드·호환 함수 및 시험.
- `packages/shared/src/house.ts`, `government.ts`: 새 가문 소식 종류 4개, 정부 판 `GovernmentCityMembership` 타입.
- `apps/server/src/sessionHouse.ts`, `session.ts`, `sessionHouse.test.ts`: 새 6종 WebSocket 메시지 판 문턱과 라우팅.
- `apps/server/src/cyborg/service.ts`, `gateway.test.ts`: `dropStanding` 추가.
- `apps/server/src/world/houseTies.ts`: 소속 도시가 비워진 가문원 국적 해제 동기화.
- `apps/server/src/factionIdentity/blacklist.ts`, `blacklistReward.ts`, `blacklistReward.test.ts`: 블랙리스트 서비스·메모리 표·PVP 면제 고리·전투 사냥 보상 및 단위 시험.
- `apps/server/src/factionIdentity/houseCityJoin.ts`, `houseCityJoin.db.test.ts`: 정부 방문 가입·승인·정책·탈퇴·추방·정부 판 조회 및 DB 통합 시험.
- `apps/server/src/factionIdentity/houseHome.ts`, `houseView.ts`, `houseCity.ts`, `gateway.ts`, `attach.ts`: 탈퇴 재가입 대기(`setAtMs > 0`), 적대 거주 유닛 집계 재사용, 게이트웨이·원장 고리 연결.
- `apps/server/src/credit/hooks.ts`, `book.test.ts`: 블랙리스트 유저 공격 신용 벌점 면제 및 단위 시험.
- `apps/server/src/world/world.ts`: `battleApply.onApplied`에 `blacklistReward` 등록.
- `apps/server/src/government/reads.ts`, `houseRule.ts`, `apps/server/src/worldMap/reads.ts`: 정부 판 `cityMembership` 응답 연결.
- `apps/game/src/faction/identity/houseCommands.ts`, `houseText.ts`, `HouseHomeBlock.tsx`, `HouseSection.tsx`: 새 명령·문구·소속 도시 탈퇴 UI.
- `apps/game/src/government/CityHousePanel.tsx`, `GovernmentDialog.tsx`: 정부 판 가문 가입·승인·추방·블랙리스트 패널.
- `apps/game/messages/ko.json`, `en.json`: 한국어·영어 문구 추가.

## 함께 바꿔야 하는 파일

- 3단계(가문 도시세)에서 `CityHousePanel.tsx`의 소속 가문 목록에 세금 체납 상태를 함께 표시할 수 있다.
- 4단계(건물별 접근 권한)에서 블랙리스트 유저의 시설 이용 차단을 붙일 때 `blacklistTableOf(ledger)`를 재사용한다.

## 건드리지 말 것

- 올라간 마이그레이션 `apps/server/drizzle/20261124152839_house_city_approval_blacklist/`는 수정하지 않는다.
- `docs/design/` 기획 미러 파일은 직접 수정하지 않는다.

## 미검증 · TODO

- Playwright E2E 화면 시험: 미실행.
- 남은 단계: 3단계(가문 도시세 분리 — 일정액·시장 기본 권한·주기 정책·체납 빚+신용 하락), 4단계(건물별 접근 권한 범위 및 외부인 건설 정책).
