<div align="center">

# Chromatic Volume

**把颜色空间画成可以旋转的三维体积**

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Color.js](https://img.shields.io/badge/Color.js-0.7-E0457B)
![Canvas 2D](https://img.shields.io/badge/Render-Canvas%202D-222222)

<img src="public/cover.png" alt="sRGB 色域在 Oklab 中的映射" width="860" />

<sub>同一组 729 个 sRGB 样本：左边是 RGB 立方体，右边是它在 Oklab 中的真实形状</sub>

</div>

<br />

## 🖼️ 图例

每张图都是工作台的实际渲染：同一组源样本放进不同模型，直接看形状怎么变。

<table>
  <tr>
    <td width="33%"><img src="docs/images/srgb-oklab.png" alt="sRGB 在 Oklab 中" /></td>
    <td width="33%"><img src="docs/images/srgb-cielab.png" alt="sRGB 在 CIELAB D50 中" /></td>
    <td width="33%"><img src="docs/images/srgb-cieluv.png" alt="sRGB 在 CIELUV 中" /></td>
  </tr>
  <tr>
    <td><b>Oklab</b><br /><sub>立方体被扭成斜置的块：黄色角位于高亮度，蓝色角沉到低亮度</sub></td>
    <td><b>CIELAB · D50</b><br /><sub>同为对立色坐标，与 Oklab 并排可看出两者对蓝紫区域的处理差异</sub></td>
    <td><b>CIELUV</b><br /><sub>u*v* 平面更宽更扁，红色角明显外凸</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/srgb-linear.png" alt="sRGB 在线性 sRGB 中" /></td>
    <td><img src="docs/images/srgb-hsv.png" alt="sRGB 在 HSV 中" /></td>
    <td><img src="docs/images/srgb-hsl.png" alt="sRGB 在 HSL 中" /></td>
  </tr>
  <tr>
    <td><b>线性 sRGB</b><br /><sub>去掉传递函数后，均匀编码的样本向暗部聚拢</sub></td>
    <td><b>HSV</b><br /><sub>色相绕轴旋转，饱和度沿半径展开，明度向上</sub></td>
    <td><b>HSL</b><br /><sub>纯色停在中间亮度，黑白分别收向两端</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/p3-xyz.png" alt="Display P3 在 CIE XYZ 中" /></td>
    <td><img src="docs/images/rec2020-oklab.png" alt="Rec.2020 在 Oklab 中" /></td>
    <td><img src="docs/images/look-film.png" alt="自定义处理后的色体积" /></td>
  </tr>
  <tr>
    <td><b>Display P3 → CIE XYZ</b><br /><sub>线性三刺激值中，RGB 立方体变成一个斜切的平行六面体</sub></td>
    <td><b>Rec.2020 → Oklab</b><br /><sub>更宽的色域把体积推向 a / b 轴外侧</sub></td>
    <td><b>自定义 Look</b><br /><sub>叠加饱和度、串扰、高光褪色等阶段后，色体积被压扁并剪切</sub></td>
  </tr>
</table>

<sub>屏幕只能显示 sRGB 范围内的颜色，宽色域的点在着色时会被裁剪；点的位置不受影响。</sub>

<br />

## 🗺️ 图例路线图

> 以下内容**尚在规划中**，按批次推进。🔶 表示工作台中已有相关能力，但还不是这里描述的展示形式。

### 第一批 · 色域体积扩充

复用现有的点云渲染器，只新增公式和矩阵。

**新色彩空间**

| #   | 空间   | 看点                                                   |
| --- | ------ | ------------------------------------------------------ |
| 1   | Y′CbCr | 俯视就是矢量示波器，侧视就是波形图，能和另外两种图对上 |
| 2   | HSV    | 六棱锥 <sub>🔶 目前是圆柱参数图</sub>                  |
| 3   | HSL    | 双六棱锥 <sub>🔶 目前是圆柱参数图</sub>                |
| 4   | CIELUV | 和 CIELAB 并排对比 <sub>🔶 已可作为目标模型</sub>      |
| 5   | LMS    | 视锥细胞响应空间                                       |
| 6   | IPT    | Oklab 和 ICtCp 的前身                                  |
| 7   | Jzazbz | HDR 均匀色彩空间                                       |
| 8   | ZCAM   | HDR 色貌模型，常数需与参考实现逐项核对后上线           |

**新色域**

| #   | 色域               | 备注                         |
| --- | ------------------ | ---------------------------- |
| 9   | ACES AP1           | 🔶 已作为 ACEScg 源空间      |
| 10  | DaVinci Wide Gamut |                              |
| 11  | ARRI Wide Gamut 4  | 🔶 矩阵已用于 LUT 摄影机预设 |
| 12  | S-Gamut3           | 🔶 矩阵已用于 LUT 摄影机预设 |

**体积叠加层**

| #   | 叠加层       | 看点                                                              |
| --- | ------------ | ----------------------------------------------------------------- |
| 13  | 最优色边界   | 等能白 E、完美漫反射体 Y=1 下的反射色极限；不等于所有可见色的边界 |
| 14  | Pointer 色域 | 真实物体颜色的范围，基于实测数据表                                |
| 15  | 渐变路径     | 同一对颜色分别在 sRGB、线性 RGB、Oklab 中插值，画出三条不同的路径 |

### 第二批 · 「色彩变换」图

3D LUT 晶格从单位立方体逐渐变形到变换后的形状，可拖动旋转。

| #   | 变换          | 说明                                             |
| --- | ------------- | ------------------------------------------------ |
| 16  | ACES 色调映射 | Stephen Hill 的拟合版，标注为拟合，不是 ACES 2.0 |
| 17  | AgX           | 多项式近似版                                     |
| 18  | 红色盲        | Machado 2009                                     |
| 19  | 绿色盲        | Machado 2009                                     |
| 20  | 蓝色盲        | Machado 2009                                     |
| 21  | ACES 色域压缩 | S-Gamut3 晶格先放进 AP1，再被「吸」回色域内      |

### 第三批 · 「色度图」「光谱」「曲线」

**色度图**

| #   | 图              | 看点                                                           |
| --- | --------------- | -------------------------------------------------------------- |
| 22  | CIE 1931 马蹄图 | 光谱轨迹、普朗克轨迹、日光轨迹、等色温线，各色域三角形轮流出现 |
| 23  | 麦克亚当椭圆    | 在 xy 与 u′v′ 之间来回变换                                     |
| 24  | 等色相线        | 在 xy 上画 CIELAB 与 Oklab 的等色相线，展示 Lab 蓝色偏紫的问题 |

**光谱**

| #   | 图             | 看点                                                 |
| --- | -------------- | ---------------------------------------------------- |
| 25  | CIE 配色函数   | 波长游标扫过曲线，同时显示对应颜色                   |
| 26  | RGB 配色函数   | 包含负值部分                                         |
| 27  | 黑体辐射       | 色温从 2000 K 扫到 10000 K，同时显示白点             |
| 28  | 同色异谱       | 两条光谱在 D65 下是同一种颜色，换到 A 光源后不再相同 |
| 29  | TM-30 色矢量图 | 基于 99 条样本光谱                                   |
| 30  | 相机光谱灵敏度 | 与人眼配色函数对比（Luther 条件），基于真实相机数据  |

**曲线**

| #   | 图           | 看点                                                                                                            |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| 31  | 传递函数     | sRGB、Rec.709、Gamma 2.4、PQ、HLG、LogC4、S-Log3、DaVinci Intermediate；横轴统一为以漫反射白 = 1.0 计的曝光档位 |
| 32  | 色调映射     | Reinhard、Hable、ACES 拟合、AgX                                                                                 |
| 33  | 胶片特性曲线 | H&D 示意曲线（趾部、直线部、肩部），不对应具体胶片型号                                                          |

### 第四批 · 「像素」图

| #   | 图                 | 看点                                           |
| --- | ------------------ | ---------------------------------------------- |
| 34  | 色度抽样网格       | 4:4:4、4:2:2、4:2:0                            |
| 35  | 位深与色带         | 8-bit 与 10-bit 渐变对比                       |
| 36  | 拜耳阵列           | 原始马赛克与去马赛克结果                       |
| 37  | 光的混合与颜料混合 | Kubelka–Munk 模型 + 理想化颜料光谱，标注为示意 |

<br />

## ✨ 工作台功能

| 功能            | 说明                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **源色域**      | sRGB、线性 sRGB、Display P3、Rec.2020、Adobe RGB、ProPhoto RGB、ACEScg、ACEScc、Rec.709 OETF、Rec.709 + BT.1886                               |
| **目标模型**    | 21 种：Oklab / OKLCH、CIELAB / LCh、CIELUV / LChuv、CIE XYZ、各 RGB 工作空间、HSL、HSV                                                        |
| **3D LUT**      | 导入 2³–65³ 的 `.cube` 文件，完整加载不降采样；三线性 / 四面体插值；内置 ARRI、Sony、Canon、Panasonic、RED、Blackmagic、Nikon、DJI 摄影机预设 |
| **自定义 Look** | 十种可开关、可调整顺序的处理阶段，观察每一步怎样拉伸、剪切、压扁色体积                                                                        |
| **映射进度**    | 在源位置与目标位置之间插值，看每个点的移动轨迹                                                                                                |
| **精确读数**    | 点击任一点查看各阶段坐标；状态栏报告颜色损失与超出显示范围的点数                                                                              |
| **交互**        | 拖动 / 方向键旋转，两侧同步；滚轮 / `+` `-` 缩放；`Home` 复位；可选自动旋转                                                                   |
| **导出与分享**  | 两侧画布导出为 PNG；完整状态编码进 URL                                                                                                        |
| **自动预览**    | `/preview` 固定展示 sRGB → Oklab 缓慢旋转，可直接嵌入                                                                                         |

<br />

## 🛠️ 技术实现

- **渲染**：Canvas 2D 正交投影真实三维坐标，按深度排序由远及近绘制，无 WebGL 依赖；按需重绘，预览页限制 24 fps，不可见时暂停。
- **色彩引擎**：[Color.js](https://colorjs.io/) 负责标准转换；BT.709 / BT.1886、ACEScc 与八家摄影机 Log 曲线由项目实现并注册为 Color.js 空间。
- **严格比例**：每个模型只做统一缩放与平移，三轴单位一致；圆柱模型先还原为笛卡尔坐标。LUT 与自定义 Look 两侧共用同一绘图空间、轴和相机。
- **数值验证**：用独立的 Python [Colour Science](https://www.colour-science.org/) 生成参考值，与生产代码交叉比对 5,905 个案例。详见 [色彩科学与验证说明](docs/COLOR-SCIENCE.md)。
- **构建**：TypeScript + Vite，输出纯静态站点；Vitest 单元测试，Playwright headless WebKit 端到端测试。

<br />

## ☁️ Cloudflare Workers 部署

项目使用 Workers Static Assets 托管 Vite 生成的 `dist`，部署配置保存在 `wrangler.jsonc`。
首页与 `/preview/` 使用各自的 HTML 入口，未知路径返回 404。

Cloudflare Workers Builds 设置：

- **构建命令**：`npm run build`
- **部署命令**：`npx wrangler deploy`
- **根目录**：仓库根目录

Wrangler 已列入开发依赖并由 `package-lock.json` 锁定版本，CI 的 `npm ci` 会安装它。
部署直接读取静态资源配置，无需自动修改 Vite 配置或安装 Cloudflare Vite 插件。

本地安装依赖后，可先构建并检查部署配置（不上传）：

```bash
npm ci
npm run deploy -- --dry-run
```

完成 Cloudflare 授权后，运行 `npm run deploy` 可构建并发布。

<br />

## 📄 许可证

本项目基于 [GNU Affero General Public License v3.0](LICENSE) 开源。
