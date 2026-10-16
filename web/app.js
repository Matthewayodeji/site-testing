(() => {
  "use strict";

  const STORAGE_KEY = "deetech-soc-workspace-v1";
  const THEME_KEY = "deetech-soc-theme";
  const CLOUD_CONTROLS = [
    { id: "identity-mfa", category: "Identity", title: "Multi-factor authentication", guidance: "Review whether MFA is enforced for administrator and other privileged accounts, including emergency access procedures." },
    { id: "least-privilege", category: "Identity", title: "Least-privilege access", guidance: "Review assigned roles and policies for excessive or stale permissions; verify access has an owner and review cadence." },
    { id: "public-storage", category: "Data protection", title: "Public storage access", guidance: "Review storage account and bucket policies for unintended public access and confirm any exceptions are documented." },
    { id: "encryption", category: "Data protection", title: "Encryption settings", guidance: "Review encryption-at-rest settings for storage and databases, and confirm encryption in transit is required where applicable." },
    { id: "audit-logging", category: "Detection", title: "Audit logging", guidance: "Review whether control-plane and relevant data-access logs are enabled, protected from alteration, and retained per policy." },
    { id: "network-exposure", category: "Network", title: "Network exposure", guidance: "Review firewall and security-group rules for unnecessary public ingress, especially administrative services; verify approved exceptions." },
    { id: "backup-recovery", category: "Resilience", title: "Backup and recovery", guidance: "Review backup coverage, access protections, retention, and evidence of a recent restore exercise." },
    { id: "secret-management", category: "Data protection", title: "Secret management", guidance: "Review whether application secrets are kept in an approved secrets manager, access is restricted, and rotation is defined." },
    { id: "security-alerts", category: "Detection", title: "Security alerts", guidance: "Review cloud security alerts and findings for ownership, notification routing, and a documented response process." },
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = loadState();
  let toastTimer;
  let editingCaseId = null;

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
      if (!saved) return { cases: [], findings: [], scopes: [], hosts: [], apiChecks: [], cloudChecks: [] };
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
        hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
        apiChecks: Array.isArray(parsed.apiChecks) ? parsed.apiChecks : [],
        cloudChecks: Array.isArray(parsed.cloudChecks) ? parsed.cloudChecks : [],
      };
    } catch (error) {
      console.error("Unable to load the local workspace.", error);
      return { cases: [], findings: [], scopes: [], hosts: [], apiChecks: [], cloudChecks: [] };
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
    const labels = { overview: "Overview", cases: "Review cases", findings: "Findings", scope: "Scope & authorization", network: "Hosts & API", cloud: "Cloud review" };
    $$(".view-panel").forEach((panel) => panel.classList.add("hidden"));
    $(`#${name}View`).classList.remove("hidden");
    $$(".nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
    $("#breadcrumbCurrent").textContent = labels[name];
    if (name === "cases") renderCases();
    if (name === "findings") renderFindings();
    if (name === "scope") renderScopes();
    if (name === "network") renderNetworkRecords();
    if (name === "cloud") renderCloudChecks();
  }

  function openModal(idToOpen) {
    if (idToOpen === "caseModal") populateCaseScopeSelect();
    if (idToOpen === "findingModal") populateFindingCaseSelect();
    if (idToOpen === "hostModal") populateNetworkScopeSelect($("#hostScopeSelect"), true);
    if (idToOpen === "apiCheckModal") populateNetworkScopeSelect($("#apiScopeSelect"), false);
    if (idToOpen === "cloudCheckModal") populateCloudControlSelect();
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
    if (modal.id === "caseModal") {
      editingCaseId = null;
      $("#caseForm [name=domain]").readOnly = false;
      $("#caseScopeSelect").disabled = false;
      $("#caseDomainHelp").textContent = "Enter a domain or IPv4 address covered by the selected authorization. It will be recorded, not contacted.";
      $("#caseModalTitle").textContent = "Create review case";
      $("#caseSubmit").textContent = "Create review";
    }
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

  function populateNetworkScopeSelect(select, ipOnly) {
    const scopes = state.scopes.filter((scope) => isScopeCurrent(scope) &&
      (!ipOnly || parseIPv4(scope.domain) !== null || parseIPv4Cidr(scope.domain) !== null));
    select.innerHTML = '<option value="">Select a current authorization</option>' +
      scopes.map((scope) => `<option value="${escapeHtml(scope.id)}">${escapeHtml(scope.domain)} — ${escapeHtml(scope.approver)}</option>`).join("");
    select.disabled = scopes.length === 0;
    const error = $(`#${ipOnly ? "hostError" : "apiCheckError"}`);
    if (!scopes.length) {
      select.innerHTML = `<option value="">No current ${ipOnly ? "IP" : ""} authorization — add one first</option>`;
      error.textContent = ipOnly
        ? "Add a current IPv4 or CIDR authorization before recording a host."
        : "Add a current authorization record before recording an API check.";
    }
  }

  function populateCloudControlSelect() {
    const select = $("#cloudControlSelect");
    select.innerHTML = CLOUD_CONTROLS.map((control) =>
      `<option value="${escapeHtml(control.id)}">${escapeHtml(control.category)} — ${escapeHtml(control.title)}</option>`
    ).join("");
    updateCloudGuidance();
  }

  function findingCount(caseId) {
    return state.findings.filter((finding) => finding.caseId === caseId).length;
  }

  function caseRow(item, detailed = false) {
    const count = findingCount(item.id);
    const cells = detailed
      ? `<td><span class="case-domain">${escapeHtml(item.domain)}</span></td><td><span class="status-badge status-${slug(item.status)}">${escapeHtml(item.status)}</span></td><td><span class="finding-count">${count}</span></td><td class="row-date">${relativeDate(item.updatedAt)}</td>`
      : `<td><span class="status-badge status-${slug(item.status)}">${escapeHtml(item.status)}</span></td><td><span class="finding-count">${count}</span></td><td class="row-date">${relativeDate(item.updatedAt)}</td>`;
    return `<tr><td><div class="case-title">${escapeHtml(item.title)}</div><div class="case-domain">${escapeHtml(item.domain)}</div></td>${cells}<td><div class="case-actions"><button class="case-edit" data-id="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.title)}">Edit</button><button class="row-actions delete-case" data-id="${escapeHtml(item.id)}" title="Delete review" aria-label="Delete ${escapeHtml(item.title)}">×</button></div></td></tr>`;
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
    $$(".case-edit").forEach((button) => button.addEventListener("click", () => editCase(button.dataset.id)));
    $$(".delete-case").forEach((button) => button.addEventListener("click", () => deleteCase(button.dataset.id)));
    updateStats();
  }

  function editCase(caseId) {
    const item = state.cases.find((review) => review.id === caseId);
    if (!item) return;
    openModal("caseModal");
    editingCaseId = item.id;
    const scope = state.scopes.find((record) => record.id === item.scopeId);
    const scopeSelect = $("#caseScopeSelect");
    scopeSelect.innerHTML = `<option value="${escapeHtml(item.scopeId)}">${escapeHtml(scope ? `${scope.domain} — ${scope.approver}` : "Authorization record unavailable")}</option>`;
    scopeSelect.value = item.scopeId;
    scopeSelect.disabled = true;
    $("#caseForm [name=title]").value = item.title;
    $("#caseForm [name=domain]").value = item.domain;
    $("#caseForm [name=domain]").readOnly = true;
    $("#caseForm [name=status]").value = item.status;
    $("#caseForm [name=assignee]").value = item.assignee || "";
    $("#caseForm [name=notes]").value = item.notes || "";
    $("#caseDomainHelp").textContent = "Target and authorization are locked for existing cases.";
    $("#caseModalTitle").textContent = "Edit review case";
    $("#caseSubmit").textContent = "Save changes";
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
      return `<article class="scope-card"><div><span class="scope-field-label">AUTHORIZED DOMAIN / IP RANGE</span><div class="scope-domain">${escapeHtml(scope.domain)}</div><div class="scope-field-value scope-secondary">${escapeHtml(scope.activities || "Activities not specified")}</div></div><div><span class="scope-field-label">APPROVER / OWNER</span><div class="scope-field-value">${escapeHtml(scope.approver)}</div><div class="scope-field-value scope-secondary">${escapeHtml(scope.reference || "No reference ID")}</div></div><div><span class="scope-field-label">AUTHORIZATION PERIOD</span><div class="scope-dates">${displayDate(scope.startDate)} – ${displayDate(scope.endDate)}</div></div><div class="scope-actions"><span class="scope-valid ${stateClass}">${label}</span><button class="row-actions delete-scope" data-id="${escapeHtml(scope.id)}" title="Delete record" aria-label="Delete authorization for ${escapeHtml(scope.domain)}">×</button></div></article>`;
    }).join("");
    $("#scopeEmpty").classList.toggle("visible", list.length === 0);
    $$(".delete-scope").forEach((button) => button.addEventListener("click", () => deleteScope(button.dataset.id)));
    updateStats();
  }

  function renderNetworkRecords() {
    const hosts = [...state.hosts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#hostTableBody").innerHTML = hosts.map((host) => {
      const scope = state.scopes.find((item) => item.id === host.scopeId);
      return `<tr><td><div class="case-title">${escapeHtml(host.name)}</div><div class="case-domain">${escapeHtml(host.ipAddress)}</div></td><td><span class="case-domain">${escapeHtml(scope?.domain || "Authorization removed")}</span></td><td><span class="record-badge record-${slug(host.status)}">${escapeHtml(host.status)}</span></td><td class="row-date">${relativeDate(host.createdAt)}</td><td><button class="row-actions delete-host" data-id="${escapeHtml(host.id)}" title="Delete host record" aria-label="Delete host record for ${escapeHtml(host.ipAddress)}">×</button></td></tr>`;
    }).join("");
    $("#hostsEmpty").classList.toggle("visible", hosts.length === 0);

    const checks = [...state.apiChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#apiChecksTableBody").innerHTML = checks.map((check) => {
      const scope = state.scopes.find((item) => item.id === check.scopeId);
      return `<tr><td><div class="case-title">${escapeHtml(check.title)}</div><div class="case-domain">${escapeHtml(check.endpoint)}</div></td><td><span class="method-badge">${escapeHtml(check.method)}</span></td><td><span class="case-domain">${escapeHtml(scope?.domain || "Authorization removed")}</span></td><td><span class="record-badge record-${slug(check.outcome)}">${escapeHtml(check.outcome)}</span></td><td class="row-date">${escapeHtml(check.statusCode || "—")}</td><td class="row-date">${relativeDate(check.createdAt)}</td><td><button class="row-actions delete-api-check" data-id="${escapeHtml(check.id)}" title="Delete API check" aria-label="Delete API check ${escapeHtml(check.title)}">×</button></td></tr>`;
    }).join("");
    $("#apiChecksEmpty").classList.toggle("visible", checks.length === 0);
    $$(".delete-host").forEach((button) => button.addEventListener("click", () => deleteHost(button.dataset.id)));
    $$(".delete-api-check").forEach((button) => button.addEventListener("click", () => deleteApiCheck(button.dataset.id)));
  }

  function renderCloudChecks() {
    $("#cloudControlList").innerHTML = CLOUD_CONTROLS.map((control) =>
      `<article class="cloud-control-item"><div class="cloud-control-top"><span class="scope-field-label">${escapeHtml(control.category)}</span><span class="cloud-control-icon">✓</span></div><strong>${escapeHtml(control.title)}</strong><p>${escapeHtml(control.guidance)}</p></article>`
    ).join("");
    const checks = [...state.cloudChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("#cloudChecksBody").innerHTML = checks.map((check) => {
      const control = CLOUD_CONTROLS.find((item) => item.id === check.controlId);
      return `<tr><td><div class="case-title">${escapeHtml(check.resource)}</div><div class="case-domain">${escapeHtml(check.provider)}</div></td><td><div class="case-title">${escapeHtml(control?.title || "Unknown control")}</div><div class="case-domain">${escapeHtml(control?.category || "")}</div></td><td><span class="record-badge record-${slug(check.result)}">${escapeHtml(check.result)}</span></td><td class="row-date">${relativeDate(check.createdAt)}</td><td><button class="row-actions delete-cloud-check" data-id="${escapeHtml(check.id)}" title="Delete cloud check" aria-label="Delete ${escapeHtml(control?.title || "cloud check")} for ${escapeHtml(check.resource)}">×</button></td></tr>`;
    }).join("");
    $("#cloudChecksEmpty").classList.toggle("visible", checks.length === 0);
    const passed = checks.filter((check) => check.result === "Pass").length;
    const review = checks.filter((check) => check.result === "Needs review" || check.result === "Fail").length;
    $("#cloudCheckSummary").textContent = `${checks.length} recorded · ${passed} pass · ${review} need attention`;
    $$(".delete-cloud-check").forEach((button) => button.addEventListener("click", () => deleteCloudCheck(button.dataset.id)));
  }

  function updateCloudGuidance() {
    const control = CLOUD_CONTROLS.find((item) => item.id === $("#cloudControlSelect").value);
    $("#cloudControlGuidance").textContent = control?.guidance || "";
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
    const domain = String(input).trim().toLowerCase().replace(/\.$/, "");
    if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(domain)) {
      return null;
    }
    return domain;
  }

  function parseIPv4(input) {
    const octets = String(input).split(".");
    if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) return null;
    return octets.reduce((address, octet) => address * 256 + Number(octet), 0);
  }

  function formatIPv4(address) {
    return [24, 16, 8, 0].map((shift) => Math.floor(address / (2 ** shift)) % 256).join(".");
  }

  function parseIPv4Cidr(input) {
    const parts = String(input).split("/");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    const address = parseIPv4(parts[0]);
    const prefix = Number(parts[1]);
    if (address === null || prefix > 32) return null;
    const blockSize = 2 ** (32 - prefix);
    const network = Math.floor(address / blockSize) * blockSize;
    return { network, prefix, blockSize, canonical: `${formatIPv4(network)}/${prefix}` };
  }

  function validateScopeTarget(input) {
    const value = String(input).trim().toLowerCase();
    const cidr = parseIPv4Cidr(value);
    if (cidr) return cidr.canonical;
    const address = parseIPv4(value);
    if (address !== null) return formatIPv4(address);
    if (/^\d+(?:\.\d+){3}$/.test(value)) return null;
    return validateDomain(value);
  }

  function validateCaseTarget(input) {
    const value = String(input).trim().toLowerCase();
    const address = parseIPv4(value);
    if (address !== null) return formatIPv4(address);
    if (/^\d+(?:\.\d+){3}$/.test(value) || value.includes("/")) return null;
    return validateDomain(value);
  }

  function targetIsInScope(target, authorizedTarget) {
    const targetAddress = parseIPv4(target);
    const authorizedAddress = parseIPv4(authorizedTarget);
    const authorizedRange = parseIPv4Cidr(authorizedTarget);
    if (targetAddress !== null) {
      if (authorizedAddress !== null) return targetAddress === authorizedAddress;
      return authorizedRange !== null &&
        Math.floor(targetAddress / authorizedRange.blockSize) * authorizedRange.blockSize === authorizedRange.network;
    }
    return authorizedAddress === null && authorizedRange === null &&
      (target === authorizedTarget || target.endsWith(`.${authorizedTarget}`));
  }

  function validateApiEndpoint(input) {
    try {
      const endpoint = new URL(String(input).trim());
      if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search) return null;
      const host = validateCaseTarget(endpoint.hostname);
      if (!host) return null;
      endpoint.hash = "";
      return { url: endpoint.toString(), host };
    } catch {
      return null;
    }
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
    if (state.cases.some((reviewCase) => reviewCase.scopeId === scopeId) ||
      state.hosts.some((host) => host.scopeId === scopeId) ||
      state.apiChecks.some((check) => check.scopeId === scopeId)) {
      showToast("This authorization is linked to a review, host, or API record and cannot be deleted.");
      return;
    }
    state.scopes = state.scopes.filter((scope) => scope.id !== scopeId);
    if (!saveState()) return;
    refresh();
    showToast("Authorization record deleted.");
  }

  function deleteHost(hostId) {
    const host = state.hosts.find((item) => item.id === hostId);
    if (!host || !confirm(`Delete host record for ${host.ipAddress}?`)) return;
    state.hosts = state.hosts.filter((item) => item.id !== hostId);
    if (!saveState()) return;
    renderNetworkRecords();
    showToast("Host record deleted.");
  }

  function deleteApiCheck(checkId) {
    const check = state.apiChecks.find((item) => item.id === checkId);
    if (!check || !confirm(`Delete API check "${check.title}"?`)) return;
    state.apiChecks = state.apiChecks.filter((item) => item.id !== checkId);
    if (!saveState()) return;
    renderNetworkRecords();
    showToast("API check deleted.");
  }

  function deleteCloudCheck(checkId) {
    const check = state.cloudChecks.find((item) => item.id === checkId);
    const control = CLOUD_CONTROLS.find((item) => item.id === check?.controlId);
    if (!check || !confirm(`Delete cloud check "${control?.title || "cloud check"}" for ${check.resource}?`)) return;
    state.cloudChecks = state.cloudChecks.filter((item) => item.id !== checkId);
    if (!saveState()) return;
    renderCloudChecks();
    showToast("Cloud check deleted.");
  }

  function refresh() {
    renderCases();
    renderFindings();
    renderScopes();
    renderNetworkRecords();
    renderCloudChecks();
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
    $("#cloudControlSelect").addEventListener("change", updateCloudGuidance);

    $("#scopeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const domain = validateScopeTarget(form.get("domain"));
      const startDate = form.get("startDate");
      const endDate = form.get("endDate");
      const error = $("#scopeError");
      error.textContent = "";
      if (!domain) { error.textContent = "Enter a valid domain, IPv4 address, or IPv4 CIDR range (for example, 192.168.1.20 or 192.168.1.0/24)."; return; }
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

    $("#hostForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const ipAddress = validateCaseTarget(form.get("ipAddress"));
      const scope = state.scopes.find((item) => item.id === form.get("scopeId"));
      const error = $("#hostError");
      error.textContent = "";
      if (!ipAddress || parseIPv4(ipAddress) === null) {
        error.textContent = "Enter a valid IPv4 address.";
        return;
      }
      if (!scope || !isScopeCurrent(scope) || (parseIPv4(scope.domain) === null && !parseIPv4Cidr(scope.domain))) {
        error.textContent = "Select a current IPv4 or CIDR authorization.";
        return;
      }
      if (!targetIsInScope(ipAddress, scope.domain)) {
        error.textContent = `This IP is outside the authorized range ${scope.domain}.`;
        return;
      }
      const host = {
        id: id(),
        name: String(form.get("name")).trim(),
        ipAddress,
        scopeId: scope.id,
        status: form.get("status"),
        notes: String(form.get("notes")).trim(),
        createdAt: new Date().toISOString(),
      };
      state.hosts.push(host);
      if (!saveState()) { state.hosts.pop(); return; }
      closeModal($("#hostModal"));
      renderNetworkRecords();
      showToast("Host observation recorded.");
    });

    $("#apiCheckForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const endpoint = validateApiEndpoint(form.get("endpoint"));
      const scope = state.scopes.find((item) => item.id === form.get("scopeId"));
      const statusCodeValue = String(form.get("statusCode")).trim();
      const statusCode = statusCodeValue ? Number(statusCodeValue) : null;
      const error = $("#apiCheckError");
      error.textContent = "";
      if (!endpoint) {
        error.textContent = "Enter an HTTP or HTTPS API endpoint without credentials or query parameters.";
        return;
      }
      if (!scope || !isScopeCurrent(scope)) {
        error.textContent = "Select a current authorization record.";
        return;
      }
      if (!targetIsInScope(endpoint.host, scope.domain)) {
        error.textContent = `The API hostname must be within the authorized scope ${scope.domain}.`;
        return;
      }
      if (statusCodeValue && (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)) {
        error.textContent = "Enter a valid HTTP status code from 100 to 599, or leave it blank.";
        return;
      }
      const check = {
        id: id(),
        title: String(form.get("title")).trim(),
        endpoint: endpoint.url,
        method: form.get("method"),
        scopeId: scope.id,
        outcome: form.get("outcome"),
        statusCode,
        notes: String(form.get("notes")).trim(),
        createdAt: new Date().toISOString(),
      };
      state.apiChecks.push(check);
      if (!saveState()) { state.apiChecks.pop(); return; }
      closeModal($("#apiCheckModal"));
      renderNetworkRecords();
      showToast("API test result recorded.");
    });

    $("#cloudCheckForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const control = CLOUD_CONTROLS.find((item) => item.id === form.get("controlId"));
      const error = $("#cloudCheckError");
      error.textContent = "";
      if (!control) {
        error.textContent = "Select a cloud security control.";
        return;
      }
      if (!["AWS", "Microsoft Azure", "Google Cloud", "Other"].includes(form.get("provider")) ||
        !["Not assessed", "Pass", "Needs review", "Fail", "Not applicable"].includes(form.get("result"))) {
        error.textContent = "Select a valid provider and review result.";
        return;
      }
      if (!form.get("confirmed")) {
        error.textContent = "Confirm that you are authorized and recorded the check manually.";
        return;
      }
      const check = {
        id: id(),
        provider: form.get("provider"),
        resource: String(form.get("resource")).trim(),
        controlId: control.id,
        result: form.get("result"),
        notes: String(form.get("notes")).trim(),
        createdAt: new Date().toISOString(),
      };
      state.cloudChecks.push(check);
      if (!saveState()) { state.cloudChecks.pop(); return; }
      closeModal($("#cloudCheckModal"));
      renderCloudChecks();
      showToast("Cloud security check recorded.");
    });

    $("#caseForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const error = $("#caseError");
      error.textContent = "";
      if (editingCaseId) {
        const existing = state.cases.find((item) => item.id === editingCaseId);
        if (!existing) { error.textContent = "This review case no longer exists."; return; }
        const previous = { ...existing };
        Object.assign(existing, {
          title: String(form.get("title")).trim(),
          status: form.get("status"),
          assignee: String(form.get("assignee")).trim(),
          notes: String(form.get("notes")).trim(),
          updatedAt: new Date().toISOString(),
        });
        if (!saveState()) { Object.assign(existing, previous); return; }
        closeModal($("#caseModal"));
        refresh();
        showToast("Review case updated.");
        return;
      }
      const domain = validateCaseTarget(form.get("domain"));
      const scope = state.scopes.find((item) => item.id === form.get("scopeId"));
      if (!domain) { error.textContent = "Enter a valid domain or IPv4 address, without a protocol, path, port, or CIDR suffix."; return; }
      if (!scope || !isScopeCurrent(scope)) { error.textContent = "Select a current authorization record."; return; }
      if (!targetIsInScope(domain, scope.domain)) {
        error.textContent = `The target must be within the authorized scope ${scope.domain}.`;
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
