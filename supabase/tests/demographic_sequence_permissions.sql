\set ON_ERROR_STOP on
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE TABLE public.demographic_questions (id bigserial PRIMARY KEY);
CREATE TABLE public.demographic_answers (id bigserial PRIMARY KEY);
CREATE TABLE public.demographic_answer_question_mapping (id bigserial PRIMARY KEY);
CREATE TABLE public.demographic_user_responses (id bigserial PRIMARY KEY);
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

\i :grants_file

DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'public.demographic_questions_id_seq', 'public.demographic_answers_id_seq',
    'public.demographic_answer_question_mapping_id_seq', 'public.demographic_user_responses_id_seq'
  ] LOOP
    IF NOT has_sequence_privilege('authenticated', sequence_name, 'USAGE')
       OR has_sequence_privilege('authenticated', sequence_name, 'SELECT')
       OR has_sequence_privilege('authenticated', sequence_name, 'UPDATE')
       OR has_sequence_privilege('anon', sequence_name, 'USAGE')
       OR has_sequence_privilege('anon', sequence_name, 'SELECT')
       OR has_sequence_privilege('anon', sequence_name, 'UPDATE')
       OR NOT has_sequence_privilege('service_role', sequence_name, 'SELECT,UPDATE,USAGE')
    THEN RAISE EXCEPTION 'Unexpected sequence permission: %', sequence_name; END IF;
  END LOOP;
END $$;

SET ROLE authenticated;
INSERT INTO public.demographic_questions DEFAULT VALUES RETURNING id;
INSERT INTO public.demographic_answers DEFAULT VALUES RETURNING id;
INSERT INTO public.demographic_answer_question_mapping DEFAULT VALUES RETURNING id;
INSERT INTO public.demographic_user_responses DEFAULT VALUES RETURNING id;
DO $$
BEGIN
  BEGIN
    PERFORM setval('public.demographic_questions_id_seq', 999);
    RAISE EXCEPTION 'Authenticated users must not reset sequence values';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET ROLE anon;
DO $$
DECLARE sequence_name text;
BEGIN
  FOREACH sequence_name IN ARRAY ARRAY[
    'public.demographic_questions_id_seq', 'public.demographic_answers_id_seq',
    'public.demographic_answer_question_mapping_id_seq', 'public.demographic_user_responses_id_seq'
  ] LOOP
    BEGIN
      PERFORM nextval(sequence_name::regclass);
      RAISE EXCEPTION 'Anonymous sequence access unexpectedly succeeded: %', sequence_name;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;
SELECT 'Four authenticated inserts succeeded; anonymous sequence access and authenticated resets were denied.' AS result;
