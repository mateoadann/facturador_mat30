export default {
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