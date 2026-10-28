# FD13 Apparatus Check

Daily apparatus check app for Clark County Fire District 13.

**Version 1.0.0 (2026-10-28)**

## Links

- Live: [https://emaildougb.github.io/FD13-apparatus-checker/](https://emaildougb.github.io/FD13-apparatus-checker/)
- Repo: [https://github.com/emaildougb/FD13-apparatus-checker](https://github.com/emaildougb/FD13-apparatus-checker)
- Upload: [https://github.com/emaildougb/FD13-apparatus-checker/upload/main](https://github.com/emaildougb/FD13-apparatus-checker/upload/main)

## Files (upload ALL of these)

- `index.html` : the whole app. Version, date and config are at the top of the script.
- `logo.png` : FD13 logo (header and sign-in)
- `README.md` : this file

## Before go live

1. **Microsoft app registration.** In the Entra admin center, create an app registration (single tenant, SPA redirect URI `https://emaildougb.github.io/FD13-apparatus-checker/`). Paste the Application (client) ID into `CONFIG.msal.clientId`. Confirm `CONFIG.msal.tenantId`. Until the client ID is set the app runs in demo mode with an account picker.
2. **Enterprise application.** In Entra, Enterprise applications, this app, Properties: set **Assignment required** to **No**, or crews get blocked by Microsoft.
3. **Admin emails.** Add Mike Wagner's and Chuck Andrus's Microsoft sign-in addresses to `CONFIG.msal.adminEmails`. Anyone else who signs in with Microsoft is crew.
4. **Checklists.** Replace the sample checklists in `TPL` with the real content from `fd13-all-checklists.json`. Each item's `cat` becomes a zone, `name` becomes the check name, and `desc` becomes the details text.
5. **Report email (optional).** Set `CONFIG.emailjs` (public key, service ID, template ID, recipient). Blank means the report is shown on screen with a Copy button.

## Sign in

- **Paid staff** sign in with their district Microsoft account. The account decides admin or crew.
- **Volunteer crews** enter a name at the bottom of the sign-in screen. No login. The name goes on every check they submit.
- **Demo mode** (no client ID yet) shows an account picker. Do not use demo mode for real checks.

## Checks

- Each item is Pass or Fail.
- A Fail asks what happened: **Fixed on the spot**, or **Unable to fix**.
- Unable to fix needs a reason before the checklist can submit. Fixed on the spot needs no note. A note is optional on either.
- The submit button stays disabled until every item has an answer and every failure has a decision. Tap **To complete** to see the list and jump to each gap.
- Each submitted check builds a report. It starts with the flag count or ALL CLEAR, then any unable-to-fix items under **UNABLE TO FIX, IMMEDIATE ADMIN REVIEW**, then every flag with its decision and note.
- Unable-to-fix items become open problems. They show at the top of that unit's checks and on the Open problems screen.
- On a later check, **Still broken** marks the matching item as a failure, unable to fix, with the earlier note. **Now fixed** closes the problem.
- Problems older than 45 days stop showing at the top (`CONFIG.knownWindowDays`). They stay on the Open problems screen until closed.

## Admin mode

Admins (signed in through Microsoft with an admin address) turn on **Admin mode** in the sidebar. Then:

- Drag the grip to reorder units, checklists, zones and checks.
- Edit a unit's name and details, a zone's name, or a check's name and description.
- Add checks and zones, or delete a check.
- **Download data file** exports the admin edits as `fd13-data.json`. Commit that file to the repo to make the edits the default for everyone. Until then, edits live only in the browser that made them.

Anyone can report a problem from a unit or from the Open problems screen. Admins mark problems fixed or reopen them.

## Storage

Right now all data saves in the browser (localStorage, key `fd13check_v3`). Nothing is shared between phones yet. Reset this device clears everything saved on it. A Cloudflare Worker for shared checks and admin edits is the next build.

## Version history

### 1.0.0 (2026-10-28)
- First full build.
- Microsoft sign in for paid staff, volunteer name entry, admin mode from the account.
- Pass or Fail with Fixed on the spot and Unable to fix. Required reason for unable to fix, and a To complete list before submit.
- Report with unable-to-fix items first, under immediate admin review.
- Open problems with Still broken and Now fixed, carried into later checks for 45 days.
- Drag reorder and edit for admins, with a data file export.
- Version and date shown on the sign-in screen and in the sidebar.

## Not carried over from NCEMS yet

- Shared storage and sync across devices (needs a Cloudflare Worker).
- Live sharing between two phones checking the same unit.
- The 75 percent send rule and the 11 AM hold.
- Haptics, auto update, Just looking mode, and photos.
