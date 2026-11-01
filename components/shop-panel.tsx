"use client";
import { useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { ApiError, api, type Status } from "@/lib/client/api";
import { blindTickets, finishTickets, loadPending, savePending, sha256hex, clearPending, type Pending } from "@/lib/client/tickets";
import { connect, tokenBalanceOf, sendToTreasury, sign } from "@/lib/client/wallet";
import { blindedDigestInput, claimMessage } from "@/lib/claim-message";
import { creditsForUsd, splitDenoms } from "@/lib/pricing";
import { TOKEN } from "@/lib/config";

type Quote = { id: string; amountWei: string; credits: number; usd: number; expiresAt: number };
type Step = "idle" | "quote" | "pay" | "sign" | "claim" | "done";

const STEP_TEXT: Record<Step, string> = {
  idle: "",
  quote: "Reserving your credits…",
  pay: `Confirm the ${TOKEN.symbol} transfer in your wallet…`,
  sign: "Sign the claim in your wallet. It moves no funds…",
  claim: "Turning your payment into anonymous tickets…",
  done: "",
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => n.toLocaleString("en-US");

export function ShopPanel({ status, onTickets }: { status: Status; onTickets: () => void }) {
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("5");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [got, setGot] = useState<number | null>(null);
  const [pending, setPendingState] = useState<Pending | null>(() => (typeof window === "undefined" ? null : loadPending()));

  const busy = step !== "idle" && step !== "done";
  const amountNum = Number(amount) || 0;
  const credits = creditsForUsd(amountNum);
  const tooSmall = credits < status.limits.minRedeemCredits;
  const tooBig = credits > status.limits.maxRedeemCredits;
  const soldOut = status.capacity.soldOut || credits > status.capacity.availableCredits;

  async function doConnect() {
    setError(null);
    try {
      const a = await connect();
      setAccount(a);
      setBalance(await tokenBalanceOf(a));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wallet did not connect.");
    }
  }

  function remember(p: Pending) {
    savePending(p);
    setPendingState({ ...p });
  }

  // Signs and claims; retries while the transfer is still confirming. A quote
  // that expired in the meantime is replaced: the transfer stays claimable.
  async function claim(wallet: Address, p: Pending, txHash: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      setStep("sign");
      const blinded = p.items.map((i) => ({ denom: i.denom, blinded: i.blinded }));
      const blindedHash = await sha256hex(blindedDigestInput(blinded));
      const signature = p.signature ?? (await sign(wallet, claimMessage(p.quoteId, txHash, blindedHash)));
      p = { ...p, txHash, signature }; // sign once; retries reuse it
      remember(p);
      setStep("claim");
      try {
        const res = await api<{ sigs: { denom: number; blindSig: string }[] }>("/api/claim", {
          quoteId: p.quoteId,
          txHash,
          blinded,
          signature,
        });
        await finishTickets(status.keys, p, res.sigs);
        setPendingState(null);
        setGot(p.credits);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 425 && attempt < 15) {
          await wait(2000);
          continue;
        }
        if (e instanceof ApiError && e.status === 410) {
          setStep("quote");
          const { quote } = await api<{ quote: Quote }>("/api/quote", { wallet, amountWei: p.amountWei });
          p = { ...(await blindTickets(status.keys, splitDenoms(quote.credits), quote.id, quote.credits)), wallet, amountWei: p.amountWei, txHash };
          remember(p);
          continue;
        }
        throw e;
      }
    }
  }

  async function redeem() {
    if (!account) return;
    setError(null);
    setGot(null);
    try {
      setStep("quote");
      const wei = parseUnits(amountNum.toFixed(TOKEN.decimals), TOKEN.decimals);
      const { quote } = await api<{ quote: Quote }>("/api/quote", { wallet: account, amountWei: wei.toString() });
      let p = await blindTickets(status.keys, splitDenoms(quote.credits), quote.id, quote.credits);
      p = { ...p, wallet: account, amountWei: quote.amountWei };
      remember(p);
      setStep("pay");
      const txHash = await sendToTreasury(account, BigInt(quote.amountWei));
      remember({ ...p, txHash });
      await claim(account, p, txHash);
      setStep("done");
      setBalance(await tokenBalanceOf(account));
      onTickets();
    } catch (e) {
      setStep("idle");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function resume() {
    if (!pending?.txHash || !pending.wallet) return;
    setError(null);
    try {
      const wallet = account ?? (await connect());
      setAccount(wallet);
      if (wallet.toLowerCase() !== pending.wallet.toLowerCase()) throw new Error("Switch to the wallet that paid, then try again.");
      await claim(wallet, pending, pending.txHash);
      setStep("done");
      onTickets();
    } catch (e) {
      setStep("idle");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <h3 className="text-lg font-semibold">Buy credits with {TOKEN.symbol}</h3>
        <p className="mt-1 text-sm text-mute">
          Your wallet is used here, and only here. What you get back are anonymous tickets, stored in this browser. The chat never sees the
          wallet.
        </p>
      </div>

      {!status.payments && (
        <div className="rounded-xl border border-line bg-ink p-4 text-sm">
          <p className="font-medium">Buying credits is not set up on this server.</p>
          <p className="mt-1 text-mute">
            The operator has not configured a stablecoin and a treasury address yet, so nothing here asks for a wallet. The chat still runs in demo
            mode.
          </p>
        </div>
      )}

      {status.payments && pending?.txHash && (
        <div className="rounded-xl border border-lilac/40 bg-lilac/10 p-4 text-sm">
          <p>A payment of {fmt(pending.credits)} credits was sent but its tickets were not collected yet.</p>
          <button className="btn btn-main mt-3" onClick={resume} disabled={busy}>
            Collect my tickets
          </button>
        </div>
      )}

      {status.payments && (
        <>
        {!account ? (
          <button className="btn btn-main self-start" onClick={doConnect}>
            Connect wallet
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-mono text-mute break-all">{account}</span>
            {balance !== null && <span className="font-mono">{Number(formatUnits(balance, TOKEN.decimals)).toFixed(2)} {TOKEN.symbol}</span>}
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm text-mute">Amount in {TOKEN.symbol} (dollars)</span>
          <input
            className="field px-4 py-3 font-mono text-lg"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
            disabled={busy}
          />
        </label>

        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-mute">You get</dt>
          <dd className="text-right font-mono">{fmt(credits)} credits</dd>
          <dt className="text-mute">Which is about</dt>
          <dd className="text-right font-mono">{fmt(Math.floor(credits / (status.models[0]?.typicalCredits || 1)))} messages</dd>
        </dl>

        <p className="text-xs text-mute">
          $1 buys {fmt(creditsForUsd(1))} credits, and 1 credit is $0.0001 of real AI cost. Up to {fmt(status.limits.maxCreditsPerWalletPerDay)} credits
          per wallet a day.
        </p>

        {soldOut ? (
          <p className="rounded-xl border border-line p-4 text-sm">
            Credits are sold out for now. Everyone who already has credits can keep chatting; new credits open up as the budget grows.
          </p>
        ) : (
          <button className="btn btn-main" onClick={redeem} disabled={!account || busy || tooSmall || tooBig}>
            {busy ? "Working…" : `Get ${fmt(credits)} credits`}
          </button>
        )}
        {tooSmall && <p className="text-sm text-warn">Pay enough for at least {fmt(status.limits.minRedeemCredits)} credits.</p>}
        {tooBig && <p className="text-sm text-warn">Buy at most {fmt(status.limits.maxRedeemCredits)} credits at a time.</p>}

        <div aria-live="polite" className="min-h-5 text-sm">
          {busy && <p className="text-lilac">{STEP_TEXT[step]}</p>}
          {step === "done" && got !== null && <p className="text-ok">{fmt(got)} credits added as anonymous tickets. Head to Chat.</p>}
          {error && <p className="text-warn">{error}</p>}
        </div>

        {pending && !pending.txHash && !busy && (
          <button className="btn btn-quiet self-start text-sm" onClick={() => (clearPending(), setPendingState(null))}>
            Discard an unpaid quote
          </button>
        )}
        </>
      )}
    </div>
  );
}
