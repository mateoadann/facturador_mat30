export default {
  PAGE_LOGIN: "Authentication", // <-- poné el nombre exacto

  // Lista de claves que usás en appsmith.store (sumá las tuyas si tenés más)
  _storeKeys: ["access_token", "refresh_token", "token_exp_at", "user", "client_secret"],

  async _clearStore() {
    // Limpia memoria VOLÁTIL
    for (const k of this._storeKeys) {
      await storeValue(k, null);
    }
    // Si alguna vez persististe claves (storeValue(key, value, true)), forzá su limpieza también:
    for (const k of this._storeKeys) {
      await storeValue(k, null, true);
    }
    // Si tu versión de Appsmith tiene removeValue, lo usamos como extra (no todas la tienen):
    if (typeof removeValue === "function") {
      for (const k of this._storeKeys) {
        try { await removeValue(k); } catch (_) {}
      }
    }
  },

  _resetUI() {
    // Reseteá widgets sensibles (ajustá los nombres a tu app)
    try { resetWidget("inp_email") } catch (_) {}
    try { resetWidget("inp_password"); } catch (_) {}
    // Si usás un Form de Appsmith:
    try { resetWidget("FormLogin", true); } catch (_) {}
    // Si tenés tablas/filtros que quieras limpiar, agregalos acá
    // try { resetWidget("TableUsuarios", true); } catch (_) {}
  },

  async logout(force = false) {
    try {
      // 1) Intenta cerrar sesión en Keycloak (revocar refresh)
      if (!force && appsmith.store.refresh_token) {
        await Q_logout.run(); // POST /logout con refresh_token (y client_secret si aplica)
      }
    } catch (e) {
      console.log("Q_logout error:", e);
      // seguimos igual: el logout local se hará de todas formas
    } finally {
      // 2) Limpia storage (memoria y persistente)
      await this._clearStore();

      // 3) Resetea UI (inputs, forms)
      this._resetUI();

      // 4) Redirige al login (rompemos back-stack con SAME_WINDOW)
      navigateTo(this.PAGE_LOGIN, {}, "SAME_WINDOW");
    }
  },
	isTokenValid() {
    const at   = appsmith.store.access_token;
    const exp  = Number(appsmith.store.token_exp_at || 0);
    const now  = Date.now();
    return Boolean(at && now < exp);
  },

  // Útil cuando querés usarlo directamente en Visible y forzar redirect
  requireSessionForVisible(loginPage = "Authentication") {
    const onLogin = appsmith?.URL?.pathname?.toLowerCase?.().includes(loginPage.toLowerCase());
    const ok = this.isTokenValid();
    if (!ok && !onLogin) navigateTo(loginPage, {}, "SAME_WINDOW");
    return ok; // Visible=true solo si hay sesión válida
  }
}