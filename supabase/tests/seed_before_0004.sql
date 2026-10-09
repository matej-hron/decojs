-- A dive that exists before 0004 runs: it must come out as visibility 'members'.
insert into auth.users (id) values
    ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into public.log_entries (id, owner, log_number, dive_date, notes)
values ('10000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 100, '2026-01-01', 'old note');
