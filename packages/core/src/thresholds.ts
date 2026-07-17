/** FRD Section 6 defaults — actual per-org values live in threshold_settings and override these. */
export const DEFAULT_THRESHOLDS = {
  quizIncompleteDays: 7,
  offerNoReplyDays: 5,
  referralAgingDays: 7,
  backupExpiryDays: 30,
} as const;
