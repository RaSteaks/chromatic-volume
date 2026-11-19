"""Bake ACES 2.0 Output Transform reference values from OpenColorIO.

Run with the pinned reference environment (see docs/COLOR-SCIENCE.md):

    REFERENCE_PYTHON=/path/to/python npm run generate:figure-data

Output
------
tests/reference/aces2.json
    sRGB code values of the ACES 2.0 SDR 100 cd/m² Rec.709 output transform
    (OCIO built-in, independent C++ implementation) for the 9³ tone-mapping
    lattice, a neutral ramp and extreme colours. Linear Rec.709 input enters
    ACES2065-1 through OCIO's Bradford AP1 ↔ Rec.709 and ACEScg ↔ ACES2065-1
    built-ins.

The generator never imports website code.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import PyOpenColorIO as ocio

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = "ACES-OUTPUT - ACES2065-1_to_CIE-XYZ-D65 - SDR-100nit-REC709_2.0"

group = ocio.GroupTransform()
group.appendTransform(
    ocio.BuiltinTransform(
        "UTILITY - ACES-AP1_to_LINEAR-REC709_BFD", ocio.TRANSFORM_DIR_INVERSE
    )
)
group.appendTransform(ocio.BuiltinTransform("ACEScg_to_ACES2065-1"))
group.appendTransform(ocio.BuiltinTransform(OUTPUT))
group.appendTransform(ocio.BuiltinTransform("DISPLAY - CIE-XYZ-D65_to_sRGB"))
processor = (
    ocio.Config.CreateRaw()
    .getProcessor(group)
    .getOptimizedCPUProcessor(ocio.OPTIMIZATION_NONE)
)


def srgb(rgb: list[float]) -> list[float]:
    return [round(v, 9) for v in processor.applyRGB([float(v) for v in rgb])]


# Same sampling as the website lattice: r varies fastest, then g, then b.
N, EV, GREY = 9, 6.5, 0.18
level = [GREY * 2 ** (-EV + 2 * EV * i / (N - 1)) for i in range(N)]
lattice = [
    srgb([level[r], level[g], level[b]])
    for b in range(N)
    for g in range(N)
    for r in range(N)
]
neutral_ev = [ev / 4 for ev in range(-40, 33)]
neutral = [srgb([GREY * 2**ev] * 3) for ev in neutral_ev]
extreme_inputs = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [0, 1, 1],
    [1, 0, 1],
    [10, 0.1, 0.1],
    [0.1, 0.1, 10],
    [50, 50, 0.5],
    [-0.05, 0.3, 0.8],
    [2, -0.1, 0.05],
    [0, 0, 0],
]
extremes = [{"input": rgb, "srgb": srgb(rgb)} for rgb in extreme_inputs]

path = ROOT / "tests" / "reference" / "aces2.json"
path.write_text(
    json.dumps(
        {
            "engine": "OpenColorIO",
            "version": ocio.__version__,
            "transform": OUTPUT,
            "lattice": {"n": N, "ev": EV, "grey": GREY, "srgb": lattice},
            "neutral": {"ev": neutral_ev, "srgb": neutral},
            "extremes": extremes,
        },
        separators=(",", ":"),
        allow_nan=False,
    )
    + "\n"
)
print("python", sys.version.split()[0], "OpenColorIO", ocio.__version__, path)
