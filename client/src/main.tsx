import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="ghvac-ui-theme">
    <App />
  </ThemeProvider>
);

// Register the service worker (offline work-orders cache + static fallback).
// Updates apply silently: the SW skipWaitings itself, the shell is served
// no-store, so the next launch is simply fresh. No prompts — the old
// confirm() here was a BLOCKING native dialog inside the app's webview.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
  });
}
