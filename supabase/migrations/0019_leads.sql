-- ============================================================
--  Leads — who asked us to analyse a match.
--
--  The landing page's "Email us" button was a mailto: link, and a
--  mailto: opens nothing at all on a machine with no mail client
--  registered — a club running webmail, a locked-down work laptop,
--  most Android phones. Nothing on the page could detect that, so
--  those visitors simply had no way through, and the site recorded
--  nothing about the ones who did get through either.
--
--  This table is the record. The contact form on the landing page
--  POSTs to the Cloudflare Worker (worker/contact.js), and the
--  Worker writes here.
--
--  Additive. No DROP, no DELETE, no UPDATE of anything that already
--  had a value. Safe to run and re-run:  supabase db push
--                                        (or paste into the SQL Editor)
-- ============================================================

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- what the visitor told us
  name        text not null,
  email       text not null,
  club        text not null,
  role        text,                    -- head-coach | assistant | director | analyst | academy | other
  country     text,
  message     text not null,
  video_url   text,                    -- the match they want looked at, if they had a link to hand

  -- where it came from, and what we have done about it
  source      text not null default 'landing',
  status      text not null default 'new'
              check (status in ('new','contacted','won','lost')),

  -- whether the notification actually went out. A lead is worth more than
  -- the email about it, so the Worker saves the row FIRST and mails second:
  -- a failed send leaves the row here with the reason, rather than losing
  -- the enquiry along with the mail.
  email_sent  boolean not null default false,
  email_error text,

  -- A HASH of the caller's IP, never the address itself — it exists to rate
  -- limit and to spot a flood, and neither needs the real thing. See ipHash()
  -- in worker/contact.js: sha-256 over the address and a secret salt.
  ip_hash     text,
  user_agent  text
);

create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_status_idx  on public.leads (status) where status = 'new';

-- ============================================================
--  WHO MAY READ THIS TABLE
--
--  ⚠ The point of this block is what is NOT in it. ⚠
--
--  There is no policy for `anon`, and no INSERT policy for anybody.
--  That is deliberate, and it is the whole security design of the
--  contact form:
--
--    • The anon key is committed to this repository and served in the
--      JavaScript of a static site (see the warning at the top of
--      0017_public_channels.sql). Anyone can query this database with
--      it. Giving anon an INSERT policy so the browser could write
--      here directly would hand the open internet a writable table —
--      and giving it a SELECT policy would publish every club that
--      ever contacted us, along with their email addresses.
--
--    • So the browser never touches this table. It POSTs to the
--      Worker, and the Worker holds the SERVICE ROLE key, which
--      bypasses row-level security entirely. One door, on a server,
--      with the key not in the page.
--
--  What is left below is the staff view: the people already trusted
--  with everything else in this database, via is_staff() from 0013.
-- ============================================================
alter table public.leads enable row level security;

drop policy if exists leads_staff_read on public.leads;
create policy leads_staff_read on public.leads for select to authenticated
  using (public.is_staff());

-- Marking a lead contacted / won / lost. Read-write for staff, and that is
-- the only write policy on the table — the Worker does not need one.
drop policy if exists leads_staff_update on public.leads;
create policy leads_staff_update on public.leads for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

comment on table public.leads is
  'Enquiries from the landing page contact form. Written by the Cloudflare
   Worker with the service role key — there is no anon policy on this table
   and no INSERT policy at all, so nothing served to a browser can write or
   read it. Staff read it via is_staff() (0013).';

-- ============================================================
--  WHAT THIS FILE DELIBERATELY DOES NOT DO
--
--  It does not touch public.clubs, public.matches, public.events or
--  anything the tagging app or the client site reads. A lead is not a
--  channel and not a member: someone contacting us has no account
--  here, and creating one for them is a separate decision taken by a
--  person (see channels.invite in client/assets/supa.js).
--
--  It does not store the caller's IP address. See ip_hash above.
-- ============================================================
