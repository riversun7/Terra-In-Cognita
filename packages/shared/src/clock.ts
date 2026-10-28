// 서버·기기 시계 차이 추정
// 기기는 접속·복귀 때 여러 번 ping을 보내고, 왕복 시간이 짧은 표본의 중앙값으로 차이를 정한다.

export interface ClockSample {
  /** 기기가 ping을 보낸 시각 (기기 시계, ms) */
  clientSendTime: number;
  /** 서버가 응답을 만든 시각 (서버 시계, ms) */
  serverTime: number;
  /** 기기가 pong을 받은 시각 (기기 시계, ms) */
  clientReceiveTime: number;
}

export interface ClockEstimate {
  /** 서버 시각 = 기기 시각 + offsetMs */
  offsetMs: number;
  /** 사용한 표본들의 왕복 시간 중앙값 (ms) */
  roundTripMs: number;
  sampleCount: number;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) throw new Error("median of empty list");
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1] ?? upper;
  return (lower + upper) / 2;
}

export function estimateClockOffset(samples: readonly ClockSample[]): ClockEstimate {
  const valid = samples.filter((s) => s.clientReceiveTime >= s.clientSendTime);
  if (valid.length === 0) {
    throw new Error("at least one valid clock sample is required");
  }
  // 왕복 시간이 짧은 절반만 사용해 네트워크 지연이 튄 표본을 버린다
  const byRoundTrip = valid.toSorted(
    (a, b) => a.clientReceiveTime - a.clientSendTime - (b.clientReceiveTime - b.clientSendTime),
  );
  const kept = byRoundTrip.slice(0, Math.max(1, Math.ceil(byRoundTrip.length / 2)));
  const offsets = kept.map((s) => s.serverTime - (s.clientSendTime + s.clientReceiveTime) / 2);
  const roundTrips = kept.map((s) => s.clientReceiveTime - s.clientSendTime);
  return {
    offsetMs: median(offsets),
    roundTripMs: median(roundTrips),
    sampleCount: kept.length,
  };
}
