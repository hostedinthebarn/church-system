# SW-131 spike (throwaway, do not merge)

Run from the repo root with a MongoDB at APOS_MONGODB_URI:

    npm install --no-save @modelcontextprotocol/sdk zod
    npm install @apostrophecms/event      # Apostrophe only loads a bundle that is in package.json; revert package.json and the lock afterwards
    node --test spike/cap.test.js spike/cap2.test.js spike/cap3.test.js spike/mcp.test.js

mcp.test.js calls the Inspector CLI from /tmp/insp (npm install @modelcontextprotocol/inspector there).
Results print under "=== RESULTS ===". Findings: SECTION-8.md.
