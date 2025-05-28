# Online 3D Marker Pattern Generator

**Live Page:** [https://lyehe.github.io/aruco_3d/](https://lyehe.github.io/aruco_3d/)

## Description
A web-based tool to generate 3D printable patterns for ArUco markers, enclosed ArUco, ChArUco boards, and marker arrays. These calibration targets are commonly used in computer vision and robotics applications. The generator allows customization of marker parameters, dimensions, and export formats. The designs can be used for a single color or a multi-color printer.

## Features
*   Generate single ArUco/AprilTag markers.
*   Generate arrays of ArUco/AprilTag markers.
*   Generate ChArUco boards.
*   Support for various marker dictionaries (ArUco, AprilTag families).
*   Customizable parameters:
    *   Marker ID(s)
    *   Marker dimensions (mm)
    *   Base height and feature height for 3D extrusion (mm)
    *   Extrusion type (Positive, Negative, Flat)
    *   Border configuration (for single markers)
    *   Grid layout and gap configuration (for arrays)
    *   Checkerboard setup, square size, and marker margin (for ChArUco boards)
*   Interactive 3D preview of the generated pattern using Three.js.
*   Export options:
    *   Save White part as STL
    *   Save Black part as STL
    *   Save combined model as Colored GLB


## How to Use
1.  Ensure you have all project files (HTML, CSS, and the `js` directory).
2.  Open the main HTML file (likely `designer.html` if you've restored it, or the primary HTML file of the project) in a modern web browser that supports WebGL (e.g., Chrome, Firefox, Edge).
3.  Select the desired marker type (Single Marker, Marker Array, ChArUco Board) from the sidebar on the left.
4.  Configure the parameters in the form panel. The available options will change based on the selected marker type.
5.  The 3D preview on the right will update as you change the parameters.
6.  Use the "Save White STL", "Save Black STL", or "Save Colored GLB" buttons to download the generated model parts.

## Acknowledgments
Marker dictionaries used in this project are sourced from the `arucogen` project by okalachev, available at [https://github.com/okalachev/arucogen](https://github.com/okalachev/arucogen). 

## License
Copyright (c) [2025] [Yehe Liu]

This work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.
To view a copy of this license, visit [https://creativecommons.org/licenses/by-nc-nd/4.0/](https://creativecommons.org/licenses/by-nc-nd/4.0/)

--- 