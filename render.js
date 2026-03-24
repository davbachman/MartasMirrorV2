import { getImageIndicesInRenderOrder, getImagesInRenderOrder } from './state.js';

export function createRenderer(options) {
    const {
        canvasContainer,
        canvasArea,
        canvas,
        drawCanvas,
        vertexShaderSource,
        fragmentShaderSource
    } = options;

    const drawCtx = drawCanvas.getContext('2d');
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });

    if (!gl) {
        alert('WebGL not supported');
        throw new Error('WebGL not supported');
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    if (!vertexShader || !fragmentShader || !program) {
        throw new Error('Failed to initialize WebGL program');
    }

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const imageOffsetLocation = gl.getUniformLocation(program, 'u_imageOffset');
    const imageScaleLocation = gl.getUniformLocation(program, 'u_imageScale');
    const circleRadiusLocation = gl.getUniformLocation(program, 'u_circleRadius');
    const imageSizeLocation = gl.getUniformLocation(program, 'u_imageSize');
    const imageLocation = gl.getUniformLocation(program, 'u_image');
    const circleCenterLocation = gl.getUniformLocation(program, 'u_circleCenter');
    const flipXLocation = gl.getUniformLocation(program, 'u_flipX');
    const flipYLocation = gl.getUniformLocation(program, 'u_flipY');
    const rotationLocation = gl.getUniformLocation(program, 'u_rotation');
    const renderModeLocation = gl.getUniformLocation(program, 'u_renderMode');

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
    ]), gl.STATIC_DRAW);

    const fallbackTexture = gl.createTexture();
    initializeBlankTexture();

    function resize(state) {
        const width = Math.max(1, Math.floor(canvasArea.clientWidth));
        const height = Math.max(1, Math.floor(canvasArea.clientHeight));

        canvasContainer.style.width = `${width}px`;
        canvasContainer.style.height = `${height}px`;
        canvas.width = width;
        canvas.height = height;
        drawCanvas.width = width;
        drawCanvas.height = height;
        drawCanvas.style.width = `${width}px`;
        drawCanvas.style.height = `${height}px`;
        gl.viewport(0, 0, width, height);

        redrawAnnotations(state);
        render(state);
    }

    function createTextureFromImage(imageSource) {
        const imageTexture = gl.createTexture();
        configureTexture(imageTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);
        return imageTexture;
    }

    function deleteTexture(texture) {
        if (texture) {
            gl.deleteTexture(texture);
        }
    }

    function getPointerPosition(event) {
        const rect = drawCanvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
        };
    }

    function getMovePointerPosition(event) {
        const rect = drawCanvas.getBoundingClientRect();
        const aspect = rect.width / rect.height;
        return {
            x: ((event.clientX - rect.left) / rect.width * 2 - 1) * aspect,
            y: -((event.clientY - rect.top) / rect.height * 2 - 1)
        };
    }

    function findShapeHit(state, point) {
        const width = drawCanvas.width;
        const height = drawCanvas.height;
        const base = Math.min(width, height);
        const px = point.x * width;
        const py = point.y * height;
        const endpointTolerancePx = 12;
        const lineTolerancePx = 10;
        const circleEdgeTolerancePx = 10;

        for (let i = state.shapes.length - 1; i >= 0; i -= 1) {
            const shape = state.shapes[i];
            if (shape.type === 'line') {
                const x1 = shape.x1 * width;
                const y1 = shape.y1 * height;
                const x2 = shape.x2 * width;
                const y2 = shape.y2 * height;
                const startDist = Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
                const endDist = Math.sqrt((px - x2) * (px - x2) + (py - y2) * (py - y2));

                if (startDist <= endpointTolerancePx) {
                    return { index: i, part: 'line-start' };
                }
                if (endDist <= endpointTolerancePx) {
                    return { index: i, part: 'line-end' };
                }
                if (distancePointToSegment(px, py, x1, y1, x2, y2) <= lineTolerancePx) {
                    return { index: i, part: 'line-body' };
                }
            } else {
                const cx = shape.cx * width;
                const cy = shape.cy * height;
                const radiusPx = shape.r * base;
                const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
                const nearEdge = Math.abs(dist - radiusPx) <= circleEdgeTolerancePx;
                const inside = dist < radiusPx - circleEdgeTolerancePx;
                const tinyCircleHit = radiusPx < circleEdgeTolerancePx && dist <= radiusPx + circleEdgeTolerancePx;

                if (nearEdge || tinyCircleHit) {
                    return { index: i, part: 'circle-edge' };
                }
                if (inside) {
                    return { index: i, part: 'circle-inside' };
                }
            }
        }

        return { index: -1, part: null };
    }

    function getCursorForShapeHit(hit) {
        if (!hit || hit.index === -1) {
            return 'grab';
        }
        if (hit.part === 'line-start' || hit.part === 'line-end') {
            return 'crosshair';
        }
        if (hit.part === 'circle-edge') {
            return 'nesw-resize';
        }
        if (hit.part === 'circle-inside') {
            return 'move';
        }
        return 'pointer';
    }

    function findImageAtCanvasPoint(state, point) {
        const imageIndices = getImageIndicesInRenderOrder(state);
        const planePoint = getPlanePointAtCanvasPoint(point);
        const invertedPlanePoint = getInvertedPlanePoint(state, planePoint);

        for (let i = imageIndices.length - 1; i >= 0; i -= 1) {
            const imageIndex = imageIndices[i];
            const imageRecord = state.images[imageIndex];
            if (getImageUvAtPlanePoint(imageRecord, planePoint) || (invertedPlanePoint && getImageUvAtPlanePoint(imageRecord, invertedPlanePoint))) {
                return imageIndex;
            }
        }

        return -1;
    }

    function redrawAnnotations(state) {
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        drawCircleOverlay(state);
        for (let i = 0; i < state.shapes.length; i += 1) {
            drawShape(state.shapes[i], false, i === state.selectedShapeIndex);
        }
        if (state.draftShape) {
            drawShape(state.draftShape, true, false);
        }
    }

    function render(state) {
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(circleRadiusLocation, state.circleRadius);
        gl.uniform2f(circleCenterLocation, state.circleCenter.x, state.circleCenter.y);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(imageLocation, 0);

        gl.disable(gl.BLEND);
        gl.uniform1f(renderModeLocation, 0.0);
        gl.uniform2f(imageOffsetLocation, 0.0, 0.0);
        gl.uniform1f(imageScaleLocation, 1.0);
        gl.uniform2f(imageSizeLocation, 1.0, 1.0);
        gl.uniform1f(flipXLocation, 1.0);
        gl.uniform1f(flipYLocation, 1.0);
        gl.uniform1f(rotationLocation, 0.0);
        gl.bindTexture(gl.TEXTURE_2D, fallbackTexture);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        const renderImages = getImagesInRenderOrder(state);
        if (!renderImages.length) {
            return;
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        for (let i = 0; i < renderImages.length; i += 1) {
            const imageRecord = renderImages[i];
            gl.uniform2f(imageOffsetLocation, imageRecord.offset.x, imageRecord.offset.y);
            gl.uniform1f(imageScaleLocation, imageRecord.scale);
            gl.uniform2f(imageSizeLocation, imageRecord.width, imageRecord.height);
            gl.uniform1f(flipXLocation, imageRecord.flipX);
            gl.uniform1f(flipYLocation, imageRecord.flipY);
            gl.uniform1f(rotationLocation, imageRecord.rotationDeg * Math.PI / 180.0);
            gl.bindTexture(gl.TEXTURE_2D, imageRecord.texture || fallbackTexture);
            gl.uniform1f(renderModeLocation, 1.0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.uniform1f(renderModeLocation, 2.0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.disable(gl.BLEND);
    }

    function exportBitmap(state) {
        render(state);
        redrawAnnotations(state);
        gl.finish();

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const exportCtx = exportCanvas.getContext('2d');
        if (!exportCtx) {
            return;
        }

        exportCtx.drawImage(canvas, 0, 0);
        exportCtx.drawImage(drawCanvas, 0, 0);

        exportCanvas.toBlob(function(blob) {
            if (!blob) {
                return;
            }
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `martas-mirror-${makeTimestamp()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
        }, 'image/png');
    }

    function createShader(glContext, type, source) {
        const shader = glContext.createShader(type);
        glContext.shaderSource(shader, source);
        glContext.compileShader(shader);

        if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
            console.error('Shader compile error:', glContext.getShaderInfoLog(shader));
            glContext.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(glContext, vertexShaderRef, fragmentShaderRef) {
        const shaderProgram = glContext.createProgram();
        glContext.attachShader(shaderProgram, vertexShaderRef);
        glContext.attachShader(shaderProgram, fragmentShaderRef);
        glContext.linkProgram(shaderProgram);

        if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
            console.error('Program link error:', glContext.getProgramInfoLog(shaderProgram));
            glContext.deleteProgram(shaderProgram);
            return null;
        }
        return shaderProgram;
    }

    function configureTexture(texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    function initializeBlankTexture() {
        configureTexture(fallbackTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0])
        );
    }

    function getPlanePointAtCanvasPoint(point) {
        const aspect = canvas.width / canvas.height;
        return {
            x: (point.x - 0.5) * 2.0 * aspect,
            y: (0.5 - point.y) * 2.0
        };
    }

    function invertCirclePoint(point, radius) {
        const distanceSq = point.x * point.x + point.y * point.y;
        if (radius <= 0 || distanceSq <= 0.000001) {
            return null;
        }

        const inversionScale = radius * radius / distanceSq;
        return {
            x: point.x * inversionScale,
            y: point.y * inversionScale
        };
    }

    function getInvertedPlanePoint(state, planePoint) {
        if (state.circleRadius <= 0) {
            return null;
        }

        const circleRelative = {
            x: planePoint.x - state.circleCenter.x,
            y: planePoint.y - state.circleCenter.y
        };
        const radius = state.circleRadius * 2.0;
        const invertedRelative = invertCirclePoint(circleRelative, radius);
        if (!invertedRelative) {
            return null;
        }

        return {
            x: state.circleCenter.x + invertedRelative.x,
            y: state.circleCenter.y + invertedRelative.y
        };
    }

    function getImageUvAtPlanePoint(imageRecord, planePoint) {
        if (!planePoint || !imageRecord || imageRecord.scale === 0) {
            return null;
        }

        const imageAspectRatio = imageRecord.width / imageRecord.height;
        let centeredX = planePoint.x;
        let centeredY = planePoint.y;

        centeredX -= imageRecord.offset.x;
        centeredY -= imageRecord.offset.y;
        centeredX /= imageRecord.scale;
        centeredY /= imageRecord.scale;

        if (imageAspectRatio > 1.0) {
            centeredY *= imageAspectRatio;
        } else {
            centeredX /= imageAspectRatio;
        }

        centeredX *= imageRecord.flipX;
        centeredY *= imageRecord.flipY;

        const rotationRad = imageRecord.rotationDeg * Math.PI / 180.0;
        const cosRotation = Math.cos(rotationRad);
        const sinRotation = Math.sin(rotationRad);
        const rotatedX = centeredX * cosRotation - centeredY * sinRotation;
        const rotatedY = centeredX * sinRotation + centeredY * cosRotation;
        const imageUv = {
            x: rotatedX * 0.5 + 0.5,
            y: rotatedY * 0.5 + 0.5
        };

        if (imageUv.x < 0 || imageUv.x > 1 || imageUv.y < 0 || imageUv.y > 1) {
            return null;
        }

        return imageUv;
    }

    function drawShape(shape, isPreview, isSelected) {
        const width = drawCanvas.width;
        const height = drawCanvas.height;
        const base = Math.min(width, height);

        drawCtx.lineWidth = isSelected ? 3 : 2;
        drawCtx.strokeStyle = isSelected ? 'rgba(255, 220, 40, 0.95)' : 'rgba(57, 255, 20, 0.95)';
        drawCtx.setLineDash(isPreview ? [6, 4] : []);
        drawCtx.beginPath();

        if (shape.type === 'line') {
            drawCtx.moveTo(shape.x1 * width, shape.y1 * height);
            drawCtx.lineTo(shape.x2 * width, shape.y2 * height);
        } else {
            drawCtx.arc(shape.cx * width, shape.cy * height, shape.r * base, 0, Math.PI * 2);
        }

        drawCtx.stroke();
        drawCtx.setLineDash([]);
    }

    function drawCircleOverlay(state) {
        const width = drawCanvas.width;
        const height = drawCanvas.height;
        const centerX = width * 0.5 + state.circleCenter.x * height * 0.5;
        const centerY = height * 0.5 - state.circleCenter.y * height * 0.5;
        const radiusPx = state.circleRadius * height;
        const pointRadius = Math.max(4, height * 0.0075);

        drawCtx.save();
        drawCtx.strokeStyle = 'rgba(38, 38, 38, 0.95)';
        drawCtx.lineWidth = 1.5;
        drawCtx.beginPath();
        drawCtx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
        drawCtx.stroke();

        drawCtx.fillStyle = 'rgba(38, 38, 38, 0.95)';
        drawCtx.beginPath();
        drawCtx.arc(centerX, centerY, pointRadius, 0, Math.PI * 2);
        drawCtx.fill();
        drawCtx.restore();
    }

    function distancePointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            const dpx = px - x1;
            const dpy = py - y1;
            return Math.sqrt(dpx * dpx + dpy * dpy);
        }

        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        const dpx = px - projX;
        const dpy = py - projY;
        return Math.sqrt(dpx * dpx + dpy * dpy);
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

    return {
        resize,
        createTextureFromImage,
        deleteTexture,
        getPointerPosition,
        getMovePointerPosition,
        findShapeHit,
        getCursorForShapeHit,
        findImageAtCanvasPoint,
        redrawAnnotations,
        render,
        exportBitmap
    };
}
