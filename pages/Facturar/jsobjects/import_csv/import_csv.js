export default {
  // ======= CONFIG =======
  ENV_DEFAULT: "test",
  LOGIN_PAGE: "Authentication",

  FILE_WIDGET_ID: "import_file",
  MODAL_ID: "importar_facturar",
  STORE_LAST_RESPONSE_KEY: "last_import_response",
  STORE_LAST_STATUS_KEY: "last_import_status",
  STORE_LAST_META_KEY: "last_import_meta",

  // ======= ENV =======
  _normalizeEnv(v) {
    const x = String(v || "").trim().toLowerCase();
    return (x === "prod" || x === "production") ? "prod" : "test";
  },
  currentEnv(overrideEnv) {
    if (overrideEnv) return this._normalizeEnv(overrideEnv);
    const stored = appsmith.store?.env_mode;
    return this._normalizeEnv(stored || this.ENV_DEFAULT);
  },
  async setEnv(env = "test") {
    const v = this._normalizeEnv(env);
    await storeValue("env_mode", v);
    showAlert("Entorno seleccionado: " + v.toUpperCase(), "info");
  },

  // ======= Helpers =======
  _hasToken() { return Boolean(appsmith.store?.access_token); },
  _hasFile() { try { return Boolean(import_file?.files?.[0]); } catch { return false; } },

  // --- Contrato n8n (solo data) ---
  _okFromTemplate(d) {
    if (!d || typeof d !== "object") return false;
    if (d.success === true) return true;
    if (String(d.status || "").toLowerCase() === "ok") return true;
    if (String(d.success_status || "").toLowerCase() === "success" && d.error !== true) return true;
    // Compat anterior
    if (d.ok === true || d.status === "success" || d.status === "done") return true;
    return false;
  },
  _isUnauthorized(d) {
    const code = Number(d?.response_code || 0);
    const err  = String(d?.error_status || "").toLowerCase();
    const rsn  = String(d?.reason || "").toLowerCase();
    return code === 401 || err === "unauthorized" || rsn === "invalid_or_expired_token";
  },
  _isInvalidFile(d) {
    const code = Number(d?.response_code || 0);
    const rsn  = String(d?.reason || "").toLowerCase();
    const err  = String(d?.error_status || "").toLowerCase();
    return code === 400 && (rsn === "invalid_file" || err === "bad request" || err === "bad_request");
  },
  _extractImported(d) {
    // Nuevos: reason: "imported : N"
    const m = String(d?.reason || "").match(/imported\s*:\s*(\d+)/i);
    if (m) return Number(m[1]);
    // Compat anterior
    if (d?.body?.imported != null) return Number(d.body.imported);
    if (d?.imported != null) return Number(d.imported);
    return null;
  },
  _extractErrorText(d) {
    if (!d) return "Error desconocido";
    if (typeof d === "string") return d;
    return (
      d.reason ||
      d.error ||
      d.message ||
      JSON.stringify(d)
    );
  },

  _getSelectedQuery(env) {
    const e = this.currentEnv(env);
    return e === "test"
      ? { action: (typeof t_import_csv !== "undefined" ? t_import_csv : null), name: "t_import_csv", env: e }
      : { action: (typeof p_import_csv !== "undefined" ? p_import_csv : null), name: "p_import_csv", env: e };
  },

  // Invoca la query: SIEMPRE leeremos action.data como fuente de verdad.
  async _invoke(action) {
    let threw = null;
    try { await action.run(); } catch (e) { threw = e; }
    const meta = action?.responseMeta || {};
    const data = action?.data ?? null; // <- contrato n8n
    // status para guardar/debug (si viene numérico en template lo usaremos)
    const response_code = (data && typeof data.response_code !== "undefined")
      ? Number(data.response_code)
      : null;
    return { payload: data, meta, response_code, threw };
  },

  // ======= Prechecks =======
  async _precheck() {
    if (!this._hasToken()) await Auth.ensureSession();
    if (!this._hasToken()) {
      showAlert("No hay sesión activa. Iniciá sesión para continuar.", "error");
      navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
      return false;
    }
    if (!this._hasFile()) {
      showAlert("Debés seleccionar un archivo antes de importar.", "warning");
      return false;
    }
    return true;
  },

  // ======= UI =======
  async _persist(payload, meta, status) {
    await storeValue(this.STORE_LAST_RESPONSE_KEY, payload ?? null);
    await storeValue(this.STORE_LAST_STATUS_KEY, status ?? null);
    await storeValue(this.STORE_LAST_META_KEY, meta ?? null);
  },

  async _onSuccessUI(payload, meta, env) {
    const imported = this._extractImported(payload);
    await this._persist(payload, meta, 200);

    const base = `Importación exitosa (${env.toUpperCase()})`;
    const msg  = (imported != null) ? `${base}. Registros importados: ${imported}` : base;
    showAlert(msg, "success");

    try { await Get_facturar.run(); }
    catch (e) {
      console.warn("Get_facturar error:", e);
      showAlert("La importación fue exitosa, pero falló la actualización de datos.", "warning");
    }

    try { resetWidget(this.FILE_WIDGET_ID, true); } catch {}
    try { closeModal(this.MODAL_ID); } catch {}
  },

  async _onErrorUI(payload, meta, env, prefix = "Error en importación") {
    const code = Number(payload?.response_code || 0) || null;
    await this._persist(payload, meta, code);
    const reason = this._extractErrorText(payload);
    showAlert(`${prefix} (${env.toUpperCase()}): ${reason}`, "error");
    console.error("ImportCSV error:", { code, meta, payload });
  },

  // ======= Core =======
  async runImport(envOverride) {
    if (!(await this._precheck())) return;

    const { action, name, env } = this._getSelectedQuery(envOverride);
    if (!action || typeof action.run !== "function") {
      await this._onErrorUI({ error: "missing_query", reason: `La query ${name} no está definida.` }, null, env, "Configuración inválida");
      return;
    }

    // 1) Primer intento (siempre leer data/meta)
    let { payload, meta } = await this._invoke(action);

    // 1.a) Archivo inválido (400 / invalid_file) -> mensaje claro + reset file
    if (this._isInvalidFile(payload)) {
      try { resetWidget(this.FILE_WIDGET_ID, true); } catch {}
      await this._onErrorUI(
        payload,
        meta,
        env,
        "Archivo inválido (no contiene los campos requeridos)"
      );
      return;
    }

    // 1.b) Unauthorized según template -> refresh + reintento 1 vez
    if (this._isUnauthorized(payload)) {
      await Auth.ensureSession();
      ({ payload, meta } = await this._invoke(action));

      if (this._isUnauthorized(payload)) {
        await this._onErrorUI(payload, meta, env, "No autorizado tras reintento");
        await Auth.logout(true);
        navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
        return;
      }
      // Si el reintento devolvió invalid_file, tratálo ya aquí:
      if (this._isInvalidFile(payload)) {
        try { resetWidget(this.FILE_WIDGET_ID, true); } catch {}
        await this._onErrorUI(
          payload,
          meta,
          env,
          "Archivo inválido (no contiene los campos requeridos)"
        );
        return;
      }
    }

    // 2) Éxito según contrato n8n
    if (this._okFromTemplate(payload)) {
      await this._onSuccessUI(payload, meta, env);
      return payload;
    }

    // 3) Cualquier otro caso = error de negocio (mostramos reason)
    await this._onErrorUI(payload, meta, env);
    return payload;
  },

  // Atajos
  async runTest() { return this.runImport("test"); },
  async runProd() { return this.runImport("prod"); },
};