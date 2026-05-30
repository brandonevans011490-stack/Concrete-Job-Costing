(function () {
  const { useEffect, useMemo, useState } = React;
  const h = React.createElement;

  const STORAGE_KEY = "concrete-job-costing-data-v1";
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

  const JOB_TYPES = [
    "driveway",
    "patio",
    "slab",
    "sidewalk",
    "garage floor",
    "commercial",
    "other"
  ];

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
    ["dashboard", "Dashboard", "LayoutDashboard"],
    ["jobs", "Jobs", "BriefcaseBusiness"],
    ["add", "Add", "Plus"],
    ["overhead", "Overhead", "ReceiptText"],
    ["reports", "Reports", "ChartNoAxesColumn"],
    ["settings", "Settings", "Settings"]
  ];

  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });

  const preciseCurrency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function amount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "").replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function roundMoney(value) {
    return Math.round(amount(value) * 100) / 100;
  }

  function money(value, precise) {
    return precise ? preciseCurrency.format(amount(value)) : currency.format(amount(value));
  }

  function percent(value) {
    return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
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
    const day = start.getDay();
    const mondayOffset = (day + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const end = endOfDay(start);
    end.setDate(start.getDate() + 6);
    return [start, end];
  }

  function monthRange(baseDate) {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const end = endOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0));
    return [start, end];
  }

  function lastMonthRange(baseDate) {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
    const end = endOfDay(new Date(baseDate.getFullYear(), baseDate.getMonth(), 0));
    return [start, end];
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

  function isCompleted(job) {
    return job.status === "completed" || job.status === "paid";
  }

  function emptyCosts() {
    return COST_FIELDS.reduce((acc, [key]) => {
      acc[key] = 0;
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

  function totalDirectCost(job) {
    const costs = job.costs || {};
    return COST_FIELDS.reduce((sum, [key]) => sum + amount(costs[key]), 0);
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

  function makeOverheadItems() {
    return DEFAULT_OVERHEAD.map(([name, amountValue], index) => ({
      id: `overhead-${index}`,
      name,
      amount: amountValue
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
        costs: {
          concrete: 3150,
          labor: 3400,
          rebarWireMesh: 580,
          gravelBase: 520,
          pump: 0,
          equipmentRental: 350,
          dumpDisposal: 260,
          fuel: 140,
          subcontractors: 450,
          permits: 130,
          smallToolsMaterials: 100,
          other: 0
        }
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
        costs: {
          concrete: 900,
          labor: 1100,
          rebarWireMesh: 120,
          gravelBase: 160,
          pump: 0,
          equipmentRental: 100,
          dumpDisposal: 75,
          fuel: 60,
          subcontractors: 250,
          permits: 60,
          smallToolsMaterials: 80,
          other: 0
        }
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
        notes: "",
        costs: {
          concrete: 4200,
          labor: 3900,
          rebarWireMesh: 700,
          gravelBase: 650,
          pump: 0,
          equipmentRental: 420,
          dumpDisposal: 260,
          fuel: 190,
          subcontractors: 720,
          permits: 120,
          smallToolsMaterials: 120,
          other: 0
        }
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
        notes: "",
        costs: {
          concrete: 5100,
          labor: 4200,
          rebarWireMesh: 920,
          gravelBase: 800,
          pump: 650,
          equipmentRental: 500,
          dumpDisposal: 280,
          fuel: 220,
          subcontractors: 200,
          permits: 130,
          smallToolsMaterials: 100,
          other: 0
        }
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
        notes: "Kept as a low-margin sample so the warning system has a real example.",
        costs: {
          concrete: 3200,
          labor: 3300,
          rebarWireMesh: 450,
          gravelBase: 600,
          pump: 0,
          equipmentRental: 350,
          dumpDisposal: 250,
          fuel: 180,
          subcontractors: 1400,
          permits: 140,
          smallToolsMaterials: 250,
          other: 130
        }
      }),
      normalizeJob({
        id: "job-church-walkway",
        jobName: "Church Walkway",
        customerName: "Grace Church",
        phone: "555-0126",
        address: "41 Elm St",
        jobType: "sidewalk",
        salePrice: 12750,
        dateSold: daysAgo(58),
        startDate: daysAgo(38),
        completionDate: daysAgo(35),
        status: "paid",
        notes: "",
        costs: {
          concrete: 2500,
          labor: 2700,
          rebarWireMesh: 220,
          gravelBase: 440,
          pump: 0,
          equipmentRental: 240,
          dumpDisposal: 160,
          fuel: 120,
          subcontractors: 900,
          permits: 120,
          smallToolsMaterials: 200,
          other: 0
        }
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
        notes: "",
        costs: {
          concrete: 6200,
          labor: 4800,
          rebarWireMesh: 1100,
          gravelBase: 900,
          pump: 700,
          equipmentRental: 550,
          dumpDisposal: 260,
          fuel: 240,
          subcontractors: 0,
          permits: 160,
          smallToolsMaterials: 90,
          other: 0
        }
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
        notes: "",
        costs: {
          concrete: 7800,
          labor: 5700,
          rebarWireMesh: 1400,
          gravelBase: 1200,
          pump: 850,
          equipmentRental: 620,
          dumpDisposal: 330,
          fuel: 300,
          subcontractors: 360,
          permits: 210,
          smallToolsMaterials: 130,
          other: 0
        }
      }),
      normalizeJob({
        id: "job-lee-repair",
        jobName: "Lee Sidewalk Repair",
        customerName: "M. Lee",
        phone: "555-0194",
        address: "505 Cedar Run",
        jobType: "sidewalk",
        salePrice: 8800,
        dateSold: daysAgo(144),
        startDate: daysAgo(137),
        completionDate: daysAgo(135),
        status: "paid",
        notes: "",
        costs: {
          concrete: 1700,
          labor: 2100,
          rebarWireMesh: 180,
          gravelBase: 260,
          pump: 0,
          equipmentRental: 180,
          dumpDisposal: 90,
          fuel: 80,
          subcontractors: 420,
          permits: 80,
          smallToolsMaterials: 110,
          other: 0
        }
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
      jobs: Array.isArray(data.jobs) ? data.jobs.map(normalizeJob) : fallback.jobs,
      overheadItems: Array.isArray(data.overheadItems) && data.overheadItems.length
        ? data.overheadItems.map((item, index) => ({
            id: item.id || `overhead-${index}-${Date.now()}`,
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
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? migrateData(JSON.parse(saved)) : defaultData();
    } catch (error) {
      console.warn("Could not load saved job costing data.", error);
      return defaultData();
    }
  }

  function saveData(data) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function overheadTotal(overheadItems) {
    return overheadItems.reduce((sum, item) => sum + amount(item.amount), 0);
  }

  function completedJobsForRange(jobs, rangeKey) {
    const [start, end] = getRange(rangeKey);
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

  function monthRevenueForJob(job, allJobs) {
    const date = toDate(job.completionDate);
    if (!date) return 0;
    return allJobs
      .filter((item) => isCompleted(item) && item.completionDate && sameMonth(toDate(item.completionDate), date))
      .reduce((sum, item) => sum + amount(item.salePrice), 0);
  }

  function calculateJob(job, allJobs, monthlyOverhead, settings) {
    const salePrice = amount(job.salePrice);
    const directCosts = totalDirectCost(job);
    const grossProfit = salePrice - directCosts;
    const grossMarginPct = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;
    const currentJobs = allJobs.some((item) => item.id === job.id)
      ? allJobs.map((item) => (item.id === job.id ? normalizeJob(job) : item))
      : allJobs.concat([normalizeJob(job)]);
    const monthRevenue = isCompleted(job) ? monthRevenueForJob(job, currentJobs) : 0;
    const baselineRevenue = amount(settings.typicalWeeklyRevenue) * WEEKS_PER_MONTH;
    const allocationBasis = Math.max(monthRevenue || baselineRevenue, salePrice, 1);
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

  function dashboardMetrics(data) {
    const monthlyOverhead = overheadTotal(data.overheadItems);
    const monthJobs = completedJobsForRange(data.jobs, "this_month");
    const weekJobs = completedJobsForRange(data.jobs, "this_week");
    const month = summarizeJobs(monthJobs);
    const week = summarizeJobs(weekJobs);
    const marginDecimal = month.revenue > 0
      ? month.grossProfit / month.revenue
      : amount(data.settings.defaultGrossMarginPct) / 100;
    const breakEvenSales = marginDecimal > 0 ? monthlyOverhead / marginDecimal : 0;
    const targetProfit = amount(data.settings.targetMonthlyProfit);
    const neededSales = marginDecimal > 0 ? (monthlyOverhead + targetProfit) / marginDecimal : 0;
    const overheadPctOfSales = month.revenue > 0 ? (monthlyOverhead / month.revenue) * 100 : 0;
    return {
      monthlyOverhead,
      monthJobs,
      weekJobs,
      month,
      week,
      estimatedNetProfit: month.grossProfit - monthlyOverhead,
      breakEvenSales,
      neededSales,
      overheadPctOfSales
    };
  }

  function buildAlerts(data, metrics) {
    const alerts = [];
    const monthlyOverhead = metrics.monthlyOverhead;
    const lowMarginThreshold = amount(data.settings.lowMarginThresholdPct);
    const overheadThreshold = amount(data.settings.overheadSalesThresholdPct);

    data.jobs.forEach((job) => {
      if (!amount(job.salePrice)) return;
      const calc = calculateJob(job, data.jobs, monthlyOverhead, data.settings);
      if (calc.grossMarginPct < lowMarginThreshold && ["sold", "scheduled", "in progress", "completed", "paid"].includes(job.status)) {
        alerts.push({
          tone: "danger",
          icon: "AlertTriangle",
          title: `${job.jobName} margin is ${percent(calc.grossMarginPct)}`,
          body: `Gross margin is below ${percent(lowMarginThreshold)}. Gross profit is ${money(calc.grossProfit)} on ${money(calc.salePrice)}.`
        });
      }
    });

    if (metrics.month.revenue > 0 && metrics.overheadPctOfSales > overheadThreshold) {
      alerts.push({
        tone: "warning",
        icon: "Gauge",
        title: `Overhead is ${percent(metrics.overheadPctOfSales)} of monthly sales`,
        body: `Current overhead is ${money(monthlyOverhead)} against ${money(metrics.month.revenue)} in completed monthly revenue.`
      });
    }

    if (metrics.month.revenue < metrics.breakEvenSales) {
      alerts.push({
        tone: "warning",
        icon: "CircleDollarSign",
        title: "Monthly revenue is below break-even",
        body: `Break-even sales are ${money(metrics.breakEvenSales)} based on current margin and overhead.`
      });
    }

    data.jobs
      .filter((job) => job.status === "completed")
      .forEach((job) => {
        alerts.push({
          tone: "notice",
          icon: "ClipboardCheck",
          title: `${job.jobName} is completed but not paid`,
          body: `${job.customerName || "Customer"} still needs to be marked paid.`
        });
      });

    return alerts;
  }

  function normalizeAttrs(attrs) {
    const props = {};
    Object.entries(attrs || {}).forEach(([key, value]) => {
      const propName = key === "class" ? "className" : key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      props[propName] = value;
    });
    return props;
  }

  function renderIconNode(node, key, rootProps) {
    if (!Array.isArray(node)) return node;
    const [tag, attrs, children] = node;
    const props = { ...normalizeAttrs(attrs), ...(rootProps || {}), key };
    const kids = Array.isArray(children) ? children.map((child, index) => renderIconNode(child, index)) : children;
    return h(tag, props, kids);
  }

  function Icon({ name, size = 20, className = "" }) {
    const iconData = window.lucide && (window.lucide[name] || (window.lucide.icons && window.lucide.icons[name]));
    if (!iconData) return h("span", { className: `icon-fallback ${className}`, "aria-hidden": "true" });
    return renderIconNode(iconData, undefined, {
      width: size,
      height: size,
      className: `icon ${className}`.trim(),
      "aria-hidden": "true",
      focusable: "false"
    });
  }

  function PageHeader({ title, subtitle, action }) {
    return h("div", { className: "page-header" },
      h("div", null,
        h("h1", null, title),
        subtitle ? h("p", null, subtitle) : null
      ),
      action || null
    );
  }

  function MetricCard({ label, value, sub, icon, tone }) {
    return h("article", { className: `metric ${tone || ""}`.trim() },
      h("div", { className: "metric-top" },
        h("span", null, label),
        icon ? h(Icon, { name: icon, size: 19 }) : null
      ),
      h("strong", null, value),
      sub ? h("small", null, sub) : null
    );
  }

  function Button({ children, icon, variant = "secondary", onClick, type = "button", disabled, className = "" }) {
    return h("button", {
      className: `btn ${variant} ${className}`.trim(),
      type,
      onClick,
      disabled
    },
      icon ? h(Icon, { name: icon, size: 18 }) : null,
      h("span", null, children)
    );
  }

  function Field({ label, children, className = "" }) {
    return h("label", { className: `field ${className}`.trim() },
      h("span", null, label),
      children
    );
  }

  function TextInput(props) {
    const { label, value, onChange, type = "text", inputMode, placeholder, className, min, step } = props;
    return h(Field, { label, className },
      h("input", {
        value: value == null ? "" : value,
        type,
        inputMode,
        placeholder,
        min,
        step,
        onChange: (event) => onChange(event.target.value)
      })
    );
  }

  function SelectInput({ label, value, onChange, options }) {
    return h(Field, { label },
      h("select", { value, onChange: (event) => onChange(event.target.value) },
        options.map((option) => h("option", { key: option, value: option }, titleCase(option)))
      )
    );
  }

  function StatusPill({ status }) {
    return h("span", { className: `status status-${String(status).replace(/\s+/g, "-")}` }, titleCase(status));
  }

  function AlertsPanel({ alerts }) {
    return h("section", { className: "panel alerts-panel" },
      h("div", { className: "section-title" },
        h("h2", null, "Alerts"),
        h("span", null, alerts.length ? `${alerts.length} warning${alerts.length === 1 ? "" : "s"}` : "Clear")
      ),
      alerts.length
        ? h("div", { className: "alert-list" },
            alerts.slice(0, 6).map((alert, index) =>
              h("article", { key: `${alert.title}-${index}`, className: `alert ${alert.tone}` },
                h(Icon, { name: alert.icon, size: 20 }),
                h("div", null,
                  h("strong", null, alert.title),
                  h("p", null, alert.body)
                )
              )
            )
          )
        : h("p", { className: "quiet" }, "No warnings right now.")
    );
  }

  function Dashboard({ data }) {
    const metrics = useMemo(() => dashboardMetrics(data), [data]);
    const alerts = useMemo(() => buildAlerts(data, metrics), [data, metrics]);
    return h("div", { className: "screen" },
      h(PageHeader, {
        title: "Dashboard",
        subtitle: "This month, this week, and break-even."
      }),
      h("section", { className: "hero-band" },
        h("div", null,
          h("span", null, "Estimated net after overhead"),
          h("strong", { className: metrics.estimatedNetProfit >= 0 ? "profit" : "loss" }, money(metrics.estimatedNetProfit))
        ),
        h("div", null,
          h("span", null, "Monthly overhead"),
          h("strong", null, money(metrics.monthlyOverhead))
        )
      ),
      h("section", { className: "metric-grid" },
        h(MetricCard, { label: "Monthly revenue", value: money(metrics.month.revenue), sub: `${metrics.month.count} completed jobs`, icon: "DollarSign" }),
        h(MetricCard, { label: "Weekly revenue", value: money(metrics.week.revenue), sub: `${metrics.week.count} completed jobs`, icon: "CalendarDays" }),
        h(MetricCard, { label: "Total job costs", value: money(metrics.month.directCosts), sub: "Direct costs this month", icon: "ReceiptText" }),
        h(MetricCard, { label: "Gross profit", value: money(metrics.month.grossProfit), sub: "Before overhead", icon: "TrendingUp", tone: metrics.month.grossProfit >= 0 ? "good" : "bad" }),
        h(MetricCard, { label: "Gross margin", value: percent(metrics.month.grossMarginPct), sub: "Completed jobs", icon: "Percent" }),
        h(MetricCard, { label: "Break-even sales", value: money(metrics.breakEvenSales), sub: "Monthly overhead / margin", icon: "CircleDollarSign" }),
        h(MetricCard, { label: "Sales for target profit", value: money(metrics.neededSales), sub: `${money(data.settings.targetMonthlyProfit)} target`, icon: "Target" }),
        h(MetricCard, { label: "Overhead as sales", value: percent(metrics.overheadPctOfSales), sub: "This month", icon: "Gauge", tone: metrics.overheadPctOfSales > amount(data.settings.overheadSalesThresholdPct) ? "bad" : "good" })
      ),
      h("section", { className: "panel count-strip" },
        h("div", null, h("span", null, "Completed this week"), h("strong", null, metrics.week.count)),
        h("div", null, h("span", null, "Completed this month"), h("strong", null, metrics.month.count)),
        h("div", null, h("span", null, "Avg job size"), h("strong", null, money(metrics.month.averageJobSize)))
      ),
      h(AlertsPanel, { alerts })
    );
  }

  function JobCard({ job, data, onEdit, onDelete }) {
    const calc = calculateJob(job, data.jobs, overheadTotal(data.overheadItems), data.settings);
    const mapsLink = job.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}` : "";
    return h("article", { className: "job-card" },
      h("div", { className: "job-card-head" },
        h("div", null,
          h("h3", null, job.jobName),
          h("p", null, job.customerName || "No customer name")
        ),
        h(StatusPill, { status: job.status })
      ),
      h("div", { className: "job-meta" },
        h("span", null, h(Icon, { name: "Hammer", size: 16 }), titleCase(job.jobType)),
        job.completionDate ? h("span", null, h(Icon, { name: "CalendarDays", size: 16 }), job.completionDate) : null
      ),
      h("div", { className: "job-numbers" },
        h("div", null, h("span", null, "Sale"), h("strong", null, money(calc.salePrice))),
        h("div", null, h("span", null, "Cost"), h("strong", null, money(calc.directCosts))),
        h("div", null, h("span", null, "Margin"), h("strong", { className: calc.grossMarginPct < amount(data.settings.lowMarginThresholdPct) ? "loss" : "" }, percent(calc.grossMarginPct))),
        h("div", null, h("span", null, "Net est."), h("strong", { className: calc.estimatedNetProfit >= 0 ? "profit" : "loss" }, money(calc.estimatedNetProfit)))
      ),
      h("div", { className: "card-actions" },
        h(Button, { icon: "Pencil", onClick: () => onEdit(job.id) }, "Edit"),
        job.phone ? h("a", { className: "btn secondary", href: `tel:${job.phone}` }, h(Icon, { name: "Phone", size: 18 }), h("span", null, "Call")) : null,
        mapsLink ? h("a", { className: "btn secondary", href: mapsLink, target: "_blank", rel: "noreferrer" }, h(Icon, { name: "MapPin", size: 18 }), h("span", null, "Map")) : null,
        h(Button, { icon: "Trash2", variant: "ghost", onClick: () => onDelete(job.id) }, "Delete")
      )
    );
  }

  function JobsPage({ data, onEdit, onDelete, onAdd }) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const jobs = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return data.jobs
        .filter((job) => status === "all" || job.status === status)
        .filter((job) => {
          if (!needle) return true;
          return [job.jobName, job.customerName, job.phone, job.address, job.jobType]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        })
        .sort((a, b) => String(b.completionDate || b.startDate || b.dateSold).localeCompare(String(a.completionDate || a.startDate || a.dateSold)));
    }, [data.jobs, query, status]);

    return h("div", { className: "screen" },
      h(PageHeader, {
        title: "Jobs",
        subtitle: `${jobs.length} job${jobs.length === 1 ? "" : "s"} showing`,
        action: h(Button, { icon: "Plus", variant: "primary", onClick: onAdd }, "Add")
      }),
      h("section", { className: "toolbar panel" },
        h("div", { className: "search-box" },
          h(Icon, { name: "Search", size: 18 }),
          h("input", {
            value: query,
            placeholder: "Search jobs",
            onChange: (event) => setQuery(event.target.value)
          })
        ),
        h("div", { className: "chip-row" },
          ["all"].concat(STATUSES).map((item) =>
            h("button", {
              key: item,
              className: `chip ${status === item ? "active" : ""}`,
              type: "button",
              onClick: () => setStatus(item)
            }, item === "all" ? "All" : titleCase(item))
          )
        )
      ),
      h("section", { className: "job-list" },
        jobs.length
          ? jobs.map((job) => h(JobCard, { key: job.id, job, data, onEdit, onDelete }))
          : h("p", { className: "empty-state" }, "No jobs match that filter.")
      )
    );
  }

  function emptyJob() {
    return {
      id: `job-${Date.now()}`,
      jobName: "",
      customerName: "",
      phone: "",
      address: "",
      jobType: "driveway",
      salePrice: "",
      dateSold: todayIso(),
      startDate: "",
      completionDate: todayIso(),
      status: "completed",
      notes: "",
      costs: emptyCosts()
    };
  }

  function JobForm({ data, editingJob, onSave, onCancel }) {
    const [draft, setDraft] = useState(() => editingJob ? JSON.parse(JSON.stringify(editingJob)) : emptyJob());
    const [error, setError] = useState("");

    useEffect(() => {
      setDraft(editingJob ? JSON.parse(JSON.stringify(editingJob)) : emptyJob());
      setError("");
    }, [editingJob && editingJob.id]);

    const monthlyOverhead = overheadTotal(data.overheadItems);
    const previewJobs = data.jobs.some((job) => job.id === draft.id)
      ? data.jobs.map((job) => (job.id === draft.id ? normalizeJob(draft) : job))
      : data.jobs.concat([normalizeJob(draft)]);
    const calc = calculateJob(draft, previewJobs, monthlyOverhead, data.settings);

    function update(field, value) {
      setDraft((current) => ({ ...current, [field]: value }));
    }

    function updateCost(field, value) {
      setDraft((current) => ({
        ...current,
        costs: { ...current.costs, [field]: value }
      }));
    }

    function submit(event) {
      event.preventDefault();
      if (!String(draft.jobName || "").trim()) {
        setError("Add a job name before saving.");
        return;
      }
      onSave(normalizeJob(draft));
    }

    return h("div", { className: "screen" },
      h(PageHeader, {
        title: editingJob ? "Edit Job" : "Add Job",
        subtitle: "Fast entry for the truck.",
        action: h(Button, { icon: "X", onClick: onCancel }, "Cancel")
      }),
      h("form", { className: "job-form", onSubmit: submit },
        error ? h("div", { className: "form-error" }, error) : null,
        h("section", { className: "form-section panel" },
          h("h2", null, "Job"),
          h("div", { className: "form-grid" },
            h(TextInput, { label: "Job name", value: draft.jobName, onChange: (value) => update("jobName", value), placeholder: "Smith driveway" }),
            h(TextInput, { label: "Customer name", value: draft.customerName, onChange: (value) => update("customerName", value), placeholder: "Customer" }),
            h(TextInput, { label: "Phone number", value: draft.phone, onChange: (value) => update("phone", value), type: "tel", inputMode: "tel" }),
            h(TextInput, { label: "Address", value: draft.address, onChange: (value) => update("address", value), placeholder: "Job address" }),
            h(SelectInput, { label: "Job type", value: draft.jobType, onChange: (value) => update("jobType", value), options: JOB_TYPES }),
            h(TextInput, { label: "Sale price", value: draft.salePrice, onChange: (value) => update("salePrice", value), type: "number", inputMode: "decimal", min: "0", step: "0.01" }),
            h(TextInput, { label: "Date sold", value: draft.dateSold, onChange: (value) => update("dateSold", value), type: "date" }),
            h(TextInput, { label: "Start date", value: draft.startDate, onChange: (value) => update("startDate", value), type: "date" }),
            h(TextInput, { label: "Completion date", value: draft.completionDate, onChange: (value) => update("completionDate", value), type: "date" }),
            h(SelectInput, { label: "Status", value: draft.status, onChange: (value) => update("status", value), options: STATUSES })
          ),
          h(Field, { label: "Notes", className: "wide-field" },
            h("textarea", {
              value: draft.notes,
              rows: 4,
              onChange: (event) => update("notes", event.target.value)
            })
          )
        ),
        h("section", { className: "form-section panel" },
          h("h2", null, "Direct Costs"),
          h("div", { className: "cost-grid" },
            COST_FIELDS.map(([key, label]) =>
              h(TextInput, {
                key,
                label,
                value: draft.costs[key],
                onChange: (value) => updateCost(key, value),
                type: "number",
                inputMode: "decimal",
                min: "0",
                step: "0.01"
              })
            )
          )
        ),
        h("section", { className: "calc-panel" },
          h("div", null, h("span", null, "Direct cost"), h("strong", null, money(calc.directCosts, true))),
          h("div", null, h("span", null, "Gross profit"), h("strong", { className: calc.grossProfit >= 0 ? "profit" : "loss" }, money(calc.grossProfit, true))),
          h("div", null, h("span", null, "Gross margin"), h("strong", { className: calc.grossMarginPct < amount(data.settings.lowMarginThresholdPct) ? "loss" : "" }, percent(calc.grossMarginPct))),
          h("div", null, h("span", null, "Overhead allocation"), h("strong", null, money(calc.overheadAllocation, true))),
          h("div", null, h("span", null, "Net estimate"), h("strong", { className: calc.estimatedNetProfit >= 0 ? "profit" : "loss" }, money(calc.estimatedNetProfit, true)))
        ),
        h("div", { className: "submit-row" },
          h(Button, { icon: "Save", variant: "primary", type: "submit" }, editingJob ? "Save Changes" : "Save Job")
        )
      )
    );
  }

  function OverheadPage({ data, setData }) {
    const total = overheadTotal(data.overheadItems);

    function updateItem(id, field, value) {
      setData((current) => ({
        ...current,
        overheadItems: current.overheadItems.map((item) =>
          item.id === id ? { ...item, [field]: field === "amount" ? value : value } : item
        )
      }));
    }

    function addItem() {
      setData((current) => ({
        ...current,
        overheadItems: current.overheadItems.concat([{ id: `overhead-${Date.now()}`, name: "New expense", amount: 0 }])
      }));
    }

    function removeItem(id) {
      setData((current) => ({
        ...current,
        overheadItems: current.overheadItems.filter((item) => item.id !== id)
      }));
    }

    function resetDefaults() {
      if (!window.confirm("Reset overhead items to the $10,000 default list?")) return;
      setData((current) => ({ ...current, overheadItems: makeOverheadItems() }));
    }

    function balanceMisc() {
      setData((current) => {
        const items = current.overheadItems.slice();
        const miscIndex = items.findIndex((item) => item.name.toLowerCase().includes("misc"));
        if (miscIndex === -1) return current;
        const otherTotal = items.reduce((sum, item, index) => index === miscIndex ? sum : sum + amount(item.amount), 0);
        items[miscIndex] = { ...items[miscIndex], amount: Math.max(0, 10000 - otherTotal) };
        return { ...current, overheadItems: items };
      });
    }

    return h("div", { className: "screen" },
      h(PageHeader, {
        title: "Overhead",
        subtitle: "Monthly fixed costs.",
        action: h(Button, { icon: "Plus", variant: "primary", onClick: addItem }, "Add")
      }),
      h("section", { className: "hero-band overhead-total" },
        h("div", null, h("span", null, "Monthly overhead"), h("strong", null, money(total))),
        h("div", null, h("span", null, "Against $10,000 default"), h("strong", { className: total <= 10000 ? "profit" : "loss" }, money(total - 10000)))
      ),
      h("section", { className: "overhead-list panel" },
        data.overheadItems.map((item) =>
          h("div", { className: "overhead-row", key: item.id },
            h("input", {
              value: item.name,
              "aria-label": "Expense name",
              onChange: (event) => updateItem(item.id, "name", event.target.value)
            }),
            h("input", {
              value: item.amount,
              type: "number",
              inputMode: "decimal",
              min: "0",
              step: "0.01",
              "aria-label": "Monthly amount",
              onChange: (event) => updateItem(item.id, "amount", event.target.value)
            }),
            h("button", { className: "icon-btn", type: "button", "aria-label": "Remove expense", onClick: () => removeItem(item.id) },
              h(Icon, { name: "Trash2", size: 19 })
            )
          )
        )
      ),
      h("div", { className: "split-actions" },
        h(Button, { icon: "RefreshCcw", onClick: balanceMisc }, "Balance Misc"),
        h(Button, { icon: "RotateCcw", onClick: resetDefaults }, "Reset Defaults")
      )
    );
  }

  const REPORT_PERIODS = [
    ["this_week", "This week"],
    ["this_month", "This month"],
    ["last_month", "Last month"],
    ["ytd", "Year to date"]
  ];

  function typeRows(jobs) {
    const grouped = {};
    jobs.forEach((job) => {
      const type = job.jobType || "other";
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(job);
    });
    return Object.entries(grouped)
      .map(([type, rows]) => ({ type, ...summarizeJobs(rows) }))
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }

  function MarginList({ title, jobs, data }) {
    return h("section", { className: "panel margin-list" },
      h("div", { className: "section-title" }, h("h2", null, title)),
      jobs.length ? jobs.map((job) => {
        const calc = calculateJob(job, data.jobs, overheadTotal(data.overheadItems), data.settings);
        return h("div", { className: "report-row", key: `${title}-${job.id}` },
          h("div", null, h("strong", null, job.jobName), h("span", null, titleCase(job.jobType))),
          h("div", null, h("strong", { className: calc.grossMarginPct < amount(data.settings.lowMarginThresholdPct) ? "loss" : "" }, percent(calc.grossMarginPct)), h("span", null, money(calc.grossProfit)))
        );
      }) : h("p", { className: "quiet" }, "No completed jobs in this period.")
    );
  }

  function ReportsPage({ data }) {
    const [periodKey, setPeriodKey] = useState("this_month");
    const jobs = completedJobsForRange(data.jobs, periodKey);
    const summary = summarizeJobs(jobs);
    const totalOverhead = overheadTotal(data.overheadItems);
    const overheadPct = summary.revenue > 0 ? (totalOverhead / summary.revenue) * 100 : 0;
    const byType = typeRows(jobs);
    const sortedByMargin = jobs
      .slice()
      .sort((a, b) => calculateJob(b, data.jobs, totalOverhead, data.settings).grossMarginPct - calculateJob(a, data.jobs, totalOverhead, data.settings).grossMarginPct);
    const best = sortedByMargin.slice(0, 5);
    const worst = sortedByMargin.slice().reverse().slice(0, 5);

    return h("div", { className: "screen" },
      h(PageHeader, { title: "Reports", subtitle: "Revenue, margin, and job type." }),
      h("section", { className: "panel" },
        h("div", { className: "chip-row period-row" },
          REPORT_PERIODS.map(([key, label]) =>
            h("button", {
              key,
              type: "button",
              className: `chip ${periodKey === key ? "active" : ""}`,
              onClick: () => setPeriodKey(key)
            }, label)
          )
        )
      ),
      h("section", { className: "metric-grid" },
        h(MetricCard, { label: "Revenue", value: money(summary.revenue), sub: `${summary.count} completed jobs`, icon: "DollarSign" }),
        h(MetricCard, { label: "Average job size", value: money(summary.averageJobSize), sub: "Sale price average", icon: "Calculator" }),
        h(MetricCard, { label: "Average gross margin", value: percent(summary.grossMarginPct), sub: "Weighted by sales", icon: "Percent" }),
        h(MetricCard, { label: "Overhead as sales", value: percent(overheadPct), sub: `${money(totalOverhead)} overhead`, icon: "Gauge" })
      ),
      h("section", { className: "panel report-table" },
        h("div", { className: "section-title" }, h("h2", null, "Profit by Job Type")),
        byType.length ? byType.map((row) =>
          h("div", { className: "report-row", key: row.type },
            h("div", null, h("strong", null, titleCase(row.type)), h("span", null, `${row.count} job${row.count === 1 ? "" : "s"}`)),
            h("div", null, h("strong", null, money(row.grossProfit)), h("span", null, `${money(row.revenue)} sales, ${percent(row.grossMarginPct)}`))
          )
        ) : h("p", { className: "quiet" }, "No completed jobs in this period.")
      ),
      h("div", { className: "report-columns" },
        h(MarginList, { title: "Best Jobs by Gross Margin", jobs: best, data }),
        h(MarginList, { title: "Worst Jobs by Gross Margin", jobs: worst, data })
      )
    );
  }

  function SettingsPage({ data, setData, installPrompt, onInstall }) {
    const [importError, setImportError] = useState("");

    function updateSetting(field, value) {
      setData((current) => ({
        ...current,
        settings: { ...current.settings, [field]: value }
      }));
    }

    function resetData() {
      if (!window.confirm("Reset all jobs and overhead to the sample data?")) return;
      setData(defaultData());
    }

    function exportBackup() {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `concrete-job-costing-backup-${todayIso()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function importBackup(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          setData(migrateData(JSON.parse(reader.result)));
          setImportError("");
        } catch (error) {
          setImportError("That backup file could not be loaded.");
        }
      };
      reader.readAsText(file);
    }

    return h("div", { className: "screen" },
      h(PageHeader, { title: "Settings", subtitle: "Targets, alerts, and backup." }),
      h("section", { className: "form-section panel" },
        h("h2", null, "Business Targets"),
        h("div", { className: "form-grid" },
          h(TextInput, { label: "Target monthly profit", value: data.settings.targetMonthlyProfit, onChange: (value) => updateSetting("targetMonthlyProfit", value), type: "number", inputMode: "decimal", min: "0", step: "100" }),
          h(TextInput, { label: "Typical weekly completed revenue", value: data.settings.typicalWeeklyRevenue, onChange: (value) => updateSetting("typicalWeeklyRevenue", value), type: "number", inputMode: "decimal", min: "0", step: "100" }),
          h(TextInput, { label: "Default gross margin %", value: data.settings.defaultGrossMarginPct, onChange: (value) => updateSetting("defaultGrossMarginPct", value), type: "number", inputMode: "decimal", min: "0", step: "0.1" }),
          h(TextInput, { label: "Low margin warning %", value: data.settings.lowMarginThresholdPct, onChange: (value) => updateSetting("lowMarginThresholdPct", value), type: "number", inputMode: "decimal", min: "0", step: "0.1" }),
          h(TextInput, { label: "Overhead warning % of sales", value: data.settings.overheadSalesThresholdPct, onChange: (value) => updateSetting("overheadSalesThresholdPct", value), type: "number", inputMode: "decimal", min: "0", step: "0.1" })
        )
      ),
      h("section", { className: "panel settings-actions" },
        h("div", { className: "section-title" }, h("h2", null, "App")),
        h("div", { className: "split-actions" },
          h(Button, { icon: "Download", onClick: exportBackup }, "Backup"),
          h(Button, { icon: "Upload", onClick: () => document.getElementById("backup-file").click() }, "Restore"),
          h(Button, { icon: "Smartphone", variant: "primary", onClick: onInstall, disabled: !installPrompt }, "Install")
        ),
        h("input", {
          id: "backup-file",
          className: "visually-hidden",
          type: "file",
          accept: "application/json",
          onChange: (event) => importBackup(event.target.files && event.target.files[0])
        }),
        importError ? h("p", { className: "form-error" }, importError) : null
      ),
      h("section", { className: "panel danger-zone" },
        h("div", { className: "section-title" }, h("h2", null, "Reset")),
        h(Button, { icon: "RotateCcw", variant: "ghost", onClick: resetData }, "Reset Sample Data")
      )
    );
  }

  function BottomNav({ active, onNavigate }) {
    return h("nav", { className: "bottom-nav", "aria-label": "Main navigation" },
      NAV.map(([key, label, icon]) =>
        h("button", {
          key,
          type: "button",
          className: active === key ? "active" : "",
          onClick: () => onNavigate(key),
          "aria-current": active === key ? "page" : undefined
        },
          h(Icon, { name: icon, size: 21 }),
          h("span", null, label)
        )
      )
    );
  }

  function App() {
    const [data, setData] = useState(loadData);
    const [view, setView] = useState("dashboard");
    const [editingId, setEditingId] = useState(null);
    const [installPrompt, setInstallPrompt] = useState(null);

    useEffect(() => {
      saveData(data);
    }, [data]);

    useEffect(() => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed.", error));
      }

      const beforeInstall = (event) => {
        event.preventDefault();
        setInstallPrompt(event);
      };
      const installed = () => setInstallPrompt(null);
      window.addEventListener("beforeinstallprompt", beforeInstall);
      window.addEventListener("appinstalled", installed);
      return () => {
        window.removeEventListener("beforeinstallprompt", beforeInstall);
        window.removeEventListener("appinstalled", installed);
      };
    }, []);

    function navigate(nextView) {
      if (nextView === "add") {
        setEditingId(null);
      }
      setView(nextView);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function saveJob(job) {
      setData((current) => {
        const exists = current.jobs.some((item) => item.id === job.id);
        return {
          ...current,
          jobs: exists
            ? current.jobs.map((item) => (item.id === job.id ? job : item))
            : [job].concat(current.jobs)
        };
      });
      setEditingId(job.id);
      setView("jobs");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function editJob(id) {
      setEditingId(id);
      setView("add");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function deleteJob(id) {
      const job = data.jobs.find((item) => item.id === id);
      if (!job || !window.confirm(`Delete ${job.jobName}?`)) return;
      setData((current) => ({ ...current, jobs: current.jobs.filter((item) => item.id !== id) }));
    }

    async function installApp() {
      if (!installPrompt) return;
      await installPrompt.prompt();
      setInstallPrompt(null);
    }

    const editingJob = data.jobs.find((job) => job.id === editingId) || null;
    const screen = view === "dashboard"
      ? h(Dashboard, { data })
      : view === "jobs"
        ? h(JobsPage, { data, onEdit: editJob, onDelete: deleteJob, onAdd: () => navigate("add") })
        : view === "add"
          ? h(JobForm, { data, editingJob, onSave: saveJob, onCancel: () => navigate("jobs") })
          : view === "overhead"
            ? h(OverheadPage, { data, setData })
            : view === "reports"
              ? h(ReportsPage, { data })
              : h(SettingsPage, { data, setData, installPrompt, onInstall: installApp });

    return h("div", { className: "app-shell" },
      h("header", { className: "app-topbar" },
        h("div", { className: "brand" },
          h("img", { src: "./assets/icon.svg", alt: "", width: 38, height: 38 }),
          h("div", null,
            h("strong", null, data.settings.companyName || "Concrete Job Costing"),
            h("span", null, new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()))
          )
        )
      ),
      h("main", null, screen),
      h(BottomNav, { active: view, onNavigate: navigate })
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
