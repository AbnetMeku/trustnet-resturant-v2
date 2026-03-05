import React, { useEffect, useState } from "react";
import { getTables } from "@/api/tables";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "../../context/AuthContext";

export default function TableSelection({ selectedTable, setSelectedTable, onNext, onBack, setError }) {
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoading(true);
        const allTables = await getTables();
        const validTables = allTables.filter(
          (table) =>
            table &&
            Number.isInteger(table.id) &&
            table.number &&
            ["available", "occupied", "reserved"].includes(table.status) &&
            typeof table.is_vip === "boolean" &&
            Array.isArray(table.waiters)
        );

        const waiterTables = validTables.filter((t) => t.status === "available");
        setTables(waiterTables);
        setLocalError(null);
        setError("");
      } catch (err) {
        const errorMessage = err.message || "Failed to load tables.";
        setLocalError(errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) fetchTables();
    else {
      const errorMessage = "User not authenticated.";
      setLocalError(errorMessage);
      setError(errorMessage);
    }
  }, [user, setError]);

  const handleSelect = (table) => {
    setSelectedTable(table);
    setLocalError("");
    setError("");
    onNext(table);
  };

  if (!user?.id) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>???? ????? ???? ???????</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          ?? ??? ????
        </Button>
      </div>
    );
  }

  if (loading) {
    return <p className="text-center py-10">?????? ???? ??...</p>;
  }

  if (localError) {
    return (
      <div className="p-4 text-center text-red-600">
        <p>{localError}</p>
        <Button onClick={() => window.location.reload()} className="mt-4">
          ????? ???
        </Button>
      </div>
    );
  }

  if (!tables.length) {
    return (
      <div className="p-4 text-center">
        <p>????? ??????? ???? ????</p>
        <Button variant="outline" onClick={onBack}>
          ?? ??? ????
        </Button>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">???? ????</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">??? ???? ??? ???? ????</p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          {"\u2190"} ????
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 overflow-auto flex-grow">
        {tables.map((table) => {
          const isSelected = selectedTable?.id === table.id;
          return (
            <Card
              key={table.id}
              onClick={() => handleSelect(table)}
              tabIndex={0}
              role="button"
              aria-label={`Select Table ${table.number}${table.is_vip ? ", VIP" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(table);
                }
              }}
              className={`cursor-pointer relative rounded-lg border shadow-sm transition p-4 flex items-center justify-center select-none
                ${
                  isSelected
                    ? "border-blue-500 shadow-lg bg-blue-100 dark:bg-blue-700"
                    : "border-gray-300 hover:shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              style={{ minHeight: "110px", aspectRatio: "1 / 1" }}
            >
              {table.is_vip && (
                <div className="absolute top-0 left-0 bg-gradient-to-r from-yellow-400 via-pink-500 to-red-500 text-white px-2 py-0.5 text-xs font-bold rounded-br-lg animate-pulse z-10">
                  VIP
                </div>
              )}

              <div
                className={`absolute top-0 right-0 mt-2 mr-2 px-2 py-1 text-xs font-semibold rounded
                ${
                  table.status === "available"
                    ? "bg-green-500 animate-pulse"
                    : table.status === "occupied"
                      ? "bg-red-600"
                      : "bg-yellow-500"
                } text-white z-10`}
              >
                {table.status}
              </div>

              <div className="flex flex-col items-center">
                <h3 className="text-lg font-bold text-center truncate">{table.number}</h3>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
