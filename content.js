(() => {
  "use strict";

  const ROOT_ID = "ldxp-edge-filter-root";
  const API_URL = "/merchantApi/MyParent/searchGoodsList";
  const MAX_FETCH_PAGES = 500;
  const DEFAULT_FETCH_SIZE = 50;

  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const state = {
    raw: [],
    filtered: [],
    currentPage: 1,
    pageSize: 10,
    loading: false,
    abortController: null,
    lastSummary: ""
  };

  const asText = (value) => (value === undefined || value === null ? "" : String(value));

  const normalizeSearchText = (value) => asText(value).trim().toLocaleLowerCase();

  const asNumber = (value, fallback = null) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    const match = asText(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  };

  const money = (value) => {
    const num = asNumber(value, NaN);
    if (!Number.isFinite(num)) {
      return "-";
    }
    return num.toFixed(2).replace(/\.00$/, "");
  };

  const escapeHtml = (value) =>
    asText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const normalizeToken = (raw) => {
    if (!raw) {
      return "";
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        return parsed;
      }
      return parsed.value || parsed.token || parsed.access_token || parsed.accessToken || raw;
    } catch (_) {
      return raw;
    }
  };

  const getToken = () => {
    const keys = ["auth-token", "Merchant-Token", "merchant-token", "token", "Authorization"];
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) {
        return normalizeToken(value);
      }
    }
    return "";
  };

  const getProductId = (item) => item.id ?? item.goods_key ?? "";
  const getProductTitle = (item) => item.name || "";
  const getMerchant = (item) => item.user?.nickname || "";
  const getCategory = (item) => item.category?.name || "";
  const getCategorySearchText = getCategory;
  const getMerchantSearchText = getMerchant;

  const getItemSearchText = (item) =>
    [
      getProductTitle(item),
      getMerchantSearchText(item),
      getCategorySearchText(item),
      getProductId(item)
    ].join(" ");

  const getImage = (item) =>
    item.image || item.cover || item.thumb || "";

  const getStock = (item) => asNumber(item.stock_count, null);

  const getSales = (item) =>
    asNumber(item.sale_num ?? item.sales, null);

  const getSalePrice = (item) =>
    asNumber(item.price, null);

  const getCostPrice = (item) => {
    const direct = asNumber(item.cost_price, null);
    if (direct !== null && direct >= 0) {
      return direct;
    }

    const limited = asNumber(item.agent_price_limit, null);
    if (limited !== null && limited >= 0) {
      return limited;
    }

    const levels = ["agent_price1", "agent_price2", "agent_price3"]
      .map((key) => asNumber(item[key], NaN))
      .filter((num) => Number.isFinite(num) && num >= 0);
    return levels.length ? Math.min(...levels) : null;
  };

  const getStatusLabel = (item) => {
    const numeric = asNumber(item.status, null);
    if (Number.isFinite(numeric)) {
      if (numeric === 1) {
        return "正常";
      }
      if (numeric === 0) {
        return "未上架";
      }
    }
    return "-";
  };

  const getStatusKind = (item) => {
    const numeric = asNumber(item.status, null);
    if (Number.isFinite(numeric)) {
      return numeric === 1 ? "normal" : "off";
    }
    return "unknown";
  };

  const getConnectedKind = (item) => {
    return item.child ? "linked" : "unlinked";
  };

  const getConnectedLabel = (item) => (getConnectedKind(item) === "linked" ? "已对接" : "未对接");

  const includesText = (source, query) => {
    if (!query) {
      return true;
    }
    return normalizeSearchText(source).includes(normalizeSearchText(query));
  };

  const root = document.createElement("section");
  const iconUrl = chrome.runtime.getURL("assets/icon-48.png");
  root.id = ROOT_ID;
  root.innerHTML = `
    <button class="ldxp-mini-launcher" data-action="expand" title="展开货源增强筛选">
      <img class="ldxp-mini-icon" src="${iconUrl}" alt="">
    </button>
    <div class="ldxp-panel">
      <div class="ldxp-titlebar">
        <div>
          <div class="ldxp-title">
            <span class="ldxp-title-mark">筛</span>
            <span>货源增强筛选</span>
            <span class="ldxp-title-badge">轻甜版</span>
          </div>
          <div class="ldxp-subtitle">拉取接口数据后在本页筛选，不修改原站数据</div>
        </div>
        <div class="ldxp-title-actions">
          <button class="ldxp-icon-btn" data-action="collapse" title="最小化">-</button>
          <button class="ldxp-icon-btn" data-action="close" title="关闭">x</button>
        </div>
      </div>

      <div class="ldxp-body">
        <div class="ldxp-controls">
          <label>
            <span>关键词</span>
            <input data-field="keyword" type="search" placeholder="商品名 / 店铺 / 分类">
          </label>
          <label>
            <span>商品类型</span>
            <select data-field="goodsType">
              <option value="">全部</option>
              <option value="card">卡密</option>
              <option value="knowledge">知识</option>
              <option value="resource">资源</option>
              <option value="rights">权益</option>
            </select>
          </label>
          <label>
            <span>拉取页数</span>
            <input data-field="pages" type="number" min="1" max="${MAX_FETCH_PAGES}" value="5">
          </label>
          <label>
            <span>成本价最低</span>
            <input data-field="minCost" type="number" min="0" step="0.01" placeholder="不限">
          </label>
          <label>
            <span>成本价最高</span>
            <input data-field="maxCost" type="number" min="0" step="0.01" placeholder="不限">
          </label>
          <label>
            <span>库存</span>
            <select data-field="stockMode">
              <option value="all">全部</option>
              <option value="in">仅有库存</option>
              <option value="out">仅无库存</option>
            </select>
          </label>
          <label>
            <span>状态</span>
            <select data-field="statusMode">
              <option value="all">全部</option>
              <option value="normal">正常</option>
              <option value="off">未上架</option>
            </select>
          </label>
          <label>
            <span>关联状态</span>
            <select data-field="connected">
              <option value="all">全部</option>
              <option value="linked">已对接</option>
              <option value="unlinked">未对接</option>
            </select>
          </label>
          <label>
            <span>分类关键词</span>
            <input data-field="categoryKeyword" type="search" placeholder="分类包含">
          </label>
          <label>
            <span>商家名称</span>
            <input data-field="merchantKeyword" type="search" placeholder="商家包含">
          </label>
          <label>
            <span>排序</span>
            <select data-field="sort">
              <option value="default">默认</option>
              <option value="costAsc">成本价升序</option>
              <option value="costDesc">成本价降序</option>
              <option value="stockAsc">库存升序</option>
              <option value="stockDesc">库存降序</option>
              <option value="salesDesc">销量降序</option>
            </select>
          </label>
          <label>
            <span>每页显示</span>
            <select data-field="pageSize">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="15">15</option>
              <option value="20">20</option>
              <option value="25">25</option>
              <option value="30">30</option>
            </select>
          </label>
        </div>

        <div class="ldxp-actions">
          <button class="ldxp-primary" data-action="fetch">开始拉取</button>
          <button data-action="apply">筛选当前数据</button>
          <button data-action="reset">重置</button>
          <span class="ldxp-status" data-role="status">等待操作</span>
        </div>

        <div class="ldxp-resultbar">
          <span data-role="summary">暂无数据</span>
          <div class="ldxp-pager">
            <button data-action="first">首页</button>
            <button data-action="prev">上一页</button>
            <input data-field="pageJump" type="number" min="1" value="1" title="页码">
            <button data-action="jump">跳转</button>
            <span data-role="pageInfo">/ 1</span>
            <button data-action="next">下一页</button>
            <button data-action="last">末页</button>
          </div>
        </div>

        <div class="ldxp-table-wrap">
          <table>
            <thead>
              <tr>
                <th class="ldxp-col-image">图片</th>
                <th>商品</th>
                <th>店铺</th>
                <th>分类</th>
                <th>售价</th>
                <th>成本价</th>
                <th>库存</th>
                <th>销量</th>
                <th>状态</th>
                <th>关联</th>
              </tr>
            </thead>
            <tbody data-role="rows">
              <tr><td colspan="10" class="ldxp-empty">暂无结果</td></tr>
            </tbody>
          </table>
        </div>

      </div>
      <div class="ldxp-author-note">
        <span>角落小纸条：觉得好用的话，下次来哇咔咔这里补一单小小感谢；挑最便宜的也完全 OK，主要是让哇咔咔开心一下。</span>
        <a href="https://pay.ldxp.cn/shop/V2YZIFWM" target="_blank" rel="noopener noreferrer">作者卡网</a>
      </div>
      <div class="ldxp-resize-handle" title="拖动调整面板大小"></div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (selector) => root.querySelector(selector);
  const panelEl = $(".ldxp-panel");
  const bodyEl = $(".ldxp-body");
  const titlebarEl = $(".ldxp-titlebar");
  const resizeHandleEl = $(".ldxp-resize-handle");
  const rowsEl = $('[data-role="rows"]');
  const statusEl = $('[data-role="status"]');
  const summaryEl = $('[data-role="summary"]');
  const pageInfoEl = $('[data-role="pageInfo"]');
  const fetchButton = $('[data-action="fetch"]');

  const field = (name) => $(`[data-field="${name}"]`);

  const setStatus = (text, tone = "") => {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone;
  };

  const readFilters = () => ({
    keyword: field("keyword").value.trim(),
    goodsType: field("goodsType").value,
    pages: Math.min(Math.max(asNumber(field("pages").value, 1), 1), MAX_FETCH_PAGES),
    minCost: asNumber(field("minCost").value, NaN),
    maxCost: asNumber(field("maxCost").value, NaN),
    stockMode: field("stockMode").value,
    statusMode: field("statusMode").value,
    connected: field("connected").value,
    categoryKeyword: field("categoryKeyword").value.trim(),
    merchantKeyword: field("merchantKeyword").value.trim(),
    sort: field("sort").value,
    pageSize: asNumber(field("pageSize").value, 10)
  });

  const normalizeList = (payload) => Array.isArray(payload?.data?.list) ? payload.data.list : [];

  const buildRequestBody = (page, filters) => ({
    current: page,
    pageSize: DEFAULT_FETCH_SIZE,
    name: "",
    goods_type: filters.goodsType,
    keywords: filters.keyword
  });

  const fetchPage = async (page, filters, signal) => {
    const token = getToken();
    if (!token) {
      throw new Error("没有在 localStorage 中找到 auth-token，请先登录链动小铺后台。");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "Merchant-Token": token
      },
      body: JSON.stringify(buildRequestBody(page, filters)),
      signal
    });

    if (!response.ok) {
      throw new Error(`接口请求失败：HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.code !== 1) {
      throw new Error(payload.msg || payload.message || `接口返回异常：${payload.code}`);
    }

    return normalizeList(payload);
  };

  const applyFilters = () => {
    const filters = readFilters();
    state.pageSize = filters.pageSize;
    let data = state.raw.slice();

    if (filters.keyword) {
      data = data.filter((item) => includesText(getItemSearchText(item), filters.keyword));
    }

    if (Number.isFinite(filters.minCost)) {
      data = data.filter((item) => {
        const cost = getCostPrice(item);
        return cost !== null && cost >= filters.minCost;
      });
    }

    if (Number.isFinite(filters.maxCost)) {
      data = data.filter((item) => {
        const cost = getCostPrice(item);
        return cost !== null && cost <= filters.maxCost;
      });
    }

    if (filters.stockMode === "in") {
      data = data.filter((item) => {
        const stock = getStock(item);
        return stock === null || stock > 0;
      });
    } else if (filters.stockMode === "out") {
      data = data.filter((item) => {
        const stock = getStock(item);
        return stock === null || stock <= 0;
      });
    }

    if (filters.statusMode !== "all") {
      data = data.filter((item) => {
        const kind = getStatusKind(item);
        return kind === "unknown" || kind === filters.statusMode;
      });
    }

    if (filters.connected !== "all") {
      data = data.filter((item) => {
        const kind = getConnectedKind(item);
        return kind === "unknown" || kind === filters.connected;
      });
    }

    if (filters.categoryKeyword) {
      data = data.filter((item) => includesText(getCategorySearchText(item), filters.categoryKeyword));
    }

    if (filters.merchantKeyword) {
      data = data.filter((item) => includesText(getMerchantSearchText(item), filters.merchantKeyword));
    }

    const sorters = {
      costAsc: (a, b) => (getCostPrice(a) ?? Number.POSITIVE_INFINITY) - (getCostPrice(b) ?? Number.POSITIVE_INFINITY),
      costDesc: (a, b) => (getCostPrice(b) ?? Number.NEGATIVE_INFINITY) - (getCostPrice(a) ?? Number.NEGATIVE_INFINITY),
      stockAsc: (a, b) => (getStock(a) ?? Number.POSITIVE_INFINITY) - (getStock(b) ?? Number.POSITIVE_INFINITY),
      stockDesc: (a, b) => (getStock(b) ?? Number.NEGATIVE_INFINITY) - (getStock(a) ?? Number.NEGATIVE_INFINITY),
      salesDesc: (a, b) => (getSales(b) ?? Number.NEGATIVE_INFINITY) - (getSales(a) ?? Number.NEGATIVE_INFINITY)
    };
    if (sorters[filters.sort]) {
      data.sort(sorters[filters.sort]);
    }

    state.filtered = data;
    state.lastSummary = state.raw.length ? `已拉取 ${state.raw.length} 条，筛选后 ${state.filtered.length} 条` : "暂无数据";
    state.currentPage = 1;
    render();
  };

  const render = () => {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.currentPage > totalPages) {
      state.currentPage = totalPages;
    }

    const start = (state.currentPage - 1) * state.pageSize;
    const pageItems = state.filtered.slice(start, start + state.pageSize);

    summaryEl.textContent = state.lastSummary || `已拉取 ${state.raw.length} 条，筛选后 ${total} 条`;
    field("pageJump").max = String(totalPages);
    field("pageJump").value = String(state.currentPage);
    pageInfoEl.textContent = `/ ${totalPages}`;

    if (!pageItems.length) {
      rowsEl.innerHTML = `<tr><td colspan="10" class="ldxp-empty">暂无结果</td></tr>`;
      return;
    }

    rowsEl.innerHTML = pageItems
      .map((item) => {
        const image = getImage(item);
        const title = getProductTitle(item) || "-";
        const id = getProductId(item);
        const stock = getStock(item);
        const stockText = stock === null ? "未知" : String(stock);
        const salePrice = money(getSalePrice(item));
        const costPrice = money(getCostPrice(item));
        const statusLabel = getStatusLabel(item);
        const statusKind = getStatusKind(item);
        const connectedLabel = getConnectedLabel(item);
        const connectedKind = getConnectedKind(item);
        const sales = getSales(item);
        return `
          <tr>
            <td class="ldxp-col-image">
              ${
                image
                  ? `<img src="${escapeHtml(image)}" alt="">`
                  : `<span class="ldxp-no-image">无图</span>`
              }
            </td>
            <td>
              <div class="ldxp-name" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
              <div class="ldxp-meta">${id ? `ID: ${escapeHtml(id)}` : ""}</div>
            </td>
            <td>${escapeHtml(getMerchant(item) || "-")}</td>
            <td>${escapeHtml(getCategory(item) || "-")}</td>
            <td class="ldxp-money">${salePrice === "-" ? "-" : `¥${salePrice}`}</td>
            <td class="ldxp-money ldxp-strong">${costPrice === "-" ? "-" : `¥${costPrice}`}</td>
            <td><span class="ldxp-number ${stock === null ? "is-unknown" : stock > 0 ? "is-ok" : "is-empty"}">${stockText}</span></td>
            <td><span class="ldxp-number ${sales === null ? "is-unknown" : ""}">${sales === null ? "-" : sales}</span></td>
            <td><span class="ldxp-badge ldxp-status-${escapeHtml(statusKind)}">${escapeHtml(statusLabel)}</span></td>
            <td><span class="ldxp-badge ldxp-connect-${escapeHtml(connectedKind)}">${escapeHtml(connectedLabel)}</span></td>
          </tr>
        `;
      })
      .join("");
  };

  const startFetch = async () => {
    if (state.loading) {
      state.abortController?.abort();
      return;
    }

    const filters = readFilters();
    state.loading = true;
    state.abortController = new AbortController();
    state.raw = [];
    state.filtered = [];
    state.lastSummary = "";
    fetchButton.textContent = "停止拉取";
    setStatus("正在请求第 1 页...", "busy");
    render();

    try {
      for (let page = 1; page <= filters.pages; page += 1) {
        setStatus(`正在请求第 ${page} / ${filters.pages} 页...`, "busy");
        const list = await fetchPage(page, filters, state.abortController.signal);
        state.raw.push(...list);
        state.lastSummary = `已拉取 ${state.raw.length} 条，筛选后 ${state.filtered.length} 条`;

        if (list.length < DEFAULT_FETCH_SIZE) {
          break;
        }
      }

      applyFilters();
      state.lastSummary = `已拉取 ${state.raw.length} 条，筛选后 ${state.filtered.length} 条`;
      setStatus("拉取完成", "ok");
    } catch (error) {
      if (error.name === "AbortError") {
        setStatus("已停止拉取", "warn");
      } else {
        setStatus(error.message || "拉取失败", "error");
      }
      applyFilters();
    } finally {
      state.loading = false;
      state.abortController = null;
      fetchButton.textContent = "开始拉取";
    }
  };

  const reset = () => {
    field("keyword").value = "";
    field("goodsType").value = "";
    field("pages").value = "5";
    field("minCost").value = "";
    field("maxCost").value = "";
    field("stockMode").value = "all";
    field("statusMode").value = "all";
    field("connected").value = "all";
    field("categoryKeyword").value = "";
    field("merchantKeyword").value = "";
    field("sort").value = "default";
    field("pageSize").value = "10";
    state.raw = [];
    state.filtered = [];
    state.currentPage = 1;
    state.lastSummary = "暂无数据";
    setStatus("已重置");
    render();
  };

  root.addEventListener("click", (event) => {
    if (root.dataset.miniDragging === "1") {
      root.dataset.miniDragging = "";
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const actionTarget = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    const action = actionTarget instanceof HTMLElement ? actionTarget.dataset.action : "";
    if (!action) {
      return;
    }

    if (action === "fetch") {
      startFetch();
    } else if (action === "apply") {
      state.lastSummary = `已拉取 ${state.raw.length} 条，筛选后 ${state.filtered.length} 条`;
      applyFilters();
      setStatus("已筛选当前数据", "ok");
    } else if (action === "reset") {
      reset();
    } else if (action === "first") {
      state.currentPage = 1;
      render();
    } else if (action === "prev") {
      state.currentPage = Math.max(1, state.currentPage - 1);
      render();
    } else if (action === "jump") {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      state.currentPage = Math.min(Math.max(asNumber(field("pageJump").value, 1), 1), totalPages);
      render();
    } else if (action === "next") {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      state.currentPage = Math.min(totalPages, state.currentPage + 1);
      render();
    } else if (action === "last") {
      state.currentPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      render();
    } else if (action === "collapse") {
      minimizePanel();
    } else if (action === "expand") {
      expandPanel();
    } else if (action === "close") {
      root.remove();
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      if (event.target === field("pageJump")) {
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        state.currentPage = Math.min(Math.max(asNumber(field("pageJump").value, 1), 1), totalPages);
        render();
        return;
      }
      applyFilters();
    }
  });

  let dragState = null;
  titlebarEl.addEventListener("mousedown", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }
    const rect = root.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    event.preventDefault();
  });

  function onDragMove(event) {
    if (!dragState) {
      return;
    }
    const nextLeft = Math.max(8, Math.min(window.innerWidth - 120, dragState.left + event.clientX - dragState.startX));
    const nextTop = Math.max(8, Math.min(window.innerHeight - 60, dragState.top + event.clientY - dragState.startY));
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
  }

  function onDragEnd() {
    dragState = null;
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
  }

  let miniDragState = null;
  const miniLauncherEl = $(".ldxp-mini-launcher");
  miniLauncherEl.addEventListener("mousedown", (event) => {
    const rect = root.getBoundingClientRect();
    miniDragState = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
    root.dataset.miniDragging = "";
    document.addEventListener("mousemove", onMiniDragMove);
    document.addEventListener("mouseup", onMiniDragEnd);
    event.preventDefault();
  });

  function onMiniDragMove(event) {
    if (!miniDragState) {
      return;
    }

    const dx = event.clientX - miniDragState.startX;
    const dy = event.clientY - miniDragState.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      miniDragState.moved = true;
    }

    const miniWidth = 56;
    const miniHeight = 56;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - miniWidth - 8, miniDragState.left + dx));
    const nextTop = Math.max(8, Math.min(window.innerHeight - miniHeight - 8, miniDragState.top + dy));
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
  }

  function onMiniDragEnd() {
    if (miniDragState?.moved) {
      root.dataset.miniDragging = "1";
      setTimeout(() => {
        root.dataset.miniDragging = "";
      }, 0);
    }
    miniDragState = null;
    document.removeEventListener("mousemove", onMiniDragMove);
    document.removeEventListener("mouseup", onMiniDragEnd);
  }

  function minimizePanel() {
    const rect = root.getBoundingClientRect();
    const miniWidth = 62;
    const miniHeight = 62;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - miniWidth - 8, rect.left));
    const nextTop = Math.max(8, Math.min(window.innerHeight - miniHeight - 8, rect.top));
    root.dataset.expandedWidth = root.style.width || "";
    root.dataset.expandedPanelHeight = panelEl.style.height || "";
    root.dataset.expandedBodyHeight = bodyEl.style.height || "";
    root.dataset.expandedBodyMaxHeight = bodyEl.style.maxHeight || "";
    root.dataset.miniDragging = "";
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.right = "auto";
    root.style.width = `${miniWidth}px`;
    panelEl.style.height = "";
    bodyEl.style.height = "";
    bodyEl.style.maxHeight = "";
    root.classList.add("is-minimized");
  }

  function expandPanel() {
    root.classList.remove("is-minimized");
    root.style.width = root.dataset.expandedWidth || "min(1240px, calc(100vw - 24px))";
    panelEl.style.height = root.dataset.expandedPanelHeight || "";
    bodyEl.style.height = root.dataset.expandedBodyHeight || "";
    bodyEl.style.maxHeight = root.dataset.expandedBodyMaxHeight || "";
  }

  let resizeState = null;
  resizeHandleEl.addEventListener("mousedown", (event) => {
    const rootRect = root.getBoundingClientRect();
    const panelRect = panelEl.getBoundingClientRect();
    resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      width: panelRect.width,
      height: panelRect.height,
      left: rootRect.left,
      top: rootRect.top
    };
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeEnd);
    event.preventDefault();
    event.stopPropagation();
  });

  function applyPanelSize(width, height, left, top) {
    root.style.width = `${Math.round(width)}px`;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.right = "auto";
    panelEl.style.height = `${Math.round(height)}px`;
    bodyEl.style.height = "";
    bodyEl.style.maxHeight = "";
  }

  function onResizeMove(event) {
    if (!resizeState) {
      return;
    }

    const edgeGap = 8;
    const minWidth = Math.min(760, window.innerWidth - 20);
    const minHeight = 390;
    const maxWidth = Math.max(minWidth, window.innerWidth - edgeGap * 2);
    const maxHeight = Math.max(minHeight, window.innerHeight - edgeGap * 2);
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, resizeState.width + event.clientX - resizeState.startX));
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, resizeState.height + event.clientY - resizeState.startY));
    const nextLeft = Math.max(edgeGap, Math.min(resizeState.left, window.innerWidth - nextWidth - edgeGap));
    const nextTop = Math.max(edgeGap, Math.min(resizeState.top, window.innerHeight - nextHeight - edgeGap));

    applyPanelSize(nextWidth, nextHeight, nextLeft, nextTop);
  }

  function onResizeEnd() {
    resizeState = null;
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
  }

  render();
})();
