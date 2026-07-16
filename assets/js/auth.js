/* ============================================================
   시공OS · 관리자 잠금 (클라이언트 사이드 간이 잠금)
   ⚠ 주의: 정적 웹앱의 클라이언트 잠금은 편의용이며 강한 보안이 아닙니다.
      비밀번호는 평문 대신 해시(cyrb53, 솔트 적용)로만 저장합니다.
      실제 접근 제한은 서버(세움 플랫폼) 로그인 연동이 필요합니다.
   ============================================================ */
(function () {
  "use strict";

  // "seum::<비밀번호>" 의 cyrb53 해시. 비밀번호 자체는 소스에 없음.
  var PASS_HASH = "1948504751853713";
  var SALT = "seum::";
  var SS_KEY = "seum_admin_authed_v1";

  function cyrb53(str, seed) {
    seed = seed || 0;
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString();
  }

  function verify(pw) { return cyrb53(SALT + pw) === PASS_HASH; }

  function isAuthed() {
    try { return sessionStorage.getItem(SS_KEY) === "1"; } catch (e) { return false; }
  }
  function setAuthed(v) {
    try {
      if (v) sessionStorage.setItem(SS_KEY, "1");
      else sessionStorage.removeItem(SS_KEY);
    } catch (e) {}
  }

  var appEl, lockEl;

  function buildLock() {
    lockEl = document.createElement("div");
    lockEl.id = "lock-screen";
    lockEl.innerHTML =
      '<div class="lock-card">' +
      '<div class="lock-brand"><div class="lock-mark">세움</div><div><strong>시공OS</strong><span>통합 플랫폼</span></div></div>' +
      '<div class="lock-title">🔒 관리자 인증</div>' +
      '<p class="lock-desc">이 페이지는 시공팀 전용입니다. 관리자 비밀번호를 입력하세요.</p>' +
      '<form id="lock-form" autocomplete="off">' +
      '<input type="password" id="lock-pw" inputmode="numeric" placeholder="비밀번호" autocomplete="off" />' +
      '<button type="submit" class="lock-btn">입장하기</button>' +
      '</form>' +
      '<div id="lock-err" class="lock-err"></div>' +
      '</div>';
    document.body.appendChild(lockEl);

    var form = lockEl.querySelector("#lock-form");
    var pw = lockEl.querySelector("#lock-pw");
    var err = lockEl.querySelector("#lock-err");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (verify(pw.value)) {
        setAuthed(true);
        unlock();
      } else {
        err.textContent = "비밀번호가 올바르지 않습니다.";
        pw.value = "";
        pw.focus();
        lockEl.querySelector(".lock-card").classList.remove("shake");
        void lockEl.offsetWidth; // reflow
        lockEl.querySelector(".lock-card").classList.add("shake");
      }
    });
    setTimeout(function () { pw.focus(); }, 50);
  }

  function showLock() {
    if (appEl) appEl.style.display = "none";
    if (!lockEl) buildLock();
    lockEl.style.display = "flex";
    var pw = lockEl.querySelector("#lock-pw");
    if (pw) { pw.value = ""; setTimeout(function () { pw.focus(); }, 50); }
  }

  function unlock() {
    if (lockEl) lockEl.style.display = "none";
    if (appEl) appEl.style.display = "";
    // 앱 최초 시작 (앱이 로드되어 있으면 start 호출)
    if (window.SeumApp && !window.SeumApp.__started) {
      window.SeumApp.__started = true;
      window.SeumApp.start();
    }
  }

  function lock() {
    setAuthed(false);
    if (window.SeumApp) window.SeumApp.__started = false;
    showLock();
  }

  function init() {
    appEl = document.getElementById("app");
    if (isAuthed()) {
      // 인증됨: 앱 표시 + 시작
      if (appEl) appEl.style.display = "";
      unlock();
    } else {
      showLock();
    }
  }

  window.SeumAuth = { isAuthed: isAuthed, lock: lock };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
