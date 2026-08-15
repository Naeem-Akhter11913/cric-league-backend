# Cric League Backend

Basic Express + MongoDB (Mongoose) setup for the Cric League platform, matching the system design
(5 roles: Super Admin, Tournament Organizer, Team Manager, Player, Scorer; tournaments → teams →
matches → innings → ball-by-ball scoring).

## What's included
- Express app with security middleware (helmet, cors, rate limiting), centralized error handling
- MongoDB connection via Mongoose
- All 16 Mongoose models from the design (User, Team, Tournament, Match, Innings, Ball, etc.)
- JWT auth (access + refresh tokens, bcrypt password hashing) — register/login/refresh/logout
- Role-based access control middleware
- Working `players` and `teams` modules (controller/service/routes pattern) as a template for the
  remaining modules (tournament, match, scoring, stats, points table, notifications — stubbed as
  commented routes in `src/routes/index.js`, ready to build out using the same pattern)
- Socket.IO wired up for live scoring broadcasts (`match:<id>` rooms)
- Seed script to create an initial super admin

## Prerequisites
- Node.js 18+
- MongoDB running locally or a connection string (MongoDB Atlas works fine)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and edit values
cp .env.example .env

# 3. Make sure MongoDB is running, then start the server
npm run dev        # with nodemon (auto-restart)
# or
npm start           # plain node

# 4. (optional) seed a super admin user
npm run seed
```

Server runs at `http://localhost:5000` by default. Health check: `GET /api/v1/health`.

## Try it out

```bash
# Register a player
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Virat","email":"virat@example.com","password":"pass123","role":"player"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"virat@example.com","password":"pass123"}'

# Create player profile (use accessToken from login response)
curl -X POST http://localhost:5000/api/v1/players \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{"battingStyle":"right_hand","playerType":"batter"}'
```

## Project structure
```
src/
├── config/        # db, env, socket.io setup
├── models/        # Mongoose schemas
├── modules/        # feature-first: controller + service + routes per domain
├── middlewares/    # auth, rbac, validation, error handling, rate limiting
├── jobs/            # background recompute jobs (stats, points table) - stubs to fill in
├── sockets/          # live score broadcast helpers
├── utils/            # logger, ApiError, ApiResponse, constants, seed script
├── routes/           # central route mounting
├── app.js             # express app
└── server.js           # http + socket.io + db bootstrap
```

## Next steps
- Flesh out `tournament`, `match`, `scoring`, `stats`, `pointsTable`, `superAdmin`, `organizer`,
  `notification` modules using the same controller/service/routes pattern as `player` and `team`.
- Implement the ball-scoring endpoint in `scoring.service.js`: validate scorer assignment, append
  a `Ball` doc (idempotent on `ballUuid`), atomically update the `Innings` running totals, then
  broadcast via `src/sockets/liveScore.socket.js`.
- Add BullMQ + Redis for `jobs/` (stat/points-table recomputation) if you need it to scale beyond
  simple synchronous updates.
- Add integration tests under `tests/`.
