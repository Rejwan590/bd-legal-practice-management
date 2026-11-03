# Physical Paper File Tracking Table — Compact Layout Report

## 1. Overview & Architectural Goals
This report documents the compact 4-column layout refactoring applied to the Physical Paper File Tracking table in `src/modules/files/FilesScreen.tsx`. The goal was to reclaim horizontal table space, reduce excessive cell padding and row heights, and group related custody metadata while strictly preserving all existing custody workflows, history auditing, permissions, and destructive action safety guards.

---

## 2. 4-Column Table Architecture

The table was restructured from 5 sprawling columns into 4 compact, content-dense columns:

| Column Header | Elements Rendered | Visual Hierarchy & Styling |
|---|---|---|
| **Physical File** | - File Serial Badge (`F-000101`)<br>- Shelf/Cabinet Location (`Cabinet A · Shelf 1`) | Prominent monospace badge with `FileCheck` icon; shelf location displayed directly underneath in smaller secondary text with `MapPin` icon. |
| **Case & Client** | - Case Number (`CR-101/2026`)<br>- Client Name (`Md. Rafiqul Islam`)<br>- Short File Title / Bundle Description | Stacked hierarchy with clickable `EntityLink` on case and client; short file description italicized in secondary text. |
| **Custody & Holder** | - Custody Status Badge (`In Chamber`, `Checked Out`, `In Court`)<br>- Current Holder (`Advocate / Staff Name`)<br>- Due Back Date / Overdue Indicator | Status badge at top; holder name underneath with `User` icon; due date in monospace font with `Clock` icon and amber/rose overdue badge if late. |
| **Actions** | - **Primary Action (Top)**: Check Out / Court Dispatch / Check In<br>- **Secondary Actions (Underneath)**: Edit, View History, Delete | Custody actions styled as prominent primary buttons. Edit, History, and Delete arranged in a compact secondary icon row underneath. |

---

## 3. Preservation of Actions & Security Guards

All four vital file operations remain 100% functional with identical permission enforcement:

1. **Check Out / Dispatch Court / Check In (Primary Custody Action)**:
   - **`in_chamber` state**: Displays `Check Out` (amber) and `Court` dispatch (indigo) buttons.
   - **`checked_out` / `in_court` state**: Displays `Check In` (emerald) button.
   - Guarded by `canManage && !isReadOnly`. Clicking triggers the respective modal (`setCheckOutModalFile`, `setDispatchModalFile`, `setCheckInModalFile`).
2. **Edit (Secondary Action)**:
   - Guarded by `canManage && !isReadOnly`. Clicking opens `CaseFormModal` for editing file metadata.
3. **History / View Custody History (Secondary Action)**:
   - Accessible to all permitted viewers. Clicking opens `FileHistoryModal` to view complete immutable audit movements.
4. **Delete (Secondary Action)**:
   - Guarded by `canManage && !isReadOnly`. Styled with subtle danger treatment (`text-slate-400 hover:text-rose-600 hover:bg-rose-50`). Clicking triggers the safety confirmation dialog (`deleteConfirmFile`). Soft delete invariant is strictly maintained.

---

## 4. Compact Styling & Responsive Design

- **Vertical Cell Padding**: Integrated `compact={true}` on `ResponsiveTable`, reducing vertical cell padding from `py-3.5` (14px) to `py-2 sm:py-2.5` (8px–10px) and header padding to `py-2 text-[11px]`.
- **Button Dimensions**: Primary buttons use compact `px-2.5 py-1 text-xs` footprint; secondary action icons use `p-1 rounded-md`.
- **Tablet (768px - 1024px)**: Natural text wrapping with tight horizontal spacing prevents any table blowout.
- **Mobile (< 768px)**: Automatically switches to the touch-optimized stacked card layout with full access to custody actions, edit, history, and delete.

---

## 5. Verification & Test Suite Summary
- **TypeScript & ESLint**: Clean pass with 0 warnings or errors.
- **Vite Production Build**: Clean build completed without errors.
- **Responsive Overflow Verification**: Verified with zero horizontal scroll across 320px, 360px, 768px, 1280px, and 1920px viewports.
