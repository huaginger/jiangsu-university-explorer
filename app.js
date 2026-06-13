const PAGE_SIZE = 18;

/* ── Password Gate ── */
const GATE_HASH = "5183764f092ac1a8878d6af5614ab7dc9d359ffc7019974e9732ba05c68f2d7e";

async function sha256(text) {
  const buffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function initGate() {
  if (sessionStorage.getItem("gate_auth") === "1") {
    document.getElementById("gateOverlay").hidden = true;
    document.getElementById("appContent").hidden = false;
    return;
  }

  document.getElementById("gateOverlay").hidden = false;
  document.getElementById("appContent").hidden = true;

  const gatePassword = document.getElementById("gatePassword");
  const gateSubmit = document.getElementById("gateSubmit");
  const gateError = document.getElementById("gateError");

  async function attemptUnlock() {
    const input = gatePassword.value;
    if (!input) return;
    const hash = await sha256(input);
    if (hash === GATE_HASH) {
      sessionStorage.setItem("gate_auth", "1");
      document.getElementById("gateOverlay").hidden = true;
      document.getElementById("appContent").hidden = false;
    } else {
      gateError.hidden = false;
      gatePassword.value = "";
      gatePassword.focus();
    }
  }

  gateSubmit.addEventListener("click", attemptUnlock);
  gatePassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptUnlock();
    gateError.hidden = true;
  });
}

initGate();
const payload = window.PLAN_DATA;

const elements = {
  keywordSearch: document.querySelector("#keywordSearch"),
  batchFilter: document.querySelector("#batchFilter"),
  subjectFilter: document.querySelector("#subjectFilter"),
  scoreFilter: document.querySelector("#scoreFilter"),
  cooperationFilter: document.querySelector("#cooperationFilter"),
  minPlan: document.querySelector("#minPlan"),
  minScore: document.querySelector("#minScore"),
  sortOrder: document.querySelector("#sortOrder"),
  resetButton: document.querySelector("#resetButton"),
  emptyResetButton: document.querySelector("#emptyResetButton"),
  resultList: document.querySelector("#resultList"),
  resultCount: document.querySelector("#resultCount"),
  institutionCount: document.querySelector("#institutionCount"),
  activeFilters: document.querySelector("#activeFilters"),
  emptyState: document.querySelector("#emptyState"),
  pagination: document.querySelector("#pagination"),
  previousPage: document.querySelector("#previousPage"),
  nextPage: document.querySelector("#nextPage"),
  pageIndicator: document.querySelector("#pageIndicator"),
  detailDialog: document.querySelector("#detailDialog"),
  dialogContent: document.querySelector("#dialogContent"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  sourceName: document.querySelector("#sourceName"),
  heroRecordCount: document.querySelector("#heroRecordCount"),
  heroProgramCount: document.querySelector("#heroProgramCount"),
  heroPlanCount: document.querySelector("#heroPlanCount"),
  heroMinScore: document.querySelector("#heroMinScore"),
  heroMaxScore: document.querySelector("#heroMaxScore")
};

let currentPage = 1;
let currentResults = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function planCount(record) {
  return record.declaredPlanCount ?? 0;
}

function isSinoForeignCooperation(record) {
  const sourceText = [
    record.groupLabel,
    ...(record.specialNotes || []),
    ...(record.programs || []).map((program) => program.name)
  ].join(" ");
  return sourceText.includes("中外合作办学");
}

function initializeMetadata() {
  if (!payload?.records?.length) {
    document.body.innerHTML = '<p class="load-error">数据文件未能加载，请确认 data/招生计划-2025-物理类.js 与页面位于同一项目中。</p>';
    return;
  }

  const scores = payload.records
    .map((record) => record.minimumScore)
    .filter((score) => Number.isFinite(score));
  const declaredTotal = payload.records.reduce((sum, record) => sum + (record.declaredPlanCount || 0), 0);

  elements.heroRecordCount.textContent = payload.records.length.toLocaleString("zh-CN");
  elements.heroProgramCount.textContent = payload.metadata.programCount.toLocaleString("zh-CN");
  elements.heroPlanCount.textContent = declaredTotal.toLocaleString("zh-CN");
  elements.heroMinScore.textContent = Math.min(...scores);
  elements.heroMaxScore.textContent = Math.max(...scores);
  elements.sourceName.textContent = `${payload.metadata.title}｜来源：${payload.metadata.sourceFile}`;

  uniqueSorted(payload.records.map((record) => record.subjectRequirement)).forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    elements.subjectFilter.append(option);
  });
}

function getFilters() {
  return {
    keyword: elements.keywordSearch.value.trim().toLocaleLowerCase("zh-CN"),
    batch: elements.batchFilter.value,
    subject: elements.subjectFilter.value,
    scoreState: elements.scoreFilter.value,
    cooperation: elements.cooperationFilter.value,
    minPlan: elements.minPlan.value === "" ? null : Number(elements.minPlan.value),
    minScore: elements.minScore.value === "" ? null : Number(elements.minScore.value),
    sort: elements.sortOrder.value
  };
}

function filterRecords(filters) {
  const filtered = payload.records.filter((record) => {
    const searchable = [
      record.institutionName,
      record.institutionCode,
      record.groupCode,
      record.groupLabel,
      ...record.programs.flatMap((program) => [program.code, program.name])
    ].join(" ").toLocaleLowerCase("zh-CN");
    const hasScore = Number.isFinite(record.minimumScore);
    const isCooperation = isSinoForeignCooperation(record);

    return (!filters.keyword || searchable.includes(filters.keyword))
      && (!filters.batch || record.batch === filters.batch)
      && (!filters.subject || record.subjectRequirement === filters.subject)
      && (!filters.scoreState || (filters.scoreState === "matched" ? hasScore : !hasScore))
      && (!filters.cooperation || (filters.cooperation === "yes" ? isCooperation : !isCooperation))
      && (filters.minPlan === null || planCount(record) >= filters.minPlan)
      && (filters.minScore === null || (hasScore && record.minimumScore >= filters.minScore));
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "score-desc") {
      return (b.minimumScore ?? -1) - (a.minimumScore ?? -1) || a.id.localeCompare(b.id);
    }
    if (filters.sort === "code-asc") {
      return a.id.localeCompare(b.id) || a.batch.localeCompare(b.batch, "zh-CN");
    }
    return planCount(b) - planCount(a) || (b.minimumScore ?? -1) - (a.minimumScore ?? -1);
  });
}

function previewPrograms(record) {
  const visible = record.programs.filter((program) => program.name).slice(0, 3);
  if (!visible.length) return '<span class="program-chip muted">专业明细请核对原页</span>';
  return visible.map((program) => `
    <span class="program-chip">
      <b>${escapeHtml(program.code)}</b>
      ${escapeHtml(program.name)}
      ${program.planCount !== null ? `<em>${program.planCount}${program.planCountInferred ? "*" : ""}人</em>` : ""}
    </span>
  `).join("");
}

function renderRecord(record, index) {
  const score = Number.isFinite(record.minimumScore)
    ? `<div class="score-badge"><span>投档最低分</span><strong>${record.minimumScore}</strong></div>`
    : '<div class="score-badge score-missing"><span>投档线</span><strong>—</strong></div>';
  const planSourceLabel = `招生计划书PDF页码：${record.sourcePage}`;
  const scoreSourceLabel = `投档线PDF页码：${record.scoreSourcePage ?? "未匹配"}`;
  const cooperation = isSinoForeignCooperation(record);

  return `
    <article class="result-card plan-card" style="animation-delay:${Math.min(index * 24, 240)}ms">
      <div class="code-block">
        <span>院校代号</span>
        <strong>${escapeHtml(record.institutionCode)}</strong>
        <small>${escapeHtml(record.batch === "本科院校" ? "本科" : "提前批")}</small>
      </div>
      <div class="record-main">
        <div class="record-title">
          <div>
            <p>${escapeHtml(record.institutionName)}</p>
            <h3>${escapeHtml(record.groupCode)}专业组 · ${escapeHtml(record.subjectRequirement || "科目要求见原页")}</h3>
          </div>
          <div class="metric-pair">
            <div class="plan-badge">
              <span>招生计划</span>
              <strong>${record.declaredPlanCount ?? "—"}<small>${record.declaredPlanCount !== null ? "人" : ""}</small></strong>
            </div>
            ${score}
          </div>
        </div>
        <div class="program-preview">${previewPrograms(record)}</div>
        <div class="record-meta">
          <span>${record.programs.length} 个专业条目</span>
          <span class="${cooperation ? "cooperation-yes" : ""}">中外合作办学：${cooperation ? "是" : "否"}</span>
          <span>${escapeHtml(planSourceLabel)}</span>
          <span>${escapeHtml(scoreSourceLabel)}</span>
        </div>
      </div>
      <button class="detail-button" type="button" data-record-uid="${escapeHtml(record.uid)}">查看专业明细</button>
    </article>
  `;
}

function renderActiveFilters(filters) {
  const labels = [
    filters.keyword && `关键词：${filters.keyword}`,
    filters.batch && `批次：${filters.batch}`,
    filters.subject && `再选：${filters.subject}`,
    filters.scoreState && `投档线：${elements.scoreFilter.selectedOptions[0]?.textContent}`,
    filters.cooperation && `中外合作办学：${elements.cooperationFilter.selectedOptions[0]?.textContent}`,
    filters.minPlan !== null && `计划 ≥ ${filters.minPlan}人`,
    filters.minScore !== null && `投档分 ≥ ${filters.minScore}`
  ].filter(Boolean);

  elements.activeFilters.innerHTML = labels.length
    ? labels.map((label) => `<span class="filter-chip">${escapeHtml(label)}</span>`).join("")
    : '<span class="filter-chip neutral">当前显示全部2025年普通类物理方向招生计划</span>';
}

function render() {
  const filters = getFilters();
  currentResults = filterRecords(filters);
  const institutionTotal = new Set(currentResults.map((record) => record.institutionCode)).size;
  const pageTotal = Math.max(1, Math.ceil(currentResults.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageTotal);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRecords = currentResults.slice(start, start + PAGE_SIZE);

  elements.resultCount.textContent = currentResults.length.toLocaleString("zh-CN");
  elements.institutionCount.textContent = institutionTotal.toLocaleString("zh-CN");
  elements.resultList.innerHTML = pageRecords.map(renderRecord).join("");
  elements.resultList.hidden = currentResults.length === 0;
  elements.emptyState.hidden = currentResults.length !== 0;
  elements.pagination.hidden = currentResults.length <= PAGE_SIZE;
  elements.pageIndicator.textContent = `第 ${currentPage} / ${pageTotal} 页`;
  elements.previousPage.disabled = currentPage === 1;
  elements.nextPage.disabled = currentPage === pageTotal;
  renderActiveFilters(filters);
}

function resetFilters() {
  elements.keywordSearch.value = "";
  elements.batchFilter.value = "";
  elements.subjectFilter.value = "";
  elements.scoreFilter.value = "";
  elements.cooperationFilter.value = "";
  elements.minPlan.value = "";
  elements.minScore.value = "";
  elements.sortOrder.value = "plan-desc";
  currentPage = 1;
  render();
  elements.keywordSearch.focus();
}

function formatValue(value, suffix = "") {
  return value === null || value === undefined || value === "" ? "—" : `${value}${suffix}`;
}

function renderProgramRows(record) {
  if (!record.programs.length) {
    return '<tr><td colspan="5">本组专业明细未能结构化，请按来源页核对原表。</td></tr>';
  }
  return record.programs.map((program) => `
    <tr>
      <td>${escapeHtml(program.code)}</td>
      <td>${escapeHtml(program.name || "名称请核对原页")}</td>
      <td>${formatValue(program.planCount)}${program.planCountInferred ? "*" : ""}</td>
      <td>${escapeHtml(formatValue(program.duration))}</td>
      <td>${escapeHtml(formatValue(program.tuition))}</td>
    </tr>
  `).join("");
}

function renderTieBreak(record) {
  if (!record.tieBreak) return "";
  const tie = record.tieBreak;
  return `
    <section class="tie-section">
      <div class="tie-heading">
        <h3>最低分同分考生排序项</h3>
        <span>来自2025年本科批投档线文件</span>
      </div>
      <div class="tie-grid">
        <div><span>（一）语数成绩</span><strong>${formatValue(tie.chineseMath)}</strong></div>
        <div><span>（二）语数最高成绩</span><strong>${formatValue(tie.chineseMathHighest)}</strong></div>
        <div><span>（三）外语成绩</span><strong>${formatValue(tie.foreignLanguage)}</strong></div>
        <div><span>（四）首选科目成绩</span><strong>${formatValue(tie.firstChoice)}</strong></div>
        <div><span>（五）再选最高成绩</span><strong>${formatValue(tie.secondChoiceHighest)}</strong></div>
        <div><span>（六）志愿号</span><strong>${formatValue(tie.preferenceNumber)}</strong></div>
      </div>
    </section>
  `;
}

function openDetails(uid) {
  const record = payload.records.find((item) => item.uid === uid);
  if (!record) return;
  const score = Number.isFinite(record.minimumScore) ? record.minimumScore : "—";
  const cooperation = isSinoForeignCooperation(record);

  elements.dialogContent.innerHTML = `
    <div class="dialog-body">
      <p class="dialog-kicker">${escapeHtml(record.batch)} · 院校代号 ${escapeHtml(record.institutionCode)} · ${escapeHtml(record.groupCode)}专业组</p>
      <div class="dialog-title-row">
        <div>
          <h2 id="detailTitle">${escapeHtml(record.institutionName)}</h2>
          <p>${escapeHtml(record.groupLabel)}</p>
        </div>
        <div class="dialog-score">
          <span>2025投档最低分</span>
          <strong>${score}</strong>
        </div>
      </div>

      <div class="detail-facts plan-facts">
        <div><span>专业组计划</span><strong>${formatValue(record.declaredPlanCount, "人")}</strong></div>
        <div><span>结构化专业</span><strong>${record.programs.length}项</strong></div>
        <div><span>再选科目</span><strong>${escapeHtml(record.subjectRequirement || "见原页")}</strong></div>
        <div><span>中外合作办学</span><strong class="${cooperation ? "cooperation-value" : ""}">${cooperation ? "是" : "否"}</strong></div>
        <div><span>招生计划书PDF页码</span><strong>${record.sourcePage}</strong></div>
        <div><span>投档线PDF页码</span><strong>${record.scoreSourcePage ?? "未匹配"}</strong></div>
      </div>

      <section class="program-section">
        <div class="tie-heading">
          <h3>组内专业与招生计划</h3>
          <span>“—”表示未稳定识别；“*”表示由专业组总计划差额唯一推得</span>
        </div>
        <div class="program-table-wrap">
          <table class="program-table">
            <thead><tr><th>代码</th><th>专业名称及备注</th><th>计划</th><th>学制</th><th>学费</th></tr></thead>
            <tbody>${renderProgramRows(record)}</tbody>
          </table>
        </div>
      </section>

      ${renderTieBreak(record)}

      <p class="dialog-source">
        招生计划书PDF页码：${record.sourcePage}；
        投档线PDF页码：${record.scoreSourcePage ?? "未匹配"}。
      </p>
      <p class="dialog-warning">
        当前是2025年数据，不代表2026年招生计划或投档线。扫描表格结构化结果请结合原PDF复核。
      </p>
    </div>
  `;
  elements.detailDialog.showModal();
}

[
  elements.keywordSearch,
  elements.minPlan,
  elements.minScore
].forEach((control) => {
  control.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
});

[
  elements.batchFilter,
  elements.subjectFilter,
  elements.scoreFilter,
  elements.cooperationFilter,
  elements.sortOrder
].forEach((control) => {
  control.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
});

elements.resetButton.addEventListener("click", resetFilters);
elements.emptyResetButton.addEventListener("click", resetFilters);
elements.previousPage.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage -= 1;
    render();
    document.querySelector("#resultTitle").scrollIntoView({ behavior: "smooth" });
  }
});
elements.nextPage.addEventListener("click", () => {
  if (currentPage * PAGE_SIZE < currentResults.length) {
    currentPage += 1;
    render();
    document.querySelector("#resultTitle").scrollIntoView({ behavior: "smooth" });
  }
});
elements.closeDialogButton.addEventListener("click", () => elements.detailDialog.close());
elements.resultList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-uid]");
  if (button) openDetails(button.dataset.recordUid);
});
elements.detailDialog.addEventListener("click", (event) => {
  if (event.target === elements.detailDialog) elements.detailDialog.close();
});

initializeMetadata();
render();
