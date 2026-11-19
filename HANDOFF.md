# FD13 Apparatus Check: handoff

Start here if you're picking this up in a new Claude session. This file covers what's built, who does what, how data is kept and recovered, and what still needs to be built.

Repo: https://github.com/emaildougb/FD13-apparatus-checker
Live (once DNS is verified): https://apparatus.fd13.org/
Version: 1.4.0 (2026-11-18)

## Who does what

- **Doug Boyce (Microsoft sign-in, full admin):** d.boyce@northcountryems.org. Full authority over the app. Doug is the final say on anything.
- **Mike Wagner (Microsoft sign-in, primary content admin):** m.wagner@northcountryems.org. Fire department training captain. Mike tells Doug what he wants the app to look like and what the checklists should say. Mike's changes apply without approval.
- **Chuck Andrus (Microsoft sign-in, admin):** c.andrus@northcountryems.org.
- **Paid crew (Microsoft sign-in only):** Chandler Reyes (Jesus Reyes, j.reyes@northcountryems.org, goes by Chandler), Joshua Fox (j.fox@northcountryems.org), Hunter Mraz (Michael Mraz, m.mraz@northcountryems.org, goes by Hunter). Name and role come from the roster matched by email.
- **Volunteer crews:** no login and no Microsoft accounts. They type a name at the bottom of the sign-in screen.

Admin rights come from the Microsoft account, not from anything typed in the app. The admin list is `CONFIG.msal.adminEmails`.

## What the app does

- Daily apparatus check. Each item is Normal or Abnormal.
- An Abnormal item asks "What's wrong with this item?" with "Fixed on the spot" or "Unable to fix," plus Add photo. Unable to fix needs a reason before submit.
- Engine hours, mileage, fuel and DEF are per unit per day, shared by the crew. Fuel and DEF are for the record only.
- Autosave on each phone, and a shared copy per check through the Worker. Two phones on one check see who has it and merge answers item by item.
- Back button steps back through the app.
- Unresolved problems carry into later checks, marked "Still broken" or "Now fixed."
- Report headline shows "N flags" or "All clear," then UNABLE TO FIX, an IMMEDIATE ADMIN REVIEW block, then FLAGS with decisions.
- Version and date show on the sign-in screen and in the sidebar footer.
- Red theme: FD13 Hub oxblood (#7A0A0A). No pink anywhere.

Admins turn on Edit layout, then use Move up, Move down and Edit on each row. They can add units, zones and checks, edit names and details, and download the data file.

The fix logic was carried over from the NCEMS equipment checker. Not carried over yet: haptics, auto update, "Just looking" mode, rig claim and release from the fleet screens, the 75% send rule and 11 AM hold. Photos stay on the phone that took them and are not emailed or shared.

## 1.4.0 changes and the Worker update

Version 1.4.0 needs Worker fd13-apparatus version 1.1, which adds the shared check copies (/progress) and keeps units added by admins (extraAps in /state). The same D1 database and variables are used. No new variables, no new tables.

Until the Worker is updated, the app works on each phone, and the check screen says the shared copy is not reachable. Units added by admins will not sync to other phones until the Worker is updated.

Worker deploy, step by step:
1. Open the Cloudflare dashboard in Chrome and sign in with the North Country EMS account (account ID 91e05438d2d9b5cb2137a612364b37e8).
2. Go to Workers & Pages and open fd13-apparatus.
3. Click Edit code. Click inside the editor, press Ctrl+A to select all, and press Delete.
4. Open fd13-apparatus-worker.js (in the 1.4.0 zip folder) in Notepad, press Ctrl+A, press Ctrl+C, then click inside the Cloudflare editor and press Ctrl+V.
5. Click Deploy. Open https://fd13-apparatus.d-boyce.workers.dev/health in a new tab. It should say "version": "1.1".
6. Open https://fd13-apparatus.d-boyce.workers.dev/progress?day=TODAY (replace TODAY with today's date, for example 2026-11-18). It should show {"day":...,"docs":{}} or the checks in progress.

Shared check copies older than three days are removed automatically on the next save.

## Files

- `index.html`: the whole app (single file, vanilla HTML, CSS, and JS, no build step).
- `CNAME`: `apparatus.fd13.org`.
- `logo.png`: FD13 logo.
- `msal-browser.min.js`: Microsoft sign-in library, hosted with the app (MSAL 2.38.3).
- `fd13-apparatus-worker.js`: the shared Worker code, version 1.1. Deployed separately (see 1.4.0 changes below). Not uploaded to GitHub.
- `README.md`: setup and version history.
- `HANDOFF.md`: this file.

## Config (top of the script in index.html)

```js
const CONFIG = {
  version: '1.4.0',
  versionDate: '2026-11-18',
  worker: 'https://fd13-apparatus.d-boyce.workers.dev',
  seedVersion: '2026-11-17-mike',
  msal: {
    clientId: '06fbbe41-0b42-4b07-a071-cb4ffa5092c9',
    tenantId: '153dc089-095e-4a20-8d10-39321a0aca09',
    adminEmails: ['m.wagner@northcountryems.org', 'c.andrus@northcountryems.org', 'd.boyce@northcountryems.org'],
  },
  emailjs: { publicKey: '', serviceId: '', templateId: '', to: '' },
  knownWindowDays: 45,
  storageKey: 'fd13check_v3'
};
```

- Microsoft app registration: Entra ID enterprise app with "Assignment required" set to No.
- Redirect URIs registered: the GitHub Pages address and `https://apparatus.fd13.org/`, both with trailing slashes.
- EmailJS is optional and not configured.

## Built-in layout (SEED)

Version 1.1.0 builds Mike's layout into the app as `SEED`:

- Station 131 (51): eng51, eng52, sq51, wt51, wt52, in that order.
- Station 132 (50): eng50, brush51.
- Check order: monthly, preshift, scba.
- Zones for eng51 pre shift, taken from Mike's export of 2026-11-17 (5 zones, 31 items).

Other apparatus and checks still use the sample checklists in `TPL` until Mike sends their content.

How SEED is applied: a device that has no saved data uses SEED. A device whose saved data has an older or missing `seedVersion` takes SEED for layout and zones once. Drafts, submitted history and problems are kept. When Mike sends new layout content, bump `CONFIG.seedVersion` so every device picks it up.

## Open content items (waiting on Mike)

Open items for Mike (questions sent 2026-11-17). Mike is the app admin, so he makes content and layout changes himself in admin mode, or emails Doug any extra changes for Doug to make:

- Monthly and SCBA checklists: to be added at a later date.
- Which checklist (if any) each apparatus other than Engine 51 needs before it goes into the app.
- Any layout changes he wants (he can make these in admin mode, or email them to Doug).

## How data is kept today

Everything lives in the browser's localStorage, under the key `fd13check_v3`, on the device and browser where someone made the change.

- Saved fields: `stOrder`, `apEdits`, `chkOrder`, `zones`, `drafts`, `history`, `problems`, plus `seedVersion`.
- Signing out does not delete this data. Sign-out only clears who is signed in on screen.
- Only "Reset this device" (admin) or clearing site data for the domain removes it.
- Different browsers, private windows, phones, and other computers each have their own separate copy.

### How to recover it today

1. Admin opens the app on the same device and browser where changes were made.
2. Signs in with the Microsoft account and turns on admin mode.
3. Taps "Download data file." This saves `fd13-data.json` with `exportedAt`, `apEdits`, `stOrder`, `chkOrder`, and `zones`.

Known gaps: the export leaves out `drafts`, `history`, and `problems`. Those exist only on that device.

## Status of the open items

- DNS for apparatus.fd13.org: the CNAME record (apparatus to emaildougb.github.io) was saved at GoDaddy. Status unknown at last check. Verify with dnschecker.org and in the repo's Pages settings, then enable Enforce HTTPS.
- Sign-in on apparatus.fd13.org is untested until DNS resolves.
- The real checklist file, `fd13-all-checklists.json`, has not been provided.

## Shared storage (built 2026-11-18, Worker 1.0)

- Worker: fd13-apparatus, on the North Country EMS Cloudflare account (account ID 91e05438d2d9b5cb2137a612364b37e8, workers.dev subdomain d-boyce). Address: https://fd13-apparatus.d-boyce.workers.dev (health at /health).
- D1 database: fd13-apparatus-db (uuid bf77e75f-2532-4606-8cb5-dcda3ba47310). Binding name DB.
- Variables: TENANT_ID, CLIENT_ID, ADMINS (Doug, Mike, Chuck), ORIGINS (apparatus.fd13.org, emaildougb.github.io). Source in fd13-apparatus-worker.js (kept with the handoff, not in the app repo).
- Routes: GET /health, GET /state (public), PUT /state (admins, Microsoft ID token), GET /log (admins), POST /revert (admins, restores an earlier change log entry).
- Every admin save writes a change log row. Doug can revert any change from it.
- Routes still to check live: sign in with Microsoft, then admin save and revert. Done on the Worker itself: deployed, health OK, anonymous write refused.
- Later: a custom domain (checks.fdthirteen.org was mentioned). DNS is not set up, so the app stays on apparatus.fd13.org and GitHub Pages for now.

## Target design: shared storage (original plan)

Goal: admin changes are saved to a shared server so every device sees the same layout, and nobody has to send a file. This should mirror the To Do app (Cloudflare Worker plus D1).

Where it lives (decided by Doug, 2026-11-17): the North Country EMS Cloudflare account, the same one as Doug's other agency apps. Account ID 91e05438d2d9b5cb2137a612364b37e8, workers.dev subdomain d-boyce. Never use Doug's personal Cloudflare account for this data.

Rules for building it there (from the project's CLOUDFLARE_SETUP file):
- Create a new Worker and a new D1 database for FD13. Do not edit or paste over any existing Worker (ncems-checks, ncems-api, ncems-schedule-crews, and others). Those serve other apps.
- Read every Worker's live code before changing anything. Keep every route the other apps depend on.
- The Worker needs its own admin list as a Worker variable, with Doug, Mike, and Chuck, because CONFIG.msal.adminEmails only controls the front end. The Worker must also check the Microsoft token audience for this app's client ID (06fbbe41-0b42-4b07-a071-cb4ffa5092c9).

Decisions already made by Doug:
- Mike's changes apply automatically. They do not need Doug's approval.
- Doug keeps full admin authority over the app.
- Mike is not concerned with what he does on his apparatus. Layout and check changes are his call.

Build notes for the next session:

1. Worker endpoints: `GET /state` (returns the saved PERSIST fields) and `PUT /state` (admin only, saves the fields).
2. Auth: the Worker checks the Microsoft access token and confirms the account is in `CONFIG.msal.adminEmails` before it accepts a write. Non-admins get read-only access.
3. The app loads from the Worker on start and falls back to localStorage if the Worker is unreachable. Writes go to the Worker and to localStorage.
4. Keep a change log in the database (who, when, what changed) so a bad edit can be reverted. Since changes apply without approval, this is the safety net. Doug can revert any change.
5. Keep the "Download data file" button as a backup.

## Working rules

- Commit and push only when Doug asks.
- Doug prefers plain, direct writing, no em dashes, and copy-paste text in code blocks.
- Deliver app files as one zip, named for the repo and version, per his other projects.
- When something changes (a version, an admin, the seed layout), update this file and the README, and give them back to Doug.

## 1.4.1 change

- Adds a new-version notice. When the app is open and the version served at apparatus.fd13.org is newer than the one running, a bar across the top says a new version is ready and offers Reset and update. Reset reloads the page. Saved drafts, history and layout are kept on the phone.
- The app checks on open, every five minutes, and when the phone comes back to the app.
- Worker is unchanged (still version 1.1). No Worker deploy needed for this release.
- To release a future version, bump CONFIG.version in index.html. The notice on older copies appears on their next check.

## 1.5.0 change: photos to the Worker

- Photos upload to the FD13 Worker (fd13-apparatus, version 1.2, R2 binding PHOTOS to fd13-check-photos) when taken, and again at submit if needed. Links to each photo go in the report email, by item.
- Worker routes: POST /photos?unit=&label= (public, image bodies only, 15 MB limit) and GET /photo/<key> (public read).
- Still to do before the email sends: add the FD13 EmailJS public key, service ID, template ID and recipients to CONFIG.emailjs (blank in 1.5.0). The North Country apps use the same EmailJS account. Doug to paste the FD13 values, or add them to the shared list the way the other settings are saved.
- Test plan: send the first report to Doug only, then switch the recipients to m.wagner and c.andrus.

## 1.6.0 change: required checks and shift rotation

- SCHED block in index.html: daily, weekly and shift rigs. The shift anchor is 18 November 2026 (A), then B on the 19th, C on the 20th, repeating daily.
- Completion counts a submitted Pre Shift check for that unit (in the history list). Weekly runs Monday to Sunday.
- Not yet done: the Hub Wall and Desk need the same daily and weekly counts (separate build on the Hub side).

## 1.6.1 change: daily percentage and colors

- Daily: Engine 51, Squad 51 and today's shift rig, 33 percent each. Sunday adds Engine 50 and Brush 51 (done Monday to Sunday) for 5 checks total.
- Shift colors: A green, B blue, C red.

