-- Quick Study can attach extra per-caption metadata alongside the image + caption:
-- the humor flavor, the author (user_id), the source image url, the flavor name,
-- and any other fields the caller provides. Recognized fields still map to their
-- real columns (humor_flavor_id, profile_id); everything provided is also kept
-- here as a displayable jsonb blob so nothing is lost and unknown fields have a home.
--
-- Nullable, so existing captions and the current code paths are unaffected.
alter table public.captions
  add column if not exists metadata jsonb;

comment on column public.captions.metadata is
  'Optional free-form metadata attached at creation (e.g. Quick Study import): '
  'the raw provided fields (flavor_id, flavor_name, user_id, image_ref) plus any '
  'unrecognized keys under "other". Recognized fields are also mapped to their '
  'own columns; this blob is the displayable record of what was supplied.';
