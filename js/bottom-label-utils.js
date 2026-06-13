import { blackMaterial, whiteMaterial } from './config.js';
import { MIN_THICKNESS, SPECIAL_MARKERS } from './aruco-utils.js';
import { createBoxAt, mergeAndDisposeGeometries } from './geometry-utils.js';

export const BOTTOM_LABEL_DEPTH = 0.2;

const MIN_LABEL_BAND_HEIGHT = 3;
const MAX_LABEL_BAND_HEIGHT = 8;
const TARGET_CELL_SIZE = 0.45;
const CANVAS_SCALE = 4;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getOppositeMaterial(baseColor) {
    return baseColor === 'black' ? whiteMaterial : blackMaterial;
}

export function getBottomLabelMaterial(extrusionType, baseColor = null) {
    if (baseColor) {
        return getOppositeMaterial(baseColor);
    }

    return extrusionType === 'negative' ? whiteMaterial : blackMaterial;
}

export function getMarkerBottomLabelText(dictName, markerId) {
    if (markerId === SPECIAL_MARKERS.PURE_WHITE) return 'PURE WHITE';
    if (markerId === SPECIAL_MARKERS.PURE_BLACK) return 'PURE BLACK';
    return `${dictName} ID ${markerId}`;
}

export function getMarkerBaseColor(markerId, extrusionType) {
    if (markerId === SPECIAL_MARKERS.PURE_WHITE) return 'white';
    if (markerId === SPECIAL_MARKERS.PURE_BLACK) return 'black';
    return extrusionType === 'negative' ? 'black' : 'white';
}

function getLabelBand(width, height) {
    const marginX = clamp(Math.min(width, height) * 0.08, 0.8, 4);
    const marginY = clamp(Math.min(width, height) * 0.08, 0.8, 4);
    const labelWidth = Math.max(width - 2 * marginX, MIN_THICKNESS);
    const maxHeightFromPlate = Math.max(height - 2 * marginY, MIN_LABEL_BAND_HEIGHT);
    const labelHeight = clamp(height * 0.18, MIN_LABEL_BAND_HEIGHT, Math.min(MAX_LABEL_BAND_HEIGHT, maxHeightFromPlate));

    return {
        minX: -labelWidth / 2,
        maxX: labelWidth / 2,
        minY: -labelHeight / 2,
        maxY: labelHeight / 2,
        width: labelWidth,
        height: labelHeight
    };
}

function createTextMask(text, cols, rows) {
    const canvas = document.createElement('canvas');
    canvas.width = cols * CANVAS_SCALE;
    canvas.height = rows * CANVAS_SCALE;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const printableText = String(text || '').trim().slice(0, 64);
    let fontSize = canvas.height * 0.7;
    do {
        ctx.font = `700 ${fontSize}px Arial, sans-serif`;
        if (ctx.measureText(printableText).width <= canvas.width * 0.92) break;
        fontSize -= 1;
    } while (fontSize > canvas.height * 0.25);

    ctx.fillText(printableText, canvas.width / 2, canvas.height / 2);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = Array.from({ length: rows }, () => Array(cols).fill(false));

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let hits = 0;
            let samples = 0;
            const x0 = col * CANVAS_SCALE;
            const y0 = row * CANVAS_SCALE;

            for (let y = 0; y < CANVAS_SCALE; y++) {
                for (let x = 0; x < CANVAS_SCALE; x++) {
                    const pixel = ((y0 + y) * canvas.width + x0 + x) * 4;
                    const value = image[pixel];
                    if (value > 48) hits++;
                    samples++;
                }
            }

            mask[row][col] = hits / samples > 0.12;
        }
    }

    return dilateMask(mask, cols, rows);
}

function dilateMask(mask, cols, rows) {
    const dilated = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (!mask[row][col]) continue;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const y = row + dy;
                    const x = col + dx;
                    if (y >= 0 && y < rows && x >= 0 && x < cols) {
                        dilated[y][x] = true;
                    }
                }
            }
        }
    }
    return dilated;
}

function addBandRun(geometries, band, colStart, colEnd, row, cellWidth, cellHeight, depth, zCenter) {
    const runWidth = (colEnd - colStart) * cellWidth;
    if (runWidth < MIN_THICKNESS) return;

    const x = band.minX + colStart * cellWidth + runWidth / 2;
    const y = band.maxY - row * cellHeight - cellHeight / 2;
    geometries.push(createBoxAt(runWidth, cellHeight, depth, x, y, zCenter));
}

export function createEngravedLabelPlate({
    text,
    width,
    height,
    material,
    centerX = 0,
    centerY = 0,
    zTop = 0,
    depth = BOTTOM_LABEL_DEPTH,
    name = 'bottom_label'
}) {
    if (!text || width <= MIN_THICKNESS || height <= MIN_THICKNESS || depth <= 0) {
        return null;
    }

    const band = getLabelBand(width, height);
    const cols = clamp(Math.round(band.width / TARGET_CELL_SIZE), 24, 160);
    const rows = clamp(Math.round(band.height / TARGET_CELL_SIZE), 8, 24);
    const cellWidth = band.width / cols;
    const cellHeight = band.height / rows;
    const zCenter = zTop - depth / 2;
    const minY = -height / 2;
    const maxY = height / 2;
    const geometries = [];

    if (band.maxY < maxY - MIN_THICKNESS) {
        const topHeight = maxY - band.maxY;
        geometries.push(createBoxAt(width, topHeight, depth, 0, band.maxY + topHeight / 2, zCenter));
    }

    if (band.minY > minY + MIN_THICKNESS) {
        const bottomHeight = band.minY - minY;
        geometries.push(createBoxAt(width, bottomHeight, depth, 0, minY + bottomHeight / 2, zCenter));
    }

    const mask = createTextMask(text, cols, rows);
    for (let row = 0; row < rows; row++) {
        let runStart = null;
        for (let col = 0; col <= cols; col++) {
            const isHole = col < cols ? mask[row][col] : true;
            if (!isHole && runStart === null) {
                runStart = col;
            } else if ((isHole || col === cols) && runStart !== null) {
                addBandRun(geometries, band, runStart, col, row, cellWidth, cellHeight, depth, zCenter);
                runStart = null;
            }
        }
    }

    const mesh = mergeAndDisposeGeometries(geometries, material);
    if (!mesh) return null;

    mesh.position.set(centerX, centerY, 0);
    mesh.name = name;
    mesh.userData.bottomLabel = true;
    mesh.userData.labelText = text;
    return mesh;
}
