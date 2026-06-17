/** Plain-language "reading" banner shared by the result tools. One consistent
 *  place where a non-expert is told, in a sentence, what the chart below means —
 *  no popup, always visible above the data. */
export function Verdict({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-sm leading-relaxed text-slate-700">
      {children}
    </div>
  );
}
