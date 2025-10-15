import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchReadyOrdersHistory } from "@/api/kds";

export default function StationHistory() {
  const { stationToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterDate, setFilterDate] = useState(""); // Date as string (YYYY-MM-DD or empty)
  const [showItemsModal, setShowItemsModal] = useState(false);

  // Fetch orders with filters
  const fetchOrders = async () => {
    if (!stationToken) return;
    try {
      const filters = {};
      if (filterWaiter) filters.waiter_id = filterWaiter;
      if (filterDate) filters.date = filterDate; // Send date as YYYY-MM-DD

      const res = await fetchReadyOrdersHistory(stationToken, filters);
      // Sort orders by the most recent item.created_at in descending order
      res.sort((a, b) => {
        const latestItemA = a.items.reduce((latest, item) =>
          new Date(item.created_at) > new Date(latest.created_at) ? item : latest
        );
        const latestItemB = b.items.reduce((latest, item) =>
          new Date(item.created_at) > new Date(latest.created_at) ? item : latest
        );
        return new Date(latestItemB.created_at).getTime() - new Date(latestItemA.created_at).getTime();
      });
      setOrders(res);
    } catch (err) {
      console.error("Failed to fetch ready orders:", err);
    }
  };

  // Re-fetch when filters or token change
  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [stationToken, filterWaiter, filterDate]);

  // Ready orders only
  const readyOrders = orders
    .map((order) => ({
      ...order,
      items: order.items.filter((item) => item.status === "ready"),
    }))
    .filter((order) => order.items.length > 0);

  // Unique waiter list
  const waitersMap = new Map();
  orders.forEach((o) => {
    if (o.waiter_id && !waitersMap.has(o.waiter_id))
      waitersMap.set(o.waiter_id, o.waiter_name);
  });
  const waiters = Array.from(waitersMap, ([id, name]) => ({ id, name }));

  // Stats
  const totalOrders = readyOrders.length;
  const totalItems = readyOrders.reduce(
    (sum, order) => sum + order.items.reduce((s, i) => s + i.quantity, 0),
    0
  );
  const totalSales = readyOrders.reduce(
    (sum, order) => sum + order.items.reduce((s, i) => s + i.price * i.quantity, 0),
    0
  );

  // Aggregate sold items for modal
  const aggregatedItems = readyOrders
    .flatMap((o) => o.items)
    .reduce((acc, item) => {
      if (!acc[item.name]) {
        acc[item.name] = {
          name: item.name,
          totalQuantity: item.quantity,
          subtotal: (item.price || 0) * item.quantity,
        };
      } else {
        acc[item.name].totalQuantity += item.quantity;
        acc[item.name].subtotal += (item.price || 0) * item.quantity;
      }
      return acc;
    }, {});
  const aggregatedItemsArray = Object.values(aggregatedItems);

  return (
    <div className="overflow-y-auto h-screen p-4">
      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <select
          value={filterWaiter}
          onChange={(e) => setFilterWaiter(e.target.value)}
          className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
        >
          <option value="">All Waiters</option>
          {waiters.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name || "N/A"}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          placeholder="Select Date (or leave blank for all)"
          className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 w-64"
          max={new Date().toISOString().slice(0, 10)} // Prevent future dates
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ትዕዛዝ</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {totalOrders}
          </h2>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-600 dark:text-gray-300 flex justify-between items-center">
            አጠቃላይ የተሸጡ
            <button
              className="text-blue-500 text-sm underline ml-2"
              onClick={() => setShowItemsModal(true)}
            >
              ሙሉ ዝርዝር
            </button>
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {totalItems}
          </h2>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
          <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ሽይጭ</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ${totalSales.toFixed(2)}
          </h2>
        </div>
      </div>

      {/* Orders */}
      {readyOrders.length === 0 ? (
        <p className="text-center mt-10 text-gray-500 dark:text-gray-400">
          የተዘጋባ እቃዎች የሉም
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {readyOrders.map((order) => (
            <div
              key={order.order_id}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6"
            >
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    ትዕዛዝ #{order.order_id}
                  </h2>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    አስተናጋጅ: {order.waiter_name || "N/A"}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    ተዘጋጅቷል: {new Date(order.items.reduce((latest, item) =>
                      new Date(item.created_at) > new Date(latest.created_at) ? item : latest
                    ).created_at).toLocaleString()}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {order.items.length} እቃ
                </span>
              </div>
              <ul className="space-y-2">
                {order.items.map((item) => (
                  <li
                    key={`${order.order_id}-${item.item_id}`}
                    className="flex justify-between items-center bg-green-100 dark:bg-green-700 p-3 rounded-lg"
                  >
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>{" "}
                      ×{item.quantity}
                      <span className="text-sm text-gray-700 dark:text-gray-300 ml-2">
                        ({new Date(item.created_at).toLocaleString()})
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-full text-white bg-green-500 text-sm font-semibold">
                      ወቷል
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Aggregated Items Modal */}
      {showItemsModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl w-full max-w-lg overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                አጠቃላይ የተሸጡ እቃዎች
              </h3>
              <button
                className="text-red-500 font-bold"
                onClick={() => setShowItemsModal(false)}
              >
                ✕
              </button>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2">እቃ</th>
                  <th className="py-2">ብዛት</th>
                  <th className="py-2">አጠቃላይ ዋጋ</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedItemsArray.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2">{item.totalQuantity}</td>
                    <td className="py-2">${item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}