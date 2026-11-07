"""Generate deterministic independent oracles. Never imports application formulas.
Run with the pinned Colour Science environment; JSON is consumed by real TS code.
"""
import json
from pathlib import Path
from colour.models.common import XYZ_to_Iab
import colour
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
rng = np.random.default_rng(20261106)
reference = {'engine': 'colour-science', 'version': colour.__version__, 'numpy': np.__version__, 'seed': 20261106, 'transfers': [], 'conversions': [], 'luts': [], 'definitionDifferences': [], 'pipelines': []}
# W3C CSS Color 4 §19 matrices (independent specification constants).
# Colour 0.4.4's built-in XYZ_to_Oklab uses an older white-point convention.
OKLAB_M1=[[.819022437996703,.3619062600528904,-.1288737815209879],[.0329836539323885,.9292868615863434,.0361446663506424],[.0481771893596242,.2642395317527308,.6335478284694309]]
OKLAB_M2=[[.210454268309314,.7936177747023054,-.0040720430116193],[1.9779985324311684,-2.4285922420485799,.450593709617411],[.0259040424655478,.7827717124575296,-.8086757549230774]]
def css_oklab(xyz):
 return XYZ_to_Iab(xyz,np.cbrt,OKLAB_M1,OKLAB_M2)
reference['definitionDifferences'].append({'model':'Oklab','reference':'Colour XYZ_to_Iab + W3C CSS Color 4 matrices','reason':'Align the reference white definition without changing production or tolerances.'})
values = sorted(set([0., 1e-8, .001, 1/512, .0031308, .018, .018053968510807, 1/32, .04045, .081, .08124794403514046, .18, .5, 1., 1.5] + rng.random(32).tolist()))
m = colour.models
functions = {
 'srgb': (m.eotf_sRGB, m.eotf_inverse_sRGB),
 'prophoto': (m.cctf_decoding_ROMMRGB, m.cctf_encoding_ROMMRGB),
 'a98': (m.gamma_function, m.gamma_function),
 'rec709': (m.oetf_inverse_BT709, m.oetf_BT709),
 'rec2020': (m.oetf_inverse_BT2020, m.oetf_BT2020),
 'acescc': (m.log_decoding_ACEScc, m.log_encoding_ACEScc),
}
for gamma, (decode, encode) in functions.items():
 for direction, function in [('decode', decode), ('encode', encode)]:
  kwargs = {'exponent': 563/256 if direction == 'decode' else 256/563} if gamma == 'a98' else {'is_12_bits_system': True} if gamma == 'rec2020' else {}
  # Exercise both sides of the ACEScc toe in the actual named-space path too.
  cases = sorted(set(values + [knee + offset for knee in [2**-16, 2**-15] for offset in [-1e-10, 0, 1e-10]])) if gamma == 'acescc' else values
  for value in cases:
   # ROMM integer-oriented helper clips >1 by design; compare its defined unit range.
   if gamma == 'prophoto' and value > 1: continue
   if gamma == 'srgb' and direction == 'decode' and value == .04045:
    reference['definitionDifferences'].append({'model':'sRGB knee','input':value,'colour':float(function(value)),'cssLinear':value/12.92,'reason':'Colour selects nonlinear at equality; CSS selects linear. Exact equality covered separately by the project unit test.'})
    continue
   reference['transfers'].append(dict(gamma=gamma,direction=direction,value=value,expected=float(function(value,**kwargs)),black=0,white=100))
for black,white in [(0,100),(.1,100),(1,200)]:
 for value in values:
  reference['transfers'].append(dict(gamma='bt1886',direction='decode',value=value,expected=float(m.eotf_BT1886(value,L_B=black,L_W=white)/white),black=black,white=white))
  reference['transfers'].append(dict(gamma='bt1886',direction='encode',value=value,expected=float(m.eotf_inverse_BT1886(value*white,L_B=black,L_W=white)),black=black,white=white))
camera_functions = {
 'logc3': (m.log_decoding_ARRILogC3,m.log_encoding_ARRILogC3),
 'logc4': (m.log_decoding_ARRILogC4,m.log_encoding_ARRILogC4),
 'slog3': (m.log_decoding_SLog3,m.log_encoding_SLog3),
 'clog2': (m.log_decoding_CanonLog2,m.log_encoding_CanonLog2),
 'clog3': (m.log_decoding_CanonLog3,m.log_encoding_CanonLog3),
 'vlog': (m.log_decoding_VLog,m.log_encoding_VLog),
 'log3g10': (m.log_decoding_Log3G10,m.log_encoding_Log3G10),
 'bmfilm5': (m.oetf_inverse_BlackmagicFilmGeneration5,m.oetf_BlackmagicFilmGeneration5),
 'nlog': (m.log_decoding_NLog,m.log_encoding_NLog),
 'dlog': (m.log_decoding_DJIDLog,m.log_encoding_DJIDLog),
}
for gamma,(decode,encode) in camera_functions.items():
 for direction,function in [('decode',decode),('encode',encode)]:
  boundary=[-.05,-.01805699611991131,-.01,0,.005,.0078,.01,.010591,.01125,.014,.18,.328,1,2,16] if direction=='encode' else [-.01,0,.092809,.097465473,.125,.15277891,.181,.4418377321603128,.4,.8,1]
  for value in sorted(set(boundary+rng.random(32).tolist())):
   reference['transfers'].append(dict(gamma=gamma,direction=direction,value=value,expected=float(function(value)),black=0,white=100))
spaces = {'srgb-linear':'sRGB','p3-linear':'Display P3','rec2020-linear':'ITU-R BT.2020','a98rgb-linear':'Adobe RGB (1998)','prophoto-linear':'ProPhoto RGB','acescg':'ACEScg'}
spaces.update({'camera-arri3':'ARRI Wide Gamut 3','camera-arri4':'ARRI Wide Gamut 4','camera-sgamut3':'S-Gamut3','camera-sgamut3cine':'S-Gamut3.Cine','camera-canon':'Cinema Gamut','camera-vgamut':'V-Gamut','camera-redwide':'REDWideGamutRGB','camera-blackmagic':'Blackmagic Wide Gamut','camera-ngamut':'N-Gamut','camera-dgamut':'DJI D-Gamut'})
white65=np.array([.3127,.3290]);white50=np.array([.3457,.3585])
colors=np.vstack(([0,0,0],[1,1,1],np.eye(3),rng.random((40,3))))
for gamut,name in spaces.items():
 space=colour.RGB_COLOURSPACES[name].copy()
 if not gamut.startswith('camera-'): space.use_derived_transformation_matrices(True)
 for rgb in colors:
  xyz=colour.RGB_to_XYZ(rgb,space,illuminant=white65,chromatic_adaptation_transform='Bradford')
  reference['conversions'].append(dict(kind='decodeRgb',gamut=gamut,rgb=rgb.tolist(),expected=xyz.tolist()))
  reference['conversions'].append(dict(kind='encodeRgb',gamut=gamut,rgb=xyz.tolist(),expected=np.asarray(colour.XYZ_to_RGB(xyz,space,illuminant=white65,chromatic_adaptation_transform='Bradford')).tolist()))
  reference['conversions'].append(dict(kind='oklab',gamut=gamut,rgb=xyz.tolist(),expected=css_oklab(xyz).tolist()))
  xyz50=colour.adaptation.chromatic_adaptation_VonKries(xyz,colour.xy_to_XYZ(white65),colour.xy_to_XYZ(white50),transform='Bradford')
  reference['conversions'].append(dict(kind='lab',gamut=gamut,rgb=xyz.tolist(),expected=colour.XYZ_to_Lab(xyz50,illuminant=white50).tolist()))
# Nonlinear cross-channel fixture exercises all six tetrahedra, ties, boundaries,
# out-of-domain inputs and both interpolation modes at actual 33/65 grid sizes.
for size in [2,33,65]:
 axis=np.linspace(0,1,size)
 r,g,b=np.meshgrid(axis,axis,axis,indexing='ij')
 table=np.stack((r*r+.15*g*b, g*g+.1*r*b, b*b+.2*r*g),axis=-1)
 lut_path=ROOT/'artifacts'/f'reference-nonlinear-{size}.cube'
 with lut_path.open('w') as stream:
  stream.write(f'LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
  # Colour table indexes [r,g,b]; .cube serialization is red-fastest.
  for row in table.transpose(2,1,0,3).reshape(-1,3):stream.write(' '.join(format(v,'.17g') for v in row)+'\n')
 points=np.vstack((colors,[-.1,.3,1.2],[.7,.4,.2],[.7,.2,.4],[.4,.7,.2],[.2,.7,.4],[.4,.2,.7],[.2,.4,.7],[.5,.5,.5],[1,0,1],rng.random((80,3))))
 cases=[]
 for method,function in [('trilinear',colour.algebra.table_interpolation_trilinear),('tetrahedral',colour.algebra.table_interpolation_tetrahedral)]:
  expected=function(np.clip(points,0,1),table)
  cases.extend(dict(method=method,input=point.tolist(),expected=result.tolist()) for point,result in zip(points,expected))
 reference['luts'].append(dict(size=size,path=lut_path.name,cases=cases))
# End-to-end reference through a nonlinear 33^3 LUT, including source conversion,
# camera input encoding, domain clamp, interpolation, output decoding and XYZ mix.
size=33; axis=np.linspace(0,1,size); r,g,b=np.meshgrid(axis,axis,axis,indexing='ij')
table=np.stack((r*r+.15*g*b,g*g+.1*r*b,b*b+.2*r*g),axis=-1)
for gamut,gamma in [('camera-arri4','logc4'),('camera-sgamut3','slog3'),('camera-canon','clog3'),('camera-ngamut','nlog')]:
 camera=colour.RGB_COLOURSPACES[spaces[gamut]]
 for rgb in colors[:15]:
  srgb=colour.RGB_COLOURSPACES['sRGB'].copy();srgb.use_derived_transformation_matrices(True)
  xyz=colour.RGB_to_XYZ(rgb,srgb,illuminant=white65,chromatic_adaptation_transform='Bradford',apply_cctf_decoding=True)
  linear=colour.XYZ_to_RGB(xyz,camera,illuminant=white65,chromatic_adaptation_transform='Bradford')
  encoded=np.asarray(camera_functions[gamma][1](linear))
  for method,interpolate in [('trilinear',colour.algebra.table_interpolation_trilinear),('tetrahedral',colour.algebra.table_interpolation_tetrahedral)]:
   result=interpolate(np.clip(encoded,0,1),table)
   output_xyz=colour.RGB_to_XYZ(colour.models.eotf_BT1886(result,L_B=.1,L_W=100)/100,srgb,illuminant=white65,chromatic_adaptation_transform='Bradford')
   for strength in [0,.5,1]:
    mixed=xyz+(output_xyz-xyz)*strength
    reference['pipelines'].append(dict(xyz=xyz.tolist(),gamut=gamut,gamma=gamma,method=method,strength=strength,input=encoded.tolist(),output=result.tolist(),expected=mixed.tolist()))
path=ROOT/'artifacts'/'color-reference.json'
path.write_text(json.dumps(reference,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
print(json.dumps({'engine':reference['engine'],'version':reference['version'],'transferCases':len(reference['transfers']),'conversionCases':len(reference['conversions']),'lutCases':sum(len(item['cases']) for item in reference['luts']),'fixture':str(path)}))
