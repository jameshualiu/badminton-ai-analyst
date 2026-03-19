import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { logout } from "../auth/authActions";

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading } = useAuthUser();

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleLogout = async () => {
    const res = await logout();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    navigate("/signin");
  };

  const displayName = user?.displayName ?? "Account";
  const email = user?.email ?? "";
  const photoURL = user?.photoURL ?? null;

  // ✅ Dashboard highlighted for dashboard + analysis detail pages
  const dashboardActive = pathname.startsWith("/dashboard") || pathname.startsWith("/analysis");

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Brand */}
        <Link to="/dashboard" className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Badminton AI Analyst</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-2">
          <Link
            to="/dashboard"
            className={[
              "px-3 py-2 rounded-xl text-sm transition flex items-center gap-2",
              dashboardActive
                ? "bg-card/50 border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-card/30",
            ].join(" ")}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>

          {/* 🚫 Removed Analysis tab (analysis is a detail page opened from a card) */}
        </nav>

        {/* Avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/40 px-3 py-2 hover:bg-card/55 transition"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="relative h-9 w-9 rounded-xl overflow-hidden bg-card/40 border border-border/40 flex items-center justify-center">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt="User avatar"
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="w-5 h-5 text-muted-foreground" />
              )}
            </span>

            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold">{displayName}</span>
              <span className="text-xs text-muted-foreground">{email}</span>
            </div>

            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute left-0 mt-3 w-56 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-xl overflow-hidden"
            >
              <div className="h-px bg-border/50" />

              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className="w-full px-4 py-3 text-left text-sm hover:bg-card/40 transition flex items-center gap-2 text-destructive"
                disabled={loading}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}