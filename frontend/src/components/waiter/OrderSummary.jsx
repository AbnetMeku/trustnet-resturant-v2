import React from "react";
import { Button } from "@/components/ui/button";

export default function OrderSummary({
  selectedTable,
  orderItems = [],
  removeItem,
  onPlaceOrder,
  onBack,
  disabled = false,
}) {
  const total = orderItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);

  return (
    <div className="flex flex-col h-full p-4 bg-gray-50 dark:bg-gray-700 rounded-xl shadow-md border border-slate-200/70 dark:border-slate-700">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">ጠቅላላ ትዕዛዝ</h2>
        <Button variant="outline" size="sm" onClick={onBack}>
          {"\u2190"} ተመለስ
        </Button>
      </div>

      {selectedTable && (
        <p className="mb-4">
          <strong>Table:</strong> {selectedTable.number}
          {selectedTable.is_vip && <span className="ml-2 text-yellow-500"> (VIP)</span>}
        </p>
      )}

      {orderItems.length === 0 ? (
        <p className="text-gray-500">ምንም እቃ አልተመረጠም።</p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {orderItems.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-600 dark:bg-gray-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {item.notes || "ምንም"}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => removeItem(item.id)}>
                    ቀንስ
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-300">
                  <span>ብዛት: {item.quantity}</span>
                  <span>ዋጋ: ${(item.price || 0).toFixed(2)}</span>
                  <span>አጠቃላይ: ${((item.price || 0) * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block flex-1 overflow-auto mb-4 rounded-lg border border-slate-200 dark:border-slate-600">
            <table className="min-w-[640px] w-full table-auto border-collapse">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-600">
                  <th className="px-2 py-1 text-left">ትዕዛዝ</th>
                  <th className="px-2 py-1 text-center">ብዛት</th>
                  <th className="px-2 py-1 text-left">ማስታወሻ</th>
                  <th className="px-2 py-1 text-right">ዋጋ</th>
                  <th className="px-2 py-1 text-right">አጠቃላይ ዋጋ</th>
                  <th className="px-2 py-1 text-center">ቀንስ</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-300 dark:border-gray-600">
                    <td className="px-2 py-1">{item.name}</td>
                    <td className="px-2 py-1 text-center">{item.quantity}</td>
                    <td className="px-2 py-1">{item.notes || "ምንም"}</td>
                    <td className="px-2 py-1 text-right">${(item.price || 0).toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">
                      ${((item.price || 0) * item.quantity).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <Button variant="destructive" size="sm" onClick={() => removeItem(item.id)}>
                        ቀንስ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-between items-center mt-4">
        <strong>ጠቅላላ ድምር: ${total.toFixed(2)}</strong>
      </div>

      <div className="mt-6">
        <Button
          className="w-full"
          variant="default"
          disabled={orderItems.length === 0 || disabled}
          onClick={onPlaceOrder}
        >
          እዘዝ
        </Button>
      </div>
    </div>
  );
}
