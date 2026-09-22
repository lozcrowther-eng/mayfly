CTFd._internal.challenge.data = undefined;

// TODO: Remove in CTFd v4.0 (matches the stock challenge type's own view.js)
CTFd._internal.challenge.renderer = null;
CTFd._internal.challenge.render = null;

CTFd._internal.challenge.preRender = function () {};

/**
 * The Launch/status panel is plain DOM + fetch, injected directly into the modal rather
 * than wired into the theme's Alpine.js reactivity (x-data="Challenge") -- that component
 * belongs to CTFd core, and reaching into it would break on any theme update that changes
 * its internal shape. Polling every 2s against /plugins/ctfd_mayfly/status is simple, theme-
 * independent, and matches exactly how the orchestrator's own demo console polls its
 * lifecycle (see its components/challenge-card.tsx) -- the same state machine on both ends:
 * queued -> provisioning -> healthy -> expiring -> reaped -> failed.
 */
(function () {
  var POLL_INTERVAL_MS = 2000;
  var pollTimer = null;
  var currentRunId = null;

  function modalRoot() {
    return document.getElementById("challenge-window");
  }

  function qs(selector) {
    var root = modalRoot();
    return root ? root.querySelector(selector) : null;
  }

  function csrfHeaders() {
    return {
      "Content-Type": "application/json",
      "CSRF-Token": (window.init && window.init.csrfNonce) || "",
    };
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function panelHtml() {
    return (
      '<div id="mayfly-panel" class="mayfly-panel text-center mb-3">' +
      '  <div id="mayfly-launch-row">' +
      '    <button id="mayfly-launch-btn" type="button" class="btn btn-primary">Launch</button>' +
      "  </div>" +
      '  <div id="mayfly-status-row" style="display:none;">' +
      '    <div id="mayfly-state" class="fw-bold mb-1"></div>' +
      '    <div id="mayfly-url"></div>' +
      '    <div id="mayfly-countdown" class="text-muted small"></div>' +
      '    <div id="mayfly-actions" class="mt-2" style="display:none;">' +
      '      <button id="mayfly-extend-btn" type="button" class="btn btn-sm btn-outline-secondary">Extend</button> ' +
      '      <button id="mayfly-stop-btn" type="button" class="btn btn-sm btn-outline-danger">Stop</button>' +
      "    </div>" +
      "  </div>" +
      '  <div id="mayfly-failed-row" style="display:none;">' +
      '    <div class="alert alert-danger text-start" id="mayfly-triage"></div>' +
      "  </div>" +
      "</div>"
    );
  }

  // Friendlier than the raw state string, but still one label per value in InstanceState
  // (lib/types.ts on the orchestrator side) -- no new vocabulary invented on this end.
  var STATE_LABELS = {
    queued: "Queued — waiting for a launch slot",
    provisioning: "Provisioning — booting your sandbox",
    healthy: "Deployed",
    expiring: "Expiring soon",
  };

  function renderState(data) {
    var stateEl = qs("#mayfly-state");
    if (!stateEl) return; // modal was closed mid-poll

    var launchRow = qs("#mayfly-launch-row");
    var statusRow = qs("#mayfly-status-row");
    var failedRow = qs("#mayfly-failed-row");
    var actionsEl = qs("#mayfly-actions");

    if (data.state === "failed") {
      launchRow.style.display = "none";
      statusRow.style.display = "none";
      failedRow.style.display = "";
      var triageEl = qs("#mayfly-triage");
      triageEl.textContent = data.triage
        ? JSON.stringify(data.triage)
        : "Instance failed to start.";
      stopPolling();
      return;
    }

    if (data.state === "reaped") {
      var launchBtn = qs("#mayfly-launch-btn");
      if (launchBtn) {
        launchBtn.disabled = false;
        launchBtn.textContent = "Launch";
      }
      launchRow.style.display = "";
      statusRow.style.display = "none";
      failedRow.style.display = "none";
      stopPolling();
      return;
    }

    launchRow.style.display = "none";
    failedRow.style.display = "none";
    statusRow.style.display = "";
    stateEl.textContent = STATE_LABELS[data.state] || data.state;

    // Extend/Stop only make sense once there's an actual live instance to act on -- queued
    // and provisioning have nothing running yet, so those buttons remain hidden until then.
    var isLive = data.state === "healthy" || data.state === "expiring";
    if (actionsEl) actionsEl.style.display = isLive ? "" : "none";

    var urlEl = qs("#mayfly-url");
    urlEl.innerHTML = data.url
      ? '<a href="' + data.url + '" target="_blank" rel="noopener noreferrer">' + data.url + "</a>"
      : "";

    var countdownEl = qs("#mayfly-countdown");
    if (data.expires_at) {
      var remainingMs = new Date(data.expires_at).getTime() - Date.now();
      countdownEl.textContent =
        remainingMs > 0
          ? "Expires in " + Math.max(Math.floor(remainingMs / 1000), 0) + "s"
          : "Expiring...";
    } else {
      countdownEl.textContent = "";
    }
  }

  function pollStatus(runId) {
    fetch("/plugins/ctfd_mayfly/status?run_id=" + encodeURIComponent(runId), {
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json();
      })
      .then(renderState)
      .catch(function () {
        // A transient fetch failure isn't a terminal state -- the next poll just retries.
      });
  }

  function startPolling(runId) {
    currentRunId = runId;
    stopPolling();
    pollStatus(runId);
    pollTimer = setInterval(function () {
      pollStatus(runId);
    }, POLL_INTERVAL_MS);
  }

  function launch(challengeId) {
    // Disabled immediately, not left clickable until the first status poll resolves --
    // that poll only happens after this fetch itself completes, which is enough of a gap
    // for an impatient double-click to fire a second launch (harmless, since the backend
    // is idempotent, but confusing to watch happen).
    var launchBtn = qs("#mayfly-launch-btn");
    if (launchBtn) {
      launchBtn.disabled = true;
      launchBtn.textContent = "Launching…";
    }

    fetch("/plugins/ctfd_mayfly/launch", {
      method: "POST",
      credentials: "same-origin",
      headers: csrfHeaders(),
      body: JSON.stringify({ challenge_id: challengeId }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.run_id) {
          startPolling(data.run_id);
        } else if (launchBtn) {
          launchBtn.disabled = false;
          launchBtn.textContent = "Launch";
        }
      })
      .catch(function () {
        if (launchBtn) {
          launchBtn.disabled = false;
          launchBtn.textContent = "Launch";
        }
      });
  }

  /**
   * .submit-row is the intended anchor (matches the theme's own challenge.html exactly), but
   * postRender can fire before Alpine has finished painting the modal's body, and different
   * themes may not expose that exact class at all -- so this tries a short list of anchors,
   * in order, and retries briefly rather than silently no-op-ing the first time nothing
   * matches (which is exactly what happened the first time this ran: no launch button, no
   * error, because the single .submit-row lookup came up empty and the function just
   * returned). console.log calls stay in deliberately -- this is exactly the kind of DOM-
   * timing problem that's next to impossible to diagnose blind.
   */
  var ANCHOR_SELECTORS = [".submit-row", "#challenge-input", "#challenge"];
  var INJECT_RETRY_MS = 150;
  var INJECT_MAX_ATTEMPTS = 10;

  function findAnchor() {
    for (var i = 0; i < ANCHOR_SELECTORS.length; i++) {
      var el = qs(ANCHOR_SELECTORS[i]);
      if (el) return { el: el, selector: ANCHOR_SELECTORS[i] };
    }
    return null;
  }

  function injectPanel(attempt) {
    if (qs("#mayfly-panel")) return; // already injected from a previous open

    var anchor = findAnchor();
    if (!anchor) {
      if (attempt >= INJECT_MAX_ATTEMPTS) {
        console.error(
          "[mayfly] gave up looking for a place to inject the Launch panel after " +
            attempt +
            " attempts -- none of " +
            ANCHOR_SELECTORS.join(", ") +
            " were found inside #challenge-window"
        );
        return;
      }
      setTimeout(function () {
        injectPanel(attempt + 1);
      }, INJECT_RETRY_MS);
      return;
    }

    console.log("[mayfly] injecting Launch panel before " + anchor.selector + " (attempt " + attempt + ")");

    var wrapper = document.createElement("div");
    wrapper.innerHTML = panelHtml();
    var panel = wrapper.firstChild;

    if (anchor.selector === "#challenge") {
      // Last-resort fallback: no submit-row-like element at all, so just prepend into the
      // challenge tab pane itself rather than trying to insert "before" a sibling.
      anchor.el.insertBefore(panel, anchor.el.firstChild);
    } else {
      anchor.el.parentNode.insertBefore(panel, anchor.el);
    }

    wirePanelEvents();
  }

  function wirePanelEvents() {
    var challengeIdField = qs("#challenge-id");
    var challengeId = challengeIdField ? parseInt(challengeIdField.value, 10) : null;

    qs("#mayfly-launch-btn").addEventListener("click", function () {
      launch(challengeId);
    });

    qs("#mayfly-extend-btn").addEventListener("click", function () {
      if (!currentRunId) return;
      fetch("/plugins/ctfd_mayfly/extend", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfHeaders(),
        body: JSON.stringify({ run_id: currentRunId }),
      });
    });

    qs("#mayfly-stop-btn").addEventListener("click", function () {
      if (!currentRunId) return;
      fetch("/plugins/ctfd_mayfly/stop", {
        method: "POST",
        credentials: "same-origin",
        headers: csrfHeaders(),
        body: JSON.stringify({ run_id: currentRunId }),
      });
      stopPolling();
    });

    // No "resume polling for an already-live instance on reopen" yet -- the launch
    // endpoint's own idempotency (api.py) already covers the common case: clicking Launch
    // again just returns the same live run_id instead of a second sandbox.
  }

  CTFd._internal.challenge.postRender = function () {
    injectPanel(0);
  };

  /**
   * The "N Solves" tab (.challenge-solves in the base challenge.html) is rendered once via
   * server-side Jinja ({{ solves }}) when the modal first opens -- it's not reactively bound
   * to anything, so it doesn't move from 0 to 1 after a correct submission until the modal
   * is closed and reopened (confirmed: this is stock CTFd behavior, not specific to this
   * challenge type -- a "standard" challenge has the exact same staleness). Bumping it here,
   * client-side, the moment a fresh "correct" comes back is a small enough fix to make
   * directly rather than waiting on CTFd core to change how that tab renders.
   */
  function bumpSolvesTab() {
    var tab = qs(".challenge-solves");
    if (!tab) return;
    var match = tab.textContent.match(/(\d+)/);
    var next = (match ? parseInt(match[1], 10) : 0) + 1;
    tab.textContent = next + (next === 1 ? " Solve" : " Solves");
  }

  CTFd._internal.challenge.submit = function (preview) {
    var challenge_id = parseInt(CTFd.lib.$("#challenge-id").val());
    var submission = CTFd.lib.$("#challenge-input").val();

    var body = {
      challenge_id: challenge_id,
      submission: submission,
    };
    var params = {};
    if (preview) {
      params["preview"] = true;
    }

    return CTFd.api.post_challenge_attempt(params, body).then(function (response) {
      if (response.status === 429) {
        return response;
      }
      if (response.status === 403) {
        return response;
      }
      // Only a fresh "correct" counts as a new solve -- "already_solved" (re-submitting
      // after already solving) was already reflected in that count on the modal's last
      // open, so bumping again there would overcount.
      if (response.data && response.data.status === "correct") {
        bumpSolvesTab();
      }
      return response;
    });
  };
})();
