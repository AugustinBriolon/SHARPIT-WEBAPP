export type CoachKnowledgeChunk = {
  readonly id: string;
  readonly title: string;
  /** Repo-relative path, e.g. knowledge/recovery.md#sleep-debt */
  readonly source: string;
  readonly text: string;
};

export type CoachKnowledgeHit = CoachKnowledgeChunk & {
  readonly score: number;
};
