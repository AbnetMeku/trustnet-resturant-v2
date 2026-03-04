import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { formatEatDateTime } from "@/lib/timezone";

import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJobs, retryJob } from "@/api/print_jobs";
import { getApiErrorMessage } from "@/lib/apiError";

export default function PrintFailures() {
  const { authToken, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [jobs, setJobs] = useState([]);

  const loadFailedJobs = async () => {
    if (!authToken) return;
    setLoading(true);
    try {
      const data = await getJobs(null, authToken, "failed");
      const list = Array.isArray(data) ? data : [];
      const ownFailedJobs =
        user?.role === "waiter"
          ? list.filter((job) => Number(job.order_user_id) === Number(user.id))
          : list;
      setJobs(ownFailedJobs);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load failed print jobs."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFailedJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, user?.id, user?.role]);

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

  const rows = useMemo(() => {
    return jobs.map((job) => {
      const items = Array.isArray(job.items_data?.items)
        ? job.items_data.items
        : job.items_data?.item
          ? [job.items_data.item]
          : [];
      const firstItem = items[0]?.name || "-";
      const extra = items.length > 1 ? ` +${items.length - 1} more` : "";
      return {
        id: job.id,
        orderId: job.order_id,
        itemLabel: `${firstItem}${extra}`,
        station: items[0]?.station || job.items_data?.copy || `Station ${job.station_id || "-"}`,
        createdAt: job.created_at,
        error: job.error_message || "Printer unavailable or connection issue",
      };
    });
  }, [jobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Failed Prints</h2>
        <Button variant="outline" onClick={loadFailedJobs} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Failed At</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Loading failed print jobs...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No failed print jobs.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3">#{row.orderId}</td>
                  <td className="px-4 py-3">{row.itemLabel}</td>
                  <td className="px-4 py-3">{row.station}</td>
                  <td className="px-4 py-3">{formatEatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3">{row.error}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={retryingId === row.id}
                      onClick={() => handleRetry(row.id)}
                    >
                      {retryingId === row.id ? "Retrying..." : "Retry"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

