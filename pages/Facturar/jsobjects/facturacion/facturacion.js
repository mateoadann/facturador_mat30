export default {
  // ======= CONFIG =======
  ENV_DEFAULT: "prod",                       // "prod" | "test"
  LOGIN_PAGE: "Authentication",
  MODAL_ID: "Facturar_modal",
  LOTE_WIDGET_ID: "Lotes_importados",

  // ======= ENV =======
  _env(v){ v = String(v||"").toLowerCase(); return v==="test" ? "test" : "prod"; },
  currentEnv(overrideEnv){
    const stored = appsmith.store?.env_mode || this.ENV_DEFAULT;
    return this._env(overrideEnv || stored);
  },
  async setEnv(env="test"){
    const e = this._env(env);
    await storeValue("env_mode", e);
    showAlert(`Entorno seleccionado: ${e.toUpperCase()}`, "info");
  },

  // ======= Utils =======
  _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); },
  _selectedLote(){
    try { return Lotes_importados?.selectedOptionValue || ""; } catch { return ""; }
  },
  _normalize(raw, action){
    let d = raw;
    if (d && typeof d==="object" && "data" in d && d.data && typeof d.data==="object") d = d.data;
    if (!d) d = action?.data ?? null;
    if (typeof d==="string"){
      const s=d.trim(); if(!s) return null;
      try { d = JSON.parse(s); }
      catch { d = { status:"error", success:false, error:true, reason:s }; }
    }
    return d;
  },
  _reason(d){ return (d && (d.reason || d.error || d.message)) || "sin detalle"; },
  _ok(d){ return !!(d && (d.success===true || String(d.status||"").toLowerCase()==="ok")); },
  _is401(d){
    const code=Number(d?.response_code||0);
    const es=String(d?.error_status||"").toLowerCase();
    const rs=String(d?.reason||"").toLowerCase();
    return code===401 || es==="unauthorized" || rs==="invalid_or_expired_token";
  },
  _is400(d){ return Number(d?.response_code||0)===400; },
  _extractCount(d){
    const m = String(d?.reason||"").match(/\b(processed|queued|imported)\s*:\s*(\d+)/i);
    return m ? Number(m[2]) : null;
  },
  _query(env){
    return env==="test"
      ? { name:"t_facturacion", action:(typeof t_facturacion!=="undefined" ? t_facturacion : null) }
      : { name:"p_facturacion", action:(typeof p_facturacion!=="undefined" ? p_facturacion : null) };
  },

  // ======= Prechecks =======
  async _precheck(){
    if (!appsmith.store?.access_token) await Auth.ensureSession();
    if (!appsmith.store?.access_token){
      showAlert("No hay sesión. Iniciá sesión.", "error");
      navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
      return false;
    }
    const lote = this._selectedLote();
    if (!lote){
      showAlert("Debés seleccionar un lote.", "warning");
      return false;
    }
    return true;
  },

  // ======= Core =======
  async runFacturacion(envOverride){
    if (!(await this._precheck())) return;

    const env = this.currentEnv(envOverride);
    const { name, action } = this._query(env);
    if (!action || typeof action.run!=="function"){
      showAlert(`La query ${name} no existe.`, "error");
      return;
    }

    // 1) Primer intento
    let raw;
    try { raw = await action.run(); } catch { /* noop */ }
    let d = this._normalize(raw, action);

    // 1.b Guard contra respuesta "en blanco"
    if (!d || (typeof d==="object" && !("status" in d) && !("success" in d) && !("response_code" in d))){
      await Auth.ensureSession();
      await this._sleep(50);
      try { raw = await action.run(); } catch { /* noop */ }
      d = this._normalize(raw, action);
    }

    // 2) 401 → refresh + retry
    if (this._is401(d)){
      await Auth.ensureSession();
      await this._sleep(50);
      try { raw = await action.run(); } catch { /* noop */ }
      d = this._normalize(raw, action);
      if (this._is401(d)){
        showAlert(`No autorizado: ${this._reason(d)}`, "error");
        await Auth.logout(true);
        navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
        return d;
      }
    }

    // 3) 400 → mostrar razón (p.ej. invalid_lote)
    if (this._is400(d)){
      showAlert(`Solicitud inválida: ${this._reason(d)}`, "error");
      return d;
    }

    // 4) Éxito
    if (this._ok(d)){
      const count = this._extractCount(d);
      const msg = `Facturación iniciada (${env.toUpperCase()})` +
                  (count!=null ? `. Documentos: ${count}` : "") +
                  `. Motivo: ${this._reason(d)}`;
      showAlert(msg, "success");
      try { closeModal(this.MODAL_ID); } catch {}
      try { resetWidget(this.LOTE_WIDGET_ID, true); } catch {}
      return d;
    }

    // 5) Genérico
    showAlert(`Error en facturación (${env.toUpperCase()}): ${this._reason(d)}`, "error");
    return d;
  },

  // Atajos
  async runTest(){ return this.runFacturacion("test"); },
  async runProd(){ return this.runFacturacion("prod"); },
};