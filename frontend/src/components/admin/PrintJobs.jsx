// src/components/admin/PrintJobs.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { getJobs, markJobPrinted, retryJob, deleteJob } from "@/api/print_jobs";

export default function PrintJobs() {
  const { token } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [allLoaded, setAllLoaded] = useState(false);

  // ✅ Fetch jobs
  const loadJobs = async (append = false) => {
    setLoading(true);
    try {
      const data = await getJobs(null, token);
      const fetched = Array.isArray(data) ? data : data?.jobs || [];

      // Sort newest first
      const sorted = fetched.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      const sliced = sorted.slice(0, limit);
      setAllLoaded(sliced.length >= sorted.length);
      setJobs(append ? [...jobs, ...sliced] : sliced);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err.message || "Failed to load print jobs"
      );
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line
  }, [limit]);

  // ✅ Actions
  const handleRetry = async (jobId) => {
    try {
      await retryJob(jobId, token);
      toast.success("Job set to pending for retry");
      loadJobs();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "Failed to retry job");
    }
  };

  const handleMarkPrinted = async (jobId) => {
    try {
      await markJobPrinted(jobId, token);
      toast.success("Job marked as printed");
      loadJobs();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "Failed to mark as printed");
    }
  };

  const handleDelete = (jobId) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3 p-3">
          <p>Are you sure you want to delete this print job?</p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.dismiss(t.id)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteJob(jobId, token);
                  toast.success("Print job deleted");
                  loadJobs();
                } catch (err) {
                  toast.error(
                    err?.response?.data?.error || err.message || "Failed to delete job"
                  );
                } finally {
                  toast.dismiss(t.id);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    );
  };

  // ✅ Helper to unify items (works for both `item` and `items`)
  const getJobItems = (job) => {
    if (Array.isArray(job.items_data?.items)) return job.items_data.items;
    if (job.items_data?.item) return [job.items_data.item];
    return [];
  };

  // ✅ Search & Filter
  const filteredJobs = jobs.filter((job) => {
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const items = getJobItems(job);
    const orderMatch = job.order_id?.toString().includes(search);
    const nameMatch = items.some((i) =>
      i.name?.toLowerCase().includes(search.toLowerCase())
    );
    return matchesStatus && (!search || orderMatch || nameMatch);
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-col md:flex-row gap-3 p-3 items-center justify-between">
        <div className="flex flex-1 gap-2">
          <Input
            placeholder="Search by order ID or item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="printed">Printed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => loadJobs()}>
          Refresh
        </Button>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="px-4 py-3 font-medium">Waiter Name</th>
              <th className="px-4 py-3 font-medium">Order Number</th>
              <th className="px-4 py-3 font-medium">Menu Item</th>
              <th className="px-4 py-3 font-medium">Prep Tag</th>
              <th className="px-4 py-3 font-medium">Station Name</th>
              {/* <th className="px-4 py-3 font-medium">Type</th> */}
              <th className="px-4 py-3 font-medium">Created At</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  Loading print jobs…
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No jobs found.
                </td>
              </tr>
            ) : (
              filteredJobs.map((job) => {
                const waiterName =
                  job.items_data?.waiter || job.waiter || "Unknown";
                const items = getJobItems(job);
                const firstItemName = items[0]?.name || "-";
                const extraCount =
                  items.length > 1 ? ` +${items.length - 1} more` : "";
                const menuItemDisplay = `${firstItemName}${extraCount}`;
                const allItems = items.map((i) => i.name).join(", ");
                const prepTag =
                  job.items_data?.prep_tag || items[0]?.prep_tag || "-";
                const stationName =
                  items[0]?.station ||
                  job.items_data?.copy ||
                  (job.station_id ? `Station ${job.station_id}` : "Cashier");

                return (
                  <tr key={job.id} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-3">{waiterName}</td>
                    <td className="px-4 py-3">{job.order_id}</td>
                    <td
                      className="px-4 py-3"
                      title={allItems.length > 0 ? allItems : "No items"}
                    >
                      {menuItemDisplay}
                    </td>
                    <td className="px-4 py-3">{prepTag}</td>
                    <td className="px-4 py-3">{stationName}</td>
                    {/* <td className="px-4 py-3 capitalize">{job.type}</td> */}
                    <td className="px-4 py-3">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      {job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(job.id)}
                        >
                          Retry
                        </Button>
                      )}
                      {job.status === "pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleMarkPrinted(job.id)}
                        >
                          Mark Printed
                        </Button>
                      )}
                      {(job.status === "failed" ||
                        job.status === "pending") && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(job.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* See More */}
      {!loading && !allLoaded && (
        <div className="flex justify-center">
          <Button onClick={() => setLimit(limit + 50)}>See More</Button>
        </div>
      )}
    </div>
  );
}

