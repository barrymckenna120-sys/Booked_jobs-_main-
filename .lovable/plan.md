Add temporary console.error logging to the `list-users` error path in `src/pages/AdminPanel.tsx`.

Change location:
- File: `src/pages/AdminPanel.tsx`
- Component: `UnblockUserPopover` (lines 94-231)
- Target block: lines 121-125

Current code:
```tsx
if (invokeError || (data as any)?.error) {
  setError("Failed to load users for this organisation");
  setUsers([]);
  return;
}
```

New code:
```tsx
if (invokeError || (data as any)?.error) {
  console.error("[list-users] error:", invokeError,
    "data error:", (data as any)?.error,
    "org_id:", orgId);
  setError("Failed to load users for this organisation");
  setUsers([]);
  return;
}
```

This is a temporary diagnostic change only. No other files or logic will be modified.