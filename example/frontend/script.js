// Configuration for each chain
const chainConfigs = {
  paima: {
    name: "Paima Engine",
    blockTime: 2000, // This will be dynamically calculated
    color: "#667eea",
    blocks: [],
    currentBlock: 1000000,
    rpcEndpoint: "http://127.0.0.1:9999/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  evmMain: {
    name: "EVM Main",
    blockTime: 2000, // This will be dynamically calculated
    color: "#4caf50",
    blocks: [],
    currentBlock: 500000,
    rpcEndpoint: "http://127.0.0.1:8545/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  evmParallel: {
    name: "EVM Parallel",
    blockTime: 3000, // This will be dynamically calculated
    color: "#ff9800",
    blocks: [],
    currentBlock: 750000,
    rpcEndpoint: "http://127.0.0.1:8546/rpc/evm",
    latestBlockNumber: 0,
    previousLatestBlockNumber: 0,
    isConnected: false,
  },
  cardano: {
    name: "Cardano",
    blockTime: 2000, // 2 seconds
    color: "#2196f3",
    blocks: [],
    currentBlock: 300000,
  },
  midnight: {
    name: "Midnight",
    blockTime: 6000, // 6 seconds
    color: "#9c27b0",
    blocks: [],
    currentBlock: 150000,
  },
};

// RPC endpoint configuration (legacy - now using individual chain configs)
const RPC_ENDPOINT = "http://127.0.0.1:9999/rpc/evm";
const CONFIG_ENDPOINT = "http://127.0.0.1:9999/config";
const PRIMITIVES_ENDPOINT = "http://127.0.0.1:9999/primitives";
const TABLES_ENDPOINT = "http://127.0.0.1:9999/tables";

// State management (legacy - now using individual chain configs)
let latestBlockNumber = 0;
let previousLatestBlockNumber = 0;
let isConnected = false;

// Primitive data management
let primitiveNames = [];
let primitiveData = {};

// Static table data management
let staticTableData = {};

// Utility functions
function generateRandomHash() {
  return "0x" +
    Array.from(
      { length: 64 },
      () => Math.floor(Math.random() * 16).toString(16),
    ).join("");
}

function formatTimestamp(date) {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createBlockElement(blockNumber, blockHash, timestamp, isNew = false) {
  const blockDiv = document.createElement("div");
  blockDiv.className = `block-item ${isNew ? "new-block" : ""}`;

  blockDiv.innerHTML = `
        <div class="block-number">Block #${blockNumber.toLocaleString()}</div>
        <div class="block-hash">${blockHash}</div>
        <div class="block-timestamp">${formatTimestamp(timestamp)}</div>
    `;

  return blockDiv;
}

// RPC Functions
async function fetchLatestBlockForChain(chainKey) {
  const config = chainConfigs[chainKey];
  if (!config.rpcEndpoint) return;

  try {
    const response = await fetch(config.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // Convert hex to decimal
    const blockNumber = parseInt(data.result, 16);

    // Check if block number has incremented
    if (blockNumber > config.latestBlockNumber) {
      config.previousLatestBlockNumber = config.latestBlockNumber;
      config.latestBlockNumber = blockNumber;

      // Generate new block when RPC block increments
      if (config.previousLatestBlockNumber > 0) { // Don't generate on first load
        generateBlock(chainKey);
      }
    }

    config.isConnected = true;

    // For Paima chain, also update legacy variables for compatibility
    if (chainKey === "paima") {
      latestBlockNumber = blockNumber;
      previousLatestBlockNumber = config.previousLatestBlockNumber;
      isConnected = true;
      updateLatestBlockDisplay();
    }
  } catch (error) {
    console.error(`Error fetching latest block for ${chainKey}:`, error);
    config.isConnected = false;

    // For Paima chain, also update legacy variables for compatibility
    if (chainKey === "paima") {
      isConnected = false;
      updateLatestBlockDisplay();
    }
  }
}

// Legacy function for backward compatibility
async function fetchLatestBlock() {
  await fetchLatestBlockForChain("paima");
}

function updateLatestBlockDisplay() {
  const latestBlockElement = document.getElementById("latest-block");

  if (isConnected) {
    latestBlockElement.textContent = latestBlockNumber.toLocaleString();
    latestBlockElement.style.backgroundColor = "rgba(76, 175, 80, 0.1)";
    latestBlockElement.style.color = "#4caf50";
  } else {
    latestBlockElement.textContent = "Connection Error";
    latestBlockElement.style.backgroundColor = "rgba(244, 67, 54, 0.1)";
    latestBlockElement.style.color = "#f44336";
  }
}

// Block generation for dummy chains
function generateBlock(chainKey) {
  const config = chainConfigs[chainKey];

  // For RPC chains, use the latest RPC block number; for others, use incrementing counter
  const blockNumber = config.rpcEndpoint
    ? config.latestBlockNumber
    : config.currentBlock++;
  const blockHash = generateRandomHash();
  const timestamp = new Date();

  const newBlock = {
    number: blockNumber,
    hash: blockHash,
    timestamp: timestamp,
  };

  // Add to beginning of array
  config.blocks.unshift(newBlock);

  // Keep only last 20 blocks
  if (config.blocks.length > 20) {
    config.blocks = config.blocks.slice(0, 20);
  }

  // Update UI
  updateChainBlocks(chainKey, true);
}

// Calculate moving average block time for RPC chains
function calculateRPCChainBlockTime(chainKey) {
  const config = chainConfigs[chainKey];
  const blocks = config.blocks;

  if (blocks.length < 2) {
    return 2; // Default to 2 seconds if not enough data
  }

  // Calculate time differences between consecutive blocks
  const timeDiffs = [];
  for (let i = 0; i < Math.min(blocks.length - 1, 19); i++) {
    const timeDiff = blocks[i].timestamp - blocks[i + 1].timestamp;
    timeDiffs.push(timeDiff);
  }

  if (timeDiffs.length === 0) {
    return 2;
  }

  // Calculate average time difference in seconds
  const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) /
    timeDiffs.length;
  return Math.round(avgTimeDiff / 1000 * 10) / 10; // Round to 1 decimal place
}

// Calculate moving average block time for Paima (legacy function for compatibility)
function calculatePaimaBlockTime() {
  return calculateRPCChainBlockTime("paima");
}

// Update RPC chain block time display
function updateRPCChainBlockTimeDisplay(chainKey) {
  const elementId = `${
    chainKey.replace(/([A-Z])/g, "-$1").toLowerCase()
  }-block-time`;
  const blockTimeElement = document.getElementById(elementId);
  if (blockTimeElement) {
    const avgBlockTime = calculateRPCChainBlockTime(chainKey);
    blockTimeElement.textContent = `${avgBlockTime}s`;
  }
}

// Update Paima block time display (legacy function for compatibility)
function updatePaimaBlockTimeDisplay() {
  updateRPCChainBlockTimeDisplay("paima");
}

function updateChainBlocks(chainKey, isNewBlock = false) {
  const config = chainConfigs[chainKey];
  const containerId = `${
    chainKey.replace(/([A-Z])/g, "-$1").toLowerCase()
  }-blocks`;
  const container = document.getElementById(containerId);

  if (!container) return;

  // Clear container
  container.innerHTML = "";

  // Add blocks
  config.blocks.forEach((block, index) => {
    const blockElement = createBlockElement(
      block.number,
      block.hash,
      block.timestamp,
      isNewBlock && index === 0,
    );
    container.appendChild(blockElement);
  });

  // Update block time display for RPC chains
  if (config.rpcEndpoint) {
    updateRPCChainBlockTimeDisplay(chainKey);
  }
}

// Initialize chains with some initial blocks
function initializeChains() {
  Object.keys(chainConfigs).forEach((chainKey) => {
    const config = chainConfigs[chainKey];

    // Skip initial block generation for RPC chains - they will generate based on RPC
    if (config.rpcEndpoint) return;

    // Generate 5 initial blocks for non-RPC chains
    for (let i = 0; i < 5; i++) {
      const blockNumber = config.currentBlock - (5 - i);
      const blockHash = generateRandomHash();
      const timestamp = new Date(Date.now() - (5 - i) * config.blockTime);

      config.blocks.push({
        number: blockNumber,
        hash: blockHash,
        timestamp: timestamp,
      });
    }

    config.currentBlock = config.currentBlock + 1;
    updateChainBlocks(chainKey);
  });
}

// Setup block generation intervals
function setupBlockGenerators() {
  Object.keys(chainConfigs).forEach((chainKey) => {
    const config = chainConfigs[chainKey];

    // Skip RPC chains - they generate blocks based on RPC block increments
    if (config.rpcEndpoint) return;

    setInterval(() => {
      generateBlock(chainKey);
    }, config.blockTime);
  });
}

// Setup RPC polling intervals
function setupRPCPolling() {
  Object.keys(chainConfigs).forEach((chainKey) => {
    const config = chainConfigs[chainKey];

    // Only setup polling for RPC chains
    if (!config.rpcEndpoint) return;

    // Fetch immediately
    fetchLatestBlockForChain(chainKey);

    // Setup polling interval
    setInterval(() => {
      fetchLatestBlockForChain(chainKey);
    }, 100);
  });
}

// Connection status indicator
function updateConnectionStatus() {
  const header = document.querySelector(".header");

  if (isConnected) {
    header.style.borderLeft = "5px solid #4caf50";
  } else {
    header.style.borderLeft = "5px solid #f44336";
  }
}

// Initialize the application
function init() {
  console.log("🚀 Initializing Paima Explorer...");

  // Initialize chains with dummy data
  initializeChains();

  // Setup block generators for non-RPC chains
  setupBlockGenerators();

  // Setup RPC polling for RPC chains
  setupRPCPolling();

  // Initialize primitive tables
  initializePrimitiveTables();

  // Initialize static tables
  initializeStaticTables();

  // Legacy: Fetch latest block immediately (for backward compatibility)
  fetchLatestBlock();

  // Legacy: Setup intervals (for backward compatibility)
  setInterval(fetchLatestBlock, 100);
  setInterval(updateConnectionStatus, 1000);

  // Setup data refresh interval
  setInterval(refreshAllData, 1000); // Refresh every second

  console.log("✅ Paima Explorer initialized successfully!");
}

// Error handling for uncaught promises
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

// Initialize when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Add some interactive features
document.addEventListener("click", (event) => {
  if (event.target.closest(".block-item")) {
    const blockItem = event.target.closest(".block-item");
    const blockNumber = blockItem.querySelector(".block-number").textContent;
    const blockHash = blockItem.querySelector(".block-hash").textContent;

    // Copy block hash to clipboard
    navigator.clipboard.writeText(blockHash).then(() => {
      // Visual feedback
      const originalBg = blockItem.style.backgroundColor;
      blockItem.style.backgroundColor = "rgba(76, 175, 80, 0.2)";

      setTimeout(() => {
        blockItem.style.backgroundColor = originalBg;
      }, 300);

      console.log(`📋 Copied to clipboard: ${blockHash}`);
    }).catch((err) => {
      console.error("Failed to copy to clipboard:", err);
    });
  }
});

// Add keyboard shortcuts
document.addEventListener("keydown", (event) => {
  if (event.key === "r" && event.ctrlKey) {
    event.preventDefault();
    fetchLatestBlock();
    console.log("🔄 Manually refreshed latest block");
  }
});

// Primitive Tables Functions
async function fetchConfig() {
  try {
    const response = await fetch(CONFIG_ENDPOINT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const config = await response.json();
    console.log("📋 Fetched config:", config);
    return config;
  } catch (error) {
    console.error("Error fetching config:", error);
    return null;
  }
}

function extractPrimitiveNames(config) {
  const names = [];
  if (!config || !Array.isArray(config)) return names;

  config.forEach((syncProtocolConfig) => {
    if (
      syncProtocolConfig.primitives &&
      Array.isArray(syncProtocolConfig.primitives)
    ) {
      syncProtocolConfig.primitives.forEach((primitive) => {
        if (primitive.primitive && primitive.primitive.name) {
          names.push(primitive.primitive.name);
        }
      });
    }
  });

  return [...new Set(names)]; // Remove duplicates
}

async function fetchPrimitiveData(primitiveName) {
  try {
    const response = await fetch(`${PRIMITIVES_ENDPOINT}/${primitiveName}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`🚫 Primitive ${primitiveName} not found (404)`);
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`📊 Fetched data for ${primitiveName}:`, data);
    return data;
  } catch (error) {
    console.error(`Error fetching primitive data for ${primitiveName}:`, error);
    return null;
  }
}

async function fetchTableData(tableName) {
  try {
    const response = await fetch(`${TABLES_ENDPOINT}/${tableName}`);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`🚫 Table ${tableName} not found (404)`);
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`📊 Fetched table data for ${tableName}:`, data);
    return convertTableDataToPrimitiveFormat(data, tableName);
  } catch (error) {
    console.error(`Error fetching table data for ${tableName}:`, error);
    return null;
  }
}

function convertTableDataToPrimitiveFormat(tableData, tableName) {
  if (!Array.isArray(tableData) || tableData.length === 0) {
    return null;
  }

  // Extract field names from the first row
  const fields = Object.keys(tableData[0]).map((key) => ({
    name: key,
    dataTypeID: 25, // Default to text type
  }));

  return {
    command: "SELECT",
    rowCount: tableData.length,
    rows: tableData,
    fields: fields,
  };
}

function formatCellValue(value, fieldName) {
  if (value === null || value === undefined) return "";

  // Special handling for inputs field (JSON strings)
  if (fieldName === "inputs" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      // Format JSON in a compact but readable way
      const formatted = JSON.stringify(parsed, null, 1).replace(/\n/g, "<br>");
      return `<code style="font-size: 0.75em; background: rgba(0,0,0,0.1); padding: 4px 6px; border-radius: 3px; display: block; white-space: pre-wrap; max-height: 80px; overflow-y: auto;">${formatted}</code>`;
    } catch (e) {
      // If not valid JSON, return as is
      return value.toString();
    }
  }

  // Check if this looks like an Ethereum address
  if (
    typeof value === "string" && value.startsWith("0x") && value.length === 42
  ) {
    return `<span class="address-cell" style="overflow: hidden; text-overflow: ellipsis;" title="${value}">${value}</span>`;
  }

  // Format large numbers
  if (typeof value === "string" && /^\d+$/.test(value) && value.length > 10) {
    const num = BigInt(value);
    if (fieldName && fieldName.toLowerCase().includes("balance")) {
      // Format as ETH (assuming 18 decimals for balance fields)
      const eth = Number(num) / Math.pow(10, 18);
      return `${eth.toFixed(6)} ETH`;
    }
    return num.toString();
  }

  return value.toString();
}

function createPrimitiveTable(primitiveName, data) {
  if (!data || !data.rows || !data.fields) {
    console.error(`Invalid data structure for ${primitiveName}`);
    return null;
  }

  const container = document.createElement("div");
  container.className = "primitive-table-container";

  const title = document.createElement("h3");
  title.className = "primitive-table-title";
  title.textContent = primitiveName;

  const table = document.createElement("table");
  table.className = "primitive-table";

  // Create header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  data.fields.forEach((field) => {
    const th = document.createElement("th");
    th.textContent = field.name.replace(/_/g, " ").toUpperCase();
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create body
  const tbody = document.createElement("tbody");

  data.rows.forEach((row) => {
    const tr = document.createElement("tr");

    data.fields.forEach((field) => {
      const td = document.createElement("td");
      const value = row[field.name];
      const formattedValue = formatCellValue(value, field.name);
      td.innerHTML = formattedValue;

      // Add title attribute for full content on hover (strip HTML for tooltip)
      const plainTextValue = value ? value.toString() : "";
      if (plainTextValue.length > 30) {
        td.title = plainTextValue;
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(title);
  container.appendChild(table);

  // Add scroll indicator if table has more than 6 rows
  if (data.rows.length > 6) {
    container.classList.add("has-scroll");
  }

  return container;
}

function renderPrimitiveTables() {
  const container = document.getElementById("primitive-tables");
  if (!container) return;

  // Clear existing content
  container.innerHTML = "";

  // Check if we have any primitive names configured
  if (primitiveNames.length === 0) {
    container.innerHTML =
      '<div class="table-loading">Loading primitive configuration...</div>';
    return;
  }

  // Check if we have tried to fetch data but got no results
  const hasAnyData = Object.values(primitiveData).some((data) =>
    data !== null && data !== undefined
  );

  if (Object.keys(primitiveData).length === 0) {
    // Haven't fetched data yet
    container.innerHTML =
      '<div class="table-loading">Loading primitive data...</div>';
    return;
  }

  if (!hasAnyData) {
    // Fetched data but all primitives returned 404 or no data
    container.innerHTML =
      '<div class="table-error">No primitive data available</div>';
    return;
  }

  // Create tables for each primitive with data
  let tablesCreated = 0;
  Object.entries(primitiveData).forEach(([primitiveName, data]) => {
    if (data) {
      const tableElement = createPrimitiveTable(primitiveName, data);
      if (tableElement) {
        container.appendChild(tableElement);
        tablesCreated++;
      }
    }
  });

  // Show message if no tables were actually created
  if (tablesCreated === 0) {
    container.innerHTML =
      '<div class="table-error">No primitive data available</div>';
  }
}

function renderStaticTables() {
  const container = document.getElementById("static-tables");
  if (!container) return;

  // Clear existing content
  container.innerHTML = "";

  // Check if we have tried to fetch data but got no results
  const hasAnyData = Object.values(staticTableData).some((data) =>
    data !== null && data !== undefined
  );

  if (Object.keys(staticTableData).length === 0) {
    // Haven't fetched data yet
    container.innerHTML =
      '<div class="table-loading">Loading state machine tables...</div>';
    return;
  }

  if (!hasAnyData) {
    // Fetched data but all tables returned 404 or no data
    container.innerHTML =
      '<div class="table-error">No state machine tables available</div>';
    return;
  }

  // Create tables for static table data
  let tablesCreated = 0;
  Object.entries(staticTableData).forEach(([tableName, data]) => {
    if (data) {
      const tableElement = createPrimitiveTable(tableName, data);
      if (tableElement) {
        container.appendChild(tableElement);
        tablesCreated++;
      }
    }
  });

  // Show message if no tables were actually created
  if (tablesCreated === 0) {
    container.innerHTML =
      '<div class="table-error">No state machine tables available</div>';
  }
}

async function initializePrimitiveTables() {
  console.log("📋 Initializing primitive tables...");

  // Show loading state
  renderPrimitiveTables();

  try {
    // Fetch configuration
    const config = await fetchConfig();
    if (!config) {
      console.error("Failed to fetch config");
      return;
    }

    // Extract primitive names
    primitiveNames = extractPrimitiveNames(config);
    console.log("📊 Found primitives:", primitiveNames);

    if (primitiveNames.length === 0) {
      console.log("No primitives found in config");
      renderPrimitiveTables();
      return;
    }

    // Fetch data for each primitive
    const fetchPromises = primitiveNames.map(async (primitiveName) => {
      const data = await fetchPrimitiveData(primitiveName);
      // Always store the result, even if null (404), so we know we tried to fetch
      primitiveData[primitiveName] = data;
    });

    await Promise.all(fetchPromises);

    // Render primitive tables
    renderPrimitiveTables();

    console.log("✅ Primitive tables initialized");
  } catch (error) {
    console.error("Error initializing primitive tables:", error);
    const container = document.getElementById("primitive-tables");
    if (container) {
      container.innerHTML =
        '<div class="table-error">Error loading primitive data</div>';
    }
  }
}

async function initializeStaticTables() {
  console.log("📋 Initializing state machine tables...");

  // Show loading state
  renderStaticTables();

  try {
    // Fetch static table data
    const staticTablePromises = [
      fetchTableData("example_sm").then((data) => {
        // Always store the result, even if null (404), so we know we tried to fetch
        staticTableData["example_sm"] = data;
      }),
    ];

    await Promise.all(staticTablePromises);

    // Render static tables
    renderStaticTables();

    console.log("✅ State machine tables initialized");
  } catch (error) {
    console.error("Error initializing state machine tables:", error);
    const container = document.getElementById("static-tables");
    if (container) {
      container.innerHTML =
        '<div class="table-error">Error loading state machine tables</div>';
    }
  }
}

// Function to refresh primitive data
async function refreshPrimitiveData() {
  if (primitiveNames.length === 0) return;

  try {
    // Fetch data for each primitive
    const fetchPromises = primitiveNames.map(async (primitiveName) => {
      const data = await fetchPrimitiveData(primitiveName);
      // Always store the result, even if null (404), so we know we tried to fetch
      primitiveData[primitiveName] = data;
    });

    await Promise.all(fetchPromises);

    // Re-render primitive tables with updated data
    renderPrimitiveTables();
  } catch (error) {
    console.error("Error refreshing primitive data:", error);
  }
}

// Function to refresh static table data
async function refreshStaticTableData() {
  try {
    // Fetch static table data
    const staticTablePromises = [
      fetchTableData("example_sm").then((data) => {
        // Always store the result, even if null (404), so we know we tried to fetch
        staticTableData["example_sm"] = data;
      }),
    ];

    await Promise.all(staticTablePromises);

    // Re-render static tables with updated data
    renderStaticTables();
  } catch (error) {
    console.error("Error refreshing static table data:", error);
  }
}

// Function to refresh all data
async function refreshAllData() {
  await Promise.all([
    refreshPrimitiveData(),
    refreshStaticTableData(),
  ]);
}
