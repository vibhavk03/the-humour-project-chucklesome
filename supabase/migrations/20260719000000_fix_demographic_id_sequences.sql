-- Existing demographic rows were loaded without advancing their backing
-- sequences. Align each sequence so inserts that omit id use the next free ID.
do $$
declare
  table_name text;
  sequence_name text;
  next_id bigint;
begin
  foreach table_name in array array[
    'demographic_questions',
    'demographic_answers',
    'demographic_answer_question_mapping',
    'demographic_user_responses'
  ]
  loop
    sequence_name := pg_get_serial_sequence(
      format('public.%I', table_name),
      'id'
    );

    if sequence_name is null then
      raise exception 'No sequence found for public.%.id', table_name;
    end if;

    execute format(
      'select coalesce(max(id), 0) + 1 from public.%I',
      table_name
    ) into next_id;

    perform setval(sequence_name::regclass, next_id, false);
  end loop;
end
$$;
