create table job_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references service_calls(id) on delete cascade,
  sender_role text not null check (sender_role in ('office', 'engineer')),
  sender_id uuid references profiles(id),
  message text not null,
  is_preset boolean default false,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table job_messages enable row level security;

create policy "Authenticated users can read job messages"
  on job_messages for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert job messages"
  on job_messages for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update job messages"
  on job_messages for update using (auth.role() = 'authenticated');