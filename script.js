// Yahtzee Roller
// Every random number comes from a remote RESTful API (no Math.random).
// On page load the Node.js server on Azure is "woken up" asynchronously.

// ---------------------------------------------------------
// CONFIG: change these to match your deployed Node.js server
// ---------------------------------------------------------
const API_BASE = "https://YOUR-APP-NAME.azurewebsites.net"; // your Azure Node.js app
const WAKE_PATH = "/";                                      // any cheap GET route on the server
const RANDOM_PATH = "/api/random";                          // route that returns one random number

// Build the URL for one die. Adjust the query string to whatever your API expects.
function randomUrl() {
  return `${API_BASE}${RANDOM_PATH}?min=1&max=6`;
}

// A different domain that does NOT send Access-Control-Allow-Origin.
// The browser will block the response, which demonstrates a CORS failure.
const CORS_FAIL_URL = "https://example.com/";

const DIE_COUNT = 5;

// Which pip positions light up for each face value, 1 through 6.
const PIP_LAYOUT = {
  1: ["2-2"],
  2: ["1-1", "3-3"],
  3: ["1-1", "2-2", "3-3"],
  4: ["1-1", "1-3", "3-1", "3-3"],
  5: ["1-1", "1-3", "2-2", "3-1", "3-3"],
  6: ["1-1", "1-3", "2-1", "2-3", "3-1", "3-3"],
};

// ---------------------------------------------------------
// Dice drawing (unchanged)
// ---------------------------------------------------------
function buildDieFace(dieEl) {
  const allPositions = ["1-1", "1-3", "2-1", "2-2", "2-3", "3-1", "3-3"];
  allPositions.forEach((pos) => {
    const pip = document.createElement("span");
    pip.className = `pip pos-${pos}`;
    pip.dataset.pos = pos;
    dieEl.appendChild(pip);
  });
}

function setDieFace(dieEl, value) {
  const litPositions = PIP_LAYOUT[value];
  dieEl.querySelectorAll(".pip").forEach((pip) => {
    pip.classList.toggle("on", litPositions.includes(pip.dataset.pos));
  });
}

// ---------------------------------------------------------
// Server status helpers
// ---------------------------------------------------------
function setStatus(state, text) {
  document.getElementById("serverStatus").dataset.state = state;
  document.getElementById("serverStatusText").textContent = text;
}

// fetch() with a timeout so a sleeping server doesn't hang the page forever.
async function fetchWithTimeout(url, ms = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------
// 1) Asynchronously wake up the Node.js server
//    Not awaited by the caller, so the page stays responsive.
// ---------------------------------------------------------
async function wakeUpServer() {
  setStatus("waking", "Server: waking up (first request can take a while)...");
  try {
    const response = await fetchWithTimeout(`${API_BASE}${WAKE_PATH}`, 60000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setStatus("ready", "Server: awake and ready");
  } catch (err) {
    console.error("Wake-up call failed:", err);
    setStatus("error", "Server: could not be reached (check API_BASE and CORS)");
  }
}

// ---------------------------------------------------------
// 2) Get a random number from the remote REST API
// ---------------------------------------------------------
// Accepts a plain number ("4"), a JSON number (4), or a JSON object such as
// {"value": 4} / {"random": 4} / {"number": 4}. Adjust if your API differs.
function parseRandomResponse(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (typeof data === "object" && data !== null) {
    data = data.value ?? data.random ?? data.number ?? data.result ?? Object.values(data)[0];
  }
  const n = Number(data);
  if (!Number.isInteger(n) || n < 1 || n > 6) {
    throw new Error(`Unexpected value from API: ${text}`);
  }
  return n;
}

async function fetchRandomDie() {
  const response = await fetchWithTimeout(randomUrl());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseRandomResponse(await response.text());
}

// ---------------------------------------------------------
// 3) Roll all five dice via the API (five requests in parallel)
// ---------------------------------------------------------
async function rollDice() {
  const button = document.getElementById("rollButton");
  button.disabled = true;

  try {
    const values = await Promise.all(
      Array.from({ length: DIE_COUNT }, () => fetchRandomDie())
    );

    let total = 0;
    values.forEach((value, i) => {
      total += value;

      const dieEl = document.getElementById(`die-${i}`);
      setDieFace(dieEl, value);
      document.getElementById(`value-${i}`).value = value;

      // Restart the tumble animation for this die.
      dieEl.classList.remove("rolling");
      void dieEl.offsetWidth; // force reflow so the animation can replay
      dieEl.classList.add("rolling");
    });

    document.getElementById("total").value = total;
    setStatus("ready", "Server: awake and ready");
  } catch (err) {
    console.error("Roll failed:", err);
    setStatus("error", "Server: roll failed (is it awake? is CORS enabled?)");
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------
// 4) Demonstrate a CORS failure
// ---------------------------------------------------------
async function triggerCorsFailure() {
  const out = document.getElementById("corsResult");
  out.textContent = `Requesting ${CORS_FAIL_URL} ...`;
  try {
    const response = await fetch(CORS_FAIL_URL);
    out.textContent = `Unexpected success (HTTP ${response.status}). This server allows cross-origin requests.`;
  } catch (err) {
    // The browser hides the exact reason from JavaScript; it is only in the console.
    out.textContent =
      "CORS failure: the browser blocked the response because the server did not send " +
      "Access-Control-Allow-Origin. Open DevTools > Console to see the full error.";
    console.error("Expected CORS failure:", err);
  }
}

// ---------------------------------------------------------
// Startup
// ---------------------------------------------------------
function handleLoad() {
  for (let i = 0; i < DIE_COUNT; i++) {
    buildDieFace(document.getElementById(`die-${i}`));
  }

  // Fire-and-forget: wake the server in the background, then do the first roll
  // once it responds (so the first roll isn't stuck behind a cold start).
  wakeUpServer().then(rollDice);

  document.getElementById("rollButton").focus();
}

document.getElementById("rollButton").addEventListener("click", rollDice);
document.getElementById("corsButton").addEventListener("click", triggerCorsFailure);
window.addEventListener("load", handleLoad);