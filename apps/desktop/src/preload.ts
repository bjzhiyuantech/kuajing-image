import { contextBridge, ipcRenderer } from "electron";

type DesktopAction = "install" | "start" | "stop" | "status" | "logs" | "smoke";
type Listener<T> = (payload: T) => void;

contextBridge.exposeInMainWorld("desktop", {
  getSnapshot: () => ipcRenderer.invoke("desktop:getSnapshot"),
  openConfigFile: () => ipcRenderer.invoke("desktop:openConfigFile"),
  openService: () => ipcRenderer.invoke("desktop:openService"),
  openServiceDir: () => ipcRenderer.invoke("desktop:openServiceDir"),
  runAction: (action: DesktopAction) => ipcRenderer.invoke("desktop:runAction", action),
  onLog: (callback: Listener<{ stream: "stdout" | "stderr" | "system"; text: string }>) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { stream: "stdout" | "stderr" | "system"; text: string }) => callback(payload);
    ipcRenderer.on("desktop:log", listener);
    return () => ipcRenderer.removeListener("desktop:log", listener);
  },
  onSnapshot: (callback: Listener<unknown>) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("desktop:snapshot", listener);
    return () => ipcRenderer.removeListener("desktop:snapshot", listener);
  }
});
