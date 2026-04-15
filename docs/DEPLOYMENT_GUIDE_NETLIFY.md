# Netlify Deployment Guide for VelumX Landing Page

Follow these steps to host your elite landing page at **velumx.xyz** (naked domain).

## 🚀 Recommended: Dashboard Deployment (GitHub)

The most robust way to manage deployments is directly from the Netlify dashboard by linking your GitHub repository.

### 1. Link Your Repository
- Log in to your [Netlify Dashboard](https://app.netlify.com/).
- Click **"Add new site"** → **"Import an existing project"**.
- Select **GitHub** and authorize access to your `VelumX` repository.

### 2. Configure Monorepo Settings
Since your landing page is in the `/landing` subfolder, you **MUST** configure these essential settings:
- **Base Directory**: `landing`
- **Build Command**: `npm run build`
- **Publish Directory**: `.next`
- **Functions Directory**: (Leave blank or `netlify/functions`)

### 3. Environment Variables
Ensure the following are set in the **"Site configuration" → "Environment variables"** section:
- `NODE_VERSION`: `20` (or your preferred latest LTS).
- `NPM_FLAGS`: `--force` (if you encounter dependency peer-conflicts).

---

## 💻 Alternative: CLI Manual Deployment

If you prefer to deploy directly from your terminal, use the Netlify CLI.

1.  **Install CLI**:
    ```bash
    npm install netlify-cli -g
    ```
2.  **Navigate to Folder**:
    ```bash
    cd landing
    ```
3.  **Build & Deploy**:
    ```bash
    npm run build
    netlify deploy --prod
    ```

---

## 🌐 Custom Domain: velumx.xyz

Once the build is successful:
1. Go to **"Domain settings"** in your Netlify dashboard.
2. Click **"Add custom domain"** and enter `velumx.xyz`.
3. Netlify will guide you to update your DNS (A Record or CNAME) to point to their servers.

> [!IMPORTANT]
> The naked domain (`velumx.xyz`) should point to this **Landing** site. The `app.velumx.xyz` and `dashboard.velumx.xyz` subdomains should remain pointed to your Vercel or other hosting projects.
