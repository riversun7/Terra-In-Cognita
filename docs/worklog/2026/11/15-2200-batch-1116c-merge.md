# 2026-11-15 열넷째 묶음 합치기 (채집 3)

- 일시: 2026-11-15 22:00 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-562(1562~1569: NPC 채집도 스탯 티어·맨손 재료·바다 물터·시간당 기대 금액), 줄기 작업 기록 `15-1855-gather-3`, 앞 묶음 `15-2040-batch-1116b-merge`(main bb9d462), 질문 1721~1725

## 한 일
- main bb9d462(묶음 1116b) 위에 `work/gather-3`(16bbf1a, 바탕 32f73d3)을 `--no-ff`로 합쳤다(2e78cdf).
  - NPC 채집도 스탯 티어 표 + 오브젝트 범위(`@terra/shared/npcGatherTiers`), 레벨 0 재료 T0~T1(`bareHandMaterials`), 소금·이탄 T1·화석 T4, 바다 물터, 사이보그 판 최적 작업 = 시간당 기대 금액(`roster/gatherValue.ts`), 설정 칸 10개 지움(`id-changes.json`에 기록).
  - `app.ts`의 사이보그 판 채집 예상·유닛 추천 배선을 `roster/appSources.ts`로 옮김.
- 버전(최종): 프로토콜 38(최소 37, 그대로), 팩 core@105, `SIM_VERSION` 52. 마이그레이션 없음.

## 손으로 푼 곳
- `packages/sim/src/version.ts`: main의 47(경로 다듬기) 설명과 52 설명을 모두 두고 상수 52(큰 값).
- `content/core/manifest.json` 104 → 105. `content/core/tuning.json`·`content/core/id-changes.json`은 충돌 없이 합쳐짐(지운 칸 10개 + 이 묶음 칸 그대로, `pnpm check:content --no-compat` core@105(0d2cdb59827f) 통과).
- 메시지 파일 둘: 양쪽 키 모두(건물 화면 키 뒤에 채집 3 키), paraglide 다시 만듦. `docs/WORKLOG.md`는 받은 쪽 + `pnpm docs:index`.
- `apps/server/src/app.ts`: 자동 합침, 979줄(상한 1,000 안). 배 2·건물 화면의 배선은 옮긴 구역 밖이라 그대로다(Verified: 합친 뒤 `git diff`로 옮긴 구역만 빠진 것을 봄, 타입 검사 통과).
- `e2e/cyborg.spec.ts` "펼친 풀이"(아래 화면 시험): 시험만 고침.

## 리셋 필요 여부: 필요 없음
- 마이그레이션·표 모양 바뀜 없음(Verified: 합친 뒤 `db:generate` "No schema changes", `schema.ts` 안 바뀜). 바다 물터는 팩 끝에 더해 앞 종류 차례가 그대로다(줄기 기록). 지운 설정 칸은 `id-changes.json`으로 옛 덮어쓰기 줄이 잠든다.
- 1116b의 되돌리기 주의(도크의 배는 되돌리기 전에 출고)는 그대로 남는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/version.ts`, `content/core/manifest.json` | 판 합치기 |
| `apps/game/messages/{ko,en}.json`, `docs/WORKLOG.md` | 합치기 충돌 |
| `e2e/cyborg.spec.ts` | 최적 줄이 이미 펼친 광산 줄이면 다시 눌러 접던 것 |

## 함께 바꿔야 하는 파일
- `apps/server/src/app.ts` 979줄, `apps/server/src/db/schema.ts` 998줄 — 더할 것은 새 모듈로.
- 다음 마이그레이션 `prevIds` = 두 끝(`20261115064023_boats_dock_fuel`·`20261115082440_business_shares`, 1116b 기록).

## 건드리지 말 것
- 올라간 마이그레이션 전부.

## 미검증·TODO·알려진 문제
- 검사(Verified, 2e78cdf)
  - `pnpm check`(TEST_DATABASE_URL, 무거운 일 잠금): 735 파일·5,531 시험 통과.
  - `pnpm build`·`node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,050 B / 131,416 B.
  - `pnpm check:content --no-compat` core@105 통과, `db:generate` "No schema changes".
- 사이보그 판 최적 줄의 시세 단위가 화면에 `placeholder_cur_16`(화폐 ID)으로 보였다(Verified: 실패 사진의 접근성 트리 "시간당 기대 금액 3 placeholder_cur_16"). 화폐 이름으로 바꾸는 것은 이 묶음 밖 — main 7e90d86의 돈 표시(`ui/Money.tsx`)와 맞출 일(Unknown: 줄기 화면에서도 그랬는지).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1721~1725(`docs/questions/2026-11-15-gather-3.md`) — 기획 세션에 보낸다.

## 묶음 화면 시험
- 첫 실행(Verified, 29.9분, 2e78cdf): 120개 가운데 117 통과 — gather-expect 7/7, gather-objects 7/7, gather-tiers 12/12, gather 5/5, gather-station 11/11, items 44/44, secondaryStats 7/7, building-screen 5/5, cyborg 19/22.
- cyborg 실패 3개(세 테마 같은 시험 "펼친 풀이", Verified: 실패 기록): 최적 줄(`.combat-best`)이 위에서 이미 펼친 광산 줄이라 시험이 [펼치기]를 다시 눌러 접었고, 금액 줄이 숨어 `toBeVisible`이 실패했다. 최적 줄은 시간당 기대 금액이 가장 큰 줄이라(D-562 1569) 어느 줄이 될지는 시세에 달렸다 — 앱 동작은 의도대로다. 이 세계에서 광산이 최적이 된 까닭은 따로 찾지 않았다(Assumed: 합친 팩·세계의 시작 시세).
  - 고침: 최적 줄이 접혀 있을 때만 펼친다(같은 시험의 낚시터 줄과 같은 방식, `data-open`).
- 다시 돌린 결과(Verified, 2.1분): cyborg 22/22.
- 합계: 아홉 시험 파일 모두 통과(첫 실행 통과 + 다시 돌린 cyborg). 앱 코드는 바꾸지 않았다.

## 배포 (Verified)
- main 10d0f5d, CI 347
  - 첫 실행: 검사 실패 1개 — `apps/server/src/npc/cityBuildUpgrade.db.test.ts` "상한에 닿기 전 나라 목표에 제재소·가마가 들어 지어지고 …(1186 나)" 239줄 `expected undefined to be 'fire_bricks'`(5,531개 중 1개 실패, 734/735 파일 통과).
  - 같은 커밋 로컬 실행 6/6 통과(이 파일만, DB 있음). 1116b CI에서도 통과했다.
  - 실패 작업만 한 번 다시 돌려 통과 → 이미지·NAS 배포 성공(22:39 KST 앱 다시 켬, core@105). 세계는 새로 시작하지 않았다.
  - 원인은 찾지 못했다(Unknown). 가마가 다 지어진 뒤 2시간 안에 도시 경제 생산 목록에 들지 않았다. 의심: 다 지은 시설을 도시 경제에 다시 맞추는 시점(`npc/cityBuild.ts` settle → `economy.refreshCity`)이 묶음 시험 부하에서 흔들림. TODO: 시험을 튼튼하게(목록에 들 때까지 기다리기) 하거나 원인을 찾는다.
- 켠 뒤 7분 nas-metrics(run 43720777959)
  - 메모리: RSS 570~586MB(컨테이너 메모리 59.8%).
  - 이벤트 루프 p99: 첫 1분 3.5ms(최대 128.5ms), 그 뒤 1.0~1.4ms(최대 3.7~25.4ms).
  - DB: 실패 0, 커밋 평균 76~80ms. 경로 대기 p95: 첫 1분 927ms, 그 뒤 0.8~1.0ms.
  - 세계: 도시 49·건물 912·휴먼 2,279, 2차맵 55·유닛 3,297, 세력 16, 도시 경제 시설 304.
  - 캐시: 지형 디스크 캐시에서 416장(새로 만든 것 0, 실패 0), 행성 둘 캐시로 준비.
  - 기기 오류: 0.
