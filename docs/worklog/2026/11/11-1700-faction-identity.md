# 플레이어 세력 정체성 — NPC 국가와 같은 만들기 과정(이름·약어·색·마크), 그림 올리기(자른 256 × 256만), 운영자 마크 관리

- 일시: 2026-11-11 17:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-faction-identity.md`(제안), ADR `2026-11-10-nation-editor.md`·`2026-11-09-faction-profiles.md` "바뀜 (2026-11-11)", 질문 `docs/questions/2026-11-11-faction-identity.md` 926~935, 질문 905 답 표시(`docs/questions/2026-11-10-nation-editor.md`), PLAN 14장, 가지 `work/faction-identity`
- 사용자 답(2026-11-11, 질문 905, 원문): "답2. 플레이어도 npc 세력 구성처럼 세력생성시 동일하게 생성과정 필요. 용량제한걸고 크롭한부분만 저장하는 방법?" — 기획 결정 D-529(미러 `5649349`, main `a90b374` — 이 가지는 그 전 main `8370909`에서 갈라졌다)

## 먼저 확인한 것
- **플레이어가 세력을 만드는 길은 지금 없다**(Verified: 코드 읽기, main `8370909`). `factions`에 줄을 넣는 곳은 NPC 사회 런타임(`apps/server/src/npc/persist.ts`)과 시험 NPC 세력(`world/persist/load.ts`)뿐이고, 세력 화면의 [가문 창설]은 "곧 열림" 단추다. 플레이어는 첫 접속·귀화로 NPC 국가에 들고(`cyborgs.faction_id`·`faction_members`), 이끄는 것은 자기 소유 주체(`world_owners.user_id`) 하나다. `faction_profiles` 줄은 세력 행마다라 플레이어 것이 없다.
- 그래서 정체성 단계를 "지금 플레이어가 이끄는 세력(자기 소유 주체)"에 붙였다. 창설 규칙(비용·조건)은 만들지 않았다(기획 46 §8 "가문 창설 비용" 남은 것) — 질문 926.

## 한 일
- **공용(`@terra/shared`)**: `factionIdentity`(이름 = 사이보그 이름 규칙 + 실존 국가·도시 막기, 약어 2~5자, 색 20개, 마크 사양 검사, 조회·저장·운영 모양), `pngChunks`(PNG 청크 걷기·CRC-32·허용 목록 밖 청크 덜어 내기), 운영 권한 `emblem_moderate`(가벼운 통제), 화면 주소 `/faction/identity`.
- **서버**: 표 `faction_identities`(계정마다 한 줄 — 이름·약어·색·마크 사양·올린 그림 한 장·올리기 막힘·운영자 알림, 마이그레이션 `20261111070140_faction_identities`). 엄격한 PNG 검사(`factionIdentity/png.ts`: 바이트 상한, 서명·청크·CRC·IEND 뒤 바이트, 허용 목록·차례, IHDR, `node:zlib`로 푼 크기·남는 바이트·필터 종류). tRPC `factionIdentity.mine·check·save·dismissNotice`(본인 것만, 한 요청으로 저장, 계정별 속도 제한, 감사 기록), `ops.emblems.list·takedown·setBlocked·setUploadAllowed`. 그림 길 `GET /api/nation-emblems/<sha256>.png`가 플레이어 그림도 준다.
- **정체성 단계 화면** `/faction/identity`(플레이어 화면 층, 지연 조각): "게임에서 보이는 모습"(마크 24·48·128, 세력 카드 줄, 지도 이름표 둘), 이름(+ [이름 만들기] 후보 — NPC 국가와 같은 만들기), 약어(+ 후보), 색 20개, 마크 [자동 생성](다시 만들기·틀·나눔·상징·색 짜임) / [그림 올리기](파일 → 정사각 자르기: 끌기·확대·화살표 키, 24·48·128 미리 보기 → 256 × 256 PNG). 자르기 도구는 따로 지연 조각. 네 가지를 한 번에 저장(건너뛰기 없음). 이름·약어는 정한 뒤 7일 [임시] 동안 잠긴다.
- **세력 화면**: 옆 판 "내 세력 이름과 마크" 칸(마크·이름·약어·[고치기] / [세력 정체성 정하기], 운영자가 내렸으면 알림 + 사유 + [확인]).
- **운영자 콘솔**: 맨 끝 탭 [마크 관리](올린 그림·자동 생성 마크·세력·주인·올린 때·크기·상태, [마크 내리기](사유 + 계정 올리기 막기), [올리기 막기]·[올리기 다시 허용], 스위치 "플레이어 마크 올리기 허용" 기본 허용).
- **마크가 보이는 곳**: 정부 판(행정 건물 판 한 줄·대화상자 — 나라 마크), 2차맵 유닛 한눈 정보(세력 줄에 나라 마크, 유저 유닛이면 "주인 세력: 이름 [약어]" 줄).
- 문서: ADR 새로 하나(제안), ADR 둘에 바뀜 절, 질문 905 답 표시, 질문 926~935, PLAN 14장 줄.

## 정한 것(기획·지시에 없어 [임시])
- 정체성의 주인 = 계정(자기 소유 주체). 세력 행은 만들지 않는다(질문 926).
- 저장은 tRPC(보이는 이름표라 비실시간 기능으로 봄, 프로토콜 판 그대로). 창설 명령이 생기면 그것은 WebSocket.
- 올린 그림은 정체성 줄에 한 장(다시 올리면 덮어씀, 내리면 비움 — 가리키는 곳 없는 그림이 없어 쓸기 불필요).
- 이름 한 언어 한 줄(D-328 해석, 질문 927), 약어 2~5자(기획은 2~4자, 질문 928), 실존 국가·도시 출발 목록 36개(질문 929), 이름·약어 다시 바꾸기 대기 7일(49 S20 값 없음 — 서버 상수, 질문 932).
- 속도 제한: 저장 순간 10번·시간당 20번, 그림 순간 5번·시간당 6번(메모리).
- 운영 권한: 내리기·계정 막기 = `emblem_moderate`(운영자부터), 세계 스위치 = `faction_edit`(관리자·개발자). 스위치는 운영 스위치 표의 줄 `player_emblem_block`(켜짐 = 막음, 줄 없음 = 허용)으로 저장 — `OPS_SWITCHES` 목록은 건드리지 않았다.
- 신고 단추는 넣지 않았다(질문 930). 화폐 칸도 넣지 않았다(유저 세력은 따르는 나라 화폐, 질문 933).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/factionIdentity.ts`·`pngChunks.ts`(+시험), `package.json` | 정체성 규칙·모양, PNG 청크 걷기(새 진입점 둘) |
| `packages/shared/src/ops.ts`(+시험), `routes.ts`(+시험), `mapUnits.ts`, `government.ts` | 권한 `emblem_moderate`, 주소 `faction_identity`, 한눈 정보·정부 판에 마크 칸(선택 칸) |
| `apps/server/src/db/opsSchema.ts`·`schema.ts`, `drizzle/20261111070140_faction_identities/` | 표 `faction_identities` |
| `apps/server/src/factionIdentity/*` | PNG 검사·저장·서비스(+시험 둘) |
| `apps/server/src/trpc/factionIdentity.ts`, `router.ts`, `context.ts`, `createContext.ts`, `ops.ts` | 라우터·맥락(운영자 콘솔과 같은 풀·프리셋·시계), `ops.emblems` |
| `apps/server/src/nationEdit/emblems.ts` | 그림 길이 플레이어 그림도 찾음 |
| `apps/server/src/worldMap/reads.ts`·`mapUnits.ts`, `government/reads.ts` | 한눈 정보의 나라 마크·주인 정체성, 정부 판 나라 마크 |
| `apps/game/src/faction/identity/*` | 정체성 단계·화면·칸·모델(+시험)·문구·CSS |
| `apps/game/src/ui/emblemCrop.ts`·`emblemCanvas.ts`, `editor/nations/nationModel.ts`·`NationCropper.tsx`·`NationEmblemPanel.tsx` | 자르기 셈·캔버스 일을 개발 도구 폴더 밖으로(편집기는 같은 이름으로 다시 받음), 색 20개는 공용 목록 |
| `apps/game/src/faction/FactionSide.tsx`, `shell/routeViews.tsx`, `sections/ComingSoon.tsx` | 세력 화면 칸, 화면 주소 |
| `apps/game/src/ops/EmblemsTab.tsx`, `OpsConsole.tsx`, `opsUi.tsx`, `auditText.ts`, `ops.css` | 마크 관리 탭(맨 끝), 권한 이름 |
| `apps/game/src/map/UnitControlPanels.tsx`·`unitControl.css`, `government/GovernmentDialog.tsx`·`GovernmentSheet.tsx`·`government.css` | 마크 그리기 |
| `apps/game/messages/{ko,en}.json` | 메시지 112개(세력 화면·단계 81, 운영 30, 한눈 정보 1) |
| `e2e/faction-identity.spec.ts`, `e2e/ops.spec.ts` | 화면 시험, 탭 9·권한 체크박스 16 |
| `docs/adr/*`, `docs/questions/*`, `docs/PLAN.md` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 올린 그림 크기·상한을 바꾸면: `NATION_EMBLEM_UPLOAD`(= `FACTION_EMBLEM_UPLOAD`) · 표 검사 `faction_identities_bytes`·`nation_emblems_bytes`(마이그레이션) · tRPC 입력 길이(`FACTION_EMBLEM_BASE64_MAX`).
- 청크 허용 목록을 바꾸면: `FACTION_EMBLEM_CHUNKS`(기기 덜어 내기 + 서버 검사가 같이 쓴다) · `factionIdentity/png.ts orderProblem`의 차례 규칙 · `png.test.ts`.
- 마크 틀·나눔·상징 목록을 바꾸면: 어제 목록(`nationEmblem.ts`·`nationText.ts`·메시지)에 더해 `faction/identity/identityText.ts` 표.
- 색 20개를 바꾸면: `FACTION_IDENTITY_COLORS` 하나(편집기 `READABLE_COLORS`가 이것을 가리킨다). 이미 저장된 색이 목록에서 빠지면 그 플레이어는 다음 저장 때 다시 골라야 한다.
- 운영 권한을 더하면: `OPS_PERMISSIONS`·`OPS_PERMISSION_TIER` · `ops/opsUi.tsx PERMISSION_LABELS` · `ops/auditText.ts PERMISSION_TEXT` · 메시지 · `e2e/ops.spec.ts`의 체크박스 수.
- 세력 창설이 열리면: 창설 명령이 `IdentityStep`을 거치게 하고 `faction_identities` → 그 세력의 `faction_profiles`·마크로 옮긴다(ADR 1절).

## 건드리지 말 것
- `apps/game/src/ui/emblemCrop.ts`·`emblemCanvas.ts`를 `src/editor/` 아래로 되돌리지 않는다: 플레이어 화면 조각이 개발 도구 소스를 가져오면 미리 캐시 검사(`DEV_ONLY_SOURCE`)에 걸린다.
- 운영 스위치 줄 `player_emblem_block`은 "켜짐 = 막음"이다(표의 "줄이 없으면 꺼짐" 때문에 기본 허용을 거꾸로 적었다). `OPS_SWITCHES`에 넣지 않았다(로그 스위치 화면·시험이 그 목록 전체를 본다).
- `factionIdentity.save` 입력에 대상(사용자 ID)을 더하지 않는다 — 늘 본인 것만 다룬다.

## 미검증·TODO·알려진 문제
- 1차맵 도시 이름표·2차맵 유닛 머리 위·랭킹 판에는 마크를 넣지 않았다(질문 935).
- 유닛 한눈 정보의 주인 정체성 줄·정부 판 마크는 화면 시험으로 보지 않았다(타입 검사·기존 단위 시험만 — 화면에서 미실행). 서버 조회에 마크 칸이 실리는지도 단위 시험을 따로 쓰지 않았다.
- Safari·Firefox의 캔버스 PNG가 어떤 청크를 붙이는지 재지 않았다(Unknown). 기기가 허용 목록 밖 청크를 덜어 내므로 받는 데는 문제없을 것으로 본다(Assumed). Chromium(시험 브라우저)은 화면 시험에서 통과.
- 이름·약어 대기 7일과 속도 제한 값은 서버 상수다 → 설정 칸(49 S20)으로 옮기기(TODO).
- 플레이어 정체성과 NPC 세력 정체성(`faction_profiles`)의 이름·약어 겹침은 넣기 전 확인뿐이다(표가 달라 DB 제약으로 묶이지 않는다). NPC 기본 약어 "F<ID>"가 뒤에 생기며 겹칠 수 있다.
- 운영진 올리기(`nations.uploadEmblem`)는 어제 검사 그대로다(엄격한 검사를 같이 쓰게 하는 일은 남김).
- 운영자 감사 기록 탭은 새 동작(`faction.identity_*`·`ops.emblem_*`)을 요약 문장 없이 동작 이름으로 보인다.
- 금칙어(욕설) 목록은 없다(질문 929).

## 사용자 결정 대기
- 질문 926~935(`docs/questions/2026-11-11-faction-identity.md`). 급한 것: 926(세력 창설 규칙 — 정체성을 정하는 것이 곧 가문 창설인가), 931(올리기 스위치 기본값), 930(신고 단추).

## 검사
Verified = 이 작업 트리에서 실행해 결과를 봄. 여섯 줄기가 한 기계를 같이 써서 무거운 검사는 잠금(`heavy.lock`)을 기다려 돌렸다.
- 작업 중 꾸러미 시험(Verified): `packages/shared` `pngChunks.test.ts`·`factionIdentity.test.ts`·`ops.test.ts`·`routes.test.ts` 48시험, 서버 `factionIdentity/png.test.ts` 9시험 + `factionIdentity.db.test.ts` 14시험(TEST_DATABASE_URL — 본인 것만·속도 제한·바꾸기·운영자 내리기·스위치 끔·사칭·대기), `worldMap/mapUnits.test.ts`·`government/reads.test.ts` 16시험, 게임 `faction/identity/identityModel.test.ts` + `editor/nations` 모델 26시험.
- 타입 검사(`@terra/server`·`@terra/game`)·oxlint(바꾼 폴더)·`check:boundaries`·`check:size`·`check:i18n`(6,190키)·`check:contrast`(화면 CSS에 직접 쓴 색·px 없음)·`check:docs origin/main`·`check:wiki`: 통과(Verified).
- 화면 시험 `pnpm e2e faction-identity.spec.ts`: 8시험 통과(Verified, 29.8초 — 빌드 뒤). 보낸 그림이 자른 256 × 256 PNG(원본 600 × 400 아님, 20만 바이트 이하, 허용 청크만)임을 요청 본문에서 확인.
- 사진(저장소 밖, `…/scratchpad/faction-identity-shots/`): `fid-step-pastel-ko-390.png`, `fid-step-dark-en-390.png`, `fid-crop-pastel-en-390.png`, `fid-crop-dark-ko-390.png`, `fid-card-pastel-ko-390.png`, `fid-ops-neon-ko-1440.png`. 눈으로 확인: 파스텔·다크 두 테마의 단계·자르기, 네온 다크의 마크 관리.
- 끝 검사(전체 `pnpm check`, 빌드 + `check-pwa` + `check:bundle`, 화면 시험 `faction-identity·faction·ops·nations·government·unit-control`): 아래 "끝 검사 결과"에 적는다.
