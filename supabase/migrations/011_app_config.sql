-- App-level remote config (force update, version gating).
-- One row, id = 'default'. Read by any authenticated user. Write restricted to service role.

create table if not exists public.app_config (
  id              text primary key default 'default',
  min_version     text not null default '1.0.0',   -- semver: app below this MUST update (force)
  latest_version  text not null default '1.0.0',   -- semver: app below this SHOULD update (soft)
  force_update    boolean not null default false,   -- true = block the app, false = dismissible nudge
  message         text not null default 'A new version of SplitNow is available.',
  store_url_android text not null default 'https://play.google.com/store/apps/details?id=com.vertazon.splitnow',
  store_url_ios     text not null default 'https://apps.apple.com/app/splitnow/id0000000000',
  updated_at      timestamptz not null default now()
);

-- Seed the single config row
insert into public.app_config (id) values ('default')
  on conflict (id) do nothing;

-- RLS: any authenticated user can read, nobody can write via client
alter table public.app_config enable row level security;

create policy "anyone can read app_config"
  on public.app_config for select
  using (auth.role() = 'authenticated');
