-- ============================================================================
-- Lumen Chat — Migration PostgreSQL / Supabase complète
-- Équivalent exact du schéma Prisma SQLite (prisma/schema.prisma),
-- avec clés étrangères, index, cascades et politiques RLS.
--
-- À exécuter dans le SQL Editor de Supabase (ou via supabase db push).
-- Chaque utilisateur ne peut lire/écrire QUE ses propres données.
-- ============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Table profiles (équivalent de la table User) ────────────────────────────
-- NB : deux modes d'auth possibles :
--   Mode A (défaut ici) : mots de passe hachés bcrypt gérés par l'application.
--   Mode B (Supabase Auth) : remplacer cette table par une vue sur auth.users
--   et lier les FK à auth.users(id). Voir le README § migration Supabase.
create table if not exists public.profiles (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique check (char_length(email) <= 254),
  password_hash     text not null,
  display_name      text not null check (char_length(display_name) between 2 and 40),
  avatar_url        text,
  reset_token_hash  text,
  reset_token_expiry timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- ─── Table sessions ──────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);

-- ─── Table conversations ─────────────────────────────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ─── Table messages ──────────────────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  model           text,
  status          text not null default 'completed'
                  check (status in ('completed', 'cancelled', 'error')),
  error_type      text,
  sources         jsonb,
  client_ref      text,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index if not exists messages_user_id_idx on public.messages (user_id);
-- Déduplication des nouvelles tentatives réseau (clientRef unique par conversation)
create unique index if not exists messages_conversation_client_ref_unique
  on public.messages (conversation_id, client_ref)
  where client_ref is not null;

-- ─── Table attachments ───────────────────────────────────────────────────────
create table if not exists public.attachments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists attachments_user_idx on public.attachments (user_id);
create index if not exists attachments_conversation_idx on public.attachments (conversation_id);

-- ============================================================================
-- ROW LEVEL SECURITY — chaque utilisateur ne voit que ses lignes
-- (utile si vous accédez à la base directement depuis le client Supabase ;
--  les routes API Next.js appliquent déjà ce contrôle côté serveur.)
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.sessions      enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.attachments   enable row level security;

-- Politiques « self access » : user_id = auth.uid()
-- (auth.uid() est fourni par Supabase Auth ; en mode A, les routes API
--  Next.js utilisent leur propre session et bypassent PostgREST.)
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles self delete" on public.profiles;
create policy "profiles self delete" on public.profiles
  for delete using (id = auth.uid());

drop policy if exists "sessions self all" on public.sessions;
create policy "sessions self all" on public.sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "conversations self all" on public.conversations;
create policy "conversations self all" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "messages self all" on public.messages;
create policy "messages self all" on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "attachments self all" on public.attachments;
create policy "attachments self all" on public.attachments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── Trigger updated_at automatique ──────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
