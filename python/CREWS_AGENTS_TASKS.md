# Crews: Agents and Task Mapping

This document summarizes each Python crew and maps every task to the agent that runs it, including agent details and task descriptions.

---

## 1) `blog` crew
**Source:** `python/crews/blog/crew.py`

### Agents
- **Blog Strategist**
  - **Role:** Blog Strategist
  - **Goal:** Create a sharp outline and angle for a high-quality blog post
  - **Backstory:** An experienced content strategist who turns broad ideas into focused blog structures

- **Blog Writer**
  - **Role:** Blog Writer
  - **Goal:** Write a strong, readable, useful blog post
  - **Backstory:** Writes practical articles with clear headings, useful examples, and minimal fluff

### Tasks
- **`outline_task`** → `Blog Strategist`
  - Creates a blog title, article angle, section-by-section outline, and key points to include based on topic, audience, tone, and keywords

- **`writing_task`** → `Blog Writer`
  - Writes the final markdown blog post with strong introduction, useful body sections, and strong conclusion within specified word count (context: outline_task)

---

## 2) `blog_from_links` crew
**Source:** `python/crews/blog_from_links/crew.py`

### Agents
- **Product Source Analyst**
  - **Role:** Product Source Analyst
  - **Goal:** Read the provided product links and extract the application's actual positioning, use cases, target users, pain points, and blog-worthy themes
  - **Backstory:** A strict product and market analyst who only uses what is supported by source pages and clear public signals; does not invent features, customers, or claims
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Autonomous Content Strategist**
  - **Role:** Autonomous Content Strategist
  - **Goal:** Based on the product pages alone, decide the single best professional blog topic to write now, the best title, the keyword set, and the content angle
  - **Backstory:** A senior SaaS content strategist who chooses the most commercially useful topic without asking the user; avoids weak, generic, or broad article ideas

- **Professional SaaS Blog Writer**
  - **Role:** Professional SaaS Blog Writer
  - **Goal:** Write a specialized, application-relevant, professional blog article that matches the approved strategy
  - **Backstory:** Writes strong SaaS and Shopify content with clear structure, tight language, useful detail, and credible positioning; does not write fluff

- **Blog Image Researcher**
  - **Role:** Blog Image Researcher
  - **Goal:** Find one relevant image result for the chosen blog topic and return the image URL, source page, search query, and alt text
  - **Backstory:** A practical content operations researcher who returns one usable image candidate and does not fabricate links
  - **Tools:** SerperDevTool

- **Final JSON Formatter**
  - **Role:** Final JSON Formatter
  - **Goal:** Return the final approved blog package in strict JSON format for backend storage and editor rendering
  - **Backstory:** A strict formatter who outputs valid JSON only and preserves the final title, topic, metadata, image, and HTML content

### Tasks
- **`source_analysis_task`** → `Product Source Analyst`
  - Analyzes 2 provided product links to extract product name, category, purpose, features, target users, problems solved, blog opportunities, and separates fact from inference

- **`strategy_task`** → `Autonomous Content Strategist`
  - Autonomously decides the single best blog to write including topic, title, audience, keywords, search intent, angle, slug, meta description, excerpt, outline, and CTA direction; avoids forbidden titles (context: source_analysis_task)

- **`writing_task`** → `Professional SaaS Blog Writer`
  - Writes the final professional HTML blog article with specialized tone, strong structure, and editor-friendly tags (h1-h3, p, ul, li, strong, em, a, blockquote) (context: source_analysis_task, strategy_task)

- **`image_task`** → `Blog Image Researcher`
  - Finds one suitable image with search query, direct image URL, source page URL, alt text, and relevance explanation (context: strategy_task, writing_task)

- **`final_json_task`** → `Final JSON Formatter`
  - Returns strict valid JSON with app_name, audience, topic, title, slug, excerpt, meta_description, keywords, cover_image, content_html, content_markdown, and editor_data (context: source_analysis_task, strategy_task, writing_task, image_task)

---

## 3) `competitor_analysis` crew
**Source:** `python/crews/competitor_analysis/crew.py`

### Agents
- **Shopify Competitor Researcher**
  - **Role:** Shopify Competitor Researcher
  - **Goal:** Find the most relevant direct competitors of the target Shopify app using grounded public evidence from Shopify App Store listings and official product websites
  - **Backstory:** A strict market intelligence researcher who identifies the target app's actual positioning, finds close direct competitors, rejects weak matches, and only uses grounded public evidence; never invents ratings, review counts, pricing, or unsupported feature claims
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Competitive Intelligence Analyst**
  - **Role:** Competitive Intelligence Analyst
  - **Goal:** Turn the research into a sharp competitive analysis that explains who the real competitors are, where Arka is stronger, where it is weaker, where it is behind, and what it must do to catch up
  - **Backstory:** A product strategy analyst who avoids generic advice, separates verified fact from inference, and forces the output to be commercially useful; identifies concrete catch-up actions, not vague recommendations

- **Product Report Designer**
  - **Role:** Product Report Designer
  - **Goal:** Design the final report as a premium dashboard-style HTML experience that is easy to scan, visually strong, and clearly explains each section to the reader
  - **Backstory:** A UI/UX designer for internal SaaS dashboards who structures dense information into elegant cards, tables, badges, section intros, and strong visual hierarchy; ensures each section has a short explanation

- **Frontend Report Developer**
  - **Role:** Frontend Report Developer
  - **Goal:** Convert the approved analysis and design into polished raw HTML that can be injected directly into a React container
  - **Backstory:** A frontend developer focused on semantic dashboard HTML using Tailwind utility classes and DaisyUI v5; supports both light and dark mode; writes clean div-based markup with no markdown or code fences

- **Final Report Approver**
  - **Role:** Final Report Approver
  - **Goal:** Approve only a polished, direct, commercially useful HTML deliverable; reject weak competitor choices, weak catch-up strategy, weak section explanations, invented metrics, or ugly presentation
  - **Backstory:** The final reviewer who thinks like a product lead, design reviewer, and executive audience combined; does not allow generic strategy, weak competitor selection, poor visual structure, vague recommendations, or unsupported numeric claims

### Tasks
- **`app_profile_task`** → `Shopify Competitor Researcher`
  - Analyzes the Arka Shopify app listing to build a precise profile including positioning, features, pricing, rating, review count, target merchant type, and focused search terms for competitor discovery

- **`competitor_discovery_task`** → `Shopify Competitor Researcher`
  - Finds up to 10 direct competitors with name, URL, positioning, features, pricing, rating, review count, why it's a competitor, strengths/weaknesses vs Arka, and concrete catch-up actions (context: app_profile_task)

- **`analysis_task`** → `Competitive Intelligence Analyst`
  - Creates a high-quality competitive analysis with executive summary, Arka profile, direct competitors, comparison matrix, market patterns, strengths/weaknesses, catch-up priorities, differentiation opportunities, strategic recommendations, and 30/60/90 day action direction (context: app_profile_task, competitor_discovery_task)

- **`design_task`** → `Product Report Designer`
  - Designs the information architecture for a premium dashboard-style HTML page with hero header, summary cards, explanation strips, competitor cards, comparison table, strengths/weaknesses/catch-up blocks, and strategic sections (context: analysis_task)

- **`html_task`** → `Frontend Report Developer`
  - Converts approved analysis and design into raw HTML using Tailwind and embedded style block; includes section explanations, catch-up strategy presentation, N/A for unsupported fields, and dark mode support (context: analysis_task, design_task)

- **`approval_task`** → `Final Report Approver`
  - Reviews and improves HTML if necessary; ensures tight competitor choices, section explanations, clear catch-up strategy, premium presentation, N/A for unverified data, and executive-ready polish (context: app_profile_task, competitor_discovery_task, analysis_task, design_task, html_task)

---

## 4) `dashboard` crew
**Source:** `python/crews/dashboard/crew.py`

### Agents
- **Canonical Product Truth Researcher**
  - **Role:** Canonical Product Truth Researcher
  - **Goal:** Extract only explicit, supportable project information from the source URL for an internal manager-facing page
  - **Backstory:** A strict product-truth researcher who extracts only what is explicitly supported by the source; does not invent features, status, roadmap, pricing, analytics depth, AI claims, or benefits
  - **Tools:** SerperScrapeWebsiteTool

- **Internal Product Content Structurer**
  - **Role:** Internal Product Content Structurer
  - **Goal:** Turn the approved source truth into a minimal manager-facing page structure focused on project description, features, and short status
  - **Backstory:** Structures internal product information for managers; avoids landing-page patterns and public marketing fluff; prioritizes clarity, brevity, section separation, and factual language

- **Internal UI Builder**
  - **Role:** Internal UI Builder
  - **Goal:** Build a compact, readable, manager-facing HTML page using Tailwind CSS and DaisyUI v5 with light and dark mode support
  - **Backstory:** Builds internal information pages, not landing pages; uses Tailwind CSS and DaisyUI v5; produces clean sections, cards, alerts, badges, and lists; keeps pages minimal, factual, and readable in both day and night modes

- **UI UX and Compliance Reviewer**
  - **Role:** UI UX and Compliance Reviewer
  - **Goal:** Review the generated page and reject anything that looks like a landing page, overclaims, adds unsupported detail, or has weak internal UI quality
  - **Backstory:** A strict internal reviewer who rejects public-facing marketing patterns, unnecessary visual noise, unsupported claims, vague status language, and pages with poor hierarchy, readability, or light/dark mode behavior

- **Release Publisher**
  - **Role:** Release Publisher
  - **Goal:** Publish only the final approved HTML page
  - **Backstory:** Only publishes the final HTML with no explanations or markdown fences

### Tasks
- **`research_task`** → `Canonical Product Truth Researcher`
  - Scrapes the Arka app URL to extract strict source-of-truth summary including project name, description, purpose, features, status/maturity signals, items not specified, unsafe claims to avoid, and constraints

- **`structure_task`** → `Internal Product Content Structurer`
  - Defines the structure of a minimal manager-facing page with compact sections: page title, project description, feature list, short project status, and cautions/limits (context: research_task)

- **`build_page_task`** → `Internal UI Builder`
  - Builds the final HTML page using Tailwind CSS and DaisyUI v5 with light/dark mode support; shows only text and features with minimal project status; no ratings, testimonials, pricing, or promotional sections (context: research_task, structure_task)

- **`review_task`** → `UI UX and Compliance Reviewer`
  - Reviews the generated HTML page and returns verdict (APPROVED or REJECTED), review summary, required changes, and rewrite requirement (context: research_task, structure_task, build_page_task)

- **`finalize_task`** → `Internal UI Builder`
  - Prepares final publishable HTML; keeps approved page with minimal fixes or rebuilds from scratch if rejected; maintains minimal internal manager-facing style (context: research_task, structure_task, build_page_task, review_task)

- **`publish_task`** → `Release Publisher`
  - Publishes the final approved HTML page with no explanations or markdown fences; outputs to file `logs/dashboard_published.html` (context: finalize_task, review_task)

---

## 5) `research` crew
**Source:** `python/crews/research/crew.py`

### Agents
- **Marketing Prompt Strategist**
  - **Role:** Marketing Prompt Strategist
  - **Goal:** Turn broad or rough user input into a precise marketing research brief that leads to commercially useful, specialized analysis
  - **Backstory:** A senior marketing strategist who refines vague requests into sharp research scopes; identifies audience, buyer intent, market dynamics, competitive angles, positioning, messaging priorities, content opportunities, acquisition implications, and decision-critical questions

- **Marketing Research Analyst**
  - **Role:** Marketing Research Analyst
  - **Goal:** Perform detailed marketing research using live web results and scraped website content, then produce a specific, evidence-backed report with linked sources
  - **Backstory:** A senior marketing research analyst who rejects generic summaries; focuses on demand, intent, competition, positioning, messaging, pricing signals, SEO opportunities, content gaps, acquisition channels, risks, and strategic implications
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Research Quality Moderator**
  - **Role:** Research Quality Moderator
  - **Goal:** Approve only research that is marketing-focused, specific, detailed, properly sourced, coherent, and safe to show directly to the user
  - **Backstory:** A strict editorial reviewer who rejects vague, shallow, repetitive, generic, unsourced, or fabricated work; polished but empty output must be rejected

### Tasks
- **`prompt_strategy_task`** → `Marketing Prompt Strategist`
  - Transforms raw user topic into a specialized marketing research brief with refined objective, core commercial questions, target audience, competitive angles, positioning/messaging/pricing/SEO/channel angles to investigate, risks/constraints, and instructions to avoid generic output

- **`research_task`** → `Marketing Research Analyst`
  - Conducts detailed marketing research using search and scraping tools; produces report with executive summary, market framing, audience needs, competitive landscape, positioning/pricing/SEO/channel implications, strategic recommendations, risks/limitations, and sources with inline markdown links (context: prompt_strategy_task)

- **`moderation_task`** → `Research Quality Moderator`
  - Reviews research draft and returns structured output (ModeratedResearchOutput) with approval boolean, title, polished report_markdown, sources array, and reviewer_notes; approves only marketing-focused, detailed, sourced, and strategically useful work (context: research_task)

---

## 6) `seo_audit` crew
**Source:** `python/crews/seo_audit/crew.py`

### Agents
- **Technical SEO Analyst**
  - **Role:** Technical SEO Analyst
  - **Goal:** Audit technical SEO quality using crawl evidence, link validation data, and structural page signals; rank issues honestly and propose concrete fixes
  - **Backstory:** A rigorous technical SEO specialist focused on crawlability, metadata hygiene, heading structure, canonicalization, broken links, and page-level implementation quality; does not invent rankings or traffic

- **On-Page SEO Analyst**
  - **Role:** On-Page SEO Analyst
  - **Goal:** Evaluate content quality, titles, descriptions, headings, image alt coverage, and page depth using only the provided crawl data
  - **Backstory:** An on-page SEO analyst who cares about snippet quality, topical clarity, content sufficiency, and consistent search-ready page structure

- **SEO Data Analyst**
  - **Role:** SEO Data Analyst
  - **Goal:** Turn crawl evidence into a quantified scorecard with numbers, issue counts, severity labels, and a priority roadmap
  - **Backstory:** Analytical and evidence-first; leads with numbers, not vague commentary; distinguishes measurable issues from inference and does not invent business outcomes

- **Frontend SEO Report Developer**
  - **Role:** Frontend SEO Report Developer
  - **Goal:** Convert the approved SEO audit into polished raw HTML ready for direct frontend rendering
  - **Backstory:** A frontend developer for internal dashboards who writes semantic raw HTML using Tailwind utility classes and daisyUI-style sections; supports light and dark mode; avoids markdown and code fences

- **SEO Audit Supervisor**
  - **Role:** SEO Audit Supervisor
  - **Goal:** Approve only a professional, analytical, numerically grounded, visually structured SEO audit
  - **Backstory:** Supervises all agents; rejects vague conclusions, invented metrics, weak prioritization, and poor presentation; approves only executive-ready raw HTML reports

### Tasks
- **`technical_task`** → `Technical SEO Analyst`
  - Performs technical SEO audit using crawl summary, link validation, and full page table; produces technical diagnosis with highest-priority issues, severity labels (critical/high/medium/low), healthy areas, blocking issues, and concrete fixes

- **`onpage_task`** → `On-Page SEO Analyst`
  - Performs on-page SEO analysis using crawl summary and page table; produces title quality analysis, meta description analysis, heading structure observations, thin-content observations, image alt-text observations, and on-page improvement priorities (context: technical_task)

- **`data_task`** → `SEO Data Analyst`
  - Creates quantified SEO scorecard with executive metric summary, SEO score out of 100, top 5 quantified issues, positive signals, priority roadmap (immediate/next/later), and honest caveats using crawl summary, page table, search visibility, and prior analyses (context: technical_task, onpage_task)

- **`html_task`** → `Frontend SEO Report Developer`
  - Converts approved analysis into raw HTML with Tailwind and daisyUI; includes hero, explanation strip, KPI cards, priority issues, technical/on-page/link sections, full page-by-page table, separate per-page audit cards, action roadmap, and limitations; uses real numbers from summary and page table (context: technical_task, onpage_task, data_task)

- **`approval_task`** → `SEO Audit Supervisor`
  - Reviews final output and improves if necessary; ensures raw HTML only, analytical/professional tone, numbers/figures, prioritized issues, no invented metrics, visual structure for executive review, and separate page-level results (context: technical_task, onpage_task, data_task, html_task)

---

## 7) `seo_keyword_opportunity` crew
**Source:** `python/crews/seo_keyword_opportunity/crew.py`

### Agents
- **Keyword Strategist**
  - **Role:** Keyword Strategist
  - **Goal:** Identify the highest-potential SEO keywords for the website based on positioning, search intent, commercial relevance, and realistic opportunity
  - **Backstory:** A senior SEO strategist who separates informational, commercial, transactional, and navigational intent; avoids vanity keywords and focuses on keywords that genuinely fit the product

- **SERP Competitor Analyst**
  - **Role:** SERP Competitor Analyst
  - **Goal:** Identify actual keyword-level competitors from available SERP evidence and explain why they are difficult or easier to beat
  - **Backstory:** Analyzes search competition, not generic market competition; focuses on who is occupying search demand for each keyword

- **Keyword Difficulty Analyst**
  - **Role:** Keyword Difficulty Analyst
  - **Goal:** Estimate how difficult it is for this website to reach page one for each target keyword, including the main blockers and what would be required to compete
  - **Backstory:** Conservative and evidence-first; never guarantees rankings; distinguishes current-state opportunity from long-term potential

- **UI/UX Designer**
  - **Role:** UI/UX Designer
  - **Goal:** Design a polished, premium, highly readable analytics-style report UI that feels like a real SaaS dashboard, not a plain HTML document
  - **Backstory:** A senior UI/UX designer for data and analytics products specializing in visual hierarchy, card systems, spacing, section composition, badges, tables, accordions, executive readability, responsive layouts, and dark mode

- **Frontend Developer**
  - **Role:** Frontend Developer
  - **Goal:** Implement the final approved report as polished raw HTML using Tailwind utility classes and daisyUI-style composition for direct frontend rendering
  - **Backstory:** Builds premium SaaS dashboard interfaces using clean grids, strong card hierarchy, responsive tables, accordions, badges, alerts, spacing systems, and dark mode; does not output markdown

- **Backend Approver**
  - **Role:** Backend Approver
  - **Goal:** Approve only output that is analytically honest, visually strong, structurally correct, and production-ready for backend storage and frontend rendering
  - **Backstory:** The final quality gate who rejects invented SEO claims, fake guarantees, weak layout, dense unreadable sections, flat hierarchy, poor tables, and generic dashboard output

### Tasks
- **`keyword_task`** → `Keyword Strategist`
  - Builds realistic keyword opportunity strategy using site context and seed topics; produces primary keyword clusters, long-tail opportunities, search intent per keyword, why each matters, priority labels (high/medium/low), shortlist of best keywords, and quick-win vs strategic keywords

- **`competitor_task`** → `SERP Competitor Analyst`
  - Uses SERP research and keyword strategy to identify real search competitors by keyword; produces top competing domains/pages per keyword, why they're strong, SERP competitiveness assessment, likely content format, where website is weaker/stronger, and caveats (context: keyword_task)

- **`difficulty_task`** → `Keyword Difficulty Analyst`
  - Estimates ranking difficulty using site context, keyword strategy, and competitor analysis; for each keyword provides difficulty score (1-100), difficulty band (easy/moderate/hard/very hard), current-state likelihood, long-term potential, main blockers, requirements to compete, recommended page type, and first position feasibility (context: keyword_task, competitor_task)

- **`design_task`** → `UI/UX Designer`
  - Creates complete UI/UX blueprint with page layout structure, section ordering, visual hierarchy rules, typography/grid/spacing rules, card/table/accordion/badge design recommendations, mobile responsiveness, light/dark mode guidance, and exact component guidance for all sections (context: keyword_task, competitor_task, difficulty_task)

- **`html_task`** → `Frontend Developer`
  - Converts approved report into raw HTML following UI/UX blueprint exactly; uses Tailwind and daisyUI; includes all mandatory sections (hero, best opportunities, quick wins, difficulty matrix, competitor comparison, keyword clusters, page strategy, long-term bets, action roadmap, risks/limitations) with premium dashboard hierarchy (context: keyword_task, competitor_task, difficulty_task, design_task)

- **`approval_task`** → `Backend Approver`
  - Reviews and improves final output if necessary; ensures raw HTML only, no invented ranking guarantees, evidence vs inference distinction, strong visual hierarchy, premium dashboard composition, readable tables, visually strong keyword cards, useful difficulty matrix, and good light/dark mode support (context: keyword_task, competitor_task, difficulty_task, design_task, html_task)

---

## 8) `shopify_trends` crew
**Source:** `python/crews/shopify_trends/crew.py`

### Agents
- **Shopify Trend Researcher**
  - **Role:** Shopify Trend Researcher
  - **Goal:** Find real Shopify market trends, merchant demand signals, app category movements, and Google search patterns relevant to the requested topic
  - **Backstory:** A strict research specialist who separates verified public information from inference, avoids generic statements, and produces commercially useful findings; does not invent numbers; labels weak or indirect claims clearly
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Shopify App Analyst**
  - **Role:** Shopify App Analyst
  - **Goal:** Analyze Shopify apps relevant to the topic, including positioning, feature patterns, pricing posture, review signals when visible, and what the target app should learn from them
  - **Backstory:** A product and app-market analyst who compares apps tightly, rejects loose matches, preserves N/A for unsupported fields, and turns public evidence into practical product insight
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Shopify Store Analyst**
  - **Role:** Shopify Store Analyst
  - **Goal:** Analyze public Shopify stores related to the topic and identify merchandising, positioning, conversion, and messaging patterns that reveal merchant demand
  - **Backstory:** A storefront intelligence analyst who only uses publicly observable information, avoids invented operational metrics, and focuses on patterns that matter to apps, merchants, and growth
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Traffic Opportunity Analyst**
  - **Role:** Traffic Opportunity Analyst
  - **Goal:** Assess search visibility and traffic opportunity using Google search evidence, ranking clues, query patterns, and discoverability signals without pretending to know private analytics
  - **Backstory:** A search opportunity analyst who distinguishes first-party truth from public discoverability signals; never claims exact third-party traffic unless explicitly public; frames external traffic as directional opportunity, not fact
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Insight Strategist**
  - **Role:** Insight Strategist
  - **Goal:** Turn the research into a sharp strategic report with clear implications, priorities, and recommended actions
  - **Backstory:** An executive strategist who removes fluff, exposes the signal, ranks opportunities, flags weak evidence, and makes the report decision-ready

- **Product Report Designer**
  - **Role:** Product Report Designer
  - **Goal:** Design the final report as a premium dashboard-style HTML experience with strong hierarchy, clean scanning, and clear section explanations
  - **Backstory:** A UI/UX designer for SaaS dashboards and internal reports who structures insight-heavy content into elegant sections, cards, tables, badges, and callouts; supports both light and dark mode

- **Frontend Report Developer**
  - **Role:** Frontend Report Developer
  - **Goal:** Convert the approved analysis and design into polished raw HTML ready for direct frontend rendering
  - **Backstory:** A frontend developer who writes semantic raw HTML using Tailwind utility classes and daisyUI v5 style conventions; supports both light and dark mode; avoids markdown and code fences

- **Final Report Approver**
  - **Role:** Final Report Approver
  - **Goal:** Approve only a commercially useful, evidence-aware, visually polished final report
  - **Backstory:** The final gatekeeper who rejects weak evidence, generic recommendations, invented metrics, loose competitor selection, messy structure, and poor presentation; only approves executive-ready results

### Tasks
- **`trend_research_task`** → `Shopify Trend Researcher`
  - Finds most relevant Shopify trends and demand signals around the topic; produces trend summary, top market signals, keyword/search demand themes, merchant priorities, rising vs stable vs unclear trends, evidence-backed sources, and confidence notes

- **`app_analysis_task`** → `Shopify App Analyst`
  - Analyzes Shopify apps relevant to topic; produces target app profile, list of comparable apps, positioning/feature/pricing patterns, review/rating signals (N/A if unavailable), what stronger apps communicate better, and what target app should build/clarify/improve/reposition (context: trend_research_task)

- **`store_analysis_task`** → `Shopify Store Analyst`
  - Analyzes Shopify stores relevant to topic using public evidence; produces relevant store examples, merchandising/messaging patterns, product/offer/conversion patterns, repeated merchant needs, app opportunity implications, and limits of certainty (context: trend_research_task)

- **`traffic_analysis_task`** → `Traffic Opportunity Analyst`
  - Assesses traffic opportunity and discoverability; produces search discoverability observations, keyword opportunity themes, branded vs non-branded thinking, SERP visibility clues, traffic opportunity assessment, and important caveats explaining estimated vs factual (context: trend_research_task, app_analysis_task, store_analysis_task)

- **`strategy_task`** → `Insight Strategist`
  - Creates strategic report with executive summary, market happenings, app landscape, store landscape, search/traffic opportunity, implications for target app, highest-priority opportunities, risks/evidence limitations, recommended actions, and strategic conclusion (context: trend_research_task, app_analysis_task, store_analysis_task, traffic_analysis_task)

- **`design_task`** → `Product Report Designer`
  - Designs information architecture for premium HTML report with hero, explanation strip, executive summary cards, trends/app/store/traffic/opportunities/actions sections, all with section intro paragraphs, modern SaaS dashboard style, and light/dark mode support (context: strategy_task)

- **`html_task`** → `Frontend Report Developer`
  - Converts approved analysis and design into raw HTML using Tailwind and daisyUI v5; includes all required sections with proper styling, section explanations, light/dark mode support, and N/A for unsupported metrics (context: strategy_task, design_task)

- **`approval_task`** → `Final Report Approver`
  - Reviews and improves HTML if necessary; ensures raw HTML only, executive-ready structure, concrete recommendations, honest labeling of weak evidence, no invented metrics, premium presentation, section explanation paragraphs, and commercial usefulness (context: strategy_task, design_task, html_task)

---

## 9) `store_outreach` crew
**Source:** `python/crews/store_outreach/crew.py`

### Agents
- **App Feature Analyst**
  - **Role:** App Feature Analyst
  - **Goal:** Read the app sources and extract verified capabilities and merchant value
  - **Backstory:** Only uses grounded public evidence; does not invent features or proof points
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **Store Researcher**
  - **Role:** Store Researcher
  - **Goal:** Read the target store website and identify what the store sells and where the app can help
  - **Backstory:** Only uses publicly visible website evidence and makes uncertainty explicit
  - **Tools:** SerperDevTool, SerperScrapeWebsiteTool

- **App-to-Store Fit Strategist**
  - **Role:** App-to-Store Fit Strategist
  - **Goal:** Map verified app capabilities to the target store's observable needs
  - **Backstory:** Does not force a fit; identifies where the fit is strong, weak, or uncertain

- **Marketing Email Copywriter**
  - **Role:** Marketing Email Copywriter
  - **Goal:** Write a concise personalized outreach email for the store manager
  - **Backstory:** Uses only observed store facts and verified app capabilities

- **Final Outreach Approver**
  - **Role:** Final Outreach Approver
  - **Goal:** Return strict JSON only
  - **Backstory:** Rejects invented facts and any output that is not valid JSON

### Tasks
- **`app_feature_task`** → `App Feature Analyst`
  - Reads Arka app sources (Shopify listing and website) to extract verified app capabilities, merchant problems addressed, best-fit store types, and claims that should be used cautiously

- **`store_research_task`** → `Store Researcher`
  - Analyzes target store website to extract what the store sells, positioning/messaging, visible opportunities for analytics/segmentation/retention/bundling/conversion improvement, and uncertainty/blind spots

- **`fit_strategy_task`** → `App-to-Store Fit Strategist`
  - Decides how Arka can realistically help the store; produces overall fit (high/medium/low), fit score (0-100), reasons, top use cases, best outreach angles, and risks/unknowns (context: app_feature_task, store_research_task)

- **`email_task`** → `Marketing Email Copywriter`
  - Writes concise marketing email with subject line, preview line, and plain-text body; no invented metrics, no fake personalization, and low-friction CTA (context: app_feature_task, store_research_task, fit_strategy_task)

- **`approval_task`** → `Final Outreach Approver`
  - Returns strict JSON with title, store object (name, website_url, summary, observed_signals, blind_spots), app_fit object (overall_fit, fit_score, reasons, use_cases, pitch_angles, risks, confidence_notes), email object (subject, preview_line, body), and sources array (context: app_feature_task, store_research_task, fit_strategy_task, email_task)