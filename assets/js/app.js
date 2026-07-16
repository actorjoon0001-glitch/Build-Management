/* ============================================================
   시공OS · App — 화면 렌더링 / 라우팅
   ============================================================ */
(function () {
  "use strict";

  var S = window.Store;
  var viewEl = document.getElementById("view");
  var titleEl = document.getElementById("page-title");
  var navEl = document.getElementById("nav");
  var backdrop = document.getElementById("modal-backdrop");
  var modalEl = document.getElementById("modal");

  var TITLES = {
    dashboard: "대시보드",
    sites: "현장 현황",
    tasks: "작업 · 체크리스트",
    materials: "자재 물량",
    process: "표준 공정표",
    "import": "엑셀 불러오기",
  };

  // ---------- 유틸 ----------
  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function nl2br(s) { return esc(s).replace(/\n/g, "<br>"); }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length !== 3) return iso;
    return p[0].slice(2) + "." + p[1] + "." + p[2];
  }
  function progClass(pct) {
    if (pct >= 100) return "green";
    if (pct >= 60) return "";
    if (pct >= 30) return "amber";
    return "red";
  }
  function num(n) {
    if (n == null || n === "") return "";
    return Number(n).toLocaleString("ko-KR");
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
  }

  // ---------- 라우팅 ----------
  var current = "dashboard";
  function navigate(view) {
    current = view;
    titleEl.textContent = TITLES[view] || view;
    Array.prototype.forEach.call(navEl.querySelectorAll(".nav-item"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    render();
  }
  navEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".nav-item");
    if (btn) navigate(btn.getAttribute("data-view"));
  });

  function render() {
    var updated = document.getElementById("last-updated");
    if (updated) updated.textContent = "기준일 2026.07.16 · 세움 시공팀";
    if (current === "dashboard") return renderDashboard();
    if (current === "sites") return renderSites();
    if (current === "tasks") return renderTasks();
    if (current === "materials") return renderMaterials();
    if (current === "process") return renderProcess();
    if (current === "import") return renderImport();
  }

  // ---------- 모달 ----------
  function openModal(html) {
    modalEl.innerHTML = html;
    backdrop.classList.remove("hidden");
  }
  function closeModal() { backdrop.classList.add("hidden"); modalEl.innerHTML = ""; }
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  /* ============================================================
     대시보드
     ============================================================ */
  function renderDashboard() {
    var sites = S.sites();
    var states = sites.map(function (s) { return { s: s, st: S.siteState(s) }; });
    var total = sites.length;
    var done = states.filter(function (x) { return x.st.isDone; }).length;
    var ongoing = total - done;
    var stalled = states.filter(function (x) { return x.st.stalled; }).length;

    // 이번 주(오늘~+7일) 예정 일정
    var TODAY = S.today;
    var week = [];
    sites.forEach(function (s) {
      (s.schedule || []).forEach(function (ev) {
        var d = Date.parse(ev.date + "T00:00:00");
        if (!isNaN(d) && d >= TODAY && d <= TODAY + 8 * 86400000) {
          week.push({ date: ev.date, text: ev.text, site: s });
        }
      });
    });
    week.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    // 공정 단계 분포
    var phaseCount = S.phases.map(function () { return 0; });
    states.forEach(function (x) { phaseCount[x.st.phaseIndex]++; });
    var maxPhase = Math.max.apply(null, phaseCount.concat([1]));

    // 체크리스트 미완료 수
    var calls = S.calls();
    var openCalls = calls.filter(function (c) { return !S.callDone(c); }).length;

    var html = "";
    html += '<div class="grid stat-grid">';
    html += statCard("전체 현장", total, "blue", "관리 중인 현장 수");
    html += statCard("진행 중", ongoing, "blue", "준공 전 현장");
    html += statCard("준공 완료", done, "green", "준공청소 단계");
    html += statCard("정체 주의", stalled, stalled ? "red" : "green", "21일+ 진행 없음");
    html += "</div>";

    // 공정 분포
    html += '<div class="section-title">📊 공정 단계별 현장 분포</div>';
    html += '<div class="card"><div class="phase-list">';
    S.phases.forEach(function (p, i) {
      var pct = Math.round((phaseCount[i] / maxPhase) * 100);
      html += '<div class="phase-row" style="grid-template-columns:110px 1fr 34px">' +
        '<span class="phase-name">' + esc(p.key) + '</span>' +
        '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
        '<span class="phase-pct">' + phaseCount[i] + '</span></div>';
    });
    html += "</div></div>";

    // 2단: 이번주 일정 / 정체 현장
    html += '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:8px">';

    html += '<div><div class="section-title">📅 이번 주 예정 (오늘~+7일)</div><div class="card">';
    if (!week.length) html += '<div class="muted">예정된 일정이 없습니다.</div>';
    else week.slice(0, 12).forEach(function (w) {
      html += '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">' +
        '<span class="badge blue" style="min-width:52px;justify-content:center">' + fmtDate(w.date) + '</span>' +
        '<div style="min-width:0"><div>' + esc(w.text) + '</div>' +
        '<div class="muted" style="margin-top:2px">' + esc(shortAddr(w.site.address)) + ' · ' + esc(w.site.owner) + '</div></div></div>';
    });
    html += "</div></div>";

    html += '<div><div class="section-title">⚠️ 정체 주의 현장</div><div class="card">';
    var stalledList = states.filter(function (x) { return x.st.stalled; })
      .sort(function (a, b) { return b.st.daysSince - a.st.daysSince; });
    if (!stalledList.length) html += '<div class="muted">정체 현장이 없습니다. 👍</div>';
    else stalledList.slice(0, 10).forEach(function (x) {
      html += '<div class="site-clickable" data-site="' + x.s.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);cursor:pointer">' +
        '<div style="min-width:0"><div>' + esc(x.s.owner || shortAddr(x.s.address)) + '</div>' +
        '<div class="muted">' + esc(x.st.phaseName) + ' · ' + esc(shortAddr(x.s.address)) + '</div></div>' +
        '<span class="badge red" style="align-self:center">' + x.st.daysSince + '일</span></div>';
    });
    html += "</div></div>";
    html += "</div>";

    // 작업 요약
    html += '<div class="section-title">✅ 처리 대기</div>';
    html += '<div class="card" style="display:flex;gap:24px;align-items:center">' +
      '<div><div class="stat-value blue" style="font-size:26px">' + openCalls + '</div><div class="muted">미완료 인수인계/통화</div></div>' +
      '<button class="btn primary" id="go-tasks">작업 · 체크리스트 열기 →</button></div>';

    viewEl.innerHTML = html;

    viewEl.querySelectorAll(".site-clickable").forEach(function (el) {
      el.addEventListener("click", function () { openSiteDetail(parseInt(el.getAttribute("data-site"), 10)); });
    });
    var goTasks = document.getElementById("go-tasks");
    if (goTasks) goTasks.addEventListener("click", function () { navigate("tasks"); });
  }

  function statCard(label, value, color, sub) {
    return '<div class="card stat-card"><div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value ' + color + '">' + value + '</div>' +
      '<div class="stat-sub">' + esc(sub) + '</div></div>';
  }
  function shortAddr(a) {
    if (!a) return "";
    var parts = a.split(/\s+/);
    return parts.slice(0, 3).join(" ");
  }

  /* ============================================================
     현장 현황
     ============================================================ */
  var sitesFilter = { q: "", kind: "", phase: "", status: "" };

  function renderSites() {
    var html = "";
    html += '<div class="toolbar">';
    html += '<input type="text" class="search" id="site-q" placeholder="주소·건축주·연락처 검색" value="' + esc(sitesFilter.q) + '">';
    html += kindSelect("site-kind", sitesFilter.kind);
    html += '<select id="site-phase"><option value="">전체 공정</option>' +
      S.phases.map(function (p, i) { return '<option value="' + i + '"' + (sitesFilter.phase === String(i) ? " selected" : "") + '>' + esc(p.key) + '</option>'; }).join("") + '</select>';
    html += '<select id="site-status"><option value="">진행+완료</option>' +
      '<option value="ongoing"' + (sitesFilter.status === "ongoing" ? " selected" : "") + '>진행 중</option>' +
      '<option value="done"' + (sitesFilter.status === "done" ? " selected" : "") + '>준공 완료</option>' +
      '<option value="stalled"' + (sitesFilter.status === "stalled" ? " selected" : "") + '>정체 주의</option></select>';
    html += '<span class="spacer"></span><span id="site-count" class="muted"></span>';
    html += "</div>";
    html += '<div class="grid site-grid" id="site-grid"></div>';
    viewEl.innerHTML = html;

    document.getElementById("site-q").addEventListener("input", debounce(function (e) { sitesFilter.q = e.target.value; paintSites(); }, 180));
    document.getElementById("site-kind").addEventListener("change", function (e) { sitesFilter.kind = e.target.value; paintSites(); });
    document.getElementById("site-phase").addEventListener("change", function (e) { sitesFilter.phase = e.target.value; paintSites(); });
    document.getElementById("site-status").addEventListener("change", function (e) { sitesFilter.status = e.target.value; paintSites(); });
    paintSites();
  }

  function kindSelect(id, val) {
    var kinds = ["주택", "쉼터", "농막", "상가", "창고"];
    return '<select id="' + id + '"><option value="">전체 종류</option>' +
      kinds.map(function (k) { return '<option value="' + k + '"' + (val === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + "</select>";
  }

  function filteredSites() {
    var q = sitesFilter.q.trim();
    return S.sites().filter(function (s) {
      var st = S.siteState(s);
      if (q) {
        var hay = (s.address + " " + s.owner + " " + s.contact + " " + (s.type.raw || "") + " " + (s.latest.note || "")).toLowerCase();
        if (hay.indexOf(q.toLowerCase()) === -1) return false;
      }
      if (sitesFilter.kind && s.type.kind !== sitesFilter.kind) return false;
      if (sitesFilter.phase !== "" && String(st.phaseIndex) !== sitesFilter.phase) return false;
      if (sitesFilter.status === "ongoing" && st.isDone) return false;
      if (sitesFilter.status === "done" && !st.isDone) return false;
      if (sitesFilter.status === "stalled" && !st.stalled) return false;
      return true;
    });
  }

  function paintSites() {
    var list = filteredSites();
    document.getElementById("site-count").textContent = list.length + "개 현장";
    var grid = document.getElementById("site-grid");
    if (!list.length) { grid.innerHTML = emptyBox("조건에 맞는 현장이 없습니다."); return; }
    grid.innerHTML = list.map(siteCard).join("");
    grid.querySelectorAll(".site-card").forEach(function (el) {
      el.addEventListener("click", function () { openSiteDetail(parseInt(el.getAttribute("data-site"), 10)); });
    });
  }

  function siteCard(s) {
    var st = S.siteState(s);
    var badge = st.isDone ? '<span class="badge green">준공완료</span>' :
      st.stalled ? '<span class="badge red">정체 ' + st.daysSince + '일</span>' :
        '<span class="badge blue">' + esc(st.phaseName) + '</span>';
    var typeBits = [];
    if (s.type.kind) typeBits.push(s.type.kind);
    if (s.type.area) typeBits.push(s.type.area + "평");
    var pc = progClass(st.progress);
    var html = '<div class="card site-card" data-site="' + s.id + '">';
    html += '<div class="site-head"><div style="min-width:0">' +
      '<div class="site-name">' + esc(s.owner || "(건축주 미정)") + '</div>' +
      '<div class="site-meta">' + esc(shortAddr(s.address)) + (typeBits.length ? ' · ' + esc(typeBits.join(" ")) : "") + '</div></div>' + badge + '</div>';
    html += '<div class="site-progress-row"><div class="progress ' + pc + '" style="flex:1"><span style="width:' + st.progress + '%"></span></div>' +
      '<span class="pct">' + st.progress + '%</span></div>';
    if (s.latest && s.latest.note) {
      html += '<div class="site-meta" style="border-top:1px solid var(--border);padding-top:10px">' +
        (s.latest.date ? '<span class="badge slate" style="margin-right:6px">' + fmtDate(s.latest.date) + '</span>' : "") +
        esc(oneLine(s.latest.note)) + '</div>';
    }
    html += '</div>';
    return html;
  }
  function oneLine(s) { return String(s || "").split("\n")[0]; }

  function openSiteDetail(id) {
    var s = S.site(id);
    if (!s) return;
    var st = S.siteState(s);
    var docKind = s.type.kind === "쉼터" ? "체류형쉼터" : "주택";
    var docList = (S.docTemplate && S.docTemplate[docKind]) || [];

    var html = '<div class="modal-head"><h3>' + esc(s.owner || "현장") + ' <span class="muted" style="font-size:13px;font-weight:400">#' + s.id + '</span></h3>' +
      '<button class="icon-btn" id="m-close">✕</button></div>';
    html += '<div class="modal-body">';

    // 기본 정보
    html += '<div class="field"><label>주소</label><div>' + nl2br(s.address) +
      (s.addressNote ? '<div class="muted" style="margin-top:4px">' + nl2br(s.addressNote) + '</div>' : "") + '</div>';
    html += '<div class="row2">';
    html += '<div class="field"><label>건축주 / 연락처</label><div>' + nl2br(s.owner) +
      (s.contact ? '<div class="muted">' + nl2br(s.contact) + '</div>' : "") + '</div>';
    html += '<div class="field"><label>종류</label><div>' + (esc(s.type.raw) || "-") + '</div></div>';
    html += '</div>';
    html += '<div class="row2">';
    html += '<div class="field"><label>임시전기</label><div>' + (esc(s.tempPower) || "-") + '</div></div>';
    html += '<div class="field"><label>참고샘플 / 제작공장</label><div>' + (esc(s.factory) || "-") + '</div></div>';
    html += '</div>';
    if (s.note) html += '<div class="field"><label>특이사항 / 보일러</label><div>' + nl2br(s.note) + '</div></div>';

    // 공정 진행
    html += '<div class="field"><label>현재 공정 ' + (st.isManual ? '<span class="badge blue">수동 지정</span>' : '<span class="badge slate">자동 추정</span>') + '</label>';
    html += '<div class="progress ' + progClass(st.progress) + '" style="margin:6px 0"><span style="width:' + st.progress + '%"></span></div>';
    html += '<select id="m-phase">' + S.phases.map(function (p, i) {
      return '<option value="' + i + '"' + (i === st.phaseIndex ? " selected" : "") + '>' + (i + 1) + '. ' + esc(p.key) + '</option>';
    }).join("") + '</select></div>';

    // 최근 진행
    if (s.latest && (s.latest.note || s.latest.date)) {
      html += '<div class="field"><label>최근 진행상황</label><div>' +
        (s.latest.date ? '<span class="badge slate" style="margin-right:6px">' + fmtDate(s.latest.date) + '</span>' : "") +
        nl2br(s.latest.note) + '</div></div>';
    }

    // 일정 타임라인
    if (s.schedule && s.schedule.length) {
      html += '<div class="field"><label>일정 기록 (' + s.schedule.length + '건)</label><div style="max-height:180px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:4px 0">';
      s.schedule.slice().reverse().forEach(function (ev) {
        html += '<div style="display:flex;gap:10px;padding:6px 12px;border-bottom:1px solid var(--border)">' +
          '<span class="badge slate" style="min-width:56px;justify-content:center;align-self:flex-start">' + fmtDate(ev.date) + '</span>' +
          '<span>' + nl2br(ev.text) + '</span></div>';
      });
      html += '</div></div>';
    }

    // 준공서류 체크리스트
    html += '<div class="field"><label>준공서류 체크리스트 (' + docKind + ')</label><div style="border:1px solid var(--border);border-radius:8px">';
    docList.forEach(function (doc) {
      var checked = !!st.docs[doc];
      html += '<label style="display:flex;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer">' +
        '<input type="checkbox" class="check m-doc" data-doc="' + esc(doc) + '"' + (checked ? " checked" : "") + '>' +
        '<span' + (checked ? ' style="color:var(--muted);text-decoration:line-through"' : "") + '>' + esc(doc) + '</span></label>';
    });
    var doneDocs = docList.filter(function (d) { return st.docs[d]; }).length;
    html += '</div><div class="muted" style="margin-top:6px" id="m-doc-count">' + doneDocs + ' / ' + docList.length + ' 완료</div></div>';

    html += '</div>';
    html += '<div class="modal-foot"><button class="btn" id="m-close2">닫기</button></div>';
    openModal(html);

    document.getElementById("m-close").addEventListener("click", closeModal);
    document.getElementById("m-close2").addEventListener("click", closeModal);
    document.getElementById("m-phase").addEventListener("change", function (e) {
      S.setSitePhase(s.id, parseInt(e.target.value, 10));
    });
    modalEl.querySelectorAll(".m-doc").forEach(function (cb) {
      cb.addEventListener("change", function () {
        S.toggleDoc(s.id, cb.getAttribute("data-doc"));
        var span = cb.nextElementSibling;
        if (cb.checked) { span.style.color = "var(--muted)"; span.style.textDecoration = "line-through"; }
        else { span.style.color = ""; span.style.textDecoration = ""; }
        var dc = docList.filter(function (d) { return S.siteState(s).docs[d]; }).length;
        document.getElementById("m-doc-count").textContent = dc + " / " + docList.length + " 완료";
      });
    });
  }

  /* ============================================================
     작업 · 체크리스트
     ============================================================ */
  var tasksTab = "call"; // call | daily
  var tasksFilter = { q: "", status: "" };

  function renderTasks() {
    var html = "";
    html += '<div class="toolbar">';
    html += '<button class="btn ' + (tasksTab === "call" ? "primary" : "") + '" id="tab-call">📞 인수인계 · 통화</button>';
    html += '<button class="btn ' + (tasksTab === "daily" ? "primary" : "") + '" id="tab-daily">🗒️ 일일 업무보고</button>';
    html += '<span class="spacer"></span>';
    html += '<input type="text" class="search" id="task-q" placeholder="내용 검색" value="' + esc(tasksFilter.q) + '">';
    html += '<select id="task-status"><option value="">전체</option><option value="open"' + (tasksFilter.status === "open" ? " selected" : "") + '>미완료</option><option value="done"' + (tasksFilter.status === "done" ? " selected" : "") + '>완료</option></select>';
    html += '<button class="btn primary" id="task-add">+ 항목 추가</button>';
    html += "</div>";
    html += '<div id="task-body"></div>';
    viewEl.innerHTML = html;

    document.getElementById("tab-call").addEventListener("click", function () { tasksTab = "call"; renderTasks(); });
    document.getElementById("tab-daily").addEventListener("click", function () { tasksTab = "daily"; renderTasks(); });
    document.getElementById("task-q").addEventListener("input", debounce(function (e) { tasksFilter.q = e.target.value; paintTasks(); }, 160));
    document.getElementById("task-status").addEventListener("change", function (e) { tasksFilter.status = e.target.value; paintTasks(); });
    document.getElementById("task-add").addEventListener("click", openAddTask);
    paintTasks();
  }

  function matchTask(content, done) {
    var q = tasksFilter.q.trim().toLowerCase();
    if (q && content.toLowerCase().indexOf(q) === -1) return false;
    if (tasksFilter.status === "open" && done) return false;
    if (tasksFilter.status === "done" && !done) return false;
    return true;
  }

  function statusBadge(status, done) {
    if (done) return '<span class="badge green">완료</span>';
    var s = (status || "").replace(/\s/g, "");
    if (s.indexOf("진행") !== -1) return '<span class="badge amber">진행중</span>';
    if (status) return '<span class="badge slate">' + esc(status) + '</span>';
    return '<span class="badge slate">미처리</span>';
  }

  function paintTasks() {
    var body = document.getElementById("task-body");
    if (tasksTab === "call") {
      var calls = S.calls().filter(function (c) { return matchTask(c.content, S.callDone(c)); });
      var doneN = S.calls().filter(function (c) { return S.callDone(c); }).length;
      var totalN = S.calls().length;
      var rows = calls.map(function (c) {
        var done = S.callDone(c);
        return '<tr class="' + (done ? "done" : "") + '">' +
          '<td><input type="checkbox" class="check t-call" data-id="' + esc(c.id) + '"' + (done ? " checked" : "") + '></td>' +
          '<td class="task-title">' + nl2br(c.content) + '</td>' +
          '<td>' + statusBadge(c.status, done) + '</td>' +
          '<td>' + nl2br(c.memo) + '</td>' +
          '<td class="row-actions">' + (String(c.id).match(/^[ui]/) ? '<button class="icon-btn t-del" data-id="' + esc(c.id) + '" title="삭제">🗑</button>' : "") + '</td>' +
          '</tr>';
      }).join("");
      body.innerHTML = tasksProgress(doneN, totalN) +
        '<div class="table-wrap"><table><thead><tr><th style="width:44px">완료</th><th>내용</th><th style="width:90px">상태</th><th style="width:220px">비고</th><th style="width:44px"></th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5">' + emptyRow("항목이 없습니다.") + '</td></tr>') + '</tbody></table></div>';
      bindCallRows();
    } else {
      var groups = S.dailyGroups();
      var extra = S.extraDaily();
      var htmlG = tasksProgressDaily();
      groups.forEach(function (g, gi) {
        var items = g.items.filter(function (it) { return matchTask(it.content, S.dailyDone(it)); });
        htmlG += '<div class="section-title">🗒️ ' + esc(g.sheet) + ' <span class="muted" style="font-weight:400">(' + g.items.length + '건)</span></div>';
        htmlG += dailyTable(items);
      });
      if (extra.length) {
        var eitems = extra.filter(function (it) { return matchTask(it.content, S.dailyDone(it)); });
        htmlG += '<div class="section-title">➕ 추가 항목</div>' + dailyTable(eitems);
      }
      body.innerHTML = htmlG;
      bindDailyRows();
    }
  }

  function tasksProgress(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    return '<div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:16px">' +
      '<div style="min-width:120px"><div class="stat-value blue" style="font-size:22px">' + done + ' / ' + total + '</div><div class="muted">처리 완료</div></div>' +
      '<div class="progress ' + progClass(pct) + '" style="flex:1"><span style="width:' + pct + '%"></span></div><span class="pct">' + pct + '%</span></div>';
  }
  function tasksProgressDaily() {
    var all = [];
    S.dailyGroups().forEach(function (g) { all = all.concat(g.items); });
    all = all.concat(S.extraDaily());
    var done = all.filter(function (it) { return S.dailyDone(it); }).length;
    return tasksProgress(done, all.length);
  }

  function dailyTable(items) {
    var rows = items.map(function (it) {
      var done = S.dailyDone(it);
      return '<tr class="' + (done ? "done" : "") + '">' +
        '<td><input type="checkbox" class="check t-daily" data-id="' + esc(it.id) + '"' + (done ? " checked" : "") + '></td>' +
        '<td class="task-title">' + nl2br(it.content) + '</td>' +
        '<td>' + statusBadge(it.status, done) + '</td>' +
        '<td>' + nl2br(it.memo) + '</td>' +
        '<td class="row-actions">' + (String(it.id).match(/^[ui]/) ? '<button class="icon-btn t-del-d" data-id="' + esc(it.id) + '" title="삭제">🗑</button>' : "") + '</td>' +
        '</tr>';
    }).join("");
    return '<div class="table-wrap"><table><thead><tr><th style="width:44px">완료</th><th>내용</th><th style="width:90px">상태</th><th style="width:220px">비고</th><th style="width:44px"></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5">' + emptyRow("항목이 없습니다.") + '</td></tr>') + '</tbody></table></div>';
  }

  function bindCallRows() {
    viewEl.querySelectorAll(".t-call").forEach(function (cb) {
      cb.addEventListener("change", function () { S.toggleCall(cb.getAttribute("data-id")); paintTasks(); });
    });
    viewEl.querySelectorAll(".t-del").forEach(function (b) {
      b.addEventListener("click", function () { if (confirm("이 항목을 삭제할까요?")) { S.removeTask(b.getAttribute("data-id")); paintTasks(); } });
    });
  }
  function bindDailyRows() {
    viewEl.querySelectorAll(".t-daily").forEach(function (cb) {
      cb.addEventListener("change", function () {
        S.toggleDaily(cb.getAttribute("data-id"), cb.checked ? false : true); // toggle 반대값 저장
        paintTasks();
      });
    });
    viewEl.querySelectorAll(".t-del-d").forEach(function (b) {
      b.addEventListener("click", function () { if (confirm("이 항목을 삭제할까요?")) { S.removeTask(b.getAttribute("data-id")); paintTasks(); } });
    });
  }

  function openAddTask() {
    var group = tasksTab;
    var html = '<div class="modal-head"><h3>항목 추가</h3><button class="icon-btn" id="a-close">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="field"><label>구분</label><div>' + (group === "call" ? "인수인계 · 통화" : "일일 업무보고") + '</div></div>' +
      '<div class="field"><label>내용 *</label><textarea id="a-content" rows="3" placeholder="처리할 내용을 입력하세요"></textarea></div>' +
      '<div class="field"><label>비고</label><input type="text" id="a-memo" placeholder="선택"></div>' +
      '</div><div class="modal-foot"><button class="btn" id="a-cancel">취소</button><button class="btn primary" id="a-save">추가</button></div>';
    openModal(html);
    document.getElementById("a-close").addEventListener("click", closeModal);
    document.getElementById("a-cancel").addEventListener("click", closeModal);
    document.getElementById("a-save").addEventListener("click", function () {
      var content = document.getElementById("a-content").value.trim();
      if (!content) { alert("내용을 입력하세요."); return; }
      S.addTask(group, content, document.getElementById("a-memo").value.trim());
      closeModal(); paintTasks();
    });
  }

  /* ============================================================
     자재 물량
     ============================================================ */
  function renderMaterials() {
    var list = S.mulryang();
    var html = "";
    if (!list.length) { viewEl.innerHTML = emptyBox("물량 산출 데이터가 없습니다."); return; }
    list.forEach(function (m, idx) {
      html += '<div class="section-title">' + (m.category === "타일물량" ? "🧱 " : "📦 ") + esc(m.site || m.sheet) +
        ' <span class="badge ' + (m.category === "타일물량" ? "amber" : "blue") + '">' + esc(m.category) + '</span></div>';
      html += '<div class="card">';
      if (m.note) html += '<div class="muted" style="white-space:pre-line;margin-bottom:12px">' + esc(m.note) + '</div>';
      // 합계
      if (m.totals && m.totals.length) {
        html += '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:14px">';
        m.totals.forEach(function (t) {
          html += '<div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="muted">' + esc(t.name) + '</div>' +
            '<div style="font-size:20px;font-weight:800;margin-top:4px">' + num(t.value) + ' <span style="font-size:12px;font-weight:400;color:var(--text-2)">' + esc(t.unit) + '</span></div></div>';
        });
        html += '</div>';
      }
      // 산출 상세
      html += '<button class="btn sm" data-detail="' + idx + '">산출 상세 ' + (m.items ? m.items.length : 0) + '행 보기 ▾</button>';
      html += '<div class="detail-box hidden" id="detail-' + idx + '" style="margin-top:12px"></div>';
      html += '</div>';
    });
    viewEl.innerHTML = html;

    viewEl.querySelectorAll("[data-detail]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = b.getAttribute("data-detail");
        var box = document.getElementById("detail-" + i);
        if (box.classList.contains("hidden")) {
          box.classList.remove("hidden");
          b.textContent = "산출 상세 접기 ▴";
          if (!box.innerHTML) box.innerHTML = materialItemsTable(list[i].items);
        } else {
          box.classList.add("hidden");
          b.textContent = "산출 상세 " + (list[i].items ? list[i].items.length : 0) + "행 보기 ▾";
        }
      });
    });
  }

  function materialItemsTable(items) {
    var rows = (items || []).map(function (it) {
      return '<tr><td>' + esc(it.pos) + '</td><td>' + esc(it.gubun) + '</td><td>' + esc(it.formula) + '</td>' +
        '<td style="text-align:right">' + (typeof it.value === "number" ? num(it.value) : esc(it.value)) + '</td>' +
        '<td>' + esc(it.note || "") + '</td></tr>';
    }).join("");
    return '<div class="table-wrap"><table><thead><tr><th>위치</th><th style="width:110px">구분</th><th>산식</th><th style="width:90px;text-align:right">값</th><th style="width:130px">비고</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">' + emptyRow("상세 없음") + '</td></tr>') + '</tbody></table></div>';
  }

  /* ============================================================
     표준 공정표
     ============================================================ */
  function renderProcess() {
    var pt = S.base.processTemplate;
    var html = '<div class="card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<div><div style="font-size:16px;font-weight:700">' + esc(pt.title) + '</div>' +
      '<div class="muted">' + esc(pt.author) + '</div></div>' +
      '<span class="badge blue">표준 14단계</span></div>';
    html += '<div class="table-wrap"><table><thead><tr><th style="width:80px">구분</th><th style="width:44px">순서</th><th>공종</th><th style="width:150px">기준 일정</th><th>비고</th></tr></thead><tbody>';
    var n = 0;
    pt.rows.forEach(function (r) {
      if (r.group === "건축") n++;
      html += '<tr><td><span class="badge ' + (r.group === "건축" ? "blue" : r.group === "설비" ? "amber" : "slate") + '">' + esc(r.group) + '</span></td>' +
        '<td>' + (r.group === "건축" ? n : "-") + '</td>' +
        '<td style="font-weight:600">' + esc(r.name) + '</td>' +
        '<td class="muted">' + esc(r.span) + '</td>' +
        '<td>' + esc(r.memo) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="import-hint" style="margin-top:14px">ℹ️ ' + esc(pt.note) + '</div>';
    html += '</div>';
    viewEl.innerHTML = html;
  }

  /* ============================================================
     엑셀 불러오기 (붙여넣기)
     ============================================================ */
  function renderImport() {
    var html = '<div class="import-steps">';
    html += '<div class="import-hint">📋 <strong>엑셀에서 바로 붙여넣기</strong><br>' +
      '엑셀에서 <code>내용</code> 열(필요시 <code>상태</code>, <code>비고</code>까지)을 선택해 복사한 뒤 아래에 붙여넣으세요. ' +
      '열은 <strong>탭(Tab)</strong>으로 구분됩니다. 각 줄이 하나의 작업 항목으로 추가됩니다.</div>';

    html += '<div class="field"><label>추가할 곳</label><select id="imp-group">' +
      '<option value="call">인수인계 · 통화 리스트</option>' +
      '<option value="daily">일일 업무보고</option></select></div>';

    html += '<div class="field"><label>열 순서</label><select id="imp-cols">' +
      '<option value="content">1열: 내용</option>' +
      '<option value="content,status">1열: 내용 · 2열: 상태</option>' +
      '<option value="content,status,memo" selected>1열: 내용 · 2열: 상태 · 3열: 비고</option>' +
      '<option value="content,memo">1열: 내용 · 2열: 비고</option></select></div>';

    html += '<div class="field"><label>붙여넣기</label><textarea class="paste-area" id="imp-text" placeholder="여기에 엑셀 셀을 붙여넣으세요..."></textarea></div>';
    html += '<div style="display:flex;gap:10px;align-items:center"><button class="btn" id="imp-preview">미리보기</button>' +
      '<button class="btn primary" id="imp-do">불러오기</button><span id="imp-msg" class="muted"></span></div>';
    html += '<div id="imp-preview-box"></div>';
    html += '</div>';
    viewEl.innerHTML = html;

    document.getElementById("imp-preview").addEventListener("click", function () { previewImport(false); });
    document.getElementById("imp-do").addEventListener("click", function () { previewImport(true); });
  }

  function parsePaste(text, cols) {
    var order = cols.split(",");
    var lines = text.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    return lines.map(function (line) {
      var cells = line.split("\t");
      var row = { content: "", status: "", memo: "" };
      order.forEach(function (key, i) { row[key] = (cells[i] || "").trim(); });
      return row;
    }).filter(function (r) { return r.content; });
  }

  function previewImport(commit) {
    var group = document.getElementById("imp-group").value;
    var cols = document.getElementById("imp-cols").value;
    var text = document.getElementById("imp-text").value;
    var rows = parsePaste(text, cols);
    var msg = document.getElementById("imp-msg");
    if (!rows.length) { msg.textContent = "붙여넣은 데이터가 없습니다."; document.getElementById("imp-preview-box").innerHTML = ""; return; }
    if (commit) {
      var n = S.importTasks(group, rows);
      msg.textContent = n + "건을 불러왔습니다. ✅";
      document.getElementById("imp-text").value = "";
      document.getElementById("imp-preview-box").innerHTML = '<div class="import-hint" style="margin-top:14px">✅ ' + n + '건이 <strong>' + (group === "call" ? "통화 리스트" : "일일 업무보고") + '</strong>에 추가되었습니다. 작업·체크리스트에서 확인하세요.</div>';
      return;
    }
    msg.textContent = rows.length + "건 인식됨 (미리보기)";
    var body = rows.slice(0, 30).map(function (r) {
      return '<tr><td class="task-title">' + esc(r.content) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.memo) + '</td></tr>';
    }).join("");
    document.getElementById("imp-preview-box").innerHTML =
      '<div class="section-title">미리보기 (' + rows.length + '건)</div><div class="table-wrap"><table><thead><tr><th>내용</th><th style="width:100px">상태</th><th style="width:180px">비고</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ---------- 공통 빈 상태 ---------- */
  function emptyBox(msg) { return '<div class="empty"><div class="big">📭</div>' + esc(msg) + '</div>'; }
  function emptyRow(msg) { return '<div class="empty" style="padding:30px">' + esc(msg) + '</div>'; }

  /* ---------- 초기화 버튼 ---------- */
  document.getElementById("btn-reset").addEventListener("click", function () {
    if (confirm("모든 편집(체크·공정지정·추가항목)을 지우고 원본 데이터로 되돌릴까요?")) {
      S.resetAll(); render();
    }
  });

  // ---------- 잠금(로그아웃) 버튼 ----------
  var lockBtn = document.getElementById("btn-lock");
  if (lockBtn) lockBtn.addEventListener("click", function () {
    if (window.SeumAuth) window.SeumAuth.lock();
  });

  // ---------- 시작 (관리자 인증 이후) ----------
  window.SeumApp = { __started: false, start: function () { navigate("dashboard"); } };
  if (!window.SeumAuth || window.SeumAuth.isAuthed()) {
    window.SeumApp.__started = true;
    window.SeumApp.start();
  }
  // 미인증 시: auth.js가 잠금 화면을 표시하고, 입장 성공 시 start()를 호출합니다.
})();
