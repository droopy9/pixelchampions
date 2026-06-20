export function shortenPubkey(pk: string): string {
  if (!pk) return '';
  if (pk.length <= 9) return pk;
  return `${pk.slice(0, 4)}...${pk.slice(-4)}`;
}
