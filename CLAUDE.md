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

### Export Formats
- STL files for individual colors (white/black parts)
- GLB files for colored models (both materials in one file)
- Metadata export for marker specifications

### Responsive Design
The UI uses CSS Grid and Flexbox with mobile-first responsive design. The sidebar navigation collapses on mobile devices with a hamburger menu.