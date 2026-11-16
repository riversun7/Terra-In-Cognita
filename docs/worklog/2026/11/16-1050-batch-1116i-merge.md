# 2026-11-16 묶음 1116i 합치기 (영토 판정 3 · 채집 6 · 전투 3)

- 일시: 2026-11-16 10:50 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `16-0910-territory-3`·`16-0830-gather-6`·`16-0953-combat-3`, 기획 D-568(1922·1923·1927·1930)·답 1862·1864(D-554·D-212)·D-570(1801·1803·1805)·답 1806·1814(D-429·D-557), ADR `2026-11-16-territory-judgement-map.md`·`2026-11-14-second-map-build.md`·`2026-11-07-world-layout.md`·`2026-11-15-gather-object-tiers.md`·`2026-11-15-combat-moves.md`의 "바뀜" 절, 질문 1981~1990(`docs/questions/2026-11-16-territory-3.md`)·1991~1995(`docs/questions/2026-11-16-gather-6.md`)·2001~2010(`docs/questions/2026-11-16-combat-3.md`)

## 한 일
- 통합 가지(main 97141dc + 기획 미러 8557ec7(D-570) a8fbaf1 + 1116h 배포 기록 e4cb300)에 줄기 셋을 차례로 `--no-ff`로 합쳤다.
  1. `work/territory-3`(2cc2edc, 바탕 406f299) → db3f7b9: 새 도시·마을 자리, 시가지(영토 원 ÷ 3), 2차맵 건설 땅(`foreign_territory`)을 1차맵 영토 지도대로 판정. 칸 표 셈은 8ms 조각으로 나눔. tRPC `facilities.landRule` 선택 입력 `x`·`y`, 까닭 `foreign_territory`.
  2. `work/gather-6`(c561766, 바탕 406f299) → f165fd3: NPC가 기를 티어를 세력·지도자 성향 가중으로 고름(1862), NPC도 모듈 재료를 삼(1864). 설정 칸 다섯.
  3. `work/combat-3`(1196e99, 바탕 8ec2da8 = legion-commands-2 끝) → 1d0fd23: 무기 사거리 예산 기본 켬(1814), 밀림 저항 = 효과 사전 데이터(1806, `knockback`·`pull`), D-570 1801·1803(건물도 부딪힘 피해)·1805(거리만·VIT·크기 배율). 설정 칸 여섯 지우고 셋 더함.
- 최종 판: 프로토콜 **47**(최소 **46**, 그대로), 팩 **core@115**(main 114 위로 두 줄기 팩 변경을 함께 — gather-6의 117·combat-3의 118은 쓰지 않음), `SIM_VERSION` **57**(main 56 위로 gather-6과 combat-3를 한 판에. 줄기의 59·60 설명을 57 하나로 묶어 적음. territory-3는 판정 그대로).
- 이번에 처음 main에 오르는 `id-changes.json` 줄 여섯(`moves_resist_cap_pm`·`moves_resist_half`·`moves_resist_str_pm`·`moves_resist_vit_pm`·`moves_body_large_pm`·`moves_body_huge_pm`, 설정 칸 지움)의 `since`를 118 → **115**로. 이미 main에 있던 줄은 그대로.
- 마이그레이션 없음. 합친 뒤 `db:generate` = No schema changes(Verified).

## 손으로 푼 곳
- `docs/WORKLOG.md`(세 번): 받은 쪽 → `pnpm docs:index`.
- `content/core/manifest.json`: gather-6에서 114 / 117 충돌 → **115**. combat-3는 자동 합치기가 118로 덮음 → **115**로 고침.
- `packages/sim/src/version.ts`(두 번): 56 설명은 main 그대로, 57 = gather-6 설명 + "같은 판 57에 전투 3 …"(combat-3 설명), 상수 57. "(56~58은 같은 묶음의 다른 줄기)"·"(58·59는 다른 줄기)" 지움.
- `content/core/tuning.json`: 충돌 없이 자동 합쳐짐 → 칸 ID 기준 3방향(main 97141dc, 각 줄기 바탕 406f299·8ec2da8)으로 다시 셈해 맞춰 봄: 기대 집합과 같음, 겹친 ID 0, 칸 720개, 지운 여섯은 지운 채(Verified, 저장소 밖 스크립트).
- `apps/game/messages/{ko,en}.json`: 충돌 없이 자동 합쳐짐. JSON 유효, 7,982칸 ko·en 일치. 첫 `pnpm check`가 린트에서 새 키(`build_problem_foreign_territory`·`dev_effects_status_knockback`·`dev_effects_status_pull`)를 못 찾아 멈춤(paraglide 생성 파일 오래됨) → `paraglide-js compile`로 다시 만든 뒤 둘째 실행 통과.
- 판 번호 설명 고침(내용은 그대로): `packages/sim/src/combat/curves.ts`·`moveParts.ts`·`tuningMoves.ts` 주석(core@118 → 115), `moves.test.ts`·`testMovesBaseline.ts` 주석(SIM 60 → 57), ADR `2026-11-15-gather-object-tiers.md`·`2026-11-15-combat-moves.md`의 이번 묶음 새 "바뀜" 절(판·id-changes since, combat-moves는 "미러는 아직 이 가지 밖" → 묶음 1116i에서 main에 함께 있음), 질문 `2026-11-16-combat-moves-2.md` 1806 답 줄(core@115), 줄기 기록 `16-0830-gather-6.md`·`16-0953-combat-3.md`의 "판" 줄에 main 판을 한 줄 덧붙임(측정 표의 줄기 판은 그대로).
- 시범 전투 지문·시뮬 골든은 SIM 판을 담지 않아 고칠 것이 없었다(Verified: `moves.test.ts`·`npcGatherTier.test.ts`·`productionSix.test.ts` 42개, 전체 시험 통과).
- **파일 크기**: `npc/runtime.ts` 999, `world/world.ts` 996, `app.ts` 992, `territory/service.ts` 797(`wc -l`). 모두 1,000줄 이하(파일 크기 검사 통과).

## 리셋 필요 여부: 필요 없음 (세 줄기 모두 마이그레이션·저장 모양 그대로)
- **영토 판정은 저장하지 않고 그때 셈한다.** 이미 선 도시·지은 건물·놓인 비콘은 그대로 남고 새 행동부터 새 규칙이다. 다만 운영 세계에서 바로 느껴질 바뀜이 둘 있다:
  - **시가지가 넓어진다**(옛 마을 0.03칸 → 영토 원 ÷ 3, 1.33칸 이상): 도시 2차맵의 건물·가까운 비콘은 safe_zone이라 공성 선포가 생길 때까지 공격받지 않는다(질문 1987).
  - **세력 없는 플레이어는 남의 영토 밖에서만 짓는다**(`foreign_territory`): NAS 세계는 NPC 국가 16 영토가 넓어 세력 없는 플레이어가 지을 땅이 줄어든다. 2026-11-14 사용자 답 "알박기"(세력 없이 남의 땅에 짓기)와 부딪친다 — 질문 1983으로 올림. 리셋해도 풀리지 않는다(규칙 문제).
  - 세계 배치에 지도 판정이 들어가 새 세계·모자란 시작 도시의 자리가 옛 계획과 다를 수 있다(Assumed). 지금 세계는 시작 도시가 다 있어 새로 놓지 않는다(Assumed: 1116h 배포 뒤 도시 49 그대로).
- **NPC 기를 티어**: 지도자 기질·굴림은 저장하지 않고 (세계 시드, 세력·시설)에서 같은 값. 이미 있는 NPC 농장·목장·약초원은 다음 시설 맞추기(짓기 끝·하루 끝)부터 새 기준으로 고른다. 플레이어 시설 티어는 그대로.
- **무기 사거리 예산 기본 켬**: 새로 시작하는 전투부터 사거리 2 이상 무기의 공격 간격이 140~160%(팩 지팡이 사거리 5~7)로 길어진다. 진행 중 전투는 저장된 시작 자료(간격이 사양에 셈해 들어 있음)로 다시 계산해 옛 간격 그대로다. 옛 `battle_reports`를 다시 돌리면 사양을 새로 만드는 경로라면 결과가 다를 수 있다(Assumed — 줄기 기록과 같음).
- 밀림 규칙 바뀜은 팩 스킬에 이동 부품이 없어 지금 전투 결과를 바꾸지 않는다(줄기 Verified: 곡선을 끈 지문 = 바꾸기 전 지문).
- 지운 설정 칸 여섯은 세계 덮어쓰기에 남아 있으면 모르는 칸으로 무시된다(Assumed, 줄기 기록).
- 46판 기기는 그대로 붙는다(프로토콜 그대로). `facilities.landRule`의 `x`·`y`는 선택 입력이라 옛 기기는 옛 판정(도시 2차맵 기준)을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/manifest.json`, `docs/WORKLOG.md`, `packages/sim/src/version.ts` | 합치기 충돌 풀기(위) |
| `content/core/id-changes.json` | 이번에 처음 오르는 줄 여섯 `since` 115 |
| `packages/sim/src/combat/curves.ts`·`moveParts.ts`·`moves.test.ts`·`testMovesBaseline.ts`, `packages/sim/src/tuningMoves.ts` | 판 번호 주석 57·115 |
| `docs/adr/2026-11-15-gather-object-tiers.md`·`2026-11-15-combat-moves.md`, `docs/questions/2026-11-16-combat-moves-2.md`, `docs/worklog/2026/11/16-0830-gather-6.md`·`16-0953-combat-3.md` | 판 번호 설명 57·115 |
| `docs/worklog/2026/11/16-1050-batch-1116i-merge.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- 다음 팩 판은 116, 다음 SIM 판은 58(줄기들이 이미 다른 번호를 적었을 수 있다 — 합칠 때 차례로 맞춘다). 프로토콜 다음 판 48.
- 다음 마이그레이션의 `prevIds`는 1116f의 두 끝(`house_units`·`facility_gather_tier`)을 그대로 포함한다(1116g~1116i는 마이그레이션 없음).
- 파일 크기: `npc/runtime.ts` 999·`world/world.ts` 996·`app.ts` 992 — 새 일은 다른 파일로(territory-3는 `territory/npcHooks.ts`로 뺐다).
- 줄기 기록의 "함께 바꿔야 하는 파일"(영토 모양 `territoryMap.ts` 한 곳, 땅 규칙 까닭 넷, 티어 고르기 시뮬·서버 같은 함수, 난수 흐름 9·10, 상태이상 종류 넷 곳)을 그대로 따른다.

## 건드리지 말 것
- 줄기 기록의 "건드리지 말 것"(이미 선 도시·건물·비콘은 옮기지 않음, 지도자 기질 값의 뜻, 사양 칸 `displaceResistPm`·`displaceSizePm`은 있을 때만)을 그대로 따른다.

## 검사 (Verified)
- `pnpm check`(TEST_DATABASE_URL, DB 시험 포함, 잠금 안): 첫 실행 린트(paraglide 오래됨) → 다시 만든 뒤 둘째 실행 통과: 포맷·린트·타입·경계·크기·다국어(7,981키)·디자인 값·콘텐츠(core@115) 통과, 시험 파일 749/749, 시험 5,647/5,647.
  - gather-6 줄기는 마지막 고침(`productionSix.test.ts`) 뒤 전체 검사를 다시 돌리지 않았다 → 이번 묶음 전체 검사로 확인했다.
- `pnpm check:content 97141dc`: core@115 (1cb9a3b2046c) 단계 1·2·4a·4b 통과.
- `pnpm check:docs 97141dc`: 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,070 B / 상한 131,416 B.
- `pnpm --filter @terra/server db:generate`: No schema changes.

## 화면 시험
- 통합 판(1d0fd23 빌드, 헤드리스, 잠금 안)에서 두 번에 나눠 돌림. 사진: `E2E_SHOTS_DIR`(작업 공간 밖 임시 폴더 `scratchpad/i_shots/`).
  - Verified territory·build-mode·planet-view·battleReport·gather-station·production: 65/65 통과(21.3분).
  - Verified items·battleLab·skills: 75/75 통과(6.0분) — 효과 사전·아이템 편집기 사거리 예산 칸 포함.
  - 합 140 통과·0 실패.

## 미검증·TODO·알려진 문제
- 줄기 TODO는 줄기 기록에 있다. territory — NAS 칸 표 `rasterSliceMs`·세계 배치 `short` 안 잼, 마을 자리 지도 최대 30초 묵음(1986), 세계 배치 지도에 비콘 없음(1985). gather — 서버 NPC 모듈 재료 사기는 시뮬 시험으로만, 세력별 산출 표 없음, D-554 나머지(1995). combat — 크기·보스 사양 생성자 없음, 건물 부딪힘 피해 리플레이 화면 눈으로 안 봄, 무기 예산이 `range_interval` 스킬에 두 번 곱해짐(2008).
- 세 줄기를 함께 돈 운영 세계는 NAS에서 보지 않았다(배포 뒤 nas-metrics). 휴대폰에서 보지 않았다.

## 사용자 결정 대기 (기획 세션에 보낸다)
- 질문 1981~1990(영토 판정 3: 땅 판정 자리, 내 도시 2차맵 가장자리, **1983 세력 없는 플레이어와 "알박기"**, 겹침 기준, 세계 배치 지도, 마을 자리 지도 신선도, **1987 시가지 주인·넓이**, 이동 위험 전쟁 영토, 칸 표 셈, 까닭 이름) — 추천대로 [임시].
- 질문 1991~1995(채집 6: 지도자 성향, 성향 축 치우침, 고르는 방식, 모듈 재료 차례, D-554 도시 성장에도) — 추천대로 [임시].
- 질문 2001~2010(전투 3: 밀림 저항 드는 곳, 스킬별 저항 항목, 건물 부딪힘 피해 양·편, 크기 배율 버림, 보스 저항, 묶기 지속, **2008 무기 예산과 스킬 행동 간격(추천 바꿈)**, 속성 무기, 크리쳐 타고난 무기) — 추천대로 [임시].
