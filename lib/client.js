/**
 * @deepseek-ai/dsh-conversation-width — client half.
 *
 * Adds one row to the General Settings page that sets the transcript
 * column width. The row is the settings-page twin of the Conversation's
 * built-in drag handles: it reads and writes the SAME preference
 * (`localStorage["dsh.conversation.contentWidth"]`) that the handles
 * already persist, so both controls stay in agreement and the layout
 * module keeps its single source of truth.
 *
 * Width axis recap (owned by @deepseek-ai/dsh-client-ui-conversation):
 *
 *   --dsh-chat-content-width: var(--dsh-chat-user-width,
 *       clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * .64), 920px))
 *
 *   `--dsh-chat-user-width` is written on the Conversation body's parent
 *   whenever a preference is stored (by the drag handles' commit, and by
 *   this row). With no stored preference the fallback caps at 920px, which
 *   is why a fresh install reads as "narrow". A stored preference still
 *   passes through the layout module's own clamp
 *   `[CONTENT_MIN, columnWidth - CONTENT_EDGE_BUDGET]`, so an out-of-range
 *   number is corrected rather than breaking the page.
 */
window.__ModuleLoader__.load({
	id: "dsh-conversation-width",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");

		//#region geometry constants (mirror ui-conversation's own numbers)
		/** localStorage key for the transcript width preference (px); owned by ui-conversation. */
		const WIDTH_PREF_KEY = "dsh.conversation.contentWidth";
		/** Floor the layout module will accept, so the control never offers an unreachable value. */
		const CONTENT_MIN = 640;
		/**
		 * Horizontal room ui-conversation reserves for both drag handles and their
		 * safe edge zones; it subtracts this from the measured column to get the
		 * widest width it will honour. Mirrored here because the value this row
		 * publishes must pass the same clamp the drag handles apply.
		 */
		const CONTENT_EDGE_BUDGET = 176;
		/** Fallback cap used when no preference is stored (ui-conversation's clamp ceiling). */
		const DEFAULT_MAX = 920;
		/**
		 * Widest column this control offers. Beyond roughly this width a
		 * single line of prose stops being comfortably readable, and the
		 * layout module still clamps to `column - 176` on top of this, so
		 * the effective ceiling is whichever is smaller.
		 */
		const CONTENT_MAX = 1600;
		/** Step used by the range input and the +/- buttons. */
		const STEP = 20;
		/** Preset widths offered as one-click buttons. */
		const PRESETS = [920, 1100, 1280];
		//#endregion

		//#region preference read/write (same contract as the drag handles)
		/** @returns the stored width preference in px, or null when absent or corrupt. */
		function readPreference() {
			try {
				const raw = window.localStorage.getItem(WIDTH_PREF_KEY);
				if (raw === null) return null;
				const value = Number(raw);
				return Number.isFinite(value) && value > 0 ? value : null;
			} catch {
				/* Private-mode or blocked storage: fall back to the default cap. */
				return null;
			}
		}

		/**
		 * Persist one width and tell the layout to re-publish.
		 * @param value - candidate width in px; clamped into the offered range.
		 */
		function writePreference(value) {
			const clamped = Math.min(Math.max(Math.round(value), CONTENT_MIN), CONTENT_MAX);
			try {
				window.localStorage.setItem(WIDTH_PREF_KEY, String(clamped));
			} catch {
				/* Nothing to do: the control still reports the value it staged. */
			}
			announce();
			return clamped;
		}

		/**
		 * Clear the stored preference so the conversation returns to its
		 * responsive default (`clamp(680, column * .64, 920)`).
		 */
		function clearPreference() {
			try {
				window.localStorage.removeItem(WIDTH_PREF_KEY);
			} catch {}
			announce();
		}

		/**
		 * Publish the stored preference onto the Conversation body's parent.
		 *
		 * ui-conversation owns the width axis and computes it in one place:
		 * `publishWidths()` writes `--dsh-chat-user-width` on the element that
		 * holds the `--dsh-chat-content-width` definition — the Conversation
		 * body's PARENT (`container.parentElement`). It is driven by a
		 * ResizeObserver plus the drag handle's own commit/end callbacks; there
		 * is NO window `resize` listener anywhere in that package (checked in
		 * 0.2.0-rc.2, 0.2.1-rc.3, 0.2.2-rc.1 and 0.2.2-rc.2), so dispatching one is
		 * a no-op.
		 *
		 * A same-origin `storage` event is not delivered to the writing
		 * document either, so the only reliable signal is to write the variable
		 * ourselves — using ui-conversation's own clamp so the value is exactly
		 * what its next `publishWidths()` would have produced.
		 */
		function announce() {
			const preference = readPreference();
			const bodies = document.querySelectorAll("[data-conversation-content]");
			for (const body of bodies) {
				const target = body.parentElement ?? body;
				if (preference === null) {
					/* Clearing the property restores the responsive fallback. */
					target.style.removeProperty("--dsh-chat-user-width");
					continue;
				}
				const column = body.offsetWidth;
				if (!(column > 0)) continue;
				const max = Math.max(CONTENT_MIN, column - CONTENT_EDGE_BUDGET);
				const clamped = Math.min(Math.max(preference, CONTENT_MIN), max);
				target.style.setProperty("--dsh-chat-user-width", `${clamped}px`);
			}
		}
		//#endregion

		//#region the two page-level width axes
		/*
		 * Beyond the transcript column this plugin also owns two *chrome* widths,
		 * each with its own stored preference and its own control. All three axes
		 * are independent: the transcript column is the Conversation's own
		 * preference, while these two are ours.
		 *
		 * 1. The Settings dialog: `dsh-client-ui-settings-general` renders it
		 *    through createPortal(..., document.body), so it is NOT inside the
		 *    main panel and cannot inherit the page-axis variable. It reads a
		 *    fixed `width:800px` with `max-width:calc(100vw - 48px)`.
		 * 2. Global panels ("插件", "技能" ...): `dsh-client-ui-layout` marks the
		 *    main panel with `data-global-panel` only when a panel (rather than
		 *    the Conversation) owns `main`, and those pages cap their content at
		 *    `max-width:960px`. The conversation view carries no such attribute,
		 *    so the page axis leaves the transcript alone.
		 *
		 * Both targets are host-semantic hooks rather than styling details:
		 * `data-global-panel` is declared by the layout package, and the dialog is
		 * found by `[data-shortcut-modal="settings"]` / `role="dialog"`, which stay
		 * stable across the releases this plugin supports. Class names in these
		 * bundles are content-hashed (`AnXs9G_panel`), so nothing here selects on
		 * one.
		 */
		/** Settings-dialog width preference (px), or "fill". Owned by this plugin. */
		const DIALOG_PREF_KEY = "dsh.conversation-width.settingsDialog";
		/** Global-panel content width preference (px), or "fill". Owned by this plugin. */
		const PANEL_PREF_KEY = "dsh.conversation-width.globalPanel";
		/**
		 * A page width can be a pixel number or the "fill" token. Fill removes the
		 * cap entirely, which is what "铺满 / fill" means on these two surfaces:
		 * neither has a per-line reading measure to protect, unlike the transcript.
		 */
		const FILL = "fill";
		/** Settings dialog: the host's own 800px default is the floor; wider is the ask. */
		const DIALOG_MIN = 640;
		const DIALOG_DEFAULT = 800;
		const DIALOG_MAX = 1800;
		/** Global panels: the host caps content at 960px, so offer from there upward. */
		const PANEL_MIN = 640;
		const PANEL_DEFAULT = 960;
		const PANEL_MAX = 2400;
		/** Presets offered on each axis, plus the shared fill action. */
		const DIALOG_PRESETS = [800, 1100, 1400];
		const PANEL_PRESETS = [960, 1280, 1600];
		/**
		 * Pixel value published for the "fill" token. The consumer rules keep a
		 * `max-width`, so a very large number means "do not constrain" without
		 * removing the property the host's own layout may still clamp.
		 */
		const FILL_WIDTH = 100000;
		/**
		 * Full-page presentation preference for Settings.
		 *
		 * "dialog" is the host's own centred modal. "page" keeps the exact same
		 * component tree but presents it as content filling the main area: the mask
		 * is hidden, the panel stretches to the frame edges, and the nav column
		 * docks left like a sidebar. The rendering mechanism is untouched - this is
		 * purely presentation, so every host section (language, appearance, …)
		 * keeps working without being reimplemented.
		 *
		 * Why not a real panel: `settings.section` is declared under
		 * `sidebar.settings`, and a slot may only render its OWN declared children
		 * (`RenderSlotFn<当前槽子槽>`), so a `main` panel cannot render those
		 * sections. Presenting the existing dialog as a page is the only approach
		 * that avoids a second, divergent settings UI.
		 */
		const SETTINGS_MODE_KEY = "dsh.conversation-width.settingsMode";
		const MODE_DIALOG = "dialog";
		const MODE_PAGE = "page";

		/**
		 * Read the presentation mode.
		 * @returns "page" only when explicitly chosen; "dialog" otherwise.
		 */
		function readSettingsMode() {
			try {
				return window.localStorage.getItem(SETTINGS_MODE_KEY) === MODE_PAGE ? MODE_PAGE : MODE_DIALOG;
			} catch {
				return MODE_DIALOG;
			}
		}

		/**
		 * Persist the presentation mode and re-apply it immediately.
		 * @param mode MODE_DIALOG or MODE_PAGE.
		 */
		function writeSettingsMode(mode) {
			try {
				window.localStorage.setItem(SETTINGS_MODE_KEY, mode === MODE_PAGE ? MODE_PAGE : MODE_DIALOG);
			} catch {}
			publishPageWidths();
		}

		/**
		 * Read one page-width preference.
		 * @param key localStorage key for the axis.
		 * @returns the stored pixel value, the FILL token, or null when absent/corrupt.
		 */
		function readPagePref(key) {
			try {
				const raw = window.localStorage.getItem(key);
				if (raw === null) return null;
				if (raw === FILL) return FILL;
				const value = Number(raw);
				return Number.isFinite(value) && value > 0 ? value : null;
			} catch {
				return null;
			}
		}

		/**
		 * Persist one page-width preference and publish it.
		 * @param key localStorage key for the axis.
		 * @param value candidate width in px, or the FILL token.
		 * @param min floor for this axis.
		 * @param max ceiling for this axis.
		 * @returns the value actually stored.
		 */
		function writePagePref(key, value, min, max) {
			const stored =
				value === FILL ? FILL : Math.min(Math.max(Math.round(value), min), max);
			try {
				window.localStorage.setItem(key, String(stored));
			} catch {
				/* Storage blocked: the control still reports what it staged. */
			}
			publishPageWidths();
			return stored;
		}

		/**
		 * Clear one page-width preference, restoring the host's own width.
		 * @param key localStorage key for the axis.
		 */
		function clearPagePref(key) {
			try {
				window.localStorage.removeItem(key);
			} catch {}
			publishPageWidths();
		}

		/** The Settings dialog element, or null when Settings is closed. */
		function settingsDialog() {
			/*
			 * `data-shortcut-modal="settings"` is declared by ui-settings-general so
			 * the shortcut layer can tell which modal is in front; it therefore
			 * outlives the content-hashed class names. No compound fallback is used:
			 * a single-attribute selector is the one shape every caller can run.
			 */
			return document.querySelector('[data-shortcut-modal="settings"]');
		}

		/**
		 * Write one custom property only when it actually changes.
		 *
		 * The observer fires on every host DOM mutation, which while a response
		 * streams is many times a second. Re-setting an identical value still
		 * invalidates style, so compare first and skip the write.
		 * @param element element owning the property.
		 * @param name custom property name.
		 * @param value value to apply, or null to remove the property.
		 */
		function setWidthProperty(element, name, value) {
			const current = element.style.getPropertyValue(name);
			if (value === null) {
				if (current !== "") element.style.removeProperty(name);
				return;
			}
			if (current !== value) element.style.setProperty(name, value);
		}

		/**
		 * Apply both page axes to whatever chrome is currently mounted.
		 *
		 * Only CSS custom properties are published; the matching rules live in the
		 * plugin stylesheet, so the host keeps its own `max-width` safety net and an
		 * absent preference simply falls through to the host default.
		 *
		 * Fill is expressed as a very large pixel value rather than `none`, because
		 * the consumer rule has to stay a `max-width` that the host can still
		 * constrain from the outside.
		 */
		function publishPageWidths() {
			const dialog = settingsDialog();
			if (dialog !== null) {
				const pref = readPagePref(DIALOG_PREF_KEY);
				setWidthProperty(
					dialog,
					"--dsh-settings-dialog-width",
					pref === null ? null : pref === FILL ? `${FILL_WIDTH}px` : `${pref}px`
				);
				applySettingsPresentation(dialog);
			}

			const pref = readPagePref(PANEL_PREF_KEY);
			for (const panel of document.querySelectorAll("[data-global-panel]")) {
				setWidthProperty(
					panel,
					"--dsh-global-panel-width",
					pref === null ? null : pref === FILL ? `${FILL_WIDTH}px` : `${pref}px`
				);
			}
		}

		/**
		 * The application frame element, found by the grid it establishes.
		 *
		 * No marker exists on the frame that also survives on every page: the main
		 * panel only carries `data-global-panel` when a panel, rather than the
		 * Conversation, owns it. So the frame is located structurally - the element
		 * that lays out three explicit grid tracks - and its geometry is read
		 * directly. That keeps this working on the conversation view too, where no
		 * panel marker exists.
		 * @returns the frame element, or null when the layout is not mounted.
		 */
		function appFrame() {
			for (const element of document.querySelectorAll("div")) {
				const style = window.getComputedStyle(element);
				if (style.display !== "grid") continue;
				if (style.gridTemplateColumns.split(" ").length === 3) return element;
			}
			return null;
		}

		/**
		 * Measure the main area and publish its insets for the page presentation.
		 *
		 * The main area is the frame's second grid track: everything right of the
		 * leading (sidebar) track and left of the trailing (rightbar) one, both of
		 * which the layout already accounts for in its column sizing. Publishing
		 * insets rather than absolute pixels keeps the stylesheet declarative and
		 * lets the host resize either side bar without the plugin recomputing it.
		 * @param overlay the Settings overlay element.
		 */
		function publishPageInset(overlay) {
			const frame = appFrame();
			if (frame === null) {
				/* No layout to align with: clear the insets so the fallback applies. */
				for (const side of ["top", "right", "bottom", "left"]) {
					overlay.style.removeProperty(`--dcw-page-${side}`);
				}
				return;
			}
			const frameRect = frame.getBoundingClientRect();
			const tracks = window.getComputedStyle(frame).gridTemplateColumns.split(" ").map(parseFloat);
			const leading = Number.isFinite(tracks[0]) ? tracks[0] : 0;
			const trailing = Number.isFinite(tracks[tracks.length - 1]) ? tracks[tracks.length - 1] : 0;
			/*
			 * `inset` is measured from the VIEWPORT edges, while the frame itself
			 * may sit inset from them (the desktop window leaves a margin). So the
			 * main area's absolute left/right edges are what matter, not the track
			 * widths: left = frame.left + leading, right = viewport - (frame.right - trailing).
			 */
			const mainLeft = frameRect.left + leading;
			const mainRight = frameRect.right - trailing;
			const set = (side, value) => {
				const next = `${Math.max(0, Math.round(value))}px`;
				if (overlay.style.getPropertyValue(`--dcw-page-${side}`) !== next) {
					overlay.style.setProperty(`--dcw-page-${side}`, next);
				}
			};
			set("top", frameRect.top);
			set("left", mainLeft);
			set("right", window.innerWidth - mainRight);
			set("bottom", window.innerHeight - frameRect.bottom);
		}

		/**
		 * Mark the Settings overlay so the stylesheet can present it as a page.
		 *
		 * The dialog is portalled to `document.body`, so the element carrying
		 * `role="presentation"` around it is its overlay; the mask and panel are
		 * reached from there. A marker attribute is used rather than inline styles
		 * so every rule that changes together lives in one stylesheet block.
		 * @param dialog the Settings dialog element.
		 */
		function applySettingsPresentation(dialog) {
			const overlay = dialog.parentElement ?? dialog;
			const page = readSettingsMode() === MODE_PAGE;
			if (page) {
				if (!overlay.hasAttribute("data-dcw-settings-page")) {
					overlay.setAttribute("data-dcw-settings-page", "");
				}
				publishPageInset(overlay);
			} else if (overlay.hasAttribute("data-dcw-settings-page")) {
				overlay.removeAttribute("data-dcw-settings-page");
				for (const side of ["top", "right", "bottom", "left"]) {
					overlay.style.removeProperty(`--dcw-page-${side}`);
				}
			}
		}

		/**
		 * Keep both axes applied as the page changes underneath us.
		 *
		 * Settings opens and closes, and global panels mount on navigation, so a
		 * one-shot apply at plugin start would miss almost every real case. A
		 * MutationObserver on `body` covers all of them without polling; the
		 * callback is throttled through requestAnimationFrame because the host
		 * mutates frequently while streaming a response.
		 * @returns cleanup for the observer and any pending frame.
		 */
		function watchPageWidths() {
			publishPageWidths();
			if (typeof MutationObserver !== "function") return () => {};
			let frame = null;
			const schedule = () => {
				if (frame !== null) return;
				frame = requestAnimationFrame(() => {
					frame = null;
					publishPageWidths();
				});
			};
			const observer = new MutationObserver(schedule);
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-global-panel"] });
			return () => {
				observer.disconnect();
				if (frame !== null) cancelAnimationFrame(frame);
			};
		}
		//#endregion

		//#region the settings row
		/** Row styling, injected once. */
		const css =
			".dcw_row{border-bottom:.5px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:24px;padding:16px 0;display:flex}" +
			".dcw_main{min-width:0}" +
			".dcw_title{font-size:14px;line-height:20px}" +
			".dcw_description{color:var(--dsw-alias-label-secondary);margin-top:4px;font-size:12px;line-height:18px}" +
			".dcw_controls{flex-direction:column;align-items:flex-end;gap:8px;flex:none;display:flex}" +
			".dcw_inputRow{align-items:center;gap:8px;display:flex}" +
			".dcw_range{width:200px;accent-color:var(--dsw-alias-brand-primary,currentColor)}" +
			".dcw_number{box-sizing:border-box;width:74px;padding:4px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:right}" +
			".dcw_unit{color:var(--dsw-alias-label-tertiary);font-size:12px}" +
			".dcw_presets{gap:6px;display:flex}" +
			".dcw_preset{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:3px 8px}" +
			".dcw_preset:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
			".dcw_preset[data-active=true]{border-color:var(--dsw-alias-brand-primary,currentColor);color:var(--dsw-alias-label-primary)}" +
			".dcw_reset{border:0;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:12px;padding:0;text-decoration:underline}" +
			".dcw_reset:hover{color:var(--dsw-alias-label-secondary)}" +
			".dcw_status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;min-height:18px}" +
			".dcw_subhead{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;letter-spacing:.02em;margin:24px 0 0;text-transform:uppercase}" +
			/*
			 * The two page axes are consumed here rather than written straight onto
			 * the host's own width properties, so the host keeps its `max-width`
			 * safety net (`calc(100vw - 48px)` on the dialog) and the preference
			 * degrades to "host default" instead of overflowing when it is absent.
			 *
			 * `[data-shortcut-modal="settings"]` is the Settings dialog (declared by
			 * ui-settings-general for the shortcut layer, so it outlives any class
			 * hash). `[data-global-panel]` is the layout package's marker for a
			 * panel, rather than the Conversation, owning `main`.
			 */
			/*
			 * The page axis uses a DESCENDANT combinator, not a child one: the host
			 * caps the panel's content several levels below `[data-global-panel]`
			 * (the panel marks `main`, while the 960px cap sits on the page's own
			 * children inside it). A child selector matched nothing and silently
			 * left the content at 960px.
			 */
			'[data-shortcut-modal="settings"]{width:var(--dsh-settings-dialog-width,800px)!important}' +
			"[data-global-panel] *{max-width:var(--dsh-global-panel-width,960px)}" +
			/*
			 * Full-page presentation for Settings.
			 *
			 * The overlay is `position:fixed;inset:0` containing a mask plus a
			 * centred panel. Presenting it as a page means: hide the dimming mask,
			 * stretch the panel edge to edge, square off the floating-card look, and
			 * let the nav column run full height like a sidebar.
			 *
			 * Everything here is selected structurally - `[data-dcw-settings-page]`
			 * is our own marker on the overlay, and its children are the mask and
			 * the panel - because the host's class names are content hashes
			 * (`AnXs9G_panel`) that change between releases. `>div` order is the
			 * only part of the host markup this relies on: mask first, panel second.
			 *
			 * The panel keeps its own `display:grid` and two-column template, so the
			 * nav and content areas need no restructure; only padding, radius and
			 * spacing change.
			 */
			"[data-dcw-settings-page]{padding:0!important;justify-content:stretch!important;align-items:stretch!important}" +
			"[data-dcw-settings-page]>:first-child{display:none!important}" +
			"[data-dcw-settings-page]>:last-child{width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;border-radius:0!important;box-shadow:none!important}" +
			/*
			 * Bound the page to the main area instead of the whole viewport, so it
			 * looks like a panel (Plugins, Skills) rather than covering the sidebar.
			 * The offsets come from variables this plugin publishes after measuring
			 * the frame's own grid; without a measurement the page falls back to the
			 * full viewport, which is still usable.
			 */
			"[data-dcw-settings-page]{inset:var(--dcw-page-top,0px) var(--dcw-page-right,0px) var(--dcw-page-bottom,0px) var(--dcw-page-left,0px)!important}";

		const tagId = "dsh-conversation-width/ConversationWidthRow.module.css";		if (typeof document !== "undefined") {
			/*
			 * Match the existing tag by reading the attribute, never by building
			 * an `[attr="..."]` selector through string concatenation. Any value
			 * that needs quoting (this one does not, but JSON.stringify was used
			 * here and DOES add the quotes) produces an invalid selector, and
			 * `querySelector` throws a SyntaxError for it. That throw happens at
			 * module-evaluation time, so it takes the whole client module - and
			 * with it the app boot - down before a single row renders.
			 */
			let tag = null;
			for (const candidate of document.querySelectorAll("style[data-plugin-css]")) {
				if (candidate.getAttribute("data-plugin-css") === tagId) {
					tag = candidate;
					break;
				}
			}
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = "dsh-conversation-width";
				tag.dataset.pluginCss = tagId;
				tag.textContent = css;
				document.head.appendChild(tag);
			}
		}

		/**
		 * The General Settings row: label, live range + number control, and
		 * presets. Every edit applies immediately (there is no save button on
		 * this page) and is mirrored into the drag handles' preference.
		 * @param props - localized copy lookup.
		 * @returns the row.
		 */
		function ConversationWidthRow({ t }) {
			const [width, setWidth] = react.useState(() => readPreference() ?? DEFAULT_MAX);
			const [stored, setStored] = react.useState(() => readPreference() !== null);

			/* Re-read when another surface (a drag handle, another window)
			 * changes the same preference. */
			react.useEffect(() => {
				const sync = () => {
					const next = readPreference();
					setStored(next !== null);
					if (next !== null) setWidth(next);
				};
				window.addEventListener("storage", sync);
				return () => window.removeEventListener("storage", sync);
			}, []);

			const commit = react.useCallback((next) => {
				setWidth(writePreference(next));
				setStored(true);
			}, []);

			const reset = react.useCallback(() => {
				clearPreference();
				setStored(false);
				setWidth(DEFAULT_MAX);
			}, []);

			const percent = ((width - CONTENT_MIN) / (CONTENT_MAX - CONTENT_MIN)) * 100;

			return jsxs("div", {
				className: "dcw_row",
				children: [
					jsxs("div", {
						className: "dcw_main",
						children: [
							jsx("div", { className: "dcw_title", children: t("width.title") }),
							jsx("div", { className: "dcw_description", children: t("width.description") })
						]
					}),
					jsxs("div", {
						className: "dcw_controls",
						children: [
							jsxs("div", {
								className: "dcw_inputRow",
								children: [
									jsx("input", {
										className: "dcw_range",
										type: "range",
										min: CONTENT_MIN,
										max: CONTENT_MAX,
										step: STEP,
										value: width,
										"aria-label": t("width.title"),
										onChange: (event) => commit(Number(event.currentTarget.value))
									}),
									jsx("input", {
										className: "dcw_number",
										type: "number",
										min: CONTENT_MIN,
										max: CONTENT_MAX,
										step: STEP,
										value: width,
										"aria-label": t("width.title"),
										onChange: (event) => {
											const parsed = Number(event.currentTarget.value);
											/* Ignore the transient empty/partial draft a number
											 * input reports mid-typing; only commit real numbers. */
											if (Number.isFinite(parsed) && parsed > 0) commit(parsed);
										}
									}),
									jsx("span", { className: "dcw_unit", children: "px" })
								]
							}),
							jsxs("div", {
								className: "dcw_presets",
								children: [
									...PRESETS.map((preset) =>
										jsx(
											"button",
											{
												type: "button",
												className: "dcw_preset",
												"data-active": stored && width === preset,
												onClick: () => commit(preset),
												children: t("width.preset", { width: preset })
											},
											preset
										)
									),
									jsx("button", {
										type: "button",
										className: "dcw_reset",
										onClick: reset,
										children: t("width.reset")
									})
								]
							}),
							jsx("div", {
								className: "dcw_status",
								role: "status",
								children: stored
									? t("width.applied", { width, percent: Math.round(percent) })
									: t("width.auto")
							})
						]
					})
				]
			});
		}
		//#endregion

		//#region the two page-width rows
		/**
		 * One width control, shared by both page axes.
		 *
		 * Same markup and behaviour as the transcript row (range + number + presets
		 * + fill + reset) because the two are the same kind of setting; keeping one
		 * implementation means a change to the control cannot drift between rows.
		 *
		 * @param props.prefKey localStorage key for this axis.
		 * @param props.min floor offered by the slider.
		 * @param props.max ceiling offered by the slider.
		 * @param props.fallback the host's own width, shown when nothing is stored.
		 * @param props.presets one-click widths.
		 * @param props.titleKey locale key for the row title.
		 * @param props.descriptionKey locale key for the row description.
		 * @param props.t locale lookup bound to this plugin's namespace.
		 * @returns the row.
		 */
		function PageWidthRow({ prefKey, min, max, fallback, presets, titleKey, descriptionKey, t }) {
			const [value, setValue] = react.useState(() => readPagePref(prefKey));
			const [typed, setTyped] = react.useState(null);

			/* Another window may change the same preference. */
			react.useEffect(() => {
				const sync = () => setValue(readPagePref(prefKey));
				window.addEventListener("storage", sync);
				return () => window.removeEventListener("storage", sync);
			}, [prefKey]);

			const isFill = value === FILL;
			const shown = typeof value === "number" ? value : fallback;

			const commit = react.useCallback(
				(next) => {
					setTyped(null);
					setValue(writePagePref(prefKey, next, min, max));
				},
				[prefKey, min, max]
			);

			const reset = react.useCallback(() => {
				setTyped(null);
				clearPagePref(prefKey);
				setValue(null);
			}, [prefKey]);

			const numberValue = typed !== null ? typed : shown;

			return jsxs("div", {
				className: "dcw_row",
				children: [
					jsxs("div", {
						className: "dcw_main",
						children: [
							jsx("div", { className: "dcw_title", children: t(titleKey) }),
							jsx("div", { className: "dcw_description", children: t(descriptionKey) })
						]
					}),
					jsxs("div", {
						className: "dcw_controls",
						children: [
							jsxs("div", {
								className: "dcw_inputRow",
								children: [
									jsx("input", {
										className: "dcw_range",
										type: "range",
										min,
										max,
										step: STEP,
										value: shown,
										disabled: isFill,
										"aria-label": t(titleKey),
										onChange: (event) => commit(Number(event.currentTarget.value))
									}),
									jsx("input", {
										className: "dcw_number",
										type: "number",
										min,
										max,
										step: STEP,
										value: numberValue,
										disabled: isFill,
										"aria-label": t(titleKey),
										onChange: (event) => {
											const raw = event.currentTarget.value;
											setTyped(raw);
											const parsed = Number(raw);
											/* Ignore the empty/partial draft a number input
											 * reports mid-typing; only commit real numbers. */
											if (Number.isFinite(parsed) && parsed > 0) {
												setValue(writePagePref(prefKey, parsed, min, max));
											}
										}
									}),
									jsx("span", { className: "dcw_unit", children: "px" })
								]
							}),
							jsxs("div", {
								className: "dcw_presets",
								children: [
									...presets.map((preset) =>
										jsx(
											"button",
											{
												type: "button",
												className: "dcw_preset",
												"data-active": !isFill && value === preset,
												onClick: () => commit(preset),
												children: t("width.preset", { width: preset })
											},
											preset
										)
									),
									jsx(
										"button",
										{
											type: "button",
											className: "dcw_preset",
											"data-active": isFill,
											onClick: () => commit(FILL),
											children: t("page.fill")
										},
										"fill"
									),
									jsx("button", {
										type: "button",
										className: "dcw_reset",
										onClick: reset,
										children: t("page.reset")
									})
								]
							}),
							jsx("div", {
								className: "dcw_status",
								role: "status",
								children: isFill
									? t("page.fillStatus")
									: value === null
										? t("page.default", { width: fallback })
										: t("page.applied", { width: shown })
							})
						]
					})
				]
			});
		}

		/** Settings-dialog width row. */
		function SettingsPresentationRow({ t }) {
			const [mode, setMode] = react.useState(() => readSettingsMode());

			/* Another window may switch the presentation. */
			react.useEffect(() => {
				const sync = () => setMode(readSettingsMode());
				window.addEventListener("storage", sync);
				return () => window.removeEventListener("storage", sync);
			}, []);

			const choose = react.useCallback((next) => {
				writeSettingsMode(next);
				setMode(readSettingsMode());
			}, []);

			const isPage = mode === MODE_PAGE;

			/*
			 * In page mode the width preference is meaningless - the panel fills
			 * the frame - so the width control is hidden instead of being shown
			 * disabled, which would suggest it does something.
			 */
			return jsxs("div", {
				className: "dcw_row",
				children: [
					jsxs("div", {
						className: "dcw_main",
						children: [
							jsx("div", { className: "dcw_title", children: t("page.presentationTitle") }),
							jsx("div", {
								className: "dcw_description",
								children: isPage ? t("page.presentationPageHint") : t("page.presentationDialogHint")
							})
						]
					}),
					jsxs("div", {
						className: "dcw_controls",
						children: [
							jsxs("div", {
								className: "dcw_presets",
								role: "group",
								children: [
									jsx(
										"button",
										{
											type: "button",
											className: "dcw_preset",
											"data-active": !isPage,
											"aria-pressed": !isPage,
											onClick: () => choose(MODE_DIALOG),
											children: t("page.presentationDialog")
										},
										"dialog"
									),
									jsx(
										"button",
										{
											type: "button",
											className: "dcw_preset",
											"data-active": isPage,
											"aria-pressed": isPage,
											onClick: () => choose(MODE_PAGE),
											children: t("page.presentationPage")
										},
										"page"
									)
								]
							}),
							isPage ? null : jsx("div", {
								className: "dcw_status",
								role: "status",
								children: t("page.presentationReopen")
							})
						]
					})
				]
			});
		}

		/**
		 * Settings-dialog width row.
		 *
		 * Only meaningful in dialog presentation; the width preference is ignored
		 * while the page presentation is active, so the row hides itself there
		 * rather than offering a control that cannot take effect.
		 */
		function SettingsDialogWidthRow({ t }) {
			const [mode, setMode] = react.useState(() => readSettingsMode());
			react.useEffect(() => {
				const sync = () => setMode(readSettingsMode());
				window.addEventListener("storage", sync);
				return () => window.removeEventListener("storage", sync);
			}, []);
			if (mode === MODE_PAGE) return null;
			return PageWidthRow({
				prefKey: DIALOG_PREF_KEY,
				min: DIALOG_MIN,
				max: DIALOG_MAX,
				fallback: DIALOG_DEFAULT,
				presets: DIALOG_PRESETS,
				titleKey: "page.dialogTitle",
				descriptionKey: "page.dialogDescription",
				t
			});
		}

		/** Global-panel (插件 / 技能 / ...) content width row. */
		function GlobalPanelWidthRow({ t }) {
			return PageWidthRow({
				prefKey: PANEL_PREF_KEY,
				min: PANEL_MIN,
				max: PANEL_MAX,
				fallback: PANEL_DEFAULT,
				presets: PANEL_PRESETS,
				titleKey: "page.panelTitle",
				descriptionKey: "page.panelDescription",
				t
			});
		}
		//#endregion

		//#region dictionaries
		const NS = "conversation-width";
		const zh = {
			"width.title": "对话显示区域宽度",
			"width.description": "拖动滑块或输入数值调整中间对话区的宽度，与拖拽边缘的效果相同。",
			"width.preset": "{width}px",
			"width.reset": "恢复自适应",
			"width.applied": "当前固定为 {width}px",
			"width.auto": "当前为自适应宽度（随窗口缩放）",
			"page.dialogTitle": "设置窗口宽度",
			"page.dialogDescription": "调整「设置」弹窗本身的宽度。默认 800px，窗口放不下时仍会留出边距。",
			"page.presentationTitle": "设置页展示方式",
			"page.presentationDialogHint": "以居中弹窗显示，其它操作可见但被遮住。",
			"page.presentationPageHint": "以整页显示：设置铺满主区域，左导航贴边，没有遮罩暗背景。重新打开设置后生效。",
			"page.presentationDialog": "弹窗",
			"page.presentationPage": "整页",
			"page.presentationReopen": "切换后可关闭再打开设置查看效果",
			"page.panelTitle": "整页视图内容宽度",
			"page.panelDescription": "从侧栏打开的整页（如「插件」「技能」）里，内容原本被限制在 960px 居中；这里放宽它，或直接铺满。",
			"page.fill": "铺满",
			"page.fillStatus": "当前铺满可用宽度",
			"page.applied": "当前固定为 {width}px",
			"page.default": "当前为宿主默认宽度（{width}px）",
			"page.reset": "恢复默认"
		};
		const en = {
			"width.title": "Conversation display width",
			"width.description": "Drag the slider or type a value to set the middle conversation column's width. Same preference as dragging its edges.",
			"width.preset": "{width}px",
			"width.reset": "Use auto",
			"width.applied": "Fixed at {width}px",
			"width.auto": "Auto — follows the window width",
			"page.dialogTitle": "Settings window width",
			"page.dialogDescription": "Sets the width of the Settings dialog itself. The host default is 800px, and it still keeps a margin when the window is narrower.",
			"page.presentationTitle": "Settings presentation",
			"page.presentationDialogHint": "Shown as a centred dialog; the rest of the app stays visible but dimmed.",
			"page.presentationPageHint": "Shown as a full page: Settings fills the main area, the nav docks left, and there is no dimming mask. Reopen Settings to see it.",
			"page.presentationDialog": "Dialog",
			"page.presentationPage": "Page",
			"page.presentationReopen": "Reopen Settings to see the change",
			"page.panelTitle": "Full-page content width",
			"page.panelDescription": "Full pages opened from the sidebar (Plugins, Skills, …) cap their content at 960px and centre it. Widen that, or fill the available width.",
			"page.fill": "Fill",
			"page.fillStatus": "Filling the available width",
			"page.applied": "Fixed at {width}px",
			"page.default": "Host default width ({width}px)",
			"page.reset": "Use default"
		};
		//#endregion

		/**
		 * Required services. `settings.general.item` is declared by
		 * ui-settings-general's own apply, whose activation order relative to
		 * this plugin is not constrained; `slots.inject` waits for the
		 * declaration and registers once it appears.
		 */
		const inject = ["slots", "locale"];

		/** Register the dictionary and the General Settings row. */
		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(NS, { zh, en }),
				"conversation-width: dictionaries"
			);
			/*
			 * Both page axes are published imperatively rather than through a slot:
			 * they act on host chrome (the Settings dialog, the global-panel main
			 * area) that no slot owns, and the dialog is portalled to `document.body`
			 * so it is not even a descendant of the element that renders our row.
			 * The observer re-applies them as Settings opens and as panels mount.
			 */
			ctx.effect(watchPageWidths, "conversation-width: page width axes");
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{
						name: "settings.general.item",
						id: "conversation-width",
						/*
						 * List slots sort by `priority` then `order`, and equal pairs
						 * fall back to registration order - so sharing a number with
						 * a built-in row makes this row's position depend on which
						 * plugin happened to apply first. 20 is taken by
						 * ui-conversation's `composer-enter`, so sit between it and
						 * `link-opening` (17) instead. Neighbours on 0.2.1-rc.5,
						 * unchanged on 0.2.2-rc.1, 0.2.2-rc.2 and 0.2.2-rc.3:
						 * 16 shortcuts, 17 link-opening, 20 composer-enter,
						 * 30 performance-usage. (0.2.2-rc.2 added
						 * `desktop-update-channel` at 95, still clear of 18.)
						 */
						order: 18,
						locale: NS
					},
					ConversationWidthRow
				)
			);
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{ name: "settings.general.item", id: "conversation-width-dialog-mode", order: 19, locale: NS },
					SettingsPresentationRow
				)
			);
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{ name: "settings.general.item", id: "conversation-width-dialog", order: 19.5, locale: NS },
					SettingsDialogWidthRow
				)
			);
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{ name: "settings.general.item", id: "conversation-width-panel", order: 21, locale: NS },
					GlobalPanelWidthRow
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
