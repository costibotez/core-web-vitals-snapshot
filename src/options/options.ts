import type { Settings } from "../shared/types";

const badgeToggle = document.getElementById("badge-toggle") as HTMLInputElement;
const clearBtn = document.getElementById("clear-history") as HTMLButtonElement;
const statusEl = document.getElementById("status")!;

async function load(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "get-settings" })) as Settings;
  badgeToggle.checked = settings.badgeEnabled;
}

badgeToggle.addEventListener("change", async () => {
  const settings: Settings = { badgeEnabled: badgeToggle.checked };
  await chrome.runtime.sendMessage({ type: "set-settings", settings });
  flash("Saved.");
});

clearBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clear-history" });
  flash("History cleared.");
});

let timer: ReturnType<typeof setTimeout> | undefined;
function flash(message: string): void {
  statusEl.textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => (statusEl.textContent = ""), 2000);
}

load();
