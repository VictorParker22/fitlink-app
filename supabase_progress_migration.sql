-- Create client_progress table
create table client_progress (
  id uuid default uuid_generate_v4() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  trainer_id uuid references trainers(id) on delete cascade not null,
  date date not null,
  weight numeric(5,2), -- e.g., 185.50
  body_fat numeric(4,2), -- e.g., 15.50
  measurements jsonb default '{}'::jsonb, -- e.g., {"chest": 40, "waist": 32, "arms": 15, "thighs": 22}
  photos text[] default '{}'::text[], -- Array of photo URLs
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS
alter table client_progress enable row level security;

-- RLS Policies
create policy "Trainers can view progress of their clients"
  on client_progress for select
  using ( auth.uid() = trainer_id );

create policy "Trainers can insert progress for their clients"
  on client_progress for insert
  with check ( auth.uid() = trainer_id );

create policy "Trainers can update progress for their clients"
  on client_progress for update
  using ( auth.uid() = trainer_id );

create policy "Trainers can delete progress for their clients"
  on client_progress for delete
  using ( auth.uid() = trainer_id );

-- Create indexes for common queries
create index client_progress_client_id_idx on client_progress(client_id);
create index client_progress_date_idx on client_progress(date);
