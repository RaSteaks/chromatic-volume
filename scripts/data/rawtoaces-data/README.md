# rawtoaces-data camera sensitivities

Unmodified copies of two camera spectral sensitivity files from the AMPAS
rawtoaces data repository, read by `scripts/generate-figure-data.py`.

- Source: https://github.com/AcademySoftwareFoundation/rawtoaces-data
- Commit: `e9b8503cf8a0641f40e5345d9757bde60c15f423`
- License: Apache License 2.0 (`LICENSE` in this folder, copied from the same commit)

| File                            | Camera       | Measured by (file header)                      |
| ------------------------------- | ------------ | ---------------------------------------------- |
| `ARRI_D21_380_780_5.json`       | ARRI D21     | scitech, 2017                                  |
| `Sony_ILCE-7SM3_380_780_5.json` | Sony α7S III | wetadigital (from wetadigital/physlight), 2025 |

Both are relative RGB sensitivities on a 380–780 nm, 5 nm grid.
