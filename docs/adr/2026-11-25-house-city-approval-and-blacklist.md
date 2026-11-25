# 가문 도시 가입(정부 방문·승인), 탈퇴·추방, 블랙리스트(무패널티 PVP·현상금·기여도)

- 상태: 확정 (일부 대체됨: 2026-11-25-blacklist-bounty-limits.md — 현상금은 등록한 도시의 국고에서 한 번만·상한·건 사람 제외, 무패널티 PVP 나라 ID 비교)
- 날짜: 2026-11-25
- 관련: ADR `2026-11-24-house-membership-separation.md`(1단계), `2026-11-11-faction-identity.md`(가문·이동 정책), `2026-11-21-credit.md`(신용 벌점), `2026-10-28-time-and-session-protocol.md`(프로토콜 70)

## 배경

사용자 결정(2026-11-24, 2단계 범위):
- 가문의 도시·국가 가입은 가문장(사이보그)이 해당 도시의 정부 건물에 직접 방문해 신청하며, 시장(기본 권한) 또는 국가 원수의 승인이 필요하다(정책으로 권한 설정 가능). NPC 세력은 기본 자동 승인이되 특이 조건(우호도 부족·블랙리스트 등)일 때 차단할 수 있다.
- 가문의 소속 도시 탈퇴를 허용하며, 재가입 대기 기간과 우호도 하락 패널티를 적용한다.
- 시장/국가 원수의 가문 추방은 우호도 변화를 주지 않는다.
- 악의적 유저는 블랙리스트에 등록할 수 있으며, 블랙리스트 유저를 사냥하면 패널티 없는 PVP 명분(같은 나라 공격 신용 벌점 면제)과 현상금·기여도(국가 명성·가문 기여도)를 제공한다.

## 선택지

1. 가입 승인 경로:
   - 가) 기존 세력 화면 원격 `house_home`을 유지하되, 정부 건물 방문 신청(`house_city_apply`)·승인(`house_city_decide`)·탈퇴(`house_city_leave`)·추방(`house_city_expel`)·블랙리스트(`nation_blacklist`)를 정식 경로로 추가. (고름 — 기존 69판 호환과 테스트 유지)
   - 나) `house_home`을 즉시 삭제 — 69판 기기와 기존 공고 이동 시험이 깨진다.
2. 블랙리스트 사냥 보상 지급 시점:
   - 전투 결과 적용(`battleApply.onApplied`) 안에서 승자가 블랙리스트 유저의 유닛을 쓰러뜨렸을 때 현상금(국고 → 승자 지갑, 있는 만큼)·국가 명성·가문 기여도를 지급한다. (고름 — 전투 결과와 같은 커밋)

## 결정

1. **DB 스키마(더하기만, 직전 판 앱 호환)**:
   - `city_policies`: `join_approver`(text, `"mayor" | "leader" | "auto"`, null = NPC `"auto"` / 플레이어 `"mayor"`), `join_min_standing`(integer, null = 기본 `-20`).
   - `city_house_applications`: 도시×가문 가입 신청 대기 줄(`id`, `city_id`, `house_id`, `requested_by`, `created_at_ms`, `expires_at_ms`, 고유 `(city_id, house_id)`).
   - `nation_blacklist`: 나라별 블랙리스트(`id`, `nation_id`, `city_id`, `user_id`, `reason`, `bounty`, `renown_reward`, `created_by`, `created_at_ms`, 고유 `(nation_id, user_id)`).
2. **프로토콜 70(최소 69)**:
   - 새 WebSocket 메시지 6종(`packages/protocol/src/house.ts`): `house_city_apply`, `house_city_decide`, `house_join_policy`, `house_city_leave`, `house_city_expel`, `nation_blacklist` → 모두 `house_member_result`로 응답.
   - 새 행동(`city_applied`·`city_apply_accepted`·`city_apply_declined`·`join_policy_set`·`city_left`·`city_expelled`·`blacklist_added`·`blacklist_removed`)과 실패 코드(`not_government`·`wrong_city`·`blacklisted`·`standing_too_low`·`no_home_city`·`already_applied`)는 70판 연결에만 보내고 69판 연결은 호환 코드로 내려준다.
3. **가입 신청·승인·정책(`factionIdentity/houseCityJoin.ts`)**:
   - 가문장이 그 도시 행정 건물(`government_hall`)에 사이보그 본체가 서 있는 상태에서 신청한다.
   - 가문원 중 해당 나라 블랙리스트 유저가 있으면 `blacklisted`로 차단한다.
   - 자동 승인(`auto` 또는 NPC 기본)이면 최소 우호도(`minStanding`) 이상일 때 1인 가문은 즉시 가입(`home_set`), 2명 이상은 공고(`home_announced`)를 시작한다.
   - 승인 필요(`mayor`·`leader`)면 `city_house_applications`에 등록하고, 승인권자가 수락하면 동일하게 1인 즉시 / 2인 이상 공고로 넘긴다.
4. **도시 탈퇴 및 추방**:
   - 탈퇴(`house_city_leave`): 가문장이 소속 도시를 비우고(`house_homes.city_id = null`, `set_at_ms = now` → 재가입 대기 시작, `factions.born_of = null`), 가문원 전원의 옛 나라 우호도를 `naturalizeStandingDrop`만큼 깎으며 가문원 국적을 미소속으로 푼다.
   - 추방(`house_city_expel`): 승인권자가 그 도시 소속 타 가문을 내보낸다. 우호도 변화는 없으며, 가문원 국적을 미소속으로 푼다.
5. **블랙리스트와 PVP 명분·현상금·기여도(`factionIdentity/blacklist.ts`, `credit/hooks.ts`, `world/battleApply.ts`)**:
   - 원장에 블랙리스트 조회 고리(`setBlacklistCheck`)를 붙여, 블랙리스트에 등록된 유저를 공격할 때는 같은 나라 공격 신용 벌점(`same_nation_attack`)을 면제한다.
   - 전투 결과 적용(`battleApply.onApplied`)에서 플레이어가 블랙리스트 유저의 유닛을 격파(귀환·포로)하면 그 나라 국고에서 현상금(있는 만큼)을 승자 지갑으로 지급하고, 승자의 국가 명성(`addRenown`)과 가문 기여도(`house_members.contribution`)를 더한다.
6. **정부 판·세력 화면 UI**:
   - 정부 대화상자 국적 창구에 가문 도시 가입 신청·승인 정책·신청 대기 승인/거절·소속 가문 추방·블랙리스트 등록/조회 패널(`CityHousePanel.tsx`)을 붙인다.
   - 세력 화면 소속 도시 칸(`HouseHomeBlock.tsx`)에 `[소속 도시 탈퇴]` 단추를 더한다.

## 이유

- 정부 건물 방문 신청과 승인 정책을 분리해 두면 NPC 도시는 자동 승인 + 조건 차단으로, 플레이어 도시는 시장/원수 승인으로 자연스럽게 운영된다(Verified: `houseEntryPolicy.ts`의 `ruledBy`·`electedNationOf` 재사용).
- 블랙리스트 판정을 원장 WeakMap 고리(`credit/coupTruce.ts`와 같은 꼴)로 두면 판정 계층(`@terra/sim`)을 건드리지 않고 PVP 벌점 면제와 전투 보상을 깔끔하게 연결할 수 있다(Verified: `credit/hooks.ts`, `world/battleApply.ts`).

## 결과

- 좋은 점: 1단계의 미소속 가문 창설과 맞물려 정부 방문 가입 → 승인 → 탈퇴/추방 → 블랙리스트 사냥 보상까지 하나의 순환으로 완성된다.
- 감수할 점: 블랙리스트 사냥 보상의 가문 기여도 적립은 전투 적용(동기) 뒤 비동기 DB 업데이트로 기록한다. 현상금 지급 시 국고가 비어 있으면 있는 만큼만 지급한다(새 화폐를 만들지 않는다).
- 다시 볼 조건: 3단계(가문 도시세)에서 소속 가문 목록에 세금 체납 상태를 함께 표시할 때, 4단계(건물별 접근 권한)에서 블랙리스트 유저의 시설 이용 차단을 연결할 때.
