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

  var CLOSED_SIZE = { width: 230, height: 56 }; // wide pill launcher, not a square icon button
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

  // Start with no footprint at all — revealed only once the page inside
  // confirms the token actually resolves ("ready", below). Showing the pill
  // immediately and hiding it later (the old behavior) meant a disabled
  // widget flashed on-screen for however long the iframe took to boot and
  // fetch its config before disappearing.
  iframe.style.width = "0px";
  iframe.style.height = "0px";
  iframe.style.pointerEvents = "none";

  var isFullscreen = false;
  // Snapshot of the iframe's own position when a drag starts — deltas from
  // the page (which can't move itself; it's just the iframe's content) are
  // applied relative to this, not to the iframe's live position, so a fast
  // drag never drifts from the pointer.
  var dragOrigin = null;
  // Becomes true once the page confirms the token resolves — nothing is
  // shown or acted on before that.
  var ready = false;
  // Set once the page tells us the token is disabled/invalid — permanent for
  // this page load, so every later message (a stray resize, etc.) is ignored
  // instead of bringing the pill back.
  var unavailable = false;

  // The loader alone knows the real host-page viewport, so it (not the page
  // inside the iframe) decides desktop-panel vs. mobile-fullscreen sizing.
  function applyOpenState(open) {
    isFullscreen = false;
    if (!open) {
      setBottomRight(CLOSED_SIZE); // also resets any dragged position — see dragEnd's comment
      return;
    }
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      isFullscreen = true;
      setFullscreen();
    } else {
      setBottomRight({
        width: Math.min(OPEN_SIZE.width, window.innerWidth - EDGE_OFFSET * 2),
        height: Math.min(OPEN_SIZE.height, window.innerHeight - EDGE_OFFSET * 2),
      });
    }
  }

  // Dragging the open panel's header — the page tracks its own pointer
  // events (it can't reposition the iframe from inside) and relays deltas
  // here, since only the loader can actually move the iframe on the host
  // page. Not draggable in mobile fullscreen (nowhere to drag to), and
  // clamped so the panel can never end up partly off-screen.
  function handleDragStart() {
    if (isFullscreen) return;
    var rect = iframe.getBoundingClientRect();
    dragOrigin = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function handleDrag(dx, dy) {
    if (isFullscreen || !dragOrigin) return;
    var maxLeft = Math.max(window.innerWidth - dragOrigin.width, 0);
    var maxTop = Math.max(window.innerHeight - dragOrigin.height, 0);
    var left = Math.min(Math.max(dragOrigin.left + dx, 0), maxLeft);
    var top = Math.min(Math.max(dragOrigin.top + dy, 0), maxTop);
    iframe.style.right = "";
    iframe.style.bottom = "";
    iframe.style.left = left + "px";
    iframe.style.top = top + "px";
  }

  // Collapses the iframe to nothing and stops it from ever taking space or
  // clicks again — there's no launcher pill for a widget that isn't there.
  function hide() {
    unavailable = true;
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.pointerEvents = "none";
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE) return;
    if (data.type === "unavailable") return hide();
    if (unavailable) return; // disabled/invalid token — ignore everything else

    if (data.type === "ready") {
      if (ready) return;
      ready = true;
      iframe.style.pointerEvents = "";
      applyOpenState(false); // reveal at the default closed (pill) size
      return;
    }
    if (!ready) return; // config hasn't resolved yet — nothing to show or act on

    if (data.type === "resize") applyOpenState(Boolean(data.open));
    else if (data.type === "dragStart") handleDragStart();
    else if (data.type === "drag") handleDrag(Number(data.dx) || 0, Number(data.dy) || 0);
    // dragEnd needs no handler — the dragged position already stuck via
    // handleDrag, and it resets to the default corner next time the widget
    // closes (setBottomRight above), same as SupportChatWidget's floater.
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
