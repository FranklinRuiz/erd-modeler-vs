import { useEffect } from 'react';
import { useUIStore } from '@/store';
import { isVSCode } from '@/lib/vscode-bridge';

function detectVSCodeTheme(): 'light' | 'dark' {
  const cls = document.body.classList;
  return cls.contains('vscode-light') || cls.contains('vscode-high-contrast-light') ? 'light' : 'dark';
}

export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  // Inside VS Code, follow the editor's own color theme instead of a
  // separately-toggled one. VS Code stamps `vscode-light` / `vscode-dark` /
  // `vscode-high-contrast(-light)` on <body> and keeps it live-updated when
  // the user switches themes, so this stays in sync without any message-passing.
  useEffect(() => {
    if (!isVSCode()) return;
    setTheme(detectVSCodeTheme());
    const observer = new MutationObserver(() => setTheme(detectVSCodeTheme()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [setTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return theme;
}
