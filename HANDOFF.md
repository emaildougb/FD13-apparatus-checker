# FD13 Apparatus Check: handoff

Start here if you're picking this up in a new Claude session. This file covers what's built, who does what, how data is kept and recovered, and what still needs to be built.

Repo: https://github.com/emaildougb/FD13-apparatus-checker
Live (once DNS is verified): https://apparatus.fd13.org/
Version: 1.3.1 (2026-11-18)

## Who does what

- **Doug Boyce (Microsoft sign-in, full admin):** d.boyce@northcountryems.org. Full authority over the app. Doug is the final say on anything.
- **Mike Wagner (Microsoft sign-in, primary content admin):** m.wagner@northcountryems.org. Fire department training captain. Mike tells Doug what he wants the app to look like and what the checklists should say. Mike's changes apply without approval.
- **Chuck Andrus (Microsoft sign-in, admin):** c.andrus@northcountryems.org.
- **Paid crew (Microsoft sign-in only):** Chandler Reyes (Jesus Reyes, j.reyes@northcountryems.org, goes by Chandler), Joshua Fox (j.fox@northcountryems.org), Hunter Mraz (Michael Mraz, m.mraz@northcountryems.org, goes by Hunter). Name and role come from the roster matched by email.
- **Volunteer crews:** no login and no Microsoft accounts. They type a name at the bottom of the sign-in screen.

Admin rights come from the Microsoft account, not from anything typed in the app. The admin list is `CONFIG.msal.adminEmails`.

## What the app does

- Daily apparatus check, Pass or Fail per item.
- A Fail asks "Fixed on the spot" or "Unable to fix." Unable to fix needs a reason before submit.
- Unresolved problems carry into later checks, marked "Still broken" or "Now fixed."
- Report headline shows "N flags" or "All clear," then UNABLE TO FIX, an IMMEDIATE ADMIN REVIEW block, then FLAGS with decisions.
- Version and date show on the sign-in screen and in the sidebar footer.
- Red theme (fire engine red, #CE2029). No pink anywhere.

Admins can drag to reorder, edit names and details, add and delete checks, and download the data file.

The fix logic was carried over from the NCEMS equipment checker. Not carried over yet: haptics, auto update, "Just looking" mode, live sharing, the 75% send rule and 11 AM hold, and photos.

## Files

- `index.html`: the whole app (single file, vanilla HTML, CSS, and JS, no build step).
- `CNAME`: `apparatus.fd13.org`.
- `logo.png`: FD13 logo.
- `README.md`: setup and version history.
- `HANDOFF.md`: this file.

## Config (top of the script in index.html)

```js
const CONFIG = {
  version: '1.3.1',
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

Questions sent to Mike by email on 2026-11-17. His answers are not yet in the app:

- "General Cab Visual Inspection" on eng51 pre shift ends mid-sentence at "ERG B." Mike to confirm the full text.
- Spelling: "presnt" (present), "peddle" (pedal), "drivers preference" (driver's preference). Mike to confirm whether Doug should fix these or Mike will.
- Monthly and scba checklists: Mike to send the content, or `fd13-all-checklists.json`.
- Whether any apparatus besides eng51 needs his checklist now.
- Any layout changes he wants.

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
