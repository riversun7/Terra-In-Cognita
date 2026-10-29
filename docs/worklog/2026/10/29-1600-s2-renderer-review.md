# S2 렌더러 검토 반영: 치마 바닥, 큰 행성 고르기, 받기 시간 제한, 타일 메모리, 가장 높은 땅, 가짜 행성 ADR 규칙

- 일시: 2026-10-29 16:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안. 끝에 "구현하며 정한 것 (렌더러 검토 반영)"을 덧붙이고 렌더러 줄을 고침), 작업 기록 `2026/10/29-1130-s2-renderer.md`(렌더러), `2026/10/29-1250-s2-integration.md`(통합)
- 작업 브랜치 `worktree-wf_855dd1b7-352-3`. 통합 main(523f373)에서 시작해 main 5ea990f(문서 2개)로 다시 얹었다. 새 런타임 의존성 없음.

## 한 일
- 렌더러 검토 지적 9개를 처리했다(지적별 처리는 ADR 36 "구현하며 정한 것 (렌더러 검토 반영)").
  - 1(major) 치마: 모든 타일이 같은 바닥(해수면 − (가장 거친 1차맵 단계 마디의 활꼴 깊이 + 30m), F = 9에서 420.9m)까지 내린다. 셰이더는 uniform 하나를 쓰고, 과장을 바꿀 때 타일마다 고치던 일을 지웠다.
  - 2 이진 해석 이음매: 통합(main `9baf2f1`)에서 이미 이어져 있었다. ADR 줄만 고쳤다.
  - 3 가장 높은 땅: 받은 타일의 가장 높은 꼭짓점까지 늘린다(낮추지 않는다). 목록 정보 값은 타일·서버 작업과 맞출 이음매로 남겼다.
  - 4·6 큰 행성 상한: 렌더러는 면 레벨 4~11만 받고(그 밖은 오류 상태), 고른 수가 상한을 넘으면 상한 도달로 센다.
  - 5 가짜 행성·틈 증거: 가짜 행성 타일을 서버 굽기와 같은 `@terra/planet` 코드로 만든다(면 레벨 F 칸 값 → 2×2 모으기 → 꼭짓점 평균). 틈 시험은 서버 타일로, 레벨이 둘 이상인 사진만 센다. 시험이 틈을 찾는지 대조 빌드로 확인했다(아래).
  - 7 자료 없는 꼭대기: 그릴 수 있는 자식을 모두 넘긴다(첫 단계 하나가 없어도 면 전체를 버리지 않는다).
  - 8 받기 시간 제한 15초: 멈추고 실패로 센 뒤 1~30초 뒤 다시 받는다. 화면이 멈춰 있어도 그때 깨운다.
  - 9 메모리: 상한(`budgets.memoryBytes`)에 GPU 추정 + three가 들고 있는 JS 사본 + 풀어 둔 타일을 센다(올린 타일 하나 108,522바이트, 64MB에 약 618개).
- 통계·시험 화면: 단계별 그린 타일 수, 타일 메모리, 가장 높은 땅(`data-levels`·`data-memory-bytes`·`data-max-elevation`, HUD "타일 메모리").
- HUD: 영어에서 성능 줄이 값과 단위 사이에서 갈리는 것을 줄바꿈 없는 공백으로 막았다.
- 단위 시험을 더했다: 치마(`skirt.test.ts`, 새 파일), 큰 행성 고르기, 받기 시간 제한, 메모리 셈, 가장 높은 꼭짓점, ADR 규칙 가짜 타일. 새 행동 시험 둘(첫 단계 하나 빠짐, 면 레벨 12 상한 도달)은 고치기 전 코드에서 실패하는 것을 봤다.
- 틈 시험을 다시 만들었다(저장소 밖 Playwright 스크립트). 위에서 본 화면·받는 중 화면은 치마를 꺼도 자홍이 0이라 틈을 못 본다는 것을 대조 빌드로 알았다. 그래서 고운 타일 일부를 503으로 실패시켜 레벨 경계를 가까이 붙잡는 단계(F)를 더했다.
- 가지를 main 5ea990f(문서 커밋 2개) 위로 다시 얹었다(충돌 없음).

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9, Playwright 1.63 Chromium(SwiftShader WebGL), PostgreSQL 16)
| 항목 | 결과 |
|---|---|
| `pnpm --filter @terra/game typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 파일 109개, 시험 959개(DB 시험 포함). 다국어 키 224개, 대비 136쌍 |
| `node scripts/check-docs.mjs origin/main` | 통과 |
| `pnpm docs:index --check` | 통과(목차를 다시 만든 뒤) |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과 |
| 빌드 서버 + 일회용 DB(`terra_s2fix_1`, 가짜 계정만) | `NODE_ENV` 비움, `BETTER_AUTH_URL=http://127.0.0.1:4380`, 무작위 비밀값(저장소 밖), 행성 캐시 폴더(저장소 밖) |
| Playwright 기본 묶음(390×844, 파스텔·다크 한국어, 파스텔 영어) | 33개 모두 통과(HUD 문구를 고친 마지막 빌드에서 다시 실행): 지연 로딩, 누름 → 준비 2,427ms·첫 표시 1,398ms, 궤도 62/160·단계별 합 = 그린 타일, 돌리기·확대·두 손가락·두 번 누르기·누르기, 기후 레이어, 과장 20, 컨텍스트 손실 → 복구, 1차맵 → 2차맵 → 1차맵, 다크, 영어 |
| 열기·닫기 10번 + 성능 | 8개 통과 |
| 사진(파스텔·다크 거리 5곳 + 고른 칸 + 과장 15 + 기후, 영어 1장) | 3개 통과. 영어에서 그린 타일이 가장 많을 때(757km) HUD 넘침 없음 2개 통과 |
| 틈 묶음(고친 빌드) | 레벨이 둘 이상인 사진 45장 자홍 0(위에서 봄 16, 받는 중 5, 고운 타일 일부 실패 24). 콘솔 오류 0(일부러 준 503 빼고) |
| 틈 대조(치마 끈 빌드) | 고운 타일 일부 실패 24장 중 12장에 자홍(×20은 12장 중 11장, 가장 많은 사진 2,319화소). 위에서 봄 16장·받는 중 7장·받기 끝난 가까운 화면 36장은 0 |
| 틈 대조(검토 전 빌드 main `523f373`) | 고운 타일 일부 실패 24장 자홍 0 |

- 사진을 눈으로 봤다: 파스텔(궤도, 가까이 과장 15), 다크(궤도, 지역, 가까이 고른 칸, 기후), 영어 2장(지역 고른 칸, 그린 타일이 가장 많을 때 HUD), 틈 사진(대조 빌드에서는 해안의 타일 경계에 자홍 선이 보이고, 고친 빌드의 같은 자리에는 없다). 테마·문구·HUD 줄바꿈 말고 달라진 것은 보이지 않았다.
- 성능·메모리 수치는 ADR 36 "렌더러 검토 반영 — 잰 값"에 적었다(헤드리스 SwiftShader라 휴대폰 값이 아니다).
  - 첫 표시(HUD) 1,167~1,460ms, 그린 타일 늘 160 이하(가장 많을 때 757km 156개), 타일 메모리는 618개·64.0MB에서 멈춘다.
  - 첫 화면 JS 372,600바이트 그대로(three 없음). 1차맵 조각 55,058 → 56,642바이트.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/tileShape.ts` | `coarsestSagM`·`skirtDepthM`·`SKIRT_MARGIN_M`: 모든 타일이 같이 쓰는 치마 바닥 |
| `packages/engine/src/planet/planetMaterials.ts`, `planetView.ts` | 셰이더 치마 = −uSkirtDepth(uniform 하나), 타일마다 치마를 고치던 `updateSkirt` 삭제. GPU 타일에 JS 사본 바이트 |
| `packages/engine/src/planet/tileMesh.ts`, `surfaceLookup.ts` | `vertexLiftM`(셰이더와 같은 올림 식), `decodedTileBytes` |
| `packages/engine/src/planet/lodSelect.ts` | 자료 없는 마디는 그릴 수 있는 자식을 넘김, 상한을 넘으면 상한 도달 |
| `packages/engine/src/planet/planetTypes.ts`, `index.ts` | `DEFAULT_MAX_ELEVATION_M`, `MAX_RENDER_FACE_LEVEL`, `planetDescriptionProblem`, 상한 `memoryBytes`(이름 바꿈), 통계 `tilesDrawnByLevel`·`memoryBytes`·`maxElevationM` |
| `packages/engine/src/planet/tilePipeline.ts` | 받기 시간 제한 15초(`FETCH_TIMEOUT_MS`), 타일별 메모리 추정, 가장 높은 꼭짓점 기억 |
| `packages/engine/src/planet/planetEngine.ts` | 설명 검사(오류 상태), 가장 높은 땅 = max(설명, 받은 타일), 치마 바닥 넘기기, 단계별 그린 타일 수 |
| `packages/engine/src/mock/{mockPlanet,mockPlanetSource,mockPlanetWorker,mockNoise,index}.ts` | [임시] 가짜 행성: 면 레벨 F 칸 값 → `@terra/planet` 타일 코드(ADR 36 규칙). 노이즈 풀어 쓰기(값 같음) |
| `packages/engine/src/planet/skirt.test.ts`(새 파일), `lodSelect.test.ts`, `tilePipeline.test.ts`, `testSupport.ts`, `mock/mockPlanet.test.ts` | 시험 |
| `apps/game/src/map/PlanetMapScreen.tsx`, `apps/game/messages/{ko,en}.json` | `data-levels`·`data-memory-bytes`·`data-max-elevation`, HUD "타일 메모리"(ko·en) |
| `docs/adr/2026-10-29-s2-planet-lod.md` | 렌더러 줄 고침 + "구현하며 정한 것 (렌더러 검토 반영)" |
| `docs/worklog/2026/10/29-1130-s2-renderer.md` | 틈 확인·"건드리지 말 것"의 치마 식에 바로잡는 줄 |

## 함께 바꿔야 하는 파일
- 목록 정보에 가장 높은 땅을 넣으면(타일·서버 작업: `packages/protocol/src/planetManifest.ts`, 서버 굽기): `apps/game/src/map/planetSource.ts`의 `planetDescriptionOf`가 `maxElevationM`을 넘긴다. 엔진은 받은 타일로 더 늘릴 뿐이다.
- 치마 식을 바꾸면: `planetMaterials.ts` 셰이더, `tileMesh.ts` `vertexLiftM`, `tileShape.ts` `skirtDepthM`, `skirt.test.ts`를 함께.
- 보이는 높이 식(max(높이, 0) × 과장)을 바꾸면: 셰이더, `vertexLiftM`, 그리고 치마 바닥의 전제(보이는 높이 ≥ 0)를 다시 본다. 0 아래로 내려가면 바닥도 그만큼 내린다.
- 상한 이름을 쓰는 곳: `budgets.gpuMemoryBytes` → `budgets.memoryBytes`(지금 쓰는 곳은 엔진과 시험뿐).
- 면 레벨 12 이상 행성을 만들면: 렌더러는 오류 상태로 거절한다. 자료 없는 단계를 더 그릴 수 있게(가장 거친 단계를 화면 오차로 자르기) 고르기를 바꿔야 한다.

## 건드리지 말 것
- 치마는 모든 타일이 같은 바닥(`skirtDepthM`)까지 내린다. 타일마다 다른 깊이로 되돌리지 않는다(고운 타일 변이 거친 이웃보다 높으면 못 막는다, `skirt.test.ts`).
- 틈 시험에는 레벨 경계를 가까이 붙잡은 화면(F: 고운 타일 일부 실패)을 넣는다. 위에서 내려다본 사진·바다 위·받기 끝난 가까운 화면은 치마를 꺼도 자홍 화소가 0이었다(위 확인).
- 메모리 추정에서 JS 사본(`retainedBytes`)을 빼지 않는다. three는 컨텍스트 복구 때 이 배열로 다시 올린다.

## 미검증·TODO·알려진 문제
- 휴대폰에서 틈 찾기 모드로 가까이 비스듬히 보지 않았다(Unknown). 치마가 깊어져 늘어난 그리기 비용도 휴대폰에서 재지 않았다(Unknown).
- 틈 시험의 감도는 헤드리스 그리기 해상도(1.5배)에서 본 것이다. 위에서 보는 화면·바다 위·받기 끝난 가까운 화면은 치마를 꺼도 자홍이 0이었다 → 그 화면들의 0은 틈이 없다는 증거가 아니다. 증거는 단위 시험(평면 단면 비교)과 F 단계다.
- 검토 전 식(타일마다 다른 치마 깊이)은 F 단계에서도 틈을 보이지 않았다. 예전 식이 실제로 열리는 경우(고운 평평한 고원 옆 거친 해안, 온통 바다의 2단계 넘는 이웃)는 단위 시험으로만 확인했다. S2 시험 행성은 타일마다 높이 범위가 있어 예전 식도 대개 깊었다(Assumed).
- 목록 정보에 가장 높은 땅이 없다. 지금은 1,000m 기본값 + 받은 타일로 늘린다(받지 않은 고운 타일의 봉우리는 모른다).
- 서버 Retry-After가 15초를 넘으면 원천 안에서 기다리던 받기가 시간 제한에 걸려 실패로 세진다(지금 서버는 1·5초).
- 틈 시험·사진 스크립트는 저장소 밖이다(`ops/`로 옮길지는 메인 세션이 정한다).
- 사용자 휴대폰 측정(main ADR 36 "휴대폰에서 잰 값")은 이 변경 전 빌드다. 메모리 상한 셈이 바뀌어(타일 약 1,340 → 618개) 올린 타일 수 상한이 낮아졌다. 휴대폰에서 다시 받기가 잦아지는지는 재지 않았다(Unknown).

## 사용자 결정 대기
- 없음(ADR 36 확정은 메인 세션이 휴대폰 측정과 함께 정한다).
