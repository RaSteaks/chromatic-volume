export const cameraTransfers = [
  { id: 'logc3', name: 'ARRI LogC3 · SUP 3.x / EI 800' },
  { id: 'logc4', name: 'ARRI LogC4' },
  { id: 'slog3', name: 'Sony S-Log3' },
  { id: 'clog2', name: 'Canon Log 2 · v1.2' },
  { id: 'clog3', name: 'Canon Log 3 · v1.2' },
  { id: 'vlog', name: 'Panasonic V-Log' },
  { id: 'log3g10', name: 'RED Log3G10 · v3' },
  { id: 'bmfilm5', name: 'Blackmagic Film Gen 5' },
  { id: 'nlog', name: 'Nikon N-Log' },
  { id: 'dlog', name: 'DJI D-Log（非 D-Log M）' },
] as const;
export type CameraTransfer = (typeof cameraTransfers)[number]['id'];
export const cameraPresets = [
  { name: 'ARRI AWG3 / LogC3 · EI 800', gamut: 'camera-arri3', gamma: 'logc3' },
  { name: 'ARRI AWG4 / LogC4', gamut: 'camera-arri4', gamma: 'logc4' },
  { name: 'Sony S-Gamut3 / S-Log3', gamut: 'camera-sgamut3', gamma: 'slog3' },
  {
    name: 'Sony S-Gamut3.Cine / S-Log3',
    gamut: 'camera-sgamut3cine',
    gamma: 'slog3',
  },
  { name: 'Canon Cinema Gamut / Log 2', gamut: 'camera-canon', gamma: 'clog2' },
  { name: 'Canon Cinema Gamut / Log 3', gamut: 'camera-canon', gamma: 'clog3' },
  { name: 'Panasonic V-Gamut / V-Log', gamut: 'camera-vgamut', gamma: 'vlog' },
  {
    name: 'REDWideGamutRGB / Log3G10',
    gamut: 'camera-redwide',
    gamma: 'log3g10',
  },
  {
    name: 'Blackmagic Wide Gamut / Film Gen 5',
    gamut: 'camera-blackmagic',
    gamma: 'bmfilm5',
  },
  { name: 'Nikon N-Gamut / N-Log', gamut: 'camera-ngamut', gamma: 'nlog' },
  { name: 'DJI D-Gamut / D-Log', gamut: 'camera-dgamut', gamma: 'dlog' },
] as const;
const logc4 = {
  a: (2 ** 18 - 16) / 117.45,
  b: (1023 - 95) / 1023,
  c: 95 / 1023,
  s: 0.1135972086105891,
  t: -0.01805699611991131,
};
// Linear values use scene exposure/reflection (18% gray = .18); encoded values
// follow the vendor's normalized code convention. Do not apply an extra legal/full
// range transform to Sony/Canon/V-Log/N-Log. Canon includes its documented 0.9 factor.
export function encodeCamera(x: number, gamma: CameraTransfer): number {
  switch (gamma) {
    case 'logc3':
      return x > 0.010591
        ? 0.24719 * Math.log10(5.555556 * x + 0.052272) + 0.385537
        : 5.367655 * x + 0.092809;
    case 'logc4':
      return x >= logc4.t
        ? ((Math.log2(logc4.a * x + 64) - 6) / 14) * logc4.b + logc4.c
        : (x - logc4.t) / logc4.s;
    case 'slog3':
      return x >= 0.01125
        ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023
        : ((x * (171.2102946929 - 95)) / 0.01125 + 95) / 1023;
    case 'clog2': {
      const v = x / 0.9;
      return (
        Math.sign(v) * 0.24136077 * Math.log10(Math.abs(v) * 87.09937546 + 1) +
        0.092864125
      );
    }
    case 'clog3': {
      const v = x / 0.9;
      const low =
        -(10 ** ((0.12783901 - 0.097465473) / 0.36726845) - 1) / 14.98325;
      const high = (0.15277891 - 0.12512219) / 1.9754798;
      if (v < low)
        return -0.36726845 * Math.log10(-v * 14.98325 + 1) + 0.12783901;
      if (v <= high) return 1.9754798 * v + 0.12512219;
      return 0.36726845 * Math.log10(v * 14.98325 + 1) + 0.12240537;
    }
    case 'vlog':
      return x < 0.01
        ? 5.6 * x + 0.125
        : 0.241514 * Math.log10(x + 0.00873) + 0.598206;
    case 'log3g10': {
      const v = x + 0.01;
      return v < 0 ? v * 15.1927 : 0.224282 * Math.log10(v * 155.975327 + 1);
    }
    case 'bmfilm5':
      return x < 0.005
        ? 8.283605932402494 * x + 0.09246575342465753
        : 0.08692876065491224 * Math.log(x + 0.005494072432257808) +
            0.5300133392291939;
    case 'nlog':
      return x < 0.328
        ? 0.635386119257087 * Math.cbrt(x + 0.0075)
        : 0.1466275659824047 * Math.log(x) + 0.6050830889540567;
    case 'dlog':
      return x <= 0.0078
        ? 6.025 * x + 0.0929
        : 0.256663 * Math.log10(x * 0.9892 + 0.0108) + 0.584555;
  }
}
export function decodeCamera(v: number, gamma: CameraTransfer): number {
  switch (gamma) {
    case 'logc3':
      return v > 5.367655 * 0.010591 + 0.092809
        ? (10 ** ((v - 0.385537) / 0.24719) - 0.052272) / 5.555556
        : (v - 0.092809) / 5.367655;
    case 'logc4':
      return v >= 0
        ? (2 ** ((14 * (v - logc4.c)) / logc4.b + 6) - 64) / logc4.a
        : v * logc4.s + logc4.t;
    case 'slog3':
      return v >= 171.2102946929 / 1023
        ? 10 ** ((v * 1023 - 420) / 261.5) * 0.19 - 0.01
        : ((v * 1023 - 95) * 0.01125) / (171.2102946929 - 95);
    case 'clog2':
      return (
        ((Math.sign(v - 0.092864125) *
          (10 ** (Math.abs(v - 0.092864125) / 0.24136077) - 1)) /
          87.09937546) *
        0.9
      );
    case 'clog3': {
      if (v < 0.097465473)
        return (-(10 ** ((0.12783901 - v) / 0.36726845) - 1) / 14.98325) * 0.9;
      if (v <= 0.15277891) return ((v - 0.12512219) / 1.9754798) * 0.9;
      return ((10 ** ((v - 0.12240537) / 0.36726845) - 1) / 14.98325) * 0.9;
    }
    case 'vlog':
      return v < 0.181
        ? (v - 0.125) / 5.6
        : 10 ** ((v - 0.598206) / 0.241514) - 0.00873;
    case 'log3g10':
      return v < 0
        ? v / 15.1927 - 0.01
        : (10 ** (v / 0.224282) - 1) / 155.975327 - 0.01;
    case 'bmfilm5':
      return v < 8.283605932402494 * 0.005 + 0.09246575342465753
        ? (v - 0.09246575342465753) / 8.283605932402494
        : Math.exp((v - 0.5300133392291939) / 0.08692876065491224) -
            0.005494072432257808;
    case 'nlog':
      return v < 0.4418377321603128
        ? (v / 0.635386119257087) ** 3 - 0.0075
        : Math.exp((v - 0.6050830889540567) / 0.1466275659824047);
    // DJI publishes rounded decoder coefficients; retain them rather than invent
    // a numerically exact inverse with different published behavior.
    case 'dlog':
      return v <= 0.14
        ? (v - 0.0929) / 6.025
        : (10 ** (3.89616 * v - 2.27752) - 0.0108) / 0.9892;
  }
}
