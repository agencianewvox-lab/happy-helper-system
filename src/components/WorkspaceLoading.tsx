export function WorkspaceLoading() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen bg-background text-foreground flex">
      <span className="sr-only">Preparando o painel de controle</span>
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border/50 bg-card/40 p-6 flex-col gap-9" aria-hidden="true">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/20 animate-pulse" />
          <div className="space-y-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /><div className="h-2 w-16 rounded bg-muted/70 animate-pulse" /></div>
        </div>
        <div className="space-y-4">
          {["w-36", "w-28", "w-32", "w-24", "w-36"].map((width, index) => (
            <div key={index} className={`h-4 ${width} rounded bg-muted/70 animate-pulse`} />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-5 sm:p-8 space-y-8" aria-hidden="true">
        <div className="flex items-center justify-between border-b border-border/40 pb-6">
          <div className="space-y-3"><div className="h-5 w-52 rounded bg-muted animate-pulse" /><div className="h-3 w-32 rounded bg-muted/70 animate-pulse" /></div>
          <div className="h-9 w-24 rounded-lg bg-muted/70 animate-pulse" />
        </div>
        <div className="space-y-3"><div className="h-8 w-72 max-w-full rounded bg-muted animate-pulse" /><div className="h-3 w-80 max-w-full rounded bg-muted/70 animate-pulse" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 rounded-xl border border-border/40 bg-card/60 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-44 rounded-xl border border-border/40 bg-card/60 animate-pulse" />)}
        </div>
      </main>
    </div>
  );
}
