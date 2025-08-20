import React from "react";
import { Button } from "@/components/ui/button";

export default function OrderSummary({
  selectedTable,
  orderItems = [],
  removeItem,
  onPlaceOrder,
  onBack,
  setError,
}) {
  // Calculate total using price (backend handles vip_price)
  const total = orderItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);

  return (
    <div className="flex flex-col h-full p-4 bg-gray-50 dark:bg-gray-700 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Order Summary</h2>

      {selectedTable && (
        <p className="mb-4">
          <strong>Table:</strong> {selectedTable.name}
          {selectedTable.is_vip && <span className="ml-2 text-yellow-500"> (VIP)</span>}
        </p>
      )}

      {(!orderItems || orderItems.length === 0) ? (
        <p className="text-gray-500">No items in the order.</p>
      ) : (
        <div className="flex-1 overflow-y-auto mb-4">
          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-200 dark:bg-gray-600">
                <th className="px-2 py-1 text-left">Item</th>
                <th className="px-2 py-1 text-center">Qty</th>
                <th className="px-2 py-1 text-left">Notes</th>
                <th className="px-2 py-1 text-right">Price</th>
                <th className="px-2 py-1 text-right">Subtotal</th>
                <th className="px-2 py-1 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item) => (
                <tr key={item.id} className="border-b border-gray-300 dark:border-gray-600">
                  <td className="px-2 py-1">{item.name}</td>
                  <td className="px-2 py-1 text-center">{item.quantity}</td>
                  <td className="px-2 py-1">{item.notes || "None"}</td>
                  <td className="px-2 py-1 text-right">${(item.price || 0).toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${((item.price || 0) * item.quantity).toFixed(2)}</td>
                  <td className="px-2 py-1 text-center">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name} from order`}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-4">
        <strong>Total: ${total.toFixed(2)}</strong>
      </div>

      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={onBack}
          aria-label="Go back to menu selection"
        >
          Back
        </Button>
        <Button
          variant="default"
          onClick={onPlaceOrder}
          disabled={!orderItems || orderItems.length === 0}
          aria-label="Place order"
        >
          Place Order
        </Button>
      </div>
    </div>
  );
}