# Premium Digital Wedding Gift Experience

A personalized, two-screen mobile-first digital wedding gift that opens
through a QR code + access code — with a couple's names, wedding date,
and live "journey so far" statistics. Backed by Neon Postgres so the
same physical product (a QR-coded photo frame) can be resold to many
different couples, each personalizing their own gift on first scan.

## How it works (end-to-end)

1. **We provision codes.** Using the admin dashboard, we generate a
   batch of unique access codes (one per frame we're printing).
2. **We print + sell frames.** Each frame gets its access code printed
   on it (and a QR code linking to the site). Buyers are also given
   the shared **Creation Code** (kept secret, changed per business
   needs) at time of purchase — proof they're a legitimate buyer, not
   a stranger with a guessed code.
3. **First scan:** the buyer enters their access code. Since the row is
   still empty, they're shown a short form (groom's name, bride's name,
   wedding date, Creation Code). Submitting it locks in their data
   forever — the form never appears again for that code.
4. **Every scan after that** (by them or their guests) goes straight to
   the personalized Screen 1 (welcome video) → Screen 2 ("Our Journey
   So Far") experience.
5. **We manage everything** afterward from the admin dashboard: create
   new codes, edit/delete any row, add more admin/staff accounts.

## Project structure

```
RK/
├── index.html            # Access-code gate + fill-in form + Screen 1 + Screen 2
├── styles.css            # All visual styling (gate screens + both experience screens)
├── script.js             # AccessGate + WeddingGiftExperience (screen logic)
├── utils.js              # Date/number calculation helpers
├── admin.html/.js/.css   # Admin dashboard (login, gift codes, users)
├── screen2.png           # Fixed "Our Journey So Far" artwork template
├── Krishna_and_Radha_meeting...mp4  # Welcome video (Screen 1)
├── api/                  # Serverless functions (Vercel-compatible)
│   ├── _lib/db.js         # Shared Neon client
│   ├── _lib/auth.js       # JWT session helpers (admin login)
│   ├── gift.js             # GET  /api/gift?code=          (public lookup)
│   ├── gift-fill.js        # POST /api/gift-fill           (public, first-time setup)
│   └── admin/
│       ├── login.js / logout.js / me.js
│       ├── gifts.js        # GET (list) / POST (create new empty code)
│       ├── gift.js         # PUT (edit) / DELETE, by ?id=
│       └── users.js        # GET/POST — admin-only user management
├── scripts/
│   ├── migrate.js          # Creates tables + seeds first admin (safe to re-run)
│   ├── seed-test-data.js   # Optional: seeds disposable rows for manual QA
│   └── cleanup-test-data.js
├── dev-server.js          # Local dev server (static files + emulated /api routes)
└── .env                   # DATABASE_URL, CREATION_CODE, JWT_SECRET, ADMIN_EMAIL/PASSWORD (gitignored)
```

## Running locally

```bash
npm install
npm run migrate     # one-time: creates tables + seeds the first admin account
npm run dev         # starts the site + API at http://localhost:8000
```

Visit `http://localhost:8000/` for the gift experience, or
`http://localhost:8000/admin` for the dashboard (log in with the
`ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`).

> `dev-server.js` is a lightweight local stand-in for Vercel's runtime —
> it serves the static files and routes `/api/*` requests to the same
> handler files Vercel would run in production. There's no separate
> "build" step; the `/api` files are plain CommonJS functions.

## Environment variables (`.env`, never committed)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `CREATION_CODE` | Shared secret buyers enter once to activate their frame |
| `JWT_SECRET` | Signs the admin session cookie |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeds the first admin account (only used by `scripts/migrate.js`) |

## Deploying

This is structured to deploy on **Vercel** with a **Neon** database:
1. Push the repo (`.env` stays out of git — set the same variables in
   the Vercel project's Environment Variables settings instead).
2. Vercel auto-detects the `/api/*.js` files as serverless functions and
   serves everything else (`index.html`, `admin.html`, etc.) as static
   files — no extra config needed.
3. Run `npm run migrate` once (pointed at the production `DATABASE_URL`)
   to create the tables and seed the first admin account.

## Security notes

- The Creation Code and admin passwords are never sent to the browser
  except at the moment of an actual login/fill-in submission over
  HTTPS; they're checked server-side against environment variables /
  bcrypt hashes.
- Admin sessions are httpOnly JWT cookies — not accessible to
  client-side JS, reducing XSS exposure.
- Once a gift row is filled in, the public form permanently refuses to
  touch it again (only the admin dashboard can edit it afterward).

## Design principles (unchanged from the original vision)

- **Zero setup for wedding guests** — they just scan and view.
- **Premium aesthetic** — elegant serif typography, warm gold accents,
  inspired by luxury Indian wedding stationery.
- **Fully responsive** — verified across many phone aspect ratios,
  landscape, and desktop without ever cropping the artwork.
- **No tracking, no ads, no accounts for the couple** — the only
  "account system" in this project is for us (the sellers) to manage
  inventory of codes.
