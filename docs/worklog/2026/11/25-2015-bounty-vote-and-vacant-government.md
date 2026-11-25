# 현상금 도시 상한·의결 안건, 가문 없는 정부 건설은 지배 가문이 빈 상태

- 일시: 2026-11-25 20:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-blacklist-bounty-vote.md`(새로 씀), `2026-11-25-blacklist-bounty-limits.md`·`2026-11-14-second-map-build.md`(일부 대체 표시), 앞 작업 기록 `25-1925-blacklist-bounty-limits-and-db-tests.md`

## 한 일

사용자 결정(2026-11-25) 세 가지를 옮겼다.

- **현상금 도시 상한**("상한 기본값 5천 놔두고 정책에서 투표없이 상한 정하고"):
  - 도시 정책에 현상금 상한 칸을 더했다(`city_policies.bounty_max`). 가입 승인 정책을 정하는 사람이 0 ~ 설정 칸(기본 5,000) 안에서 정한다. 비우면 설정 칸 값이다.
  - 명령은 `house_join_policy`의 선택 칸 `bountyMax`. 정부 판 정책 폼에 칸을 더했다.
  - 정부 판 블랙리스트 칸에 "투표 없이 걸 수 있는 현상금은 한 건 N까지" 안내가 보인다.
- **상한을 넘는 현상금은 투표 안건**("그 이상은 투표안건올리기"):
  - 나라 의결 안건 종류 `blacklist_bounty`를 더했다(도시·대상 이름·금액·사유).
  - 정부 판 블랙리스트 칸에서 상한을 넘는 금액을 적으면 등록 단추가 [의결 안건으로 올리기]로 바뀐다. 그 도시를 가진 가문의 가문장이 아닌 통치 가문장은 금액과 상관없이 이 길로 건다.
  - 가결되면 그 금액 그대로 블랙리스트에 오른다(`nation_blacklist.bounty_agenda_id`). 승인된 현상금은 줄 때 상한으로 자르지 않는다. 독재 나라는 지도자 직권.
  - 의결 화면 안건 줄에 대상·금액이 보인다.
- **다시 등록 쉬는 시간 없음**: 코드 그대로(바꾼 것 없음).
- **가문 없는 정부 건설**("가문이 있어야 도시국가 지배 가능. 그냥도 정부 건설가능하나 무소속이면 지배가문이 없는 빈상태"):
  - 가문 없는 플레이어가 빈 2차맵에 정부를 다 지어도 서버가 1인 가문을 만들지 않는다. 그 정부는 도시가 서지 않은 채 남는다.
  - 지은 사람이 가문을 창설하거나 가문에 들면 다음 틱에 그 가문이 이 정부로 도시를 세운다.
  - 나라에 들지 않은 가문은 귀속을 골라도 독립 도시국가로 선다.
  - 짓기 화면 안내 문구(`build_claim_personal`·`build_claim_personal_regime`)를 고쳤다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/db/houseSchema.ts`, `governanceSchema.ts`, `apps/server/drizzle/20261125105400_blacklist_bounty_policy_vote/`, `20261125110114_governance_agenda_blacklist_bounty/` | 도시 상한 칸·승인 안건 칸, 안건 종류 제약에 `blacklist_bounty`(더하기만) |
| `packages/protocol/src/house.ts`, `governance.ts`, `version.ts` | `house_join_policy.bountyMax`, 안건 `blacklist_bounty`와 칸 `bountyTarget`·`bounty`·`reason`, 프로토콜 73(최소 72) |
| `packages/shared/src/governance.ts`, `government.ts` | 안건 종류·안건 조회의 현상금 칸, 정부 판의 현상금 한도·의결 승인 표시 |
| `apps/server/src/factionIdentity/blacklist.ts`, `blacklistReward.ts`, `houseCityJoin.ts`, `gateway.ts`, `attach.ts` | 도시 상한 읽기·저장·조회, 승인된 현상금, 의결 안건 고리(`createBountyAgenda`) |
| `apps/server/src/governance/service.ts`, `store.ts`, `view.ts`, `npcVote.ts`, `gateway.ts`, `attach.ts` | 안건 올리기·직권·집행·조회·NPC 표 |
| `apps/server/src/ruins/landClaim.ts`, `service.ts`, `claimHouse.ts` | 가문 없는 정부는 빈 상태, 1인 가문 자동 창설 연결 없앰, 미소속 가문은 독립 |
| `apps/game/src/government/CityHousePanel.tsx`, `apps/game/src/faction/governance/{GovernancePanel.tsx,governanceText.ts,governanceCommands.ts}`, `apps/game/src/faction/identity/houseCommands.ts`, `apps/game/messages/{ko,en}.json` | 상한 칸·안내·안건으로 올리기·안건 표시, 문구(ko·en) |
| `apps/server/src/factionIdentity/{houseCityJoin.db.test.ts,blacklistReward.test.ts}`, `apps/server/src/governance/governance.db.test.ts`, `apps/server/src/ruins/landClaim.db.test.ts` | 새 규칙 시험 |
| `docs/adr/…` | 새 ADR, 앞 ADR 둘에 일부 대체 표시 |

## 함께 바꿔야 하는 파일

- 안건 종류를 더할 때: `packages/shared/src/governance.ts` `AGENDA_KINDS`, `packages/protocol/src/governance.ts` `GOVERNANCE_AGENDA_KINDS`, DB 제약 `governance_agendas_kind`(`governanceSchema.ts` + 마이그레이션), 화면 문구 표 `governanceText.ts`, NPC 표 `npcVote.ts`, 올리기 목록 제외 `view.ts` `NOT_LISTED`.
- 현상금 한도를 바꿀 때: 설정 칸 `house_blacklist_bounty_max`(팩 `tuning.json`)와 계수표 출발값.

## 건드리지 말 것

- `ruins/landClaim.ts`의 "가문 없는 플레이어 → undefined(기다림)": 여기서 1인 가문을 다시 만들지 않는다(사용자 결정).
- `blacklistReward.ts`의 `byVote` 가름: 빼면 의결로 승인된 현상금이 상한으로 잘린다.
- `ruins/claimHouse.ts`의 `foundPersonalHouse`는 부르는 곳이 없다. 이미 만든 1인 가문의 이름 붙이기 길(`nameUnnamedHouses`)은 쓰인다.

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `141838d7` + 이 변경): `pnpm check` 통과(시험 6,198개 통과·428개 건너뜀), `db:generate` 변경 없음(마이그레이션 둘과 표 정의 일치), `check:content origin/main` 통과(core@155).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 383파일 2,252개 통과(DB 시험 포함).
- 화면 시험(같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `government`·`governance`·`faction-identity`·`faction`·`build-mode`·`ruins` 여섯 파일 87개 중 79개 통과.
  - 실패 7건은 이 변경을 뺀 상태(`141838d7`)에서도 똑같이 실패한다(Verified: 변경을 빼고 다시 돌림). 모두 1단계(국가 미소속 시작) 뒤로 낡은 기대값이다: `faction.spec.ts` 81·294줄(첫 접속에서 고른 나라 이름), `governance.spec.ts` 161·170줄("속한 나라가 없습니다"), `government.spec.ts` 127·308줄(내 나라 표시·귀화 창구 문구), `ruins.spec.ts` 71줄(폐허 복원 성공 문구). 이번에 고치지 않았다.
  - 나머지 1건(`faction.spec.ts` 96줄)은 `faction-identity.spec.ts`와 같이 돌릴 때만 실패한다(앞 파일이 가문을 남긴다). 따로 돌리면 통과한다(Verified).
- 화면은 눈으로 보지 않았다(정부 판 정책 폼·블랙리스트 칸·의결 안건 줄, 파스텔·다크 사진 미실행). 새 칸·단추를 누르는 화면 시험도 쓰지 않았다.
- 가문 없이 지은 정부가 "빈 상태"임을 알리는 소식·표시는 짓기 화면 안내 문구뿐이다. 다 지은 뒤 그 건물 판에는 따로 표시가 없다.
- 가문 없이 지은 정부는 가문이 생길 때까지 도시가 아니다(영토·방어 없음, 다른 세력이 먼저 도시를 세울 수 있다).
- 안건의 투표 묶음·문턱·NPC 표 규칙은 [임시]다(지도자 묶음, 세율 안건과 같은 NPC 규칙).
- 독재 나라 지도자는 직권으로 큰 현상금을 건다.
- 기획 D-574 "무소속이면 유닛 독재 도시"와 달라졌다. 기획 세션에 전달이 필요하다(미러는 고치지 않았다).
- 플레이어 위키에 1인 독재 도시를 설명한 항목이 있으면 고쳐야 한다(찾아보지 않았다).

## 사용자 결정 대기

- 없음(현상금 상한 값 5,000·쉬는 시간 없음·가문 없는 정부는 결정받음).
