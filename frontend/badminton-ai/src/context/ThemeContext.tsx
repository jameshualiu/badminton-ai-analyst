import { createContext, useContext, useEffect, useState } from "react";

type ThemeContextValue = {
  isDark: boolean;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("shuttleye-dark-mode");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("shuttleye-dark-mode", String(isDark));
    // Apply to <html> so portals (Dialog, Tooltip, etc.) rendered outside the
    // root div also pick up dark: variants.
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("theme-ai-saas", true);
  }, [isDark]);

  const toggle = () => setIsDark((d) => !d);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
