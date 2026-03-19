import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

export default function PrivateLayout() {
  return (
    <div className="min-h-screen bg-surface text-foreground">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}