**Live site (once deployed):** https://emaildougb.github.io/FD13-apparatus-checker/
**Upload files here:** https://github.com/emaildougb/FD13-apparatus-checker/upload/main

---

# FD13 Apparatus Check

Daily apparatus check app for Clark County Fire District 13. Built on the same logic as the NCEMS Equipment and Property Checker: Pass or Fail, then Fixed on the spot or Unable to fix, a required reason for anything unable to fix, a report that puts unresolved problems first, and known problems carried into the next check.

## Files

- `index.html` is the whole app. Config is at the top of the script.
- `logo.png` is the FD13 logo.

## Before go live

1. **Microsoft sign in.** In the Entra admin center, create an app registration, add the redirect URI for this site (the live URL), and paste the Application (client) ID into `CONFIG.msal.clientId`. Confirm the tenant ID is the district tenant. Until the client ID is set, the app runs in demo mode with an account picker.
2. **Admin emails.** Add Mike Wagner and Chuck Andris's Microsoft sign-in emails to `CONFIG.msal.adminEmails`. Everyone else who signs in with Microsoft is crew.
3. **Report email (optional).** Set `CONFIG.emailjs` (public key, service ID, template ID, and recipient). Blank means the report is shown on screen with a Copy button.
4. **Checklists.** Replace the sample checklists in `TPL` with the real content from `fd13-all-checklists.json`.

## How it works

- Paid staff sign in with Microsoft. Volunteer crews enter a name at the bottom of the sign-in screen. No login.
- Admin mode (Mike and Chuck) adds drag grips to reorder units, checklists, zones and checks, plus Edit. Download data file exports the edits so they can be committed to the repo.
- Each check item is Pass or Fail. A Fail asks Fixed on the spot or Unable to fix. Unable to fix needs a reason before submit.
- Unable to fix goes to Open problems and shows at the top of that unit's checks. Still broken fills the item back in as a fail. Now fixed closes it.
- Known problems older than 45 days stop showing at the top (`CONFIG.knownWindowDays`).

## Not carried over from NCEMS yet

- Shared storage. Data saves in this browser only. The NCEMS version uses a Cloudflare Worker (D1 and R2). FD13 needs its own Worker before it can share checks and admin edits across devices.
- Live sharing between two phones checking the same unit.
- 75 percent send rule and the 11 AM hold.
- Haptics, the auto-update reload, and Just looking mode.
- Photos.
