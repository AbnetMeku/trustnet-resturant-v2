import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrders } from "@/api/orders";
import { getUsers } from "@/api/users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OpenOrders() {
  const { authToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [waiters, setWaiters] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTable, setFilterTable] = useState("");

  // Fetch waiters
  useEffect(() => {
    async function loadWaiters() {
      try {
        const data = await getUsers("waiter");
        setWaiters([{ id: "", username: "All Waiters" }, ...data]);
      } catch {
        setWaiters([{ id: "", username: "All Waiters" }]);
      }
    }
    loadWaiters();
  }, []);

  // Fetch all open orders
  useEffect(() => {
    if (!authToken) return;

    const loadOrders = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders(authToken, { status: "open" });
        setOrders(data);
      } catch (err) {
        console.error("Failed to load open orders:", err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [authToken]);

  // Apply filters
  const filteredOrders = orders.filter((order) => {
    return (
      (filterWaiter ? order.user?.id?.toString() === filterWaiter : true) &&
      (filterTable ? order.table.number.toString().includes(filterTable) : true)
    );
  });

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">
        እየተሰሩ ያሉ ትዕዛዞች (Open Orders)
      </h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-400"
          value={filterWaiter}
          onChange={(e) => setFilterWaiter(e.target.value)}
        >
          {waiters.map((w) => (
            <option key={w.id} value={w.id}>
              {w.username}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filter by table"
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-400"
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
        />
      </div>

      {/* Orders Grid */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No open orders available.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const totalItemsCount =
              (order.active_items?.length || 0) +
              (order.voided_items?.length || 0);
            return (
              <Card
                key={order.id}
                className="shadow-sm rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all flex flex-col justify-between bg-gray-50 dark:bg-gray-800"
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">
                      Table {order.table.number}
                    </h3>
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                      ID: {order.id}
                    </span>
                  </div>

                  <p className="text-gray-700 dark:text-gray-300 mb-1">
                    Total:{" "}
                    <span className="font-semibold">
                      ${order.total_amount.toFixed(2)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Items: {totalItemsCount}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Waiter: {order.user?.username || "—"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Time: {new Date(order.created_at).toLocaleTimeString()}
                  </p>

                  <span className="inline-block px-2 py-1 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-medium">
                    🟢 Open
                  </span>
                </div>

                <Button
                  variant="outline"
                  className="text-gray-800 dark:text-gray-100 border-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 mt-4"
                  onClick={() => setSelectedOrder(order)}
                >
                  More Details
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal for selected order */}
{selectedOrder && (
  <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 w-11/12 max-w-lg">
      <h3 className="text-xl font-bold mb-4">
        Table {selectedOrder.table?.number || "N/A"} - ትዕዛዝ #{selectedOrder.id}
      </h3>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b dark:border-gray-600">
              <th className="pb-2">ትዕዛዝ</th>
              <th className="pb-2">ብዛት</th>
              <th className="pb-2">ዋጋ</th>
              <th className="pb-2">አጠቃላይ ዋጋ</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...(selectedOrder.active_items || []),
              ...(selectedOrder.voided_items || []),
            ].map((item) => {
              const isVoided = item.status.includes("void");
              return (
                <tr
                  key={item.id}
                  className={`border-b dark:border-gray-700 ${
                    isVoided
                      ? "bg-red-100 dark:bg-red-800/50 line-through text-gray-500 dark:text-gray-300"
                      : ""
                  }`}
                >
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td>${item.price.toFixed(2)}</td>
                  <td>${(item.price * item.quantity).toFixed(2)}</td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 font-bold text-right">
        አጠቃላይ: $
        {[...(selectedOrder.active_items || [])]
          .reduce((sum, i) => sum + i.price * i.quantity, 0)
          .toFixed(2)}
      </p>
      <div className="flex justify-end mt-4">
        <Button onClick={() => setSelectedOrder(null)}>ዝጋ</Button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
