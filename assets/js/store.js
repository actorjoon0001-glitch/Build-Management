/* ============================================================
   시공OS · Store — 상태 관리 + localStorage 오버레이
   기본 데이터(window.SEUM_DATA)는 읽기 전용으로 두고,
   사용자 편집(체크 상태·공정 지정·추가 항목)은 오버레이로 저장한다.
   ============================================================ */
(function () {
  "use strict";

  var LS_KEY = "seum_sigong_os_v1";
  var base = window.SEUM_DATA || { sites: [], calls: [], daily: [], mulryang: [], phases: [], phaseKeywords: [], docTemplate: [] };

  // ---------- 오버레이 로드/저장 ----------
  function loadOverlay() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function defaultOverlay() {
    return {
      // siteId -> { phaseIndex: number, docs: {docName: bool}, memo: string }
      sites: {},
      // callId -> bool (완료 여부)  /  또한 status 문자열 override
      callDone: {},
      // dailyItemId -> bool
      dailyDone: {},
      // 사용자가 추가한 작업 항목
      addedTasks: [],  // {id, group:'call'|'daily', content, status, memo, siteRef}
    };
  }
  var overlay = loadOverlay() || defaultOverlay();
  // 이전 버전 호환 필드 보정
  ["sites", "callDone", "dailyDone", "addedTasks"].forEach(function (k) {
    if (overlay[k] == null) overlay[k] = defaultOverlay()[k];
  });

  var saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(overlay)); } catch (e) {}
    }, 120);
  }

  // ---------- 공정 추정 ----------
  function inferPhaseIndex(site) {
    var text = ((site.latest && site.latest.note) || "") + " " +
      ((site.schedule && site.schedule.length) ? site.schedule[site.schedule.length - 1].text : "");
    var kws = base.phaseKeywords || [];
    var phaseNames = (base.phases || []).map(function (p) { return p.key; });
    for (var i = 0; i < kws.length; i++) {
      if (text.indexOf(kws[i][0]) !== -1) {
        var idx = phaseNames.indexOf(kws[i][1]);
        if (idx !== -1) return idx;
      }
    }
    return 0; // 기본: 가설공사
  }

  // ---------- 사이트 파생 상태 ----------
  function siteState(site) {
    var ov = overlay.sites[site.id] || {};
    var auto = inferPhaseIndex(site);
    var phaseIndex = (typeof ov.phaseIndex === "number") ? ov.phaseIndex : auto;
    var isManual = (typeof ov.phaseIndex === "number");
    var total = (base.phases || []).length || 1;
    var progress = Math.round(((phaseIndex + 1) / total) * 100);
    var isDone = phaseIndex >= total - 1;
    // 지연 여부: 최근 진행일이 21일 이상 경과했으면 정체로 표시
    var stalled = false, daysSince = null;
    if (site.latest && site.latest.date) {
      var TODAY = Store.today;
      var d = Date.parse(site.latest.date + "T00:00:00");
      if (!isNaN(d)) {
        daysSince = Math.floor((TODAY - d) / 86400000);
        stalled = daysSince >= 21 && !isDone;
      }
    }
    return {
      phaseIndex: phaseIndex,
      phaseName: (base.phases[phaseIndex] || {}).key || "-",
      isManual: isManual,
      progress: progress,
      isDone: isDone,
      stalled: stalled,
      daysSince: daysSince,
      docs: ov.docs || {},
      memo: ov.memo || "",
    };
  }

  function setSitePhase(siteId, phaseIndex) {
    if (!overlay.sites[siteId]) overlay.sites[siteId] = {};
    overlay.sites[siteId].phaseIndex = phaseIndex;
    persist();
  }
  function setSiteMemo(siteId, memo) {
    if (!overlay.sites[siteId]) overlay.sites[siteId] = {};
    overlay.sites[siteId].memo = memo;
    persist();
  }
  function toggleDoc(siteId, docName) {
    if (!overlay.sites[siteId]) overlay.sites[siteId] = {};
    if (!overlay.sites[siteId].docs) overlay.sites[siteId].docs = {};
    var docs = overlay.sites[siteId].docs;
    docs[docName] = !docs[docName];
    persist();
  }

  // ---------- 체크리스트 상태 ----------
  // 통화 리스트: 원본 status(완료/진행중/…)를 우선하되, 사용자가 토글하면 override
  function callDone(call) {
    if (Object.prototype.hasOwnProperty.call(overlay.callDone, call.id)) {
      return overlay.callDone[call.id];
    }
    var s = (call.status || "").replace(/\s/g, "");
    return s.indexOf("완료") !== -1;
  }
  function toggleCall(id) {
    var cur = null;
    // 현재 표시값 계산
    var call = base.calls.filter(function (c) { return c.id === id; })[0]
      || overlay.addedTasks.filter(function (t) { return t.id === id; })[0];
    cur = call ? callDone(call) : false;
    overlay.callDone[id] = !cur;
    persist();
  }
  function dailyDone(item) {
    if (Object.prototype.hasOwnProperty.call(overlay.dailyDone, item.id)) {
      return overlay.dailyDone[item.id];
    }
    var s = (item.status || "").replace(/\s/g, "");
    return s.indexOf("완료") !== -1;
  }
  function toggleDaily(id, curVal) {
    overlay.dailyDone[id] = !curVal;
    persist();
  }

  function addTask(group, content, memo) {
    var id = "u" + Date.now() + "_" + Math.floor(overlay.addedTasks.length + 1);
    overlay.addedTasks.push({ id: id, group: group, content: content, status: "", memo: memo || "" });
    persist();
    return id;
  }
  function removeTask(id) {
    overlay.addedTasks = overlay.addedTasks.filter(function (t) { return t.id !== id; });
    delete overlay.callDone[id];
    delete overlay.dailyDone[id];
    persist();
  }

  // 붙여넣기 임포트로 통화/일일 항목 대량 추가
  function importTasks(group, rows) {
    var added = 0;
    rows.forEach(function (r) {
      if (!r.content) return;
      var id = "i" + Date.now() + "_" + (overlay.addedTasks.length + added);
      overlay.addedTasks.push({ id: id, group: group, content: r.content, status: r.status || "", memo: r.memo || "" });
      added++;
    });
    persist();
    return added;
  }

  function resetAll() {
    overlay = defaultOverlay();
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  // ---------- 공개 API ----------
  var Store = {
    today: Date.parse("2026-07-16T00:00:00"), // 데이터 기준일 (오늘)
    base: base,
    phases: base.phases,
    docTemplate: base.docTemplate,

    sites: function () { return base.sites; },
    site: function (id) { return base.sites.filter(function (s) { return s.id === id; })[0]; },
    siteState: siteState,
    setSitePhase: setSitePhase,
    setSiteMemo: setSiteMemo,
    toggleDoc: toggleDoc,

    calls: function () {
      var extra = overlay.addedTasks.filter(function (t) { return t.group === "call"; });
      return base.calls.concat(extra);
    },
    dailyGroups: function () { return base.daily; },
    extraDaily: function () { return overlay.addedTasks.filter(function (t) { return t.group === "daily"; }); },
    callDone: callDone,
    toggleCall: toggleCall,
    dailyDone: dailyDone,
    toggleDaily: toggleDaily,
    addTask: addTask,
    removeTask: removeTask,
    importTasks: importTasks,

    mulryang: function () { return base.mulryang; },

    resetAll: resetAll,
  };

  window.Store = Store;
})();
