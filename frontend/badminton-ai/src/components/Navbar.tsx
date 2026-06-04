import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogOut, Sun, Moon, Plus, ChevronDown, Sparkles } from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { logout } from "../auth/authActions";
import { useTheme } from "../context/ThemeContext";

interface NavbarProps {
  onUploadClick?: () => void;
}

export default function Navbar({ onUploadClick }: NavbarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuthUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { isDark, toggle } = useTheme();

  const isAnalysis = pathname.startsWith("/analysis/");
  const isDashboard = pathname === "/dashboard";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    const res = await logout();
    if (!res.ok) { console.error(res.error); return; }
    navigate("/signin");
  };

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-xl shrink-0">
      <div className="max-w-[1500px] mx-auto px-8 h-[70px] flex items-center justify-between">

      {/* Left: logo + optional back link */}
      <div className="flex items-center gap-5">
        <button
          className="cursor-pointer flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => navigate("/dashboard")}
        >
          <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-foreground">
            Shuttleye
          </span>
        </button>

        {isAnalysis && (
          <button
            className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 hover:text-foreground transition-colors cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sessions
          </button>
        )}
      </div>

      {/* Centre: nav links (dashboard only) */}
      {!isAnalysis && (
        <nav className="flex items-center gap-1">
          <button
            onClick={() => navigate("/dashboard")}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
              isDashboard
                ? "bg-primary/10 text-primary"
                : "text-slate-500 dark:text-slate-400 hover:text-foreground hover:bg-white/5"
            }`}
          >
            Sessions
          </button>
          <button
            onClick={onUploadClick}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-slate-500 dark:text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Analysis
          </button>
        </nav>
      )}

      {/* Right: dark mode + avatar */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Sun className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100"}`} />
          <Moon className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-100" : "opacity-0 -rotate-90 scale-50"}`} />
        </button>

        {/* Avatar + dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground overflow-hidden shrink-0">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                initials
              )}
            </div>
            <span className="text-[12px] font-medium text-foreground hidden sm:block max-w-[100px] truncate">
              {user?.displayName ?? user?.email?.split("@")[0] ?? "Account"}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute top-[calc(100%+6px)] right-0 min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-border mb-1">
                <div className="text-[12px] font-medium text-foreground truncate">
                  {user?.displayName ?? "Account"}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user?.email ?? ""}
                </div>
              </div>
              <button
                onClick={handleLogout}
                disabled={authLoading}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      </div>
    </header>
  );
}
