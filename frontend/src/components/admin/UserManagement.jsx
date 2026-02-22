// src/components/admin/UserManagement.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getUsers, createUser, updateUser, deleteUser } from "@/api/users";
import { useAuth } from "../../context/AuthContext";
import { toast } from "react-hot-toast";

// shadcn/ui
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Small reusable confirm dialog
function ConfirmDialog({ open, title, description, onConfirm, onCancel, loading }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onCancel()}>
      <DialogContent className="sm:max-w-md border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
            <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">{title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            This action is permanent and cannot be undone.
          </p>
        </div>
        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/40">
          <Button variant="outline" className="border-slate-300 dark:border-slate-700" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagement() {
  const { user: currentUser, token } = useAuth();

  // data state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters & search
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // form state
  const [form, setForm] = useState({
    role: "",
    username: "",
    password: "",
    pin: "",
  });

  // form errors for inline validation
  const [errors, setErrors] = useState({});

  // Load users
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers("", token);
      setUsers(data);
    } catch (err) {
      toast.error(err?.response?.data || err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Helpers -----
  const canChangeRole = currentUser?.role === "admin" || currentUser?.role === "manager";
  const canEditUsername = currentUser?.role === "admin" || currentUser?.role === "manager";
  const editingIsWaiter = editingUser?.role === "waiter";
  const selectedRoleIsWaiter = form.role === "waiter";

  // Filtered list
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === "all" ? true : u.role === roleFilter))
      .filter((u) => (!q ? true : `${u.username || ""} ${u.role || ""}`.toLowerCase().includes(q)));
  }, [users, search, roleFilter]);
  const roleStats = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === "admin").length,
      manager: users.filter((u) => u.role === "manager").length,
      cashier: users.filter((u) => u.role === "cashier").length,
      waiter: users.filter((u) => u.role === "waiter").length,
    }),
    [users]
  );

  // Open modal for add / edit
  const openModal = (user = null) => {
    setErrors({});
    if (user) {
      // Edit mode
      setEditingUser(user);
      setForm({
        role: user.role || "",
        username: user.username || "",
        password: "",
        pin: "",
      });
    } else {
      setEditingUser(null);
      setForm({
        role: "",
        username: "",
        password: "",
        pin: "",
      });
    }
    setModalOpen(true);
  };

  // Close modal
  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingUser(null);
    setForm({ role: "", username: "", password: "", pin: "" });
    setErrors({});
  };

  // Validation
  const validate = () => {
    const e = {};
    if (!form.role) e.role = "Role is required";
    if (!editingUser) {
      if (!form.username?.trim()) e.username = "Username is required";
      if (form.role === "waiter") {
        if (!/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
      } else if (["admin", "manager", "cashier"].includes(form.role)) {
        if (!form.password || form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }
    } else {
      // Edit
      if (!form.username?.trim()) e.username = "Username is required";
      else if (form.username.trim().length < 3) e.username = "Username must be at least 3 characters";
      if (form.role === "waiter") {
        if (form.pin && !/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
      } else {
        if (form.password && form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }

      if (canChangeRole && form.role !== editingUser.role) {
        if (form.role === "waiter" && !form.pin) {
          e.pin = "PIN is required when changing role to waiter";
        }
        if (form.role !== "waiter" && !form.password) {
          e.password = "Password is required when changing role to non-waiter";
        }
      }

      if (!canChangeRole && form.role !== editingUser.role) e.role = "You are not allowed to change roles";

      if (currentUser?.role === "manager" && editingUser?.role === "admin") {
        if (form.password) e.password = "Manager cannot update Admin's password";
        if (form.role !== editingUser.role) e.role = "Manager cannot change Admin's role";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        const payload = {};

        if (canEditUsername && form.username !== editingUser.username) {
          payload.username = form.username.trim();
        }

        if (canChangeRole) payload.role = form.role;

        if (form.role === "waiter") {
          if (form.pin) payload.pin = form.pin;
        } else {
          if (form.password) payload.password = form.password;
        }

        await updateUser(editingUser.id, payload, token);
        toast.success("User updated");
      } else {
        const payload = {
          role: form.role,
          username: form.username.trim(),
        };
        if (form.role === "waiter") {
          payload.pin = form.pin;
        } else {
          payload.password = form.password;
        }
        await createUser(payload, token);
        toast.success("User created");
      }
      closeModal();
      loadUsers();
    } catch (err) {
      const msg = err?.response?.data || err.message || "Operation failed";
      toast.error(msg);
      if (typeof msg === "string" && msg.toLowerCase().includes("username")) {
        setErrors((prev) => ({ ...prev, username: msg }));
      }
      if (typeof msg === "string" && msg.toLowerCase().includes("pin")) {
        setErrors((prev) => ({ ...prev, pin: msg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete
  const confirmDelete = (id) => setDeleteId(id);
  const cancelDelete = () => (!deleting ? setDeleteId(null) : null);

  const doDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteUser(deleteId, token);
      toast.success("User deleted");
      setUsers((prev) => prev.filter((u) => u.id !== deleteId));
    } catch (err) {
      toast.error(err?.response?.data || err.message || "Failed to delete user");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const rowBase = "border-b border-slate-200 last:border-b-0 hover:bg-slate-50/70 transition-colors dark:border-slate-800 dark:hover:bg-slate-900/60";

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-5 text-white md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Admin Controls</p>
              <h2 className="mt-1 text-xl font-semibold">Users Management</h2>
              <p className="mt-1 text-sm text-slate-300">Manage account roles and login credentials for operations.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Total</p>
                <p className="text-sm font-medium">{roleStats.total}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Admins</p>
                <p className="text-sm font-medium">{roleStats.admin}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Managers</p>
                <p className="text-sm font-medium">{roleStats.manager}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Cashiers</p>
                <p className="text-sm font-medium">{roleStats.cashier}</p>
              </div>
              <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-slate-300">Waiters</p>
                <p className="text-sm font-medium">{roleStats.waiter}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60 md:p-6">
          <div className="flex gap-2">
          <Dialog open={modalOpen} onOpenChange={(v) => (v ? openModal() : closeModal())}>
            <DialogTrigger asChild>
              <Button onClick={() => openModal()} className="w-full sm:w-auto">
                + Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg border-slate-200 bg-white p-0 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <DialogHeader>
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
                  <DialogTitle className="text-lg text-slate-900 dark:text-slate-100">
                    {editingUser ? "Edit User" : "Add User"}
                  </DialogTitle>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Configure role and credentials. Waiter PIN remains plain text by design.
                  </p>
                </div>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
                {/* Role */}
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                    disabled={editingUser && !canChangeRole}
                  >
                    <SelectTrigger className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.role ? "ring-2 ring-destructive" : ""}`}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="waiter">Waiter</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.role && <p className="mt-1 text-xs text-destructive">{errors.role}</p>}
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    disabled={editingUser && !canEditUsername}
                    placeholder="e.g. johndoe"
                    className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.username ? "ring-2 ring-destructive" : ""}`}
                  />
                  {errors.username && (
                    <p className="mt-1 text-xs text-destructive">{errors.username}</p>
                  )}
                  {editingUser && !canEditUsername && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only Admins or Managers can change usernames.
                    </p>
                  )}
                </div>

                {/* Password or PIN based on role */}
                {form.role && form.role !== "waiter" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {editingUser ? "New Password (optional)" : "Password"}
                    </label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={editingUser ? "Leave blank to keep current" : "Min 6 characters"}
                      className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.password ? "ring-2 ring-destructive" : ""}`}
                    />
                    {errors.password && (
                      <p className="mt-1 text-xs text-destructive">{errors.password}</p>
                    )}
                  </div>
                )}

                {form.role === "waiter" && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {editingUser ? "New PIN (optional)" : "4-digit PIN"}
                    </label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.pin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setForm((f) => ({ ...f, pin: v }));
                      }}
                      placeholder="1234"
                      className={`h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${errors.pin ? "ring-2 ring-destructive" : ""}`}
                    />
                    {errors.pin && <p className="mt-1 text-xs text-destructive">{errors.pin}</p>}
                  </div>
                )}

                <DialogFooter className="gap-2 border-t border-slate-200 bg-slate-50 px-0 pt-4 dark:border-slate-800 dark:bg-slate-800/30">
                  <Button type="button" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (editingUser ? "Updating..." : "Creating...") : editingUser ? "Update User" : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-3 sm:p-4 border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search by username or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-10 border-slate-300 bg-white text-slate-900 shadow-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles ({filteredUsers.length})</SelectItem>
                <SelectItem value="admin">Admin ({filteredUsers.filter(u => u.role === "admin").length})</SelectItem>
                <SelectItem value="manager">Manager ({filteredUsers.filter(u => u.role === "manager").length})</SelectItem>
                <SelectItem value="cashier">Cashier ({filteredUsers.filter(u => u.role === "cashier").length})</SelectItem>
                <SelectItem value="waiter">Waiter ({filteredUsers.filter(u => u.role === "waiter").length})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-left dark:bg-slate-800/70">
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">No</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Username</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">Role</th>
                <th className="px-4 py-3 font-medium text-right text-slate-700 dark:text-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, index) => (
                  <tr key={u.id} className={rowBase}>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{index + 1}</td> {/* Sequential number */}
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" className="border-slate-300 dark:border-slate-700" onClick={() => openModal(u)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(u.id)}
                          disabled={currentUser?.role === "manager" && u.role === "admin"}
                          title={
                            currentUser?.role === "manager" && u.role === "admin"
                              ? "Managers cannot delete Admins"
                              : "Delete user"
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete user?"
        description="This action cannot be undone. The user will be permanently removed."
        onConfirm={doDelete}
        onCancel={cancelDelete}
        loading={deleting}
      />
    </div>
  );
}
