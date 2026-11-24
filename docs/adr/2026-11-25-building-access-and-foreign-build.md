# 건물별 접근 권한 범위 및 외부인 건설 정책(4단계)

- 상태: 확정
- 날짜: 2026-11-25
- 관련: ADR `2026-11-24-house-membership-separation.md`(1단계), `2026-11-25-house-city-approval-and-blacklist.md`(2단계), `2026-11-25-house-city-tax.md`(3단계), `2026-11-14-second-map-build.md`(2차맵 건설 규칙), `2026-10-28-time-and-session-protocol.md`(프로토콜 72)

## 배경

사용자 결정(2026-11-24, 4단계 범위):
- 해당 도시 소속이 아닌 경우의 기능을 구분한다. 거래소·채집소 등 경제 요소는 누구나 이용할 수 있고, 정부 건물이나 공공기관 등은 건물마다 권한 범위를 설정할 수 있어야 한다(`누구나` / `도시 거주자` / `도시 가문` / `국가 시민`).
- 시민이 아닌 외부인(타국·무소속)도 도시 정책상 허용된 경우에만 그 도시에 건설할 수 있다(적대·전쟁 세력은 항상 불가).

## 선택지

1. 건물별 접근 권한 저장 위치:
   - 가) `world_facilities.access_scope`(text, nullable) 열을 추가한다. `null`이면 시설 분류 기본값(`government` → `nation_citizen`, 그 밖 → `anyone`)을 따른다. (고름 — 시설 줄과 같은 쓰기 대기열 커밋, 직전 판 앱 호환)
   - 나) 별도 `building_access_policies` 표 신설 — 시설 조회·로드마다 추가 조인이 필요하다.
2. 외부인 건설 정책 저장 위치:
   - 가) `city_policies.foreign_build`(boolean, nullable, null = 기본 `false` 막음) 열을 추가하고 `landRule.ts`에서 전쟁 여부를 함께 본다. (고름 — 기존 `house_build`와 같은 자리, 직전 판 앱 호환)

## 결정

1. **DB 스키마(더하기만, 직전 판 앱 호환)**:
   - `world_facilities`: `access_scope`(text, null 또는 `'anyone' | 'city_resident' | 'city_house' | 'nation_citizen'`).
   - `city_policies`: `foreign_build`(boolean, null = 기본 `false` 외부인 건설 막음).
2. **프로토콜 72(최소 71)**:
   - `packages/protocol/src/facilities.ts`: `facility_access { buildingId, scope }` → `facility_result`, 결과 코드 `access_denied`(71판 이하는 `forbidden`).
   - `packages/protocol/src/house.ts`: `house_foreign_build_policy { cityId, allow }` → `house_member_result`(행동 `foreign_build_policy_set`, 71판 이하는 `build_policy_set`).
3. **건물 접근 권한 판정(`facilities/access.ts`)**:
   - `anyone`: 누구나 이용 가능(경제 시설 기본).
   - `city_resident`: 그 도시에 거주지(숙소)를 둔 유닛을 보유한 플레이어 또는 그 도시 소속 가문원.
   - `city_house`: 그 도시 소속 가문(`house_homes.city_id = cityId`)의 가문원.
   - `nation_citizen`: 그 도시가 속한 나라의 시민(가문 나라·사이보그 국적 일치).
   - 건물 주인과 운영자 모드는 항상 허용되며, `anyone`이 아닌 건물에서 해당 나라 블랙리스트 유저는 차단한다.
   - 병원(`hospital/service.ts`), 신전(`temple/service.ts`), 연구소(`fusion/geneCommands.ts`), 공방 외주 수리(`facilities/equipmentRepair.ts`)에서 이 판정을 적용한다. 정부 건물의 도시 가입 신청(`house_city_apply`)·귀화 상담은 외부인도 이용할 수 있게 열어 둔다.
4. **외부인 건설 정책(`facilities/landRule.ts`, `factionIdentity/housePolicy.ts`)**:
   - 도시 주인 가문장 또는 그 나라 지도자가 `house_foreign_build_policy`로 외부인 건설 허용/막음을 정한다.
   - `foreign_build = true`이고 그 도시 나라와 전쟁 중이 아니면, 비시민(타국·무소속)도 그 도시 2차맵에 건설할 수 있다. 전쟁 중인 적대 세력은 정책과 무관하게 항상 `foreign_city`로 차단한다.
5. **화면 UI**:
   - 건물 판(`BuildingPanel.tsx`): 현재 접근 권한 표시, 접근 불가 시 경고 안내, 건물 주인·도시 통치자·운영자에게 접근 권한 변경 선택창 제공.
   - 정부 대화상자(`HouseBuildPolicy.tsx`): 외부인(비시민) 건설 정책 조회 및 허용/막음/비우기 설정 추가.

## 이유

- `world_facilities.access_scope`와 `city_policies.foreign_build` 모두 기존 표에 nullable 열만 추가하므로 직전 판 앱이 무중단으로 동작한다(Verified: `facilitySchema.ts`, `houseSchema.ts`).
- `evaluateBuildingAccess`를 순수 함수로 분리하면 병원·신전·연구소·공방과 건물 판 UI가 모두 같은 권한 판정을 공유한다.

## 결과

- 좋은 점: 1~4단계(가문 분리 → 정부 방문 가입/승인/블랙리스트 → 가문 도시세 → 건물별 접근 권한·외부인 건설 정책)가 하나의 일관된 도시·가문·거주지 체계로 완성된다.
- 감수할 점: 기존 NPC 도시의 병원·신전·연구소는 `access_scope = null`일 때 `anyone`으로 두어 신규 무소속 플레이어가 시작 도시에서 막히지 않게 했으며, 도시 통치자나 건물 주인이 원할 때 즉시 `city_resident`·`city_house`·`nation_citizen`으로 좁힐 수 있다.
