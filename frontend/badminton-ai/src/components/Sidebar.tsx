import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LogOut,
  ChevronUp,
  LayoutDashboard,
  Activity,
  Database,
  Map as MapIcon,
  Plus,
} from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { logout } from "../auth/authActions";

interface SidebarProps {
  onUploadClick?: () => void;
  activeAnalysisView?: string;
  onAnalysisViewChange?: (view: string) => void;
}

export default function Sidebar({
  onUploadClick,
  activeAnalysisView,
  onAnalysisViewChange,
}: SidebarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuthUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-border bg-background px-3 py-4 h-screen sticky top-0">
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
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted transition-all hover:bg-primary/5 hover:text-foreground mb-4"
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

            <div className="mt-2 mb-1 px-2 text-[10px] font-bold tracking-[1.2px] uppercase text-foreground/30">
              Analysis Tools
            </div>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-all ${activeAnalysisView === "overlay" ? "bg-primary/10 border-primary/20 text-primary font-medium" : "text-muted hover:bg-primary/5 hover:text-foreground"}`}
              onClick={() => onAnalysisViewChange?.("overlay")}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Data Overlay
            </button>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-all ${activeAnalysisView === "metrics" ? "bg-primary/10 border-primary/20 text-primary font-medium" : "text-muted hover:bg-primary/5 hover:text-foreground"}`}
              onClick={() => onAnalysisViewChange?.("metrics")}
            >
              <Activity className="w-3.5 h-3.5" />
              Metrics
            </button>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-all ${activeAnalysisView === "shots" ? "bg-primary/10 border-primary/20 text-primary font-medium" : "text-muted hover:bg-primary/5 hover:text-foreground"}`}
              onClick={() => onAnalysisViewChange?.("shots")}
            >
              <Database className="w-3.5 h-3.5" />
              Shot Log
            </button>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-all ${activeAnalysisView === "tracker" ? "bg-primary/10 border-primary/20 text-primary font-medium" : "text-muted hover:bg-primary/5 hover:text-foreground"}`}
              onClick={() => onAnalysisViewChange?.("tracker")}
            >
              <MapIcon className="w-3.5 h-3.5" />
              Live Tracker
            </button>
          </div>
        )}

        {!isAnalysis && (
          <>
            <div className="mt-2 mb-1 px-2 text-[10px] font-bold tracking-[1.2px] uppercase text-foreground/30">
              Main
            </div>
            <button
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-[10px] py-[7px] text-left text-[13px] transition-all ${isDashboard ? "bg-primary/10 border-primary/20 text-primary font-medium" : "text-muted hover:bg-primary/5 hover:text-foreground"}`}
              onClick={() => navigate("/dashboard")}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted transition-all hover:bg-primary/5 hover:text-foreground"
              onClick={onUploadClick}
            >
              <Plus className="w-3.5 h-3.5" />
              New Analysis
            </button>

            <div className="mt-6 mb-1 px-2 text-[10px] font-bold tracking-[1.2px] uppercase text-foreground/30">
              Insights
            </div>
            <button className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted transition-all hover:bg-primary/5 hover:text-foreground">
              <Activity className="w-3.5 h-3.5" />
              Performance
            </button>
            <button className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-transparent bg-none px-[10px] py-[7px] text-left text-[13px] text-muted transition-all hover:bg-primary/5 hover:text-foreground">
              <MapIcon className="w-3.5 h-3.5" />
              Court Maps
            </button>
          </>
        )}
      </div>

      {/* User Profile */}
      <div className="mt-auto pt-4 relative" ref={userMenuRef}>
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
          className={`flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-all hover:bg-surface ${userMenuOpen ? "bg-surface border-border/40" : ""}`}
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
            <div className="truncate text-[10px] text-muted">
              {user?.email ?? ""}
            </div>
          </div>
          <ChevronUp
            className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </aside>
  );
}
