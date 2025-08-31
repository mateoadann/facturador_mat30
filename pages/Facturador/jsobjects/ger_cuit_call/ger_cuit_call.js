export default {
  async buscarYCompletar() {
   
    try {
      // Llamá a tu query; ajustá el nombre y parámetro si difiere
      const resp = await get_persona.run();

      // Normalizá la respuesta (ajustá estas rutas a tu JSON real)
      const d = Array.isArray(resp) ? resp[0] : resp;
      const persona = {
        cuit: d?.cuit ?? d?.data?.cuit ?? "",
        nombre: d?.nombre ?? d?.data?.nombre ?? "",
        apellido: d?.apellido ?? d?.data?.apellido ?? "",
        domicilio_fiscal: d?.domicilio_fiscal ?? d?.data?.domicilio_fiscal ?? "",
				cond_iva: d?.cond_iva ?? d?.data?.cond_iva ?? ""

      };

      if (!persona.cuit) {
        showAlert("No se encontraron datos para ese CUIT", "warning");
        return;
      }

      // Completar los inputs
      await cf_input.setValue(persona.cuit);
      await nf_input.setValue(persona.nombre);
      await af_input.setValue(persona.apellido);
      await df_input.setValue(persona.domicilio_fiscal);
			await cdf_input.setValue(persona.cond_iva);

      showAlert("Datos cargados ✔️", "success");
    } catch (e) {
      showAlert("Error consultando el CUIT", "error");
      throw e;
    }
  }
};
