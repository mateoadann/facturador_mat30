export default {
  // === Config ===
  PAGE_HOME: "Home",           // <-- cambiá por el nombre exacto
  PAGE_LOGIN: "Authentication",// <-- cambiá por el nombre exacto
  _skewMs: 15000,

  // === Utils ===
  _now() { return Date.now(); },
     _status(e) {
    // Appsmith puede usar statusCode o status
    return e?.responseMeta?.statusCode
        ?? e?.responseMeta?.status
        ?? e?.statusCode
        ?? e?.status
        ?? null;
  },

  _msg(e) {
    // Intenta distintas variantes de dónde puede venir el body
    let data = e?.data ?? e?.responseData ?? null;

    // Si vino como string JSON en responseMeta.body
    if (!data && typeof e?.responseMeta?.body === "string") {
      const body = e.responseMeta.body.trim();
      if (body.startsWith("{") && body.endsWith("}")) {
        try { data = JSON.parse(body); } catch (_) {}
      }
    }

    // Si vino como string JSON en e.data
    if (!data && typeof e?.data === "string") {
      const s = e.data.trim();
      if (s.startsWith("{") && s.endsWith("}")) {
        try { data = JSON.parse(s); } catch (_) {}
      }
    }

    const err  = (data?.error || "").toLowerCase();
    const desc = (data?.error_description || data?.errorMessage || e?.message || "").trim();
    return { err, desc, raw: data ?? e };
  },

 _kcMessage(e) {
  const s = e?.responseMeta?.statusCode ?? e?.status ?? 0;
  const msg = (e?.data?.error_description || e?.message || "").toLowerCase();

  if (msg.includes("invalid user") || msg.includes("invalid_grant"))
    return "Usuario o contraseña inválidos.";
  if (s === 401 || s === 403)
    return "No autorizado o sin permisos.";
  if (s >= 500)
    return "Error del servidor de autenticación.";
  if (s === 0)
    return "Error al iniciar la sesión.";
  return "Error al iniciar sesión.";
},

  async _saveTokens(res) {
    if (!res || !res.access_token) throw new Error("Login: respuesta sin access_token");
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
      tokens = await Q_login.run(); // { access_token, refresh_token, ... }
      await this._saveTokens(tokens);
    } catch (e) {
      console.log("Q_login error:", e);
      showAlert("Login fallido: " + this._kcMessage(e), "error");
      return;
    }

    // 2) NAVEGAR (apenas guardamos tokens)
    try {
      navigateTo(this.PAGE_HOME);
    } catch (e) {
      showAlert("No pude navegar a la página de inicio. Verificá el nombre: " + this.PAGE_HOME, "error");
      return;
    }

    // 3) USERINFO (no bloquea el acceso si falla)
    try {
      const me = await Q_userinfo.run(); // requiere scope=openid email profile
      await storeValue("user", me);
    } catch (e) {
      console.log("Q_userinfo warning:", e);
      showAlert("Login ok, pero /userinfo falló: " + this._kcMessage(e), "warning");
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