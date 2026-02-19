-- Users table for internal dashboard authentication
-- Run this once on your PostgreSQL database.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role text not null default 'executive',
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional: keep email normalized (Postgres 12+ generated column alternative exists too)
create index if not exists users_email_lower_idx on users ((lower(email)));

