(function () {
  "use strict";

  const STORAGE_KEY = "concrete-job-costing-data-v2";
  const OLD_STORAGE_KEY = "concrete-job-costing-data-v1";
  const WEEKS_PER_MONTH = 4.333;

  const COST_FIELDS = [
    ["concrete", "Concrete"],
    ["labor", "Labor"],
    ["rebarWireMesh", "Rebar/wire/mesh"],
    ["gravelBase", "Gravel/base"],
    ["pump", "Pump"],
    ["equipmentRental", "Equipment rental"],
    ["dumpDisposal", "Dump/disposal"],
    ["fuel", "Fuel"],
    ["subcontractors", "Subcontractors"],
    ["permits", "Permits"],
    ["smallToolsMaterials", "Small tools/materials"],
    ["other", "Other"]
  ];

  const JOB_TYPES = ["driveway", "patio", "slab", "sidewalk", "garage floor", "commercial", "other"];
  const STATUSES = ["lead", "sold", "scheduled", "in progress", "completed", "paid"];

  const DEFAULT_OVERHEAD = [
    ["Truck payment", 600],
    ["Bobcat payment", 1100],
    ["Buggy payment", 500],
    ["Liability insurance", 2000],
    ["Truck insurance", 283],
    ["Marketing average", 2700],
    ["Jobber", 130],
    ["AI phone assistant", 60],
    ["QuickBooks", 50],
    ["Fuel allowance", 1200],
    ["Misc/maintenance reserve", 1377]
  ];

  const DEFAULT_SETTINGS = {
    companyName: "Concrete Job Costing",
    targetMonthlyProfit: 10000,
    typicalWeeklyRevenue: 20000,
    defaultGrossMarginPct: 40.7,
    lowMarginThresholdPct: 35,
    overheadSalesThresholdPct: 15
  };

  const NAV = [
    ["dashboard", "Dashboard", "grid"],
    ["jobs", "Jobs", "briefcase"],
    ["add", "Add", "plus"],
    ["overhead", "Overhead", "receipt"],
    ["reports", "Reports", "chart"],
    ["settings", "Settings", "gear"]
  ];

  const ICONS = {
    grid: "□",
    briefcase: "▣",
    plus: "+",
    receipt: "▤",
    chart: "▥",
    gear: "○",
    dollar: "$",
    calendar: "▦",
    trend: "↗",
    percent: "%",
    target: "◎",
    gauge: "⌁",
    warning: "!",
    save: "✓",
    edit: "✎",
    delete: "×",
    phone: "☎",
    map: "⌖",
    search: "⌕",
    backup: "↓",
    restore: "↑"
  };

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  const preciseMoneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const state = {
    data: loadData(),
    view: "dashboard",
    editingId: null,
    jobSearch: "",
    jobStatus: "all",
    reportPeriod: "this_month",
    installPrompt: null
  };

  const root = document.getElementById("root");

  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundMoney(value) {
    return Math.round(amount(value) * 100) / 100;
  }

  function money(value, precise) {
    return precise ? preciseMoneyFormatter.format(amount(value)) : moneyFormatter.format(amount(value));
  }

  function pct(value) {
    return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function titleCase(text) {
    return String(text || "")
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function todayIso() {
    return toIsoDate(new Date());
  }

  function toIsoDate(date) {
    const copy = new Date(date);
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  }

  function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toIsoDate(date);
  }

  function toDate(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function endOfDay(date) {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  function weekRange(baseDate) {
    const start = startOfDay(baseDate);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = endOfDay(start);
    end.setDate(start.getDate() + 6);
    return [start, end];
  }

  function monthRange(baseDate) {
    return [
      new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
      endOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0))
    ];
  }

  function lastMonthRange(baseDate) {
    return [
      new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1),
      endOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), 0))
    ];
  }

  function yearRange(baseDate) {
    return [new Date(baseDate.getFullYear(), 0, 1), endOfDay(baseDate)];
  }

  function getRange(key) {
    const now = new Date();
    if (key === "this_week") return weekRange(now);
    if (key === "last_month") return lastMonthRange(now);
    if (key === "ytd") return yearRange(now);
    return monthRange(now);
  }

  function isInRange(isoDate, start, end) {
    const date = toDate(isoDate);
    return Boolean(date && date >= start && date <= end);
  }

  function sameMonth(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function emptyCosts() {
    return COST_FIELDS.reduce((acc, field) => {
      acc[field[0]] = 0;
      return acc;
    }, {});
  }

  function ensureCosts(costs) {
    const next = emptyCosts();
    COST_FIELDS.forEach(([key]) => {
      next[key] = roundMoney(costs && costs[key]);
    });
    return next;
  }

  function normalizeJob(job) {
    const normalized = {
      id: job.id || `job-${Date.now()}`,
      jobName: String(job.jobName || "").trim() || "Untitled job",
      customerName: String(job.customerName || "").trim(),
      phone: String(job.phone || "").trim(),
      address: String(job.address || "").trim(),
      jobType: JOB_TYPES.includes(job.jobType) ? job.jobType : "other",
      salePrice: roundMoney(job.salePrice),
      dateSold: job.dateSold || "",
      startDate: job.startDate || "",
      completionDate: job.completionDate || "",
      status: STATUSES.includes(job.status) ? job.status : "lead",
      notes: String(job.notes || "").trim(),
      costs: ensureCosts(job.costs)
    };

    if ((normalized.status === "completed" || normalized.status === "paid") && !normalized.completionDate) {
      normalized.completionDate = todayIso();
    }

    return normalized;
  }

  function totalDirectCost(job) {
    return COST_FIELDS.reduce((sum, [key]) => sum + amount(job.costs && job.costs[key]), 0);
  }

  function isCompleted(job) {
    return job.status === "completed" || job.status === "paid";
  }

  function overheadTotal(items) {
    return items.reduce((sum, item) => sum + amount(item.amount), 0);
  }

  function makeOverheadItems() {
    return DEFAULT_OVERHEAD.map(([name, value], index) => ({
      id: `overhead-${index}`,
      name,
      amount: value
    }));
  }

  function seedJobs() {
    return [
      normalizeJob({
        id: "job-recent-driveway",
        jobName: "Harrison Driveway Replacement",
        customerName: "Harrison Residence",
        phone: "555-0168",
        address: "1420 Mason Ridge Dr",
        jobType: "driveway",
        salePrice: 15300,
        dateSold: daysAgo(10),
        startDate: daysAgo(3),
        completionDate: daysAgo(1),
        status: "completed",
        notes: "Recent job using the real sale price, direct cost, gross profit, and 40.7% margin.",
        costs: { concrete: 3150, labor: 3400, rebarWireMesh: 580, gravelBase: 520, equipmentRental: 350, dumpDisposal: 260, fuel: 140, subcontractors: 450, permits: 130, smallToolsMaterials: 100 }
      }),
      normalizeJob({
        id: "job-maple-patio",
        jobName: "Maple Patio Pour",
        customerName: "N. Carter",
        phone: "555-0184",
        address: "88 Maple Creek Ln",
        jobType: "patio",
        salePrice: 4700,
        dateSold: daysAgo(14),
        startDate: daysAgo(4),
        completionDate: daysAgo(2),
        status: "paid",
        notes: "Small patio that brings this week's completed revenue to $20,000.",
        costs: { concrete: 900, labor: 1100, rebarWireMesh: 120, gravelBase: 160, equipmentRental: 100, dumpDisposal: 75, fuel: 60, subcontractors: 250, permits: 60, smallToolsMaterials: 80 }
      }),
      normalizeJob({
        id: "job-willow-garage",
        jobName: "Willow Garage Floor",
        customerName: "D. Spencer",
        phone: "555-0139",
        address: "301 Willow Farm Rd",
        jobType: "garage floor",
        salePrice: 18600,
        dateSold: daysAgo(30),
        startDate: daysAgo(12),
        completionDate: daysAgo(9),
        status: "paid",
        costs: { concrete: 4200, labor: 3900, rebarWireMesh: 700, gravelBase: 650, equipmentRental: 420, dumpDisposal: 260, fuel: 190, subcontractors: 720, permits: 120, smallToolsMaterials: 120 }
      }),
      normalizeJob({
        id: "job-oak-slab",
        jobName: "Oak Ridge Slab",
        customerName: "Oak Ridge Builders",
        phone: "555-0142",
        address: "19 Oak Ridge Ct",
        jobType: "slab",
        salePrice: 21200,
        dateSold: daysAgo(40),
        startDate: daysAgo(18),
        completionDate: daysAgo(16),
        status: "paid",
        costs: { concrete: 5100, labor: 4200, rebarWireMesh: 920, gravelBase: 800, pump: 650, equipmentRental: 500, dumpDisposal: 280, fuel: 220, subcontractors: 200, permits: 130, smallToolsMaterials: 100 }
      }),
      normalizeJob({
        id: "job-riverbend-sidewalk",
        jobName: "Riverbend Sidewalks",
        customerName: "Riverbend HOA",
        phone: "555-0151",
        address: "Riverbend Entrance",
        jobType: "sidewalk",
        salePrice: 14900,
        dateSold: daysAgo(35),
        startDate: daysAgo(25),
        completionDate: daysAgo(23),
        status: "paid",
        notes: "Low-margin sample so alerts have a real example.",
        costs: { concrete: 3200, labor: 3300, rebarWireMesh: 450, gravelBase: 600, equipmentRental: 350, dumpDisposal: 250, fuel: 180, subcontractors: 1400, permits: 140, smallToolsMaterials: 250, other: 130 }
      }),
      normalizeJob({
        id: "job-commerce-pad",
        jobName: "Commerce Loading Pad",
        customerName: "Northgate Supply",
        phone: "555-0170",
        address: "700 Commerce Ave",
        jobType: "commercial",
        salePrice: 24300,
        dateSold: daysAgo(70),
        startDate: daysAgo(48),
        completionDate: daysAgo(45),
        status: "paid",
        costs: { concrete: 6200, labor: 4800, rebarWireMesh: 1100, gravelBase: 900, pump: 700, equipmentRental: 550, dumpDisposal: 260, fuel: 240, permits: 160, smallToolsMaterials: 90 }
      }),
      normalizeJob({
        id: "job-foundry-apron",
        jobName: "Foundry Commercial Apron",
        customerName: "Foundry Works",
        phone: "555-0111",
        address: "9 Foundry Park",
        jobType: "commercial",
        salePrice: 32200,
        dateSold: daysAgo(116),
        startDate: daysAgo(94),
        completionDate: daysAgo(90),
        status: "paid",
        costs: { concrete: 7800, labor: 5700, rebarWireMesh: 1400, gravelBase: 1200, pump: 850, equipmentRental: 620, dumpDisposal: 330, fuel: 300, subcontractors: 360, permits: 210, smallToolsMaterials: 130 }
      })
    ];
  }

  function defaultData() {
    return {
      jobs: seedJobs(),
      overheadItems: makeOverheadItems(),
      settings: { ...DEFAULT_SETTINGS },
      createdAt: new Date().toISOString()
    };
  }

  function migrateData(data) {
    const fallback = defaultData();
    if (!data || typeof data !== "object") return fallback;
    return {
      jobs: Array.isArray(data.jobs) && data.jobs.length ? data.jobs.map(normalizeJob) : fallback.jobs,
      overheadItems: Array.isArray(data.overheadItems) && data.overheadItems.length
        ? data.overheadItems.map((item, index) => ({
            id: item.id || `overhead-${index}`,
            name: String(item.name || "Expense"),
            amount: roundMoney(item.amount)
          }))
        : fallback.overheadItems,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      createdAt: data.createdAt || fallback.createdAt
    };
  }

  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
      return saved ? migrateData(JSON.parse(saved)) : defaultData();
    } catch (error) {
      console.warn("Could not load saved data.", error);
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  function completedJobsForRange(jobs, key) {
    const [start, end] = getRange(key);
    return jobs.filter((job) => isCompleted(job) && isInRange(job.completionDate, start, end));
  }

  function summarizeJobs(jobs) {
    const revenue = jobs.reduce((sum, job) => sum + amount(job.salePrice), 0);
    const directCosts = jobs.reduce((sum, job) => sum + totalDirectCost(job), 0);
    const grossProfit = revenue - directCosts;
    return {
      count: jobs.length,
      revenue,
      directCosts,
      grossProfit,
      grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      averageJobSize: jobs.length ? revenue / jobs.length : 0
    };
  }

  function monthRevenueForJob(job, jobs) {
    const date = toDate(job.completionDate);
    if (!date) return 0;
    return jobs
      .filter((item) => isCompleted(item) && sameMonth(toDate(item.completionDate), date))
      .reduce((sum, item) => sum + amount(item.salePrice), 0);
  }

  function calculateJob(job, jobs) {
    const monthlyOverhead = overheadTotal(state.data.overheadItems);
    const salePrice = amount(job.salePrice);
    const directCosts = totalDirectCost(job);
    const grossProfit = salePrice - directCosts;
    const grossMarginPct = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;
    const monthRevenue = isCompleted(job) ? monthRevenueForJob(job, jobs) : 0;
    const estimatedMonthlyRevenue = amount(state.data.settings.typicalWeeklyRevenue) * WEEKS_PER_MONTH;
    const allocationBasis = Math.max(monthRevenue || estimatedMonthlyRevenue, salePrice, 1);
    const overheadAllocation = salePrice > 0 ? monthlyOverhead * (salePrice / allocationBasis) : 0;

    return {
      salePrice,
      directCosts,
      grossProfit,
      grossMarginPct,
      overheadAllocation,
      estimatedNetProfit: grossProfit - overheadAllocation
    };
  }

  function dashboardMetrics() {
    const monthlyOverhead = overheadTotal(state.data.overheadItems);
    const monthJobs = completedJobsForRange(state.data.jobs, "this_month");
    const weekJobs = completedJobsForRange(state.data.jobs, "this_week");
    const month = summarizeJobs(monthJobs);
    const week = summarizeJobs(weekJobs);
    const marginDecimal = month.revenue > 0
      ? month.grossProfit / month.revenue
      : amount(state.data.settings.defaultGrossMarginPct) / 100;
    return {
      monthlyOverhead,
      monthJobs,
      weekJobs,
      month,
      week,
      estimatedNetProfit: month.grossProfit - monthlyOverhead,
      breakEvenSales: marginDecimal > 0 ? monthlyOverhead / marginDecimal : 0,
      neededSales: marginDecimal > 0 ? (monthlyOverhead + amount(state.data.settings.targetMonthlyProfit)) / marginDecimal : 0,
      overheadPctOfSales: month.revenue > 0 ? (monthlyOverhead / month.revenue) * 100 : 0
    };
  }

  function buildAlerts(metrics) {
    const alerts = [];
    const lowMargin = amount(state.data.settings.lowMarginThresholdPct);
    const overheadLimit = amount(state.data.settings.overheadSalesThresholdPct);

    state.data.jobs.forEach((job) => {
      if (!amount(job.salePrice)) return;
      const calc = calculateJob(job, state.data.jobs);
      if (calc.grossMarginPct < lowMargin && ["sold", "scheduled", "in progress", "completed", "paid"].includes(job.status)) {
        alerts.push({
          tone: "danger",
          title: `${job.jobName} margin is ${pct(calc.grossMarginPct)}`,
          body: `Gross margin is below ${pct(lowMargin)}. Gross profit is ${money(calc.grossProfit)} on ${money(calc.salePrice)}.`
        });
      }
    });

    if (metrics.month.revenue > 0 && metrics.overheadPctOfSales > overheadLimit) {
      alerts.push({
        tone: "warning",
        title: `Overhead is ${pct(metrics.overheadPctOfSales)} of monthly sales`,
        body: `Current overhead is ${money(metrics.monthlyOverhead)} against ${money(metrics.month.revenue)} in completed monthly revenue.`
      });
    }

    if (metrics.month.revenue < metrics.breakEvenSales) {
      alerts.push({
        tone: "warning",
        title: "Monthly revenue is below break-even",
        body: `Break-even sales are ${money(metrics.breakEvenSales)} based on current margin and overhead.`
      });
    }

    state.data.jobs.filter((job) => job.status === "completed").forEach((job) => {
      alerts.push({
        tone: "notice",
        title: `${job.jobName} is completed but not paid`,
        body: `${job.customerName || "Customer"} still needs to be marked paid.`
      });
    });

    return alerts;
  }

  function icon(name) {
    return `<span class="icon" aria-hidden="true">${esc(ICONS[name] || "")}</span>`;
  }

  function button(label, action, iconName, variant, extra) {
    return `<button class="btn ${variant || "secondary"}" type="button" data-action="${esc(action)}"${extra || ""}>${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></button>`;
  }

  function metric(label, value, sub, iconName, tone) {
    return `
      <article class="metric ${tone || ""}">
        <div class="metric-top"><span>${esc(label)}</span>${iconName ? icon(iconName) : ""}</div>
        <strong>${esc(value)}</strong>
        ${sub ? `<small>${esc(sub)}</small>` : ""}
      </article>
    `;
  }

  function pageHeader(title, subtitle, actionHtml) {
    return `
      <div class="page-header">
        <div>
          <h1>${esc(title)}</h1>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
        </div>
        ${actionHtml || ""}
      </div>
    `;
  }

  function statusPill(status) {
    return `<span class="status status-${esc(String(status).replace(/\s+/g, "-"))}">${esc(titleCase(status))}</span>`;
  }

  function renderDashboard() {
    const metrics = dashboardMetrics();
    const alerts = buildAlerts(metrics);

    return `
      <div class="screen">
        ${pageHeader("Dashboard", "This month, this week, and break-even.")}
        <section class="hero-band">
          <div><span>Estimated net after overhead</span><strong class="${metrics.estimatedNetProfit >= 0 ? "profit" : "loss"}">${money(metrics.estimatedNetProfit)}</strong></div>
          <div><span>Monthly overhead</span><strong>${money(metrics.monthlyOverhead)}</strong></div>
        </section>
        <section class="metric-grid">
          ${metric("Monthly revenue", money(metrics.month.revenue), `${metrics.month.count} completed jobs`, "dollar")}
          ${metric("Weekly revenue", money(metrics.week.revenue), `${metrics.week.count} completed jobs`, "calendar")}
          ${metric("Total job costs", money(metrics.month.directCosts), "Direct costs this month", "receipt")}
          ${metric("Gross profit", money(metrics.month.grossProfit), "Before overhead", "trend", metrics.month.grossProfit >= 0 ? "good" : "bad")}
          ${metric("Gross margin", pct(metrics.month.grossMarginPct), "Completed jobs", "percent")}
          ${metric("Break-even sales", money(metrics.breakEvenSales), "Monthly overhead / margin", "dollar")}
          ${metric("Sales for target profit", money(metrics.neededSales), `${money(state.data.settings.targetMonthlyProfit)} target`, "target")}
          ${metric("Overhead as sales", pct(metrics.overheadPctOfSales), "This month", "gauge", metrics.overheadPctOfSales > amount(state.data.settings.overheadSalesThresholdPct) ? "bad" : "good")}
        </section>
        <section class="panel count-strip">
          <div><span>Completed this week</span><strong>${metrics.week.count}</strong></div>
          <div><span>Completed this month</span><strong>${metrics.month.count}</strong></div>
          <div><span>Avg job size</span><strong>${money(metrics.month.averageJobSize)}</strong></div>
        </section>
        <section class="panel alerts-panel">
          <div class="section-title"><h2>Alerts</h2><span>${alerts.length ? `${alerts.length} warning${alerts.length === 1 ? "" : "s"}` : "Clear"}</span></div>
          ${alerts.length ? `<div class="alert-list">${alerts.slice(0, 7).map((alert) => `
            <article class="alert ${esc(alert.tone)}">
              ${icon("warning")}
              <div><strong>${esc(alert.title)}</strong><p>${esc(alert.body)}</p></div>
            </article>
          `).join("")}</div>` : `<p class="quiet">No warnings right now.</p>`}
        </section>
      </div>
    `;
  }

  function filteredJobs() {
    const needle = state.jobSearch.trim().toLowerCase();
    return state.data.jobs
      .filter((job) => state.jobStatus === "all" || job.status === state.jobStatus)
      .filter((job) => !needle || [job.jobName, job.customerName, job.phone, job.address, job.jobType].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => String(b.completionDate || b.startDate || b.dateSold).localeCompare(String(a.completionDate || a.startDate || a.dateSold)));
  }

  function renderJobs() {
    const jobs = filteredJobs();
    return `
      <div class="screen">
        ${pageHeader("Jobs", `${jobs.length} job${jobs.length === 1 ? "" : "s"} showing`, button("Add", "add-job", "plus", "primary"))}
        <section class="toolbar panel">
          <div class="search-box">${icon("search")}<input id="job-search" value="${esc(state.jobSearch)}" placeholder="Search jobs"></div>
          <div class="chip-row">
            ${["all"].concat(STATUSES).map((status) => `<button class="chip ${state.jobStatus === status ? "active" : ""}" type="button" data-action="filter-status" data-status="${esc(status)}">${esc(status === "all" ? "All" : titleCase(status))}</button>`).join("")}
          </div>
        </section>
        <section class="job-list">
          ${jobs.length ? jobs.map(renderJobCard).join("") : `<p class="empty-state">No jobs match that filter.</p>`}
        </section>
      </div>
    `;
  }

  function renderJobCard(job) {
    const calc = calculateJob(job, state.data.jobs);
    const mapLink = job.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}` : "";
    return `
      <article class="job-card">
        <div class="job-card-head">
          <div><h3>${esc(job.jobName)}</h3><p>${esc(job.customerName || "No customer name")}</p></div>
          ${statusPill(job.status)}
        </div>
        <div class="job-meta">
          <span>${icon("briefcase")}${esc(titleCase(job.jobType))}</span>
          ${job.completionDate ? `<span>${icon("calendar")}${esc(job.completionDate)}</span>` : ""}
        </div>
        <div class="job-numbers">
          <div><span>Sale</span><strong>${money(calc.salePrice)}</strong></div>
          <div><span>Cost</span><strong>${money(calc.directCosts)}</strong></div>
          <div><span>Margin</span><strong class="${calc.grossMarginPct < amount(state.data.settings.lowMarginThresholdPct) ? "loss" : ""}">${pct(calc.grossMarginPct)}</strong></div>
          <div><span>Net est.</span><strong class="${calc.estimatedNetProfit >= 0 ? "profit" : "loss"}">${money(calc.estimatedNetProfit)}</strong></div>
        </div>
        <div class="card-actions">
          ${button("Edit", "edit-job", "edit", "secondary", ` data-id="${esc(job.id)}"`)}
          ${job.phone ? `<a class="btn secondary" href="tel:${esc(job.phone)}">${icon("phone")}<span>Call</span></a>` : ""}
          ${mapLink ? `<a class="btn secondary" href="${esc(mapLink)}" target="_blank" rel="noreferrer">${icon("map")}<span>Map</span></a>` : ""}
          ${button("Delete", "delete-job", "delete", "ghost", ` data-id="${esc(job.id)}"`)}
        </div>
      </article>
    `;
  }

  function emptyJob() {
    return {
      id: `job-${Date.now()}`,
      jobName: "",
      customerName: "",
      phone: "",
      address: "",
      jobType: "driveway",
      salePrice: 0,
      dateSold: todayIso(),
      startDate: "",
      completionDate: todayIso(),
      status: "completed",
      notes: "",
      costs: emptyCosts()
    };
  }

  function field(label, name, value, type, attrs) {
    return `
      <label class="field">
        <span>${esc(label)}</span>
        <input name="${esc(name)}" value="${esc(value == null ? "" : value)}" type="${esc(type || "text")}" ${attrs || ""}>
      </label>
    `;
  }

  function selectField(label, name, value, options) {
    return `
      <label class="field">
        <span>${esc(label)}</span>
        <select name="${esc(name)}">
          ${options.map((option) => `<option value="${esc(option)}" ${option === value ? "selected" : ""}>${esc(titleCase(option))}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function renderJobForm() {
    const job = state.editingId ? state.data.jobs.find((item) => item.id === state.editingId) || emptyJob() : emptyJob();
    const calc = calculateJob(job, state.data.jobs);
    return `
      <div class="screen">
        ${pageHeader(state.editingId ? "Edit Job" : "Add Job", "Fast entry for the truck.", button("Cancel", "cancel-job", "delete", "secondary"))}
        <form id="job-form" class="job-form">
          <input type="hidden" name="id" value="${esc(job.id)}">
          <section class="form-section panel">
            <h2>Job</h2>
            <div class="form-grid">
              ${field("Job name", "jobName", job.jobName, "text", "required placeholder=\"Smith driveway\"")}
              ${field("Customer name", "customerName", job.customerName)}
              ${field("Phone number", "phone", job.phone, "tel", "inputmode=\"tel\"")}
              ${field("Address", "address", job.address)}
              ${selectField("Job type", "jobType", job.jobType, JOB_TYPES)}
              ${field("Sale price", "salePrice", job.salePrice, "number", "inputmode=\"decimal\" min=\"0\" step=\"0.01\"")}
              ${field("Date sold", "dateSold", job.dateSold, "date")}
              ${field("Start date", "startDate", job.startDate, "date")}
              ${field("Completion date", "completionDate", job.completionDate, "date")}
              ${selectField("Status", "status", job.status, STATUSES)}
            </div>
            <label class="field wide-field">
              <span>Notes</span>
              <textarea name="notes" rows="4">${esc(job.notes)}</textarea>
            </label>
          </section>
          <section class="form-section panel">
            <h2>Direct Costs</h2>
            <div class="cost-grid">
              ${COST_FIELDS.map(([key, label]) => field(label, `cost_${key}`, job.costs[key], "number", "inputmode=\"decimal\" min=\"0\" step=\"0.01\"")).join("")}
            </div>
          </section>
          <section id="calc-panel" class="calc-panel">${renderCalcPanel(calc)}</section>
          <div class="submit-row"><button class="btn primary" type="submit">${icon("save")}<span>${state.editingId ? "Save Changes" : "Save Job"}</span></button></div>
        </form>
      </div>
    `;
  }

  function renderCalcPanel(calc) {
    return `
      <div><span>Direct cost</span><strong>${money(calc.directCosts, true)}</strong></div>
      <div><span>Gross profit</span><strong class="${calc.grossProfit >= 0 ? "profit" : "loss"}">${money(calc.grossProfit, true)}</strong></div>
      <div><span>Gross margin</span><strong class="${calc.grossMarginPct < amount(state.data.settings.lowMarginThresholdPct) ? "loss" : ""}">${pct(calc.grossMarginPct)}</strong></div>
      <div><span>Overhead allocation</span><strong>${money(calc.overheadAllocation, true)}</strong></div>
      <div><span>Net estimate</span><strong class="${calc.estimatedNetProfit >= 0 ? "profit" : "loss"}">${money(calc.estimatedNetProfit, true)}</strong></div>
    `;
  }

  function jobFromForm(form) {
    const data = new FormData(form);
    const costs = emptyCosts();
    COST_FIELDS.forEach(([key]) => {
      costs[key] = roundMoney(data.get(`cost_${key}`));
    });
    return normalizeJob({
      id: data.get("id"),
      jobName: data.get("jobName"),
      customerName: data.get("customerName"),
      phone: data.get("phone"),
      address: data.get("address"),
      jobType: data.get("jobType"),
      salePrice: data.get("salePrice"),
      dateSold: data.get("dateSold"),
      startDate: data.get("startDate"),
      completionDate: data.get("completionDate"),
      status: data.get("status"),
      notes: data.get("notes"),
      costs
    });
  }

  function renderOverhead() {
    const total = overheadTotal(state.data.overheadItems);
    return `
      <div class="screen">
        ${pageHeader("Overhead", "Monthly fixed costs.", button("Add", "add-overhead", "plus", "primary"))}
        <section class="hero-band overhead-total">
          <div><span>Monthly overhead</span><strong id="overhead-total">${money(total)}</strong></div>
          <div><span>Against $10,000 default</span><strong class="${total <= 10000 ? "profit" : "loss"}">${money(total - 10000)}</strong></div>
        </section>
        <section class="overhead-list panel">
          ${state.data.overheadItems.map((item) => `
            <div class="overhead-row" data-id="${esc(item.id)}">
              <input value="${esc(item.name)}" aria-label="Expense name" data-overhead-field="name">
              <input value="${esc(item.amount)}" type="number" inputmode="decimal" min="0" step="0.01" aria-label="Monthly amount" data-overhead-field="amount">
              <button class="icon-btn" type="button" aria-label="Remove expense" data-action="remove-overhead" data-id="${esc(item.id)}">${icon("delete")}</button>
            </div>
          `).join("")}
        </section>
        <div class="split-actions">
          ${button("Balance Misc", "balance-misc", "target", "secondary")}
          ${button("Reset Defaults", "reset-overhead", "restore", "secondary")}
        </div>
      </div>
    `;
  }

  function typeRows(jobs) {
    const grouped = {};
    jobs.forEach((job) => {
      grouped[job.jobType] = grouped[job.jobType] || [];
      grouped[job.jobType].push(job);
    });
    return Object.entries(grouped)
      .map(([type, jobsForType]) => ({ type, ...summarizeJobs(jobsForType) }))
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }

  function renderReports() {
    const jobs = completedJobsForRange(state.data.jobs, state.reportPeriod);
    const summary = summarizeJobs(jobs);
    const totalOverhead = overheadTotal(state.data.overheadItems);
    const overheadPct = summary.revenue > 0 ? (totalOverhead / summary.revenue) * 100 : 0;
    const rows = typeRows(jobs);
    const byMargin = jobs.slice().sort((a, b) => calculateJob(b, state.data.jobs).grossMarginPct - calculateJob(a, state.data.jobs).grossMarginPct);

    return `
      <div class="screen">
        ${pageHeader("Reports", "Revenue, margin, and job type.")}
        <section class="panel"><div class="chip-row period-row">
          ${[
            ["this_week", "This week"],
            ["this_month", "This month"],
            ["last_month", "Last month"],
            ["ytd", "Year to date"]
          ].map(([key, label]) => `<button class="chip ${state.reportPeriod === key ? "active" : ""}" type="button" data-action="report-period" data-period="${key}">${label}</button>`).join("")}
        </div></section>
        <section class="metric-grid">
          ${metric("Revenue", money(summary.revenue), `${summary.count} completed jobs`, "dollar")}
          ${metric("Average job size", money(summary.averageJobSize), "Sale price average", "target")}
          ${metric("Average gross margin", pct(summary.grossMarginPct), "Weighted by sales", "percent")}
          ${metric("Overhead as sales", pct(overheadPct), `${money(totalOverhead)} overhead`, "gauge")}
        </section>
        <section class="panel report-table">
          <div class="section-title"><h2>Profit by Job Type</h2></div>
          ${rows.length ? rows.map((row) => `
            <div class="report-row">
              <div><strong>${esc(titleCase(row.type))}</strong><span>${row.count} job${row.count === 1 ? "" : "s"}</span></div>
              <div><strong>${money(row.grossProfit)}</strong><span>${money(row.revenue)} sales, ${pct(row.grossMarginPct)}</span></div>
            </div>
          `).join("") : `<p class="quiet">No completed jobs in this period.</p>`}
        </section>
        <div class="report-columns">
          ${renderMarginList("Best Jobs by Gross Margin", byMargin.slice(0, 5))}
          ${renderMarginList("Worst Jobs by Gross Margin", byMargin.slice().reverse().slice(0, 5))}
        </div>
      </div>
    `;
  }

  function renderMarginList(title, jobs) {
    return `
      <section class="panel margin-list">
        <div class="section-title"><h2>${esc(title)}</h2></div>
        ${jobs.length ? jobs.map((job) => {
          const calc = calculateJob(job, state.data.jobs);
          return `
            <div class="report-row">
              <div><strong>${esc(job.jobName)}</strong><span>${esc(titleCase(job.jobType))}</span></div>
              <div><strong class="${calc.grossMarginPct < amount(state.data.settings.lowMarginThresholdPct) ? "loss" : ""}">${pct(calc.grossMarginPct)}</strong><span>${money(calc.grossProfit)}</span></div>
            </div>
          `;
        }).join("") : `<p class="quiet">No completed jobs in this period.</p>`}
      </section>
    `;
  }

  function renderSettings() {
    const s = state.data.settings;
    return `
      <div class="screen">
        ${pageHeader("Settings", "Targets, alerts, and backup.")}
        <section class="form-section panel">
          <h2>Business Targets</h2>
          <div class="form-grid">
            ${field("Target monthly profit", "targetMonthlyProfit", s.targetMonthlyProfit, "number", "inputmode=\"decimal\" min=\"0\" step=\"100\" data-setting=\"targetMonthlyProfit\"")}
            ${field("Typical weekly completed revenue", "typicalWeeklyRevenue", s.typicalWeeklyRevenue, "number", "inputmode=\"decimal\" min=\"0\" step=\"100\" data-setting=\"typicalWeeklyRevenue\"")}
            ${field("Default gross margin %", "defaultGrossMarginPct", s.defaultGrossMarginPct, "number", "inputmode=\"decimal\" min=\"0\" step=\"0.1\" data-setting=\"defaultGrossMarginPct\"")}
            ${field("Low margin warning %", "lowMarginThresholdPct", s.lowMarginThresholdPct, "number", "inputmode=\"decimal\" min=\"0\" step=\"0.1\" data-setting=\"lowMarginThresholdPct\"")}
            ${field("Overhead warning % of sales", "overheadSalesThresholdPct", s.overheadSalesThresholdPct, "number", "inputmode=\"decimal\" min=\"0\" step=\"0.1\" data-setting=\"overheadSalesThresholdPct\"")}
          </div>
        </section>
        <section class="panel settings-actions">
          <div class="section-title"><h2>App</h2></div>
          <div class="split-actions">
            ${button("Backup", "backup", "backup", "secondary")}
            ${button("Restore", "restore-click", "restore", "secondary")}
            ${button("Install", "install", "plus", "primary", state.installPrompt ? "" : " disabled")}
          </div>
          <input id="backup-file" class="visually-hidden" type="file" accept="application/json">
        </section>
        <section class="panel danger-zone">
          <div class="section-title"><h2>Reset</h2></div>
          ${button("Reset Sample Data", "reset-data", "restore", "ghost")}
        </section>
      </div>
    `;
  }

  function renderShell() {
    const dateText = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date());
    const screen = state.view === "dashboard"
      ? renderDashboard()
      : state.view === "jobs"
        ? renderJobs()
        : state.view === "add"
          ? renderJobForm()
          : state.view === "overhead"
            ? renderOverhead()
            : state.view === "reports"
              ? renderReports()
              : renderSettings();

    root.innerHTML = `
      <div class="app-shell">
        <header class="app-topbar">
          <div class="brand">
            <img src="./assets/icon.svg" alt="" width="38" height="38">
            <div><strong>${esc(state.data.settings.companyName || "Concrete Job Costing")}</strong><span>${esc(dateText)}</span></div>
          </div>
        </header>
        <main>${screen}</main>
        <nav class="bottom-nav" aria-label="Main navigation">
          ${NAV.map(([key, label, iconName]) => `
            <button type="button" class="${state.view === key ? "active" : ""}" data-nav="${esc(key)}" ${state.view === key ? "aria-current=\"page\"" : ""}>
              ${icon(iconName)}<span>${esc(label)}</span>
            </button>
          `).join("")}
        </nav>
      </div>
    `;

    bindScreen();
  }

  function bindScreen() {
    root.querySelectorAll("[data-nav]").forEach((buttonEl) => {
      buttonEl.addEventListener("click", () => {
        const view = buttonEl.dataset.nav;
        state.view = view;
        if (view === "add") state.editingId = null;
        renderShell();
      });
    });

    root.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", handleAction);
    });

    const search = root.querySelector("#job-search");
    if (search) {
      search.addEventListener("input", () => {
        state.jobSearch = search.value;
        renderShell();
      });
    }

    const form = root.querySelector("#job-form");
    if (form) {
      form.addEventListener("input", () => updateFormCalc(form));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const job = jobFromForm(form);
        const exists = state.data.jobs.some((item) => item.id === job.id);
        state.data.jobs = exists
          ? state.data.jobs.map((item) => item.id === job.id ? job : item)
          : [job].concat(state.data.jobs);
        saveData();
        state.editingId = job.id;
        state.view = "jobs";
        renderShell();
      });
    }

    root.querySelectorAll("[data-overhead-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const row = input.closest(".overhead-row");
        const item = state.data.overheadItems.find((entry) => entry.id === row.dataset.id);
        if (!item) return;
        item[input.dataset.overheadField] = input.dataset.overheadField === "amount" ? roundMoney(input.value) : input.value;
        saveData();
        const totalEl = root.querySelector("#overhead-total");
        if (totalEl) totalEl.textContent = money(overheadTotal(state.data.overheadItems));
      });
    });

    root.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("input", () => {
        state.data.settings[input.dataset.setting] = roundMoney(input.value);
        saveData();
      });
    });

    const fileInput = root.querySelector("#backup-file");
    if (fileInput) {
      fileInput.addEventListener("change", () => restoreBackup(fileInput.files && fileInput.files[0]));
    }
  }

  function updateFormCalc(form) {
    const job = jobFromForm(form);
    const jobs = state.data.jobs.some((item) => item.id === job.id)
      ? state.data.jobs.map((item) => item.id === job.id ? job : item)
      : state.data.jobs.concat([job]);
    const panel = root.querySelector("#calc-panel");
    if (panel) panel.innerHTML = renderCalcPanel(calculateJob(job, jobs));
  }

  function handleAction(event) {
    const actionEl = event.currentTarget;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    if (action === "add-job") {
      state.editingId = null;
      state.view = "add";
      renderShell();
      return;
    }

    if (action === "cancel-job") {
      state.view = "jobs";
      renderShell();
      return;
    }

    if (action === "edit-job") {
      state.editingId = id;
      state.view = "add";
      renderShell();
      return;
    }

    if (action === "delete-job") {
      const job = state.data.jobs.find((item) => item.id === id);
      if (job && confirm(`Delete ${job.jobName}?`)) {
        state.data.jobs = state.data.jobs.filter((item) => item.id !== id);
        saveData();
        renderShell();
      }
      return;
    }

    if (action === "filter-status") {
      state.jobStatus = actionEl.dataset.status;
      renderShell();
      return;
    }

    if (action === "add-overhead") {
      state.data.overheadItems.push({ id: `overhead-${Date.now()}`, name: "New expense", amount: 0 });
      saveData();
      renderShell();
      return;
    }

    if (action === "remove-overhead") {
      state.data.overheadItems = state.data.overheadItems.filter((item) => item.id !== id);
      saveData();
      renderShell();
      return;
    }

    if (action === "balance-misc") {
      const miscIndex = state.data.overheadItems.findIndex((item) => item.name.toLowerCase().includes("misc"));
      if (miscIndex >= 0) {
        const otherTotal = state.data.overheadItems.reduce((sum, item, index) => index === miscIndex ? sum : sum + amount(item.amount), 0);
        state.data.overheadItems[miscIndex].amount = Math.max(0, 10000 - otherTotal);
        saveData();
        renderShell();
      }
      return;
    }

    if (action === "reset-overhead" && confirm("Reset overhead items to the $10,000 default list?")) {
      state.data.overheadItems = makeOverheadItems();
      saveData();
      renderShell();
      return;
    }

    if (action === "report-period") {
      state.reportPeriod = actionEl.dataset.period;
      renderShell();
      return;
    }

    if (action === "backup") {
      backupData();
      return;
    }

    if (action === "restore-click") {
      const fileInput = root.querySelector("#backup-file");
      if (fileInput) fileInput.click();
      return;
    }

    if (action === "install") {
      installApp();
      return;
    }

    if (action === "reset-data" && confirm("Reset all jobs and overhead to the sample data?")) {
      state.data = defaultData();
      saveData();
      state.view = "dashboard";
      renderShell();
    }
  }

  function backupData() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `concrete-job-costing-backup-${todayIso()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function restoreBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state.data = migrateData(JSON.parse(reader.result));
        saveData();
        renderShell();
      } catch (error) {
        alert("That backup file could not be loaded.");
      }
    };
    reader.readAsText(file);
  }

  async function installApp() {
    if (!state.installPrompt) return;
    await state.installPrompt.prompt();
    state.installPrompt = null;
    renderShell();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    renderShell();
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    renderShell();
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed.", error));
    });
  }

  saveData();
  renderShell();
})();
