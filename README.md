# Istanbul Cafe & Restaurant — QR Table Ordering & Staff Performance

*A taste of Turkey, for everyone* — Shop L32/33, Jabi Lake Mall, Bala Sokoto Way, Jabi, Abuja · 0704 831 1111 · [@istanbulrestaurantcafeng](https://instagram.com/istanbulrestaurantcafeng)

Guests scan the QR code on their table, order from their phone, call a waiter, see their bill and rate their visit — no app, no sign-up. Waiters claim orders from a shared queue, the kitchen and bar get their own screens, and every action (who accepted, who cooked, who served, who took the money) is logged. Managers see the live floor, reconcile cash, and pick **Staff of the Month** from real data.

## What's in it

| Screen | Who | Where |
| --- | --- | --- |
| **Guest menu** | Guests (phone) | `/t/<table-token>` → `/order` — Istanbul's real menu with photos and Chef's picks, dish choices (spice level, steak doneness, fillings, three-scoop ice cream bowl, hookah flavour), cart, live order timeline, Call waiter button, receipt-style bill, rating |
| **Waiter app** | Waiters (phone, installable) | `/staff` — clock in, **New orders** queue (first to accept owns the table), **My tables** (serve, take payment, hand over, clear), **Requests**, **My stats** |
| **Kitchen / bar display** | Cooks, bar (tablet) | `/kds` — tickets per station with timers vs target prep time, Start / Ready, recall, mark items sold out |
| **Manager dashboard** | Managers, admin | `/admin` — live floor, reports, Staff of the Month, shifts & cash check, guest feedback, activity log, menu, tables & QR printing, staff, settings |
| **Wall of Fame** | Staff-room TV | `/fame` |

How an order flows:

1. Guest orders → it rings on every clocked-in waiter's phone.
2. The first waiter to tap **Accept** owns the table for that visit (follow-up orders and requests go straight to them). Two waiters tapping at once? Exactly one wins.
3. The waiter takes payment for the order (cash, POS or transfer — bank details are shown to the guest for transfers); only then does it go to the kitchen or bar screen. The guest sees "Accepted by Aisha" → Paid → Preparing → Ready → Served, live.
4. The kitchen taps **Ready** → the waiter's phone pings → they serve.
5. Once everything is served the guest's phone asks how it was.
6. Waiter clears the table. End of shift: they declare the cash they're handing in, and a manager confirms or disputes it.

Safety nets: an order nobody accepts within **2 minutes** is opened to everyone and managers are alerted; unanswered requests (3 min) and food left at the pass (5 min) are escalated too. Low ratings alert managers immediately. All timings are in Settings.

## Quick start (development)

Requirements: Node 20.19+ (22 recommended), pnpm, PostgreSQL 15+.

```bash
pnpm install
cp .env.example .env            # then fill in the values (see comments in the file)
createdb istanbul_dev && createdb istanbul_test
pnpm db:migrate                 # create tables
pnpm db:seed                    # Istanbul menu (208 items, 87 photos), 30 tables, demo staff
pnpm db:demo -- --yes           # OPTIONAL: 30 days of fake history so reports/leaderboards have data
pnpm dev                        # http://localhost:3001 on this Mac (PORT in .env)
```

> On this Mac the project uses the Homebrew PostgreSQL 17 on **port 5433** (`postgresql://Apple@localhost:5433/istanbul_dev`) and runs on **port 3001**, so it can run next to the A-Class app on 3000. The other PostgreSQL 15 install on port 5432 needs a password and isn't used.

### Demo logins (change before going live — Admin → Staff)

| Code | PIN / password | Role |
| --- | --- | --- |
| A001 | `admin1234` | Admin (everything, incl. settings) |
| M001 | `manager123` | Manager |
| W001–W004 | `1111` `2222` `3333` `4444` | Waiters |
| K001 | `5555` | Kitchen |
| B001 | `6666` | Bar (drinks, coffee, tea and hookah) |

Try it: log in as **W001** on one browser window, **K001** on another (`/kds`), then open **Admin → Tables & QR codes**, click any table link (that's what the QR code opens) and order.

### Testing on real phones (restaurant Wi-Fi)

Set `APP_URL=http://<your-computer's-LAN-IP>:3001` in `.env`, restart `pnpm dev`, and print a few cards from **Admin → Tables & QR codes → Print table cards**. Phones on the same Wi-Fi can scan them. (Lock-screen alerts need HTTPS, so they only work on the live site — sounds and vibration work anywhere while the app is open.)

## The Istanbul look

Taken from the restaurant itself. Their logo is a deep **crimson (#911949)** "ISTANBUL" in flared capitals over "CAFE & RESTAURANT", and their Jabi Lake Mall room repeats it: crimson velvet banquettes and curtains, **navy** velvet chairs, **gold** chandeliers and arched gold window frames, white tablecloths and columns, and a covered terrace full of plants. So: crimson for actions, navy for dark surfaces and text, ivory for the page, gold for accents on dark, and the terrace green for "done". **Marcellus** (the flared capitals of their logo) sets the wordmark and dish names; **Montserrat** (their website's font) everything else. The ornament is a **tulip**, the flower of Istanbul; the app icon is an ivory tulip on crimson. The report charts use crimson, blue and brass, checked for colour-blind separation.

Menu photos are openly licensed (CC0 / public domain, plus 12 CC BY photos from Flickr and Wikimedia credited at `/credits`) so the restaurant can use them commercially; four were cropped to remove bystanders or another restaurant's branding. No photos show people. Istanbul's own QR menu has their own dish photography — with their go-ahead, swap those in any time from **Admin → Menu**.

## About the menu

The seed is Istanbul's own QR menu (MenuLux, last updated August 2026), prices in naira. Along the way:

- **Variants became choices**, as a waiter would take them: omelets (plain / cheese / mushroom / herbs), fajitas, quesadillas, tacos, wraps, Chinese & Singapore noodles, Thai rice, Alfredo, arrabbiata, cheesecake and Baworoski flavours, soft drinks, water size, espresso size, milkshake flavour, glass of wine and the eleven hookah flavours. Where a variant costs more, the choice carries the difference.
- **Kept from their menu:** the soup and tirit "spicy or mild" choice, cappuccino "with or without sugar", the three-scoop ice cream bowl. **Added for the kitchen:** steak doneness on the ribeye, pepper steak, Beef Rossini and grilled beef.
- **Butcher's Grill** is their Luxury Butcher section's grilled plates, priced per kilo as on their menu. The raw butcher counter (29 cuts sold by the kilo to take home) is left out — it isn't a table order.
- **Left out:** till-only lines (Extra, Take-away packaging, complimentary zobo), the pre-order Celebration Cake, and items currently hidden on their menu (Marlenka, White Malaga Cake, Eclair, Chicken and Meat Suya, Pepsi Light). **Turkish Coffee** is also hidden on their menu right now, so it's seeded as *sold out* — switch it on from the kitchen/bar screen or Admin → Menu.
- **Stations:** food → kitchen screen; drinks, coffee, tea and hookah → bar screen.

**VAT and service charge are seeded at 0%.** Their QR menu records 7.5% VAT but shows every price as the final price, so the app charges exactly the menu price and doesn't mention VAT to guests. If their receipts add VAT or a service charge, set it in **Settings** — the bill, the guest's "to pay" box and the menu footer follow automatically.

## Going live checklist

1. **Pick the domain first** (e.g. `order.istanbulrestaurantcafe.com`). QR codes encode `APP_URL/t/<token>`, so print cards only after `APP_URL` is final.
2. Deploy (below) with HTTPS.
3. Log in as **A001** → **Settings**: confirm **VAT and service charge** (see above), kitchen hours (seeded 10:00–23:00, their published hours; tick *Open all day* to demo late at night), **bank details** for transfers, alert timings, Staff of the Month weights.
4. **Staff**: create real accounts, give each person their own PIN, deactivate the demo ones. Add photos — guests see their waiter's photo.
5. **Menu**: check prices against the current menu, replace stock photos with their own, adjust choices and Chef's picks.
6. **Tables & QR codes**: the seed has Main Hall T1–T16, Terrace P1–P12 and Private Dining VIP1–VIP2 — match the real floor plan, then **Print table cards** (A4, 4 per page) and place them in table stands.
7. Waiters: open the site on their phones → log in → **Settings → Turn on lock-screen alerts**. On iPhone, first tap Share → **Add to Home Screen** and open it from there.
8. Kitchen/bar: a tablet on `/kds` per station, plugged in, screen brightness up.

Operating tips: if a QR card is photographed or stolen, **Tables → New code** invalidates it (reprint that card). To pause phone ordering (private event, buffet night, power cut), switch off **Settings → QR ordering**; guests can still call a waiter.

## Deploying (Render + Neon)

Live at **https://istanbul-abuja.onrender.com** once the Render step below is done — the same setup as the A-Class app.

The app is one Node process (Next.js + Socket.io live updates) plus PostgreSQL. It needs a host that keeps a process running — **not** GitHub Pages or serverless platforms like Vercel or Netlify. The repo ships a `Dockerfile` (runs on any Docker host) and a Render Blueprint (`render.yaml`).

1. **Database (Neon):** project `curly-feather-91444146` (aws us-east-2), already migrated and seeded with the Istanbul menu, tables and staff (live PINs are random — see `.env.render`). It must be claimed into your Neon account by **16 Sept 2026, 16:23 UTC** or Neon deletes it: `npx neonctl claim accept curly-feather-91444146`. **Claiming resets the database password** — afterwards copy the pooled (`DATABASE_URL`) and direct (`DATABASE_URL_UNPOOLED`, host without `-pooler`) connection strings from Neon's Connect button into Render and `.env.render`.
2. **App (Render):** New → Blueprint → pick this repo (`mustapha7777ib/istanbul-restaurant`). Render reads `render.yaml`, generates `SESSION_SECRET`/`INTERNAL_SECRET`, and asks for `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `VAPID_PRIVATE_KEY` (all in the gitignored `.env.render`).
3. Every start runs `prisma migrate deploy` (direct URL), then the server. `APP_URL` defaults to the `onrender.com` address; set it to your domain once attached — and reprint the QR cards.
4. Pushes to `main` deploy automatically once GitHub Actions (`.github/workflows/ci.yml`: typecheck, lint, tests, Docker smoke test) pass.
5. Run **one** instance (the escalation timer and live connections live in the process). The `free` plan sleeps after 15 idle minutes (the first scan then takes about a minute) — use `starter` or higher for real service.
6. Look at the live data: `pnpm db:studio:live` (Prisma Studio on the Neon database, reads `.env.render`). Plain `npx prisma studio` shows your local database.

Starting from scratch instead? Create a Neon project, then from your machine: `DATABASE_URL=<direct url> pnpm db:deploy && DATABASE_URL=<pooled url> pnpm db:seed`, and change the demo PINs (Admin → Staff).

Back up the database: Neon keeps point-in-time history (restore window depends on plan).

## Staff of the Month — how the score works

Each waiter gets 0–100 per month (Africa/Lagos time), weights editable in Settings:

| Part | Default weight | Measured by |
| --- | --- | --- |
| Guest ratings | 35 | service stars, Bayesian-averaged so 1 five-star rating can't beat 60 steady ones |
| Speed | 25 | median time to accept orders + median time from "ready" to "served" (vs colleagues) |
| Orders per hour | 20 | orders served ÷ hours clocked in (fair to part-timers) |
| Answering requests | 10 | median time to respond when a table calls |
| Reliability | 10 | 100 − 20 per disputed cash handover − 2 per void on their orders |

Staff below the minimum hours **or** orders (Settings) are shown but not ranked. Kitchen/bar staff are ranked on % of items ready within target time and tickets per hour. The system suggests the top scorer; a manager clicks **Award**, which appears on the Wall of Fame.

## Tests

```bash
pnpm test   # unit + integration against TEST_DATABASE_URL (wiped each run)
pnpm e2e    # production build + browser test on port 3200: guest, waiter, kitchen, bar in 4 windows
pnpm lint && pnpm typecheck
```

The integration suite covers the full visit, the "five waiters tap Accept at once" race, ownership/escalation, voids, sold-out items, paused ordering, cash guards, forced table clears, and Lagos month boundaries. The browser test orders an Adana Kebab, a Chapman and a Lamb Tandoori Soup (mild) at table T5 and follows it through payment, kitchen, bar, serving, rating and clearing.

## How it's built

- **Next.js 16** (App Router) + TypeScript + Tailwind, run by `server.ts` which also hosts **Socket.io** and a 15-second escalation ticker.
- **PostgreSQL** via **Prisma 7** (`prisma/schema.prisma`). Money is stored in kobo; timestamps in UTC, reported in Africa/Lagos time.
- Every change goes through `src/services/*`: it checks permissions and state, writes the change **and** an `ActivityEvent` in the same database transaction, then pushes live updates. That's why the activity log can't disagree with reality.
- Staff sign in with staff code + PIN (bcrypt, 5 wrong tries = 5-minute lock); guests get a signed cookie tied to their table visit.
- Web Push (VAPID) wakes waiters' locked phones; a service worker (`public/sw.js`) shows the alert.

```
server.ts                 Next.js + Socket.io + escalation ticker
prisma/                   schema, migrations, seed (+ seed-assets photos & credits), demo-history
src/services/             business rules (orders, kitchen, payments, shifts, metrics…)
src/app/order             guest app          src/app/staff   waiter app
src/app/kds               kitchen/bar screen src/app/admin   manager dashboard
src/app/api               JSON endpoints used by the live apps
tests/  e2e/              Vitest and Playwright suites
```

This project started as a copy of the A-Class Restaurant app (`~/Documents/Restaurant`); the code is the same apart from the menu, branding and the VAT wording, so fixes can be carried across between the two.

## Ideas for phase 2

Online payment (Paystack) · more than one branch (their Instagram also lists an Istanbul Express at Nizamiye Hospital) · event mode (buffet nights, private dining, reservations) · the Luxury Butcher counter with weights · thermal receipt printer · stock tracking and low-stock alerts · WhatsApp receipts and loyalty by phone number.
