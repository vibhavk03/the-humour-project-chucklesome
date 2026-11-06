-- The fixed deployment script builds each index CONCURRENTLY on live projects.
-- Plain CREATE INDEX keeps this migration usable by transactional migration tools.
CREATE INDEX caption_votes_caption_id_id_idx
  ON public.caption_votes (caption_id, id);

CREATE INDEX captions_caption_request_id_idx
  ON public.captions (caption_request_id);

CREATE INDEX study_image_set_image_mappings_set_id_idx
  ON public.study_image_set_image_mappings (study_image_set_id);

CREATE INDEX ops_run_steps_ops_run_id_idx
  ON public.ops_run_steps (ops_run_id);
