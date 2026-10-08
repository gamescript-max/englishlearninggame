/** Native fullscreen includes body portals; unavailable/denied APIs keep the expanded map. */
export function createAdventureFullscreen(document: Document, onChange: (expanded: boolean) => void, canExit = () => true) {
  let expanded = false, disposed = false, pending = false, ownsNative = false;
  let previousOverflow: string | undefined;
  const root = document.documentElement;
  function display(value: boolean) {
    if (expanded === value) return;
    expanded = value;
    const style = document.body?.style;
    if (value && style) { previousOverflow = style.overflow; style.overflow = "hidden"; }
    if (!value && style && previousOverflow !== undefined) { style.overflow = previousOverflow; previousOverflow = undefined; }
    if (!disposed) onChange(value);
  }
  function exitNative() {
    if (!ownsNative || document.fullscreenElement !== root) return;
    ownsNative = false;
    try { void Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch { /* The CSS fallback can still exit. */ }
  }
  function exit() { display(false); exitNative(); }
  function change() {
    if (document.fullscreenElement === root && pending) {
      ownsNative = true;
      if (!expanded) exitNative();
    } else if (ownsNative && document.fullscreenElement !== root) {
      ownsNative = false; display(false);
    }
  }
  function escape(event: KeyboardEvent) {
    // Native Escape is owned by the browser. Modals get first refusal in the fallback.
    if (event.key === "Escape" && !event.defaultPrevented && expanded && !document.fullscreenElement && canExit()) exit();
  }
  document.addEventListener("fullscreenchange", change);
  document.addEventListener("keydown", escape);
  function requestNative() {
    if (disposed || !expanded || pending || document.fullscreenElement || !root?.requestFullscreen) return;
    pending = true;
    try {
      void Promise.resolve(root.requestFullscreen({ navigationUI: "hide" })).then(() => {
        pending = false;
        if (document.fullscreenElement === root) { ownsNative = true; if (disposed || !expanded) exitNative(); }
      }, () => { pending = false; });
    } catch { pending = false; }
  }
  return {
    enter() { if (!disposed) { display(true); requestNative(); } },
    requestNative,
    toggle() {
      if (disposed) return;
      if (expanded) { exit(); return; }
      display(true);
      requestNative();
    },
    dispose() {
      disposed = true; display(false); exitNative();
      document.removeEventListener("fullscreenchange", change);
      document.removeEventListener("keydown", escape);
    },
  };
}
