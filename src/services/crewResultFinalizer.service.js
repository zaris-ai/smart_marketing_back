import {
  finalizeAiBlogFromLinksRun,
  finalizeBlogRun,
} from './crew-finalizers/blog.finalizer.js';

import {
  finalizeDashboardRun,
  finalizeMarketingEmailReplyRun,
  finalizeResearchRun,
  finalizeStoreCrmAnalysisRun,
  finalizeStoreOutreachRun,
} from './crew-finalizers/core.finalizer.js';

import {
  finalizeCompetitorAnalysisRun,
  finalizeManageCompetitorAnalysisRun,
  finalizeProblemDiscoveryRun,
  finalizeSeoAuditRun,
  finalizeSeoKeywordOpportunityRun,
  finalizeShopifyTrendsRun,
} from './crew-finalizers/reports.finalizer.js';

import {
  finalizeInstagramPostIdeaRun,
  finalizeInstagramStoryIdeaRun,
} from './crew-finalizers/social.finalizer.js';

export async function finalizeCrewResult({ run, result }) {
  switch (run.crewName) {
    case 'dashboard':
      return finalizeDashboardRun({ run, result });

    case 'blog':
      return finalizeBlogRun({ run, result });

    case 'blog_from_links':
      return finalizeAiBlogFromLinksRun({ run, result });

    case 'research':
      return finalizeResearchRun({ run, result });

    case 'marketing_email_reply':
      return finalizeMarketingEmailReplyRun({ run, result });

    case 'store_crm_analysis':
      return finalizeStoreCrmAnalysisRun({ run, result });

    case 'store_outreach':
      return finalizeStoreOutreachRun({ run, result });

    case 'competitor_analysis':
      return finalizeCompetitorAnalysisRun({ run, result });

    case 'manage_competitor_analysis':
      return finalizeManageCompetitorAnalysisRun({ run, result });

    case 'shopify_trends':
      return finalizeShopifyTrendsRun({ run, result });

    case 'problem_discovery':
      return finalizeProblemDiscoveryRun({ run, result });

    case 'seo_audit':
      return finalizeSeoAuditRun({ run, result });

    case 'seo_keyword_opportunity':
      return finalizeSeoKeywordOpportunityRun({ run, result });

    case 'instagram_story_idea':
      return finalizeInstagramStoryIdeaRun({ run, result });

    case 'instagram_post_idea':
      return finalizeInstagramPostIdeaRun({ run, result });

    default:
      console.warn('[finalizeCrewResult] no finalizer for crewName:', run.crewName);
      return null;
  }
}