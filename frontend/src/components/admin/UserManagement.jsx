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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
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
  const canChangeRole = (currentUser?.role === "admin" || currentUser?.role === "manager");
  const editingIsWaiter = editingUser?.role === "waiter";
  const selectedRoleIsWaiter = form.role === "waiter";

  // Filtered list
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === "all" ? true : u.role === roleFilter))
      .filter((u) => (!q ? true : `${u.username || ""} ${u.role || ""}`.toLowerCase().includes(q)));
  }, [users, search, roleFilter]);

  // Open modal for add / edit
  const openModal = (user = null) => {
    setErrors({});
    if (user) {
      // Edit mode: username not editable
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
      // Create: username required for all
      if (!form.username?.trim()) e.username = "Username is required";
      if (form.role === "waiter") {
        if (!/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
      } else if (["admin", "manager", "cashier"].includes(form.role)) {
        if (!form.password || form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }
    } else {
      // Edit:
      // Username cannot be changed — don't validate content here besides presence for display
      if (!form.username?.trim()) e.username = "Username is required";
      if (form.role === "waiter") {
        if (form.pin && !/^\d{4}$/.test(form.pin)) e.pin = "PIN must be exactly 4 digits";
      } else {
        if (form.password && form.password.length < 6)
          e.password = "Password must be at least 6 characters";
      }
      // role change allowed only for admin/manager
      if (!canChangeRole && form.role !== editingUser.role) {
        e.role = "You are not allowed to change roles";
      }
      // Manager cannot make changes to an admin's password/role
      if (currentUser?.role === "manager" && editingUser?.role === "admin") {
        if (form.password) e.password = "Manager cannot update Admin's password";
        if (form.role !== editingUser.role)
          e.role = "Manager cannot change Admin's role";
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
        // Only include fields that are allowed and provided
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
      // Show field-level errors if we can infer:
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

  // Row styles
  const rowBase =
    "border-b last:border-b-0 hover:bg-muted/60 transition-colors";

  return (
    <div className="space-y-5">
      {/* Header / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* <div>
          <h2 className="text-2xl font-semibold tracking-tight">User Management</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage user accounts, roles, and credentials.
          </p>
        </div> */}

        <div className="flex gap-2">
          <Dialog open={modalOpen} onOpenChange={(v) => (v ? openModal() : closeModal())}>
            <DialogTrigger asChild>
              <Button onClick={() => openModal()} className="w-full sm:w-auto">
                + Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit User" : "Add User"}</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Role */}
                <div>
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                    disabled={editingUser && !canChangeRole}
                  >
                    <SelectTrigger className={errors.role ? "ring-2 ring-destructive" : ""}>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="waiter">Waiter</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.role && (
                    <p className="mt-1 text-xs text-destructive">{errors.role}</p>
                  )}
                </div>

                {/* Username (always required, but not editable on edit) */}
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <Input
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    disabled={!!editingUser}
                    placeholder="e.g. johndoe"
                    className={errors.username ? "ring-2 ring-destructive" : ""}
                  />
                  {errors.username && (
                    <p className="mt-1 text-xs text-destructive">{errors.username}</p>
                  )}
                  {editingUser && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Username cannot be changed.
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
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      placeholder={editingUser ? "Leave blank to keep current" : "Min 6 characters"}
                      className={errors.password ? "ring-2 ring-destructive" : ""}
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
                      className={errors.pin ? "ring-2 ring-destructive" : ""}
                    />
                    {errors.pin && (
                      <p className="mt-1 text-xs text-destructive">{errors.pin}</p>
                    )}
                  </div>
                )}

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={closeModal} disabled={submitting}>
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

{/* Filters */}
<Card className="p-3 sm:p-4">
  <div className="flex flex-col md:flex-row md:items-center gap-3">
    <div className="flex-1">
      <Input
        placeholder="Search by username or role…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
    <div className="w-full md:w-48">
      <Select value={roleFilter} onValueChange={setRoleFilter}>
        <SelectTrigger>
          <SelectValue placeholder="Filter by role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            All roles ({filteredUsers.length})
          </SelectItem>
          <SelectItem value="admin">
            Admin ({filteredUsers.filter(u => u.role === "admin").length})
          </SelectItem>
          <SelectItem value="manager">
            Manager ({filteredUsers.filter(u => u.role === "manager").length})
          </SelectItem>
          <SelectItem value="cashier">
            Cashier ({filteredUsers.filter(u => u.role === "cashier").length})
          </SelectItem>
          <SelectItem value="waiter">
            Waiter ({filteredUsers.filter(u => u.role === "waiter").length})
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</Card>


      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Loading users…
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className={rowBase}>
                    <td className="px-4 py-3">{u.id}</td>
                    <td className="px-4 py-3">{u.username}</td>
                    <td className="px-4 py-3 capitalize">{u.role}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openModal(u)}>
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
