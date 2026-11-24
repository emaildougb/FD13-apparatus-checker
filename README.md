# FD13 Apparatus Check

Daily apparatus check app for Clark County Fire District 13.

**Version 1.7.5 (2026-11-24)**

## Links

- Live: [https://apparatus.fd13.org/](https://apparatus.fd13.org/) (also at [https://emaildougb.github.io/FD13-apparatus-checker/](https://emaildougb.github.io/FD13-apparatus-checker/))
- Repo: [https://github.com/emaildougb/FD13-apparatus-checker](https://github.com/emaildougb/FD13-apparatus-checker)
- Upload: [https://github.com/emaildougb/FD13-apparatus-checker/upload/main](https://github.com/emaildougb/FD13-apparatus-checker/upload/main)

## Changelog

### 1.7.5 (2026-11-24)

- A check sent to the server always carries the day as YYYY-MM-DD. If a saved day is in any other form, it is rebuilt from the check time when sent. Saved records are not changed, so checks already stuck on a phone are sent again with the correct day.
- Refused checks show the day stored and the day sent in Copy error details.
- When the shared copy does not keep an answer, the red bar names the answer, the unit, the check and the day.

### 1.7.4 (2026-11-24)

- When the server refuses a finished check with a 400, the red bar now shows the server's own reason (the first 300 characters of its reply), so Copy error details can report it. Before, the reason was blank.
- A check refused with a 400 is no longer re-sent every 15 seconds. It stays on the phone, unchanged, and is tried once more when the app is reopened. Nothing is deleted.
- Other failures (no connection, other server errors) still retry as before, now with the server's reply in the details.

### 1.7.3 (2026-11-24)

- A phone that already has its own saved layout keeps it when the built-in layout version changes. Before, the phone reset to the built-in layout and could lose admin edits that were not yet on the shared copy. The shared copy still replaces the layout whenever the Worker answers. The built-in layout is used only when the phone has no saved layout, or when the Worker has no shared layout at all.

### 1.7.2 (2026-11-24)

- Finished checks keep the standard name on the record (Pre Shift, SCBA, Monthly Detailed) even when a tab is renamed, so the Hub and the crew board still count them.
- A finished check that does not reach the crew board shows on the red bar and is sent again. Nothing is dropped.
- If the shared copy does not keep an answer from this phone, the red bar says so.

### 1.7.1 (2026-11-21)

- Problems no longer fail silently. A red bar at the bottom stays on screen when a save on this phone fails, when a photo cannot be kept, when layout changes are not saved for everyone, when crew sharing stays down for 45 seconds, or when saved data cannot be read.
- Copy error details on the red bar copies a short report (version, time, screen and the problem) to paste into a message. No data file is needed.
- If saved data on the phone cannot be read, the app keeps a copy of the unreadable data on the phone before it starts fresh, so nothing is overwritten.

### 1.7.0 (2026-11-21)

- Requires DEF is a setting on each unit (admins: Edit on the unit). On for Engine 51, Brush 51 and Water Tender 51. Off for every other unit. When off, the DEF level is hidden everywhere and is not in the report.
- Fuel level and DEF level are only on the Pre Shift tab. They are no longer on Monthly Detailed or SCBA. Engine hours and mileage stay on every tab. Existing saved readings and past checks are not changed.
- Admins can manage tabs per unit: Rename, Move up and down, Archive (hidden from crews after a confirm; Restore brings it back), and Add a tab. Archive never deletes a check.
- Admins can Copy to units: copies one whole tab (its zones and checks) to one or more other units as a new tab with the chosen name. Copies are independent. Answers, photos, problems and past checks are never copied.
- Tab and copy controls are admin only.
- The version number shows under the title at the top of the app.
- When a new version is on the server, the top bar says "A new version (x) is ready. Click here to update." Tapping it loads the new copy. If no check is open, the app updates on its own within about 15 seconds. Saved answers stay on the device.

### 1.6.5 (2026-11-19)

- The check day rolls over at 07:30 instead of midnight (same as NCEMS). Before 07:30 the day is still yesterday. The FD13 Worker is version 1.3.1 with the same change.

### 1.6.4 (2026-11-19)

- In-progress percent now tracks on the Hub Wall, Desk and CG Staff. Each shared save sends the check's item count.

### 1.6.3 (2026-11-19)

- Finished checks are now sent to the FD13 Worker (POST /check), so the NCEMS Hub and CG Staff show them. A check that can't be sent (no signal) is kept on the phone and retried every 15 seconds.
- Photos on a check go with the check to the Worker.
- Submit returns to the unit list instead of the report box. The message says "Report not emailed yet" until EmailJS is set up.

### 1.6.2 (2026-11-19)
- Engine 51 and Squad 51 are marked Mandatory daily on their cards.

### 1.6.1 (2026-11-19)
- Each day has three checks, 33 percent each: Engine 51, Squad 51 and today's shift rig. On Sunday, Engine 50 and Brush 51 are added for five checks, and the weekly line shows.
- Shift tags: A shift green, B shift blue, C shift red. Daily and Weekly tags on the other rigs.

### 1.6.0 (2026-11-18)
- Required checks shown on the Apparatus page. Daily: Engine 51 and Squad 51 (100% when both are done). Weekly by Sunday: Engine 50 and Brush 51 at Station 132 (100% when both are done). Shift rigs: Water Tender 51 (A), Engine 52 (B), Water Tender 52 (C), one check each per week.
- Shift rotation: A on 18 November 2026, then B, then C, repeating every day. Completed means a Pre Shift check was submitted.

### 1.5.1 (2026-11-18)
- Fixed the black pill that showed under the tabs on phones and desktop. The message bar is now hidden until it has a message.

### 1.5.0 (2026-11-18)
- Photos go to the FD13 Worker (R2 bucket fd13-check-photos), the same way North Country's checks do. Each photo uploads when it's taken, and any that didn't upload are tried again when the check is submitted.
- The report email lists a link for each photo, by item. A photo that still hasn't uploaded is marked in the email and stays on the phone.
- Worker 1.2 adds POST /photos and GET /photo/<key> (see fd13-apparatus-worker.js).
- EmailJS settings are still blank in this build. The report email needs the FD13 EmailJS keys added before it sends.

### 1.4.1 (2026-11-18)
- New-version notice: when a newer version is live, a bar across the top says so and offers Reset and update. Saved drafts, history and layout stay on the phone. The app checks when it opens, every five minutes, and when the phone comes back to the app.

### 1.4.0 (2026-11-18)
- Check answers are Normal or Abnormal. An Abnormal item asks "What's wrong with this item?", then Fixed on the spot or Unable to fix, and Add photo (photos stay on the phone that took them).
- Engine hours and mileage are free text boxes, shared by everyone checking that unit today. Fuel and DEF are pickers marked for the record only, and a low level never fails a check.
- Autosave: every answer is saved on the phone as it is made. A reload keeps the check. The check screen says when it was last saved and whether it was shared.
- Shared checks: a check is shared with the crew through the FD13 shared Worker (version 1.1). Two phones on the same check see who has it open, and answers merge item by item (the newer answer for an item wins). Shared copies older than three days are removed.
- Back button: Back steps back through the app (check, unit, apparatus list). Back on an open sheet closes the sheet. It no longer leaves the app.
- Red theme is the FD13 Hub oxblood (#7A0A0A).
- Admin editing has a new look: turn on Edit layout, then use Move up, Move down and Edit on each row. Add a unit with the button at the bottom of a station. Drag handles are gone.
- Units added by admins are saved in the shared layout (Worker 1.1 needed).
- Requires Worker fd13-apparatus version 1.1 (see HANDOFF). Until the Worker is updated, the app still works on each phone and shows that the shared copy is not reachable.

## Files (upload ALL of these)

- `index.html` : the whole app. Version, date and config are at the top of the script.
- `logo.png` : FD13 logo (header and sign-in)
- `msal-browser.min.js` : Microsoft sign-in library (MSAL 2.38.3)
- `CNAME` : custom domain for GitHub Pages (apparatus.fd13.org)
- `README.md` : this file

## Before go live

1. **Microsoft app registration.** Done. Client ID is set in `CONFIG.msal.clientId`, tenant is `153dc089-095e-4a20-8d10-39321a0aca09`. Demo mode is off.
2. **Enterprise application.** In Entra, Enterprise applications, this app, Properties: set **Assignment required** to **No**, or crews get blocked by Microsoft.
3. **Admin emails.** `CONFIG.msal.adminEmails` holds Mike Wagner, Chuck Andrus, and Doug Boyce. Anyone else who signs in with Microsoft is crew.
4. **Checklists.** Mike's layout and the eng51 pre shift checklist are built in as `SEED`. The remaining checks still use the sample checklists in `TPL` until `fd13-all-checklists.json` is loaded. Each item's `cat` becomes a zone, `name` becomes the check name, and `desc` becomes the details text.
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

### 1.3.2 (2026-11-18)
- Microsoft sign-in library (msal-browser.min.js, MSAL 2.38.3) is now hosted with the app instead of loaded from Microsoft's CDN, which was being blocked.
- Upload msal-browser.min.js with the other files.

### 1.3.1 (2026-11-18)
- Removed the demo account picker. Sign in is Microsoft only.

### 1.3.0 (2026-11-18)
- Shared layout: the app reads the layout from the FD13 Worker (https://fd13-apparatus.d-boyce.workers.dev) on start, so everyone sees the same units, checks, and zones.
- Admin changes are saved to the Worker with the admin's Microsoft sign-in. Staff and volunteers can't change the layout.
- Drafts, submitted checks, and problems stay on each device for now.

### 1.2.1 (2026-11-18)
- Roster filled in: Chandler Reyes (j.reyes), Joshua Fox (j.fox), Hunter Mraz (m.mraz), all @northcountryems.org.

### 1.2.0 (2026-11-18)
- Paid staff sign in with the Microsoft button only. Admin status and the person's name come from the account, matched to the roster by email.
- Volunteer crews keep the name box (no login).
- Doug Boyce added to the roster as admin.

### 1.1.0 (2026-11-17)
- Built-in layout (`SEED`) from Mike Wagner's export: unit order at both stations, check order, and the full eng51 pre shift checklist.
- Layout is re-applied on each device once per `CONFIG.seedVersion`. Drafts, submitted history and problems are kept.
- Doug Boyce added to admin emails.
- Mike Wagner is the primary content admin. Doug keeps full admin rights.

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
