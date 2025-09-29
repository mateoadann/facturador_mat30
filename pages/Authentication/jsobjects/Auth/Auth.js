export default {
  TOKEN_KEY: "auth_token",
  REFRESH_KEY: "refresh_token",
  USER_KEY: "auth_user",

  // 1) Guardar y limpiar estado
  async setSession({ access, refresh, user }) {
    if (access) { await storeValue(this.TOKEN_KEY, access); }
    if (refresh) { await storeValue(this.REFRESH_KEY, refresh); }
    if (user) { await storeValue(this.USER_KEY, user); }
  },

  async clearSession() {
    await storeValue(this.TOKEN_KEY, undefined);
    await storeValue(this.REFRESH_KEY, undefined);
    await storeValue(this.USER_KEY, undefined);
  },

  // 2) Login
  async login() {
    try {
      const res = await auth_login.run();
      const access = res?.access_token;
      const refresh = res?.refresh_token;
      const user = res?.user;

      if (!access) throw new Error("No llegó access_token");
      await this.setSession({ access, refresh, user });

      // Opcional: validar sesión con /me
      try { await this.fetchMe(); } catch (_) {}

      navigateTo("Home");
      showAlert("Sesión iniciada", "success");
    } catch (e) {
      showAlert(`Login falló: ${e.message || e}`, "error");
    }
  },

  // 3) /me para poblar usuario (si hace falta)
  async fetchMe() {
    const me = await auth_me.run();
    if (!me?.user) throw new Error("No llegó user");
    await storeValue(this.USER_KEY, me.user);
    return me.user;
  },

  // 4) Refresh (cuando un query devuelve 401)
  async refresh() {
    const rt = appsmith.store[this.REFRESH_KEY];
    if (!rt) throw new Error("No hay refresh_token");
    const res = await auth_refresh.run();
    const access = res?.access_token;
    const refresh = res?.refresh_token || rt;
    if (!access) throw new Error("No llegó access_token (refresh)");
    await this.setSession({ access, refresh });
    return access;
  },

  // 5) Asegurar sesión (uso en onPageLoad)
  async ensure() {
    const token = appsmith.store[this.TOKEN_KEY];
    if (!token) {
      navigateTo("Login");
      return;
    }
    try {
      await this.fetchMe();
    } catch (e) {
      // Intento de refresh y revalidación
      try {
        await this.refresh();
        await this.fetchMe();
      } catch (e2) {
        await this.clearSession();
        navigateTo("Login");
      }
    }
  },

  // 6) Wrapper para ejecutar queries protegidos con manejo automático de 401
  async runWithAuth(queryFn, args = {}) {
    try {
      return await queryFn.run(args);
    } catch (e) {
      // Si el backend devuelve status, muchos conectores lo exponen en e
      const message = (e && e.message) || "";
      const is401 = message.includes("401") || message.includes("Unauthorized");
      if (!is401) throw e;

      // intentar refresh y reintentar una única vez
      await this.refresh();
      return await queryFn.run(args);
    }
  },

  // 7) Logout
  async logout() {
    try { await auth_logout.run(); } catch (_) {}
    await this.clearSession();
    navigateTo("Login");
  }
};