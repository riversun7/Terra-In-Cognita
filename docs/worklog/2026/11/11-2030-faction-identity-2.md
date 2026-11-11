# 가문 창설·신고·자동 막기 — 플레이어 세력 정체성 2(질문 926~935 답)

- 일시: 2026-11-11 20:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-faction-identity.md` "바뀜 (2026-11-11, 926~935 답)", 질문 `docs/questions/2026-11-11-faction-identity.md`(926~935 답 표시, 새 질문 981~986), PLAN 14장 줄, 가지 `work/faction-identity-2`(통합 머리 `fc007ff509`에서 갈라져 `origin/merge/integration` `d599a44150`을 합침)
- 근거: 기획 정리(2026-11-11, D-529 포인터·설계 60 §7.1 — 사용자에게 묻지 않음, D-515): 926 나, 928 나, 930 나, 932 가, 934 나. 931 시험 세계 가, 927 가, 929 가(운영자 금칙어 관리는 다음 줄기), 933 가, 935 나(다음에) — 코드 없음.

## 먼저 확인한 것(Verified: 코드 읽기)
- 나라 소속은 `faction_members`(사용자당 한 줄)와 `cyborgs.faction_id`이고, 같은 나라 시야 공유(`world/nationVision.ts`)는 사이보그 시민권을 본다. 그래서 가문은 이 둘을 건드리지 않는 따로 된 표(`house_members`)로 둔다.
- NPC 사회 런타임은 `kind = 'npc'` 세력만 읽는다(`npc/state.ts`) — 플레이어 세력 행이 런타임에 섞이지 않는다.
- 플레이어가 도시(마을)를 세우는 서버 명령이 없다 → 봉신·독립 고르기를 걸 자리가 없다(TODO, 질문 982).
- WebSocket 메시지 한도 64KiB(`MAX_MESSAGE_BYTES`) < 그림 20만 바이트 → 그림은 tRPC 저장, 창설 명령만 WebSocket.

## 한 일
- **가문 창설(926 나)**: 정체성 저장(tRPC, 초안) 뒤 WebSocket `house_found`(프로토콜 22, 최소 21)가 세력 행(`kind = player`, `born_of` = 창설자 나라)·세력 정체성(`faction_profiles` source `player`)·가문장 줄(`house_members`)을 한 문장으로 만들고 정체성 줄에 가문을 잇는다. 창설자 나라 소속 그대로, 소유 주체 없음. 비용 = 설정 칸(출발값 0, 창설자 → 나라 국고). 옛 정체성은 서버를 켤 때 가문으로 옮긴다. 창설 뒤 정체성을 고치면 세력 정체성도 같이 바뀐다. 운영자 콘솔의 세력 정체성 고치기는 가문 줄을 받지 않는다(`player_owned`).
- **약어 2~4자(928 나)**: 새 약어는 설정 칸 S20 폭, 지금 약어 그대로는 저장 폭(옛 5자 그대로). 문제 코드 `too_short`·`too_long`, 기기 안내는 `mine.shortRange`.
- **신고(930 나)**: 2차맵 유닛 한눈 정보 주인 줄 아래 [신고] → 확인 → tRPC `factionIdentity.report`. 하루 횟수 설정 칸, 같은 가문은 한 번. 마크 관리에 신고 수 칸·[신고 많은 차례]·[신고 넘기기], 마크를 내리면 신고도 지움.
- **이름 대기 설정 칸(932 가)**: `house_rename_wait_ms`(7일), 창설한 가문에만.
- **자동 올리기 막기(934 나)**: 내린 횟수(`takedown_count`)가 설정 칸 문턱(3)에 이르면 올리기 막힘, 감사 기록에 `autoBlocked`. 검수 기준 짧은 글은 ADR 5절.
- **화면**: 세력 화면 "내 가문" 칸(창설함·초안·없음), 나라 카드 "가문" 줄(세력 화면 `family` 칸을 실제 자료로), 나라 없는 화면 [가문 창설] → 단계(전에는 곧 열림), 단계 마지막 단추 [가문 창설] + 비용·시민 안내. 운영자 세력 목록에 가문(구성원·유닛 = 가문원, 행성 거르기도 가문원 유닛).
- 설정 칸 6개(팩 `core@65`): `house_found_cost`·`s20_short_min`·`s20_short_max`·`house_rename_wait_ms`·`house_report_daily`·`house_takedown_block`(세력·사회 계수표 `house`, 개발자 패널 세력·사회 페이지).

## 정한 것(기획에 없어 [임시])
- 창설은 WebSocket 명령(세력 행 + 값 = 게임 상태), 정체성 저장은 tRPC 그대로(그림 크기). 화면은 한 번 누르면 저장 → 창설.
- 비용 받는 곳 = 창설자 나라 국고(질문 981). 창설자 귀화 때 가문은 그대로(질문 983).
- 창설 전 저장은 초안: 남에게 보이지 않고 이름 대기 없음.
- 프로토콜 최소 판 = 21(현재 + 직전 1개 원칙 — 시험 `codec.test.ts`가 본다). 통합 담당 지시는 "22 (min 20)"였지만 시험이 최소 = 현재 − 1을 요구한다. 통합 때 다른 줄기의 22와 접는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/factionIdentity.ts`(+시험), `mapUnits.ts`, `ops.ts` | 약어 폭·문제 코드, 가문·비용·폭 조회 칸, 신고·정렬 모양, 한눈 정보 `houseId`, 출처 `player` |
| `packages/protocol/src/house.ts`(+시험), `messages.ts`, `index.ts`, `version.ts` | `house_found`·`house_result`, 프로토콜 22(최소 21) |
| `packages/sim/src/society/coefficients.ts`, `tuningHouse.ts`, `tuning.ts`, `tuningPages.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 6개, core@65 |
| `apps/server/src/db/houseSchema.ts`·`opsSchema.ts`·`schema.ts`, `drizzle/20261111111249_houses/` | 새 표 둘·칸 셋·출처 검사(더하기만) |
| `apps/server/src/factionIdentity/{house,found,gateway,attach,rules}.ts`, `store.ts`, `services.ts` | 창설·옛 정체성 옮기기·게이트웨이·설정값·신고·자동 막기·세력 정체성 같이 바꾸기 |
| `apps/server/src/factionIdentity/house.db.test.ts`(새), `factionIdentity.db.test.ts` | 창설·비용·약어·옮기기·신고·자동 막기 DB 시험, 대기는 창설 뒤로 |
| `apps/server/src/session.ts`, `app.ts`, `trpc/createContext.ts`, `trpc/factionIdentity.ts`, `trpc/ops.ts` | 메시지 연결, 설정값·게이트웨이 잇기(app.ts는 몇 줄만 — 일은 `attach.ts`), report·clearReports·정렬 |
| `apps/server/src/ops/reads.ts`·`services.ts`·`factionProfiles.ts` | 세력 목록 가문(구성원·유닛), `player_owned` |
| `apps/server/src/factionScreen/source.ts`·`overview.ts` | 나라 카드 가문 줄 |
| `apps/game/src/faction/identity/*`(HouseReport·houseCommands 새), `FactionSide.tsx`, `map/UnitControlPanels.tsx`·`unitControl.css`, `map/mapFeed.ts`, `ops/EmblemsTab.tsx`·`FactionDetail.tsx`·`opsUi.tsx`, `messages/{ko,en}.json` | 창설 단계·내 가문 칸·신고 단추·마크 관리·문구(더함 36, 바꿈 9, 뺌 1) |
| `e2e/faction-identity.spec.ts`, `e2e/faction.spec.ts` | 창설·신고·세력 목록 가문, [가문 창설] 링크 |
| `docs/adr/…faction-identity.md`, `docs/questions/…faction-identity.md`, `docs/PLAN.md` | 바뀜 절, 답 표시·새 질문, 14장 줄 |

## 함께 바꿔야 하는 파일
- 가문 행을 만드는 곳을 더하면(가입·마을): `factionIdentity/house.ts`(창설 문장), `house_members`, 세력 정체성 `player` 줄, 운영자 세력 목록(`ops/reads.ts houseMemberOwners`).
- 새 감사 동작 `faction.house_found`·`faction.house_report`·`ops.emblem_reports_clear`를 감사 탭 요약 문장에 넣으려면 `apps/game/src/ops/auditText.ts`(지금은 동작 이름 그대로).
- 가문에 소유 주체를 만들 때(도시를 얻을 때): 시야 묶음(`world/nationVision.ts nationOfOwner`)이 주체 → 세력을 나라로 읽는다 — 봉신이면 `parent_id`로 나라를 따라가게 해야 한다.

## 건드리지 말 것
- 가문 창설이 `faction_members`·`cyborgs.faction_id`를 바꾸게 하지 않는다(나라 시민권 = 시야 공유 D-250).
- 가문에 `world_owners` 줄을 만들지 않는다(국고·도시가 생기는 봉신·독립 단계 전까지).
- `faction_identities.user_id` 열쇠는 이번 판에 지우지 않는다(직전 판 앱이 읽는다 — 다음 배포에서 정리).

## 미검증·TODO·알려진 문제
- 봉신·독립 고르기: 플레이어 도시 창설 명령이 없어 TODO(질문 982). 창설자 귀화 때 가문(질문 983), 가입(985).
- 창설 비용이 0보다 클 때의 실제 원장 흐름(월드 지갑 `attach.ts walletOf`)은 DB 시험에서 가짜 지갑으로만 봤다(Assumed: 원장·세계와 함께 돌리지 않음). 창설 문장 뒤 원장에 쓰는 차례라 원장 쓰기가 실패하면 가문만 남는다(비용 0이면 해당 없음).
- 출시 세계 올리기 조건(931) TODO(질문 984). 운영자 금칙어·이름 고치기(929 다·986)는 다음 줄기.
- 신고 단추는 2차맵 유닛 한눈 정보에만 있다(다른 가문 마크가 보이는 곳이 지금 거기뿐). 화면 시험은 단추를 누르지 않고 tRPC로 신고를 보냈다(남의 유닛을 띄워 누르는 시험은 없음 — Unknown: 단추 화면 동작은 미실행).

## 사용자 결정 대기
- 질문 981~986(`docs/questions/2026-11-11-faction-identity.md`).

## 검사
Verified = 이 작업 트리에서 실행해 결과를 봄(무거운 검사는 `heavy.lock`을 기다려 돌렸다).
- 작업 중: `packages/shared` `factionIdentity.test.ts` 9, `packages/protocol` 전체 22파일 121(새 `house.test.ts` 포함), `packages/sim` tuning 3파일 37, 서버 `src/factionIdentity` 3파일 29(TEST_DATABASE_URL — 새 `house.db.test.ts` 6: 창설 한 번·시민권 그대로·주체 없음, 비용 설정 칸·terms_changed·잔고·나라 국고, 2~4자·옛 5자, 옛 정체성 옮기기, 신고 하루 횟수·한 번·내 가문, 자동 막기 문턱), 서버 `src/ops`·`src/factionScreen`·`resetWorld`·`session` 7파일 50, 게임 `src/faction` 2파일 19.
- `TEST_DATABASE_URL=… pnpm check`: 통과 — 611파일 4,728시험(DB 시험 포함), 포맷·린트·타입·경계·크기·다국어(6,649키)·디자인 값·콘텐츠 팩 core@65.
- `pnpm build` + `node scripts/check-pwa.mjs`: 통과(화면 주소 경로 예 57개). `pnpm check:bundle`: 첫 화면 JS 108,697 B / 상한 131,416 B(상한 그대로).
- `pnpm e2e faction-identity.spec.ts faction.spec.ts ops.spec.ts`: 48시험 통과(2.2분). faction-identity는 창설(WebSocket)·데이터 가문 표지·신고 tRPC·마크 관리 신고 수·신고 차례·세력 목록 가문을 본다. ops.spec 탭 9·권한 체크박스 16은 그대로(탭·권한을 더하지 않았다).
- 사진(저장소 밖 `…/scratchpad/faction-identity-2-shots/`): `fid-step-pastel-ko-390.png`(창설 단계), `fid-card-pastel-ko-390.png`(내 가문 칸), `fid-ops-neon-ko-1440.png`(마크 관리 신고 칸·차례). 나머지 사진은 디스크 때문에 지웠다. 사진 뒤 마크 관리 차례 고르기 모양을 세력 탭과 같게 고쳤다(그 뒤 화면 시험은 돌리지 않음 — 타입·린트·`pnpm check`만).
- `pnpm check:docs origin/main`: 통과.
- 돌리지 않은 것: 나머지 화면 시험, 실제 휴대폰, NAS.
