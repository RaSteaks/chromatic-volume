# 色彩定义、摄影机输入与数值验证

## 严格视图

新实验默认开启「严格等比例」「无光照点色」，LUT 默认四面体插值。旧 URL 中缺少这些字段时保留旧行为：示意比例、球面着色、三线性插值。控件会显示实际状态。

- Oklab：绘图位置为 `(a, L − 0.5, b)`，三轴使用同一单位。
- CIELAB：`(a*/200, (L*−50)/200, b*/200)`；三轴均除以 200，只有统一缩放与平移。
- CIELUV：三轴均除以 280。圆柱表示先还原成相应的笛卡尔坐标。
- XYZ / 线性 RGB：各轴使用同样的数值比例与平移。
- 共同绘图空间的两侧复用相同轴定义、数值端点、正交相机与缩放，不分别适配点云大小。
- HSL / HSV 属于圆柱参数图，不能把其三维几何距离解释为感知色差。
- 即使使用等单位坐标，屏幕投影距离也不是三维距离。XYZ 的欧氏距离不是感知色差；本版本没有计算 ΔE。

「严格等比例」关闭后保留之前的示意轴比例。球面着色也可单独启用，但它添加了高光与阴影。输入／输出独立色样始终使用纯色填充；输出色样对应当前混合强度，不受「保留输入色」影响。超出 sRGB 显示范围会标记并裁剪，仅影响显示，不改变转换坐标。

## 传递函数

新增的原生选项与纯幂 Gamma 分开命名：

| 选项                   | 精确定义                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| ProPhoto 原生          | Gamma 1.8 + 暗部线性段；编码转折为线性 1/512，解码转折为 1/32       |
| Adobe RGB 原生         | 解码指数 563/256，编码为其倒数                                      |
| BT.2020 OETF（12-bit） | 使用标准舍入常数 α=1.0993、β=0.0181，不使用连续性修正后的另一套常数 |
| BT.709                 | 使用标准舍入常数；反函数转折取正向 OETF 在 0.018 的输出             |
| ACEScc                 | 保留负输入编码下限；解码上限按标准限制为 65504                      |

sRGB 在精确值 0.04045 处采用 CSS 的线性分支。Colour 0.4.4 使用非线性分支，差为约 2.33×10⁻⁹；独立报告单独记录此定义差异，此点由项目边界单测验证，不混入相同定义的误差统计。

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

- 1,743 个原生／摄影机传递函数案例，含转折、负值、灰阶和高光。
- 2,880 个 XYZ、Oklab、CIELAB 转换案例，覆盖 16 种基色及 Bradford 白点适配。
- 804 个三线性／四面体插值案例，覆盖全部六个区域、共享面、节点、端点、域外输入及完整 33³ / 65³ 文件。
- 360 个相机编码 → 非线性 LUT → BT.1886 → XYZ 混合的完整链路案例。

本次结果（5,787 个案例，13,875 个标量分量）：

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
