# dsh-conversation-width

一个 DSH Web 插件，在 **设置 → 通用** 中增加「**对话显示区域宽度**」一项。

全新安装时，中间对话栏被限制在 920px，在宽屏显示器上显得拥挤。本插件把该栏位真实存在的宽度偏好暴露到设置页，从此不必只靠拖拽对话区边缘来调宽度。

## 它做了什么

Conversation 包本身已经拥有一个宽度偏好：

```
localStorage["dsh.conversation.contentWidth"]   // 单位 px，由拖拽手柄写入
```

并把它发布成唯一权威的 CSS 变量：

```css
--dsh-chat-content-width: var(--dsh-chat-user-width,
    clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * .64), 920px));
```

本插件**没有**引入第二套宽度体系。它只是现有拖拽手柄在设置页里的孪生控件：读写的都是同一个 key，所以两个控件永远一致；Conversation 自己的 clamp `[640, columnWidth - 176]` 依然叠加在存储值之上。超出范围的值会被布局自动纠正，而不是把页面弄坏。

### 控件

| 控件 | 行为 |
| --- | --- |
| 滑块 | `640`–`1600px`，步进 20px，实时生效 |
| 数字框 | 同样范围；输入过程中会忽略「空值／半截草稿」这类中间态 |
| `920` / `1100` / `1280` | 一键预设 |
| 恢复自适应 | 删除存储的 key，回到 `clamp(680, column * .64, 920)` |

### 为什么上限是 1600px

因为超过约 1100–1300px 之后，一行散文就不再舒适可读了——眼睛会跟丢行尾，所以真正有用的区间其实远在 1600 之内。留到 1600 是为了照顾特别宽的显示器、以及偏好宽栏位的用户；而布局自己的 `columnWidth - 176` clamp 始终是任意给定窗口下的硬上限。

## 兼容性

已在 **DSH 0.2.1-rc.2** 的宿主上实测通过，同时也兼容 0.2.0-rc.2。

插件依赖的宿主契约共六项，逐项都对着宿主源码核过：

| 契约 | 位置 | 0.2.0-rc.2 | 0.2.1-rc.2 |
| --- | --- | --- | --- |
| 客户端插件判定：`dsh.client.platform === "web"` + `exports["./client"]` | `dsh-client-modules` 的 `resolveMeta` / `clientExportOf` | ✓ | ✓ |
| 设置项插槽 `settings.general.item` | `dsh-client-ui-settings-general` 的 `renderSlot` | ✓ | ✓ |
| 注册形态 `{ name, id, order, locale }` | 同上，另有 `dsh-client-ui-chat` 等多处 | ✓ | ✓ |
| `locale.register(ns, { zh, en })` | `dsh-client-locale` | ✓ | ✓ |
| 宽度偏好 key `dsh.conversation.contentWidth` | `dsh-client-ui-conversation` 的 `WIDTH_PREF_KEY` | ✓ | ✓ |
| clamp 常量 `CONTENT_MIN = 640` / `CONTENT_EDGE_BUDGET = 176` | 同上 | ✓ | ✓ |

**0.2.1-rc.2 的变化不影响本插件**：`@deepseek-ai/dsh-client-ui-slots` 与 `@deepseek-ai/dsh-client-store` 不再作为独立包发布，但仍是 platform seed 词（由前端 vendor bundle 提供）。插件从来没有 `require` 过它们，只通过 cordis 服务注入 `slots` / `locale`，所以代码零改动即可运行；`peerDependencies` 里对应的声明已移除，避免指向一个不存在的包。

`react` 与 `react/jsx-runtime` 是插件唯一 `require` 的两个模块，在 0.2.0-rc.2 和 0.2.1-rc.2 的 seed 表里都在。0.2.1-rc.2 的 seed 表还新增了 `zod` 与 `@tanstack/react-virtual`，对本插件无影响。

## 安装

把本包链接进某个 DSH profile，并加入该 profile 的 bundle 列表。

1. 把本仓库克隆到一个固定位置，然后在 profile 的 `package.json` 里注册为本地包（路径为 `<userData>/.dsh/profiles/<profile>/package.json`）：

   ```jsonc
   "dependencies": {
     "dsh-conversation-width": "link:/absolute/path/to/dsh-conversation-width"
   },
   "dsh": {
     "profile": {
       "bundles": [ /* … */, "dsh-conversation-width" ]
     }
   }
   ```

2. 让 `node_modules/dsh-conversation-width` 指向该目录——Windows 上用 junction，其他平台用符号链接：

   ```powershell
   New-Item -ItemType Junction `
     -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-conversation-width" `
     -Target "D:\path\to\dsh-conversation-width"
   ```

   因为它是链接而不是拷贝，所以在这边的改动在宿主重启后即刻生效。

**必须重启宿主**——客户端模块图是启动时依据 Loader 的条目列表组装出来的，新增的插件行只有在那个时刻才会被扫描。这跟客户端插件的 HMR 通路无关（那条路需要在 DSH 源码检出上跑 `pnpm run dev:web`）。宿主正在运行也正是「刷新页面不够」的原因：宿主在启动时就对客户端 bundle 列表做了快照。

## 卸载

移除这一行是可逆的加法操作——所有痕迹都会随之消失：

1. 从 profile `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 中删掉 `dsh-conversation-width` 条目。
2. 删除 `node_modules/dsh-conversation-width` 那个 junction。
3. 重启宿主。

残留的 `localStorage` key 是无害的：插件没了就不会再有人写它，而拖拽手柄依旧会沿用这个值。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | Node 侧。有意留空：所有控件都在浏览器侧。 |
| `lib/client.js` | 那一行设置项、它的 CSS，以及它的多语言字典。 |
| `cordis.patch.yml` | 插入 profile 插件行的 bundle patch。 |
| `tools/` | 构建期间使用的一次性诊断脚本，见下。 |

`dsh.client.platform: "web"` 标记这是一个面向 Web 的客户端插件；`exports["./client"]` 就是宿主在 `/plugins/dsh-conversation-width/client.js` 提供的那份 bundle。

## 工具脚本

`tools/` 存放构建本插件时写的一次性排查脚本。保留它们，是因为每一个都回答了一个离线下很难定论的问题，而且它们跑的是已安装的 DSH，而不是源码检出。

有两个环境变量用来指向你自己的安装位置，没有任何硬编码。`app.asar` 是单个归档文件，所以读取它的脚本必须在 Electron 二进制的 Node 模式下运行：

```powershell
$env:DSH_ASAR        = "<install>/resources/app.asar"
$env:DSH_PROFILE_DIR = "$env:USERPROFILE\.dsh\profiles\desktop"
$env:ELECTRON_RUN_AS_NODE = "1"

& "<install>/DeepSeek Harness.exe" tools\_dcw_probe_host.cjs
```

| 工具 | 它回答的问题 |
| --- | --- |
| `_dcw_probe_host.cjs` / `_dcw_range.cjs` | `app.asar` 里到底有什么——列目录，以及按行号区间读取。 |
| `_dcw_probe_width.cjs` | 是哪个 CSS 变量和 clamp 掌管着栏位宽度，以及谁写入它。 |
| `_dcw_probe_slot.cjs` | `settings.general.item` 这个插槽是否存在，各行的落位顺序如何。 |
| `_dcw_probe_pnpm.cjs` | profile 如何解析链接进来的本地包。 |
| `_dcw_livegraph.cjs` | 按宿主 `resolveMeta` 的同一套判定，验证插件在真实 profile 里能否被组装进客户端模块图。 |
| `_dcw_yaml_check.cjs` | 内置的 YAML 解析器能否接受 `cordis.patch.yml`。 |
| `_dcw_check_peers.cjs` | 插件声明的每个 peer 与每个 `require()` 在当前宿主上是否都成立——用来抓宿主升级导致的契约漂移。 |
| `_dcw_test_client.cjs` | 用一个极简 DOM 和被 shim 的 `react`，跑真正的 bundle 工厂函数，然后检查返回的树。 |
| `_dcw_test_host.mjs` | 按宿主 loader 的方式导入 Node 侧，证明它不会破坏启动。 |
| `_dcw_verify_state.mjs` | 断言安装状态：bundle 已注册、junction 有效、无重复解析。 |
| `_dcw_apply_restore.mjs`、`_dcw_merge_patch.mjs` | 改写 `cordis.patch.yml`，以及从备份恢复而不丢失无关条目。 |
| `_dcw_make_buggy.cjs` | 把最初那个坏掉的 CSS 注入块重建到 `.scratch/`，好让测试脚本被证明真的能抓到它本该抓的缺陷。 |
| `_dcw_show.cjs` | 按行号区间打印文件内容。 |

最后一条值得强调：**一个永远只通过的测试不证明任何事**。`_dcw_make_buggy.cjs` 复现了真实的缺陷——用 `JSON.stringify` 拼接字符串构造选择器，产出 `style[data-plugin-css=""…""]`，导致 `querySelector` 在模块顶层抛 `SyntaxError: … is not a valid selector`——而 `_dcw_test_client.cjs` 在那个副本上失败、在真副本上通过。

## 备注

- 该行注册进 `settings.general.item` 插槽，`order: 20`，位置在内置的开发者工具行之后、Current version 之前。
- 文案放在插件自己的 `conversation-width` locale 命名空间里，遵循「每个注册者拥有自己那一行的文案」的约定。
- 修改偏好时会派发一个 `window` 的 `resize` 事件。Conversation 是通过 `ResizeObserver` 发布 `--dsh-chat-user-width` 的，而这个观察者在仅偏好变化时不会触发；同源的 `storage` 事件又不会投递给写入方文档——所以这是布局已经监听的最省事的信号。
