import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

import { fetchOrders } from "@/api/orders";
import { getUsers } from "@/api/users";
import { getSalesSummary } from "@/api/reportApi";

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("auth_token");

  useEffect(() => {
    if (!token) {
      setError("Authentication token missing.");
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);

        const allOrders = await fetchOrders(token);

        const openOrders = allOrders.filter(o => o.status === "open").length;
        const closedOrders = allOrders.filter(o => o.status === "closed").length;
        const paidOrders = allOrders.filter(o => o.status === "paid").length;

        const waiters = await getUsers("waiter", token);

        const waiterSalesMap = {};
        allOrders.forEach(order => {
          const waiterId = order.user_id || order.waiter_id || order.user?.id;
          if (waiterId) {
            waiterSalesMap[waiterId] = (waiterSalesMap[waiterId] || 0) + (parseFloat(order.total_amount) || 0);
          }
        });

        const topWaiters = waiters
          .map(waiter => {
            const id = waiter.id;
            const name = waiter.username || waiter.name || `Waiter #${id}`;
            const salesCount = waiterSalesMap[id] || 0;
            return { id, name, salesCount };
          })
          .filter(w => w.salesCount > 0)
          .sort((a, b) => b.salesCount - a.salesCount)
          .slice(0, 5);

        const todayStr = new Date().toISOString().slice(0, 10);
        const salesSummary = await getSalesSummary(todayStr, todayStr, null, null, token);
        const todayTotalSales = salesSummary?.grand_totals?.total_amount || 0;

        const itemSalesMap = {};
        allOrders.forEach(order => {
          order.items?.forEach(item => {
            const key = `${item.menu_item_id}-${item.name || ""}`;
            if (!itemSalesMap[key]) {
              itemSalesMap[key] = { id: item.menu_item_id, name: item.name, count: 0 };
            }
            itemSalesMap[key].count += item.quantity || 0;
          });
        });

        const topItems = Object.values(itemSalesMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setMetrics({
          openOrders,
          closedOrders,
          paidOrders,
          todayTotalSales,
          grandTotalSales: todayTotalSales,
          orderStatusData: [
            { status: "Open", count: openOrders },
            { status: "Closed", count: closedOrders },
            { status: "Paid", count: paidOrders },
          ],
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
  }, [token]);

  if (loading) return <p className="p-4">Loading dashboard...</p>;
  if (error) return <p className="p-4 text-red-600">{error}</p>;
  if (!metrics) return null;

  return (
    <div className="p-4 space-y-8 dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card bgColor="bg-indigo-700" title="Open Orders" value={metrics.openOrders} />
        <Card bgColor="bg-green-600" title="Closed Orders" value={metrics.closedOrders} />
        <Card bgColor="bg-blue-700" title="Paid Orders" value={metrics.paidOrders} />
      </div>

      {/* Sales Totals */}
      <div className="bg-yellow-500 text-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-2">Today's Total Sales</h3>
        <p className="text-5xl font-extrabold">${metrics.todayTotalSales.toLocaleString()}</p>
        <h4 className="mt-4 font-semibold">Grand Total Sales</h4>
        <p className="text-3xl">${metrics.grandTotalSales.toLocaleString()}</p>
      </div>

      {/* Order Status Bar Chart */}
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
        <ListBlock title="Top Waiters" items={metrics.topWaiters} />
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

function ListBlock({ title, items }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <ul className="list-disc list-inside space-y-1">
        {items.map(({ id, name, salesCount, count }) => (
          <li key={id}>
            {name} - {(salesCount ?? count ?? 0).toLocaleString()} sales
          </li>
        ))}
      </ul>
    </div>
  );
}
