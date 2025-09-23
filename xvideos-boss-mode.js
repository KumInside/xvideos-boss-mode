(() => {
	const globalStyle = `
    body:not(.normal) { --shadow-bg: rgba(255,255,255,0.98); --hole-x: -500%; --hole-y: -500%; --mask-size: 0px; --fake-content: ""; --shadow-filter: blur(10px); }
    body:not(.normal)::after { content: var(--fake-content); display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--shadow-bg); z-index: 99999999; pointer-events: none; overflow: hidden; mask-image: radial-gradient(circle var(--mask-size) at var(--hole-x) var(--hole-y), #ffffff00 10%, #ffffffff 100%); mask-repeat: no-repeat; mask-composite: exclude; backdrop-filter: var(--shadow-filter); transition all 0.2s; }
    body.mask::after { }
    body.clip::after { clip-path: var(--clipped-area); }
    body.clip #html5video { filter: contrast(50%) opacity(50%); }
    body.mask img { user-drag: none; -webkit-user-drag: none; }
  `;
	const ClickStrategy = Object.freeze({
		NONE: 0,
		NEXT: 1,
		RESET: 2,
		PREV: 3,
		RESUME: 4,
		NORMAL: 5,
	});

	const ICONS = Object.freeze({
		LEFT: 1,
		RIGHT: 2,
		SCROLL: 4,
	});

	const MAX_MASK_SIZE = 500;
	const DEFAULT_MASK_SIZE = 0;
	const DEFAULT_MASK_OPACITY = 0.98;
	const DEFAULT_MASK_MODE = 0;

	function bindEvent(ctx, name, callback, ...otherArgs) {
		if (!ctx) {
			return;
		}
		if (ctx instanceof Document || ctx instanceof DocumentFragment || ctx === globalThis) {
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
		toggleHowTo(document.body, true);
		resetMask(document.body);
	}

	let maskModeIndex = DEFAULT_MASK_MODE,
		maskSize = DEFAULT_MASK_SIZE,
		maskOpacity = DEFAULT_MASK_OPACITY,
		// 鼠标移出等特殊情况下 forceMask 是 true，此时临时重置。
		forceMask = false,
		showHowTo = true;
	const maskModes = ["mask", "clip"];

	function updateMaskStyles(el) {
		el.classList.remove("normal");
		el.classList.toggle("show-how-to", showHowTo);
		maskModes.forEach((cls, i) => {
			if (i === (forceMask ? 0 : maskModeIndex)) {
				switch (cls) {
					case "clip":
						el.style.setProperty("--clipped-area", generateCurrentClipPath());
					default:
						el.style.setProperty("--mask-size", `${forceMask ? DEFAULT_MASK_MODE : maskSize}px`);
						el.style.setProperty("--shadow-bg", forceMask ? "#fff" : `rgba(255,255,255,${maskOpacity})`);
						el.style.setProperty("--shadow-filter", forceMask ? "blur(10px)" : `blur(${10.2 * maskOpacity}px)`);
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
		maskModeIndex = typeof forceValue === "number" ? forceValue : typeof step === "number" ? (maskModeIndex + maskModes.length + step) % maskModes.length : 0;
		updateMaskStyles(el);
	}

	function setMaskSize(el, delta, forceValue) {
		maskSize = typeof forceValue === "number" ? forceValue : typeof delta === "number" ? Math.min(Math.max(maskSize + delta, 0), MAX_MASK_SIZE) : 0;
		updateMaskStyles(el);
	}

	function setMaskOpacity(el, delta, forceValue) {
		maskOpacity = typeof forceValue === "number" ? forceValue : typeof delta === "number" ? Math.min(Math.max(maskOpacity + delta, 0), 1) : 0;
		updateMaskStyles(el);
	}

	function toggleHowTo(el, forceValue) {
		showHowTo = typeof forceValue === "boolean" ? forceValue : !showHowTo;
		el.style.setProperty("--fake-content", getFakeLoadingSVG());
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
					toggleHowTo(body);
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
				// 如果按住了 Alt / Opt 键，且鼠标的非左右按钮被按下，则暂时退出 boss 模式：
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

	function getIconSVG(type, x, y, width) {
		return {
			[ICONS.LEFT]: `<svg x="${x}" y="${y}" width="${width}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="-0.5 -0.5 228 305"><defs/><g><g data-cell-id="0"><g data-cell-id="1"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-98"><g/><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-3"><g><rect x="2" y="162" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-4"><g><rect x="2" y="92" width="40" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-1"><g><rect x="20" y="2" width="190" height="300" rx="95" ry="95" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-30"><g><path d="M 2.44 65.75 C 2.44 104.41 37.08 135.75 79.82 135.75 C 122.55 135.75 157.19 104.41 157.19 65.75 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,79.82,100.75)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-31"><g><path d="M 72.5 65.93 C 72.5 104.52 107.2 135.81 150 135.81 C 192.8 135.81 227.5 104.52 227.5 65.93 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(-90,150,100.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-6"><g><path d="M 99.97 67.87 L 130.03 67.87 C 143.13 67.87 153.75 76.82 153.75 87.87 C 153.75 98.92 143.13 107.87 130.03 107.87 L 99.97 107.87 C 86.87 107.87 76.25 98.92 76.25 87.87 C 76.25 76.82 86.87 67.87 99.97 67.87 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,115,87.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-7"><g><rect x="100" y="157.87" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g></g></g></g></g></svg>`,
			[ICONS.RIGHT]: `<svg x="${x}" y="${y}" width="${width}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="-0.5 -0.5 228 305"><defs/><g><g data-cell-id="0"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-67"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-116"><g/><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-117"><g><rect x="2" y="162" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-118"><g><rect x="2" y="92" width="40" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-119"><g><rect x="20" y="2" width="190" height="300" rx="95" ry="95" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-120"><g><path d="M 2.44 65.75 C 2.44 104.41 37.08 135.75 79.82 135.75 C 122.55 135.75 157.19 104.41 157.19 65.75 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,79.82,100.75)" pointer-events="all" style="fill: light-dark(rgb(255, 255, 255), rgb(18, 18, 18)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-121"><g><path d="M 72.5 65.93 C 72.5 104.52 107.2 135.81 150 135.81 C 192.8 135.81 227.5 104.52 227.5 65.93 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(-90,150,100.87)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-122"><g><path d="M 99.97 67.87 L 130.03 67.87 C 143.13 67.87 153.75 76.82 153.75 87.87 C 153.75 98.92 143.13 107.87 130.03 107.87 L 99.97 107.87 C 86.87 107.87 76.25 98.92 76.25 87.87 C 76.25 76.82 86.87 67.87 99.97 67.87 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,115,87.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-123"><g><rect x="100" y="157.87" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g></g></g></g></g></svg>`,
			[ICONS.LEFT | ICONS.RIGHT]: `<svg x="${x}" y="${y}" width="${width}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="-0.5 -0.5 228 305"><defs/><g><g data-cell-id="0"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-99"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-100"><g/><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-101"><g><rect x="2" y="162" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-102"><g><rect x="2" y="92" width="40" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-103"><g><rect x="20" y="2" width="190" height="300" rx="95" ry="95" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-104"><g><path d="M 2.44 65.75 C 2.44 104.41 37.08 135.75 79.82 135.75 C 122.55 135.75 157.19 104.41 157.19 65.75 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,79.82,100.75)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-105"><g><path d="M 72.5 65.93 C 72.5 104.52 107.2 135.81 150 135.81 C 192.8 135.81 227.5 104.52 227.5 65.93 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(-90,150,100.87)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-106"><g><path d="M 99.97 67.87 L 130.03 67.87 C 143.13 67.87 153.75 76.82 153.75 87.87 C 153.75 98.92 143.13 107.87 130.03 107.87 L 99.97 107.87 C 86.87 107.87 76.25 98.92 76.25 87.87 C 76.25 76.82 86.87 67.87 99.97 67.87 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,115,87.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-107"><g><rect x="100" y="157.87" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g></g></g></g></g></svg>`,
			[ICONS.SCROLL]: `<svg x="${x}" y="${y}" width="${(width * 231) / 228}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="-0.5 -0.5 231 305"><defs/><g><g data-cell-id="0"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-68"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-124"><g/><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-125"><g><rect x="2" y="162" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-126"><g><rect x="2" y="92" width="40" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-127"><g><rect x="20" y="2" width="190" height="300" rx="95" ry="95" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-128"><g><path d="M 2.44 65.75 C 2.44 104.41 37.08 135.75 79.82 135.75 C 122.55 135.75 157.19 104.41 157.19 65.75 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,79.82,100.75)" pointer-events="all" style="fill: light-dark(rgb(255, 255, 255), rgb(18, 18, 18)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-129"><g><path d="M 72.5 65.93 C 72.5 104.52 107.2 135.81 150 135.81 C 192.8 135.81 227.5 104.52 227.5 65.93 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(-90,150,100.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-130"><g><path d="M 99.97 67.87 L 130.03 67.87 C 143.13 67.87 153.75 76.82 153.75 87.87 C 153.75 98.92 143.13 107.87 130.03 107.87 L 99.97 107.87 C 86.87 107.87 76.25 98.92 76.25 87.87 C 76.25 76.82 86.87 67.87 99.97 67.87 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,115,87.87)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-131"><g><rect x="100" y="157.87" width="30" height="50" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-132"><g><path d="M 180 40 L 210 40 L 210 22 L 245 52 L 210 82 L 210 64 L 180 64 L 180 82 L 145 52 L 180 22 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,195,52)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g></g></g></g></g></svg>`,
			[4 ^ (ICONS.LEFT | ICONS.RIGHT)]: `<svg x="${x}" y="${y}" width="${width}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="-0.5 -0.5 228 305"><defs/><g><g data-cell-id="0"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-69"><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-133"><g/><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-134"><g><rect x="2" y="162" width="30" height="50" fill="#ffe14f" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-135"><g><rect x="2" y="92" width="40" height="50" fill="#ffe14f" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-136"><g><rect x="20" y="2" width="190" height="300" rx="95" ry="95" fill="#ffffff" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-137"><g><path d="M 2.44 65.75 C 2.44 104.41 37.08 135.75 79.82 135.75 C 122.55 135.75 157.19 104.41 157.19 65.75 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,79.82,100.75)" pointer-events="all" style="fill: light-dark(rgb(255, 255, 255), rgb(18, 18, 18)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-138"><g><path d="M 72.5 65.93 C 72.5 104.52 107.2 135.81 150 135.81 C 192.8 135.81 227.5 104.52 227.5 65.93 Z" fill="#ffffff" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(-90,150,100.87)" pointer-events="all" style="fill: light-dark(#ffffff, var(--ge-dark-color, #121212)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-139"><g><path d="M 99.97 67.87 L 130.03 67.87 C 143.13 67.87 153.75 76.82 153.75 87.87 C 153.75 98.92 143.13 107.87 130.03 107.87 L 99.97 107.87 C 86.87 107.87 76.25 98.92 76.25 87.87 C 76.25 76.82 86.87 67.87 99.97 67.87 Z" fill="#ffe14f" stroke="#000000" stroke-width="5" stroke-miterlimit="10" transform="rotate(90,115,87.87)" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g><g data-cell-id="PsRI17Kcv3ZVfaEljk1c-140"><g><rect x="100" y="157.87" width="30" height="50" fill="#ffe14f" stroke="#000000" stroke-width="5" pointer-events="all" style="fill: light-dark(rgb(255, 225, 79), rgb(77, 51, 0)); stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g></g></g></g></g></g></svg>`,
		}[type];
	}

	function getFakeLoadingSVG() {
		const { clientWidth: width, clientHeight: height } = document.documentElement;
		const fontSize = height / 20;
		const infoX = width - 400;
		const infoLineHeight = fontSize * 0.9;
		const iconWidth = fontSize * 0.6;
		const iconBaseLine = height / 2 - 6;

		const howTo = `<text class="usage-text title" x="${infoX}" y="${height - infoLineHeight * 11}">How to:</text>

      ${getIconSVG(ICONS.SCROLL, infoX, iconBaseLine - infoLineHeight * 9.5, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 5}" y="${height - infoLineHeight * 9.5}">+ Alt / Opt:</text>
      ${getIconSVG(ICONS.SCROLL, infoX, iconBaseLine - infoLineHeight * 8.5, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 5}" y="${height - infoLineHeight * 8.5}">at left blank area:</text>
      <text class="usage-text" x="${infoX + 160}" y="${height - infoLineHeight * 9}">Change the hole size</text>

      ${getIconSVG(ICONS.SCROLL, infoX, iconBaseLine - infoLineHeight * 7, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 5}" y="${height - infoLineHeight * 7}">+ Ctrl:</text>
      ${getIconSVG(ICONS.SCROLL, infoX, iconBaseLine - infoLineHeight * 6, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 5}" y="${height - infoLineHeight * 6}">at right blank area:</text>
      <text class="usage-text" x="${infoX + 170}" y="${height - infoLineHeight * 6.5}">Set transparency</text>

      ${getIconSVG(ICONS.LEFT | ICONS.RIGHT, infoX, iconBaseLine - infoLineHeight * 4.5, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 4}" y="${height - infoLineHeight * 4.5}">+ Ctrl:</text>
      ${getIconSVG(ICONS.LEFT | ICONS.RIGHT, infoX, iconBaseLine - infoLineHeight * 3.5, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 4}" y="${height - infoLineHeight * 3.5}">in blank:</text>
      <text class="usage-text" x="${infoX + 100}" y="${height - infoLineHeight * 4}">Switch between modes</text>

      ${getIconSVG(4 ^ (ICONS.LEFT | ICONS.RIGHT), infoX, iconBaseLine - infoLineHeight * 2, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 1}" y="${height - infoLineHeight * 2}">: Boss's coming &amp; Toggle \"how to\"\'s visibility.</text>

      ${getIconSVG(4 ^ (ICONS.LEFT | ICONS.RIGHT), infoX, iconBaseLine - infoLineHeight * 1, iconWidth)}
      <text class="usage-text" x="${infoX + iconWidth + 4}" y="${height - infoLineHeight * 1}">+ Alt / Opt: Boss's gone. Clear all coverages.</text>`;

		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
      <style>
        .loading-text {font-family: sans-serif; font-size: ${fontSize}px; font-weight: bold;}
        .usage-text {font-family: sans-serif; font-size: ${fontSize * 0.3}px; fill: #096; }
        .usage-text.title {font-size: ${fontSize * 0.5}px; fill: rgba(54, 120, 87, 1); font-weight: bold;}
      </style>
      <text class="loading-text" fill="#489" alignment-baseline="hanging">
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
      ${showHowTo ? howTo : ""}
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
