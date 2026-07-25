import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Real UI arrives in Phase 3. This is a placeholder that renders and builds to dist/ —
// the whole requirement for T01. See docs/PLAN.md §2, §11.2.
export default defineConfig({
  plugins: [react()],
});
