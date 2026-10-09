# DecoTrail community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the logbook into DecoTrail: per-dive visibility, member profiles with avatars, a members feed, member pages, read-only views of others' dives, and an own app shell — safely behind RLS and working without the new migration.

**Architecture:** Base tables keep owner-only RLS; members read others' data only through `security definer` RPC functions that omit notes and unshared GPS (migration `0004_community.sql`). The browser store gets a community API mixed in (`js/backend/communityStore.js`) with a cached feature probe; the UI hides community features when the probe fails. New views are small classes mounted by `LogbookApp` per route, inside a new DecoTrail shell in `lab/dive-log.html`.

**Tech Stack:** Plain ES modules, no build; Supabase JS v2 (UMD); Postgres 15+ SQL; `node --test`; Docker `postgres:16` for SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-08-decotrail-community-design.md`

## Global Constraints

- Read `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/notation.instructions.md` before UI/text work.
- No new HTML files in the repo (tests scan all HTML). Scratch harnesses live in the session scratchpad.
- Every new `js/**` file goes into `sw.js` `STATIC_ASSETS` (after `./js/logbook/LogbookApp.js`). Do **not** bump the version until release (Task 10).
- Strings: `locales/en.json`, `cs.json`, `es.json` under `diveLog.trail.*`; English fallback passed in code (`translate(key, fallback)`). Czech: decimal comma via `fmtNum`, U+00A0 between number and unit in JSON (never `&nbsp;` in JSON). Keep English loanwords; no calques.
- Touch targets ≥ 44 px; works at 390×844; dark mode via existing tokens (`--surface`, `--surface-elevated`, `--text`, `--text-subtle`, `--border`, `--brand`, …) under `:root[data-theme="dark"]`.
- Never put `notes` of another user anywhere; never show any email except the user's own on their own Profile page.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `npm test` green before each commit.
- Visibility values: `'private' | 'members' | 'link'`; UI offers only private/members (link reserved).

## Review Focus

1. Migration not applied (relation/function missing) → app looks like today: no Feed/Community/Profile tabs, saves never send `visibility`/`share_location`, no console-spam loops. (Task 2 test: probe false → `saveEntry`/`ensureEntries` payload has no `visibility`.)
2. A member without a profile row, display name or avatar → shown as "Diver" with a deterministic preset avatar, never their email. (Task 3 tests `displayName`, `fallbackAvatarKey`.)
3. Own dive reached via a member route `#/m/<id>` → redirect to `#/dive/<id>` (owner tools available). (Task 7.)
4. A dive with photos but unshared coordinates → feed visual is the photo/profile, never a map; detail shows the site name, no map. (Task 3 test `chooseCommunityVisual`; Task 7.)
5. Avatar upload of a huge/portrait/HEIC image → square 256 px JPEG, or a friendly "can't read this image" error; never upload the original. (Task 8 test `squareCrop` math.)

---

### Task 1: Migration 0004 + Docker RLS tests (done by the controller, then Opus review)

**Files:**
- Create: `supabase/migrations/0004_community.sql`
- Create: `supabase/tests/stub.sql` (minimal `auth`/`storage` schemas and roles of Supabase)
- Create: `supabase/tests/0004_rls.sql` (assertions; raise exception on failure)
- Create: `supabase/tests/run.sh` (docker run postgres:16, apply stub + 0001–0004, 0004 again, run assertions)
- Modify: `supabase/README.md` (how to run 0004 and the tests)

Contents: as designed in the spec section "Data model and security". Additional hardening found while designing:
- every join from an entry to a site/media/recording also requires the same owner (`s.owner = e.owner`, `m.owner = e.owner`, `d.owner = e.owner`) — FKs do not enforce it, so a member could otherwise attach someone else's site/photo/recording id to their own visible entry and read it through the RPC;
- `photo_readable(name)` also requires `split_part(name,'/',1) = e.owner::text`.

- [ ] Write stub + migration + assertions; `bash supabase/tests/run.sh` → `ALL RLS TESTS PASSED`.
- [ ] Opus subagent reviews the migration adversarially; fix findings; rerun.
- [ ] Commit.

**Produces (RPC contract used by Task 2):**
- `community_entries(p_owner uuid, p_id uuid, p_limit int, p_offset int)` → rows `{id, owner, log_number, dive_date, entry_time, duration_s, max_depth_m, buddies, gas, water_temp_c, vis_shallow_m, vis_deep_m, details, visibility, share_location, recording_id, created_at, updated_at, site_id, site_name, site_country, site_water, site_altitude_m, site_lat, site_lon, photo_path, photo_count}`
- `community_media(p_entry_id uuid)` → `{id, entry_id, kind, path, url, width, height, taken_at, lat, lon, caption, created_at}`
- `community_recordings(p_owner uuid)` → `{id, device_serial, dive_number, start_local, file_sha256, parser_version, summary}`
- `community_recording(p_id uuid)` → `jsonb` (RecordedDive) or null
- `community_members(p_id uuid)` → `{id, display_name, avatar_preset, avatar_path, home_country, created_at, dive_count, deepest_m, total_s, last_dive_date, top_sites}`
- table `profiles {id, display_name, avatar_preset, avatar_path, default_visibility, home_country, created_at, updated_at}`; bucket `avatars` (path `<uid>/avatar-<timestamp>.jpg`).

### Task 2: Store community API

**Files:**
- Create: `js/backend/communityStore.js`
- Modify: `js/backend/supabaseStore.js` (mix in; visibility on inserts)
- Test: `tests/community-store.test.mjs` (add to `package.json` `test` script list)

**Interfaces:**
- Consumes: Task 1 RPC contract; `DiveStoreError`, `fail` from supabaseStore (export `fail` as `storeFail` for reuse).
- Produces (methods on the store object):
  - `communityStatus(): Promise<boolean>` — cached per store; probes `client.from('profiles').select('id').limit(1)`; false on any error (log once with `console.info` when the code is `PGRST205|PGRST202|42P01|42883` or status 404, else `console.warn`).
  - `ensureProfile(): Promise<Object|null>` — if status false → null. Reads own row; if missing, `insert({id: user.id, display_name: nameFromMetadata(user)})` (ignore 23505), returns the row. `nameFromMetadata(user)` = trimmed `user.user_metadata.full_name ?? user.user_metadata.name`, cut to 60 chars, else null. **Never** the email. Export `nameFromMetadata` for tests.
  - `getMyProfile(): Promise<Object|null>` (cached after ensure/save), `saveProfile(patch): Promise<Object>` — `update({...patch, updated_at}).eq('id', user.id).select().single()`; allowed keys `display_name, avatar_preset, avatar_path, default_visibility, home_country` (others dropped).
  - `uploadAvatar(blob): Promise<Object>` — path `${uid}/avatar-${Date.now()}.jpg`, upload `contentType: 'image/jpeg'`, then `saveProfile({avatar_path: path})`, then remove the previous `avatar_path` (ignore errors); returns profile.
  - `removeAvatar(): Promise<Object>` — `saveProfile({avatar_path: null})` then remove the old object.
  - `avatarUrls(paths: string[]): Promise<Map<path,url>>` — `storage.from('avatars').createSignedUrls(paths, 3600)`, cached per path for 50 min.
  - `listMembers(): Promise<Member[]>` → `rpc('community_members', {p_id: null})`; `getMember(id)` → first row of `rpc('community_members', {p_id: id})` or null.
  - `listCommunityEntries({owner = null, limit = 30, offset = 0} = {})` → `rpc('community_entries', {p_owner: owner, p_id: null, p_limit: limit, p_offset: offset})`.
  - `getCommunityEntry(id)` → first row of `rpc('community_entries', {p_owner: null, p_id: id, p_limit: 1, p_offset: 0})` or null.
  - `listCommunityMedia(entryId)` → `rpc('community_media', {p_entry_id: entryId})`.
  - `communityRecordings(owner)` → `rpc('community_recordings', {p_owner: owner})` mapped through the existing `toSummaryRow`.
  - `loadCommunityRecording(id)` → `rpc('community_recording', {p_id: id})` data (jsonb) or throws `DiveStoreError('unknown','Recording not available')` when null.
  - `defaultVisibility(): Promise<'private'|'members'|'link'|null>` — null when status false; else profile's `default_visibility ?? 'members'`.
- Changes in supabaseStore: `saveEntry(row, id)` strips `visibility`/`share_location` from `row` when `communityStatus()` is false. `ensureEntries` adds `visibility: await defaultVisibility()` to each insert only when non-null.

- [ ] **Step 1: failing tests** — extend a fake client (copy `fakeLogbookClient` shape from `tests/logbook.test.mjs:340` into the new test file, add `rpc(name, args)` recording calls and returning `{data: rpcResults[name] ?? [], error: rpcErrors[name] ?? null}`, a `profiles` table, `storage.from(bucket)` with `upload/remove/createSignedUrls`, and a `failTables` option making `from('profiles')` return `{error: {code: 'PGRST205', message: "Could not find the table 'public.profiles'"}}`). Tests:

```js
test('communityStatus is false when profiles is missing, and saves never send visibility', async () => {
    const { client, calls } = fakeCommunityClient({ failTables: ['profiles'] });
    const store = createSupabaseStore(client);
    assert.equal(await store.communityStatus(), false);
    await store.saveEntry({ log_number: 1, dive_date: '2026-10-01', visibility: 'private', share_location: true });
    const ins = calls.find(c => c[0] === 'insert' && c[1] === 'log_entries');
    assert.ok(!('visibility' in ins[2]) && !('share_location' in ins[2]));
});
test('communityStatus is cached (one probe)', async () => { /* call twice, count profile selects === 1 */ });
test('ensureProfile inserts a row named from Google metadata, never the email', async () => {
    const { client, db } = fakeCommunityClient({ user: { id: 'u1', email: 'me@example.com', user_metadata: { full_name: '  Jana Nováková ' } } });
    const store = createSupabaseStore(client);
    const p = await store.ensureProfile();
    assert.equal(p.display_name, 'Jana Nováková');
    assert.equal(db.profiles.length, 1);
    assert.ok(!JSON.stringify(db.profiles).includes('example.com'));
});
test('nameFromMetadata: no metadata → null; cut at 60', () => {
    assert.equal(nameFromMetadata({ email: 'a@b.c' }), null);
    assert.equal(nameFromMetadata({ user_metadata: { name: 'x'.repeat(80) } }).length, 60);
});
test('ensureEntries uses the profile default visibility', async () => { /* profile default 'private' → inserted entries have visibility 'private' */ });
test('listCommunityEntries / getCommunityEntry / listCommunityMedia call the RPCs with exact args', async () => { /* assert rpc calls */ });
test('saveProfile drops unknown keys and updates only the own row', async () => { /* saveProfile({display_name:'A', id:'u2', owner:'x'}) → update payload keys ⊆ allowed + updated_at, filter eq id u1 */ });
test('uploadAvatar stores in the own folder and removes the previous file', async () => { /* path starts 'u1/avatar-', remove called with old path */ });
```
- [ ] **Step 2:** `node --test tests/community-store.test.mjs` → FAIL.
- [ ] **Step 3:** implement `communityStore.js` (`export function createCommunityApi(client, { requireUser, fail, toSummaryRow })` returning the methods above) and mix into the store in `createSupabaseStore` (`Object.assign(store, createCommunityApi(...))`), plus the two supabaseStore changes. `ensureEntries` must keep working with the old `fakeLogbookClient` (no `profiles` table there → status false → no visibility).
- [ ] **Step 4:** `npm test` → PASS (all old tests too).
- [ ] **Step 5:** commit "DecoTrail: store community API".

### Task 3: Pure helpers — router, community, avatars

**Files:**
- Modify: `js/logbook/router.js`
- Create: `js/logbook/community.js`, `js/logbook/avatars.js`
- Test: `tests/logbook.test.mjs` (router tests updated), `tests/community.test.mjs` (new; add to `package.json`)

**Interfaces — produces:**
- router: `parseRoute(hash)` adds `{name:'home'}` for `''`, `'#'`, `'#/'`, non-`#/` hashes; `'#/dives'`→`list`; `'#/feed'`→`feed`; `'#/community'`→`community`; `'#/member/<id>'`→`{name:'member', id}`; `'#/m/<id>'`→`{name:'memberDive', id}`; `'#/m/<id>/analysis'`→`{name:'memberAnalysis', id}`; `'#/profile'`→`profile`. `routeHref`: `list`→`'#/dives'`, `home`→`'#/'`, and the new names inverse. Existing tests asserting `parseRoute('#/')` is `list` change to `home`; `routeHref({name:'list'})` is `'#/dives'`.
- `community.js`:
  - `VISIBILITIES = Object.freeze(['private','members','link'])`, `OFFERED_VISIBILITIES = Object.freeze(['private','members'])`
  - `displayName(member, t)` → trimmed `member?.display_name` or `t('trail.diver')` ("Diver").
  - `isOwn(entryOrMember, userId)` → `(x.owner ?? x.id) === userId`.
  - `chooseCommunityVisual({photoUrl, entry, apiKey})` → `photo` | `map` (only when `apiKey` and finite `entry.site_lat`/`site_lon`) | `profile` (when `entry.recording_id`) | `none`.
  - `memberStatsView(member, num)` → `[{key:'dives', value:String(dive_count), unit:''}, {key:'deepest', value:num(deepest_m,1), unit:'m'} (only if finite), {key:'time', value: formatTotalTime(total_s, num)} ]` (reuse `formatTotalTime` from `feed.js`).
  - `countryName(code, lang)` → `Intl.DisplayNames([lang], {type:'region'}).of(code)` with try/catch → code; `''` for falsy.
  - `COUNTRY_CODES` — frozen array of ISO alpha-2 codes for the select (all assigned codes; generate list once, sorted by localized name at render time).
  - `entryFromCommunityRow(row)` → `{entry, site}`: `entry` = row minus `site_*`, `photo_*` fields, `notes: null`; `site` = `row.site_id ? {id: row.site_id, name: row.site_name, country: row.site_country, water: row.site_water, altitude_m: row.site_altitude_m, lat: row.site_lat ?? null, lon: row.site_lon ?? null} : null`.
- `avatars.js`:
  - `AVATAR_KEYS` — `['reef-01', …, 'reef-12']`.
  - `AVATARS` — frozen map key → `{label: {en, cs, es}, svg: '<svg viewBox="0 0 64 64" …>…</svg>'}`; 12 original flat designs (mask, fin, octopus, turtle, manta, seahorse, jellyfish, reef fish, shell, anchor, whale tail, bubbles), each a circle background in its own tint + 1–2 tone white/dark motif; no external refs, no `<script>`, no `on*` attributes. Use the `frontend-design` skill for the look.
  - `fallbackAvatarKey(id)` — deterministic: sum of char codes of `String(id)` mod 12 → key.
  - `avatarHtml({preset, url, name, size = 40})` → `<span class="tr-avatar" style="--size:${size}px">` containing `<img src=url alt="">` when `url`, else the preset SVG (unknown preset → fallback by name), with `role="img" aria-label=name` escaped.

- [ ] **Step 1: failing tests** (`tests/community.test.mjs`):

```js
test('router: home, dives, feed, community, member, memberDive, profile', () => {
    assert.deepEqual(parseRoute(''), { name: 'home' });
    assert.deepEqual(parseRoute('#/'), { name: 'home' });
    assert.deepEqual(parseRoute('#/dives'), { name: 'list' });
    assert.deepEqual(parseRoute('#/feed'), { name: 'feed' });
    assert.deepEqual(parseRoute('#/community'), { name: 'community' });
    assert.deepEqual(parseRoute('#/member/ab-12'), { name: 'member', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/m/ab-12'), { name: 'memberDive', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/m/ab-12/analysis'), { name: 'memberAnalysis', id: 'ab-12' });
    assert.deepEqual(parseRoute('#/profile'), { name: 'profile' });
    for (const r of [{ name: 'list' }, { name: 'feed' }, { name: 'community' }, { name: 'member', id: 'x1' }, { name: 'memberDive', id: 'x1' }, { name: 'memberAnalysis', id: 'x1' }, { name: 'profile' }])
        assert.deepEqual(parseRoute(routeHref(r)), r);
});
test('displayName falls back to Diver, never email', () => {
    const t = k => ({ 'trail.diver': 'Diver' }[k] ?? k);
    assert.equal(displayName({ display_name: '  ' }, t), 'Diver');
    assert.equal(displayName(null, t), 'Diver');
    assert.equal(displayName({ display_name: ' Petr ' }, t), 'Petr');
});
test('chooseCommunityVisual: map only with shared coordinates', () => {
    const e = { site_lat: null, site_lon: null, recording_id: 'r1' };
    assert.equal(chooseCommunityVisual({ entry: e, apiKey: 'k' }).kind, 'profile');
    assert.equal(chooseCommunityVisual({ entry: { ...e, site_lat: 50, site_lon: 14 }, apiKey: 'k' }).kind, 'map');
    assert.equal(chooseCommunityVisual({ photoUrl: 'u', entry: e, apiKey: 'k' }).kind, 'photo');
    assert.equal(chooseCommunityVisual({ entry: { recording_id: null }, apiKey: '' }).kind, 'none');
});
test('entryFromCommunityRow splits site fields and never carries notes', () => { /* notes null; site null when no site_id */ });
test('avatars: 12 unique keys, safe SVG, deterministic fallback', () => {
    assert.equal(AVATAR_KEYS.length, 12);
    assert.equal(new Set(AVATAR_KEYS).size, 12);
    for (const k of AVATAR_KEYS) {
        const svg = AVATARS[k].svg;
        assert.match(svg, /^<svg [^>]*viewBox="0 0 64 64"/);
        assert.doesNotMatch(svg, /<script|\son\w+=|href=/i);
        assert.ok(AVATARS[k].label.en && AVATARS[k].label.cs && AVATARS[k].label.es);
    }
    assert.equal(fallbackAvatarKey('abc'), fallbackAvatarKey('abc'));
    assert.ok(AVATAR_KEYS.includes(fallbackAvatarKey('zzz')));
});
test('avatarHtml escapes the name and prefers the uploaded url', () => { /* name '<b>' escaped; url → <img> */ });
test('memberStatsView uses decimal comma in Czech', () => { /* num = (v,d)=>fmt with comma → '38,6' */ });
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS (update the old router tests in `tests/logbook.test.mjs`; grep LogbookApp/EntryDetail/SitesPage for hard-coded `'#/'` links and switch them to `routeHref({name:'list'})`).
- [ ] **Step 5:** commit "DecoTrail: routes, community helpers, avatars".

### Task 4: App shell, home routing, invite-only login

**Files:**
- Create: `js/logbook/AppShell.js`
- Modify: `lab/dive-log.html` (markup + CSS), `js/logbook/LogbookApp.js` (shell + routes + feature probe + ensureProfile), `js/components/RecordedDiveAnalysis.js` (invite-only line + error texts), `locales/*.json`
- Test: `tests/community.test.mjs` (pure `shellTabs(community)`)

**Interfaces:**
- `AppShell.js` exports `SHELL_TABS = ['feed','list','community','sites','profile']`, `shellTabs(communityOn)` → tabs list (without `feed`,`community`,`profile` when off), `activeTab(routeName)` (feed→feed; list/new/detail/edit/analysis→list; community/member/memberDive/memberAnalysis→community; sites/site→sites; profile→profile; home→feed or list), and `class AppShell { constructor({topNav, bottomNav}); render({tabs, active}); destroy() }` rendering `<a class="tr-tab" href aria-current="page">` with inline 24×24 stroke icons and translated labels (`diveLog.trail.tab.<name>`).
- `lab/dive-log.html`: replace `<nav class="main-nav">…</nav>`, the disclaimer banner and the hero with
  ```html
  <header class="tr-top"><div class="tr-top-in">
    <a class="tr-brand" href="#/"><svg class="tr-mark" …/><span>DecoTrail</span></a>
    <nav class="tr-tabs" aria-label="DecoTrail" hidden></nav>
    <div class="tr-top-end"><span class="tr-lang"></span><a class="tr-sibling" href="../index.html" data-i18n="diveLog.trail.decotheory">DecoTheory ↗</a></div>
  </div></header>
  <main class="tr-main"><div class="rda-root"></div></main>
  <nav class="tr-bottom" aria-label="DecoTrail" hidden></nav>
  <footer class="tr-foot">…"DecoTrail — dives explained by" <a href="../index.html">DecoTheory ↗</a> · disclaimer line · <span class="version-number"></span></footer>
  ```
  Remove `<script src="../js/nav.js">`. The language switcher: `createLanguageSwitcher()` only attaches to `.nav-container`; make `.tr-top-in` also carry class `nav-container` OR export/use `buildSwitcherElement` — choose: add the class `nav-container` to `.tr-top-in` and a `.nav-wip-badge`-free layout, and check `css/styles.css` `.nav-container` rules do not break the bar (override in page CSS if needed). `<title>`: "DecoTrail"; `data-i18n-title` key `diveLog.trail.pageTitle`. Keep `noindex`. `body.lb-in` already exists; `body.tr-logged-in` toggles tab visibility. Phone (≤ 720 px): bottom bar fixed, 5 equal tabs, `padding-bottom: env(safe-area-inset-bottom)`, `min-height: 56px`; main gets bottom padding so content and the existing floating "+ New" button (`.lb-new`) sit above it (move `.lb-new` bottom to `calc(56px + 1rem + env(safe-area-inset-bottom))`). Desktop: tabs in the top bar; the list sidebar `top` (sticky) adjusted to the new top bar height. Check `tests/build-pages.test.mjs` and other HTML-scanning tests still pass.
- LogbookApp: after login, `this.community = await store.communityStatus?.() ?? false`, then `store.ensureProfile()` (when on); shell rendered on every route change; `home` → `feed` if community else `list`; new route names dispatch to methods implemented in Tasks 5–8 (for this task render a placeholder only if the method is absent — no: add the dispatch in each task). Logged out: tabs hidden, `body.tr-logged-in` removed. Route to a community route while community is off → `list`.
- Login: in `RecordedDiveAnalysis` login card add `<p class="rda-invite">` "DecoTrail is invite-only. Ask the person who invited you, or ask for an invite." (`diveLog.trail.inviteOnly`); `cannotLogin` and `cannotLoginGoogle` texts become "This account hasn't been invited to DecoTrail yet. Ask for an invite." in en/cs/es.
- Analysis "learn why": in `_showAnalysis` add under the back link `<a class="tr-learn" href="../gradient-factors.html">Learn why on DecoTheory ↗</a>` (`diveLog.trail.learnWhy`).

- [ ] Step 1: failing test for `shellTabs`/`activeTab`. Step 2: FAIL. Step 3: implement. Step 4: `npm test` PASS + quick browser load of `lab/dive-log.html` logged out (login card + invite line, brand bar, no console errors). Step 5: commit.

### Task 5: Feed view (own + members)

**Files:**
- Create: `js/logbook/feedCard.js` (extracted card HTML), `js/logbook/CommunityFeed.js`
- Modify: `js/logbook/LogbookApp.js` (use `feedCard.js` for own cards; route `feed`), `lab/dive-log.html` CSS, locales

**Interfaces:**
- `feedCard.js`: `feedCardHtml({entry, site, href, title, whenText, statsHtml, visualHtml, author = null, badgeHtml = '', selectHtml = ''})` — pure string builder that reproduces the current `_feedCard` markup exactly when `author` is null (existing own-list cards must render identically), and when `author = {name, avatarHtml, href, own}` adds `<div class="tr-author"><a href="${author.href}">${avatarHtml}<span>${name}</span></a></div>` above the head. Move the other per-card helpers only if needed; keep LogbookApp behaviour identical (verify own list renders the same in the browser).
- `CommunityFeed`: `new CommunityFeed(host, {store, userId, owner = null, title = true})`, `destroy()`, `relabel()`. Loads `store.listMembers()` (map id→member) and `store.listCommunityEntries({owner, limit: 30, offset})`; signed photo URLs via `store.photoUrls(paths)` and avatar URLs via `store.avatarUrls(paths)`; visual via `chooseCommunityVisual` (profile sparkline: `store.loadCommunityRecording(entry.recording_id)` → existing `sparklinePath`/`profileAreaPath` from `listViews.js`, concurrency 3, only for cards on screen); card `href` = own → `routeHref({name:'detail', id})`, other → `routeHref({name:'memberDive', id})`; author href `routeHref({name:'member', id: owner})`, name "You" (`trail.you`) for own. Month grouping like the own feed (`groupByMonth`). "Load more" button while the last page had 30 rows. Empty state: "No dives from members yet." Error: existing `_storeError` style message.

- [ ] Steps: TDD the pure `feedCardHtml` (author row present/absent, escaping of name/title) in `tests/community.test.mjs`; implement; `npm test`; browser check via fake-store harness (Task 9 harness may be created here first — see Task 9); commit.

### Task 6: Community directory + member profile

**Files:** Create `js/logbook/MembersPage.js`, `js/logbook/MemberPage.js`; modify LogbookApp (routes `community`, `member`), CSS, locales.

**Interfaces:**
- `MembersPage(host, {store, userId})`: heading "Community" + intro "Everyone here was invited. They see your dives unless you make them private." ; list of member cards (avatar 56 px, name, country name, `dive_count` dives · deepest · last dive date formatted with `formatDiveDate`); own card first with a "You" tag and link to `#/profile`; others link to `#/member/<id>`.
- `MemberPage(host, {store, userId, memberId})`: `store.getMember(id)`; not found → "Member not found" + link to Community. Header: 96 px avatar, name, country; stat tiles from `memberStatsView`; "Favourite sites" (`top_sites` chips; hidden when empty); "Recent dives" = `new CommunityFeed(sub, {store, userId, owner: memberId, title: false})`. Own id → shows the same page plus an "Edit profile" link to `#/profile`.

- [ ] Steps: implement; unit-test any new pure helper; browser check; commit.

### Task 7: Read-only dive detail + analysis for members

**Files:** Create `js/logbook/memberEntryStore.js`; modify `js/logbook/EntryDetail.js` (`readOnly`, `author`), LogbookApp (routes `memberDive`, `memberAnalysis`), CSS, locales. Test in `tests/community.test.mjs`.

**Interfaces:**
- `memberEntryStore(store, row)` → `{ entry, site, adapter }` where `entry/site` come from `entryFromCommunityRow(row)` and `adapter` = `{ listSites: async () => site ? [site] : [], listMedia: id => store.listCommunityMedia(id), photoUrls: p => store.photoUrls(p), listDives: () => store.communityRecordings(row.owner), loadDive: id => store.loadCommunityRecording(id), reparseOutdated: async () => 0, onAuthChange: () => () => {}, currentUser: () => store.currentUser() }`. Any other method used by EntryDetail/RecordedDiveAnalysis in embedded mode must be added (grep `this.store.` in both files).
- `EntryDetail` options `readOnly = false`, `author = null` (`{name, avatarHtml, href}`): readOnly hides edit, delete, add photo, add video link, photo delete buttons and the notes block; back link goes to `history.back()` target `#/feed`; analysis link → `routeHref({name:'memberAnalysis', id})`; map only when `site.lat/lon` are finite (already the case if coordinates are null — verify). Own detail (not readOnly) gets a line "Visible to members" / "Private" (`trail.visibility.<v>`) when `entry.visibility` is set.
- LogbookApp `_showMemberDive(id)`: `row = await store.getCommunityEntry(id)`; null → not found; `row.owner === user.id` → `location.replace(routeHref({name:'detail', id}))`; else mount `EntryDetail` readOnly with author from `store.getMember(row.owner)`. `_showMemberAnalysis(id)`: same lookup; mount `RecordedDiveAnalysis(…, {store: adapter, embedded: true, focusRecordingId: row.recording_id, entryGases: gasesFromEntry(entry)})`.

- [ ] Steps: test `memberEntryStore` adapter (listSites returns only the row's site; reparseOutdated no-op; listDives calls communityRecordings with owner); implement; browser check including dark + 390 px; commit.

### Task 8: Profile page, visibility in the entry form, lock badge

**Files:** Create `js/logbook/ProfilePage.js`; modify `js/logbook/photo.js` (export `squareCrop(width, height)` pure + `avatarBlob(file)` browser), `js/logbook/EntryForm.js`, `js/logbook/entryModel.js` (`normalizeEntry` passes `visibility`, `share_location` when present in form), LogbookApp (route `profile`, lock badge on own private cards/tiles/table), CSS, locales. Tests in `tests/community.test.mjs` and `tests/logbook.test.mjs`.

**Interfaces:**
- `squareCrop(w, h)` → `{sx, sy, side}` centred square; `avatarBlob(file)` → 256×256 JPEG blob (quality 0.85) via the existing image-decoding path in `photo.js`; throws `DiveStoreError`-like `Error('unreadable-image')` when decoding fails.
- `ProfilePage(host, {store, user})`: form — display name (maxlength 60), avatar grid (12 radio buttons styled as 64 px avatars, `aria-label` = localized label) + "Upload photo" file input (accept `image/*`) + "Remove photo" (when uploaded), default visibility radios (Private / Members, with one-line help each), home country `<select>` (empty option "—" + `COUNTRY_CODES` sorted by `countryName`), Save button + status line; below: "Signed in as <own email>" + "Your email is never shown to other members." + Sign out button (`store.signOut()`). Choosing a preset clears an uploaded photo on save (`avatar_path: null` + remove object).
- EntryForm: when constructed with `community: true` (LogbookApp passes `this.community`), render fieldset "Who can see this dive" with radios Private / Members (value from entry, else `defaultVisibility` passed in options, else `members`; an existing `link` value shows a third radio "Public link (coming soon)" checked so it is not silently changed) and checkbox "Show the exact location to members" (`share_location`). `_readDom` includes them; when `community` is false nothing is rendered and nothing is sent.
- `normalizeEntry(form)`: if `form.visibility` is one of `VISIBILITIES` include it; if `typeof form.share_location === 'boolean'` include it.
- Lock badge: own feed cards, tiles and table rows with `visibility === 'private'` show a small lock icon with `title`/`aria-label` "Private".

- [ ] Steps: TDD `squareCrop`, `normalizeEntry` visibility pass-through (and absence when not given), `formValuesFromEntry` unaffected; implement; browser check; commit.

### Task 9: Browser verification harness + full check

**Files:** scratchpad only (not committed): harness that serves the worktree, mounts `LogbookApp` with an in-memory fake store implementing every store method used (incl. community API with 3 members, 8 dives, photos as data-URL JPEGs, one recording from `tests/fixtures/divesoft/00000100.DLF` parsed in the browser), toggles `community` on/off, language en/cs/es and theme light/dark, inside a 390×844 iframe and at desktop width (see memory `reference_phone_width_harness`).

- [ ] Check every route: feed, list, community, member, memberDive, memberAnalysis, profile, new/edit form (visibility fieldset), logged-out login card (invite line), community-off mode (3 tabs hidden, home = My dives). No horizontal scroll at 390 px, no console errors, bottom tab bar not covering content, dark mode readable.
- [ ] Screenshots saved to the scratchpad; list them in `REPORT.md`.

### Task 10: Release (only after the user ran 0004)

- [ ] `sw.js` `STATIC_ASSETS` has all new files; bump `CACHE_NAME` and `.version-number` (same version).
- [ ] `npm test`; `node scripts/build-pages.mjs /tmp/x` passes.
- [ ] Real-backend smoke on localhost:5517 logged in (if a session exists in the browser), else ask the coordinator.
- [ ] `gh auth switch --user matej-hron`; push; PR; squash-merge after CI green; `gh run list --workflow pages.yml` → deploy succeeded; load https://decotheory.eu/lab/dive-log.html.
