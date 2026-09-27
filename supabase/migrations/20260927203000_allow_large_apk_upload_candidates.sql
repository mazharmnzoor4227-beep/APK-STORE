-- Large uploads use R2; the 50 MB Supabase bucket limit remains unchanged.
alter table public.upload_candidates drop constraint upload_candidates_byte_size_check;
alter table public.upload_candidates add constraint upload_candidates_byte_size_check
  check (byte_size > 0 and byte_size <= 314572800);
