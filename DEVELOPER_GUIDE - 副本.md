# AICompare 开发者指南

## 1. 项目概述

AICompare 是一个浏览器扩展程序，其核心目标是提供一个统一的界面，让用户可以同时与多个大型语言模型（LLM）进行交互并比较它们的回答。它通过在一个单独的扩展页面中嵌入多个AI聊天网站（如ChatGPT, Gemini, Claude等）的`<iframe>`来实现这一功能。用户只需在一个公共输入框中提交问题，该问题就会被自动分发到所有加载的AI网站上。

## 2. 核心概念与架构

本项目的架构基于“**主控面板 + Iframe容器 + 脚本注入**”的核心思想。

-   **主控面板 (Master Control Panel)**: `iframe/iframe.html` 是用户与之交互的主要界面。它本身不处理AI逻辑，而是作为一个协调器和容器存在。
-   **Iframe 容器 (Iframe Containers)**: 主界面会动态加载多个`<iframe>`，每个`<iframe>`都承载一个独立的AI网站。这使得所有AI网站可以并行运行，并保持各自的会话（session）和状态。
-   **脚本注入 (Script Injection)**: 这是实现自动化的关键。当用户在主控面板提交问题时，扩展会使用 `chrome.scripting.executeScript` API 将一小段JavaScript代码注入到每个`<iframe>`中。这段代码会模拟用户操作——找到输入框、填入问题、然后点击发送按钮。

### 架构流程图

```
[用户] -> [主界面 (iframe.html)] -> [iframe.js]
             |                             | (遍历所有iframe)
             |                             +--> [注入脚本到 iframe 1 (e.g., ChatGPT)] -> 模拟输入与点击
             |                             +--> [注入脚本到 iframe 2 (e.g., Gemini)]  -> 模拟输入与点击
             |                             +--> [注入脚本到 iframe 3 (e.g., Claude)]  -> 模拟输入与点击
             |
             +<- [内容脚本 (selection.js)] <- [在任意网页上选中文本]
```

## 3. 目录与文件结构详解

以下是项目主要文件和目录的详细功能说明：

-   **`manifest.json`**: 扩展的灵魂。
    -   **作用**: 定义扩展名称、版本、图标、权限，并注册背景脚本、内容脚本和UI页面。
    -   **关键属性**:
        -   `permissions`: 声明如 `storage` (存储设置), `scripting` (核心！用于注入脚本), `contextMenus` (右键菜单) 等。
        -   `host_permissions`: 定义了扩展可以注入脚本的网站域名，例如 `"https://*.openai.com/*", "https://gemini.google.com/*"`。
        -   `background`: 注册 `background.js` 作为Service Worker。
        -   `content_scripts`: 注册需要在特定网页上运行的脚本。
        -   `action` / `side_panel`: 定义用户点击工具栏图标时打开的页面，通常指向 `iframe/iframe.html`。

-   **`background.js`**: 背景服务脚本。
    -   **作用**: 主要用于处理不能由其他脚本完成的长期任务或事件监听。例如，创建右键菜单 (`chrome.contextMenus.create`)，并在点击时将消息发送给主界面或内容脚本。它的角色在此项目中相对辅助。

-   **`config/`**: 配置中心，**是扩展灵活性的核心**。
    -   `siteHandlers.json` / `rules.json`: **最关键的配置文件**。它定义了所有支持的AI网站及其自动化规则。
        -   **结构**: 这是一个JSON数组，每个对象代表一个AI网站，包含自动化所需的CSS选择器。
        -   **示例**:
            ```json
            {
              "chatgpt": {
                "name": "ChatGPT",
                "url": "https://chat.openai.com/",
                "input_selector": "textarea#prompt-textarea",
                "send_button_selector": "button[data-testid='send-button']",
                "response_selector": ".markdown" 
              }
            }
            ```
    -   `appConfig.json`: 存储应用的全局配置，如默认主题、语言等。
    -   `siteDetector.js`: 一个辅助脚本，可能用于根据URL或其他页面特征检测当前激活的标签页是哪个AI网站。

-   **`iframe/`**: 主UI界面目录。
    -   `iframe.html`: 用户看到和交互的主页面。它包含一个公共的输入区域和用于容纳各个AI网站`<iframe>`的容器。
    -   `iframe.js`: **主界面的核心逻辑**。
        1.  在页面加载时，读取`config/siteHandlers.json`。
        2.  根据配置动态创建`<iframe>`并加载对应的URL。
        3.  监听公共输入框的提交事件。
        4.  调用`chrome.scripting.executeScript`，将问题文本和目标选择器传递给注入脚本。
    -   `inject.js`: 被注入到`<iframe>`内部执行的脚本。它非常轻量，接收参数（如问题文本、选择器），然后在`<iframe>`的上下文中执行`document.querySelector`和`.click()`等DOM操作。
    -   `export-responses.js`: 提供导出对话内容功能的脚本。它可能会利用`response_selector`规则从每个`<iframe>`中提取对话文本并整合成文件。

-   **`content-scripts/`**: 注入到常规网页以增强体验的脚本。
    -   `selection.js` & `selection.css`: 实现“划词”功能。监听用户在网页上的文本选择事件 (`mouseup`)，当用户选择了一段文字后，可能会弹出一个小图标。
    -   `float-button.js` & `float-button.css`: 负责创建和管理这个“划词后”出现的浮动按钮。点击此按钮会将选中的文本发送到主界面`iframe.html`作为新的问题。
    -   `search-engines.js`: 特殊的内容脚本，仅在Google、Bing等搜索引擎的结果页面上运行。它会修改这些页面的DOM，在旁边添加一个AICompare的面板，让用户可以直接用搜索词向所有AI提问。

-   **`options/`**: 扩展的设置页面。
    -   `options.html` & `options.js`: 提供一个UI界面，允许用户启用/禁用特定的AI网站、切换主题或配置其他`appConfig.json`中的选项。设置会通过`chrome.storage` API进行持久化。

-   **`_locales/`**: 国际化目录，用于支持多语言。

-   **`icons/`**: 存放扩展所需的所有图标，包括工具栏图标、右键菜单图标等。

## 4. 核心工作流程：一次提问到多处执行

1.  **启动**: 用户点击浏览器工具栏图标，`iframe/iframe.html`被加载。
2.  **初始化**: `iframe.js`执行，读取`config/siteHandlers.json`，并为每个启用的AI网站创建一个`<iframe>`。
3.  **用户输入**: 用户在公共输入框中键入问题，例如“请介绍一下量子计算”，然后点击“全部发送”按钮。
4.  **捕获与分发**: `iframe.js`中的事件监听器被触发。它获取问题文本。
5.  **循环与注入**: `iframe.js`遍历所有`<iframe>`。对于ID为`iframe-chatgpt`的`<iframe>`：
    a. 它从配置中找到ChatGPT对应的规则：`input_selector: "textarea#prompt-textarea"` 和 `send_button_selector: "button[data-testid='send-button']"`。
    b. 它调用 `chrome.scripting.executeScript`，目标是这个`<iframe>`，注入的代码大致如下（伪代码）:
       ```javascript
       // Code to be injected into the ChatGPT iframe
       const prompt = "请介绍一下量子计算";
       const input = document.querySelector("textarea#prompt-textarea");
       if (input) {
           input.value = prompt;
           // 触发React等框架的事件系统
           input.dispatchEvent(new Event('input', { bubbles: true })); 
       }
       const sendButton = document.querySelector("button[data-testid='send-button']");
       if (sendButton) {
           sendButton.click();
       }
       ```
6.  **并行执行**: 上述注入过程在所有`<iframe>`中几乎同时发生，导致每个AI网站都接收到问题并开始生成回答。
7.  **结果展示**: 每个`<iframe>`独立显示其收到的结果。用户可以在一个屏幕上滚动查看所有答案。

## 5. 如何添加一个新的AI聊天机器人

这是最常见的开发任务。

1.  **打开目标网站**: 在浏览器中打开你想要添加的新的AI聊天网站。
2.  **寻找CSS选择器**: 使用开发者工具（F12）找到以下两个元素的唯一且稳定的CSS选择器：
    -   **输入框**: 通常是一个`<textarea>`或`<input type="text">`。
    -   **发送按钮**: 通常是一个`<button>`元素。
3.  **编辑配置文件**: 打开 `config/siteHandlers.json` 文件。
4.  **添加新条目**: 在JSON中添加一个新的对象，包含新网站的名称、URL以及你找到的两个CSS选择器。
    ```json
    "new_ai_bot": {
      "name": "NewAI",
      "url": "https://new.ai/chat",
      "input_selector": "#the-new-input-selector",
      "send_button_selector": ".submit-button-class"
    }
    ```
5.  **添加图标 (可选)**: 在 `icons/` 目录中为新网站添加一个图标，并在配置中引用它。
6.  **重新加载扩展**: 在浏览器的扩展管理页面 (`edge://extensions/`) 重新加载AICompare扩展。
7.  **测试**: 打开主界面，新的AI网站应该已经出现在`<iframe>`列表中。尝试发送一个问题，看它是否能被成功提交。如果不行，请返回第二步，寻找更稳定或正确的CSS选择器。

---
## 6. 函数级实现细节 (推断)

本节深入到关键JS文件的内部，推断其可能的函数结构和逻辑。

### **`iframe/iframe.js` - 主界面协调器**

这是项目中最复杂的脚本。

```javascript
// 全局变量
let siteConfigs = {}; // 存储从 aiteHandlers.json 加载的配置
let activeTabs = new Set(); // 存储当前激活的AI Tab

// --- 初始化流程 ---

/**
 * 页面加载时的入口函数
 */
function init() {
    loadConfigurations();
    setupEventListeners();
    createAIWebTabs();
    restoreLastSession(); // 尝试恢复上次的激活tab
}
document.addEventListener('DOMContentLoaded', init);

/**
 * 从config目录加载所有必要的JSON配置
 */
async function loadConfigurations() {
    const response = await fetch('../config/siteHandlers.json');
    siteConfigs = await response.json();
    // 可能还会加载 appConfig.json 等
}

/**
 * 创建所有AI网站的Tab按钮和对应的iframe
 */
function createAIWebTabs() {
    const tabContainer = document.getElementById('ai-tab-container');
    const iframeContainer = document.getElementById('iframe-container');

    for (const siteId in siteConfigs) {
        const config = siteConfigs[siteId];

        // 1. 创建Tab按钮
        const tabButton = document.createElement('button');
        tabButton.textContent = config.name;
        tabButton.dataset.siteId = siteId;
        tabButton.addEventListener('click', () => setActiveTab(siteId));
        tabContainer.appendChild(tabButton);

        // 2. 创建Iframe
        const iframe = document.createElement('iframe');
        iframe.id = `iframe-${siteId}`;
        iframe.src = config.url;
        iframe.style.display = 'none'; // 默认隐藏
        iframeContainer.appendChild(iframe);
    }
}

/**
 * 为主输入框、发送按钮等绑定事件
 */
function setupEventListeners() {
    const mainInput = document.getElementById('main-prompt-input');
    const sendButton = document.getElementById('send-to-all-button');

    sendButton.addEventListener('click', handleSubmit);
    mainInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });

    // 监听来自内容脚本的消息
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}


// --- 核心功能 ---

/**
 * 处理表单提交（点击或回车）
 */
function handleSubmit() {
    const promptText = document.getElementById('main-prompt-input').value;
    if (!promptText.trim()) return;

    broadcastPromptToIframes(promptText);
}

/**
 * 将问题广播到所有激活的iframe
 * @param {string} prompt - 要发送的问题文本
 */
function broadcastPromptToIframes(prompt) {
    const iframes = document.querySelectorAll('#iframe-container iframe');
    iframes.forEach(iframe => {
        // 确保只向当前可见或选中的iframe发送
        if (iframe.style.display !== 'none') {
            const siteId = iframe.id.replace('iframe-', '');
            const config = siteConfigs[siteId];
            
            chrome.scripting.executeScript({
                target: { frameIds: [iframe.frameId] }, // 注意: frameId需要正确获取
                func: injectedFunction, // 注入的函数
                args: [prompt, config.input_selector, config.send_button_selector]
            });
        }
    });
}

/**
 * 处理来自其他脚本（如content-script）的消息
 */
function handleRuntimeMessage(message, sender, sendResponse) {
    if (message.action === 'set_prompt_from_selection') {
        document.getElementById('main-prompt-input').value = message.text;
    }
}

// --- UI辅助函数 ---

/**
 * 设置哪个AI Tab是当前激活的
 * @param {string} siteId - 要激活的网站ID
 */
function setActiveTab(siteId) {
    // 隐藏所有iframe，取消所有tab的激活状态
    document.querySelectorAll('#iframe-container iframe').forEach(f => f.style.display = 'none');
    document.querySelectorAll('#ai-tab-container button').forEach(b => b.classList.remove('active'));

    // 显示目标iframe和激活目标tab
    document.getElementById(`iframe-${siteId}`).style.display = 'block';
    document.querySelector(`button[data-site-id='${siteId}']`).classList.add('active');
    
    activeTabs.add(siteId);
    saveSession();
}

/**
 * 保存当前会话（例如激活的tabs）到chrome.storage
 */
function saveSession() {
    chrome.storage.local.set({ activeTabs: Array.from(activeTabs) });
}

/**
 * 从chrome.storage恢复会话
 */
function restoreLastSession() {
    chrome.storage.local.get('activeTabs', ({ activeTabs: tabs }) => {
        if (tabs && tabs.length > 0) {
            tabs.forEach(siteId => setActiveTab(siteId));
        } else {
            // 如果没有历史记录，默认激活第一个tab
            const firstSiteId = Object.keys(siteConfigs)[0];
            if(firstSiteId) setActiveTab(firstSiteId);
        }
    });
}
```

### **`iframe/inject.js` - 实际执行者**

这个文件本身可能不存在，其内容通常作为函数直接传递给`executeScript`。

```javascript
/**
 * 此函数在目标iframe的上下文中被序列化并执行。
 * @param {string} promptText - 问题文本.
 * @param {string} inputSelector - 目标网站输入框的CSS选择器.
 * @param {string} buttonSelector - 目标网站发送按钮的CSS选择器.
 */
function injectedFunction(promptText, inputSelector, buttonSelector) {
    const inputElement = document.querySelector(inputSelector);
    if (!inputElement) {
        console.error('AICompare: Input element not found with selector:', inputSelector);
        return;
    }

    // 模拟用户输入，以兼容React等前端框架
    inputElement.value = promptText;
    const inputEvent = new Event('input', { bubbles: true });
    inputElement.dispatchEvent(inputEvent);

    // 寻找并点击发送按钮
    const sendButton = document.querySelector(buttonSelector);
    if (sendButton) {
        sendButton.click();
    } else {
        console.error('AICompare: Send button not found with selector:', buttonSelector);
    }
}
```

### **`content-scripts/selection.js` - “划词”功能脚本**

```javascript
let floatButton = null;

/**
 * 当鼠标释放时，检查是否有文本被选中
 */
function handleMouseUp(event) {
    const selectedText = window.getSelection().toString().trim();

    if (selectedText.length > 0) {
        if (!floatButton) {
            floatButton = createFloatButton();
            document.body.appendChild(floatButton);
        }
        // 定位按钮到鼠标位置
        positionButton(event.clientX, event.clientY);
        
        // 更新按钮的事件处理器以包含当前选中的文本
        floatButton.onclick = () => {
            chrome.runtime.sendMessage({
                action: 'set_prompt_from_selection',
                text: selectedText
            });
            hideFloatButton();
        };

    } else {
        hideFloatButton();
    }
}
document.addEventListener('mouseup', handleMouseUp);

/**
 * 创建浮动按钮DOM元素 (具体实现在 float-button.js 中可能更复杂)
 */
function createFloatButton() {
    const button = document.createElement('div');
    button.id = 'aicompare-float-button';
    button.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon16.png')}">`; // 使用扩展内资源
    return button;
}

function positionButton(x, y) {
    // ... 计算并设置 floatButton.style.top/left ...
}

function hideFloatButton() {
    if (floatButton) {
        floatButton.style.display = 'none';
    }
}
```