import React, { useEffect, useState, useMemo, useRef } from "react";
import { getCategories } from "@/api/categories";
import { getSubcategories } from "@/api/subcategories";
import { getMenuItems } from "@/api/menu_item";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function MenuSelection({
  selectedTable,
  orderItems,
  addItem,
  removeItem,
  updateQuantity,
  onBack,
  onNext,
}) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const isAdding = useRef(false); // Prevent double clicks

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const cats = await getCategories();
        setCategories(cats);
      } catch (err) {
        console.error("Failed to load categories:", err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch subcategories
  useEffect(() => {
    const fetchSubcategories = async () => {
      try {
        const subs = await getSubcategories();
        setSubcategories(
          selectedCategory
            ? subs.filter((sub) => sub.category_id === selectedCategory)
            : subs
        );
      } catch (err) {
        console.error("Failed to load subcategories:", err);
        setSubcategories([]);
      }
    };
    fetchSubcategories();
    setSelectedSubcategory(null);
  }, [selectedCategory]);

  // Fetch menu items
  useEffect(() => {
    const fetchMenuItems = async () => {
      if (categories.length === 0 || subcategories.length === 0) return;
      try {
        setLoading(true);
        const items = await getMenuItems({});
        const updatedItems = items.map((item) => {
          const category = categories.find((c) => c.id === item.category_id) || {};
          const subcategory = subcategories.find((s) => s.id === item.subcategory_id) || {};
          const categoryName = (category.name || "Unknown").trim();
          const subcategoryName = (subcategory.name || "Unknown").trim();
          const increment =
            categoryName.toLowerCase() === "alcohols" || subcategoryName.toLowerCase() === "butchery"
              ? 0.5
              : 1;

          const price = Number(
            selectedTable?.is_vip && item.vip_price != null ? item.vip_price : item.price
          ) || 0;

          return {
            ...item,
            category_name: categoryName,
            subcategory_name: subcategoryName,
            price,
            increment,
          };
        });
        setMenuItems(updatedItems);
      } catch (err) {
        console.error("Failed to load menu items:", err);
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMenuItems();
  }, [categories, subcategories, selectedTable]);

  // Memoized filtered items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const categoryMatch = !selectedCategory || item.category_id === selectedCategory;
      const subcategoryMatch = !selectedSubcategory || item.subcategory_id === selectedSubcategory;
      const searchMatch =
        !searchTerm ||
        (item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description?.toLowerCase().includes(searchTerm.toLowerCase()));
      return categoryMatch && subcategoryMatch && searchMatch;
    });
  }, [menuItems, selectedCategory, selectedSubcategory, searchTerm]);

  // Memoized subtotal
  const subtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0).toFixed(2);
  }, [orderItems]);

  // Handle add item with double-click prevention
  const handleAddItem = (item, e) => {
    e.stopPropagation();
    if (isAdding.current) return;
    isAdding.current = true;
    addItem(item);
    setTimeout(() => {
      isAdding.current = false;
    }, 300);
  };

  // Handle quantity update with double-click prevention
  const handleUpdateQuantity = (itemId, delta, e) => {
    e.stopPropagation();
    if (isAdding.current) return;
    isAdding.current = true;
    updateQuantity(itemId, delta);
    setTimeout(() => {
      isAdding.current = false;
    }, 300);
  };

  // Check if item is in cart
  const getItemQuantity = (itemId) => {
    const item = orderItems.find((i) => i.id === itemId);
    return item ? item.quantity : 0;
  };

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  return (
   <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden relative">
  {/* Categories Top Navbar */}
  <nav className="flex justify-between items-center overflow-x-auto no-scrollbar p-2 border-b border-gray-200 dark:border-gray-700">
  {/* Categories scrollable section */}
  <div className="flex space-x-2">
    {categories.map((cat) => (
      <button
        key={cat.id}
        onClick={() =>
          setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
        }
        className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition ${
          selectedCategory === cat.id
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
        }`}
      >
        {cat.name}
      </button>
    ))}
  </div>

  {/* Back Button */}
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      // Clear cart items
      orderItems.forEach(item => removeItem(item.id));
      // Clear selected table in parent (if needed, pass setter)
      onBack(); // go back to table selection
    }}
  >
    ← Back
  </Button>
</nav>
  {/* Main content: subcategory sidebar + menu + cart */}
  <div className="flex flex-1 overflow-hidden">
    {/* Subcategories Sidebar (permanent, smaller) */}
    <aside className="hidden md:flex md:flex-col w-36 border-r border-gray-200 dark:border-gray-700 p-2 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-2 dark:text-white">Subcategories</h3>
      {subcategories.map((sub) => (
        <button
          key={sub.id}
          onClick={() =>
            setSelectedSubcategory(selectedSubcategory === sub.id ? null : sub.id)
          }
          className={`px-2 py-1.5 rounded-md text-xs sm:text-sm text-left mb-1 transition ${
            selectedSubcategory === sub.id
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {sub.name}
        </button>
      ))}
    </aside>

        {/* Menu Items Grid */}
        <section className="flex-1 p-3 overflow-auto">
          {filteredItems.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                className="relative h-36 md:h-40 rounded-xl overflow-hidden shadow-md"
                  aria-label={`Menu item ${item.name}`}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${item.image_url || "/placeholder.jpg"})` }}
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col justify-end p-2 md:p-3 text-white text-xs md:text-sm">
                    <h3 className="font-bold truncate">{item.name}</h3>
                    <p className="truncate">{item.description}</p>
                    <p className="font-semibold mt-1">${Number(item.price).toFixed(2)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {getItemQuantity(item.id) > 0 ? (
                        <>
                          <button
                            className="bg-gray-200 text-black text-sm md:text-base py-1.5 px-3 rounded-md hover:bg-gray-300"
                            onClick={(e) => handleUpdateQuantity(item.id, -1, e)}
                          >
                            {item.increment === 0.5 ? "-0.5" : "-1"}
                          </button>
                          <span className="w-6 text-center text-sm md:text-base font-semibold">
                            {getItemQuantity(item.id)}
                          </span>
                          <button
                            className="bg-gray-200 text-black text-sm md:text-base py-1.5 px-3 rounded-md hover:bg-gray-300"
                            onClick={(e) => handleUpdateQuantity(item.id, 1, e)}
                          >
                            {item.increment === 0.5 ? "+0.5" : "+1"}
                          </button>
                        </>
                      ) : (
                        <button
                        className="bg-blue-600 text-white text-xs md:text-sm py-1 px-2 rounded-md hover:bg-blue-700"
                          onClick={(e) => handleAddItem(item, e)}
                        >
                          {item.increment === 0.5 ? "+0.5" : "+1"}
                        </button>
                      )}
                    </div>

                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 mt-10">No menu items found.</p>
          )}
        </section>

    {/* Cart Sidebar */}
    <aside className="hidden md:flex md:flex-col w-60 border-l border-gray-200 dark:border-gray-700 p-3">
      <h3 className="text-base font-semibold mb-3 dark:text-white">የተመረጡ ትዛዞች</h3>
      {orderItems.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No items added.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {orderItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between mb-2 text-xs md:text-sm dark:text-white"
            >
              <div className="flex flex-col max-w-[9rem] truncate">
                <span className="font-semibold truncate">{item.name}</span>
                <span className="text-gray-600 dark:text-gray-400 truncate">
                  ${Number(item.price).toFixed(2)} × {item.quantity}
                </span>
              </div>
              <button
                className="bg-red-500 text-white text-xs py-1 px-2 rounded hover:bg-red-600"
                onClick={() => removeItem(item.id)}
                aria-label={`Remove ${item.name} from cart`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 border-t pt-2">
        <p className="text-base font-semibold dark:text-white">አጠቃላይ ድምር: ${subtotal}</p>
        <Button
          className="w-full mt-2 text-sm"
          disabled={orderItems.length === 0}
          onClick={onNext}
          aria-label="Proceed to review order"
        >
          ትዕዛዝ አረጋግጥ →
        </Button>
      </div>
    </aside>
  </div>




      {/* Mobile cart */}
      <div className="fixed bottom-4 right-4 md:hidden z-50">
        <button
          onClick={() => setCartOpenMobile(!cartOpenMobile)}
          className="bg-blue-600 text-white p-3 rounded-full shadow-lg relative"
          aria-label={`Toggle cart (${orderItems.length} items)`}
        >
          <span>🛒</span>
          {orderItems.length > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 rounded-full text-xs w-4 h-4 flex items-center justify-center">
              {orderItems.length}
            </span>
          )}
        </button>
        {cartOpenMobile && (
          <div className="fixed bottom-16 right-4 w-64 max-h-[70vh] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 shadow-lg overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold dark:text-white">Your Order</h3>
              <button
                className="bg-gray-200 text-black text-xs py-1 px-2 rounded hover:bg-gray-300"
                onClick={() => setCartOpenMobile(false)}
                aria-label="Close cart"
              >
                ×
              </button>
            </div>
            {orderItems.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No items added.</p>
            ) : (
              orderItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between mb-2 text-xs dark:text-white"
                >
                  <div className="flex flex-col max-w-xs truncate">
                    <span className="font-semibold truncate">{item.name}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate">
                      ${Number(item.price).toFixed(2)} × {item.quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="bg-red-500 text-white text-xs py-1 px-2 rounded hover:bg-red-600"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="mt-2 border-t pt-2">
              <p className="text-lg font-semibold dark:text-white">
                አጠቃላይ ድምር: ${subtotal}
              </p>
              <Button
                className="w-full mt-2 text-sm"
                disabled={orderItems.length === 0}
                onClick={onNext}
                aria-label="Proceed to review order"
              >
                ትዕዛዝ አረጋግጥ →
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
