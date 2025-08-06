# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based 3D ArUco/AprilTag marker generator that creates STL files for 3D printing. It's a client-side JavaScript application using Three.js for 3D visualization and geometry generation.

The application generates three types of calibration targets:
- Single ArUco/AprilTag markers
- Marker arrays (grids of multiple markers)
- ChArUco boards (checkerboard with embedded markers)

## Development Commands

This is a static web application with no build system. To develop:

1. **Development server**: Use any local HTTP server to serve the files:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (if http-server is installed)
   npx http-server
   
   # VS Code Live Server extension
   # Right-click index.html -> "Open with Live Server"
   ```

2. **Testing**: Open `index.html` in a browser via the local server (not file:// protocol due to CORS restrictions for dict.json)

3. **Deployment**: The application is hosted on GitHub Pages at https://lyehe.github.io/aruco_3d/

## Architecture

### Core Structure
- `index.html` - Main HTML file with UI forms for all three generation modes
- `main.css` - Complete styling for the responsive UI
- `dict.json` - Large dictionary file (76k+ tokens) containing marker bit patterns for various ArUco/AprilTag families

### JavaScript Modules (ES6)
- `designer_app.js` - Main entry point, initializes Three.js and loads dictionary data
- `three-setup.js` - Three.js scene setup (camera, lights, controls, renderer)
- `designer_ui-handler.js` - UI event handling and form management
- `config.js` - Material definitions (black/white materials for Three.js)
- `aruco-utils.js` - Core marker generation utilities and bit pattern parsing
- `geometry-utils.js` - 3D geometry creation and manipulation utilities
- `ui-common-utils.js` - Shared UI helper functions
- **Mode-specific handlers:**
  - `single-marker-handler.js` - Single marker generation logic
  - `array-marker-handler.js` - Marker array generation logic  
  - `charuco-board-handler.js` - ChArUco board generation logic

### Key Dependencies (CDN)
- Three.js r128 (3D graphics library)
- OrbitControls (camera controls)
- STLExporter (STL file export)
- GLTFExporter (GLB file export)  
- BufferGeometryUtils (geometry merging)

### Data Flow
1. `designer_app.js` loads `dict.json` containing marker bit patterns
2. Dictionary data is distributed to UI handler and aruco utilities
3. UI changes trigger mode-specific handlers
4. Handlers generate Three.js meshes for preview
5. Export buttons use Three.js exporters to save STL/GLB files

### 3D Generation Pipeline
- Markers are generated as extruded geometry with configurable heights
- White parts and black parts are separate meshes for multi-material printing
- Supports positive extrusion (raised features), negative extrusion (recessed features), and flat output
- Geometry is optimized using BufferGeometryUtils for performance

## Important Implementation Details

### Marker Dictionary System
The `dict.json` file contains bit patterns for multiple marker families. Each marker ID maps to byte arrays that define the binary pattern. Special marker IDs:
- `-1`: Pure white marker
- `-2`: Pure black marker

### Memory Management
The application disposes of Three.js geometries and materials when regenerating models to prevent memory leaks. This is critical due to the potential for large geometry creation.

### QR Code Implementation
The QR Code generation mode (4th mode) was added to complement the existing ArUco/ChArUco functionality:

**Library**: Uses QRCode.js (cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js) for reliable QR generation
**Direct Matrix Access**: Accesses the internal `_oQRCode` object to extract binary matrix data directly via `isDark(row, col)` method, eliminating image sampling issues
**Error Correction Levels**: Supports L (~7%), M (~15%), Q (~25%), H (~30%) error correction
**Dynamic Sizing**: Automatic module count detection (21×21, 25×25, 29×29, etc.) based on content length and error correction level
**Border Support**: Optional white border generation using 3D geometry (not pattern expansion)
**STL Export**: Full integration with existing export system using recursive traversal for mesh collection

**Key Technical Details**:
- Uses `generateMarkerMesh()` from aruco-utils.js for consistent 3D geometry generation
- Converts QR convention (dark=true) to ArUco convention (dark=0, light=1) for compatibility
- Implements Promise-based generation with 100ms timeout for QR library completion
- Creates complex group hierarchy: finalGroup → (coreQrGroup + borderMesh)
- STL export uses `traverse()` method to find all meshes by material type

### Export Formats
- STL files for individual colors (white/black parts)
- GLB files for colored models (both materials in one file)  
- Metadata export for marker specifications (includes QR content and parameters)

### Responsive Design
The UI uses CSS Grid and Flexbox with mobile-first responsive design. The sidebar navigation collapses on mobile devices with a hamburger menu.