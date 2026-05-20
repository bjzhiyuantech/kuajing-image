const elements = {
  dockerDot: document.querySelector("#docker-dot"),
  dockerStatus: document.querySelector("#docker-status"),
  dockerDetail: document.querySelector("#docker-detail"),
  standaloneDot: document.querySelector("#standalone-dot"),
  standaloneStatus: document.querySelector("#standalone-status"),
  busyDot: document.querySelector("#busy-dot"),
  busyStatus: document.querySelector("#busy-status"),
  serviceDir: document.querySelector("#service-dir"),
  serviceUrl: document.querySelector("#service-url"),
  logOutput: document.querySelector("#log-output"),
  actionButtons: [...document.querySelectorAll("[data-action]")]
};

let logText = "桌面控制台已就绪。\n";

function setDot(node, state) {
  node.classList.remove("ok", "warn", "error", "pending");
  node.classList.add(state);
}

function appendLog(stream, text) {
  const prefix = stream === "stderr" ? "[err] " : stream === "system" ? "" : "";
  logText += `${prefix}${text}`;
  const lines = logText.split(/\r?\n/);
  if (lines.length > 1200) {
    logText = lines.slice(-1200).join("\n");
  }
  elements.logOutput.textContent = logText.trimEnd();
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function setBusy(isBusy) {
  elements.actionButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function renderSnapshot(snapshot) {
  const docker = snapshot.docker;
  if (docker.cliAvailable && docker.engineAvailable) {
    setDot(elements.dockerDot, "ok");
    elements.dockerStatus.textContent = "可用";
    elements.dockerDetail.textContent = docker.engineVersion ? `Engine ${docker.engineVersion}` : docker.version;
  } else if (docker.cliAvailable) {
    setDot(elements.dockerDot, "warn");
    elements.dockerStatus.textContent = "Docker 未启动";
    elements.dockerDetail.textContent = docker.error || docker.version;
  } else {
    setDot(elements.dockerDot, "error");
    elements.dockerStatus.textContent = "未安装 Docker";
    elements.dockerDetail.textContent = docker.error || "请安装 Docker Desktop";
  }

  if (snapshot.standalone.bundled && snapshot.standalone.installed) {
    setDot(elements.standaloneDot, "ok");
    elements.standaloneStatus.textContent = "已就绪";
  } else if (snapshot.standalone.bundled) {
    setDot(elements.standaloneDot, "warn");
    elements.standaloneStatus.textContent = "待初始化";
  } else {
    setDot(elements.standaloneDot, "error");
    elements.standaloneStatus.textContent = "资源缺失";
  }

  setDot(elements.busyDot, snapshot.busy ? "warn" : "ok");
  elements.busyStatus.textContent = snapshot.busy ? "运行中" : "空闲";
  elements.serviceDir.textContent = snapshot.serviceDir;
  elements.serviceUrl.textContent = snapshot.serviceUrl;
  setBusy(snapshot.busy);
}

async function refreshSnapshot() {
  const snapshot = await window.desktop.getSnapshot();
  renderSnapshot(snapshot);
}

async function runAction(action) {
  setBusy(true);
  appendLog("system", `\n开始执行：${action}\n`);
  try {
    const result = await window.desktop.runAction(action);
    appendLog(result.ok ? "system" : "stderr", result.ok ? `完成：${action}\n` : `失败：${action}\n`);
  } catch (error) {
    appendLog("stderr", `${error?.message || String(error)}\n`);
  } finally {
    await refreshSnapshot();
  }
}

window.desktop.onLog(({ stream, text }) => appendLog(stream, text));
window.desktop.onSnapshot((snapshot) => renderSnapshot(snapshot));

document.querySelector("#clear-log").addEventListener("click", () => {
  logText = "";
  elements.logOutput.textContent = "";
});

document.querySelector("#open-service").addEventListener("click", () => {
  void window.desktop.openService();
});

document.querySelector("#open-dir").addEventListener("click", () => {
  void window.desktop.openServiceDir();
});

document.querySelector("#open-config").addEventListener("click", () => {
  void window.desktop.openConfigFile();
});

elements.actionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    void runAction(button.dataset.action);
  });
});

void refreshSnapshot();
setInterval(() => {
  void refreshSnapshot();
}, 15000);
