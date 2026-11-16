# 2026-11-16 묶음 1116h 합치기 (D-561 거래소는 건물 · D-558 군단 명령 2단계)

- 일시: 2026-11-16 08:40 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0750-exchange-buildings`·`16-0830-legion-commands-2`, 기획 D-561·D-558, ADR `2026-11-16-exchange-buildings.md`(새)·`2026-10-31-combat-core.md` "바뀜 (D-558 …)"·`2026-11-01-gardener-r5b.md` "바뀜 (D-558 …)"·`2026-11-14-battle-report.md` "바뀜 (D-558 …)", 질문 1941~1953(`docs/questions/2026-11-16-exchange-buildings.md`)·1961~1974(`docs/questions/2026-11-16-legion-commands-2.md`)

## 한 일
- 통합 가지(main abe00de + 1116g 배포 기록 ef48c28 + `work/vision-fix` 합침 406f299)에 줄기 둘을 차례로 `--no-ff`로 합쳤다(둘 다 바탕 abe00de).
  1. `work/exchange-buildings`(61fa9a2) → 65fd834: 물자·외환 거래소를 도시의 건물로(팩 시설 넷 — 물자·외환은 짓기, 유닛·증권은 잠금), 물자 거래소 물건 자리 = 그 건물 창고, 반입은 운반꾼이 실제로 걷는다, 거래소가 없는 도시·화폐는 새 주문 `no_exchange`, 주문 한도 D-148, 켤 때 NPC 도시마다 모자란 거래소를 세움(멱등).
  2. `work/legion-commands-2`(8ec2da8) → 5ff554c: 지휘관 정원 = 작위·전투 랭킹 등급 + 환생 덤(3~10), 승계 순서, 집결·따라가기·대형, AI 전개 방식 8가지, 전투맵 명령 화면(다시보기·3D 관람), 웨이브 수비 = 있는 편성 그대로·상한 60(설정 칸 `d558_wave_defenders_max`), 2차맵 이동 속도 출처(장비·지속형 스킬).
- 최종 판: 프로토콜 **47**(최소 **46**, exchange-buildings 그대로), 팩 **core@114**(main 113 위로 두 줄기 팩 변경을 함께 — legion-commands-2의 115는 쓰지 않음), `SIM_VERSION` **56**(main 55 위로 legion-commands-2 — 줄기의 57 설명을 56으로 고쳐 적음. exchange-buildings는 판정 그대로).
- 이번에 처음 main에 오르는 `id-changes.json` 줄 넷(`c7_command_base`·`c7_command_int_pm`·`c7_command_wis_pm`·`c7_command_points`, 설정 칸 지움)의 `since`를 115 → **114**로. 이미 main에 있던 줄은 그대로.
- 마이그레이션 없음. 합친 뒤 `db:generate` = No schema changes(Verified).

## 손으로 푼 곳
- `docs/WORKLOG.md`(두 번): 받은 쪽 → `pnpm docs:index`.
- `apps/game/messages/{ko,en}.json`(legion-commands-2): 둘 다 파일 끝에 키를 더해 충돌 → 바탕·양쪽 3방향으로 키를 합침(바탕 7,916 + exchange 14 + legion 49 = 7,979칸, 다국어 검사 7,978키 ko·en 일치). legion이 문구를 고친 키 둘(`dev_report_defense_world_hint`·`dev_report_legion_hint`)은 바탕 = exchange 쪽이라 legion 문구로. JSON 유효. 첫 `pnpm check`가 린트에서 새 키를 못 찾아 멈춤(paraglide 생성 파일 오래됨) → `paraglide-js compile`로 다시 만든 뒤 둘째 실행 통과.
- `content/core/manifest.json`: exchange 114 / legion 115 → **114**.
- `content/core/tuning.json`: 충돌 없음(exchange-buildings는 그 파일을 바꾸지 않았다).
- 판 번호 설명 고침(내용은 그대로): `packages/sim/src/version.ts`(57 → 56, "(56은 다른 줄기)" 지움), `packages/sim/src/tuningCommand.ts` 주석(id-changes 115 → 114), ADR `2026-10-31-combat-core.md`·`2026-11-01-gardener-r5b.md`의 이번 묶음 새 "바뀜" 절 머리(SIM_VERSION 57 → 56, id-changes 115 → 114), 줄기 기록 `16-0830-legion-commands-2.md`(SIM 56·core@114로 고치고 그 사실을 머리에 한 줄).
- **파일 크기**: `world/world.ts` 998, `app.ts` 991, `facilities/service.ts` 983, `shared/battleReport.ts` 995, `sim/index.ts` 986(`wc -l`). 모두 1,000줄 이하(파일 크기 검사 통과).

## 리셋 필요 여부: 필요 없음
- 저장 모양(표·칸)이 그대로다(마이그레이션 없음). 거래소 건물은 이미 있는 시설 줄·건물 칸이다.
- **거래소 없는 도시는 물자 주문을 받지 않는다**(`no_exchange`, 거두기는 됨). 외환도 그 화폐 나라에 외환 거래소가 있어야 한다. 그래서 배포 직후 플레이어 도시(거래소를 아직 짓지 않은 곳)에서는 새 물자 주문이 막힌다 — 의도한 D-561 동작이다. 플레이어가 물자 거래소를 지으면 열린다.
- **NPC 도시는 켤 때 거래소가 선다**: 세계 씨앗이 시작 도시마다 물자·외환, 마을마다 물자 거래소를 모자란 것만 다 지은 채 세운다(멱등, 줄기 `npcSeed.db.test.ts` 빈 세계·옛 세계·다시 켬 Verified). 걸린 주문은 에스크로가 도시 자리라 그대로 남고, 끝나면 유저 몫은 그 도시 거래소 건물 창고로 간다. 도시 창고에 있던 유저 물건은 그대로 — 팔려면 [거래소로] 실어 나른다.
- **웨이브 수비 정원 60**(옛 10명 고정): SIM 56부터 새로 여는 웨이브는 있는 편성 그대로(세계 휴먼은 개별)·최대 60명이 지킨다. 정원사 웨이브 결과·판정 비용이 달라진다(C16a 재맞춤 전, 질문 1970). **NAS는 웨이브 꺼짐**(`GARDENER_WAVES=0`)이라 지금 운영 세계에는 영향이 없다(Assumed: compose 값 그대로).
- 진행 중인 세계 전투는 저장된 시작 자료·입력으로 다시 계산해 이어진다. 명령 없는 전투는 결과가 같다(옛 지문 넷 그대로, 줄기 Verified). 옛 `battle_reports`를 다시 돌리면 정원(계급 없는 유닛 3)·실제 도시 수비가 달라 결과가 다를 수 있다.
- 지운 설정 칸 넷(C7 지휘 점수)은 세계 덮어쓰기에 남아 있으면 모르는 칸으로 무시된다(Assumed, 줄기 기록).
- 46판 기기는 47 서버에 그대로 붙는다(새 결과 코드는 46판에 낮춤). 45판 이하는 인사에서 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/messages/{ko,en}.json`, `content/core/manifest.json`, `docs/WORKLOG.md` | 합치기 충돌 풀기(위) |
| `content/core/id-changes.json` | 이번에 처음 오르는 줄 넷 `since` 114 |
| `packages/sim/src/version.ts`·`tuningCommand.ts`, `docs/adr/2026-10-31-combat-core.md`·`2026-11-01-gardener-r5b.md`, `docs/worklog/2026/11/16-0830-legion-commands-2.md` | 판 번호 설명 56·114 |
| `docs/worklog/2026/11/16-0840-batch-1116h-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 프로토콜 판(48)은 최소 47 또는 46을 그 줄기가 정한다. 46판 낮춤은 `market/gateway.ts`·`facilities/gateway.ts`.
- 다음 팩 판은 115, 다음 SIM 판은 57(이번에 쓰지 않은 번호를 줄기들이 이미 적었을 수 있다 — 합칠 때 차례로 맞춘다).
- 다음 마이그레이션의 `prevIds`는 1116f의 두 끝(`house_units`·`facility_gather_tier`)을 그대로 포함한다(1116g·1116h는 마이그레이션 없음).
- 파일 크기: `world/world.ts` 998·`app.ts` 991·`shared/battleReport.ts` 995·`sim/index.ts` 986·`facilities/service.ts` 983 — 새 일은 다른 파일로.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"(명령 없는 전투 상태 모양, `legionPartiesMax` 20은 옛 기록 읽기용, 시뮬은 거래소 `holdingOf`를 쓰지 않음)을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 첫 실행 린트(paraglide 오래됨) → 다시 만든 뒤 둘째 실행 통과: 포맷·린트·타입·경계·크기·다국어(7,978키)·디자인 값·콘텐츠(core@114) 통과, 시험 파일 749/749, 시험 5,630/5,630.
  - exchange-buildings 줄기는 마지막 고침(`station.ts`·e2e·`build.css`) 뒤 전체 검사를 다시 돌리지 않았다 → 이번 묶음 전체 검사로 확인했다.
- `pnpm check:content abe00de`: core@114 (4236d54e8e51) 단계 1·2·4a·4b 통과.
- `pnpm check:docs abe00de`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,070 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- 통합 판(5ff554c 빌드, 헤드리스, 잠금 안)에서 세 번에 나눠 돌림. 사진: `E2E_SHOTS_DIR`(작업 공간 밖 임시 폴더 `scratchpad/1116h-shots/`). `market` spec은 저장소에 없다 — 거래창은 `economy`가 본다.
  - Verified economy·build-mode·facilities·building-screen: 42/42(17.2분) — 거래소 안내·잠긴 거래소 줄 포함.
  - Verified battleLab·battleReport·battle-replay: 42 통과·2 건너뜀(측정 `E2E_MEASURE=1` 전용, 4.8분) — 3D 관람 명령 줄 포함.
  - Verified vision: 12 통과·1 건너뜀(측정, 14.3분). **"경계 너머 보기"(끌어서 이웃 2차맵 위로) 통과** — 1116g에서 시간 초과로 실패하던 시험을 `work/vision-fix`(확대 사다리로 3/6까지 멀리 본 뒤 끌기)가 고친 것을 통합 판에서 확인했다.
  - 합 96 통과·3 건너뜀·0 실패.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. exchange — 반입 운반 중 짐은 메모리(1953), 배치 유닛 목록 화면 없음, 환전 화면 "외환 거래소 없음" 알림은 e2e 세계에 늘 거래소가 있어 보지 않음, 잠긴 줄 점선 테두리 사진 없음. legion — 실제 세계 전투에 플레이어 명령을 넣는 길(WS) 없음(1969), 작위 없음(1961), 전개 방식 수치 코드 상수 [임시](1963), 0이 아닌 장비 이동 속도 미시험.
- 두 줄기를 함께 돈 운영 세계(NPC 거래소 씨앗 + 군단 정원)는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 1941~1953(거래소 건물: 거래소 없는 도시의 거래, 도시마다 몇 개·누가 짓나, 물건 자리, 주문 한도 식, NPC 물건 자리 등) — 추천대로 [임시].
- 질문 1961~1974(군단 명령 2단계: 작위, 전개 방식 수치, 신전 축복, 실시간 전투 명령 길, 웨이브 수비 상한 재맞춤 등) — 추천대로 [임시].

## 배포 (Verified)
- main 97141dc, CI 354: 검사·이미지·NAS 배포 성공(2026-11-16 09:55 KST 앱 다시 켬, core@114, 프로토콜 47·최소 46). 세계는 새로 시작하지 않았다.
- 켠 뒤 5분 nas-metrics(run 43783700687): RSS 550~562MB(컨테이너 메모리 56.0%), 루프 p99 첫 1분 4.1ms(최대 586ms — 켤 때 거래소 씨앗 등) → 그 뒤 1.0~1.5ms(최대 10~49ms), DB 실패 0·커밋 평균 71~83ms, 경로 대기 p95 첫 1분 1,396ms → 0.9~1.0ms. 기기 오류 0, 경고·오류 줄 0.
- 세계: 도시 49·**건물 913 → 1,011(+98)**, 휴먼 2,279 → 2,258, 유닛 3,297 → 3,276, 2차맵 55, 세력 16. 건물 +98은 켤 때 NPC 도시 거래소 씨앗(시작 도시 물자·외환, 마을 물자)으로 본다(Assumed — 종류별로 세지 않음). 휴먼 −21은 이 배포와 무관한 NPC 수명·사망으로 본다(Assumed).
