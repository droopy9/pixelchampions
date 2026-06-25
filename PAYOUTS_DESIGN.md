# Payouts — Design Doc

Status: draft for discussion. No code committed beyond the existing orphaned scaffolding.

## 1. Current state

- `server/api.ts` defines `/api/config`, `/api/check-holder`, `/api/award` and even
  signs real Solana transfers with a treasury `Keypair`.
- `attachApi(...)` is **never called**: `vite.config.ts` does not import it, and
  `server/game-server.ts` does not mount it on its Express app. Both `fetch`
  calls from `src/wallet/api.ts` would 404 today.
- `src/scenes/ResultScene.ts` shows a hard-coded "TESTING MODE — No SOL payouts"
  banner and never invokes `postAward`.
- Holder gating (token ownership check) exists in code but is also unwired.

So the question is not "how do we build payouts" — it is "what would we have to
fix in the existing scaffolding before mounting it on a public endpoint."

## 2. What is broken about the existing endpoint

These are blockers, not nits:

1. **No authentication.** Anyone with the URL can POST `{ winnerName,
   winnerPublicKey }` and receive `WIN_REWARD_SOL`. Open faucet.
2. **No race verification.** The server has no link between an `/api/award`
   call and a race actually happening. A caller is trusted to claim the win.
3. **No idempotency.** Two POSTs for the same race pay twice. No
   `raceId`, no nonce, no record.
4. **No persistence.** Nothing logs payouts. No audit trail, no reconciliation.
5. **Mounted on `ViteDevServer`.** Even if `attachApi` were called, it would
   only run in dev. Production (`npm start` → `tsx server/game-server.ts`)
   ignores `vite.config.ts` entirely.
6. **Single winner only.** No prize-pool semantics, no top-3 split, no
   second-place consolation.
7. **No sustainability model.** Treasury is a one-way pipe. Entry fees /
   funding loop is not designed.

## 3. Trust model

The authoritative game state lives in `server/game-server.ts` — it knows who
finished first, what their `playerId` was, and what their wallet pubkey is
(captured at `joinLobby`). The result is broadcast as `raceEnd` *from that
same process*.

Therefore: **the game server, not the client, must be the source of truth for
who gets paid.** Any design where the client POSTs "I won" is a non-starter.

Two viable shapes:

**Shape A — server pushes payouts.** When the game server emits `raceEnd`, it
also (in the same handler) initiates the on-chain transfer. No client API. The
client only renders the resulting tx signature it receives via socket. Simple,
unforgeable, but couples game-tick latency to RPC round-trips.

**Shape B — server-signed claim token.** Game server includes a short-lived,
signed claim ticket in the `raceEnd` payload (`{ raceId, pubkey, amount,
expiry, sig }`). Client POSTs the ticket to a separate payout worker, which
verifies the signature and sends the tx. Decouples gameplay from RPC, lets us
retry without re-running races, lets the user "claim" on demand.

I'd recommend **Shape A for v1** (fewer moving parts; ~50 LOC) and only move
to B if we hit latency / retry pain. Both fit the existing treasury wiring.

## 4. Idempotency

Required no matter which shape. Smallest viable approach:

- Game server assigns a unique `raceId` at `startRace()` (uuid).
- Maintain `paidRaces: Set<string>` in memory + a flat file or SQLite for
  durability across restarts.
- `payoutWinner(raceId, …)` is a guard-clause function: if `paidRaces.has(raceId)`,
  no-op. Otherwise attempt the transfer; only mark `paid` after
  `sendAndConfirmTransaction` resolves.
- On crash mid-transfer: the next start re-reads `paidRaces`; an in-flight tx
  that already landed is not re-sent. An in-flight tx that did not land needs
  manual reconciliation — accept this risk for v1; document it.

A real implementation needs a DB. For v1, JSON file in `data/payouts.json` is
fine and matches the project's current minimalism.

## 5. Prize structure

Open question for the user. Options:

- **Winner-takes-all** (current `WIN_REWARD_SOL = 0.1`). Simplest. Skews
  excitement to position 1.
- **Top-3 split** (e.g. 70/20/10). Encourages effort even when out of first.
  Bigger payout surface, more on-chain fees per race.
- **All finishers + bonus for win.** Smoothest UX but burns treasury fastest.

Funding side:

- **Treasury-subsidised** (current shape). Sustainable only if a separate
  revenue source covers payouts.
- **Entry fee → pot.** Each player pays N lamports at `joinLobby`; pot pays
  out at race end. Needs entry-fee signing UX *before* the race, which is a
  separate design.
- **Holder-gated free play.** Holders play free, payouts come from a separate
  budget. Matches the existing (unwired) `check-holder` endpoint.

Recommend v1: **winner-takes-all, treasury-subsidised, holder-gated.** It
reuses every existing piece and ships in one PR.

## 6. Production wiring

`attachApi` must be re-targeted. Either:

- (a) Mount the Express routes inside `server/game-server.ts` directly (it
  already creates an `express()` app for `/health`). Rewrite `attachApi` to
  take `app: express.Application` instead of `server: ViteDevServer`.
- (b) Keep two separate processes — game-server emits events, a small
  payout-worker subscribes and handles transfers. Adds operational complexity
  for v1.

Recommend (a). Minimal diff, same process boundary, no extra deploy target.

## 7. Bot wins

The current `/api/award` already short-circuits when `winnerPublicKey` is
empty (`"X is a bot — no payout"`). Keep this. Bot wins log a no-payout
record but still update `paidRaces` so the result phase doesn't loop.

## 8. Failure modes

| Failure | Behavior |
|---|---|
| RPC unreachable | Log + retry up to 3× with backoff; on final fail mark `paidRaces` with `failed:true` so we don't double-spend on next boot. Surface "payout delayed" in ResultScene. |
| Treasury empty | Refuse to start a race if treasury balance < N × reward (sanity gate at lobby phase, not race start). |
| Invalid winner pubkey | Already handled. Log + no-op. |
| Two restart races with overlapping IDs | Impossible if `raceId` is uuid. |
| Replay attack (Shape B only) | Mitigated by `expiry` + raceId uniqueness check. |

## 9. MVP scope (proposal)

What I would build in one PR if you say go:

1. Rewrite `attachApi(app)` to take Express, mount it inside `game-server.ts`.
2. Add `raceId: string` to `startRace()` and to the `raceEnd` payload.
3. Add a `payoutWinner(raceId, winner)` function gated by an in-memory +
   on-disk `paidRaces` set. Called directly from `finishRace()`.
4. Treasury balance sanity check on lobby start; if too low, log + skip
   payout for that race (still run the race).
5. Remove the "TESTING MODE" banner. Replace with a small "Payout pending /
   sent — sig: …" line that pulls from the `raceEnd` payload.
6. JSON file at `data/payouts.json` for durability across restarts.
7. **No** entry fees, **no** top-3 split, **no** holder gating in v1 —
   document them as Phase 2 / Phase 3.
8. Manual smoke against Solana devnet before ever touching mainnet.

What I would **not** do in v1: Shape B (claim tokens), holder gating, entry
fees, prize pools, ranking persistence, leaderboard. Each warrants its own
design pass.

## 10. Open questions

1. Mainnet or devnet at launch?
2. Real `WIN_REWARD_SOL` value — 0.1 SOL is hardcoded but unrealistic at
   current prices. Probably `SPL token` instead of native SOL, given the
   project already references `TOKEN_MINT_ADDRESS`?
3. How is the treasury funded? One-off seeding, or ongoing top-up?
4. Is there a kill-switch we need (an env flag that disables payouts without
   re-deploying)?
5. Legal: is this a game of skill or chance in the relevant jurisdiction?
   Not a code question, but the answer changes the scope.

Answer those five and I can turn the MVP scope above into code.
