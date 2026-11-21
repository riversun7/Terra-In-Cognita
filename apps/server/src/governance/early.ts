// 일찍 끝내기(질문 2410 가 — 2352 추천 덧붙임: 남은 표가 모두 반대로 가도 결과가 뒤집히지 않으면 투표 기간 끝을 기다리지 않는다, 줄기 governance-2).
// 표는 닫힐 때까지 바꿀 수 있다(2365) → 확정된 표만 센다: NPC 표(한 번 던지면 다시 보지 않는다)만 확정이고, 플레이어가 던진 표와 아직 안 던진 투표권은 어느 쪽으로든
// 갈 수 있는 "흔들리는 무게"로 본다. 던진 표는 거둘 수 없으므로(바꾸기만) 정족수는 지금 던진 표(기권 포함)로 본다 — 못 채웠으면 끝내지 않는다.
// - 찬반: 흔들리는 무게가 모두 찬성인 경우와 모두 반대인 경우의 가결 여부가 같으면 끝낸다(기권은 둘 사이라 따로 보지 않는다 — 찬성은 늘리고 반대는 줄일수록
//   가결 쪽으로만 움직인다).
// - 선출: 흔들리는 무게를 후보 하나에 모두 몰아 준 경우(후보마다)의 당선 가문이 모두 같으면 끝낸다.
import {
  type ElectionCandidate,
  type HouseKey,
  type TallyRules,
  type TallyVote,
  tallyElection,
  tallyMotion,
} from "@terra/shared/governance";

/** 셈 입력 표 하나(확정인가 — NPC 표) */
export interface EarlyVote extends TallyVote {
  readonly fixed: boolean;
}

const sum = (votes: readonly TallyVote[]): bigint => votes.reduce((acc, vote) => acc + vote.weight, 0n);

/** 정족수를 지금 던진 표로 채웠나 */
function castMeetsQuorum(votes: readonly EarlyVote[], electorate: bigint, quorumPm: number): boolean {
  if (electorate <= 0n) return false;
  return sum(votes) * 1000n >= BigInt(Math.min(1000, Math.max(0, quorumPm))) * electorate;
}

/** 찬반 안건이 결과가 정해졌나 */
export function motionDecided(votes: readonly EarlyVote[], electorate: bigint, rules: TallyRules): boolean {
  if (!castMeetsQuorum(votes, electorate, rules.quorumPm)) return false;
  const fixed = votes.filter((vote) => vote.fixed);
  const swing = electorate - sum(fixed);
  const all = (choice: string) =>
    tallyMotion([...fixed, ...(swing > 0n ? [{ choice, weight: swing }] : [])], electorate, rules).passed;
  return all("yes") === all("no");
}

/** 선출이 결과가 정해졌나(정해졌으면 당선 가문, 아니면 null) */
export function electionDecided(
  votes: readonly EarlyVote[],
  candidates: readonly ElectionCandidate[],
  electorate: bigint,
  quorumPm: number,
  incumbent: HouseKey | null,
): HouseKey | null {
  if (candidates.length === 0 || !castMeetsQuorum(votes, electorate, quorumPm)) return null;
  const fixed = votes.filter((vote) => vote.fixed);
  const swing = electorate - sum(fixed);
  let winner: HouseKey | null | undefined;
  for (const candidate of candidates) {
    const result = tallyElection(
      [...fixed, ...(swing > 0n ? [{ choice: candidate.key, weight: swing }] : [])],
      candidates,
      electorate,
      quorumPm,
      incumbent,
    );
    if (result.winner === null || (winner !== undefined && winner !== result.winner)) return null;
    winner = result.winner;
  }
  return winner ?? null;
}
