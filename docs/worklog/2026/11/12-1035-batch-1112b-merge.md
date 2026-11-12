# 2026-11-12 넷째 묶음 합치기 (공성 실제 배치·성벽·광석 고도 몫·숙소·운반·배후지 DB)

- 일시: 2026-11-12 10:35 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `12-0930-siege-layout`·`12-0905-ore-share`·`12-0930-worker-logistics`·`12-0920-catchment-db`, 기획 D-533(질문 1016~1065 "일단 진행해라"), 새 질문 1066~1101

## 한 일
- 통합 가지에 줄기 넷을 합쳤다: catchment-db → ore-share → siege-layout → worker-logistics.
- 버전: 팩 core@74(네 줄기 모두 74 — 판 하나로), 프로토콜 25(최소 24, catchment-db의 가문 구인), `SIM_VERSION` 26(ore-share), 마이그레이션 `20261111235133_catchment_stock` 하나(더하기만).
- 손으로 푼 곳
  - `npc/catchmentStore.ts`: catchment-db는 도시 결과를 12칸으로 저장했는데 ore-share가 도시 결과에 땅 몫 여섯(`landPm`)·산지 몫(`highOrePm`)을 더했다 → 19칸으로 늘렸다. 불변 조건 C1도 19칸. 옛 12칸 줄은 모양이 달라 다음 하루 끝에 다시 센다(아직 어느 서버에도 올라가지 않았다).
  - `facilities/npcSeed.ts`: 성벽 고리(siege-layout)가 옛 이름 `starts`를 썼고, catchment-db는 그 목록을 `targets`(시작 도시 + 마을)로 바꿨다 → 성벽은 시작 도시만(`targets.filter(start)`). 숙소 수(worker-logistics, 주거 ÷ 침대)와 마을 씨앗(catchment-db)은 함께 산다: 시작 도시는 `seedPlan(…, { housing, bedsPerLevel })`, 마을은 `villagePlan`.
  - `sim/society/worldSeed.ts`: 숙소 위 끝 8(worker-logistics) + 마을 숙소 1(catchment-db).
  - 시험 기대값: 시작 도시 씨앗 = 행정·창고·숙소 4·농장·벌목장·광산(고도 몫) = 9, 국력 등급 시험은 광산 수 + 숙소 수(주거에서)를 함께.
  - `packages/sim/src/index.ts`가 1,001줄(상한 1,000) → 보관함 내보내기 묶음을 `items/holdingExports.ts`로 옮겼다(962줄). 이름은 그대로 내보낸다.
  - 설정 파일(`bench/tsconfig.json`, `tsconfig.json`, `package.json` 측정 명령), ADR 바뀜 절, `WORKLOG.md`는 두 쪽을 모두 살렸다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/catchmentStore.ts`, `world/invariants.ts`, `db/schema.ts`(주석), `npc/catchmentStore.db.test.ts` | 배후지 결과 19칸 |
| `apps/server/src/facilities/npcSeed.ts`, `npcSeed.test.ts`, `npcSeed.db.test.ts`, `world/nationTiers.db.test.ts` | 성벽·숙소·마을·광산 합치기 |
| `packages/sim/src/index.ts`, `packages/sim/src/items/holdingExports.ts`(새) | 파일 크기 상한 |
| `packages/sim/src/society/worldSeed.ts`, `packages/sim/src/simulator/economy.ts`, `apps/server/src/npc/economy.ts` | 합치기 충돌 |

## 함께 바꿔야 하는 파일
- 도시 배후지 결과(`CityCatchment`, sim `catchmentRun.ts`)에 칸을 더하면 `npc/catchmentStore.ts` 저장 칸·불변 조건 C1을 함께.
- `packages/sim/src/index.ts`는 상한 근처(962줄)다. 새 모듈은 묶음 파일(`export * from`)로 낸다.

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261111235133_catchment_stock`.

## 미검증·TODO·알려진 문제
- 검사(통합 가지, Verified)
  - `pnpm check`: 641 파일 중 1 실패(씨앗 수 기대값) → 고친 뒤 그 파일 8/8 통과. 나머지 4,918 시험 통과.
  - `check:docs`·`check:content`(core@74)·빌드·`check-pwa`·`check:bundle`(첫 화면 108,889 B / 131,416 B) 통과.
  - 화면 시험 11종(world-layout·city-layout·gather-station·faction-identity·production·facilities·nations·ruins·play-map·government·buildings) 112 통과·실패 0.
- NAS 배포(CI 315, 2026-11-12 10:57 KST) 뒤 nas-metrics(Verified): 건물 403 → 790(광산·숙소·성벽 고리가 더해짐), 도시 49·휴먼 1,871 그대로, 시설 274, RSS 540MB(메모리 54%), 루프 p99 3.1 → 1.2ms(켠 첫 1분 최대 484ms), DB 실패 0. 배후지 줄(`catchmentRows`)은 첫 하루 끝(UTC 0시) 전이라 0.
- 세계를 새로 시작하지 않을 때 켤 때 생기는 것(코드로 확인 + 위 건물 수)
  - 기존 시작 도시에 광산(광산을 쓰는 국가)·숙소(주거 ÷ 침대)·성벽 고리가 더해진다.
  - 마을에 행정 건물·숙소가 더해진다.
- 시작 도시 자리는 49곳 중 44곳이 바뀐다(ore-share 측정). 새 자리는 세계 새로 시작 뒤에만 든다 → 사용자 결정 대기.
- 성벽은 제 그림이 없어 길쭉한 작은 집으로 보인다.
- 휴대폰에서 보지 않았다.

- NAS 세계 새로 시작(사용자 답 2026-11-12 "지금 새로 시작"): world-reset 4번(Verified) — 백업 `reset-20261112-032539.dump`, 비우기·다시 켬·헬스(월드 ready)·불변 조건·자동 점검 모두 성공. 10분 뒤 nas-metrics: 도시 49·건물 835·휴먼 1,875, 2차맵 55, 유닛 2,892. 사용자 휴대폰(Whale) 생성 → 세력 → 2차맵 화면 fps 80~120, 기기 오류 0.

## 사용자 결정 대기
- 없음.
