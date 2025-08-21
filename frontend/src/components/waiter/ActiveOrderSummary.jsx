import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";

export default function ActiveOrderSummary({
  selectedOrder,
  orderItems, // newly added items
  removeItem,
  updateQuantity,
  onBack,
  onSave,
}) {
  const originalItems = selectedOrder?.items || [];
  const newItems = orderItems || [];

  // Calculate subtotals
  const originalSubtotal = useMemo(
    () =>
      originalItems
        .reduce(
          (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 0),
          0
        )
        .toFixed(2),
    [originalItems]
  );

  const newItemsSubtotal = useMemo(
    () =>
      newItems
        .reduce(
          (sum, item) =>
            sum + Number(item.price || 0) * Number(item.quantity || 0),
          0
        )
        .toFixed(2),
    [newItems]
  );

  const combinedTotal = (
    parseFloat(originalSubtotal) + parseFloat(newItemsSubtotal)
  ).toFixed(2);

  return (
    <div className="flex flex-col md:flex-row h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden p-4">
      {/* Original Items (read-only) */}
      <section className="flex-1 overflow-auto mr-4">
        <h3 className="text-xl font-semibold mb-3 dark:text-white">
          Original Order (Locked)
        </h3>
        {originalItems.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">
            No original items.
          </p>
        ) : (
          <ul className="space-y-2">
            {originalItems.map((item) => (
              <li
                key={`orig-${item.id}`}
                className="flex justify-between bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm text-gray-700 dark:text-white"
              >
                <span className="truncate max-w-xs">{item.name}</span>
                <span>
                  ${Number(item.price).toFixed(2)} × {item.quantity}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 font-semibold dark:text-white">
          Original Subtotal: ${originalSubtotal}
        </p>
      </section>

      {/* New Items (editable) */}
      <section className="flex-1 overflow-auto ml-4">
        <h3 className="text-xl font-semibold mb-3 dark:text-white">
          New Items (Editable)
        </h3>
        {newItems.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No new items added.</p>
        ) : (
          <ul className="space-y-2">
            {newItems.map((item) => (
              <li
                key={`new-${item.menu_item_id}`}
                className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm text-gray-700 dark:text-white"
              >
                <span className="truncate max-w-xs">{item.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    className="bg-gray-200 dark:bg-gray-600 text-black dark:text-white text-xs px-2 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                    onClick={() => updateQuantity(item.menu_item_id, -1)}
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{item.quantity}</span>
                  <button
                    className="bg-gray-200 dark:bg-gray-600 text-black dark:text-white text-xs px-2 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                    onClick={() => updateQuantity(item.menu_item_id, 1)}
                  >
                    +
                  </button>
                  <button
                    className="bg-red-500 text-white text-xs px-2 rounded hover:bg-red-600"
                    onClick={() => removeItem(item.menu_item_id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 font-semibold dark:text-white">
          New Items Subtotal: ${newItemsSubtotal}
        </p>
      </section>

      {/* Combined Total + Actions */}
      <section className="w-full md:w-60 flex flex-col justify-between mt-4 md:mt-0 ml-4">
        <p className="text-2xl font-bold dark:text-white mb-4">
          Total: ${combinedTotal}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack}>
            ← Back
          </Button>
          <Button
            className="flex-1"
            disabled={newItems.length === 0}
            onClick={onSave}
          >
            Submit New Items
          </Button>
        </div>
      </section>
    </div>
  );
}
