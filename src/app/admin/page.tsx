import type { Metadata } from "next";
import AdminDashboard from "@/components/admin/admin-dashboard";
import "./admin.css";

export const metadata: Metadata = {
    title: "Admin dashboard",
    robots: { index: false, follow: false },
    openGraph: { title: "Admin dashboard · The Grand Debate '26", description: "Conference administration dashboard." },
};

export default function AdminPage() {
    return <AdminDashboard />;
}
