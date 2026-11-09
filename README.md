# PersonalVault 🔐

> A private, minimalist personal document locker built for 100% free hosting and storage.

PersonalVault provides a clean, single-password web interface for storing your essential documents (tax returns, IDs, certificates, contracts, records) in your own Google Drive account without monthly subscription fees, public registrations, or third-party databases.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Installation](#3-installation)
4. [Running Locally](#4-running-locally)
5. [Google Cloud Project Setup](#5-google-cloud-project-setup)
6. [Google Drive API Activation](#6-google-drive-api-activation)
7. [OAuth Consent Screen Setup](#7-oauth-consent-screen-setup)
8. [OAuth Credentials Creation](#8-oauth-credentials-creation)
9. [Redirect URI Configuration](#9-redirect-uri-configuration)
10. [GitHub Setup](#10-github-setup)
11. [Vercel Deployment](#11-vercel-deployment)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [Refresh-Token Generation Walkthrough](#13-refresh-token-generation-walkthrough)
14. [Troubleshooting Guide](#14-troubleshooting-guide)
15. [Free-Tier Infrastructure Limits & Security Model](#15-free-tier-infrastructure-limits--security-model)

---

## 1. Project Overview

PersonalVault is designed with a strict zero-bloat philosophy:
- **One Master Password:** No email signups, usernames, or complex user tables.
- **Google Drive as Storage:** Documents live securely in a dedicated `PersonalVault` folder inside your own Google Drive.
- **Zero Ongoing Cost:** Hosted on Vercel's free Hobby plan, utilizing Google Drive's standard 15 GB free tier.
- **Responsive & Minimalist:** Modern, clean, distraction-free interface engineered for phones, tablets, and desktops.
- **Secure by Design:** HMAC-SHA256 signed session cookies, constant-time password verification, IP brute-force protection, CSRF validation, and strict file isolation.

---

## 2. Technology Stack

| Layer | Technology | License / Cost |
|---|---|---|
| **Frontend Framework** | React 18 + Vite | Free & Open Source |
| **Styling** | Native Modern Responsive CSS (Zero UI Bloat) | Free |
| **Serverless Runtime** | Vercel Serverless Functions (Node.js 18+) | Free Tier (Vercel Hobby) |
| **Storage Engine** | Google Drive API v3 (`googleapis`) | Free Tier (Included with Google Account) |
| **Multipart Streaming** | Busboy | Free & Open Source |
| **Authentication** | HMAC-SHA256 Signed HTTP-Only Session Cookies | Zero Database / Zero Cost |
| **Hosting Platform** | Vercel | Free Tier |
| **Version Control** | GitHub | Free |

---

## 3. Installation

Ensure you have **Node.js 18 or higher** installed.

Open **Windows PowerShell** (or Terminal) and execute:

```powershell
# Clone or navigate to the repository directory
cd "C:\path\to\personalvault"

# Install project dependencies
npm install
```

---

## 4. Running Locally

### Option A: Complete Local Development (Frontend + Backend API)

PersonalVault includes a standalone development server (`dev-server.js`) that runs the Vercel serverless functions locally without requiring the Vercel CLI.

1. Create a `.env.local` file in the root folder:
   ```powershell
   Copy-Item .env.example .env.local
   ```
2. Fill in at least your `VAULT_PASSWORD` and `SESSION_SECRET`:
   ```env
   VAULT_PASSWORD=MySuperSecretPassword123!
   SESSION_SECRET=e4b7c8d9a0f123456789abcdef0123456789abcdef0123456789abcdef012345
   ```
3. Open two PowerShell windows:
   - **Terminal 1 (Backend API on port 3001):**
     ```powershell
     npm run dev:api
     ```
   - **Terminal 2 (Frontend Vite on port 5173):**
     ```powershell
     npm run dev
     ```
4. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

### Option B: Running Automated Verification Tests

PersonalVault includes an automated test suite verifying cryptography, rate limiting, and all 8 serverless endpoints:

```powershell
npm test
```

All 42 tests will run and report status in your terminal.

---

## 5. Google Cloud Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with the Google Account you wish to use for document storage.
3. Click the project dropdown at the top of the page and click **"New Project"**.
4. Name the project `PersonalVault` and click **"Create"**.
5. Once created, select `PersonalVault` from the project dropdown.

---

## 6. Google Drive API Activation

1. In the Google Cloud Console, navigate to **APIs & Services** &rarr; **Library** (or search for "Google Drive API" in the search bar).
2. Locate **Google Drive API** in the marketplace list.
3. Click **"Enable"**.

---

## 7. OAuth Consent Screen Setup

1. In the left sidebar, click **APIs & Services** &rarr; **OAuth consent screen**.
2. Select **External** user type and click **Create**.
3. Fill in the App Information:
   - **App name:** `PersonalVault`
   - **User support email:** Your Gmail address.
   - **Developer contact information:** Your Gmail address.
   - Click **Save and Continue**.
4. **Scopes:**
   - Click **Add or Remove Scopes**.
   - Search for `drive.file` and select:
     `.../auth/drive.file` — *See, edit, create, and delete only the specific Google Drive files you use with this app.*
   - Click **Update**, then **Save and Continue**.
5. **Test Users:**
   - Click **Add Users** and enter your Gmail address (the one you will sign into).
   - Click **Save and Continue**.
6. **Summary:**
   - Click **Back to Dashboard**.
   - *Note for long-term production:* In "Testing" mode, Google refresh tokens for external apps expire after 7 days. Once you verify it works, you can click **"Publish App"** on the OAuth consent screen to make your refresh token permanent for your account.

---

## 8. OAuth Credentials Creation

1. In the left sidebar, navigate to **APIs & Services** &rarr; **Credentials**.
2. Click **"+ Create Credentials"** at the top &rarr; **OAuth client ID**.
3. Set **Application type** to: **Web application**.
4. Set **Name** to: `PersonalVault Web Client`.
5. Under **Authorized redirect URIs**, click **"+ Add URI"**.
   - For local development: `http://localhost:3001/api/google/callback`
   - For production: `https://YOUR-APP-NAME.vercel.app/api/google/callback` *(You can update this after deploying to Vercel).*
6. Click **Create**.
7. A dialog will display:
   - **Client ID** (e.g., `123456789-abc.apps.googleusercontent.com`)
   - **Client Secret** (e.g., `GOCSPX-xxxxxxxxxxxx`)
8. Save both values safely.

---

## 9. Redirect URI Configuration

The redirect URI configured in Google Cloud must match **exactly** character-for-character with your production Vercel domain:

```
https://<YOUR-PROJECT-NAME>.vercel.app/api/google/callback
```

> **Warning:** Do not include trailing slashes or subpaths. If your Vercel URL is `https://personalvault-demo.vercel.app`, the redirect URI must be `https://personalvault-demo.vercel.app/api/google/callback`.

---

## 10. GitHub Setup

1. Initialize git in your local project directory (if not already done):
   ```powershell
   git init
   git add .
   git commit -m "PersonalVault initial release"
   ```
2. Create a new **Private** repository on [GitHub](https://github.com/new) called `personalvault`.
3. Push your repository:
   ```powershell
   git remote add origin https://github.com/<YOUR-USERNAME>/personalvault.git
   git branch -M main
   git push -u origin main
   ```

*(The included `.gitignore` guarantees that `.env`, `.env.local`, and build artifacts are never published).*

---

## 11. Vercel Deployment

1. Log into [Vercel](https://vercel.com/) with your GitHub account.
2. Click **"Add New..."** &rarr; **"Project"**.
3. Select your `personalvault` GitHub repository and click **"Import"**.
4. In the Project Configuration:
   - **Framework Preset:** Vite
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Expand the **Environment Variables** section and add the initial variables (see Section 12 below).
6. Click **"Deploy"**.
7. Wait 30 seconds for the initial build and deployment to complete.

---

## 12. Environment Variables Reference

Configure these in **Vercel &rarr; Project Settings &rarr; Environment Variables**:

| Variable | Description | Example / Format | Required Initially |
|---|---|---|---|
| `VAULT_PASSWORD` | Master password to unlock your vault | `AStrongMasterPassword!@#` | Yes |
| `SESSION_SECRET` | 64-character random hex string for signing HMAC session cookies | `crypto.randomBytes(32).toString('hex')` | Yes |
| `GOOGLE_CLIENT_ID` | OAuth Client ID from Google Cloud Console | `123456.apps.googleusercontent.com` | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret from Google Cloud Console | `GOCSPX-abcdef123456` | Yes |
| `GOOGLE_REDIRECT_URI` | Exact OAuth callback URL on your Vercel domain | `https://your-vault.vercel.app/api/google/callback` | Yes |
| `DRIVE_FOLDER_NAME` | Dedicated folder inside Google Drive | `PersonalVault` | Optional (default: `PersonalVault`) |
| `GOOGLE_REFRESH_TOKEN` | Long-lived token granting Drive access | Obtained in Step 13 | After Step 13 |

To generate a secure 64-character `SESSION_SECRET` in PowerShell:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 13. Refresh-Token Generation Walkthrough

Once your project is deployed to Vercel with the initial environment variables:

1. Open your deployed Vercel URL in your browser:
   ```
   https://your-vault.vercel.app
   ```
2. Enter your `VAULT_PASSWORD` to unlock the vault.
3. Because Google Drive is not yet linked, click the **"Connect Google Drive"** button (or navigate to `https://your-vault.vercel.app/api/google/start`).
4. Google will display the OAuth authorization screen. Select your Google Account.
5. Click **"Continue"** / **"Allow"** to authorize PersonalVault to manage files it creates.
6. Google will redirect back to your `/api/google/callback` endpoint.
7. The page will display:
   - **"Google Drive Connected Successfully"**
   - A copyable text box containing your **Refresh Token**.
8. Click **"Copy Refresh Token"**.
9. Go back to **Vercel Dashboard &rarr; Your Project &rarr; Settings &rarr; Environment Variables**.
10. Add a new variable:
    - **Key:** `GOOGLE_REFRESH_TOKEN`
    - **Value:** *(paste the token)*
11. Click **"Save"**.
12. Go to the **Deployments** tab in Vercel, click the three dots on your latest deployment, and click **"Redeploy"**.
13. Return to `https://your-vault.vercel.app` &mdash; your vault is now connected to Google Drive!

---

## 14. Troubleshooting Guide

### "Google authorization was denied or failed: redirect_uri_mismatch"
- **Cause:** The URL in `GOOGLE_REDIRECT_URI` does not match the URI in Google Cloud Console.
- **Fix:** In Google Cloud Console &rarr; Credentials &rarr; Edit OAuth Client ID, verify that the Authorized Redirect URI matches `GOOGLE_REDIRECT_URI` exactly (protocol `https://`, domain, and `/api/google/callback`).

### "Session expired or invalid"
- **Cause:** Session cookies expire after 8 hours or `SESSION_SECRET` was changed.
- **Fix:** Simply enter your master password on the lock screen to generate a fresh session.

### "Too many attempts. Please try again in 15 minutes."
- **Cause:** Rate limiting blocked password attempts after 5 consecutive failures.
- **Fix:** Wait 15 minutes or redeploy the function to reset the in-memory rate limiter.

### "No refresh token returned" on Google Callback
- **Cause:** You previously authorized the Google App and Google did not issue a new refresh token on re-authorization.
- **Fix:** Visit [Google Account Third-Party Permissions](https://myaccount.google.com/permissions), remove `PersonalVault`, then visit `/api/google/start` again.

### "File size exceeds the 4 MB limit"
- **Cause:** Vercel Serverless Functions on the Hobby tier enforce a request payload limit (~4.5 MB). Files over 4 MB cannot be uploaded in a single request.
- **Fix:** Upload files under 4 MB.

---

## 15. Free-Tier Infrastructure Limits & Security Model

### Free-Tier Limits
- **Vercel Hobby Tier:**
  - 100 GB bandwidth / month (more than enough for personal document storage).
  - Maximum function execution duration: 10–30 seconds.
  - Maximum upload payload: 4.5 MB per serverless request.
- **Google Drive Free Storage:**
  - 15 GB shared free storage per personal Google Account.
  - Zero API query charges for personal usage (Google Drive API quota is 100,000 queries/day).

### Security Model
- **No Client-Side Credentials:** All secrets (`VAULT_PASSWORD`, `SESSION_SECRET`, Google credentials) reside exclusively in Vercel serverless environment variables.
- **Strict File Isolation:** PersonalVault uses the scoped `drive.file` OAuth permission. It cannot see or tamper with documents elsewhere in your Google Drive.
- **Cryptographic Protection:** Sessions are signed using HMAC-SHA256 with constant-time signature verification (`crypto.timingSafeEqual`) to prevent timing and tampering attacks.
- **Zero Database Attack Surface:** Because there is no database, SQL injection, database credential leaks, and data breaches on database servers are impossible.
