const axios = require("axios");

const PORT = process.env.PORT || 3000;
const BASE = `http://localhost:${PORT}`;
const TEST_TICKET_ID = process.env.TEST_TICKET_ID || "12156635";

function log(name, ok, detail = "") {
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? " " + detail : ""}`);
}

async function run() {
  console.log("\nTesting X-trafik API backend at", BASE);
  console.log("Ticket ID for validate-ticket:", TEST_TICKET_ID);
  if (process.env.XTRAFIK_BASE_URL) {
    console.log("XTRAFIK_BASE_URL:", process.env.XTRAFIK_BASE_URL);
  } else {
    console.log("XTRAFIK_BASE_URL: (not set – test-connection and validate-ticket will report config error)\n");
  }

  let failed = 0;

  try {
    const r1 = await axios.get(`${BASE}/health`);
    const ok1 = r1.status === 200;
    if (!ok1) failed++;
    log("GET /health", ok1, ok1 ? "" : `(${r1.status})`);
  } catch (e) {
    failed++;
    log("GET /health", false, e.message);
    console.log("\nIs the server running? Start it with: npm run dev\n");
    process.exit(1);
  }

  try {
    const r2 = await axios.get(`${BASE}/api/test`);
    const ok2 = r2.status === 200;
    if (!ok2) failed++;
    log("GET /api/test", ok2, ok2 ? "" : `(${r2.status})`);
  } catch (e) {
    failed++;
    log("GET /api/test", false, e.message);
  }

  try {
    const r3 = await axios.get(`${BASE}/api/test-connection`, { validateStatus: () => true });
    const data3 = r3.data;
    const ok3 = (r3.status === 200 || r3.status === 500) && data3 && typeof data3.configuration !== "undefined";
    if (!ok3) failed++;
    const connected = data3.success === true;
    log("GET /api/test-connection", ok3, connected ? `(${data3.duration})` : (data3.error || "X-trafik not configured"));
    if (data3.configuration) {
      console.log("   baseUrl:", data3.configuration.baseUrl || "NOT SET");
      if (data3.result) console.log("   result:", data3.result);
    }
  } catch (e) {
    failed++;
    log("GET /api/test-connection", false, e.message);
  }

  try {
    const r4 = await axios.post(`${BASE}/api/validate-ticket`, { ticketId: TEST_TICKET_ID }, {
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    const data4 = r4.data;
    const ok4 = [200, 404, 500].includes(r4.status) && data4 && typeof data4.status !== "undefined";
    if (!ok4) failed++;
    const validated = data4.success === true;
    log("POST /api/validate-ticket", ok4, validated ? `status=${data4.status}` : `status=${data4.status}${data4.message ? " – " + data4.message : ""}`);
  } catch (e) {
    failed++;
    log("POST /api/validate-ticket", false, e.message);
  }

  console.log("");
  if (failed > 0) {
    console.log("Some checks failed. Ensure .env has XTRAFIK_BASE_URL (and certs if required), then run again.");
    process.exit(1);
  }
  console.log("All checks passed.");
}

run();
