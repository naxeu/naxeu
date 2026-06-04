import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";

// Theme colours mirror config/branding.yml (kept in sync via the branding API
// for live values; these are sensible defaults used before branding loads).
export const vuetify = createVuetify({
  theme: {
    defaultTheme: "naxeu",
    themes: {
      naxeu: {
        dark: false,
        colors: {
          primary: "#1976D2",
          secondary: "#FFC107",
          accent: "#FFC107",
          error: "#D32F2F",
          warning: "#F57C00",
          info: "#1976D2",
          success: "#388E3C",
        },
      },
    },
  },
});
