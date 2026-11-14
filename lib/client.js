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
		 * The Settings dialog: `dsh-client-ui-settings-general` renders it through
		 * createPortal(..., document.body), so it is NOT inside the main panel and
		 * cannot inherit anything from it. It reads a fixed `width:800px` with
		 * `max-width:calc(100vw - 48px)`.
		 *
		 * The dialog is found by `[data-shortcut-modal="settings"]`, a host-semantic
		 * hook rather than a styling detail, and it stays stable across the releases
		 * this plugin supports. Class names in these bundles are content hashes
		 * (`AnXs9G_panel`), so nothing here selects on one.
		 */
		/** Settings-dialog width preference (px), or "fill". Owned by this plugin. */
		const DIALOG_PREF_KEY = "dsh.conversation-width.settingsDialog";
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
		/** Presets offered on each axis, plus the shared fill action. */
		const DIALOG_PRESETS = [800, 1100, 1400];
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
		}

		/**
		 * The application frame element, found by the grid it establishes.
		 *
		 * The frame is located structurally - the element that lays out three
		 * explicit grid tracks - and its geometry is read directly. That works on
		 * every page, including the conversation view.
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
			/*
			 * The top gap is the window chrome's height, applied as an OUTER margin via
			 * `inset` - the same space a neighbouring page gets from being inset. On
			 * macOS the frame starts at y=0 with the title bar drawn over it, so
			 * frameRect.top alone is zero and the page slid under the traffic lights.
			 *
			 * `--dsh-frame-top-clearance` is that title-bar height (48px), and it does
			 * not collapse in fullscreen - unlike `--dsh-frame-overlay-top`, which the
			 * host lowers to 20px there. 24px is the floor when the variable is absent.
			 */
			const root = window.getComputedStyle(document.documentElement);
			const clearance = parseFloat(root.getPropertyValue("--dsh-frame-top-clearance"));
			const chromeTop = Number.isFinite(clearance) && clearance > 0 ? clearance : 24;
			set("top", frameRect.top + chromeTop);
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
				installPageCloseAffordances(overlay, dialog);
			} else if (overlay.hasAttribute("data-dcw-settings-page")) {
				overlay.removeAttribute("data-dcw-settings-page");
				for (const side of ["top", "right", "bottom", "left"]) {
					overlay.style.removeProperty(`--dcw-page-${side}`);
				}
				uninstallPageCloseAffordances(overlay, dialog);
			}
		}

		/**
		 * How page presentation closes the dialog.
		 *
		 * The host closes Settings two ways: Escape, which `useModalLayer` already
		 * handles, and clicking the mask. Page presentation hides the mask, so
		 * without replacements the only exit is Escape - undiscoverable, and the
		 * sidebar looks clickable but does nothing because the host never wired
		 * "navigate away closes a modal" (the mask made it unreachable).
		 *
		 * So two affordances are added: a visible back button, and a capture-phase
		 * click on the frame that closes Settings for any click outside the page.
		 * Both route through the host's own close path by dispatching what the host
		 * listens for, rather than calling an internal action this plugin would have
		 * to reach into.
		 * @param overlay the Settings overlay.
		 * @param dialog the Settings dialog element.
		 */
		function installPageCloseAffordances(overlay, dialog) {
			if (overlay.__dcwBackButton !== undefined) return;

			/*
			 * The back button goes INTO the title row, not over it. The row already
			 * holds the word 设置 and owns the top padding that clears the window
			 * chrome; placing a button on top of it hides that word, which is what
			 * happened when it was absolutely positioned over the panel corner. In
			 * flow, the row's own padding reserves the space and the button sits in
			 * it without overlapping anything.
			 */
			const back = document.createElement("button");
			back.type = "button";
			back.className = "dcw_back";
			back.setAttribute("aria-label", "Back");
			back.dataset.dcwSettingsBack = "";
			back.textContent = "‹";
			back.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				closeSettings(dialog);
			});

			/* The title row is the panel's first child that holds text and no buttons. */
			const titleRow = findTitleRow(dialog);
			if (titleRow !== null) {
				titleRow.classList.add("dcw_titleRow");
				titleRow.insertBefore(back, titleRow.firstChild);
				overlay.__dcwTitleRow = titleRow;
				overlay.removeAttribute("data-dcw-no-title");
			} else {
				/*
				 * No title row recognised: keep a usable exit, and mark the overlay so the
				 * stylesheet puts the chrome clearance on the panel instead. Falling back
				 * to a bare overlay button is what let it sit over the window controls.
				 */
				overlay.insertBefore(back, overlay.firstChild);
				overlay.setAttribute("data-dcw-no-title", "");
			}
			overlay.__dcwBackButton = back;

			/*
			 * Outside-click closer. `capture: true` so it runs before the host's own
			 * handlers, and the page itself is excluded so interacting with Settings
			 * never closes it. Only elements outside the overlay count, which is what
			 * makes clicking the sidebar or a session navigate and close together.
			 */
			const onPointerDown = (event) => {
				if (overlay.__dcwBackButton === undefined) return;
				const target = event.target;
				if (!(target instanceof Node)) return;
				/* Clicks inside the page, or on our back button, keep it open. */
				if (overlay.contains(target)) return;
				closeSettings(dialog);
			};
			document.addEventListener("pointerdown", onPointerDown, true);
			overlay.__dcwPointerDown = onPointerDown;
		}

		/**
		 * Remove the affordances added by {@link installPageCloseAffordances}.
		 * @param overlay the Settings overlay.
		 * @param dialog the Settings dialog element (unused beyond symmetry).
		 */
		function uninstallPageCloseAffordances(overlay, dialog) {
			const back = overlay.__dcwBackButton;
			if (back !== undefined) {
				back.remove();
				delete overlay.__dcwBackButton;
			}
			const titleRow = overlay.__dcwTitleRow;
			if (titleRow !== undefined) {
				titleRow.classList.remove("dcw_titleRow");
				delete overlay.__dcwTitleRow;
			}
			overlay.removeAttribute("data-dcw-no-title");
			const handler = overlay.__dcwPointerDown;
			if (handler !== undefined) {
				document.removeEventListener("pointerdown", handler, true);
				delete overlay.__dcwPointerDown;
			}
			void dialog;
		}

		/**
		 * The panel's title row.
		 *
		 * It is the first child of the panel that contains text and no buttons: the
		 * nav column is full of buttons and the header row holds controls, while the
		 * title row holds only the 设置 label. Returning null lets the caller fall
		 * back rather than guess.
		 * @param dialog the Settings dialog element.
		 * @returns the title row, or null.
		 */
		function findTitleRow(dialog) {
			/*
			 * The title row is the element the dialog names in `aria-labelledby`: the
			 * host gives it `id={titleId}` and points the dialog at it, so this is the
			 * stable hook rather than a heuristic. Requiring non-empty text did not
			 * work - the row's content comes from the `settings.header` slot, so at the
			 * moment this runs it can still be empty, the lookup then failed, and the
			 * button fell back to floating over the panel with no padding reserved
			 * (which is why the gap disappeared and the controls were covered).
			 */
			const labelledBy = dialog.getAttribute("aria-labelledby");
			if (labelledBy) {
				for (const id of labelledBy.split(/\s+/)) {
					if (!id) continue;
					/*
					 * getElementById first: the id is host-generated and a plain lookup
					 * avoids depending on CSS.escape, which is not always available.
					 */
					const row = document.getElementById(id)
						?? (typeof CSS !== "undefined" && CSS.escape
							? dialog.querySelector(`#${CSS.escape(id)}`)
							: null);
					if (row !== null && dialog.contains(row)) return row;
				}
			}
			/* Fallback: the first child that holds text and no buttons. */
			for (const child of dialog.children) {
				if (child.querySelectorAll("button").length > 0) continue;
				if ((child.textContent ?? "").trim().length > 0) return child;
			}
			return null;
		}

		/**
		 * Close Settings by pressing the host's own close button.
		 *
		 * The first attempt synthesised an Escape keydown for `useModalLayer` to
		 * pick up, and it did not work: that listener runs its own guards
		 * (composition state, key repeat) and only acts for the topmost registered
		 * layer, none of which a synthetic event reliably satisfies. Clicking the
		 * host's close button instead goes through the component's own `onClick`,
		 * which is the same path a user takes - no internal action is reached into,
		 * and the modal stack unwinds exactly as it does for a real click.
		 *
		 * The button carries no aria-label and its class name is a content hash, so
		 * it is located as the last button in the panel's header area: the header is
		 * the panel's first row and the close button is its trailing control. When
		 * it cannot be found the overlay is simply left open rather than guessed at.
		 * @param dialog the Settings dialog element.
		 * @returns whether a close was triggered.
		 */
		function closeSettings(dialog) {
			if (dialog === null || !dialog.isConnected) return false;
			const closeButton = findHostCloseButton(dialog);
			if (closeButton === null) return false;
			closeButton.click();
			return true;
		}

		/**
		 * The host's close button inside the Settings panel.
		 *
		 * The panel's children, in DOM order, are: the title row (only the word 设置),
		 * the navigation column (one button per settings section), the header row, and
		 * the scrollable options area. Two earlier attempts at "just find the button"
		 * both picked the wrong one:
		 *
		 *   - first child holding buttons  -> the NAV column, so the last of its
		 *     buttons (侧边卡片) was clicked: the back button navigated instead of
		 *     closing.
		 *   - last child holding buttons   -> the options area, so a section control
		 *     was clicked instead.
		 *
		 * What actually identifies the header row is its shape: it holds a button that
		 * is a DIRECT child while also containing another block (the actions slot)
		 * that has buttons of its own. The nav column's buttons are all direct
		 * siblings, and the options area has a single button. That shape is what this
		 * matches, and it keeps working when the class hash changes.
		 * @param dialog the Settings dialog element.
		 * @returns the close button, or null when the markup is not what we expect.
		 */
		function findHostCloseButton(dialog) {
			for (const child of dialog.children) {
				const directButtons = [...child.children].filter((el) => el.tagName === "BUTTON");
				if (directButtons.length !== 1) continue;
				if (child.querySelectorAll("button").length < 2) continue;
				return directButtons[0];
			}
			return null;
		}

		/**

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
			observer.observe(document.body, { childList: true, subtree: true });
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
			 * The dialog width is consumed here rather than written straight onto
			 * the host's own `width`, so the host keeps its `max-width` safety net
			 * (`calc(100vw - 48px)`) and an absent preference degrades to "host
			 * default" instead of overflowing.
			 *
			 * `[data-shortcut-modal="settings"]` is the Settings dialog: declared by
			 * ui-settings-general so the shortcut layer can tell which modal is in
			 * front, which is why it outlives any class hash.
			 */
			'[data-shortcut-modal="settings"]{width:var(--dsh-settings-dialog-width,800px)!important}' +
			/*
			 * Full-page presentation for Settings.
			 *
			 * The overlay is `position:fixed;inset:0` containing a mask plus a
			 * centred panel. Presenting it as a page means: hide the dimming mask,
			 * stretch the panel edge to edge, square off the floating-card look, and
			 * let the nav column run full height like a sidebar.
			 *
			 * Selection is by the host's own ARIA attributes, not by position or
			 * class name. Both reasons are load-bearing: class names are content
			 * hashes (`AnXs9G_panel`) that change between releases, and positional
			 * `>:first-child` / `>:last-child` breaks as soon as this plugin inserts
			 * its back button into the same overlay - which is exactly the bug that
			 * shipped in the first draft of this feature (the button took the
			 * first-child slot and the mask stopped being hidden). The mask is the
			 * overlay's `[aria-hidden]` child and the panel is its `[role=dialog]`.
			 *
			 * The panel keeps its own `display:grid` and two-column template, so the
			 * nav and content areas need no restructure; only padding, radius and
			 * spacing change.
			 */
			/*
			 * The overlay is transparent in its dialog form: the mask supplies the dim,
			 * and only the panel paints (`--dsw-alias-bg-layer-2`). Hiding the mask
			 * therefore exposes whatever the app has behind it, which reads as the wrong
			 * colour once Settings covers the main area. A full page needs its own
			 * opaque surface - the same layer token the panel uses - so it looks like a
			 * page rather than a translucent pane.
			 */
			"[data-dcw-settings-page]{padding:0!important;justify-content:stretch!important;align-items:stretch!important;background:var(--dsw-alias-bg-layer-2)!important}" +
			"[data-dcw-settings-page]>[aria-hidden]{display:none!important}" +
			"[data-dcw-settings-page]>[role=dialog]{width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;border-radius:0!important;box-shadow:none!important}" +
			/*
			 * Bound the page to the main area instead of the whole viewport, so it
			 * looks like a panel (Plugins, Skills) rather than covering the sidebar.
			 * The offsets come from variables this plugin publishes after measuring
			 * the frame's own grid; without a measurement the page falls back to the
			 * full viewport, which is still usable.
			 */
			/*
			 * Scoped to the overlay, and the marker must NEVER be mirrored onto the
			 * panel. The panel is `position:relative`, where `inset` is not a
			 * positioning frame but a RELATIVE OFFSET - so marking both elements
			 * shifted the whole Settings page right by the sidebar width and exposed
			 * the app behind it. That regression shipped in 1.2.6.
			 */
			"[data-dcw-settings-page]{position:fixed!important;inset:var(--dcw-page-top,0px) var(--dcw-page-right,0px) var(--dcw-page-bottom,0px) var(--dcw-page-left,0px)!important}" +
			/*
			 * The back button. Page presentation hides the mask, which was how the
			 * dialog used to be dismissable by pointer, so this restores a visible
			 * exit. It floats over the page's own header row rather than taking
			 * layout space, because the host panel is a grid whose tracks this plugin
			 * must not disturb.
			 */
			/*
			 * The back button sits in the title row, which the host lays out as a
			 * grid area with `padding:22px 12px 8px 24px` around the word 设置. An
			 * absolutely positioned button at the top-left covers that word, so the
			 * button is placed in flow instead: the title row gets left padding for
			 * it, and the button is absolutely positioned only vertically within
			 * that reserved space.
			 */
						/*
			 * The top gap is the window chrome's own height, not an extra budget.
			 *
			 * `--dsh-frame-top-clearance` IS the title-bar height on macOS (48px), so
			 * using it clears the traffic lights by exactly their own height. Two
			 * earlier versions got this wrong in different ways: adding
			 * `--dsh-frame-overlay-top` to the page box (68px windowed, 20px in
			 * fullscreen, so the gap halved in fullscreen), then adding the host
			 * page's `28px + clearance` to the page box (98px in total once the title
			 * row's own 22px was included, which read as too much).
			 *
			 * The page box now starts at the main area's top edge - no strip of app
			 * showing above it - and the title row carries the clearance as its top
			 * padding, with a 24px floor so a missing variable still leaves a gap.
			 */
						/*
			 * The gap above the page is MARGIN-like: it is space around the page, the
			 * same thing a neighbouring page gets from the window being inset. It is
			 * owned by `inset` on the overlay; the title row therefore keeps the host's
			 * original 22px top padding and only gains the left allowance for the back
			 * button. Using padding for the outer gap would grow the page's interior
			 * while the box still reached the window edge - not what a page looks like.
			 */
			'[data-dcw-settings-page] .dcw_titleRow{padding-left:52px!important;position:relative}' +
			/*
			 * Fallback when the title row cannot be identified: the page still needs to
			 * clear the chrome, so the panel itself gets the top padding and enough left
			 * inset for the button. Without this, an unidentified title row left the
			 * button floating at the very top over the window controls.
			 */
			"[data-dcw-settings-page][data-dcw-no-title] > [role=dialog]{padding-top:max(24px, var(--dsh-frame-top-clearance,24px))!important;padding-left:52px!important;box-sizing:border-box!important}" +
			"[data-dcw-settings-page][data-dcw-no-title] .dcw_back{position:absolute;top:max(24px, var(--dsh-frame-top-clearance,24px));left:14px;transform:translateY(50%)}" +
			".dcw_back{position:absolute;top:50%;left:14px;transform:translateY(-50%);width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:18px;line-height:1;cursor:pointer}" +
			".dcw_back:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
			".dcw_back:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,currentColor);outline-offset:2px}";

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
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
