import type { ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} from '@solana/web3.js';

export interface ServerEnv {
  TOKEN_MINT_ADDRESS?: string;
  REQUIRED_TOKEN_AMOUNT?: number;
  SOLANA_RPC_URL?: string;
  TREASURY_SECRET_KEY_JSON?: string;
  WIN_REWARD_SOL?: number;
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isMock(env: ServerEnv): boolean {
  return !env.TOKEN_MINT_ADDRESS || !env.SOLANA_RPC_URL;
}

export function attachApi(server: ViteDevServer, env: ServerEnv) {
  const requiredAmount = env.REQUIRED_TOKEN_AMOUNT ?? 100_000;
  const rewardSol = env.WIN_REWARD_SOL ?? 0.1;
  const mockMode = isMock(env);

  let treasury: Keypair | null = null;
  if (env.TREASURY_SECRET_KEY_JSON) {
    try {
      const arr = JSON.parse(env.TREASURY_SECRET_KEY_JSON) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error('expected 64-number array');
      }
      treasury = Keypair.fromSecretKey(Uint8Array.from(arr));
      server.config.logger.info(
        `[pixel-champs] Treasury loaded: ${treasury.publicKey.toString()}`
      );
    } catch (e) {
      server.config.logger.warn(
        `[pixel-champs] TREASURY_SECRET_KEY_JSON parse failed: ${(e as Error).message}`
      );
    }
  }
  const treasuryMock = mockMode || !treasury;

  if (mockMode) {
    server.config.logger.warn(
      '[pixel-champs] DEV MOCK MODE: TOKEN_MINT_ADDRESS or SOLANA_RPC_URL missing. Balance checks are bypassed.'
    );
  } else {
    server.config.logger.info(
      `[pixel-champs] Live gating enabled. Mint=${env.TOKEN_MINT_ADDRESS} required=${requiredAmount}`
    );
  }
  if (treasuryMock && !mockMode) {
    server.config.logger.warn(
      '[pixel-champs] Treasury not configured — award endpoint will return mock payouts.'
    );
  }

  server.middlewares.use('/api/config', (req, res, next) => {
    if (req.method !== 'GET') return next();
    sendJson(res, 200, {
      mockMode,
      requiredAmount,
      tokenMintAddress: env.TOKEN_MINT_ADDRESS ?? null
    });
  });

  server.middlewares.use('/api/check-holder', async (req, res, next) => {
    if (req.method !== 'POST') return next();
    try {
      const body = await readJson(req);
      const publicKey: string = typeof body.publicKey === 'string' ? body.publicKey.trim() : '';
      if (!publicKey) {
        return sendJson(res, 400, { isHolder: false, error: 'missing publicKey' });
      }

      if (mockMode) {
        return sendJson(res, 200, {
          isHolder: true,
          balance: requiredAmount,
          requiredAmount,
          mock: true
        });
      }

      let owner: PublicKey;
      let mint: PublicKey;
      try {
        owner = new PublicKey(publicKey);
        mint = new PublicKey(env.TOKEN_MINT_ADDRESS!);
      } catch {
        return sendJson(res, 400, { isHolder: false, error: 'invalid Solana address' });
      }

      const conn = new Connection(env.SOLANA_RPC_URL!, 'confirmed');
      const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint });
      let total = 0;
      for (const acc of accounts.value) {
        const info = acc.account.data.parsed.info as {
          tokenAmount?: { uiAmount?: number };
        };
        total += info.tokenAmount?.uiAmount ?? 0;
      }
      sendJson(res, 200, {
        isHolder: total >= requiredAmount,
        balance: total,
        requiredAmount
      });
    } catch (e) {
      sendJson(res, 500, { isHolder: false, error: (e as Error).message });
    }
  });

  server.middlewares.use('/api/award', async (req, res, next) => {
    if (req.method !== 'POST') return next();
    try {
      const body = await readJson(req);
      const winnerName: string = typeof body.winnerName === 'string' ? body.winnerName : 'WINNER';
      const winnerPublicKey: string | null =
        typeof body.winnerPublicKey === 'string' && body.winnerPublicKey ? body.winnerPublicKey : null;

      if (treasuryMock) {
        return sendJson(res, 200, {
          success: true,
          amount: rewardSol,
          message: `${winnerName} would receive ${rewardSol} SOL`,
          mock: true
        });
      }

      if (!winnerPublicKey) {
        return sendJson(res, 200, {
          success: false,
          amount: 0,
          message: `${winnerName} is a bot — no payout`
        });
      }

      let to: PublicKey;
      try {
        to = new PublicKey(winnerPublicKey);
      } catch {
        return sendJson(res, 400, {
          success: false,
          amount: 0,
          message: 'Invalid winner address'
        });
      }

      const conn = new Connection(env.SOLANA_RPC_URL!, 'confirmed');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: treasury!.publicKey,
          toPubkey: to,
          lamports: Math.floor(rewardSol * LAMPORTS_PER_SOL)
        })
      );
      const sig = await sendAndConfirmTransaction(conn, tx, [treasury!]);
      sendJson(res, 200, {
        success: true,
        amount: rewardSol,
        txSignature: sig,
        message: `${winnerName} received ${rewardSol} SOL`
      });
    } catch (e) {
      sendJson(res, 500, {
        success: false,
        amount: 0,
        message: `Payout failed: ${(e as Error).message}`
      });
    }
  });
}
