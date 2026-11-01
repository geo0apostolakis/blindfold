"use client";

// Adapted from the 21st.dev "ai-chat-input" component. Kept:
// the spring morph from a pill into a growing composer, the model picker with
// its sliding hover highlight, the scroll fades and the send button. Removed on
// purpose, because Blindfold is a privacy product:
//   - voice input: Chrome's speech recognition streams audio to Google's servers
//   - model icons from cdn.21st.dev: every visitor's IP would reach a third party
//   - image attachments and the effort switch: the backend accepts neither
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const SPRING_TRANSITION = `max-width 0.4s ${SPRING}, height 0.4s ${SPRING}`;
const SMOOTH_HEIGHT_TRANSITION = `max-width 0.4s ${SPRING}, height 0.15s ease-out`;

export type ModelOption = { id: string; label: string; hint?: string };

function MorphingText({ text }: { text: string }) {
  const [width, setWidth] = useState<number | "auto">("auto");
  const spanRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
     
    if (spanRef.current) setWidth(spanRef.current.offsetWidth);
  }, [text]);
  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
      style={{ width }}
    >
      <span ref={spanRef} className="invisible whitespace-nowrap px-1">
        {text}
      </span>
      <span key={text} className="absolute inset-0 flex items-center justify-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-300">
        {text}
      </span>
    </span>
  );
}

/** A local monogram instead of a remote logo: no third-party request. */
function ModelMark({ label, className }: { label: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-4 items-center justify-center rounded-full bg-foreground/90 text-[9px] font-bold text-background", className)}
    >
      {label.charAt(0)}
    </span>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M12 7a5 5 0 0 0-5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export interface PromptInputProps {
  onSubmit: (value: string, modelId: string) => void;
  models: ModelOption[];
  model: string;
  onModelChange: (id: string) => void;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  busy?: boolean;
  className?: string;
  maxLength?: number;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ onSubmit, models, model, onModelChange, value, onChange, placeholder = "Ask anything", busy = false, className, maxLength = 4000 }, ref) => {
    const [expanded, setExpanded] = useState(value.trim() !== "");
    const [isSmoothResize, setIsSmoothResize] = useState(false);
    const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
    const [hoverStyle, setHoverStyle] = useState({ opacity: 0, transform: "translateY(0px) scale(0.95)", transition: "none" });
    const [containerHeight, setContainerHeight] = useState(116);
    const [textareaHeight, setTextareaHeight] = useState(68);
    const [isScrolling, setIsScrolling] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const topFadeRef = useRef<HTMLDivElement>(null);
    const bottomFadeRef = useRef<HTMLDivElement>(null);

    const selected = models.find((m) => m.id === model) ?? models[0];
    const hasValue = value.trim() !== "";

    const updateFades = () => {
      const el = textareaRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (topFadeRef.current) topFadeRef.current.style.opacity = Math.min(scrollTop / 20, 1).toString();
      if (bottomFadeRef.current) {
        const bottomScroll = scrollHeight - clientHeight - scrollTop;
        bottomFadeRef.current.style.opacity = Math.min(Math.max(bottomScroll - 16, 0) / 10, 1).toString();
      }
    };

    const handleValueChange = useCallback(
      (val: string) => {
        setIsSmoothResize(true);
        onChange(val);
      },
      [onChange],
    );

    useEffect(() => {
      if (hasValue && !expanded) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- text arrived from outside (e.g. restored after an error)
        setIsSmoothResize(false);
        setExpanded(true);
      }
    }, [hasValue, expanded]);

    useEffect(() => {
      if (!expanded) return;
      const t = setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
      return () => clearTimeout(t);
    }, [expanded]);

    // Height follows the text only.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      const current = el.style.height;
      el.style.transition = "none";
      el.style.height = "0px";
      const scrollHeight = el.scrollHeight;
      el.style.height = current;
      void el.offsetHeight;
      el.style.transition = "";
      const next = Math.max(68, Math.min(scrollHeight, 160));
      el.style.height = `${next}px`;
       
      setTextareaHeight(next);
      setIsScrolling(scrollHeight > 160);
      setTimeout(updateFades, 0);
    }, [value, expanded]);

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- container follows the measured textarea
      setContainerHeight(Math.max(116, textareaHeight + 48));
      setTimeout(updateFades, 0);
    }, [textareaHeight]);

    useEffect(() => {
      if (!isModelSelectOpen) return;
      const outside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsModelSelectOpen(false);
      };
      document.addEventListener("mousedown", outside);
      return () => document.removeEventListener("mousedown", outside);
    }, [isModelSelectOpen]);

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (containerRef.current?.contains(e.relatedTarget as Node)) return;
      if (!hasValue) {
        setIsSmoothResize(false);
        setExpanded(false);
        setIsModelSelectOpen(false);
      }
    };

    const submit = () => {
      if (!hasValue || busy) return;
      setIsSmoothResize(false);
      onSubmit(value, selected.id);
      setIsModelSelectOpen(false);
    };

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        onBlur={handleBlur}
        className={cn("relative mx-auto flex w-full flex-col", className)}
        style={{
          maxWidth: expanded ? 720 : 360,
          transition: isSmoothResize ? "max-width 0.15s ease-out" : `max-width 0.4s ${SPRING}`,
        }}
      >
        <div
          onMouseDown={(e) => {
            if (expanded && e.target !== textareaRef.current) {
              e.preventDefault();
              textareaRef.current?.focus();
            }
          }}
          style={{
            borderRadius: 24,
            height: expanded ? containerHeight : 48,
            transition: isSmoothResize ? SMOOTH_HEIGHT_TRANSITION : SPRING_TRANSITION,
            overflow: expanded ? "visible" : "hidden",
          }}
          className={cn(
            "relative z-10 w-full border border-border bg-card shadow-sm hover:border-[#3a3a3a] focus-within:border-[#4a4a4a]",
            expanded ? "cursor-text" : "cursor-default",
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            maxLength={maxLength}
            onChange={(e) => handleValueChange(e.target.value)}
            onScroll={updateFades}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape" && !hasValue) {
                setIsSmoothResize(false);
                setExpanded(false);
                setIsModelSelectOpen(false);
              }
            }}
            placeholder={placeholder}
            aria-label="Message"
            style={{
              transition: isSmoothResize ? "height 0.15s ease-out" : `opacity 0.3s ease-out, transform 0.3s ease-out, height 0.4s ${SPRING}`,
            }}
            className={cn(
              "scroll-thin absolute inset-x-0 top-0 z-[1] w-full resize-none bg-transparent py-3.5 pl-4 pr-12 text-[15px] leading-[22px] text-foreground outline-none placeholder:text-muted-foreground",
              expanded ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-95 opacity-0",
              isScrolling ? "overflow-y-auto" : "overflow-y-hidden",
            )}
          />

          <div ref={topFadeRef} className="pointer-events-none absolute left-4 right-12 top-0 z-[2] h-8 bg-gradient-to-b from-card via-card/90 to-transparent opacity-0" />
          <div
            ref={bottomFadeRef}
            className="pointer-events-none absolute left-4 right-12 z-[2] h-8 bg-gradient-to-t from-card via-card/90 to-transparent"
            style={{
              opacity: 0,
              top: `${textareaHeight - 32}px`,
              transition: isSmoothResize ? "top 0.15s ease-out" : `top 0.4s ${SPRING}`,
            }}
          />

          <button
            type="button"
            onClick={() => {
              setIsSmoothResize(false);
              setExpanded(true);
            }}
            style={{ transition: isSmoothResize ? "none" : `all 0.4s ${SPRING}` }}
            className={cn(
              "absolute inset-x-0 top-0 z-[1] cursor-text py-[15px] pl-4 pr-12 text-left text-sm font-medium leading-[17px] text-muted-foreground outline-none",
              !expanded ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-1 scale-105 opacity-0",
            )}
            aria-label="Write a message"
          >
            {placeholder}
          </button>

          <div
            className={cn(
              "absolute bottom-2 left-3 right-12 z-[10] flex items-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
              expanded ? "pointer-events-auto translate-y-0 opacity-100 blur-0" : "pointer-events-none translate-y-2 opacity-0 blur-sm",
            )}
          >
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModelSelectOpen((v) => !v);
                }}
                className={cn(
                  "group flex cursor-default items-center gap-1.5 rounded-full px-2 py-1 text-foreground/60 outline-none transition-all duration-200 hover:bg-accent hover:text-foreground",
                  isModelSelectOpen && "bg-accent text-foreground",
                )}
                aria-label={`Model: ${selected.label}. Change`}
                aria-expanded={isModelSelectOpen}
              >
                <ModelMark label={selected.label} />
                <span className="select-none text-xs font-semibold">
                  <MorphingText text={selected.label} />
                </span>
              </button>

              <div
                style={{ transformOrigin: "bottom left" }}
                onMouseLeave={() =>
                  setHoverStyle((prev) => ({
                    ...prev,
                    opacity: 0,
                    transform: prev.transform.replace("scale(1)", "scale(0.95)"),
                    transition: "opacity 0.2s ease-in, transform 0.2s ease-out",
                  }))
                }
                className={cn(
                  "absolute bottom-full left-0 z-50 mb-2.5 flex w-64 cursor-default flex-col gap-0.5 rounded-2xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-md transition-all duration-400",
                  isModelSelectOpen
                    ? "pointer-events-auto translate-y-0 scale-100 opacity-100 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                    : "pointer-events-none translate-y-3 scale-95 opacity-0 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                )}
                role="listbox"
                aria-label="Models"
              >
                <div className="relative flex flex-col gap-0.5">
                  <div style={hoverStyle} className="pointer-events-none absolute left-0 right-0 top-0 -z-10 h-10 rounded-xl bg-accent" />
                  {models.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={m.id === selected.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() =>
                        setHoverStyle((prev) => ({
                          opacity: 1,
                          transform: `translateY(${idx * 42}px) scale(1)`,
                          transition: prev.opacity === 0 ? "opacity 0.15s ease-out" : `transform 0.3s ${SPRING}, opacity 0.15s ease`,
                        }))
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onModelChange(m.id);
                        setIsModelSelectOpen(false);
                      }}
                      className="group relative flex h-10 w-full cursor-default items-center justify-between rounded-xl px-2.5 text-left text-xs font-medium text-foreground/80 outline-none active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <ModelMark label={m.label} />
                        {m.label}
                      </span>
                      {m.hint && <span className="font-mono text-[10px] text-muted-foreground">{m.hint}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={submit}
            disabled={busy || !hasValue}
            aria-label={busy ? "Waiting for the answer" : "Send message"}
            style={{ borderRadius: 9999 }}
            className={cn(
              "absolute bottom-2 right-2 z-[10] flex h-8 w-8 cursor-default items-center justify-center bg-primary text-primary-foreground outline-none transition-all duration-300 hover:opacity-90",
              !hasValue && !busy && "opacity-40",
            )}
          >
            {busy ? <SpinnerIcon /> : <ArrowUpIcon />}
          </button>
        </div>
      </div>
    );
  },
);

PromptInput.displayName = "PromptInput";
