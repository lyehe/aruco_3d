const textEncoder = new TextEncoder();
const COORDINATE_SCALE = 1000000;
const MIN_DIMENSION = 1 / COORDINATE_SCALE;

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return '0';
    const normalized = Math.abs(value) < 1e-9 ? 0 : value;
    return Number(normalized.toFixed(6)).toString();
}

function hexByte(value) {
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0').toUpperCase();
}

function getColorName(displayColor) {
    switch (displayColor) {
        case '#F0F0F0FF':
            return 'white';
        case '#1A1A1AFF':
            return 'black';
        default:
            return `color ${displayColor.slice(0, 7)}`;
    }
}

function getMaterialDescriptor(material) {
    const source = Array.isArray(material) ? material[0] : material;
    const color = source?.color || new THREE.Color(0xcccccc);
    const opacity = source?.transparent ? source.opacity : 1;
    const displayColor = `#${color.getHexString().toUpperCase()}${hexByte(Math.round((opacity ?? 1) * 255))}`;
    const colorName = getColorName(displayColor);

    return {
        key: displayColor,
        name: colorName,
        meshName: colorName,
        displayColor
    };
}

function getMaterialSortRank(material) {
    if (material.displayColor === '#F0F0F0FF') return 0;
    if (material.displayColor === '#1A1A1AFF') return 1;
    return 2;
}

function getExtruderIndex(material) {
    if (material.displayColor === '#F0F0F0FF') return 2;
    if (material.displayColor === '#1A1A1AFF') return 1;
    return 1;
}

function normalizeCoordinate(value) {
    return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

function coordinateKey(value) {
    return normalizeCoordinate(value).toFixed(6);
}

function cellKey(x, y, z) {
    return `${x},${y},${z}`;
}

function parseCellKey(key) {
    return key.split(',').map(Number);
}

function addSortedCoordinate(target, value) {
    target.add(coordinateKey(value));
}

function makeCoordinateArray(keys) {
    return Array.from(keys)
        .map(Number)
        .sort((a, b) => a - b);
}

function indexCoordinates(values) {
    const index = new Map();
    values.forEach((value, i) => index.set(coordinateKey(value), i));
    return index;
}

function getChunkLayout(geometry) {
    const position = geometry.attributes?.position;
    if (!position) return null;

    if (geometry.index && geometry.index.count % 36 === 0 && position.count % 24 === 0) {
        return {
            count: Math.min(geometry.index.count / 36, position.count / 24),
            verticesPerCuboid: 24,
            indicesPerCuboid: 36
        };
    }

    if (position.count % 24 === 0) {
        return {
            count: position.count / 24,
            verticesPerCuboid: 24,
            indicesPerCuboid: 0
        };
    }

    if (position.count % 36 === 0) {
        return {
            count: position.count / 36,
            verticesPerCuboid: 36,
            indicesPerCuboid: 0
        };
    }

    return null;
}

function getMaterialForChunk(object, geometry, chunkIndex, layout) {
    if (!Array.isArray(object.material)) return object.material;
    if (!geometry.groups || geometry.groups.length === 0) return object.material[0];

    const chunkStart = layout.indicesPerCuboid > 0
        ? chunkIndex * layout.indicesPerCuboid
        : chunkIndex * layout.verticesPerCuboid;

    const group = geometry.groups.find(candidate =>
        chunkStart >= candidate.start && chunkStart < candidate.start + candidate.count
    );

    return object.material[group?.materialIndex ?? 0] || object.material[0];
}

function getCuboidFromChunk(position, matrixWorld, vertexStart, vertexCount) {
    const vertex = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < vertexCount; i++) {
        vertex.fromBufferAttribute(position, vertexStart + i).applyMatrix4(matrixWorld);
        min.min(vertex);
        max.max(vertex);
    }

    const cuboid = {
        minX: normalizeCoordinate(min.x),
        minY: normalizeCoordinate(min.y),
        minZ: normalizeCoordinate(min.z),
        maxX: normalizeCoordinate(max.x),
        maxY: normalizeCoordinate(max.y),
        maxZ: normalizeCoordinate(max.z)
    };

    if (
        cuboid.maxX - cuboid.minX < MIN_DIMENSION ||
        cuboid.maxY - cuboid.minY < MIN_DIMENSION ||
        cuboid.maxZ - cuboid.minZ < MIN_DIMENSION
    ) {
        return null;
    }

    return cuboid;
}

function collectCuboids(root) {
    const colorMeshes = new Map();

    root.updateMatrixWorld(true);
    root.traverse(object => {
        if (!object.isMesh || !object.geometry?.attributes?.position) return;

        const geometry = object.geometry;
        const position = geometry.attributes.position;
        const layout = getChunkLayout(geometry);

        if (!layout || layout.count === 0) {
            console.warn('Skipping non-box mesh during 3MF export:', object.name || object.uuid);
            return;
        }

        for (let chunkIndex = 0; chunkIndex < layout.count; chunkIndex++) {
            const material = getMaterialForChunk(object, geometry, chunkIndex, layout);
            const materialDescriptor = getMaterialDescriptor(material);
            if (!colorMeshes.has(materialDescriptor.key)) {
                colorMeshes.set(materialDescriptor.key, {
                    name: materialDescriptor.meshName,
                    material: materialDescriptor,
                    cuboids: [],
                    vertices: [],
                    triangles: []
                });
            }

            const colorMesh = colorMeshes.get(materialDescriptor.key);
            const cuboid = getCuboidFromChunk(
                position,
                object.matrixWorld,
                chunkIndex * layout.verticesPerCuboid,
                layout.verticesPerCuboid
            );

            if (cuboid) {
                colorMesh.cuboids.push(cuboid);
            }
        }
    });

    return Array.from(colorMeshes.values()).filter(mesh => mesh.cuboids.length > 0);
}

function addVertex(vertices, vertexIndexes, point) {
    const key = point.map(coordinateKey).join(',');
    if (!vertexIndexes.has(key)) {
        vertexIndexes.set(key, vertices.length);
        vertices.push(point);
    }
    return vertexIndexes.get(key);
}

function addQuad(mesh, vertexIndexes, points) {
    const v = points.map(point => addVertex(mesh.vertices, vertexIndexes, point));
    mesh.triangles.push([v[0], v[1], v[2]]);
    mesh.triangles.push([v[0], v[2], v[3]]);
}

function addBoundaryFace(mesh, vertexIndexes, xs, ys, zs, x, y, z, side) {
    const x0 = xs[x];
    const x1 = xs[x + 1];
    const y0 = ys[y];
    const y1 = ys[y + 1];
    const z0 = zs[z];
    const z1 = zs[z + 1];

    switch (side) {
        case 'minX':
            addQuad(mesh, vertexIndexes, [
                [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]
            ]);
            break;
        case 'maxX':
            addQuad(mesh, vertexIndexes, [
                [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]
            ]);
            break;
        case 'minY':
            addQuad(mesh, vertexIndexes, [
                [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]
            ]);
            break;
        case 'maxY':
            addQuad(mesh, vertexIndexes, [
                [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]
            ]);
            break;
        case 'minZ':
            addQuad(mesh, vertexIndexes, [
                [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]
            ]);
            break;
        case 'maxZ':
            addQuad(mesh, vertexIndexes, [
                [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
            ]);
            break;
    }
}

function collectConnectedComponent(startKey, occupied, visited) {
    const queue = [startKey];
    const component = [];
    visited.add(startKey);

    for (let cursor = 0; cursor < queue.length; cursor++) {
        const key = queue[cursor];
        component.push(key);
        const [x, y, z] = parseCellKey(key);
        const neighbors = [
            [x - 1, y, z], [x + 1, y, z],
            [x, y - 1, z], [x, y + 1, z],
            [x, y, z - 1], [x, y, z + 1]
        ];

        neighbors.forEach(([nx, ny, nz]) => {
            const neighborKey = cellKey(nx, ny, nz);
            if (occupied.has(neighborKey) && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        });
    }

    return component;
}

function buildUnionMesh(mesh) {
    const xKeys = new Set();
    const yKeys = new Set();
    const zKeys = new Set();

    mesh.cuboids.forEach(cuboid => {
        addSortedCoordinate(xKeys, cuboid.minX);
        addSortedCoordinate(xKeys, cuboid.maxX);
        addSortedCoordinate(yKeys, cuboid.minY);
        addSortedCoordinate(yKeys, cuboid.maxY);
        addSortedCoordinate(zKeys, cuboid.minZ);
        addSortedCoordinate(zKeys, cuboid.maxZ);
    });

    const xs = makeCoordinateArray(xKeys);
    const ys = makeCoordinateArray(yKeys);
    const zs = makeCoordinateArray(zKeys);
    const xi = indexCoordinates(xs);
    const yi = indexCoordinates(ys);
    const zi = indexCoordinates(zs);
    const occupied = new Set();

    mesh.cuboids.forEach(cuboid => {
        const minX = xi.get(coordinateKey(cuboid.minX));
        const maxX = xi.get(coordinateKey(cuboid.maxX));
        const minY = yi.get(coordinateKey(cuboid.minY));
        const maxY = yi.get(coordinateKey(cuboid.maxY));
        const minZ = zi.get(coordinateKey(cuboid.minZ));
        const maxZ = zi.get(coordinateKey(cuboid.maxZ));

        for (let x = minX; x < maxX; x++) {
            for (let y = minY; y < maxY; y++) {
                for (let z = minZ; z < maxZ; z++) {
                    occupied.add(cellKey(x, y, z));
                }
            }
        }
    });

    mesh.vertices = [];
    mesh.triangles = [];

    const visited = new Set();
    occupied.forEach(startKey => {
        if (visited.has(startKey)) return;

        const vertexIndexes = new Map();
        const component = collectConnectedComponent(startKey, occupied, visited);
        const componentCells = new Set(component);

        component.forEach(key => {
            const [x, y, z] = parseCellKey(key);
            const neighbors = {
                minX: cellKey(x - 1, y, z),
                maxX: cellKey(x + 1, y, z),
                minY: cellKey(x, y - 1, z),
                maxY: cellKey(x, y + 1, z),
                minZ: cellKey(x, y, z - 1),
                maxZ: cellKey(x, y, z + 1)
            };

            Object.entries(neighbors).forEach(([side, neighborKey]) => {
                if (!componentCells.has(neighborKey)) {
                    addBoundaryFace(mesh, vertexIndexes, xs, ys, zs, x, y, z, side);
                }
            });
        });
    });

    delete mesh.cuboids;
    return mesh;
}

function makeEdgeKey(a, b) {
    return a < b ? `${a},${b}` : `${b},${a}`;
}

function pairNonManifoldEdgeUses(uses) {
    const directions = new Map();

    uses.forEach(use => {
        const key = `${use.a},${use.b}`;
        if (!directions.has(key)) directions.set(key, []);
        directions.get(key).push(use);
    });

    const directionGroups = Array.from(directions.values());
    if (directionGroups.length !== 2) return [];

    const pairs = [];
    const pairCount = Math.min(directionGroups[0].length, directionGroups[1].length);
    for (let i = 0; i < pairCount; i++) {
        pairs.push([directionGroups[0][i], directionGroups[1][i]]);
    }

    return pairs;
}

function splitNonManifoldEdges(mesh) {
    const edgeUses = new Map();
    const parents = new Map();

    function cornerKey(triangleIndex, vertexIndex) {
        return `${triangleIndex},${vertexIndex}`;
    }

    function findCorner(key) {
        const parent = parents.get(key);
        if (parent !== key) {
            const root = findCorner(parent);
            parents.set(key, root);
            return root;
        }
        return parent;
    }

    function unionCorners(a, b) {
        const rootA = findCorner(a);
        const rootB = findCorner(b);
        if (rootA !== rootB) {
            parents.set(rootB, rootA);
        }
    }

    mesh.triangles.forEach((triangle, triangleIndex) => {
        triangle.forEach(vertexIndex => {
            const key = cornerKey(triangleIndex, vertexIndex);
            parents.set(key, key);
        });

        const edges = [
            [triangle[0], triangle[1]],
            [triangle[1], triangle[2]],
            [triangle[2], triangle[0]]
        ];

        edges.forEach(([a, b]) => {
            const key = makeEdgeKey(a, b);
            if (!edgeUses.has(key)) edgeUses.set(key, []);
            edgeUses.get(key).push({ a, b, triangleIndex });
        });
    });

    const pairedEdges = [];
    edgeUses.forEach(uses => {
        if (uses.length === 2) {
            pairedEdges.push([uses[0], uses[1]]);
            return;
        }

        if (uses.length > 2) {
            pairedEdges.push(...pairNonManifoldEdgeUses(uses));
        }
    });

    pairedEdges.forEach(([a, b]) => {
        unionCorners(cornerKey(a.triangleIndex, a.a), cornerKey(b.triangleIndex, a.a));
        unionCorners(cornerKey(a.triangleIndex, a.b), cornerKey(b.triangleIndex, a.b));
    });

    const vertices = [];
    const vertexIndexes = new Map();
    const triangles = mesh.triangles.map((triangle, triangleIndex) => {
        return triangle.map(vertexIndex => {
            const root = findCorner(cornerKey(triangleIndex, vertexIndex));
            if (!vertexIndexes.has(root)) {
                vertexIndexes.set(root, vertices.length);
                vertices.push(mesh.vertices[vertexIndex]);
            }
            return vertexIndexes.get(root);
        });
    });

    mesh.vertices = vertices;
    mesh.triangles = triangles;
    return mesh;
}

function collectMeshes(root) {
    return collectCuboids(root)
        .map(buildUnionMesh)
        .map(splitNonManifoldEdges)
        .filter(mesh => mesh.vertices.length > 0 && mesh.triangles.length > 0)
        .sort((a, b) => {
            const rankDelta = getMaterialSortRank(a.material) - getMaterialSortRank(b.material);
            return rankDelta || a.material.name.localeCompare(b.material.name);
        });
}

function buildMaterialTable(meshes) {
    const materials = [];
    const materialIndexes = new Map();

    meshes.forEach(mesh => {
        if (!materialIndexes.has(mesh.material.key)) {
            materialIndexes.set(mesh.material.key, materials.length);
            materials.push(mesh.material);
        }
        mesh.materialIndex = materialIndexes.get(mesh.material.key);
    });

    return materials;
}

function getProductionUuid(index, suffix = '81cb') {
    return `0001000${index}-${suffix}-4c03-9d28-80fed5dfa1dc`;
}

function assignObjectIds(meshes) {
    meshes.forEach((mesh, index) => {
        mesh.objectId = index + 1;
    });
    meshes.assemblyId = meshes.length + 1;
}

function moveMeshesToBuildPlate(meshes) {
    const minZ = meshes.reduce((minimum, mesh) => {
        return mesh.vertices.reduce((meshMinimum, vertex) => Math.min(meshMinimum, vertex[2]), minimum);
    }, Infinity);

    if (!Number.isFinite(minZ) || minZ >= 0) return;

    const zOffset = -minZ;
    meshes.forEach(mesh => {
        mesh.vertices.forEach(vertex => {
            vertex[2] = normalizeCoordinate(vertex[2] + zOffset);
        });
    });
}

function buildRootModelXml(meshes, title) {
    const componentRefs = meshes
        .map((mesh, index) => `    <component p:path="/3D/Objects/object_1.model" objectid="${mesh.objectId}" p:UUID="${getProductionUuid(index, 'b206')}" transform="1 0 0 0 1 0 0 0 1 0 0 0" />`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">${escapeXml(title)}</metadata>
 <resources>
  <object id="${meshes.assemblyId}" p:UUID="00000001-61cb-4c03-9d28-80fed5dfa1dc" type="model" name="${escapeXml(title)}" partnumber="${escapeXml(title)}">
   <components>
${componentRefs}
   </components>
  </object>
 </resources>
 <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">
  <item objectid="${meshes.assemblyId}" p:UUID="00000003-b1ec-4553-aec9-835e5b724bb4" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1" />
 </build>
</model>`;
}

function buildObjectModelXml(meshes) {
    const objectsXml = meshes
        .map((mesh, index) => {
            const verticesXml = mesh.vertices
                .map(([x, y, z]) => `     <vertex x="${formatNumber(x)}" y="${formatNumber(y)}" z="${formatNumber(z)}" />`)
                .join('\n');
            const trianglesXml = mesh.triangles
                .map(([v1, v2, v3]) => `     <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`)
                .join('\n');

            return `  <object id="${mesh.objectId}" p:UUID="${getProductionUuid(index)}" type="model" name="${escapeXml(mesh.name)}" partnumber="${escapeXml(mesh.name)}">
   <mesh>
    <vertices>
${verticesXml}
    </vertices>
    <triangles>
${trianglesXml}
    </triangles>
   </mesh>
  </object>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
${objectsXml}
 </resources>
</model>`;
}

function buildModelSettingsConfig(meshes, title) {
    const assemblyId = meshes.assemblyId;
    const totalFaceCount = meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0);
    const partsXml = meshes
        .map((mesh, index) => {
            const partId = mesh.objectId;
            const partName = mesh.material.name;
            return `    <part id="${partId}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(partName)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value="${escapeXml(`${title}.3mf`)}"/>
      <metadata key="source_object_id" value="0"/>
      <metadata key="source_volume_id" value="${index}"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <metadata key="extruder" value="${getExtruderIndex(mesh.material)}"/>
      <mesh_stat face_count="${mesh.triangles.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`;
        })
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${assemblyId}">
    <metadata key="name" value="${escapeXml(title)}"/>
    <metadata key="extruder" value="1"/>
    <metadata face_count="${totalFaceCount}"/>
${partsXml}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="filament_maps" value="2 1 1 1 1"/>
    <model_instance>
      <metadata key="object_id" value="${assemblyId}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="101"/>
    </model_instance>
  </plate>
  <assemble>
    <assemble_item object_id="${assemblyId}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="0 0 0" />
  </assemble>
</config>`;
}

function buildContentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="config" ContentType="application/xml" />
</Types>`;
}

function buildRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
}

function buildModelRelationshipsXml() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/Objects/object_1.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
}

function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[i] = value >>> 0;
    }
    return table;
}

const crcTable = makeCrcTable();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
}

function toDosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
}

function concatArrays(arrays) {
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    arrays.forEach(array => {
        result.set(array, offset);
        offset += array.length;
    });
    return result;
}

function makeLocalHeader(file, timestamp) {
    const header = new Uint8Array(30 + file.nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, timestamp.dosTime);
    writeUint16(view, 12, timestamp.dosDate);
    writeUint32(view, 14, file.crc);
    writeUint32(view, 18, file.data.length);
    writeUint32(view, 22, file.data.length);
    writeUint16(view, 26, file.nameBytes.length);
    writeUint16(view, 28, 0);
    header.set(file.nameBytes, 30);
    return header;
}

function makeCentralDirectoryHeader(file, timestamp) {
    const header = new Uint8Array(46 + file.nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, 0);
    writeUint16(view, 12, timestamp.dosTime);
    writeUint16(view, 14, timestamp.dosDate);
    writeUint32(view, 16, file.crc);
    writeUint32(view, 20, file.data.length);
    writeUint32(view, 24, file.data.length);
    writeUint16(view, 28, file.nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, file.offset);
    header.set(file.nameBytes, 46);
    return header;
}

function makeEndOfCentralDirectory(fileCount, centralDirectorySize, centralDirectoryOffset) {
    const header = new Uint8Array(22);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x06054b50);
    writeUint16(view, 4, 0);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, fileCount);
    writeUint16(view, 10, fileCount);
    writeUint32(view, 12, centralDirectorySize);
    writeUint32(view, 16, centralDirectoryOffset);
    writeUint16(view, 20, 0);
    return header;
}

function createZip(files) {
    const timestamp = toDosDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    const preparedFiles = files.map(file => ({
        name: file.name,
        nameBytes: textEncoder.encode(file.name),
        data: typeof file.content === 'string' ? textEncoder.encode(file.content) : file.content
    }));

    preparedFiles.forEach(file => {
        file.crc = crc32(file.data);
        file.offset = offset;

        const localHeader = makeLocalHeader(file, timestamp);
        localParts.push(localHeader, file.data);
        offset += localHeader.length + file.data.length;
    });

    const centralDirectoryOffset = offset;
    preparedFiles.forEach(file => {
        const centralHeader = makeCentralDirectoryHeader(file, timestamp);
        centralParts.push(centralHeader);
        offset += centralHeader.length;
    });

    const centralDirectorySize = offset - centralDirectoryOffset;
    const endRecord = makeEndOfCentralDirectory(preparedFiles.length, centralDirectorySize, centralDirectoryOffset);

    return concatArrays([...localParts, ...centralParts, endRecord]);
}

export function exportThreeGroupTo3MF(root, title = 'model') {
    const meshes = collectMeshes(root);
    if (meshes.length === 0) {
        throw new Error('No mesh geometry found to export.');
    }

    moveMeshesToBuildPlate(meshes);
    buildMaterialTable(meshes);
    assignObjectIds(meshes);
    const modelXml = buildRootModelXml(meshes, title);
    const objectModelXml = buildObjectModelXml(meshes);
    const modelSettingsConfig = buildModelSettingsConfig(meshes, title);
    const zipBytes = createZip([
        { name: '[Content_Types].xml', content: buildContentTypesXml() },
        { name: '_rels/.rels', content: buildRelationshipsXml() },
        { name: '3D/3dmodel.model', content: modelXml },
        { name: '3D/_rels/3dmodel.model.rels', content: buildModelRelationshipsXml() },
        { name: '3D/Objects/object_1.model', content: objectModelXml },
        { name: 'Metadata/model_settings.config', content: modelSettingsConfig }
    ]);

    return new Blob([zipBytes], { type: 'model/3mf' });
}
