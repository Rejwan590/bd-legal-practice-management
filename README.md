# BD Legal Practice Management System

> **AI Coding Assistant Notice**: All coding tools (Antigravity, Claude, Codex, Gemini) must strictly read and adhere to [AGENTS.md](file:///./AGENTS.md) before performing any changes in this repository.

Web application for law chambers and legal practices in Bangladesh, featuring dual English and Bangla language support, case tracking, court hearings with immutable date histories, task assignment, physical file tracking, automated reminders, chamber backup/restore, and subscription licensing with read-only enforcement.

## Architecture & Technology Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, react-i18next (en/bn), Lucide icons.
- **Data Layer**: Clean single-source-of-truth Repository Pattern with multi-tenant `firmId` isolation.
- **Storage**: In-memory / `localStorage` store for the client prototype; swappable with PostgreSQL REST API for production.
- **Security & Authorization**: Centralized role-based access control (`/src/permissions.ts`) enforcing `Owner` vs `Staff` permissions at both repository and UI tiers.
- **Cryptographic Backups**: Tamper-evident SHA-256 integrity checksums with PBKDF2 (≥600,000 iterations) and client-side AES-GCM-256 encryption.
- **No External API Keys Required**: The application runs completely self-contained without requiring external AI or Gemini API keys.

## Quick Start
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run TypeScript checks
npm run lint

# Build for production
npm run build
```
