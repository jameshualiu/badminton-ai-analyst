import { createContext } from "react";

export type ThemeContextValue = {
  isDark: boolean;
  toggle: () => void;
};

export const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggle: () => {},
});
