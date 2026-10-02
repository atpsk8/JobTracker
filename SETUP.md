# Setting up Job Tracker

For whoever runs a copy of Job Tracker, on your own computer or on Vercel. The people using the
site don't need any of this: they follow the how-to that appears when they click **Gmail** or
**Outlook**.

## Run it locally

```
npm install
npm run dev
```

Open http://localhost:5173. The dev server must stay on port 5173, because the Outlook sign-in only
accepts addresses registered with Microsoft (step 2 below).

## Gmail: nothing to set up

Gmail is read with an **app password** that each user creates in their own Google account. There's
no developer registration and no Google verification. The how-to is built into the app.

Google requires 2-Step Verification for app passwords. Some accounts can't create them at all,
for example many work or school accounts and accounts with Advanced Protection.

## Outlook: register the app with Microsoft once

Microsoft has turned off app passwords for mail apps, so Outlook users sign in through Microsoft
instead. For that to work, the site needs a free app registration. This takes about 10 minutes and
is done once by you, not by each user.

1. Go to https://portal.azure.com and sign in with any Microsoft account. If it asks you to create
   a directory or sign up for Azure, the free option is fine; app registrations cost nothing.
2. Search for **App registrations** and click **New registration**:
   - **Name:** Job Tracker
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft
     accounts* (so both @outlook.com/@hotmail.com and work accounts can sign in)
   - **Redirect URI:** platform **Single-page application (SPA)**, URI
     `http://localhost:5173/redirect.html`
   - Click **Register**.
3. On the app's **Overview** page, copy the **Application (client) ID**.
4. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, tick
   **Mail.Read** and add it. (`User.Read` is already there.) You don't need to grant admin consent;
   each user approves for themselves when they sign in.
5. Don't create a client secret. This is a browser app and doesn't use one.
6. Copy `.env.example` to `.env`, paste the ID after `VITE_MS_CLIENT_ID=`, and restart `npm run dev`.

Until this is done, the live site doesn't show the **Outlook** button at all. While you run
`npm run dev`, the button stays visible and its dialog lists these same steps.

Notes:

- Microsoft shows an "unverified publisher" notice on the sign-in page until you verify a domain
  under **Branding & properties** in the app registration. This is optional.
- Some companies block employees from approving apps themselves. Those users need their IT admin
  to approve Job Tracker.
- If signing in with an @outlook.com/@hotmail.com address shows *"unauthorized_client: The client
  does not exist or is not enabled for consumers"*, the registration was created for work accounts
  only. Open the app registration's **Manifest**, set `"signInAudience"` to
  `"AzureADandPersonalMicrosoftAccount"` and `"requestedAccessTokenVersion"` (inside `"api"`) to
  `2`, then **Save**.

## Deploy to Vercel

1. Push the project to GitHub and import it in Vercel. It detects Vite and the `api/` folder on
   its own.
2. In **Vercel → Settings → Environment Variables**, add `VITE_MS_CLIENT_ID`, then **redeploy**.
   The ID is built into the page at build time, so it only takes effect in a new build.
3. In the Azure app registration, open **Authentication** and add a second SPA redirect URI:
   `https://<your-app>.vercel.app/redirect.html` (and one per custom domain, if you add any).
4. Add a rate-limit rule for `/api/scan-email` in **Vercel → Firewall**. Without one, anyone could
   use that endpoint to test stolen Gmail passwords.

## Automatic refreshes

While Job Tracker is open, each connected inbox is checked for new mail every 30 minutes (and
when the page is opened, if the last check was longer ago). Refreshes only fetch mail newer than
the last scan, so they're quick. There's no background checking while the site is closed, because
that would need a server holding users' mail credentials.

- **Outlook** refreshes on its own for about a day after signing in. Microsoft limits how long a
  browser app can stay signed in, so after that the user is asked to sign in again.
- **Gmail** refreshes only if the user ticked **Keep scanning automatically on this device**. The
  app password is then stored in that browser, encrypted with a key the browser won't reveal, and
  never included in backups. Without the tick, refreshes run until the page is closed.

## Where the data lives

Everything (jobs, interviews, resumes, stories, connected accounts) is stored in each visitor's own
browser. There's no database to set up. Users can move or back up their data with
**Your data → Export backup**.

Scans keep the text of emails that matched as job emails (up to 20,000 characters each), so
users can read them in the app. All other mail is discarded straight after the scan. Backups
include the saved email text.

## Tuning which emails count as job emails

The matching rules read `job-application-keywords.json`. The scoring itself (how strict it is) is
explained at the top of `src/lib/emailMatcher.js`. Both Gmail and Outlook scans use the same rules.
