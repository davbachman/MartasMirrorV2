import { getSelectedImage } from './state.js';

export function bindInteractions(options) {
    const {
        documentObj,
        elements,
        state,
        renderer,
        app
    } = options;
    const {
        drawCanvas,
        imageUpload,
        projectImport,
        imageList,
        scaleSlider,
        radiusSlider,
        flipHorizontal,
        flipVertical,
        rotationSlider,
        modeLine,
        modeCircle,
        modeMove,
        undoDraw,
        clearDraw,
        exportBtn,
        saveProjectBtn,
        importProjectBtn
    } = elements;

    function onPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) {
            return;
        }

        event.preventDefault();
        drawCanvas.setPointerCapture(event.pointerId);
        state.pointerDownInfo = null;

        if (state.activeMode === 'move') {
            const selectPoint = renderer.getPointerPosition(event);
            const hit = renderer.findShapeHit(state, selectPoint);
            if (hit.index !== -1) {
                state.selectedShapeIndex = hit.index;
                state.keyboardSelection = 'shape';
                if (hit.part === 'line-start' || hit.part === 'line-end') {
                    state.shapeEditTarget = {
                        mode: hit.part,
                        pointer: selectPoint
                    };
                } else if (hit.part === 'circle-inside') {
                    state.shapeEditTarget = {
                        mode: 'circle-move',
                        pointer: selectPoint
                    };
                } else if (hit.part === 'circle-edge') {
                    state.shapeEditTarget = {
                        mode: 'circle-resize',
                        pointer: selectPoint
                    };
                } else {
                    state.shapeEditTarget = null;
                }
                state.moveTarget = null;
                state.lastMovePos = null;
                drawCanvas.style.cursor = renderer.getCursorForShapeHit(hit);
                renderer.redrawAnnotations(state);
                return;
            }

            if (state.selectedShapeIndex !== -1) {
                state.selectedShapeIndex = -1;
                renderer.redrawAnnotations(state);
            }
            state.shapeEditTarget = null;
            const clickedImageIndex = renderer.findImageAtCanvasPoint(state, selectPoint);

            const pos = renderer.getMovePointerPosition(event);
            const selectedImage = getSelectedImage(state);
            const relX = pos.x - state.circleCenter.x;
            const relY = pos.y - state.circleCenter.y;
            const dist = Math.sqrt(relX * relX + relY * relY);
            const radius = state.circleRadius * 2.0;
            const edgeThreshold = 0.08;
            const centerThreshold = 0.04;
            const clickedSelectedImage = selectedImage && clickedImageIndex === state.selectedImageIndex;

            if (!selectedImage && state.images.length) {
                state.moveTarget = 'circle';
            } else if (clickedSelectedImage) {
                state.moveTarget = 'image';
            } else if (Math.abs(dist - radius) < edgeThreshold || dist < centerThreshold || (!state.images.length && dist < radius)) {
                state.moveTarget = 'circle';
            } else {
                state.moveTarget = null;
            }

            if (state.moveTarget === 'image') {
                state.keyboardSelection = 'image';
            } else if (state.moveTarget === 'circle' && selectedImage) {
                state.keyboardSelection = 'image';
            } else if (!selectedImage) {
                state.keyboardSelection = null;
            }

            state.pointerDownInfo = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                imageIndex: clickedImageIndex
            };
            state.lastMovePos = pos;
            drawCanvas.style.cursor = state.moveTarget ? 'grabbing' : 'grab';
            return;
        }

        state.selectedShapeIndex = -1;
        state.keyboardSelection = null;
        state.shapeEditTarget = null;
        state.pointerDownInfo = null;
        const start = renderer.getPointerPosition(event);
        state.isDrawing = true;

        if (state.activeMode === 'line') {
            state.draftShape = {
                type: 'line',
                x1: start.x,
                y1: start.y,
                x2: start.x,
                y2: start.y
            };
        } else if (state.activeMode === 'circle') {
            state.draftShape = {
                type: 'circle',
                cx: start.x,
                cy: start.y,
                r: 0
            };
        }
        renderer.redrawAnnotations(state);
    }

    function onPointerMove(event) {
        if (state.activeMode === 'move') {
            if (state.shapeEditTarget && state.selectedShapeIndex >= 0 && state.selectedShapeIndex < state.shapes.length) {
                event.preventDefault();
                const point = renderer.getPointerPosition(event);
                const shape = state.shapes[state.selectedShapeIndex];
                const width = drawCanvas.width;
                const height = drawCanvas.height;
                const base = Math.min(width, height);

                if (state.shapeEditTarget.mode === 'line-start' && shape.type === 'line') {
                    shape.x1 = point.x;
                    shape.y1 = point.y;
                } else if (state.shapeEditTarget.mode === 'line-end' && shape.type === 'line') {
                    shape.x2 = point.x;
                    shape.y2 = point.y;
                } else if (state.shapeEditTarget.mode === 'circle-move' && shape.type === 'circle') {
                    const dx = point.x - state.shapeEditTarget.pointer.x;
                    const dy = point.y - state.shapeEditTarget.pointer.y;
                    shape.cx = Math.max(0, Math.min(1, shape.cx + dx));
                    shape.cy = Math.max(0, Math.min(1, shape.cy + dy));
                    state.shapeEditTarget.pointer = point;
                } else if (state.shapeEditTarget.mode === 'circle-resize' && shape.type === 'circle') {
                    const cx = shape.cx * width;
                    const cy = shape.cy * height;
                    const px = point.x * width;
                    const py = point.y * height;
                    const radiusPx = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
                    shape.r = Math.max(0.005, radiusPx / base);
                    state.shapeEditTarget.pointer = point;
                }

                renderer.redrawAnnotations(state);
                return;
            }

            if (!state.moveTarget || !state.lastMovePos) {
                const hoverHit = renderer.findShapeHit(state, renderer.getPointerPosition(event));
                drawCanvas.style.cursor = renderer.getCursorForShapeHit(hoverHit);
                return;
            }

            event.preventDefault();
            const pos = renderer.getMovePointerPosition(event);
            const dx = pos.x - state.lastMovePos.x;
            const dy = pos.y - state.lastMovePos.y;
            const selectedImage = getSelectedImage(state);

            if (state.moveTarget === 'circle') {
                state.circleCenter.x += dx;
                state.circleCenter.y += dy;
                if (!selectedImage) {
                    for (let i = 0; i < state.images.length; i += 1) {
                        state.images[i].offset.x += dx;
                        state.images[i].offset.y += dy;
                    }
                }
                renderer.redrawAnnotations(state);
            } else if (state.moveTarget === 'image' && selectedImage) {
                selectedImage.offset.x += dx;
                selectedImage.offset.y += dy;
            }

            state.lastMovePos = pos;
            renderer.render(state);
            return;
        }

        if (!state.isDrawing || !state.draftShape) {
            return;
        }

        event.preventDefault();
        const point = renderer.getPointerPosition(event);

        if (state.draftShape.type === 'line') {
            state.draftShape.x2 = point.x;
            state.draftShape.y2 = point.y;
        } else {
            const dx = point.x - state.draftShape.cx;
            const dy = point.y - state.draftShape.cy;
            state.draftShape.r = Math.sqrt(dx * dx + dy * dy);
        }
        renderer.redrawAnnotations(state);
    }

    function onPointerUp(event) {
        if (state.activeMode === 'move') {
            const downInfo = state.pointerDownInfo;
            const movedDistance = downInfo
                ? Math.hypot(event.clientX - downInfo.clientX, event.clientY - downInfo.clientY)
                : Infinity;
            const clickedImageIndex = downInfo && downInfo.pointerId === event.pointerId && movedDistance <= 6
                ? downInfo.imageIndex
                : -1;

            state.pointerDownInfo = null;
            state.shapeEditTarget = null;
            state.moveTarget = null;
            state.lastMovePos = null;
            drawCanvas.style.cursor = 'grab';
            if (drawCanvas.hasPointerCapture(event.pointerId)) {
                drawCanvas.releasePointerCapture(event.pointerId);
            }

            if (clickedImageIndex !== -1) {
                if (clickedImageIndex === state.selectedImageIndex) {
                    app.selectImageByIndex(-1, { focusSelection: false, clearShapeSelection: true });
                } else {
                    app.selectImageByIndex(clickedImageIndex, { focusSelection: true, clearShapeSelection: true });
                }
            }
            return;
        }

        if (!state.isDrawing) {
            return;
        }

        event.preventDefault();
        if (state.draftShape) {
            state.shapes.push(state.draftShape);
            state.selectedShapeIndex = state.shapes.length - 1;
            state.keyboardSelection = 'shape';
            state.draftShape = null;
        }
        state.isDrawing = false;
        if (drawCanvas.hasPointerCapture(event.pointerId)) {
            drawCanvas.releasePointerCapture(event.pointerId);
        }
        renderer.redrawAnnotations(state);
    }

    function onPointerCancel(event) {
        if (state.activeMode === 'move') {
            state.pointerDownInfo = null;
            state.shapeEditTarget = null;
            state.moveTarget = null;
            state.lastMovePos = null;
            drawCanvas.style.cursor = 'grab';
            if (drawCanvas.hasPointerCapture(event.pointerId)) {
                drawCanvas.releasePointerCapture(event.pointerId);
            }
            return;
        }

        if (!state.isDrawing) {
            return;
        }

        event.preventDefault();
        state.draftShape = null;
        state.isDrawing = false;
        state.pointerDownInfo = null;
        if (drawCanvas.hasPointerCapture(event.pointerId)) {
            drawCanvas.releasePointerCapture(event.pointerId);
        }
        renderer.redrawAnnotations(state);
    }

    imageUpload.addEventListener('change', app.handleUpload);
    projectImport.addEventListener('change', function(event) {
        void app.handleProjectImport(event);
    });
    imageList.addEventListener('click', function(event) {
        const target = event.target;
        const button = target instanceof Element ? target.closest('.image-item') : null;
        if (!button || button.dataset.index === undefined) {
            return;
        }

        const imageIndex = parseInt(button.dataset.index, 10);
        if (imageIndex === state.selectedImageIndex) {
            app.selectImageByIndex(-1, { focusSelection: false, clearShapeSelection: true });
            return;
        }

        app.selectImageByIndex(imageIndex, { focusSelection: true, clearShapeSelection: true });
    });

    scaleSlider.addEventListener('input', function(event) {
        const selectedImage = getSelectedImage(state);
        if (!selectedImage) {
            return;
        }

        selectedImage.scale = parseFloat(event.target.value);
        state.keyboardSelection = 'image';
        app.updateValueDisplays();
        renderer.render(state);
    });

    radiusSlider.addEventListener('input', function(event) {
        state.circleRadius = parseFloat(event.target.value);
        app.updateValueDisplays();
        renderer.redrawAnnotations(state);
        renderer.render(state);
    });

    flipHorizontal.addEventListener('click', function() {
        const selectedImage = getSelectedImage(state);
        if (!selectedImage) {
            return;
        }

        selectedImage.flipX *= -1.0;
        state.keyboardSelection = 'image';
        app.updateToggleAppearance();
        renderer.render(state);
    });

    flipVertical.addEventListener('click', function() {
        const selectedImage = getSelectedImage(state);
        if (!selectedImage) {
            return;
        }

        selectedImage.flipY *= -1.0;
        state.keyboardSelection = 'image';
        app.updateToggleAppearance();
        renderer.render(state);
    });

    rotationSlider.addEventListener('input', function(event) {
        const selectedImage = getSelectedImage(state);
        if (!selectedImage) {
            return;
        }

        selectedImage.rotationDeg = parseInt(event.target.value, 10);
        state.keyboardSelection = 'image';
        app.updateValueDisplays();
        renderer.render(state);
    });

    modeLine.addEventListener('click', function() {
        app.setActiveMode('line');
    });

    modeCircle.addEventListener('click', function() {
        app.setActiveMode('circle');
    });

    modeMove.addEventListener('click', function() {
        app.setActiveMode('move');
    });

    undoDraw.addEventListener('click', function() {
        if (state.shapes.length > 0) {
            state.shapes.pop();
            if (state.selectedShapeIndex >= state.shapes.length) {
                state.selectedShapeIndex = state.shapes.length - 1;
            }
            if (state.selectedShapeIndex === -1 && state.keyboardSelection === 'shape') {
                state.keyboardSelection = getSelectedImage(state) ? 'image' : null;
            }
            renderer.redrawAnnotations(state);
        }
    });

    clearDraw.addEventListener('click', function() {
        state.shapes.length = 0;
        state.selectedShapeIndex = -1;
        if (state.keyboardSelection === 'shape') {
            state.keyboardSelection = getSelectedImage(state) ? 'image' : null;
        }
        renderer.redrawAnnotations(state);
    });

    exportBtn.addEventListener('click', function() {
        renderer.exportBitmap(state);
    });

    saveProjectBtn.addEventListener('click', function() {
        void app.saveProject().catch(function(error) {
            console.error(error);
            alert(error instanceof Error ? error.message : 'Failed to save project.');
        });
    });

    importProjectBtn.addEventListener('click', function() {
        app.openProjectImport();
    });

    drawCanvas.addEventListener('pointerdown', onPointerDown);
    drawCanvas.addEventListener('pointermove', onPointerMove);
    drawCanvas.addEventListener('pointerup', onPointerUp);
    drawCanvas.addEventListener('pointercancel', onPointerCancel);

    documentObj.addEventListener('keydown', function(event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return;
        }

        const activeEl = documentObj.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            return;
        }

        const canDeleteImage = state.selectedImageIndex >= 0 && state.selectedImageIndex < state.images.length;
        const canDeleteShape = state.selectedShapeIndex >= 0 && state.selectedShapeIndex < state.shapes.length;

        if (!canDeleteImage && !canDeleteShape) {
            return;
        }

        event.preventDefault();

        if (state.keyboardSelection === 'shape' && canDeleteShape) {
            app.removeSelectedShape();
            return;
        }

        if (state.keyboardSelection === 'image' && canDeleteImage) {
            app.removeImageAt(state.selectedImageIndex);
            return;
        }

        if (canDeleteImage) {
            app.removeImageAt(state.selectedImageIndex);
            return;
        }

        app.removeSelectedShape();
    });
}
