# 色彩定义、摄影机输入与数值验证

## 严格视图

新实验默认开启「严格等比例」「无光照点色」，LUT 默认四面体插值。旧 URL 中缺少这些字段时保留旧行为：示意比例、球面着色、三线性插值。控件会显示实际状态。

- Oklab：绘图位置为 `(a, L − 0.5, b)`，三轴使用同一单位。
- CIELAB：`(a*/200, (L*−50)/200, b*/200)`；三轴均除以 200，只有统一缩放与平移。
- CIELUV：三轴均除以 280。圆柱表示先还原成相应的笛卡尔坐标。
- XYZ / 线性 RGB：各轴使用同样的数值比例与平移。
- 共同绘图空间的两侧复用相同轴定义、数值端点、正交相机与缩放，不分别适配点云大小。
- 原生视图与自动预览也使用模型对应的数值轴；圆柱模型的水平轴标注为笛卡尔分量，ACEScc 标尺为 −0.36 至 0.56。
- HSL / HSV 属于圆柱参数图，不能把其三维几何距离解释为感知色差。
- 即使使用等单位坐标，屏幕投影距离也不是三维距离。XYZ 的欧氏距离不是感知色差；本版本没有计算 ΔE。

「严格等比例」关闭后保留之前的示意轴比例。球面着色也可单独启用，但它添加了高光与阴影。输入／输出独立色样始终使用纯色填充；LUT 与处理阶段的输出色样对应当前混合强度，不受「保留输入色」影响。标准转换的目标色样始终对应目标坐标实际解码的颜色；映射进度只改变图形位置。超出 sRGB 显示范围会标记并裁剪，仅影响显示，不改变转换坐标。

标准转换不假定颜色必然保留：BT.1886 的非负光输出、ACEScc 的负值编码下限与解码上限可能造成不可逆损失。逐样本比较转换前后相对 XYZ，任一分量绝对误差大于 `1e-7` 时，在状态栏计数并为选中样本显示提示。这是数值往返容差，不是感知色差阈值。共同视图按目标实际解码结果绘图，不复用输入点位。

自定义阶段在编码 sRGB 中处理，随后转换到共同绘图空间，避免把线性 RGB 与编码 RGB 坐标差异误认为 Look 的作用。旧分享链接中的原生阶段视图会迁移到共同 Oklab。HSL / HSV 使用 `S ≤ 0.001%` 的无效色相约定，并检查 sRGB 通道间 `1e-12` 的中性容差，避免白色附近的饱和度除法放大舍入误差。

所有 PNG 导出均注明两侧实际绘图空间、轴比例、平面／球面着色、输入追踪／实际输出着色方式与颜色损失；原生视图选择左侧对照模型时，PNG 使用该对照模型的名称与绘图空间，共同视图则优先使用共同绘图空间。LUT 另外记录两端编码、黑白位、插值和 DOMAIN 钳制数量。

## 传递函数

新增的原生选项与纯幂 Gamma 分开命名：

| 选项                   | 精确定义                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| ProPhoto 原生          | Gamma 1.8 + 暗部线性段；编码转折为线性 1/512，解码转折为 1/32                            |
| Adobe RGB 原生         | 解码指数 563/256，编码为其倒数                                                           |
| BT.2020 OETF（12-bit） | 使用标准舍入常数 α=1.0993、β=0.0181，不使用连续性修正后的另一套常数                      |
| BT.709                 | 使用标准舍入常数；反函数转折取正向 OETF 在 0.018 的输出                                  |
| ACEScc                 | 正输入编码转折为 `2⁻¹⁵`；保留非正输入编码下限，解码上限为 65504；标准空间与 LUT 共用实现 |

sRGB 在精确值 0.04045 处采用 CSS 的线性分支。Colour 0.4.4 使用非线性分支，差为约 2.33×10⁻⁹；独立报告单独记录此定义差异，此点由项目边界单测验证，不混入相同定义的误差统计。

注册的 ACEScc 空间使用项目的共享传递函数，修正 Color.js 0.7.1 在 `2⁻¹⁶` 处提前切换编码分支的问题；矩阵、AP1 基色和白点仍由 Color.js 管理。依据：[ACEScc 编码规范](https://docs.acescentral.com/encodings/acescc/#encoding-function)。

原生曲线依据：[W3C CSS Color 4 转换定义](https://www.w3.org/TR/css-color-4/#color-conversion-code)、[BT.709](https://www.itu.int/rec/R-REC-BT.709/en)、[BT.1886](https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1886-0-201103-I!!PDF-E.pdf)。BT.1886 按每端白位归一化到相对 Y=1，不能用来比较不同绝对显示亮度。

## 摄影机色域与 Log 预设

LUT 输入和输出均提供同一组可选预设，选中后同步设置色域与 Gamma；仍可分别修改。未选择时不推断、不按文件名自动应用。

| 厂商       | 支持组合                                  | 约定                                               |
| ---------- | ----------------------------------------- | -------------------------------------------------- |
| ARRI       | AWG3 / LogC3                              | SUP 3.x、Linear Scene Exposure Factor、固定 EI 800 |
| ARRI       | AWG4 / LogC4                              | 厂商第三方软件公式                                 |
| Sony       | S-Gamut3 / S-Log3；S-Gamut3.Cine / S-Log3 | 10-bit 归一化码值，反射率输入                      |
| Canon      | Cinema Gamut / Canon Log 2、Log 3         | v1.2、反射率约定，包含厂商 0.9 因子                |
| Panasonic  | V-Gamut / V-Log                           | 厂商归一化码值、反射率输入                         |
| RED        | REDWideGamutRGB / Log3G10                 | v3                                                 |
| Blackmagic | Blackmagic Wide Gamut / Film Gen 5        | 仅 Gen 5；保留其白点定义并做适配                   |
| Nikon      | N-Gamut / N-Log                           | 10-bit 归一化码值、反射率输入                      |
| DJI        | D-Gamut / D-Log                           | 厂商舍入解码系数；不是 D-Log M                     |

这些是明确的色域／编码组合，不是所有机型、固件、EI、Log 变体的自动识别。源颜色采样范围仍由源选项决定，不会因为选择一个 Log 输入就扩展成相机完整动态范围。摄影机编码使用相对场景曝光／反射率约定（中灰 .18）；从显示参考样本转换时，相对标尺是工作台约定，不包含场景到显示的 OOTF、曝光匹配或调色软件 DRT。

Sony、Canon、V-Log、N-Log 的公式已经规定其归一化码值。程序不会在这些 Log 值上再次自动执行 legal/full 缩放。自定义 LUT 若使用不同数据范围，必须匹配其真实约定。

矩阵采用 Colour Science 0.4.4 收录的厂商前向矩阵；逆矩阵由前向矩阵求逆，避免前后方向分别舍入造成往返漂移。DJI 厂商逆矩阵只有四位小数，与精确求逆的结果不同；这项误差在报告中单列，不宣称二者逐位相同。

参考：[ARRI LogC 文档](https://www.arri.com/en/learn/camera-systems/image-science/log-c)、[Sony S-Gamut3 / S-Log3 技术说明](https://pro.sony/s3/cms-static-content/uploadfile/06/1237494271406.pdf)、[Colour 摄影机传递函数及其原始文献](https://colour.readthedocs.io/en/v0.4.4/colour.models.html)。

## LUT 插值

支持三线性和四面体，且独立于 33³ / 65³ 的表格尺寸。四面体算法依据单元格内三个小数坐标的排序选择六个四面体之一，使用四个顶点插值。相等分量位于共享面，边界连续。域外输入仍按 DOMAIN 钳制并计数。

LUT 颜色管理与查表使用浮点数。最终显示才裁剪至 sRGB 并量化；不同插值方式可能给出不同的非节点结果，应与参考调色软件使用同一种方式。

## 可复现的独立交叉验证

网站运行引擎为 Color.js + 项目 TypeScript；参考引擎为独立 Python 虚拟环境中的 **Colour Science 0.4.4**，固定 numpy 1.26.4、scipy 1.13.1。OpenColorIO 的可选安装需要本机编译，未用作本次参考引擎。

```sh
python3 -m venv /tmp/chromatic-reference
/tmp/chromatic-reference/bin/pip install -r scripts/reference-requirements.txt
REFERENCE_PYTHON=/tmp/chromatic-reference/bin/python npm run verify:reference
```

`generate-reference.py` 不调用网站代码，也不读取 Color.js 实现。它生成确定性测试输入、Colour 参考值以及非线性 2³ / 33³ / 65³ LUT。随后 Vitest 调用真正的生产转换、插值与完整 LUT 处理链进行比较。

Colour 0.4.4 的内置 Oklab 使用旧 XYZ 矩阵，白点与 CSS 定义不完全相同。参考生成器使用 **Colour 的通用 XYZ_to_Iab 引擎 + W3C §19 公布的 D65 一致矩阵**，明确对齐数学定义，未更改生产代码或放宽 Oklab 误差阈值。

已验证：

- 1,755 个原生／摄影机传递函数案例，含转折、负值、灰阶和高光。
- 106 个标准 ACEScc 空间编解码案例，直接调用 `convertColor`，包含 `2⁻¹⁶`、`2⁻¹⁵` 及其两侧，防止只验证 LUT 工具函数而遗漏界面入口。
- 2,880 个 XYZ、Oklab、CIELAB 转换案例，覆盖 16 种基色及 Bradford 白点适配。
- 804 个三线性／四面体插值案例，覆盖全部六个区域、共享面、节点、端点、域外输入及完整 33³ / 65³ 文件。
- 360 个相机编码 → 非线性 LUT → BT.1886 → XYZ 混合的完整链路案例。

本次结果（5,905 个案例，14,205 个标量分量）：

| 分类                 | 最大绝对误差 |
| -------------------- | -----------: |
| 传递函数             |   5.69×10⁻¹⁴ |
| XYZ 解码             |    7.94×10⁻⁶ |
| XYZ 编码             |    8.99×10⁻⁵ |
| Oklab，同一 W3C 定义 |   8.33×10⁻¹⁶ |
| CIELAB               |   1.14×10⁻¹³ |
| LUT 插值             |   3.34×10⁻¹⁶ |
| 完整颜色管理链       |   1.43×10⁻¹¹ |

XYZ 误差主要来自不同文献中 ProPhoto 基色和摄影机矩阵的舍入精度，尤其 DJI 的四位小数逆矩阵。每组的阈值、最大误差、最差输入和期望值全部保留在 `artifacts/color-reference-report.json`；原始参考数据为 `artifacts/color-reference.json`，日志为 `artifacts/reference-run.log`。这些是实际执行结果，不是手工填写的通过标记。

参考引擎 NumPy 的 `where/select` 会同时求值未选中的对数分支，因此对负值案例产生运行时警告；结果必须全部有限，生成器用 `allow_nan=False` 强制验证，警告保留在日志。未安装 Matplotlib 不影响数值 API。

该验证不代表所有摄影机固件或所有 LUT 都与 Resolve/Baselight 一致，也不等于显示器测量校准或视觉外观认证。

## 图例数据与新增模型的验证

`npm run generate:figure-data`（需要与上文相同的 `REFERENCE_PYTHON` 环境）运行 `scripts/generate-figure-data.py`，从 Colour Science 0.4.4 导出：

- `src/data/spectral.json`：CIE 1931 2° 与 CIE 1964 10° 配色函数、Wright & Guild 1931 RGB 配色函数、D65 与 A 光源、NPL 测量的 Nikon 5100 / Sigma SD Merrill 相机光谱灵敏度（均为 380–780 nm、5 nm；Sigma 只有 400–680 nm）。
- `src/data/gamuts.json`：Pointer（1980）色域（SC 光源下的 LCh，以及经 Bradford 适配到 D65 的 XYZ）与 MacAdam（1942）椭圆（计算值列）。
- `src/data/tm30.json`：用 99 条 CES 光谱算出的 TM-30-18 色相区间平均值、Rf、Rg、CCT、Duv。网页只绘图，不在浏览器里重算 CAM02-UCS。
- `tests/reference/figures.json`：供 `tests/figures-science.test.ts` 比对的独立参考值。

已核对（`tests/figures-science.test.ts`）：

| 项目                                                     | 参考                                           |                        容差 |
| -------------------------------------------------------- | ---------------------------------------------- | --------------------------: |
| ZCAM J、C、h（白 203 cd/m²，L_A = Y_b = 40.6，普通环境） | `XYZ_to_ZCAM`                                  |                      1×10⁻⁶ |
| ZCAM 逆变换往返                                          | —                                              |                      1×10⁻⁷ |
| IPT、HPE LMS                                             | `XYZ_to_IPT`                                   |                     1×10⁻¹² |
| Color.js Jzazbz（白 203 cd/m²）                          | `XYZ_to_Jzazbz`                                |                      1×10⁻⁶ |
| DaVinci Wide Gamut 矩阵、DaVinci Intermediate            | `RGB_COLOURSPACES`、`oetf_DaVinciIntermediate` |                     1×10⁻¹⁰ |
| PQ、HLG、LogC4、S-Log3                                   | `eotf_inverse_ST2084` 等                       |                      1×10⁻⁹ |
| 普朗克轨迹（c₂ = 1.4388×10⁻²）、日光轨迹                 | `sd_blackbody`、`CCT_to_xy_CIE_D`              |                      1×10⁻⁹ |
| 最优色（等能白下的矩形反射率）                           | `sd_to_XYZ`                                    |                      1×10⁻⁹ |
| Machado 2009 矩阵                                        | `CVD_MATRICES_MACHADO2010`                     |                     1×10⁻¹² |
| CCT、Duv（7 个色度点，Duv 绝对值至 0.01）                | `uv_to_CCT_Ohno2013`                           | CCT 相对 2×10⁻³，Duv 2×10⁻⁴ |
| 10-bit / 8-bit Full 与 Legal range 码值                  | ITU-R BT.709、BT.2100 定义                     |                        精确 |

没有独立参考实现、因而只做性质检查的部分：Stephen Hill 的 ACES 拟合与 AgX 多项式近似（单调、0–1 有界）、ACES RGC（阈值内不变、极限映射到边界）、同色异谱样本（D65 下 XYZ 相等、A 下不同）、Kubelka–Munk 混合。宽色域图例中超出最优色边界的采样比例（AP1 255/729、DWG 429/729、AWG4 377/729、S-Gamut3 374/729）由同一生成脚本用 Colour 的 `XYZ_outer_surface` 凸包检查得到，记录在 `tests/reference/figures.json` 的 `outsideOptimal`，并由单元测试与图例文字逐项核对。

上述最优色体积固定等能白 E、反射率 0–1 与完美漫反射体 Y=1，再经 Bradford 适配到 D65 绘图；适配后的 E 色体积不是重新用 D65 光谱积分的结果。边界外比例不是虚色比例，也不是摄影机色域中不可见颜色的比例：真实的发光色也可能在该反射色体积之外。白色线圈只展示 E 下 L* 10–90 的切片，不构成包含黑白端点的完整外壳。

AgX 的多项式与 outset 输出处于 Gamma 2.2 编码域，先以 2.2 次幂解码成线性 Rec.709 显示值。AgX 与 ACES 拟合共用「线性显示值 → sRGB 分段编码」的显示路径，曲线、晶格和色样均遵循这一约定；Gamma 2.2 不能直接当作 sRGB 分段编码。固定暗部与中灰值用于编码域回归检查，不宣称它们是完整 AgX 的独立参考验证。

CCT 与 Duv 在网页中直接求 CIE 1960 uv 中普朗克轨迹的最近点（查表 + 黄金分割），定义与 Ohno 2013 相同，但不使用其三角 / 抛物线近似；网页的配色函数为 380–780 nm、5 nm，而 Colour 默认用 360–830 nm、1 nm，所以容差按观察者数据的差异设置，而不是浮点精度。计算范围为 1000–100000 K（含端点）；最近点超出范围时返回空结果，页面显示超出计算范围，不把截断端点作为有效 CCT 或 Duv。图中的 CIE 1976 u′v′ 仅为显示坐标，Duv 距离仍在 uv = (u′, 2v′/3) 中计算。

拜耳图例把程序生成的 sRGB 测试图先解码为线性 RGB，再进行 RGGB 采样和双线性插值，最终编码回 sRGB 显示。误差 ×4 与 PSNR 均比较重建图与原图的 sRGB 编码值，PSNR 的峰值为 1；它们不表示线性曝光误差。回归测试覆盖黑白边缘的线性插值、已测通道保留与边界处的均匀色重建。

### RGB 变换晶格的坐标与动画

- Hill ACES 拟合按 `clip(M_out · f(M_in · RGB))` 计算。对于固定的非零、非负 RGB 比例，增加曝光会使正系数前置矩阵的三个输出通道一起趋于高值，有理函数趋于同一个常数，最终裁剪到显示白。有限采样中的偏色和通道裁剪不表示高光永远停留在六个彩色顶点。AgX 使用 Minimal AgX 的六次多项式近似；未量化其与 Blender 完整 AgX／OCIO 输出的差异。
- Machado 图例在线性 sRGB 的 0–1 范围均匀采样，位置为 `M · RGB_linear`，保留负值和大于 1 的值；只对点色及色样应用 sRGB 编码和显示裁剪。Protan／Deutan 的公布矩阵经过六位小数舍入，展示真实行列式并标为「近似秩 2」，最小奇异方向不标为精确零空间。Tritan 仍有三维体积。
- 关键帧之间以 `s = 3t² − 2t³` 做坐标插值，中间帧标为「过渡示意」，不代表变换强度、色觉缺陷严重度或新的色彩空间。跨坐标域时轴标签标明「过渡」，仅关键帧显示对应的输入／输出状态。固定色样及矩阵读数明确标注输入与最终输出。
- RGC 第一步将 S-Gamut3 坐标过渡到 AP1，期间不显示 AP1 越界统计。第二步在 AP1 中插值，逐帧按当前未平移的坐标统计含负通道的节点（容差 `1e-9`）；通道大于 1 不算 AP1 色域之外。CVD 及 RGC 的 AP1 阶段按当前线性坐标重新生成显示颜色。
- RGC 使用 `A = max(R,G,B)` 和 `d = (A − c) / abs(A)`；`A = 0` 时距离为零，重建结果也为零，包括 `[-1,0,0]` 等含负通道的输入。其余距离压缩和参数不变。

回归验证覆盖六个彩色方向的 Hill 高曝光白收敛、CVD 晶格与独立 Machado 矩阵列的对应、显示编码、RGC 零最大值及邻域，以及 RGC 进度 `1 / 1.6 / 2` 对应的当前越界节点数 `206 / 117 / 0`。图例单元测试调用实际采样与插值函数；WebKit 检查状态标签、坐标域、读数及窄屏展示。

依据：[Hill ACES.hlsl](https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl)、[Minimal AgX](https://iolite-engine.com/blog_posts/minimal_agx_implementation)、[ACES RGC 规范](https://docs.acescentral.com/rgc/specification/)。
