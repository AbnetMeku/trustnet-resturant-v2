import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchReadyOrdersHistory } from "@/api/kds";

export default function StationHistory() {
  const { stationToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterTable, setFilterTable] = useState("");
  const [showItemsModal, setShowItemsModal] = useState(false);

  const fetchOrders = async () => {
    if (!stationToken) return;
    try {
      const res = await fetchReadyOrdersHistory(stationToken);
      res.sort(
        (a, b) =>
          new Date(a.order_updated_at).getTime() -
          new Date(b.order_updated_at).getTime()
      );
      setOrders(res);
    } catch (err) {
      console.error("Failed to fetch ready orders:", err);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 6000);
    return () => clearInterval(interval);
  }, [stationToken]);

  // Filter orders with ready items
  const readyOrders = orders
    .map((order) => ({
      ...order,
      items: order.items.filter((item) => item.status === "ready"),
    }))
    .filter((order) => order.items.length > 0)
    .filter((order) =>
      filterWaiter ? order.waiter_id.toString() === filterWaiter : true
    )
    .filter((order) =>
      filterTable ? order.table_number?.toString() === filterTable : true
    )
    .filter((order) =>
      filterDate
        ? new Date(order.order_updated_at).toISOString().startsWith(filterDate)
        : true
    );

  // Unique waiters and tables
  const waitersMap = new Map();
  orders.forEach((o) => {
    if (!waitersMap.has(o.waiter_id)) waitersMap.set(o.waiter_id, o.waiter_name);
  });
  const waiters = Array.from(waitersMap, ([id, name]) => ({ id, name }));

  const tablesSet = new Set();
  orders.forEach((o) => {
    if (o.table_number) tablesSet.add(o.table_number);
  });
  const tables = Array.from(tablesSet);

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

  // Aggregate items by name properly with subtotal
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
            <option key={w.id} value={w.id.toString()}>
              {w.name || "N/A"}
            </option>
          ))}
        </select>

        <select
          value={filterTable}
          onChange={(e) => setFilterTable(e.target.value)}
          className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
        >
          <option value="">All Tables</option>
          {tables.map((t) => (
            <option key={t} value={t.toString()}>
              {t}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex flex-col justify-between">
          <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ትዕዛዝ</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalOrders}</h2>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex flex-col justify-between">
          <p className="text-gray-600 dark:text-gray-300 flex justify-between items-center">
            አጠቃላይ የተሸጡ
            <button
              className="text-blue-500 text-sm underline ml-2"
              onClick={() => setShowItemsModal(true)}
            >
              ሙሉ ዝርዝር
            </button>
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalItems}</h2>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow flex flex-col justify-between">
          <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ሽይጭ</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ${totalSales.toFixed(2)}
          </h2>
        </div>
      </div>

      {readyOrders.length === 0 && (
        <p className="text-center mt-10 text-gray-500 dark:text-gray-400">
          የተዘጋባ እቃዎች የሉም
        </p>
      )}

      {/* Orders */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {readyOrders.map((order) => (
          <div
            key={order.order_id}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 flex flex-col space-y-4 transform hover:scale-[1.02] transition-transform duration-200"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ትዕዛዝ #{order.order_id}
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  ጠረጴዛ ቁጥር: {order.table_number || "N/A"} | አስተናጋጅ: {order.waiter_name || "N/A"}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  ዝግጅት ሰዓት:{" "}
                  {new Date(order.order_updated_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-gray-900 dark:text-gray-100 font-semibold bg-gray-100 dark:bg-gray-700 text-sm">
                {order.items.length} ትዕዛዝ
              </span>
            </div>

            <ul className="flex flex-col space-y-3">
              {order.items.map((item) => (
                <li
                  key={`${order.order_id}-${item.item_id}`}
                  className="flex justify-between items-center bg-green-100 dark:bg-green-700 p-4 rounded-lg shadow-sm"
                >
                  <div>
                    <span className="font-medium text-lg text-gray-900 dark:text-gray-100">
                      {item.name}
                    </span>{" "}
                    x{item.quantity}
                    {item.notes && (
                      <em className="text-xs ml-1 text-gray-700 dark:text-gray-300">
                        ({item.notes})
                      </em>
                    )}
                  </div>
                  <span className="px-4 py-2 rounded-full font-semibold text-white bg-green-500">
                    ወቷል
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Aggregated Items Modal */}
      {showItemsModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg w-full max-w-lg p-6 overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                አጠቃላይ የተሸጡ አይነቶች
              </h3>
              <button
                className="text-red-500 font-bold"
                onClick={() => setShowItemsModal(false)}
              >
                X
              </button>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 text-gray-700 dark:text-gray-300">ትዕዛዝ</th>
                  <th className="py-2 text-gray-700 dark:text-gray-300">ብዛት</th>
                  <th className="py-2 text-gray-700 dark:text-gray-300">አጠቃላይ ዋጋ</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedItemsArray.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="py-2 text-gray-900 dark:text-gray-100">{item.name}</td>
                    <td className="py-2 text-gray-900 dark:text-gray-100">{item.totalQuantity}</td>
                    <td className="py-2 text-gray-900 dark:text-gray-100">
                      ${item.subtotal.toFixed(2)}
                    </td>
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
