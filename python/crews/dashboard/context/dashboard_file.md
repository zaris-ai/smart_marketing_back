# PRODUCT_REASONS.md

## 1. Document Purpose

### What this file is for
- This file is the canonical marketing source of truth for the Shopify app **Arka Smart Analyzer**.
- It exists to constrain marketing, listing, positioning, copywriting, and messaging outputs to current product reality.
- It is intended for LLM agents, product writers, marketers, and reviewers who need a bounded definition of what the app can and cannot claim.

### Who/what consumes it
- Crew agents that generate marketing or merchant-facing copy.
- Human reviewers who approve listing, landing, or in-app marketing text.
- Any workflow that needs reusable, safe product messaging.

### What this file is not for
- Engineering implementation details.
- Roadmap planning.
- Partner Dashboard instructions.
- Backlog management.
- UI copy for features that are not live.

---

## 2. Source-of-Truth Rules

1. This file overrides ad hoc assumptions, improvised claims, and generic SaaS marketing language.
2. If a claim is not supported in this file, agents must not use it.
3. If information is missing, agents must either:
   - omit the claim, or
   - state that it is not supported by the current source of truth.
4. Agents must prefer exact approved language from this file before paraphrasing.
5. Paraphrasing is allowed only when the meaning stays within the same scope and does not add new implications.
6. Future capabilities, hidden capabilities, dormant code paths, and approval-dependent features must not be presented as current product value.
7. Marketing outputs must describe the product as it works for a merchant today, not as it may work later.

---

## 3. Product Identity

- **App name:** Arka Smart Analyzer
- **One-sentence definition:** A Shopify admin app that turns synced order history and product catalog data into product and sales analysis for merchants.
- **Product category:** Shopify analytics / product performance analytics
- **Core job-to-be-done:** Help merchants understand product performance and sales trends so they can make better pricing, promotion, restocking, and catalog decisions.

---

## 4. Current Product Reality

### What the app does today
The app currently provides product and sales analysis based on Shopify product and order data that has been synced into the app.

Current live capabilities supported by this file:
- Store KPI dashboard
- Sales trends over a selected date range
- Product performance tiers
- Price-tier analysis
- Product performance classification
- Low-stock alerts

### What data it uses
The app currently uses these Shopify data sources:
- Product catalog data
- Order history data

The app does **not** currently rely on:
- storefront pixel tracking
- customer behavior tracking
- customer segmentation data
- machine learning models

### What value it delivers today
The app helps merchants:
- see core store KPIs in one place
- understand how sales change over time
- identify which products drive revenue
- classify products by revenue or sales behavior
- compare revenue across price bands
- spot products that may need restocking or action

### What must be true before saying a capability exists
A capability may be marketed only if all of the following are true:
1. It is available to merchants in the current product experience.
2. It works using current synced product or order data.
3. It does not depend on unapproved Protected Customer Data access.
4. It does not depend on an undeployed or unapproved Web Pixel extension.
5. It produces real merchant-facing output rather than being merely planned, hidden, dormant, or code-level only.

### Current activation constraint
- The first sync currently must be manually triggered.
- Because of this, agents must not claim “no setup required” or “automatic sync on install.”
- The safe phrasing is: **“syncs your store data in one click.”**

---

## 5. Supported Marketing Claims

The following claims are approved for reuse in marketing outputs.

1. Arka Smart Analyzer helps merchants analyze product performance and sales trends inside Shopify admin.
2. The app uses Shopify order history and product catalog data.
3. The app shows core store KPIs such as revenue, order count, average order value, and units sold.
4. The app helps merchants see how sales change over time across a selected date range.
5. The app helps merchants identify which products are driving revenue.
6. The app groups products into performance tiers based on revenue within a selected period.
7. The app breaks down revenue across price bands to help merchants understand revenue mix.
8. The app classifies products by sales behavior, including strong sellers, slow movers, and products with no recent sales.
9. The app surfaces low-stock products so merchants can act before demand is missed.
10. The app is designed for merchants who want more product-level visibility than basic native analytics provides.
11. The app is embedded in Shopify admin.
12. The app is positioned as a focused analytics tool for merchants who want actionable product and sales visibility without exporting data to a separate BI workflow.
13. The app can help with pricing, promotion, restocking, and catalog review decisions.
14. The app can sync store data in one click.
15. The current positioning supports use on Shopify Basic and Shopify plans where merchants need more product-level analysis.

### Reusable claim fragments
Agents may safely reuse these fragments verbatim or near-verbatim:
- “Analyze product performance and sales trends inside Shopify admin.”
- “Use Shopify order history and product catalog data to understand what is driving revenue.”
- “See revenue, order count, average order value, and units sold in one place.”
- “Identify strong sellers, slow movers, and products with no recent sales.”
- “Understand revenue mix across price tiers.”
- “Sync your store data in one click.”

---

## 6. Forbidden / Unsafe Claims

Agents must never make the following claims unless this file is explicitly revised to allow them.

### Forbidden capability claims
- AI-powered insights
- AI recommendations
- predictive analytics
- forecasting
- automation
- customer segmentation
- customer LTV analysis
- churn prediction
- loyalty analysis
- abandoned cart analytics
- sales funnel analytics
- session analytics
- conversion rate analytics that depend on storefront tracking
- bundle analytics that depend on pixel data
- real-time shopper behavior tracking
- cross-channel attribution
- advanced native Shopify replacement claims

### Forbidden implication patterns
- Do not imply the app understands customer intent or shopper behavior.
- Do not imply the app tracks visitors, sessions, or carts.
- Do not imply the app uses machine learning or any intelligence layer that does not exist.
- Do not imply the app fully replaces a BI platform for all merchant analytics needs.
- Do not imply instant value with zero action if a manual first sync is still required.

### Bad phrasing examples
These are unsafe and must not be used:
- “AI-powered Shopify analytics”
- “Predict customer churn before it happens”
- “Track the full funnel from visit to purchase”
- “See why customers abandon carts”
- “Get advanced customer segmentation instantly”
- “Fully automated analytics with no setup”
- “Real-time behavioral intelligence”
- “Advanced analytics suite for every store need”
- “Predict which products will win next month”

---

## 7. Target Merchant Definition

### Ideal merchant profile
- Shopify Basic or Shopify plan merchant
- roughly 50–500 orders per month
- roughly 10–200 active SKUs
- wants clearer product-level and sales-trend visibility
- does not want the cost or complexity of a separate BI platform
- low-to-medium technical comfort

### Who gets the most value
Merchants who already have enough order volume for product comparisons to matter and who need better visibility into:
- top revenue-driving products
- weak or stagnant products
- sales trend changes over time
- price-band contribution to revenue
- products that may require restocking attention

### Who this app is not for yet
- merchants primarily seeking customer behavior or customer lifecycle analytics
- merchants who need funnel analytics or abandoned cart analysis
- merchants who need ML-based recommendations or predictive systems
- merchants with too little order volume for tiering and classification to be meaningful
- Shopify Plus merchants who already rely on deeper native analytics and enterprise reporting workflows

---

## 8. Core Merchant Pain Points

The app addresses these current merchant pain points only:
- Native analytics is too basic for product-level decision making.
- Merchants cannot quickly see which products generate most revenue.
- Merchants cannot easily compare sales performance over custom time windows.
- Merchants lack a simple way to classify products into strong, weak, and inactive groups.
- Merchants cannot easily see how revenue is distributed across low-, mid-, and high-priced items.
- Merchants risk missing restock signals when inventory and product performance are not viewed together.

Agents must not add pain points tied to unavailable capabilities such as customer retention, attribution, funnel leakage, or shopper behavior tracking.

---

## 9. Value Proposition Hierarchy

### Primary value proposition
Give Shopify merchants a clearer view of product performance and sales trends using the order and product data they already have.

### Secondary value propositions
- Reduce manual spreadsheet work for product performance review.
- Make it easier to identify top products and weak products.
- Help merchants review revenue mix by price band.
- Support routine pricing, promotion, restocking, and catalog cleanup decisions.

### Supporting proof points
- KPI dashboard covers revenue, orders, AOV, and units sold.
- Sales trends work across a selected date range.
- Product tiering is based on revenue within a selected period.
- Product classification highlights strong sellers, slow movers, and no-recent-sales products.
- Low-stock alerts connect inventory attention with product demand context.

### Honest qualifiers
- The first sync is currently manual.
- Claims must stay limited to product and sales analysis.
- The app is focused, not all-encompassing.

---

## 10. Feature-to-Benefit Mapping

### Store KPI Dashboard
- **What it does:** Shows revenue, order count, average order value, units sold, and top products.
- **What the merchant learns:** Overall store performance and which products contribute most revenue.
- **What decision it helps with:** Baseline business review and recurring performance checks.

### Sales Trends
- **What it does:** Shows revenue, order volume, and AOV over a selected date range with daily, weekly, or monthly granularity.
- **What the merchant learns:** Whether performance is rising, falling, or reacting to a campaign, launch, or season.
- **What decision it helps with:** Timing promotions, evaluating changes, and comparing periods.

### Product Performance Tiers
- **What it does:** Groups products into Gold, Silver, and Bronze tiers based on revenue in a selected period.
- **What the merchant learns:** Which products are top performers versus weaker contributors.
- **What decision it helps with:** Restocking focus, promotional focus, and catalog prioritization.

### Price-Tier Analysis
- **What it does:** Breaks revenue into price bands and shows revenue mix by tier.
- **What the merchant learns:** Whether revenue is concentrated in lower-, mid-, or higher-priced products.
- **What decision it helps with:** Pricing strategy review and product mix decisions.

### Product Performance Classification
- **What it does:** Classifies products by sales behavior, including best sellers, fast movers, slow movers, and no recent sales.
- **What the merchant learns:** Which products are active, stagnant, or inactive.
- **What decision it helps with:** Promotions, markdowns, clearance, and catalog cleanup.

### Low-Stock Alerts
- **What it does:** Surfaces products below a stock threshold.
- **What the merchant learns:** Which products may be at risk of stocking out.
- **What decision it helps with:** Reordering and inventory attention.

---

## 11. Positioning Boundaries

### Honest and defensible position
Arka Smart Analyzer is a focused Shopify admin analytics app for product performance and sales visibility.

### Safe comparison angles
Agents may safely position the app as:
- more focused on product-level visibility than basic native analytics alone
- a simpler alternative to manual exports and spreadsheet review for this specific use case
- a focused analytics utility for merchants who do not want a heavier BI workflow

### Positioning angles to avoid
Agents must avoid positioning the app as:
- a complete BI replacement
- a customer intelligence platform
- a marketing attribution tool
- a conversion optimization suite
- an AI analytics platform
- an enterprise-grade analytics operating system

### Safe wording for competitive contrast
Allowed examples:
- “For merchants who need clearer product and sales visibility than basic native analytics provides.”
- “For merchants who want product-level analysis without relying on spreadsheet exports.”

Disallowed examples:
- “A full replacement for Shopify analytics.”
- “An all-in-one intelligence platform.”

---

## 12. Approved Messaging Blocks

### Short app description
Arka Smart Analyzer helps Shopify merchants analyze product performance and sales trends inside Shopify admin using synced order history and product catalog data.

### Medium description
Arka Smart Analyzer gives merchants a clearer view of product and sales performance inside Shopify admin. It shows core KPIs, sales trends, product performance tiers, price-tier revenue mix, product behavior classification, and low-stock alerts using synced Shopify order and product data.

### Positioning statement
A focused Shopify admin analytics app for merchants who want clearer product performance and sales-trend visibility than basic native analytics provides.

### Benefit bullets
- See revenue, orders, AOV, and units sold in one place.
- Identify which products drive revenue.
- Review sales performance across a selected date range.
- Understand revenue mix across price tiers.
- Spot slow movers and no-recent-sales products.
- Catch low-stock products before demand is missed.

### One-liner for listing or hero section
Understand product performance and sales trends in Shopify admin with synced order and product data.

### Setup-safe phrasing
- Approved: “Sync your store data in one click.”
- Approved: “Works from your Shopify order history and product catalog data.”
- Not approved: “No setup required.”
- Not approved: “Automatic sync on install.”

---

## 13. Reality Constraints / Honest Limits

### Current limits
- First sync is not fully automatic on install.
- Current value is limited to product and sales analysis.
- The app does not currently support customer analytics.
- The app does not currently support shopper behavior analytics.
- The app does not currently support predictive or AI features.

### External dependency limits
The following areas must remain excluded from marketing claims until explicitly approved and live:
- **Protected Customer Data approval** for customer segmentation, LTV, loyalty, churn, or related customer analysis
- **Web Pixel deployment and approval** for funnel, abandoned cart, session, conversion-rate, or bundle-related analytics tied to storefront behavior

### Dormant or approval-dependent capabilities
If capability depends on dormant infrastructure, hidden UI, undeployed extensions, or future approvals, agents must treat it as unavailable for marketing.

---

## 14. Agent Usage Instructions

1. Use this file as the first and final authority for marketing truth.
2. Start with exact approved messaging blocks when they fit the task.
3. If exact wording does not fit, use constrained paraphrase only.
4. Never broaden a feature into a bigger promise.
5. Never convert a focused analytics feature into an intelligence, prediction, automation, or customer-behavior claim.
6. If asked for copy outside the supported truth set, do one of the following:
   - decline the unsupported claim,
   - narrow the copy back to supported capabilities, or
   - explicitly mark the requested point as not supported by current product reality.
7. When uncertain, prefer omission over invention.
8. Do not use generic filler such as “powerful insights,” “advanced intelligence,” or “next-level analytics” unless the claim is restated in a concrete approved form from this file.
9. Follow the same discipline visible in structured Crew tasks: extract only explicit facts, do not invent missing details, and keep output tied to approved context.

### Output priority order
1. Exact approved messaging blocks
2. Supported marketing claims
3. Feature-to-benefit mapping
4. Value proposition hierarchy
5. Nothing else unless separately verified and added to this file

---

## 15. Change Control

This file must be updated whenever any of the following changes occur:
- a new feature becomes live for merchants
- a previously hidden or dormant feature becomes marketable
- a feature is removed, disabled, or materially changed
- setup flow changes, especially around sync behavior
- Shopify approvals change what data the app may legally and operationally use
- pricing or plan positioning changes
- the target merchant definition changes
- approved messaging needs revision after product or review changes

### Update rule
Marketing outputs must follow the latest version of this file. If this file and any older marketing copy conflict, this file wins.

### Review rule
Before publishing any listing, landing, or merchant-facing copy, reviewers should confirm:
- every feature claim maps to a current live capability in this file
- no forbidden claim appears directly or indirectly
- setup language matches current activation reality
- no roadmap item is presented as current product value