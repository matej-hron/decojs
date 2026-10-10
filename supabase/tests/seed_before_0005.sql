-- Dives that exist before 0005 runs: the 'link' one must get a token, the others none.
-- Owner C (seeded before 0004) has a profile, a recording, a site, photos and an avatar.
insert into public.profiles (id, display_name, avatar_path) values
    ('00000000-0000-0000-0000-00000000000c', 'Cyril', '00000000-0000-0000-0000-00000000000c/avatar-1.jpg');
insert into public.sites (id, owner, name, lat, lon, notes) values
    ('2c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Shared Wall', 43.5, 16.4, 'SITE-NOTE');
insert into public.dives (id, owner, device_serial, dive_number, start_local, file_path, file_sha256, parser_version, summary, record) values
    ('3c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'SERIAL-XYZ', 7, '2026-09-10T10:00:00',
     '00000000-0000-0000-0000-00000000000c/S/7.DLF', 'hc', 1, '{"maxDepth": 31}', '{"device": {"vendor": "Divesoft", "serial": "SERIAL-XYZ", "firmware": "FW-9", "hardware": "HW-9"}, "source": {"diveNumber": 4711, "fileName": "00004711.DLF"}, "samples": [1]}');
insert into public.log_entries (id, owner, log_number, dive_date, notes, site_id, recording_id, visibility, share_location, buddies, max_depth_m) values
    ('4c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 1, '2026-09-10', 'C-SECRET-NOTE',
     '2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', 'link', false, '{Jana}', 31),
    ('4c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 2, '2026-09-11', 'C-NOTE-2', null, null, 'members', false, '{}', 12),
    ('4c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 3, '2026-09-12', 'C-NOTE-3', null, null, 'private', false, '{}', 9);
insert into public.media (id, owner, entry_id, kind, path, url, lat, lon, caption) values
    ('5c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', '4c000000-0000-0000-0000-000000000001', 'photo',
     '00000000-0000-0000-0000-00000000000c/4c000000-0000-0000-0000-000000000001/c1.jpg', null, 43.5, 16.4, null),
    ('5c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', '4c000000-0000-0000-0000-000000000001', 'video_link',
     null, 'https://example.com/v', null, null, 'Video'),
    ('5c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', '4c000000-0000-0000-0000-000000000002', 'photo',
     '00000000-0000-0000-0000-00000000000c/4c000000-0000-0000-0000-000000000002/c2.jpg', null, 1, 1, null);
insert into storage.objects (bucket_id, name) values
    ('dive-photos', '00000000-0000-0000-0000-00000000000c/4c000000-0000-0000-0000-000000000001/c1.jpg'),
    ('dive-photos', '00000000-0000-0000-0000-00000000000c/4c000000-0000-0000-0000-000000000002/c2.jpg'),
    ('dive-logs', '00000000-0000-0000-0000-00000000000c/S/7.DLF'),
    ('avatars', '00000000-0000-0000-0000-00000000000c/avatar-1.jpg'),
    ('avatars', '00000000-0000-0000-0000-00000000000c/avatar-old.jpg');
update public.log_entries set details = '{"computer": "Divesoft Freedom SERIAL-XYZ", "guide": "Pepa", "rating": 4, "secretKey": "UNKNOWN-KEY"}'
    where id = '4c000000-0000-0000-0000-000000000001';
-- A uuid someone wrote into the reserved column through the API: 0005 must not abort on it.
update public.log_entries set share_token = gen_random_uuid() where id = '4c000000-0000-0000-0000-000000000002';
