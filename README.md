# Concrete Job Costing PWA

A mobile-friendly React Progressive Web App for concrete job costing, overhead tracking, job reports, and profit alerts. It saves data in the browser on the device using local storage.

## Run Locally

From this folder:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:8080
```

The app is static, so it can also be hosted on any HTTPS static host.

## Deploy on Vercel

This project is configured as a static PWA for Vercel.

1. Make sure `index.html`, `vercel.json`, `package.json`, `sw.js`, `manifest.webmanifest`, `src/`, `assets/`, and `vendor/` are at the repository root.
2. In Vercel, import the GitHub repository.
3. Leave the framework preset as **Other** if Vercel asks.
4. Use the repository root as the root directory.
5. Deploy.

Vercel uses `npm run build` to verify the required static files and serves the current folder as the output directory. All app routes fall back to `index.html`, so the app loads instead of showing `Not found`.

## Android Install

For a true installable PWA on Android, open the app from Chrome on a secure origin: HTTPS, or localhost on the same device.

1. Host the folder on an HTTPS static host such as Netlify, Vercel, GitHub Pages, or your own HTTPS server.
2. Open the HTTPS app URL in Chrome on Android.
3. Tap the Chrome menu.
4. Tap **Add to Home screen** or **Install app**.
5. Confirm the install.

After it is installed, open it from the home screen. Jobs, overhead edits, settings, and backups are stored on that phone unless you export a backup from Settings.

If you open the app from a computer's local network IP address over plain HTTP, Chrome may only add a shortcut instead of installing the PWA because service workers require a secure origin.

## Included Sample Data

The app starts with sample jobs based on your real numbers:

- Monthly overhead: `$10,000`
- Typical weekly completed revenue: `$20,000`
- Recent driveway job sale price: `$15,300`
- Recent driveway job direct costs: `$9,080`
- Recent driveway job gross profit: `$6,220`
- Recent driveway job gross margin: `40.7%`

The second sample job brings the current week to `$20,000` in completed revenue.

## Default Monthly Overhead

- Truck payment: `$600`
- Bobcat payment: `$1,100`
- Buggy payment: `$500`
- Liability insurance: `$2,000`
- Truck insurance: `$283`
- Marketing average: `$2,700`
- Jobber: `$130`
- AI phone assistant: `$60`
- QuickBooks: `$50`
- Fuel allowance: `$1,200`
- Misc/maintenance reserve: `$1,377`

Total default monthly overhead: `$10,000`.

## Formulas

Gross profit:

```text
Gross profit = Sale price - Direct job costs
```

Gross margin:

```text
Gross margin % = Gross profit / Sale price
```

Break-even sales:

```text
Break-even sales = Monthly overhead / Gross margin %
```

Needed sales for target profit:

```text
Needed sales for target profit = (Monthly overhead + Target profit) / Gross margin %
```

Net profit estimate:

```text
Net profit estimate = Gross profit - Allocated overhead
```

Overhead allocation:

```text
Allocated overhead = Monthly overhead * (Job sale price / Monthly completed revenue basis)
```

For completed or paid jobs, the revenue basis is completed revenue in that job's completion month. For leads, sold jobs, scheduled jobs, and in-progress jobs, the app uses typical weekly completed revenue times `4.333` weeks per month as the estimate basis.

## Alerts

The app warns when:

- A job's gross margin is below `35%`
- Overhead is above `15%` of monthly sales
- Monthly revenue is below break-even sales
- A job is completed but not marked paid

You can change the alert percentages and target monthly profit in Settings.

## Backup

Use **Settings > Backup** to download your data as JSON. Use **Settings > Restore** to load that JSON back into the app.
