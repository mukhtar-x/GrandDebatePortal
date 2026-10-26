"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ActionIcon } from "@/components/shared/action-icon";

type PaymentStatus = "Pending" | "Confirmed" | "Action Required";

interface ReceiptAnalysis {
    status: "quick" | "done" | "failed";
    provider: string;
    flags: Array<{ code: string; severity: "low" | "medium" | "high"; detail: string }>;
    riskScore: number;
    riskLevel: "low" | "medium" | "high";
    textExcerpt?: string;
    error?: string;
}

interface Metrics {
    totalApplications: number;
    soloApplications: number;
    delegationApplications: number;
    totalDelegates: number;
    paymentCounts: { pending: number; verified: number; actionRequired: number };
    totalRevenue: number;
}

interface DelegateSummary {
    _id: string;
    fullName: string;
    email: string;
    assignedCommittee?: string | null;
    assignedPortfolio?: string | null;
    delegateStatus?: string;
    isHead?: boolean;
}

interface ApplicationRow {
    applicationId: string;
    participantType: "solo" | "delegation";
    institution?: string;
    contactName?: string;
    contactEmail?: string;
    status: string;
    createdAt: string;
    payment?: {
        paymentStatus?: PaymentStatus;
        totalPayable?: number;
        transactionId?: string;
        receiptFileId?: string;
        receiptMime?: string;
        reviewReason?: string;
        analysis?: ReceiptAnalysis;
    };
    delegates?: DelegateSummary[];
}

interface ApplicationDetail {
    application: ApplicationRow;
    delegates: Array<
        DelegateSummary & {
            whatsappNumber: string;
            firstPreference: string;
            secondPreference: string;
            experienceLevel: string;
        }
    >;
    payment?: ApplicationRow["payment"];
}

interface Committee {
    code: string;
    name: string;
    suitedTo: string;
    level: string;
    totalSeats: number;
    allocatedSeats: number;
    agenda: string;
    studyGuideUrl?: string;
    active: boolean;
}

interface AvailableDelegate {
    id: string;
    applicationId: string;
    fullName: string;
    email: string;
    firstPreference: string;
    secondPreference: string;
}

interface DashboardData {
    metrics: Metrics | null;
    applications: ApplicationRow[];
    total: number;
    pageSize: number;
    pendingChecks: number;
    committees: Committee[];
    unallocatedDelegates: AvailableDelegate[];
}

interface ApiResult {
    success?: boolean;
    error?: string;
    [key: string]: unknown;
}

const EMPTY_DATA: DashboardData = {
    metrics: null,
    applications: [],
    total: 0,
    pageSize: 50,
    pendingChecks: 0,
    committees: [],
    unallocatedDelegates: [],
};

const APPLICATION_STAGES = [
    "Submitted",
    "Payment under review",
    "Payment confirmed",
    "Committee allocated",
    "Waitlisted",
    "Action Required",
] as const;

async function jsonResponse<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
}

function formatMoney(amount: number): string {
    return `PKR ${amount.toLocaleString("en-PK")}`;
}

function displayPaymentStatus(status?: PaymentStatus): string {
    if (status === "Confirmed") return "Verified";
    if (status === "Action Required") return "Action required";
    return status ?? "No payment record";
}

function responseError(body: ApiResult, fallback: string): string {
    return typeof body.error === "string" && body.error ? body.error : fallback;
}

export default function AdminDashboard() {
    const [sessionName, setSessionName] = useState("");
    const [authenticated, setAuthenticated] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [loginName, setLoginName] = useState("");
    const [password, setPassword] = useState("");
    const [loginBusy, setLoginBusy] = useState(false);
    const [error, setError] = useState("");
    const [toast, setToast] = useState("");
    const [activeView, setActiveView] = useState<"applications" | "committees">("applications");
    const [query, setQuery] = useState("");
    const [stage, setStage] = useState("");
    const [participantType, setParticipantType] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("");
    const [risk, setRisk] = useState("");
    const [sort, setSort] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<DashboardData>(EMPTY_DATA);
    const [loading, setLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState("");
    const [reasonFor, setReasonFor] = useState("");
    const [reason, setReason] = useState("");
    const [detail, setDetail] = useState<ApplicationDetail | null>(null);
    const [detailBusy, setDetailBusy] = useState("");
    const [portfolioByDelegate, setPortfolioByDelegate] = useState<Record<string, string>>({});
    const [committeeByDelegate, setCommitteeByDelegate] = useState<Record<string, string>>({});
    const [receiptBusy, setReceiptBusy] = useState("");
    const [batchBusy, setBatchBusy] = useState(false);
    const [committeeBusy, setCommitteeBusy] = useState("");
    const dashboardRequestId = useRef(0);

    const loadDashboard = useCallback(async () => {
        const requestId = ++dashboardRequestId.current;
        await Promise.resolve();
        if (requestId !== dashboardRequestId.current) return;
        setLoading(true);
        setError("");
        const params = new URLSearchParams({ page: String(page) });
        if (query.trim()) params.set("q", query.trim());
        if (stage) params.set("status", stage);
        if (participantType) params.set("type", participantType);
        if (paymentStatus) params.set("paymentStatus", paymentStatus);
        if (risk) params.set("risk", risk);
        if (sort) params.set("sort", sort);
        try {
            const [overviewResponse, applicationResponse, committeeResponse] = await Promise.all([
                fetch("/api/admin/overview", { cache: "no-store" }),
                fetch(`/api/admin/applications?${params}`, { cache: "no-store" }),
                fetch("/api/admin/committees", { cache: "no-store" }),
            ]);
            if (requestId !== dashboardRequestId.current) return;
            if ([overviewResponse, applicationResponse, committeeResponse].some((response) => response.status === 401)) {
                setAuthenticated(false);
                setError("Your admin session has expired. Sign in again to continue.");
                return;
            }
            const [overview, applications, committees] = await Promise.all([
                jsonResponse<ApiResult & { metrics?: Metrics }>(overviewResponse),
                jsonResponse<
                    ApiResult & {
                        applications?: ApplicationRow[];
                        total?: number;
                        pageSize?: number;
                        pendingChecks?: number;
                    }
                >(applicationResponse),
                jsonResponse<
                    ApiResult & {
                        committees?: Committee[];
                        unallocatedDelegates?: AvailableDelegate[];
                    }
                >(committeeResponse),
            ]);
            if (!overviewResponse.ok || !applicationResponse.ok || !committeeResponse.ok) {
                throw new Error(
                    responseError(
                        !overviewResponse.ok
                            ? overview
                            : !applicationResponse.ok
                              ? applications
                              : committees,
                        "Dashboard data could not be loaded.",
                    ),
                );
            }
            setData({
                metrics: overview.metrics ?? null,
                applications: applications.applications ?? [],
                total: applications.total ?? 0,
                pageSize: applications.pageSize ?? 50,
                pendingChecks: applications.pendingChecks ?? 0,
                committees: committees.committees ?? [],
                unallocatedDelegates: committees.unallocatedDelegates ?? [],
            });
        } catch (requestError) {
            if (requestId === dashboardRequestId.current) {
                setError(requestError instanceof Error ? requestError.message : "A network error interrupted the request.");
            }
        } finally {
            if (requestId === dashboardRequestId.current) setLoading(false);
        }
    }, [page, participantType, paymentStatus, query, risk, sort, stage]);

    useEffect(() => {
        let active = true;
        void fetch("/api/admin/me", { cache: "no-store" })
            .then(async (response) => {
                if (!active) return;
                if (!response.ok) {
                    setAuthenticated(false);
                    return;
                }
                const body = await jsonResponse<{ name?: string }>(response);
                if (!active) return;
                setSessionName(body.name ?? "Administrator");
                setAuthenticated(true);
            })
            .catch(() => {
                if (active) setError("Could not check the admin session. Check your network and retry.");
            })
            .finally(() => {
                if (active) setCheckingSession(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!authenticated) return;
        const timer = window.setTimeout(() => void loadDashboard(), 0);
        return () => window.clearTimeout(timer);
    }, [authenticated, loadDashboard]);

    async function signIn(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoginBusy(true);
        setError("");
        try {
            const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: loginName.trim(), password }),
            });
            const body = await jsonResponse<ApiResult & { name?: string }>(response);
            if (!response.ok) throw new Error(responseError(body, "Sign-in failed."));
            setSessionName(body.name ?? loginName.trim());
            setPassword("");
            setAuthenticated(true);
        } catch (loginError) {
            setError(loginError instanceof Error ? loginError.message : "Sign-in failed. Check your connection.");
        } finally {
            setLoginBusy(false);
        }
    }

    async function signOut() {
        try {
            const response = await fetch("/api/admin/logout", { method: "POST" });
            if (!response.ok) throw new Error("The session could not be closed.");
            setAuthenticated(false);
            setData(EMPTY_DATA);
            setToast("Signed out securely.");
            setError("");
        } catch (logoutError) {
            setError(logoutError instanceof Error ? logoutError.message : "Sign-out failed.");
        }
    }

    async function reviewPayment(applicationId: string, endpoint: "confirm" | "reject", reviewReason?: string) {
        if (endpoint === "confirm" && !window.confirm("Confirm that you have manually reviewed the payment receipt and want to mark this payment as verified?")) {
            return;
        }
        setActionBusy(applicationId);
        setError("");
        try {
            const response = await fetch(`/api/admin/payments/${encodeURIComponent(applicationId)}/${endpoint}`, {
                method: "POST",
                headers: endpoint === "reject" ? { "content-type": "application/json" } : undefined,
                body: endpoint === "reject" ? JSON.stringify({ reason: reviewReason }) : undefined,
            });
            const body = await jsonResponse<ApiResult>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "Payment review could not be saved."));
            setToast(endpoint === "confirm" ? "Payment verified." : "Action requested; the applicant will be notified.");
            setReasonFor("");
            setReason("");
            await loadDashboard();
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : "The action failed.");
        } finally {
            setActionBusy("");
        }
    }

    async function showRoster(applicationId: string) {
        if (detail?.application.applicationId === applicationId) {
            setDetail(null);
            return;
        }
        setDetailBusy(applicationId);
        setError("");
        try {
            const response = await fetch(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
                cache: "no-store",
            });
            const body = await jsonResponse<ApiResult & ApplicationDetail>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "The application roster could not be loaded."));
            setDetail(body);
        } catch (detailError) {
            setError(detailError instanceof Error ? detailError.message : "The roster could not be loaded.");
        } finally {
            setDetailBusy("");
        }
    }

    async function allocateDelegate(delegate: AvailableDelegate) {
        const committee = committeeByDelegate[delegate.id] || delegate.firstPreference;
        const portfolio = portfolioByDelegate[delegate.id]?.trim() ?? "";
        if (!portfolio) {
            setError(`Enter a country or portfolio for ${delegate.fullName} before allocating.`);
            return;
        }
        setActionBusy(delegate.id);
        setError("");
        try {
            const response = await fetch(`/api/admin/delegates/${encodeURIComponent(delegate.id)}/allocate`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ committee, portfolio }),
            });
            const body = await jsonResponse<ApiResult>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "Delegate allocation could not be saved."));
            setToast(`${delegate.fullName} allocated to ${committee}.`);
            await loadDashboard();
        } catch (allocationError) {
            setError(allocationError instanceof Error ? allocationError.message : "Allocation failed.");
        } finally {
            setActionBusy("");
        }
    }

    async function updateDelegateAllocation(delegateId: string, action: "waitlist" | "remove") {
        const confirmed = window.confirm(
            action === "waitlist"
                ? "Place this delegate on the waitlist and clear their committee assignment?"
                : "Remove this delegate's committee assignment?",
        );
        if (!confirmed) return;

        setActionBusy(delegateId);
        setError("");
        try {
            const response = await fetch(
                action === "waitlist"
                    ? `/api/admin/delegates/${encodeURIComponent(delegateId)}/waitlist`
                    : `/api/admin/delegates/${encodeURIComponent(delegateId)}/allocate`,
                { method: action === "waitlist" ? "POST" : "DELETE" },
            );
            const body = await jsonResponse<ApiResult>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "Delegate allocation could not be updated."));
            setToast(action === "waitlist" ? "Delegate moved to the waitlist." : "Committee allocation removed.");
            setDetail(null);
            await loadDashboard();
        } catch (updateError) {
            setError(updateError instanceof Error ? updateError.message : "The delegate could not be updated.");
        } finally {
            setActionBusy("");
        }
    }

    async function reanalyzeReceipt(applicationId: string) {
        setReceiptBusy(applicationId);
        setError("");
        try {
            const response = await fetch(`/api/admin/payments/${encodeURIComponent(applicationId)}/reanalyze`, {
                method: "POST",
            });
            const body = await jsonResponse<ApiResult & { analysis?: ReceiptAnalysis }>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok || !body.analysis) {
                throw new Error(responseError(body, "Receipt analysis could not be completed."));
            }
            setData((current) => ({
                ...current,
                applications: current.applications.map((application) =>
                    application.applicationId === applicationId && application.payment
                        ? { ...application, payment: { ...application.payment, analysis: body.analysis } }
                        : application,
                ),
            }));
            setToast(`Receipt checked: ${body.analysis.riskLevel} risk (${body.analysis.riskScore}).`);
        } catch (analysisError) {
            setError(analysisError instanceof Error ? analysisError.message : "Receipt analysis failed.");
        } finally {
            setReceiptBusy("");
        }
    }

    async function runReceiptBatch() {
        setBatchBusy(true);
        setError("");
        try {
            const response = await fetch("/api/admin/receipts/check-pending", { method: "POST" });
            const body = await jsonResponse<
                ApiResult & {
                    processed?: Array<{ applicationId: string; status: string; riskLevel: string }>;
                    remaining?: number;
                }
            >(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "Pending receipts could not be checked."));
            const processed = body.processed?.length ?? 0;
            setToast(`Checked ${processed} receipt${processed === 1 ? "" : "s"}; ${body.remaining ?? 0} remain.`);
            await loadDashboard();
        } catch (batchError) {
            setError(batchError instanceof Error ? batchError.message : "Receipt batch check failed.");
        } finally {
            setBatchBusy(false);
        }
    }

    async function saveCommittee(
        code: string,
        updates: { name: string; agenda: string; suitedTo: string; level: string; totalSeats: number; studyGuideUrl: string },
    ): Promise<boolean> {
        setCommitteeBusy(code);
        setError("");
        try {
            const response = await fetch(`/api/admin/committees/${encodeURIComponent(code)}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(updates),
            });
            const body = await jsonResponse<ApiResult>(response);
            if (response.status === 401) {
                setAuthenticated(false);
                throw new Error("Your admin session expired. Sign in again.");
            }
            if (!response.ok) throw new Error(responseError(body, "Committee details could not be saved."));
            setToast(`${code} committee details saved.`);
            await loadDashboard();
            return true;
        } catch (committeeError) {
            setError(committeeError instanceof Error ? committeeError.message : "Committee details could not be saved.");
            return false;
        } finally {
            setCommitteeBusy("");
        }
    }

    function submitReason(event: FormEvent<HTMLFormElement>, applicationId: string) {
        event.preventDefault();
        if (reason.trim().length < 3) {
            setError("The action reason must contain at least 3 characters.");
            return;
        }
        void reviewPayment(applicationId, "reject", reason.trim());
    }

    function setSearch(value: string) {
        setPage(1);
        setQuery(value);
    }

    function setStageFilter(value: string) {
        setPage(1);
        setStage(value);
    }

    if (checkingSession) {
        return <main className="admin-screen"><div className="admin-loading"><span className="admin-spinner" />Checking secure session…</div></main>;
    }

    if (!authenticated) {
        return (
            <main className="admin-screen admin-login-screen">
                <section className="admin-login-card">
                    <div className="admin-mark" aria-hidden="true">GD</div>
                    <p className="admin-eyebrow">The Grand Debate ’26</p>
                    <h1>Organiser sign in</h1>
                    <p className="admin-muted">Use your configured admin password. Your session is protected by an HttpOnly cookie.</p>
                    {error && <div className="admin-alert" role="alert">{error}</div>}
                    <form className="admin-login-form" onSubmit={signIn}>
                        <label>
                            Organiser name
                            <input autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} required maxLength={100} />
                        </label>
                        <label>
                            Admin password
                            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                        </label>
                        <button className="admin-button admin-button-primary" type="submit" disabled={loginBusy}>
                            {loginBusy ? "Signing in…" : "Sign in securely"}
                        </button>
                    </form>
                    <p className="admin-footnote">Admin access requires the server-side <code>ADMIN_PASSWORD</code> setting.</p>
                </section>
            </main>
        );
    }

    const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

    return (
        <main className="admin-screen">
            <header className="admin-topbar">
                <div className="admin-brand">
                    <div className="admin-mark" aria-hidden="true">GD</div>
                    <div><span className="admin-eyebrow">The Grand Debate ’26</span><strong>Operations dashboard</strong></div>
                </div>
                <div className="admin-user">
                    <span>Signed in as <strong>{sessionName}</strong></span>
                    <button className="admin-button admin-button-quiet" type="button" onClick={() => void signOut()}>Sign out</button>
                </div>
            </header>

            {error && <div className="admin-alert admin-alert-global" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
            {toast && <div className="admin-toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast("")} aria-label="Dismiss notification">×</button></div>}

            <div className="admin-content">
                <section className="admin-heading">
                    <div><p className="admin-eyebrow">Conference administration</p><h1>Welcome back, {sessionName}</h1><p className="admin-muted">Review applications, confirm payments and manage committee placements.</p></div>
                    <button className="admin-button admin-button-outline" type="button" onClick={() => void loadDashboard()} disabled={loading}>{loading ? "Refreshing…" : <>Refresh data <ActionIcon direction="refresh" /></>}</button>
                </section>

                <section className="admin-metrics" aria-label="Conference metrics">
                    <MetricCard label="Applications" value={data.metrics?.totalApplications ?? "—"} detail={`${data.metrics?.soloApplications ?? 0} solo · ${data.metrics?.delegationApplications ?? 0} delegations`} />
                    <MetricCard label="Registered delegates" value={data.metrics?.totalDelegates ?? "—"} detail="Across all applications" />
                    <MetricCard label="Payments" value={data.metrics ? data.metrics.paymentCounts.pending + data.metrics.paymentCounts.verified + data.metrics.paymentCounts.actionRequired : "—"} detail={`${data.metrics?.paymentCounts.pending ?? 0} pending · ${data.metrics?.paymentCounts.verified ?? 0} verified · ${data.metrics?.paymentCounts.actionRequired ?? 0} action required`} />
                    <MetricCard label="Revenue collected" value={data.metrics ? formatMoney(data.metrics.totalRevenue) : "—"} detail="Confirmed payments only" />
                </section>

                <div className="admin-tabs" role="tablist" aria-label="Dashboard views">
                    <button className={activeView === "applications" ? "is-active" : ""} type="button" role="tab" aria-selected={activeView === "applications"} onClick={() => setActiveView("applications")}>Applications</button>
                    <button className={activeView === "committees" ? "is-active" : ""} type="button" role="tab" aria-selected={activeView === "committees"} onClick={() => setActiveView("committees")}>Committee allocation</button>
                </div>

                {activeView === "applications" ? (
                    <section className="admin-panel">
                        <div className="admin-panel-heading">
                            <div><p className="admin-eyebrow">Applicant records</p><h2>Applications <span className="admin-count">{data.total}</span></h2></div>
                            <div className="admin-filters">
                                <a className="admin-button admin-button-outline" href="/api/admin/export">Export CSV</a>
                                <button className="admin-button admin-button-outline" type="button" onClick={() => void runReceiptBatch()} disabled={batchBusy || data.pendingChecks === 0}>
                                    {batchBusy ? "Checking receipts…" : `Run receipt checks (${data.pendingChecks})`}
                                </button>
                                <label className="admin-search"><span aria-hidden="true">⌕</span><input aria-label="Search applications" placeholder="Search ID, delegate, email or institution" value={query} onChange={(event) => setSearch(event.target.value)} /></label>
                                <select aria-label="Filter by application stage" value={stage} onChange={(event) => setStageFilter(event.target.value)}>
                                    <option value="">All stages</option>
                                    {APPLICATION_STAGES.map((status) => <option value={status} key={status}>{status}</option>)}
                                </select>
                                <select aria-label="Filter by participant type" value={participantType} onChange={(event) => { setPage(1); setParticipantType(event.target.value); }}>
                                    <option value="">Solo and delegations</option>
                                    <option value="solo">Solo</option>
                                    <option value="delegation">Delegation</option>
                                </select>
                                <select aria-label="Filter by payment status" value={paymentStatus} onChange={(event) => { setPage(1); setPaymentStatus(event.target.value); }}>
                                    <option value="">All payments</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Confirmed">Verified</option>
                                    <option value="Action Required">Action required</option>
                                </select>
                                <select aria-label="Filter by receipt risk" value={risk} onChange={(event) => { setPage(1); setRisk(event.target.value); }}>
                                    <option value="">All receipt risk</option>
                                    <option value="low">Low risk</option>
                                    <option value="medium">Medium risk</option>
                                    <option value="high">High risk</option>
                                </select>
                                <select aria-label="Sort applications" value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }}>
                                    <option value="">Newest first</option>
                                    <option value="risk">Highest receipt risk</option>
                                </select>
                            </div>
                        </div>
                        {loading && data.applications.length === 0 ? (
                            <div className="admin-skeleton-list" aria-label="Loading applications"><span /><span /><span /><span /></div>
                        ) : data.applications.length === 0 ? (
                            <div className="admin-empty"><span aria-hidden="true">◇</span><strong>No applications found</strong><p>Try changing the search or stage filter.</p></div>
                        ) : (
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead><tr><th>Application</th><th>Contact / institution</th><th>Delegates</th><th>Stage</th><th>Payment</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {data.applications.map((application) => (
                                            <ApplicationRows
                                                key={application.applicationId}
                                                application={application}
                                                actionBusy={actionBusy}
                                                reasonFor={reasonFor}
                                                reason={reason}
                                                detail={detail?.application.applicationId === application.applicationId ? detail : null}
                                                detailBusy={detailBusy}
                                                receiptBusy={receiptBusy}
                                                actionBusyDelegate={actionBusy}
                                                onConfirm={() => void reviewPayment(application.applicationId, "confirm")}
                                                onReanalyze={() => void reanalyzeReceipt(application.applicationId)}
                                                onReasonToggle={() => { setReasonFor(reasonFor === application.applicationId ? "" : application.applicationId); setReason(""); }}
                                                onReasonChange={setReason}
                                                onReasonSubmit={(event) => submitReason(event, application.applicationId)}
                                                onShowRoster={() => void showRoster(application.applicationId)}
                                                onWaitlist={(delegateId) => void updateDelegateAllocation(delegateId, "waitlist")}
                                                onRemoveAllocation={(delegateId) => void updateDelegateAllocation(delegateId, "remove")}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="admin-pagination">
                            <span>Showing {data.total === 0 ? 0 : (page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}</span>
                            <div><button className="admin-button admin-button-outline" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="admin-button admin-button-outline" type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</button></div>
                        </div>
                    </section>
                ) : (
                    <section className="admin-allocation-view">
                        <div className="admin-panel-heading"><div><p className="admin-eyebrow">Seat planning</p><h2>Committee capacity</h2></div><p className="admin-muted">Unassigned delegates with confirmed payments are available for placement.</p></div>
                        {data.committees.length === 0 ? <div className="admin-empty"><strong>No committee data available</strong><p>Refresh the dashboard or check the database connection.</p></div> : (
                            <div className="admin-committee-grid">
                                {data.committees.map((committee) => {
                                    const full = committee.totalSeats > 0 && committee.allocatedSeats >= committee.totalSeats;
                                    const progress = committee.totalSeats > 0 ? Math.min(100, (committee.allocatedSeats / committee.totalSeats) * 100) : 0;
                                    return <CommitteeCard
                                        key={committee.code}
                                        committee={committee}
                                        full={full}
                                        progress={progress}
                                        busy={committeeBusy === committee.code}
                                        onSave={saveCommittee}
                                    />;
                                })}
                            </div>
                        )}
                        <div className="admin-panel admin-unallocated">
                            <div className="admin-panel-heading"><div><p className="admin-eyebrow">Quick placement</p><h2>Unallocated delegates</h2></div><span className="admin-count">{data.unallocatedDelegates.length}{data.unallocatedDelegates.length === 100 ? "+" : ""}</span></div>
                            {data.unallocatedDelegates.length === 0 ? <div className="admin-empty"><span aria-hidden="true">✓</span><strong>Everyone is allocated</strong><p>No confirmed-payment delegates are currently waiting for placement.</p></div> : (
                                <div className="admin-unallocated-list">
                                    {data.unallocatedDelegates.map((delegate) => {
                                        const preference = committeeByDelegate[delegate.id] || delegate.firstPreference;
                                        return <form className="admin-allocate-row" key={delegate.id} onSubmit={(event) => { event.preventDefault(); void allocateDelegate(delegate); }}>
                                            <div><strong>{delegate.fullName}</strong><span>{delegate.email} · {delegate.applicationId}</span></div>
                                            <select aria-label={`Committee preference for ${delegate.fullName}`} value={preference} onChange={(event) => setCommitteeByDelegate((current) => ({ ...current, [delegate.id]: event.target.value }))}><option value={delegate.firstPreference}>1st · {delegate.firstPreference}</option><option value={delegate.secondPreference}>2nd · {delegate.secondPreference}</option></select>
                                            <input aria-label={`Country or portfolio for ${delegate.fullName}`} placeholder="Country / portfolio" maxLength={100} value={portfolioByDelegate[delegate.id] ?? ""} onChange={(event) => setPortfolioByDelegate((current) => ({ ...current, [delegate.id]: event.target.value }))} required />
                                            <button className="admin-button admin-button-primary" type="submit" disabled={actionBusy === delegate.id}>{actionBusy === delegate.id ? "Saving…" : "Allocate"}</button>
                                        </form>;
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                )}
                <p className="admin-disclaimer">When a receipt needs correction, send an action request with a reason. The head delegate uploads the replacement screenshot from the application status page; organisers review it here and do not upload receipts.</p>
            </div>
        </main>
    );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
    return <article className="admin-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ApplicationRows({
    application,
    actionBusy,
    reasonFor,
    reason,
    detail,
    detailBusy,
    receiptBusy,
    actionBusyDelegate,
    onConfirm,
    onReanalyze,
    onReasonToggle,
    onReasonChange,
    onReasonSubmit,
    onShowRoster,
    onWaitlist,
    onRemoveAllocation,
}: {
    application: ApplicationRow;
    actionBusy: string;
    reasonFor: string;
    reason: string;
    detail: ApplicationDetail | null;
    detailBusy: string;
    receiptBusy: string;
    actionBusyDelegate: string;
    onConfirm: () => void;
    onReanalyze: () => void;
    onReasonToggle: () => void;
    onReasonChange: (value: string) => void;
    onReasonSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onShowRoster: () => void;
    onWaitlist: (delegateId: string) => void;
    onRemoveAllocation: (delegateId: string) => void;
}) {
    const busy = actionBusy === application.applicationId;
    const canReview = application.payment?.paymentStatus === "Pending" || application.payment?.paymentStatus === "Action Required";
    const canManuallyVerify = canReview && Boolean(application.payment?.receiptFileId);
    return <>
        <tr>
            <td><strong className="admin-application-id">{application.applicationId}</strong><span className="admin-cell-sub">{application.participantType === "solo" ? "Solo" : "Delegation"} · {new Date(application.createdAt).toLocaleDateString()}</span></td>
            <td><strong>{application.contactName || "Contact not set"}</strong><span className="admin-cell-sub">{application.contactEmail || "Email not set"}</span><span className="admin-cell-sub">{application.institution || "Institution not set"}</span></td>
            <td>{application.delegates?.length ?? "—"}<span className="admin-cell-sub">{application.delegates?.filter((delegate) => delegate.assignedCommittee).length ?? 0} allocated</span></td>
            <td><span className="admin-status-badge">{application.status || "Unknown"}</span></td>
            <td>
                <strong>{displayPaymentStatus(application.payment?.paymentStatus)}</strong>
                <span className="admin-cell-sub">{typeof application.payment?.totalPayable === "number" ? formatMoney(application.payment.totalPayable) : "—"}</span>
                {application.payment?.transactionId && <span className="admin-cell-sub">Txn: {application.payment.transactionId}</span>}
                {application.payment?.reviewReason && <span className="admin-cell-sub admin-reason">{application.payment.reviewReason}</span>}
                {application.payment?.analysis && <span className={`admin-risk-badge risk-${application.payment.analysis.riskLevel}`}>{application.payment.analysis.riskLevel} risk · {application.payment.analysis.riskScore}</span>}
            </td>
            <td><div className="admin-row-actions">
                {canReview && <><button type="button" className="admin-button admin-button-small admin-button-primary" disabled={busy || !canManuallyVerify} title={!canManuallyVerify ? "A stored receipt file is required before verification." : "Manually confirm after reviewing the receipt."} onClick={onConfirm}>{busy ? "Saving…" : canManuallyVerify ? "Manually verify" : "Receipt missing"}</button><button type="button" className="admin-button admin-button-small admin-button-warning" disabled={busy} onClick={onReasonToggle}>Request new screenshot</button></>}
                <button type="button" className="admin-button admin-button-small admin-button-outline" disabled={detailBusy === application.applicationId} onClick={onShowRoster}>{detailBusy === application.applicationId ? "Loading…" : detail ? "Close review" : "Review payment & roster"}</button>
                {application.payment?.receiptFileId && <a className="admin-button admin-button-small admin-button-outline" href={`/api/admin/receipts/${encodeURIComponent(application.payment.receiptFileId)}`} target="_blank" rel="noreferrer">Receipt</a>}
                {application.payment?.receiptFileId && <button type="button" className="admin-button admin-button-small admin-button-outline" disabled={receiptBusy === application.applicationId} onClick={onReanalyze}>{receiptBusy === application.applicationId ? "Analyzing…" : "Re-run check"}</button>}
            </div></td>
        </tr>
        {reasonFor === application.applicationId && <tr className="admin-expanded-row"><td colSpan={6}><form className="admin-reason-form" onSubmit={onReasonSubmit}><strong>Ask the applicant for a clearer or corrected screenshot</strong><p>The reason below is sent to the head delegate. They upload the replacement from their application status page; you review it here.</p><label htmlFor={`reason-${application.applicationId}`}>Message to the applicant</label><textarea id={`reason-${application.applicationId}`} value={reason} onChange={(event) => onReasonChange(event.target.value)} minLength={3} maxLength={500} required placeholder="For example: The screenshot is unclear. Please upload a clearer payment receipt." /><button className="admin-button admin-button-warning" type="submit" disabled={busy}>{busy ? "Sending…" : "Send request to applicant"}</button></form></td></tr>}
        {application.payment?.paymentStatus === "Action Required" && <tr className="admin-expanded-row"><td colSpan={6}><div className="admin-applicant-action-note"><strong>Waiting for the applicant’s replacement screenshot</strong><span>The head delegate uploads it from the application status page. The new receipt will appear here for organiser review.</span></div></td></tr>}
        {detail && <tr className="admin-expanded-row"><td colSpan={6}>
            <div className="admin-roster-heading"><strong>Delegate roster</strong><span>{detail.application.institution || "Institution not set"}</span></div>
            {detail.payment?.receiptFileId && (
                <div className="admin-receipt-preview">
                    <div><strong>Payment receipt</strong><span>Review the original upload before choosing a payment action.</span></div>
                    {detail.payment.receiptMime?.startsWith("image/") ? (
                        <ReceiptPreview fileId={detail.payment.receiptFileId} applicationId={detail.application.applicationId} />
                    ) : (
                        <div className="admin-receipt-download"><span>{detail.payment.receiptMime === "application/pdf" ? "PDF receipt" : "Receipt file"}</span><a className="admin-button admin-button-outline" href={`/api/admin/receipts/${encodeURIComponent(detail.payment.receiptFileId)}`}>Download and review</a></div>
                    )}
                </div>
            )}
            {!detail.payment?.receiptFileId && <div className="admin-receipt-missing"><strong>Receipt file unavailable</strong><span>{detail.payment ? "The payment record has no stored receipt file. Check the upload status before verifying." : "No payment record is attached to this application."}</span></div>}
            {detail.payment?.analysis && <ReceiptAnalysisPanel analysis={detail.payment.analysis} />}
            {detail.payment?.analysis && <p className="admin-manual-review-note">Automated receipt checks are advisory only. They do not verify or reject payment; the organiser must review the receipt and make the decision manually.</p>}
            {detail.delegates.length === 0 ? <p className="admin-muted">No delegate records were found.</p> : <div className="admin-roster-table"><table><thead><tr><th>Name</th><th>Email</th><th>Institution</th><th>Preferences</th><th>Allocation</th><th>Actions</th></tr></thead><tbody>{detail.delegates.map((delegate) => <tr key={delegate._id}><td>{delegate.fullName}{delegate.isHead ? " · Head" : ""}</td><td>{delegate.email}</td><td>{detail.application.institution || "—"}</td><td>{delegate.firstPreference} / {delegate.secondPreference}</td><td>{delegate.assignedCommittee ? `${delegate.assignedCommittee} · ${delegate.assignedPortfolio || "No portfolio"}` : delegate.delegateStatus || "Unallocated"}</td><td><div className="admin-row-actions">{delegate.assignedCommittee && <button className="admin-button admin-button-small admin-button-outline" type="button" disabled={actionBusyDelegate === delegate._id} onClick={() => onRemoveAllocation(delegate._id)}>Remove allocation</button>}{delegate.delegateStatus === "Waitlisted" && <button className="admin-button admin-button-small admin-button-outline" type="button" disabled={actionBusyDelegate === delegate._id} onClick={() => onRemoveAllocation(delegate._id)}>Clear waitlist</button>}{delegate.delegateStatus !== "Waitlisted" && detail.payment?.paymentStatus === "Confirmed" && <button className="admin-button admin-button-small admin-button-warning" type="button" disabled={actionBusyDelegate === delegate._id} onClick={() => onWaitlist(delegate._id)}>Waitlist</button>}</div></td></tr>)}</tbody></table></div>}
        </td></tr>}
    </>;
}

function ReceiptPreview({ fileId, applicationId }: { fileId: string; applicationId: string }) {
    const [failed, setFailed] = useState(false);
    const receiptUrl = `/api/admin/receipts/${encodeURIComponent(fileId)}`;
    if (failed) {
        return (
            <div className="admin-receipt-fallback" role="alert">
                <span>Preview could not be loaded. You can still open the protected receipt file.</span>
                <a className="admin-button admin-button-outline" href={receiptUrl} target="_blank" rel="noreferrer">Open receipt</a>
            </div>
        );
    }
    return (
        <a className="admin-receipt-image-link" href={receiptUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={receiptUrl}
                alt={`Uploaded payment receipt for ${applicationId}`}
                onError={() => setFailed(true)}
            />
            <span>Open full-size receipt <ActionIcon direction="up-right" /></span>
        </a>
    );
}

function ReceiptAnalysisPanel({ analysis }: { analysis: ReceiptAnalysis }) {
    return (
        <section className="admin-analysis" aria-label="Receipt analysis results">
            <div className="admin-analysis-heading">
                <strong>Receipt checks</strong>
                <span className={`admin-risk-badge risk-${analysis.riskLevel}`}>{analysis.riskLevel} risk · {analysis.riskScore}</span>
                <span>{analysis.status === "done" ? `Full check · ${analysis.provider}` : analysis.status}</span>
            </div>
            {analysis.error && <p className="admin-muted">{analysis.error}</p>}
            {analysis.flags.length > 0 ? (
                <ul>{analysis.flags.map((flag, index) => <li className={`risk-text-${flag.severity}`} key={`${flag.code}-${index}`}><strong>{flag.code}</strong> · {flag.detail}</li>)}</ul>
            ) : <p className="admin-muted">No receipt flags were found by the automated checks.</p>}
            {analysis.textExcerpt && <details><summary>OCR text excerpt</summary><p>{analysis.textExcerpt}</p></details>}
        </section>
    );
}

function CommitteeCard({
    committee,
    full,
    progress,
    busy,
    onSave,
}: {
    committee: Committee;
    full: boolean;
    progress: number;
    busy: boolean;
    onSave: (code: string, updates: { name: string; agenda: string; suitedTo: string; level: string; totalSeats: number; studyGuideUrl: string }) => Promise<boolean>;
}) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(committee.name);
    const [agenda, setAgenda] = useState(committee.agenda);
    const [suitedTo, setSuitedTo] = useState(committee.suitedTo);
    const [level, setLevel] = useState(committee.level);
    const [totalSeats, setTotalSeats] = useState(String(committee.totalSeats));
    const [studyGuideUrl, setStudyGuideUrl] = useState(committee.studyGuideUrl ?? "");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const parsedSeats = Number(totalSeats);
        if (!Number.isInteger(parsedSeats) || parsedSeats < 0 || parsedSeats > 500) return;
        const saved = await onSave(committee.code, { name: name.trim(), agenda: agenda.trim(), suitedTo: suitedTo.trim(), level: level.trim(), totalSeats: parsedSeats, studyGuideUrl: studyGuideUrl.trim() });
        if (saved) setEditing(false);
    }

    return <article className="admin-committee-card">
        <div className="admin-committee-title"><span className="admin-code">{committee.code}</span><span className={committee.active ? "admin-status-badge status-active" : "admin-status-badge"}>{committee.active ? "Active" : "Inactive"}</span></div>
        {editing ? (
            <form className="admin-committee-edit" onSubmit={(event) => void submit(event)}>
                <label>Name<input required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Agenda<input required maxLength={500} value={agenda} onChange={(event) => setAgenda(event.target.value)} /></label>
                <label>Suited to<input required maxLength={500} value={suitedTo} onChange={(event) => setSuitedTo(event.target.value)} /></label>
                <label>Level<input required maxLength={50} value={level} onChange={(event) => setLevel(event.target.value)} /></label>
                <label>Seat capacity <small>0 means unlimited</small><input type="number" min={0} max={500} step={1} value={totalSeats} onChange={(event) => setTotalSeats(event.target.value)} required /></label>
                <label>Study guide URL or path<input type="text" placeholder="/docs/committees/unsc-study-guide.pdf or https://…" value={studyGuideUrl} onChange={(event) => setStudyGuideUrl(event.target.value)} /></label>
                <div className="admin-committee-edit-actions"><button className="admin-button admin-button-primary admin-button-small" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button><button className="admin-button admin-button-outline admin-button-small" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
            </form>
        ) : <>
            <h3>{committee.name}</h3><p className="admin-muted">{committee.agenda || "Agenda to be announced"}</p>
            <div className="admin-seat-label"><strong>{committee.allocatedSeats}</strong><span>/ {committee.totalSeats > 0 ? committee.totalSeats : "Unlimited"} seats allocated</span></div>
            <div className="admin-progress" role="progressbar" aria-label={`${committee.code} seats allocated`} aria-valuenow={committee.allocatedSeats} aria-valuemin={0} aria-valuemax={committee.totalSeats || Math.max(committee.allocatedSeats, 1)}><span style={{ width: `${committee.totalSeats > 0 ? progress : committee.allocatedSeats > 0 ? 100 : 0}%` }} /></div>
            {committee.studyGuideUrl && <a className="admin-guide-link" href={committee.studyGuideUrl} target="_blank" rel="noreferrer">Study guide <ActionIcon direction="up-right" /></a>}
            {full && <p className="admin-full-note">Capacity reached</p>}
            <button className="admin-button admin-button-small admin-button-outline admin-committee-edit-button" type="button" onClick={() => setEditing(true)}>Edit committee</button>
        </>}
    </article>;
}
