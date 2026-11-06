// The public study site differs per environment: production shows studies on
// humorstudy.org, staging on slightlyhumorous.org. Driven by
// NEXT_PUBLIC_ENVIRONMENT (set per deploy), defaulting to production.
const IS_STAGING = process.env.NEXT_PUBLIC_ENVIRONMENT === "staging";

export const STUDY_SITE_HOST = IS_STAGING ? "slightlyhumorous.org" : "humorstudy.org";

export const getStudySiteUrl = (studyId: number) =>
  `https://${STUDY_SITE_HOST}/study/${studyId}`;
