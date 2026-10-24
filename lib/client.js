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
		 * 0.2.0-rc.2 and 0.2.1-rc.3), so dispatching one is a no-op.
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
			".dcw_status{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;min-height:18px}";

		const tagId = "dsh-conversation-width/ConversationWidthRow.module.css";
		if (typeof document !== "undefined") {
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

		//#region dictionaries
		const NS = "conversation-width";
		const zh = {
			"width.title": "对话显示区域宽度",
			"width.description": "拖动滑块或输入数值调整中间对话区的宽度，与拖拽边缘的效果相同。",
			"width.preset": "{width}px",
			"width.reset": "恢复自适应",
			"width.applied": "当前固定为 {width}px",
			"width.auto": "当前为自适应宽度（随窗口缩放）"
		};
		const en = {
			"width.title": "Conversation display width",
			"width.description": "Drag the slider or type a value to set the middle conversation column's width. Same preference as dragging its edges.",
			"width.preset": "{width}px",
			"width.reset": "Use auto",
			"width.applied": "Fixed at {width}px",
			"width.auto": "Auto — follows the window width"
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
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{
						name: "settings.general.item",
						id: "conversation-width",
						/* After developer-tools (15), before current-version (100). */
						order: 20,
						locale: NS
					},
					ConversationWidthRow
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
