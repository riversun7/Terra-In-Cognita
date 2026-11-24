# 가문 창설·도시 가입 분리 1단계(도시 선택 제거·국가 미소속 시작·유닛 소속 통일·지갑 수정·전쟁 퇴거)

- 일시: 2026-11-25 00:20 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-11-24-house-membership-separation.md`

## 한 일
- 가문 창설 화면과 서버에서 도시 선택을 제거하고, 창설 직후 도시·국가 미소속 가문으로 시작하게 바꿨다.
- 첫 접속 사이보그 생성 시 출발 도시 위치만 고르고 국가 미소속(`cyborgs.faction_id = null`, `faction_members` 미가입)으로 시작하게 바꿨다.
- `cyborgs.faction_id`와 `house_homes.city_id`의 `NOT NULL` 제약을 푸는 마이그레이션(`20261124150140_house_nullable_home`)을 추가했다.
- 가문 생성·가입·탈퇴 시 사이보그 본체와 보유한 모든 유닛이 주인의 가문에 일괄 귀속·해제되도록 `houseTies.unitHouseOf`를 통일했다.
- 1인 가문은 도시 가입·이동 공고 기간을 건너뛰고 바로 진행하게 하고, 가입 대상 도시·국가와 전쟁 중인 세력 도시에 거주 중인 가문 보유 유닛이 있으면 화면에 경고 문구를 띄우게 했다.
- 사이보그 본체와 사유재산이 없는 유닛(크리쳐·안드로이드)의 주거비·주민세 집 몫이 빈 유닛 지갑이 아니라 소유자(플레이어) 지갑에서 나가도록 고쳤다.
- 소속 국가와 주거지 국가가 전쟁에 들어가면 적국 도시 주거지에서 강제 퇴거시키고, 주거지가 없는 상태의 적색 부상 귀환은 현재 위치에서 가장 가까운 소속 국가 도시로 송환하게 했다.
- 개인 국가 가입(귀화)을 막고 1인 가문을 포함한 가문 단위로 도시·국가에 가입하도록 안내 문구를 바꿨다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-11-24-house-membership-separation.md` | 1~4단계 사용자 결정과 1단계 구현 내용 기록 |
| `apps/server/src/db/schema.ts`, `apps/server/src/db/houseSchema.ts`, `apps/server/drizzle/20261124150140_house_nullable_home/` | `cyborgs.faction_id`·`house_homes.city_id` NULL 허용 마이그레이션 |
| `apps/server/src/cyborg/state.ts`, `apps/server/src/cyborg/service.ts` | 첫 접속 국가 미소속 시작 및 `alignHome` null 지원 |
| `apps/server/src/factionIdentity/found.ts`, `house.ts`, `members.ts`, `attach.ts`, `services.ts`, `houseHome.ts`, `houseView.ts`, `houseCity.ts` | 미소속 가문 창설, 1인 가문 즉시 가입, 적대 세력 거주 유닛 경고 수 계산, 미소속 사이보그 가문 목록 조회 |
| `apps/server/src/world/houseTies.ts` | 보유한 모든 유닛의 가문 소속을 주인의 가문으로 통일 |
| `packages/sim/src/society/residentTax.ts`, `apps/server/src/npc/residentProperty.ts`, `apps/server/src/residence/attach.ts`, `apps/server/src/gather/world.ts` | 사이보그 본체·재산 없는 유닛의 소유자 지갑 부담 및 전쟁 시 적국 도시 주거지 강제 퇴거 |
| `apps/server/src/world/unitHome.ts`, `apps/server/src/world/unitHomeWorld.ts` | 주거지 없는 적색 부상 시 가장 가까운 소속 국가 도시로 송환 |
| `apps/server/src/citizenship/service.ts` | 개인 귀화 차단(`in_house`) 및 `factionId` null 안전 처리 |
| `apps/server/src/world/nationVision.ts`, `commandRanks.ts`, `governance/port.ts`, `government/reads.ts`, `ruins/runtimeInput.ts`, `ruins/service.ts` | `cyborgs.factionId` null 안전 처리 |
| `packages/shared/src/house.ts`, `apps/game/src/faction/identity/IdentityStep.tsx`, `HouseHomeBlock.tsx`, `HouseSection.tsx`, `apps/game/messages/ko.json`, `en.json` | 가문 창설 도시 선택 제거, 1인 가문 가입 문구, 적대 거주 유닛 경고, 개인 귀화 안내 문구 |
| `packages/sim/src/society/residentTax.test.ts`, `apps/server/src/residence/book.test.ts`, `apps/server/src/world/unitHome.test.ts`, `apps/server/src/cyborg/cyborg.db.test.ts`, `apps/server/src/citizenship/citizenship.db.test.ts`, `apps/server/src/factionIdentity/house.db.test.ts`, `members.db.test.ts`, `houseEntryPolicy.db.test.ts` | 새 규칙 단위·DB 시험 갱신 및 추가 |

## 함께 바꿔야 하는 파일
- 2단계(정부 건물 방문 가입 신청·시장/원수 승인·탈퇴·추방·블랙리스트), 3단계(가문 도시세), 4단계(건물별 접근 권한·외부인 건설 정책) 구현 시 `factionIdentity/`·`government/`·`facilities/landRule.ts`·`db/`를 이어서 확장한다.

## 건드리지 말 것
- 이미 올라간 옛 마이그레이션 폴더와 확정된 옛 ADR 본문.
- `packages/sim` 시뮬레이터의 기본 주민세 동작(`ownerWallet` 미지정 시 기존과 동일).

## 미검증·TODO·알려진 문제
- Playwright E2E 브라우저 화면 시험은 아직 돌리지 않았다(미실행).
- 후속 2~4단계(정부 건물 방문 승인·탈퇴/추방/블랙리스트, 가문 도시세, 건물별 권한·외부인 건설 정책)는 다음 작업으로 진행한다.

## 사용자 결정 대기
- 1단계 결과 확인 후 2단계(가문 도시 가입 승인·탈퇴·추방·블랙리스트) 착수 여부.
