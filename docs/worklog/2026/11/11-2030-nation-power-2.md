# 국력 등급 916~925 답 반영 — 경비대 다시 채우기(920 나)·경비대 표시(920 라)

- 일시: 2026-11-11 20:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-10-nation-editor.md` "바뀜 (2026-11-11, 916~925 답)", 질문 `docs/questions/2026-11-11-nation-power.md`, 기획 D-529 포인터(60 §7.1), 앞 줄기 작업 기록 `11-1745-nation-power.md`, 가지 `work/nation-power-2`(바탕 통합 `fc007ff509`, 중간에 `origin/merge/integration` `d599a44150` 합침)

## 한 일
- **답 기록**: 916·917·921·922·923·924·925 가(그대로), 920 나 + 라. 918·919(NAS 반영·국가 수)는 사용자에게 묻는 중이라 NAS 세계·`ops/compose.yml` 국가 수는 건드리지 않았다. 921 가 = 세계 씨앗이 세운 시작 도시는 모두 D-341 보호(지금 동작 그대로).
- **경비대 다시 채우기(920 나)**: NPC 구인 규칙식 `recruitPicks`(`packages/sim/src/npc/policy.ts`)에 경비대 수·목표를 넣었다. 목표보다 적으면 모자란 수만큼 먼저(좋은 카드부터) 경비대로 사고, 같은 카드 값·예비금 규칙을 쓴다(돈이 없으면 사지 않음). 경비대도 휴먼이라 산 만큼 휴먼 목표의 모자람도 준다. 경비대 채우기는 주거 목표와 따로다. 판단마다 도는 `npcRun.ts` 구인이 세력 칸 `SimFaction.guardsPerCity`(등급 값)로 부르고, `society.recruit(…, guard)` → `societyRecruit.hire`가 직무 없는 경비대 휴먼을 만든다. 서버 NPC 사회 런타임은 같은 `decide`를 부르므로 같은 함수다. 서버는 켤 때 고정 국가마다 `nationStartOf(자기 프리셋).guardsPerCity`를 넣는다. 저장은 원래 길(휴먼 행 + 쓰기 표 `humanGuard`, 도시 둘레 봇)을 탄다.
- **경비대 표시(920 라)**: 한눈 정보(`world.unitGlance`)에 `guard: true`(`@terra/shared/mapUnits`), 서버 `worldMap/reads.ts`가 거울 세계 `SimUnit.guard`를 읽는다. 기기는 남의 유닛 정보 판 제목의 종류 자리에 "경비대"/"Guard"(`map_unit_guard`)를 쓴다. 프로토콜은 그대로(tRPC 길이 있다).
- 시뮬 `SIM_VERSION` 23 → 24, 출력 형식 15 → 16(요약 `npc.guardRefills`).

## 정한 것([임시])
- 채우는 도시 = 그 세력이 가진 모든 도시(빼앗은 도시도 그 세력 등급 값까지). 반란·마을 세력·등급 없는 국가는 목표 0.
- 경비대 몫을 휴먼보다 먼저 산다(좋은 카드가 경비대로 간다).
- 지도 위에 늘 붙은 경비대 표시는 두지 않았다(NPC 휴먼은 지도 위 이름표가 없다 — 이름처럼 고른 유닛의 정보 판에서만). 근처 판 유닛 줄은 여전히 "유닛 #번호".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/policy.ts`(+시험) | `recruitPicks`가 경비대 몫을 먼저 고르고 `{ slot, guard }`를 돌려준다 |
| `packages/sim/src/simulator/npcRun.ts` | 구인이 도시별 경비대 수·`guardsPerCity`를 넘기고 경비대로 산다, 셈 `guardRefills` |
| `packages/sim/src/simulator/world.ts` | `SimFaction.guardsPerCity`, 시나리오 `guards`에서 넣음 |
| `packages/sim/src/simulator/society.ts`·`societyTypes.ts`·`societyRecruit.ts` | `recruit`·`hire`의 `guard` 인수(직무 없음 + 경비대 표시) |
| `packages/sim/src/simulator/run.ts`·`version.ts` | 출력 형식 16·`SIM_VERSION` 24 |
| `packages/sim/src/simulator/guards.test.ts` | 판단 한 번에 다시 채움·값 소각·상한·국고 없음·목표 없음 |
| `apps/server/src/npc/runtime.ts` | 고정 국가 `guardsPerCity` = 자기 프리셋 등급 값 |
| `apps/server/src/world/nationTiers.db.test.ts` | DB 시험: 다시 채움·값 소각·표시 저장·상한·국고 없음·다시 켜도 그대로·한눈 정보 `guard` |
| `packages/shared/src/mapUnits.ts`, `apps/server/src/worldMap/mapUnits.ts`(+시험)·`reads.ts` | 한눈 정보 `guard` |
| `apps/game/src/map/mapUnits.ts`(+시험), `messages/{ko,en}.json` | 정보 판 제목 "경비대" |
| `e2e/government.spec.ts` | 수도 경비대 한눈 정보·정보 판 제목 |
| `docs/adr/2026-11-10-nation-editor.md`, `docs/questions/2026-11-11-nation-power.md`, `docs/PLAN.md` | 답 기록 |

## 함께 바꿔야 하는 파일
- `recruitPicks` 반환 모양을 바꾸면 `npcRun.ts` 구인과 `policy.test.ts`.
- 경비대 목표 출처를 바꾸면(예: 등급 표 칸 이름) 서버 `npc/runtime.ts`의 `guardsPerCity` 넣는 곳과 시뮬 `world.ts`.

## 건드리지 말 것
- NAS 세계·`ops/compose.yml` `NPC_TEST_NATIONS`(918·919 사용자 답 대기).

## 미검증·TODO·알려진 문제
- NAS·실제 서버에서 돌리지 않았다(Unknown): 다시 채우기가 국고를 얼마나 쓰는지·하루 구인 수.
- 서버 DB 시험의 "국고 없음"은 국고를 비우고 지분도 다른 나라로 넘겨 판단이 지분을 팔지 못하게 했다(지분을 팔아 국고가 차면 채운다 — 처음 실행에서 그렇게 채웠다, Verified). 정확한 "돈 없으면 안 산다"는 시뮬 시험·규칙식 시험이 본다.
- 이름표(지도 위 늘 붙은 표시)·근처 판 줄에는 경비대 표시가 없다(정보 판 제목만). `character-3d-2` 줄기의 묶음 조회가 들어오면 거기에 실을 수 있다.
- `war16` 30일 걸린 시간 약 2분 25초(앞 줄기 약 2분 56초).

## 사용자 결정 대기
- 918(NAS 시험 세계 반영 방법)·919(NAS 고정 국가 수).

## 검사
Verified = 이 작업 트리에서 실행해 결과를 봄(통합 `d599a44150`을 합친 뒤).
- `TEST_DATABASE_URL=… pnpm check`: 통과 — 609파일 4,723시험(DB 시험 포함).
- `pnpm build` + `node scripts/check-pwa.mjs`: 통과. `pnpm check:bundle`: 첫 화면 JS 108,654 B / 상한 131,416 B(상한 그대로).
- 따로 돌린 시험: `@terra/sim` 전체 93파일 739시험, `world/nationTiers.db.test.ts` 4시험(새 시험 하나 포함), `worldMap/mapUnits.test.ts`·게임 앱 `map/mapUnits.test.ts` 각 11시험.
- `pnpm e2e government.spec.ts --grep 경비대`: 1시험 통과(수도 경비대 한눈 정보 `guard`, 일하는 휴먼은 표시 없음, 근처 판에서 누르면 정보 판 제목 "경비대"). 사진은 찍지 않았다(디스크 여유 — 제목 글자 한 낱말만 바뀜). 다른 spec은 돌리지 않았다.
- 시뮬 `pnpm --filter @terra/sim sim war16 --days 30`: 불변 조건 위반 0(30번 검사), 해시 `351b3805`, 구인 1,529장 가운데 경비대 다시 채움 104. 묶음별 처음 → 끝(도시 · 경비대, 경비대 상한 = 끝 도시 × 등급 값):
  | 묶음 | 도시 | 경비대 | 경비대 상한 | 앞 줄기(다시 채우기 전) 경비대 끝 |
  |---|---|---|---|---|
  | 초강대국 ×2 | 12 → 13 | 60 → 63 | 65 | 60 → 36 |
  | 강대국 ×3 | 12 → 17 | 48 → 63 | 68 | — |
  | 중견국 ×5 | 15 → 19 | 45 → 52 | 57 | — |
  | 소국 ×4 | 8 → 5 | 16 → 10 | 10 | — |
  | 도시국가 ×2 | 2 → 2 | 8 → 8 | 8 | — |
  고정 세력은 모두 살아 있다(2·3·5·4·2). 유닛 끝 741·714·698·156·96.
