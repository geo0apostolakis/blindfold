// The text a wallet signs to claim its tickets. Shared by browser and server so
// both build the exact same string. Signing it proves the claimer owns the
// paying wallet: without it, anyone watching transfers into the treasury could
// claim someone else's payment first.
/** What gets hashed into `tickets:` below: every blinded ticket with its size,
 *  in order. Tickets swapped after signing no longer match the signature. */
export function blindedDigestInput(blinded: { denom: number; blinded: string }[]) {
  return blinded.map((b) => `${b.denom}:${b.blinded}`).join("\n");
}

export function claimMessage(quoteId: string, txHash: string, blindedHash: string) {
  return [
    "BLINDFOLD: claim my credit tickets",
    `quote: ${quoteId}`,
    `transfer: ${txHash.toLowerCase()}`,
    `tickets: ${blindedHash}`,
    "",
    "This signature moves no funds.",
  ].join("\n");
}
