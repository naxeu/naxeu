import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { getToken } from "@/api/client";

const routes: RouteRecordRaw[] = [
  { path: "/login", name: "login", component: () => import("@/views/LoginView.vue"), meta: { public: true } },
  { path: "/register", name: "register", component: () => import("@/views/RegisterView.vue"), meta: { public: true } },
  {
    path: "/",
    component: () => import("@/layouts/MainLayout.vue"),
    children: [
      { path: "", name: "dashboard", component: () => import("@/views/DashboardView.vue") },
      { path: "transactions", name: "transactions", component: () => import("@/views/TransactionsView.vue") },
      { path: "transactions/add", name: "add-transaction", component: () => import("@/views/AddTransactionView.vue") },
      { path: "transactions/:id", name: "transaction-detail", component: () => import("@/views/TransactionDetailView.vue") },
      { path: "categories", name: "categories", component: () => import("@/views/CategoriesView.vue") },
      { path: "budgets", name: "budgets", component: () => import("@/views/BudgetsView.vue") },
      { path: "messages", name: "messages", component: () => import("@/views/MessagesView.vue") },
      { path: "automations", name: "automations", component: () => import("@/views/AutomationRulesView.vue") },
      { path: "import", name: "import", component: () => import("@/views/ImportView.vue") },
      { path: "attachments", name: "attachments", component: () => import("@/views/AttachmentListView.vue") },
      {
        path: "attachments/:id",
        name: "attachment-detail",
        component: () => import("@/views/AttachmentDetailView.vue"),
      },
      { path: "settings", name: "settings", component: () => import("@/views/SettingsView.vue") },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) {
    return { name: "login" };
  }
  if (to.meta.public && getToken()) {
    return { name: "dashboard" };
  }
  return true;
});
