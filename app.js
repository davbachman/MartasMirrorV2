import { DEFAULT_IMAGE_STATE, createState, getSelectedImage } from './state.js';
import { createRenderer } from './render.js';
import { bindInteractions } from './interactions.js';

const elements = {
    canvasContainer: document.getElementById('canvas-container'),
    canvasArea: document.querySelector('.canvas-area'),
    canvas: document.getElementById('glCanvas'),
    drawCanvas: document.getElementById('drawCanvas'),
    imageUpload: document.getElementById('imageUpload'),
    projectImport: document.getElementById('projectImport'),
    imageList: document.getElementById('imageList'),
    imageSelectionStatus: document.getElementById('imageSelectionStatus'),
    scaleSlider: document.getElementById('scaleSlider'),
    radiusSlider: document.getElementById('circleRadius'),
    scaleValue: document.getElementById('scaleValue'),
    radiusValue: document.getElementById('radiusValue'),
    flipHorizontal: document.getElementById('flipHorizontal'),
    flipVertical: document.getElementById('flipVertical'),
    rotationSlider: document.getElementById('rotationSlider'),
    rotationValue: document.getElementById('rotationValue'),
    modeLine: document.getElementById('modeLine'),
    modeCircle: document.getElementById('modeCircle'),
    modeMove: document.getElementById('modeMove'),
    undoDraw: document.getElementById('undoDraw'),
    clearDraw: document.getElementById('clearDraw'),
    exportBtn: document.getElementById('exportBtn'),
    saveProjectBtn: document.getElementById('saveProjectBtn'),
    importProjectBtn: document.getElementById('importProjectBtn')
};

const PROJECT_VERSION = 1;
const state = createState();
const renderer = createRenderer({
    canvasContainer: elements.canvasContainer,
    canvasArea: elements.canvasArea,
    canvas: elements.canvas,
    drawCanvas: elements.drawCanvas,
    vertexShaderSource: document.getElementById('vertex-shader').textContent,
    fragmentShaderSource: document.getElementById('fragment-shader').textContent
});

function updateImageControlAvailability() {
    const hasSelectedImage = Boolean(getSelectedImage(state));
    elements.scaleSlider.disabled = !hasSelectedImage;
    elements.flipHorizontal.disabled = !hasSelectedImage;
    elements.flipVertical.disabled = !hasSelectedImage;
    elements.rotationSlider.disabled = !hasSelectedImage;
}

function updateValueDisplays() {
    const selectedImage = getSelectedImage(state);
    const scale = selectedImage ? selectedImage.scale : DEFAULT_IMAGE_STATE.scale;
    const rotation = selectedImage ? selectedImage.rotationDeg : DEFAULT_IMAGE_STATE.rotationDeg;

    elements.scaleValue.textContent = scale.toFixed(2);
    elements.radiusValue.textContent = state.circleRadius.toFixed(2);
    elements.rotationValue.textContent = `${rotation}\u00b0`;
    elements.imageSelectionStatus.textContent = selectedImage ? `Selected: ${selectedImage.name}` : 'No image selected';
}

function updateToggleAppearance() {
    const selectedImage = getSelectedImage(state);
    elements.flipHorizontal.classList.toggle('active', Boolean(selectedImage && selectedImage.flipX < 0.0));
    elements.flipVertical.classList.toggle('active', Boolean(selectedImage && selectedImage.flipY < 0.0));
}

function syncSelectedImageControls() {
    const selectedImage = getSelectedImage(state);
    elements.scaleSlider.value = String(selectedImage ? selectedImage.scale : DEFAULT_IMAGE_STATE.scale);
    elements.rotationSlider.value = String(selectedImage ? selectedImage.rotationDeg : DEFAULT_IMAGE_STATE.rotationDeg);
    updateImageControlAvailability();
    updateValueDisplays();
    updateToggleAppearance();
}

function renderImageList() {
    elements.imageList.textContent = '';

    if (!state.images.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'image-item-empty';
        emptyState.textContent = 'No images loaded.';
        elements.imageList.appendChild(emptyState);
        return;
    }

    for (let i = 0; i < state.images.length; i += 1) {
        const imageRecord = state.images[i];
        const button = document.createElement('button');
        const thumbnail = document.createElement('img');
        const name = document.createElement('span');

        button.type = 'button';
        button.className = 'image-item';
        button.dataset.index = String(i);
        button.setAttribute('aria-pressed', i === state.selectedImageIndex ? 'true' : 'false');
        if (i === state.selectedImageIndex) {
            button.classList.add('selected');
        }

        thumbnail.src = imageRecord.objectUrl;
        thumbnail.alt = imageRecord.name;

        name.className = 'image-item-name';
        name.textContent = imageRecord.name;
        name.title = imageRecord.name;

        button.appendChild(thumbnail);
        button.appendChild(name);
        elements.imageList.appendChild(button);
    }
}

function selectImageByIndex(index, options) {
    const settings = options || {};
    const focusSelection = settings.focusSelection !== false;
    const clearShapeSelection = settings.clearShapeSelection !== false;

    state.selectedImageIndex = index >= 0 && index < state.images.length ? index : -1;

    if (clearShapeSelection) {
        state.selectedShapeIndex = -1;
    }

    state.shapeEditTarget = null;
    state.moveTarget = null;
    state.lastMovePos = null;

    if (state.selectedImageIndex === -1) {
        if (state.keyboardSelection === 'image') {
            state.keyboardSelection = state.selectedShapeIndex >= 0 ? 'shape' : null;
        }
    } else if (focusSelection) {
        state.keyboardSelection = 'image';
    }

    renderImageList();
    syncSelectedImageControls();
    elements.drawCanvas.style.cursor = state.activeMode === 'move' ? 'grab' : 'crosshair';
    renderer.redrawAnnotations(state);
    renderer.render(state);
}

function loadImageFile(file) {
    return loadImageBlob(file, file.name);
}

function loadImageBlob(blob, name) {
    return new Promise(function(resolve, reject) {
        const objectUrl = URL.createObjectURL(blob);
        const uploadedImage = new Image();

        uploadedImage.onload = function() {
            resolve({ objectUrl, uploadedImage, sourceBlob: blob, name });
        };

        uploadedImage.onerror = function() {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`Failed to load ${name || 'image'}`));
        };

        uploadedImage.src = objectUrl;
    });
}

function addImageRecord(options) {
    const {
        objectUrl,
        uploadedImage,
        sourceBlob,
        name,
        offset,
        scale,
        flipX,
        flipY,
        rotationDeg
    } = options;

    state.images.push({
        name: name || `Image ${state.images.length + 1}`,
        objectUrl,
        sourceBlob: sourceBlob || null,
        mimeType: sourceBlob ? sourceBlob.type : '',
        texture: renderer.createTextureFromImage(uploadedImage),
        width: uploadedImage.width,
        height: uploadedImage.height,
        offset: {
            x: Number.isFinite(offset && offset.x) ? offset.x : 0,
            y: Number.isFinite(offset && offset.y) ? offset.y : 0
        },
        scale: Number.isFinite(scale) ? scale : DEFAULT_IMAGE_STATE.scale,
        flipX: flipX === -1 ? -1 : DEFAULT_IMAGE_STATE.flipX,
        flipY: flipY === -1 ? -1 : DEFAULT_IMAGE_STATE.flipY,
        rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : DEFAULT_IMAGE_STATE.rotationDeg
    });
}

function disposeImageRecord(imageRecord) {
    if (!imageRecord) {
        return;
    }
    renderer.deleteTexture(imageRecord.texture);
    if (imageRecord.objectUrl) {
        URL.revokeObjectURL(imageRecord.objectUrl);
    }
}

function removeImageAt(index) {
    if (index < 0 || index >= state.images.length) {
        return;
    }

    const removedImage = state.images.splice(index, 1)[0];
    disposeImageRecord(removedImage);

    if (!state.images.length) {
        state.selectedImageIndex = -1;
    } else if (state.selectedImageIndex > index) {
        state.selectedImageIndex -= 1;
    } else if (state.selectedImageIndex === index) {
        state.selectedImageIndex = Math.min(index, state.images.length - 1);
    }

    if (state.selectedImageIndex === -1 && state.keyboardSelection === 'image') {
        state.keyboardSelection = state.selectedShapeIndex >= 0 ? 'shape' : null;
    }

    state.moveTarget = null;
    state.lastMovePos = null;
    renderImageList();
    syncSelectedImageControls();
    renderer.redrawAnnotations(state);
    renderer.render(state);
}

function disposeAllImages() {
    for (let i = 0; i < state.images.length; i += 1) {
        disposeImageRecord(state.images[i]);
    }
    state.images.length = 0;
}

function normalizeShape(shape) {
    if (!shape || typeof shape !== 'object') {
        return null;
    }

    if (shape.type === 'line') {
        return {
            type: 'line',
            x1: Number.isFinite(shape.x1) ? shape.x1 : 0,
            y1: Number.isFinite(shape.y1) ? shape.y1 : 0,
            x2: Number.isFinite(shape.x2) ? shape.x2 : 0,
            y2: Number.isFinite(shape.y2) ? shape.y2 : 0
        };
    }

    if (shape.type === 'circle') {
        return {
            type: 'circle',
            cx: Number.isFinite(shape.cx) ? shape.cx : 0.5,
            cy: Number.isFinite(shape.cy) ? shape.cy : 0.5,
            r: Number.isFinite(shape.r) ? shape.r : 0
        };
    }

    return null;
}

function clampIndex(index, length) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
        return -1;
    }

    return index;
}

function sanitizeProject(projectData) {
    if (!projectData || typeof projectData !== 'object') {
        throw new Error('Project file is empty or invalid.');
    }

    if (projectData.app !== 'martas-mirror' || !Array.isArray(projectData.images)) {
        throw new Error('Project file is not a Marta\'s Mirror project.');
    }

    const normalizedImages = projectData.images.map(function(image, index) {
        if (!image || typeof image !== 'object' || typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) {
            throw new Error(`Image ${index + 1} is missing embedded image data.`);
        }

        return {
            name: typeof image.name === 'string' && image.name.trim() ? image.name : `Image ${index + 1}`,
            dataUrl: image.dataUrl,
            offset: {
                x: Number.isFinite(image.offset && image.offset.x) ? image.offset.x : 0,
                y: Number.isFinite(image.offset && image.offset.y) ? image.offset.y : 0
            },
            scale: Number.isFinite(image.scale) ? image.scale : DEFAULT_IMAGE_STATE.scale,
            flipX: image.flipX === -1 ? -1 : DEFAULT_IMAGE_STATE.flipX,
            flipY: image.flipY === -1 ? -1 : DEFAULT_IMAGE_STATE.flipY,
            rotationDeg: Number.isFinite(image.rotationDeg) ? image.rotationDeg : DEFAULT_IMAGE_STATE.rotationDeg
        };
    });

    const normalizedShapes = Array.isArray(projectData.shapes)
        ? projectData.shapes.map(normalizeShape).filter(Boolean)
        : [];

    const activeMode = projectData.activeMode === 'line' || projectData.activeMode === 'circle' || projectData.activeMode === 'move'
        ? projectData.activeMode
        : 'move';
    const circleRadius = Number.isFinite(projectData.circleRadius) ? projectData.circleRadius : 0.25;
    const circleCenter = {
        x: Number.isFinite(projectData.circleCenter && projectData.circleCenter.x) ? projectData.circleCenter.x : 0,
        y: Number.isFinite(projectData.circleCenter && projectData.circleCenter.y) ? projectData.circleCenter.y : 0
    };

    return {
        version: Number.isInteger(projectData.version) ? projectData.version : PROJECT_VERSION,
        images: normalizedImages,
        shapes: normalizedShapes,
        activeMode,
        circleRadius,
        circleCenter,
        selectedImageIndex: clampIndex(projectData.selectedImageIndex, normalizedImages.length),
        selectedShapeIndex: clampIndex(projectData.selectedShapeIndex, normalizedShapes.length)
    };
}

async function blobToDataUrl(blob) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() {
            resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.onerror = function() {
            reject(new Error('Failed to read image data.'));
        };
        reader.readAsDataURL(blob);
    });
}

async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) {
        throw new Error('Failed to read embedded image data.');
    }
    return response.blob();
}

function makeTimestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}-${h}${min}${s}`;
}

async function saveProject() {
    const serializedImages = [];

    for (let i = 0; i < state.images.length; i += 1) {
        const imageRecord = state.images[i];
        let sourceBlob = imageRecord.sourceBlob;

        if (!sourceBlob && imageRecord.objectUrl) {
            const response = await fetch(imageRecord.objectUrl);
            if (!response.ok) {
                throw new Error(`Failed to package ${imageRecord.name}.`);
            }
            sourceBlob = await response.blob();
        }

        if (!sourceBlob) {
            throw new Error(`Missing image data for ${imageRecord.name}.`);
        }

        serializedImages.push({
            name: imageRecord.name,
            dataUrl: await blobToDataUrl(sourceBlob),
            offset: {
                x: imageRecord.offset.x,
                y: imageRecord.offset.y
            },
            scale: imageRecord.scale,
            flipX: imageRecord.flipX,
            flipY: imageRecord.flipY,
            rotationDeg: imageRecord.rotationDeg
        });
    }

    const projectData = {
        app: 'martas-mirror',
        version: PROJECT_VERSION,
        savedAt: new Date().toISOString(),
        activeMode: state.activeMode,
        circleRadius: state.circleRadius,
        circleCenter: {
            x: state.circleCenter.x,
            y: state.circleCenter.y
        },
        selectedImageIndex: state.selectedImageIndex,
        selectedShapeIndex: state.selectedShapeIndex,
        images: serializedImages,
        shapes: state.shapes.map(function(shape) {
            return normalizeShape(shape);
        }).filter(Boolean)
    };

    const downloadBlob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(downloadBlob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `martas-mirror-project-${makeTimestamp()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
}

async function openProjectImport() {
    elements.projectImport.value = '';
    elements.projectImport.click();
}

function resetTransientState() {
    state.keyboardSelection = null;
    state.draftShape = null;
    state.shapeEditTarget = null;
    state.isDrawing = false;
    state.moveTarget = null;
    state.lastMovePos = null;
    state.pointerDownInfo = null;
}

async function applyProjectData(projectData) {
    const normalizedProject = sanitizeProject(projectData);
    const loadedImages = [];

    try {
        for (let i = 0; i < normalizedProject.images.length; i += 1) {
            const image = normalizedProject.images[i];
            const sourceBlob = await dataUrlToBlob(image.dataUrl);
            const loadedImage = await loadImageBlob(sourceBlob, image.name);
            loadedImages.push({
                objectUrl: loadedImage.objectUrl,
                uploadedImage: loadedImage.uploadedImage,
                sourceBlob: loadedImage.sourceBlob,
                name: image.name,
                offset: image.offset,
                scale: image.scale,
                flipX: image.flipX,
                flipY: image.flipY,
                rotationDeg: image.rotationDeg
            });
        }
    } catch (error) {
        for (let i = 0; i < loadedImages.length; i += 1) {
            URL.revokeObjectURL(loadedImages[i].objectUrl);
        }
        throw error;
    }

    disposeAllImages();
    resetTransientState();

    for (let i = 0; i < loadedImages.length; i += 1) {
        addImageRecord(loadedImages[i]);
    }

    state.circleRadius = normalizedProject.circleRadius;
    state.circleCenter.x = normalizedProject.circleCenter.x;
    state.circleCenter.y = normalizedProject.circleCenter.y;
    state.shapes = normalizedProject.shapes;
    state.selectedImageIndex = clampIndex(normalizedProject.selectedImageIndex, state.images.length);
    state.selectedShapeIndex = clampIndex(normalizedProject.selectedShapeIndex, state.shapes.length);
    state.keyboardSelection = state.selectedShapeIndex !== -1
        ? 'shape'
        : (state.selectedImageIndex !== -1 ? 'image' : null);

    renderImageList();
    syncSelectedImageControls();
    setActiveMode(normalizedProject.activeMode);
    renderer.redrawAnnotations(state);
    renderer.render(state);
}

async function handleProjectImport(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';

    if (!file) {
        return;
    }

    try {
        const fileText = await file.text();
        const projectData = JSON.parse(fileText);
        await applyProjectData(projectData);
    } catch (error) {
        console.error(error);
        alert(error instanceof Error ? error.message : 'Failed to import project.');
    }
}

function setActiveMode(mode) {
    state.activeMode = mode;
    elements.modeLine.classList.toggle('active', mode === 'line');
    elements.modeCircle.classList.toggle('active', mode === 'circle');
    elements.modeMove.classList.toggle('active', mode === 'move');
    elements.drawCanvas.style.cursor = mode === 'move' ? 'grab' : 'crosshair';
}

async function handleUpload(event) {
    const files = Array.from(event.target.files || []).filter(function(file) {
        return file.type.startsWith('image/');
    });

    if (!files.length) {
        event.target.value = '';
        return;
    }

    const results = await Promise.allSettled(files.map(loadImageFile));
    let newestIndex = -1;

    for (let i = 0; i < results.length; i += 1) {
        const result = results[i];
        if (result.status === 'fulfilled') {
            addImageRecord(result.value);
            newestIndex = state.images.length - 1;
        }
    }

    event.target.value = '';

    if (newestIndex !== -1) {
        selectImageByIndex(newestIndex, { focusSelection: true, clearShapeSelection: true });
    } else {
        renderImageList();
        syncSelectedImageControls();
        renderer.redrawAnnotations(state);
        renderer.render(state);
    }
}

function removeSelectedShape() {
    if (state.selectedShapeIndex < 0 || state.selectedShapeIndex >= state.shapes.length) {
        return;
    }

    state.shapes.splice(state.selectedShapeIndex, 1);
    state.shapeEditTarget = null;
    if (state.selectedShapeIndex >= state.shapes.length) {
        state.selectedShapeIndex = state.shapes.length - 1;
    }
    if (state.selectedShapeIndex === -1 && state.keyboardSelection === 'shape') {
        state.keyboardSelection = getSelectedImage(state) ? 'image' : null;
    }
    renderer.redrawAnnotations(state);
}

bindInteractions({
    documentObj: document,
    elements,
    state,
    renderer,
    app: {
        handleUpload,
        handleProjectImport,
        openProjectImport,
        saveProject,
        updateValueDisplays,
        updateToggleAppearance,
        setActiveMode,
        selectImageByIndex,
        removeImageAt,
        removeSelectedShape
    }
});

window.addEventListener('beforeunload', function() {
    for (let i = 0; i < state.images.length; i += 1) {
        disposeImageRecord(state.images[i]);
    }
});

window.addEventListener('resize', function() {
    renderer.resize(state);
});

renderImageList();
syncSelectedImageControls();
setActiveMode('move');
renderer.resize(state);
