const $ = (selector) => document.querySelector(selector);
const sourceList = $("#source-list");
const selectedSources = new Set();
let activeSession = null;
let toastTimer;

function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function safeMessageMarkup(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\[(S\d+)\]/g, '<span class="citation-tag">[$1]</span>');
  return safe;
}

function addMessage(role, text, copy = false) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  const label = role === "assistant" ? "R" : "Y";
  const body = role === "assistant" ? safeMessageMarkup(text) : escapeHtml(text);
  wrap.innerHTML = `<div class="message-avatar">${label}</div><div class="message-body"><div class="message-role">${role === "assistant" ? "ResearchAI" : "You"}</div><div class="message-text">${body}</div>${copy ? '<button class="message-copy">Copy answer</button>' : ""}</div>`;
  if (copy) wrap.querySelector(".message-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(text).then(() => notify("Answer copied."));
  });
  $("#messages").append(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderEvidence(sources) {
  $("#evidence-count").textContent = String(sources.length);
  $("#evidence-list").replaceChildren();
  $(".panel-intro").textContent = sources.length
    ? "Relevant passages used to ground this answer."
    : "Evidence retrieved for your latest answer will appear here.";
  for (const source of sources) {
    const card = document.createElement("article");
    card.className = "evidence-card";
    const top = document.createElement("div");
    top.className = "evidence-top";
    const tag = document.createElement("span");
    tag.className = "citation-tag";
    tag.textContent = `[${source.citation}]`;
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title;
    top.append(tag, link);
    const excerpt = document.createElement("p");
    excerpt.textContent = source.text;
    const domain = document.createElement("div");
    domain.className = "evidence-domain";
    domain.textContent = new URL(source.url).hostname;
    card.append(top, excerpt, domain);
    $("#evidence-list").append(card);
  }
}

async function loadSources() {
  const sources = await api("/api/sources");
  $("#source-count").textContent = sources.length;
  sourceList.replaceChildren();
  if (!sources.length) {
    const empty = document.createElement("div");
    empty.className = "empty-sources";
    empty.textContent = "Your indexed websites will show up here.";
    sourceList.append(empty);
  }
  for (const source of sources) {
    const row = document.createElement("div");
    row.className = "source-item";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "source-check";
    check.checked = selectedSources.has(source.id);
    check.setAttribute("aria-label", `Include ${source.title}`);
    check.addEventListener("change", () => {
      check.checked ? selectedSources.add(source.id) : selectedSources.delete(source.id);
      $("#selected-count").textContent = selectedSources.size ? `${selectedSources.size} selected` : "All sources";
    });
    const title = document.createElement("span");
    title.className = "source-title";
    title.title = source.title;
    title.textContent = source.title;
    const remove = document.createElement("button");
    remove.className = "delete-source";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${source.title}`);
    remove.addEventListener("click", async () => {
      if (!confirm(`Remove "${source.title}" and its indexed content?`)) return;
      try {
        await api(`/api/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
        selectedSources.delete(source.id);
        await loadSources();
        notify("Website removed.");
      } catch (error) { notify(error.message, true); }
    });
    row.append(check, title, remove);
    sourceList.append(row);
  }
  $("#selected-count").textContent = selectedSources.size ? `${selectedSources.size} selected` : "All sources";
}

async function loadSessions() {
  const sessions = await api("/api/sessions");
  const list = $("#session-list");
  list.replaceChildren();
  for (const session of sessions.slice(0, 8)) {
    const button = document.createElement("button");
    button.className = "session-item";
    button.textContent = session.title;
    button.title = session.title;
    button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/sessions/${encodeURIComponent(session.id)}`);
        activeSession = session.id;
        $("#messages").replaceChildren();
        let latestSources = [];
        for (const message of data.messages) {
          addMessage(message.role, message.content, message.role === "assistant");
          if (message.sources?.length) latestSources = message.sources;
        }
        renderEvidence(latestSources);
        revealChat();
        $("#sidebar").classList.remove("open");
      } catch (error) { notify(error.message, true); }
    });
    list.append(button);
  }
}

function revealChat() {
  $("#welcome").classList.add("hidden");
  $("#conversation").classList.remove("hidden");
}

async function addSource(url) {
  $("#add-button").disabled = true;
  $("#add-button").innerHTML = "Indexing…";
  try {
    const source = await api("/api/sources", { method: "POST", body: JSON.stringify({ url }) });
    await loadSources();
    revealChat();
    $("#indexed-banner").querySelector("b").textContent = `${source.title} is ready`;
    $("#indexed-banner").querySelector("small").textContent = `${source.chunks} passages indexed. Ask a question to explore it.`;
    notify("Website indexed successfully.");
    $("#url-input").value = "";
  } catch (error) { notify(error.message, true); }
  finally {
    $("#add-button").disabled = false;
    $("#add-button").innerHTML = 'Add website <span>→</span>';
  }
}

async function sendQuestion(question) {
  if (!question.trim()) return;
  revealChat();
  $("#question-input").value = "";
  $("#question-input").style.height = "auto";
  addMessage("user", question);
  const typing = document.createElement("div");
  typing.className = "message";
  typing.innerHTML = '<div class="message-avatar">R</div><div class="message-body"><div class="message-role">ResearchAI</div><div class="typing"><i></i><i></i><i></i></div></div>';
  $("#messages").append(typing);
  $("#send-button").disabled = true;
  try {
    const data = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        question, model: $("#model-select").value, session_id: activeSession,
        source_ids: [...selectedSources],
      }),
    });
    activeSession = data.session_id;
    await loadSessions();
    typing.remove();
    addMessage("assistant", data.answer, true);
    renderEvidence(data.sources);
  } catch (error) {
    typing.remove();
    addMessage("assistant", error.message);
    notify(error.message, true);
  } finally { $("#send-button").disabled = false; }
}

$("#add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  addSource($("#url-input").value);
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion($("#question-input").value);
});
$("#question-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
$("#question-input").addEventListener("input", (event) => {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
});
document.querySelectorAll(".starter-card").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.url) {
    $("#url-input").value = button.dataset.url;
    $("#add-form").requestSubmit();
  } else if (button.dataset.question) sendQuestion(button.dataset.question);
}));
$("#new-session").addEventListener("click", async () => {
  try {
    const result = await api("/api/sessions", { method: "POST", body: "{}" });
    activeSession = result.id;
    await loadSessions();
    $("#messages").replaceChildren();
    renderEvidence([]);
    revealChat();
    $("#indexed-banner").querySelector("b").textContent = "New research session";
    $("#indexed-banner").querySelector("small").textContent = "Ask a question to explore what you’ve indexed.";
    $("#sidebar").classList.remove("open");
  } catch (error) { notify(error.message, true); }
});
$("#theme-toggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("researchai-dark", document.body.classList.contains("dark") ? "1" : "0");
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
if (localStorage.getItem("researchai-dark") === "1") document.body.classList.add("dark");

Promise.all([loadSources(), loadSessions(), api("/api/health")]).then(([, , health]) => {
  const dot = $("#connection-dot");
  dot.classList.toggle("online", health.ollama);
  dot.classList.toggle("offline", !health.ollama);
  $("#connection-label").textContent = health.ollama ? "Ollama connected" : "Ollama unavailable";
}).catch((error) => {
  $("#connection-dot").classList.add("offline");
  $("#connection-label").textContent = "Ollama unavailable";
  notify(error.message, true);
});
