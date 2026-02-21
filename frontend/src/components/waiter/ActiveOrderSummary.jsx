import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ActiveOrderSummary({
  selectedOrder,
  orderItems, // newly added items
  removeItem,
  onBack,
  onSave,
}) {
  // Only active items count toward original subtotal
  const originalItems = selectedOrder?.active_items || [];
  const voidedItems = selectedOrder?.voided_items || [];
  const newItems = orderItems || [];
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(null);

  // Subtotals
  const originalSubtotal = useMemo(
    () =>
      originalItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ).toFixed(2),
    [originalItems]
  );

  const newItemsSubtotal = useMemo(
    () =>
      newItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ).toFixed(2),
    [newItems]
  );

  const combinedTotal = (parseFloat(originalSubtotal) + parseFloat(newItemsSubtotal)).toFixed(2);

  const handleSave = async () => {
    try {
      await onSave();
      setShowSuccessModal(true);
      setShowErrorModal(null);
    } catch (err) {
      setShowSuccessModal(false);
      setShowErrorModal(err?.message || "Failed to save order changes.");
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden p-4">
        {/* Original Items */}
        <section className="flex-1 overflow-auto mr-4">
          <h3 className="text-xl font-semibold mb-3 dark:text-white">
            ከዚህ በፊት የታዘዘ (መቀየር አይቻልም)
          </h3>
          {originalItems.length + voidedItems.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">ከዚህ በፊት የታዘዘ የለም</p>
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
                      ${Number(item.price).toFixed(2)} × {item.quantity}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 font-semibold dark:text-white">የበፊት አጠቃላይ: ${originalSubtotal}</p>
        </section>

        {/* New Items (removable only) */}
        <section className="flex-1 overflow-auto ml-4">
          <h3 className="text-xl font-semibold mb-3 dark:text-white">
            ጭማሪ ትዕዛዝ (መቀየር ይቻላል)
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
                  <span className="truncate max-w-xs">{item.name} × {item.quantity}</span>
                  <button
                    className="bg-red-500 text-white text-xs px-2 rounded hover:bg-red-600"
                    onClick={() => removeItem(item.menu_item_id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 font-semibold dark:text-white">ጭማሪ አጠቃላይ: ${newItemsSubtotal}</p>
        </section>

        {/* Combined Total + Actions */}
        <section className="w-full md:w-60 flex flex-col justify-between mt-4 md:mt-0 ml-4">
          <p className="text-2xl font-bold dark:text-white mb-4">አጠቃላይ: ${combinedTotal}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              ← Back
            </Button>
            <Button className="flex-1" disabled={newItems.length === 0} onClick={handleSave}>
              ጭማሪ ዕዘዝ
            </Button>
          </div>
        </section>
      </div>

      {/* Modals */}
      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm text-center">
            <h2 className="text-xl font-semibold mb-4 text-green-600">✅ ትዕዛዙ ተሳክቷል!</h2>
            <p className="text-gray-600 dark:text-gray-300">ጭማሪው ትዕዛዝ ተልኳል!</p>
          </div>
        </div>
      )}
      {showErrorModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">❌ ችግር አለ እንደገና ይሞክሩ</h2>
            <p className="text-gray-600 dark:text-gray-300">{showErrorModal}</p>
          </div>
        </div>
      )}
    </>
  );
}
