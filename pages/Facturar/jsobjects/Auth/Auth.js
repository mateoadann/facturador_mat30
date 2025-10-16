export default {
	
	  PAGE_LOGIN: "Authentication",// <-- cambiá por el nombre exacto
	  _now() { return Date.now();},
	  _skewMs: 15000,

					
	isLoggedIn() { return !!appsmith.store.access_token; },

  async logout(force = false) {
    try {
      if (!force && appsmith.store.refresh_token) { await Q_logout.run(); }
    } catch (e) {
      console.log("Q_logout error:", e);
    } finally {
      await storeValue("access_token", null);
      await storeValue("refresh_token", null);
      await storeValue("token_exp_at", null);
      await storeValue("user", null);
      navigateTo(this.PAGE_LOGIN);
    }
  },
	async ensureSession() {
    const at  = appsmith.store.access_token;
    const exp = Number(appsmith.store.token_exp_at || 0);
    const now = this._now();

    // Evitar loop si ya estamos en la página de login
    const onLoginPage = appsmith?.URL?.pathname?.toLowerCase?.().includes(this.PAGE_LOGIN.toLowerCase());

    if (!at || now > exp) {
      try {
        if (at && now > exp) {
          // Intentar refresh solo si había token
          const r = await Q_refresh.run();
          await this._saveTokens(r);
          return;
        }
      } catch (e) {
        console.log("Q_refresh error:", e);
      }
      if (!onLoginPage) navigateTo(this.PAGE_LOGIN);
      return;
    }
  },
	async _saveTokens(res) {
    if (!res || !res.access_token) throw new Error("Login: respuesta sin access_token");
    await storeValue("access_token", res.access_token);
    if (res.refresh_token) await storeValue("refresh_token", res.refresh_token);
    const expAt = this._now() + (Number(res.expires_in || 300) * 1000) - this._skewMs;
    await storeValue("token_exp_at", expAt);
  },
}