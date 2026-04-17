# AI比一比 Developer Guide / AI比一比开发者指南

## Overview / 概述

AI比一比 (AI Compare) is a Chrome browser extension that enables users to interact with multiple AI websites simultaneously in a unified interface. This guide helps developers add new AI sites and extend functionality.

AI比一比是一个 Chrome 浏览器扩展，允许用户在统一界面中同时与多个 AI 网站交互。本指南帮助开发者添加新的 AI 站点并扩展功能。

## Target Browser / 目标浏览器

Primary target browser: Google Chrome 114+ / 主要目标浏览器：Google Chrome 114+

For local development, load the unpacked extension from `chrome://extensions/` and use Chrome as the primary verification environment. / 本地开发时，请从 `chrome://extensions/` 加载未打包扩展，并以 Chrome 作为主要验证环境。

## Table of Contents / 目录

- [Target Browser / 目标浏览器](#target-browser--目标浏览器)
- [Architecture Overview / 架构概述](#architecture-overview--架构概述)
- [Chrome Architecture / Chrome 架构](#chrome-architecture--chrome-架构)
- [Key Chrome APIs / 关键 Chrome API](#key-chrome-apis--关键-chrome-api)
- [Chrome Runtime Flow / Chrome 运行流程](#chrome-runtime-flow--chrome-运行流程)
- [Adding New AI Sites / 添加新的 AI 站点](#adding-new-ai-sites--添加新的-ai-站点)
- [Action Types Reference / 动作类型参考](#action-types-reference--动作类型参考)
- [Debugging Guide / 调试指南](#debugging-guide--调试指南)
- [Best Practices / 最佳实践](#best-practices--最佳实践)
- [Contributing / 贡献指南](#contributing--贡献指南)

## Architecture Overview / 架构概述

### Core Components / 核心组件

```
AICompareChrome/
├── manifest.json               # Chrome Manifest V3 entry / Chrome MV3 清单入口
├── background.js               # Service worker hub / Service Worker 中枢
├── config/
│   ├── baseConfig.js           # Base and remote config helpers / 基础和远程配置辅助
│   ├── siteDetector.js         # Site detection logic / 站点识别逻辑
│   ├── siteHandlers.json       # AI site automation config / AI 站点自动化配置
│   └── rules.json              # Declarative Net Request rules / DNR 规则
├── content-scripts/
│   ├── float-button.js         # Floating quick entry / 浮动快捷入口
│   ├── selection.js            # Selected-text actions / 划词入口
│   └── search-engines.js       # Search result integration / 搜索引擎结果页集成
├── iframe/
│   ├── iframe.html             # Comparison tab shell / 对比标签页壳层
│   ├── iframe.js               # Multi-AI tab orchestration / 多 AI 标签页调度
│   ├── inject.js               # Site automation runtime / 站点自动化运行时
│   └── export-responses.js     # Export helpers / 导出辅助
├── options/
│   ├── options.html            # Options UI / 设置页面
│   └── options.js              # Settings persistence / 设置持久化
└── _locales/                   # I18n resources / 国际化资源
```

### How It Works / 工作原理

1. **Chrome Entry Points / Chrome 入口**: Toolbar icon, shortcut, floating button, selection, context menu, and omnibox all route into the extension / 工具栏图标、快捷键、浮动按钮、划词、右键菜单和 omnibox 都会进入扩展
2. **Tab-First Surface / 标签页优先界面**: `background.js` opens `iframe/iframe.html` as a normal Chrome tab / `background.js` 以普通 Chrome 标签页方式打开 `iframe/iframe.html`
3. **Site Split / 站点分流**: Iframe-capable sites stay inside the comparison tab; others open as normal tabs / 支持 iframe 的站点留在对比标签页中，不支持的站点则作为普通标签页打开
4. **Automation Runtime / 自动化运行时**: `inject.js` executes configured handler steps from `siteHandlers.json` / `inject.js` 根据 `siteHandlers.json` 执行自动化步骤
5. **Persistence / 持久化**: User settings live in `chrome.storage.sync`, while cached config and runtime data live in `chrome.storage.local` / 用户设置存储在 `chrome.storage.sync`，缓存配置和运行时数据存储在 `chrome.storage.local`

## Chrome Architecture / Chrome 架构

### Layered Design / 分层设计

1. **Entry Layer / 入口层**: `chrome.action`, keyboard shortcuts, floating buttons, selection actions, search engine buttons, context menus, and omnibox suggestions provide multiple Chrome-native entry points / `chrome.action`、快捷键、浮动按钮、划词动作、搜索引擎按钮、右键菜单和 omnibox 建立多个 Chrome 原生入口
2. **Orchestration Layer / 调度层**: `background.js` is the service worker that receives messages, initializes config, opens tabs, reuses existing tabs, and dispatches site automation / `background.js` 作为 service worker 接收消息、初始化配置、打开或复用标签页，并分发站点自动化逻辑
3. **Comparison Tab Layer / 对比标签页层**: `iframe/iframe.html` and `iframe/iframe.js` render the unified multi-AI workspace inside a standard Chrome tab / `iframe/iframe.html` 和 `iframe/iframe.js` 在标准 Chrome 标签页内渲染统一的多 AI 工作台
4. **Automation Layer / 自动化层**: `iframe/inject.js` plus `config/siteHandlers.json` convert a generic query into site-specific DOM operations such as focus, setValue, triggerEvents, paste, click, or Enter / `iframe/inject.js` 配合 `config/siteHandlers.json` 把通用查询转换成各站点特定的 DOM 操作，如 focus、setValue、triggerEvents、paste、click、Enter
5. **Configuration Layer / 配置层**: `config/` and `options/` manage built-in defaults, remote site config, per-site user settings, and prompt templates / `config/` 与 `options/` 负责管理内置默认值、远程站点配置、站点级用户设置和提示词模板

### Tab-Based Chrome Design / 基于标签页的 Chrome 设计

The current Chrome version uses a standard tab as the primary comparison surface instead of relying on a side panel. This keeps the interaction model consistent for the toolbar icon, shortcut, floating button, and omnibox entry points. / 当前 Chrome 版本使用普通标签页作为主要对比界面，而不是依赖侧边栏，这样工具栏图标、快捷键、浮动按钮和 omnibox 的交互模型保持一致。

## Key Chrome APIs / 关键 Chrome API

- `chrome.action`: Opens the comparison tab from the toolbar icon / 从工具栏图标打开对比标签页
- `chrome.tabs`: Creates, activates, updates, and reuses Chrome tabs for comparison and non-iframe sites / 创建、激活、更新和复用 Chrome 标签页
- `chrome.storage.sync`: Stores user preferences such as site settings and prompt templates / 存储站点设置和提示词模板等用户偏好
- `chrome.storage.local`: Caches remote site config and runtime values / 缓存远程站点配置和运行时数据
- `chrome.contextMenus`: Adds selected-text search actions / 添加划词右键搜索入口
- `chrome.declarativeNetRequest`: Applies rule resources for request/response adjustments / 应用请求与响应调整规则
- `chrome.omnibox`: Supports `ai` keyword entry from the browser address bar / 支持浏览器地址栏 `ai` 关键字入口
- `chrome.i18n`: Serves localized text from `_locales/` / 从 `_locales/` 提供多语言文案

## Chrome Runtime Flow / Chrome 运行流程

1. **User Trigger / 用户触发**: The user clicks the toolbar icon, presses `Ctrl/⌘+M`, uses the floating button, selects text, chooses the context menu, or types `ai` in the omnibox / 用户点击工具栏图标、按下 `Ctrl/⌘+M`、使用浮动按钮、划词、右键菜单，或在 omnibox 输入 `ai`
2. **Background Dispatch / 后台分发**: `background.js` receives the message or browser event and decides whether to open the comparison tab, run a single-site search, or open the options page / `background.js` 接收消息或浏览器事件，决定打开对比标签页、执行单站点搜索或打开设置页
3. **Comparison Tab Boot / 对比页启动**: `iframe/iframe.html` loads and `iframe.js` receives the query and the selected sites / `iframe/iframe.html` 加载后，`iframe.js` 接收查询词和所选站点
4. **Iframe Group Load / iframe 站点加载**: Sites with `supportIframe: true` are loaded together inside the comparison tab / `supportIframe: true` 的站点会一起加载到对比标签页中
5. **Normal Tab Fallback / 普通标签页回退**: Sites without iframe support are opened or reused as normal Chrome tabs / 不支持 iframe 的站点会以普通 Chrome 标签页方式打开或复用
6. **Site Handler Execution / 站点处理执行**: After each target page loads, `inject.js` receives the query and executes the handler steps defined in `siteHandlers.json` / 目标页面加载后，`inject.js` 接收查询并执行 `siteHandlers.json` 中定义的处理步骤
7. **Settings and State / 设置与状态**: Changes from the options page and runtime updates are persisted through Chrome storage / 设置页修改和运行时更新会通过 Chrome storage 持久化

## Adding New AI Sites / 添加新的 AI 站点

### Step 1: Create Site Configuration / 第1步：创建站点配置

Add a new entry to `config/siteHandlers.json` / 在 `config/siteHandlers.json` 中添加新条目：

```json
{
  "name": "YourAI",
  "url": "https://yourai.com/",
  "enabled": true,
  "supportUrlQuery": false,
  "region": "Global",
  "supportIframe": true,
  "searchHandler": {
    "steps": [
      {
        "action": "click",
        "selector": "textarea, [contenteditable]",
        "description": "Click input area / 点击输入区域"
      },
      {
        "action": "setValue",
        "selector": "textarea",
        "description": "Set query text / 设置查询文本"
      },
      {
        "action": "sendKeys",
        "selector": "textarea",
        "keys": "Enter",
        "description": "Submit query / 提交查询"
      }
    ]
  }
}
```

### Step 2: Test Your Configuration / 第2步：测试配置

1. Open Chrome DevTools on the AI site / 在AI站点上打开Chrome开发者工具
2. Test selectors: `document.querySelector('your-selector')` / 测试选择器：`document.querySelector('your-selector')`
3. Verify automation steps work manually / 手动验证自动化步骤是否工作

### Step 3: Debug with Logs / 第3步：使用日志调试

The extension provides detailed logging / 扩展提供详细的日志记录：

```javascript
// Enable debug mode / 启用调试模式
console.log('🎯 inject.js 脚本已加载');
console.log('🚀 executeSiteHandler 开始执行');
console.log('✅ 使用 YourAI 配置化处理器处理消息');
```

## Action Types Reference / 动作类型参考

### Basic Actions / 基础动作

#### `click` / 点击动作
Clicks on DOM elements. / 点击DOM元素。

```json
{
  "action": "click",
  "selector": "button.submit",
  "description": "Click submit button / 点击提交按钮",
  "retryOnDisabled": true,
  "maxAttempts": 5,
  "retryInterval": 200
}
```

**Parameters / 参数：**
- `selector`: CSS selector (string or array) / CSS选择器（字符串或数组）
- `condition`: Optional condition check / 可选条件检查
- `retryOnDisabled`: Retry if button is disabled / 按钮禁用时重试
- `maxAttempts`: Maximum retry attempts / 最大重试次数
- `retryInterval`: Delay between retries (ms) / 重试间隔（毫秒）

#### `focus` / 聚焦动作
Sets focus on elements. / 设置元素焦点。

```json
{
  "action": "focus",
  "selector": "input[type=text]",
  "description": "Focus text input / 聚焦文本输入框"
}
```

#### `setValue` / 设值动作
Sets values in form elements. / 设置表单元素的值。

```json
{
  "action": "setValue",
  "selector": "textarea",
  "description": "Set textarea value / 设置文本区域的值"
}
```

**Input Types / 输入类型：**
- Default: Sets `element.value` for inputs / 默认：为输入元素设置 `element.value`
- `contenteditable`: Handles rich text editors / 处理富文本编辑器
- `special`: Custom handling with `specialConfig` / 使用 `specialConfig` 进行自定义处理

#### `sendKeys` / 发送按键动作
Sends keyboard events. / 发送键盘事件。

```json
{
  "action": "sendKeys",
  "selector": "textarea",
  "keys": "Enter",
  "description": "Press Enter key / 按下回车键"
}
```

**Supported Keys / 支持的按键：**
- `Enter`: Return key / 回车键

#### `triggerEvents` / 触发事件动作
Dispatches DOM events. / 分发DOM事件。

```json
{
  "action": "triggerEvents",
  "selector": "input",
  "events": ["input", "change", "blur"],
  "description": "Trigger input events / 触发输入事件"
}
```

#### `wait` / 等待动作
Adds delays between actions. / 在动作之间添加延迟。

```json
{
  "action": "wait",
  "duration": 500,
  "description": "Wait 500ms / 等待500毫秒"
}
```

#### `paste` / 粘贴动作
Simulates clipboard paste operation. / 模拟剪贴板粘贴操作。

```json
{
  "action": "paste",
  "description": "Paste clipboard content / 粘贴剪贴板内容"
}
```

### Advanced Actions / 高级动作

#### `replace` / 替换动作
Replaces DOM element content with custom HTML. / 用自定义HTML替换DOM元素内容。

```json
{
  "action": "replace",
  "selector": ".editor",
  "write": [
    {
      "tag": "p",
      "text": "$query",
      "attributes": {
        "class": "user-input"
      }
    }
  ],
  "description": "Replace editor content / 替换编辑器内容"
}
```

#### `custom` / 自定义动作
Executes custom JavaScript logic. / 执行自定义JavaScript逻辑。

```json
{
  "action": "custom",
  "customAction": "special_site_logic",
  "description": "Execute custom logic / 执行自定义逻辑"
}
```

**Built-in Custom Actions / 内置自定义动作：**
- `url_query`: Site uses URL parameters / 站点使用URL参数
- `placeholder`: Placeholder for future implementation / 未来实现的占位符
- `send_message`: Send message to parent window / 向父窗口发送消息

## Debugging Guide / 调试指南

### Enable Debug Logging / 启用调试日志

The extension provides comprehensive logging for troubleshooting / 扩展为故障排除提供全面的日志记录：

```javascript
// Check if site handler is found / 检查是否找到站点处理器
console.log('🔍 调试信息 - 域名:', domain);
console.log('🔍 调试信息 - 站点处理器:', siteHandler);

// Monitor step execution / 监控步骤执行
console.log('🚀 executeSiteHandler 开始执行');
console.log('执行步骤 1: click');

// Element selection debugging / 元素选择调试
console.log('未找到任何元素，尝试的选择器:', selectors.join(', '));
```

### Common Issues / 常见问题

#### 1. Site Handler Not Found / 站点处理器未找到

**Symptoms / 症状：**
```
❌ 未找到对应的站点处理器
🔍 调试信息 - 域名: yourai.com
```

**Solutions / 解决方案：**
- Check URL matching in configuration / 检查配置中的URL匹配
- Verify `window.getDefaultSites()` is available / 验证 `window.getDefaultSites()` 是否可用
- Ensure `baseConfig.js` is loaded / 确保 `baseConfig.js` 已加载

#### 2. Element Not Found / 元素未找到

**Symptoms / 症状：**
```
未找到任何元素，尝试的选择器: textarea, [contenteditable]
```

**Solutions / 解决方案：**
- Test selectors in browser console / 在浏览器控制台中测试选择器
- Wait for dynamic content with `wait` action / 使用 `wait` 动作等待动态内容
- Use multiple fallback selectors / 使用多个备用选择器

#### 3. Clipboard Permission Error / 剪贴板权限错误

**Symptoms / 症状：**
```
NotAllowedError: Failed to execute 'writeText' on 'Clipboard'
```

**Solutions / 解决方案：**
- Use `setValue` instead of clipboard operations / 使用 `setValue` 而不是剪贴板操作
- Request clipboard permissions in manifest / 在清单中请求剪贴板权限
- Implement fallback methods / 实现回退方法

### Testing Workflow / 测试工作流程

1. **Manual Testing / 手动测试**: Test selectors and actions manually in DevTools / 在开发者工具中手动测试选择器和动作
2. **Configuration Testing / 配置测试**: Add configuration and test with extension / 添加配置并使用扩展进行测试
3. **Cross-browser Testing / 跨浏览器测试**: Test on different browsers/versions / 在不同浏览器/版本上测试
4. **Edge Case Testing / 边缘情况测试**: Test with empty inputs, special characters / 使用空输入、特殊字符进行测试

## Best Practices / 最佳实践

### Selector Strategy / 选择器策略

1. **Use Stable Selectors / 使用稳定的选择器**: Prefer semantic selectors over generated classes / 优先使用语义选择器而不是生成的类名
   ```json
   // Good / 好的做法
   "selector": "textarea[placeholder='Ask me anything']"
   
   // Avoid / 避免
   "selector": ".css-1234567"
   ```

2. **Fallback Selectors / 备用选择器**: Provide multiple options / 提供多个选项
   ```json
   "selector": ["textarea", "[contenteditable]", "[role='textbox']"]
   ```

3. **Specific Over Generic / 具体胜过通用**: Use specific selectors when possible / 尽可能使用具体的选择器
   ```json
   // Good / 好的做法
   "selector": "textarea.chat-input"
   
   // Less reliable / 可靠性较低
   "selector": "textarea"
   ```

### Error Handling / 错误处理

1. **Graceful Degradation / 优雅降级**: Use `required: false` for optional steps / 为可选步骤使用 `required: false`
   ```json
   {
     "action": "click",
     "selector": ".optional-button",
     "required": false,
     "description": "Optional enhancement / 可选增强功能"
   }
   ```

2. **Retry Logic / 重试逻辑**: Use retry for unreliable elements / 对不可靠的元素使用重试
   ```json
   {
     "action": "click",
     "selector": "button.submit",
     "retryOnDisabled": true,
     "maxAttempts": 3
   }
   ```

### Performance Considerations / 性能考虑

1. **Minimize Wait Times / 最小化等待时间**: Use shortest necessary delays / 使用最短的必要延迟
2. **Efficient Selectors / 高效的选择器**: Avoid complex CSS selectors / 避免复杂的CSS选择器
3. **Batch Operations / 批量操作**: Combine related actions when possible / 尽可能合并相关动作

### Site-Specific Patterns / 站点特定模式

#### Rich Text Editors / 富文本编辑器
```json
{
  "action": "setValue",
  "selector": "[contenteditable]",
  "inputType": "contenteditable",
  "description": "Set rich text content / 设置富文本内容"
}
```

#### Dynamic Loading / 动态加载
```json
{
  "action": "wait",
  "duration": 1000,
  "description": "Wait for dynamic content / 等待动态内容"
},
{
  "action": "click",
  "selector": ".dynamic-element",
  "description": "Click after loading / 加载后点击"
}
```

#### Special Frameworks / 特殊框架
```json
{
  "action": "setValue",
  "selector": ".custom-editor",
  "inputType": "special",
  "specialConfig": {
    "type": "lexical-editor",
    "containerSelector": ".editor-container",
    "elementType": "span",
    "attributes": {
      "data-lexical-text": "true"
    }
  }
}
```

## Contributing / 贡献指南

### Code Standards / 代码标准

1. **JSON Formatting / JSON格式**: Use consistent indentation and structure / 使用一致的缩进和结构
2. **Descriptive Names / 描述性命名**: Use clear, descriptive action descriptions / 使用清晰、描述性的动作描述
3. **Error Messages / 错误消息**: Provide helpful error messages / 提供有用的错误消息
4. **Documentation / 文档**: Document complex configurations / 记录复杂的配置

### Testing Requirements / 测试要求

Before submitting / 提交前：

1. Test configuration manually / 手动测试配置
2. Verify error handling / 验证错误处理
3. Check cross-browser compatibility / 检查跨浏览器兼容性
4. Validate JSON syntax / 验证JSON语法

### Pull Request Process / 拉取请求流程

1. Fork the repository / 分叉仓库
2. Create feature branch: `git checkout -b add-yourai-support` / 创建功能分支
3. Add site configuration / 添加站点配置
4. Test thoroughly / 彻底测试
5. Submit pull request with / 提交拉取请求，包含：
   - Clear description / 清晰的描述
   - Testing evidence / 测试证据
   - Screenshots/videos if applicable / 如适用，提供截图/视频

### Site Configuration Template / 站点配置模板

Use this template for new sites / 为新站点使用此模板：

```json
{
  "name": "YourAI",
  "url": "https://yourai.com/",
  "enabled": true,
  "supportUrlQuery": false,
  "region": "Global",
  "hidden": false,
  "supportIframe": true,
  "note": "Production ready / 生产就绪",
  "searchHandler": {
    "steps": [
      {
        "action": "click",
        "selector": ".input-area",
        "description": "Focus input area / 聚焦输入区域"
      },
      {
        "action": "setValue",
        "selector": "textarea",
        "description": "Enter user query / 输入用户查询"
      },
      {
        "action": "wait",
        "duration": 100,
        "description": "Brief pause / 短暂暂停"
      },
      {
        "action": "sendKeys",
        "selector": "textarea",
        "keys": "Enter",
        "description": "Submit query / 提交查询"
      }
    ]
  },
  "fileUploadHandler": {
    "steps": [
      {
        "action": "paste",
        "description": "Paste file content / 粘贴文件内容"
      }
    ]
  }
}
```

## Support / 支持

- **Issues / 问题报告**: Report bugs on GitHub Issues / 在GitHub Issues上报告错误
- **Discussions / 讨论**: Join community discussions / 加入社区讨论
- **Documentation / 文档**: This guide and inline code comments / 本指南和内联代码注释

Happy coding! / 编程愉快！🚀
