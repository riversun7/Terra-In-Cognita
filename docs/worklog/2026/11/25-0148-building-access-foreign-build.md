# 작업 기록 — 건물별 접근 권한 범위 및 외부인 건설 정책(4단계)

- 일시: 2026-11-25 01:48 KST
- 작업 도구: Antigravity
- 관련 ADR: [2026-11-25-building-access-and-foreign-build.md](../../../adr/2026-11-25-building-access-and-foreign-build.md)

## 한 일

가문·도시 소속 분리 작업의 마지막 4단계로 **건물별 접근 권한 범위**와 **외부인(비시민) 도시 건설 정책**을 구현했다.

1. **DB 스키마·마이그레이션(추가만)**
   - `world_facilities.access_scope` 열(`anyone | city_resident | city_house | nation_citizen`, NULL = 시설 유형 기본값)을 추가했다.
   - `city_policies.foreign_build` 열(`boolean`, NULL = 기본 차단)을 추가했다.
   - Drizzle 마이그레이션 `20261124163515_building_access_foreign_build`를 생성했다(직전 버전 앱 무중단 호환).
2. **프로토콜 v72**
   - `PROTOCOL_VERSION`을 72(`MIN_SUPPORTED_PROTOCOL_VERSION = 71`)로 올렸다.
   - `facility_access` 메시지(`{ buildingId, scope }`)와 결과 코드 `access_denied`(71 이하 연결에서는 `forbidden`으로 낮춤)를 추가했다.
   - `house_foreign_build_policy` 메시지(`{ cityId, allow }`)와 `foreign_build_policy_set` 결과(71 이하 연결에서는 `build_policy_set`으로 낮춤)를 추가했다.
3. **서버 판정·강제 적용**
   - `apps/server/src/facilities/access.ts`에 `evaluateBuildingAccess`와 월드 판정기 `createWorldBuildingAccess`를 구현하고 `world.ts`에서 원장(`ledger`)에 연결했다.
   - 기본 권한은 정부 건물만 `nation_citizen`, 경제·공공 시설(거래소·채집소·숙소·병원·신전 등)은 `anyone`이다. 건물 주인·운영자 모드는 항상 허용하고, `anyone`이 아닌 건물에서는 해당 나라 블랙리스트 유저를 차단한다.
   - `facilities/service.ts`(`setAccess`, `repairEquipment`), `hospital/service.ts`(`overview`, `treat`), `temple/service.ts`(`pray`, `offer`, `rite`), `fusion/geneCommands.ts`(`convert`, `incubate`)에서 접근 권한을 검사하도록 연결했다.
   - `facilities/landRule.ts`에 `foreignAllow`·`hostile`을 반영해, 도시 정책 `foreign_build = true`이면 비적대 외부인·무소속 유저도 건설할 수 있고 전쟁 중인 적대 세력은 정책과 무관하게 항상 차단하도록 했다.
   - `factionIdentity/housePolicy.ts`(`setForeignBuild`)와 `houseEntryPolicy.ts`(`foreignBuild`)를 추가해 도시 통치자(시장·국가 원수)가 외부인 건설 정책을 조회·변경할 수 있게 했다.
4. **클라이언트 UI 및 다국어**
   - `apps/game/src/map/building/BuildingAccessControl.tsx`를 만들어 건물 개요·관리 탭에서 현재 접근 권한과 차단 사유를 보여주고, 주인·도시 통치자·운영자가 권한을 바꿀 수 있게 했다.
   - `apps/game/src/government/HouseBuildPolicy.tsx`·`GovernmentDialog.tsx`를 확장해 모든 도시 정부 창에서 외부인(비시민) 건설 정책을 보고 바꿀 수 있게 했다.
   - `ko.json`·`en.json`에 관련 문구 18쌍을 함께 추가했다.

## 바꾼 파일과 이유

- `docs/adr/2026-11-25-building-access-and-foreign-build.md` — 4단계 규칙·프로토콜 v72·DB 변경 ADR
- `apps/server/src/db/facilitySchema.ts`, `apps/server/src/db/houseSchema.ts`, `apps/server/drizzle/20261124163515_building_access_foreign_build/*` — `access_scope`, `foreign_build` 열과 마이그레이션
- `apps/server/src/world/persist/tables.ts`, `apps/server/src/facilities/state.ts` — `world_facilities.access_scope` 저장·복구
- `packages/shared/src/facilities.ts`, `packages/shared/src/businessBooks.ts`, `packages/shared/src/government.ts` — 접근 권한 범위 타입·기본값·응답 필드
- `packages/protocol/src/version.ts`, `packages/protocol/src/facilities.ts`, `packages/protocol/src/house.ts`, `packages/protocol/src/index.ts`, `packages/protocol/src/*.test.ts` — 프로토콜 v72 스키마·호환 낮추기·시험
- `apps/server/src/facilities/access.ts`, `apps/server/src/facilities/access.test.ts` — 건물 접근 권한 순수 판정·월드 판정기·단위 시험
- `apps/server/src/facilities/landRule.ts`, `apps/server/src/facilities/world.ts`, `apps/server/src/world/world.ts` — 외부인 건설 정책·전쟁 적대 판정·건물 접근 판정기 연결
- `apps/server/src/facilities/service.ts`, `apps/server/src/facilities/gateway.ts`, `apps/server/src/session.ts`, `apps/server/src/sessionHouse.ts`, `apps/server/src/sessionHouse.test.ts` — `facility_access`, `house_foreign_build_policy` 소켓 라우팅 및 권한 설정 명령
- `apps/server/src/factionIdentity/housePolicy.ts`, `apps/server/src/factionIdentity/houseEntryPolicy.ts`, `apps/server/src/factionIdentity/gateway.ts`, `apps/server/src/factionIdentity/housePolicy.db.test.ts` — 외부인 건설 정책 설정·조회·DB 시험
- `apps/server/src/hospital/service.ts`, `apps/server/src/temple/service.ts`, `apps/server/src/fusion/geneCommands.ts` — 공공·의료·종교·연구소 시설 접근 권한 검사
- `apps/server/src/business/books.ts`, `apps/server/src/facilities/appSource.ts` — 건물 소유자 조회 응답에 접근 권한 정보 포함
- `apps/game/src/economy/facilityCommands.ts`, `apps/game/src/economy/facilityText.ts`, `apps/game/src/faction/identity/houseCommands.ts`, `apps/game/src/faction/identity/houseText.ts` — 클라이언트 명령·오류/완료 문구 매핑
- `apps/game/src/map/building/BuildingAccessControl.tsx`, `apps/game/src/map/building/BuildingPanel.tsx` — 건물 접근 권한 표시·설정 UI
- `apps/game/src/government/HouseBuildPolicy.tsx`, `apps/game/src/government/GovernmentDialog.tsx` — 정부 창 외부인 건설 정책 UI
- `apps/game/messages/ko.json`, `apps/game/messages/en.json` — 한·영 문구 추가

## 함께 바꿔야 하는 파일

- `docs/WORKLOG.md`, `docs/adr/README.md` (`pnpm docs:index`로 자동 갱신)

## 건드리지 말 것

- `apps/server/drizzle/20261124163515_building_access_foreign_build/` 및 앞서 커밋된 마이그레이션(적용 후 수정 금지)
- `docs/design/` (기획 미러)

## 확인 결과

- `pnpm format`, `pnpm docs:index`, 전체 정적 검사(`format:check`, `typecheck`, `lint`, `check:boundaries`, `check:size`, `check:i18n`, `check:contrast`, `check:content --no-compat`, `check:docs`), `apps/game` 빌드·번들 검사, 단위 시험(`@terra/protocol`, `@terra/server`), DB 통합 시험을 일괄 실행해 검증한다.

## 미검증 · TODO

- 1~4단계 커밋은 모두 로컬 `main`에만 있으며 원격(`origin`) 푸시는 사용자 요청 시 진행한다.
- 브라우저 E2E(Playwright)로 건물 접근 권한 변경과 정부 창 외부인 건설 정책 토글 화면 동작은 미실행.
