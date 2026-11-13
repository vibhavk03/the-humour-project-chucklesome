# Study and generation analytics schema review

Reviewed November 10 2026. This is a read-only review of all 87 public tables, 4 views, relevant RPC declarations, and the app's data access code in src/types/supabase.ts. A corrected user JWT was verified against the configured project on November 10. All 87 table counts were checked with that superadmin session, and caption provenance, recorded model responses, run payload shapes, and participation summaries were inspected. The REST schema endpoint was unavailable to this session, so the full relationship inventory remains based on generated repository types; successful data queries validate the specific live columns used.

## Main recommendation

Build a study flavor comparison with explicit attribution coverage, then a recorded model timing and run bottleneck view. First distinguish assigned flavor, traceable generation history and ambiguous provenance. Existing study analytics already cover participants, rated-caption coverage, rating distribution, and per-caption counts. The next additions should answer new administrative questions rather than repeat these metrics.

## Can we identify a caption's humor flavor

Yes. The direct recorded relationship is captions.humor_flavor_id to humor_flavors.id, with slug and description as labels. In the earlier audit 18,614 of 20,384 captions had a direct flavor ID, about 91.3 percent; 1,770 did not. This measures all captions, not flavor coverage within any particular study.

The direct ID records assigned attribution. It is not, by itself, proof of a fresh generation: imports can supply a flavor and duplicateCaption copies the flavor without copying the request or prompt-chain link.

For stronger provenance use the caption's llm_prompt_chain_id to identify llm_model_responses for that chain, validate the caption_request_id, and inspect the distinct humor_flavor_id values. A generation task that explicitly contains the caption ID also carries its flavor and chain. One consistently attributed chain can support inference; conflicting flavors should be marked ambiguous. If no chain is available, request-level responses are only candidates: one request can contain several chains and flavors. Do not attribute a caption to whichever response happens to be latest.

Store or display a provenance label such as recorded on caption, traceable to chain or task, request-only inference, conflicting, or unknown. Do not infer provenance from caption text, image ID alone, or the current recipe configuration. Missing flavor does not imply an error: captions can be imported or manually created.

The study Captions screen currently falls back to the latest flavor-bearing response for a request. At the time of the audit the Results service read the direct caption flavor only. This explained why the two screens could disagree; it was a limitation of the display logic, not evidence that the database lacked flavor information everywhere.

Implementation update: every study's Results tab now includes flavor breakdown and attribution coverage. Recorded flavor IDs, imported metadata labels and Unknown are separate groups. Imported source IDs are never joined to this project's flavor IDs. Each group shows caption counts, rated coverage, unique participants and its complete rating distribution, using the same latest in-study ratings as the overview. The leaderboard also displays imported labels with their attribution source. Empty, single-flavor, sparse and unrated studies remain supported. Request-level inference and shared-image comparisons are still outside this MVP.

## Reliable join paths

- Study ratings: studies.id -> study_caption_mappings.study_id -> study_caption_vote_events.study_caption_mapping_id. Match event caption_id against the mapping. Keep missing or conflicting links separate.
- Caption flavor: study_caption_mappings.caption_id -> captions.id -> captions.humor_flavor_id -> humor_flavors.id.
- Recorded model steps: captions.llm_prompt_chain_id -> llm_model_responses.llm_prompt_chain_id -> llm_models.id -> llm_providers.id. Also validate request and flavor. Chains are one-to-many with responses; each model response can be an intermediate step rather than the final caption writer.
- Run detail: ops_runs.id -> ops_run_images.ops_run_id and ops_run_steps.ops_run_id. Steps also join ops_run_image_id to ops_run_images.id.
- Run to study: experiments.ops_run_id and experiments.study_id can form an explicit logical bridge when populated. Currently no general direct run-to-study FK exists, and ops_run_images.captions is JSON, not a normalized caption-ID relation. Inspect payloads before connecting runs to ratings.
- Audience: study vote profile_id -> demographic_user_responses.user_id -> demographic_answer_question_mapping -> questions and answers. Validate the user-ID relationship and use aggregated cohorts.

## Study analytics we can derive

| Admin question | Metric and data | Conditions and limits |
| --- | --- | --- |
| Which recipes were evaluated | Caption and rated-caption counts per humor flavor; attribution coverage and unknown bucket | Direct fields first; resolve chain attribution cautiously. Include captions with no votes. |
| Which recipe performed better | Per-flavor six-choice distributions, positive share, participants and rating counts; per-image comparisons | Hold image and study constant where possible. Compare the same images across flavors. Show caption-weighted and vote-weighted summaries separately; observational comparisons do not prove causation. |
| Which images get different reactions | Image-level caption and vote counts, flavor breakdowns, distribution spread | Join captions.image_id; category mappings overlap. Count distinct captions and participants. |
| Who is rating the study | Unique raters, returning raters across studies, contribution concentration | Participant IDs, not names. A few people may contribute many votes; an event count is not an audience count. |
| When does participation occur | New and cumulative ratings and unique raters by day or hour; activity during and outside study windows | created_datetime_utc is event time; verify whether backfilled records preserve original time and apply the app timezone. |
| Are participants finishing | Recorded starts and ends, end rate, time between start and end, completion_stats summaries | ended_at means recorded end, not necessarily every caption rated. Participation logging coverage must be checked; earlier audit had only 487 participation records. |
| How much of the study does each person rate | Distinct current study captions rated per participant divided by current caption count; distribution of this fraction | Current mappings may differ from the study as seen by an earlier participant. Do not call this historical completion without snapshots. |
| Is the feedback evenly spread | Median, minimum, maximum and distribution of ratings per caption, concentration by participant, zero-vote captions | Existing overview implements several coverage measures. Add participant contribution balance or shared-image comparisons rather than duplicate it. |
| Are ratings revised | Multiple events per participant and caption, first-to-last choice changes | Historical event stream required; distinguish revisions from duplicated ingestion. Latest ratings remain the leaderboard denominator. |
| Are participants hesitating | Median and p95 time_to_vote_ms, time_to_next_caption_ms, input-method breakdown | Show usable-timing coverage; null timing is not zero. Navigation is not a guaranteed skip or exposure. Exclude implausible intervals transparently. |
| Do cohorts respond differently | Study and flavor response distributions by questionnaire answer | Aggregate, show cohort counts, limit tiny groups. Demographic and university mappings are not necessarily historical snapshots. |
| Can we assess reliability | Sample sizes, coverage, contribution concentration, uniform ratings, conflicting attribution and timing availability | Descriptive evidence supports review, not an automatic trustworthy badge. Do not treat repeated votes from one person as independent observations. |

Use one latest event per participant and caption within a study for current preference metrics. Use raw events separately for activity, repeat-event and revision analytics. Global caption_votes has no study_id: is_from_study does not identify which study. Never mix these two sources as though they share the same scope or scale.

## Caption and generation analytics

| Feature | Source | What is supportable |
| --- | --- | --- |
| Caption provenance explorer | captions, llm_prompt_chains, llm_model_responses, humor_flavors, generation tasks | Recorded flavor, model sequence, prompts, temperatures, recorded timings, missing or ambiguous links. Distinguish configured recipe from historical execution. |
| Model timing comparison | llm_model_responses, llm_models, llm_providers, flavor step IDs | Response count, median and p95 recorded processing time by model, provider, flavor or step. Compare similar step types and input sizes where measurable. Not an API availability or failure rate because failed calls may never create a response row. |
| Prompt chain profile | llm_prompt_chains, llm_model_responses, captions | Responses and captions per chain, cumulative recorded processing work, step timing share. Summing step durations is not end-to-end latency when branches run concurrently or work retries. |
| Run summary and bottlenecks | ops_runs, ops_run_images, ops_run_steps | Run statuses, wall-clock duration for finished runs, per-image outcomes, caption yield, error locations, step duration shares and slowest recorded step. Define the JSON output shape before extracting caption counts from payloads. |
| Recipe structure | humor_flavor_steps, step types, model and input/output tables | Steps per current recipe, model mix, hidden steps and configured temperatures. Use saved prompts or spec for past executions, not today's editable configuration. |
| Caption alignment and diversity | captions.image_alignment_score, reasoning, content and image_id | Compare alignment scores where present, repeated or near-duplicate text, length and phrasing patterns, similarity across images. Coverage and consistency of alignment scoring must be checked first. An alignment score is not a humor score. |
| Global reception | caption_votes, captions, flavor, images | Positive/negative vote counts and shares, controversy, recency and flavor/image patterns globally. Keep separate from six-choice study feedback. Saves, shares and screenshots can augment this only when enough data exists. |
| Generation reliability | caption_generation_jobs and tasks, admin read RPCs | Current status, partial completion, saved outputs and queue/dispatch/lease timings. Historical retry rates are unsupported by attempts alone because attempts reset at checkpoints. No lifetime error timeline is stored. |
| Goal-based experiments | experiments, experiment_findings, experiment_scorecards | Hypothesis, run and study association, target comparison and findings when populated. The view exposes votes_are_study_only; inspect its actual definition and value before trusting scope. |

There are no typed token-usage, billing amount, per-request dollar cost, model price snapshots, caption impression events, or complete generation failure histories. Exact cost per caption, true click-through or skip rates, and causal claims about flavor quality require additional instrumentation or a validated external data source. JSON metadata may contain more information, but its presence and structure are not guaranteed by this schema.

## Current data availability

The November 10 audit verified 88 studies, 4,857 study-caption mappings, 366,864 study rating events, 350,190 global caption votes, 20,384 captions, 16,007 model responses, 51,576 navigation events, 1,375 demographic responses and 487 participation records. The earlier per-study audit found 53 rated studies; that distribution was not fully recomputed across all 88 studies today. Selected candidate studies were verified again below.

Run analytics had only 10 runs, 10 run-image records and 37 run-step records. This is enough to prototype an execution explorer, but too small and potentially incomplete for broad performance conclusions. Durable caption jobs and tasks, experiments, image humor scores, shares and many auxiliary features were empty. Saves had 5 rows and screenshots 3. Use recorded model responses for the first substantial generation analytics feature.

Study 122 had 1,418 events, all recorded as funny. That is a data review observation, not evidence of universal quality. Earlier live verification of the overview found 171 unique raters and 22 rated captions, with 31 to 106 counted ratings per caption. We should keep the current Funny % formula out of scope until the vote recording semantics are reviewed.

## Suggested next iteration

1. Caption attribution coverage and provenance: show direct flavor and historical chain/task evidence, plus unknown and ambiguous buckets. Resolve the current Captions versus Results display inconsistency without guessing flavors.
2. Study flavor comparison: show captions, unique raters, rated coverage and rating distributions per flavor. Add a shared-image view only where the same images were evaluated under multiple flavors.
3. Recorded model timing and run detail: start with the populated model-response table for median and p95 timing, then attach run-image and run-step detail where explicit links exist.
4. Participation behavior: activity over time, contribution concentration and per-person coverage. Add completion and response-time summaries only after measuring their logging completeness.

No application or database changes were made as part of this review. Feature selection should use the verified live findings below, including lineage completeness, per-study flavor coverage and run JSON shapes.

## Complete inventory of all tables

Counts were refreshed on November 10 with the signed-in superadmin user JWT. Fields below omit routine audit fields for readability. Json fields are flexible payloads, not validated analytics columns. Relationships are declared in the generated types; logical joins without FKs need validation.

### Studies and study behavior

Study coverage, participants, activity, response patterns and feedback balance. Navigation is an interaction event, not an impression log.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| studies | 88 | description: string / null; end_datetime_utc: string / null; id: number; is_hidden: boolean; is_private: boolean; slug: string / null; start_datetime_utc: string / null | None declared beyond audit fields |
| study_caption_mappings | 4857 | caption_id: string; id: number; study_id: number | caption_id -> captions; study_id -> studies |
| study_image_sets | 41 | description: string / null; id: number; slug: string | None declared beyond audit fields |
| study_image_set_image_mappings | 707 | id: number; image_id: string; study_image_set_id: number | image_id -> images; study_image_set_id -> study_image_sets |
| study_participations | 487 | completion_stats: Json / null; ended_at: string / null; profile_id: string; started_at: string; study_id: number | profile_id -> profiles; study_id -> studies |
| study_caption_vote_events | 366864 | caption_id: string; client_event_id: string; id: number; input_method: Database["public"]["Enums"]["study_vote_input_method"]; profile_id: string; session_id: string / null; study_caption_mapping_id: number / null; time_to_vote_ms: number / null; vote_value: Database["public"]["Enums"]["study_vote_value"] | caption_id -> captions; profile_id -> profiles; study_caption_mapping_id -> study_caption_mappings |
| study_caption_navigation_events | 51576 | caption_id: string; client_event_id: string; id: number; input_method: Database["public"]["Enums"]["study_vote_input_method"]; profile_id: string; session_id: string / null; study_caption_mapping_id: number / null; time_to_next_caption_ms: number | caption_id -> captions; profile_id -> profiles; study_caption_mapping_id -> study_caption_mappings |

### Captions and examples

Caption quality, global positive and negative votes, rating coverage, text patterns and generation attribution. Global votes must remain separate from study-linked events.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| captions | 20384 | caption_request_id: number / null; content: string / null; humor_flavor_id: number / null; id: string; image_alignment_score: number / null; image_alignment_score_reasoning: Json / null; image_id: string; is_featured: boolean; is_public: boolean; like_count: number; llm_prompt_chain_id: number / null; metadata: Json / null; profile_id: string / null | caption_request_id -> caption_requests; humor_flavor_id -> humor_flavors; image_id -> images; llm_prompt_chain_id -> llm_prompt_chains; profile_id -> profiles |
| caption_requests | 3885 | id: number; image_id: string; profile_id: string / null | image_id -> images; profile_id -> profiles |
| caption_votes | 350190 | caption_id: string; id: number; is_from_study: boolean / null; profile_id: string; vote_value: number | caption_id -> captions; profile_id -> profiles |
| caption_saves | 5 | caption_id: string; id: number; profile_id: string | caption_id -> captions; profile_id -> profiles |
| caption_examples | 88 | caption: string; caption_example_category_id: number / null; explanation: string; id: number; image_description: string; image_id: string / null; priority: number | caption_example_category_id -> caption_example_categories; image_id -> images |
| caption_example_categories | 0 | id: number; name: string | None declared beyond audit fields |

### Humor configuration

Flavor comparison, recipe complexity and configuration coverage. Current recipes can change; historical comparisons need recorded prompts or run snapshots.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| humor_flavors | 129 | description: string / null; id: number; is_pinned: boolean; slug: string | None declared beyond audit fields |
| humor_flavor_steps | 628 | description: string / null; humor_flavor_id: number; humor_flavor_step_type_id: number; id: number; is_hidden: boolean; llm_input_type_id: number; llm_model_id: number; llm_output_type_id: number; llm_system_prompt: string / null; llm_temperature: number / null; llm_user_prompt: string / null; order_by: number | humor_flavor_id -> humor_flavors; humor_flavor_step_type_id -> humor_flavor_step_types; llm_input_type_id -> llm_input_types; llm_model_id -> llm_models; llm_output_type_id -> llm_output_types |
| humor_flavor_step_types | 3 | created_at: string; description: string; id: number; slug: string | None declared beyond audit fields |
| humor_flavor_mix | 4 | caption_count: number; humor_flavor_id: number; id: number | humor_flavor_id -> humor_flavors |
| humor_themes | 6 | description: string / null; id: number; name: string / null | None declared beyond audit fields |
| humor_flavor_theme_mappings | 0 | humor_flavor_id: number / null; humor_theme_id: number / null; id: number | humor_flavor_id -> humor_flavors; humor_theme_id -> humor_themes |
| humor_flavor_favorites | 0 | comment: string / null; flavor_id: number; id: number; is_favorite: boolean; profile_id: string | flavor_id -> humor_flavors; profile_id -> profiles |
| humor_flavor_notes | 0 | body: string; flavor_id: number; id: number; profile_id: string | flavor_id -> humor_flavors; profile_id -> profiles |

### Recorded LLM execution

Recorded response volume, median and p95 processing time, model and provider breakdowns, prompt-chain tracing. A response record is not a complete request or failure log.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| llm_model_responses | 16007 | caption_request_id: number; humor_flavor_id: number; humor_flavor_step_id: number / null; id: string; llm_model_id: number; llm_model_response: string / null; llm_prompt_chain_id: number / null; llm_system_prompt: string; llm_temperature: number / null; llm_user_prompt: string; processing_time_seconds: number; profile_id: string / null | caption_request_id -> caption_requests; humor_flavor_id -> humor_flavors; humor_flavor_step_id -> humor_flavor_steps; llm_model_id -> llm_models; llm_prompt_chain_id -> llm_prompt_chains; profile_id -> profiles |
| llm_prompt_chains | 7429 | caption_request_id: number; id: number | caption_request_id -> caption_requests |
| llm_models | 21 | id: number; is_temperature_supported: boolean; llm_provider_id: number; name: string; provider_model_id: string | llm_provider_id -> llm_providers |
| llm_providers | 3 | id: number; name: string | None declared beyond audit fields |
| llm_input_types | 2 | description: string; id: number; slug: string | None declared beyond audit fields |
| llm_output_types | 2 | description: string; id: number; slug: string | None declared beyond audit fields |

### Generation runs

Per-run outcomes, image-level yield and errors, step bottlenecks and model use. JSON caption outputs do not by themselves guarantee a link to canonical caption IDs.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| ops_runs | 10 | caption_count: number; export_json: Json / null; export_warning: string / null; finished_datetime_utc: string / null; flavor_slug: string / null; humor_flavor_id: number; id: string; image_count: number; label: string / null; profile_id: string / null; spec: Json; started_datetime_utc: string; status: string; study_image_set_id: number / null; study_image_set_slug: string / null | humor_flavor_id -> humor_flavors; profile_id -> profiles; study_image_set_id -> study_image_sets |
| ops_run_images | 10 | captions: Json / null; error: string / null; final_output: string / null; finished_datetime_utc: string / null; id: string; image_id: string / null; image_url: string / null; ops_run_id: string; outputs: Json; position: number; started_datetime_utc: string; status: string | image_id -> images; ops_run_id -> ops_runs |
| ops_run_steps | 37 | branch_index: number / null; branch_label: string / null; duration_ms: number / null; error: string / null; humor_flavor_step_id: number / null; id: string; include_image: boolean / null; llm_temperature: number / null; op_key: string; op_title: string / null; ops_run_id: string; ops_run_image_id: string; output: string / null; position: number; prior_outputs: Json / null; provider_model_id: string / null; step_order_by: number / null; system_prompt: string / null; user_prompt: string / null | humor_flavor_step_id -> humor_flavor_steps; ops_run_id -> ops_runs; ops_run_image_id -> ops_run_images |

### Durable caption jobs

Task status, current attempts, queue timing and recovery. Use authorized admin read RPCs; current attempts reset at checkpoints and are not lifetime retry counts.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| caption_generation_jobs | 0 | client_id: string / null; created_at: string; id: string; idempotency_key: string / null; request: Json; user_id: string / null | client_id -> auth_clients; user_id -> profiles |
| caption_generation_tasks | 0 | attempts: number; available_at: string; caption_count: number / null; caption_ids: string[]; caption_request_id: number; created_at: string; dispatched_at: string / null; error: string / null; humor_flavor_id: number; id: string; image_id: string; job_id: string; lease_expires_at: string / null; lease_token: string / null; llm_prompt_chain_id: number; outputs: Json; status: string; steps: Json; updated_at: string | caption_request_id -> caption_requests; humor_flavor_id -> humor_flavors; image_id -> images; job_id -> caption_generation_jobs; llm_prompt_chain_id -> llm_prompt_chains |

### Images and image processing

Category coverage, scored-image rankings, asset reuse and processing outcomes when populated. Categories can overlap, so avoid double-counting images or captions.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| images | 2691 | additional_context: string / null; celebrity_recognition: string / null; embedding: string / null; id: string; image_description: string / null; is_common_use: boolean / null; is_public: boolean / null; profile_id: string / null; url: string / null | profile_id -> profiles |
| common_use_categories | 11 | id: number; name: string / null | None declared beyond audit fields |
| common_use_category_image_mappings | 1198 | common_use_category_id: number / null; id: number; image_id: string / null | common_use_category_id -> common_use_categories; image_id -> images |
| image_humor_potential_prompts | 2 | description: string / null; id: string; is_active: boolean; llm_model_id: number; llm_temperature: number; name: string; system_prompt: string; user_prompt: string | llm_model_id -> llm_models |
| image_humor_potential_scores | 0 | id: string; image_id: string; llm_model_id: number; llm_prompt_id: string / null; score: number; score_primary_signal: string / null; score_reasoning: string / null | image_id -> images; llm_model_id -> llm_models; llm_prompt_id -> image_humor_potential_prompts |
| image_content_assets | 0 | created_at: string; id: string; image_host: string; lease_expires_at: string / null; lease_token: string / null; source_sha256: string; status: string; storage_key: string / null; stored_sha256: string / null | None declared beyond audit fields |
| image_content_hashes | 0 | asset_id: string; image_id: string; image_url: string | asset_id -> image_content_assets; image_id -> images |
| image_pipeline | 0 | account_id: number; created_at: string; id: number; media_type: string; media_url: number; post_id: number; post_url: string | None declared beyond audit fields |
| image_reaction_profiles | 0 | humor_flavor_id: number; id: number; image_id: string; profile_id: string / null; prompt_hash: string; search_card: Json / null; step_outputs: Json | humor_flavor_id -> humor_flavors; image_id -> images; profile_id -> profiles |

### Communities and context

Context-library coverage, freshness and tagging. No normalized per-caption context-usage relationship is declared, so context contribution to ratings is not directly attributable.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| communities | 2 | id: number; name: string / null | None declared beyond audit fields |
| community_contexts | 155 | community_id: number / null; content: string / null; embedding: string / null; end_datetime_utc: string / null; id: number; priority: number / null; start_datetime_utc: string / null | community_id -> communities |
| community_context_tags | 15 | id: number; name: string | None declared beyond audit fields |
| community_context_tag_mappings | 182 | community_context_id: number; community_context_tag_id: number; id: number | community_context_id -> community_contexts; community_context_tag_id -> community_context_tags |

### Audience questionnaires

Question coverage and aggregated audience response patterns. Link demographic_user_responses.user_id to participant IDs only after validating the relationship; no profiles FK is declared for that field.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| demographic_questions | 6 | id: number; question: string | None declared beyond audit fields |
| demographic_answers | 135 | answer: string; id: number | None declared beyond audit fields |
| demographic_answer_question_mapping | 135 | answer_id: number; display_order: number; id: number; is_deleted: boolean; question_id: number | answer_id -> demographic_answers; question_id -> demographic_questions |
| demographic_user_responses | 1375 | answer_question_mapping_id: number; id: number; user_id: string | answer_question_mapping_id -> demographic_answer_question_mapping |

### Profiles and university taxonomy

Participant cohorts by university, dorm or major when mappings exist. University major membership joins through university_major_mappings. Keep small cohorts aggregated; current membership is not historical membership.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| profiles | 1923 | email: string / null; first_name: string / null; id: string; is_in_study: boolean; is_matrix_admin: boolean; is_student_brain_member: boolean / null; is_superadmin: boolean; last_name: string / null; notify_new_study_email: boolean / null; notify_new_study_phone_call: boolean / null; notify_new_study_sms: boolean / null | None declared beyond audit fields |
| universities | 2 | created_at: string / null; id: number; name: string; updated_at: string / null | None declared beyond audit fields |
| dorms | 39 | created_at: string / null; full_name: string; id: number; short_name: string; university_id: number; updated_at: string / null | university_id -> universities |
| university_majors | 94 | id: number; name: string | None declared beyond audit fields |
| university_major_mappings | 116 | id: number; major_id: number / null; university_id: number | major_id -> university_majors; university_id -> universities |
| profile_university_mappings | 0 | created_at: string / null; id: number; profile_id: string; university_id: number; updated_at: string / null | profile_id -> profiles; university_id -> universities |
| profile_dorm_mappings | 1 | created_at: string / null; dorm_id: number; id: number; profile_id: string; updated_at: string / null | dorm_id -> dorms; profile_id -> profiles |
| profile_university_major_mappings | 0 | id: string; profile_id: string; university_major_id: number / null | profile_id -> profiles; university_major_id -> university_major_mappings |

### Experiments

Hypothesis-to-run-to-study analysis, targets, findings and verdicts once populated. experiments.study_id is a logical link in the types but has no declared study FK.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| experiments | 0 | decided_by: string / null; decided_datetime_utc: string / null; env: string; goal_metric: Json; hypothesis: string; id: string; ops_run_id: string / null; result: Json / null; status: string; study_id: number / null; verdict: string / null | decided_by -> profiles; ops_run_id -> ops_runs |
| experiment_findings | 0 | claim: string; created_by: string / null; direction: string; experiment_id: string; id: string; notes: string / null; strength: string | created_by -> profiles; experiment_id -> experiment_scorecards; experiment_id -> experiments |

### Engagement and moderation

Sharing destinations, screenshots, report reasons and affected captions or images. These events are global; no study ID is stored.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| shares | 0 | caption_id: string / null; id: number; profile_id: string / null; proper_destination: string / null; share_to_destination_id: number / null | caption_id -> captions; profile_id -> profiles; share_to_destination_id -> share_to_destinations |
| share_to_destinations | 12 | id: number; name: string / null | None declared beyond audit fields |
| screenshots | 3 | caption_id: string / null; id: number; profile_id: string / null | caption_id -> captions; profile_id -> profiles |
| reported_captions | 0 | caption_id: string / null; id: number; profile_id: string / null; reason: string / null | caption_id -> captions; profile_id -> profiles |
| reported_images | 2 | id: number; image_id: string / null; profile_id: string / null; reason: string / null | image_id -> images; profile_id -> profiles |

### Imports and image replacement

Import volume, task outcomes, pending replacements and reuse rates when populated. Json rows and requests need inspection; they are not a typed analytics contract.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| quick_study_import_jobs | 0 | created_at: string; id: string; image_host: string / null; request: Json; save_mode: string; user_id: string | user_id -> profiles |
| quick_study_import_tasks | 0 | attempts: number; available_at: string; created_at: string; dispatched_at: string / null; error: string / null; failure_acknowledged_at: string / null; id: string; image_id: string / null; image_url: string / null; job_id: string; lease_expires_at: string / null; lease_token: string / null; replacement_result: string / null; rows: Json; source_image_id: string / null; source_url: string; status: string; target_image_id: string; updated_at: string | image_id -> images; job_id -> quick_study_import_jobs |

### Reaction workshops

Workshop activity, model use, hearted items and reaction snapshots when populated. Json arrays and snapshots require validated extraction before counting items.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| reaction_joke_workshops | 0 | analysis: Json / null; flavor_id: number; hearted: Json; id: string; joke: string; joke_key: string; messages: Json; model: string / null; moment: string; persona: string; profile_id: string; reasoning_effort: string / null | flavor_id -> humor_flavors; profile_id -> profiles |
| reaction_joke_shares | 0 | flavor_id: number; hearted_count: number; id: string; moment_count: number; persona: string; profile_id: string; snapshot: Json | flavor_id -> humor_flavors; profile_id -> profiles |

### Source material and retrieval libraries

Content inventory and freshness for news, terms, transcripts and clustering. These are source libraries; availability does not prove a caption used an item.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| terms | 51 | definition: string; example: string; id: number; priority: number; term: string; term_type_id: number / null | term_type_id -> term_types |
| term_types | 5 | id: number; name: string | None declared beyond audit fields |
| news_snippets | 0 | category: string; created_at: string / null; headline: string; id: number; is_active: boolean / null; priority: number / null; source_url: string / null | None declared beyond audit fields |
| news_entities | 0 | entity: string; entity_type: string; id: number; news_id: number / null | news_id -> news_snippets |
| transcripts | 0 | content: string; id: number | None declared beyond audit fields |
| personalities | 0 | id: number; name: string | None declared beyond audit fields |
| transcript_personality_mappings | 0 | id: number; personality_id: number; transcript_id: number | personality_id -> personalities; transcript_id -> transcripts |
| sidechat_clusterings | 0 | id: string; mode: string; name: string; payload: Json; post_count: number; profile_id: string / null; window_days: number; window_start_utc: string / null | profile_id -> profiles |

### Access and application operations

Client activity, authentication lifecycle, API traffic, invitations, redirect visits and bug categories. These support operations rather than study quality. Never expose credential hashes or invitation tokens in analytics.

| Table | Current visible rows | Analytical fields | Declared relationships |
| --- | ---: | --- | --- |
| auth_clients | 1 | client_id: string; client_secret_hash: string / null; id: number | None declared beyond audit fields |
| auth_tokens | 2 | access_token_hash: string; auth_client_id: number; created_at: string; expires_at: string; id: number; modified_at: string; revoked_at: string / null | auth_client_id -> auth_clients |
| allowed_signup_domains | 3 | apex_domain: string; id: number | None declared beyond audit fields |
| whitelist_email_addresses | 0 | email_address: string; id: number | None declared beyond audit fields |
| invitations | 0 | expires_datetime_utc: string / null; id: number; invitation_token: string; invitee_email: string; inviter_id: string / null; is_accepted: boolean / null | inviter_id -> profiles |
| link_redirects | 0 | destination_url: string; folder_path: string / null; id: number; name: string; slug: string; visit_count: number | None declared beyond audit fields |
| nonchalant_api_endpoints | 0 | created_at: string; endpoint: string; id: number | None declared beyond audit fields |
| nonchalant_api_http_methods | 0 | created_at: string; id: number; method: string | None declared beyond audit fields |
| nonchalant_api_logs | 0 | api_endpoint_id: number; api_http_method_id: number; auth_client_id: number; created_at: string; id: number; request_body: Json / null; response_body: Json / null; user_id: string / null | api_endpoint_id -> nonchalant_api_endpoints; api_http_method_id -> nonchalant_api_http_methods; auth_client_id -> auth_clients |
| bug_reports | 50 | id: number; message: string / null; profile_id: string / null; subject: string / null | profile_id -> profiles |
| testflight_errors | 5 | error: string / null; id: number | None declared beyond audit fields |

## Views

- experiment_scorecards: per-experiment counts, funny_rate, target and target_met, voters, votes_are_study_only. Not a general per-study results source.
- v_caption_controversy: caption content, likes, dislikes, total_votes and controversy_score. Inspect live definition before applying to studies.
- v_caption_trending_week: caption content, vote_count and image URL for a recent global view. No study key declared.
- v_richest_image_dedup: caption and image linkage and text; useful for content selection, not a ratings fact table.

## Relevant RPC contracts

start_study and end_study record participation and optional completion_stats; valid_study_completion_stats validates their payload. admin_list_caption_jobs and admin_get_caption_job expose authorized projections of generation work. match_community_contexts provides similarity retrieval, not generation usage attribution. The remaining mutation, claim, lease, upload, invitation and callback RPCs are operational and should not be invoked for a read-only analytics audit.

## Repository references

- src/types/supabase.ts: authoritative generated table and relationship declarations.
- src/services/study-results.service.ts: current study scoping, latest-vote handling and direct flavor lookup.
- src/services/captions.service.ts: prompt-chain scoping, request fallback and caption duplication.
- src/app/(admin)/(menu)/study/[studyId]/page.tsx: request-level latest-response fallback for flavor display.
- src/app/(admin)/(menu)/experiments/actions.ts: experiment-to-run-to-study overview.
- docs/caption-job-observability.md: job timing and retry semantics and authorization.

## Verified live findings from November 10

### Caption provenance

- 18,614 captions have a direct flavor ID and a prompt-chain ID.
- 18,522 have matching model-response evidence for both their request and flavor. Another 92 have a chain ID but no matching response rows in this project.
- 1,770 captions have no direct flavor. Nine have request-level responses spanning multiple flavors, so choosing the latest response would be ambiguous.
- 1,234 of the captions without a direct flavor have imported flavor_id and flavor_name metadata. All 1,234 names match current flavor slugs, but none of those numeric metadata IDs match current flavor IDs. Treat these as imported name attribution, not a valid foreign-key join or proof of execution in this project.
- Study 122 has imported flavor metadata on all 22 captions, despite having no direct flavor IDs. Its Unknown labels are therefore partly a display/provenance handling gap.
- 2,091 captions have alignment scores; 1,540 have metadata of some kind.

### Candidate studies for comparisons

Counts below are raw study rating events, before participant-caption deduplication. Shared images use direct flavor attribution only.

| Study Id | Captions | Flavors | Images | Images with every flavor | Rating events |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 | 320 | 3 | 27 | 26 | 46111 |
| 6 | 319 | 3 | 23 | 22 | 39487 |
| 20 | 203 | 5 | 41 | 39 | 32493 |
| 21 | 89 | 6 | 15 | 14 | 11607 |
| 22 | 84 | 6 | 14 | 14 | 2718 |

Study 20 is the strongest initial matched-image comparison: 203 captions, five flavors, 41 images, 39 images with all five flavors, and 32,493 rating events. The flavors are flavor-simple-match, flavor-huh-oh-wait-thats-good, flavor-inside-my-head, flavor-weirdly-specific-but-true and flavor-overreacting-a-bit. Its per-flavor caption counts are 41, 41, 41, 40 and 40. Balanced caption counts do not establish balanced ratings or random assignment.

### Recorded timing and runs

All 16,007 model responses have chain IDs and timing values; 7,752 also have step IDs. There are 12 represented models. The overall median recorded time is 6 seconds and p95 is 40 seconds, across mixed task types. Three records have zero timing and need interpretation before benchmarking. Model comparisons should stratify by step type and input characteristics.

All 37 run-step records have duration and model data; 33 have recorded prompt text. Ten run records have 8 done and 2 error statuses. All 10 run-image caption arrays are empty, so this data does not currently provide a normalized generated-caption bridge for run-to-study quality analytics. The inspected run spec samples contain ops, steps, pinned settings, bindings and finalOpKey and can support historical configuration inspection.

### Participation summaries

There are 487 participation records, of which 472 have an ended_at timestamp. The completion summary fields likedCount, viewedCount, medianVoteTimeMs and medianNavigationTimeMs are each present on 472 participation records. These permit a recorded-completion summary feature after validating the client definitions; they do not prove every assigned caption was evaluated. The difference between these records and the much larger voter dataset needs a logging coverage explanation.

### Live audit boundaries

Counts reflect rows visible to this superadmin session. Credential values, individual profiles and raw participant records are not included in this report. No database mutations or application feature changes were performed.
