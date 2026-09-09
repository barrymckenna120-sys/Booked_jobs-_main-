/**
 * iOS/PWA-safe external open.
 *
 * In an iOS home-screen install `window.open` cannot create a new tab, so iOS
 * hands the URL straight to another app and the user loses any way back.
 * Clicking a temporary anchor with target="_blank" opens an in-app browser
 * sheet (with a Done button) instead, keeping the app context alive.
 */
export const openExternalUrl = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/** Same-app navigation for schemes that must stay in the current context (tel:, mailto:). */
export const openAppUrl = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
};
