import { BlindfoldApp } from "@/components/blindfold-app";
import { LivePricing } from "@/components/live-pricing";
import { LiveStats } from "@/components/live-stats";
import { Sidebar } from "@/components/site/sidebar";
import { CHAIN, TOKEN } from "@/lib/config";
import { creditsForUsd } from "@/lib/pricing";

const sym = TOKEN.symbol;
const perDollar = creditsForUsd(1).toLocaleString("en-US");

const steps = [
  {
    title: `Pay in ${sym}`,
    body: "One stablecoin transfer to the treasury. It is the only public trace, and it says only that a wallet bought credits.",
  },
  {
    title: "Get blind-signed tickets",
    body: "Your browser makes random tickets and blinds them. The server signs them (RSA, RFC 9474) without seeing what it signs.",
  },
  {
    title: "Chat with tickets",
    body: "Each message spends tickets, never your wallet. A session is a secret your browser made. No login, no account.",
  },
];

const how = [
  {
    title: "Payment",
    body: `Credits are bought with ${sym}, a dollar stablecoin, on ${CHAIN.name}. The transfer is public like any on-chain payment, and it is the last point where your address touches the app.`,
  },
  {
    title: "Blind ticket issuance",
    body: "Your browser makes tickets of 1,000, 100, 10 and 1 credits and blinds them. The server checks the payment and signs the blinded tickets under RFC 9474, so the ticket you later spend is one it has never seen.",
  },
  {
    title: "Inference gateway",
    body: "Each prompt goes to DeepSeek, Gemini, GPT or Claude through OpenRouter. The gateway holds the worst-case cost in credits, charges the real cost once the answer is back, and returns the rest.",
  },
  {
    title: "Zero retention",
    body: "Prompts are passed through and dropped. Nothing is written to disk or logs, and only providers on zero-data-retention terms, which never store or train on prompts, may answer.",
  },
];

const why = [
  { title: "Unlinkable by construction", body: "Payment and chat are separated by blind RSA signatures, the primitive behind Privacy Pass and Apple's Private Access Tokens. The signer cannot match a ticket to a payment." },
  { title: "Priced in dollars", body: `One credit is always $0.0001 of real AI cost, and $1 buys ${perDollar} credits. There is no price feed and nothing to speculate on.` },
  { title: "Never sells what it cannot pay", body: "Credits stop selling before the AI budget, minus every credit already sold, runs out. When the cap is hit, everyone holding credits keeps chatting." },
  { title: "More users, more cover", body: "Every new user adds to the set your tickets hide in. The more people use it, the less any single payment says." },
];

const seen: { what: string; chain: string; server: string; ai: string }[] = [
  { what: "That an address bought credits", chain: "Yes", server: "Yes", ai: "No" },
  { what: "Which address sent a prompt", chain: "No", server: "No", ai: "No" },
  { what: "Prompt contents", chain: "No", server: "Passed through, never stored", ai: "Yes, to answer it" },
  { what: "Your IP address", chain: "No", server: "Not stored", ai: "No" },
];

const faq = [
  {
    q: "Can the operator read my prompts?",
    a: "Prompts pass through the gateway on the way to the model and are dropped. They are never written to a database or a log. What the gateway cannot do, by construction, is link a prompt to the address that paid. Running inference inside attested secure enclaves would seal prompts in transit too, and that is not built.",
  },
  {
    q: "Is context kept between messages?",
    a: "Yes, in your browser. It sends the recent turns with each request. Nothing is kept on the server, so wiping the chat on this device erases it for good.",
  },
  {
    q: "Which AI providers see my prompts?",
    a: "Only OpenRouter providers on zero-data-retention (ZDR) terms, which commit to never storing or training on prompts. They receive the prompt text and nothing that identifies the sender.",
  },
  {
    q: "What happens if I clear my browser?",
    a: "Tickets are bearer tickets stored locally, like cash. Wipe storage and they are gone. They cannot be restored, because the server never knew they were yours.",
  },
  {
    q: "What does a message cost?",
    a: `$1 buys ${perDollar} credits. A short prompt on the default model costs about 1 credit, a long essay about 15. Flagships cost more, with Claude Sonnet about 20x, Claude Opus about 40x and GPT-6 Astra about 100x. Each address can buy up to 100,000 credits per 24 hours, so no single buyer can drain the AI budget.`,
  },
  {
    q: "What does sold out mean?",
    a: "Credits are only sold while the real AI budget covers every ticket already out there. When that cap is hit, sales pause and everyone already holding credits keeps chatting.",
  },
  {
    q: "Can timing give me away?",
    a: "If you buy and chat in the same minute while few people use the app, timing alone could point at you. Tickets do not expire, so buy now and chat later. The more users, the less timing reveals.",
  },
];

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as React.CSSProperties;

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div data-reveal className="mb-6">
      <h2 className="text-3xl font-medium sm:text-4xl">{children}</h2>
      {sub && <p className="mt-2 max-w-xl text-mute">{sub}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Sidebar />
      <div id="top" className="flex min-h-full flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-ink/80 px-4 backdrop-blur-xl sm:px-6">
          <a href="#top" className="flex items-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
            <img src="/logo.svg" alt="" width={28} height={28} className="rounded-md" />
            <span className="font-semibold tracking-tight">blindfold</span>
          </a>
          <a
            href="#chat"
            className="hidden h-11 w-full max-w-md items-center gap-2.5 rounded-full border border-line px-4 text-mute transition-colors hover:border-[#3a3a3a] hover:text-paper md:flex lg:mx-auto"
          >
            <span aria-hidden className="inline-block size-3.5 rounded-full border border-current" />
            Private AI chat, unlinkable to your wallet
          </a>
          <div className="flex shrink-0 gap-2">
            <a href="#credits" className="btn btn-main text-sm">
              Buy credits
            </a>
          </div>
        </header>

        <main className="relative flex-1">
          <div aria-hidden className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

          <section className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
            <p className="rise mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-ink/60 px-3.5 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-mute" style={delay(0)}>
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-ok" />
              Private AI chat · blind-signed credits
            </p>
            <h1 className="rise text-5xl font-medium leading-[1.02] sm:text-7xl" style={delay(60)}>
              Pay for AI.
              <br />
              Stay unnamed.
            </h1>
            <p className="rise mx-auto mt-6 max-w-xl text-lg text-mute" style={delay(140)}>
              Pay in {sym}, get blind-signed credit tickets, and chat with frontier models through zero-retention providers. The wallet that paid and the prompt you send cannot be linked.
            </p>
            <ul className="rise mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-2 font-mono text-xs text-mute" style={delay(200)}>
              {["RSA blind signatures · RFC 9474", `Paid in ${sym}`, "ZDR inference routing", "Never oversold"].map((t) => (
                <li key={t} className="rounded-md border border-line px-2.5 py-1">
                  {t}
                </li>
              ))}
            </ul>
            <div className="rise mt-9 flex justify-center gap-3" style={delay(280)}>
              <a href="#chat" className="btn btn-main px-6 py-3">
                Open the app
              </a>
              <a href="#how" className="btn btn-quiet px-6 py-3">
                How it works
              </a>
            </div>
          </section>

          <section id="chat" className="relative mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
            <span id="credits" className="absolute -top-20" aria-hidden />
            <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
              <div className="rise" style={delay(380)}>
                <BlindfoldApp />
              </div>
              <div className="flex flex-col gap-4">
                <div className="panel rise p-6" style={delay(480)}>
                  <p className="text-sm text-mute">What the gateway sees per request</p>
                  <dl className="mt-5 grid grid-cols-[6.5rem_1fr] gap-y-3 text-[15px]">
                    <dt className="text-mute">Address</dt>
                    <dd>
                      <span className="redact font-mono" style={{ "--d": "1100ms" } as React.CSSProperties}>
                        0x3f9a0000000000
                      </span>
                    </dd>
                    <dt className="text-mute">Identity</dt>
                    <dd>
                      <span className="redact" style={{ "--d": "1250ms" } as React.CSSProperties}>
                        no account exists
                      </span>
                    </dd>
                    <dt className="text-mute">IP log</dt>
                    <dd>
                      <span className="redact" style={{ "--d": "1400ms" } as React.CSSProperties}>
                        never stored
                      </span>
                    </dd>
                    <dt className="text-mute">Prompt</dt>
                    <dd>is it normal to…</dd>
                  </dl>
                </div>
                <div className="panel rise flex-1 p-6" style={delay(560)}>
                  <p className="text-sm text-mute">How a payment becomes a chat</p>
                  <ol className="mt-4 space-y-4">
                    {steps.map((s, i) => (
                      <li key={s.title} className="flex gap-3">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs text-mute">{i + 1}</span>
                        <span>
                          <span className="block text-paper">{s.title}</span>
                          <span className="block text-sm text-mute">{s.body}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <LiveStats />
          </section>

          <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
            <SectionTitle sub="Four layers. Payment is public, issuance is blind, chat is anonymous, retention is zero.">How it works</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {how.map((s, i) => (
                <div key={s.title} data-reveal style={delay(i * 90)} className="panel flex flex-col p-6">
                  <span className="font-mono text-sm text-mute">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-8 text-xl font-medium">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-mute">{s.body}</p>
                </div>
              ))}
            </div>
            <div data-reveal className="panel mt-4 grid gap-px overflow-hidden bg-line p-0 sm:grid-cols-2 lg:grid-cols-4">
              {why.map((w) => (
                <div key={w.title} className="bg-ink-2 p-6">
                  <h3 className="font-medium">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mute">{w.body}</p>
                </div>
              ))}
            </div>
            <div data-reveal className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="#credits" className="btn btn-main px-6 py-3">
                Buy credits
              </a>
              <a href="#chat" className="btn btn-quiet px-6 py-3">
                Open the app
              </a>
            </div>
          </section>

          <section id="seen" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
            <SectionTitle sub="Exactly what each party can observe. No marketing version.">Threat model</SectionTitle>
            <div data-reveal className="panel overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="text-sm text-mute">
                  <tr className="border-b border-line">
                    <th className="px-6 py-4 font-normal" />
                    <th className="px-6 py-4 font-normal">The blockchain</th>
                    <th className="px-6 py-4 font-normal">Gateway</th>
                    <th className="px-6 py-4 font-normal">AI provider</th>
                  </tr>
                </thead>
                <tbody>
                  {seen.map((r) => (
                    <tr key={r.what} className="border-b border-line last:border-0">
                      <td className="px-6 py-4 text-paper">{r.what}</td>
                      {[r.chain, r.server, r.ai].map((v, i) => (
                        <td key={i} className={`px-6 py-4 ${v === "No" ? "text-ok" : "text-mute"}`}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
            <SectionTitle sub={`One credit is $0.0001 of real AI cost. $1 of ${sym} buys ${perDollar} credits.`}>Pricing</SectionTitle>
            <div data-reveal className="panel">
              <LivePricing />
            </div>
          </section>

          <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-28 sm:px-6">
            <SectionTitle>Technical FAQ</SectionTitle>
            <div data-reveal className="panel divide-y divide-line px-6">
              {faq.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="cursor-pointer list-none text-lg marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {f.q}
                      <span className="text-mute transition-transform duration-300 group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-mute">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <footer className="mx-auto mt-28 max-w-6xl border-t border-line px-4 py-10 text-sm text-mute sm:px-6">
            <div className="space-y-3">
              <p className="text-paper">Blindfold · private AI chat, paid for with a stablecoin</p>
              <p>Credits are prepaid AI usage, not money. They cannot be turned back into {sym}.</p>
              <p>Blindfold is not affiliated with OpenRouter, Circle or any AI model provider.</p>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
