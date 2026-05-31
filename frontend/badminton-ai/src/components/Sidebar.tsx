import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LogOut,
  ChevronUp,
  LayoutDashboard,
  Activity,
  Map as MapIcon,
  Plus,
  Sun,
  Moon,
} from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { logout } from "../auth/authActions";
import { useTheme } from "../context/ThemeContext";

interface SidebarProps {
  onUploadClick?: () => void;
}

export default function Sidebar({ onUploadClick }: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuthUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { isDark, toggle } = useTheme();

  const isDashboard = pathname === "/dashboard";
  const isAnalysis = pathname.startsWith("/analysis/");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const res = await logout();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    navigate("/signin");
  };

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  const navInactive = "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-foreground";
  const navSection = "text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400";

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-background px-3 py-4 h-screen sticky top-0 transition-colors duration-200">
      {/* Logo */}
      <div
        className="flex cursor-pointer items-center gap-2 mb-6 px-2"
        onClick={() => navigate("/dashboard")}
      >
        <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-primary">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <circle
              cx="7"
              cy="7"
              r="2"
              stroke="currentColor"
              strokeWidth="1.2"
              className="text-primary"
            />
            <path
              d="M7 2Q10 4.5 12 7"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              fill="none"
              className="text-primary"
            />
          </svg>
        </div>
        <span className="text-[18px] font-bold tracking-[-0.3px] text-foreground">
          Shuttleye
        </span>
      </div>

      <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-0">
        {isAnalysis && (
          <div className="mb-4">
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-primary/5 hover:text-foreground`}
              onClick={() => navigate("/dashboard")}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path
                  d="M7.5 2L3.5 6l4 4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Dashboard
            </button>
          </div>
        )}

        {!isAnalysis && (
          <>
            <div className={`mt-2 mb-1 px-2 ${navSection}`}>
              Main
            </div>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-colors duration-150 ${isDashboard ? "bg-primary/10 border-primary/20 text-primary font-medium" : navInactive}`}
              onClick={() => navigate("/dashboard")}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-primary/5 hover:text-foreground`}
              onClick={onUploadClick}
            >
              <Plus className="w-3.5 h-3.5" />
              New Analysis
            </button>

            <div className={`mt-6 mb-1 px-2 ${navSection}`}>
              Insights
            </div>
            <button className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-primary/5 hover:text-foreground`}>
              <Activity className="w-3.5 h-3.5" />
              Performance
            </button>
            <button className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-primary/5 hover:text-foreground`}>
              <MapIcon className="w-3.5 h-3.5" />
              Court Maps
            </button>
          </>
        )}
      </div>

      {/* Dark mode toggle */}
      <div className="pt-3 pb-1">
        <button
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-[10px] py-[7px] text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-foreground"
        >
          <span className="relative w-3.5 h-3.5 shrink-0">
            <Sun
              className={`dark-toggle-icon absolute inset-0 w-3.5 h-3.5 transition-all duration-200 ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
            />
            <Moon
              className={`dark-toggle-icon absolute inset-0 w-3.5 h-3.5 transition-all duration-200 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`}
            />
          </span>
          {isDark ? "Light mode" : "Dark mode"}
        </button>
      </div>

      {/* User Profile */}
      <div className="mt-auto pt-2 relative" ref={userMenuRef}>
        {userMenuOpen && (
          <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 overflow-hidden rounded-xl border border-primary/15 bg-popover p-1 shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLogout}
              disabled={authLoading}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        )}
        <button
          className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/10 ${userMenuOpen ? "bg-slate-100 dark:bg-white/10 border-slate-200 dark:border-white/10" : ""}`}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="avatar"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-[12px] font-medium text-foreground">
              {user?.displayName ?? "Account"}
            </div>
            <div className="truncate text-[10px] text-slate-600 dark:text-slate-400">
              {user?.email ?? ""}
            </div>
          </div>
          <ChevronUp
            className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </aside>
  );
}
