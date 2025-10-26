import { useState, useEffect, useRef } from "react";
import { ActionPanel, Action, Detail, showToast, Toast, open, Color, Icon, Keyboard, getPreferenceValues } from "@raycast/api";
import { spawn, ChildProcessWithoutNullStreams, exec } from "child_process";
import { homedir } from "os";
import net from "net";

// ... (Interfaces: Preferences, ServerStatus, Model, etc. remain the same) ...
interface Preferences {
  webuiHost: string;
  webuiPort: string;
  ollamaApiHost: string;
  ollamaApiPort: string;
}
type ServerStatus = "Unknown" | "Starting" | "Running" | "Stopped";
interface Model { name: string; modified_at: string; size: number; }
interface ModelsApiResponse { models: Model[]; }
interface WebUIConfigResponse { version?: string; }
interface GitHubReleaseResponse { tag_name?: string; html_url?: string; }


export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const webuiHost = preferences.webuiHost;
  const webuiPort = parseInt(preferences.webuiPort, 10) || 8082;
  const webuiUrl = `http://${webuiHost}:${webuiPort}`;
  const ollamaApiHost = preferences.ollamaApiHost;
  const ollamaApiPort = parseInt(preferences.ollamaApiPort, 10) || 11434;
  const ollamaApiUrl = `http://${ollamaApiHost}:${ollamaApiPort}`;

  // --- States and Refs ---
  const [serverProcess, setServerProcess] = useState<ChildProcessWithoutNullStreams | null>(null);
  const [status, setStatus] = useState<ServerStatus>("Unknown");
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const statusRef = useRef(status);

  // Version states remain the same
  const [localVersion, setLocalVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean | null>(null);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);


  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // --- Effect 1: Poller ---
  // [ ... Effect 1 (Poller) remains the same ... ]
  useEffect(() => {
    const checkServerStatus = () => {
      const socket = new net.Socket(); socket.setTimeout(1000);
      socket
        .connect(webuiPort, webuiHost, () => { setStatus("Running"); socket.destroy(); })
        .on("error", () => {
          const currentState = statusRef.current;
          if (currentState === "Running" || currentState === "Starting") { setStatus("Stopped"); }
          else if (currentState === "Unknown") { setStatus("Stopped"); }
          socket.destroy();
        })
        .on("timeout", () => {
          const currentState = statusRef.current;
          if (currentState === "Running" || currentState === "Starting") { setStatus("Stopped"); }
          else if (currentState === "Unknown") { setStatus("Stopped"); }
          socket.destroy();
        });
    };
    checkServerStatus(); const interval = setInterval(checkServerStatus, 5000);
    return () => { clearInterval(interval); };
  }, [webuiHost, webuiPort]);

  // --- Effect 2: Load Models ---
  // [ ... Effect 2 (Load Models) remains the same ... ]
   useEffect(() => {
    const controller = new AbortController();
    async function fetchModels() {
      setIsLoadingModels(true);
      try {
        const response = await fetch(`${ollamaApiUrl}/api/tags`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = (await response.json()) as ModelsApiResponse;
        setModels(data.models || []);
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Failed to fetch models:", error.message);
          showToast({
             style: Toast.Style.Failure, title: "Failed to fetch models",
             message: `Is Ollama server running on ${ollamaApiUrl}?`,
           });
          setModels([]);
        }
      } finally { setIsLoadingModels(false); }
    }
    if (status === "Running") { fetchModels(); } else { setModels([]); }
    return () => { controller.abort(); };
  }, [status, ollamaApiUrl]);

  // --- Effect 3: Load Versions ---
  // [ ... Effect 3 (Load Versions) remains the same ... ]
  useEffect(() => {
    const versionController = new AbortController();
    async function fetchVersions() {
      setIsLoadingVersion(true); setUpdateAvailable(null);
      let currentVersion: string | null = null; let latestTag: string | null = null;
      try { // Fetch latest from GitHub
        const githubResponse = await fetch("https://api.github.com/repos/open-webui/open-webui/releases/latest", {
          signal: versionController.signal, headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (githubResponse.ok) {
          const githubData = await githubResponse.json() as GitHubReleaseResponse;
          if (githubData.tag_name) { latestTag = githubData.tag_name; setLatestVersion(latestTag); }
        } else { console.warn(`Failed to fetch latest release: ${githubResponse.status}`); setLatestVersion(null); }
      } catch (githubError: any) {
         if (githubError.name !== 'AbortError') {
           console.error("Error fetching latest version:", githubError.message);
           showToast({ style: Toast.Style.Failure, title: "Could not check for updates", message: githubError.message });
           setLatestVersion(null);
         }
      }
      if (status === "Running") { // Fetch local only if running
        try {
          const localResponse = await fetch(`${webuiUrl}/api/config`, {
             signal: versionController.signal, headers: { Accept: 'application/json' },
           });
          if (localResponse.ok) {
            const localData = await localResponse.json() as WebUIConfigResponse;
            if (localData.version) { currentVersion = localData.version; setLocalVersion(currentVersion); }
            else { console.warn("Local /api/config response did not contain 'version' field."); setLocalVersion("N/A"); }
          } else { console.warn(`Failed to fetch local config: ${localResponse.status}`); setLocalVersion("N/A"); }
        } catch (localError: any) {
           if (localError.name !== 'AbortError') { console.error("Error fetching local version:", localError.message); setLocalVersion("N/A"); }
        }
      } else { setLocalVersion(null); } // Clear local version if not running
      if (currentVersion && currentVersion !== "N/A" && latestTag) { // Compare
        const local = currentVersion.replace(/^v/, ''); const latest = latestTag.replace(/^v/, '');
        setUpdateAvailable(local !== latest);
      } else { setUpdateAvailable(null); }
      setIsLoadingVersion(false);
    }
    fetchVersions();
    return () => { versionController.abort(); };
  }, [status, webuiUrl]);

  // --- Functions (startServer, killProcessByPid, stopServer, openServer) ---
  // [ ... Functions remain the same ... ]
  const startServer = () => {
    if (serverProcess || status === "Starting" || status === "Running") { showToast({ style: Toast.Style.Failure, title: "Server already running or starting" }); return; }
    setStatus("Starting"); showToast({ style: Toast.Style.Animated, title: "Starting server..." });
    const proc = spawn("open-webui", ["serve", "--port", "8082"], { cwd: homedir(), env: { ...process.env, PYTHONIOENCODING: "utf-8" }, });
    proc.stdout.on("data", (data) => console.log(`stdout: ${data}`));
    proc.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
      if (statusRef.current === "Starting") { setStatus("Stopped"); showToast({ style: Toast.Style.Failure, title: "Failed to start server", message: data.toString() }); }
    });
    setServerProcess(proc);
  };
  const killProcessByPid = (pid: string) => { /* ... remains the same ... */ showToast({ style: Toast.Style.Animated, title: `Stopping server (PID: ${pid})...` }); const kill = spawn("taskkill", ["/PID", pid, "/F", "/T"]); let stderrData = ""; kill.stderr.on("data", (data) => (stderrData += data.toString())); kill.on("close", (code) => { if (code === 0) { showToast({ style: Toast.Style.Success, title: "Server stopped" }); } else { showToast({ style: Toast.Style.Failure, title: "Failed to stop server", message: stderrData.trim() }); } setStatus("Stopped"); setServerProcess(null); }); };
  const stopServer = () => { /* ... remains the same ... */ if (status !== "Running" && status !== "Starting") { showToast({ style: Toast.Style.Failure, title: "Server is not running" }); return; } if (serverProcess && serverProcess.pid) { killProcessByPid(serverProcess.pid.toString()); } else { showToast({ style: Toast.Style.Animated, title: `Finding server PID on port ${webuiPort}...` }); exec(`netstat -ano -p TCP | findstr :${webuiPort}`, (error, stdout, stderr) => { if (error) { showToast({ style: Toast.Style.Failure, title: "Could not find server process", message: stderr || error.message }); setStatus("Stopped"); return; } const lines = stdout.trim().split("\n"); const listeningLine = lines.find(line => line.includes("LISTENING")); if (!listeningLine) { showToast({ style: Toast.Style.Failure, title: `No process found listening on port ${webuiPort}` }); setStatus("Stopped"); return; } const parts = listeningLine.trim().split(/\s+/); const pid = parts[parts.length - 1]; if (pid && /^\d+$/.test(pid) && pid !== "0") { killProcessByPid(pid); } else { showToast({ style: Toast.Style.Failure, title: `Could not parse PID for port ${webuiPort}`, message: `Output: ${stdout}` }); } }); } };
  useEffect(() => { /* ... remains the same ... */ if (serverProcess) { const onClose = (code: number | null) => { setStatus("Stopped"); setServerProcess(null); showToast({ style: Toast.Style.Success, title: `Server stopped (code ${code})` }); }; serverProcess.once("close", onClose); return () => { serverProcess.off("close", onClose); if (serverProcess.pid) { spawn("taskkill", ["/PID", serverProcess.pid.toString(), "/F", "/T"]); } }; } }, [serverProcess]);
  const openServer = () => { /* ... remains the same ... */ if (status !== "Running") { showToast({ style: Toast.Style.Failure, title: "Server is not running" }); return; } open(webuiUrl); };


  // --- Helper Function for Metadata Status Tag ---
  const getStatusTag = () => {
    switch (status) {
      case "Running": return { text: "Running", color: Color.Green };
      case "Starting": return { text: "Starting...", color: Color.Yellow };
      case "Stopped": return { text: "Stopped", color: Color.Red };
      case "Unknown": default: return { text: "Unknown", color: Color.SecondaryText };
    }
  };


  // --- The Return (Rendering) ---
  return (
    <Detail
      // *** ALTERADO: Markdown agora inclui latest version e update status ***
      markdown={`
# Open WebUI Server

Control your local Open WebUI server using the actions below.

**Latest Version:** ${isLoadingVersion ? "Checking..." : latestVersion ?? "N/A"}

[Source Code](https://github.com/open-webui/open-webui/tree/main)
      `}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Server Status">
            <Detail.Metadata.TagList.Item text={getStatusTag().text} color={getStatusTag().color} />
          </Detail.Metadata.TagList>

          <Detail.Metadata.Link
            title="Host"
            text={webuiUrl}
            target={webuiUrl}
          />

          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Local Version"
            text={status === "Running" ? (localVersion ?? (isLoadingVersion ? "Checking..." : "N/A")) : "N/A"}
            icon={isLoadingVersion ? Icon.CircleProgress : Icon.Info}
          />

          <Detail.Metadata.Separator />

          <Detail.Metadata.Label title="Models Available" icon={isLoadingModels ? Icon.CircleProgress : null} />

          {!isLoadingModels && status === "Running" && models.length === 0 && (
            <Detail.Metadata.Label title="No models found" text={`Is Ollama running on ${ollamaApiUrl}?`} />
          )}

          {status !== "Running" && !isLoadingModels && <Detail.Metadata.Label title="Not Currently Running" />}

          {!isLoadingModels &&
            models.map((model) => (
              <Detail.Metadata.Label
                key={model.name}
                title={model.name}
                text={`${(model.size / 1_000_000_000).toFixed(2)} GB`}
              />
            ))}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
           {/* Actions remain the same */}
          <ActionPanel.Section title="Control Panel">
            {(status === "Stopped" || status === "Unknown") && (
              <Action title="Start Server" onAction={startServer} icon={Icon.Play} />
            )}
            {(status === "Running" || status === "Starting") && (
              <Action title="Stop Server" onAction={stopServer} icon={Icon.Stop} />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section title="Utilities">
            <Action
              title="Open Server"
              onAction={openServer}
              icon={Icon.Network}
              shortcut={Keyboard.Shortcut.Common.Open}
            />
            <Action.CopyToClipboard
              title="Copy Address to Clipboard"
              content={webuiUrl}
              icon={Icon.Clipboard}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          {updateAvailable === true && latestVersion && (
             <Action.OpenInBrowser
               title={`Open Release Page (${latestVersion})`}
               url={`https://github.com/open-webui/open-webui/releases/tag/${latestVersion}`}
               icon={Icon.Download}
              />
           )}
          </ActionPanel.Section>

        </ActionPanel>
      }
    />
  );
}