-- Cover foreign keys reported by the Supabase performance advisor.
create index if not exists apps_current_release_fk_idx on public.apps(id,current_release_id);
create index if not exists candidate_events_candidate_id_idx on public.candidate_events(candidate_id);
create index if not exists review_events_release_id_idx on public.review_events(release_id);
create index if not exists upload_candidates_target_app_id_idx on public.upload_candidates(target_app_id);
