export default {
  // === Config ===
  PAGE_HOME: "Home",     // <-- cambiá por el nombre exacto
  PAGE_LOGIN: "Authentication",   // <-- cambiá por el nombre exacto
  _skewMs: 15000,	

  // === Utils ===
  _now() { return Date.now(); },
  _status(e) { return e?.responseMeta?.statusCode ?? e?.statusCode ?? e?.status ?? null; },
  _msg(e) {
    // Keycloak suele enviar error JSON en e.data
    const data = e?.data || e?.responseData || {};
    const err = (data.error || "").toLowerCase();
    const desc = data.error_description || data.errorMessage || e?.message || "";
    return { err, desc, raw: data };
  },
  _kcMessage(e) {
    const s = this._status(e);
    const { err, desc } = this._msg(e);

    // Normalizamos descripciones típicas
    const d = desc?.toLowerCase() || "";

    if (err === "invalid_client") return "Cliente inválido o credenciales del cliente incorrectas (client_id/client_secret).";
    if (err === "unauthorized_client") return "El cliente no está autorizado para este flujo (habilitá Direct Access Grants).";
    if (err === "invalid_grant") {
      if (d.includes("account is not fully set up")) return "La cuenta tiene acciones requeridas pendientes (password temporal, verify email, TOTP, profile).";
      if (d.includes("invalid user credentials")) return "Usuario o contraseña inválidos.";
      if (d.includes("disabled")) return "El usuario está deshabilitado o bloqueado.";
      return "Grant inválido (revisá usuario/contraseña y estado del usuario).";
    }
    if (err === "invalid_scope") return "Scope inválido. Agregá 'openid email profile' al login.";
    if (s === 401) return "No autorizado (token inválido o vencido).";
    if (s === 403) return "Prohibido: el cliente o el usuario no tienen permiso.";
    if (s === 404) return "Endpoint no encontrado (verificá la URL '/protocol/openid-connect').";
    if (s >= 500) return "Error del servidor de identidad.";
    return desc || "Error desconocido.";
  },

  async _saveTokens(res) {
    if (!res || !res.access_token) throw new Error("login: respuesta sin access_token");
    await storeValue("access_token", res.access_token);
    if (res.refresh_token) await storeValue("refresh_token", res.refresh_token);
    const expAt = this._now() + (Number(res.expires_in || 300) * 1000) - this._skewMs;
    await storeValue("token_exp_at", expAt);
  },

  // === Public API ===
  async login() {
    // 1) LOGIN
    let tokens;
    try {
      tokens = await Q_login.run();                  // { access_token, refresh_token, ... }
      await this._saveTokens(tokens);
    } catch (e) {
      console.log("Q_login error:", e);
      showAlert("Login fallido: " + this._kcMessage(e), "error");
      return;
    }

    // 2) NAVEGAR
    try {
      navigateTo(this.PAGE_HOME);
    } catch (e) {
      showAlert("No pude navegar a la página de inicio. Verificá el nombre: " + this.PAGE_HOME, "error");
      return;
    }

    // 3) USERINFO (no bloquea)
    try {
      const me = await Q_userinfo.run();            // requiere scope=openid email profile en Q_login
      await storeValue("user", me);
    } catch (e) {
      console.log("Q_userinfo warning:", e);
      showAlert("Login ok, pero /userinfo falló: " + this._kcMessage(e), "warning");
    }
  },

  async ensureSession() {
    const at = appsmith.store.access_token;
    const exp = Number(appsmith.store.token_exp_at || 0);
    if (!at) { navigateTo(this.PAGE_LOGIN); return; }
    if (this._now() > exp) {
      try {
        const r = await Q_refresh.run();
        await this._saveTokens(r);
      } catch (e) {
        console.log("Q_refresh error:", e);
        await this.logout(true);
      }
    }
  },

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
  }
}