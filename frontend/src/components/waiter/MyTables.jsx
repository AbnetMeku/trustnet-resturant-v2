import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { getUsers } from "@/api/users";
import { getTables } from "@/api/tables";
import { toast } from "react-hot-toast";

export default function MyTables() {
  const { user, authToken } = useAuth(); // assumes you have user context with user info and token
  const [assignedTables, setAssignedTables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authToken || !user) return;

    const fetchAssignedTables = async () => {
      setLoading(true);
      try {
        // First fetch waiter user info with assigned tables if needed (or use current user directly)
        // Option 1: Use current user id to filter tables assigned to this waiter
        const allTables = await getTables();

        // Filter tables assigned to user (waiter)
        const myTables = allTables.filter(table =>
          table.waiters.some(w => w.id === user.id)
        );

        setAssignedTables(myTables);
      } catch (err) {
        console.error("Failed to load assigned tables:", err);
        toast.error("Failed to load your tables");
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedTables();
  }, [authToken, user]);

  return (
    <div className="p-4 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-4">My Tables</h1>

      {loading ? (
        <div>Loading your assigned tables...</div>
      ) : assignedTables.length === 0 ? (
        <p>You have no assigned tables.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assignedTables.map(table => (
            <Card
              key={table.id}
              className="relative transform hover:scale-105 hover:shadow-2xl hover:-rotate-1 transition-all duration-300 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-2 flex flex-col justify-between"
            >
              {/* VIP Ribbon */}
              {table.is_vip && (
                <div className="absolute top-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 text-white px-2 py-1 text-xs font-bold rounded-br-lg z-10 animate-pulse">
                  VIP
                </div>
              )}
              {/* Status Badge */}
              <div
                className={`absolute top-2 right-2 px-2 py-1 text-xs font-semibold rounded ${
                  table.status === "available"
                    ? "bg-green-500 animate-pulse"
                    : table.status === "occupied"
                    ? "bg-red-500"
                    : "bg-yellow-500"
                } text-white`}
              >
                {table.status}
              </div>
              <CardHeader>
                <CardTitle className="text-lg font-bold text-center py-2 truncate">
                  Table {table.number}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-1">
                <p className="text-sm font-medium">Waiters:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {table.waiters.length ? (
                    table.waiters.map(w => (
                      <span
                        key={w.id}
                        className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full truncate"
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
