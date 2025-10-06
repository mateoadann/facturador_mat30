export default {
  // === Config ===
  PAGE_HOME: "Home",           // <-- cambiá por el nombre exacto
  PAGE_LOGIN: "Authentication",// <-- cambiá por el nombre exacto
  _skewMs: 15000,

  // === Utils ===
  _now() { return Date.now(); },
  _status(e) { return e?.responseMeta?.statusCode ?? e?.statusCode ?? e?.status ?? null; },
  _msg(e) {
    const data = e?.data || e?.responseData || {};
    const err  = (data.error || "").toLowerCase();
    const desc = (data.error_description || data.errorMessage || e?.message || "").trim();
    return { err, desc, raw: data };
  },
  _kcMessage(e) {
    const s = this._status(e);
    const { err, desc } = this._msg(e);
    const d = (desc || "").toLowerCase();

    // Keycloak / OAuth errores estándar
    if (err === "invalid_client")        return "Cliente inválido o client_secret incorrecto.";
    if (err === "unauthorized_client")   return "El cliente no está autorizado para este flujo. Habilitá Direct Access Grants.";
    if (err === "invalid_grant") {
      if (d.includes("account is not fully set up")) return "La cuenta tiene acciones requeridas pendientes (password temporal, verify email, TOTP o profile).";
      if (d.includes("invalid user credentials"))     return "Usuario o contraseña inválidos.";
      if (d.includes("disabled"))                     return "El usuario está deshabilitado o bloqueado.";
      if (d.includes("expired"))                      return "La credencial o el token ha expirado.";
      return "Grant inválido. Revisá credenciales y estado del usuario.";
    }
    if (err === "invalid_scope")         return "Scope inválido. Agregá 'openid email profile' al login.";
    if (err === "access_denied")         return "Acceso denegado. Revisá políticas/roles del usuario.";
    if (err === "unsupported_grant_type")return "Grant no soportado. Usá 'password' para Direct Access Grants.";

    // HTTP / transporte / configuración
    if (s === 0 || s === undefined || s === null) {
      // Appsmith suele poner status 0 en CORS/network
      if (d.includes("timeout"))         return "Timeout de red. El servidor no respondió a tiempo.";
      return "Error de red o CORS (endpoint inaccesible o bloqueado).";
    }
    if (s === 400)                        return "Solicitud inválida (revisá body x-www-form-urlencoded y parámetros).";
    if (s === 401)                        return "No autorizado (token inválido o vencido / header Authorization incorrecto).";
    if (s === 403)                        return "Prohibido: el cliente o el usuario no tienen permiso.";
    if (s === 404)                        return "Endpoint no encontrado (verificá '/protocol/openid-connect').";
    if (s === 405)                        return "Método HTTP no permitido (usá POST para /token, GET para /userinfo).";
    if (s === 415)                        return "Tipo de contenido no soportado (usá 'application/x-www-form-urlencoded').";
    if (s >= 500)                         return "Error interno del servidor de identidad.";
    return desc || "Error desconocido.";
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
  }
}