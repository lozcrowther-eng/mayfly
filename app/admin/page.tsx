import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { NavLinks } from "@/components/nav-links";

// This is where CLAUDE.md says design effort belongs — an operator console, not the demo
// console at "/" (which is deliberately plain and says so). Still dark: read at the same
// projector distance as everything else in this control plane's ops surfaces.
export default function AdminPage() {
  return (
    <div className="dark flex min-h-screen flex-col bg-black">
      <NavLinks />
      <AdminDashboard />
    </div>
  );
}
