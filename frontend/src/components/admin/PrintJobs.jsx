// src/components/admin/PrintJobs.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// API helper
import { getJobs, markJobPrinted, retryJob, deleteJob } from "@/api/print_jobs";

export default function PrintJobs() {
  const { token } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Fetch jobs
  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await getJobs(null, token);
      setJobs(Array.isArray(data) ? data : data?.jobs || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || "Failed to load print jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line
  }, []);

  // Retry failed job
  const handleRetry = async (jobId) => {
    try {
      await retryJob(jobId, token);
      toast.success("Job set to pending for retry");
      loadJobs();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "Failed to retry job");
    }
  };

  // Mark as printed
  const handleMarkPrinted = async (jobId) => {
    try {
      await markJobPrinted(jobId, token);
      toast.success("Job marked as printed");
      loadJobs();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "Failed to mark as printed");
    }
  };

  // Delete job with toast confirmation
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
                  toast.error(err?.response?.data?.error || err.message || "Failed to delete job");
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
      { duration: Infinity } // keep toast until user chooses
    );
  };

  // Filtered jobs
  const filteredJobs = Array.isArray(jobs)
    ? jobs.filter(job => {
        if (statusFilter !== "all" && job.status !== statusFilter) return false;
        if (search && !job.order_id.toString().includes(search)) return false;
        return true;
      })
    : [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-col md:flex-row gap-3 p-3">
        <Input
          placeholder="Search by order ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="printed">Printed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Order ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Loading print jobs…
                </td>
              </tr>
            ) : filteredJobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  No jobs found.
                </td>
              </tr>
            ) : (
              filteredJobs.map(job => (
                <tr key={job.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3">{job.id}</td>
                  <td className="px-4 py-3">{job.order_id}</td>
                  <td className="px-4 py-3 capitalize">{job.type}</td>
                  <td className="px-4 py-3">{job.station_id || "Cashier"}</td>
                  <td className="px-4 py-3 capitalize">{job.status}</td>
                  <td className="px-4 py-3">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right flex gap-2">
                    {job.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={() => handleRetry(job.id)}>
                        Retry
                      </Button>
                    )}
                    {job.status === "pending" && (
                      <Button size="sm" variant="secondary" onClick={() => handleMarkPrinted(job.id)}>
                        Mark Printed
                      </Button>
                    )}
                    {(job.status === "failed" || job.status === "pending") && (
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(job.id)}>
                        Delete
                      </Button>
                    )}
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
