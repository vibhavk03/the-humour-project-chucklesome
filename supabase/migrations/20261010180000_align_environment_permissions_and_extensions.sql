-- Establish the same demographic sequence grants and diagnostic extensions
-- in staging and production. Sequence values and application data are preserved.
REVOKE ALL PRIVILEGES ON SEQUENCE
  public.demographic_answer_question_mapping_id_seq,
  public.demographic_answers_id_seq,
  public.demographic_questions_id_seq,
  public.demographic_user_responses_id_seq
FROM anon;

REVOKE SELECT, UPDATE ON SEQUENCE
  public.demographic_answer_question_mapping_id_seq,
  public.demographic_answers_id_seq,
  public.demographic_questions_id_seq,
  public.demographic_user_responses_id_seq
FROM authenticated;

GRANT USAGE ON SEQUENCE
  public.demographic_answer_question_mapping_id_seq,
  public.demographic_answers_id_seq,
  public.demographic_questions_id_seq,
  public.demographic_user_responses_id_seq
TO authenticated;

-- RESTRICT prevents removal of application objects that depend on GraphQL.
DROP EXTENSION IF EXISTS pg_graphql RESTRICT;
CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions VERSION '1.4.1';
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions VERSION '0.2.0';
