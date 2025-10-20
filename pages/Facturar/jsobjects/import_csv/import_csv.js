export default {
  // ======= CONFIG =======
  ENV_DEFAULT: "prod",                  // "prod" | "test"
  LOGIN_PAGE: "Authentication",
  FILE_WIDGET_ID: "import_file",
  MODAL_ID: "importar_facturar",

  // ======= ENV helpers =======
  _env(v) { v = String(v || "").toLowerCase(); return v === "test" ? "test" : "prod"; },
  currentEnv(overrideEnv) {
    const stored = appsmith.store?.env_mode || this.ENV_DEFAULT;
    return this._env(overrideEnv || stored);
  },
  async setEnv(env = "test") {
    const e = this._env(env);
    await storeValue("env_mode", e);
    showAlert(`Entorno seleccionado: ${e.toUpperCase()}`, "info");
  },

  // ======= Utils =======
  _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); },
  _reason(d){ return (d && (d.reason || d.error || d.message)) || "sin detalle"; },
  _imported(d){ const m = String(d?.reason||"").match(/imported\s*:\s*(\d+)/i); return m?Number(m[1]):null; },

  // Normaliza cualquier forma de respuesta (string / {data}/ body directo)
  _normalize(raw, action){
    let d = raw;
    // si vino envuelto { data: {...} }
    if (d && typeof d === "object" && "data" in d && d.data && typeof d.data === "object") d = d.data;
    // si no hay nada, intentar del action (Appsmith hidrata ahí)
    if (!d) d = action?.data ?? null;
    // si vino string, parsear
    if (typeof d === "string") {
      const s = d.trim(); if (!s) return null;
      try { d = JSON.parse(s); } catch { d = { status:"error", success:false, error:true, reason:s }; }
    }
    return d;
  },

  // Contrato n8n (simple)
  _ok(d){ return !!(d && (d.success === true || String(d.status||"").toLowerCase()==="ok")); },
  _unauth(d){
    const code = Number(d?.response_code||0);
    const es   = String(d?.error_status||"").toLowerCase();
    const rs   = String(d?.reason||"").toLowerCase();
    return code===401 || es==="unauthorized" || rs==="invalid_or_expired_token";
  },
  _invalidFile(d){
    const code = Number(d?.response_code||0);
    const es   = String(d?.error_status||"").toLowerCase();
    const rs   = String(d?.reason||"").toLowerCase();
    return code===400 && (rs==="invalid_file" || es==="bad request" || es==="bad_request");
  },

  _query(env){
    return env==="test"
      ? { name:"t_import_csv", action:(typeof t_import_csv!=="undefined"? t_import_csv : null) }
      : { name:"p_import_csv", action:(typeof p_import_csv!=="undefined"? p_import_csv : null) };
  },

  // ======= Prechecks =======
  async _precheck(){
    if (!appsmith.store?.access_token) await Auth.ensureSession();
    if (!appsmith.store?.access_token) {
      showAlert("No hay sesión. Iniciá sesión.", "error");
      navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
      return false;
    }
    try {
      if (!import_file?.files?.[0]) { showAlert("Seleccioná un archivo.", "warning"); return false; }
    } catch { showAlert("Seleccioná un archivo.", "warning"); return false; }
    return true;
  },

  // ======= Core =======
async runImport(envOverride){
  if (!(await this._precheck())) return;

  const env = this.currentEnv(envOverride);
  const { name, action } = this._query(env);
  if (!action || typeof action.run !== "function") {
    showAlert(`La query ${name} no existe.`, "error");
    return;
  }

  // 1) Primer intento + normalización
  let bodyRaw;
  try { bodyRaw = await action.run(); } catch(e){ /* noop */ }
  let d = this._normalize(bodyRaw, action);

  // 🔹 MINI AJUSTE AQUÍ (no dentro de _normalize):
  // Si la respuesta aún no es "legible" (no tiene campos del contrato),
  // reintentamos una vez tras ensureSession() y un breve delay.
  const looksBlank = !d || (
    typeof d === "object" &&
    !("status" in d) && !("success" in d) && !("response_code" in d)
  );
  if (looksBlank) {
    await Auth.ensureSession();
    await this._sleep(50); // da tiempo a que el header tome el nuevo token
    try { bodyRaw = await action.run(); } catch(e2){ /* noop */ }
    d = this._normalize(bodyRaw, action);
  }

  // 2) 401 → refresh + reintento (tu lógica actual)
  if (this._unauth(d)) {
    await Auth.ensureSession();
    await this._sleep(50);
    try { bodyRaw = await action.run(); } catch(e3){ /* noop */ }
    d = this._normalize(bodyRaw, action);
    if (this._unauth(d)) {
      showAlert(`No autorizado: ${this._reason(d)}`, "error");
      await Auth.logout(true);
      navigateTo(this.LOGIN_PAGE, {}, "SAME_WINDOW");
      return d;
    }
  }

  // 3) 400 invalid_file
  if (this._invalidFile(d)) {
    showAlert(`Archivo inválido: ${this._reason(d)}`, "error");
    try { resetWidget(this.FILE_WIDGET_ID, true); } catch {}
    return d;
  }

  // 4) Éxito
  if (this._ok(d)) {
    const n = this._imported(d);
    const rsn = this._reason(d);
    showAlert(`Importación exitosa. ${n!=null?`. Registros importados: ${n}`:""}. `, "success");
    try { await Get_facturar.run(); } catch {}
    try { resetWidget(this.FILE_WIDGET_ID, true); } catch {}
    try { closeModal(this.MODAL_ID); } catch {}
    return d;
  }

  // 5) Genérico
  showAlert(`Error en importación (${env.toUpperCase()}): ${this._reason(d)}`, "error");
  return d;
},

  // Atajos
  async runTest(){ return this.runImport("test"); },
  async runProd(){ return this.runImport("prod"); },
};