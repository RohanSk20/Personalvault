# PersonalVault — Vercel + Google Drive

Minimal single-password document vault. React + Vite frontend, Vercel serverless API, Google Drive storage.

## Google Cloud OAuth setup
1. Enable Google Drive API.
2. Configure Google Auth Platform branding and audience.
3. Add scope `https://www.googleapis.com/auth/drive.file`.
4. For production use, publish the OAuth app (not Testing) before obtaining the long-lived refresh token.
5. Create a Web application OAuth client. Add this exact Authorized redirect URI after you know your Vercel domain:
   `https://YOUR-PROJECT.vercel.app/api/google/callback`

`drive.file` is a limited scope: the app can manage files it creates or files explicitly opened/shared with it. This starter creates and manages its own `PersonalVault` folder. It does not automatically index arbitrary existing files in your Drive. Google Picker can be added later for importing existing documents.

## Deploy
1. Push this folder to a private GitHub repository.
2. Import it at https://vercel.com/new.
3. Framework: Vite; Build command: `npm run build`; Output directory: `dist`.
4. In Vercel Project Settings → Environment Variables add:
   - `VAULT_PASSWORD`: long unique password for the website
   - `SESSION_SECRET`: random value of at least 32 characters
   - `GOOGLE_CLIENT_ID`: OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: OAuth client secret
   - `GOOGLE_REDIRECT_URI`: `https://YOUR-PROJECT.vercel.app/api/google/callback`
   - `DRIVE_FOLDER_NAME`: `PersonalVault`
5. Redeploy.
6. Visit `https://YOUR-PROJECT.vercel.app/api/google/start`, approve Drive access, and copy the refresh token shown on the callback page.
7. Add it to Vercel as `GOOGLE_REFRESH_TOKEN`, then redeploy again.
8. Open your site, enter the vault password, and upload files.

## Local development
`npm install` then `npm run dev` runs only the Vite frontend. To test API routes locally, use Vercel CLI (`npm i -g vercel`, then `vercel dev`) with the environment variables in `.env.local`.

## Limitations and security
- Uploads are limited to 4 MB because Vercel Functions have a 4.5 MB request/response payload limit. Larger resumable uploads are a future enhancement.
- Google OAuth refresh tokens for external apps in Testing mode can expire after 7 days for Drive scopes. Publish the app before production use; Google may show an unverified-app warning or require verification depending on configuration.
- Google OAuth client secret and refresh token remain server-side. Do not add `VITE_` prefixes to secrets.
- The session cookie is HttpOnly, SameSite=Lax, Secure on Vercel, and expires after 8 hours. No logout button is included, per request.
- Files are not client-side encrypted in this starter. Use a strong vault password, enable Google account MFA, restrict Vercel project access, and keep independent backups. This is a starter project, not an audited security product.
