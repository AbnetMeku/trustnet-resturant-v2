import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { getTables } from "@/api/tables";
import { toast } from "react-hot-toast";
import { getApiErrorMessage } from "@/lib/apiError";

export default function MyTables() {
  const { user, authToken } = useAuth();
  const [assignedTables, setAssignedTables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authToken || !user) return;

    const fetchAssignedTables = async () => {
      setLoading(true);
      try {
        const myTables = await getTables(authToken);
        setAssignedTables(myTables);
      } catch (err) {
        console.error("Failed to load assigned tables:", err);
        toast.error(getApiErrorMessage(err, "Failed to load your assigned tables."));
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedTables();
  }, [authToken, user]);

  return (
    <div
      className="p-4 md:p-6 dark:bg-gray-900 min-h-[70vh] text-gray-900 dark:text-gray-100"
      data-testid="waiter-tables-view"
    >
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-center">ጠረጴዛዎች</h1>

      {loading ? (
        <div className="text-center text-lg">የተመደቡ ጠረጴዛዎች በመጫን ላይ...</div>
      ) : assignedTables.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">ምንም ጠረጴዛ አልተመደበም</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {assignedTables.map((table) => (
            <Card
              key={table.id}
              className="relative transform hover:scale-105 transition-all duration-300 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-3 bg-gray-300 dark:bg-gray-800"
            >
              {table.is_vip && (
                <div className="absolute top-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 text-white px-2 py-1 text-xs font-bold rounded-br-lg animate-pulse z-10">
                  VIP
                </div>
              )}

              <div
                className={`absolute top-2 right-2 px-3 py-1 text-xs font-semibold rounded-full text-white ${
                  table.status === "available"
                    ? "bg-green-500 animate-pulse"
                    : table.status === "occupied"
                    ? "bg-red-500"
                    : "bg-yellow-500"
                }`}
              >
                {table.status.toUpperCase()}
              </div>

              <CardHeader>
                <CardTitle className="text-xl font-bold text-center truncate">Table {table.number}</CardTitle>
              </CardHeader>

              <CardContent className="pt-2 flex flex-col gap-2">
                <p className="text-sm font-medium">የተመደበ አስተናጋጅ</p>
                <div className="flex flex-wrap gap-1">
                  {table.waiters.length ? (
                    table.waiters.map((w) => (
                      <span
                        key={w.id}
                        className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full truncate hover:bg-indigo-600 transition"
                      >
                        {w.username}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">None</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

