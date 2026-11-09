"""Bake measured colour-science datasets and independent reference values.

Run with the pinned reference environment (see docs/COLOR-SCIENCE.md):

    REFERENCE_PYTHON=/path/to/python npm run generate:figure-data

Outputs
-------
src/data/spectral.json   CIE 1931 2° CMFs, Wright & Guild RGB CMFs, D65 / A,
                         camera spectral sensitivities (380–780 nm, 5 nm).
src/data/gamuts.json     Pointer's gamut (LCh under SC, plus XYZ adapted to
                         D65 with Bradford) and MacAdam (1942) ellipses.
src/data/tm30.json       ANSI/IES TM-30-18 hue-bin averages computed from the
                         99 CES spectra for a fixed set of light sources.
tests/reference/figures.json
                         Values produced by Colour Science for the website's
                         independent TypeScript implementations.

The generator never imports website code.
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")
import colour  # noqa: E402
from colour.adaptation import chromatic_adaptation_VonKries  # noqa: E402
from colour.blindness import CVD_MATRICES_MACHADO2010  # noqa: E402
from colour.models import (  # noqa: E402
    CCS_ILLUMINANT_POINTER_GAMUT,
    DATA_MACADAM_1942_ELLIPSES,
    DATA_POINTER_GAMUT_VOLUME,
)

ROOT = Path(__file__).resolve().parent.parent
SHAPE = colour.SpectralShape(380, 780, 5)
WAVELENGTHS = np.arange(380, 785, 5)


def rounded(values, digits=8):
    return np.round(np.asarray(values, dtype=float), digits).tolist()


def resample(sd):
    return sd.copy().align(SHAPE, extrapolator_kwargs={"method": "Constant", "left": 0, "right": 0})


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KiB)")


cmfs = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"].copy().align(SHAPE)
cmf_values = cmfs.values
wright_guild = colour.MSDS_CMFS["Wright & Guild 1931 2 Degree RGB CMFs"].copy().align(SHAPE)
d65 = resample(colour.SDS_ILLUMINANTS["D65"])
illuminant_a = resample(colour.SDS_ILLUMINANTS["A"])

cameras = {}
for name in colour.MSDS_CAMERA_SENSITIVITIES:
    msds = colour.MSDS_CAMERA_SENSITIVITIES[name].copy()
    # Sigma data is tabulated at 10 nm between 400 and 680 nm; keep the
    # measured range explicit instead of extrapolating sensitivities.
    first, last = msds.shape.start, msds.shape.end
    msds = msds.align(colour.SpectralShape(first, last, 5))
    cameras[name] = {
        "start": float(first),
        "step": 5,
        "r": rounded(msds.values[:, 0], 6),
        "g": rounded(msds.values[:, 1], 6),
        "b": rounded(msds.values[:, 2], 6),
    }

write(
    ROOT / "src/data/spectral.json",
    {
        "source": "Colour Science 0.4.4 datasets",
        "start": 380,
        "step": 5,
        "cmf": {
            "x": rounded(cmf_values[:, 0]),
            "y": rounded(cmf_values[:, 1]),
            "z": rounded(cmf_values[:, 2]),
        },
        "rgbCmf": {
            "name": "Wright & Guild 1931 2° RGB CMFs",
            "r": rounded(wright_guild.values[:, 0], 6),
            "g": rounded(wright_guild.values[:, 1], 6),
            "b": rounded(wright_guild.values[:, 2], 6),
        },
        "d65": rounded(d65.values, 5),
        "a": rounded(illuminant_a.values, 5),
        "cameras": cameras,
    },
)

# Pointer's gamut: L 15–90 × 36 hues, CIELAB under illuminant SC.
xy_sc = CCS_ILLUMINANT_POINTER_GAMUT
xy_d65 = colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"]
lab = colour.LCHab_to_Lab(DATA_POINTER_GAMUT_VOLUME)
xyz_sc = colour.Lab_to_XYZ(lab, xy_sc)
xyz_d65 = chromatic_adaptation_VonKries(
    xyz_sc, colour.xy_to_XYZ(xy_sc), colour.xy_to_XYZ(xy_d65), transform="Bradford"
)
ellipses = DATA_MACADAM_1942_ELLIPSES
write(
    ROOT / "src/data/gamuts.json",
    {
        "pointer": {
            "source": "Pointer (1980), via Colour Science 0.4.4",
            "illuminant": rounded(xy_sc, 6),
            "lch": DATA_POINTER_GAMUT_VOLUME.astype(float).tolist(),
            "xyzD65": rounded(xyz_d65, 7),
        },
        "macadam": {
            "source": "MacAdam (1942), Wyszecki & Stiles Table 2(5.4.1), calculated columns",
            # x, y, semi-major a, semi-minor b (real xy units), θ in degrees.
            "ellipses": [
                [float(x), float(y), float(a) / 1000, float(b) / 1000, float(t)]
                for x, y, _a, _b, _t, a, b, t in ellipses
            ],
        },
    },
)

TM30_SOURCES = {
    "A": "CIE A 白炽灯",
    "FL2": "FL2 冷白荧光灯",
    "FL11": "FL11 三基色荧光灯",
    "HP1": "HP1 高压钠灯",
    "LED-B3": "LED-B3 荧光粉白光 LED",
    "LED-RGB1": "LED-RGB1 三色 LED",
    "LED-V1": "LED-V1 紫光激发 LED",
}
tm30 = []
for key, label in TM30_SOURCES.items():
    sd = colour.SDS_ILLUMINANTS[key].copy()
    spec = colour.quality.colour_fidelity_index_ANSIIESTM3018(sd, additional_data=True)
    tm30.append(
        {
            "id": key,
            "name": label,
            "spd": rounded(resample(sd).values / np.max(resample(sd).values), 5),
            "cct": round(float(spec.CCT), 1),
            "duv": round(float(spec.D_uv), 5),
            "rf": round(float(spec.R_f), 2),
            "rg": round(float(spec.R_g), 2),
            "test": rounded(spec.averages_test, 5),
            "reference": rounded(spec.averages_reference, 5),
            "rcs": rounded(spec.R_cs, 3),
            "rhs": rounded(spec.R_hs, 4),
        }
    )
write(
    ROOT / "src/data/tm30.json",
    {"source": "ANSI/IES TM-30-18 via Colour Science 0.4.4 (99 CES)", "sources": tm30},
)

# ---------------------------------------------------------------- references
rng = np.random.default_rng(20261109)
srgb = np.vstack(
    [
        np.eye(3),
        [[1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1], [0.5, 0.5, 0.5], [0.2, 0.4, 0.8]],
        rng.random((24, 3)),
    ]
)
xyz = colour.RGB_to_XYZ(
    srgb, colour.RGB_COLOURSPACES["sRGB"], apply_cctf_decoding=True
)

white_luminance = 203.0
d65_xyz = colour.xy_to_XYZ(xy_d65)
zcam = colour.XYZ_to_ZCAM(
    xyz * white_luminance,
    d65_xyz * white_luminance,
    L_A=0.2 * white_luminance,
    Y_b=0.2 * white_luminance,
    surround=colour.VIEWING_CONDITIONS_ZCAM["Average"],
    compute_H=False,
)
with colour.domain_range_scale("ignore"):
    jzazbz = colour.XYZ_to_Jzazbz(xyz * white_luminance)

signal = np.linspace(0, 1, 21)
linear = np.array([0, 1e-4, 1e-3, 0.005, 0.0026, 0.01, 0.0625, 0.18, 0.5, 1, 2, 8, 50])
temperatures = [2000, 2856, 4000, 5000, 6500, 10000]
bb_xy = [
    colour.XYZ_to_xy(
        colour.sd_to_XYZ(colour.sd_blackbody(t, SHAPE), cmfs, method="Integration")
    ).tolist()
    for t in temperatures
]
daylight_xy = [colour.temperature.CCT_to_xy_CIE_D(t).tolist() for t in [4000, 5000, 6500, 10000]]

pulses = [(450, 550), (500, 600), (380, 450), (600, 780), (550, 650)]
illuminant_e = colour.sd_ones(SHAPE)
optimal = []
for start, end in pulses:
    values = ((WAVELENGTHS >= start) & (WAVELENGTHS <= end)).astype(float)
    sd = colour.SpectralDistribution(dict(zip(WAVELENGTHS, values)))
    optimal.append(
        {
            "start": start,
            "end": end,
            "xyz": (colour.sd_to_XYZ(sd, cmfs, illuminant_e, method="Integration") / 100).tolist(),
        }
    )

dwg = colour.RGB_COLOURSPACES["DaVinci Wide Gamut"]

# Samples of each linear 9³ cube that fall outside the optimal colour solid
# (illuminant E, adapted from D65 with Bradford). Quoted in the volume figures.
from itertools import product as _product  # noqa: E402

from scipy.spatial import Delaunay  # noqa: E402

hull = Delaunay(colour.volume.XYZ_outer_surface(cmfs, illuminant_e))
grid = np.linspace(0, 1, 9)
cube = np.array(list(_product(grid, grid, grid)))
outside_optimal = {}
for key, name, decode in (
    ("srgb", "sRGB", True),
    ("acescg", "ACEScg", False),
    ("dwg-linear", "DaVinci Wide Gamut", False),
    ("camera-arri4", "ARRI Wide Gamut 4", False),
    ("camera-sgamut3", "S-Gamut3", False),
):
    space = colour.RGB_COLOURSPACES[name]
    cube_linear = colour.models.eotf_sRGB(cube) if decode else cube
    tristimulus = np.einsum("ij,nj->ni", space.matrix_RGB_to_XYZ, cube_linear)
    tristimulus = chromatic_adaptation_VonKries(
        tristimulus, colour.xy_to_XYZ(space.whitepoint), d65_xyz, "Bradford"
    )
    in_e = chromatic_adaptation_VonKries(tristimulus, d65_xyz, np.ones(3), "Bradford")
    outside_optimal[key] = int((hull.find_simplex(in_e, tol=1e-6) < 0).sum())
write(
    ROOT / "tests/reference/figures.json",
    {
        "srgb": srgb.tolist(),
        "xyz": xyz.tolist(),
        "zcam": {
            "whiteLuminance": white_luminance,
            "J": np.asarray(zcam.J).tolist(),
            "C": np.asarray(zcam.C).tolist(),
            "h": np.asarray(zcam.h).tolist(),
        },
        "jzazbz": jzazbz.tolist(),
        "ipt": colour.XYZ_to_IPT(xyz).tolist(),
        "lms": np.einsum("ij,nj->ni", colour.models.ipt.MATRIX_IPT_XYZ_TO_LMS, xyz).tolist(),
        "dwg": {
            "toXYZ": dwg.matrix_RGB_to_XYZ.tolist(),
            "signal": signal.tolist(),
            "linear": linear.tolist(),
            "diEncode": colour.models.oetf_DaVinciIntermediate(linear).tolist(),
            "diDecode": colour.models.oetf_inverse_DaVinciIntermediate(signal).tolist(),
        },
        "pq": {
            "nits": [0, 0.1, 1, 10, 100, 203, 1000, 4000, 10000],
            "signal": colour.models.eotf_inverse_ST2084(
                np.array([0, 0.1, 1, 10, 100, 203, 1000, 4000, 10000])
            ).tolist(),
        },
        "hlg": {
            "linear": [0, 0.01, 1 / 12, 0.1, 0.26, 0.5, 1],
            "signal": colour.models.oetf_BT2100_HLG(
                np.array([0, 0.01, 1 / 12, 0.1, 0.26, 0.5, 1])
            ).tolist(),
        },
        "logc4": colour.models.log_encoding_ARRILogC4(linear).tolist(),
        "slog3": colour.models.log_encoding_SLog3(linear).tolist(),
        "machado": {
            name: CVD_MATRICES_MACHADO2010[key][1.0].tolist()
            for name, key in (("protan", "Protanomaly"), ("deutan", "Deuteranomaly"), ("tritan", "Tritanomaly"))
        },
        "blackbody": {"temperatures": temperatures, "xy": bb_xy},
        "daylight": {"temperatures": [4000, 5000, 6500, 10000], "xy": daylight_xy},
        "optimal": optimal,
        "outsideOptimal": outside_optimal,
        "d65xy": colour.XYZ_to_xy(colour.sd_to_XYZ(d65, cmfs, method="Integration")).tolist(),
    },
)
print("python", sys.version.split()[0], "colour", colour.__version__)
