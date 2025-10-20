export default {
  async doble_confirmacion(env = "prod") {
    const lote = (function(){ try { return Lotes_importados?.selectedOptionValue; } catch { return null; } })();
    if (!lote) { showAlert("Debes seleccionar un lote antes de continuar.", "warning"); return; }

    const flag = appsmith.store?.confirmar === true;
    if (!flag) {
      await storeValue("confirmar", true);
      const etiqueta = (function(){ try { return Lotes_importados.selectedOptionLabel || lote; } catch { return lote; } })();
      showAlert(`Procesarás el lote "${etiqueta}". Pulsa de nuevo para confirmar.`, "warning");
      return;
    }

    await storeValue("confirmar", false);

    try {
      // Llama al runner de facturación (elige entorno aquí)
      if (String(env).toLowerCase()==="test") {
        await facturacion.runTest();
      } else {
        await facturacion.runProd();
      }
      // El propio JS de facturación cierra modal y resetea el widget si todo ok
    } catch (error) {
      showAlert("Ocurrió un error al ejecutar el proceso: " + (error?.message || error), "error");
    }
  }
};