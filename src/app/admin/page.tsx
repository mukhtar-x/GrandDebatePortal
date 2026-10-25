import type { Metadata } from "next";
import AdminDashboard from "@/components/admin/admin-dashboard";
import "./admin.css";

export const metadata: Metadata = {
    title: "Admin dashboard · The Grand Debate '26",
    robots: { index: false, follow: false },
};

export default function AdminPage() {
    return <AdminDashboard />;
}
