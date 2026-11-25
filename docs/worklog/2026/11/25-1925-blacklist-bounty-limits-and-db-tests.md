# 블랙리스트 현상금 제한, 미소속 사이보그 가문 초대 고침, 1단계 뒤로 깨진 DB 시험 27건·화면 시험, 섞인 커밋 나누기

- 일시: 2026-11-25 19:25 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-25-blacklist-bounty-limits.md`(새로 씀), `2026-11-25-house-city-approval-and-blacklist.md`(일부 대체 표시), `2026-11-24-house-membership-separation.md`(1단계). 커밋 `96e0f144`·`41296fc3`·`ded5ed97`·`db1d12c0`, 나눈 커밋 `3f645a2a`·`707fce02`·`b062d1fd`·`bbab7780`·`8bae4ff5`

## 한 일

최근 며칠의 다른 작업자(Antigravity·Codex) 작업을 검토했고, 사용자 지시("높음부터 고쳐라")로 높음 항목을 고쳤다.

- **블랙리스트 현상금 제한**(사용자 결정 2026-11-25 "해당 도시마다 설정하거나 한도를 제한하거나 특정이상은 정책상 투표"):
  - 현상금은 그 도시를 가진 가문의 가문장만 건다. 남의 도시·나라 국고로는 걸지 못한다(`not_ruler`).
  - 줄 때는 등록한 도시를 가진 세력의 국고에서 준다. 나라 국고에서는 나가지 않는다.
  - 한 건 상한은 설정 칸 `house_blacklist_bounty_max`([임시] 5,000). 넘는 값은 줄여 적는다.
  - 한 번 주면 그 줄의 현상금은 0이 된다. 건 사람은 받지 못한다.
  - 나라 국고를 쓰는 큰 현상금의 의결(투표) 안건은 만들지 않았다.
- **무패널티 PVP 면제 고침**: 신용 장부의 나라(국고 주인 ID)와 블랙리스트 표의 나라(세력 행 ID)를 그대로 비교해 면제가 걸리지 않았다. 국고 주인의 세력 행으로 바꿔 비교한다.
- **깨진 서버 DB 시험 27건(13파일)**: 1단계(`6a87aa7c`)가 26건, 4단계(`1ab3eab0`)가 1건을 깼다. 푸시 전 훅과 CI는 DB 없이 돌아 이 시험들을 건너뛴다. 모두 시험 준비·기대값이 옛 규칙에 기대고 있던 것이고 판정 코드는 바꾸지 않았다.
  - 시민: 사이보그를 만든 뒤 가문 가입과 같은 맞춤(`alignHome`)으로 국적을 준다.
  - 가문: 창설 뒤 가문장의 출발 도시에 가입한다(1인 가문은 바로).
  - 가문 밖 사이보그의 나라는 미소속을 기대한다. 이동 정책 조회에는 `foreignBuild` 칸을 기대한다.
- **미소속 사이보그가 가문 초대를 못 보던 결함**(화면 시험이 드러냄): 세력 화면 [내 가문]이 "나라 없음 = 사이보그 없음"으로 보고 초대·가입할 가문 목록을 숨겼다. 1단계부터 첫 접속 사이보그는 국가 미소속이라, 새 플레이어는 세력 화면에서 초대를 받을 수 없었다(처리할 일에는 초대가 있었다). 가문 조회 응답에 `canJoin`(사이보그가 있다)을 더하고 화면은 그 값으로 가른다.
- **위 띠 상표 링크 높이**: 홈으로 가는 상표 링크가 22px라 누르는 곳 최소 크기(`--tap-min` 24px) 검사에 걸렸다(틀이 있는 모든 화면). `min-height: var(--tap-min)`을 줬다.
- **화면 시험**: `e2e/inventory.spec.ts`(좁은 화면에서 접힌 착용 장비 칸을 펴고 본다), `e2e/faction-identity.spec.ts`(창설 때 소속 도시 고르기 없음, 소속 도시 칸은 방문 안내, 공고 사진은 가짜 도시, 가문원 줄 선택자, 미소속 가문에는 마을 자리 제안 없음), `e2e/dev.spec.ts`(도구 21개, `/dev/mockups` 범위 줄).
- **섞인 커밋 나누기**: 미푸시 커밋 `9c0a832a`(작업 여섯 가지, 75파일)를 작업별 커밋 다섯으로 다시 만들었다. 내용(트리)은 같다.
- **도시세 체납**(사용자 결정 "체납상태로 도시 옮길시 신뢰도 하락, 해산 어쩔수없음"): 코드는 바꾸지 않고 ADR에 적었다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/factionIdentity/blacklist.ts` | 현상금 등록 권한(도시 주인만)·상한, 줄에 도시 주인 세력·건 사람, 한 번 준 표시(`claimBounty`), PVP 면제의 나라 ID 비교 |
| `apps/server/src/factionIdentity/blacklistReward.ts` | 도시 국고에서 한 번만, 건 사람 제외, 줄 때 상한 |
| `apps/server/src/factionIdentity/rules.ts`, `attach.ts`, `apps/server/src/world/world.ts` | 상한 설정값 읽기·연결 |
| `packages/sim/src/society/coefficients.ts`, `packages/sim/src/tuningHouse.ts` | 계수 `house.blacklistBountyMax`(선택 칸, 판정에 쓰지 않음)와 설정 칸 |
| `content/core/tuning.json`, `content/core/manifest.json` | 설정 칸 `house_blacklist_bounty_max`, 판 153 → 154 |
| `apps/server/src/factionIdentity/blacklistReward.test.ts`, `houseCityJoin.db.test.ts`, `apps/server/src/credit/book.test.ts` | 현상금 규칙 시험, 실제 블랙리스트 고리로 PVP 면제 시험 |
| `apps/server/src/factionIdentity/{houseCity,houseRecruit,houseEntryPolicy}.db.test.ts` | 깨진 DB 시험 4건 |
| `apps/server/src/{cityShares,diplomacy,governance,ruins,travel,world,worldMap}/…db.test.ts`(10파일) | 깨진 DB 시험 23건 |
| `packages/shared/src/house.ts`, `apps/server/src/factionIdentity/houseView.ts`, `apps/game/src/faction/identity/HouseSection.tsx` | 가문 조회 응답 `canJoin`(선택 칸), 미소속 사이보그도 초대·가입 목록을 본다 |
| `apps/game/src/shell/shell.css` | 위 띠 상표 링크 최소 높이 |
| `e2e/inventory.spec.ts`, `e2e/faction-identity.spec.ts`, `e2e/dev.spec.ts` | 고친 화면에 맞춤 |
| `docs/adr/2026-11-25-blacklist-bounty-limits.md`, `docs/adr/2026-11-25-house-city-approval-and-blacklist.md` | 새 결정, 옛 ADR 일부 대체 표시 |

## 함께 바꿔야 하는 파일

- 현상금 상한을 바꾸면: 팩 `tuning.json`(판 올림)과 계수표 출발값(`coefficients.ts`)을 같이 본다.
- 서버 시험이 사이보그·가문을 새로 준비할 때: 사이보그는 국가 미소속으로 시작한다. 그 나라 시민이 필요하면 `alignHome`, 그 나라 가문이 필요하면 창설 뒤 `createHouseHome(...).set(가문장, 출발 도시)`를 쓴다.

## 건드리지 말 것

- `blacklistReward.ts`의 "한 번 주면 `claimBounty`"와 `blacklist.ts`의 `claimed` 표: 빼면 질 때마다 국고에서 현상금이 다시 나간다.
- 현상금 재원을 나라 국고로 되돌리지 않는다(의결 안건을 만들 때까지).

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `ded5ed97`): `pnpm check` 통과(시험 6,189개 통과·427개 건너뜀), `db:generate` 변경 없음, `check:content origin/main` 통과(core@154).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 고친 DB 시험 27건이 모두 통과한다. 1단계 직전 커밋(`f1431854`)에서는 통과하고 1단계부터 깨진 것도 커밋마다 돌려 확인했다.
- 서버 DB 시험 전체는 23건을 고치기 전에 한 번 돌렸다(2,251개 중 그 23개만 실패). 고친 뒤 전체는 다시 돌리지 않았다(고친 10파일만 28개 통과).
- Verified(깨끗한 작업 복사본, `db1d12c0` + 이 기록의 남은 수정): `pnpm check` 통과(시험 6,189개 통과·427개 건너뜀).
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/dev.spec.ts` 15개, `e2e/inventory.spec.ts` 5개, `e2e/faction-identity.spec.ts` 21개 통과. 고치기 전에는 가문 화면 시험이 첫 시험에서 멈춰(직렬) 21개 모두 돌지 못했다.
- 화면 사진은 눈으로 보지 않았다(파스텔·다크 확인 미실행). 실제 휴대폰에서도 보지 않았다.
- 가문 화면 시험 11번은 "미소속 가문에는 마을 자리 제안·[마을 세우기]가 없다"를 본다(지금 동작). 미소속 가문이 독립 마을을 세울 수 있어야 하는지는 정해지지 않았다. 화면은 미소속 가문에도 "봉신" 고르기를 보인다.
- [내 가문]의 사이보그 없음 문구(`fid_house_no_cyborg` "…나라의 시민이 되어야…")는 옛 규칙의 말이다. 다른 작업자가 메시지 파일을 고치는 중이라 손대지 않았다.
- 현상금 수정은 다른 작업자의 푸시에 섞여 이미 main에 올라갔다(`ded5ed97`, CI 성공). 뒤 커밋(`db1d12c0`, 미소속 초대 고침, 상표 링크, 화면 시험, 이 기록)은 아직 올리지 않았다.
- 알려진 한계(ADR "감수할 점"): 시장과 공범이 "등록 → 격파 → 다시 등록"을 되풀이하면 자기 도시 국고를 상한씩 옮길 수 있다. 명성·가문 기여도는 격파할 때마다 쌓인다. 상한을 넘는 값은 화면 안내 없이 줄어든다.
- 검토에서 나온 중간 항목은 고치지 않았다: 옛 `house_home` 원격 가입 우회(막는 코드는 `bbab7780`에 있음), 도시세 금액 상한·예고 없음, 추방 뒤 지원금 반복 수령, 건물 접근 범위가 네 시설에서만 강제됨, 요리 버프 `exclusive` 없음(D-472), 채팅 도크가 2차맵 도시 판을 덮음, 메뉴 아이콘 PNG가 미리 캐시되지 않음.
- 로컬 PostgreSQL에 `terra_test_*` DB가 쌓여 있다(검토 때 43개). 다른 작업자가 쓰는 것과 가릴 수 없어 지우지 않았다.

## 사용자 결정 대기

- 현상금 상한 5,000은 기획 값이 아니다([임시]). 기획 세션에 전달해 정한다.
- 나라 국고를 쓰는 큰 현상금의 의결 안건을 만들지.
- 현상금 다시 등록에 쉬는 시간을 둘지.
- 미소속 가문이 (독립) 마을을 세울 수 있어야 하는지.
- 중간 항목을 어느 것부터 고칠지.
