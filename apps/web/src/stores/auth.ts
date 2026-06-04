import { defineStore } from "pinia";
import { ref } from "vue";
import { api, getToken, setToken } from "@/api/client";

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const workspaceId = ref<string | null>(null);
  const token = ref<string | null>(getToken());

  async function login(email: string, password: string): Promise<void> {
    const res = await api<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    token.value = res.token;
    user.value = res.user;
    await fetchMe();
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    const res = await api<{ token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    setToken(res.token);
    token.value = res.token;
    user.value = res.user;
    await fetchMe();
  }

  async function fetchMe(): Promise<void> {
    const res = await api<{ user: AuthUser | null; workspaceId: string }>("/auth/me");
    user.value = res.user;
    workspaceId.value = res.workspaceId;
  }

  function logout(): void {
    setToken(null);
    token.value = null;
    user.value = null;
    workspaceId.value = null;
  }

  return { user, workspaceId, token, login, register, fetchMe, logout };
});
