document.addEventListener('DOMContentLoaded', () => {
    const imageLoader = document.getElementById('imageLoader');
    const userImagePreview = document.getElementById('userImagePreview');

    // Tarjetas de secciones
    const editorCard = document.getElementById('editorCard');
    const resultCard = document.getElementById('resultCard');

    // Lienzo de edición y sus controles
    const editorCanvas = document.getElementById('editorCanvas');
    const editorCtx = editorCanvas.getContext('2d');
    const zoomSlider = document.getElementById('zoomSlider');
    const colorSelector = document.getElementById('colorSelector');
    const colorSelectorB = document.getElementById('colorSelectorB');
    const alphaSlider = document.getElementById('alphaSlider');
    const alphaValueSpan = document.getElementById('alphaValue');
    const applyBtn = document.getElementById('applyBtn');

    // Lienzo de resultado final
    const resultCanvas = document.getElementById('resultCanvas');
    const resultCtx = resultCanvas.getContext('2d');
    const downloadBtn = document.getElementById('downloadBtn');

    const BASE_IMAGE_SRC = 'img/img-base.png';
    const MASK_EXTERIOR_SRC = 'img/img-mask-exterior.png';
    const MASK_INTERIOR_SRC = 'img/img-mask-interior.png';
    const COLOR_MASK_A_SRC = 'img/img-color-a.png';
    const COLOR_MASK_B_SRC = 'img/img-color-b.png';

    // Crear un canvas para combinar las capas de usuario (exterior e interior).
    // Esto es CRUCIAL para prevenir que una capa se "traspase" a la otra.
    const userLayerCanvas = document.createElement('canvas');
    const userLayerCtx = userLayerCanvas.getContext('2d');

    // Almacenará las imágenes cargadas
    let userImage, baseImage, maskExterior, maskInterior, colorMaskA, colorMaskB;

    // Estado de la imagen del usuario en el editor (posición, escala, etc.)
    const imageState = {
        x: 0,
        y: 0,
        scale: 1,
        isDragging: false,
        dragStart: { x: 0, y: 0 }
    };

    // Estado de los colores (separado para mayor claridad)
    const colorState = {
        selectedColor: '',
        selectedColorB: '',
        colorAlpha: 0.1 // Nivel de transparencia inicial para los colores
    };

    imageLoader.addEventListener('change', handleImage, false);
    applyBtn.addEventListener('click', () => generateFinalImage());
    colorSelector.addEventListener('change', handleColorChange);
    colorSelectorB.addEventListener('change', handleColorChangeB);
    alphaSlider.addEventListener('input', handleAlphaChange);

    async function handleImage(e) {
        if (!e.target.files || !e.target.files[0]) return;

        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const userImageUrl = event.target.result;
                userImagePreview.src = userImageUrl;
                userImagePreview.style.display = 'block'; // Muestra la vista previa

                // Cargar las imágenes necesarias
                [userImage, baseImage, maskExterior, maskInterior, colorMaskA, colorMaskB] = await Promise.all([
                    loadImage(userImageUrl),
                    loadImage(BASE_IMAGE_SRC),
                    loadImage(MASK_EXTERIOR_SRC),
                    loadImage(MASK_INTERIOR_SRC),
                    loadImage(COLOR_MASK_A_SRC),
                    loadImage(COLOR_MASK_B_SRC)
                ]);

                // Configurar y mostrar el editor
                setupEditor();
            } catch (error) {
                console.error("Error al cargar las imágenes de la plantilla. Revisa las rutas de archivo.", error);
                alert("Hubo un error al cargar las imágenes base. Asegúrate de que los archivos existen y las rutas son correctas. Revisa la consola (F12) para más detalles.");
            }
        }
        reader.readAsDataURL(e.target.files[0]);
    }

    // Función para cargar una imagen y devolver una promesa
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function setupEditor() {
        editorCanvas.width = baseImage.width;
        editorCanvas.height = baseImage.height;
        userLayerCanvas.width = baseImage.width;
        userLayerCanvas.height = baseImage.height;

        // Calcular escala inicial para que la imagen del usuario llene el canvas
        const scaleToFitWidth = editorCanvas.width / userImage.width;
        const scaleToFitHeight = editorCanvas.height / userImage.height;
        const baseScale = Math.max(scaleToFitWidth, scaleToFitHeight);

        // --- Inicializar estado de la imagen ---
        imageState.scale = baseScale;
        imageState.x = (editorCanvas.width - userImage.width * imageState.scale) / 2;
        imageState.y = (editorCanvas.height - userImage.height * imageState.scale) / 2;

        // Sincronizar controles con el estado activo
        zoomSlider.value = imageState.scale;
        alphaSlider.value = colorState.colorAlpha * 100;
        alphaValueSpan.textContent = `${alphaSlider.value}%`;

        // Mostrar la tarjeta del editor y ocultar la de resultado
        editorCard.classList.remove('hidden');
        resultCard.classList.add('hidden');

        drawEditor();
    }

    function drawEditor() {
        drawComposition(editorCtx);
    }

    /**
     * Dibuja la composición final (base + usuario enmascarado) en un contexto de canvas determinado.
     * @param {CanvasRenderingContext2D} targetCtx - El contexto del canvas donde se dibujará (editor o resultado).
     */
    function drawComposition(targetCtx) {
        const canvas = targetCtx.canvas;

        // --- PASO 1: Construir la capa de usuario combinada ---
        // Limpiamos el canvas que contendrá AMBAS capas de usuario (exterior e interior)
        userLayerCtx.clearRect(0, 0, userLayerCanvas.width, userLayerCanvas.height);

        // 1a. Dibuja la capa EXTERIOR en el canvas combinado
        drawSingleUserLayer(userLayerCtx, maskExterior, imageState);

        // 1b. Dibuja la capa INTERIOR en el canvas combinado
        const interiorState = { ...imageState };
        const exteriorScale = imageState.scale;
        const interiorScale = exteriorScale * 0.605;
        const scaleDiff = exteriorScale - interiorScale;
        interiorState.scale = interiorScale;
        interiorState.x = imageState.x + (userImage.width / 2) * scaleDiff;
        interiorState.y = imageState.y + (userImage.height / 2) * scaleDiff;
        drawSingleUserLayer(userLayerCtx, maskInterior, interiorState);

        // --- PASO 2: Componer la imagen final ---
        // Limpiamos el canvas final
        targetCtx.clearRect(0, 0, canvas.width, canvas.height);
        // 2a. Dibujamos la base
        targetCtx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
        // 2b. Dibujamos las capas de color
        drawColorLayer(targetCtx, colorMaskA, colorState.selectedColor, colorState.colorAlpha);
        drawColorLayer(targetCtx, colorMaskB, colorState.selectedColorB, colorState.colorAlpha);
        // 2c. Dibujamos el canvas que ya tiene las capas de usuario combinadas y enmascaradas
        targetCtx.drawImage(userLayerCanvas, 0, 0);
    }

    /**
     * Dibuja UNA SOLA capa de usuario enmascarada sobre un canvas de destino.
     * @param {CanvasRenderingContext2D} destinationCtx - El contexto donde se dibujará la capa.
     * @param {HTMLImageElement} mask - La máscara a aplicar.
     * @param {object} state - El estado de transformación (x, y, scale).
     */
    function drawSingleUserLayer(destinationCtx, mask, state) {
        if (!mask || !userImage) return;

        // Usamos un canvas temporal para crear la capa enmascarada de forma aislada
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = destinationCtx.canvas.width;
        tempCanvas.height = destinationCtx.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Dibuja la imagen del usuario transformada en el canvas temporal
        tempCtx.save();
        tempCtx.translate(state.x, state.y);
        tempCtx.scale(state.scale, state.scale);
        tempCtx.drawImage(userImage, 0, 0, userImage.width, userImage.height);
        tempCtx.restore();

        // Aplica la máscara a la imagen que acabamos de dibujar
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.drawImage(mask, 0, 0, tempCanvas.width, tempCanvas.height);

        // Dibuja el resultado (la capa ya enmascarada) en el canvas de destino
        destinationCtx.drawImage(tempCanvas, 0, 0);
    }

    /**
     * Dibuja una capa de color enmascarada con un tratamiento de fusión y transparencia.
     * @param {CanvasRenderingContext2D} targetCtx - El contexto del canvas de destino.
     * @param {HTMLImageElement} mask - La imagen de la máscara para el color.
     * @param {string} color - El color a aplicar (ej. 'red', '#FF0000').
     * @param {number} alpha - El nivel de transparencia (0.0 a 1.0).
     */
    function drawColorLayer(targetCtx, mask, color, alpha) {
        if (!color || !mask || alpha === 0) return;

        // Usamos un canvas temporal LOCAL para esta operación, evitando efectos secundarios
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetCtx.canvas.width;
        tempCanvas.height = targetCtx.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // 1. Crear la capa de color en el canvas temporal
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(mask, 0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.fillStyle = color;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 2. Aplicar la capa de color al canvas de destino con el tratamiento
        targetCtx.save(); // Guardar estado (gCO, gA, etc.)
        targetCtx.globalCompositeOperation = 'multiply';
        targetCtx.globalAlpha = alpha;
        targetCtx.drawImage(tempCanvas, 0, 0);
        targetCtx.restore(); // Restaurar estado
    }

    function handleColorChange(e) {
        colorState.selectedColor = e.target.value;
        drawEditor();
    }

    function handleColorChangeB(e) {
        colorState.selectedColorB = e.target.value;
        drawEditor();
    }

    function handleAlphaChange(e) {
        colorState.colorAlpha = parseFloat(e.target.value) / 100;
        alphaValueSpan.textContent = `${e.target.value}%`;
        drawEditor();
    }

    // --- Eventos de Interacción del Editor ---
    editorCanvas.addEventListener('mousedown', (e) => {
        const rect = editorCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        imageState.isDragging = true;
        imageState.dragStart.x = mouseX - imageState.x;
        imageState.dragStart.y = mouseY - imageState.y;
    });

    editorCanvas.addEventListener('mouseup', () => {
        imageState.isDragging = false;
    });

    editorCanvas.addEventListener('mouseleave', () => {
        imageState.isDragging = false;
    });

    editorCanvas.addEventListener('mousemove', (e) => {
        if (imageState.isDragging) {
            const rect = editorCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            imageState.x = mouseX - imageState.dragStart.x;
            imageState.y = mouseY - imageState.dragStart.y;
            drawEditor();
        }
    });

    zoomSlider.addEventListener('input', (e) => {
        const newScale = parseFloat(e.target.value);
        const oldScale = imageState.scale;

        // Ajustar la posición para que el zoom parezca centrado en la imagen
        imageState.x += (userImage.width * oldScale) / 2 - (userImage.width * newScale) / 2;
        imageState.y += (userImage.height * oldScale) / 2 - (userImage.height * newScale) / 2;
        
        imageState.scale = newScale;
        drawEditor();
    });

    // --- Eventos Táctiles para Móviles ---
    editorCanvas.addEventListener('touchstart', (e) => {
        // Solo reaccionar a un dedo
        if (e.touches.length === 1) {
            const rect = editorCanvas.getBoundingClientRect();
            const touch = e.touches[0];
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;

            imageState.isDragging = true;
            imageState.dragStart.x = touchX - imageState.x;
            imageState.dragStart.y = touchY - imageState.y;
        }
    });

    editorCanvas.addEventListener('touchend', () => {
        imageState.isDragging = false;
    });

    editorCanvas.addEventListener('touchcancel', () => {
        imageState.isDragging = false;
    });

    editorCanvas.addEventListener('touchmove', (e) => {
        if (imageState.isDragging && e.touches.length === 1) {
            // Prevenir el comportamiento por defecto (como hacer scroll en la página)
            e.preventDefault();
            const rect = editorCanvas.getBoundingClientRect();
            const touch = e.touches[0];
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;

            imageState.x = touchX - imageState.dragStart.x;
            imageState.y = touchY - imageState.dragStart.y;
            drawEditor();
        }
    }, { passive: false }); // Necesario para que preventDefault() funcione

    async function generateFinalImage() {
        try {
            // Configurar el canvas de resultado final
            resultCanvas.width = baseImage.width;
            resultCanvas.height = baseImage.height;

            // Usar la función de composición para dibujar el resultado final
            drawComposition(resultCtx);

            // Ocultar editor, mostrar resultado y habilitar descarga
            editorCard.classList.add('hidden');
            resultCard.classList.remove('hidden');
            downloadBtn.disabled = false;
        } catch (error) {
            console.error("Error al cargar o procesar las imágenes:", error);
            alert("Hubo un error al procesar la imagen. Por favor, intenta con otra.");
        }
    }

    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'resultado.png';
        link.href = resultCanvas.toDataURL('image/png');
        link.click();
    });
});