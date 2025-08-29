export default {
	async importarCSV() {
		const file = import_file.files?.[0];
		if (!file) { showAlert("Seleccioná un archivo CSV", "warning"); return; } 
		
		if (!file.name.toLowerCase().endsWith(".csv")) { 
			showAlert("Solo se admiten archivos .csv", "error"); 
			return; }
		
		const base64String = file.data.split(',')[1] || file.data;
		return .run({
			fileName: file.name,
			mimeType: file.type || "text/csv",
			data: base64String
		});
	}}
