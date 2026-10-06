# Frame Studio

Radha-Krishna print frames with unique QR-linked wedding gifts, backed by Neon PostgreSQL.

The public home page at `/` presents wedding and anniversary gifts for couples and shop orders. Its only actions open WhatsApp at +91 8333027544; no setup, authentication, or production details are described there. `/g/<code>` and legacy `/?code=<code>` links continue to open the original digital gift, while `/admin` remains the staff dashboard.

## Roles and flow

1. **Admin:** signs in at `/admin`, selects an approved template and quantity, then creates and downloads a batch. The destination comes from `PUBLIC_SITE_URL`, falling back to Render's automatically supplied `RENDER_EXTERNAL_URL` when the explicit setting is missing.
2. **Export:** each batch creates exactly the requested number of gift rows on demand, each with a unique cryptographically generated 6-character code. A database uniqueness constraint and collision retries prevent duplicates; records and batch settings are inserted atomically. Retrying the same request key does not create more rows. Its ZIP contains `1.png` through `N.png`, each linking to `/g/<code>`.
3. **Shop owner:** scans an empty frame and directly saves the groom's name, bride's name, and wedding date. No account or sign-in is required for gift setup.
4. **Customer:** scans the same QR and immediately enjoys the personalized welcome video and journey statistics. No login or activation code is required.
5. **Corrections:** append `/edit` to a gift link, such as `/g/ABC234/edit`, to update the groom's name, bride's name, and wedding date without sign-in. The form is prefilled and saving returns to the regular gift URL. The protected dashboard editor and legacy `?manage=1` links remain supported.

Staff accounts share gift inventory; separate per-shop inventory ownership is not implemented.

## Project Structure

```text
RK/
	home.html                 Public sales landing page
	index.html, admin.html    Digital gift and staff page entry points
	assets/
		images/                 Frame template and journey artwork
		videos/                 Original welcome video
		styles/                 Gift and admin stylesheets
		js/                     Browser application scripts
		source/                 Original PNG used to regenerate journey WebP
	api/                      Database, authentication, and frame endpoints
	scripts/                  Migration, backup, and maintenance tools
	tests/                    Unit and browser workflow checks
	backups/                  Private local backups and verification artifacts (ignored)
	dev-server.js             Local/production Node server
	package.json              Dependencies and commands
```

Public assets live under `/assets/`; source artwork, scripts, tests, and backups are not served. Legacy public asset URLs and saved batch artwork paths remain compatible. Generated previews belong in `backups/verification/`, not the project root. The move does not change asset bytes, gift layout, or QR coordinates.

## Setup

```bash
npm install
npm run backup
npm run migrate
npm run dev
```

The default server is `http://localhost:8000`; admin login is at `/admin`. Set `PORT` to use another port. Migration preserves existing records and does not reset an existing admin password. Backups are private, gitignored NDJSON files under `backups/`, with one table-tagged record per line. Backups page through large inventories; stop concurrent writes while taking a backup if you need a consistent point-in-time copy.

## Configuration

| Environment variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon database connection string |
| `JWT_SECRET` | Long random secret signing staff/admin sessions |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Initial admin seed; existing accounts are not overwritten |
| `PUBLIC_SITE_URL` | Preferred public origin for new batches, such as `https://gifts.your-domain.com`; restart/redeploy after changing it |
| `RENDER_EXTERNAL_URL` | Render's built-in HTTPS origin, used when `PUBLIC_SITE_URL` is missing or blank |
| `PORT` | Server port, default 8000 |
| `NODE_ENV` | Set to `production` behind HTTPS for secure cookies |

`CREATION_CODE` is no longer used. Authentication is required only for the admin/staff dashboard, not gift setup or `/edit`.

On Render, use **Environment > Add Environment Variable** to set `PUBLIC_SITE_URL` to the service's actual HTTPS origin, then choose **Save and deploy**. Do not copy `http://localhost:8010` into production. The local environment file is gitignored and not deployed. If neither origin setting is available, generation fails before creating any records; request headers and browser-supplied URLs are never used as the QR destination. Existing batches retain their previously saved URLs.

## Templates and printing

Approved templates are registered in `api/_lib/frames.js`. Each registration includes artwork, QR placement, colors, and print dimensions. Batch records snapshot those settings and persist individual URLs. Re-downloading a batch does not create new gifts. Keep the template's original artwork available and immutable for future downloads.

New batches export optimized lossless PNGs at the artwork's original 1536 x 1024 resolution, retaining its 72-DPI metadata. There is no enlargement or palette quantization, and artwork pixels outside the QR placement remain unchanged. At a physical print size of 15 x 10 inches, this source provides approximately 102 pixels per inch; upscaling would not add genuine detail. Previously created batches retain their saved dimensions when re-downloaded.

The red `#C80000` QR is centered at (1278, 720), with its complete borderless 110 x 110 pixel box starting at (1223, 665). Its light cells are `#FCEBC9`. The user selected this exact placement to merge into the existing red heart pattern, without a quiet zone. The isolated QR crop is decoded and checked against its assigned URL before export; this does not verify detection against surrounding decoration. The merged artwork failed detection in a larger crop during testing, so phone scanning and physical print tests are essential. Clipping QR modules into a heart is avoided.

**Use the deployed HTTPS domain before printing customer frames.** A `localhost` URL is only accessible on the device running the server. For phone testing, use the computer's LAN address on the same Wi-Fi. Print and scan a physical sample before producing a batch; automatic digital decoding cannot guarantee camera/printer performance.

Batch size is limited to 100. The server prepares ZIPs as background jobs in its private temporary directory, with one active export per process. The dashboard polls progress and reports failures as JSON before offering a download. Ready ZIPs use native browser downloads rather than browser-memory blobs. Up to five exports are cached for 30 minutes; enough temporary disk space is required. Jobs are process-local, so restarting the server requires preparing the download again. Failed exports can be retried from Recent Batches without allocating more codes. Printed batch records cannot be deleted through the dashboard.

## Deployment

Run `npm start` on a persistent Node host, such as Render, with the environment variables above and HTTPS. Deploy the artwork and video assets too. The included server handles `/g/<code>`, API routes, and range requests for video.

Direct Vercel deployment is not configured: it would require gift-link rewrites, icon asset handling, and a background/export storage approach suitable for serverless time and response-size limits. The current export implementation is intended for a single persistent Node process.

## Verification

```bash
npm test
npx playwright install chromium
npm run verify
npm run verify:landing
```

`npm test` requires no database and checks 4-6-character code generation, calendar validation, permissions, atomic activation, environment-only URLs, batch limits, numbered ZIPs, QR decoding, native resolution, and unchanged artwork pixels. `npm run verify` requires the running server and Neon credentials; its default origin is `http://localhost:8010` (override with `VERIFY_ORIGIN`). It creates a temporary batch and verifies exactly the requested number of new rows with 6-character codes, even after retrying the same request. It checks native ZIP downloads, rendering-failure status, and staff/customer flows, then captures desktop/mobile screenshots under `backups/verification`. Cleanup deletes only its temporary gifts, batch, and staff account. If interrupted, identify the verification batch before deleting its temporary records.

## Security

`npm run verify:landing` checks the home page at five viewport sizes, WhatsApp link behavior, and preserved gift/admin routes, without account credentials or database mutations. Its screenshots are saved privately under `backups/verification/`.

Codes default to 6 characters, and the shared generator supports lengths from 4 to 6. Short codes are guessable and should not be treated as private secrets. Gift setup and `/edit` are deliberately public at the user's request: anyone with a QR link or a guessed code can view and change that gift's details. Gift-edit authentication is deferred; avoid sensitive personal information. The admin dashboard, batch generation/downloads, and account management still require authenticated sessions using HttpOnly cookies. Mutation requests reject cross-site origins, admin sign-in attempts are throttled, and private files are not served by the Node server. The login throttle is process-local; add shared rate limiting when scaling beyond one server.

`node tests/verify-workflow.js --edit-only` checks public setup and editing with mocked gift APIs, no login credentials, and no database changes. It also confirms that anonymous admin API requests are rejected.

Rotate any credentials exposed outside your secrets store before public deployment. Keep database backups outside version control and protect them: they include password hashes and gift details.
