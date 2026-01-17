# Technical Review Document - Week 1

## 1️⃣ Project Overview

**SoundWave E-Commerce Platform**

This project is a multi-vendor audio equipment e-commerce application focusing on a premium user experience and administrative control.

*   **Tech Stack**: MERN (MongoDB, Express.js, Node.js), EJS (Templating), Tailwind CSS (Styling).
*   **Architecture**: Server-Side Rendering (SSR) for views with client-side enhancements (Vanilla JS) for dynamic interactions.
*   **Separation of Concerns**: Strictly separated **User Client** (Public/Customer) and **Admin Panel** (Management) with isolated authentication strategies.

---

## 2️⃣ USER SIDE — IMPLEMENTATION SUMMARY

### a) Page & File Structure

The user interface relies on EJS templates located in `src/views/`.

*   **`landing.ejs`**: Public landing page (Route: `/`). Showcases hero section and featured products.
*   **`login.ejs`**: Unified logic for entry. Handles credential validation and redirects.
*   **`otp.ejs`**: Dedicated view for OTP verification during signup or critical actions.
*   **`home.ejs`** (Post-Login): The main dashboard for authenticated users (Route: `/home`).
*   **`user-account.ejs`**: User profile management (details, logout, critical actions).
*   **`user-addresses.ejs`**: List view for managing saved delivery addresses.
*   **`add/edit-address.ejs`**: Forms for creating or updating address details.

**Key Distinction**: The **Landing Page** is visitor-oriented (marketing focus), whereas the **Home Page** is personalized for authenticated customers.

### b) Authentication Flow (High Level)

The application enforces a strict, linear authentication journey:

1.  **Landing (`/`)** → **Login (`/login`)**: Entry point for unauthenticated users.
2.  **Login** → **OTP (`/verify-otp`)**: After credential validation, users must verify their identity via OTP (sent to email).
3.  **OTP** → **Home (`/home`)**: Access is granted only after successful OTP verification.

*   **Session Handling**: A dual-layer check uses `ensureAuthenticated` (Passport/Session) and `ensureOtpVerified` middlewares.
*   **OTP Purpose**: Acts as a 2FA mechanism for email verification and secure login.
*   **Transient Nature**: OTP state is temporary and session-bound; it is not a permanent invalidation of the user record but a required step for the current session.

### c) UI Feedback & Notifications

To maintain a premium aesthetic, native browser alerts (`alert()`) have been completely removed.

*   **Inline Messages**: Login and Sign-up forms use a dedicated `#auth-message` container to display success/error text directly within the form context (e.g., "Invalid password" appears in red below the inputs).
*   **Toast Notifications**: Used for transient system updates (e.g., "Address added successfully").
*   **Confirmation Modals**: Destructive actions (like "Delete Account") trigger a custom, styled SweetAlert modal requiring explicit user confirmation, preventing accidental data loss.

### d) User Profile Features

*   **Viewing Details**: Users can view their Name, Email, and Phone on a unified profile card.
*   **Editing Profile**: Name and Phone can be edited directly with server-side validation. Email is read-only to maintain identity integrity (requires specific flow to change).
*   **Address Management**: Full CRUD (Create, Read, Update, Delete) capabilities for addresses, validated for Indian locale requirements.
*   **Session**: "Logout" securely destroys the session and clears authentication cookies, redirecting the user to the landing page.

---

## 3️⃣ ADMIN SIDE — IMPLEMENTATION SUMMARY

### a) Admin Authentication

*   **Isolation**: Admin login logic is separate from user login.
*   **Security**: Initial Admin credentials are bootstrapped securely via Environment Variables (`.env`), falling back to Database records if present.
*   **Session**: Admin sessions (`req.session.isAdmin`) are distinct from User sessions, preventing privilege escalation attacks.

### b) Admin Dashboard Structure

*   **Dashboard (`/admin/dashboard`)**: Central hub displaying profile summaries and quick actions.
*   **Customers Section**: View entire user base, manage access.
*   **Brands Section**: Manage product brands (logo uploads, status toggles).
*   **Categories**: Included as a future scope; currently managed via fixed business logic.

### c) Admin Functionalities Implemented

*   **User Management**: Administrators can view customer lists, search users, and **Block/Unblock** access.
*   **Brand Management**: Full capability to Add, Edit, Delete (Soft/Hard), and Toggle Status of brands. No dummy data remains; all brands are DB-driven.
*   **Visual Consistency**: All admin pages share a unified `sidebar.ejs` and `navbar.ejs` for consistent navigation and branding.
*   **Cleanup**: Removed non-functional UI elements (like "Export" buttons) to focus on core deliverables.

### d) Admin Safety Measures

*   **Destructive Actions**: Deleting a brand or blocking a user requires confirmation via a modal.
*   **Visual Indicators**: Statuses are color-coded (Green for Active, Red for Blocked/Inactive) to provide immediate visual context.
*   **Explicit Actions**: Buttons clearly state the outcome (e.g., "Delete Brand" vs "Hide Brand"), avoiding ambiguity.

---

## 4️⃣ SESSION & SECURITY DESIGN

*   **Session vs Database**: The application uses **Database** (MongoDB) for persistent data (Users, Addresses, Brands) and **Memory/Cookie Sessions** for temporary state (Login status, Admin privileges).
*   **Navigation Security**: Browser back-button navigation is restricted after logout by clearing the cache (`nocache` middleware), ensuring users cannot view protected pages after signing out.
*   **Protected Routes**: Middleware strictly guards routes; `/admin/*` requires Admin Session, `/home` requires User Authentication + OTP Verification.
*   **OTP Security**: OTPs are generated on-demand and validated against the session/cache, never stored continuously in the primary user record, reducing the attack surface.

---

## 5️⃣ DESIGN & ARCHITECTURAL DECISIONS

*   **Why EJS?**: EJS was chosen for its simplicity and ability to render dynamic content on the server (SSR), improving initial load times and SEO foundation without the complexity of a full client-side SPA (Single Page Application) framework like React for this phase.
*   **Why Tailwind?**: Tailwind CSS allows for rapid, utility-first styling, ensuring a unique "SoundWave" design system without fighting against pre-built component library overrides.
*   **Architecture**: Logic is cleanly split into **Controllers** (business logic), **Middleware** (protection/validation), and **Views** (UI), following MVC principles for maintainability.
*   **Deferred Features**: Complex logic like Order Processing and Payment Gateway integration is deferred to focused sprints to ensure the core Auth and User Management foundation is rock-solid first.

---

## 6️⃣ CURRENT STATUS FOR THIS REVIEW WEEK

**Checklist:**

*   ✅ **User Implementation**: Auth Flow (Login/OTP/Signup), Home Page, Profile Management, Address Book.
*   ✅ **Admin Implementation**: Dashboard, Customer Management (Block/Unblock), Brand Management (CRUD).
*   ✅ **Infrastructure**: Database connection, Middleware pipelines, Session config.
*   ✅ **UI/UX**: Inline feedback, Responsive Design, "SoundWave" Aesthetics.
*   ⚠️ **Known Issues**: None critical. Minor UI polishes on mobile view required.
*   ⏳ **Deferred**: Order Management, Product Catalog (Deep implementation), Coupon System.

---

## 7️⃣ Conclusion

The system is **functionally complete for the current review phase**. The core Authentication, Profile, and Admin Management flows are implemented, tested, and secured. The robust separation of duties and clean architectural patterns lay a solid foundation for the upcoming Product and Order management modules.
