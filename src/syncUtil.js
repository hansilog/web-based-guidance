export function listenForRealTimeUpdates(renderCallback) {
  window.addEventListener("storage", (e) => {
    // Only trigger a re-render if the changes happened to the appointments database
    if (e.key === "gh_appointments") {
      console.log(
        " Real-time database mutation detected! Syncing UI layouts...",
      );

      renderCallback();
    }
  });
}
