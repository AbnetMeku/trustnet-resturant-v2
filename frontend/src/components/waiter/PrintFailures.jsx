import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { eatDateISO, formatEatDateTime } from "@/lib/timezone";

import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJobs, retryJob } from "@/api/print_jobs";
import { getApiErrorMessage } from "@/lib/apiError";

export default function PrintFailures() {
  const { authToken, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");

  const todayIso = eatDateISO();

  const getJobItems = (job) => {
    if (Array.isArray(job.items_data?.items)) return job.items_data.items;
    if (job.items_data?.item) return [job.items_data.item];
    return [];
  };

  const loadFailedJobs = async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const data = await getJobs(null, authToken, "failed");
      const list = Array.isArray(data) ? data : [];
      const ownFailedJobs = list.filter((job) => Number(job.order_user_id) === Number(user?.id));
      const todaysJobs = ownFailedJobs
        .filter((job) => eatDateISO(job.created_at) === todayIso)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setJobs(todaysJobs);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load failed print jobs."));
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFailedJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, user?.id]);

  const refreshJobs = async () => {
    setRefreshing(true);
    await loadFailedJobs();
    setRefreshing(false);
  };

  const handleRetry = async (jobId) => {
    setRetryingId(jobId);
    try {
      await retryJob(jobId, authToken);
      toast.success("Print retry requested");
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to retry print job."));
    } finally {
      setRetryingId(null);
    }
  };

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;

    return jobs.filter((job) => {
      const items = getJobItems(job);
      const orderMatch = job.order_id?.toString().includes(q);
      const itemMatch = items.some((i) => (i.name || "").toLowerCase().includes(q));
      const stationMatch = items.some((i) => (i.station || "").toLowerCase().includes(q));
      const errorMatch = (job.error_message || "").toLowerCase().includes(q);
      return orderMatch || itemMatch || stationMatch || errorMatch;
    });
  }, [jobs, search]);

  return (
    <div className="space-y-5">
      <Card className="admin-card overflow-hidden">
        <div className="admin-hero px-4 py-5 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Today Failed Prints</h3>
              <p className="text-xs text-slate-300 mt-1">{jobs.length} failed job(s) for {todayIso}</p>
            </div>
            <div className="admin-stat">
              <p className="text-[11px] uppercase tracking-wide text-slate-300">Failed</p>
              <p className="text-sm font-medium">{jobs.length}</p>
            </div>
          </div>
        </div>

        <div className="admin-toolbar p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="Search order, item, station, or error..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10"
            />
            <Button variant="outline" onClick={refreshJobs} disabled={loading || refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="admin-card overflow-x-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/70 text-left">
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Item(s)</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Loading failed print jobs...
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No failed print jobs for today.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const items = getJobItems(job);
                const firstItemName = items[0]?.name || "-";
                const extraCount = items.length > 1 ? ` +${items.length - 1} more` : "";
                const menuItemDisplay = `${firstItemName}${extraCount}`;
                const allItems = items.map((i) => i.name).join(", ");
                const stationName =
                  items[0]?.station ||
                  job.items_data?.copy ||
                  (job.station_id ? `Station ${job.station_id}` : "Cashier");
                const errorText = job.error_message || "Printer unavailable or connection issue";

                return (
                  <tr
                    key={job.id}
                    className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                        failed
                      </span>
                    </td>
                    <td className="px-4 py-3">#{job.order_id}</td>
                    <td className="px-4 py-3" title={allItems.length > 0 ? allItems : "No items"}>
                      {menuItemDisplay}
                    </td>
                    <td className="px-4 py-3">{stationName}</td>
                    <td className="px-4 py-3">{formatEatDateTime(job.created_at)}</td>
                    <td className="px-4 py-3">{errorText}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryingId === job.id}
                        onClick={() => handleRetry(job.id)}
                      >
                        {retryingId === job.id ? "Retrying..." : "Retry"}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

