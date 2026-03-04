import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/apiError";

export default function ActiveOrderSummary({
  selectedOrder,
  orderItems,
  removeItem,
  onBack,
  onSave,
}) {
  const originalItems = useMemo(() => selectedOrder?.active_items || [], [selectedOrder]);
  const voidedItems = useMemo(() => selectedOrder?.voided_items || [], [selectedOrder]);
  const newItems = useMemo(() => orderItems || [], [orderItems]);
  const [saving, setSaving] = useState(false);

  const originalSubtotal = useMemo(
    () =>
      originalItems
        .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
        .toFixed(2),
    [originalItems]
  );

  const newItemsSubtotal = useMemo(
    () =>
      newItems
        .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
        .toFixed(2),
    [newItems]
  );

  const combinedTotal = (parseFloat(originalSubtotal) + parseFloat(newItemsSubtotal)).toFixed(2);

  const handleSave = async () => {
    if (saving || newItems.length === 0) return;
    setSaving(true);
    try {
      await onSave();
      toast.success("Additional items sent", { duration: 1800 });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save order changes."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden p-4">
      <section className="flex-1 overflow-auto mr-4">
        <h3 className="text-xl font-semibold mb-3 dark:text-white">
          Previously Ordered
        </h3>
        {originalItems.length + voidedItems.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No previous items.</p>
        ) : (
          <ul className="space-y-2">
            {[...originalItems, ...voidedItems].map((item) => {
              const isVoided = voidedItems.includes(item);
              return (
                <li
                  key={`orig-${item.id}`}
                  className={`flex justify-between bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm ${
                    isVoided
                      ? "bg-red-100 dark:bg-red-800/50 line-through text-gray-500 dark:text-gray-300"
                      : "text-gray-700 dark:text-white opacity-70 cursor-not-allowed"
                  }`}
                >
                  <span className="truncate max-w-xs">{item.name}</span>
                  <span>
                    ${Number(item.price).toFixed(2)} x {item.quantity}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 font-semibold dark:text-white">Original Total: ${originalSubtotal}</p>
      </section>

      <section className="flex-1 overflow-auto ml-4">
        <h3 className="text-xl font-semibold mb-3 dark:text-white">New Items</h3>
        {newItems.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No new items added.</p>
        ) : (
          <ul className="space-y-2">
            {newItems.map((item) => (
              <li
                key={`new-${item.menu_item_id}`}
                className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm text-gray-700 dark:text-white"
              >
                <span className="truncate max-w-xs">{item.name} x {item.quantity}</span>
                <button
                  className="bg-red-500 text-white text-xs px-2 rounded hover:bg-red-600"
                  onClick={() => removeItem(item.menu_item_id)}
                >
                  x
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 font-semibold dark:text-white">Added Total: ${newItemsSubtotal}</p>
      </section>

      <section className="w-full md:w-60 flex flex-col justify-between mt-4 md:mt-0 ml-4">
        <p className="text-2xl font-bold dark:text-white mb-4">Total: ${combinedTotal}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onBack} disabled={saving}>
            Back
          </Button>
          <Button className="flex-1" disabled={newItems.length === 0 || saving} onClick={handleSave}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </section>
    </div>
  );
}
