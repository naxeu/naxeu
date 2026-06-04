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
        },
      },
    },
  },
});
