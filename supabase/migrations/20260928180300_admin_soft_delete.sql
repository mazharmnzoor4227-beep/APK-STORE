-- Owner deletion is reversible. Hidden rows remain available to the owner API.
alter table public.apps add column if not exists deleted_at timestamptz;
