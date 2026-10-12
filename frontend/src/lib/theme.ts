export type Theme = "dark" | "light";

export const THEME_KEY = "booom-theme";
export const THEME_COLOR: Record<Theme, string> = { dark: "#040a1e", light: "#f3f6fc" };

/**
 * Runs in <head> before the page paints, so a saved light choice never flashes dark first.
 * Dark is the default; anything unexpected in storage also means dark.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"){document.documentElement.dataset.theme="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLOR.light}")}}catch(e){}})();`;
