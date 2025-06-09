// Orchestrator API for processes and setup
// TODO: make this configurable
export const API_BASE_URL = "http://localhost:" +
  (Deno.env.get("ORCHESTRATOR_PORT") ?? 3000);

// Collector Exporter for logs
export const API_LOG_URL = "http://localhost:" +
  (Deno.env.get("COLLECTOR_LOG_PORT") ?? 11033);
