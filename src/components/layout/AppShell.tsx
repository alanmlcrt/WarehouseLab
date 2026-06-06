import type { ReactNode } from "react";

interface AppShellProps {
  top: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  bottom?: ReactNode;
  children?: ReactNode;
}

export function AppShell({
  top,
  left,
  center,
  right,
  bottom,
  children,
}: AppShellProps) {
  return (
    <div
      className={`grid h-full overflow-hidden bg-[#eef3f8] text-ink ${
        bottom
          ? "grid-rows-[64px_minmax(0,1fr)_360px]"
          : "grid-rows-[64px_minmax(0,1fr)]"
      }`}
    >
      <header className="min-w-0 border-b border-line bg-white">{top}</header>
      <main className="grid min-h-0 grid-cols-[minmax(280px,310px)_minmax(520px,1fr)_minmax(290px,320px)]">
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-panel">
          {left}
        </aside>
        <section className="min-h-0 bg-[#e8eef5]">{center}</section>
        <aside className="min-h-0 overflow-y-auto border-l border-line bg-panel">
          {right}
        </aside>
      </main>
      {bottom ? (
        <footer className="min-h-0 border-t border-line bg-white">{bottom}</footer>
      ) : null}
      {children}
    </div>
  );
}
