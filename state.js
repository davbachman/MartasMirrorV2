export const DEFAULT_IMAGE_STATE = Object.freeze({
    scale: 0.5,
    flipX: 1.0,
    flipY: 1.0,
    rotationDeg: 0
});

export function createState() {
    return {
        images: [],
        selectedImageIndex: -1,
        keyboardSelection: null,
        circleRadius: 0.25,
        circleCenter: { x: 0, y: 0 },
        activeMode: 'move',
        shapes: [],
        draftShape: null,
        selectedShapeIndex: -1,
        shapeEditTarget: null,
        isDrawing: false,
        moveTarget: null,
        lastMovePos: null,
        pointerDownInfo: null
    };
}

export function getSelectedImage(state) {
    if (state.selectedImageIndex < 0 || state.selectedImageIndex >= state.images.length) {
        return null;
    }

    return state.images[state.selectedImageIndex];
}

export function getImageIndicesInRenderOrder(state) {
    const imageIndices = state.images.map(function(_, index) {
        return index;
    });

    if (state.selectedImageIndex < 0 || state.selectedImageIndex >= state.images.length) {
        return imageIndices;
    }

    imageIndices.splice(state.selectedImageIndex, 1);
    imageIndices.push(state.selectedImageIndex);
    return imageIndices;
}

export function getImagesInRenderOrder(state) {
    return getImageIndicesInRenderOrder(state).map(function(imageIndex) {
        return state.images[imageIndex];
    });
}
