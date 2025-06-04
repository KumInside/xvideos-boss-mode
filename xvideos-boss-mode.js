(() => {
  const globalStyle = `
    body:not(.normal) { --shadow-bg: rgba(255,255,255,0.98); --hole-x: -500%; --hole-y: -500%; --mask-size: 0px; --fake-content: ""; --shadow-filter: blur(10px); }
    body:not(.normal)::after { content: var(--fake-content); display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--shadow-bg); z-index: 99999999; pointer-events: none; overflow: hidden; mask-image: radial-gradient(circle var(--mask-size) at var(--hole-x) var(--hole-y), #ffffff00 10%, #ffffffff 100%); mask-repeat: no-repeat; mask-composite: exclude; backdrop-filter: var(--shadow-filter); transition all 0.2s; }
    body.mask::after { }
    body.clip::after { clip-path: var(--clipped-area); }
    body.clip #html5video { filter: contrast(50%) opacity(50%); }
    body.mask img { user-drag: none; -webkit-user-drag: none; }
    body:not(.normal) #fake-loading {width: 100%; height: 100%: display: flex; justify-content: center; align-items: center;}
    body:not(.normal) #fake-loading::after {content: "Loading"; display: block;  font-size: 20px; color: #398;}
  `;
  const ClickStrategy = Object.freeze({
    NONE: 0,
    NEXT: 1,
    RESET: 2,
    PREV: 3,
    RESUME: 4,
    NORMAL: 5,
  });

  const MAX_MASK_SIZE = 500;
  const DEFAULT_MASK_SIZE = 0;
  const DEFAULT_MASK_OPACITY = 0.98;
  const DEFAULT_MASK_MODE = 0;

  function bindEvent(ctx, name, callback, ...otherArgs) {
    if (!ctx) {
      return;
    }
    if (
      ctx instanceof Document ||
      ctx instanceof DocumentFragment ||
      ctx === globalThis
    ) {
      otherArgs[0] = { ...otherArgs[0], passive: false };
    }
    globalThis._registeredCallbacks.push({
      ctx,
      name,
      callback,
      opts: otherArgs,
    });
    return ctx.addEventListener(name, callback, ...otherArgs);
  }

  function initRuntime() {
    globalThis.onerror = () => {};
    // 记录所有的 callback。
    globalThis._registeredCallbacks = globalThis._registeredCallbacks || [];
    globalThis._registeredCallbacks.forEach(({ name, callback, ctx }) => {
      ctx.removeEventListener(name, callback);
    });

    bindEvent(window, "DOMContentLoaded", () => {
      initDOM();
      initStyle();
      initEvents();
    });
  }

  function initDOM() {}

  function initStyle() {
    const style = document.createElement("style");
    style.id = "shadow";
    style.innerHTML = globalStyle;
    document.querySelector("#shadow")?.remove();
    document.head.appendChild(style);
    document.body.style.setProperty("--fake-content", getFakeLoadingSVG());
    resetMask(document.body);
  }

  let maskModeIndex = DEFAULT_MASK_MODE,
    maskSize = DEFAULT_MASK_SIZE,
    maskOpacity = DEFAULT_MASK_OPACITY,
    // 鼠标移出等特殊情况下 forceMask 是 true，此时临时重置。
    forceMask = false;
  const maskModes = ["mask", "clip"];

  function updateMaskStyles(el) {
    el.classList.remove("normal");
    maskModes.forEach((cls, i) => {
      if (i === (forceMask ? 0 : maskModeIndex)) {
        switch (cls) {
          case "clip":
            el.style.setProperty("--clipped-area", generateCurrentClipPath());
          default:
            el.style.setProperty(
              "--mask-size",
              `${forceMask ? DEFAULT_MASK_MODE : maskSize}px`
            );
            el.style.setProperty(
              "--shadow-bg",
              forceMask ? "#fff" : `rgba(255,255,255,${maskOpacity})`
            );
            el.style.setProperty(
              "--shadow-filter",
              forceMask ? "blur(10px)" : `blur(${10.2 * maskOpacity}px)`
            );
        }
        el.classList.add(cls);
      } else {
        el.classList.remove(cls);
      }
    });
  }

  function normalMode(el) {
    el.classList.add("normal");
  }

  function resetMask(el) {
    maskModeIndex = DEFAULT_MASK_MODE;
    maskSize = DEFAULT_MASK_SIZE;
    maskOpacity = DEFAULT_MASK_OPACITY;
    updateMaskStyles(el);
  }

  function toggleMaskMode(el, step, forceValue) {
    maskModeIndex =
      typeof forceValue === "number"
        ? forceValue
        : typeof step === "number"
        ? (maskModeIndex + maskModes.length + step) % maskModes.length
        : 0;
    updateMaskStyles(el);
  }

  function setMaskSize(el, delta, forceValue) {
    maskSize =
      typeof forceValue === "number"
        ? forceValue
        : typeof delta === "number"
        ? Math.min(Math.max(maskSize + delta, 0), MAX_MASK_SIZE)
        : 0;
    updateMaskStyles(el);
  }

  function setMaskOpacity(el, delta, forceValue) {
    maskOpacity =
      typeof forceValue === "number"
        ? forceValue
        : typeof delta === "number"
        ? Math.min(Math.max(maskOpacity + delta, 0), 1)
        : 0;
    updateMaskStyles(el);
  }

  function generateCurrentClipPath() {
    const player = document.querySelector("#html5video");
    if (player) {
      const { clientWidth: vw, clientHeight: vh } = document.body;
      const { x, y, right, bottom } = player.getBoundingClientRect();
      return `path(evenodd, "M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} L 0 0 M ${x} ${y} L ${right} ${y} L ${right} ${bottom} L ${x} ${bottom} L ${x} ${y} Z")`;
    }
    return "";
  }

  function preventEventDefault(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  function updateMousePosition(el, e) {
    const x = e.clientX;
    const y = e.clientY;
    el.style.setProperty("--hole-x", `${x}px`);
    el.style.setProperty("--hole-y", `${y}px`);
  }

  function initEvents() {
    const body = document.body;

    bindEvent(document, "pointermove", (e) => {
      if (body.classList.contains("normal")) {
        return;
      }
      if (maskOpacity > 0 && maskSize > 0) {
        updateMousePosition(body, e);
      }
    });
    bindEvent(document.querySelector(".progress-bar"), "pointermove", (e) => {
      if (body.classList.contains("normal")) {
        return;
      }
      if (maskOpacity > 0 && maskSize > 0) {
        updateMousePosition(body, e);
      }
    });

    bindEvent(document, "pointerdown", (e) => {
      const strategy = getClickStrategyByPointerEvent(e);
      switch (strategy) {
        case ClickStrategy.NEXT:
          preventEventDefault(e);
          return toggleMaskMode(body, 1);
        case ClickStrategy.PREV:
          preventEventDefault(e);
          return toggleMaskMode(body, -1);
        case ClickStrategy.RESET:
          preventEventDefault(e);
          return resetMask(body);
        case ClickStrategy.NORMAL:
          preventEventDefault(e);
          return normalMode(body);
      }
    });

    bindEvent(document, "contextmenu", (e) => {
      if (getClickStrategyByPointerEvent(e) !== ClickStrategy.NONE) {
        preventEventDefault(e);
      }
    });

    bindEvent(document, "wheel", (e) => {
      if (body.classList.contains("normal")) {
        return;
      }
      const { clientX: x, deltaY, altKey, ctrlKey } = e;
      const { clientWidth: width } = document.documentElement;
      const depth = getClickDepth(e);
      if (altKey || (depth <= 3 && x < width / 3)) {
        preventEventDefault(e);
        updateMousePosition(body, e);
        setMaskSize(body, deltaY);
      } else if (ctrlKey || (depth <= 3 && x > (width * 2) / 3)) {
        preventEventDefault(e);
        updateMousePosition(body, e);
        setMaskOpacity(body, deltaY > 0 ? 0.02 : deltaY < 0 ? -0.02 : 0);
      }
    });

    bindEvent(document, "scroll", (e) => {
      if (body.classList.contains("normal")) {
        return;
      }
      if (body.classList.contains("clip")) {
        body.style.setProperty("--clipped-area", generateCurrentClipPath());
      }
    });

    bindEvent(document, "pointerleave", () => {
      if (body.classList.contains("normal")) {
        return;
      }
      forceMask = true;
      updateMaskStyles(body);
    });

    bindEvent(document, "pointerenter", () => {
      if (body.classList.contains("normal")) {
        return;
      }
      forceMask = false;
      updateMaskStyles(body);
    });

    bindEvent(window, "resize", () => {
      if (body.classList.contains("normal")) {
        return;
      }
      document.body.style.setProperty("--fake-content", getFakeLoadingSVG());
    });
  }

  function getClickDepth(e) {
    const { clientX: x, clientY: y } = e;
    const targets = document.elementsFromPoint(x, y);
    return targets.length;
  }

  function getClickStrategyByPointerEvent(e) {
    const { buttons, shiftKey, ctrlKey, altKey } = e;
    const depth = getClickDepth(e);

    if (buttons !== 1 && buttons !== 2) {
      if (altKey) {
        // 如果按住了 Alt 键，且鼠标的非左右按钮被按下，则暂时退出 boss 模式：
        return ClickStrategy.NORMAL;
      }
      return ClickStrategy.RESET;
    }
    if (document.body.classList.contains("normal")) {
      return ClickStrategy.NONE;
    }
    // 如果在页面空白处按鼠标，或者按住了 Ctrl 键，则切换。
    if (ctrlKey || depth <= 3) {
      switch (buttons) {
        case 1:
          return shiftKey ? ClickStrategy.PREV : ClickStrategy.NEXT;
        case 2:
          return shiftKey ? ClickStrategy.NEXT : ClickStrategy.PREV;
      }
    }
    return ClickStrategy.NONE;
  }

  function getFakeLoadingSVG() {
    const { clientWidth: width, clientHeight: height } =
      document.documentElement;
    const fontSize = height / 20;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <style>text {font-family: sans-serif; font-size: ${fontSize}px; font-weight: bold;}</style>
      <text fill="#489" alignment-baseline="hanging">
        Temporarily Unavailable
        <animate
          attributeName="x"
          values="0;${width - fontSize * 11.56};0"
          dur="43s"
          repeatCount="indefinite" />
        <animate
          attributeName="y"
          values="0;${height - fontSize};0"
          dur="73s"
          repeatCount="indefinite" />
      </text>
    </svg>`;
    const urlPart = svg
      .replace(/\>\s+/gm, ">")
      .replace(/\s+(?=\<)/gm, "")
      .replace(/\s+/gm, " ")
      .replace(/[<>":/=%#; ]/gm, (c) => `%${c.charCodeAt(0).toString(16)}`);
    return `url("data:image/svg+xml,${urlPart}")`;
  }

  initRuntime();
})();
