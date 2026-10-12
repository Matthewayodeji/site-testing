(() => {
  "use strict";

  const STORAGE_KEY = "deetech-soc-workspace-v1";
  const THEME_KEY = "deetech-soc-theme";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = loadState();
  let toastTimer;

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      console.error("Unable to load the saved theme preference.", error);
      return "light";
    }
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const toggle = $("#themeToggle");
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    toggle.setAttribute("title", `Switch to ${nextTheme} mode`);
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return { cases: [], findings: [], scopes: [] };
      const parsed = JSON.parse(saved);
      let findingsMigrated = false;
      const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map((finding) => {
        if (Number.isInteger(finding.riskScore) && finding.riskScore >= 0 && finding.riskScore <= 100) return finding;
        findingsMigrated = true;
        const legacyScores = { Critical: 95, High: 80, Medium: 55, Low: 25, Informational: 15 };
        return { ...finding, riskScore: legacyScores[finding.severity] ?? 50 };
      });
      if (findingsMigrated) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, findings }));
        } catch (error) {
          console.error("Unable to save migrated finding risk scores.", error);
        }
      }
      return {
        cases: Array.isArray(parsed.cases) ? parsed.cases : [],
        findings,
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes : [],
      };
    } catch (error) {
      console.error("Unable to load the local workspace.", error);
      return { cases: [], findings: [], scopes: [] };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Unable to save the local workspace.", error);
      showToast("Could not save. Check browser storage settings.");
      return false;
    }
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function displayDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function relativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return displayDate(value.slice(0, 10));
  }

  function slug(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function riskLevel(score) {
    if (score >= 90) return "Critical";
    if (score >= 70) return "High";
    if (score >= 40) return "Medium";
    return "Low";
  }

  function isScopeCurrent(scope) {
    const today = localDate(new Date());
    return scope.startDate <= today && scope.endDate >= today;
  }

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function scopeState(scope) {
    const today = localDate(new Date());
    if (scope.endDate < today) return ["Expired", "expired"];
    if (scope.startDate > today) return ["Upcoming", "pending"];
    return ["Current", "current"];
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function showView(name) {
    const labels = { overview: "Overview", cases: "Review cases", findings: "Findings", scope: "Scope & authorization" };
    $$(".view-panel").forEach((panel) => panel.classList.add("hidden"));
    $(`#${name}View`).classList.remove("hidden");
    $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
    $("#breadcrumbCurrent").textContent = labels[name];
    if (name === "cases") renderCases();
    if (name === "findings") renderFindings();
    if (name === "scope") renderScopes();
  }

  function openModal(idToOpen) {
    if (idToOpen === "caseModal") populateCaseScopeSelect();
    if (idToOpen === "findingModal") populateFindingCaseSelect();
    const modal = $(`#${idToOpen}`);
    modal.classList.remove("hidden");
    const focusable = $("input:not([type=checkbox]),select,textarea,button", modal);
    focusable?.focus();
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
    const form = $("form", modal);
    if (form) form.reset();
    const error = $(".form-error", modal);
    if (error) error.textContent = "";
  }

  function populateCaseScopeSelect() {
    const select = $("#caseScopeSelect");
    const current = state.scopes.filter(isScopeCurrent);
    select.innerHTML = '<option value="">Select a current authorization</option>' +
      current.map((scope) => `<option value="${escapeHtml(scope.id)}">${escapeHtml(scope.domain)} — ${escapeHtml(scope.approver)}</option>`).join("");
    select.disabled = current.length === 0;
    if (!current.length) {
      select.innerHTML = '<option value="">No current authorization — add one first</option>';
      $("#caseError").textContent = "Add a current authorization record before creating a review.";
    }
  }

  function populateFindingCaseSelect() {
    const select = $("#findingCaseSelect");
    select.innerHTML = '<option value="">Select a review case</option>' +
      state.cases.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} — ${escapeHtml(item.domain)}</option>`).join("");
    select.disabled = state.cases.length === 0;
    if (!state.cases.length) $("#findingError").textContent = "Create a review case before logging a finding.";
  }

  function findingCount(caseId) {
    return state.findings.filter((finding) => finding.caseId === caseId).length;
  }

  function caseRow(item, detailed = false) {
    const count = findingCount(item.id);
    const cells = detailed
      ? `<td><span class="case-domain">${escapeHtml(item.domain)}</span></td><td><span class="status-badge status-${slug(item.status)}">${escapeHtml(item.status)}</span></td><td><span class="finding-count">${count}</span></td><td class="row-date">${relativeDate(item.updatedAt)}</td>`
      : `<td><span class="status-badge status-${slug(item.status)}">${escapeHtml(item.status)}</span></td><td><span class="finding-count">${count}</span></td><td class="row-date">${relativeDate(item.updatedAt)}</td>`;
    return `<tr><td><div class="case-title">${escapeHtml(item.title)}</div><div class="case-domain">${escapeHtml(item.domain)}</div></td>${cells}<td><button class="row-actions delete-case" data-id="${escapeHtml(item.id)}" title="Delete review" aria-label="Delete ${escapeHtml(item.title)}">×</button></td></tr>`;
  }

  function renderCases() {
    const recent = [...state.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
    $("#recentCasesBody").innerHTML = recent.map((item) => caseRow(item)).join("");
    $("#emptyCases").classList.toggle("visible", state.cases.length === 0);

    const query = ($("#caseSearch")?.value || "").trim().toLowerCase();
    const status = $("#caseStatusFilter")?.value || "";
    const filtered = [...state.cases].filter((item) =>
      (!query || `${item.title} ${item.domain} ${item.assignee || ""}`.toLowerCase().includes(query)) &&
      (!status || item.status === status)
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $("#allCasesBody").innerHTML = filtered.map((item) => caseRow(item, true)).join("");
    $("#casesEmpty").classList.toggle("visible", filtered.length === 0);
    $$(".delete-case").forEach((button) => button.addEventListener("click", () => deleteCase(button.dataset.id)));
    updateStats();
  }

  function findingRow(item) {
    const review = state.cases.find((reviewCase) => reviewCase.id === item.caseId);
    const level = riskLevel(item.riskScore);
    return `<tr><td><div class="case-title">${escapeHtml(item.title)}</div><div class="case-domain">${escapeHtml(review?.domain || "Review removed")}</div></td><td><span class="case-domain">${escapeHtml(review?.title || "—")}</span></td><td><span class="risk-score">${item.riskScore}<span>/100</span></span></td><td><span class="severity-badge severity-${slug(level)}">${level}</span></td><td><span class="status-badge status-${slug(item.status)}">${escapeHtml(item.status)}</span></td><td class="row-date">${relativeDate(item.createdAt)}</td><td><button class="row-actions delete-finding" data-id="${escapeHtml(item.id)}" title="Delete finding" aria-label="Delete ${escapeHtml(item.title)}">×</button></td></tr>`;
  }

  function renderFindings() {
    const query = ($("#findingSearch")?.value || "").trim().toLowerCase();
    const levelFilter = $("#findingRiskLevelFilter")?.value || "";
    const filtered = [...state.findings].filter((item) =>
      (!query || `${item.title} ${item.description || ""}`.toLowerCase().includes(query)) &&
      (!levelFilter || riskLevel(item.riskScore) === levelFilter)
    ).sort((a, b) => b.riskScore - a.riskScore || b.createdAt.localeCompare(a.createdAt));
    $("#allFindingsBody").innerHTML = filtered.map(findingRow).join("");
    $("#findingsEmpty").classList.toggle("visible", filtered.length === 0);
    $$(".delete-finding").forEach((button) => button.addEventListener("click", () => deleteFinding(button.dataset.id)));
    renderPriority();
    updateStats();
  }

  function renderPriority() {
    const active = [...state.findings].filter((item) => item.status === "Open" || item.status === "In progress")
      .sort((a, b) => b.riskScore - a.riskScore || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
    $("#priorityList").innerHTML = active.map((item) => {
      const review = state.cases.find((reviewCase) => reviewCase.id === item.caseId);
      const level = riskLevel(item.riskScore);
      return `<div class="priority-item"><span class="priority-bar severity-${slug(level)}"></span><div><div class="priority-title">${escapeHtml(item.title)}</div><div class="priority-meta">${item.riskScore}/100 · ${escapeHtml(review?.domain || "Review removed")} · ${relativeDate(item.createdAt)}</div></div><span class="severity-badge severity-${slug(level)}">${level}</span></div>`;
    }).join("");
    $("#emptyFindings").classList.toggle("visible", active.length === 0);
  }

  function renderScopes() {
    const list = [...state.scopes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#scopeCount").textContent = `${list.length} RECORD${list.length === 1 ? "" : "S"}`;
    $("#scopeList").innerHTML = list.map((scope) => {
      const [label, stateClass] = scopeState(scope);
      return `<article class="scope-card"><div><span class="scope-field-label">AUTHORIZED DOMAIN</span><div class="scope-domain">${escapeHtml(scope.domain)}</div><div class="scope-field-value scope-secondary">${escapeHtml(scope.activities || "Activities not specified")}</div></div><div><span class="scope-field-label">APPROVER / OWNER</span><div class="scope-field-value">${escapeHtml(scope.approver)}</div><div class="scope-field-value scope-secondary">${escapeHtml(scope.reference || "No reference ID")}</div></div><div><span class="scope-field-label">AUTHORIZATION PERIOD</span><div class="scope-dates">${displayDate(scope.startDate)} – ${displayDate(scope.endDate)}</div></div><div class="scope-actions"><span class="scope-valid ${stateClass}">${label}</span><button class="row-actions delete-scope" data-id="${escapeHtml(scope.id)}" title="Delete record" aria-label="Delete authorization for ${escapeHtml(scope.domain)}">×</button></div></article>`;
    }).join("");
    $("#scopeEmpty").classList.toggle("visible", list.length === 0);
    $$(".delete-scope").forEach((button) => button.addEventListener("click", () => deleteScope(button.dataset.id)));
    updateStats();
  }

  function updateStats() {
    const activeCases = state.cases.filter((item) => item.status !== "Complete").length;
    const openFindings = state.findings.filter((item) => item.status === "Open" || item.status === "In progress").length;
    const urgent = state.findings.filter((item) => ["Critical", "High"].includes(riskLevel(item.riskScore)) && (item.status === "Open" || item.status === "In progress")).length;
    const activeScopes = state.scopes.filter(isScopeCurrent).length;
    $("#openReviewsStat").textContent = activeCases;
    $("#triageStat").textContent = openFindings;
    $("#urgentStat").textContent = urgent;
    $("#authorizedStat").innerHTML = `${activeScopes}<span class="stat-unit"> ${activeScopes === 1 ? "scope" : "scopes"}</span>`;
    $("#caseNavCount").textContent = state.cases.length;
    $("#findingNavCount").textContent = state.findings.length;
  }

  function validateDomain(input) {
    const domain = input.trim().toLowerCase().replace(/\.$/, "");
    if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(domain)) {
      return null;
    }
    return domain;
  }

  function deleteCase(caseId) {
    const item = state.cases.find((review) => review.id === caseId);
    if (!item || !confirm(`Delete "${item.title}" and its findings?`)) return;
    state.cases = state.cases.filter((review) => review.id !== caseId);
    state.findings = state.findings.filter((finding) => finding.caseId !== caseId);
    if (!saveState()) return;
    refresh();
    showToast("Review and related findings deleted.");
  }

  function deleteFinding(findingId) {
    const item = state.findings.find((finding) => finding.id === findingId);
    if (!item || !confirm(`Delete finding "${item.title}"?`)) return;
    state.findings = state.findings.filter((finding) => finding.id !== findingId);
    if (!saveState()) return;
    refresh();
    showToast("Finding deleted.");
  }

  function deleteScope(scopeId) {
    const item = state.scopes.find((scope) => scope.id === scopeId);
    if (!item || !confirm(`Delete the authorization record for ${item.domain}?`)) return;
    if (state.cases.some((reviewCase) => reviewCase.scopeId === scopeId)) {
      showToast("This authorization is linked to a review case and cannot be deleted.");
      return;
    }
    state.scopes = state.scopes.filter((scope) => scope.id !== scopeId);
    if (!saveState()) return;
    refresh();
    showToast("Authorization record deleted.");
  }

  function refresh() {
    renderCases();
    renderFindings();
    renderScopes();
  }

  function exportWorkspace() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `deetech-soc-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Workspace backup downloaded.");
  }

  function bindEvents() {
    $$(".nav-item[data-view], [data-view]:not(.nav-item)").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
    $$("[data-open-modal]").forEach((button) => button.addEventListener("click", () => openModal(button.dataset.openModal)));
    $$("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop"))));
    $$(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeModal(backdrop);
    }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") $$(".modal-backdrop:not(.hidden)").forEach(closeModal);
    });
    $("#exportButton").addEventListener("click", exportWorkspace);
    $("#helpButton").addEventListener("click", () => openModal("helpModal"));
    $("#themeToggle").addEventListener("click", () => {
      const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      try {
        localStorage.setItem(THEME_KEY, nextTheme);
      } catch (error) {
        console.error("Unable to save the theme preference.", error);
        showToast("Theme changed, but the preference could not be saved.");
      }
    });
    $("#caseSearch").addEventListener("input", renderCases);
    $("#caseStatusFilter").addEventListener("change", renderCases);
    $("#findingSearch").addEventListener("input", renderFindings);
    $("#findingRiskLevelFilter").addEventListener("change", renderFindings);
    $("#findingRiskScore").addEventListener("input", updateRiskPreview);

    $("#scopeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const domain = validateDomain(form.get("domain"));
      const startDate = form.get("startDate");
      const endDate = form.get("endDate");
      const error = $("#scopeError");
      error.textContent = "";
      if (!domain) { error.textContent = "Enter a valid domain, without a protocol, path, or port."; return; }
      if (endDate < startDate) { error.textContent = "The authorization end date must be on or after the start date."; return; }
      const scope = {
        id: id(), domain, approver: String(form.get("approver")).trim(),
        reference: String(form.get("reference")).trim(), startDate, endDate,
        activities: String(form.get("activities")).trim(), createdAt: new Date().toISOString(),
      };
      state.scopes.push(scope);
      if (!saveState()) { state.scopes.pop(); return; }
      closeModal($("#scopeModal"));
      refresh();
      showToast("Authorization record saved.");
    });

    $("#caseForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const domain = validateDomain(form.get("domain"));
      const scope = state.scopes.find((item) => item.id === form.get("scopeId"));
      const error = $("#caseError");
      error.textContent = "";
      if (!domain) { error.textContent = "Enter a valid domain, without a protocol, path, or port."; return; }
      if (!scope || !isScopeCurrent(scope)) { error.textContent = "Select a current authorization record."; return; }
      if (scope.domain !== domain && !domain.endsWith(`.${scope.domain}`)) {
        error.textContent = `The target must be within the authorized domain ${scope.domain}.`;
        return;
      }
      const now = new Date().toISOString();
      state.cases.push({
        id: id(), title: String(form.get("title")).trim(), domain, scopeId: scope.id,
        status: form.get("status"), assignee: String(form.get("assignee")).trim(),
        notes: String(form.get("notes")).trim(), createdAt: now, updatedAt: now,
      });
      if (!saveState()) { state.cases.pop(); return; }
      closeModal($("#caseModal"));
      refresh();
      showToast("Review case created.");
    });

    $("#findingForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const reviewCase = state.cases.find((item) => item.id === form.get("caseId"));
      if (!reviewCase) { $("#findingError").textContent = "Select an existing review case."; return; }
      const riskScore = Number(form.get("riskScore"));
      if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) {
        $("#findingError").textContent = "Enter a whole-number risk score from 0 to 100.";
        return;
      }
      const finding = {
        id: id(), title: String(form.get("title")).trim(), caseId: reviewCase.id,
        riskScore, status: form.get("status"),
        description: String(form.get("description")).trim(), createdAt: new Date().toISOString(),
      };
      state.findings.push(finding);
      reviewCase.updatedAt = finding.createdAt;
      if (!saveState()) { state.findings.pop(); return; }
      closeModal($("#findingModal"));
      refresh();
      showToast("Finding recorded.");
    });
  }

  function updateRiskPreview() {
    const input = $("#findingRiskScore");
    const preview = $("#riskLevelPreview");
    const score = Number(input.value);
    const valid = input.value !== "" && Number.isInteger(score) && score >= 0 && score <= 100;
    preview.textContent = valid ? riskLevel(score) : "Enter 0–100";
    preview.className = valid ? `risk-preview severity-${slug(riskLevel(score))}` : "risk-preview";
  }

  $("#todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  applyTheme(getTheme());
  bindEvents();
  refresh();
})();
