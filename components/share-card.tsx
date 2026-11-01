"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const W = 1200;
const H = 675;
// The host the card was made on, so a self-hosted copy credits itself.
const site = () => (typeof location === "undefined" ? "" : location.host);

// Markdown to plain lines: the card is an image, not a renderer.
function plain(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*\n?/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      if (out.length && out.at(-1) !== "") out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  while (out.at(-1) === "") out.pop();
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    cut[maxLines - 1] = `${last.trimEnd()}…`;
    return cut;
  }
  return out;
}

const logo = typeof window !== "undefined" ? Object.assign(new Image(), { src: "/logo.svg" }) : null;

async function draw(canvas: HTMLCanvasElement, answer: string, question: string | null, model: string | null) {
  if (logo && !logo.complete) await new Promise((r) => ((logo.onload = r), (logo.onerror = r)));
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  // the site's grid background, faint
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 48) (ctx.beginPath(), ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, H), ctx.stroke());
  for (let y = 0; y <= H; y += 48) (ctx.beginPath(), ctx.moveTo(0, y + 0.5), ctx.lineTo(W, y + 0.5), ctx.stroke());

  const pad = 64;
  // header
  if (logo?.complete && logo.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad - 8, 48, 48, 12);
    ctx.clip();
    ctx.drawImage(logo, pad, pad - 8, 48, 48);
    ctx.restore();
  }
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `600 28px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillText("blindfold", pad + 64, pad + 16);
  ctx.fillStyle = "#8c8c8c";
  ctx.font = `500 16px ui-monospace, monospace`;
  const tag = "PRIVATE AI · BLIND-SIGNED CREDITS";
  ctx.fillText(tag, W - pad - ctx.measureText(tag).width, pad + 16);

  let y = pad + 84;
  ctx.textBaseline = "top";
  if (question) {
    ctx.font = `500 24px ${font}`;
    const q = wrap(ctx, question, W - pad * 2 - 40, 2);
    const boxH = q.length * 34 + 28;
    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.roundRect(pad, y, W - pad * 2, boxH, 22);
    ctx.fill();
    ctx.fillStyle = "#0a0a0a";
    q.forEach((l, i) => ctx.fillText(l, pad + 20, y + 14 + i * 34));
    y += boxH + 28;
  }

  // answer
  const footerTop = H - pad - 34;
  ctx.font = `400 26px ${font}`;
  const lineH = 38;
  const lines = wrap(ctx, answer, W - pad * 2, Math.max(2, Math.floor((footerTop - 24 - y) / lineH)));
  ctx.fillStyle = "#f5f5f5";
  lines.forEach((l, i) => ctx.fillText(l, pad, y + i * lineH));

  // footer
  ctx.strokeStyle = "#262626";
  ctx.beginPath();
  ctx.moveTo(pad, footerTop - 14);
  ctx.lineTo(W - pad, footerTop - 14);
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#a7e3c4";
  ctx.beginPath();
  ctx.arc(pad + 6, footerTop + 17, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f5f5f5";
  ctx.font = `500 22px ${font}`;
  ctx.fillText(`asked anonymously on ${site()}`, pad + 24, footerTop + 17);
  ctx.fillStyle = "#8c8c8c";
  ctx.font = `500 18px ui-monospace, monospace`;
  const right = model ?? "";
  ctx.fillText(right, W - pad - ctx.measureText(right).width, footerTop + 17);
}

const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));

export function ShareCard({ answer, question, model, onClose }: { answer: string; question: string | null; model: string | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [withQuestion, setWithQuestion] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (canvas.current) void draw(canvas.current, plain(answer), withQuestion && question ? question : null, model);
  }, [answer, question, model, withQuestion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download() {
    const blob = await toBlob(canvas.current!);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "blindfold.png" });
    a.click();
    URL.revokeObjectURL(a.href);
    setNote("Saved. Attach it to your post.");
  }

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob(canvas.current!) })]);
      setNote("Image copied. Paste it into your post.");
    } catch {
      setNote("This browser cannot copy images. Use Download instead.");
    }
  }

  async function share() {
    const blob = await toBlob(canvas.current!);
    const file = new File([blob], "blindfold.png", { type: "image/png" });
    const text = `Asked an AI anonymously. No account, no wallet link, no logs.\n\nhttps://${site()}`;
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text }).catch(() => undefined);
      return;
    }
    await copy();
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return createPortal(
    <div role="dialog" aria-modal aria-label="Share this answer" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="panel w-full max-w-2xl p-5 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-medium">Share this answer</p>
          <button className="text-mute hover:text-paper" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <canvas ref={canvas} className="mt-4 aspect-[16/9] w-full rounded-xl border border-line" />
        {question && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} className="accent-white" />
            Include my question on the card
          </label>
        )}
        <p className="mt-2 text-xs text-mute">Made in this browser. Nothing is uploaded; you decide what gets posted.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-main text-sm" onClick={() => void share()}>
            Post on X
          </button>
          <button className="btn btn-quiet text-sm" onClick={() => void copy()}>
            Copy image
          </button>
          <button className="btn btn-quiet text-sm" onClick={() => void download()}>
            Download
          </button>
        </div>
        {note && <p className="mt-3 text-sm text-ok">{note}</p>}
      </div>
    </div>,
    document.body,
  );
}
