import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFilter, setDateFilter] = useState("today"); // today | last7 | last30
  const token = localStorage.getItem("auth_token");

  function getDateRange(filter) {
    const today = new Date();
    let startDate, endDate;
    endDate = today.toISOString().slice(0, 10);

    if (filter === "today") startDate = endDate;
    else if (filter === "last7") {
      const d = new Date();
      d.setDate(today.getDate() - 6);
      startDate = d.toISOString().slice(0, 10);
    } else if (filter === "last30") {
      const d = new Date();
      d.setDate(today.getDate() - 29);
      startDate = d.toISOString().slice(0, 10);
    }
    return { startDate, endDate };
  }

  useEffect(() => {
    if (!token) {
      setError("Authentication token missing.");
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const { startDate, endDate } = getDateRange(dateFilter);

        const res = await fetch(
          `/api/order-history/summary-range?start_date=${startDate}&end_date=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || "Failed to fetch summary");
        }

        const summary = await res.json();

        // ✅ Fixed status counts
        const openOrders = summary.waiterSummary.reduce((sum, w) => sum + w.openOrders, 0);
        const closedOrders = summary.waiterSummary.reduce((sum, w) => sum + w.closedOrders, 0);
        const paidOrders = summary.waiterSummary.reduce((sum, w) => sum + w.paidOrders, 0);

        const orderStatusData = [
          { status: "Open", count: openOrders },
          { status: "Closed", count: closedOrders },
          { status: "Paid", count: paidOrders },
        ];

        // Top items
        const topItems = summary.dailyItemsSummary
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
          .map(item => ({ id: item.name, name: item.name, count: item.quantity }));

        // Top waiters by total money
        const topWaiters = summary.waiterSummary
          .sort(
            (a, b) =>
              b.paidAmount + b.closedAmount + b.openAmount -
              (a.paidAmount + a.closedAmount + a.openAmount)
          )
          .slice(0, 5)
          .map(w => ({
            id: w.waiterId,
            name: w.waiterName,
            salesCount: (w.paidAmount + w.closedAmount + w.openAmount).toFixed(2),
          }));

        setMetrics({
          openOrders,
          closedOrders,
          paidOrders,
          todayTotalSales: summary.paidAmount + summary.closedAmount + summary.openAmount,
          grandTotalSales: summary.paidAmount + summary.closedAmount + summary.openAmount,
          orderStatusData,
          topItems,
          topWaiters,
        });
      } catch (e) {
        console.error(e);
        setError(e.message || "Could not load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [token, dateFilter]);

  if (loading) return <p className="p-4">Loading dashboard...</p>;
  if (error) return <p className="p-4 text-red-600">{error}</p>;
  if (!metrics) return null;

  return (
    <div className="p-4 space-y-8 dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      {/* Date Range Filter */}
      <div className="mb-4">
        <label className="mr-2 font-semibold">Date Range:</label>
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="border rounded px-2 py-1 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
        >
          <option value="today">Today</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card bgColor="bg-indigo-700" title="Open Orders" value={metrics.openOrders} />
        <Card bgColor="bg-green-600" title="Closed Orders" value={metrics.closedOrders} />
        <Card bgColor="bg-blue-700" title="Paid Orders" value={metrics.paidOrders} />
      </div>

      {/* Sales Totals */}
      <div className="bg-yellow-500 text-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-2">Total Sales</h3>
        <p className="text-5xl font-extrabold">
          ${metrics.todayTotalSales.toLocaleString()}
        </p>
      </div>

      {/* Order Status Chart */}
      <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-4">Order Status Breakdown</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={metrics.orderStatusData}>
            <XAxis dataKey="status" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Items and Waiters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ListBlock title="Top Selling Items" items={metrics.topItems} />
        <ListBlock title="Top Waiters" items={metrics.topWaiters} money />
      </div>
    </div>
  );
}

function Card({ bgColor, title, value }) {
  return (
    <div className={`${bgColor} text-white rounded-lg shadow p-6`}>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-4xl font-bold">{value}</p>
    </div>
  );
}

function ListBlock({ title, items, money }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ul className="list-disc list-inside space-y-1">
        {items.map(({ id, name, salesCount, count }) => (
          <li key={id}>
            {name} -{" "}
            {money ? `$${salesCount}` : (salesCount ?? count ?? 0).toLocaleString()} sales
          </li>
        ))}
      </ul>
    </div>
  );
}
