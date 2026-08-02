/*!
 * TestMate live-chat embed loader.
 *
 * Usage:
 *   <script async src="https://<your-testmate-domain>/live-chat-widget.js" data-token="YOUR_WIDGET_TOKEN"></script>
 *
 * This file intentionally stays framework-free vanilla JS — it's the one
 * piece of the widget that runs directly in the host page's own document, so
 * it can't risk colliding with whatever the host page already loads (React,
 * jQuery, its own CSS resets, etc). It creates a single cross-origin <iframe>
 * pointed at /widget/live-chat/:token (a normal route in the main app) and
 * resizes that iframe on request — all the real UI/logic lives inside the
 * iframe's own document, fully isolated by the browser's same-origin policy.
 */
(function () {
  "use strict";

  if (window.__testmateLiveChatLoaded) return; // idempotent — a page can only include this once
  window.__testmateLiveChatLoaded = true;

  var currentScript = document.currentScript;
  var token = currentScript && currentScript.getAttribute("data-token");
  if (!token) {
    console.error("[TestMate Live Chat] Missing data-token attribute on the embed <script> tag.");
    return;
  }

  var origin = new URL(currentScript.src).origin;
  var MESSAGE_SOURCE = "testmate-live-chat-widget"; // must match LiveChatWidgetPage.tsx

  var CLOSED_SIZE = { width: 84, height: 84 };
  var OPEN_SIZE = { width: 400, height: 650 };
  var MOBILE_BREAKPOINT = 640;
  var EDGE_OFFSET = 20;

  var iframe = document.createElement("iframe");
  iframe.title = "Live chat";
  iframe.src = origin + "/widget/live-chat/" + encodeURIComponent(token);
  iframe.setAttribute("allow", "clipboard-write");
  iframe.setAttribute("scrolling", "no");
  iframe.style.position = "fixed";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.colorScheme = "light dark";
  iframe.style.zIndex = "2147483000"; // above virtually anything a host page could set
  iframe.style.transition = "width 0.15s ease, height 0.15s ease";

  function toCssSize(value) {
    return typeof value === "number" ? value + "px" : value;
  }

  function setBottomRight(size) {
    iframe.style.top = "";
    iframe.style.left = "";
    iframe.style.right = EDGE_OFFSET + "px";
    iframe.style.bottom = EDGE_OFFSET + "px";
    iframe.style.width = toCssSize(size.width);
    iframe.style.height = toCssSize(size.height);
  }

  function setFullscreen() {
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
  }

  setBottomRight(CLOSED_SIZE);

  // The loader alone knows the real host-page viewport, so it (not the page
  // inside the iframe) decides desktop-panel vs. mobile-fullscreen sizing.
  function applyOpenState(open) {
    if (!open) {
      setBottomRight(CLOSED_SIZE);
      return;
    }
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      setFullscreen();
    } else {
      setBottomRight({
        width: Math.min(OPEN_SIZE.width, window.innerWidth - EDGE_OFFSET * 2),
        height: Math.min(OPEN_SIZE.height, window.innerHeight - EDGE_OFFSET * 2),
      });
    }
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE) return;
    if (data.type === "resize") applyOpenState(Boolean(data.open));
  });

  function mount() {
    document.body.appendChild(iframe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
