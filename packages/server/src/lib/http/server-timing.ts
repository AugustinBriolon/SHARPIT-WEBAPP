/**
 * Where an app request spends its time, as a `Server-Timing` header: one entry per phase a
 * handler marks, plus the total. Durations only — the header reaches the client and its tools.
 */
export type ServerTiming = {
  mark: (phase: string) => void;
  /** The phases so far, then the time since the start under `total`'s name. */
  header: (total?: string) => string;
};

export function startServerTiming(now: () => number = () => performance.now()): ServerTiming {
  const start = now();
  let last = start;
  const phases: [string, number][] = [];
  return {
    mark(phase) {
      const at = now();
      phases.push([phase, at - last]);
      last = at;
    },
    header(total = 'total') {
      return [...phases, [total, now() - start] as [string, number]]
        .map(([phase, ms]) => `${phase};dur=${Math.round(ms)}`)
        .join(', ');
    },
  };
}

/** Adds a timing to a response's `Server-Timing`, after any the handler already wrote. */
export function withServerTiming<Res extends Response>(response: Res, timing: string): Res {
  const existing = response.headers.get('server-timing');
  try {
    response.headers.set('server-timing', existing ? `${existing}, ${timing}` : timing);
  } catch {
    // Some responses (a redirect, a fetched body) have immutable headers: no timing then.
  }
  return response;
}
