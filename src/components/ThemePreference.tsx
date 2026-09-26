import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemePreference({ compact = false, toggleOnly = false }: { compact?: boolean; toggleOnly?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (toggleOnly) return <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted/50 text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>;

  return <div className={cn('inline-flex items-center rounded-xl border border-border bg-muted/50 p-1', compact ? 'gap-0.5' : 'gap-1')} role="group" aria-label="Aparência do painel">
    <button type="button" onClick={() => setTheme('light')} aria-label="Usar tema claro" aria-pressed={theme === 'light'} className={cn('inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring', compact ? 'h-8 w-8' : 'h-9 px-3', theme === 'light' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><Sun size={16} />{!compact && <span>Claro</span>}</button>
    <button type="button" onClick={() => setTheme('dark')} aria-label="Usar tema escuro" aria-pressed={theme === 'dark'} className={cn('inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring', compact ? 'h-8 w-8' : 'h-9 px-3', theme === 'dark' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><Moon size={16} />{!compact && <span>Escuro</span>}</button>
  </div>;
}
