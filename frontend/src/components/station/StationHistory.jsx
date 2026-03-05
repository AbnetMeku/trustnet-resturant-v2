import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { fetchReadyOrdersHistory } from "@/api/kds";
import { eatBusinessDateISO, formatEatDateTime } from "@/lib/timezone";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

export default function StationHistory() {
  const { stationToken, logoutStation } = useAuth();
  const navigate = useNavigate();

  const today = eatBusinessDateISO();
  const [orders, setOrders] = useState([]);
  const [filterWaiter, setFilterWaiter] = useState("");
  const [filterTableNumber, setFilterTableNumber] = useState("");
  const [filterDate, setFilterDate] = useState(today);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleStationSessionExpired = useCallback(() => {
    logoutStation();
    navigate("/station-login");
  }, [logoutStation, navigate]);

  const fetchOrders = useCallback(
    async ({ silent = false } = {}) => {
      if (!stationToken) return;
      try {
        if (silent) setIsRefreshing(true);
        else setIsLoading(true);

        const filters = {};
        if (filterWaiter) filters.waiter_id = Number(filterWaiter);
        if (filterTableNumber) filters.table_number = Number(filterTableNumber);
        if (filterDate) filters.date = filterDate;

        const res = await fetchReadyOrdersHistory(stationToken, filters);

        res.sort((a, b) => {
          const latestA = a.items?.[0]?.created_at || a.order_updated_at || a.order_created_at;
          const latestB = b.items?.[0]?.created_at || b.order_updated_at || b.order_created_at;
          return new Date(latestB).getTime() - new Date(latestA).getTime();
        });

        setOrders(res);
      } catch (err) {
        if (err?.response?.status === 401 || err?.response?.status === 422) {
          toast.error("Session expired. Please login again.");
          handleStationSessionExpired();
          return;
        }
        console.error("Failed to fetch ready orders:", err);
        toast.error(getApiErrorMessage(err, "Failed to load KDS history."));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [stationToken, filterWaiter, filterTableNumber, filterDate, handleStationSessionExpired]
  );

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => fetchOrders({ silent: true }), 6000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const historyOrders = useMemo(
    () =>
      orders
        .map((order) => ({
          ...order,
          items: (order.items || []).filter(
            (item) => item.status === "ready" || item.status === "void"
          ),
        }))
        .filter((order) => order.items.length > 0),
    [orders]
  );

  const readyOrders = useMemo(
    () =>
      historyOrders
        .map((order) => ({
          ...order,
          items: order.items.filter((item) => item.status === "ready"),
        }))
        .filter((order) => order.items.length > 0),
    [historyOrders]
  );

  const waiters = useMemo(() => {
    const waitersMap = new Map();
    orders.forEach((o) => {
      if (o.waiter_id && !waitersMap.has(o.waiter_id)) {
        waitersMap.set(o.waiter_id, o.waiter_name);
      }
    });
    return Array.from(waitersMap, ([id, name]) => ({ id, name }));
  }, [orders]);

  const totalOrders = readyOrders.length;
  const totalItems = readyOrders.reduce(
    (sum, order) => sum + order.items.reduce((s, i) => s + i.quantity, 0),
    0
  );
  const totalSales = readyOrders.reduce(
    (sum, order) => sum + order.items.reduce((s, i) => s + i.price * i.quantity, 0),
    0
  );

  const aggregatedItemsArray = useMemo(() => {
    const aggregatedItems = readyOrders.flatMap((o) => o.items).reduce((acc, item) => {
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

    return Object.values(aggregatedItems);
  }, [readyOrders]);

  return (
    <div className="h-full p-4">
      <div className="flex gap-3 mb-6 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Waiter</label>
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
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Table</label>
          <input
            type="number"
            min="1"
            value={filterTableNumber}
            onChange={(e) => setFilterTableNumber(e.target.value)}
            placeholder="All"
            className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 w-28"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="p-2 rounded-lg border text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 w-52"
            max={today}
          />
        </div>

        <button
          type="button"
          onClick={() => fetchOrders()}
          className="px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Refresh
        </button>

        {isRefreshing && <span className="text-xs text-gray-500 dark:text-gray-400">Refreshing...</span>}
      </div>

      {isLoading ? (
        <p className="text-center mt-10 text-gray-500 dark:text-gray-400">Loading history...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
              <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ትዕዛዝ</p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalOrders}</h2>
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalItems}</h2>
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
              <p className="text-gray-600 dark:text-gray-300">አጠቃላይ ሽይጭ</p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">${totalSales.toFixed(2)}</h2>
            </div>
          </div>

          {historyOrders.length === 0 ? (
            <p className="text-center mt-10 text-gray-500 dark:text-gray-400">የተዘጋባ እቃዎች የሉም</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {historyOrders.map((order) => (
                <div key={order.order_id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        ትዕዛዝ #{order.order_id}
                      </h2>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        አስተናጋጅ: {order.waiter_name || "N/A"}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        ተዘጋጅቷል:{" "}
                        {formatEatDateTime(
                          order.items?.[0]?.created_at || order.order_updated_at || order.order_created_at
                        )}
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
                        className={`flex justify-between items-center p-3 rounded-lg ${
                          item.status === "ready"
                            ? "bg-green-100 dark:bg-green-700"
                            : "bg-red-100 dark:bg-red-400"
                        }`}
                      >
                        <div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span> x
                          {item.quantity}
                          <span className="text-sm text-gray-700 dark:text-gray-300 ml-2">
                            ({formatEatDateTime(item.created_at)})
                          </span>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${
                            item.status === "ready" ? "bg-green-500" : "bg-red-500"
                          }`}
                        >
                          {item.status === "ready" ? "ወቷል" : "ተሰርዟል"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showItemsModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl w-full max-w-lg overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">አጠቃላይ የተሸጡ እቃዎች</h3>
              <button className="text-red-500 font-bold" onClick={() => setShowItemsModal(false)}>
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
