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

## Example Prints
![Example](static/image.png)

## Instructions and Tips
1.  Use black and white filaments. PLA or PLA+ is recommended for the best stiffness. The quality of the print is dependent on the quality of the filament and 3D printer.
2.  Flow rate should be calibrated (2-stage recommended) for the best top surface quality.
3.  For single colored printers, print the base layer, change the filament, and print the feature layer.
4.  For multi-colored printers, consider adding a backing to differentiate the base and feature layers. (export a blank base from the positive/negative options)
5.  The corner radius is limited by your printer's nozzle size, so the edges will not be as sharp as tags printed using a regular printer or UV printer. In practice, it is not a problem with sufficently large tags. 0.2 mm nozzle can handle ~20x20 mm tag size (2x2 mm small squares). 0.4 mm nozzle handles ~40x40 mm tag size (4x4 mm small squares).
6.  Make sure the tag is printed with at 1 mm thickness to prevent warping. For large tags and boards, increase the thickness. For 300x300 mm boards, >5 mm thickness is recommended.
7.  Before detaching the tag from the base, make sure the tag is fully cooled down to avoid warping.
8.  For the smoothest tags, print the tags facing down to a smooth build plate.


## Acknowledgments
Marker dictionaries used in this project are sourced from the `arucogen` project by okalachev, available at [https://github.com/okalachev/arucogen](https://github.com/okalachev/arucogen). 

## License
Copyright (c) [2025] [Yehe Liu]

This work is licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.
To view a copy of this license, visit [https://creativecommons.org/licenses/by-nc-nd/4.0/](https://creativecommons.org/licenses/by-nc-nd/4.0/)

--- 