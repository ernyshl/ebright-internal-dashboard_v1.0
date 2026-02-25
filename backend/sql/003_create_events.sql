-- Events table for internal dashboard
-- Run this on your PostgreSQL database.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  date_from date not null,
  date_to date not null,
  location text,
  organizers text,
  remarks text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for faster queries
create index if not exists events_created_by_idx on events(created_by);
create index if not exists events_date_from_idx on events(date_from);
