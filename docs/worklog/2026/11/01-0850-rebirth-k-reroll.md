# 환생 때 분포를 유지해도 K는 다시 굴린다(사용자 결정)

- 일시: 2026-11-01 08:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-faction-society-core.md` "바뀜 (2026-11-01, D-446·사용자 결정)", 기획 D-026·D-440·D-446

## 한 일
- 사용자 결정 "사이보그 환생시 스탯분포 유지시 k값은 리롤되게"를 확인했다: `packages/sim/src/society/cyborgRebirth.ts`의 `rebirthCyborg`는 분포(`spread`)를 넘기지 않아도 `kRolls`로 K를 늘 다시 만든다(Verified: 코드 읽음, 시험 실행).
- 시험에 "분포 유지 → K = 굴림 값, 이전 K와 다름"을 더했다(`cyborgRebirth.test.ts`, 6/6 통과).
- 주석에 사용자 결정을 적었다.
- 사이보그 화면 환생 문구(`cyborg_rebirth_changes_body`, ko·en)가 "분포는 꼭 다시 굴림"으로 남아 있어 D-446·이번 결정대로 고쳤다: 분포는 두거나 다시 굴림, 성장값(K)은 늘 다시 굴림.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/cyborgRebirth.ts` | 주석(사용자 결정) |
| `packages/sim/src/society/cyborgRebirth.test.ts` | 분포 유지 때 K 리롤 시험 |
| `apps/game/messages/{ko,en}.json` | 환생 문구 |
| `docs/adr/2026-10-31-faction-society-core.md` | 바뀜 메모 |

## 함께 바꿔야 하는 파일
- 서버가 환생을 돌리게 되면(R5) 분포 유지·다시 굴림 어느 쪽이든 K 굴림 여섯을 늘 넘긴다.

## 건드리지 말 것
- 없음.

## 미검증·TODO·알려진 문제
- 서버·화면의 실제 환생 동작은 아직 없다(버튼 "곧 열림").

## 사용자 결정 대기
- 없음
