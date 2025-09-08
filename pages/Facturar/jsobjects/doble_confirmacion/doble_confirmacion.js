export default {
  async doble_confirmacion() {
    // No permitas continuar sin seleccionar un lote
    if (!Lotes_importados.selectedOptionValue) {
      showAlert('Debes seleccionar un lote antes de continuar.', 'warning');
      return;
    }

    // Doble confirmación
    if (!appsmith.store.confirmar) {
      await storeValue('confirmar', true);
      const etiqueta = Lotes_importados.selectedOptionLabel || Lotes_importados.selectedOptionValue;
      showAlert('Procesarás el lote "' + etiqueta + '". Pulsa de nuevo para confirmar.', 'warning');
      return;
    }

    // Segunda pulsación: ejecutamos la consulta dentro de try/catch
    await storeValue('confirmar', false);
    try {
      const resultado = await start_facturacion_lote.run();  // Sustituye MiQuery por tu consulta real
      // Si llegamos aquí la consulta se ejecutó correctamente
      showAlert('Proceso completado con éxito.', 'success');
      closeModal(Facturar_modal.name);              // Cierra el modal de confirmación (o el que corresponda)
      // Limpia los widgets o estados necesarios
      resetWidget('Lotes_importados');
    } catch (error) {
      // Si MiQuery falla, se captura aquí
      showAlert('Ocurrió un error al ejecutar el proceso: ' + (error?.message || error), 'error');
    }
  }
};
