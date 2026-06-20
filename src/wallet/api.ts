export interface ServerConfig {
  mockMode: boolean;
  requiredAmount: number;
  tokenMintAddress: string | null;
}

export interface HolderResponse {
  isHolder: boolean;
  balance: number;
  requiredAmount: number;
  mock?: boolean;
  error?: string;
}

export async function fetchConfig(): Promise<ServerConfig> {
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error(`config ${r.status}`);
  return r.json();
}

export async function checkHolder(publicKey: string): Promise<HolderResponse> {
  const r = await fetch('/api/check-holder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey })
  });
  return r.json();
}

export interface AwardResponse {
  success: boolean;
  amount: number;
  txSignature?: string;
  message: string;
  mock?: boolean;
}

export async function postAward(body: {
  winnerName: string;
  winnerPublicKey: string | null;
}): Promise<AwardResponse> {
  const r = await fetch('/api/award', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}
