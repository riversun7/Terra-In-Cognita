# D-523 기획 답 따라 다섯 줄기 합치기 (NPC 휴먼·지도자·국적·옆 2차맵 띄우기·농장 채집소)

- 일시: 2026-11-08 15:00 (KST)
- 작업 도구: Claude Code
- 관련: 통합 가지 `merge/integration`(시작 = main 3d6ad70, 미러 6853a48). 기획 D-523 포인터(질문 720~763 기획 정리, 모두 기술 추천). ADR `2026-11-07-play-flow.md`(WP-NPC2·WP-NPC3·WP15)·`2026-11-08-citizenship.md`·`2026-11-07-gather-objects.md`(바뀜 756 ②)

## 한 일
- 다섯 줄기를 합쳤다. 앞 줄기가 합쳐질 때마다 남은 줄기가 통합 가지를 먼저 받아(합침 커밋) 그 위에서 끝 검사를 돌리게 해서, 뒤 셋은 빨리감기로 올렸다.
  1. `work/farm-station` (1422f9f): 충돌 없음.
  2. `work/npc-leader` (3854aac): 충돌은 목차뿐. 프로토콜 18(최소 17, 유닛 움직임의 `kind` 칸).
  3. `work/citizenship` (7c4d141, 통합 7c80aa9 합침): 빨리감기. 새 표 `nationality_changes`(마이그레이션 20261108035507), core@53.
  4. `work/map-spawn` (63bdddd, 통합 7c80aa9·7c4d141 합침): 빨리감기. 2차맵 만들기를 `world/mapFactory.ts`로 옮김(world.ts 913줄).
  5. `work/npc-humans` (2f74466, 통합 63bdddd까지 합침): 빨리감기. 마이그레이션 20261108045203(칸 둘 더하기만).
- 판: 프로토콜 18(최소 17), 팩 core@53, `SIM_VERSION` 20 그대로, 마이그레이션 둘(모두 더하기만).
- 묶음 검사:
  - `pnpm check`: npc-humans 줄기가 묶음 머리(2f74466)에서 돌림, 시험 532파일 4,050개 통과(DB 시험 포함).
  - 통합 가지 머리에서: `check:docs`·`check:content`(core@53) 통과, 빌드·`check-pwa` 통과, `check:bundle` 첫 화면 JS 106,427 B / 상한 131,416 B.
  - 화면 시험 12파일(map-travel·citizenship·gather-station·map-input·building-art·vision·play-map·faction·gather·labor·smoke·first-login): 118개 중 116 통과·1 건너뜀(측정용)·1 실패.
  - 실패 1개(`play-map.spec.ts` "볼 수 없는 2차맵"): 같은 나라 시야 공유(746 나) 뒤로 내 나라 도시는 모두 볼 수 있어서, 시험이 고르는 "볼 수 없는 도시"가 먼 다른 나라 도시(길 65장, 띄우지 않은 2차맵 61장 건너뜀)가 됐다. 시험이 "건너뛰는 2차맵 0"을 기대했다 → 건너뛰는 수 ≤ 길 수로 고침(시험만). play-map 다시 돌림: 결과는 아래 "고친 뒤".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/play-map.spec.ts` | 같은 나라 시야 공유 뒤로 볼 수 없는 도시가 다른 나라 도시라 건너뛰는 2차맵이 생긴다 |
| `docs/WORKLOG.md` | 목차 |

## 함께 바꿔야 하는 파일
- 프로토콜을 다시 올리면 `packages/protocol/src/version.ts`의 18판 설명(유닛 종류·귀화)을 보고 합친다.
- `apps/server/src/db/schema.ts` 958줄, `secondMap.ts` 약 960줄, `app.ts` 928줄: 1,000줄 넘으면 CI 실패.

## 건드리지 말 것
- 마이그레이션 20261108035507·20261108045203은 올린 뒤 고치지 않는다.

## 미검증·TODO·알려진 문제
- NAS: 봇(`S1_TEST_BOTS` 1,000)은 이제 시험 2차맵 줄에만 선다. 도시의 옛 봇 휴먼(약 646)은 지우지 않으므로 배포 뒤 유닛이 약 1,000 → 약 1,650으로 는다(Assumed: 맵마다 모자란 봇만 채우는 `spawnBots` 코드로 셈). 경로 요청은 npc-humans 줄기 추정 약 1.45배. 배포 뒤 `nas-metrics`로 루프·RSS·`visionTickMaxMs`를 본다.
- 그때 띄운 2차맵에는 NPC·크리쳐가 없다. 상한 32장·10분은 [임시].
- 귀화 값은 시험 화폐(세력 화폐·테라코인 없음). 화면 시험은 귀화 성공을 그리지 않는다(DB 시험만).
- 지도자 이름·시장 규칙·처음 인구 비율은 [임시].
- 질문 770~775·780~783·790~797·800~806·810~813은 기획 세션에 보낸다.

## 사용자 결정 대기
- 없음.
