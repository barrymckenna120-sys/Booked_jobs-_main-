

## Problem

The "Add Customer" button on the Customers page navigates to `/dashboard` instead of providing a way to add a new customer. There is no dedicated "Add Customer" form — only a `NewJobPanel` component exists (which creates jobs, and can optionally create a new customer inline).

## Plan

**Create an "Add Customer" dialog/sheet on the Customers page** that allows adding a customer directly, without going through the job creation flow.

### Changes

1. **`src/pages/Customers.tsx`** — Replace the `navigate("/dashboard")` button behavior:
   - Add a `useState` to control an "Add Customer" sheet/dialog
   - Wire the button to open it
   - On successful creation, refresh the customer list and close the sheet

2. **Create `src/components/customer/AddCustomerSheet.tsx`**:
   - A `Sheet` component with a simple form: Name, Phone, Email, Address, Eircode, Area Code
   - On submit, insert into the `customers` table via Supabase
   - Show toast on success/error
   - Call an `onSuccess` callback to refresh the list

### Fields (matching existing `customers` table columns)
- Name (required)
- Phone (required)
- Email
- Address
- Eircode
- Area Code

