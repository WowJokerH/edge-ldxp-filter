# 链动小铺货源增强筛选 浏览器扩展

这是一个不依赖油猴的本地浏览器扩展，兼容 Microsoft Edge 和 Google Chrome（基于 Manifest V3）。打开链动小铺相关页面后，扩展会自动显示一个悬浮小胶囊；点击胶囊展开筛选面板后，可以通过原站接口拉取数据，并在浏览器本地做筛选、排序和分页展示。

项目地址：`https://github.com/WowJokerH/edge-ldxp-filter`

## 视频演示

【链动小铺货源筛选浏览器插件】https://www.bilibili.com/video/BV1kyLb6fEWa/?share_source=copy_web&vd_source=9da43d789b00645889be19bc71b290cc

## 安装

### Microsoft Edge

1. 打开 Edge，访问 `edge://extensions/`。
2. 打开左侧的 `开发人员模式`。
3. 点击 `加载解压缩的扩展`。
4. 选择下载并解压后的插件文件夹：`edge-ldxp-filter`。

### Google Chrome

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角的 `开发者模式`。
3. 点击左上角的 `加载已解压的扩展程序`。
4. 选择下载并解压后的插件文件夹：`edge-ldxp-filter`。

### 使用前置条件

登录链动小铺后台，打开 `https://www.ldxp.cn/` 或 `https://pay.ldxp.cn/` 下的页面；识别到站点后会先显示右上角悬浮小胶囊，点击后展开完整面板。货源筛选推荐进入 `https://www.ldxp.cn/merchant/my_parent/source_square` 或 `https://pay.ldxp.cn/merchant/my_parent/source_square`。

## 使用

- `开始拉取`：按设置的页数调用 `/merchantApi/MyParent/searchGoodsList`。
- 识别到 `pay.ldxp.cn` 或 `www.ldxp.cn` 后会自动显示可拖拽悬浮小胶囊，不会默认展开遮挡页面。
- `筛选当前数据`：不重新请求接口，只对已经拉取的数据重新筛选。
- `停止拉取`：拉取过程中再次点击按钮会中止请求。
- 关键词、分类关键词和商家名称筛选都不区分大小写。
- 面板标题栏可以拖动，右下角的斜纹手柄可以调整大小，右上角可以最小化成悬浮小图标或关闭；当前界面已压缩筛选区，把更多空间留给下方结果表格。
- 最小化后的悬浮小图标也可以拖拽移动，单击小图标恢复完整面板。
- 扩展图标和最小化悬浮图标使用同一套本地 `assets/icon-*.png` 图标；每页显示可选 `5/10/15/20/25/30`，默认 `10`。
- 未对接商品可以直接点表格里的 `对接` 打开对接配置弹窗；这个流程复用原站接口，确认后调用 `/merchantApi/MyParent/connectGoods`。已对接商品会显示 `查看`，跳转到原站返回的已对接商品链接。
- 作者卡网和感谢小纸条固定在面板底栏，不会被结果表格或窗口缩放挤没。
- 已按真实接口字段精简：商品名 `name`、分类 `category.name`、商家 `user.nickname`、库存 `stock_count`、对接状态 `child`、上架状态 `status`、价格 `price/cost_price`。
- 当前版本会尝试从 `localStorage` 读取 `auth-token` 作为 `Merchant-Token`，所以必须先在原站登录。

## 作者小纸条

觉得好用的话，下次可以来哇咔咔这里补一单小小感谢；挑最便宜的商品也完全 OK，主要是让哇咔咔开心一下。

作者卡网：`https://pay.ldxp.cn/shop/V2YZIFWM`

## 可调整项

如果链动小铺接口字段发生变化，优先修改 `content.js` 里的这些函数：

- `buildRequestBody`
- `normalizeList`
- `getProductTitle`
- `getCostPrice`
- `getConnectedLabel`
