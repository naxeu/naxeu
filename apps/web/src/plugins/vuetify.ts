import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";

/**
 * Theme + defaults follow material/design.md (Naxeu palette, Inter via CSS).
 * Branding API colours in config/branding.yml should stay in sync for /settings preview.
 */
export const vuetify = createVuetify({
  defaults: {
    global: {
      ripple: true,
    },
    VBtn: {
      rounded: "pill",
    },
    VCard: {
      rounded: "xl",
      elevation: 0,
      variant: "outlined",
    },
    VChip: {
      rounded: "pill",
    },
    VTextField: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VTextarea: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VSelect: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VAutocomplete: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VCombobox: {
      variant: "outlined",
      density: "comfortable",
      color: "primary",
    },
    VCheckbox: {
      color: "primary",
    },
    VSwitch: {
      color: "primary",
    },
  },
  theme: {
    defaultTheme: "naxeu",
    themes: {
      naxeu: {
        dark: false,
        colors: {
          background: "#F7F8F4",
          surface: "#FFFFFF",
          primary: "#102A1C",
          secondary: "#B8F36B",
          accent: "#B8F36B",
          error: "#C2413B",
          warning: "#B7791F",
          success: "#1F8A4C",
          info: "#2563A8",
          "on-background": "#102015",
          "on-surface": "#102015",
          outline: "#c5d0c0",
        },
      },
      /** Used when `branding.yml` → `theme.darkModeDefault: true`. */
      naxeuDark: {
        dark: true,
        colors: {
          background: "#0f1713",
          surface: "#152620",
          "surface-variant": "#1e3328",
          "surface-bright": "#1a2f24",
          primary: "#B8F36B",
          secondary: "#8fcd54",
          accent: "#ddf9bd",
          error: "#f48771",
          warning: "#ffb547",
          success: "#5fd18a",
          info: "#7eb8ff",
          outline: "#2f4a3a",
          "on-background": "#e8ebe6",
          "on-surface": "#e8ebe6",
          "on-primary": "#102015",
          "on-secondary": "#102015",
        },
      },
    },
  },
});
