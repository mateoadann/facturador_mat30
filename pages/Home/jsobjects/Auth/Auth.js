export default {
	  PAGE_LOGIN: "Authentication",   // <-- cambiá por el nombre exacto

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
  }
}