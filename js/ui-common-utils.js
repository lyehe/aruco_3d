export function triggerDownload(blob, filename) {
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
}

export function getMaxIdFromSelect(selectedDictElement, dictionaryData) {
    if (!selectedDictElement) return 999; // Fallback

    const option = selectedDictElement.options[selectedDictElement.selectedIndex];
    if (!option) return 999; // Fallback if no option is selected

    const dictName = option.value;

    if (dictionaryData && dictionaryData[dictName]) {
        return dictionaryData[dictName].length - 1;
    }

    // Fallback to data attribute if dictionary data is not yet loaded or doesn't match
    if (option.getAttribute('data-number')) {
        return Number(option.getAttribute('data-number')) - 1;
    }

    // Fallback based on name (less reliable, kept from original logic)
    // This part might be removed if data-number is always reliable or dict is always loaded
    console.warn("Falling back to name-based max ID for dictionary:", dictName);
    return (dictName.includes("4x4")) ? 999 :
           (dictName.includes("5x5")) ? 999 :
           (dictName.includes("6x6_1000")) ? 999 :
           (dictName.includes("7x7")) ? 999 :
           (dictName === "mip_36h12") ? 249 :
           (dictName === "april_16h5") ? 29 :
           (dictName === "april_25h9") ? 34 :
           (dictName === "april_36h10") ? 2319 :
           (dictName === "april_36h11") ? 586 :
           (dictName === "aruco") ? 1023 : 999;
} 