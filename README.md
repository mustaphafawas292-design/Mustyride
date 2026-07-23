# MustyRide — Full App (Backend + Frontend, one server)

Full-stack MustyRide bike logistics platform: customer/rider auth, the
booking engine, fare calculator, rider matching, live tracking, wallets,
payments (Flutterwave), ratings, notifications, support/complaints + in-app
calling, AI assistant, and the complete frontend - all served from **one
Express server on one port**.

## How this is structured

```
mustyride/
  server.js          Entry point
  src/                Backend (models, controllers, routes, services)
  public/             The entire frontend (HTML/CSS/JS) - Express serves this
```

Running `npm run dev` starts the one server, and it serves **both** the API
(under `/api/...`) and the website itself (everything else). Visit
`http://localhost:5000` and you get the actual site — no separate frontend
server, no CORS setup, no Live Server needed. This is also what makes hosting
simple: deploy this one folder to Render/Railway/etc. as a single Node
service, and both frontend and backend go live together.

If you ever want to edit the frontend, its files live in `public/` - same
HTML/CSS/JS as before, just relocated.

## 1. Requirements

- Node.js 18+
- MongoDB (local install, or a free Atlas cluster)
- A Flutterwave account (you already have one) — get your test API keys from
  the Flutterwave dashboard under Settings → API
- An SMS provider account for OTPs — **Flutterwave does not send SMS.**
  Termii or Africa's Talking both work well for Nigerian numbers. Until you
  add real keys, OTPs are just printed to your terminal so you can keep
  developing without spending money on SMS.

## 2. Setup

```bash
cd mustyride-backend
npm install
cp .env.example .env
```

Open `.env` and fill in at minimum:
- `MONGO_URI` — e.g. `mongodb://127.0.0.1:27017/mustyride`
- `JWT_SECRET` — any long random string
- `FLW_PUBLIC_KEY` / `FLW_SECRET_KEY` — from your Flutterwave dashboard

Everything else has a working default or safe placeholder for local dev.

Seed the database with a default fare config and a first admin account:

```bash
npm run seed:fareconfig
```

This creates an admin at `admin@mustyride.ng` / `ChangeMe123!` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars before seeding). **Log in
and change this password immediately.**

Start the server:

```bash
npm run dev
```

The API runs at `http://localhost:5000/api`. Check `GET /api/health` to
confirm it's up.

## 3. Project structure

```
src/
  config/db.js          MongoDB connection
  models/                Every collection — one file per entity
  controllers/           Request handlers, one file per module
  routes/                Express routers, mounted in routes/index.js
  services/               Business logic used by controllers:
    fareService.js          the fare calculator (module 3 & 18)
    matchingService.js      rider matching + dispatch cascade (module 4)
    distanceService.js      haversine distance/ETA (swap for Google Maps later)
    walletService.js        all wallet credits/debits go through here
    flutterwaveService.js   payments + rider payouts
    otpService.js           OTP generate/send/verify
    smsService.js           SMS sending, provider-agnostic
    callService.js          in-app click-to-call
    notificationService.js  in-app + SMS notifications
    fraudService.js         rule-based fraud checks (module 15)
  middleware/             auth (JWT), file upload, rate limiting, errors
  utils/                  small shared helpers (tokens, OTP hashing, etc.)
server.js                Entry point — connects DB, starts Express + Socket.io
```

## 4. How the core flow works

1. **Customer books** → `POST /api/bookings` → fare is calculated
   (`fareService`) → booking saved → `matchingService.offerToNextRider()`
   finds the nearest eligible rider and creates a `MatchRequest`.
2. **Rider gets notified**, then calls `POST /api/bookings/:id/respond`
   with `accept` or `decline`.
   - Accept → rider is assigned, booking status moves to `rider_assigned`.
   - Decline (or the request just expires — check `expiresAt` on the
     `MatchRequest` on a schedule/cron) → call `offerToNextRider` again,
     excluding riders already offered.
3. **Rider progresses the trip** via `PATCH /api/bookings/:id/status`
   through `rider_arrived_pickup → picked_up → in_transit →
   arrived_destination → delivered`. Each step notifies the customer.
4. **Live tracking**: the rider's app calls `POST /api/tracking/ping` every
   few seconds. This updates the rider's location, appends to
   `RiderLocationPing` history, updates the booking's `liveTracking`
   snapshot, and pushes a `tracking:update` event over Socket.io to anyone
   subscribed to `booking:<id>`. `GET /api/tracking/:bookingId` is the
   polling fallback.

## 5. What's genuinely production-ready vs. what to upgrade later

**Solid as-is:**
- Auth flows (signup/OTP/login/forgot-password) for all three actor types
- Fare calculation logic and rider matching/ranking logic
- Wallet ledger (every credit/debit is atomic and logged as a Transaction)
- Flutterwave payment initiation, verification, and webhook handling
- Data models for all 19 modules from the spec

**Needs a real provider plugged in before going live:**
- `smsService.js` — add your Termii/Africa's Talking key in `.env`
- `callService.js` — add a voice provider key for real call bridging;
  until then it logs the call and just hands back the real phone number
- `distanceService.js` — currently haversine-based (free, no key needed);
  swap in Google Distance Matrix for real road distance + traffic
- File uploads currently save to local disk (`middleware/upload.js`) —
  fine for development, but won't survive a redeploy on Render. Swap to
  Cloudinary or S3 before production.

The rider-matching timeout cascade is already wired up: `src/jobs/
expireMatchRequests.js` runs every 5 seconds (started from `server.js`),
finds any offer that timed out without a response, and automatically
re-dispatches to the next ranked rider.

## 6. Testing without real Flutterwave/SMS credentials

Leave `SMS_API_KEY` and `VOICE_API_KEY` as the placeholder values in
`.env.example` — the app detects this and logs OTPs/calls to the console
instead of failing, so you can test the entire signup → book → track →
deliver flow end-to-end before wiring up real providers.
